//! A loopback HTTP server for library videos.
//!
//! On Linux, `WebKitGTK`'s media player cannot load from Tauri's `asset://`
//! scheme (images can; `<video>` fails at once with "source not supported"),
//! so videos are served over plain HTTP instead, on every platform alike.
//! It listens on 127.0.0.1 only, on a random port, under a random token, so
//! other software on the machine cannot guess its URLs. `ServeDir` answers
//! range requests (needed for seeking) and refuses paths that escape the
//! videos folder.

use std::net::{Ipv4Addr, SocketAddr};
use std::path::PathBuf;

use axum::Router;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

/// The base URL videos are served under, or why the server could not start.
pub struct MediaServerState(Result<String, String>);

impl MediaServerState {
    /// Start serving `videos_root` as `http://127.0.0.1:<port>/<token>/videos/<id>/<file>`.
    pub fn start(videos_root: PathBuf) -> Self {
        Self(start(videos_root).inspect_err(|e| log::error!("media server failed to start: {e}")))
    }

    pub fn unavailable(reason: String) -> Self {
        log::error!("media server unavailable: {reason}");
        Self(Err(reason))
    }
}

fn start(videos_root: PathBuf) -> Result<String, String> {
    let listener = std::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0)))
        .map_err(|e| format!("could not bind a loopback port: {e}"))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let token = uuid::Uuid::new_v4().simple().to_string();
    let base = format!("/{token}/videos");

    // Output windows copy video frames to a canvas for NDI, which needs CORS
    // or the canvas is tainted and can't be read back.
    let app = Router::new()
        .nest_service(&base, ServeDir::new(videos_root))
        .layer(CorsLayer::permissive());

    tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::from_std(listener) {
            Ok(listener) => listener,
            Err(e) => return log::error!("media server: {e}"),
        };
        if let Err(e) = axum::serve(listener, app).await {
            log::error!("media server stopped: {e}");
        }
    });
    log::info!("Media server listening on 127.0.0.1:{port}");
    Ok(format!("http://127.0.0.1:{port}{base}"))
}

/// Where the frontend loads a video from: append `/<video id>/<file name>`.
#[expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]
#[tauri::command]
pub fn media_base_url(server: tauri::State<'_, MediaServerState>) -> Result<String, String> {
    server.0.clone()
}

//! A loopback HTTP server for library videos.
//!
//! On Linux, `WebKitGTK`'s media player cannot load from Tauri's `asset://`
//! scheme (images can; `<video>` fails at once with "source not supported"),
//! so videos are served over plain HTTP instead, on every platform alike.
//! It listens on 127.0.0.1 only, on a random port, under a random token, so
//! other software on the machine cannot guess its URLs. `ServeDir` answers
//! range requests (needed for seeking) and refuses paths that escape the
//! videos folder.
//!
//! It also relays network cameras: `WebKitGTK` won't stream a LAN camera's
//! MJPEG (`multipart/x-mixed-replace`) body to the page from `fetch`, an
//! `<img>` or XHR, though it loads the headers. Under `/<token>/camera?url=`
//! the camera's bytes come through unchanged as a plain octet stream, which
//! the frontend splits into JPEG frames itself.

use std::net::{Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::time::Duration;

use axum::body::Body;
use axum::extract::Query;
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware::map_response;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
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
    let camera = format!("/{token}/camera");

    // Output windows copy video frames to a canvas for NDI, which needs CORS
    // or the canvas is tainted and can't be read back.
    let app = Router::new()
        .nest_service(&base, ServeDir::new(videos_root))
        .route(&camera, get(relay_camera))
        .layer(CorsLayer::permissive())
        .layer(map_response(allow_any_origin));

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

#[derive(Deserialize)]
struct CameraQuery {
    url: String,
}

/// How long a camera gets to answer before the frontend is told it can't be reached.
const CAMERA_CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

/// Stream a network camera's response body through unchanged, as
/// `application/octet-stream`. Only http(s) addresses are relayed.
async fn relay_camera(Query(query): Query<CameraQuery>) -> Response {
    let Ok(url) = reqwest::Url::parse(&query.url) else {
        return (StatusCode::BAD_REQUEST, "not a camera address").into_response();
    };
    if !matches!(url.scheme(), "http" | "https") {
        return (StatusCode::BAD_REQUEST, "only http(s) cameras").into_response();
    }
    let client = match reqwest::Client::builder().connect_timeout(CAMERA_CONNECT_TIMEOUT).build() {
        Ok(client) => client,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let response = match client.get(url).send().await.and_then(reqwest::Response::error_for_status) {
        Ok(response) => response,
        Err(e) => {
            // Retried every few seconds while a camera is off: keep it out of the warnings.
            log::debug!("camera relay: {e}");
            return (StatusCode::BAD_GATEWAY, "camera unreachable").into_response();
        }
    };
    (
        [
            (header::CONTENT_TYPE, "application/octet-stream"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        Body::from_stream(response.bytes_stream()),
    )
        .into_response()
}

/// Mark every response readable from any origin. `CorsLayer` only answers
/// requests that carry an `Origin`, and `WebKitGTK`'s media player leaves it
/// off the later range requests of a `crossOrigin` video: one such response
/// without the header and the video counts as cross-origin from then on, so
/// a canvas that copies its frames (NDI, the stream) can't be read back.
async fn allow_any_origin(mut response: Response) -> Response {
    response
        .headers_mut()
        .entry(header::ACCESS_CONTROL_ALLOW_ORIGIN)
        .or_insert(HeaderValue::from_static("*"));
    response
}

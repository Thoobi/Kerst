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
//! the frontend splits into JPEG frames itself. Windows reading the same
//! camera share one connection to it: `DroidCam` serves one viewer at a time.
//!
//! Silent loops (motion backgrounds, a theme's background video, a band)
//! load from `/<token>/loops/<id>/<file>`: the same video without its sound
//! track. `WebKitGTK`'s player stalls a few frames into a muted clip that
//! still has audio, waiting on the sound, so the picture froze. The copy is
//! made once, by ffmpeg without re-encoding (a second or so), and kept
//! beside the original; without ffmpeg the original is served.

use std::net::{Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use axum::body::Body;
use axum::extract::{Query, Request, State};
use axum::middleware::Next;
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
    /// Start serving `videos_root` as `http://127.0.0.1:<port>/<token>/videos/<id>/<file>`,
    /// and silent loops of them (ffmpeg looked for in `ffmpeg_dirs` first).
    pub fn start(videos_root: PathBuf, ffmpeg_dirs: Vec<PathBuf>) -> Self {
        Self(start(videos_root, ffmpeg_dirs).inspect_err(|e| log::error!("media server failed to start: {e}")))
    }

    pub fn unavailable(reason: String) -> Self {
        log::error!("media server unavailable: {reason}");
        Self(Err(reason))
    }
}

fn start(videos_root: PathBuf, ffmpeg_dirs: Vec<PathBuf>) -> Result<String, String> {
    let listener = std::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0)))
        .map_err(|e| format!("could not bind a loopback port: {e}"))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let token = uuid::Uuid::new_v4().simple().to_string();
    let base = format!("/{token}/videos");
    let camera = format!("/{token}/camera");
    let loops_base = format!("/{token}/loops");
    let loops = Arc::new(Loops { root: videos_root.clone(), ffmpeg_dirs, making: tokio::sync::Mutex::new(()) });
    let loops_router = Router::new()
        .fallback_service(ServeDir::new(&videos_root))
        .layer(axum::middleware::from_fn_with_state(loops, silent_loop));

    // Output windows copy video frames to a canvas for NDI, which needs CORS
    // or the canvas is tainted and can't be read back.
    let app = Router::new()
        .nest_service(&base, ServeDir::new(videos_root))
        .nest(&loops_base, loops_router)
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

/// Stream a network camera's bytes through unchanged, as
/// `application/octet-stream`. Every window reading the same camera shares
/// one connection to it (see `litdeck_camera`). A camera that can't be shown
/// answers with the reason in words: 504 when nothing answered at the
/// address, 502 when something did (busy, a login, a web page).
async fn relay_camera(Query(query): Query<CameraQuery>) -> Response {
    match litdeck_camera::subscribe(&query.url).await {
        Ok(stream) => (
            [
                (header::CONTENT_TYPE, "application/octet-stream"),
                (header::CACHE_CONTROL, "no-store"),
            ],
            Body::from_stream(stream),
        )
            .into_response(),
        Err(problem) => {
            let code = if problem.unreachable { StatusCode::GATEWAY_TIMEOUT } else { StatusCode::BAD_GATEWAY };
            (code, problem.message).into_response()
        }
    }
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

/// Where silent loops are made: the videos folder, and where to find ffmpeg.
struct Loops {
    root: PathBuf,
    ffmpeg_dirs: Vec<PathBuf>,
    /// One copy made at a time: both copies of a loop ask for it at once.
    making: tokio::sync::Mutex<()>,
}

/// The silent copy's file name beside `file`.
fn loop_name(file: &str) -> String {
    format!("loop-{file}")
}

/// A path part that names a file in a video's folder, and nothing else.
fn plain_name(part: &str) -> bool {
    !part.is_empty()
        && !part.starts_with('.')
        && part.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

/// `/<id>/<file>` → the silent copy of it, made first if need be; the
/// original when it can't be made. Anything else isn't found.
async fn silent_loop(State(loops): State<Arc<Loops>>, mut request: Request, next: Next) -> Response {
    let path = request.uri().path().trim_start_matches('/').to_owned();
    let Some((id, file)) = path.split_once('/') else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if !plain_name(id) || !plain_name(file) || file.starts_with("loop-") {
        return StatusCode::NOT_FOUND.into_response();
    }
    let dir = loops.root.join(id);
    let served = if ensure_silent(&loops, &dir, file).await { loop_name(file) } else { file.to_owned() };
    match format!("/{id}/{served}").parse() {
        Ok(uri) => *request.uri_mut() = uri,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    }
    next.run(request).await
}

/// Whether `dir/loop-<file>` exists, making it from `dir/file` if not.
async fn ensure_silent(loops: &Loops, dir: &Path, file: &str) -> bool {
    let target = dir.join(loop_name(file));
    if target.is_file() {
        return true;
    }
    let source = dir.join(file);
    if !source.is_file() {
        return false;
    }
    let _making = loops.making.lock().await;
    if target.is_file() {
        return true;
    }
    let Some(ffmpeg) = litdeck_stream::ffmpeg::locate(&loops.ffmpeg_dirs) else {
        log::warn!("no ffmpeg to make a silent loop of {}; serving it with its sound track", source.display());
        return false;
    };
    // Written under another name and moved into place, so a half-made copy is never served.
    let partial = dir.join(format!(".making-{}", loop_name(file)));
    let mut command = tokio::process::Command::from(litdeck_stream::ffmpeg::command(&ffmpeg));
    command
        .args(["-hide_banner", "-loglevel", "error", "-y", "-i"])
        .arg(&source)
        .args(["-map", "0:v:0", "-c", "copy", "-an", "-movflags", "+faststart", "-f", "mp4"])
        .arg(&partial)
        .kill_on_drop(true);
    let made = match tokio::time::timeout(Duration::from_secs(120), command.status()).await {
        Ok(Ok(status)) if status.success() => std::fs::rename(&partial, &target).is_ok(),
        Ok(Ok(status)) => {
            log::warn!("ffmpeg could not make a silent loop of {} ({status})", source.display());
            false
        }
        Ok(Err(e)) => {
            log::warn!("could not run ffmpeg for a silent loop: {e}");
            false
        }
        Err(_) => {
            log::warn!("making a silent loop of {} took too long", source.display());
            false
        }
    };
    if !made {
        let _ = std::fs::remove_file(&partial);
    }
    made
}

#[cfg(test)]
mod tests {
    use super::plain_name;

    #[test]
    fn only_plain_file_names_pass() {
        assert!(plain_name("video.mp4"));
        assert!(plain_name("04dae4bb-ca7c-4295-80d8-b6e52304a0d1"));
        assert!(!plain_name(".."));
        assert!(!plain_name(".hidden"));
        assert!(!plain_name("a/b"));
        assert!(!plain_name("%2e%2e"));
        assert!(!plain_name(""));
    }
}

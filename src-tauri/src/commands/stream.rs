#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

use std::sync::Mutex;
use std::time::Duration;

use litdeck_stream::session::StreamSession;
use litdeck_stream::{CameraInfo, FfmpegInfo, StreamRuntime, StreamStartRequest, StreamStatus};
use tauri::{AppHandle, Emitter, Manager, State};

pub const EVENT_STREAM_STATUS: &str = "stream:status";

fn runtime(app: &AppHandle) -> tauri::State<'_, Mutex<StreamRuntime>> {
    app.state::<Mutex<StreamRuntime>>()
}

/// Run slow work (process spawning, probing) off the async runtime.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

/// Which ffmpeg and encoder streaming will use. Slow the first time: every
/// candidate encoder is tried.
#[tauri::command]
pub async fn get_stream_info(app: AppHandle) -> Result<FfmpegInfo, String> {
    blocking(move || runtime(&app).lock().map_err(|e| e.to_string())?.info().map_err(|e| e.to_string())).await
}

#[tauri::command]
pub async fn list_stream_cameras(app: AppHandle) -> Result<Vec<CameraInfo>, String> {
    blocking(move || {
        runtime(&app)
            .lock()
            .map_err(|e| e.to_string())?
            .list_cameras()
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn start_stream(
    app: AppHandle,
    output_id: String,
    request: StreamStartRequest,
) -> Result<StreamStatus, String> {
    blocking(move || {
        let needs_rtmps = request.destinations.iter().any(|d| d.url.trim().starts_with("rtmps://"));
        // Probing and opening the camera take seconds; don't hold the lock
        // (and so block frames to other outputs) while that happens.
        let (ffmpeg, encoder) = runtime(&app)
            .lock()
            .map_err(|e| e.to_string())?
            .prepare(needs_rtmps)
            .map_err(|e| e.to_string())?;
        let session = StreamSession::start(&output_id, ffmpeg, encoder, request).map_err(|e| {
            log::error!("start_stream failed: {e}");
            e.to_string()
        })?;
        let status = session.status();
        let replaced = runtime(&app).lock().map_err(|e| e.to_string())?.insert(output_id, session);
        if let Some(old) = replaced {
            old.stop();
        }
        emit_statuses(&app);
        Ok(status)
    })
    .await
}

#[tauri::command]
pub async fn stop_stream(app: AppHandle, output_id: String) -> Result<(), String> {
    blocking(move || {
        let session = runtime(&app).lock().map_err(|e| e.to_string())?.take(&output_id);
        if let Some(session) = session {
            session.stop();
        }
        emit_statuses(&app);
        Ok(())
    })
    .await
}

#[tauri::command]
pub fn get_stream_status(output_id: String, runtime: State<'_, Mutex<StreamRuntime>>) -> Result<Option<StreamStatus>, String> {
    Ok(runtime.lock().map_err(|e| e.to_string())?.status(&output_id))
}

fn emit_statuses(app: &AppHandle) {
    let statuses = runtime(app).lock().map(|r| r.statuses()).unwrap_or_default();
    let _ = app.emit(EVENT_STREAM_STATUS, statuses);
}

/// Push every stream's status to the UI once a second while any is live,
/// and once more after the last one ends.
pub fn spawn_status_emitter(app: AppHandle) {
    std::thread::Builder::new()
        .name("stream-status".into())
        .spawn(move || {
            let mut was_active = false;
            loop {
                std::thread::sleep(Duration::from_secs(1));
                let statuses = runtime(&app).lock().map(|r| r.statuses()).unwrap_or_default();
                if statuses.is_empty() && !was_active {
                    continue;
                }
                was_active = !statuses.is_empty();
                let _ = app.emit(EVENT_STREAM_STATUS, statuses);
            }
        })
        .expect("failed to spawn stream status thread");
}

/// End every stream on quit so each platform sees the broadcast finish.
pub fn stop_all(app: &AppHandle) {
    let sessions = runtime(app).lock().map(|mut r| r.take_all()).unwrap_or_default();
    for session in sessions {
        session.stop();
    }
}

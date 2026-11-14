//! Cameras: those attached to this computer (read through ffmpeg) and how
//! every camera in use is doing.

use std::path::PathBuf;

use litdeck_camera::{CameraHealth, CameraState};
use serde::Serialize;

/// Size and rate a device is asked for. 720p keeps the MJPEG encode and each
/// window's decode light on modest laptops while staying sharp on a 1080p
/// output; a device that can't do it falls back to what it can.
const DEVICE_WIDTH: u32 = 1280;
const DEVICE_HEIGHT: u32 = 720;
const DEVICE_FPS: u32 = 30;

/// Let `device:` cameras start: ffmpeg from `search_dirs` (the bundled copy
/// first), asked for the first capture options the device accepts, writing
/// MJPEG to stdout.
pub fn register_device_source(search_dirs: Vec<PathBuf>) {
    litdeck_camera::set_device_source(move |id| {
        let ffmpeg = litdeck_stream::ffmpeg::locate(&search_dirs).ok_or("ffmpeg isn't installed")?;
        let input = litdeck_stream::ffmpeg::camera_input_args(&ffmpeg, id, DEVICE_WIDTH, DEVICE_HEIGHT, DEVICE_FPS)
            .map_err(|e| e.to_string())?;
        let mut command = litdeck_stream::ffmpeg::command(&ffmpeg);
        command
            .args(["-hide_banner", "-loglevel", "error"])
            .args(input)
            .args(["-an", "-f", "mpjpeg", "-q:v", "5", "pipe:1"]);
        Ok(command)
    });
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraHealthDto {
    url: String,
    /// "connecting", "live", "stalled" or "down".
    state: &'static str,
    problem: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    kbps: u32,
    readers: usize,
}

impl From<CameraHealth> for CameraHealthDto {
    fn from(h: CameraHealth) -> Self {
        Self {
            url: h.url,
            state: match h.state {
                CameraState::Connecting => "connecting",
                CameraState::Live => "live",
                CameraState::Stalled => "stalled",
                CameraState::Down => "down",
            },
            problem: h.problem,
            width: h.width,
            height: h.height,
            kbps: h.kbps,
            readers: h.readers,
        }
    }
}

/// How every camera in use is doing, across all windows.
#[tauri::command]
pub fn camera_health() -> Vec<CameraHealthDto> {
    litdeck_camera::health().into_iter().map(Into::into).collect()
}

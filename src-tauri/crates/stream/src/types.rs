use serde::{Deserialize, Serialize};

/// One place the stream is sent: an RTMP(S) ingest URL plus its stream key.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamDestination {
    pub id: String,
    pub name: String,
    /// Ingest URL without the key, e.g. `rtmps://a.rtmp.youtube.com/live2`.
    pub url: String,
    pub key: String,
}

impl StreamDestination {
    /// The URL ffmpeg publishes to. Never log this: it carries the key.
    pub fn publish_url(&self) -> String {
        let url = self.url.trim().trim_end_matches('/');
        let key = self.key.trim();
        if key.is_empty() {
            url.to_string()
        } else {
            format!("{url}/{key}")
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamStartRequest {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub video_bitrate_kbps: u32,
    pub audio_bitrate_kbps: u32,
    /// Input device name as cpal reports it; `None` streams silence.
    pub audio_device: Option<String>,
    /// Holds the sound back so it lines up with a camera that lags it.
    #[serde(default)]
    pub audio_delay_ms: u32,
    /// Camera id from `list_cameras`; `None` streams the graphics alone.
    pub camera: Option<String>,
    pub destinations: Vec<StreamDestination>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DestinationState {
    Connecting,
    Live,
    Reconnecting,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DestinationStatus {
    pub id: String,
    pub name: String,
    pub state: DestinationState,
    pub bitrate_kbps: f64,
    /// Times this destination has had to reconnect.
    pub retries: u32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EncoderState {
    Starting,
    Running,
    Restarting,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamStatus {
    pub output_id: String,
    pub encoder: String,
    pub encoder_state: EncoderState,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub camera: Option<String>,
    pub started_at_ms: u64,
    pub error: Option<String>,
    pub destinations: Vec<DestinationStatus>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraInfo {
    /// Opaque id passed back in `StreamStartRequest::camera`.
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegInfo {
    pub path: String,
    pub version: String,
    /// The H.264 encoder streams will use, hardware first.
    pub encoder: Option<String>,
    pub rtmps: bool,
}

use thiserror::Error;

#[derive(Debug, Error)]
pub enum StreamError {
    #[error("ffmpeg was not found — streaming needs it installed or bundled with Litdeck")]
    FfmpegMissing,
    #[error("{0}")]
    Ffmpeg(String),
    #[error("no working H.264 encoder was found in ffmpeg")]
    NoEncoder,
    #[error("this ffmpeg build cannot stream over RTMPS, which YouTube and Facebook require")]
    NoRtmps,
    #[error("could not start ffmpeg: {0}")]
    Spawn(String),
    #[error("camera: {0}")]
    Camera(String),
    #[error("audio: {0}")]
    Audio(String),
    #[error("add at least one destination with a stream key")]
    NoDestinations,
    #[error("stream settings are invalid: {0}")]
    InvalidRequest(String),
    #[error("frame is {got_width}x{got_height}, the stream expects {width}x{height}")]
    FrameSize { width: u32, height: u32, got_width: u32, got_height: u32 },
}

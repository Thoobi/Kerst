//! Live streaming to `YouTube`, Facebook or any RTMP(S) ingest.
//!
//! Frames from an output window are paced, encoded to H.264/AAC by ffmpeg —
//! optionally over a camera feed — and relayed to each destination by its
//! own ffmpeg process, so one platform dropping never affects another.
//!
//! # Key types
//!
//! - [`StreamRuntime`] — finds ffmpeg and manages a session per output
//! - [`StreamStartRequest`], [`StreamStatus`] — configuration and live state

pub mod args;
pub mod audio;
pub mod error;
pub mod ffmpeg;
pub mod runtime;
pub mod session;
pub mod types;

pub use error::StreamError;
pub use runtime::StreamRuntime;
pub use types::*;

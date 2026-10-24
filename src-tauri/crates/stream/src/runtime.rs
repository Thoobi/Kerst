use std::collections::HashMap;
use std::path::PathBuf;

use crate::error::StreamError;
use crate::ffmpeg::{self, Encoder};
use crate::session::StreamSession;
use crate::types::{CameraInfo, FfmpegInfo, StreamStatus};

/// Finds ffmpeg once, remembers which encoder works, and keeps one session
/// per output.
///
/// Starting and stopping a session take seconds (probing a camera, letting
/// ffmpeg flush), so those happen outside the runtime's lock: callers
/// `prepare` under the lock, run `StreamSession::start` without it, then
/// `insert`; and `take` a session before stopping it.
#[derive(Default)]
pub struct StreamRuntime {
    search_dirs: Vec<PathBuf>,
    ffmpeg: Option<PathBuf>,
    encoder: Option<Encoder>,
    rtmps: Option<bool>,
    sessions: HashMap<String, StreamSession>,
}

impl StreamRuntime {
    pub fn set_search_dirs(&mut self, dirs: Vec<PathBuf>) {
        self.search_dirs = dirs;
    }

    fn ffmpeg(&mut self) -> Result<PathBuf, StreamError> {
        if let Some(path) = self.ffmpeg.as_ref().filter(|p| p.is_file()) {
            return Ok(path.clone());
        }
        let path = ffmpeg::locate(&self.search_dirs).ok_or(StreamError::FfmpegMissing)?;
        log::info!("[STREAM] ffmpeg at {}", path.display());
        self.ffmpeg = Some(path.clone());
        self.encoder = None;
        self.rtmps = None;
        Ok(path)
    }

    /// What streaming will use on this machine. The first call tries each
    /// encoder, which takes a few seconds.
    pub fn info(&mut self) -> Result<FfmpegInfo, StreamError> {
        let path = self.ffmpeg()?;
        let version = ffmpeg::version(&path)?;
        if self.encoder.is_none() {
            self.encoder = ffmpeg::pick_encoder(&path);
        }
        let rtmps = *self.rtmps.get_or_insert_with(|| ffmpeg::supports_rtmps(&path));
        Ok(FfmpegInfo {
            path: path.display().to_string(),
            version,
            encoder: self.encoder.as_ref().map(|e| e.name.clone()),
            rtmps,
        })
    }

    pub fn list_cameras(&mut self) -> Result<Vec<CameraInfo>, StreamError> {
        let path = self.ffmpeg()?;
        Ok(ffmpeg::list_cameras(&path))
    }

    /// Everything `StreamSession::start` needs from the runtime.
    pub fn prepare(&mut self, needs_rtmps: bool) -> Result<(PathBuf, Encoder), StreamError> {
        let info = self.info()?;
        if needs_rtmps && !info.rtmps {
            return Err(StreamError::NoRtmps);
        }
        let encoder = self.encoder.clone().ok_or(StreamError::NoEncoder)?;
        Ok((PathBuf::from(info.path), encoder))
    }

    /// Store a started session, returning any it replaces (to be stopped).
    pub fn insert(&mut self, output_id: String, session: StreamSession) -> Option<StreamSession> {
        self.sessions.insert(output_id, session)
    }

    pub fn take(&mut self, output_id: &str) -> Option<StreamSession> {
        self.sessions.remove(output_id)
    }

    pub fn take_all(&mut self) -> Vec<StreamSession> {
        self.sessions.drain().map(|(_, s)| s).collect()
    }

    pub fn is_active(&self, output_id: &str) -> bool {
        self.sessions.contains_key(output_id)
    }

    pub fn status(&self, output_id: &str) -> Option<StreamStatus> {
        self.sessions.get(output_id).map(StreamSession::status)
    }

    pub fn statuses(&self) -> Vec<StreamStatus> {
        self.sessions.values().map(StreamSession::status).collect()
    }

    pub fn dimensions(&self, output_id: &str) -> Option<(u32, u32)> {
        self.sessions.get(output_id).map(StreamSession::dimensions)
    }

    /// Hand a frame to the output's stream, if it has one. Returns whether
    /// one was there to take it.
    pub fn push_frame(&self, output_id: &str, width: u32, height: u32, rgba: &[u8]) -> Result<bool, StreamError> {
        match self.sessions.get(output_id) {
            Some(session) => session.push_frame(width, height, rgba).map(|()| true),
            None => Ok(false),
        }
    }
}

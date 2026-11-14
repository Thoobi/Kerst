//! How every camera in use is doing, for the operator: live, stalled,
//! reconnecting or down (and why), its picture size and data rate.
//!
//! Recorded as the shared upstreams run (see `run` in the crate root), so it
//! covers every window. A camera nobody has used for a while drops out.

use std::collections::{HashMap, VecDeque};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

/// No data for this long and a streaming camera counts as stalled.
const STALL_AFTER: Duration = Duration::from_secs(3);
/// The window the data rate is measured over.
const RATE_WINDOW: Duration = Duration::from_secs(2);
/// A camera that stopped (closed, failed) and wasn't tried again for this
/// long is no longer in use: forget it.
const FORGET_AFTER: Duration = Duration::from_secs(30);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CameraState {
    /// Opening, or opening again after a drop (`problem` says what happened).
    Connecting,
    /// Pictures arriving.
    Live,
    /// Open, but nothing arrived for a few seconds.
    Stalled,
    /// Can't be shown (`problem` says why); retried while something shows it.
    Down,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CameraHealth {
    pub url: String,
    pub state: CameraState,
    /// The last thing that went wrong, in words, until pictures arrive again.
    pub problem: Option<String>,
    /// The picture's size, once a picture has been seen.
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// Kilobits a second over the last couple of seconds.
    pub kbps: u32,
    /// How many places are showing it.
    pub readers: usize,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Phase {
    Connecting,
    Streaming,
    Failed,
    Ended,
    Closed,
}

struct Record {
    phase: Phase,
    problem: Option<String>,
    size: Option<(u32, u32)>,
    last_data: Option<Instant>,
    samples: VecDeque<(Instant, usize)>,
    touched: Instant,
}

static RECORDS: LazyLock<Mutex<HashMap<String, Record>>> = LazyLock::new(Mutex::default);

fn with(url: &str, f: impl FnOnce(&mut Record)) {
    let mut records = RECORDS.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    let record = records.entry(url.to_owned()).or_insert_with(|| Record {
        phase: Phase::Connecting,
        problem: None,
        size: None,
        last_data: None,
        samples: VecDeque::new(),
        touched: Instant::now(),
    });
    record.touched = Instant::now();
    f(record);
}

pub(crate) fn connecting(url: &str) {
    with(url, |r| r.phase = Phase::Connecting);
}

pub(crate) fn streaming(url: &str) {
    with(url, |r| r.phase = Phase::Streaming);
}

pub(crate) fn failed(url: &str, problem: &str) {
    with(url, |r| {
        r.phase = Phase::Failed;
        r.problem = Some(problem.to_owned());
    });
}

/// The camera stopped on its own (dropped, stalled out).
pub(crate) fn ended(url: &str, problem: &str) {
    with(url, |r| {
        r.phase = Phase::Ended;
        r.problem = Some(problem.to_owned());
    });
}

/// Nobody was showing it any more, so it was closed: not a problem.
pub(crate) fn closed(url: &str) {
    with(url, |r| r.phase = Phase::Closed);
}

pub(crate) fn data(url: &str, chunk: &[u8]) {
    let now = Instant::now();
    with(url, |r| {
        r.phase = Phase::Streaming;
        r.problem = None;
        r.last_data = Some(now);
        r.samples.push_back((now, chunk.len()));
        while r.samples.front().is_some_and(|(t, _)| now.duration_since(*t) > RATE_WINDOW) {
            r.samples.pop_front();
        }
        if r.size.is_none() {
            r.size = jpeg_size(chunk);
        }
    });
}

/// Every camera in use, by address.
pub fn health() -> Vec<CameraHealth> {
    let readers = crate::readers();
    let now = Instant::now();
    let mut records = RECORDS.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    records.retain(|url, r| {
        readers.contains_key(url) || !matches!(r.phase, Phase::Closed | Phase::Ended | Phase::Failed) || now.duration_since(r.touched) < FORGET_AFTER
    });
    // Closed because nothing showed it: not in use, so not shown.
    let mut list: Vec<CameraHealth> = records
        .iter()
        .filter(|(url, r)| r.phase != Phase::Closed || readers.contains_key(*url))
        .map(|(url, r)| {
            let bytes: usize = r
                .samples
                .iter()
                .filter(|(t, _)| now.duration_since(*t) <= RATE_WINDOW)
                .map(|(_, n)| n)
                .sum();
            let state = match r.phase {
                Phase::Streaming if r.last_data.is_some_and(|t| now.duration_since(t) > STALL_AFTER) => CameraState::Stalled,
                Phase::Streaming => CameraState::Live,
                Phase::Connecting | Phase::Ended | Phase::Closed => CameraState::Connecting,
                Phase::Failed => CameraState::Down,
            };
            CameraHealth {
                url: url.clone(),
                state,
                problem: r.problem.clone(),
                width: r.size.map(|s| s.0),
                height: r.size.map(|s| s.1),
                kbps: u32::try_from(bytes as u128 * 8 / RATE_WINDOW.as_millis()).unwrap_or(u32::MAX),
                readers: readers.get(url).copied().unwrap_or(0),
            }
        })
        .collect();
    list.sort_by(|a, b| a.url.cmp(&b.url));
    list
}

/// A JPEG's width and height from its frame header, if `bytes` holds one.
/// In a JPEG's compressed data 0xFF is always followed by 0x00 or a restart
/// marker, so a start-of-frame marker can't be mistaken for picture data.
fn jpeg_size(bytes: &[u8]) -> Option<(u32, u32)> {
    bytes.windows(9).find_map(|w| {
        // SOF0 (baseline), SOF1 (extended), SOF2 (progressive).
        if w[0] == 0xFF && matches!(w[1], 0xC0..=0xC2) {
            let height = u32::from(u16::from_be_bytes([w[5], w[6]]));
            let width = u32::from(u16::from_be_bytes([w[7], w[8]]));
            (width > 0 && height > 0).then_some((width, height))
        } else {
            None
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_picture_size_from_a_jpeg_frame_header() {
        // SOI, then SOF0: length 17, precision 8, height 480, width 640.
        let jpeg = [0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x01, 0xE0, 0x02, 0x80, 0x03];
        assert_eq!(jpeg_size(&jpeg), Some((640, 480)));
        assert_eq!(jpeg_size(b"--frame\\r\\nContent-Type: image/jpeg\\r\\n"), None);
    }
}

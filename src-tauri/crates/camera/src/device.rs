//! Cameras attached to this computer, read by ffmpeg as MJPEG.
//!
//! The app says how to start ffmpeg for a device id (which ffmpeg, which
//! capture options the device accepts) with [`set_device_source`]; here the
//! process is run, its stdout becomes the camera's bytes, and its last error
//! line becomes the problem when it can't start.

use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::{Arc, LazyLock, Mutex, OnceLock};
use std::time::{Duration, Instant};

use bytes::Bytes;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::time::timeout;

use crate::{ByteStream, Problem};

/// The address prefix of a camera attached to this computer: `device:<id>`,
/// `<id>` as the device list gives it (`/dev/video0`, a `DirectShow` name, an
/// `AVFoundation` index).
pub const DEVICE_SCHEME: &str = "device:";

/// How long a device gets to send its first picture, after its capture
/// options are found: a capture card can take a few seconds to lock on.
const FIRST_PICTURE_TIMEOUT: Duration = Duration::from_secs(15);
/// Bytes read from ffmpeg at a time.
const CHUNK: usize = 64 * 1024;
/// After a device fails to open, the same answer stands for this long:
/// finding a device's capture options runs ffmpeg several times, too much
/// to repeat every few seconds while something keeps asking for it.
const FAILURE_HOLD: Duration = Duration::from_secs(15);

/// The last failure to open each device, while it stands.
static RECENT_FAILURES: LazyLock<Mutex<HashMap<String, (Instant, Problem)>>> = LazyLock::new(Mutex::default);

/// What went wrong opening a device, in words that say what to do.
fn explain(said: &str) -> String {
    let lower = said.to_ascii_lowercase();
    if lower.contains("no buffer space") || lower.contains("cannot allocate memory") {
        "The camera's driver couldn't start it (it ran out of buffer memory). Unplug and replug it, or restart the computer.".into()
    } else if lower.contains("busy") {
        "The camera is in use by another app. Close the other app, then it'll connect.".into()
    } else if lower.contains("no such file") || lower.contains("not found") || lower.contains("could not find") {
        "The camera isn't connected. Plug it back in, then it'll connect.".into()
    } else if lower.contains("permission denied") {
        "Litdeck isn't allowed to use the camera. Check the computer's camera permissions.".into()
    } else {
        format!("Can't open the camera: {said}.")
    }
}

type DeviceSource = dyn Fn(&str) -> Result<Command, String> + Send + Sync;

static SOURCE: OnceLock<Box<DeviceSource>> = OnceLock::new();

/// How to start ffmpeg for a device: given its id, a `Command` that writes
/// MJPEG (`-f mpjpeg`) to stdout. Runs on a blocking thread, so it may probe
/// the device first. Set once, at startup.
pub fn set_device_source(source: impl Fn(&str) -> Result<Command, String> + Send + Sync + 'static) {
    if SOURCE.set(Box::new(source)).is_err() {
        log::warn!("camera device source set twice; keeping the first");
    }
}

/// The device's pictures, once ffmpeg sends its first bytes.
pub(crate) async fn open(id: &str) -> Result<ByteStream, Problem> {
    if let Some(problem) = recent_failure(id) {
        return Err(problem);
    }
    let result = start(id).await;
    if let Err(problem) = &result {
        RECENT_FAILURES
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .insert(id.to_owned(), (Instant::now(), problem.clone()));
    }
    result
}

fn recent_failure(id: &str) -> Option<Problem> {
    let failures = RECENT_FAILURES.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    failures.get(id).filter(|(at, _)| at.elapsed() < FAILURE_HOLD).map(|(_, problem)| problem.clone())
}

async fn start(id: &str) -> Result<ByteStream, Problem> {
    let source = SOURCE
        .get()
        .ok_or_else(|| Problem::answered("Cameras attached to this computer aren't available."))?;
    let owned = id.to_owned();
    let command = tokio::task::spawn_blocking(move || source(&owned))
        .await
        .map_err(|e| Problem::answered(format!("Can't open the camera ({e}).")))?
        .map_err(|e| Problem::answered(explain(&e)))?;

    let mut command = tokio::process::Command::from(command);
    command.stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    let mut child = command
        .spawn()
        .map_err(|e| Problem::answered(format!("Can't start ffmpeg for the camera ({e}).")))?;
    let mut stdout = child.stdout.take().ok_or_else(|| Problem::answered("ffmpeg gave no output."))?;

    // Keep ffmpeg's last words: why a device that won't open didn't.
    let last_error = Arc::new(Mutex::new(String::new()));
    if let Some(stderr) = child.stderr.take() {
        let last_error = Arc::clone(&last_error);
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if !line.trim().is_empty() {
                    line.trim().clone_into(&mut last_error.lock().unwrap_or_else(std::sync::PoisonError::into_inner));
                }
            }
        });
    }
    let why = |fallback: &str| {
        let said = last_error.lock().unwrap_or_else(std::sync::PoisonError::into_inner).clone();
        Problem::answered(explain(if said.is_empty() { fallback } else { &said }))
    };

    let mut buffer = vec![0u8; CHUNK];
    let first = match timeout(FIRST_PICTURE_TIMEOUT, stdout.read(&mut buffer)).await {
        Ok(Ok(n)) if n > 0 => Bytes::copy_from_slice(&buffer[..n]),
        Ok(_) => {
            // Exited: give its error a moment to arrive.
            let _ = timeout(Duration::from_millis(300), child.wait()).await;
            return Err(why("it stopped straight away"));
        }
        Err(_) => return Err(why("it sent no picture")),
    };

    // The child travels with the stream: dropping the stream kills ffmpeg.
    let rest = futures_util::stream::unfold((stdout, child, buffer), |(mut stdout, child, mut buffer)| async move {
        match stdout.read(&mut buffer).await {
            Ok(0) => None,
            Ok(n) => Some((Ok(Bytes::copy_from_slice(&buffer[..n])), (stdout, child, buffer))),
            Err(e) => Some((Err(e.to_string()), (stdout, child, buffer))),
        }
    });
    Ok(Box::pin(futures_util::StreamExt::chain(futures_util::stream::once(async move { Ok(first) }), rest)))
}

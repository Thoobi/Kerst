//! The local Whisper model, downloaded on first use.
//!
//! At ~870 MB the model is most of an installer's size, and many installs
//! only ever use Deepgram, so releases no longer bundle it. Choosing local
//! transcription in Settings offers a one-time download into the app data
//! dir; from then on transcription is fully offline.
//!
//! The download resumes from a `.part` file (venue Wi-Fi drops), and the file
//! is only moved into place once its size and SHA-256 match, so a model on
//! disk is always a complete one.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

use crate::events::{WhisperModelProgressPayload, EVENT_WHISPER_MODEL_PROGRESS};

pub const MODEL_FILE: &str = "ggml-large-v3-turbo-q8_0.bin";
const MODEL_SIZE: u64 = 874_188_075;

const MODEL: ModelSource = ModelSource {
    // Pinned to a repo commit so the file can't change under the checksum.
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo-q8_0.bin",
    size: MODEL_SIZE,
    sha256: "317eb69c11673c9de1e1f0d459b253999804ec71ac4c23c17ecf5fbe24e259a1",
};

/// What to download and how to recognise a complete copy.
struct ModelSource {
    url: &'static str,
    size: u64,
    sha256: &'static str,
}

const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);
const CANCEL_POLL: Duration = Duration::from_millis(500);

/// Cancel flag of the download in flight, if any.
static ACTIVE_DOWNLOAD: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

/// Where the model is, if it is available.
///
/// Checked in order: the repo's `models/` (dev, `bun run download:whisper`),
/// the app data dir (downloaded in-app), and the resource dir (v0.4.0
/// installers bundled it; an updated install still has it there).
pub fn installed_path(app: &AppHandle) -> Option<PathBuf> {
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("models")
        .join("whisper")
        .join(MODEL_FILE);
    let downloaded = download_dir(app).map(|dir| dir.join(MODEL_FILE));
    let bundled = app
        .path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join("models").join("whisper").join(MODEL_FILE));

    [Some(dev), downloaded, bundled]
        .into_iter()
        .flatten()
        .find(|path| path.is_file())
}

fn download_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("models").join("whisper"))
}

fn part_path(dir: &Path) -> PathBuf {
    dir.join(format!("{MODEL_FILE}.part"))
}

#[derive(serde::Serialize)]
pub struct WhisperModelStatus {
    pub installed: bool,
    pub downloading: bool,
    /// Bytes already on disk, including a paused partial download.
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri command extractors require pass-by-value"
)]
#[tauri::command]
pub fn whisper_model_status(app: AppHandle) -> WhisperModelStatus {
    let installed = installed_path(&app).is_some();
    let downloading = ACTIVE_DOWNLOAD.lock().is_ok_and(|active| active.is_some());
    let downloaded_bytes = if installed {
        MODEL_SIZE
    } else {
        download_dir(&app)
            .and_then(|dir| std::fs::metadata(part_path(&dir)).ok())
            .map_or(0, |meta| meta.len())
    };

    WhisperModelStatus {
        installed,
        downloading,
        downloaded_bytes,
        total_bytes: MODEL_SIZE,
    }
}

/// Download the model, resuming a partial download. Resolves once the model
/// is verified and in place; progress arrives as `whisper_model_progress`.
#[tauri::command]
pub async fn download_whisper_model(app: AppHandle) -> Result<(), String> {
    if installed_path(&app).is_some() {
        return Ok(());
    }

    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut active = ACTIVE_DOWNLOAD.lock().map_err(|e| e.to_string())?;
        if active.is_some() {
            return Err("The Whisper model is already downloading".into());
        }
        *active = Some(cancel.clone());
    }

    let result = match download_dir(&app) {
        Some(dir) => {
            let emit = |downloaded: u64| {
                let _ = app.emit(
                    EVENT_WHISPER_MODEL_PROGRESS,
                    WhisperModelProgressPayload {
                        downloaded_bytes: downloaded,
                        total_bytes: MODEL.size,
                    },
                );
            };
            download(&MODEL, &dir, &cancel, emit).await
        }
        None => Err("Could not find the app data folder".into()),
    };
    if let Ok(mut active) = ACTIVE_DOWNLOAD.lock() {
        *active = None;
    }

    match &result {
        Ok(()) => log::info!("Whisper model downloaded and verified"),
        Err(e) => log::warn!("Whisper model download stopped: {e}"),
    }
    result
}

/// Stop the download in flight. The partial file is kept so the next
/// download picks up where this one stopped.
#[tauri::command]
pub fn cancel_whisper_model_download() {
    if let Ok(active) = ACTIVE_DOWNLOAD.lock() {
        if let Some(cancel) = active.as_ref() {
            cancel.store(true, Ordering::Relaxed);
        }
    }
}

/// Download `source` into `dir` as [`MODEL_FILE`], resuming a partial file.
async fn download(
    source: &ModelSource,
    dir: &Path,
    cancel: &AtomicBool,
    on_progress: impl Fn(u64),
) -> Result<(), String> {
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    let part = part_path(dir);

    let mut have = tokio::fs::metadata(&part)
        .await
        .map_or(0, |meta| meta.len());
    if have > source.size {
        have = 0;
    }

    if have < source.size {
        have = fetch(source.url, cancel, &part, have, on_progress).await?;
    }

    if have != source.size {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(format!(
            "The download ended early ({have} of {} bytes). Try again.",
            source.size
        ));
    }

    let digest = tokio::task::spawn_blocking({
        let part = part.clone();
        move || sha256_hex(&part)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("Could not read the downloaded model: {e}"))?;

    if digest != source.sha256 {
        let _ = tokio::fs::remove_file(&part).await;
        return Err("The downloaded model was corrupted, so it was deleted. Try again.".into());
    }

    tokio::fs::rename(&part, dir.join(MODEL_FILE))
        .await
        .map_err(|e| format!("Could not move the model into place: {e}"))
}

/// Append the rest of the model to `part`, which holds `have` bytes. Returns
/// how many bytes `part` holds afterwards.
async fn fetch(
    url: &str,
    cancel: &AtomicBool,
    part: &Path,
    mut have: u64,
    on_progress: impl Fn(u64),
) -> Result<u64, String> {
    let client = reqwest::Client::builder()
        // Generous: on slow venue Wi-Fi a connection (DNS + TLS) can take
        // 15 s, and the download redirects to a CDN that needs its own.
        .connect_timeout(Duration::from_secs(60))
        // No overall timeout: on slow venue Wi-Fi the download takes a while.
        .read_timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let mut request = client.get(url);
    if have > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={have}-"));
    }
    let response = request
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| format!("Could not reach the download server: {}", with_causes(&e)))?;

    // A server that ignores the range sends the whole file again.
    let resumed = response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    if !resumed {
        have = 0;
    }

    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(resumed)
        .truncate(!resumed)
        .open(part)
        .await
        .map_err(|e| format!("Could not write {}: {e}", part.display()))?;

    on_progress(have);

    let mut stream = response.bytes_stream();
    let mut last_emit = Instant::now();
    loop {
        // Wake regularly so Pause works even while the connection stalls.
        let next = tokio::time::timeout(CANCEL_POLL, stream.next()).await;
        if cancel.load(Ordering::Relaxed) {
            file.flush().await.map_err(|e| e.to_string())?;
            return Err("Download cancelled".into());
        }
        let Ok(next) = next else { continue };
        let Some(chunk) = next else { break };
        let chunk =
            chunk.map_err(|e| format!("The download was interrupted: {}", with_causes(&e)))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Could not save the model: {e}"))?;
        have += chunk.len() as u64;

        if last_emit.elapsed() >= PROGRESS_INTERVAL {
            on_progress(have);
            last_emit = Instant::now();
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    on_progress(have);

    Ok(have)
}

/// reqwest's own message ("error sending request for url …") hides the
/// cause; append the chain so a support log says timeout, DNS or TLS.
fn with_causes(error: &dyn std::error::Error) -> String {
    let mut message = error.to_string();
    let mut source = error.source();
    while let Some(cause) = source {
        message.push_str(": ");
        message.push_str(&cause.to_string());
        source = cause.source();
    }
    message
}

fn sha256_hex(path: &Path) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)?;
    Ok(hex(&hasher.finalize()))
}

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut out, byte| {
            let _ = write!(out, "{byte:02x}");
            out
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Serve `body` on a loopback port; tower-http's `ServeFile` honours
    /// `Range`, like the real CDN.
    async fn serve(dir: &Path, body: &[u8]) -> String {
        let file = dir.join("served.bin");
        std::fs::write(&file, body).unwrap();
        let app = axum::Router::new()
            .route_service("/model.bin", tower_http::services::ServeFile::new(file));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        format!("http://{addr}/model.bin")
    }

    fn scratch_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("litdeck-whisper-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn body() -> Vec<u8> {
        (0..3_000_000u32).map(|i| (i % 251) as u8).collect()
    }

    fn source(url: String, body: &[u8], sha256: String) -> ModelSource {
        ModelSource {
            url: Box::leak(url.into_boxed_str()),
            size: body.len() as u64,
            sha256: Box::leak(sha256.into_boxed_str()),
        }
    }

    fn hash(body: &[u8]) -> String {
        hex(&Sha256::digest(body))
    }

    #[tokio::test]
    async fn resumes_a_partial_download_and_verifies_it() {
        let dir = scratch_dir("resume");
        let body = body();
        let src = source(serve(&dir, &body).await, &body, hash(&body));

        // A first attempt that stopped a third of the way through.
        std::fs::write(part_path(&dir), &body[..1_000_000]).unwrap();

        let first_report = Mutex::new(None);
        download(&src, &dir, &AtomicBool::new(false), |n| {
            first_report.lock().unwrap().get_or_insert(n);
        })
        .await
        .unwrap();

        assert_eq!(
            *first_report.lock().unwrap(),
            Some(1_000_000),
            "should resume, not restart"
        );
        assert_eq!(std::fs::read(dir.join(MODEL_FILE)).unwrap(), body);
        assert!(!part_path(&dir).exists());
    }

    #[tokio::test]
    async fn rejects_and_deletes_a_corrupt_download() {
        let dir = scratch_dir("corrupt");
        let body = body();
        let src = source(serve(&dir, &body).await, &body, "0".repeat(64));

        let err = download(&src, &dir, &AtomicBool::new(false), |_| {})
            .await
            .unwrap_err();

        assert!(err.contains("corrupted"), "{err}");
        assert!(!dir.join(MODEL_FILE).exists());
        assert!(!part_path(&dir).exists());
    }

    #[tokio::test]
    async fn cancelling_keeps_the_partial_file() {
        let dir = scratch_dir("cancel");
        let body = body();
        let src = source(serve(&dir, &body).await, &body, hash(&body));

        let err = download(&src, &dir, &AtomicBool::new(true), |_| {})
            .await
            .unwrap_err();

        assert_eq!(err, "Download cancelled");
        assert!(part_path(&dir).exists());
        assert!(!dir.join(MODEL_FILE).exists());
    }
}

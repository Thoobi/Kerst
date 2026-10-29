//! The local Whisper models, downloaded on first use.
//!
//! At ~870 MB the accurate model is most of an installer's size, and many
//! installs only ever use Deepgram, so releases bundle neither model. Choosing
//! local transcription in Settings offers a one-time download into the app
//! data dir; from then on transcription is fully offline.
//!
//! There are two because one size doesn't fit every computer: the accurate
//! model needs ~70 s for each 10 s of speech on a 2015 dual-core i5 (whisper.cpp
//! always encodes a full 30 s window), far behind a live sermon. The fast one
//! is ~10x smaller and keeps up there, at some cost in accuracy.
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

/// Which local model transcribes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WhisperModel {
    /// large-v3-turbo: the best transcription, for computers fast enough.
    Accurate,
    /// base.en: keeps up with live speech on older and slower laptops.
    Fast,
}

impl WhisperModel {
    fn source(self) -> &'static ModelSource {
        match self {
            Self::Accurate => &ACCURATE,
            Self::Fast => &FAST,
        }
    }
}

// Both pinned to one repo commit so a file can't change under its checksum.
const ACCURATE: ModelSource = ModelSource {
    file: "ggml-large-v3-turbo-q8_0.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo-q8_0.bin",
    size: 874_188_075,
    sha256: "317eb69c11673c9de1e1f0d459b253999804ec71ac4c23c17ecf5fbe24e259a1",
};

// English-only: the app transcribes English, and at this size .en models
// are the more accurate ones.
const FAST: ModelSource = ModelSource {
    file: "ggml-base.en-q8_0.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base.en-q8_0.bin",
    size: 81_781_811,
    sha256: "a4d4a0768075e13cfd7e19df3ae2dbc4a68d37d36a7dad45e8410c9a34f8c87e",
};

/// What to download and how to recognise a complete copy.
struct ModelSource {
    file: &'static str,
    url: &'static str,
    size: u64,
    sha256: &'static str,
}

const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);
const CANCEL_POLL: Duration = Duration::from_millis(500);

/// The download in flight, if any, and its cancel flag. One at a time.
static ACTIVE_DOWNLOAD: Mutex<Option<(WhisperModel, Arc<AtomicBool>)>> = Mutex::new(None);

fn downloading(model: WhisperModel) -> bool {
    ACTIVE_DOWNLOAD
        .lock()
        .is_ok_and(|active| active.as_ref().is_some_and(|(m, _)| *m == model))
}

/// Where the model is, if it is available.
///
/// Checked in order: the repo's `models/` (dev, `bun run download:whisper`),
/// the app data dir (downloaded in-app), and the resource dir (v0.4.0
/// installers bundled the accurate model; an updated install still has it).
pub fn installed_path(app: &AppHandle, model: WhisperModel) -> Option<PathBuf> {
    let file = model.source().file;
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("models")
        .join("whisper")
        .join(file);
    let downloaded = download_dir(app).map(|dir| dir.join(file));
    let bundled = app
        .path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join("models").join("whisper").join(file));

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

fn part_path(dir: &Path, source: &ModelSource) -> PathBuf {
    dir.join(format!("{}.part", source.file))
}

#[derive(serde::Serialize)]
pub struct WhisperModelStatus {
    pub installed: bool,
    /// The model (or a partial download) is the in-app download, which
    /// `delete_whisper_model` can remove. A dev or bundled copy isn't.
    pub removable: bool,
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
pub fn whisper_model_status(app: AppHandle, model: WhisperModel) -> WhisperModelStatus {
    let source = model.source();
    let path = installed_path(&app, model);
    let installed = path.is_some();
    let download = download_dir(&app);
    let removable = match &path {
        Some(path) => download.as_ref().is_some_and(|dir| path.starts_with(dir)),
        None => download.as_ref().is_some_and(|dir| part_path(dir, source).exists()),
    };
    let downloaded_bytes = if installed {
        source.size
    } else {
        download
            .and_then(|dir| std::fs::metadata(part_path(&dir, source)).ok())
            .map_or(0, |meta| meta.len())
    };

    WhisperModelStatus {
        installed,
        removable,
        downloading: downloading(model),
        downloaded_bytes,
        total_bytes: source.size,
    }
}

/// Download the model, resuming a partial download. Resolves once the model
/// is verified and in place; progress arrives as `whisper_model_progress`.
#[tauri::command]
pub async fn download_whisper_model(app: AppHandle, model: WhisperModel) -> Result<(), String> {
    if installed_path(&app, model).is_some() {
        return Ok(());
    }
    let source = model.source();

    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut active = ACTIVE_DOWNLOAD.lock().map_err(|e| e.to_string())?;
        if active.is_some() {
            return Err("A Whisper model is already downloading".into());
        }
        *active = Some((model, cancel.clone()));
    }

    let result = match download_dir(&app) {
        Some(dir) => {
            let emit = |downloaded: u64| {
                let _ = app.emit(
                    EVENT_WHISPER_MODEL_PROGRESS,
                    WhisperModelProgressPayload {
                        model,
                        downloaded_bytes: downloaded,
                        total_bytes: source.size,
                    },
                );
            };
            download(source, &dir, &cancel, emit).await
        }
        None => Err("Could not find the app data folder".into()),
    };
    if let Ok(mut active) = ACTIVE_DOWNLOAD.lock() {
        *active = None;
    }

    match &result {
        Ok(()) => log::info!("Whisper model {model:?} downloaded and verified"),
        Err(e) => log::warn!("Whisper model {model:?} download stopped: {e}"),
    }
    result
}

/// Delete a downloaded model and any partial download of it. Local
/// transcription with it then needs the download again.
#[expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]
#[tauri::command]
pub fn delete_whisper_model(
    app: AppHandle,
    state: tauri::State<'_, Mutex<crate::state::AppState>>,
    model: WhisperModel,
) -> Result<(), String> {
    if downloading(model) {
        return Err("Pause the download before removing the model".into());
    }
    // Windows can't delete a file whisper.cpp has open.
    let transcribing = state
        .lock()
        .map_err(|e| e.to_string())?
        .stt_active
        .load(Ordering::Relaxed);
    if transcribing {
        return Err("Stop transcription before removing the model".into());
    }

    let source = model.source();
    let dir = download_dir(&app).ok_or("Could not find the app data folder")?;
    for path in [dir.join(source.file), part_path(&dir, source)] {
        match std::fs::remove_file(&path) {
            Ok(()) => log::info!("Removed {}", path.display()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("Could not remove {}: {e}", path.display())),
        }
    }
    Ok(())
}

/// Stop the download in flight. The partial file is kept so the next
/// download picks up where this one stopped.
#[tauri::command]
pub fn cancel_whisper_model_download() {
    if let Ok(active) = ACTIVE_DOWNLOAD.lock() {
        if let Some((_, cancel)) = active.as_ref() {
            cancel.store(true, Ordering::Relaxed);
        }
    }
}

/// Download `source` into `dir` as `source.file`, resuming a partial file.
async fn download(
    source: &ModelSource,
    dir: &Path,
    cancel: &AtomicBool,
    on_progress: impl Fn(u64),
) -> Result<(), String> {
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    let part = part_path(dir, source);

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

    tokio::fs::rename(&part, dir.join(source.file))
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
            file: "test-model.bin",
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
        std::fs::write(part_path(&dir, &src), &body[..1_000_000]).unwrap();

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
        assert_eq!(std::fs::read(dir.join(src.file)).unwrap(), body);
        assert!(!part_path(&dir, &src).exists());
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
        assert!(!dir.join(src.file).exists());
        assert!(!part_path(&dir, &src).exists());
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
        assert!(part_path(&dir, &src).exists());
        assert!(!dir.join(src.file).exists());
    }
}

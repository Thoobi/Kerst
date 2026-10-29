//! Transcribe a raw 16 kHz mono s16le file with the local Whisper model,
//! fed in real time like the microphone would be:
//!
//! ```sh
//! espeak-ng -w /tmp/s.wav "For God so loved the world"
//! ffmpeg -i /tmp/s.wav -ar 16000 -ac 1 -f s16le /tmp/s.raw
//! cargo run -p litdeck-stt --features whisper --example whisper_file -- /tmp/s.raw [threads] [model.bin]
//! ```
//!
//! `threads` defaults to 4; the app uses half the CPU's threads. The model
//! defaults to the repo's large-v3-turbo.

use std::path::PathBuf;
use std::time::Duration;

use litdeck_stt::{SttProvider, TranscriptEvent, WhisperProvider};

#[tokio::main]
async fn main() {
    let input = std::env::args().nth(1).expect("usage: whisper_file <file.raw>");
    let bytes = std::fs::read(&input).expect("read input");
    let samples: Vec<i16> = bytes.as_chunks::<2>().0.iter().map(|b| i16::from_le_bytes(*b)).collect();
    let model = std::env::args().nth(3).map_or_else(
        || PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../models/whisper/ggml-large-v3-turbo-q8_0.bin"),
        PathBuf::from,
    );

    let (audio_tx, audio_rx) = crossbeam_channel::bounded(64);
    let (event_tx, mut event_rx) = tokio::sync::mpsc::channel(64);
    let threads = std::env::args().nth(2).and_then(|n| n.parse().ok()).unwrap_or(4);
    let provider = std::sync::Arc::new(WhisperProvider::new(model, None, threads));
    let running = provider.clone();
    let task = tokio::spawn(async move { running.start(audio_rx, event_tx).await });

    // 100 ms chunks in real time, then 2 s of silence so the VAD closes the utterance.
    std::thread::spawn(move || {
        let silence = vec![0_i16; 32_000];
        for chunk in samples.chunks(1600).chain(silence.chunks(1600)) {
            if audio_tx.send(chunk.to_vec()).is_err() {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    });

    while let Ok(Some(event)) = tokio::time::timeout(Duration::from_secs(600), event_rx.recv()).await {
        match event {
            TranscriptEvent::Final { transcript, .. } => {
                println!("FINAL: {transcript}");
                break;
            }
            TranscriptEvent::Error(e) => {
                println!("ERROR: {e}");
                break;
            }
            other => println!("{other:?}"),
        }
    }
    provider.stop();
    let _ = task.await;
}

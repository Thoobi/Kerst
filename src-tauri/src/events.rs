pub const EVENT_AUDIO_LEVEL: &str = "audio_level";
pub const EVENT_TRANSCRIPT_PARTIAL: &str = "transcript_partial";
pub const EVENT_TRANSCRIPT_FINAL: &str = "transcript_final";
pub const EVENT_AUDIO_SOURCE_LOST: &str = "audio_source_lost";
pub const EVENT_AUDIO_SOURCE_RECOVERED: &str = "audio_source_recovered";
pub const EVENT_AUDIO_TEST_STOPPED: &str = "audio_test_stopped";
pub const EVENT_WHISPER_MODEL_PROGRESS: &str = "whisper_model_progress";

#[derive(Clone, serde::Serialize)]
pub struct AudioLevelPayload {
    pub rms: f32,
    pub peak: f32,
}

#[derive(Clone, serde::Serialize)]
pub struct AudioTestStoppedPayload {
    /// Why the test ended: "stopped" | "timeout" | "device_lost"
    pub reason: String,
}

#[derive(Clone, serde::Serialize)]
pub struct TranscriptPayload {
    pub text: String,
    pub is_final: bool,
    pub confidence: f64,
}

#[derive(Clone, serde::Serialize)]
pub struct WhisperModelProgressPayload {
    pub model: crate::commands::whisper_model::WhisperModel,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

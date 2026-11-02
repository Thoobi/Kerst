use serde::{Deserialize, Serialize};
use std::fmt;

/// Unified command type for all remote control protocols (OSC, HTTP).
///
/// Both OSC messages and HTTP JSON requests parse into this enum.
/// The `CommandDispatcher` then routes each variant to the appropriate
/// backend action or frontend event.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "command", content = "value", rename_all = "snake_case")]
pub enum RemoteCommand {
    Next,
    Prev,
    Show,
    Hide,
    Theme(String),
    Opacity(f32),
    Confidence(f32),
    OnAir(bool),
    SendToLive,
    BibleNext,
    BiblePrev,
    AddToQueue,
    /// Show (`true`) or hide the lower-third band on lower-third outputs,
    /// staying on air.
    LowerThird(bool),
    /// Hide the lower-third band if it's showing, show it if it's hidden.
    ToggleLowerThird,
}

impl fmt::Display for RemoteCommand {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RemoteCommand::Next => write!(f, "next"),
            RemoteCommand::Prev => write!(f, "prev"),
            RemoteCommand::Show => write!(f, "show"),
            RemoteCommand::Hide => write!(f, "hide"),
            RemoteCommand::Theme(name) => write!(f, "theme({name})"),
            RemoteCommand::Opacity(val) => write!(f, "opacity({val:.2})"),
            RemoteCommand::Confidence(val) => write!(f, "confidence({val:.2})"),
            RemoteCommand::OnAir(active) => write!(f, "on_air({active})"),
            RemoteCommand::SendToLive => write!(f, "send_to_live"),
            RemoteCommand::BibleNext => write!(f, "bible_next"),
            RemoteCommand::BiblePrev => write!(f, "bible_prev"),
            RemoteCommand::AddToQueue => write!(f, "add_to_queue"),
            RemoteCommand::LowerThird(visible) => write!(f, "lower_third({visible})"),
            RemoteCommand::ToggleLowerThird => write!(f, "toggle_lower_third"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- Serde serialization tests ---

    #[test]
    fn serialize_next() {
        let json = serde_json::to_value(&RemoteCommand::Next).unwrap();
        assert_eq!(json, serde_json::json!({"command": "next"}));
    }

    #[test]
    fn serialize_prev() {
        let json = serde_json::to_value(&RemoteCommand::Prev).unwrap();
        assert_eq!(json, serde_json::json!({"command": "prev"}));
    }

    #[test]
    fn serialize_show() {
        let json = serde_json::to_value(&RemoteCommand::Show).unwrap();
        assert_eq!(json, serde_json::json!({"command": "show"}));
    }

    #[test]
    fn serialize_hide() {
        let json = serde_json::to_value(&RemoteCommand::Hide).unwrap();
        assert_eq!(json, serde_json::json!({"command": "hide"}));
    }

    #[test]
    fn serialize_theme() {
        let json = serde_json::to_value(&RemoteCommand::Theme("Dark".into())).unwrap();
        assert_eq!(json, serde_json::json!({"command": "theme", "value": "Dark"}));
    }

    #[test]
    fn serialize_opacity() {
        let json = serde_json::to_value(&RemoteCommand::Opacity(0.75)).unwrap();
        assert_eq!(json, serde_json::json!({"command": "opacity", "value": 0.75}));
    }

    #[test]
    fn serialize_confidence() {
        let json = serde_json::to_value(&RemoteCommand::Confidence(0.75)).unwrap();
        assert_eq!(json, serde_json::json!({"command": "confidence", "value": 0.75}));
    }

    #[test]
    fn serialize_on_air() {
        let json = serde_json::to_value(&RemoteCommand::OnAir(true)).unwrap();
        assert_eq!(json, serde_json::json!({"command": "on_air", "value": true}));
    }

    #[test]
    fn serialize_send_to_live() {
        let json = serde_json::to_value(&RemoteCommand::SendToLive).unwrap();
        assert_eq!(json, serde_json::json!({"command": "send_to_live"}));
    }

    #[test]
    fn serialize_bible_next() {
        let json = serde_json::to_value(&RemoteCommand::BibleNext).unwrap();
        assert_eq!(json, serde_json::json!({"command": "bible_next"}));
    }

    #[test]
    fn serialize_bible_prev() {
        let json = serde_json::to_value(&RemoteCommand::BiblePrev).unwrap();
        assert_eq!(json, serde_json::json!({"command": "bible_prev"}));
    }

    #[test]
    fn serialize_lower_third() {
        let json = serde_json::to_value(&RemoteCommand::LowerThird(false)).unwrap();
        assert_eq!(json, serde_json::json!({"command": "lower_third", "value": false}));
        let json = serde_json::to_value(&RemoteCommand::ToggleLowerThird).unwrap();
        assert_eq!(json, serde_json::json!({"command": "toggle_lower_third"}));
    }

    #[test]
    fn deserialize_lower_third() {
        let cmd: RemoteCommand =
            serde_json::from_str(r#"{"command":"lower_third","value":true}"#).unwrap();
        assert_eq!(cmd, RemoteCommand::LowerThird(true));
        let cmd: RemoteCommand = serde_json::from_str(r#"{"command":"toggle_lower_third"}"#).unwrap();
        assert_eq!(cmd, RemoteCommand::ToggleLowerThird);
    }

    #[test]
    fn serialize_add_to_queue() {
        let json = serde_json::to_value(&RemoteCommand::AddToQueue).unwrap();
        assert_eq!(json, serde_json::json!({"command": "add_to_queue"}));
    }

    // --- Serde deserialization tests ---

    #[test]
    fn deserialize_next() {
        let cmd: RemoteCommand = serde_json::from_str(r#"{"command":"next"}"#).unwrap();
        assert_eq!(cmd, RemoteCommand::Next);
    }

    #[test]
    fn deserialize_theme() {
        let cmd: RemoteCommand =
            serde_json::from_str(r#"{"command":"theme","value":"Minimal"}"#).unwrap();
        assert_eq!(cmd, RemoteCommand::Theme("Minimal".into()));
    }

    #[test]
    fn deserialize_confidence() {
        let cmd: RemoteCommand =
            serde_json::from_str(r#"{"command":"confidence","value":0.75}"#).unwrap();
        assert_eq!(cmd, RemoteCommand::Confidence(0.75));
    }

    #[test]
    fn deserialize_send_to_live() {
        let cmd: RemoteCommand = serde_json::from_str(r#"{"command":"send_to_live"}"#).unwrap();
        assert_eq!(cmd, RemoteCommand::SendToLive);
    }

    #[test]
    fn deserialize_bible_next() {
        let cmd: RemoteCommand = serde_json::from_str(r#"{"command":"bible_next"}"#).unwrap();
        assert_eq!(cmd, RemoteCommand::BibleNext);
    }

    #[test]
    fn deserialize_bible_prev() {
        let cmd: RemoteCommand = serde_json::from_str(r#"{"command":"bible_prev"}"#).unwrap();
        assert_eq!(cmd, RemoteCommand::BiblePrev);
    }

    #[test]
    fn deserialize_add_to_queue() {
        let cmd: RemoteCommand = serde_json::from_str(r#"{"command":"add_to_queue"}"#).unwrap();
        assert_eq!(cmd, RemoteCommand::AddToQueue);
    }

    // --- Round-trip tests ---

    #[test]
    fn roundtrip_all_variants() {
        let variants = vec![
            RemoteCommand::Next,
            RemoteCommand::Prev,
            RemoteCommand::Show,
            RemoteCommand::Hide,
            RemoteCommand::Theme("Classic Dark".into()),
            RemoteCommand::Opacity(0.5),
            RemoteCommand::Confidence(0.9),
            RemoteCommand::OnAir(false),
            RemoteCommand::SendToLive,
            RemoteCommand::BibleNext,
            RemoteCommand::BiblePrev,
            RemoteCommand::AddToQueue,
            RemoteCommand::LowerThird(true),
            RemoteCommand::ToggleLowerThird,
        ];

        for cmd in variants {
            let json = serde_json::to_string(&cmd).unwrap();
            let deserialized: RemoteCommand = serde_json::from_str(&json).unwrap();
            assert_eq!(cmd, deserialized, "Round-trip failed for {cmd}");
        }
    }

    // --- Display tests ---

    #[test]
    fn display_next() {
        assert_eq!(RemoteCommand::Next.to_string(), "next");
    }

    #[test]
    fn display_prev() {
        assert_eq!(RemoteCommand::Prev.to_string(), "prev");
    }

    #[test]
    fn display_theme() {
        assert_eq!(
            RemoteCommand::Theme("X".into()).to_string(),
            "theme(X)"
        );
    }

    #[test]
    fn display_opacity() {
        assert_eq!(RemoteCommand::Opacity(0.75).to_string(), "opacity(0.75)");
    }

    #[test]
    fn display_confidence() {
        assert_eq!(
            RemoteCommand::Confidence(0.80).to_string(),
            "confidence(0.80)"
        );
    }

    #[test]
    fn display_on_air() {
        assert_eq!(RemoteCommand::OnAir(true).to_string(), "on_air(true)");
        assert_eq!(RemoteCommand::OnAir(false).to_string(), "on_air(false)");
    }

    #[test]
    fn display_send_to_live() {
        assert_eq!(RemoteCommand::SendToLive.to_string(), "send_to_live");
    }

    #[test]
    fn display_bible_next() {
        assert_eq!(RemoteCommand::BibleNext.to_string(), "bible_next");
    }

    #[test]
    fn display_bible_prev() {
        assert_eq!(RemoteCommand::BiblePrev.to_string(), "bible_prev");
    }

    #[test]
    fn display_add_to_queue() {
        assert_eq!(RemoteCommand::AddToQueue.to_string(), "add_to_queue");
    }

    // --- Exhaustive match test ---

    #[test]
    fn enum_has_exactly_14_variants() {
        // This test ensures all 14 variants are covered.
        // If a new variant is added, this match will fail to compile.
        let cmds: Vec<RemoteCommand> = vec![
            RemoteCommand::Next,
            RemoteCommand::Prev,
            RemoteCommand::Show,
            RemoteCommand::Hide,
            RemoteCommand::Theme(String::new()),
            RemoteCommand::Opacity(0.0),
            RemoteCommand::Confidence(0.0),
            RemoteCommand::OnAir(false),
            RemoteCommand::SendToLive,
            RemoteCommand::BibleNext,
            RemoteCommand::BiblePrev,
            RemoteCommand::AddToQueue,
            RemoteCommand::LowerThird(false),
            RemoteCommand::ToggleLowerThird,
        ];

        for cmd in &cmds {
            match cmd {
                RemoteCommand::Next => {}
                RemoteCommand::Prev => {}
                RemoteCommand::Show => {}
                RemoteCommand::Hide => {}
                RemoteCommand::Theme(_) => {}
                RemoteCommand::Opacity(_) => {}
                RemoteCommand::Confidence(_) => {}
                RemoteCommand::OnAir(_) => {}
                RemoteCommand::SendToLive => {}
                RemoteCommand::BibleNext => {}
                RemoteCommand::BiblePrev => {}
                RemoteCommand::AddToQueue => {}
                RemoteCommand::LowerThird(_) => {}
                RemoteCommand::ToggleLowerThird => {}
            }
        }

        assert_eq!(cmds.len(), 14);
    }
}

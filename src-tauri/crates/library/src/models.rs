use serde::{Deserialize, Serialize};

/// What part of a song a section is. Drives default labels and lets the
/// operator jump straight to "the chorus" during worship.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SectionKind {
    Verse,
    PreChorus,
    Chorus,
    Bridge,
    Tag,
    Intro,
    Outro,
    Other,
}

impl SectionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Verse => "verse",
            Self::PreChorus => "pre-chorus",
            Self::Chorus => "chorus",
            Self::Bridge => "bridge",
            Self::Tag => "tag",
            Self::Intro => "intro",
            Self::Outro => "outro",
            Self::Other => "other",
        }
    }

    /// Lenient parse for stored values; unknown kinds become `Other`.
    pub fn parse(value: &str) -> Self {
        match value {
            "verse" => Self::Verse,
            "pre-chorus" => Self::PreChorus,
            "chorus" => Self::Chorus,
            "bridge" => Self::Bridge,
            "tag" => Self::Tag,
            "intro" => Self::Intro,
            "outro" => Self::Outro,
            _ => Self::Other,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SongSection {
    pub id: String,
    pub kind: SectionKind,
    /// Operator-facing name, e.g. "Verse 1", "Chorus".
    pub label: String,
    /// Lyrics with one sung line per `\n`; blank lines split slides.
    pub lyrics: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Song {
    pub id: String,
    pub title: String,
    pub author: Option<String>,
    pub copyright: Option<String>,
    pub ccli_number: Option<String>,
    /// Sections in their written order.
    pub sections: Vec<SongSection>,
    /// Section ids in the order they are sung (e.g. V1 C V2 C B C). Empty
    /// means "as written".
    pub arrangement: Vec<String>,
    /// Where the song came from: "manual", "easyworship", "songselect", ...
    pub source: String,
    /// A library video looped behind the lyrics instead of the theme's
    /// background. Set with `LibraryDb::set_song_background`; saving the
    /// song leaves it alone.
    pub background_video_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// A song as sent by the frontend to create or update. Missing ids are
/// generated; sections are replaced wholesale.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SongInput {
    pub id: Option<String>,
    pub title: String,
    pub author: Option<String>,
    pub copyright: Option<String>,
    pub ccli_number: Option<String>,
    pub sections: Vec<SongSectionInput>,
    /// Arrangement by section *index* into `sections`, so new sections can
    /// be ordered before they have ids.
    #[serde(default)]
    pub arrangement: Vec<usize>,
    #[serde(default = "default_source")]
    pub source: String,
}

fn default_source() -> String {
    "manual".to_string()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SongSectionInput {
    pub id: Option<String>,
    pub kind: SectionKind,
    pub label: String,
    pub lyrics: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SongSummary {
    pub id: String,
    pub title: String,
    pub author: Option<String>,
    pub ccli_number: Option<String>,
    /// First line of the first section, to tell same-titled songs apart.
    pub first_line: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ScheduleItemKind {
    Song,
    Scripture,
    Announcement,
    Media,
    /// The live-detection part of the service.
    Sermon,
}

impl ScheduleItemKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Song => "song",
            Self::Scripture => "scripture",
            Self::Announcement => "announcement",
            Self::Media => "media",
            Self::Sermon => "sermon",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "song" => Self::Song,
            "scripture" => Self::Scripture,
            "announcement" => Self::Announcement,
            "media" => Self::Media,
            "sermon" => Self::Sermon,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScheduleItem {
    pub id: String,
    pub kind: ScheduleItemKind,
    pub title: String,
    /// Kind-specific data (song id, scripture range, media path, ...),
    /// owned by the frontend.
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Schedule {
    pub id: String,
    pub name: String,
    /// ISO date (YYYY-MM-DD) of the service, if set.
    pub service_date: Option<String>,
    pub items: Vec<ScheduleItem>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScheduleInput {
    pub id: Option<String>,
    pub name: String,
    pub service_date: Option<String>,
    pub items: Vec<ScheduleItemInput>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScheduleItemInput {
    pub id: Option<String>,
    pub kind: ScheduleItemKind,
    pub title: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScheduleSummary {
    pub id: String,
    pub name: String,
    pub service_date: Option<String>,
    pub item_count: i64,
    pub updated_at: i64,
}

/// One page of an imported deck, pre-rendered to an image file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeckSlide {
    pub id: String,
    /// Absolute path of the image on disk.
    pub path: String,
    pub width: u32,
    pub height: u32,
}

/// An imported presentation: its slides, in order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Deck {
    pub id: String,
    pub title: String,
    /// The file it was imported from, e.g. "Welcome.pdf".
    pub source_name: Option<String>,
    pub slides: Vec<DeckSlide>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeckSummary {
    pub id: String,
    pub title: String,
    pub source_name: Option<String>,
    pub slide_count: i64,
    /// The first slide's image, for a thumbnail.
    pub cover_path: Option<String>,
    pub updated_at: i64,
}

/// An imported video, copied into the library so it plays even after the
/// original (say, on a USB stick) is gone.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Video {
    pub id: String,
    pub title: String,
    /// The file it was imported from, e.g. "Countdown.mp4".
    pub source_name: Option<String>,
    /// Absolute path of the library's copy.
    pub path: String,
    /// A still frame for thumbnails, once the frontend has made one.
    pub poster_path: Option<String>,
    pub duration_ms: Option<i64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// Start again from the top when it ends, e.g. a countdown or a
    /// background loop, instead of holding the last frame.
    #[serde(rename = "loop")]
    pub looping: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

/// What the frontend learns by loading an imported video, sent to finish
/// the import.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct VideoProbe {
    pub duration_ms: i64,
    pub width: u32,
    pub height: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// The frontend (src/lib/library-api.ts) omits optional fields entirely.
    #[test]
    fn accepts_minimal_inputs_from_the_frontend() {
        let song: SongInput = serde_json::from_value(json!({
            "title": "Way Maker",
            "sections": [{ "kind": "pre-chorus", "label": "Pre-Chorus", "lyrics": "You are here" }]
        }))
        .unwrap();
        assert_eq!(song.id, None);
        assert_eq!(song.sections[0].kind, SectionKind::PreChorus);
        assert!(song.arrangement.is_empty());
        assert_eq!(song.source, "manual");

        let schedule: ScheduleInput = serde_json::from_value(json!({
            "name": "Sunday",
            "items": [{ "kind": "sermon", "title": "Sermon" }]
        }))
        .unwrap();
        assert_eq!(schedule.items[0].kind, ScheduleItemKind::Sermon);
        assert!(schedule.items[0].payload.is_null());
    }

    #[test]
    fn kinds_round_trip_through_their_stored_names() {
        for kind in [
            SectionKind::Verse,
            SectionKind::PreChorus,
            SectionKind::Chorus,
            SectionKind::Bridge,
            SectionKind::Tag,
            SectionKind::Intro,
            SectionKind::Outro,
            SectionKind::Other,
        ] {
            assert_eq!(SectionKind::parse(kind.as_str()), kind);
            assert_eq!(serde_json::to_value(kind).unwrap(), kind.as_str());
        }
        for kind in [
            ScheduleItemKind::Song,
            ScheduleItemKind::Scripture,
            ScheduleItemKind::Announcement,
            ScheduleItemKind::Media,
            ScheduleItemKind::Sermon,
        ] {
            assert_eq!(ScheduleItemKind::parse(kind.as_str()), Some(kind));
            assert_eq!(serde_json::to_value(kind).unwrap(), kind.as_str());
        }
    }
}

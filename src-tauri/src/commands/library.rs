#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

use std::path::Path;

use tauri::ipc::{InvokeBody, Request};
use tauri::State;

use rhema_library::{
    Deck, DeckSlide, DeckStore, DeckSummary, LibraryDb, Schedule, ScheduleInput, ScheduleSummary,
    Song, SongInput, SongSummary,
};

/// The user's library, or why it could not be opened. Managed even on
/// failure so every command can report the cause instead of the app
/// failing to start.
pub struct LibraryState(Result<Library, String>);

struct Library {
    db: LibraryDb,
    decks: DeckStore,
}

impl LibraryState {
    /// Open `library.db` in `dir`, with deck images under `dir/decks`.
    pub fn open(dir: &Path) -> Self {
        let path = dir.join("library.db");
        let db = match LibraryDb::open(&path) {
            Ok(db) => db,
            Err(e) => {
                log::error!("could not open library at {}: {e}", path.display());
                return Self(Err(format!("Song library unavailable: {e}")));
            }
        };
        log::info!("Library database loaded from {}", path.display());

        let decks = DeckStore::new(dir.join("decks"));
        match db.sweep_decks(&decks) {
            Ok((0, 0)) => {}
            Ok((unfinished, orphans)) => log::info!(
                "Discarded {unfinished} unfinished deck import(s) and {orphans} orphaned deck folder(s)"
            ),
            // Leftovers only cost disk space; never block startup on them.
            Err(e) => log::warn!("could not sweep deck folder: {e}"),
        }
        Self(Ok(Library { db, decks }))
    }

    pub fn unavailable(reason: String) -> Self {
        log::error!("library unavailable: {reason}");
        Self(Err(format!("Song library unavailable: {reason}")))
    }

    fn db(&self) -> Result<&LibraryDb, String> {
        self.library().map(|l| &l.db)
    }

    fn library(&self) -> Result<&Library, String> {
        self.0.as_ref().map_err(Clone::clone)
    }
}

const DEFAULT_SEARCH_LIMIT: usize = 50;

#[tauri::command]
pub fn list_songs(library: State<'_, LibraryState>) -> Result<Vec<SongSummary>, String> {
    library.db()?.list_songs().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_songs(
    library: State<'_, LibraryState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SongSummary>, String> {
    library
        .db()?
        .search_songs(&query, limit.unwrap_or(DEFAULT_SEARCH_LIMIT))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_song(library: State<'_, LibraryState>, id: String) -> Result<Song, String> {
    library.db()?.get_song(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_song(library: State<'_, LibraryState>, song: SongInput) -> Result<Song, String> {
    library.db()?.save_song(&song).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_song(library: State<'_, LibraryState>, id: String) -> Result<(), String> {
    library.db()?.delete_song(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_schedules(library: State<'_, LibraryState>) -> Result<Vec<ScheduleSummary>, String> {
    library.db()?.list_schedules().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_schedule(library: State<'_, LibraryState>, id: String) -> Result<Schedule, String> {
    library.db()?.get_schedule(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_schedule(
    library: State<'_, LibraryState>,
    schedule: ScheduleInput,
) -> Result<Schedule, String> {
    library.db()?.save_schedule(&schedule).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_schedule(library: State<'_, LibraryState>, id: String) -> Result<(), String> {
    library.db()?.delete_schedule(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_decks(library: State<'_, LibraryState>) -> Result<Vec<DeckSummary>, String> {
    let l = library.library()?;
    l.db.list_decks(&l.decks).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_deck(library: State<'_, LibraryState>, id: String) -> Result<Deck, String> {
    let l = library.library()?;
    l.db.get_deck(&l.decks, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn begin_deck_import(
    library: State<'_, LibraryState>,
    title: String,
    source_name: Option<String>,
) -> Result<String, String> {
    let l = library.library()?;
    l.db
        .begin_deck_import(&l.decks, &title, source_name.as_deref())
        .map_err(|e| e.to_string())
}

/// Header naming the deck a raw `add_deck_slide` body belongs to.
const DECK_ID_HEADER: &str = "x-deck-id";

/// Append one slide to a deck being imported. The body is the raw PNG or
/// JPEG bytes (sent as an `ArrayBuffer`, not JSON — a deck can be tens of
/// megabytes), and the deck id travels in the `x-deck-id` header.
#[tauri::command]
pub fn add_deck_slide(library: State<'_, LibraryState>, request: Request<'_>) -> Result<DeckSlide, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("add_deck_slide expects the image as raw bytes".into());
    };
    let deck_id = request
        .headers()
        .get(DECK_ID_HEADER)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("add_deck_slide needs an {DECK_ID_HEADER} header"))?;
    let l = library.library()?;
    l.db.add_deck_slide(&l.decks, deck_id, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn finish_deck_import(library: State<'_, LibraryState>, deck_id: String) -> Result<Deck, String> {
    let l = library.library()?;
    l.db.finish_deck_import(&l.decks, &deck_id).map_err(|e| e.to_string())
}

/// Delete a deck and its images. Also cancels an import in progress.
#[tauri::command]
pub fn delete_deck(library: State<'_, LibraryState>, id: String) -> Result<(), String> {
    let l = library.library()?;
    l.db.delete_deck(&l.decks, &id).map_err(|e| e.to_string())
}

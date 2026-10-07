#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

use std::path::Path;

use tauri::State;

use rhema_library::{
    LibraryDb, Schedule, ScheduleInput, ScheduleSummary, Song, SongInput, SongSummary,
};

/// The user's library, or why it could not be opened. Managed even on
/// failure so every command can report the cause instead of the app
/// failing to start.
pub struct LibraryState(Result<LibraryDb, String>);

impl LibraryState {
    pub fn open(path: &Path) -> Self {
        let result = LibraryDb::open(path).map_err(|e| {
            log::error!("could not open library at {}: {e}", path.display());
            format!("Song library unavailable: {e}")
        });
        if result.is_ok() {
            log::info!("Library database loaded from {}", path.display());
        }
        Self(result)
    }

    pub fn unavailable(reason: String) -> Self {
        log::error!("library unavailable: {reason}");
        Self(Err(format!("Song library unavailable: {reason}")))
    }

    fn db(&self) -> Result<&LibraryDb, String> {
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

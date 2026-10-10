//! Housekeeping for the per-item folders decks and videos keep on disk.

use std::collections::HashSet;
use std::path::Path;

use crate::error::LibraryError;

/// Remove a folder and everything in it; a folder that is already gone is fine.
pub(crate) fn remove_dir_if_exists(dir: &Path) -> Result<(), LibraryError> {
    match std::fs::remove_dir_all(dir) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}

/// Remove every folder directly under `root` whose name is not in `known`.
/// Returns how many were removed; a missing `root` removes nothing.
pub(crate) fn remove_orphan_dirs(root: &Path, known: &HashSet<String>) -> Result<usize, LibraryError> {
    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(e) => return Err(e.into()),
    };
    let mut orphans = 0;
    for entry in entries {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if !known.contains(&name) {
            std::fs::remove_dir_all(entry.path())?;
            orphans += 1;
        }
    }
    Ok(orphans)
}

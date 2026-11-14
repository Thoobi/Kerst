//! One-click backup and restore of everything the operator made (see the
//! `litdeck_backup` crate).

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use super::library::LibraryState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    app_version: String,
    created_at: u64,
    includes_media: bool,
}

impl From<litdeck_backup::Manifest> for BackupInfo {
    fn from(m: litdeck_backup::Manifest) -> Self {
        Self { app_version: m.app_version, created_at: m.created_at, includes_media: m.includes_media }
    }
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

/// Back up settings, themes, outputs, scenes, cameras, names and the library
/// (with its videos and slide images when `include_media`) to `path`.
#[tauri::command]
pub async fn create_backup(
    app: AppHandle,
    library: State<'_, LibraryState>,
    path: String,
    include_media: bool,
) -> Result<BackupInfo, String> {
    let dir = data_dir(&app)?;
    let snapshot = dir.join("backup-snapshot.db");
    std::fs::remove_file(&snapshot).ok();
    let has_library = match library.snapshot_to(&snapshot) {
        Ok(()) => true,
        Err(e) => {
            log::warn!("backup: library not included: {e}");
            false
        }
    };
    let version = app.package_info().version.to_string();
    let created_at = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX));
    let out = PathBuf::from(path);
    let result = tauri::async_runtime::spawn_blocking(move || {
        let manifest = litdeck_backup::write_backup(
            &dir,
            has_library.then_some(snapshot.as_path()),
            &out,
            include_media,
            &version,
            created_at,
        );
        std::fs::remove_file(&snapshot).ok();
        manifest
    })
    .await
    .map_err(|e| e.to_string())?;
    let manifest = result.map_err(|e| e.to_string())?;
    log::info!("Backup written (media: {})", manifest.includes_media);
    Ok(manifest.into())
}

/// What's in a backup, before restoring it.
#[tauri::command]
pub fn read_backup(path: String) -> Result<BackupInfo, String> {
    litdeck_backup::read_manifest(&PathBuf::from(path)).map(Into::into).map_err(|e| e.to_string())
}

/// Get `path` ready to restore at the next start; the frontend restarts the
/// app straight after.
#[tauri::command]
pub async fn stage_backup_restore(app: AppHandle, path: String) -> Result<BackupInfo, String> {
    let dir = data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || litdeck_backup::stage_restore(&PathBuf::from(path), &dir))
        .await
        .map_err(|e| e.to_string())?
        .map(Into::into)
        .map_err(|e| e.to_string())
}

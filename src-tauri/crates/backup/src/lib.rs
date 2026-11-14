//! One-file backups of everything the operator made: settings, themes,
//! outputs, scenes, cameras and names (the app's JSON stores), the library
//! (songs, services, texts, slide decks and video entries) and, if asked,
//! the slide images and videos themselves.
//!
//! A backup is a zip with a `manifest.json`. Restoring never swaps files
//! under the running app (its stores would write their old contents straight
//! back): [`stage_restore`] unpacks into `restore-pending/` in the data
//! folder, the app restarts, and [`apply_pending_restore`] moves the files
//! into place at startup, before anything opens them.

use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use zip::write::SimpleFileOptions;

/// The app's own JSON stores, at the top of the data folder.
pub const STORE_FILES: &[&str] = &["settings.json", "broadcast-themes.json", "bible.json"];
/// The library database's name in the data folder and in a backup.
pub const LIBRARY_DB: &str = "library.db";
/// Folders of library media, included when asked.
pub const MEDIA_DIRS: &[&str] = &["decks", "videos"];
/// Where a restore waits for the next start.
pub const PENDING_DIR: &str = "restore-pending";

const MANIFEST: &str = "manifest.json";
const FORMAT: &str = "litdeck-backup";
const FORMAT_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format: String,
    pub format_version: u32,
    /// The app version that made it.
    pub app_version: String,
    /// Milliseconds since the Unix epoch.
    pub created_at: u64,
    pub includes_media: bool,
}

#[derive(Debug)]
pub enum BackupError {
    Io(io::Error),
    Zip(zip::result::ZipError),
    /// Not a Litdeck backup, or one from a newer Litdeck.
    NotABackup(String),
}

impl std::fmt::Display for BackupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "{e}"),
            Self::Zip(e) => write!(f, "{e}"),
            Self::NotABackup(why) => write!(f, "{why}"),
        }
    }
}

impl std::error::Error for BackupError {}

impl From<io::Error> for BackupError {
    fn from(e: io::Error) -> Self {
        Self::Io(e)
    }
}

impl From<zip::result::ZipError> for BackupError {
    fn from(e: zip::result::ZipError) -> Self {
        Self::Zip(e)
    }
}

/// Write a backup of `data_dir` to `out`. `library_snapshot` is a
/// consistent copy of the library database made for the occasion (see
/// `LibraryDb::snapshot_to`); missing stores are skipped.
pub fn write_backup(
    data_dir: &Path,
    library_snapshot: Option<&Path>,
    out: &Path,
    include_media: bool,
    app_version: &str,
    created_at: u64,
) -> Result<Manifest, BackupError> {
    // Written beside the target and moved into place, so a failed backup
    // never leaves a broken file under the chosen name.
    let partial = out.with_extension("partial");
    let result = (|| {
        let mut zip = zip::ZipWriter::new(File::create(&partial)?);
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        // Videos and images are compressed already.
        let stored = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);

        let manifest = Manifest {
            format: FORMAT.into(),
            format_version: FORMAT_VERSION,
            app_version: app_version.into(),
            created_at,
            includes_media: include_media,
        };
        zip.start_file(MANIFEST, options)?;
        zip.write_all(&serde_json::to_vec_pretty(&manifest).map_err(io::Error::other)?)?;

        for name in STORE_FILES {
            let path = data_dir.join(name);
            if path.is_file() {
                zip.start_file(*name, options)?;
                io::copy(&mut File::open(&path)?, &mut zip)?;
            }
        }
        if let Some(snapshot) = library_snapshot {
            zip.start_file(LIBRARY_DB, options)?;
            io::copy(&mut File::open(snapshot)?, &mut zip)?;
        }
        if include_media {
            for dir in MEDIA_DIRS {
                add_tree(&mut zip, data_dir, &data_dir.join(dir), stored)?;
            }
        }
        zip.finish()?;
        Ok(manifest)
    })();
    match result {
        Ok(manifest) => {
            fs::rename(&partial, out)?;
            Ok(manifest)
        }
        Err(e) => {
            fs::remove_file(&partial).ok();
            Err(e)
        }
    }
}

fn add_tree(zip: &mut zip::ZipWriter<File>, root: &Path, dir: &Path, options: SimpleFileOptions) -> Result<(), BackupError> {
    if !dir.is_dir() {
        return Ok(());
    }
    let mut entries: Vec<_> = fs::read_dir(dir)?.flatten().collect();
    entries.sort_by_key(fs::DirEntry::file_name);
    for entry in entries {
        let path = entry.path();
        if path.is_dir() {
            add_tree(zip, root, &path, options)?;
        } else if path.is_file() {
            let name = path
                .strip_prefix(root)
                .map_err(io::Error::other)?
                .components()
                .map(|c| c.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/");
            zip.start_file(name, options)?;
            io::copy(&mut File::open(&path)?, zip)?;
        }
    }
    Ok(())
}

/// Read a backup's manifest without unpacking it.
pub fn read_manifest(backup: &Path) -> Result<Manifest, BackupError> {
    let mut archive = zip::ZipArchive::new(File::open(backup)?)
        .map_err(|_| BackupError::NotABackup("That file isn't a Litdeck backup.".into()))?;
    let mut text = String::new();
    archive
        .by_name(MANIFEST)
        .map_err(|_| BackupError::NotABackup("That file isn't a Litdeck backup.".into()))?
        .read_to_string(&mut text)?;
    let manifest: Manifest =
        serde_json::from_str(&text).map_err(|_| BackupError::NotABackup("That backup's details can't be read.".into()))?;
    if manifest.format != FORMAT {
        return Err(BackupError::NotABackup("That file isn't a Litdeck backup.".into()));
    }
    if manifest.format_version > FORMAT_VERSION {
        return Err(BackupError::NotABackup(format!(
            "That backup was made by a newer Litdeck ({}). Update Litdeck, then restore it.",
            manifest.app_version
        )));
    }
    Ok(manifest)
}

/// Unpack `backup` into `data_dir/restore-pending`, for
/// [`apply_pending_restore`] at the next start. Only the files a backup can
/// hold are taken, and none can land outside that folder.
pub fn stage_restore(backup: &Path, data_dir: &Path) -> Result<Manifest, BackupError> {
    let manifest = read_manifest(backup)?;
    let pending = data_dir.join(PENDING_DIR);
    if pending.exists() {
        fs::remove_dir_all(&pending)?;
    }
    fs::create_dir_all(&pending)?;
    let mut archive = zip::ZipArchive::new(File::open(backup)?)?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let Some(relative) = entry.enclosed_name() else { continue };
        if !allowed(&relative) || entry.is_dir() {
            continue;
        }
        let target = pending.join(&relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        io::copy(&mut entry, &mut File::create(&target)?)?;
    }
    Ok(manifest)
}

/// Whether a path in a backup is one this restores: a store, the library,
/// or a file under a media folder.
fn allowed(path: &Path) -> bool {
    let parts: Vec<_> = path.components().collect();
    if parts.iter().any(|c| !matches!(c, Component::Normal(_))) {
        return false;
    }
    let first = parts.first().map(|c| c.as_os_str().to_string_lossy().into_owned()).unwrap_or_default();
    if parts.len() == 1 {
        return STORE_FILES.contains(&first.as_str()) || first == LIBRARY_DB;
    }
    MEDIA_DIRS.contains(&first.as_str())
}

/// At startup, before anything opens the data folder: move a staged restore
/// into place. Returns whether there was one. What the backup holds
/// replaces what's there; media folders are replaced only when the backup
/// has them.
pub fn apply_pending_restore(data_dir: &Path) -> Result<bool, BackupError> {
    let pending = data_dir.join(PENDING_DIR);
    if !pending.is_dir() {
        return Ok(false);
    }
    for name in STORE_FILES {
        let staged = pending.join(name);
        if staged.is_file() {
            replace_file(&staged, &data_dir.join(name))?;
        }
    }
    let staged_db = pending.join(LIBRARY_DB);
    if staged_db.is_file() {
        // The old database's write-ahead log belongs to it, not to the restored one.
        for leftover in ["library.db-wal", "library.db-shm"] {
            let path = data_dir.join(leftover);
            if path.exists() {
                fs::remove_file(path)?;
            }
        }
        replace_file(&staged_db, &data_dir.join(LIBRARY_DB))?;
    }
    for dir in MEDIA_DIRS {
        let staged = pending.join(dir);
        if staged.is_dir() {
            let target = data_dir.join(dir);
            if target.exists() {
                fs::remove_dir_all(&target)?;
            }
            fs::rename(&staged, &target)?;
        }
    }
    fs::remove_dir_all(&pending)?;
    Ok(true)
}

fn replace_file(from: &Path, to: &Path) -> io::Result<()> {
    if to.exists() {
        fs::remove_file(to)?;
    }
    fs::rename(from, to)
}

/// A suggested file name for a backup made on `date` (YYYY-MM-DD).
pub fn suggested_name(date: &str) -> PathBuf {
    PathBuf::from(format!("Litdeck backup {date}.zip"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "litdeck-backup-{label}-{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn data_folder() -> PathBuf {
        let dir = temp("data");
        fs::write(dir.join("settings.json"), r#"{"speakers":[{"name":"Jane"}]}"#).unwrap();
        fs::write(dir.join("broadcast-themes.json"), r#"{"scenes":[]}"#).unwrap();
        fs::create_dir_all(dir.join("videos/v1")).unwrap();
        fs::write(dir.join("videos/v1/clip.mp4"), b"video").unwrap();
        fs::create_dir_all(dir.join("models")).unwrap();
        fs::write(dir.join("models/big.bin"), b"not backed up").unwrap();
        dir
    }

    #[test]
    fn backs_up_and_restores_settings_library_and_media() {
        let data = data_folder();
        let snapshot = data.join("snapshot.db");
        fs::write(&snapshot, b"sqlite").unwrap();
        let out = temp("out").join("backup.zip");
        let manifest = write_backup(&data, Some(&snapshot), &out, true, "0.4.12", 42).unwrap();
        assert!(manifest.includes_media);
        assert_eq!(read_manifest(&out).unwrap(), manifest);

        // A different machine, or the same one after things went wrong.
        let fresh = temp("fresh");
        fs::write(fresh.join("settings.json"), "{}").unwrap();
        fs::write(fresh.join("library.db-wal"), b"stale").unwrap();
        stage_restore(&out, &fresh).unwrap();
        // Nothing changes until the next start.
        assert_eq!(fs::read_to_string(fresh.join("settings.json")).unwrap(), "{}");

        assert!(apply_pending_restore(&fresh).unwrap());
        assert!(fs::read_to_string(fresh.join("settings.json")).unwrap().contains("Jane"));
        assert_eq!(fs::read(fresh.join("library.db")).unwrap(), b"sqlite");
        assert!(!fresh.join("library.db-wal").exists());
        assert_eq!(fs::read(fresh.join("videos/v1/clip.mp4")).unwrap(), b"video");
        assert!(!fresh.join("models").exists(), "models are never in a backup");
        assert!(!fresh.join(PENDING_DIR).exists());
        // Only once.
        assert!(!apply_pending_restore(&fresh).unwrap());
    }

    #[test]
    fn leaves_media_out_unless_asked_and_keeps_the_media_there() {
        let data = data_folder();
        let out = temp("out").join("backup.zip");
        write_backup(&data, None, &out, false, "0.4.12", 1).unwrap();
        let fresh = temp("fresh");
        fs::create_dir_all(fresh.join("videos/kept")).unwrap();
        stage_restore(&out, &fresh).unwrap();
        apply_pending_restore(&fresh).unwrap();
        assert!(fresh.join("videos/kept").exists(), "no media in the backup: the machine's videos stay");
    }

    #[test]
    fn refuses_a_file_that_isnt_a_backup() {
        let dir = temp("bad");
        let file = dir.join("photo.zip");
        fs::write(&file, b"not a zip").unwrap();
        assert!(matches!(read_manifest(&file), Err(BackupError::NotABackup(_))));
    }

    #[test]
    fn only_restores_files_a_backup_can_hold() {
        assert!(allowed(Path::new("settings.json")));
        assert!(allowed(Path::new("library.db")));
        assert!(allowed(Path::new("videos/v1/clip.mp4")));
        assert!(!allowed(Path::new("models/big.bin")));
        assert!(!allowed(Path::new("../outside.txt")));
        assert!(!allowed(Path::new("settings.json/../../x")));
    }
}

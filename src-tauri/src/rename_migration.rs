//! The app was called Rhema, then Light, and is now Litdeck. Each rename
//! changed the bundle identifier and with it the app data folder
//! (`…/com.openbezal.rhema`, `…/com.openbezal.light` → `…/space.litdeck.app`).
//! Without help, an upgraded install would start with an empty library. On
//! first launch this moves the user's data across: songs, decks and videos
//! (`library.db` and its folders), themes and settings (the store files).
//!
//! The newest former folder goes first, and each item is moved only if
//! Litdeck doesn't have it yet, so the most recent copy of anything wins and
//! anything Litdeck already created (its new log folder, say) is kept. A note
//! left in each old folder marks it done, so this runs once per folder.

use std::fs;
use std::io;
use std::path::Path;

/// The identifiers the app shipped under before, newest first.
const OLD_IDENTIFIERS: [&str; 2] = ["com.openbezal.light", "com.openbezal.rhema"];
/// Left in an old folder once its contents have moved.
const MOVED_NOTE: &str = "MOVED_TO_LITDECK.txt";
/// The note the Rhema → Light move left behind; that folder's data then
/// lives in Light's folder, which this adopts in turn.
const EARLIER_NOTES: [&str; 1] = ["MOVED_TO_LIGHT.txt"];

/// Move the data of every former install into `app_data_dir` if it hasn't
/// been already. Returns how many items were moved.
pub fn adopt_former_data(app_data_dir: &Path) -> io::Result<usize> {
    let Some(parent) = app_data_dir.parent() else {
        return Ok(0);
    };
    let mut moved = 0;
    for identifier in OLD_IDENTIFIERS {
        moved += adopt_folder(&parent.join(identifier), app_data_dir)?;
    }
    Ok(moved)
}

fn adopt_folder(old: &Path, app_data_dir: &Path) -> io::Result<usize> {
    if old == app_data_dir || !old.is_dir() || old.join(MOVED_NOTE).exists() {
        return Ok(0);
    }
    let is_note = |name: &std::ffi::OsStr| {
        name == MOVED_NOTE || EARLIER_NOTES.iter().any(|note| name == *note)
    };

    fs::create_dir_all(app_data_dir)?;
    let mut moved = 0;
    for entry in fs::read_dir(old)? {
        let entry = entry?;
        if is_note(&entry.file_name()) {
            continue;
        }
        let dest = app_data_dir.join(entry.file_name());
        if dest.exists() {
            continue;
        }
        move_item(&entry.path(), &dest)?;
        moved += 1;
    }
    fs::write(
        old.join(MOVED_NOTE),
        format!(
            "This app is now called Litdeck. Your songs, decks, videos, themes and settings were moved to:\n{}\n",
            app_data_dir.display()
        ),
    )?;
    Ok(moved)
}

/// Rename, or copy then delete when the two folders are on different drives.
fn move_item(from: &Path, to: &Path) -> io::Result<()> {
    if fs::rename(from, to).is_ok() {
        return Ok(());
    }
    copy_item(from, to)?;
    if from.is_dir() {
        fs::remove_dir_all(from)
    } else {
        fs::remove_file(from)
    }
}

fn copy_item(from: &Path, to: &Path) -> io::Result<()> {
    if from.is_dir() {
        fs::create_dir_all(to)?;
        for entry in fs::read_dir(from)? {
            let entry = entry?;
            copy_item(&entry.path(), &to.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(from, to).map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIGHT: &str = "com.openbezal.light";
    const RHEMA: &str = "com.openbezal.rhema";

    struct Dirs {
        root: std::path::PathBuf,
    }

    impl Dirs {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("litdeck-rename-test-{}", uuid::Uuid::new_v4()));
            Self { root }
        }

        fn write(&self, folder: &str, file: &str, contents: &[u8]) {
            let path = self.root.join(folder).join(file);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, contents).unwrap();
        }

        fn litdeck(&self) -> std::path::PathBuf {
            self.root.join("space.litdeck.app")
        }

        fn folder(&self, name: &str) -> std::path::PathBuf {
            self.root.join(name)
        }
    }

    impl Drop for Dirs {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn moves_the_library_and_settings_but_keeps_what_litdeck_already_has() {
        let dirs = Dirs::new();
        dirs.write(LIGHT, "library.db", b"songs");
        dirs.write(LIGHT, "settings.json", b"{}");
        dirs.write(LIGHT, "videos/v1/video.mp4", b"clip");
        dirs.write(LIGHT, "logs/light.log", b"old log");
        // Litdeck's logger has already started its own log folder.
        fs::create_dir_all(dirs.litdeck().join("logs")).unwrap();

        assert_eq!(adopt_former_data(&dirs.litdeck()).unwrap(), 3);
        assert_eq!(fs::read(dirs.litdeck().join("library.db")).unwrap(), b"songs");
        assert_eq!(fs::read(dirs.litdeck().join("videos/v1/video.mp4")).unwrap(), b"clip");
        assert!(dirs.litdeck().join("settings.json").is_file());
        assert!(!dirs.litdeck().join("logs/light.log").exists());
        assert!(!dirs.folder(LIGHT).join("library.db").exists());
        assert!(dirs.folder(LIGHT).join(MOVED_NOTE).is_file());
    }

    #[test]
    fn prefers_the_newer_light_data_over_rhema() {
        let dirs = Dirs::new();
        dirs.write(LIGHT, "library.db", b"from light");
        dirs.write(RHEMA, "library.db", b"from rhema");
        dirs.write(RHEMA, "settings.json", b"rhema settings");

        assert_eq!(adopt_former_data(&dirs.litdeck()).unwrap(), 2);
        assert_eq!(fs::read(dirs.litdeck().join("library.db")).unwrap(), b"from light");
        assert_eq!(fs::read(dirs.litdeck().join("settings.json")).unwrap(), b"rhema settings");
    }

    #[test]
    fn leaves_the_earlier_move_note_behind() {
        let dirs = Dirs::new();
        dirs.write(RHEMA, "MOVED_TO_LIGHT.txt", b"Rhema is now called Light.");
        dirs.write(RHEMA, "logs/rhema.log", b"old log");

        assert_eq!(adopt_former_data(&dirs.litdeck()).unwrap(), 1);
        assert!(!dirs.litdeck().join("MOVED_TO_LIGHT.txt").exists());
        assert!(dirs.folder(RHEMA).join("MOVED_TO_LIGHT.txt").is_file());
    }

    #[test]
    fn runs_once() {
        let dirs = Dirs::new();
        dirs.write(LIGHT, "settings.json", b"{}");
        adopt_former_data(&dirs.litdeck()).unwrap();
        fs::remove_file(dirs.litdeck().join("settings.json")).unwrap();
        dirs.write(LIGHT, "settings.json", b"stale");
        assert_eq!(adopt_former_data(&dirs.litdeck()).unwrap(), 0);
        assert!(!dirs.litdeck().join("settings.json").exists());
    }

    #[test]
    fn does_nothing_without_an_old_folder() {
        let dirs = Dirs::new();
        assert_eq!(adopt_former_data(&dirs.litdeck()).unwrap(), 0);
        assert!(!dirs.litdeck().exists());
    }

    #[test]
    fn copies_folders_when_it_has_to() {
        let dirs = Dirs::new();
        dirs.write(LIGHT, "videos/v1/video.mp4", b"clip");
        let dest = dirs.root.join("copy");
        copy_item(&dirs.folder(LIGHT).join("videos"), &dest).unwrap();
        assert_eq!(fs::read(dest.join("v1/video.mp4")).unwrap(), b"clip");
    }
}

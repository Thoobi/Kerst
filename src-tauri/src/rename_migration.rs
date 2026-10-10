//! Rhema was renamed Light, which changed the bundle identifier and with it
//! the app data folder (`…/com.openbezal.rhema` → `…/com.openbezal.light`).
//! Without help, an upgraded install would start with an empty library. On
//! first launch this moves the user's data across: songs, decks and videos
//! (`library.db` and its folders), themes and settings (the store files).
//!
//! Each item is moved only if Light doesn't have it yet, so anything Light
//! already created (its new log folder, say) wins. A note left in the old
//! folder marks it done, so this runs once.

use std::fs;
use std::io;
use std::path::Path;

/// The identifier Light shipped under as Rhema.
const OLD_IDENTIFIER: &str = "com.openbezal.rhema";
/// Left in the old folder once its contents have moved.
const MOVED_NOTE: &str = "MOVED_TO_LIGHT.txt";

/// Move Rhema's data into `app_data_dir` if it hasn't been already.
/// Returns how many items were moved.
pub fn adopt_rhema_data(app_data_dir: &Path) -> io::Result<usize> {
    let Some(parent) = app_data_dir.parent() else {
        return Ok(0);
    };
    let old = parent.join(OLD_IDENTIFIER);
    if old == app_data_dir || !old.is_dir() || old.join(MOVED_NOTE).exists() {
        return Ok(0);
    }

    fs::create_dir_all(app_data_dir)?;
    let mut moved = 0;
    for entry in fs::read_dir(&old)? {
        let entry = entry?;
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
            "Rhema is now called Light. Your songs, decks, videos, themes and settings were moved to:\n{}\n",
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

    struct Dirs {
        root: std::path::PathBuf,
    }

    impl Dirs {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("light-rename-test-{}", uuid::Uuid::new_v4()));
            fs::create_dir_all(root.join(OLD_IDENTIFIER).join("videos/v1")).unwrap();
            fs::write(root.join(OLD_IDENTIFIER).join("library.db"), b"songs").unwrap();
            fs::write(root.join(OLD_IDENTIFIER).join("settings.json"), b"{}").unwrap();
            fs::write(root.join(OLD_IDENTIFIER).join("videos/v1/video.mp4"), b"clip").unwrap();
            fs::create_dir_all(root.join(OLD_IDENTIFIER).join("logs")).unwrap();
            fs::write(root.join(OLD_IDENTIFIER).join("logs/rhema.log"), b"old log").unwrap();
            Self { root }
        }

        fn light(&self) -> std::path::PathBuf {
            self.root.join("com.openbezal.light")
        }

        fn old(&self) -> std::path::PathBuf {
            self.root.join(OLD_IDENTIFIER)
        }
    }

    impl Drop for Dirs {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn moves_the_library_and_settings_but_keeps_what_light_already_has() {
        let dirs = Dirs::new();
        // Light's logger has already started its own log folder.
        fs::create_dir_all(dirs.light().join("logs")).unwrap();

        assert_eq!(adopt_rhema_data(&dirs.light()).unwrap(), 3);
        assert_eq!(fs::read(dirs.light().join("library.db")).unwrap(), b"songs");
        assert_eq!(fs::read(dirs.light().join("videos/v1/video.mp4")).unwrap(), b"clip");
        assert!(dirs.light().join("settings.json").is_file());
        assert!(!dirs.light().join("logs/rhema.log").exists());
        assert!(!dirs.old().join("library.db").exists());
        assert!(dirs.old().join(MOVED_NOTE).is_file());
    }

    #[test]
    fn runs_once() {
        let dirs = Dirs::new();
        adopt_rhema_data(&dirs.light()).unwrap();
        fs::remove_file(dirs.light().join("settings.json")).unwrap();
        fs::write(dirs.old().join("settings.json"), b"stale").unwrap();
        assert_eq!(adopt_rhema_data(&dirs.light()).unwrap(), 0);
        assert!(!dirs.light().join("settings.json").exists());
    }

    #[test]
    fn does_nothing_without_an_old_folder() {
        let root = std::env::temp_dir().join(format!("light-rename-test-{}", uuid::Uuid::new_v4()));
        assert_eq!(adopt_rhema_data(&root.join("com.openbezal.light")).unwrap(), 0);
        assert!(!root.exists());
    }

    #[test]
    fn copies_folders_when_it_has_to() {
        let dirs = Dirs::new();
        let dest = dirs.root.join("copy");
        copy_item(&dirs.old().join("videos"), &dest).unwrap();
        assert_eq!(fs::read(dest.join("v1/video.mp4")).unwrap(), b"clip");
    }
}

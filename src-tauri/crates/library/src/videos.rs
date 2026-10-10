//! Imported videos.
//!
//! A video is copied into the library, one folder per video under
//! [`VideoStore`]'s root, so it still plays when the original was on a USB
//! stick that has gone home with its owner. The webview plays the copy
//! directly; nothing here decodes video.
//!
//! Importing is two steps because only the frontend can tell whether this
//! computer can actually play the file: [`LibraryDb::begin_video_import`]
//! copies it in, the frontend loads the copy to read its length and size
//! (and grabs a poster frame for [`LibraryDb::set_video_poster`]), then
//! [`LibraryDb::finish_video_import`] makes it visible. A file that will not
//! play is deleted instead, and [`LibraryDb::sweep_videos`] discards imports
//! that never finished.

use std::collections::HashSet;
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use rusqlite::{params, OptionalExtension, Row};

use crate::db::{clean_opt, new_id, now_millis, LibraryDb};
use crate::decks::sniff_image;
use crate::error::LibraryError;
use crate::folders::{remove_dir_if_exists, remove_orphan_dirs};
use crate::models::{Video, VideoProbe};

const IMPORTING: &str = "importing";
const READY: &str = "ready";

/// Containers a webview may be able to play. Whether the codec inside is
/// playable is only known once the frontend tries.
pub const VIDEO_EXTENSIONS: &[&str] = &["mp4", "m4v", "mov", "webm", "ogv", "mkv"];

/// Where videos are kept: `<root>/<video id>/video.<ext>`, with its poster
/// beside it.
#[derive(Debug, Clone)]
pub struct VideoStore {
    root: PathBuf,
}

impl VideoStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn video_dir(&self, id: &str) -> PathBuf {
        self.root.join(id)
    }

    fn file_path(&self, id: &str, file: &str) -> String {
        self.video_dir(id).join(file).to_string_lossy().into_owned()
    }
}

/// The lower-cased extension of `path` if it is a video container we accept.
fn video_extension(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    VIDEO_EXTENSIONS.contains(&ext.as_str()).then_some(ext)
}

/// Copy `source` to `dest` in chunks, reporting `(copied, total)` bytes as
/// it goes: a sermon illustration can be gigabytes.
fn copy_with_progress(
    source: &Path,
    dest: &Path,
    total: u64,
    on_progress: &mut impl FnMut(u64, u64),
) -> Result<(), LibraryError> {
    let mut reader = File::open(source)?;
    let mut writer = File::create(dest)?;
    let mut buffer = vec![0; 1 << 20];
    let mut copied = 0;
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        writer.write_all(&buffer[..read])?;
        copied += read as u64;
        on_progress(copied, total);
    }
    writer.sync_all()?;
    Ok(())
}

const VIDEO_COLUMNS: &str =
    "id, title, source_name, file, poster, duration_ms, width, height, looping, created_at, updated_at";

fn video_from_row(store: &VideoStore, r: &Row<'_>) -> rusqlite::Result<Video> {
    let id: String = r.get(0)?;
    let file: String = r.get(3)?;
    let poster: Option<String> = r.get(4)?;
    Ok(Video {
        path: store.file_path(&id, &file),
        poster_path: poster.map(|p| store.file_path(&id, &p)),
        title: r.get(1)?,
        source_name: r.get(2)?,
        duration_ms: r.get(5)?,
        width: r.get(6)?,
        height: r.get(7)?,
        looping: r.get(8)?,
        created_at: r.get(9)?,
        updated_at: r.get(10)?,
        id,
    })
}

impl LibraryDb {
    /// Copy the video at `source` into the library and start its import,
    /// titled after the file. It stays out of [`Self::list_videos`] until
    /// [`Self::finish_video_import`]. The database is not locked while the
    /// file copies.
    pub fn begin_video_import(
        &self,
        store: &VideoStore,
        source: &Path,
        mut on_progress: impl FnMut(u64, u64),
    ) -> Result<Video, LibraryError> {
        let ext = video_extension(source).ok_or_else(|| {
            LibraryError::Invalid(format!(
                "not a video file (expected {})",
                VIDEO_EXTENSIONS.join(", ")
            ))
        })?;
        let total = std::fs::metadata(source)?.len();
        let source_name = source.file_name().map(|n| n.to_string_lossy().into_owned());
        let title = source
            .file_stem()
            .map(|s| s.to_string_lossy().trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Untitled video".into());

        let id = new_id();
        let file = format!("video.{ext}");
        std::fs::create_dir_all(store.video_dir(&id))?;
        let now = now_millis();
        self.conn().execute(
            "INSERT INTO videos (id, title, source_name, file, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![id, title, source_name, file, IMPORTING, now],
        )?;

        let dest = store.video_dir(&id).join(&file);
        if let Err(e) = copy_with_progress(source, &dest, total, &mut on_progress) {
            // Don't leave half a copy behind; the sweep would get it, but not
            // until the next start.
            let _ = self.delete_video(store, &id);
            return Err(e);
        }
        self.load_video(store, &id, IMPORTING)
    }

    /// Store a poster frame (PNG or JPEG) for a video, importing or not,
    /// replacing any earlier one.
    pub fn set_video_poster(&self, store: &VideoStore, id: &str, bytes: &[u8]) -> Result<Video, LibraryError> {
        let (format, _, _) = sniff_image(bytes)?;
        let old: Option<String> = self
            .conn()
            .query_row("SELECT poster FROM videos WHERE id = ?1", [id], |r| r.get(0))
            .optional()?
            .ok_or_else(|| LibraryError::NotFound(format!("video {id}")))?;

        // A fresh name each time so a webview that cached the old poster
        // does not keep showing it.
        let poster = format!("poster-{}.{}", new_id(), format.extension());
        let path = store.video_dir(id).join(&poster);
        std::fs::write(&path, bytes)?;
        let updated = self.conn().execute(
            "UPDATE videos SET poster = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, poster, now_millis()],
        );
        if let Err(e) = updated {
            let _ = std::fs::remove_file(&path);
            return Err(e.into());
        }
        if let Some(old) = old {
            let _ = std::fs::remove_file(store.video_dir(id).join(old));
        }
        self.load_any_video(store, id)
    }

    /// Record what the frontend learned by loading the video, and make it
    /// visible.
    pub fn finish_video_import(&self, store: &VideoStore, id: &str, probe: VideoProbe) -> Result<Video, LibraryError> {
        if probe.duration_ms <= 0 || probe.width == 0 || probe.height == 0 {
            return Err(LibraryError::Invalid("the video has no picture or no length".into()));
        }
        self.load_video(store, id, IMPORTING)?;
        self.conn().execute(
            "UPDATE videos SET duration_ms = ?2, width = ?3, height = ?4, status = ?5, updated_at = ?6
             WHERE id = ?1",
            params![id, probe.duration_ms, probe.width, probe.height, READY, now_millis()],
        )?;
        self.get_video(store, id)
    }

    /// A finished video.
    pub fn get_video(&self, store: &VideoStore, id: &str) -> Result<Video, LibraryError> {
        self.load_video(store, id, READY)
    }

    /// Finished videos, most recently imported first.
    pub fn list_videos(&self, store: &VideoStore) -> Result<Vec<Video>, LibraryError> {
        let conn = self.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {VIDEO_COLUMNS} FROM videos WHERE status = ?1 ORDER BY created_at DESC, rowid DESC"
        ))?;
        let rows = stmt.query_map([READY], |r| video_from_row(store, r))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Rename a video and/or change whether it loops.
    pub fn update_video(
        &self,
        store: &VideoStore,
        id: &str,
        title: Option<&str>,
        looping: Option<bool>,
    ) -> Result<Video, LibraryError> {
        let title = match title {
            Some(t) => Some(clean_opt(Some(t)).ok_or_else(|| LibraryError::Invalid("a video needs a title".into()))?),
            None => None,
        };
        let changed = self.conn().execute(
            "UPDATE videos SET title = COALESCE(?2, title), looping = COALESCE(?3, looping), updated_at = ?4
             WHERE id = ?1 AND status = ?5",
            params![id, title, looping, now_millis(), READY],
        )?;
        if changed == 0 {
            return Err(LibraryError::NotFound(format!("video {id}")));
        }
        self.get_video(store, id)
    }

    /// Delete a video, finished or not, and its files. Also how a failed
    /// import is cleaned up.
    pub fn delete_video(&self, store: &VideoStore, id: &str) -> Result<(), LibraryError> {
        let removed = self.conn().execute("DELETE FROM videos WHERE id = ?1", [id])?;
        if removed == 0 {
            return Err(LibraryError::NotFound(format!("video {id}")));
        }
        remove_dir_if_exists(&store.video_dir(id))
    }

    /// Run at startup: drop imports that never finished and any video folder
    /// no row points at. Returns how many of each were removed.
    pub fn sweep_videos(&self, store: &VideoStore) -> Result<(usize, usize), LibraryError> {
        let unfinished: Vec<String> = {
            let conn = self.conn();
            let mut stmt = conn.prepare("SELECT id FROM videos WHERE status != ?1")?;
            let ids = stmt.query_map([READY], |r| r.get(0))?.collect::<Result<_, _>>()?;
            ids
        };
        for id in &unfinished {
            self.delete_video(store, id)?;
        }

        let known: HashSet<String> = {
            let conn = self.conn();
            let mut stmt = conn.prepare("SELECT id FROM videos")?;
            let ids = stmt.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
            ids
        };
        let orphans = remove_orphan_dirs(store.root(), &known)?;
        Ok((unfinished.len(), orphans))
    }

    fn load_video(&self, store: &VideoStore, id: &str, status: &str) -> Result<Video, LibraryError> {
        self.conn()
            .query_row(
                &format!("SELECT {VIDEO_COLUMNS} FROM videos WHERE id = ?1 AND status = ?2"),
                params![id, status],
                |r| video_from_row(store, r),
            )
            .optional()?
            .ok_or_else(|| LibraryError::NotFound(format!("video {id}")))
    }

    fn load_any_video(&self, store: &VideoStore, id: &str) -> Result<Video, LibraryError> {
        self.conn()
            .query_row(
                &format!("SELECT {VIDEO_COLUMNS} FROM videos WHERE id = ?1"),
                [id],
                |r| video_from_row(store, r),
            )
            .optional()?
            .ok_or_else(|| LibraryError::NotFound(format!("video {id}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROBE: VideoProbe = VideoProbe { duration_ms: 90_000, width: 1920, height: 1080 };

    /// A minimal PNG header, enough for sniffing.
    fn png() -> Vec<u8> {
        let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
        bytes.extend_from_slice(&13u32.to_be_bytes());
        bytes.extend_from_slice(b"IHDR");
        bytes.extend_from_slice(&64u32.to_be_bytes());
        bytes.extend_from_slice(&36u32.to_be_bytes());
        bytes.extend_from_slice(&[8, 6, 0, 0, 0, 0, 0, 0, 0]);
        bytes
    }

    struct Fixture {
        db: LibraryDb,
        store: VideoStore,
        /// Where the "originals" being imported live.
        source_dir: PathBuf,
    }

    impl Fixture {
        fn new() -> Self {
            let base = std::env::temp_dir().join(format!("litdeck-videos-test-{}", new_id()));
            let source_dir = base.join("usb-stick");
            std::fs::create_dir_all(&source_dir).unwrap();
            Self {
                db: LibraryDb::open_in_memory().unwrap(),
                store: VideoStore::new(base.join("videos")),
                source_dir,
            }
        }

        fn original(&self, name: &str, bytes: &[u8]) -> PathBuf {
            let path = self.source_dir.join(name);
            std::fs::write(&path, bytes).unwrap();
            path
        }

        fn import(&self, name: &str) -> Video {
            let source = self.original(name, b"pretend this is H.264");
            let video = self.db.begin_video_import(&self.store, &source, |_, _| {}).unwrap();
            self.db.finish_video_import(&self.store, &video.id, PROBE).unwrap()
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(self.store.root().parent().unwrap());
        }
    }

    #[test]
    fn copies_the_file_in_and_survives_the_original_going_away() {
        let fx = Fixture::new();
        let source = fx.original("Easter Countdown.MP4", b"0123456789");
        let mut progress = Vec::new();
        let begun = fx
            .db
            .begin_video_import(&fx.store, &source, |done, total| progress.push((done, total)))
            .unwrap();
        assert_eq!(progress.last(), Some(&(10, 10)));
        assert_eq!(begun.title, "Easter Countdown");
        assert_eq!(begun.source_name.as_deref(), Some("Easter Countdown.MP4"));
        assert!(begun.path.ends_with("video.mp4"));
        assert!(Path::new(&begun.path).starts_with(fx.store.root().join(&begun.id)));

        std::fs::remove_file(&source).unwrap();
        let video = fx.db.finish_video_import(&fx.store, &begun.id, PROBE).unwrap();
        assert_eq!(std::fs::read(&video.path).unwrap(), b"0123456789");
        assert_eq!((video.duration_ms, video.width, video.height), (Some(90_000), Some(1920), Some(1080)));
        assert!(!video.looping);
    }

    #[test]
    fn refuses_files_that_are_not_videos() {
        let fx = Fixture::new();
        let source = fx.original("notes.txt", b"hello");
        assert!(matches!(
            fx.db.begin_video_import(&fx.store, &source, |_, _| {}),
            Err(LibraryError::Invalid(_))
        ));
        let missing = fx.source_dir.join("gone.mp4");
        assert!(fx.db.begin_video_import(&fx.store, &missing, |_, _| {}).is_err());
        assert!(!fx.store.root().exists() || std::fs::read_dir(fx.store.root()).unwrap().count() == 0);
    }

    #[test]
    fn unfinished_imports_are_hidden_and_bad_probes_refused() {
        let fx = Fixture::new();
        let source = fx.original("clip.webm", b"x");
        let begun = fx.db.begin_video_import(&fx.store, &source, |_, _| {}).unwrap();
        assert!(fx.db.list_videos(&fx.store).unwrap().is_empty());
        assert!(matches!(fx.db.get_video(&fx.store, &begun.id), Err(LibraryError::NotFound(_))));

        let no_picture = VideoProbe { width: 0, ..PROBE };
        assert!(matches!(
            fx.db.finish_video_import(&fx.store, &begun.id, no_picture),
            Err(LibraryError::Invalid(_))
        ));
        fx.db.finish_video_import(&fx.store, &begun.id, PROBE).unwrap();
        // Finishing twice is refused: it is no longer importing.
        assert!(fx.db.finish_video_import(&fx.store, &begun.id, PROBE).is_err());
    }

    #[test]
    fn posters_replace_each_other_and_must_be_images() {
        let fx = Fixture::new();
        let video = fx.import("clip.mp4");
        assert!(fx.db.set_video_poster(&fx.store, &video.id, b"not an image").is_err());

        let first = fx.db.set_video_poster(&fx.store, &video.id, &png()).unwrap();
        let first_poster = first.poster_path.unwrap();
        assert!(Path::new(&first_poster).is_file());

        let second = fx.db.set_video_poster(&fx.store, &video.id, &png()).unwrap();
        let second_poster = second.poster_path.unwrap();
        assert_ne!(first_poster, second_poster);
        assert!(!Path::new(&first_poster).exists());
        assert!(Path::new(&second_poster).is_file());
        assert!(matches!(
            fx.db.set_video_poster(&fx.store, "no-such-video", &png()),
            Err(LibraryError::NotFound(_))
        ));
    }

    #[test]
    fn lists_newest_first_and_updates_title_and_loop() {
        let fx = Fixture::new();
        let older = fx.import("Welcome.mp4");
        let newer = fx.import("Countdown.mov");
        let ids: Vec<_> = fx.db.list_videos(&fx.store).unwrap().into_iter().map(|v| v.id).collect();
        assert_eq!(ids, [newer.id.clone(), older.id.clone()]);

        let looped = fx.db.update_video(&fx.store, &newer.id, None, Some(true)).unwrap();
        assert!(looped.looping);
        assert_eq!(looped.title, "Countdown");
        let renamed = fx.db.update_video(&fx.store, &newer.id, Some("  5 min countdown "), None).unwrap();
        assert_eq!(renamed.title, "5 min countdown");
        assert!(renamed.looping);

        assert!(fx.db.update_video(&fx.store, &newer.id, Some("  "), None).is_err());
        assert!(matches!(
            fx.db.update_video(&fx.store, "no-such-video", None, Some(true)),
            Err(LibraryError::NotFound(_))
        ));
    }

    #[test]
    fn serialises_loop_under_its_frontend_name() {
        let fx = Fixture::new();
        let video = fx.import("clip.mp4");
        let json = serde_json::to_value(&video).unwrap();
        assert_eq!(json["loop"], false);
        assert!(json.get("looping").is_none());
    }

    #[test]
    fn deleting_removes_the_row_and_the_copy() {
        let fx = Fixture::new();
        let video = fx.import("clip.mp4");
        fx.db.delete_video(&fx.store, &video.id).unwrap();
        assert!(!fx.store.root().join(&video.id).exists());
        assert!(fx.db.list_videos(&fx.store).unwrap().is_empty());
        assert!(matches!(fx.db.delete_video(&fx.store, &video.id), Err(LibraryError::NotFound(_))));
    }

    #[test]
    fn sweep_drops_unfinished_imports_and_orphan_folders_only() {
        let fx = Fixture::new();
        let kept = fx.import("kept.mp4");
        let source = fx.original("crashed.mp4", b"x");
        let unfinished = fx.db.begin_video_import(&fx.store, &source, |_, _| {}).unwrap();
        std::fs::create_dir_all(fx.store.root().join("stray")).unwrap();

        assert_eq!(fx.db.sweep_videos(&fx.store).unwrap(), (1, 1));
        assert!(Path::new(&kept.path).is_file());
        assert!(!fx.store.root().join(&unfinished.id).exists());
        assert!(!fx.store.root().join("stray").exists());
        assert_eq!(fx.db.get_video(&fx.store, &kept.id).unwrap(), kept);
    }
}

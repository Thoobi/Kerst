//! Imported presentation decks.
//!
//! A deck is a list of slide images rendered once at import time (PDF pages,
//! or a folder of exported slides) so showing one during a service is just
//! drawing a picture. The images live on disk under [`DeckStore`]'s root, one
//! directory per deck; the database indexes them.
//!
//! Importing is three steps so the frontend can stream pages as it renders
//! them: [`LibraryDb::begin_deck_import`], [`LibraryDb::add_deck_slide`] per
//! page, then [`LibraryDb::finish_deck_import`]. A deck stays hidden from
//! listings until it is finished, and [`LibraryDb::sweep_decks`] discards
//! imports that never were.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use rusqlite::{params, OptionalExtension};

use crate::db::{clean_opt, new_id, now_millis, LibraryDb};
use crate::error::LibraryError;
use crate::folders::{remove_dir_if_exists, remove_orphan_dirs};
use crate::models::{Deck, DeckSlide, DeckSummary};

const IMPORTING: &str = "importing";
const READY: &str = "ready";

/// Where deck slide images are kept: `<root>/<deck id>/<slide id>.<ext>`.
#[derive(Debug, Clone)]
pub struct DeckStore {
    root: PathBuf,
}

impl DeckStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn deck_dir(&self, deck_id: &str) -> PathBuf {
        self.root.join(deck_id)
    }

    fn slide_path(&self, deck_id: &str, file: &str) -> String {
        self.deck_dir(deck_id).join(file).to_string_lossy().into_owned()
    }

    fn remove_deck_dir(&self, deck_id: &str) -> Result<(), LibraryError> {
        remove_dir_if_exists(&self.deck_dir(deck_id))
    }
}

/// Image formats a slide (or a video's poster) may be stored as.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ImageFormat {
    Png,
    Jpeg,
}

impl ImageFormat {
    pub(crate) fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
        }
    }
}

/// Identify a PNG or JPEG and read its pixel size from the header, without
/// decoding it. Anything else is refused.
pub(crate) fn sniff_image(bytes: &[u8]) -> Result<(ImageFormat, u32, u32), LibraryError> {
    const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";
    let be32 = |at: usize| -> Option<u32> {
        Some(u32::from_be_bytes(bytes.get(at..at + 4)?.try_into().ok()?))
    };
    let be16 = |at: usize| -> Option<u16> {
        Some(u16::from_be_bytes(bytes.get(at..at + 2)?.try_into().ok()?))
    };
    let invalid = || LibraryError::Invalid("a slide must be a PNG or JPEG image".into());

    if bytes.starts_with(PNG_SIGNATURE) {
        // IHDR is always the first chunk: length, "IHDR", width, height.
        if bytes.get(12..16) != Some(b"IHDR") {
            return Err(invalid());
        }
        let (width, height) = (be32(16).ok_or_else(invalid)?, be32(20).ok_or_else(invalid)?);
        return checked(ImageFormat::Png, width, height);
    }

    if bytes.starts_with(&[0xFF, 0xD8]) {
        // Walk the marker segments to the first start-of-frame, which holds
        // the size. SOF markers are C0–CF except C4 (DHT), C8 (JPG), CC (DAC).
        let mut at = 2;
        while at + 4 <= bytes.len() {
            if bytes[at] != 0xFF {
                return Err(invalid());
            }
            let marker = bytes[at + 1];
            if marker == 0xFF {
                at += 1; // fill byte
                continue;
            }
            if marker == 0x01 || (0xD0..=0xD9).contains(&marker) {
                at += 2; // standalone marker, no length
                continue;
            }
            let length = usize::from(be16(at + 2).ok_or_else(invalid)?);
            if (0xC0..=0xCF).contains(&marker) && ![0xC4, 0xC8, 0xCC].contains(&marker) {
                let height = u32::from(be16(at + 5).ok_or_else(invalid)?);
                let width = u32::from(be16(at + 7).ok_or_else(invalid)?);
                return checked(ImageFormat::Jpeg, width, height);
            }
            at += 2 + length;
        }
    }

    Err(invalid())
}

fn checked(format: ImageFormat, width: u32, height: u32) -> Result<(ImageFormat, u32, u32), LibraryError> {
    if width == 0 || height == 0 {
        return Err(LibraryError::Invalid("a slide image has no pixels".into()));
    }
    Ok((format, width, height))
}

impl LibraryDb {
    /// Start importing a deck. It stays out of [`Self::list_decks`] until
    /// [`Self::finish_deck_import`]. Returns the new deck's id.
    pub fn begin_deck_import(
        &self,
        store: &DeckStore,
        title: &str,
        source_name: Option<&str>,
    ) -> Result<String, LibraryError> {
        let title = title.trim();
        if title.is_empty() {
            return Err(LibraryError::Invalid("a deck needs a title".into()));
        }
        let id = new_id();
        std::fs::create_dir_all(store.deck_dir(&id))?;
        let now = now_millis();
        self.conn().execute(
            "INSERT INTO decks (id, title, source_name, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![id, title, clean_opt(source_name), IMPORTING, now],
        )?;
        Ok(id)
    }

    /// Append one slide image (PNG or JPEG bytes) to a deck being imported.
    pub fn add_deck_slide(
        &self,
        store: &DeckStore,
        deck_id: &str,
        bytes: &[u8],
    ) -> Result<DeckSlide, LibraryError> {
        let (format, width, height) = sniff_image(bytes)?;
        self.require_status(deck_id, IMPORTING)?;

        let id = new_id();
        let file = format!("{id}.{}", format.extension());
        let path = store.slide_path(deck_id, &file);
        std::fs::write(&path, bytes)?;

        let inserted = self.conn().execute(
            "INSERT INTO deck_slides (id, deck_id, position, file, width, height)
             VALUES (?1, ?2,
                     (SELECT COALESCE(MAX(position), -1) + 1 FROM deck_slides WHERE deck_id = ?2),
                     ?3, ?4, ?5)",
            params![id, deck_id, file, width, height],
        );
        if let Err(e) = inserted {
            // Never leave an image on disk that no row points at.
            let _ = std::fs::remove_file(&path);
            return Err(e.into());
        }
        Ok(DeckSlide { id, path, width, height })
    }

    /// Mark an import complete, making the deck visible. A deck with no
    /// slides is refused.
    pub fn finish_deck_import(&self, store: &DeckStore, deck_id: &str) -> Result<Deck, LibraryError> {
        self.require_status(deck_id, IMPORTING)?;
        let slides: i64 = self.conn().query_row(
            "SELECT COUNT(*) FROM deck_slides WHERE deck_id = ?1",
            [deck_id],
            |r| r.get(0),
        )?;
        if slides == 0 {
            return Err(LibraryError::Invalid("the deck has no slides".into()));
        }
        self.conn().execute(
            "UPDATE decks SET status = ?2, updated_at = ?3 WHERE id = ?1",
            params![deck_id, READY, now_millis()],
        )?;
        self.get_deck(store, deck_id)
    }

    /// A finished deck with its slides in order.
    pub fn get_deck(&self, store: &DeckStore, id: &str) -> Result<Deck, LibraryError> {
        let conn = self.conn();
        let mut deck = conn
            .query_row(
                "SELECT id, title, source_name, created_at, updated_at
                 FROM decks WHERE id = ?1 AND status = ?2",
                params![id, READY],
                |r| {
                    Ok(Deck {
                        id: r.get(0)?,
                        title: r.get(1)?,
                        source_name: r.get(2)?,
                        slides: Vec::new(),
                        created_at: r.get(3)?,
                        updated_at: r.get(4)?,
                    })
                },
            )
            .optional()?
            .ok_or_else(|| LibraryError::NotFound(format!("deck {id}")))?;

        let mut stmt = conn.prepare(
            "SELECT id, file, width, height FROM deck_slides WHERE deck_id = ?1 ORDER BY position",
        )?;
        let rows = stmt.query_map([id], |r| {
            Ok(DeckSlide {
                id: r.get(0)?,
                path: store.slide_path(id, &r.get::<_, String>(1)?),
                width: r.get(2)?,
                height: r.get(3)?,
            })
        })?;
        deck.slides = rows.collect::<Result<_, _>>()?;
        Ok(deck)
    }

    /// Finished decks, most recently changed first.
    pub fn list_decks(&self, store: &DeckStore) -> Result<Vec<DeckSummary>, LibraryError> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT d.id, d.title, d.source_name, d.updated_at,
                    (SELECT COUNT(*) FROM deck_slides WHERE deck_id = d.id),
                    (SELECT file FROM deck_slides WHERE deck_id = d.id ORDER BY position LIMIT 1)
             FROM decks d
             WHERE d.status = ?1
             ORDER BY d.updated_at DESC",
        )?;
        let rows = stmt.query_map([READY], |r| {
            let id: String = r.get(0)?;
            let cover: Option<String> = r.get(5)?;
            Ok(DeckSummary {
                cover_path: cover.map(|file| store.slide_path(&id, &file)),
                id,
                title: r.get(1)?,
                source_name: r.get(2)?,
                updated_at: r.get(3)?,
                slide_count: r.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Delete a deck, finished or not, and its images. Also how a cancelled
    /// import is cleaned up.
    pub fn delete_deck(&self, store: &DeckStore, id: &str) -> Result<(), LibraryError> {
        let removed = self.conn().execute("DELETE FROM decks WHERE id = ?1", [id])?;
        if removed == 0 {
            return Err(LibraryError::NotFound(format!("deck {id}")));
        }
        store.remove_deck_dir(id)
    }

    /// Run at startup: drop imports that never finished (the app closed or
    /// crashed mid-import) and any deck directory no row points at. Returns
    /// how many of each were removed.
    pub fn sweep_decks(&self, store: &DeckStore) -> Result<(usize, usize), LibraryError> {
        let unfinished: Vec<String> = {
            let conn = self.conn();
            let mut stmt = conn.prepare("SELECT id FROM decks WHERE status != ?1")?;
            let ids = stmt.query_map([READY], |r| r.get(0))?.collect::<Result<_, _>>()?;
            ids
        };
        for id in &unfinished {
            self.delete_deck(store, id)?;
        }

        let known: HashSet<String> = {
            let conn = self.conn();
            let mut stmt = conn.prepare("SELECT id FROM decks")?;
            let ids = stmt.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
            ids
        };
        let orphans = remove_orphan_dirs(store.root(), &known)?;
        Ok((unfinished.len(), orphans))
    }

    fn require_status(&self, deck_id: &str, wanted: &str) -> Result<(), LibraryError> {
        let status: Option<String> = self
            .conn()
            .query_row("SELECT status FROM decks WHERE id = ?1", [deck_id], |r| r.get(0))
            .optional()?;
        match status {
            None => Err(LibraryError::NotFound(format!("deck {deck_id}"))),
            Some(s) if s == wanted => Ok(()),
            Some(_) => Err(LibraryError::Invalid(format!("deck {deck_id} is not being imported"))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A minimal PNG header: signature + IHDR with the given size. Enough
    /// for sniffing; the library never decodes slide images.
    fn png(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
        bytes.extend_from_slice(&13u32.to_be_bytes());
        bytes.extend_from_slice(b"IHDR");
        bytes.extend_from_slice(&width.to_be_bytes());
        bytes.extend_from_slice(&height.to_be_bytes());
        bytes.extend_from_slice(&[8, 6, 0, 0, 0, 0, 0, 0, 0]);
        bytes
    }

    /// SOI, an APP0 segment to skip, then SOF0 with the given size.
    fn jpeg(width: u16, height: u16) -> Vec<u8> {
        let mut bytes = vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00];
        bytes.extend_from_slice(&[0xFF, 0xC0, 0x00, 0x11, 0x08]);
        bytes.extend_from_slice(&height.to_be_bytes());
        bytes.extend_from_slice(&width.to_be_bytes());
        bytes.extend_from_slice(&[0x03; 12]);
        bytes
    }

    struct Fixture {
        db: LibraryDb,
        store: DeckStore,
    }

    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("litdeck-decks-test-{}", new_id()));
            Self { db: LibraryDb::open_in_memory().unwrap(), store: DeckStore::new(root) }
        }

        fn import(&self, title: &str, slides: &[Vec<u8>]) -> Deck {
            let id = self.db.begin_deck_import(&self.store, title, Some("deck.pdf")).unwrap();
            for slide in slides {
                self.db.add_deck_slide(&self.store, &id, slide).unwrap();
            }
            self.db.finish_deck_import(&self.store, &id).unwrap()
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(self.store.root());
        }
    }

    #[test]
    fn reads_png_and_jpeg_sizes_and_refuses_anything_else() {
        let (format, w, h) = sniff_image(&png(1920, 1080)).unwrap();
        assert_eq!((format, w, h), (ImageFormat::Png, 1920, 1080));
        let (format, w, h) = sniff_image(&jpeg(1024, 768)).unwrap();
        assert_eq!((format, w, h), (ImageFormat::Jpeg, 1024, 768));

        assert!(sniff_image(b"%PDF-1.7").is_err());
        assert!(sniff_image(&png(1920, 1080)[..18]).is_err());
        assert!(sniff_image(&png(0, 1080)).is_err());
        assert!(sniff_image(&[0xFF, 0xD8, 0xFF, 0xE0]).is_err());
    }

    #[test]
    fn imports_slides_in_order_and_writes_them_to_disk() {
        let fx = Fixture::new();
        let deck = fx.import("Welcome", &[png(1920, 1080), jpeg(1024, 768)]);

        assert_eq!(deck.title, "Welcome");
        assert_eq!(deck.source_name.as_deref(), Some("deck.pdf"));
        let sizes: Vec<_> = deck.slides.iter().map(|s| (s.width, s.height)).collect();
        assert_eq!(sizes, [(1920, 1080), (1024, 768)]);
        let extension = |path: &str| Path::new(path).extension().unwrap().to_string_lossy().into_owned();
        assert_eq!(extension(&deck.slides[0].path), "png");
        assert_eq!(extension(&deck.slides[1].path), "jpg");
        for slide in &deck.slides {
            assert!(Path::new(&slide.path).starts_with(fx.store.root().join(&deck.id)));
            assert!(Path::new(&slide.path).is_file());
        }
        assert_eq!(std::fs::read(&deck.slides[1].path).unwrap(), jpeg(1024, 768));
    }

    #[test]
    fn unfinished_imports_are_hidden() {
        let fx = Fixture::new();
        let id = fx.db.begin_deck_import(&fx.store, "Half done", None).unwrap();
        fx.db.add_deck_slide(&fx.store, &id, &png(10, 10)).unwrap();

        assert!(fx.db.list_decks(&fx.store).unwrap().is_empty());
        assert!(matches!(fx.db.get_deck(&fx.store, &id), Err(LibraryError::NotFound(_))));
    }

    #[test]
    fn refuses_empty_decks_and_slides_after_finishing() {
        let fx = Fixture::new();
        let empty = fx.db.begin_deck_import(&fx.store, "Empty", None).unwrap();
        assert!(matches!(fx.db.finish_deck_import(&fx.store, &empty), Err(LibraryError::Invalid(_))));

        let deck = fx.import("Done", &[png(10, 10)]);
        assert!(matches!(
            fx.db.add_deck_slide(&fx.store, &deck.id, &png(10, 10)),
            Err(LibraryError::Invalid(_))
        ));
        assert!(matches!(
            fx.db.add_deck_slide(&fx.store, "no-such-deck", &png(10, 10)),
            Err(LibraryError::NotFound(_))
        ));
        assert!(fx.db.begin_deck_import(&fx.store, "   ", None).is_err());
    }

    #[test]
    fn a_refused_slide_leaves_nothing_on_disk() {
        let fx = Fixture::new();
        let id = fx.db.begin_deck_import(&fx.store, "Deck", None).unwrap();
        assert!(fx.db.add_deck_slide(&fx.store, &id, b"not an image").is_err());
        assert_eq!(std::fs::read_dir(fx.store.root().join(&id)).unwrap().count(), 0);
    }

    #[test]
    fn lists_finished_decks_with_count_and_cover() {
        let fx = Fixture::new();
        let deck = fx.import("Welcome", &[png(1920, 1080), png(1920, 1080), png(1920, 1080)]);

        let list = fx.db.list_decks(&fx.store).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].slide_count, 3);
        assert_eq!(list[0].cover_path.as_deref(), Some(deck.slides[0].path.as_str()));
    }

    #[test]
    fn deleting_removes_rows_and_images() {
        let fx = Fixture::new();
        let deck = fx.import("Welcome", &[png(10, 10)]);
        fx.db.delete_deck(&fx.store, &deck.id).unwrap();

        assert!(!fx.store.root().join(&deck.id).exists());
        let slides: i64 = fx
            .db
            .conn()
            .query_row("SELECT COUNT(*) FROM deck_slides", [], |r| r.get(0))
            .unwrap();
        assert_eq!(slides, 0);
        assert!(matches!(fx.db.delete_deck(&fx.store, &deck.id), Err(LibraryError::NotFound(_))));
    }

    #[test]
    fn sweep_drops_unfinished_imports_and_orphan_folders_only() {
        let fx = Fixture::new();
        let kept = fx.import("Kept", &[png(10, 10)]);
        let unfinished = fx.db.begin_deck_import(&fx.store, "Crashed", None).unwrap();
        fx.db.add_deck_slide(&fx.store, &unfinished, &png(10, 10)).unwrap();
        std::fs::create_dir_all(fx.store.root().join("stray")).unwrap();

        assert_eq!(fx.db.sweep_decks(&fx.store).unwrap(), (1, 1));
        assert!(fx.store.root().join(&kept.id).is_dir());
        assert!(!fx.store.root().join(&unfinished).exists());
        assert!(!fx.store.root().join("stray").exists());
        assert_eq!(fx.db.get_deck(&fx.store, &kept.id).unwrap(), kept);
    }

    #[test]
    fn sweep_without_a_decks_folder_is_a_no_op() {
        let fx = Fixture::new();
        assert_eq!(fx.db.sweep_decks(&fx.store).unwrap(), (0, 0));
    }
}

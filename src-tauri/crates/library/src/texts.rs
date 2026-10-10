//! Free texts: announcements, notices, a welcome message. Written and edited
//! in the app, shown through the same themes as lyrics (blank lines split
//! screens), optionally over a looping motion background.

use rusqlite::{params, OptionalExtension, Row};

use crate::db::{new_id, now_millis, LibraryDb};
use crate::error::LibraryError;
use crate::models::{Text, TextInput};

const TEXT_COLUMNS: &str = "id, title, body, background_video_id, created_at, updated_at";

fn text_from_row(r: &Row<'_>) -> rusqlite::Result<Text> {
    Ok(Text {
        id: r.get(0)?,
        title: r.get(1)?,
        body: r.get(2)?,
        background_video_id: r.get(3)?,
        created_at: r.get(4)?,
        updated_at: r.get(5)?,
    })
}

/// One line ending, no trailing spaces, no blank lines at either end.
fn normalize_body(body: &str) -> String {
    body.replace("\r\n", "\n")
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim_matches('\n')
        .to_string()
}

impl LibraryDb {
    /// Create (no id) or update a text. Its background is left alone; set it
    /// with [`Self::set_text_background`].
    pub fn save_text(&self, input: &TextInput) -> Result<Text, LibraryError> {
        let title = input.title.trim();
        if title.is_empty() {
            return Err(LibraryError::Invalid("a text needs a title".into()));
        }
        let body = normalize_body(&input.body);
        let now = now_millis();
        let id = if let Some(id) = input.id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            let changed = self.conn().execute(
                "UPDATE texts SET title = ?2, body = ?3, updated_at = ?4 WHERE id = ?1",
                params![id, title, body, now],
            )?;
            if changed == 0 {
                return Err(LibraryError::NotFound(format!("text {id}")));
            }
            id.to_string()
        } else {
            let id = new_id();
            self.conn().execute(
                "INSERT INTO texts (id, title, body, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
                params![id, title, body, now],
            )?;
            id
        };
        self.get_text(&id)
    }

    pub fn get_text(&self, id: &str) -> Result<Text, LibraryError> {
        self.conn()
            .query_row(&format!("SELECT {TEXT_COLUMNS} FROM texts WHERE id = ?1"), [id], text_from_row)
            .optional()?
            .ok_or_else(|| LibraryError::NotFound(format!("text {id}")))
    }

    /// Every text, alphabetically by title.
    pub fn list_texts(&self) -> Result<Vec<Text>, LibraryError> {
        let conn = self.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {TEXT_COLUMNS} FROM texts ORDER BY title COLLATE NOCASE, created_at"
        ))?;
        let rows = stmt.query_map([], text_from_row)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Loop a library video behind a text, or go back to the theme's
    /// background with `None`.
    pub fn set_text_background(&self, id: &str, video_id: Option<&str>) -> Result<Text, LibraryError> {
        let changed = self
            .conn()
            .execute(
                "UPDATE texts SET background_video_id = ?2, updated_at = ?3 WHERE id = ?1",
                params![id, video_id, now_millis()],
            )
            .map_err(|e| match e {
                rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::ConstraintViolation => {
                    LibraryError::NotFound(format!("video {}", video_id.unwrap_or_default()))
                }
                e => e.into(),
            })?;
        if changed == 0 {
            return Err(LibraryError::NotFound(format!("text {id}")));
        }
        self.get_text(id)
    }

    pub fn delete_text(&self, id: &str) -> Result<(), LibraryError> {
        let removed = self.conn().execute("DELETE FROM texts WHERE id = ?1", [id])?;
        if removed == 0 {
            return Err(LibraryError::NotFound(format!("text {id}")));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(title: &str, body: &str) -> TextInput {
        TextInput { id: None, title: title.into(), body: body.into() }
    }

    #[test]
    fn creates_updates_and_lists_texts_alphabetically() {
        let db = LibraryDb::open_in_memory().unwrap();
        let welcome = db.save_text(&input("  Welcome ", "\r\nGood morning!  \r\nCoffee after the service\n\n")).unwrap();
        assert_eq!(welcome.title, "Welcome");
        db.save_text(&input("announcements", "Youth camp Friday")).unwrap();

        let titles: Vec<_> = db.list_texts().unwrap().into_iter().map(|t| t.title).collect();
        assert_eq!(titles, ["announcements", "Welcome"]);

        let edited = db
            .save_text(&TextInput { id: Some(welcome.id.clone()), title: "Welcome".into(), body: "Hello\n\nAgain".into() })
            .unwrap();
        assert_eq!(edited.body, "Hello\n\nAgain");
        assert_eq!(edited.created_at, welcome.created_at);
    }

    #[test]
    fn normalises_line_endings_and_edges() {
        let db = LibraryDb::open_in_memory().unwrap();
        let text = db.save_text(&input("A", "\nLine one  \r\nLine two\n\n")).unwrap();
        assert_eq!(text.body, "Line one\nLine two");
    }

    #[test]
    fn refuses_empty_titles_and_unknown_ids() {
        let db = LibraryDb::open_in_memory().unwrap();
        assert!(matches!(db.save_text(&input("  ", "x")), Err(LibraryError::Invalid(_))));
        let missing = TextInput { id: Some("nope".into()), title: "A".into(), body: String::new() };
        assert!(matches!(db.save_text(&missing), Err(LibraryError::NotFound(_))));
        assert!(matches!(db.delete_text("nope"), Err(LibraryError::NotFound(_))));
    }

    #[test]
    fn background_survives_edits_and_goes_with_its_video() {
        let db = LibraryDb::open_in_memory().unwrap();
        db.conn()
            .execute(
                "INSERT INTO videos (id, title, file, status, created_at, updated_at)
                 VALUES ('loop', 'Clouds', 'video.mp4', 'ready', 0, 0)",
                [],
            )
            .unwrap();
        let text = db.save_text(&input("Welcome", "Hi")).unwrap();
        db.set_text_background(&text.id, Some("loop")).unwrap();
        let edited = db
            .save_text(&TextInput { id: Some(text.id.clone()), title: "Welcome!".into(), body: "Hi".into() })
            .unwrap();
        assert_eq!(edited.background_video_id.as_deref(), Some("loop"));
        assert!(matches!(db.set_text_background(&text.id, Some("nope")), Err(LibraryError::NotFound(_))));

        let store = crate::videos::VideoStore::new(std::env::temp_dir().join(format!("litdeck-textbg-{}", new_id())));
        db.delete_video(&store, "loop").unwrap();
        assert_eq!(db.get_text(&text.id).unwrap().background_video_id, None);
    }
}

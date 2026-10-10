use std::collections::HashSet;

use rusqlite::{params, OptionalExtension, Row, Transaction};

use crate::db::{clean_opt, new_id, now_millis, LibraryDb};
use crate::error::LibraryError;
use crate::models::{SectionKind, Song, SongInput, SongSection, SongSummary};

const SUMMARY_COLUMNS: &str = "s.id, s.title, s.author, s.ccli_number, s.updated_at,
    (SELECT lyrics FROM song_sections WHERE song_id = s.id ORDER BY position LIMIT 1)";

impl LibraryDb {
    /// Create or replace a song. Sections are replaced wholesale, and the
    /// search index is rewritten in the same transaction.
    pub fn save_song(&self, input: &SongInput) -> Result<Song, LibraryError> {
        let title = input.title.trim();
        if title.is_empty() {
            return Err(LibraryError::Invalid("a song needs a title".into()));
        }
        if let Some(&bad) = input.arrangement.iter().find(|&&i| i >= input.sections.len()) {
            return Err(LibraryError::Invalid(format!(
                "arrangement refers to section {bad}, but the song has {}",
                input.sections.len()
            )));
        }

        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let now = now_millis();
        let id = clean_opt(input.id.as_deref()).unwrap_or_else(new_id);

        let created_at: i64 = tx
            .query_row("SELECT created_at FROM songs WHERE id = ?1", [&id], |r| r.get(0))
            .optional()?
            .unwrap_or(now);

        // Section ids are kept across edits, but never trusted blindly: an
        // id repeated within this save, or one that belongs to another song,
        // gets a fresh one instead of failing the whole save.
        let mut seen = HashSet::new();
        let mut section_ids: Vec<String> = Vec::with_capacity(input.sections.len());
        for section in &input.sections {
            let kept = clean_opt(section.id.as_deref()).filter(|candidate| {
                !seen.contains(candidate)
                    && tx
                        .query_row(
                            "SELECT song_id FROM song_sections WHERE id = ?1",
                            [candidate],
                            |r| r.get::<_, String>(0),
                        )
                        .optional()
                        .ok()
                        .flatten()
                        .is_none_or(|owner| owner == id)
            });
            let section_id = kept.unwrap_or_else(new_id);
            seen.insert(section_id.clone());
            section_ids.push(section_id);
        }
        let arrangement: Vec<&String> =
            input.arrangement.iter().map(|&i| &section_ids[i]).collect();

        tx.execute(
            "INSERT INTO songs (id, title, author, copyright, ccli_number, arrangement, source, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title, author = excluded.author,
                copyright = excluded.copyright, ccli_number = excluded.ccli_number,
                arrangement = excluded.arrangement, source = excluded.source,
                updated_at = excluded.updated_at",
            params![
                id,
                title,
                clean_opt(input.author.as_deref()),
                clean_opt(input.copyright.as_deref()),
                clean_opt(input.ccli_number.as_deref()),
                serde_json::to_string(&arrangement)?,
                input.source,
                created_at,
                now,
            ],
        )?;

        tx.execute("DELETE FROM song_sections WHERE song_id = ?1", [&id])?;
        for (position, (section, section_id)) in
            input.sections.iter().zip(&section_ids).enumerate()
        {
            tx.execute(
                "INSERT INTO song_sections (id, song_id, position, kind, label, lyrics)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    section_id,
                    id,
                    i64::try_from(position).unwrap_or(i64::MAX),
                    section.kind.as_str(),
                    section.label.trim(),
                    normalize_lyrics(&section.lyrics),
                ],
            )?;
        }

        reindex(&tx, &id)?;
        tx.commit()?;
        drop(conn);

        self.get_song(&id)
    }

    /// Loop a library video behind this song's lyrics, or go back to the
    /// theme's background with `None`.
    pub fn set_song_background(&self, id: &str, video_id: Option<&str>) -> Result<Song, LibraryError> {
        let changed = self
            .conn()
            .execute(
                "UPDATE songs SET background_video_id = ?2, updated_at = ?3 WHERE id = ?1",
                params![id, video_id, now_millis()],
            )
            .map_err(|e| match e {
                rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::ConstraintViolation => {
                    LibraryError::NotFound(format!("video {}", video_id.unwrap_or_default()))
                }
                e => e.into(),
            })?;
        if changed == 0 {
            return Err(LibraryError::NotFound(format!("song {id}")));
        }
        self.get_song(id)
    }

    pub fn get_song(&self, id: &str) -> Result<Song, LibraryError> {
        let conn = self.conn();
        let mut song = conn
            .query_row(
                "SELECT id, title, author, copyright, ccli_number, arrangement, source, created_at, updated_at,
                        background_video_id
                 FROM songs WHERE id = ?1",
                [id],
                |r| {
                    Ok((
                        Song {
                            id: r.get(0)?,
                            title: r.get(1)?,
                            author: r.get(2)?,
                            copyright: r.get(3)?,
                            ccli_number: r.get(4)?,
                            sections: Vec::new(),
                            arrangement: Vec::new(),
                            source: r.get(6)?,
                            background_video_id: r.get(9)?,
                            created_at: r.get(7)?,
                            updated_at: r.get(8)?,
                        },
                        r.get::<_, String>(5)?,
                    ))
                },
            )
            .optional()?
            .map(|(mut song, arrangement)| -> Result<Song, LibraryError> {
                song.arrangement = serde_json::from_str(&arrangement)?;
                Ok(song)
            })
            .transpose()?
            .ok_or_else(|| LibraryError::NotFound(format!("song {id}")))?;

        let mut stmt = conn.prepare(
            "SELECT id, kind, label, lyrics FROM song_sections WHERE song_id = ?1 ORDER BY position",
        )?;
        song.sections = stmt
            .query_map([id], |r| {
                Ok(SongSection {
                    id: r.get(0)?,
                    kind: SectionKind::parse(&r.get::<_, String>(1)?),
                    label: r.get(2)?,
                    lyrics: r.get(3)?,
                })
            })?
            .collect::<Result<_, _>>()?;
        Ok(song)
    }

    /// Every song, alphabetically.
    pub fn list_songs(&self) -> Result<Vec<SongSummary>, LibraryError> {
        let conn = self.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {SUMMARY_COLUMNS} FROM songs s ORDER BY s.title COLLATE NOCASE, s.id"
        ))?;
        let rows = stmt.query_map([], summary_from_row)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Search titles, authors and lyrics. Each word matches as a prefix, so
    /// "amaz gra" finds "Amazing Grace" while the operator is still typing.
    /// Title hits rank above lyric hits.
    pub fn search_songs(&self, query: &str, limit: usize) -> Result<Vec<SongSummary>, LibraryError> {
        let Some(fts_query) = fts_prefix_query(query) else {
            let mut all = self.list_songs()?;
            all.truncate(limit);
            return Ok(all);
        };
        let conn = self.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {SUMMARY_COLUMNS}
             FROM songs_fts f JOIN songs s ON s.id = f.song_id
             WHERE songs_fts MATCH ?1
             ORDER BY bm25(songs_fts, 0.0, 10.0, 4.0, 1.0)
             LIMIT ?2"
        ))?;
        let rows = stmt.query_map(
            params![fts_query, i64::try_from(limit).unwrap_or(i64::MAX)],
            summary_from_row,
        )?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn delete_song(&self, id: &str) -> Result<(), LibraryError> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let removed = tx.execute("DELETE FROM songs WHERE id = ?1", [id])?;
        if removed == 0 {
            return Err(LibraryError::NotFound(format!("song {id}")));
        }
        tx.execute("DELETE FROM songs_fts WHERE song_id = ?1", [id])?;
        tx.commit()?;
        Ok(())
    }
}

fn summary_from_row(r: &Row<'_>) -> rusqlite::Result<SongSummary> {
    let first_section: Option<String> = r.get(5)?;
    Ok(SongSummary {
        id: r.get(0)?,
        title: r.get(1)?,
        author: r.get(2)?,
        ccli_number: r.get(3)?,
        updated_at: r.get(4)?,
        first_line: first_section.and_then(|lyrics| {
            lyrics
                .lines()
                .map(str::trim)
                .find(|l| !l.is_empty())
                .map(str::to_string)
        }),
    })
}

fn reindex(tx: &Transaction<'_>, song_id: &str) -> Result<(), LibraryError> {
    tx.execute("DELETE FROM songs_fts WHERE song_id = ?1", [song_id])?;
    tx.execute(
        "INSERT INTO songs_fts (song_id, title, author, lyrics)
         SELECT s.id, s.title, COALESCE(s.author, ''),
                COALESCE((SELECT group_concat(lyrics, char(10))
                          FROM (SELECT lyrics FROM song_sections
                                WHERE song_id = s.id ORDER BY position)), '')
         FROM songs s WHERE s.id = ?1",
        [song_id],
    )?;
    Ok(())
}

/// Unify line endings and trim trailing space on every line, but keep blank
/// lines: they mark where a section splits into slides.
fn normalize_lyrics(lyrics: &str) -> String {
    lyrics
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim_matches('\n')
        .to_string()
}

/// Turn free text into an FTS5 query of quoted prefix terms. Quoting every
/// token means operator input can never be parsed as FTS syntax.
fn fts_prefix_query(input: &str) -> Option<String> {
    let terms: Vec<String> = input
        .split(|c: char| !c.is_alphanumeric() && c != '\'')
        .map(|t| t.trim_matches('\''))
        .filter(|t| !t.is_empty())
        .map(|t| format!("\"{t}\"*"))
        .collect();
    (!terms.is_empty()).then(|| terms.join(" "))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::SongSectionInput;

    fn section(kind: SectionKind, label: &str, lyrics: &str) -> SongSectionInput {
        SongSectionInput { id: None, kind, label: label.into(), lyrics: lyrics.into() }
    }

    fn amazing_grace() -> SongInput {
        SongInput {
            id: None,
            title: "Amazing Grace".into(),
            author: Some("John Newton".into()),
            copyright: Some("Public Domain".into()),
            ccli_number: Some("22025".into()),
            sections: vec![
                section(SectionKind::Verse, "Verse 1", "Amazing grace how sweet the sound\r\nThat saved a wretch like me  \n"),
                section(SectionKind::Chorus, "Chorus", "My chains are gone\nI've been set free"),
                section(SectionKind::Verse, "Verse 2", "'Twas grace that taught my heart to fear"),
            ],
            arrangement: vec![0, 1, 2, 1],
            source: "manual".into(),
        }
    }

    #[test]
    fn repeated_or_foreign_section_ids_get_fresh_ones_instead_of_failing() {
        let db = LibraryDb::open_in_memory().unwrap();
        let other = db.save_song(&amazing_grace()).unwrap();
        let mut input = SongInput { title: "Hosanna".into(), ..amazing_grace() };
        let song = db.save_song(&input).unwrap();

        // Every section claims the same id (three "Chorus" sections matched
        // by name), and one claims a section of another song.
        let shared = song.sections[0].id.clone();
        for section in &mut input.sections {
            section.id = Some(shared.clone());
        }
        input.sections[2].id = Some(other.sections[0].id.clone());
        input.id = Some(song.id.clone());
        let saved = db.save_song(&input).unwrap();

        let ids: HashSet<_> = saved.sections.iter().map(|s| s.id.clone()).collect();
        assert_eq!(ids.len(), 3);
        assert_eq!(saved.sections[0].id, shared);
        assert!(!ids.contains(&other.sections[0].id));
        // The other song is untouched, and the arrangement still resolves.
        assert_eq!(db.get_song(&other.id).unwrap(), other);
        assert_eq!(saved.arrangement.len(), 4);
        assert!(saved.arrangement.iter().all(|a| ids.contains(a)));
    }

    #[test]
    fn a_background_video_survives_edits_and_goes_when_the_video_does() {
        let db = LibraryDb::open_in_memory().unwrap();
        db.conn()
            .execute(
                "INSERT INTO videos (id, title, file, status, created_at, updated_at)
                 VALUES ('loop', 'Clouds', 'video.mp4', 'ready', 0, 0)",
                [],
            )
            .unwrap();
        let song = db.save_song(&amazing_grace()).unwrap();
        assert_eq!(song.background_video_id, None);

        let song = db.set_song_background(&song.id, Some("loop")).unwrap();
        assert_eq!(song.background_video_id.as_deref(), Some("loop"));
        // Editing the words keeps it.
        let edited = db
            .save_song(&SongInput { id: Some(song.id.clone()), title: "Amazing Grace (My Chains)".into(), ..amazing_grace() })
            .unwrap();
        assert_eq!(edited.background_video_id.as_deref(), Some("loop"));

        assert!(matches!(db.set_song_background(&song.id, Some("no-such-video")), Err(LibraryError::NotFound(_))));
        assert!(matches!(db.set_song_background("no-such-song", None), Err(LibraryError::NotFound(_))));

        let store = crate::videos::VideoStore::new(std::env::temp_dir().join(format!("light-songbg-{}", new_id())));
        db.delete_video(&store, "loop").unwrap();
        assert_eq!(db.get_song(&song.id).unwrap().background_video_id, None);

        let cleared = db.set_song_background(&song.id, None).unwrap();
        assert_eq!(cleared.background_video_id, None);
    }

    #[test]
    fn saves_and_reads_back_a_song_with_its_arrangement() {
        let db = LibraryDb::open_in_memory().unwrap();
        let song = db.save_song(&amazing_grace()).unwrap();

        assert_eq!(song.title, "Amazing Grace");
        assert_eq!(song.sections.len(), 3);
        assert_eq!(
            song.sections[0].lyrics,
            "Amazing grace how sweet the sound\nThat saved a wretch like me"
        );
        let chorus = &song.sections[1].id;
        assert_eq!(
            song.arrangement,
            vec![song.sections[0].id.clone(), chorus.clone(), song.sections[2].id.clone(), chorus.clone()]
        );
        assert_eq!(db.get_song(&song.id).unwrap(), song);
    }

    #[test]
    fn updating_keeps_created_at_and_replaces_sections() {
        let db = LibraryDb::open_in_memory().unwrap();
        let first = db.save_song(&amazing_grace()).unwrap();

        let mut edit = amazing_grace();
        edit.id = Some(first.id.clone());
        edit.sections.truncate(1);
        edit.arrangement = vec![0];
        let second = db.save_song(&edit).unwrap();

        assert_eq!(second.id, first.id);
        assert_eq!(second.created_at, first.created_at);
        assert_eq!(second.sections.len(), 1);
        assert_eq!(db.list_songs().unwrap().len(), 1);
    }

    #[test]
    fn rejects_an_empty_title_and_out_of_range_arrangement() {
        let db = LibraryDb::open_in_memory().unwrap();
        let mut blank = amazing_grace();
        blank.title = "   ".into();
        assert!(matches!(db.save_song(&blank), Err(LibraryError::Invalid(_))));

        let mut bad = amazing_grace();
        bad.arrangement = vec![0, 7];
        assert!(matches!(db.save_song(&bad), Err(LibraryError::Invalid(_))));
        assert!(db.list_songs().unwrap().is_empty());
    }

    #[test]
    fn lists_alphabetically_with_first_line() {
        let db = LibraryDb::open_in_memory().unwrap();
        db.save_song(&amazing_grace()).unwrap();
        let mut other = amazing_grace();
        other.title = "a mighty fortress".into();
        other.sections = vec![section(SectionKind::Verse, "Verse 1", "\nA mighty fortress is our God")];
        other.arrangement = vec![];
        db.save_song(&other).unwrap();

        let list = db.list_songs().unwrap();
        let titles: Vec<_> = list.iter().map(|s| s.title.as_str()).collect();
        assert_eq!(titles, ["a mighty fortress", "Amazing Grace"]);
        assert_eq!(list[0].first_line.as_deref(), Some("A mighty fortress is our God"));
    }

    #[test]
    fn searches_titles_and_lyrics_by_prefix_with_titles_first() {
        let db = LibraryDb::open_in_memory().unwrap();
        db.save_song(&amazing_grace()).unwrap();
        let mut lyric_only = amazing_grace();
        lyric_only.title = "Chains Gone".into();
        lyric_only.sections = vec![section(SectionKind::Verse, "Verse 1", "His amazing love")];
        lyric_only.arrangement = vec![];
        db.save_song(&lyric_only).unwrap();

        let hits = db.search_songs("amaz", 10).unwrap();
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].title, "Amazing Grace");

        assert_eq!(db.search_songs("wretch", 10).unwrap()[0].title, "Amazing Grace");
        assert_eq!(db.search_songs("newton", 10).unwrap().len(), 2);
        assert!(db.search_songs("zzz", 10).unwrap().is_empty());
    }

    #[test]
    fn search_input_cannot_inject_fts_syntax() {
        let db = LibraryDb::open_in_memory().unwrap();
        db.save_song(&amazing_grace()).unwrap();
        for nasty in ["\"", "grace OR", "NEAR(", "title:x", "*", "a AND NOT b", "it's"] {
            db.search_songs(nasty, 10).unwrap();
        }
        assert_eq!(db.search_songs("", 10).unwrap().len(), 1);
    }

    #[test]
    fn deleting_removes_the_song_its_sections_and_search_entry() {
        let db = LibraryDb::open_in_memory().unwrap();
        let song = db.save_song(&amazing_grace()).unwrap();
        db.delete_song(&song.id).unwrap();

        assert!(matches!(db.get_song(&song.id), Err(LibraryError::NotFound(_))));
        assert!(db.search_songs("grace", 10).unwrap().is_empty());
        let orphans: i64 = db
            .conn()
            .query_row("SELECT COUNT(*) FROM song_sections", [], |r| r.get(0))
            .unwrap();
        assert_eq!(orphans, 0);
        assert!(matches!(db.delete_song(&song.id), Err(LibraryError::NotFound(_))));
    }
}

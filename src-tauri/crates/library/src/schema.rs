//! Schema migrations, tracked with `PRAGMA user_version`.
//!
//! Each entry upgrades from version `i` to `i + 1`. Never edit a shipped
//! migration; append a new one.

use rusqlite::Connection;

use crate::error::LibraryError;

const MIGRATIONS: &[&str] = &[
    // 1: songs, sections, search, schedules
    r"
    CREATE TABLE songs (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        author      TEXT,
        copyright   TEXT,
        ccli_number TEXT,
        arrangement TEXT NOT NULL DEFAULT '[]',
        source      TEXT NOT NULL DEFAULT 'manual',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
    );

    CREATE TABLE song_sections (
        id       TEXT PRIMARY KEY,
        song_id  TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        kind     TEXT NOT NULL,
        label    TEXT NOT NULL,
        lyrics   TEXT NOT NULL
    );
    CREATE INDEX song_sections_song ON song_sections(song_id, position);

    -- Kept in step by the save/delete paths; one row per song.
    CREATE VIRTUAL TABLE songs_fts USING fts5(
        song_id UNINDEXED,
        title,
        author,
        lyrics,
        tokenize = 'unicode61 remove_diacritics 2'
    );

    CREATE TABLE schedules (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        service_date TEXT,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL
    );

    CREATE TABLE schedule_items (
        id          TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
        position    INTEGER NOT NULL,
        kind        TEXT NOT NULL,
        title       TEXT NOT NULL,
        payload     TEXT NOT NULL DEFAULT 'null'
    );
    CREATE INDEX schedule_items_schedule ON schedule_items(schedule_id, position);
    ",
    // 2: imported presentation decks. Slide images live on disk under the
    // decks directory; these rows index them.
    r"
    CREATE TABLE decks (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        source_name TEXT,
        -- 'importing' until every slide is in, then 'ready'. Imports that
        -- never finish are swept on the next start.
        status      TEXT NOT NULL DEFAULT 'importing',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
    );

    CREATE TABLE deck_slides (
        id       TEXT PRIMARY KEY,
        deck_id  TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        file     TEXT NOT NULL,
        width    INTEGER NOT NULL,
        height   INTEGER NOT NULL
    );
    CREATE INDEX deck_slides_deck ON deck_slides(deck_id, position);
    ",
];

pub(crate) fn migrate(conn: &mut Connection) -> Result<(), LibraryError> {
    let current: usize = conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))?
        .try_into()
        .unwrap_or(0);

    if current > MIGRATIONS.len() {
        return Err(LibraryError::Invalid(format!(
            "library.db is schema version {current}, newer than this app supports ({}). \
             Update Rhema to open it.",
            MIGRATIONS.len()
        )));
    }

    for (index, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", index + 1)?;
        tx.commit()?;
        log::info!("library.db migrated to schema version {}", index + 1);
    }
    Ok(())
}

#[cfg(test)]
pub(crate) const LATEST_VERSION: usize = MIGRATIONS.len();

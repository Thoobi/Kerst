use std::path::Path;
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;

use crate::error::LibraryError;
use crate::schema;

/// The user's song and schedule library.
///
/// Holds its own lock so it can be managed by Tauri directly and shared
/// between commands without wrapping it in another `Mutex`.
pub struct LibraryDb {
    conn: Mutex<Connection>,
}

impl std::fmt::Debug for LibraryDb {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LibraryDb").finish_non_exhaustive()
    }
}

impl LibraryDb {
    /// Open (creating if needed) the library at `path` and bring its schema
    /// up to date.
    pub fn open(path: &Path) -> Result<Self, LibraryError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        // WAL keeps the UI responsive while an import writes in bulk.
        conn.pragma_update(None, "journal_mode", "WAL")?;
        Self::init(conn)
    }

    /// A throwaway library, for tests.
    pub fn open_in_memory() -> Result<Self, LibraryError> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(mut conn: Connection) -> Result<Self, LibraryError> {
        conn.pragma_update(None, "foreign_keys", "ON")?;
        schema::migrate(&mut conn)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub(crate) fn conn(&self) -> MutexGuard<'_, Connection> {
        // A panic while holding the lock leaves the connection itself valid;
        // keep serving rather than poisoning the whole library.
        self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    pub fn schema_version(&self) -> Result<i64, LibraryError> {
        Ok(self.conn().query_row("PRAGMA user_version", [], |r| r.get(0))?)
    }
}

pub(crate) fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
}

pub(crate) fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Trim, and treat empty strings as absent.
pub(crate) fn clean_opt(value: Option<&str>) -> Option<String> {
    value.map(str::trim).filter(|s| !s.is_empty()).map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_database_is_at_latest_schema() {
        let db = LibraryDb::open_in_memory().unwrap();
        assert_eq!(db.schema_version().unwrap(), i64::try_from(schema::LATEST_VERSION).unwrap());
    }

    #[test]
    fn reopening_a_file_keeps_data_and_does_not_remigrate() {
        let dir = std::env::temp_dir().join(format!("rhema-library-test-{}", new_id()));
        let path = dir.join("library.db");
        {
            let db = LibraryDb::open(&path).unwrap();
            db.conn()
                .execute(
                    "INSERT INTO schedules (id, name, created_at, updated_at) VALUES ('s', 'Sunday', 0, 0)",
                    [],
                )
                .unwrap();
        }
        let db = LibraryDb::open(&path).unwrap();
        let count: i64 = db
            .conn()
            .query_row("SELECT COUNT(*) FROM schedules", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        drop(db);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn refuses_a_database_from_a_newer_app() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", 999).unwrap();
        let err = schema::migrate(&mut conn).unwrap_err();
        assert!(err.to_string().contains("newer than this app supports"));
    }
}

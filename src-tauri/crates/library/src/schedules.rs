use rusqlite::{params, OptionalExtension};

use crate::db::{clean_opt, new_id, now_millis, LibraryDb};
use crate::error::LibraryError;
use crate::models::{Schedule, ScheduleInput, ScheduleItem, ScheduleItemKind, ScheduleSummary};

impl LibraryDb {
    /// Create or replace a schedule. Items are replaced wholesale, in the
    /// order given.
    pub fn save_schedule(&self, input: &ScheduleInput) -> Result<Schedule, LibraryError> {
        let name = input.name.trim();
        if name.is_empty() {
            return Err(LibraryError::Invalid("a schedule needs a name".into()));
        }

        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let now = now_millis();
        let id = clean_opt(input.id.as_deref()).unwrap_or_else(new_id);
        let created_at: i64 = tx
            .query_row("SELECT created_at FROM schedules WHERE id = ?1", [&id], |r| r.get(0))
            .optional()?
            .unwrap_or(now);

        tx.execute(
            "INSERT INTO schedules (id, name, service_date, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name, service_date = excluded.service_date,
                updated_at = excluded.updated_at",
            params![id, name, clean_opt(input.service_date.as_deref()), created_at, now],
        )?;

        tx.execute("DELETE FROM schedule_items WHERE schedule_id = ?1", [&id])?;
        for (position, item) in input.items.iter().enumerate() {
            tx.execute(
                "INSERT INTO schedule_items (id, schedule_id, position, kind, title, payload)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    clean_opt(item.id.as_deref()).unwrap_or_else(new_id),
                    id,
                    i64::try_from(position).unwrap_or(i64::MAX),
                    item.kind.as_str(),
                    item.title.trim(),
                    serde_json::to_string(&item.payload)?,
                ],
            )?;
        }
        tx.commit()?;
        drop(conn);

        self.get_schedule(&id)
    }

    pub fn get_schedule(&self, id: &str) -> Result<Schedule, LibraryError> {
        let conn = self.conn();
        let mut schedule = conn
            .query_row(
                "SELECT id, name, service_date, created_at, updated_at FROM schedules WHERE id = ?1",
                [id],
                |r| {
                    Ok(Schedule {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        service_date: r.get(2)?,
                        items: Vec::new(),
                        created_at: r.get(3)?,
                        updated_at: r.get(4)?,
                    })
                },
            )
            .optional()?
            .ok_or_else(|| LibraryError::NotFound(format!("schedule {id}")))?;

        let mut stmt = conn.prepare(
            "SELECT id, kind, title, payload FROM schedule_items
             WHERE schedule_id = ?1 ORDER BY position",
        )?;
        let rows = stmt.query_map([id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })?;
        for row in rows {
            let (item_id, kind, title, payload) = row?;
            // An item kind from a newer app version: skip it rather than
            // refusing to open the whole service.
            let Some(kind) = ScheduleItemKind::parse(&kind) else {
                log::warn!("schedule {id}: skipping item {item_id} of unknown kind {kind:?}");
                continue;
            };
            schedule.items.push(ScheduleItem {
                id: item_id,
                kind,
                title,
                payload: serde_json::from_str(&payload)?,
            });
        }
        Ok(schedule)
    }

    /// All schedules, most recent service first; undated ones last.
    pub fn list_schedules(&self) -> Result<Vec<ScheduleSummary>, LibraryError> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.service_date, s.updated_at,
                    (SELECT COUNT(*) FROM schedule_items WHERE schedule_id = s.id)
             FROM schedules s
             ORDER BY s.service_date IS NULL, s.service_date DESC, s.updated_at DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(ScheduleSummary {
                id: r.get(0)?,
                name: r.get(1)?,
                service_date: r.get(2)?,
                updated_at: r.get(3)?,
                item_count: r.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn delete_schedule(&self, id: &str) -> Result<(), LibraryError> {
        let removed = self.conn().execute("DELETE FROM schedules WHERE id = ?1", [id])?;
        if removed == 0 {
            return Err(LibraryError::NotFound(format!("schedule {id}")));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ScheduleItemInput;
    use serde_json::json;

    fn item(kind: ScheduleItemKind, title: &str, payload: serde_json::Value) -> ScheduleItemInput {
        ScheduleItemInput { id: None, kind, title: title.into(), payload }
    }

    fn sunday() -> ScheduleInput {
        ScheduleInput {
            id: None,
            name: "Sunday Service".into(),
            service_date: Some("2026-10-11".into()),
            items: vec![
                item(ScheduleItemKind::Announcement, "Welcome", json!({ "slides": 3 })),
                item(ScheduleItemKind::Song, "Amazing Grace", json!({ "song_id": "abc" })),
                item(ScheduleItemKind::Scripture, "John 3:16-18", json!({ "book": 43, "chapter": 3, "from": 16, "to": 18 })),
                item(ScheduleItemKind::Sermon, "Sermon", serde_json::Value::Null),
            ],
        }
    }

    #[test]
    fn saves_items_in_order_with_payloads() {
        let db = LibraryDb::open_in_memory().unwrap();
        let schedule = db.save_schedule(&sunday()).unwrap();

        let kinds: Vec<_> = schedule.items.iter().map(|i| i.kind).collect();
        assert_eq!(
            kinds,
            [
                ScheduleItemKind::Announcement,
                ScheduleItemKind::Song,
                ScheduleItemKind::Scripture,
                ScheduleItemKind::Sermon
            ]
        );
        assert_eq!(schedule.items[2].payload["to"], 18);
        assert_eq!(db.get_schedule(&schedule.id).unwrap(), schedule);
    }

    #[test]
    fn reordering_and_editing_replaces_items_and_keeps_ids() {
        let db = LibraryDb::open_in_memory().unwrap();
        let saved = db.save_schedule(&sunday()).unwrap();

        let mut edit = sunday();
        edit.id = Some(saved.id.clone());
        edit.items = saved
            .items
            .iter()
            .rev()
            .map(|i| ScheduleItemInput {
                id: Some(i.id.clone()),
                kind: i.kind,
                title: i.title.clone(),
                payload: i.payload.clone(),
            })
            .collect();
        let updated = db.save_schedule(&edit).unwrap();

        assert_eq!(updated.created_at, saved.created_at);
        assert_eq!(updated.items[0].id, saved.items[3].id);
        assert_eq!(updated.items[3].title, "Welcome");
    }

    #[test]
    fn lists_newest_service_first_and_undated_last() {
        let db = LibraryDb::open_in_memory().unwrap();
        let mut older = sunday();
        older.name = "Last week".into();
        older.service_date = Some("2026-10-04".into());
        let mut undated = sunday();
        undated.name = "Template".into();
        undated.service_date = None;
        db.save_schedule(&undated).unwrap();
        db.save_schedule(&older).unwrap();
        db.save_schedule(&sunday()).unwrap();

        let list = db.list_schedules().unwrap();
        let names: Vec<_> = list.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["Sunday Service", "Last week", "Template"]);
        assert_eq!(list[0].item_count, 4);
    }

    #[test]
    fn skips_item_kinds_it_does_not_know() {
        let db = LibraryDb::open_in_memory().unwrap();
        let schedule = db.save_schedule(&sunday()).unwrap();
        db.conn()
            .execute(
                "UPDATE schedule_items SET kind = 'hologram' WHERE id = ?1",
                [&schedule.items[0].id],
            )
            .unwrap();
        assert_eq!(db.get_schedule(&schedule.id).unwrap().items.len(), 3);
    }

    #[test]
    fn deleting_cascades_to_items() {
        let db = LibraryDb::open_in_memory().unwrap();
        let schedule = db.save_schedule(&sunday()).unwrap();
        db.delete_schedule(&schedule.id).unwrap();
        let left: i64 = db
            .conn()
            .query_row("SELECT COUNT(*) FROM schedule_items", [], |r| r.get(0))
            .unwrap();
        assert_eq!(left, 0);
        assert!(matches!(db.delete_schedule(&schedule.id), Err(LibraryError::NotFound(_))));
    }
}

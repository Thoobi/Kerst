import { invoke } from "@tauri-apps/api/core"
import type {
  Schedule,
  ScheduleInput,
  ScheduleSummary,
  Song,
  SongInput,
  SongSummary,
} from "@/types/library"

/** Typed wrappers for the rhema-library commands (src-tauri/src/commands/library.rs). */
export const libraryApi = {
  listSongs: () => invoke<SongSummary[]>("list_songs"),
  searchSongs: (query: string, limit?: number) =>
    invoke<SongSummary[]>("search_songs", { query, limit }),
  getSong: (id: string) => invoke<Song>("get_song", { id }),
  saveSong: (song: SongInput) => invoke<Song>("save_song", { song }),
  deleteSong: (id: string) => invoke<void>("delete_song", { id }),

  listSchedules: () => invoke<ScheduleSummary[]>("list_schedules"),
  getSchedule: (id: string) => invoke<Schedule>("get_schedule", { id }),
  saveSchedule: (schedule: ScheduleInput) => invoke<Schedule>("save_schedule", { schedule }),
  deleteSchedule: (id: string) => invoke<void>("delete_schedule", { id }),
}

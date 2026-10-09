import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import type {
  Deck,
  DeckSlide,
  DeckSummary,
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

  listDecks: () => invoke<DeckSummary[]>("list_decks"),
  getDeck: (id: string) => invoke<Deck>("get_deck", { id }),
  /** Start an import; add every slide, then finish (or delete to cancel). */
  beginDeckImport: (title: string, sourceName?: string) =>
    invoke<string>("begin_deck_import", { title, sourceName }),
  /** Append one PNG or JPEG. Sent as raw bytes, not JSON. */
  addDeckSlide: (deckId: string, image: Uint8Array) =>
    invoke<DeckSlide>("add_deck_slide", image, { headers: { "x-deck-id": deckId } }),
  finishDeckImport: (deckId: string) => invoke<Deck>("finish_deck_import", { deckId }),
  deleteDeck: (id: string) => invoke<void>("delete_deck", { id }),
}

/** The URL an <img> or the renderer loads a deck slide's image from. */
export function deckSlideUrl(path: string): string {
  return convertFileSrc(path)
}

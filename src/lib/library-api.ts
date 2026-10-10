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
  Video,
  VideoProbe,
  Text,
  TextInput,
} from "@/types/library"

/** Typed wrappers for the light-library commands (src-tauri/src/commands/library.rs). */
export const libraryApi = {
  listSongs: () => invoke<SongSummary[]>("list_songs"),
  searchSongs: (query: string, limit?: number) =>
    invoke<SongSummary[]>("search_songs", { query, limit }),
  getSong: (id: string) => invoke<Song>("get_song", { id }),
  saveSong: (song: SongInput) => invoke<Song>("save_song", { song }),
  deleteSong: (id: string) => invoke<void>("delete_song", { id }),
  /** Loop a library video behind a song's lyrics; null goes back to the theme's background. */
  setSongBackground: (id: string, videoId: string | null) =>
    invoke<Song>("set_song_background", { id, videoId }),

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

  listVideos: () => invoke<Video[]>("list_videos"),
  /**
   * Copy a video file into the library and start its import. Progress comes
   * as `library:video-import-progress` events; then set a poster and finish
   * (or delete it if this computer can't play it).
   */
  beginVideoImport: (path: string) => invoke<Video>("begin_video_import", { path }),
  /** A PNG or JPEG still for thumbnails. Sent as raw bytes, not JSON. */
  setVideoPoster: (id: string, image: Uint8Array) =>
    invoke<Video>("set_video_poster", image, { headers: { "x-video-id": id } }),
  finishVideoImport: (id: string, probe: VideoProbe) =>
    invoke<Video>("finish_video_import", { id, probe }),
  updateVideo: (id: string, changes: { title?: string; loop?: boolean }) =>
    invoke<Video>("update_video", { id, title: changes.title, looping: changes.loop }),
  deleteVideo: (id: string) => invoke<void>("delete_video", { id }),
  listTexts: () => invoke<Text[]>("list_texts"),
  saveText: (text: TextInput) => invoke<Text>("save_text", { text }),
  /** Loop a library video behind a text; null goes back to the theme's background. */
  setTextBackground: (id: string, videoId: string | null) =>
    invoke<Text>("set_text_background", { id, videoId }),
  deleteText: (id: string) => invoke<void>("delete_text", { id }),

  /** Base URL of the loopback server videos play from (src-tauri/src/media_server.rs). */
  mediaBaseUrl: () => invoke<string>("media_base_url"),
}

/** `library:video-import-progress` event payload. */
export interface VideoImportProgress {
  path: string
  copied: number
  total: number
}

/**
 * The URL an <img> or the renderer loads a library image (slide, poster)
 * from. Not for videos: WebKitGTK can't play from this scheme, see
 * `videoFileUrl`.
 */
export function libraryFileUrl(path: string): string {
  return convertFileSrc(path)
}

/** The URL an <img> or the renderer loads a deck slide's image from. */
export const deckSlideUrl = libraryFileUrl

/** The URL a <video> plays a library video from, under the media server's `base`. */
export function videoFileUrl(base: string, video: { id: string; path: string }): string {
  const file = video.path.split(/[\\/]/).pop() ?? ""
  return `${base}/${encodeURIComponent(video.id)}/${encodeURIComponent(file)}`
}

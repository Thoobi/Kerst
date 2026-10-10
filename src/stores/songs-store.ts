import { create } from "zustand"
import { libraryApi } from "@/lib/library-api"
import { songSlides, toLyricSlide, type SongSlide } from "@/lib/song-slides"
import { toRenderData } from "@/lib/slides"
import { decodeSongFile, parseSongFile } from "@/lib/song-formats"
import { useBroadcastStore } from "./broadcast-store"
import { usePreviewStore } from "./preview-store"
import { backgroundPlayback } from "./videos-store"
import type { Song, SongInput, SongSummary, VerseRenderData } from "@/types"

export interface SongImportOutcome {
  imported: Song[]
  /** Titles skipped because the library already has them. */
  duplicates: string[]
  failed: { file: string; reason: string }[]
}

/** Same title and CCLI number: the same song, however it was imported. */
const songKey = (title: string, ccli: string | null | undefined) =>
  `${title.trim().toLowerCase()}|${ccli?.trim() ?? ""}`

interface SongsState {
  /** Songs matching `query` (every song when it is empty). */
  results: SongSummary[]
  query: string
  activeSong: Song | null
  /** The open song's screens, in sung order. */
  slides: SongSlide[]
  /** The screen the operator last sent live. */
  cursor: number | null
  /** What this tab last sent live, to tell whether it is still on air. */
  presented: VerseRenderData | null
  /** Why the library could not be read, e.g. it is unavailable. */
  loadError: string | null

  search: (query: string) => Promise<void>
  openSong: (id: string) => Promise<void>
  presentSlide: (index: number) => void
  /** Move by `delta` screens and present; stops at the ends. */
  step: (delta: number) => void
  /** Jump to the first screen of the next sung section with this code. */
  jumpToSection: (code: string) => void
  saveSong: (song: SongInput) => Promise<Song>
  /** Read song files (OpenLyrics, SongSelect, ChordPro, text) into the library. */
  importFiles: (files: File[]) => Promise<SongImportOutcome>
  deleteSong: (id: string) => Promise<void>
  /** Loop a library video behind the open song's lyrics, or go back to the theme's background. */
  setBackground: (videoId: string | null) => Promise<void>
}

// Searches resolve out of order when typing fast; only the newest may land.
let searchSeq = 0

export const useSongsStore = create<SongsState>((set, get) => ({
  results: [],
  query: "",
  activeSong: null,
  slides: [],
  cursor: null,
  presented: null,
  loadError: null,

  search: async (query) => {
    const seq = ++searchSeq
    set({ query })
    try {
      const results = query.trim()
        ? await libraryApi.searchSongs(query)
        : await libraryApi.listSongs()
      if (seq === searchSeq) set({ results, loadError: null })
    } catch (error) {
      if (seq === searchSeq) set({ loadError: String(error) })
    }
  },

  openSong: async (id) => {
    const song = await libraryApi.getSong(id)
    set({ activeSong: song, slides: songSlides(song), cursor: null })
  },

  presentSlide: (index) => {
    const { activeSong, slides } = get()
    const slide = slides[index]
    if (!activeSong || !slide) return
    const content = toRenderData({
      ...toLyricSlide(activeSong, slide),
      background: backgroundPlayback(activeSong.background_video_id),
    })
    // Like a manual Bible pick, a lyric goes live and the preview follows.
    set({ cursor: index, presented: content })
    usePreviewStore.getState().show(content)
    useBroadcastStore.getState().setLiveVerse(content)
  },

  step: (delta) => {
    const { slides, cursor } = get()
    if (slides.length === 0) return
    const next =
      cursor === null ? 0 : Math.min(slides.length - 1, Math.max(0, cursor + delta))
    if (next !== cursor) get().presentSlide(next)
  },

  jumpToSection: (code) => {
    const { slides, cursor } = get()
    const wanted = code.toUpperCase()
    const currentOrder = cursor === null ? -1 : slides[cursor].order
    // Section starts with this code, preferring the next one after the
    // current screen so pressing C again goes to the next chorus.
    const starts = slides
      .map((slide, index) => ({ slide, index }))
      .filter(({ slide }) => slide.page === 0 && slide.code.toUpperCase() === wanted)
    const target = starts.find(({ slide }) => slide.order > currentOrder) ?? starts[0]
    if (target) get().presentSlide(target.index)
  },

  saveSong: async (input) => {
    const song = await libraryApi.saveSong(input)
    // Keep the operator's place when the open song is edited.
    if (get().activeSong?.id === song.id) {
      const slides = songSlides(song)
      const cursor = get().cursor
      set({
        activeSong: song,
        slides,
        cursor: cursor !== null && cursor < slides.length ? cursor : null,
      })
    }
    await get().search(get().query)
    return song
  },

  importFiles: async (files) => {
    const outcome: SongImportOutcome = { imported: [], duplicates: [], failed: [] }
    const existing = await libraryApi.listSongs()
    const known = new Set(existing.map((s) => songKey(s.title, s.ccli_number)))
    for (const file of files) {
      try {
        const input = parseSongFile(file.name, decodeSongFile(new Uint8Array(await file.arrayBuffer())))
        const key = songKey(input.title, input.ccli_number)
        if (known.has(key)) {
          outcome.duplicates.push(input.title)
          continue
        }
        const song = await libraryApi.saveSong(input)
        known.add(key)
        outcome.imported.push(song)
      } catch (error) {
        outcome.failed.push({ file: file.name, reason: error instanceof Error ? error.message : String(error) })
      }
    }
    await get().search(get().query)
    const first = outcome.imported[0]
    if (outcome.imported.length === 1 && first) await get().openSong(first.id)
    return outcome
  },

  setBackground: async (videoId) => {
    const song = get().activeSong
    if (!song) return
    const updated = await libraryApi.setSongBackground(song.id, videoId)
    if (get().activeSong?.id !== updated.id) return
    set({ activeSong: updated })
    // If this song is on air, swap the background there too.
    const { presented, cursor } = get()
    if (cursor !== null && presented !== null && useBroadcastStore.getState().liveVerse === presented) {
      get().presentSlide(cursor)
    }
  },

  deleteSong: async (id) => {
    await libraryApi.deleteSong(id)
    if (get().activeSong?.id === id) set({ activeSong: null, slides: [], cursor: null })
    await get().search(get().query)
  },
}))

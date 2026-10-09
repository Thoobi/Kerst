import { create } from "zustand"
import { libraryApi } from "@/lib/library-api"
import { songSlides, toLyricSlide, type SongSlide } from "@/lib/song-slides"
import { toRenderData } from "@/lib/slides"
import { useBroadcastStore } from "./broadcast-store"
import { usePreviewStore } from "./preview-store"
import type { Song, SongInput, SongSummary, VerseRenderData } from "@/types"

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
  deleteSong: (id: string) => Promise<void>
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
    const content = toRenderData(toLyricSlide(activeSong, slide))
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

  deleteSong: async (id) => {
    await libraryApi.deleteSong(id)
    if (get().activeSong?.id === id) set({ activeSong: null, slides: [], cursor: null })
    await get().search(get().query)
  },
}))

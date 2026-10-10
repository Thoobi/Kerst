import { create } from "zustand"
import { libraryApi } from "@/lib/library-api"
import { lyricPages } from "@/lib/song-slides"
import { toRenderData } from "@/lib/slides"
import { useBroadcastStore } from "./broadcast-store"
import { usePreviewStore } from "./preview-store"
import { backgroundPlayback } from "./videos-store"
import type { Text, TextInput, VerseRenderData } from "@/types"

/**
 * A text's screens: split at blank lines, long blocks split evenly, exactly
 * like song lyrics.
 */
export function textScreens(body: string): string[][] {
  return lyricPages(body)
}

interface TextsState {
  texts: Text[]
  activeText: Text | null
  /** The open text's screens, each a list of lines. */
  screens: string[][]
  /** The screen the operator last sent live. */
  cursor: number | null
  /** What this tab last sent live, to tell whether it is still on air. */
  presented: VerseRenderData | null
  loadError: string | null

  loadTexts: () => Promise<void>
  openText: (id: string) => void
  presentScreen: (index: number) => void
  /** Move by `delta` screens and present; stops at the ends. */
  step: (delta: number) => void
  saveText: (input: TextInput) => Promise<Text>
  deleteText: (id: string) => Promise<void>
  /** Loop a library video behind the open text, or go back to the theme's background. */
  setBackground: (videoId: string | null) => Promise<void>
}

export const useTextsStore = create<TextsState>((set, get) => ({
  texts: [],
  activeText: null,
  screens: [],
  cursor: null,
  presented: null,
  loadError: null,

  loadTexts: async () => {
    try {
      const texts = await libraryApi.listTexts()
      set({ texts, loadError: null })
      // Keep the open text in step with what was saved.
      const open = get().activeText
      if (open) {
        const fresh = texts.find((t) => t.id === open.id) ?? null
        set({ activeText: fresh, screens: fresh ? textScreens(fresh.body) : [] })
      }
    } catch (error) {
      set({ loadError: String(error) })
    }
  },

  openText: (id) => {
    const text = get().texts.find((t) => t.id === id)
    if (!text) return
    set({ activeText: text, screens: textScreens(text.body), cursor: null })
  },

  presentScreen: (index) => {
    const { activeText, screens } = get()
    const lines = screens[index]
    if (!activeText || !lines) return
    const content = toRenderData({
      kind: "text",
      textId: activeText.id,
      title: activeText.title,
      lines,
      background: backgroundPlayback(activeText.background_video_id),
    })
    set({ cursor: index, presented: content })
    usePreviewStore.getState().show(content)
    useBroadcastStore.getState().setLiveVerse(content)
  },

  step: (delta) => {
    const { screens, cursor } = get()
    if (screens.length === 0) return
    const next = cursor === null ? 0 : Math.min(screens.length - 1, Math.max(0, cursor + delta))
    if (next !== cursor) get().presentScreen(next)
  },

  saveText: async (input) => {
    const text = await libraryApi.saveText(input)
    await get().loadTexts()
    if (!input.id) get().openText(text.id)
    return text
  },

  deleteText: async (id) => {
    await libraryApi.deleteText(id)
    if (get().activeText?.id === id) set({ activeText: null, screens: [], cursor: null })
    await get().loadTexts()
  },

  setBackground: async (videoId) => {
    const text = get().activeText
    if (!text) return
    const updated = await libraryApi.setTextBackground(text.id, videoId)
    set((s) => ({
      texts: s.texts.map((t) => (t.id === updated.id ? updated : t)),
      activeText: s.activeText?.id === updated.id ? updated : s.activeText,
    }))
    // If this text is on air, swap the background there too.
    const { presented, cursor } = get()
    if (cursor !== null && presented !== null && useBroadcastStore.getState().liveVerse === presented) {
      get().presentScreen(cursor)
    }
  },
}))

import { create } from "zustand"
import { useBibleStore } from "./bible-store"
import type { Verse, VerseRenderData } from "@/types"

/**
 * What the Preview panel shows instead of the selected Bible verse: the
 * slide or lyric screen last clicked or stepped to in another tab. Picking
 * Bible content again hands the preview back.
 */
interface PreviewState {
  content: VerseRenderData | null
  show: (content: VerseRenderData) => void
  clear: () => void
}

export const usePreviewStore = create<PreviewState>((set) => ({
  content: null,
  show: (content) => set({ content }),
  clear: () => set({ content: null }),
}))

/**
 * A new Bible selection (a clicked verse, a detection, navigation) takes the
 * preview back. A translation switch only re-fetches the same verse in
 * another translation, so it leaves the preview alone.
 */
export function isNewBibleSelection(next: Verse | null, prev: Verse | null): boolean {
  if (next === prev || !next) return false
  const sameReference =
    prev !== null &&
    next.book_number === prev.book_number &&
    next.chapter === prev.chapter &&
    next.verse === prev.verse
  return !(sameReference && next.translation_id !== prev.translation_id)
}

useBibleStore.subscribe((state, prev) => {
  if (
    usePreviewStore.getState().content &&
    isNewBibleSelection(state.selectedVerse, prev.selectedVerse)
  ) {
    usePreviewStore.getState().clear()
  }
})

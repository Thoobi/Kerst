import { create } from "zustand"

/** The content tabs, in the order they're shown. */
export type ContentTab = "bible" | "songs" | "slides" | "videos" | "texts" | "timer"

/**
 * Which content tab is showing. A store rather than local state so the
 * service order can open an item in its tab.
 */
interface ContentTabState {
  tab: ContentTab
  setTab: (tab: ContentTab) => void
  /** The Bible style panel is showing in place of detections. */
  bibleStyleOpen: boolean
  setBibleStyleOpen: (open: boolean) => void
}

export const useContentTabStore = create<ContentTabState>((set) => ({
  tab: "bible",
  setTab: (tab) => set({ tab }),
  bibleStyleOpen: false,
  setBibleStyleOpen: (bibleStyleOpen) => set({ bibleStyleOpen }),
}))

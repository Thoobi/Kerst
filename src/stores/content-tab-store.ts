import { create } from "zustand"

/** The content tabs, in the order they're shown. */
export type ContentTab = "bible" | "songs" | "slides" | "videos" | "texts"

/**
 * Which content tab is showing. A store rather than local state so the
 * service order can open an item in its tab.
 */
interface ContentTabState {
  tab: ContentTab
  setTab: (tab: ContentTab) => void
}

export const useContentTabStore = create<ContentTabState>((set) => ({
  tab: "bible",
  setTab: (tab) => set({ tab }),
}))

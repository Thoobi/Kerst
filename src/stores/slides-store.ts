import { create } from "zustand"
import { deckSlideUrl, libraryApi } from "@/lib/library-api"
import { importImages, importPdf, planImport, type ImportProgress } from "@/lib/deck-import"
import { toRenderData } from "@/lib/slides"
import { useBroadcastStore } from "./broadcast-store"
import { usePreviewStore } from "./preview-store"
import type { Deck, DeckSummary } from "@/types"

export interface ImportOutcome {
  imported: Deck[]
  /** PowerPoint / Keynote files: they need saving as PDF first. */
  needsPdf: string[]
  unsupported: string[]
  /** Set when an import failed part-way; earlier decks still imported. */
  error: string | null
  cancelled: boolean
}

interface SlidesState {
  decks: DeckSummary[]
  activeDeck: Deck | null
  /** The slide the operator last sent live from the open deck. */
  cursor: number | null
  importing: ImportProgress | null
  /** Why the deck list could not load, e.g. the library is unavailable. */
  loadError: string | null

  loadDecks: () => Promise<void>
  openDeck: (id: string) => Promise<void>
  presentSlide: (index: number) => void
  /** Move the cursor by `delta` slides and present it; stops at the ends. */
  step: (delta: number) => void
  importFiles: (files: File[]) => Promise<ImportOutcome>
  cancelImport: () => void
  deleteDeck: (id: string) => Promise<void>
}

let importAbort: AbortController | null = null

export const useSlidesStore = create<SlidesState>((set, get) => ({
  decks: [],
  activeDeck: null,
  cursor: null,
  importing: null,
  loadError: null,

  loadDecks: async () => {
    try {
      const decks = await libraryApi.listDecks()
      set({ decks, loadError: null })
      const { activeDeck } = get()
      // Keep the open deck if it still exists, otherwise open the newest.
      if (!activeDeck || !decks.some((d) => d.id === activeDeck.id)) {
        if (decks.length > 0) await get().openDeck(decks[0].id)
        else set({ activeDeck: null, cursor: null })
      }
    } catch (error) {
      set({ loadError: String(error) })
    }
  },

  openDeck: async (id) => {
    const deck = await libraryApi.getDeck(id)
    set({ activeDeck: deck, cursor: null })
  },

  presentSlide: (index) => {
    const deck = get().activeDeck
    const slide = deck?.slides[index]
    if (!deck || !slide) return
    const content = toRenderData({
      kind: "image",
      url: deckSlideUrl(slide.path),
      title: `${deck.title} · ${index + 1}`,
    })
    // Like a manual Bible pick, a slide goes live and the preview follows.
    set({ cursor: index })
    usePreviewStore.getState().show(content)
    useBroadcastStore.getState().setLiveVerse(content)
  },

  step: (delta) => {
    const { activeDeck, cursor } = get()
    if (!activeDeck || activeDeck.slides.length === 0) return
    // Nothing presented yet: the first step lands on the first slide.
    const next =
      cursor === null
        ? 0
        : Math.min(activeDeck.slides.length - 1, Math.max(0, cursor + delta))
    if (next !== cursor) get().presentSlide(next)
  },

  importFiles: async (files) => {
    const plan = planImport(files)
    const outcome: ImportOutcome = {
      imported: [],
      needsPdf: plan.presentations.map((f) => f.name),
      unsupported: plan.unsupported.map((f) => f.name),
      error: null,
      cancelled: false,
    }
    importAbort?.abort()
    const abort = new AbortController()
    importAbort = abort
    const onProgress = (importing: ImportProgress) => set({ importing })

    try {
      for (const pdf of plan.pdfs) {
        outcome.imported.push(await importPdf(pdf, onProgress, abort.signal))
      }
      if (plan.images.length > 0) {
        outcome.imported.push(await importImages(plan.images, onProgress, abort.signal))
      }
    } catch (error) {
      if (abort.signal.aborted) outcome.cancelled = true
      else outcome.error = error instanceof Error ? error.message : String(error)
    } finally {
      if (importAbort === abort) importAbort = null
      set({ importing: null })
    }

    await get().loadDecks()
    const last = outcome.imported.at(-1)
    if (last) await get().openDeck(last.id)
    return outcome
  },

  cancelImport: () => importAbort?.abort(),

  deleteDeck: async (id) => {
    await libraryApi.deleteDeck(id)
    if (get().activeDeck?.id === id) {
      set({ activeDeck: null, cursor: null })
      // Its images are gone; don't leave one in the preview.
      if (usePreviewStore.getState().content?.image) usePreviewStore.getState().clear()
    }
    await get().loadDecks()
  },
}))


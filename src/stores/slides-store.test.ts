import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Deck, DeckSummary } from "@/types"

const api = {
  listDecks: vi.fn<() => Promise<DeckSummary[]>>(),
  getDeck: vi.fn<(id: string) => Promise<Deck>>(),
  deleteDeck: vi.fn<(id: string) => Promise<void>>(),
}

vi.mock("@tauri-apps/api/event", () => ({ emitTo: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/library-api", () => ({
  libraryApi: api,
  deckSlideUrl: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
}))

const deck: Deck = {
  id: "d1",
  title: "Welcome",
  source_name: "Welcome.pdf",
  slides: [0, 1, 2].map((i) => ({ id: `s${i}`, path: `/decks/d1/s${i}.png`, width: 1920, height: 1080 })),
  created_at: 0,
  updated_at: 0,
}
const summary: DeckSummary = {
  id: "d1",
  title: "Welcome",
  source_name: "Welcome.pdf",
  slide_count: 3,
  cover_path: "/decks/d1/s0.png",
  updated_at: 0,
}

async function stores() {
  const { useSlidesStore } = await import("./slides-store")
  const { useBroadcastStore } = await import("./broadcast-store")
  return { slides: useSlidesStore, broadcast: useBroadcastStore }
}

describe("slides store", () => {
  beforeEach(() => {
    vi.resetModules()
    api.listDecks.mockReset().mockResolvedValue([summary])
    api.getDeck.mockReset().mockResolvedValue(deck)
    api.deleteDeck.mockReset().mockResolvedValue()
  })

  it("opens the newest deck when the list loads", async () => {
    const { slides } = await stores()
    await slides.getState().loadDecks()
    expect(slides.getState().decks).toEqual([summary])
    expect(slides.getState().activeDeck?.id).toBe("d1")
  })

  it("reports a library that cannot load instead of throwing", async () => {
    api.listDecks.mockRejectedValue("Song library unavailable: disk full")
    const { slides } = await stores()
    await slides.getState().loadDecks()
    expect(slides.getState().loadError).toContain("disk full")
  })

  it("presents a slide as a full-frame image on the live output", async () => {
    const { slides, broadcast } = await stores()
    await slides.getState().openDeck("d1")
    slides.getState().presentSlide(1)

    expect(slides.getState().cursor).toBe(1)
    expect(broadcast.getState().liveVerse).toEqual({
      reference: "Welcome · 2",
      segments: [],
      image: { url: `asset://localhost/${encodeURIComponent("/decks/d1/s1.png")}` },
    })
  })

  it("steps from nothing to the first slide, then forward and back, stopping at the ends", async () => {
    const { slides } = await stores()
    await slides.getState().openDeck("d1")
    const cursorAfter = (delta: number) => {
      slides.getState().step(delta)
      return slides.getState().cursor
    }
    expect(cursorAfter(1)).toBe(0)
    expect(cursorAfter(1)).toBe(1)
    expect(cursorAfter(1)).toBe(2)
    expect(cursorAfter(1)).toBe(2)
    expect(cursorAfter(-1)).toBe(1)
    expect(cursorAfter(-5)).toBe(0)
  })

  it("does not touch the live output when stepping past the end", async () => {
    const { slides, broadcast } = await stores()
    await slides.getState().openDeck("d1")
    slides.getState().presentSlide(2)
    const live = broadcast.getState().liveVerse
    slides.getState().step(1)
    expect(broadcast.getState().liveVerse).toBe(live)
  })

  it("closes a deleted deck and reloads the list", async () => {
    const { slides } = await stores()
    await slides.getState().loadDecks()
    api.listDecks.mockResolvedValue([])
    await slides.getState().deleteDeck("d1")
    expect(api.deleteDeck).toHaveBeenCalledWith("d1")
    expect(slides.getState().activeDeck).toBeNull()
  })

  it("refuses PowerPoint and unknown files without importing anything", async () => {
    const { slides } = await stores()
    const outcome = await slides
      .getState()
      .importFiles([new File([], "Sunday.pptx"), new File([], "song.mp3")])
    expect(outcome).toMatchObject({
      imported: [],
      needsPdf: ["Sunday.pptx"],
      unsupported: ["song.mp3"],
      error: null,
      cancelled: false,
    })
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"
import { defaultStreamSettings } from "@/types"

const emitToMock = vi.fn()

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: emitToMock,
}))

const bibleVerse = {
  reference: "John 3:16",
  segments: [{ text: "For God so loved the world", verseNumber: 16 }],
}

/** The verse last sent to each output window. */
function sentVerses(): Record<string, { timer?: unknown; reference: string } | null> {
  const sent: Record<string, { timer?: unknown; reference: string } | null> = {}
  for (const [label, , payload] of emitToMock.mock.calls) sent[label] = payload.verse
  return sent
}

describe("timer store", () => {
  beforeEach(() => {
    emitToMock.mockReset()
    emitToMock.mockResolvedValue(undefined)
    vi.resetModules()
  })

  async function twoOutputs() {
    const { useBroadcastStore } = await import("./broadcast-store")
    const { useTimerStore } = await import("./timer-store")
    const main = useBroadcastStore.getState().outputs[0]
    useBroadcastStore.getState().addOutput({
      ...main,
      id: "stream",
      name: "Stream",
      type: "stream",
      stream: defaultStreamSettings(),
    })
    useBroadcastStore.setState({ isLive: true })
    useBroadcastStore.getState().setLiveVerse(bibleVerse)
    return { useBroadcastStore, useTimerStore }
  }

  it("shows the timer on the picked output while the other keeps the Bible", async () => {
    const { useTimerStore } = await twoOutputs()
    emitToMock.mockClear()
    useTimerStore.getState().toggleOutput("main")

    const sent = sentVerses()
    expect(sent["broadcast-main"]?.timer).toBeDefined()
    expect(sent["broadcast-stream"]?.reference).toBe("John 3:16")
  })

  it("keeps the timer in place when the live verse changes", async () => {
    const { useBroadcastStore, useTimerStore } = await twoOutputs()
    useTimerStore.getState().toggleOutput("main")
    emitToMock.mockClear()
    useBroadcastStore.getState().setLiveVerse({ ...bibleVerse, reference: "John 3:17" })

    const sent = sentVerses()
    expect(sent["broadcast-main"]?.timer).toBeDefined()
    expect(sent["broadcast-stream"]?.reference).toBe("John 3:17")
  })

  it("sends a started clock to its outputs, and hiding hands them back", async () => {
    const { useTimerStore } = await twoOutputs()
    useTimerStore.getState().toggleOutput("main")
    emitToMock.mockClear()
    useTimerStore.getState().start()
    expect(sentVerses()["broadcast-main"]?.timer).toMatchObject({ running: true, direction: "down", seconds: 300 })

    emitToMock.mockClear()
    useTimerStore.getState().hide()
    expect(sentVerses()["broadcast-main"]?.reference).toBe("John 3:16")
  })

  it("pauses at the reading it has reached", async () => {
    vi.useFakeTimers()
    try {
      const { useTimerStore } = await twoOutputs()
      useTimerStore.getState().start()
      vi.advanceTimersByTime(10_000)
      useTimerStore.getState().pause()
      expect(useTimerStore.getState().clock).toMatchObject({ running: false, seconds: 290 })
    } finally {
      vi.useRealTimers()
    }
  })
})

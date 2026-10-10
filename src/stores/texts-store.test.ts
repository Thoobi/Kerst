import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Text, TextInput } from "@/types"

const api = {
  listTexts: vi.fn<() => Promise<Text[]>>(),
  saveText: vi.fn<(input: TextInput) => Promise<Text>>(),
  deleteText: vi.fn<(id: string) => Promise<void>>(),
  setTextBackground: vi.fn<(id: string, videoId: string | null) => Promise<Text>>(),
}

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(() => {}),
}))
vi.mock("@/lib/library-api", () => ({
  libraryApi: api,
  libraryFileUrl: (p: string) => p,
  videoFileUrl: (b: string, v: { id: string }) => `${b}/${v.id}`,
}))
vi.mock("@/lib/video-probe", () => ({ probeVideo: vi.fn(), UnplayableVideoError: class extends Error {} }))

const notices: Text = {
  id: "t1",
  title: "Notices",
  body: "Youth camp Friday\nSign up at the desk\n\nCoffee after the service",
  background_video_id: null,
  created_at: 0,
  updated_at: 0,
}

async function stores() {
  const { useTextsStore, textScreens } = await import("./texts-store")
  const { useBroadcastStore } = await import("./broadcast-store")
  const { usePreviewStore } = await import("./preview-store")
  return { texts: useTextsStore, textScreens, broadcast: useBroadcastStore, preview: usePreviewStore }
}

describe("texts store", () => {
  beforeEach(() => {
    vi.resetModules()
    for (const fn of Object.values(api)) fn.mockReset()
    api.listTexts.mockResolvedValue([notices])
  })

  it("splits a text into screens at blank lines", async () => {
    const { textScreens } = await stores()
    expect(textScreens(notices.body)).toEqual([
      ["Youth camp Friday", "Sign up at the desk"],
      ["Coffee after the service"],
    ])
  })

  it("puts a screen live with just the words, and steps through", async () => {
    const { texts, broadcast, preview } = await stores()
    await texts.getState().loadTexts()
    texts.getState().openText("t1")
    texts.getState().presentScreen(0)

    const live = broadcast.getState().liveVerse
    expect(live).toEqual({
      style: "lyrics",
      reference: "",
      segments: [
        { text: "Youth camp Friday", lineBreak: false },
        { text: "Sign up at the desk", lineBreak: true },
      ],
    })
    expect(preview.getState().content).toBe(live)

    texts.getState().step(1)
    expect(texts.getState().cursor).toBe(1)
    texts.getState().step(1)
    expect(texts.getState().cursor).toBe(1)
  })

  it("opens a newly created text", async () => {
    const { texts } = await stores()
    const created = { ...notices, id: "t2", title: "Welcome", body: "Hello" }
    api.saveText.mockResolvedValue(created)
    api.listTexts.mockResolvedValue([notices, created])
    await texts.getState().saveText({ title: "Welcome", body: "Hello" })
    expect(texts.getState().activeText?.id).toBe("t2")
    expect(texts.getState().screens).toEqual([["Hello"]])
  })
})

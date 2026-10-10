import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Schedule, ScheduleInput, ScheduleSummary, Text } from "@/types"

const api = {
  listSchedules: vi.fn<() => Promise<ScheduleSummary[]>>(),
  getSchedule: vi.fn<(id: string) => Promise<Schedule>>(),
  saveSchedule: vi.fn<(input: ScheduleInput) => Promise<Schedule>>(),
  deleteSchedule: vi.fn<(id: string) => Promise<void>>(),
  getSong: vi.fn(),
  listTexts: vi.fn<() => Promise<Text[]>>(),
  getDeck: vi.fn(),
}

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(() => {}),
}))
vi.mock("@/lib/library-api", () => ({
  libraryApi: api,
  libraryFileUrl: (p: string) => p,
  deckSlideUrl: (p: string) => p,
  videoFileUrl: (b: string, v: { id: string }) => `${b}/${v.id}`,
}))
vi.mock("@/lib/video-probe", () => ({ probeVideo: vi.fn(), UnplayableVideoError: class extends Error {} }))

const sunday: Schedule = {
  id: "svc",
  name: "Sunday Service",
  service_date: "2026-10-11",
  items: [],
  created_at: 0,
  updated_at: 0,
}

async function stores() {
  const service = await import("./service-store")
  const { useContentTabStore } = await import("./content-tab-store")
  const { useBibleStore } = await import("./bible-store")
  const { useTextsStore } = await import("./texts-store")
  const { useVideosStore } = await import("./videos-store")
  return { ...service, tabs: useContentTabStore, bible: useBibleStore, texts: useTextsStore, videos: useVideosStore }
}

describe("service helpers", () => {
  it("moves an item and leaves bad indexes alone", async () => {
    const { moveItem } = await stores()
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"])
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"])
    const same = ["a", "b"]
    expect(moveItem(same, 1, 1)).toBe(same)
    expect(moveItem(same, 5, 0)).toBe(same)
  })

  it("dates a new service today, in local time", async () => {
    const { todayIso } = await stores()
    expect(todayIso(new Date(2026, 0, 5))).toBe("2026-01-05")
  })
})

describe("service store", () => {
  beforeEach(() => {
    vi.resetModules()
    for (const fn of Object.values(api)) fn.mockReset()
    api.listSchedules.mockResolvedValue([
      { id: "svc", name: "Sunday Service", service_date: "2026-10-11", item_count: 0, updated_at: 0 },
    ])
    api.getSchedule.mockResolvedValue(sunday)
    api.saveSchedule.mockImplementation(async (input) => ({ ...sunday, ...input, id: input.id ?? "new" }) as Schedule)
  })

  it("opens the newest service when nothing was opened before", async () => {
    const { useServiceStore } = await stores()
    await useServiceStore.getState().loadServices()
    expect(useServiceStore.getState().active?.id).toBe("svc")
  })

  it("adds, reorders and removes items, saving the whole order each time", async () => {
    const { useServiceStore } = await stores()
    await useServiceStore.getState().loadServices()
    const store = useServiceStore.getState()
    await store.addItem({ kind: "song", title: "Way Maker", payload: { songId: "s1" } })
    await useServiceStore.getState().addItem({
      kind: "scripture",
      title: "John 3:16",
      payload: { bookNumber: 43, chapter: 3, verse: 16 },
    })
    await useServiceStore.getState().addItem({ kind: "announcement", title: "Notices", payload: { textId: "t1" } })
    const titles = () => useServiceStore.getState().active!.items.map((i) => i.title)
    expect(titles()).toEqual(["Way Maker", "John 3:16", "Notices"])

    await useServiceStore.getState().reorder(2, 0)
    expect(titles()).toEqual(["Notices", "Way Maker", "John 3:16"])
    const saved = api.saveSchedule.mock.calls.at(-1)![0]
    expect(saved.items.map((i) => i.title)).toEqual(["Notices", "Way Maker", "John 3:16"])
    // Item ids are made here and kept, so the same song twice stays two items.
    expect(new Set(saved.items.map((i) => i.id)).size).toBe(3)

    const first = useServiceStore.getState().active!.items[0].id
    await useServiceStore.getState().removeItem(first)
    expect(titles()).toEqual(["Way Maker", "John 3:16"])
  })

  it("opens items in their tab: a verse in the Bible, a video pointed out", async () => {
    const { useServiceStore, tabs, bible, videos } = await stores()
    await useServiceStore.getState().loadServices()
    await useServiceStore.getState().addItem({
      kind: "scripture",
      title: "John 3:16",
      payload: { bookNumber: 43, chapter: 3, verse: 16 },
    })
    await useServiceStore.getState().addItem({ kind: "media", title: "Countdown", payload: { videoId: "v1" } })
    const [verse, video] = useServiceStore.getState().active!.items

    await useServiceStore.getState().openItem(verse.id)
    expect(tabs.getState().tab).toBe("bible")
    expect(bible.getState().pendingNavigation).toMatchObject({ bookNumber: 43, chapter: 3, verse: 16 })
    expect(useServiceStore.getState().activeItemId).toBe(verse.id)

    await useServiceStore.getState().openItem(video.id)
    expect(tabs.getState().tab).toBe("videos")
    expect(videos.getState().focusedId).toBe("v1")
  })

  it("says so when a text in the service was deleted from the library", async () => {
    const { useServiceStore } = await stores()
    api.listTexts.mockResolvedValue([])
    await useServiceStore.getState().loadServices()
    await useServiceStore.getState().addItem({ kind: "announcement", title: "Gone", payload: { textId: "t9" } })
    const item = useServiceStore.getState().active!.items[0]
    await expect(useServiceStore.getState().openItem(item.id)).rejects.toThrow("no longer in the library")
  })

  it("creates a service and opens it", async () => {
    const { useServiceStore } = await stores()
    await useServiceStore.getState().createService("Evening Service", "2026-10-11")
    expect(api.saveSchedule).toHaveBeenCalledWith({ name: "Evening Service", service_date: "2026-10-11", items: [] })
    expect(useServiceStore.getState().active?.name).toBe("Evening Service")
  })
})

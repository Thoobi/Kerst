import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Song, SongInput, SongSummary } from "@/types"

const api = {
  listSongs: vi.fn<() => Promise<SongSummary[]>>(),
  searchSongs: vi.fn<(query: string) => Promise<SongSummary[]>>(),
  getSong: vi.fn<(id: string) => Promise<Song>>(),
  saveSong: vi.fn<(song: SongInput) => Promise<Song>>(),
  deleteSong: vi.fn<(id: string) => Promise<void>>(),
}

vi.mock("@tauri-apps/api/event", () => ({ emitTo: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/library-api", () => ({ libraryApi: api }))

const song: Song = {
  id: "s1",
  title: "Amazing Grace",
  author: "John Newton",
  copyright: null,
  ccli_number: null,
  sections: [
    { id: "v1", kind: "verse", label: "Verse 1", lyrics: "Amazing grace\n\nHow sweet the sound" },
    { id: "c", kind: "chorus", label: "Chorus", lyrics: "My chains are gone" },
    { id: "v2", kind: "verse", label: "Verse 2", lyrics: "Twas grace" },
  ],
  arrangement: ["v1", "c", "v2", "c"],
  source: "manual",
  created_at: 0,
  updated_at: 0,
}
const summary: SongSummary = {
  id: "s1",
  title: "Amazing Grace",
  author: "John Newton",
  ccli_number: null,
  first_line: "Amazing grace",
  updated_at: 0,
}

async function stores() {
  const { useSongsStore } = await import("./songs-store")
  const { useBroadcastStore } = await import("./broadcast-store")
  const { usePreviewStore } = await import("./preview-store")
  return { songs: useSongsStore, broadcast: useBroadcastStore, preview: usePreviewStore }
}

describe("songs store", () => {
  beforeEach(() => {
    vi.resetModules()
    api.listSongs.mockReset().mockResolvedValue([summary])
    api.searchSongs.mockReset().mockResolvedValue([summary])
    api.getSong.mockReset().mockResolvedValue(song)
    api.saveSong.mockReset().mockImplementation(async () => song)
    api.deleteSong.mockReset().mockResolvedValue()
  })

  it("lists every song for an empty query and searches otherwise", async () => {
    const { songs } = await stores()
    await songs.getState().search("")
    expect(api.listSongs).toHaveBeenCalled()
    await songs.getState().search("grace")
    expect(api.searchSongs).toHaveBeenCalledWith("grace")
    expect(songs.getState().results).toEqual([summary])
  })

  it("lets only the newest search land when results arrive out of order", async () => {
    let resolveSlow: (v: SongSummary[]) => void = () => {}
    api.searchSongs
      .mockImplementationOnce(() => new Promise((r) => (resolveSlow = r)))
      .mockResolvedValueOnce([])
    const { songs } = await stores()
    const slow = songs.getState().search("gr")
    await songs.getState().search("grace x")
    resolveSlow([summary])
    await slow
    expect(songs.getState().results).toEqual([])
  })

  it("opens a song into screens in sung order", async () => {
    const { songs } = await stores()
    await songs.getState().openSong("s1")
    expect(songs.getState().slides.map((s) => s.code)).toEqual(["V1", "V1", "C", "V2", "C"])
  })

  it("puts a screen on live and in the preview, lines on their own lines", async () => {
    const { songs, broadcast, preview } = await stores()
    await songs.getState().openSong("s1")
    songs.getState().presentSlide(2)
    const live = broadcast.getState().liveVerse
    expect(live?.segments).toEqual([{ text: "My chains are gone", lineBreak: false }])
    expect(live?.reference).toBe("John Newton")
    expect(preview.getState().content).toBe(live)
  })

  it("steps through and stops at the ends", async () => {
    const { songs } = await stores()
    await songs.getState().openSong("s1")
    const after = (delta: number) => {
      songs.getState().step(delta)
      return songs.getState().cursor
    }
    expect(after(1)).toBe(0)
    expect(after(10)).toBe(4)
    expect(after(1)).toBe(4)
    expect(after(-1)).toBe(3)
  })

  it("jumps to the next chorus each time, then wraps to the first", async () => {
    const { songs } = await stores()
    await songs.getState().openSong("s1")
    const jump = (code: string) => {
      songs.getState().jumpToSection(code)
      return songs.getState().cursor
    }
    expect(jump("c")).toBe(2)
    expect(jump("C")).toBe(4)
    expect(jump("C")).toBe(2)
    expect(jump("v2")).toBe(3)
    expect(jump("B")).toBe(3) // no bridge: stay put
  })

  it("keeps the operator's place when the open song is saved", async () => {
    const { songs } = await stores()
    await songs.getState().openSong("s1")
    songs.getState().presentSlide(3)
    await songs.getState().saveSong({ id: "s1", title: "Amazing Grace", sections: [] })
    expect(songs.getState().cursor).toBe(3)
  })

  it("closes a deleted song", async () => {
    const { songs } = await stores()
    await songs.getState().openSong("s1")
    await songs.getState().deleteSong("s1")
    expect(songs.getState().activeSong).toBeNull()
    expect(songs.getState().slides).toEqual([])
  })
})

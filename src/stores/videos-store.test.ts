import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Video, VideoProbe } from "@/types"

const api = {
  listVideos: vi.fn<() => Promise<Video[]>>(),
  beginVideoImport: vi.fn<(path: string) => Promise<Video>>(),
  setVideoPoster: vi.fn<(id: string, image: Uint8Array) => Promise<Video>>(),
  finishVideoImport: vi.fn<(id: string, probe: VideoProbe) => Promise<Video>>(),
  updateVideo: vi.fn<(id: string, changes: { title?: string; loop?: boolean }) => Promise<Video>>(),
  deleteVideo: vi.fn<(id: string) => Promise<void>>(),
  mediaBaseUrl: vi.fn<() => Promise<string>>(),
}
const probeVideo = vi.fn()

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(() => {}),
}))
vi.mock("@/lib/library-api", () => ({
  libraryApi: api,
  libraryFileUrl: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  videoFileUrl: (base: string, video: { id: string }) => `${base}/${video.id}/video.mp4`,
}))
vi.mock("@/lib/video-probe", async () => {
  class UnplayableVideoError extends Error {}
  return { probeVideo, UnplayableVideoError }
})

const countdown: Video = {
  id: "v1",
  title: "Countdown",
  source_name: "Countdown.mp4",
  path: "/videos/v1/video.mp4",
  poster_path: "/videos/v1/poster.jpg",
  duration_ms: 60_000,
  width: 1920,
  height: 1080,
  loop: false,
  created_at: 0,
  updated_at: 0,
}

async function stores() {
  const { useVideosStore, livePlayback } = await import("./videos-store")
  const { useBroadcastStore } = await import("./broadcast-store")
  const { usePreviewStore } = await import("./preview-store")
  const { UnplayableVideoError } = await import("@/lib/video-probe")
  return { videos: useVideosStore, broadcast: useBroadcastStore, preview: usePreviewStore, livePlayback, UnplayableVideoError }
}

describe("videos store", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers({ now: 1_000_000 })
    for (const fn of Object.values(api)) fn.mockReset()
    api.listVideos.mockResolvedValue([countdown])
    api.mediaBaseUrl.mockResolvedValue("http://127.0.0.1:4321/token/videos")
    probeVideo.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it("cues a video at the start when off air, and plays it when on air", async () => {
    const { videos, broadcast, preview, livePlayback } = await stores()
    await videos.getState().loadVideos()

    videos.getState().presentVideo("v1")
    expect(livePlayback()).toMatchObject({ id: "v1", playing: false, position: 0, duration: 60 })
    expect(broadcast.getState().liveVerse?.reference).toBe("Countdown")
    expect(preview.getState().content?.video?.id).toBe("v1")

    broadcast.getState().setLive(true)
    videos.getState().presentVideo("v1")
    expect(livePlayback()).toMatchObject({
      playing: true,
      url: "http://127.0.0.1:4321/token/videos/v1/video.mp4",
      poster: `asset://localhost/${encodeURIComponent("/videos/v1/poster.jpg")}`,
    })
  })

  it("pauses, resumes and seeks the live clock", async () => {
    const { videos, broadcast, livePlayback } = await stores()
    await videos.getState().loadVideos()
    broadcast.getState().setLive(true)
    videos.getState().presentVideo("v1")

    vi.advanceTimersByTime(10_000)
    videos.getState().togglePlay()
    expect(livePlayback()).toMatchObject({ playing: false, position: 10 })

    videos.getState().seekTo(30)
    videos.getState().togglePlay()
    expect(livePlayback()).toMatchObject({ playing: true, position: 30 })

    videos.getState().restart()
    expect(livePlayback()).toMatchObject({ playing: true, position: 0 })
  })

  it("holds the last frame when a non-looping video ends", async () => {
    const { videos, broadcast, livePlayback } = await stores()
    await videos.getState().loadVideos()
    broadcast.getState().setLive(true)
    videos.getState().presentVideo("v1")

    vi.advanceTimersByTime(60_000)
    expect(livePlayback()).toMatchObject({ playing: false, position: 60 })
    // Play after the end starts again from the top.
    videos.getState().togglePlay()
    expect(livePlayback()).toMatchObject({ playing: true, position: 0 })
  })

  it("keeps looping without stopping, and the loop setting reaches the live clock", async () => {
    const { videos, broadcast, livePlayback } = await stores()
    api.listVideos.mockResolvedValue([{ ...countdown, loop: true }])
    await videos.getState().loadVideos()
    broadcast.getState().setLive(true)
    videos.getState().presentVideo("v1")
    vi.advanceTimersByTime(150_000)
    expect(livePlayback()).toMatchObject({ playing: true, loop: true })

    api.updateVideo.mockResolvedValue({ ...countdown, loop: false })
    await videos.getState().setLoop("v1", false)
    expect(api.updateVideo).toHaveBeenCalledWith("v1", { loop: false })
    expect(videos.getState().videos[0].loop).toBe(false)
    // 150s into a 60s loop is 30s in; it carries on from there.
    expect(livePlayback()).toMatchObject({ loop: false, position: 30, playing: true })
  })

  it("stops when other content goes live", async () => {
    const { videos, broadcast, livePlayback } = await stores()
    await videos.getState().loadVideos()
    broadcast.getState().setLive(true)
    videos.getState().presentVideo("v1")
    broadcast.getState().setLiveVerse({ reference: "John 3:16", segments: [{ text: "For God" }] })
    expect(livePlayback()).toBeNull()
    // Its end timer must not resurrect it.
    vi.advanceTimersByTime(60_000)
    expect(broadcast.getState().liveVerse?.reference).toBe("John 3:16")
  })

  it("takes a deleted video off air and out of the preview", async () => {
    const { videos, broadcast, preview } = await stores()
    await videos.getState().loadVideos()
    videos.getState().presentVideo("v1")
    api.deleteVideo.mockResolvedValue()
    await videos.getState().deleteVideo("v1")
    expect(broadcast.getState().liveVerse).toBeNull()
    expect(preview.getState().content).toBeNull()
    expect(videos.getState().videos).toEqual([])
  })

  it("imports playable files and deletes the copies of ones that won't play", async () => {
    const { videos, UnplayableVideoError } = await stores()
    probeVideo.mockImplementation(async (url: string) => {
      if (url.includes("bad")) throw new UnplayableVideoError("this computer can't play its format")
      return { probe: { duration_ms: 5_000, width: 1280, height: 720 }, poster: new Uint8Array([1]) }
    })
    api.beginVideoImport.mockImplementation(async (path) => {
      const id = path.endsWith("good.mp4") ? "good" : "bad"
      return { ...countdown, id, path: `/videos/${id}/video.mp4`, duration_ms: null }
    })
    api.setVideoPoster.mockResolvedValue(countdown)
    api.finishVideoImport.mockImplementation(async (id) => ({ ...countdown, id }))
    api.deleteVideo.mockResolvedValue()

    const outcome = await videos.getState().importPaths(["C:\\USB\\good.mp4", "/media/usb/bad.mkv"])
    expect(outcome.imported.map((v) => v.id)).toEqual(["good"])
    expect(outcome.unplayable).toEqual([{ file: "bad.mkv", reason: "this computer can't play its format" }])
    expect(outcome.failed).toEqual([])
    expect(api.finishVideoImport).toHaveBeenCalledWith("good", { duration_ms: 5_000, width: 1280, height: 720 })
    expect(api.deleteVideo).toHaveBeenCalledWith("bad")
    expect(videos.getState().importing).toBeNull()
  })
})

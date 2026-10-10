import { create } from "zustand"
import { listen } from "@tauri-apps/api/event"
import { libraryApi, libraryFileUrl, videoFileUrl, type VideoImportProgress } from "@/lib/library-api"
import { probeVideo, UnplayableVideoError } from "@/lib/video-probe"
import * as clock from "@/lib/video-playback"
import { useBroadcastStore } from "./broadcast-store"
import { usePreviewStore } from "./preview-store"
import type { Video, VideoPlayback, VerseRenderData } from "@/types"

export interface VideoImportOutcome {
  imported: Video[]
  /** Files this computer can't play, with the reason in the operator's words. */
  unplayable: { file: string; reason: string }[]
  failed: { file: string; reason: string }[]
}

export interface VideoImportStatus {
  /** File name being imported. */
  name: string
  /** 0-based position in the batch. */
  index: number
  count: number
  phase: "copying" | "checking"
  copied: number
  total: number
}

interface VideosState {
  videos: Video[]
  /** Why the library could not be read, e.g. it is unavailable. */
  loadError: string | null
  importing: VideoImportStatus | null
  /** Live audio level, 0–1. Only the main window makes sound. */
  volume: number
  muted: boolean
  /** Where videos play from; see `videoFileUrl`. Set by `loadVideos`. */
  mediaBase: string | null

  loadVideos: () => Promise<void>
  /** Copy video files into the library, keeping only those this computer can play. */
  importPaths: (paths: string[]) => Promise<VideoImportOutcome>
  /** Put a video on the live output: playing if on air, cued at the start if not. */
  presentVideo: (id: string) => void
  togglePlay: () => void
  seekTo: (seconds: number) => void
  restart: () => void
  /** Take the video off the live output. */
  stop: () => void
  setLoop: (id: string, loop: boolean) => Promise<void>
  rename: (id: string, title: string) => Promise<void>
  deleteVideo: (id: string) => Promise<void>
  setVolume: (volume: number) => void
  setMuted: (muted: boolean) => void
}

const fileName = (path: string) => path.split(/[\\/]/).pop() || path

/** The video on the live output, if the live output is a video. */
export function livePlayback(): VideoPlayback | null {
  return useBroadcastStore.getState().liveVerse?.video ?? null
}

/** Change the live video's clock; every output follows. */
function updateLive(change: (playback: VideoPlayback, now: number) => VideoPlayback) {
  const broadcast = useBroadcastStore.getState()
  const live = broadcast.liveVerse
  if (!live?.video) return
  broadcast.setLiveVerse({ ...live, video: change(live.video, Date.now()) })
}

export function videoContent(video: Video, mediaBase: string, playing: boolean): VerseRenderData {
  return {
    reference: video.title,
    segments: [],
    video: {
      id: video.id,
      url: videoFileUrl(mediaBase, video),
      poster: video.poster_path ? libraryFileUrl(video.poster_path) : undefined,
      duration: (video.duration_ms ?? 0) / 1000,
      loop: video.loop,
      playing,
      position: 0,
      anchor: Date.now(),
    },
  }
}

/**
 * The clock for a song's motion background: the one already on the live
 * output if it is the same video, so stepping through screens (or into
 * another song with the same background) never restarts the loop;
 * otherwise a fresh silent loop from the top. Undefined when there is no
 * background or its video isn't in the library.
 */
export function backgroundPlayback(videoId: string | null | undefined): VideoPlayback | undefined {
  if (!videoId) return undefined
  const live = useBroadcastStore.getState().liveVerse?.background
  if (live?.id === videoId) return live
  const { videos, mediaBase } = useVideosStore.getState()
  const video = videos.find((v) => v.id === videoId)
  if (!video || !mediaBase) return undefined
  return { ...videoContent(video, mediaBase, true).video!, loop: true }
}

/** Import one file: copy it in, check it plays, store its poster, finish. */
async function importOne(
  path: string,
  mediaBase: string,
  onStatus: (phase: VideoImportStatus["phase"], copied: number, total: number) => void
): Promise<Video> {
  const unlisten = await listen<VideoImportProgress>("library:video-import-progress", (event) => {
    if (event.payload.path === path) onStatus("copying", event.payload.copied, event.payload.total)
  })
  let begun: Video
  try {
    begun = await libraryApi.beginVideoImport(path)
  } finally {
    unlisten()
  }

  onStatus("checking", 0, 0)
  try {
    const { probe, poster } = await probeVideo(videoFileUrl(mediaBase, begun))
    await libraryApi.setVideoPoster(begun.id, poster)
    return await libraryApi.finishVideoImport(begun.id, probe)
  } catch (error) {
    // Don't keep a copy nobody can play.
    await libraryApi.deleteVideo(begun.id).catch(() => {})
    throw error
  }
}

export const useVideosStore = create<VideosState>((set, get) => ({
  videos: [],
  loadError: null,
  importing: null,
  volume: 1,
  muted: false,
  mediaBase: null,

  loadVideos: async () => {
    try {
      const mediaBase = get().mediaBase ?? (await libraryApi.mediaBaseUrl())
      set({ videos: await libraryApi.listVideos(), mediaBase, loadError: null })
    } catch (error) {
      set({ loadError: String(error) })
    }
  },

  importPaths: async (paths) => {
    const outcome: VideoImportOutcome = { imported: [], unplayable: [], failed: [] }
    let mediaBase: string
    try {
      mediaBase = get().mediaBase ?? (await libraryApi.mediaBaseUrl())
    } catch (error) {
      outcome.failed = paths.map((path) => ({ file: fileName(path), reason: String(error) }))
      return outcome
    }
    try {
      for (const [index, path] of paths.entries()) {
        const name = fileName(path)
        const status = (phase: VideoImportStatus["phase"], copied: number, total: number) =>
          set({ importing: { name, index, count: paths.length, phase, copied, total } })
        status("copying", 0, 0)
        try {
          outcome.imported.push(await importOne(path, mediaBase, status))
        } catch (error) {
          if (error instanceof UnplayableVideoError) {
            outcome.unplayable.push({ file: name, reason: error.message })
          } else {
            outcome.failed.push({ file: name, reason: error instanceof Error ? error.message : String(error) })
          }
        }
      }
    } finally {
      set({ importing: null })
    }
    await get().loadVideos()
    return outcome
  },

  presentVideo: (id) => {
    const { videos, mediaBase } = get()
    const video = videos.find((v) => v.id === id)
    if (!video || !mediaBase) return
    // Off air there is no sound and no picture, so don't let it run away
    // unseen: cue it, and Play starts it once the operator is ready.
    const content = videoContent(video, mediaBase, useBroadcastStore.getState().isLive)
    usePreviewStore.getState().show(content)
    useBroadcastStore.getState().setLiveVerse(content)
  },

  togglePlay: () =>
    updateLive((p, now) => (p.playing && !clock.hasEnded(p, now) ? clock.pause(p, now) : clock.play(p, now))),

  seekTo: (seconds) => updateLive((p, now) => clock.seek(p, seconds, now)),

  restart: () => updateLive((p, now) => clock.seek(p, 0, now)),

  stop: () => {
    if (!livePlayback()) return
    useBroadcastStore.getState().setLiveVerse(null)
  },

  setLoop: async (id, loop) => {
    const updated = await libraryApi.updateVideo(id, { loop })
    set((s) => ({ videos: s.videos.map((v) => (v.id === id ? updated : v)) }))
    if (livePlayback()?.id === id) updateLive((p, now) => clock.setLoop(p, loop, now))
  },

  rename: async (id, title) => {
    const updated = await libraryApi.updateVideo(id, { title })
    set((s) => ({ videos: s.videos.map((v) => (v.id === id ? updated : v)) }))
  },

  deleteVideo: async (id) => {
    await libraryApi.deleteVideo(id)
    // Its file is gone; don't leave it on air or in the preview.
    if (livePlayback()?.id === id) useBroadcastStore.getState().setLiveVerse(null)
    if (usePreviewStore.getState().content?.video?.id === id) usePreviewStore.getState().clear()
    set((s) => ({ videos: s.videos.filter((v) => v.id !== id) }))
  },

  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: false }),
  setMuted: (muted) => set({ muted }),
}))

// A video that isn't looping stops at its end: mark it paused there, so the
// outputs hold the last frame and Play starts it again from the top.
let endTimer: ReturnType<typeof setTimeout> | undefined
useBroadcastStore.subscribe((state, prev) => {
  if (state.liveVerse === prev.liveVerse) return
  clearTimeout(endTimer)
  const playback = state.liveVerse?.video
  if (!playback) return
  const now = Date.now()
  const remaining = clock.msUntilEnd(playback, now)
  if (remaining === null) return
  const endsAt = now + remaining
  endTimer = setTimeout(() => {
    // A timer can fire a hair early; pausing at the end time pins it to the last frame.
    if (livePlayback() === playback) updateLive((p, at) => clock.pause(p, Math.max(at, endsAt)))
  }, remaining)
})

import type { VideoProbe } from "@/types"

/** Widest poster frame kept; it is only ever a thumbnail. */
const POSTER_WIDTH = 640
const PROBE_TIMEOUT_MS = 20_000

/** Why a video can't be imported, worded for the operator. */
export class UnplayableVideoError extends Error {}

export interface ProbedVideo {
  probe: VideoProbe
  /** A JPEG still from a little way in, for thumbnails. */
  poster: Uint8Array
}

/**
 * Load a video the way the outputs will, to learn its length and size and to
 * grab a poster frame. Fails if this computer's webview can't play it (an
 * unsupported codec usually shows up as a load error, or as no picture).
 */
export async function probeVideo(url: string, signal?: AbortSignal): Promise<ProbedVideo> {
  const video = document.createElement("video")
  // Tauri's asset protocol is another origin; without CORS the poster
  // canvas would be tainted and couldn't be read back.
  video.crossOrigin = "anonymous"
  video.muted = true
  video.preload = "auto"
  video.playsInline = true

  try {
    video.src = url
    await waitFor(video, "loadeddata", signal)
    if (!video.videoWidth || !video.videoHeight) {
      throw new UnplayableVideoError("it has no picture this computer can show")
    }
    const duration = await knownDuration(video, signal)
    if (!(duration > 0)) throw new UnplayableVideoError("its length can't be read")

    // A little way in: many videos open on black.
    video.currentTime = Math.min(1, duration / 10)
    await waitFor(video, "seeked", signal)

    return {
      probe: {
        duration_ms: Math.round(duration * 1000),
        width: video.videoWidth,
        height: video.videoHeight,
      },
      poster: await grabFrame(video),
    }
  } finally {
    // Release the decoder and the file handle.
    video.removeAttribute("src")
    video.load()
  }
}

/**
 * Some files (WebM from screen recorders, mostly) report an infinite
 * duration until the end has been read. Seeking far past the end makes the
 * webview find it.
 */
async function knownDuration(video: HTMLVideoElement, signal?: AbortSignal): Promise<number> {
  if (Number.isFinite(video.duration)) return video.duration
  video.currentTime = Number.MAX_SAFE_INTEGER
  await waitFor(video, "durationchange", signal)
  const duration = video.duration
  video.currentTime = 0
  return Number.isFinite(duration) ? duration : 0
}

async function grabFrame(video: HTMLVideoElement): Promise<Uint8Array> {
  const scale = Math.min(1, POSTER_WIDTH / video.videoWidth)
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("could not draw the poster frame")
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85))
  if (!blob) throw new Error("could not encode the poster frame")
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * MediaError codes in the operator's words. Numbers rather than
 * `MediaError.*`, which isn't defined outside a browser (e.g. in tests).
 */
const MEDIA_ERRORS: Record<number, string> = {
  2: "it couldn't be read", // MEDIA_ERR_NETWORK
  3: "it couldn't be decoded", // MEDIA_ERR_DECODE
  4: "this computer can't play its format", // MEDIA_ERR_SRC_NOT_SUPPORTED
}

/** Resolve on `event`; reject on a media error, a timeout or `signal`. */
function waitFor(video: HTMLVideoElement, event: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener(event, onEvent)
      video.removeEventListener("error", onError)
      signal?.removeEventListener("abort", onAbort)
    }
    const onEvent = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      const { code, message } = video.error ?? { code: 0, message: "" }
      console.warn(`[video-probe] media error ${code} ${message}`)
      reject(new UnplayableVideoError(MEDIA_ERRORS[code] ?? "it couldn't be loaded"))
    }
    const onAbort = () => {
      cleanup()
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new UnplayableVideoError("it took too long to load"))
    }, PROBE_TIMEOUT_MS)
    if (signal?.aborted) return onAbort()
    video.addEventListener(event, onEvent, { once: true })
    video.addEventListener("error", onError, { once: true })
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

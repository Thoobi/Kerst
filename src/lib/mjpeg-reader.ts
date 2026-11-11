/**
 * Live pictures from network cameras (MJPEG over HTTP, as the IP Webcam app
 * and most IP cameras serve it), read by the app itself rather than left to
 * an <img>:
 *
 * - one connection per camera per window, however many places show it;
 * - the last good frame stays up through a dropout, never a black flash;
 * - a stream that stalls or drops reconnects on its own, quietly;
 * - frames are ImageBitmaps, so a canvas that must hold the pixels (NDI,
 *   the stream) draws the newest one directly.
 *
 * The bytes come through the app's loopback media server: WebKitGTK loads a
 * LAN camera's headers but won't stream its multipart body to the page.
 */

import { loadMediaBase } from "@/lib/media-base"

/** The media server's relay for the camera at `url`, or `url` itself without one. */
export function cameraRelayUrl(mediaBase: string | null, url: string): string {
  if (!mediaBase) return url
  return `${mediaBase.replace(/\/videos\/?$/, "")}/camera?url=${encodeURIComponent(url)}`
}

export type CameraState = "connecting" | "live" | "error"

type FrameListener = (frame: ImageBitmap) => void
type StateListener = (state: CameraState) => void

/** No frame for this long and the stream counts as stalled: reconnect. */
const STALL_MS = 4000
/** Waits before reconnecting, in ms; the last one repeats. */
const RETRY_DELAYS = [300, 1000, 2000, 4000]
/** Give up on a buffer that never yields a frame (not a camera, or garbage). */
const MAX_BUFFER = 8 * 1024 * 1024

/** The most camera pictures a window decodes a second. */
const MAX_DECODE_FPS = 30
/**
 * The share of a window's time decoding may take. A 1080p phone camera
 * costs ~25ms a picture on a dual-core laptop: decoding all ~26 a second
 * left the window too busy to draw, animate or answer clicks, so the band
 * stuttered and the app felt hung. A slow machine shows fewer camera
 * pictures a second instead; a fast one still shows them all.
 */
const DECODE_BUDGET = 0.35

/** How long to wait between decodes, given what one costs (ms, smoothed). */
export function decodeInterval(decodeMs: number): number {
  return Math.max(1000 / MAX_DECODE_FPS, decodeMs / DECODE_BUDGET)
}

const SOI = [0xff, 0xd8]
const EOI = [0xff, 0xd9]

function indexOf(haystack: Uint8Array, needle: number[], from = 0): number {
  const last = haystack.length - needle.length
  outer: for (let i = Math.max(0, from); i <= last; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

/**
 * Splits an MJPEG byte stream into JPEGs. Each part's Content-Length is used
 * when given (so a JPEG with an embedded thumbnail isn't cut short), else the
 * picture runs from its start marker to its end marker.
 */
export class MjpegParser {
  private buffer = new Uint8Array(0)

  push(chunk: Uint8Array): Uint8Array[] {
    const merged = new Uint8Array(this.buffer.length + chunk.length)
    merged.set(this.buffer)
    merged.set(chunk, this.buffer.length)
    this.buffer = merged

    const frames: Uint8Array[] = []
    for (;;) {
      const start = indexOf(this.buffer, SOI)
      if (start < 0) {
        // Keep a byte in case a start marker is split across chunks.
        this.buffer = this.buffer.slice(Math.max(0, this.buffer.length - 1))
        break
      }
      const length = this.contentLength(start)
      let end: number
      if (length !== null && length > 0) {
        if (this.buffer.length < start + length) break
        end = start + length
      } else {
        const eoi = indexOf(this.buffer, EOI, start + 2)
        if (eoi < 0) break
        end = eoi + 2
      }
      frames.push(this.buffer.slice(start, end))
      this.buffer = this.buffer.slice(end)
    }
    if (this.buffer.length > MAX_BUFFER) this.buffer = new Uint8Array(0)
    return frames
  }

  /** The Content-Length in the part headers just before `start`, if any. */
  private contentLength(start: number): number | null {
    const from = Math.max(0, start - 512)
    const headers = new TextDecoder("latin1").decode(this.buffer.subarray(from, start))
    const lastBoundary = headers.lastIndexOf("--")
    const match = /content-length:\s*(\d+)/i.exec(lastBoundary >= 0 ? headers.slice(lastBoundary) : headers)
    return match ? Number(match[1]) : null
  }
}

class CameraConnection {
  latest: ImageBitmap | null = null
  state: CameraState = "connecting"
  private frameListeners = new Set<FrameListener>()
  private stateListeners = new Set<StateListener>()
  private controller: AbortController | null = null
  private stopped = false
  private failures = 0
  private decoding = false
  private pending: Uint8Array | null = null
  /** When the last decode began (`performance.now()`), and what one costs, smoothed. */
  private lastDecodeAt = -Infinity
  private decodeMs = 0
  private lastFrameAt = 0
  private stallTimer: ReturnType<typeof setInterval> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  readonly url: string

  constructor(url: string) {
    this.url = url
    void this.connect()
    this.stallTimer = setInterval(() => {
      if (this.state === "live" && Date.now() - this.lastFrameAt > STALL_MS) this.controller?.abort()
    }, 1000)
  }

  get listenerCount(): number {
    return this.frameListeners.size + this.stateListeners.size
  }

  subscribe(onFrame?: FrameListener, onState?: StateListener): () => void {
    if (onFrame) this.frameListeners.add(onFrame)
    if (onState) this.stateListeners.add(onState)
    if (onFrame && this.latest) onFrame(this.latest)
    onState?.(this.state)
    return () => {
      if (onFrame) this.frameListeners.delete(onFrame)
      if (onState) this.stateListeners.delete(onState)
    }
  }

  stop(): void {
    this.stopped = true
    this.controller?.abort()
    if (this.stallTimer) clearInterval(this.stallTimer)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.latest?.close()
    this.latest = null
  }

  private setState(state: CameraState): void {
    if (state === this.state) return
    this.state = state
    for (const listener of this.stateListeners) listener(state)
  }

  private async connect(): Promise<void> {
    if (this.stopped) return
    const controller = new AbortController()
    this.controller = controller
    const parser = new MjpegParser()
    let gotFrame = false
    try {
      const source = cameraRelayUrl(await loadMediaBase(), this.url)
      const response = await fetch(source, { signal: controller.signal, cache: "no-store" })
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
      const reader = response.body.getReader()
      this.lastFrameAt = Date.now()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        for (const frame of parser.push(value)) {
          gotFrame = true
          this.failures = 0
          this.lastFrameAt = Date.now()
          this.decode(frame)
        }
      }
    } catch {
      // Dropped, stalled (aborted) or unreachable: retried below.
    }
    if (this.stopped) return
    // Keep the last frame on screen; only say "error" once it's clearly gone.
    if (!gotFrame) this.failures += 1
    if (this.failures >= 2 || !this.latest) this.setState(this.latest ? "connecting" : "error")
    const delay = RETRY_DELAYS[Math.min(this.failures, RETRY_DELAYS.length - 1)]
    this.retryTimer = setTimeout(() => void this.connect(), delay)
  }

  /**
   * Decode one JPEG at a time, no more often than this machine can afford
   * (see `DECODE_BUDGET`); pictures in between are skipped, never queued.
   */
  private decode(bytes: Uint8Array): void {
    if (this.decoding) {
      this.pending = bytes
      return
    }
    const started = performance.now()
    if (started - this.lastDecodeAt < decodeInterval(this.decodeMs)) return
    this.lastDecodeAt = started
    this.decoding = true
    createImageBitmap(new Blob([bytes as BlobPart], { type: "image/jpeg" }))
      .then((bitmap) => {
        const cost = performance.now() - started
        this.decodeMs = this.decodeMs === 0 ? cost : this.decodeMs * 0.8 + cost * 0.2
        if (this.stopped) return bitmap.close()
        const previous = this.latest
        this.latest = bitmap
        this.setState("live")
        for (const listener of this.frameListeners) listener(bitmap)
        previous?.close()
      })
      .catch(() => {
        // A corrupt frame: skip it.
      })
      .finally(() => {
        this.decoding = false
        const next = this.pending
        this.pending = null
        if (next && !this.stopped) this.decode(next)
      })
  }
}

const connections = new Map<string, CameraConnection>()
/** Close a camera this long after the last viewer leaves, so a quick switch back doesn't reconnect. */
const LINGER_MS = 3000
const closeTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Watch the camera at `url`: `onFrame` gets each new picture (and the
 * current one at once), `onState` the connection state. Returns the
 * unsubscribe; the connection closes shortly after nobody watches.
 */
export function watchCamera(url: string, onFrame?: FrameListener, onState?: StateListener): () => void {
  clearTimeout(closeTimers.get(url))
  closeTimers.delete(url)
  let connection = connections.get(url)
  if (!connection) {
    connection = new CameraConnection(url)
    connections.set(url, connection)
  }
  const unsubscribe = connection.subscribe(onFrame, onState)
  const watched = connection
  return () => {
    unsubscribe()
    if (watched.listenerCount > 0) return
    closeTimers.set(
      url,
      setTimeout(() => {
        closeTimers.delete(url)
        if (watched.listenerCount > 0) return
        watched.stop()
        if (connections.get(url) === watched) connections.delete(url)
      }, LINGER_MS)
    )
  }
}

/** The camera's newest picture, if it is being watched and has one. */
export function latestCameraFrame(url: string | null | undefined): ImageBitmap | null {
  return (url && connections.get(url)?.latest) || null
}

/**
 * What the operator typed, as a camera address. Only the IP is needed: IP
 * Webcam's port and stream path are filled in.
 *   "10.0.0.5"            → "http://10.0.0.5:8080/video"
 *   "10.0.0.5:4747"       → "http://10.0.0.5:4747/video"
 *   "http://cam.local/mjpg" stays as it is.
 */
export function normaliseCameraUrl(input: string): string {
  let text = input.trim()
  if (!text) return ""
  const hadScheme = /^https?:\/\//i.test(text)
  if (!hadScheme) text = `http://${text}`
  try {
    const parsed = new URL(text)
    const bare = parsed.pathname === "/" || parsed.pathname === ""
    if (bare && !parsed.port) parsed.port = "8080"
    if (bare) parsed.pathname = "/video"
    return parsed.toString()
  } catch {
    return text
  }
}

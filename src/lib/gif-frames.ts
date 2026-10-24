import { decompressFrames, parseGIF } from "gifuct-js"

/**
 * Animated GIFs, decoded into frames a canvas can draw.
 *
 * WebKitGTK draws only a GIF's first frame onto a canvas, however long it
 * has been on the page, so NDI and the stream would show a frozen logo.
 * Decoding the frames here and picking one by the wall clock animates it in
 * every canvas, in step across windows.
 */
export interface GifAnimation {
  frames: HTMLCanvasElement[]
  /** When each frame ends, in ms from the start of the loop. */
  ends: number[]
  duration: number
}

/** Past this a GIF is drawn still: a logo has no business being bigger. */
const MAX_FRAMES = 500
const MAX_PIXELS = 1024 * 1024

/** Browsers show GIF delays this short at 100 ms, and artwork assumes it. */
const MIN_DELAY = 20
const SHORT_DELAY = 100

const animations = new Map<string, GifAnimation | null>()
const inFlight = new Map<string, Promise<GifAnimation | null>>()

export function isGifUrl(url: string): boolean {
  return /^data:image\/gif[;,]|\.gif([?#]|$)/i.test(url)
}

/**
 * Decode `url` once. Resolves to null for a still GIF (one frame), one too
 * large, or one that fails to decode — those are drawn as a plain image.
 */
export function decodeGif(url: string): Promise<GifAnimation | null> {
  if (animations.has(url)) return Promise.resolve(animations.get(url) ?? null)
  const pending = inFlight.get(url)
  if (pending) return pending

  const request = readBytes(url)
    .then(buildAnimation)
    .catch((error: unknown) => {
      console.warn("[gif-frames] failed to decode GIF", error)
      return null
    })
    .then((animation) => {
      animations.set(url, animation)
      inFlight.delete(url)
      return animation
    })
  inFlight.set(url, request)
  return request
}

/** True once `url` has been decoded and has more than one frame. */
export function isAnimatedGif(url: string): boolean {
  return Boolean(animations.get(url))
}

/** The frame showing at `now` (ms, wall clock), or null if not animated. */
export function gifFrameAt(url: string, now: number): HTMLCanvasElement | null {
  const animation = animations.get(url)
  if (!animation) return null
  const t = now % animation.duration
  const index = animation.ends.findIndex((end) => t < end)
  return animation.frames[index === -1 ? animation.frames.length - 1 : index]
}

/**
 * Theme pictures are data URLs, read here directly: the app's CSP doesn't
 * let fetch() open data: URLs.
 */
async function readBytes(url: string): Promise<ArrayBuffer> {
  if (!url.startsWith("data:")) return (await fetch(url)).arrayBuffer()
  const comma = url.indexOf(",")
  const header = url.slice(0, comma)
  const body = url.slice(comma + 1)
  if (!header.endsWith(";base64")) return new TextEncoder().encode(decodeURIComponent(body)).buffer
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function buildAnimation(buffer: ArrayBuffer): GifAnimation | null {
  const gif = parseGIF(buffer)
  const width = gif.lsd.width
  const height = gif.lsd.height
  if (!width || !height || width * height > MAX_PIXELS) return null
  const parsed = decompressFrames(gif, true)
  if (parsed.length < 2 || parsed.length > MAX_FRAMES) return null

  // Frames are patches over what came before; compose them on one canvas
  // and keep a copy of each finished picture.
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  const patchCanvas = document.createElement("canvas")
  const patchCtx = patchCanvas.getContext("2d")
  if (!ctx || !patchCtx) return null

  const frames: HTMLCanvasElement[] = []
  const ends: number[] = []
  let elapsed = 0
  for (const frame of parsed) {
    const { left, top, width: w, height: h } = frame.dims
    // Disposal 3: put back what was under this frame once it's been shown.
    const previous = frame.disposalType === 3 ? ctx.getImageData(0, 0, width, height) : null

    patchCanvas.width = w
    patchCanvas.height = h
    patchCtx.putImageData(new ImageData(new Uint8ClampedArray(frame.patch), w, h), 0, 0)
    // drawImage, not putImageData: transparent pixels must leave the frame
    // below them showing.
    ctx.drawImage(patchCanvas, left, top)

    const copy = document.createElement("canvas")
    copy.width = width
    copy.height = height
    copy.getContext("2d")?.drawImage(canvas, 0, 0)
    frames.push(copy)
    elapsed += frame.delay < MIN_DELAY ? SHORT_DELAY : frame.delay
    ends.push(elapsed)

    if (frame.disposalType === 2) ctx.clearRect(left, top, w, h)
    else if (previous) ctx.putImageData(previous, 0, 0)
  }
  return { frames, ends, duration: elapsed }
}

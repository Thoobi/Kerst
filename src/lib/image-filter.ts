/**
 * Blur and brightness for theme pictures, done in pixels rather than with
 * `ctx.filter`: WebKitGTK's canvas ignores `filter`, so a theme's blurred,
 * darkened backdrop came out sharp and unchanged in the app (and on NDI).
 *
 * The picture is drawn small (blur hides the detail anyway), blurred with
 * three box-blur passes (close to a Gaussian), brightened or darkened, and
 * kept: pictures are still, so a frame drawn again costs one plain draw.
 */

/** The longest side worked on: blur makes more detail pointless, and keeps the work small. */
const MAX_WORK_SIDE = 960
/** Results kept per picture (sizes and settings differ per window and thumbnail). */
const MAX_PER_SOURCE = 8

const cache = new WeakMap<object, Map<string, HTMLCanvasElement>>()

/**
 * `source`'s part `sx, sy, sw, sh`, blurred by `blur` px and at
 * `brightness` % as it would be drawn at `dw × dh`, as a canvas to draw at
 * that size. Null when there's nothing to do or no canvas to do it on.
 */
export function filteredPicture(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  blur: number,
  brightness: number
): HTMLCanvasElement | null {
  if (!(blur > 0) && brightness === 100) return null
  if (!(dw > 0 && dh > 0 && sw > 0 && sh > 0)) return null

  // Work smaller the more it's blurred, and never past MAX_WORK_SIDE.
  const shrink = Math.max(1, Math.min(blur / 3, 16), Math.max(dw, dh) / MAX_WORK_SIDE)
  const w = Math.max(1, Math.round(dw / shrink))
  const h = Math.max(1, Math.round(dh / shrink))
  const radius = blur / shrink

  const key = `${sx},${sy},${sw},${sh}|${w}x${h}|${radius.toFixed(2)}|${brightness}`
  const keyed = source as object
  let entries = cache.get(keyed)
  const hit = entries?.get(key)
  if (hit) return hit

  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return null
  ctx.imageSmoothingQuality = "high"
  try {
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h)
  } catch {
    return null
  }
  let data: ImageData
  try {
    data = ctx.getImageData(0, 0, w, h)
  } catch {
    // A picture from elsewhere that taints the canvas: draw it unfiltered.
    return null
  }
  if (radius >= 0.5) {
    const r = Math.max(1, Math.round(radius / 1.7))
    for (let pass = 0; pass < 3; pass++) {
      boxBlur(data.data, w, h, r, true)
      boxBlur(data.data, w, h, r, false)
    }
  }
  if (brightness !== 100) brighten(data.data, brightness / 100)
  ctx.putImageData(data, 0, 0)

  if (!entries) {
    entries = new Map()
    cache.set(keyed, entries)
  }
  if (entries.size >= MAX_PER_SOURCE) entries.delete(entries.keys().next().value!)
  entries.set(key, canvas)
  return canvas
}

/** Multiply every colour by `k` (alpha untouched), as CSS `brightness()` does. */
function brighten(px: Uint8ClampedArray, k: number): void {
  for (let i = 0; i < px.length; i += 4) {
    px[i] = px[i] * k
    px[i + 1] = px[i + 1] * k
    px[i + 2] = px[i + 2] * k
  }
}

/**
 * One box blur of radius `r` along rows (`horizontal`) or columns, as a
 * running sum. Edges repeat their outermost pixel, so a blurred picture
 * doesn't darken towards its sides.
 */
function boxBlur(px: Uint8ClampedArray, w: number, h: number, r: number, horizontal: boolean): void {
  const length = horizontal ? w : h
  const lines = horizontal ? h : w
  const step = horizontal ? 4 : w * 4
  const span = r * 2 + 1
  const line = new Float32Array(length * 4)
  for (let l = 0; l < lines; l++) {
    const start = horizontal ? l * w * 4 : l * 4
    for (let i = 0; i < length; i++) {
      const p = start + i * step
      line[i * 4] = px[p]
      line[i * 4 + 1] = px[p + 1]
      line[i * 4 + 2] = px[p + 2]
      line[i * 4 + 3] = px[p + 3]
    }
    for (let c = 0; c < 4; c++) {
      const at = (i: number) => line[Math.min(length - 1, Math.max(0, i)) * 4 + c]
      let sum = 0
      for (let i = -r; i <= r; i++) sum += at(i)
      for (let i = 0; i < length; i++) {
        px[start + i * step + c] = sum / span
        sum += at(i + r + 1) - at(i - r)
      }
    }
  }
}

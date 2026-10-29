/**
 * Pictures drawn much smaller than they are.
 *
 * WebKit's canvas scales a picture in one bilinear pass whatever
 * `imageSmoothingQuality` says, so shrinking it more than 2x skips source
 * pixels instead of averaging them: a 1400px logo drawn 120px tall comes out
 * jagged, its thin lines broken. Halving it step by step (each pass at most
 * 2x, which bilinear filtering does average) and drawing the result keeps it
 * smooth, as an <img> scaled by CSS already is.
 *
 * The steps are cached per picture and size, so a frame drawn again costs one
 * plain draw. Videos aren't handled: their frames change every draw.
 */

/** Sizes kept per picture: preview, live, outputs and thumbnails each differ. */
const MAX_SIZES_PER_SOURCE = 6

const cache = new WeakMap<object, Map<string, HTMLCanvasElement>>()

/** `ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh)`, smoothly shrunk. */
export function drawImageSmooth(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): void {
  const scaled = smoothScaled(ctx, source, sx, sy, sw, sh, dw, dh)
  if (scaled) ctx.drawImage(scaled, dx, dy, dw, dh)
  else ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh)
}

/** The part `sx, sy, sw, sh` of `source` at the size `dw × dh` covers on `ctx`, or null to draw it directly. */
function smoothScaled(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dw: number,
  dh: number
): HTMLCanvasElement | null {
  if (typeof document === "undefined" || !isStill(source) || isVector(source)) return null
  // The size in device pixels: the context may itself be scaled.
  const m = typeof ctx.getTransform === "function" ? ctx.getTransform() : null
  const width = Math.max(1, Math.round(Math.abs(dw) * (m ? Math.hypot(m.a, m.b) : 1)))
  const height = Math.max(1, Math.round(Math.abs(dh) * (m ? Math.hypot(m.c, m.d) : 1)))
  // One bilinear pass handles up to 2x.
  if (sw <= width * 2 && sh <= height * 2) return null

  let sizes = cache.get(source)
  if (!sizes) {
    sizes = new Map()
    cache.set(source, sizes)
  }
  const key = `${sx},${sy},${sw},${sh}:${width}x${height}`
  const hit = sizes.get(key)
  if (hit) {
    // Most recently used last, so the oldest size is the one dropped.
    sizes.delete(key)
    sizes.set(key, hit)
    return hit
  }

  let current: CanvasImageSource = source
  let cx = sx
  let cy = sy
  let cw = sw
  let ch = sh
  while (cw > width || ch > height) {
    const nw = Math.max(width, Math.ceil(cw / 2))
    const nh = Math.max(height, Math.ceil(ch / 2))
    const step = document.createElement("canvas")
    step.width = nw
    step.height = nh
    const stepCtx = step.getContext("2d")
    if (!stepCtx) return null
    stepCtx.imageSmoothingQuality = "high"
    stepCtx.drawImage(current, cx, cy, cw, ch, 0, 0, nw, nh)
    current = step
    cx = 0
    cy = 0
    cw = nw
    ch = nh
  }

  const result = current as HTMLCanvasElement
  sizes.set(key, result)
  if (sizes.size > MAX_SIZES_PER_SOURCE) {
    const oldest = sizes.keys().next().value
    if (oldest !== undefined) sizes.delete(oldest)
  }
  return result
}

/** An SVG draws crisp at any size; rasterising it smaller first would only blur it. */
function isVector(source: HTMLImageElement | HTMLCanvasElement | ImageBitmap): boolean {
  return (
    typeof HTMLImageElement !== "undefined" &&
    source instanceof HTMLImageElement &&
    /^data:image\/svg|\.svg(\?|#|$)/i.test(source.currentSrc || source.src)
  )
}

function isStill(source: CanvasImageSource): source is HTMLImageElement | HTMLCanvasElement | ImageBitmap {
  return (
    (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) ||
    (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) ||
    (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap)
  )
}

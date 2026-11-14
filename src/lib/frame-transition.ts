/**
 * Transitions between what an output shows, using the theme's `transition`
 * (fade, slide or scale, with its duration, easing and direction).
 *
 * From words to words, only the words move: the background, plates and
 * logo cross-fade, which keeps them exactly still when they are the same on
 * both sides (a Lower Thirds band stays put while the verse in it changes)
 * and blends them when they differ (a new theme). Going on or off air, the
 * band moves with its words. Either way the moving part goes out and comes
 * in the theme's way, clipped to the background region.
 */
import { renderVerse } from "@/lib/verse-renderer"
import type { BroadcastTheme, RenderOptions, TextTiming, VerseRenderData } from "@/types/broadcast"

export type TransitionSpec = BroadcastTheme["transition"] & { textTiming?: TextTiming }

export interface Frame {
  theme: BroadcastTheme
  verse: VerseRenderData | null
}

/** What changing from one frame to the next is about; equal keys mean no transition. */
export function contentKey(verse: VerseRenderData | null): string {
  if (!verse) return "none"
  // A clock's words are its reading, which changes every second: the same
  // timer stays the same content whatever it reads.
  if (verse.timer) return JSON.stringify({ timer: verse.timer.caption })
  return JSON.stringify({
    style: verse.style ?? null,
    reference: verse.reference,
    segments: verse.segments,
    credit: verse.credit ?? null,
    image: verse.image?.url ?? null,
    video: verse.video?.id ?? verse.video?.url ?? null,
  })
}

/**
 * How going from `from` to `to` animates: a Lower Thirds band coming on or
 * going off air uses its theme's `bandTransition` when it has one, anything
 * else the theme's `transition` (`to`'s, or `from`'s going off air).
 */
export function transitionSpecFor(from: Frame | null, to: Frame): TransitionSpec {
  const onOrOff = !!from && (from.verse === null) !== (to.verse === null)
  const theme = to.verse === null && from ? from.theme : to.theme
  return (onOrOff && theme.bandTransition) || to.theme.transition
}

/** Whether going from `from` to `to` should animate (see `transitionSpecFor`). */
export function shouldTransition(from: Frame | null, to: Frame): boolean {
  if (!from) return false
  const spec = transitionSpecFor(from, to)
  if (!spec || spec.type === "none" || spec.type === "cut" || !(spec.duration > 0)) return false
  return contentKey(from.verse) !== contentKey(to.verse)
}

export function ease(easing: TransitionSpec["easing"], t: number): number {
  const x = Math.min(1, Math.max(0, t))
  switch (easing) {
    case "ease-in":
      return x * x * x
    case "ease-out":
      return 1 - (1 - x) ** 3
    case "ease-in-out":
      return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
    default:
      return x
  }
}

/** A running transition: from what, since when (`performance.now()`), how. */
export interface ActiveTransition {
  from: Frame
  start: number
  spec: TransitionSpec
}

/** How long the words take to come in once the band is up, and to go before it leaves, in ms. */
const TEXT_IN_MS = 320
const TEXT_OUT_MS = 200
/** How far the words rise as they come in, as a share of the frame height. */
const TEXT_RISE = 0.012

/** Whether a band transition brings its words in apart from the band. */
function separateText(spec: TransitionSpec): boolean {
  return !!spec.textTiming && spec.textTiming !== "with" && spec.type !== "cut"
}

/**
 * When the band and its words each move, in ms from the start: coming on
 * the band goes first and the words follow ("landing": as it settles,
 * "after": once it has); going off the words leave first, then the band.
 */
export function bandTimeline(
  spec: TransitionSpec,
  comingOn: boolean
): { total: number; band: { start: number; length: number }; text: { start: number; length: number } } {
  const d = Math.max(1, spec.duration)
  const timing = spec.textTiming ?? "with"
  if (!separateText(spec)) return { total: d, band: { start: 0, length: d }, text: { start: 0, length: d } }
  if (comingOn) {
    const textStart = timing === "landing" ? Math.round(d * 0.6) : d + 60
    return { total: textStart + TEXT_IN_MS, band: { start: 0, length: d }, text: { start: textStart, length: TEXT_IN_MS } }
  }
  const bandStart = timing === "landing" ? Math.round(TEXT_OUT_MS * 0.5) : TEXT_OUT_MS
  return { total: bandStart + d, band: { start: bandStart, length: d }, text: { start: 0, length: TEXT_OUT_MS } }
}

/** How long `transition` runs, in ms. */
export function transitionDuration(transition: ActiveTransition): number {
  return bandTimeline(transition.spec, transition.from.verse === null).total
}

/**
 * Progress of `transition` at `now`, 0-1; 1 means finished. Eased by the
 * spec, except when a band and its words move apart: then linear time, and
 * `draw` eases each part on its own.
 */
export function transitionProgress(transition: ActiveTransition, now: number): number {
  const t = (now - transition.start) / Math.max(1, transitionDuration(transition))
  if (t >= 1) return 1
  return separateText(transition.spec) ? Math.max(0, t) : ease(transition.spec.easing, t)
}

/** 0-1 share of `part` done at `elapsed` ms. */
function partDone(part: { start: number; length: number }, elapsed: number): number {
  return Math.min(1, Math.max(0, (elapsed - part.start) / Math.max(1, part.length)))
}

/** How far the words travel in a slide, as a share of the frame. */
const SLIDE_DISTANCE = 0.06
/** How far a band coming on or going off air travels. */
const BAND_SLIDE_DISTANCE = 0.25
/** How much the words grow or shrink in a scale. */
const SCALE_AMOUNT = 0.06
/** How small a band starts in a pop, before springing to full size. */
const POP_FROM = 0.86
/** A wipe's soft edge, as a share of the distance it travels. */
const WIPE_FEATHER = 0.12

/** 0→1 with a small overshoot past 1 near the end: a spring settling. */
function backOut(t: number): number {
  const c = 1.4
  const x = t - 1
  return 1 + (c + 1) * x * x * x + c * x * x
}

/**
 * Draws transition frames onto one canvas. Keeps its own scratch canvases
 * at that canvas's size, so make one per target canvas.
 */
export class TransitionRenderer {
  private scratch: HTMLCanvasElement[] = []

  private layer(index: number, width: number, height: number): CanvasRenderingContext2D | null {
    let canvas = this.scratch[index]
    if (!canvas) {
      canvas = document.createElement("canvas")
      this.scratch[index] = canvas
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = "source-over"
    ctx.clearRect(0, 0, width, height)
    return ctx
  }

  /**
   * Draw `to` part-way (`progress`, eased, 0-1) through its transition from
   * `from`. `ctx` is cleared already and may carry a transform (e.g. the
   * device pixel ratio), which the layers are drawn under too.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    from: Frame,
    to: Frame,
    progress: number,
    spec: TransitionSpec,
    options: RenderOptions
  ): void {
    const { width, height } = ctx.canvas
    const transform = ctx.getTransform()
    const p = Math.min(1, Math.max(0, progress))

    // On or off air, the band comes and goes with its words, or (with a
    // text timing) the band moves first and its words follow.
    const band = from.verse === null || to.verse === null
    const apart = band && separateText(spec)
    const comingOn = from.verse === null
    const timeline = bandTimeline(spec, comingOn)
    const elapsed = p * timeline.total
    const bandP = apart ? ease(spec.easing, partDone(timeline.band, elapsed)) : p
    const still = band ? "backdrop" : "base"
    const moving = band ? (apart ? "plates" : "content") : "text"
    const render = (index: number, frame: Frame, layer: NonNullable<RenderOptions["layer"]>) => {
      const target = this.layer(index, width, height)
      if (!target) return null
      target.setTransform(transform)
      const metrics = renderVerse(target, frame.theme, frame.verse, { ...options, layer })
      return { canvas: target.canvas, metrics }
    }

    // Background, plates, logo: a cross-fade, done additively so what is the
    // same on both sides stays exactly as it is (no dip through half-opacity).
    const fromBase = render(0, from, still)
    const toBase = render(1, to, still)
    const fromText = render(2, from, moving)
    const toText = render(3, to, moving)
    if (!fromBase || !toBase || !fromText || !toText) return

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const mixed = this.layer(4, width, height)
    if (mixed) {
      mixed.globalCompositeOperation = "lighter"
      mixed.globalAlpha = 1 - p
      mixed.drawImage(fromBase.canvas, 0, 0)
      mixed.globalAlpha = p
      mixed.drawImage(toBase.canvas, 0, 0)
      ctx.drawImage(mixed.canvas, 0, 0)
    }
    ctx.restore()

    // Where the moving part may show. Going on or off air: the background
    // region (the band slides in from its edge). From words to words: inside
    // the band, so words never spill over the picture around it.
    const region = band ? toBase.metrics?.backgroundRect : (wordsArea(fromBase.metrics, toBase.metrics) ??
      toBase.metrics?.backgroundRect)
    ctx.save()
    if (region) {
      ctx.beginPath()
      ctx.rect(region.x, region.y, region.width, region.height)
      ctx.clip()
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    // On or off air only one side has anything, so both move at once. From
    // words to words they take turns: the old words leave in the first half,
    // the new ones arrive in the second, never on top of each other.
    const out = band ? bandP : Math.min(1, p * 2)
    const into = band ? bandP : Math.max(0, p * 2 - 1)

    if (spec.type === "wipe") {
      const area = region ? deviceRect(transform, region) : { x: 0, y: 0, width, height }
      // Coming in, the band is revealed from the `direction` edge; going
      // out, it's wiped away from the same edge.
      const wipe = (source: HTMLCanvasElement, amount: number, mode: "show" | "hide", index: number) => {
        const whole = mode === "show" ? amount >= 1 : amount <= 0
        const none = mode === "show" ? amount <= 0 : amount >= 1
        if (whole) ctx.drawImage(source, 0, 0)
        if (whole || none) return
        const scratch = this.layer(index, width, height)
        if (!scratch) return
        this.wiped(scratch, source, area, spec.direction, amount, mode)
        ctx.drawImage(scratch.canvas, 0, 0)
      }
      wipe(fromText.canvas, out, "hide", 5)
      wipe(toText.canvas, into, "show", 6)
    } else if (spec.type === "pop") {
      const centre = region
        ? transform.transformPoint({ x: region.x + region.width / 2, y: region.y + region.height / 2 })
        : { x: width / 2, y: height / 2 }
      const scaled = (source: HTMLCanvasElement, k: number, alpha: number) => {
        ctx.globalAlpha = Math.min(1, Math.max(0, alpha))
        ctx.drawImage(source, centre.x - centre.x * k, centre.y - centre.y * k, width * k, height * k)
      }
      // Out: shrinks a little as it fades. In: springs up from small.
      scaled(fromText.canvas, 1 - (1 - POP_FROM) * 0.5 * out, 1 - out)
      scaled(toText.canvas, POP_FROM + (1 - POP_FROM) * backOut(into), into * 1.8)
    } else if (spec.type === "fade" || spec.type === "none" || spec.type === "cut") {
      ctx.globalAlpha = 1 - out
      ctx.drawImage(fromText.canvas, 0, 0)
      ctx.globalAlpha = into
      ctx.drawImage(toText.canvas, 0, 0)
    } else if (spec.type === "slide") {
      const vertical = spec.direction === "up" || spec.direction === "down"
      const sign = spec.direction === "up" || spec.direction === "left" ? 1 : -1
      const distance = (vertical ? height : width) * (band ? BAND_SLIDE_DISTANCE : SLIDE_DISTANCE) * sign
      const at = (offset: number) => (vertical ? [0, offset] : [offset, 0])
      // A band going off air leaves the way it came in.
      const [ox, oy] = at(to.verse === null ? distance * out : -distance * out)
      const [nx, ny] = at(distance * (1 - into))
      ctx.globalAlpha = 1 - out
      ctx.drawImage(fromText.canvas, ox, oy)
      ctx.globalAlpha = into
      ctx.drawImage(toText.canvas, nx, ny)
    } else {
      // Scale about the middle of the moving part's area, in device pixels.
      const centre = region
        ? transform.transformPoint({ x: region.x + region.width / 2, y: region.y + region.height / 2 })
        : { x: width / 2, y: height / 2 }
      const scaled = (source: HTMLCanvasElement, k: number, alpha: number) => {
        ctx.globalAlpha = alpha
        ctx.drawImage(source, centre.x - centre.x * k, centre.y - centre.y * k, width * k, height * k)
      }
      scaled(fromText.canvas, 1 + SCALE_AMOUNT * out, 1 - out)
      scaled(toText.canvas, 1 - SCALE_AMOUNT * (1 - into), into)
    }

    // The words, on their own time: rising into the band once it's up, or
    // sinking out of it before it goes.
    if (apart) {
      const words = render(7, comingOn ? to : from, "text")
      if (words) {
        const done = partDone(timeline.text, elapsed)
        const shown = comingOn ? ease("ease-out", done) : 1 - ease("ease-in", done)
        if (shown > 0) {
          ctx.globalAlpha = shown
          ctx.drawImage(words.canvas, 0, height * TEXT_RISE * (1 - shown))
        }
      }
    }
    ctx.restore()
  }

  /**
   * `source` on `scratch` with only part of `area` showing: the first
   * `amount` of it from the `direction` edge ("show"), or all but that
   * ("hide"), with a soft edge.
   */
  private wiped(
    scratch: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    area: Rect,
    direction: TransitionSpec["direction"],
    amount: number,
    mode: "show" | "hide"
  ): void {
    scratch.setTransform(1, 0, 0, 1, 0, 0)
    scratch.globalCompositeOperation = "source-over"
    scratch.globalAlpha = 1
    scratch.drawImage(source, 0, 0)
    // The wipe moves from the edge the band enters from: "up" enters from
    // the bottom, "down" from the top, "left" from the right, "right" from the left.
    const vertical = direction === "up" || direction === "down"
    const length = vertical ? area.height : area.width
    const feather = length * WIPE_FEATHER
    const travel = (length + feather) * amount
    const [x0, y0, x1, y1] =
      direction === "up"
        ? [0, area.y + area.height, 0, area.y]
        : direction === "down"
          ? [0, area.y, 0, area.y + area.height]
          : direction === "left"
            ? [area.x + area.width, 0, area.x, 0]
            : [area.x, 0, area.x + area.width, 0]
    const dx = Math.sign(x1 - x0)
    const dy = Math.sign(y1 - y0)
    // Along the wipe: shown up to `front - feather`, fading out to `front`.
    const front = travel
    const gradient = scratch.createLinearGradient(
      x0 + dx * (front - feather),
      y0 + dy * (front - feather),
      x0 + dx * front,
      y0 + dy * front
    )
    const shown = mode === "show" ? "rgba(0,0,0,1)" : "rgba(0,0,0,0)"
    const hidden = mode === "show" ? "rgba(0,0,0,0)" : "rgba(0,0,0,1)"
    gradient.addColorStop(0, shown)
    gradient.addColorStop(1, hidden)
    scratch.globalCompositeOperation = "destination-in"
    scratch.fillStyle = gradient
    scratch.fillRect(0, 0, scratch.canvas.width, scratch.canvas.height)
    scratch.globalCompositeOperation = "source-over"
  }
}

type Metrics = ReturnType<typeof renderVerse>

type Rect = { x: number; y: number; width: number; height: number }

/** `rect` (in the canvas's drawing units) in device pixels under `transform`. */
function deviceRect(transform: DOMMatrix, rect: Rect): Rect {
  const a = transform.transformPoint({ x: rect.x, y: rect.y })
  const b = transform.transformPoint({ x: rect.x + rect.width, y: rect.y + rect.height })
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
}

/**
 * The band both frames' words sit in (the union of their text boxes, which
 * may differ in height), or null when the theme has no text box.
 */
function wordsArea(from: Metrics, to: Metrics): { x: number; y: number; width: number; height: number } | null {
  const boxes = [from, to]
    .filter((m): m is NonNullable<Metrics> => !!m && m.scaledTheme.textBox.enabled)
    .map((m) => m.textBoxRect)
  if (boxes.length === 0) return null
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.width))
  const bottom = Math.max(...boxes.map((b) => b.y + b.height))
  return { x, y, width: right - x, height: bottom - y }
}

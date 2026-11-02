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
import type { BroadcastTheme, RenderOptions, VerseRenderData } from "@/types/broadcast"

export type TransitionSpec = BroadcastTheme["transition"]

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

/** Whether going from `from` to `to` should animate, by `to`'s theme. */
export function shouldTransition(from: Frame | null, to: Frame): boolean {
  const spec = to.theme.transition
  if (!from || !spec || spec.type === "none" || !(spec.duration > 0)) return false
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

/** 0-1 eased progress of `transition` at `now`; 1 means finished. */
export function transitionProgress(transition: ActiveTransition, now: number): number {
  const t = (now - transition.start) / Math.max(1, transition.spec.duration)
  return t >= 1 ? 1 : ease(transition.spec.easing, t)
}

/** How far the words travel in a slide, as a share of the frame. */
const SLIDE_DISTANCE = 0.06
/** How far a band coming on or going off air travels. */
const BAND_SLIDE_DISTANCE = 0.25
/** How much the words grow or shrink in a scale. */
const SCALE_AMOUNT = 0.06

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

    // On or off air, the band comes and goes with its words.
    const band = from.verse === null || to.verse === null
    const still = band ? "backdrop" : "base"
    const moving = band ? "content" : "text"
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
    const out = band ? p : Math.min(1, p * 2)
    const into = band ? p : Math.max(0, p * 2 - 1)

    if (spec.type === "fade" || spec.type === "none") {
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
    ctx.restore()
  }
}

type Metrics = ReturnType<typeof renderVerse>

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

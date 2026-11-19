import type {
  BroadcastTheme,
  CameraPanel,
  ElementBox,
  SurfaceFill,
  VerseRenderData,
} from "@/types/broadcast"
import {
  computeVerseLayoutMetrics,
  textAreaRect,
  type VerseLayoutMetrics,
} from "./verse-renderer"
import { isLowerThird } from "./lower-third"

/** Sample verse used wherever a layout must be computed without live data. */
export const SAMPLE_VERSE: VerseRenderData = {
  reference: "Genesis 1:1 (KJV)",
  segments: [
    {
      verseNumber: 1,
      text: "In the beginning God created the heaven and the earth.",
    },
  ],
}

const DEFAULT_VERSE_NUMBERS: BroadcastTheme["verseNumbers"] = {
  visible: true,
  fontSize: 18,
  color: "#ffffff",
  superscript: true,
}

/**
 * Surfaces gained an `image` fill after the first themes were saved; spread
 * this so the renderer never has to guess whether the key exists.
 */
const DEFAULT_SURFACE: SurfaceFill = {
  enabled: false,
  color: "#000000",
  opacity: 0.7,
  borderRadius: 0,
  padding: 0,
  image: null,
}

/** Fill surface defaults, preserving whatever the saved theme already set. */
export function normalizeSurface(
  surface: SurfaceFill | undefined
): SurfaceFill | undefined {
  if (!surface) return undefined
  return { ...DEFAULT_SURFACE, ...surface }
}

function isValidBox(box: ElementBox | undefined): box is ElementBox {
  return (
    box !== undefined &&
    [box.x, box.y, box.width, box.height].every(
      (v) => typeof v === "number" && Number.isFinite(v)
    ) &&
    box.width > 0 &&
    box.height > 0
  )
}

/**
 * Fill defaults on themes loaded from disk, import, or IPC so older saved
 * themes (created before free positioning / verse-number styling existed)
 * keep working unchanged.
 */
export function normalizeTheme(theme: BroadcastTheme): BroadcastTheme {
  const layout = { ...theme.layout }
  layout.mode = layout.mode === "free" ? "free" : "stacked"
  if (
    layout.mode === "free" &&
    (!isValidBox(layout.referenceBox) || !isValidBox(layout.verseBox))
  ) {
    layout.mode = "stacked"
  }
  // A Lower Thirds theme's free boxes move with its band: kept as % of
  // the band, converted from % of the frame where they were saved so.
  if (layout.mode === "free" && layout.boxesIn !== "band" && isLowerThird(theme)) {
    const inBand = boxesToBand({ ...theme, layout })
    if (inBand) Object.assign(layout, inBand)
  }
  return {
    ...theme,
    verseNumbers: { ...DEFAULT_VERSE_NUMBERS, ...theme.verseNumbers },
    textBox: { ...DEFAULT_SURFACE, ...theme.textBox },
    verseText: {
      ...theme.verseText,
      surface: normalizeSurface(theme.verseText?.surface),
    },
    reference: {
      ...theme.reference,
      surface: normalizeSurface(theme.reference?.surface),
    },
    layout,
    cameraPanel: normalizeCameraPanel(theme.cameraPanel),
    transition: theme.transition ?? { type: "fade", duration: 400, easing: "ease-out", direction: "up" },
  }
}

/** A camera panel with every field set, or null if what was saved can't be placed. */
function normalizeCameraPanel(panel: CameraPanel | null | undefined): CameraPanel | null {
  if (!panel || !isValidBox(panel.box)) return null
  return {
    enabled: panel.enabled !== false,
    camera: panel.camera?.url ? panel.camera : null,
    box: panel.box,
    borderRadius: Number.isFinite(panel.borderRadius) ? Math.max(0, panel.borderRadius) : 0,
    border: panel.border && Number.isFinite(panel.border.width) ? panel.border : null,
    shadow: panel.shadow === true,
  }
}

/** Frame-% boxes as %s of a Lower Thirds band, in the same place on screen; null if there's no band to measure. */
export function boxesToBand(
  theme: BroadcastTheme
): { referenceBox: ElementBox; verseBox: ElementBox; boxesIn: "band" } | null {
  const { referenceBox, verseBox } = theme.layout
  if (!referenceBox || !verseBox) return null
  const band = textAreaRect({ ...theme, layout: { ...theme.layout, mode: "stacked" } })
  if (!(band.width > 0 && band.height > 0)) return null
  const { width: W, height: H } = theme.resolution
  const r2 = (v: number) => Math.round(v * 100) / 100
  const toBand = (box: ElementBox): ElementBox => ({
    x: r2((((box.x / 100) * W - band.x) / band.width) * 100),
    y: r2((((box.y / 100) * H - band.y) / band.height) * 100),
    width: r2((((box.width / 100) * W) / band.width) * 100),
    height: r2((((box.height / 100) * H) / band.height) * 100),
  })
  return { referenceBox: toBand(referenceBox), verseBox: toBand(verseBox), boxesIn: "band" }
}

// Floor the origin and ceil the size (at 2 decimals) so the percent box is
// guaranteed to contain the source rect — a width rounded down would reduce
// the wrap width and re-flow the text on detach.
const rectToBox = (
  rect: { x: number; y: number; width: number; height: number },
  canvasW: number,
  canvasH: number
): ElementBox => ({
  x: Math.floor((rect.x / canvasW) * 10000) / 100,
  y: Math.floor((rect.y / canvasH) * 10000) / 100,
  width: Math.ceil((rect.width / canvasW) * 10000) / 100,
  height: Math.ceil((rect.height / canvasH) * 10000) / 100,
})

/**
 * Compute seed boxes for a theme directly (used by the properties panel's
 * "free positioning" toggle, where no designer metrics are at hand). Lays the
 * theme out in stacked mode against a sample verse and converts the resulting
 * rects.
 */
export function seedFreeBoxesForTheme(
  theme: BroadcastTheme,
  verse: VerseRenderData = SAMPLE_VERSE
): { referenceBox: ElementBox; verseBox: ElementBox } | null {
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return null
  const stackedTheme: BroadcastTheme = {
    ...theme,
    layout: { ...theme.layout, mode: "stacked" },
  }
  const metrics = computeVerseLayoutMetrics(ctx, stackedTheme, verse)
  return seedFreeBoxesFromMetrics(metrics, theme.resolution)
}

/**
 * Seed free-mode element boxes from stacked layout metrics (computed at
 * scale 1). Each box tightly wraps its rendered content, so on detach the
 * frame hugs the text and dragging it moves the text 1:1. Line breaks are
 * preserved: greedy wrap at the widest-line width reproduces the same lines.
 */
export function seedFreeBoxesFromMetrics(
  metrics: VerseLayoutMetrics,
  resolution: BroadcastTheme["resolution"]
): { referenceBox: ElementBox; verseBox: ElementBox } | null {
  const { referenceRect, verseRect } = metrics
  if (!referenceRect || !verseRect) return null
  const { width: canvasW, height: canvasH } = resolution
  return {
    referenceBox: rectToBox(referenceRect, canvasW, canvasH),
    verseBox: rectToBox(verseRect, canvasW, canvasH),
  }
}

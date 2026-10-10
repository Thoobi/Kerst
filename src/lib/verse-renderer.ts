import { clearCache } from "@chenglou/pretext"
import {
  materializeRichInlineLineRange,
  measureRichInlineStats,
  prepareRichInline,
  walkRichInlineLineRanges,
  type PreparedRichInline,
  type RichInlineItem,
  type RichInlineLine,
} from "@chenglou/pretext/rich-inline"
import { imageContentBox } from "@/lib/theme-image-cache"
import type {
  BroadcastTheme,
  SurfaceFill,
  ThemeImageFill,
  VerseRenderData,
  VideoPlayback,
  RenderOptions,
} from "@/types/broadcast"

// Pretext lazily creates one internal measurement context, preferring
// OffscreenCanvas. Force that creation with a DOM canvas instead — older
// WebKit versions don't expose document webfonts to OffscreenCanvas, and a
// DOM canvas behaves identically everywhere.
function primePretextMeasureContext(): void {
  if (typeof document === "undefined") return
  const g = globalThis as { OffscreenCanvas?: typeof OffscreenCanvas }
  const original = g.OffscreenCanvas
  try {
    g.OffscreenCanvas = undefined
    prepareRichInline([{ text: "prime", font: "16px serif" }])
  } finally {
    g.OffscreenCanvas = original
  }
  // Widths measured before a webfont finished loading came from the fallback
  // font and are cached per font string — drop them whenever loading settles.
  // (Consumers redraw on this same event.)
  document.fonts?.addEventListener("loadingdone", () => clearCache())
}
primePretextMeasureContext()

const requestedFontSpecs = new Set<string>()
const fontListeners = new Set<() => void>()

/**
 * Subscribe to "a theme font just finished loading" so consumers can redraw.
 * Driven by the FontFaceSet.load() promise rather than the "loadingdone"
 * event: WebKit's canvas can still measure the fallback font when the event
 * fires, but is reliably up to date once the load promise resolves.
 */
export function onThemeFontsLoaded(listener: () => void): () => void {
  fontListeners.add(listener)
  return () => fontListeners.delete(listener)
}

/**
 * Canvas `ctx.font` never triggers a webfont download: a registered
 * `@font-face` stays unloaded — and canvas silently draws the fallback font —
 * until DOM text or an explicit `FontFaceSet.load()` requests it. If the font
 * later loads for an unrelated reason (e.g. a DOM element uses it), drawing
 * switches to the real font while cached measurements still hold fallback
 * widths, so text overflows its measured layout box. Request every font a
 * theme uses up front; when a face actually arrives, invalidate pretext's
 * cache (redraws ride the resulting "loadingdone" event).
 */
function ensureThemeFontsLoaded(theme: BroadcastTheme): void {
  if (typeof document === "undefined" || !document.fonts?.load) return
  const specs = [
    `${theme.verseText.fontWeight} 16px "${theme.verseText.fontFamily}"`,
    `${theme.reference.fontWeight} 16px "${theme.reference.fontFamily}"`,
  ]
  for (const spec of specs) {
    if (requestedFontSpecs.has(spec)) continue
    requestedFontSpecs.add(spec)
    void document.fonts
      .load(spec)
      .then((faces) => {
        if (faces.length > 0) {
          clearCache()
          for (const listener of fontListeners) listener()
        }
      })
      .catch(() => {
        requestedFontSpecs.delete(spec)
      })
  }
}

export interface VerseLayoutRect {
  x: number
  y: number
  width: number
  height: number
}

export interface VerseLayoutMetrics {
  scaledTheme: BroadcastTheme
  /** Region the theme background is drawn in (anchored, sized by layout.backgroundWidth/Height). */
  backgroundRect: VerseLayoutRect
  /** Rect the text box backdrop is drawn at. Always the anchored text area; never follows free-mode boxes. */
  textBoxRect: VerseLayoutRect
  textAreaRect: VerseLayoutRect
  textRect: VerseLayoutRect
  referenceRect: VerseLayoutRect | null
  verseRect: VerseLayoutRect | null
  /** Auto-fitted verse font size (scaled px). Absent when there is no verse. */
  fittedVerseFontSize?: number
  /**
   * The text as it was fitted, and must be drawn: lyrics may have been
   * flowed into a paragraph instead of keeping their line breaks (see
   * `fitVerseText`). Absent when there is no verse.
   */
  fittedVerse?: VerseRenderData
  /** Free-mode element boxes in canvas px. Only set when layout.mode === "free". */
  referenceBoxRect?: VerseLayoutRect | null
  verseBoxRect?: VerseLayoutRect | null
  /** Rect the reference's own chip is drawn at — hugs the reference text. */
  referenceSurfaceRect?: VerseLayoutRect | null
  /** Rect the verse's own plate is drawn at — fills the verse's area. */
  verseSurfaceRect?: VerseLayoutRect | null
}

/** Grow a rect outwards by `padding` on every side, never past zero size. */
function inflateRect(rect: VerseLayoutRect, padding: number): VerseLayoutRect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: Math.max(0, rect.width + padding * 2),
    height: Math.max(0, rect.height + padding * 2),
  }
}

/**
 * Where an element's own plate is drawn: its box when it has one (free mode),
 * otherwise hugging the text plus the surface's padding.
 */
function surfaceRectFor(
  surface: SurfaceFill | undefined,
  textRect: VerseLayoutRect | null,
  boxRect: VerseLayoutRect | null | undefined
): VerseLayoutRect | null {
  if (!surface?.enabled) return null
  if (boxRect) return boxRect
  if (!textRect) return null
  return inflateRect(textRect, surface.padding)
}

/** Shrink a rect inwards by `padding` on every side, never past zero size. */
function deflateRect(rect: VerseLayoutRect, padding: number): VerseLayoutRect {
  const width = Math.max(0, rect.width - padding * 2)
  const height = Math.max(0, rect.height - padding * 2)
  return {
    x: rect.x + Math.min(padding, rect.width / 2),
    y: rect.y + Math.min(padding, rect.height / 2),
    width,
    height,
  }
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ")
  const lines: string[] = []
  let currentLine = ""

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const metrics = ctx.measureText(testLine)

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}

/** One hard-broken run of text, wrapped independently of the others. */
interface VerseParagraph {
  prepared: PreparedRichInline
  /** Per-item kind, indexed by RichInlineFragment.itemIndex. */
  kinds: ("word" | "verseNum")[]
}

export interface VerseInlineHandle {
  /** Segments split at `lineBreak`; scripture is always a single paragraph. */
  paragraphs: VerseParagraph[]
  wordFont: string
  verseNumFont: string
}

interface VerseLine extends RichInlineLine {
  kinds: VerseParagraph["kinds"]
  /** Last line of its paragraph: never justified, like a paragraph end. */
  paragraphEnd: boolean
}

/**
 * Compile verse segments into a pretext rich-inline flow: verse numbers are
 * their own atomic items so they wrap, measure, and draw with their own font
 * size. Numbers scale proportionally with the auto-fitted verse size; when
 * superscript is off they render at the full verse size (colour still applies).
 */
export function prepareVerseInline(
  theme: BroadcastTheme,
  verse: VerseRenderData,
  effectiveFontSize: number
): VerseInlineHandle | null {
  const vt = theme.verseText
  const vn = theme.verseNumbers
  const transform = resolveTextTransform(vt.textTransform)
  const ratio = vt.fontSize > 0 ? effectiveFontSize / vt.fontSize : 1
  const verseNumFontSize = vn.superscript
    ? Math.max(1, vn.fontSize * ratio)
    : effectiveFontSize
  const wordFont = `${vt.fontWeight} ${effectiveFontSize}px "${vt.fontFamily}", serif`
  const verseNumFont = `${vt.fontWeight} ${verseNumFontSize}px "${vt.fontFamily}", serif`
  const letterSpacing = vt.letterSpacing > 0 ? vt.letterSpacing : undefined

  const paragraphs: VerseParagraph[] = []
  let items: RichInlineItem[] = []
  let kinds: ("word" | "verseNum")[] = []
  const flush = () => {
    if (items.length) paragraphs.push({ prepared: prepareRichInline(items), kinds })
    items = []
    kinds = []
  }
  for (const segment of verse.segments) {
    if (segment.lineBreak) flush()
    if (vn.visible && segment.verseNumber !== undefined) {
      items.push({
        text: `${segment.verseNumber} `,
        font: verseNumFont,
        letterSpacing,
        break: "never",
      })
      kinds.push("verseNum")
    }
    const text = applyTextTransform(segment.text, transform).trim()
    if (text) {
      items.push({ text: `${text} `, font: wordFont, letterSpacing })
      kinds.push("word")
    }
  }
  flush()
  if (!paragraphs.length) return null

  return { paragraphs, wordFont, verseNumFont }
}

function layoutVerseLines(
  handle: VerseInlineHandle,
  maxWidth: number
): VerseLine[] {
  const lines: VerseLine[] = []
  for (const { prepared, kinds } of handle.paragraphs) {
    const start = lines.length
    walkRichInlineLineRanges(prepared, Math.max(1, maxWidth), (range) => {
      lines.push({
        ...materializeRichInlineLineRange(prepared, range),
        kinds,
        paragraphEnd: false,
      })
    })
    if (lines.length > start) lines[lines.length - 1].paragraphEnd = true
  }
  return lines
}

function alignX(
  textAlign: "left" | "center" | "right",
  rectX: number,
  rectWidth: number
): number {
  switch (textAlign) {
    case "left":
      return rectX
    case "center":
      return rectX + rectWidth / 2
    case "right":
      return rectX + rectWidth
  }
}

function alignY(
  verticalAlign: "top" | "middle" | "bottom",
  rectY: number,
  rectHeight: number,
  contentHeight: number
): number {
  switch (verticalAlign) {
    case "middle":
      return rectY + (rectHeight - contentHeight) / 2
    case "bottom":
      return rectY + rectHeight - contentHeight
    case "top":
    default:
      return rectY
  }
}

function resolveHorizontalAlign(
  value:
    | BroadcastTheme["verseText"]["horizontalAlign"]
    | BroadcastTheme["reference"]["horizontalAlign"]
    | undefined,
  fallback: BroadcastTheme["layout"]["textAlign"],
  allowJustify: boolean
): "left" | "center" | "right" | "justify" {
  if (!value) return fallback
  if (value === "justify" && !allowJustify) return fallback
  return value
}

function resolveVerticalAlign(
  value:
    | BroadcastTheme["verseText"]["verticalAlign"]
    | BroadcastTheme["reference"]["verticalAlign"]
    | undefined
): "top" | "middle" | "bottom" {
  return value ?? "top"
}

function resolveTextTransform(
  value:
    | BroadcastTheme["verseText"]["textTransform"]
    | BroadcastTheme["reference"]["textTransform"]
    | undefined
): "none" | "uppercase" | "lowercase" | "capitalize" {
  return value ?? "none"
}

function resolveTextDecoration(
  value:
    | BroadcastTheme["verseText"]["textDecoration"]
    | BroadcastTheme["reference"]["textDecoration"]
    | undefined
): "none" | "underline" | "line-through" {
  return value ?? "none"
}

function applyTextTransform(
  text: string,
  transform: "none" | "uppercase" | "lowercase" | "capitalize"
): string {
  switch (transform) {
    case "uppercase":
      return text.toUpperCase()
    case "lowercase":
      return text.toLowerCase()
    case "capitalize":
      return text.replace(/\b\w/g, (char) => char.toUpperCase())
    case "none":
    default:
      return text
  }
}

function drawTextDecorationLine(
  ctx: CanvasRenderingContext2D,
  decoration: "none" | "underline" | "line-through",
  color: string,
  align: "left" | "center" | "right" | "justify",
  x: number,
  y: number,
  width: number,
  fontSize: number,
  fallbackLeftX?: number
): void {
  if (decoration === "none" || width <= 0) return
  const startX =
    align === "left"
      ? x
      : align === "center"
        ? x - width / 2
        : align === "right"
          ? x - width
          : (fallbackLeftX ?? x)
  const lineY =
    decoration === "underline" ? y + fontSize * 0.92 : y + fontSize * 0.52
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, fontSize * 0.06)
  ctx.beginPath()
  ctx.moveTo(startX, lineY)
  ctx.lineTo(startX + width, lineY)
  ctx.stroke()
  ctx.restore()
}

function anchorPosition(
  anchor: BroadcastTheme["layout"]["anchor"],
  areaWidth: number,
  areaHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  offsetX: number,
  offsetY: number
): { x: number; y: number } {
  let x: number
  let y: number

  switch (anchor) {
    case "top-left":
      x = 0
      y = 0
      break
    case "top-center":
      x = (canvasWidth - areaWidth) / 2
      y = 0
      break
    case "top-right":
      x = canvasWidth - areaWidth
      y = 0
      break
    case "center":
      x = (canvasWidth - areaWidth) / 2
      y = (canvasHeight - areaHeight) / 2
      break
    case "bottom-left":
      x = 0
      y = canvasHeight - areaHeight
      break
    case "bottom-center":
      x = (canvasWidth - areaWidth) / 2
      y = canvasHeight - areaHeight
      break
    case "bottom-right":
      x = canvasWidth - areaWidth
      y = canvasHeight - areaHeight
      break
  }

  return { x: x + offsetX, y: y + offsetY }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.arcTo(x + width, y, x + width, y + radius, radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius)
  ctx.lineTo(x + radius, y + height)
  ctx.arcTo(x, y + height, x, y + height - radius, radius)
  ctx.lineTo(x, y + radius)
  ctx.arcTo(x, y, x + radius, y, radius)
  ctx.closePath()
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  rect: VerseLayoutRect,
  imageCache?: Map<string, HTMLImageElement>
): void {
  const { width, height } = theme.resolution
  const bg = theme.background

  switch (bg.type) {
    case "solid":
      ctx.fillStyle = bg.color
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
      break

    case "gradient": {
      if (!bg.gradient) break
      let grad: CanvasGradient

      if (bg.gradient.type === "linear") {
        const angle = (bg.gradient.angle * Math.PI) / 180
        const cx = rect.x + rect.width / 2
        const cy = rect.y + rect.height / 2
        const len =
          Math.sqrt(rect.width * rect.width + rect.height * rect.height) / 2
        grad = ctx.createLinearGradient(
          cx - Math.cos(angle) * len,
          cy - Math.sin(angle) * len,
          cx + Math.cos(angle) * len,
          cy + Math.sin(angle) * len
        )
      } else {
        grad = ctx.createRadialGradient(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
          0,
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
          Math.max(rect.width, rect.height) / 2
        )
      }

      for (const stop of bg.gradient.stops) {
        grad.addColorStop(stop.position / 100, stop.color)
      }

      ctx.fillStyle = grad
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
      break
    }

    case "image":
      drawImageFill(ctx, bg.image, rect, 0, imageCache)
      break

    case "transparent":
      ctx.clearRect(0, 0, width, height)
      break
  }
}

/**
 * Paint an image so it fills `rect`, clipped to `radius`. Shared by the frame
 * background and every surface fill, so a picture behaves the same wherever it
 * is used. While the image is still loading a deterministic flat fill stands in.
 */
function drawImageFill(
  ctx: CanvasRenderingContext2D,
  image: ThemeImageFill | null,
  rect: VerseLayoutRect,
  radius: number,
  imageCache?: Map<string, HTMLImageElement>
): void {
  if (!image) {
    ctx.fillStyle = "#000"
    fillRoundRect(ctx, rect, radius)
    return
  }
  const img = imageCache?.get(image.url)
  if (!img) {
    ctx.fillStyle = image.tint ?? "#000"
    fillRoundRect(ctx, rect, radius)
    return
  }

  ctx.save()
  // Rounded clip so an image respects the surface's corner radius, and so the
  // tint below can be painted inside it rather than over the rect's edges.
  roundRect(ctx, rect.x, rect.y, rect.width, rect.height, radius)
  ctx.clip()
  ctx.imageSmoothingQuality = "high"

  if (image.blur > 0) {
    ctx.filter = `blur(${image.blur}px) brightness(${image.brightness / 100})`
  } else if (image.brightness !== 100) {
    ctx.filter = `brightness(${image.brightness / 100})`
  }

  let drawX = rect.x
  let drawY = rect.y
  let drawW = rect.width
  let drawH = rect.height

  // Fit the artwork, not the canvas it was exported on: a band drawn in the
  // corner of a transparent 1920x1080 export must still fill its container.
  const { sx, sy, sw, sh } = imageContentBox(img)
  const imgRatio = sw / sh
  const rectRatio = rect.width / rect.height

  switch (image.fit) {
    case "cover":
      if (imgRatio > rectRatio) {
        drawH = rect.height
        drawW = rect.height * imgRatio
        drawX = rect.x + (rect.width - drawW) / 2
      } else {
        drawW = rect.width
        drawH = rect.width / imgRatio
        drawY = rect.y + (rect.height - drawH) / 2
      }
      break
    case "contain":
      if (imgRatio > rectRatio) {
        drawW = rect.width
        drawH = rect.width / imgRatio
        drawY = rect.y + (rect.height - drawH) / 2
      } else {
        drawH = rect.height
        drawW = rect.height * imgRatio
        drawX = rect.x + (rect.width - drawW) / 2
      }
      break
    case "stretch":
      break
  }

  ctx.drawImage(img, sx, sy, sw, sh, drawX, drawY, drawW, drawH)
  ctx.filter = "none"

  if (image.tint) {
    ctx.fillStyle = image.tint
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  }
  ctx.restore()
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  rect: VerseLayoutRect,
  radius: number
): void {
  roundRect(ctx, rect.x, rect.y, rect.width, rect.height, radius)
  ctx.fill()
}

/**
 * Paint one surface — the container behind a block of text: a colour wash and
 * then, if set, an image filling the same rect.
 */
function drawSurface(
  ctx: CanvasRenderingContext2D,
  surface: SurfaceFill | undefined,
  rect: VerseLayoutRect,
  baseOpacity: number,
  imageCache?: Map<string, HTMLImageElement>
): void {
  if (!surface?.enabled) return
  ctx.save()
  ctx.globalAlpha = baseOpacity * surface.opacity
  ctx.fillStyle = surface.color
  fillRoundRect(ctx, rect, surface.borderRadius)
  if (surface.image) {
    drawImageFill(ctx, surface.image, rect, surface.borderRadius, imageCache)
  }
  ctx.restore()
}

/**
 * Draw text with an optional outline around the letters and an optional
 * shadow. The outline is stroked first at twice its width, then the letters
 * are filled over it, so `outline.width` is how thick the outline shows
 * outside the glyphs (stroking on top used to eat into the letters and
 * barely show). The shadow goes under whichever is drawn first.
 */
function fillWithOutline(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  outline: { color: string; width: number } | null | undefined,
  shadow: { color: string; blur: number; x: number; y: number } | null | undefined
): void {
  const withShadow = () => {
    if (!shadow) return
    ctx.shadowColor = shadow.color
    ctx.shadowBlur = shadow.blur
    ctx.shadowOffsetX = shadow.x
    ctx.shadowOffsetY = shadow.y
  }
  ctx.save()
  if (outline && outline.width > 0) {
    withShadow()
    ctx.strokeStyle = outline.color
    ctx.lineWidth = outline.width * 2
    ctx.lineJoin = "round"
    ctx.miterLimit = 2
    ctx.strokeText(text, x, y)
    ctx.shadowColor = "transparent"
  } else {
    withShadow()
  }
  ctx.fillText(text, x, y)
  ctx.restore()
}

function drawReference(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  text: string,
  textRectX: number,
  textRectWidth: number,
  y: number
): number {
  const ref = theme.reference
  const transformed = applyTextTransform(
    ref.uppercase ? text.toUpperCase() : text,
    resolveTextTransform(ref.textTransform)
  )
  const refAlign = resolveHorizontalAlign(
    ref.horizontalAlign,
    theme.layout.textAlign,
    false
  )
  const refDecoration = resolveTextDecoration(ref.textDecoration)

  ctx.save()
  ctx.font = `${ref.fontWeight} ${ref.fontSize}px "${ref.fontFamily}", sans-serif`
  ctx.fillStyle = ref.color
  ctx.textBaseline = "top"

  if (ref.letterSpacing > 0) {
    try {
      ctx.letterSpacing = `${ref.letterSpacing}px`
    } catch {
      /* unsupported in some WebViews */
    }
  }

  const canvasAlign = refAlign === "justify" ? "left" : refAlign
  ctx.textAlign = canvasAlign
  const x = alignX(canvasAlign, textRectX, textRectWidth)
  fillWithOutline(ctx, transformed, x, y, ref.outline, null)
  const drawnWidth = Math.min(
    textRectWidth,
    Math.max(1, ctx.measureText(transformed).width)
  )
  drawTextDecorationLine(
    ctx,
    refDecoration,
    ref.color,
    refAlign,
    x,
    y,
    drawnWidth,
    ref.fontSize,
    textRectX
  )
  ctx.restore()

  return ref.fontSize * 1.5
}

function drawVerseText(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  verse: VerseRenderData,
  textRectX: number,
  textRectWidth: number,
  startY: number,
  scaledFontSize?: number
): number {
  const vt = theme.verseText
  const vn = theme.verseNumbers
  const verseAlign = resolveHorizontalAlign(
    vt.horizontalAlign,
    theme.layout.textAlign,
    true
  )
  const verseDecoration = resolveTextDecoration(vt.textDecoration)
  const actualFontSize = scaledFontSize ?? vt.fontSize
  const lineHeightPx = actualFontSize * vt.lineHeight

  ctx.save()
  ctx.textBaseline = "top"
  ctx.textAlign = "left"

  if (vt.letterSpacing > 0) {
    try {
      ctx.letterSpacing = `${vt.letterSpacing}px`
    } catch {
      /* unsupported in some WebViews */
    }
  }

  const handle = prepareVerseInline(theme, verse, actualFontSize)
  if (!handle) {
    ctx.restore()
    return 0
  }
  const lines = layoutVerseLines(handle, textRectWidth)

  const drawFragment = (
    text: string,
    kind: "word" | "verseNum",
    drawX: number,
    drawY: number
  ) => {
    ctx.font = kind === "verseNum" ? handle.verseNumFont : handle.wordFont
    ctx.fillStyle = kind === "verseNum" ? vn.color : vt.color

    fillWithOutline(ctx, text, drawX, drawY, vt.outline, vt.shadow)
  }

  let currentY = startY
  for (const line of lines) {
    const isJustifiedLine =
      verseAlign === "justify" &&
      !line.paragraphEnd &&
      line.fragments.length > 1

    let extraGap = 0
    let lineStartX = textRectX
    let lineWidth = line.width
    if (isJustifiedLine) {
      extraGap = (textRectWidth - line.width) / (line.fragments.length - 1)
      lineWidth = textRectWidth
    } else if (verseAlign === "center") {
      lineStartX = textRectX + (textRectWidth - line.width) / 2
    } else if (verseAlign === "right") {
      lineStartX = textRectX + textRectWidth - line.width
    }

    let cursorX = lineStartX
    for (const [i, fragment] of line.fragments.entries()) {
      cursorX += fragment.gapBefore + (i > 0 ? extraGap : 0)
      drawFragment(
        fragment.text,
        line.kinds[fragment.itemIndex],
        cursorX,
        currentY
      )
      cursorX += fragment.occupiedWidth
    }
    drawTextDecorationLine(
      ctx,
      verseDecoration,
      vt.color,
      "left",
      lineStartX,
      currentY,
      Math.min(textRectWidth, Math.max(1, lineWidth)),
      actualFontSize,
      textRectX
    )
    currentY += lineHeightPx
  }

  ctx.restore()

  return currentY - startY
}

function buildScaledTheme(
  theme: BroadcastTheme,
  scale: number
): BroadcastTheme {
  const layout = {
    ...theme.layout,
    offsetX: theme.layout.offsetX * scale,
    offsetY: theme.layout.offsetY * scale,
    padding: {
      top: theme.layout.padding.top * scale,
      right: theme.layout.padding.right * scale,
      bottom: theme.layout.padding.bottom * scale,
      left: theme.layout.padding.left * scale,
    },
  }
  return {
    ...theme,
    layout,
    resolution: {
      width: theme.resolution.width * scale,
      height: theme.resolution.height * scale,
    },
    background: {
      ...theme.background,
      image: theme.background.image
        ? { ...theme.background.image, blur: theme.background.image.blur * scale }
        : null,
    },
    verseText: {
      ...theme.verseText,
      fontSize: theme.verseText.fontSize * scale,
      letterSpacing: theme.verseText.letterSpacing * scale,
      shadow: theme.verseText.shadow
        ? {
            ...theme.verseText.shadow,
            blur: theme.verseText.shadow.blur * scale,
            x: theme.verseText.shadow.x * scale,
            y: theme.verseText.shadow.y * scale,
          }
        : null,
      outline: theme.verseText.outline
        ? {
            ...theme.verseText.outline,
            width: theme.verseText.outline.width * scale,
          }
        : null,
      surface: scaleSurface(theme.verseText.surface, scale),
    },
    verseNumbers: {
      ...theme.verseNumbers,
      fontSize: theme.verseNumbers.fontSize * scale,
    },
    reference: {
      ...theme.reference,
      outline: theme.reference.outline
        ? { ...theme.reference.outline, width: theme.reference.outline.width * scale }
        : null,
      fontSize: theme.reference.fontSize * scale,
      letterSpacing: theme.reference.letterSpacing * scale,
      surface: scaleSurface(theme.reference.surface, scale),
    },
    textBox: scaleSurface(theme.textBox, scale)!,
  }
}

/**
 * Scale a surface's px-valued fields. Image blur counts: it is an absolute px
 * radius, so an unscaled value over-blurs thumbnails relative to the output.
 */
function scaleSurface(
  surface: SurfaceFill | undefined,
  scale: number
): SurfaceFill | undefined {
  if (!surface) return undefined
  return {
    ...surface,
    borderRadius: surface.borderRadius * scale,
    padding: surface.padding * scale,
    image: surface.image
      ? { ...surface.image, blur: surface.image.blur * scale }
      : null,
  }
}

/**
 * Figure out how much vertical space is left for the verse text after accounting for the reference (and its gap).
 *
 * @param theme
 * @param textRect
 * @param referenceHeight
 * @returns
 */
function calculateMaxAvailableVerseHeight(
  theme: BroadcastTheme,
  textRect: VerseLayoutRect,
  referenceHeight: number
): number {
  const referenceGap = Math.max(
    0,
    // 0.5 x fontSize scales naturally with different themes
    theme.layout.referenceGap ?? theme.reference.fontSize * 0.5
  )

  // No reference text: the verse may use the whole height.
  if (referenceHeight === 0) return textRect.height

  switch (theme.reference.position) {
    case "above":
      return textRect.height - referenceHeight
    case "below":
      return textRect.height - referenceHeight - referenceGap
    case "inline":
    default:
      return textRect.height
  }
}

/** 
 * Returns the largest verse font size that fits within the available height without overflowing, using binary search.
 * 
 * @param ctx 
 * @param theme 
 * @param verse 
 * @param textRectWidth 
 * @param maxHeight 
 * @returns 
 */
function calculateScaledFontSize(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  verse: VerseRenderData,
  textRectWidth: number,
  maxHeight: number
): number {
  const originalFontSize = theme.verseText.fontSize
  const minFontSize = Math.max(8, originalFontSize * 0.3) // Don't go below 30% of original or 8px

  // Binary search for optimal font size
  let low = minFontSize
  let high = originalFontSize
  let bestFit = originalFontSize

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)

    // If I use this font size, how tall will the verse be?
    const metrics = measureVerseHeight(ctx, theme, verse, textRectWidth, mid)

    // Check if the rendered verse is still too big to fit
    if (metrics.height <= maxHeight) {
      // Increase the font size
      bestFit = mid
      low = mid + 1
    } else {
      // Doesn't fit, decrease the font size
      high = mid - 1
    }
  }

  return bestFit
}

/**
 * How much bigger flowing a lyric screen's lines into one paragraph must
 * make the text before its line breaks are given up. Keeping each sung line
 * on its own line reads better, so a marginal gain isn't worth it.
 */
const FLOW_MIN_GAIN = 1.1

/**
 * Fit text into a box, returning the font size and the text as it should be
 * drawn. Scripture flows as one paragraph across the full width. Lyrics
 * start a new line per sung line, which in a short, wide box stacks short
 * lines and shrinks the text while most of the width sits empty; when
 * flowing the words like scripture lets the text be clearly bigger, the
 * lyrics flow instead.
 */
export function fitVerseText(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  verse: VerseRenderData,
  width: number,
  maxHeight: number
): { fontSize: number; verse: VerseRenderData } {
  const asWritten = calculateScaledFontSize(ctx, theme, verse, width, maxHeight)
  if (!verse.segments.some((segment) => segment.lineBreak)) {
    return { fontSize: asWritten, verse }
  }
  const flowed: VerseRenderData = {
    ...verse,
    segments: verse.segments.map((segment) => ({ ...segment, lineBreak: false })),
  }
  const flowedSize = calculateScaledFontSize(ctx, theme, flowed, width, maxHeight)
  return flowedSize >= asWritten * FLOW_MIN_GAIN
    ? { fontSize: flowedSize, verse: flowed }
    : { fontSize: asWritten, verse }
}

/**
 * Fit at the theme's own resolution, then scale the result to the canvas.
 * Fitting at each canvas's size made small canvases (the Preview and Live
 * panels) disagree with the full-size output: font sizes are searched in
 * whole pixels with an 8 px floor, so at a fifth of the size a fit that
 * needs 7 px stopped at 8 and the text overflowed, and rounding could wrap
 * lines differently. Now every canvas shows the output's layout, scaled.
 * `width` and `maxHeight` are in canvas (scaled) pixels.
 */
function fitAtThemeSize(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  scale: number,
  verse: VerseRenderData,
  width: number,
  maxHeight: number
): { fontSize: number; verse: VerseRenderData } {
  const fit =
    theme.verseText.shrinkToFit === false
      ? fixedSizeLayout(ctx, theme, verse, width / scale, maxHeight / scale)
      : fitVerseText(ctx, theme, verse, width / scale, maxHeight / scale)
  return { fontSize: fit.fontSize * scale, verse: fit.verse }
}

/**
 * With shrink-to-fit off the size is the theme's, always. Lyrics keep their
 * line breaks if that fits the box, otherwise flow like scripture when that
 * takes less height.
 */
function fixedSizeLayout(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  verse: VerseRenderData,
  width: number,
  maxHeight: number
): { fontSize: number; verse: VerseRenderData } {
  const fontSize = theme.verseText.fontSize
  if (!verse.segments.some((segment) => segment.lineBreak)) return { fontSize, verse }
  const asWritten = measureVerseHeight(ctx, theme, verse, width, fontSize).height
  if (asWritten <= maxHeight) return { fontSize, verse }
  const flowed: VerseRenderData = {
    ...verse,
    segments: verse.segments.map((segment) => ({ ...segment, lineBreak: false })),
  }
  const flowedHeight = measureVerseHeight(ctx, theme, flowed, width, fontSize).height
  return { fontSize, verse: flowedHeight < asWritten ? flowed : verse }
}

// The ctx parameter is kept for call-site symmetry with the draw path, but
// measurement now happens inside pretext's own canvas context.
export function measureVerseHeight(
  _ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  verse: VerseRenderData,
  textRectWidth: number,
  fontSizeOverride?: number
): { height: number; maxLineWidth: number } {
  const vt = theme.verseText
  const verseAlign = resolveHorizontalAlign(
    vt.horizontalAlign,
    theme.layout.textAlign,
    true
  )
  const effectiveFontSize = fontSizeOverride ?? vt.fontSize
  const lineHeightPx = effectiveFontSize * vt.lineHeight
  const handle = prepareVerseInline(theme, verse, effectiveFontSize)
  if (!handle) {
    return { height: lineHeightPx, maxLineWidth: 1 }
  }
  let lineCount = 0
  let widest = 0
  for (const { prepared } of handle.paragraphs) {
    const stats = measureRichInlineStats(prepared, Math.max(1, textRectWidth))
    lineCount += stats.lineCount
    widest = Math.max(widest, stats.maxLineWidth)
  }
  const maxLineWidth =
    verseAlign === "justify" && lineCount > 1 ? textRectWidth : widest
  return {
    height: Math.max(1, lineCount) * lineHeightPx,
    maxLineWidth: Math.max(1, maxLineWidth),
  }
}

function pctBoxToPx(
  box: { x: number; y: number; width: number; height: number },
  canvasW: number,
  canvasH: number
): VerseLayoutRect {
  return {
    x: (box.x / 100) * canvasW,
    y: (box.y / 100) * canvasH,
    width: Math.max(1, (box.width / 100) * canvasW),
    height: Math.max(1, (box.height / 100) * canvasH),
  }
}

function rectForAlignedText(
  align: BroadcastTheme["layout"]["textAlign"],
  drawX: number,
  drawY: number,
  width: number,
  height: number,
  textRect: VerseLayoutRect
): VerseLayoutRect {
  let x = drawX
  if (align === "center") x = drawX - width / 2
  if (align === "right") x = drawX - width
  const clampedX = Math.max(
    textRect.x,
    Math.min(x, textRect.x + textRect.width - width)
  )
  const clampedY = Math.max(textRect.y, drawY)
  return {
    x: clampedX,
    y: clampedY,
    width: Math.min(width, textRect.width),
    height: Math.min(height, textRect.height),
  }
}

/** The anchored background region of an already-scaled theme. */
function regionFor(scaledTheme: BroadcastTheme, offsetX: number, offsetY: number): VerseLayoutRect {
  const { layout, resolution } = scaledTheme
  const width = (layout.backgroundWidth / 100) * resolution.width
  const height = (layout.backgroundHeight / 100) * resolution.height
  const { x, y } = anchorPosition(
    layout.anchor,
    width,
    height,
    resolution.width,
    resolution.height,
    offsetX + layout.offsetX,
    offsetY + layout.offsetY
  )
  return { x, y, width, height }
}

/**
 * Where the theme's background is drawn, at `scale`: the area a background
 * video covers. Depends only on the theme, so a <video> placed behind the
 * canvas can be sized without laying out any text.
 */
export function backgroundRegion(theme: BroadcastTheme, scale = 1): VerseLayoutRect {
  return regionFor(buildScaledTheme(theme, scale), 0, 0)
}

export function computeVerseLayoutMetrics(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  verse: VerseRenderData | null,
  options?: RenderOptions
): VerseLayoutMetrics {
  const metrics = layoutVerse(ctx, theme, verse, options)
  // No reference text: no reference, and no empty plate where it would be.
  if (verse && !verse.reference.trim()) {
    return { ...metrics, referenceRect: null, referenceSurfaceRect: null }
  }
  return metrics
}

function layoutVerse(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  verse: VerseRenderData | null,
  options?: RenderOptions
): VerseLayoutMetrics {
  ensureThemeFontsLoaded(theme)
  const scale = options?.scale ?? 1
  const scaledTheme = buildScaledTheme(theme, scale)
  const canvasW = scaledTheme.resolution.width
  const canvasH = scaledTheme.resolution.height
  const layout = scaledTheme.layout

  const backgroundRect = regionFor(scaledTheme, options?.offsetX ?? 0, options?.offsetY ?? 0)
  const bgPos = { x: backgroundRect.x, y: backgroundRect.y }
  const bgW = backgroundRect.width
  const bgH = backgroundRect.height
  const textAreaW = (layout.textAreaWidth / 100) * bgW
  const textAreaH = (layout.textAreaHeight / 100) * bgH
  // Text area is anchored within the background region (offsets are already
  // applied to the region itself). At 100% × 100% this matches anchoring to
  // the canvas directly.
  const innerPos = anchorPosition(layout.anchor, textAreaW, textAreaH, bgW, bgH, 0, 0)
  const pos = { x: bgPos.x + innerPos.x, y: bgPos.y + innerPos.y }

  const pad = layout.padding
  // The container's own padding insets the text too, so content wraps inside
  // the surface rather than running to its edges.
  const surfacePad = scaledTheme.textBox.enabled ? scaledTheme.textBox.padding : 0
  const textRectX = pos.x + pad.left + surfacePad
  const textRectY = pos.y + pad.top + surfacePad
  const textRectW = textAreaW - pad.left - pad.right - surfacePad * 2
  const textRectH = textAreaH - pad.top - pad.bottom - surfacePad * 2
  const textAreaRect: VerseLayoutRect = {
    x: pos.x,
    y: pos.y,
    width: textAreaW,
    height: textAreaH,
  }
  const textRect: VerseLayoutRect = {
    x: textRectX,
    y: textRectY,
    width: textRectW,
    height: textRectH,
  }

  const freeMode =
    layout.mode === "free" &&
    layout.referenceBox !== undefined &&
    layout.verseBox !== undefined
  const referenceBoxRect: VerseLayoutRect | null = freeMode
    ? pctBoxToPx(layout.referenceBox!, canvasW, canvasH)
    : null
  const verseBoxRect: VerseLayoutRect | null = freeMode
    ? pctBoxToPx(layout.verseBox!, canvasW, canvasH)
    : null

  if (!verse) {
    return {
      scaledTheme,
      backgroundRect,
      textBoxRect: textAreaRect,
      textAreaRect: verseBoxRect ?? textAreaRect,
      textRect: verseBoxRect ?? textRect,
      referenceRect: null,
      verseRect: null,
      referenceBoxRect,
      verseBoxRect,
      referenceSurfaceRect: null,
      verseSurfaceRect: null,
    }
  }

  // Content without a reference (lyrics credit themselves in a corner
  // instead) gives its space to the text.
  const hasReference = verse.reference.trim() !== ""
  const referenceHeight = hasReference ? scaledTheme.reference.fontSize * 1.5 : 0
  const verseAlign = resolveHorizontalAlign(
    scaledTheme.verseText.horizontalAlign,
    scaledTheme.layout.textAlign,
    true
  )
  const referenceAlign = resolveHorizontalAlign(
    scaledTheme.reference.horizontalAlign,
    scaledTheme.layout.textAlign,
    false
  )

  const refText = applyTextTransform(
    scaledTheme.reference.uppercase
      ? verse.reference.toUpperCase()
      : verse.reference,
    resolveTextTransform(scaledTheme.reference.textTransform)
  )
  const measureReferenceWidth = (maxWidth: number) => {
    ctx.save()
    ctx.font = `${scaledTheme.reference.fontWeight} ${scaledTheme.reference.fontSize}px "${scaledTheme.reference.fontFamily}", sans-serif`
    const width = Math.max(
      1,
      Math.min(maxWidth, ctx.measureText(refText).width)
    )
    ctx.restore()
    return width
  }

  // A plate on an element insets that element's text, so content sits inside
  // the fill instead of running to its edges.
  const referenceContentRect =
    referenceBoxRect && scaledTheme.reference.surface?.enabled
      ? deflateRect(referenceBoxRect, scaledTheme.reference.surface.padding)
      : referenceBoxRect
  const verseContentRect =
    verseBoxRect && scaledTheme.verseText.surface?.enabled
      ? deflateRect(verseBoxRect, scaledTheme.verseText.surface.padding)
      : verseBoxRect

  if (freeMode && referenceBoxRect && verseBoxRect) {
    const { fontSize: fittedVerseFontSize, verse: fittedVerse } = fitAtThemeSize(
      ctx,
      theme,
      scale,
      verse,
      verseContentRect!.width,
      verseContentRect!.height
    )
    const verseMetrics = measureVerseHeight(
      ctx,
      scaledTheme,
      fittedVerse,
      verseContentRect!.width,
      fittedVerseFontSize
    )
    const verseY = alignY(
      resolveVerticalAlign(scaledTheme.verseText.verticalAlign),
      verseContentRect!.y,
      verseContentRect!.height,
      verseMetrics.height
    )
    const verseRect = rectForAlignedText(
      verseAlign === "justify" ? "left" : verseAlign,
      alignX(
        verseAlign === "justify" ? "left" : verseAlign,
        verseContentRect!.x,
        verseContentRect!.width
      ),
      verseY,
      verseMetrics.maxLineWidth,
      verseMetrics.height,
      verseContentRect!
    )

    const referenceWidth = measureReferenceWidth(referenceContentRect!.width)
    const refY = alignY(
      resolveVerticalAlign(scaledTheme.reference.verticalAlign),
      referenceContentRect!.y,
      referenceContentRect!.height,
      referenceHeight
    )
    const referenceRect = rectForAlignedText(
      referenceAlign === "justify" ? "left" : referenceAlign,
      alignX(
        referenceAlign === "justify" ? "left" : referenceAlign,
        referenceContentRect!.x,
        referenceContentRect!.width
      ),
      refY,
      referenceWidth,
      referenceHeight,
      referenceContentRect!
    )

    return {
      scaledTheme,
      backgroundRect,
      textBoxRect: textAreaRect,
      textAreaRect: verseContentRect!,
      textRect: verseContentRect!,
      referenceRect,
      verseRect,
      fittedVerseFontSize,
      fittedVerse,
      referenceBoxRect,
      verseBoxRect,
      // In free mode each element owns a box, so its plate fills that box.
      referenceSurfaceRect: surfaceRectFor(
        scaledTheme.reference.surface,
        referenceRect,
        referenceBoxRect
      ),
      verseSurfaceRect: surfaceRectFor(
        scaledTheme.verseText.surface,
        verseRect,
        verseBoxRect
      ),
    }
  }

  const blockVerticalAlign = resolveVerticalAlign(
    scaledTheme.reference.position === "above"
      ? (scaledTheme.reference.verticalAlign ??
          scaledTheme.verseText.verticalAlign)
      : (scaledTheme.verseText.verticalAlign ??
          scaledTheme.reference.verticalAlign)
  )
  const referenceGap = hasReference
    ? Math.max(0, scaledTheme.layout.referenceGap ?? scaledTheme.reference.fontSize * 0.5)
    : 0
  const { fontSize: fittedVerseFontSize, verse: fittedVerse } = fitAtThemeSize(
    ctx,
    theme,
    scale,
    verse,
    textRectW,
    calculateMaxAvailableVerseHeight(scaledTheme, textRect, referenceHeight)
  )
  const verseMetrics = measureVerseHeight(
    ctx,
    scaledTheme,
    fittedVerse,
    textRectW,
    fittedVerseFontSize
  )
  const verseHeight = verseMetrics.height
  const verseDrawX = alignX(
    verseAlign === "justify" ? "left" : verseAlign,
    textRectX,
    textRectW
  )
  const referenceDrawX = alignX(
    referenceAlign === "justify" ? "left" : referenceAlign,
    textRectX,
    textRectW
  )
  const referenceWidth = measureReferenceWidth(textRectW)

  const blockHeight =
    scaledTheme.reference.position === "above"
      ? referenceHeight + verseHeight
      : scaledTheme.reference.position === "below"
        ? verseHeight + referenceGap + referenceHeight
        : verseHeight + referenceHeight
  const blockStartY = alignY(
    blockVerticalAlign,
    textRectY,
    textRectH,
    blockHeight
  )

  let referenceRect: VerseLayoutRect
  let verseRect: VerseLayoutRect
  if (scaledTheme.reference.position === "above") {
    const refY = blockStartY
    const verseY = blockStartY + referenceHeight
    referenceRect = rectForAlignedText(
      referenceAlign === "justify" ? "left" : referenceAlign,
      referenceDrawX,
      refY,
      referenceWidth,
      referenceHeight,
      textRect
    )
    verseRect = rectForAlignedText(
      verseAlign === "justify" ? "left" : verseAlign,
      verseDrawX,
      verseY,
      verseMetrics.maxLineWidth,
      verseHeight,
      textRect
    )
  } else if (scaledTheme.reference.position === "below") {
    const verseY = blockStartY
    const refY = blockStartY + verseHeight + referenceGap
    verseRect = rectForAlignedText(
      verseAlign === "justify" ? "left" : verseAlign,
      verseDrawX,
      verseY,
      verseMetrics.maxLineWidth,
      verseHeight,
      textRect
    )
    referenceRect = rectForAlignedText(
      referenceAlign === "justify" ? "left" : referenceAlign,
      referenceDrawX,
      refY,
      referenceWidth,
      referenceHeight,
      textRect
    )
  } else {
    const verseY = blockStartY
    const refY = blockStartY + verseHeight
    verseRect = rectForAlignedText(
      verseAlign === "justify" ? "left" : verseAlign,
      verseDrawX,
      verseY,
      verseMetrics.maxLineWidth,
      verseHeight,
      textRect
    )
    referenceRect = rectForAlignedText(
      referenceAlign === "justify" ? "left" : referenceAlign,
      referenceDrawX,
      refY,
      referenceWidth,
      referenceHeight,
      textRect
    )
  }

  return {
    scaledTheme,
    backgroundRect,
    textBoxRect: textAreaRect,
    textAreaRect,
    textRect,
    referenceRect,
    verseRect,
    fittedVerseFontSize,
    fittedVerse,
    referenceBoxRect: null,
    verseBoxRect: null,
    // Stacked mode has no per-element boxes, so each plate hugs its own text.
    referenceSurfaceRect: surfaceRectFor(
      scaledTheme.reference.surface,
      referenceRect,
      null
    ),
    verseSurfaceRect: surfaceRectFor(
      scaledTheme.verseText.surface,
      verseRect,
      null
    ),
  }
}

/**
 * Fit a picture to the whole frame on black, keeping its aspect ratio — how a
 * presentation slide or a video is shown. The theme plays no part: a 4:3
 * deck on a 16:9 output gets black bars, never a stretch or a crop. Black
 * while it loads.
 */
function drawFullFrame(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  picture: { source: CanvasImageSource; width: number; height: number } | null,
  options?: RenderOptions
): void {
  const scale = options?.scale ?? 1
  const frameW = theme.resolution.width * scale
  const frameH = theme.resolution.height * scale

  ctx.save()
  if (options?.opacity !== undefined) ctx.globalAlpha = options.opacity
  ctx.fillStyle = "#000"
  ctx.fillRect(0, 0, frameW, frameH)

  if (picture && picture.width > 0 && picture.height > 0) {
    // The default "low" smoothing turns a downscaled slide soft and jagged.
    ctx.imageSmoothingQuality = "high"
    const fit = Math.min(frameW / picture.width, frameH / picture.height)
    const drawW = picture.width * fit
    const drawH = picture.height * fit
    ctx.drawImage(picture.source, (frameW - drawW) / 2, (frameH - drawH) / 2, drawW, drawH)
  }
  ctx.restore()
}

function cachedPicture(url: string | undefined, options?: RenderOptions) {
  const img = url ? options?.imageCache?.get(url) : undefined
  return img ? { source: img, width: img.naturalWidth, height: img.naturalHeight } : null
}

/**
 * A video's current frame from the window's own copy (`el`), once it has
 * one; before that (and in windows without a copy) its poster.
 */
function videoPicture(
  video: VideoPlayback,
  el: HTMLVideoElement | null | undefined,
  options?: RenderOptions
) {
  if (el && el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && el.videoWidth > 0) {
    return { source: el, width: el.videoWidth, height: el.videoHeight }
  }
  return cachedPicture(video.poster, options)
}

/**
 * A background video in place of the theme's background: it covers the
 * background region (cropping, never letterboxing, as motion backgrounds
 * are meant to be), black until its first frame or poster is ready.
 */
function drawVideoBackground(
  ctx: CanvasRenderingContext2D,
  background: VideoPlayback,
  rect: VerseLayoutRect,
  options?: RenderOptions
): void {
  const picture = videoPicture(background, options?.backgroundVideo, options)
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.width, rect.height)
  ctx.clip()
  ctx.fillStyle = "#000"
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  if (picture && picture.width > 0 && picture.height > 0) {
    ctx.imageSmoothingQuality = "high"
    const cover = Math.max(rect.width / picture.width, rect.height / picture.height)
    const drawW = picture.width * cover
    const drawH = picture.height * cover
    ctx.drawImage(
      picture.source,
      rect.x + (rect.width - drawW) / 2,
      rect.y + (rect.height - drawH) / 2,
      drawW,
      drawH
    )
  }
  ctx.restore()
}

/** Credit line size and corner inset, as fractions of the frame height. */
const CREDIT_SIZE = 0.024
const CREDIT_INSET = 0.03

/**
 * A small credit (e.g. "Way Maker · Sinach") in the bottom-right corner of
 * the background region, in the theme's reference font and colour. A soft
 * shadow keeps it legible over a busy motion background.
 */
function drawCredit(
  ctx: CanvasRenderingContext2D,
  scaledTheme: BroadcastTheme,
  credit: string,
  region: VerseLayoutRect
): void {
  const ref = scaledTheme.reference
  const frameH = scaledTheme.resolution.height
  const size = Math.max(8, frameH * CREDIT_SIZE)
  const inset = frameH * CREDIT_INSET
  ctx.save()
  ctx.font = `${ref.fontWeight} ${size}px "${ref.fontFamily}", sans-serif`
  ctx.fillStyle = ref.color
  ctx.textAlign = "right"
  ctx.textBaseline = "alphabetic"
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)"
  ctx.shadowBlur = size * 0.4
  ctx.shadowOffsetY = size * 0.06
  const maxWidth = Math.max(1, region.width - inset * 2)
  ctx.fillText(credit, region.x + region.width - inset, region.y + region.height - inset, maxWidth)
  ctx.restore()
}

export function renderVerse(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  verse: VerseRenderData | null,
  options?: RenderOptions
): VerseLayoutMetrics | null {
  try {
    return renderVerseImpl(ctx, theme, verse, options)
  } catch (e) {
    console.error("[verse-renderer] render error:", e)
    return null
  }
}

function renderVerseImpl(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  verse: VerseRenderData | null,
  options?: RenderOptions
): VerseLayoutMetrics {
  if (verse?.image || verse?.video) {
    const picture = verse.video
      ? videoPicture(verse.video, options?.video, options)
      : cachedPicture(verse.image?.url, options)
    drawFullFrame(ctx, theme, picture, options)
    return computeVerseLayoutMetrics(ctx, theme, null, options)
  }

  const metrics = computeVerseLayoutMetrics(ctx, theme, verse, options)
  const scaledTheme = metrics.scaledTheme

  ctx.save()

  // Apply global opacity
  if (options?.opacity !== undefined) {
    ctx.globalAlpha = options.opacity
  }

  // Draw background: the theme's own, or a motion background in its place.
  if (verse?.background && options?.backgroundBehind) {
    const r = metrics.backgroundRect
    ctx.clearRect(r.x, r.y, r.width, r.height)
  } else if (verse?.background) {
    drawVideoBackground(ctx, verse.background, metrics.backgroundRect, options)
  } else {
    drawBackground(ctx, scaledTheme, metrics.backgroundRect, options?.imageCache)
  }

  // The container behind the reference + verse block, then each element's own
  // plate on top of it.
  const baseOpacity = options?.opacity ?? 1
  drawSurface(
    ctx,
    scaledTheme.textBox,
    metrics.textBoxRect,
    baseOpacity,
    options?.imageCache
  )
  if (metrics.referenceSurfaceRect) {
    drawSurface(
      ctx,
      scaledTheme.reference.surface,
      metrics.referenceSurfaceRect,
      baseOpacity,
      options?.imageCache
    )
  }
  if (metrics.verseSurfaceRect) {
    drawSurface(
      ctx,
      scaledTheme.verseText.surface,
      metrics.verseSurfaceRect,
      baseOpacity,
      options?.imageCache
    )
  }

  // If no verse data, just draw the background and text box
  if (!verse) {
    ctx.restore()
    return metrics
  }

  const referenceRect = metrics.referenceRect
  const verseRect = metrics.verseRect
  const verseArea = metrics.verseBoxRect ?? metrics.textRect
  const referenceArea = metrics.referenceBoxRect ?? metrics.textRect
  if (verseRect) {
    drawVerseText(
      ctx,
      scaledTheme,
      metrics.fittedVerse ?? verse,
      verseArea.x,
      verseArea.width,
      verseRect.y,
      metrics.fittedVerseFontSize
    )
  }
  if (referenceRect) {
    drawReference(
      ctx,
      scaledTheme,
      verse.reference,
      referenceArea.x,
      referenceArea.width,
      referenceRect.y
    )
  }
  if (verse.credit?.trim()) {
    drawCredit(ctx, scaledTheme, verse.credit.trim(), metrics.backgroundRect)
  }

  ctx.restore()
  return metrics
}

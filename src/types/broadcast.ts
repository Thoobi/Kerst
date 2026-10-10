export interface VerseSegment {
  verseNumber?: number
  text: string
  /**
   * Start this segment on a new line instead of flowing it after the
   * previous one. Lyrics set it on every line; scripture never does.
   */
  lineBreak?: boolean
}

export interface VerseRenderData {
  reference: string
  segments: VerseSegment[]
  /**
   * A full-frame picture, e.g. an imported presentation slide. When set the
   * theme is not drawn: the image is fitted to the frame on black, and
   * `reference` and `segments` are not drawn (`reference` stays the label).
   */
  image?: { url: string }
  /**
   * A video playing full frame, like `image`. Every window plays its own
   * copy and keeps it in step with this shared clock; until a window's copy
   * can show a frame, the poster is drawn instead.
   */
  video?: VideoPlayback
  /**
   * A small credit line in the bottom-right corner, e.g. a song's title and
   * author, kept off the main text so only the words are big on screen.
   */
  credit?: string
  /**
   * A looping video drawn in place of the theme's background, behind the
   * text, e.g. a motion background behind lyrics. Silent; every window
   * follows its clock like `video`.
   */
  background?: VideoPlayback
}

/**
 * Where a video is, as a clock every window can read: at `anchor`
 * (`Date.now()`) it was at `position` seconds, and if `playing` it has moved
 * on in real time since. Windows on one machine share the wall clock, so
 * they agree without talking to each other.
 */
export interface VideoPlayback {
  /** Library id, so the Videos tab can mark what is live. */
  id: string
  url: string
  poster?: string
  /** Seconds. */
  duration: number
  loop: boolean
  playing: boolean
  /** Seconds into the video at `anchor`. */
  position: number
  anchor: number
}

export interface RenderOptions {
  opacity?: number
  offsetX?: number
  offsetY?: number
  scale?: number               // Scale factor for rendering at display size (e.g., 0.42 for 400px panel)
  imageCache?: Map<string, HTMLImageElement>
  /** A window's own copy of the live video, drawn in place of its poster once it has a frame. */
  video?: HTMLVideoElement | null
  /** A window's own copy of the background video, likewise. */
  backgroundVideo?: HTMLVideoElement | null
  /**
   * A <video> element shows the background video behind this canvas, so
   * leave the background region transparent instead of copying frames in:
   * copying a 1080p frame onto a canvas costs WebKitGTK ~22 ms, too slow to
   * keep up with the video. Canvases that must hold the pixels (NDI) leave
   * this off.
   */
  backgroundBehind?: boolean
}

/** A freely positioned element region, all values in % of canvas size (0-100), x/y = top-left. */
export interface ElementBox {
  x: number
  y: number
  width: number
  height: number
}

/** An image fill: how a picture is fitted into whatever rect it is drawn in. */
export interface ThemeImageFill {
  url: string
  fit: "cover" | "contain" | "stretch"
  blur: number
  brightness: number
  tint: string | null
}

/**
 * A filled surface drawn behind content — the container the text lives in.
 * Content wraps inside it, inset by `padding`.
 */
export interface SurfaceFill {
  enabled: boolean
  color: string
  opacity: number
  borderRadius: number
  /** Inset for the content on this surface, in theme px. */
  padding: number
  /** When set, fills the surface, clipped to `borderRadius`. */
  image: ThemeImageFill | null
}

export type TextHorizontalAlign = "left" | "center" | "right" | "justify"
export type TextVerticalAlign = "top" | "middle" | "bottom"
export type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize"
export type TextDecoration = "none" | "underline" | "line-through"

export interface BroadcastTheme {
  id: string
  name: string
  builtin: boolean
  pinned: boolean
  createdAt: number
  updatedAt: number
  resolution: { width: number; height: number }
  background: {
    type: "solid" | "gradient" | "image" | "transparent"
    color: string
    gradient: {
      type: "linear" | "radial"
      angle: number
      stops: { color: string; position: number }[]
    } | null
    image: ThemeImageFill | null
  }
  /**
   * The container holding the reference + verse block. Its fill can be a
   * colour or an image, and the text wraps inside it.
   */
  textBox: SurfaceFill
  verseText: {
    fontFamily: string
    fontSize: number
    fontWeight: number
    color: string
    horizontalAlign?: TextHorizontalAlign
    verticalAlign?: TextVerticalAlign
    textTransform?: TextTransform
    textDecoration?: TextDecoration
    lineHeight: number
    letterSpacing: number
    shadow: { color: string; blur: number; x: number; y: number } | null
    outline: { color: string; width: number } | null
    /** Optional plate behind the verse text alone. Absent means none. */
    surface?: SurfaceFill
    /**
     * Shrink the text below `fontSize` when it doesn't fit its box (the
     * default when absent). Off, `fontSize` is exactly the size on screen
     * and long text may run past the box.
     */
    shrinkToFit?: boolean
  }
  verseNumbers: {
    visible: boolean
    fontSize: number
    color: string
    superscript: boolean
  }
  reference: {
    fontFamily: string
    fontSize: number
    fontWeight: number
    color: string
    horizontalAlign?: TextHorizontalAlign
    verticalAlign?: TextVerticalAlign
    textTransform?: TextTransform
    textDecoration?: TextDecoration
    uppercase: boolean
    letterSpacing: number
    position: "above" | "below" | "inline"
    /** An outline around the letters. Absent or null means none. */
    outline?: { color: string; width: number } | null
    /** Optional chip behind the reference alone. Absent means none. */
    surface?: SurfaceFill
  }
  layout: {
    anchor:
      | "center"
      | "top-left"
      | "top-center"
      | "top-right"
      | "bottom-left"
      | "bottom-center"
      | "bottom-right"
    offsetX: number
    offsetY: number
    padding: { top: number; right: number; bottom: number; left: number }
    textAlign: "left" | "center" | "right"
    backgroundWidth: number
    backgroundHeight: number
    textAreaWidth: number
    textAreaHeight: number
    referenceGap?: number
    /** "stacked" (default): reference + verse flow as one block. "free": each is positioned by its box. */
    mode?: "stacked" | "free"
    referenceBox?: ElementBox
    verseBox?: ElementBox
  }
  transition: {
    type: "fade" | "slide" | "scale" | "none"
    duration: number
    easing: "linear" | "ease-in" | "ease-out" | "ease-in-out"
    direction: "up" | "down" | "left" | "right"
  }
}

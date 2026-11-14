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
   * Lyrics and texts set "lyrics", so the theme's song and text style
   * applies; Bible verses set "scripture" for its Bible style.
   */
  style?: "lyrics" | "scripture"
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
  /**
   * A running clock. Each window works out the time itself from this and
   * draws it as the words, `caption` as the reference, ticking on its own.
   */
  timer?: TimerClock
}

/**
 * A countdown or count-up as a clock every window can read, like
 * `VideoPlayback`: at `anchor` (`Date.now()`) it showed `seconds`, and if
 * `running` it has moved on in real time since.
 */
export interface TimerClock {
  direction: "down" | "up"
  seconds: number
  anchor: number
  running: boolean
  /** Shown with the time, e.g. "Service starts in". */
  caption: string
  /** Shown in place of the time once a countdown reaches zero; empty keeps 0:00. */
  endText: string
  style?: TimerStyle
}

/**
 * How a timer looks, over whichever theme each output has. A motion
 * background goes in the frame's `background`, as for texts.
 */
export interface TimerStyle {
  /** The clock's size, in % of the theme's word size. */
  size: number
  /** The caption's size, in % of the theme's reference size (100 when unset). */
  captionSize?: number
  /**
   * Where on screen the clock and caption sit, anywhere on the whole screen
   * (inside a small margin); unset keeps the theme's text box.
   */
  position?: TimerPosition | null
  /** The caption under the time instead of above it. */
  captionBelow?: boolean
  /** The clock's and caption's font, in place of the theme's. */
  fontFamily?: string
  fontWeight?: number
  color?: string
  captionColor?: string
  /** A solid colour in place of the theme's background. */
  backgroundColor?: string
  /** A live camera in place of the theme's background; wins over `backgroundColor`. */
  backgroundCamera?: CameraFeed | null
}

export interface TimerPosition {
  horizontal: "left" | "center" | "right"
  vertical: "top" | "middle" | "bottom"
}

/**
 * A network camera's live picture, e.g. a phone running IP Webcam
 * (`http://<phone>:8080/video`): an MJPEG stream every window loads itself.
 */
export interface CameraFeed {
  /**
   * The saved camera (Settings → Cameras) this came from. A phone's Wi-Fi
   * address changes from day to day; editing the camera's address updates
   * every feed with its id.
   */
  cameraId?: string
  url: string
  /** "cover" (default) crops to fill; "contain" shows the whole picture. */
  fit?: "cover" | "contain"
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
   * Draw part of the frame, for transitions (default: all of it):
   * - "base": the background, the plates (the band) and the logo;
   * - "text": only the words, reference and credit;
   * - "backdrop": only the background and the logo;
   * - "content": the plates and the words, e.g. a Lower Thirds band coming
   *   on with its words.
   * A full-frame slide or video counts as background.
   */
  layer?: "all" | "base" | "text" | "backdrop" | "content"
  /**
   * The text box's video fill, playing in a <video>: drawn into the band
   * where the canvas must hold the pixels (NDI, transitions). With
   * `bandBehind` it shows through a hole in the canvas instead.
   */
  bandVideo?: HTMLVideoElement | null
  /** A <video> behind this canvas shows the band's video: leave the band clear. */
  bandBehind?: boolean
  /**
   * The camera picture for a camera background, for canvases that must hold
   * the pixels (NDI, the stream). With `backgroundBehind` a camera layer
   * shows it behind the canvas instead.
   */
  cameraImage?: CanvasImageSource | null
  /**
   * An <img> over this canvas shows the theme's logo, so don't draw it:
   * the browser animates a GIF in an <img> for free, and the logo must sit
   * over a playing video, which covers the canvas. Canvases that must hold
   * the pixels (NDI, the stream) leave this off.
   */
  logoAbove?: boolean
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
  /**
   * A short library video looped silently as the fill, e.g. moving artwork
   * in a Lower Thirds band; wins over `image`. `color` at `opacity` tints it.
   */
  video?: SurfaceVideo | null
  /**
   * A gradient in place of `color` (still at `opacity`), e.g. a Lower Thirds
   * band fading from clear at the top to dark at the bottom. Under any
   * image or video.
   */
  gradient?: SurfaceGradient | null
  /** A stripe of colour along one edge, e.g. a Lower Thirds band's accent. */
  accent?: SurfaceAccent | null
}

/** A linear gradient across a surface; `angle` in degrees as for the background: 0 = left to right, 90 = top to bottom. */
export interface SurfaceGradient {
  angle: number
  /** `position` 0-100 along the gradient. Colours may carry alpha (rgba / #rrggbbaa). */
  stops: { color: string; position: number }[]
}

export interface SurfaceAccent {
  color: string
  /** Thickness, in theme px. */
  width: number
  side: "left" | "top"
}

/**
 * How a Lower Thirds band comes on and goes off air (word changes inside
 * it keep the theme's `transition`).
 */
export interface BandTransition {
  type: "fade" | "slide" | "wipe" | "pop" | "cut"
  duration: number
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out"
  direction: "up" | "down" | "left" | "right"
}

/**
 * A library video used as a fill. Stored by id and file name, not URL: the
 * local media server's address changes every run, so each window builds
 * the URL from its own `media_base_url`.
 */
export interface SurfaceVideo {
  videoId: string
  file: string
  /** Shown until the video has a frame, and in the theme editor. */
  poster?: string
}

export type LogoCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right"

/**
 * A picture fixed in a corner of the frame over everything else, e.g. the
 * church's logo as a bug on the stream. Animated GIFs play.
 */
export interface ThemeLogo {
  url: string
  corner: LogoCorner
  /** Height, in % of the frame height; the width follows the picture. */
  size: number
  /** 0-100. */
  opacity: number
  /** Inset from the frame's edges, in % of the frame height. */
  margin: number
  /** Also over slides and videos shown full frame, not only over the theme. */
  overMedia: boolean
}

export type TextHorizontalAlign = "left" | "center" | "right" | "justify"
export type TextVerticalAlign = "top" | "middle" | "bottom"
export type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize"
export type TextDecoration = "none" | "underline" | "line-through"

/**
 * How songs and texts look on a theme, over its verse text style. Anything
 * unset follows the theme; scripture always uses the theme itself. Edited
 * from the quick style panel beside the Songs and Texts tabs.
 */
export interface LyricsStyle {
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  color?: string
  horizontalAlign?: TextHorizontalAlign
  verticalAlign?: TextVerticalAlign
  shrinkToFit?: boolean
  outline?: { color: string; width: number } | null
  /** Extra space between letters, in theme px: below 0 tightens them. */
  letterSpacing?: number
  /**
   * "screen": the words use the whole frame (with a margin), whatever size
   * the theme's verse box is. "theme" or unset: the theme's text area.
   */
  area?: "theme" | "screen"
}

/**
 * How Bible verses look on the theme, laid over its verse text, reference
 * and background the way `LyricsStyle` is for songs. Edited from the Bible
 * style panel beside the Bible tab.
 */
export interface ScriptureStyle extends LyricsStyle {
  referenceFontSize?: number
  referenceColor?: string
  /** A solid colour in place of the theme's background. */
  backgroundColor?: string
  /** A live camera behind verses in place of the theme's background; wins over `backgroundColor`. */
  backgroundCamera?: CameraFeed | null
  /**
   * A library video looped behind verses in place of the theme's
   * background; wins over `backgroundColor` and `backgroundCamera`. Resolved into the verse's
   * `background` when it is presented.
   */
  backgroundVideoId?: string | null
}

export interface BroadcastTheme {
  id: string
  name: string
  builtin: boolean
  pinned: boolean
  createdAt: number
  updatedAt: number
  resolution: { width: number; height: number }
  background: {
    type: "solid" | "gradient" | "image" | "transparent" | "camera"
    color: string
    /** The live camera when `type` is "camera". */
    camera?: CameraFeed | null
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
  /** Absent or null means none. */
  logo?: ThemeLogo | null
  /** Songs and texts styled apart from scripture; see `LyricsStyle`. */
  lyricsText?: LyricsStyle
  /** Bible verses styled apart from the theme; see `ScriptureStyle`. */
  scriptureText?: ScriptureStyle
  /**
   * The song and text style last saved from its panel: Reset goes back to
   * it rather than to the theme's own look.
   */
  savedLyricsText?: LyricsStyle
  /** Likewise for the Bible style. */
  savedScriptureText?: ScriptureStyle
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
    /**
     * Space between the text area (a Lower Thirds band) and the frame edges
     * it is anchored to, in theme px, without moving the background as
     * `offsetX`/`offsetY` do: a band floating above the bottom edge.
     */
    bandInset?: number
    /** "stacked" (default): reference + verse flow as one block. "free": each is positioned by its box. */
    mode?: "stacked" | "free"
    referenceBox?: ElementBox
    verseBox?: ElementBox
  }
  /** How a Lower Thirds band comes on and goes off air; absent: `transition`. */
  bandTransition?: BandTransition
  transition: {
    type: "fade" | "slide" | "scale" | "none" | "wipe" | "pop" | "cut"
    duration: number
    easing: "linear" | "ease-in" | "ease-out" | "ease-in-out"
    direction: "up" | "down" | "left" | "right"
  }
}

import type { Verse } from "./bible"

/**
 * One thing that can be on screen. Every kind renders through the same
 * themes and outputs; `toRenderData` in lib/slides turns it into the
 * reference + segments shape the renderer and output windows understand.
 */
export type Slide = ScriptureSlide | LyricSlide | ImageSlide

export interface ScriptureSlide {
  kind: "scripture"
  verse: Verse
  /** Translation abbreviation shown in the reference, e.g. "KJV". */
  translation: string
}

export interface LyricSlide {
  kind: "lyrics"
  songId: string
  songTitle: string
  /** Section this slide belongs to, e.g. "Verse 1", "Chorus". */
  sectionLabel: string
  /** One entry per sung line; each starts on its own line on screen. */
  lines: string[]
  /** Copyright / CCLI line, shown where scripture shows its reference. */
  footer?: string
}

/**
 * A pre-rendered picture shown full frame, ignoring the theme: one page of an
 * imported presentation deck.
 */
export interface ImageSlide {
  kind: "image"
  /** Anything an <img> can load: an asset URL, or a data URI. */
  url: string
  /** Operator-facing name, e.g. "Welcome deck · 3". */
  title: string
}

export type SlideKind = Slide["kind"]

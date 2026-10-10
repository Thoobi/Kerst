import type { Verse } from "./bible"
import type { VideoPlayback } from "./broadcast"

/**
 * One thing that can be on screen. Every kind renders through the same
 * themes and outputs; `toRenderData` in lib/slides turns it into the
 * reference + segments shape the renderer and output windows understand.
 */
export type Slide = ScriptureSlide | LyricSlide | TextSlide | ImageSlide

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
  /** "Title · Author", small in the bottom-right corner. */
  credit?: string
  /** The song's motion background, looping behind the words. */
  background?: VideoPlayback
}

/** One screen of a library text, e.g. an announcement: just the words, big. */
export interface TextSlide {
  kind: "text"
  textId: string
  title: string
  lines: string[]
  /** The text's motion background, looping behind the words. */
  background?: VideoPlayback
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

// Mirrors rhema-library's models (src-tauri/crates/library/src/models.rs).
// Field names stay snake_case, as with the Bible types.

export type SectionKind =
  | "verse"
  | "pre-chorus"
  | "chorus"
  | "bridge"
  | "tag"
  | "intro"
  | "outro"
  | "other"

export interface SongSection {
  id: string
  kind: SectionKind
  /** Operator-facing name, e.g. "Verse 1", "Chorus". */
  label: string
  /** One sung line per "\n"; blank lines split the section into slides. */
  lyrics: string
}

export interface Song {
  id: string
  title: string
  author: string | null
  copyright: string | null
  ccli_number: string | null
  /** Sections in written order. */
  sections: SongSection[]
  /** Section ids in sung order (V1 C V2 C …). Empty means as written. */
  arrangement: string[]
  source: string
  created_at: number
  updated_at: number
}

export interface SongSectionInput {
  id?: string | null
  kind: SectionKind
  label: string
  lyrics: string
}

export interface SongInput {
  id?: string | null
  title: string
  author?: string | null
  copyright?: string | null
  ccli_number?: string | null
  sections: SongSectionInput[]
  /** Sung order as indexes into `sections`, so new sections can be ordered before they have ids. */
  arrangement?: number[]
  source?: string
}

export interface SongSummary {
  id: string
  title: string
  author: string | null
  ccli_number: string | null
  first_line: string | null
  updated_at: number
}

export type ScheduleItemKind = "song" | "scripture" | "announcement" | "media" | "sermon"

export interface ScheduleItem {
  id: string
  kind: ScheduleItemKind
  title: string
  /** Kind-specific data, owned by the frontend. */
  payload: unknown
}

export interface Schedule {
  id: string
  name: string
  /** YYYY-MM-DD */
  service_date: string | null
  items: ScheduleItem[]
  created_at: number
  updated_at: number
}

export interface ScheduleItemInput {
  id?: string | null
  kind: ScheduleItemKind
  title: string
  payload?: unknown
}

export interface ScheduleInput {
  id?: string | null
  name: string
  service_date?: string | null
  items: ScheduleItemInput[]
}

export interface ScheduleSummary {
  id: string
  name: string
  service_date: string | null
  item_count: number
  updated_at: number
}

/** One page of an imported deck, pre-rendered to an image file. */
export interface DeckSlide {
  id: string
  /** Absolute path on disk; turn into a URL with `deckSlideUrl`. */
  path: string
  width: number
  height: number
}

export interface Deck {
  id: string
  title: string
  /** The file it was imported from, e.g. "Welcome.pdf". */
  source_name: string | null
  slides: DeckSlide[]
  created_at: number
  updated_at: number
}

export interface DeckSummary {
  id: string
  title: string
  source_name: string | null
  slide_count: number
  /** The first slide's image path, for a thumbnail. */
  cover_path: string | null
  updated_at: number
}

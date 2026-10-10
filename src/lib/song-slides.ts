import { sectionCodes } from "@/lib/song-text"
import type { LyricSlide, Song, SongSection } from "@/types"

/**
 * How a song is split into screens: sections in sung order, each section
 * split at its blank lines, and any screen longer than this split again
 * into even parts (6 lines -> 3 + 3, not 4 + 2).
 */
export const MAX_LINES_PER_SLIDE = 4

export interface SongSlide {
  section: SongSection
  /** Short code for the section, e.g. "V1", "C". */
  code: string
  /** Position of this section in the sung order (a chorus sung 3 times has 3). */
  order: number
  /** This screen within its section, and how many the section has. */
  page: number
  pages: number
  lines: string[]
}

/** Split a section's lyrics into screens of sung lines. */
export function lyricPages(lyrics: string, maxLines = MAX_LINES_PER_SLIDE): string[][] {
  const pages: string[][] = []
  for (const block of lyrics.split(/\n\s*\n/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) continue
    const parts = Math.ceil(lines.length / maxLines)
    const size = Math.ceil(lines.length / parts)
    for (let i = 0; i < lines.length; i += size) pages.push(lines.slice(i, i + size))
  }
  return pages
}

/** The sections in the order they are sung. Unknown ids are skipped. */
export function sungSections(song: Song): SongSection[] {
  if (song.arrangement.length === 0) return song.sections
  const byId = new Map(song.sections.map((s) => [s.id, s]))
  return song.arrangement.flatMap((id) => byId.get(id) ?? [])
}

/** Every screen of a song, in the order it is sung. */
export function songSlides(song: Song, maxLines = MAX_LINES_PER_SLIDE): SongSlide[] {
  const codes = new Map(sectionCodes(song.sections).map((code, i) => [song.sections[i].id, code]))
  return sungSections(song).flatMap((section, order) => {
    const pages = lyricPages(section.lyrics, maxLines)
    return pages.map((lines, page) => ({
      section,
      code: codes.get(section.id) ?? "",
      order,
      page,
      pages: pages.length,
      lines,
    }))
  })
}

/**
 * The small corner credit on a lyric screen, e.g. "Amazing Grace · John
 * Newton". The lyrics alone stay big on screen.
 */
export function songCredit(song: Pick<Song, "title" | "author">): string {
  return [song.title.trim(), song.author?.trim()].filter(Boolean).join(" · ")
}

export function toLyricSlide(song: Song, slide: SongSlide): LyricSlide {
  const credit = songCredit(song)
  return {
    kind: "lyrics",
    songId: song.id,
    songTitle: song.title,
    sectionLabel:
      slide.pages > 1 ? `${slide.section.label} (${slide.page + 1}/${slide.pages})` : slide.section.label,
    lines: slide.lines,
    credit: credit || undefined,
  }
}

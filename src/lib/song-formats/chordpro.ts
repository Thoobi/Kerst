import { parseHeader, parseSongText } from "@/lib/song-text"
import type { SongInput } from "@/types"

/**
 * ChordPro (https://www.chordpro.org), the text chord-chart format SongSelect
 * Premium and many band apps export:
 *
 *   {title: Amazing Grace}
 *   {artist: John Newton}
 *   {comment: Verse 1}            or  {start_of_verse: Verse 1} … {end_of_verse}
 *   A[G]mazing [C]grace how [G]sweet
 *
 * Chords in brackets are dropped. Section labels come from start_of_*
 * directives or from comments that read as a heading ("Chorus"); the rest
 * of the text is parsed like typed lyrics.
 */

const DIRECTIVE = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i

const SECTION_START: Record<string, string> = {
  start_of_verse: "Verse",
  sov: "Verse",
  start_of_chorus: "Chorus",
  soc: "Chorus",
  start_of_bridge: "Bridge",
  sob: "Bridge",
}

const SKIPPED_BLOCKS =
  /^(start_of_tab|sot|start_of_grid|sog|start_of_abc|start_of_ly)$/
const BLOCK_END = /^(end_of_tab|eot|end_of_grid|eog|end_of_abc|end_of_ly)$/

export function isChordPro(text: string): boolean {
  return /^\s*\{\s*(title|t|start_of_\w+|soc|sov)\s*[:}]/im.test(text)
}

export function parseChordPro(text: string, fallbackTitle = ""): SongInput {
  let title = ""
  const credits: string[] = []
  let copyright: string | null = null
  let ccli: string | null = null
  const body: string[] = []
  let skipping = false
  let verses = 0

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim()
    if (line.startsWith("#")) continue
    const directive = DIRECTIVE.exec(line)
    if (directive) {
      const name = directive[1].toLowerCase()
      const value = directive[2]?.trim() ?? ""
      if (skipping) {
        if (BLOCK_END.test(name)) skipping = false
        continue
      }
      if (SKIPPED_BLOCKS.test(name)) skipping = true
      else if (name === "title" || name === "t") title ||= value
      else if (
        ["artist", "composer", "lyricist", "subtitle", "st"].includes(name)
      ) {
        if (value) credits.push(value)
      } else if (name === "copyright")
        copyright = value.replace(/^©\s*/, "") || null
      else if (name === "ccli") ccli = /\d+/.exec(value)?.[0] ?? null
      else if (SECTION_START[name]) {
        // A labelled start ("Verse 2") is used as is; a bare one is numbered.
        const kind = SECTION_START[name]
        if (kind === "Verse") {
          // Labelled verses count too, so a bare start after "Verse 1" is Verse 2.
          const numbered = Number(/\d+/.exec(value)?.[0] ?? 0)
          verses = numbered > verses ? numbered : verses + 1
        }
        const label = value || (kind === "Verse" ? `Verse ${verses}` : kind)
        body.push("", parseHeader(label) ? label : kind)
      } else if (
        /^(comment|c|ci|comment_italic|cb)$/.test(name) &&
        parseHeader(value)
      ) {
        body.push("", value)
      }
      continue
    }
    if (skipping) continue
    body.push(
      line
        .replace(/\[[^\]]*\]/g, "")
        .replace(/\s{2,}/g, " ")
        .trim()
    )
  }

  title ||= fallbackTitle
  const { sections, arrangement } = parseSongText(body.join("\n"))
  if (!title || sections.length === 0)
    throw new Error("the ChordPro file has no lyrics")
  return {
    title,
    author: [...new Set(credits)].join(", ") || null,
    copyright,
    ccli_number: ccli,
    sections,
    arrangement,
    source: "chordpro",
  }
}

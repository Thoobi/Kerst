import type { SectionKind, SongSection, SongSectionInput } from "@/types"

/**
 * The plain-text form songs are typed or pasted in:
 *
 *   Verse 1
 *   Amazing grace how sweet the sound
 *   That saved a wretch like me
 *
 *   Chorus
 *   ...
 *
 * A header line ("Verse 1", "Chorus", "[Bridge]", "Pre-Chorus:") starts a
 * section. Inside a section a blank line starts a new screen. Lyrics pasted
 * with no headers at all are split on blank lines instead, and a paragraph
 * that comes back word for word is taken to be the chorus.
 */

const HEADER =
  /^\s*\[?\s*(verse|chorus|refrain|pre[- ]?chorus|bridge|tag|intro|outro|ending|interlude|instrumental|misc|vamp|coda|turnaround|v|c|pc|b|t|i|o)\s*(\d+)?\s*\]?\s*:?\s*$/i

/** Short codes like "V" or "C" only count as headers in brackets: "[V1]". */
const SHORT_CODES = new Set(["v", "c", "pc", "b", "t", "i", "o"])

const KIND_BY_WORD: Record<string, SectionKind> = {
  verse: "verse",
  v: "verse",
  chorus: "chorus",
  refrain: "chorus",
  c: "chorus",
  prechorus: "pre-chorus",
  pc: "pre-chorus",
  bridge: "bridge",
  b: "bridge",
  tag: "tag",
  t: "tag",
  intro: "intro",
  i: "intro",
  outro: "outro",
  ending: "outro",
  o: "outro",
  interlude: "other",
}

const KIND_NAME: Record<SectionKind, string> = {
  verse: "Verse",
  "pre-chorus": "Pre-Chorus",
  chorus: "Chorus",
  bridge: "Bridge",
  tag: "Tag",
  intro: "Intro",
  outro: "Outro",
  other: "Interlude",
}

const KIND_CODE: Record<SectionKind, string> = {
  verse: "V",
  "pre-chorus": "PC",
  chorus: "C",
  bridge: "B",
  tag: "T",
  intro: "I",
  outro: "O",
  other: "X",
}

export interface ParsedHeader {
  kind: SectionKind
  label: string
}

/** Read a section header line, or null if the line is lyrics. */
export function parseHeader(line: string): ParsedHeader | null {
  const match = HEADER.exec(line)
  if (!match) return null
  const word = match[1].toLowerCase().replace(/[- ]/g, "")
  if (SHORT_CODES.has(word) && !line.includes("[")) return null
  const kind = KIND_BY_WORD[word] ?? "other"
  const number = match[2]
  // Kinds without a fixed name (Instrumental, Misc, Vamp...) keep their own.
  const name =
    kind !== "other"
      ? KIND_NAME[kind]
      : word.charAt(0).toUpperCase() + word.slice(1)
  return { kind, label: number ? `${name} ${Number(number)}` : name }
}

/**
 * Short codes for the arrangement line and section chips: V1, C, PC, B...
 * Codes are unique within a song: a second "Chorus" without a number
 * becomes C2.
 */
export function sectionCodes(sections: Pick<SongSection, "kind" | "label">[]): string[] {
  const used = new Set<string>()
  return sections.map(({ kind, label }) => {
    const number = /(\d+)\s*$/.exec(label)?.[1]
    const base = KIND_CODE[kind] + (number ?? "")
    let code = base
    for (let n = 2; used.has(code); n++) code = `${base}${number ? "." : ""}${n}`
    used.add(code)
    return code
  })
}

export interface ParsedSong {
  sections: SongSectionInput[]
  /** Sung order as indexes into `sections`; empty means as written. */
  arrangement: number[]
}

const normalizeParagraph = (lines: string[]) =>
  lines.join(" ").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()

/** Trim blank lines at both ends and collapse runs of blank lines to one. */
function tidy(lines: string[]): string {
  const out: string[] = []
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.trim() === "" && (out.length === 0 || out[out.length - 1] === "")) continue
    out.push(line.trim() === "" ? "" : line)
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop()
  return out.join("\n")
}

function parseWithHeaders(lines: string[]): ParsedSong {
  const sections: SongSectionInput[] = []
  const order: number[] = []
  let repeated = false
  let current: { header: ParsedHeader; body: string[] } | null = null
  const preamble: string[] = []

  const flush = () => {
    if (!current) return
    const lyrics = tidy(current.body)
    const { kind, label } = current.header
    // "Chorus" again with no lyrics (or the same lyrics) means sing it again.
    const existing = sections.findIndex(
      (s) => s.label.toLowerCase() === label.toLowerCase() && (lyrics === "" || s.lyrics === lyrics)
    )
    if (existing >= 0) {
      order.push(existing)
      repeated = true
    } else {
      sections.push({ kind, label, lyrics })
      order.push(sections.length - 1)
    }
  }

  for (const line of lines) {
    const header = parseHeader(line)
    if (header) {
      flush()
      current = { header, body: [] }
    } else if (current) {
      current.body.push(line)
    } else {
      preamble.push(line)
    }
  }
  flush()

  // Lyrics before the first header are the first verse.
  const lead = tidy(preamble)
  if (lead) {
    sections.unshift({ kind: "verse", label: "Verse 1", lyrics: lead })
    for (let i = 0; i < order.length; i++) order[i] += 1
    order.unshift(0)
  }
  return { sections, arrangement: repeated ? order : [] }
}

function parseParagraphs(lines: string[]): ParsedSong {
  const paragraphs: string[][] = []
  let current: string[] = []
  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length) paragraphs.push(current)
      current = []
    } else {
      current.push(line.trimEnd())
    }
  }
  if (current.length) paragraphs.push(current)

  const counts = new Map<string, number>()
  for (const p of paragraphs) {
    const key = normalizeParagraph(p)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const sections: SongSectionInput[] = []
  const indexByKey = new Map<string, number>()
  const order: number[] = []
  let verses = 0
  let choruses = 0
  for (const p of paragraphs) {
    const key = normalizeParagraph(p)
    let index = indexByKey.get(key)
    if (index === undefined) {
      const isChorus = (counts.get(key) ?? 0) > 1
      const label = isChorus
        ? ++choruses === 1 ? "Chorus" : `Chorus ${choruses}`
        : `Verse ${++verses}`
      sections.push({ kind: isChorus ? "chorus" : "verse", label, lyrics: p.join("\n") })
      index = sections.length - 1
      indexByKey.set(key, index)
    }
    order.push(index)
  }
  const repeated = order.length !== sections.length
  return { sections, arrangement: repeated ? order : [] }
}

/** Turn typed or pasted lyrics into sections and a sung order. */
export function parseSongText(text: string): ParsedSong {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  return lines.some((line) => parseHeader(line))
    ? parseWithHeaders(lines)
    : parseParagraphs(lines)
}

/** The editable text for a song's sections, in written order. */
export function songToText(sections: Pick<SongSection, "label" | "lyrics">[]): string {
  return sections.map((s) => `${s.label}\n${s.lyrics}`).join("\n\n")
}

export interface ParsedArrangement {
  /** Section indexes in sung order. */
  order: number[]
  /** Tokens that matched no section. */
  unknown: string[]
}

/** Read an arrangement line like "V1 C V2 C B C" against the section codes. */
export function parseArrangement(text: string, codes: string[]): ParsedArrangement {
  const byCode = new Map(codes.map((code, i) => [code.toUpperCase(), i]))
  const order: number[] = []
  const unknown: string[] = []
  for (const token of text.split(/[\s,]+/).filter(Boolean)) {
    const index = byCode.get(token.toUpperCase())
    if (index === undefined) unknown.push(token)
    else order.push(index)
  }
  return { order, unknown }
}

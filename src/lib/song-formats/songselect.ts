import { parseHeader, parseSongText } from "@/lib/song-text"
import type { SectionKind, SongInput, SongSectionInput } from "@/types"

/**
 * The two lyric files CCLI SongSelect hands out, as read by OpenLP's
 * long-standing importer.
 *
 * .usr is INI-like: an "[S A22025]" section carries the CCLI number;
 * Title=, Author= and Copyright= (several joined by " | "); Fields= names
 * the sections and Words= holds their lyrics, both separated by "/t", with
 * "/n" for a line break.
 *
 * .txt is the title, a blank line, then sections each led by a heading
 * ("Verse 1", "Chorus"), then a footer. Before 2023 the footer was
 * "CCLI Song # n", "© …", authors, terms, licence; since 2023 the authors
 * line comes first, just above the "CCLI Song #" line.
 */

const CCLI_SONG_LINE = /^CCLI\s+Song\s*#?\s*(\d+)/i
const TERMS_LINE =
  /^(For use solely with the SongSelect|CCLI License\b|Note: Reproduction)/i

const splitList = (value: string) =>
  value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ")

export function isSongSelectText(text: string): boolean {
  return text.split(/\r?\n/).some((line) => CCLI_SONG_LINE.test(line.trim()))
}

export function parseSongSelectText(text: string): SongInput {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
  const ccliAt = lines.findIndex((line) => CCLI_SONG_LINE.test(line.trim()))
  if (ccliAt < 0) throw new Error("not a SongSelect lyrics file")
  const ccli = CCLI_SONG_LINE.exec(lines[ccliAt].trim())?.[1] ?? null

  const titleAt = lines.findIndex((line) => line.trim() !== "")
  const title = lines[titleAt]?.trim() ?? ""

  // 2023+: the authors line sits directly above "CCLI Song #".
  const above = lines[ccliAt - 1]?.trim() ?? ""
  const authorsAbove =
    above !== "" &&
    !parseHeader(above) &&
    (lines[ccliAt - 2]?.trim() ?? "") === ""
  const bodyEnd = authorsAbove ? ccliAt - 1 : ccliAt

  let copyright: string | null = null
  let author: string | null = authorsAbove ? splitList(above) : null
  for (const raw of lines.slice(ccliAt + 1)) {
    const line = raw.trim()
    if (!line || TERMS_LINE.test(line)) continue
    if (line.startsWith("©")) copyright = line.replace(/^©\s*/, "")
    else if (!author) author = splitList(line)
  }

  const { sections, arrangement } = parseSongText(
    lines.slice(titleAt + 1, bodyEnd).join("\n")
  )
  if (!title || sections.length === 0)
    throw new Error("the SongSelect file has no lyrics")
  return {
    title,
    author,
    copyright,
    ccli_number: ccli,
    sections,
    arrangement,
    source: "songselect",
  }
}

/** "Verse 1", "Chorus 2", "Vers 1 (PRE-CHORUS)" -> a section. */
function usrSection(field: string): { kind: SectionKind; label: string } {
  const cleaned = field.replace(/[()]/g, " ").replace(/\s+/g, " ").trim()
  const override = /\b(pre-?chorus|bridge|chorus|tag|ending|intro)\b/i.exec(
    cleaned
  )?.[1]
  const header = parseHeader(
    override && !parseHeader(cleaned) ? override : cleaned
  )
  if (header) return header
  const lower = cleaned.toLowerCase()
  if (lower.startsWith("ver")) return { kind: "verse", label: cleaned }
  if (lower.startsWith("ch")) return { kind: "chorus", label: cleaned }
  if (lower.startsWith("br")) return { kind: "bridge", label: cleaned }
  return { kind: "other", label: cleaned || "Other" }
}

export function isSongSelectUsr(text: string): boolean {
  return /^\s*\[File\]/i.test(text) || /^\s*\[S\s+A?\d+\]/im.test(text)
}

export function parseSongSelectUsr(text: string): SongInput {
  const values = new Map<string, string>()
  let ccli: string | null = null
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim()
    const section = /^\[S\s+A?(\d+)\]$/i.exec(line)
    if (section) ccli = section[1]
    const eq = line.indexOf("=")
    if (eq > 0)
      values.set(
        line.slice(0, eq).trim().toLowerCase(),
        line.slice(eq + 1).trim()
      )
  }

  const title = values.get("title") ?? ""
  const fields = (values.get("fields") ?? "").split("/t")
  const words = (values.get("words") ?? "").split("/t")
  const sections: SongSectionInput[] = []
  fields.forEach((field, i) => {
    const lyrics = (words[i] ?? "")
      .split("/n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n")
    if (lyrics) sections.push({ ...usrSection(field), lyrics })
  })
  if (!title || sections.length === 0)
    throw new Error("the SongSelect file has no lyrics")

  return {
    title,
    author: splitList(values.get("author") ?? "") || null,
    copyright: splitList(values.get("copyright") ?? "") || null,
    ccli_number: ccli,
    sections,
    arrangement: [],
    source: "songselect",
  }
}

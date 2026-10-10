import { lyricPages } from "@/lib/song-slides"
import type { SectionKind, Song, SongInput, SongSectionInput } from "@/types"

/**
 * OpenLyrics (https://docs.openlyrics.org), the open XML song format from
 * OpenLP. One song per file:
 *
 *   <song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9">
 *     <properties> titles, authors, copyright, ccliNo, verseOrder … </properties>
 *     <lyrics> <verse name="v1"><lines>line<br/>line</lines></verse> … </lyrics>
 *   </song>
 *
 * Each <lines> block is a screen; <br/> breaks a line. Chords, comments,
 * instrumental parts and all but one language are dropped: Light shows
 * lyrics, not chord charts.
 */

export const OPENLYRICS_NAMESPACE = "http://openlyrics.info/namespace/2009/song"

const KIND_BY_LETTER: Record<string, { kind: SectionKind; name: string }> = {
  v: { kind: "verse", name: "Verse" },
  c: { kind: "chorus", name: "Chorus" },
  p: { kind: "pre-chorus", name: "Pre-Chorus" },
  b: { kind: "bridge", name: "Bridge" },
  i: { kind: "intro", name: "Intro" },
  e: { kind: "outro", name: "Ending" },
  o: { kind: "other", name: "Other" },
  s: { kind: "other", name: "Solo" },
  m: { kind: "other", name: "Middle" },
}

const LETTER_BY_KIND: Record<SectionKind, string> = {
  verse: "v",
  chorus: "c",
  "pre-chorus": "p",
  bridge: "b",
  intro: "i",
  outro: "e",
  tag: "o",
  other: "o",
}

/** "v1" -> Verse 1, "c" -> Chorus, "v1a" -> Verse 1a. */
export function sectionFromVerseName(name: string): {
  kind: SectionKind
  label: string
} {
  const match = /^([a-z])(\d*)([a-z]?)$/i.exec(name.trim())
  const known = match && KIND_BY_LETTER[match[1].toLowerCase()]
  if (!match || !known) return { kind: "other", label: name.trim() || "Other" }
  const [, , number, part] = match
  return {
    kind: known.kind,
    label: `${known.name}${number ? ` ${Number(number)}` : ""}${part.toLowerCase()}`,
  }
}

const elements = (parent: Element | Document, name: string): Element[] =>
  Array.from(parent.getElementsByTagNameNS("*", name))

const childElements = (parent: Element, name: string): Element[] =>
  Array.from(parent.children).filter((el) => el.localName === name)

const text = (el: Element | undefined): string =>
  el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

/**
 * The text of a <lines> block, one sung line per entry. Whitespace from
 * pretty-printing is not significant; only <br/> (or 0.8's <line>) breaks a
 * line. Comments are not shown; chords are dropped but text inside them kept.
 */
function linesText(el: Element): string[] {
  let out = ""
  const walk = (node: Node) => {
    if (node.nodeType === 3 /* text */) {
      out += (node.textContent ?? "").replace(/\s+/g, " ")
      return
    }
    if (node.nodeType !== 1) return
    const child = node as Element
    if (child.localName === "br") out += "\n"
    else if (child.localName === "comment") return
    else {
      child.childNodes.forEach(walk)
      if (child.localName === "line") out += "\n"
    }
  }
  el.childNodes.forEach(walk)
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

export function parseOpenLyrics(xml: string): SongInput {
  const doc = new DOMParser().parseFromString(xml, "application/xml")
  const root = doc.documentElement
  if (
    doc.getElementsByTagName("parsererror").length > 0 ||
    root.localName !== "song"
  ) {
    throw new Error("not an OpenLyrics song file")
  }

  const title = text(elements(doc, "title")[0])
  if (!title) throw new Error("the song has no title")

  const authors = elements(doc, "author")
    .filter((a) => a.getAttribute("type") !== "translation")
    .map((a) => text(a))
    .filter(Boolean)

  // Several languages: keep the one the first verse is in.
  const verses = elements(doc, "verse")
  const lang =
    verses.find((v) => v.getAttribute("lang"))?.getAttribute("lang") ?? null
  const kept = verses.filter(
    (v) => !lang || !v.getAttribute("lang") || v.getAttribute("lang") === lang
  )

  const sections: SongSectionInput[] = []
  const indexByName = new Map<string, number>()
  for (const verse of kept) {
    const name = (verse.getAttribute("name") ?? "").toLowerCase()
    const screens = childElements(verse, "lines")
      .map(linesText)
      .filter((lines) => lines.length > 0)
      .map((lines) => lines.join("\n"))
    if (screens.length === 0) continue
    const lyrics = screens.join("\n\n")
    const existing = indexByName.get(name)
    if (existing !== undefined) {
      sections[existing].lyrics += `\n\n${lyrics}`
      continue
    }
    indexByName.set(name, sections.length)
    sections.push({ ...sectionFromVerseName(name), lyrics })
  }
  if (sections.length === 0) throw new Error("the song has no lyrics")

  const arrangement = text(elements(doc, "verseOrder")[0])
    .toLowerCase()
    .split(" ")
    .flatMap((name) => indexByName.get(name) ?? [])

  const ccli = text(elements(doc, "ccliNo")[0])
  return {
    title,
    author: [...new Set(authors)].join(", ") || null,
    copyright: text(elements(doc, "copyright")[0]) || null,
    ccli_number: /^\d+$/.test(ccli) ? ccli : null,
    sections,
    arrangement,
    source: "openlyrics",
  }
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

/** OpenLyrics names for a song's sections, unique within the song. */
export function verseNames(
  sections: Pick<Song["sections"][number], "kind" | "label">[]
): string[] {
  const used = new Set<string>()
  return sections.map(({ kind, label }) => {
    const base = LETTER_BY_KIND[kind] + (/(\d+)\s*$/.exec(label)?.[1] ?? "")
    let name = base
    // Spec allows a trailing part letter: a second "c" becomes "ca".
    for (let i = 0; used.has(name); i++)
      name = base + String.fromCharCode(97 + i)
    used.add(name)
    return name
  })
}

/** A song as an OpenLyrics 0.9 document. */
export function toOpenLyrics(song: Song, modified = new Date()): string {
  const names = verseNames(song.sections)
  const nameById = new Map(song.sections.map((s, i) => [s.id, names[i]]))
  const order = song.arrangement.map((id) => nameById.get(id)).filter(Boolean)

  const properties = [
    `    <titles>\n      <title>${escapeXml(song.title)}</title>\n    </titles>`,
    song.author &&
      `    <authors>\n      <author>${escapeXml(song.author)}</author>\n    </authors>`,
    song.copyright && `    <copyright>${escapeXml(song.copyright)}</copyright>`,
    song.ccli_number &&
      /^\d+$/.test(song.ccli_number) &&
      `    <ccliNo>${song.ccli_number}</ccliNo>`,
    order.length > 0 && `    <verseOrder>${order.join(" ")}</verseOrder>`,
  ].filter(Boolean)

  const verses = song.sections.map((section, i) => {
    const screens = lyricPages(section.lyrics, Infinity).map(
      (lines) => `      <lines>${lines.map(escapeXml).join("<br/>")}</lines>`
    )
    return `    <verse name="${names[i]}">\n${screens.join("\n")}\n    </verse>`
  })

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<song xmlns="${OPENLYRICS_NAMESPACE}" version="0.9" createdIn="Light" modifiedIn="Light" modifiedDate="${modified.toISOString()}">`,
    `  <properties>`,
    ...properties,
    `  </properties>`,
    `  <lyrics>`,
    ...verses,
    `  </lyrics>`,
    `</song>`,
    ``,
  ].join("\n")
}

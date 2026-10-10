import { stripExtension } from "@/lib/deck-import"
import { parseSongText } from "@/lib/song-text"
import { isChordPro, parseChordPro } from "./chordpro"
import { parseOpenLyrics } from "./openlyrics"
import {
  isSongSelectText,
  isSongSelectUsr,
  parseSongSelectText,
  parseSongSelectUsr,
} from "./songselect"
import type { SongInput } from "@/types"

export { toOpenLyrics } from "./openlyrics"

export type SongFormat =
  "openlyrics" | "songselect-usr" | "songselect-txt" | "chordpro" | "text"

/** Extensions offered in the import file picker. */
export const SONG_FILE_ACCEPT = ".xml,.usr,.txt,.cho,.chordpro,.chopro,.crd"

/** Work out a file's format from its contents, falling back on its name. */
export function detectSongFormat(
  fileName: string,
  text: string
): SongFormat | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? ""
  const head = text.trimStart()
  if (head.startsWith("<")) return /<song[\s>]/.test(head) ? "openlyrics" : null
  if (isSongSelectUsr(text)) return "songselect-usr"
  if (isChordPro(text) || ["cho", "chordpro", "chopro", "crd"].includes(ext))
    return "chordpro"
  if (isSongSelectText(text)) return "songselect-txt"
  if (ext === "txt") return "text"
  return null
}

/** Read one song file. Throws with a readable reason when it can't. */
export function parseSongFile(fileName: string, text: string): SongInput {
  const format = detectSongFormat(fileName, text)
  switch (format) {
    case "openlyrics":
      return parseOpenLyrics(text)
    case "songselect-usr":
      return parseSongSelectUsr(text)
    case "songselect-txt":
      return parseSongSelectText(text)
    case "chordpro":
      return parseChordPro(text, stripExtension(fileName))
    case "text": {
      // A plain lyrics file: the name is the title.
      const { sections, arrangement } = parseSongText(text)
      if (sections.length === 0) throw new Error("the file has no lyrics")
      return {
        title: stripExtension(fileName),
        sections,
        arrangement,
        source: "text",
      }
    }
    case null:
      throw new Error("not a song file Rhema can read")
  }
}

/** A file name for a song's export, without characters file systems reject. */
export function songFileName(title: string, extension = "xml"): string {
  const safe =
    title
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Song"
  return `${safe}.${extension}`
}

/**
 * Decode a song file's bytes. SongSelect and older Windows apps write
 * Windows-1252 as often as UTF-8, so a file that isn't valid UTF-8 is read
 * as Windows-1252 instead of turning "©" into "�". UTF-16 is detected by
 * its byte-order mark.
 */
export function decodeSongFile(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder("utf-16be").decode(bytes)
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder("windows-1252").decode(bytes)
  }
}

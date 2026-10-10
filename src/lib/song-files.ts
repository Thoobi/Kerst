import { join } from "@tauri-apps/api/path"
import { open, save } from "@tauri-apps/plugin-dialog"
import { writeTextFile } from "@tauri-apps/plugin-fs"
import { libraryApi } from "@/lib/library-api"
import { songFileName, toOpenLyrics } from "@/lib/song-formats"
import type { Song } from "@/types"

const OPENLYRICS_FILTER = [{ name: "OpenLyrics song", extensions: ["xml"] }]

/** Save one song as an OpenLyrics file. Returns the path, or null if cancelled. */
export async function exportSong(song: Song): Promise<string | null> {
  const path = await save({
    defaultPath: songFileName(song.title),
    filters: OPENLYRICS_FILTER,
  })
  if (!path) return null
  await writeTextFile(path, toOpenLyrics(song))
  return path
}

/**
 * Save every song as its own OpenLyrics file in a folder the operator
 * picks: a backup, or a way to take the library to other software. Returns
 * the folder and count, or null if cancelled.
 */
export async function exportLibrary(): Promise<{
  folder: string
  count: number
} | null> {
  const folder = await open({
    directory: true,
    title: "Choose a folder for the song files",
  })
  if (typeof folder !== "string") return null
  const used = new Set<string>()
  const summaries = await libraryApi.listSongs()
  for (const summary of summaries) {
    const song = await libraryApi.getSong(summary.id)
    // Two songs with the same title get "Title (2).xml" rather than overwriting.
    let name = songFileName(song.title)
    for (let n = 2; used.has(name.toLowerCase()); n++)
      name = songFileName(`${song.title} (${n})`)
    used.add(name.toLowerCase())
    await writeTextFile(await join(folder, name), toOpenLyrics(song))
  }
  return { folder, count: summaries.length }
}

import { open, save } from "@tauri-apps/plugin-dialog"
import { readFile, writeTextFile } from "@tauri-apps/plugin-fs"
import type { BroadcastTheme } from "@/types"
import { normalizeTheme } from "@/lib/theme-migrations"

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"]

/** The image type from a file's first bytes, for the formats that have a signature. */
function sniffImageType(bytes: Uint8Array): string | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
  if (ascii(0, 4) === "GIF8") return "image/gif"
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png"
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg"
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp"
  if (ascii(0, 2) === "BM") return "image/bmp"
  return null
}

/**
 * Opens a native file dialog to pick an image, reads it,
 * and returns a base64 data URL that persists across restarts.
 */
export async function pickThemeBackgroundImage(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Images",
        // Linux's file chooser matches these case-sensitively, so a camera's
        // or a designer's LOGO.GIF would be hidden without the capitals.
        extensions: IMAGE_EXTENSIONS.flatMap((e) => [e, e.toUpperCase()]),
      },
    ],
  })
  if (!selected) return null

  const path = typeof selected === "string" ? selected : selected
  const bytes = await readFile(path)
  const extension = path.split(".").pop()?.toLowerCase() ?? "png"
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    svg: "image/svg+xml",
  }
  // Trust the bytes over the name: a GIF saved as .png must still animate.
  const mime = sniffImageType(bytes) ?? mimeMap[extension] ?? "image/png"

  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  const base64 = btoa(binary)
  return `data:${mime};base64,${base64}`
}

/**
 * Exports a theme as JSON via native save dialog.
 */
export async function exportTheme(theme: BroadcastTheme): Promise<void> {
  const path = await save({
    defaultPath: `${theme.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  })
  if (!path) return

  const json = JSON.stringify(theme, null, 2)
  await writeTextFile(path, json)
}

/**
 * Imports a theme from a JSON file via native open dialog.
 * Returns the parsed theme or null if cancelled/invalid.
 */
export async function importTheme(): Promise<BroadcastTheme | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Theme JSON", extensions: ["json"] }],
  })
  if (!selected) return null

  const path = typeof selected === "string" ? selected : selected
  const bytes = await readFile(path)
  const text = new TextDecoder().decode(bytes)
  const parsed = JSON.parse(text) as BroadcastTheme

  if (!parsed.id || !parsed.name || !parsed.background || !parsed.layout) {
    throw new Error("Invalid theme file: missing required fields")
  }

  return normalizeTheme({
    ...parsed,
    id: crypto.randomUUID(),
    builtin: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
}

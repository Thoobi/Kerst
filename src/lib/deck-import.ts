import { libraryApi } from "@/lib/library-api"
import type { Deck } from "@/types"

/**
 * Turning files into decks. Every page becomes a picture once, here, so
 * showing a slide during a service is just drawing an image.
 *
 * - A PDF becomes one deck, a page per slide.
 * - Loose PNG/JPEG files picked together become one deck, ordered by name
 *   the way a person would (Slide2 before Slide10).
 * - PowerPoint, Keynote and OpenDocument decks are refused with a hint to
 *   export a PDF; converting them comes later.
 */

/** Pages are rendered to fit this box, the outputs' native frame. */
export const SLIDE_RENDER_BOX = { width: 1920, height: 1080 }

export type ImportFileKind = "pdf" | "image" | "presentation" | "unsupported"

export function classifyImportFile(name: string): ImportFileKind {
  const ext = name.toLowerCase().split(".").pop() ?? ""
  if (ext === "pdf") return "pdf"
  if (ext === "png" || ext === "jpg" || ext === "jpeg") return "image"
  if (["ppt", "pptx", "pps", "ppsx", "key", "odp"].includes(ext)) return "presentation"
  return "unsupported"
}

/** "Sunday Welcome.pdf" -> "Sunday Welcome". */
export function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(0, dot) : name
}

/** Order file names the way a person reads them: Slide2 before Slide10. */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
}

/**
 * A title for a deck built from loose images, from what their names share:
 * "Welcome-01.png", "Welcome-02.png" -> "Welcome". Falls back to a generic
 * name when they share nothing useful (e.g. "Slide1.png" from PowerPoint).
 */
export function titleForImages(names: string[]): string {
  const stems = names.map(stripExtension)
  let prefix = stems[0] ?? ""
  for (const stem of stems.slice(1)) {
    let i = 0
    while (i < prefix.length && i < stem.length && prefix[i] === stem[i]) i++
    prefix = prefix.slice(0, i)
  }
  // Drop a trailing page number and separators: "Welcome - 0" -> "Welcome".
  const title = prefix.replace(/[\s._-]*\d*$/, "").trim()
  return title && !/^slide$/i.test(title) ? title : "Imported slides"
}

/** Scale that fits a page into the render box without cropping. */
export function fitScale(pageWidth: number, pageHeight: number): number {
  return Math.min(SLIDE_RENDER_BOX.width / pageWidth, SLIDE_RENDER_BOX.height / pageHeight)
}

export interface ImportPlan {
  /** Each PDF becomes its own deck. */
  pdfs: File[]
  /** All picked images together become one deck, in name order. */
  images: File[]
  /** Files that need exporting to PDF first. */
  presentations: File[]
  unsupported: File[]
}

export function planImport(files: File[]): ImportPlan {
  const plan: ImportPlan = { pdfs: [], images: [], presentations: [], unsupported: [] }
  for (const file of files) {
    const kind = classifyImportFile(file.name)
    if (kind === "pdf") plan.pdfs.push(file)
    else if (kind === "image") plan.images.push(file)
    else if (kind === "presentation") plan.presentations.push(file)
    else plan.unsupported.push(file)
  }
  plan.pdfs.sort((a, b) => naturalCompare(a.name, b.name))
  plan.images.sort((a, b) => naturalCompare(a.name, b.name))
  return plan
}

export interface ImportProgress {
  /** What is being imported, e.g. "Welcome.pdf". */
  source: string
  done: number
  total: number
}

type ProgressFn = (progress: ImportProgress) => void

/**
 * Stream slides into a new deck: begin, add each, finish. Any failure or
 * cancellation deletes the half-built deck, so nothing partial is left.
 */
async function buildDeck(
  title: string,
  sourceName: string,
  total: number,
  slideAt: (index: number) => Promise<Uint8Array>,
  onProgress: ProgressFn,
  signal?: AbortSignal
): Promise<Deck> {
  const deckId = await libraryApi.beginDeckImport(title, sourceName)
  try {
    for (let i = 0; i < total; i++) {
      signal?.throwIfAborted()
      onProgress({ source: sourceName, done: i, total })
      await libraryApi.addDeckSlide(deckId, await slideAt(i))
    }
    signal?.throwIfAborted()
    onProgress({ source: sourceName, done: total, total })
    return await libraryApi.finishDeckImport(deckId)
  } catch (error) {
    await libraryApi.deleteDeck(deckId).catch(() => {})
    throw error
  }
}

async function loadPdfJs() {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("could not encode the page as PNG"))
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject)
    }, "image/png")
  })
}

export async function importPdf(file: File, onProgress: ProgressFn, signal?: AbortSignal): Promise<Deck> {
  const pdfjs = await loadPdfJs()
  const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    const pdf = await loading.promise
    const canvas = document.createElement("canvas")
    return await buildDeck(
      stripExtension(file.name),
      file.name,
      pdf.numPages,
      async (index) => {
        const page = await pdf.getPage(index + 1)
        const unscaled = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: fitScale(unscaled.width, unscaled.height) })
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        // PDFs assume white paper; without this, unpainted areas would be
        // transparent and show as black on the outputs.
        await page.render({ canvas, viewport, background: "#ffffff" }).promise
        page.cleanup()
        return canvasToPng(canvas)
      },
      onProgress,
      signal
    )
  } finally {
    void loading.destroy()
  }
}

export async function importImages(files: File[], onProgress: ProgressFn, signal?: AbortSignal): Promise<Deck> {
  const names = files.map((f) => f.name)
  const source = files.length === 1 ? files[0].name : `${files.length} images`
  return buildDeck(
    titleForImages(names),
    source,
    files.length,
    async (index) => new Uint8Array(await files[index].arrayBuffer()),
    onProgress,
    signal
  )
}

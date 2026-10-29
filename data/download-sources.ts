/**
 * Downloads Bible source data: a pre-built zip of all 10 translations from
 * Google Drive, plus the cross-references dataset from openbible.info.
 *
 * Run: bun run data/download-sources.ts
 */

import { mkdir, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"

const DATA_DIR = import.meta.dir
const SOURCES_DIR = join(DATA_DIR, "sources")
const CROSS_REFS_DIR = join(DATA_DIR, "cross-refs")

// Pre-built zip of all 10 translations (~74 MB uncompressed). The `confirm=t`
// query param bypasses Google Drive's "can't scan for viruses" interstitial
// that would otherwise return an HTML page for files >100 MB.
const SOURCES_ZIP_URL =
  "https://drive.google.com/uc?export=download&id=1HQiNf_nCVRQrMbdmzVG7vq-Fvfqh1nzW&confirm=t"

const EXPECTED_TRANSLATIONS = [
  "KJV.json",
  "NIV.json",
  "ESV.json",
  "NASB.json",
  "NKJV.json",
  "NLT.json",
  "AMP.json",
  "SpaRV.json",
  "FreJND.json",
  "PorBLivre.json",
]

const CROSS_REFS_URL = "https://a.openbible.info/data/cross-references.zip"

// Public-domain and openly licensed translations, fetched one by one from
// their publishers' distributions rather than the pre-built zip. Licenses are
// recorded in build-bible-db.ts (TRANSLATIONS_META).
//
// scrollmapper/bible_databases is already in our JSON format; pinned to a
// commit so a rebuild gets the same text. eBible.org ships verse-per-line
// text that `fromEbibleVpl` converts.
const SCROLLMAPPER_JSON =
  "https://raw.githubusercontent.com/scrollmapper/bible_databases/59b18c5af5845728c275d5b7178ad0d024172b1f/formats/json"

const FREE_TRANSLATIONS: Array<
  | { file: string; scrollmapper: string }
  | { file: string; ebible: string; name: string }
> = [
  { file: "ASV.json", scrollmapper: "ASV" },
  { file: "BSB.json", scrollmapper: "BSB" },
  { file: "YLT.json", scrollmapper: "YLT" },
  { file: "Darby.json", scrollmapper: "Darby" },
  { file: "BBE.json", scrollmapper: "BBE" },
  { file: "GNV.json", scrollmapper: "Geneva1599" },
  { file: "WEB.json", ebible: "engwebp", name: "WEB: World English Bible" },
  { file: "YOR.json", ebible: "yor", name: "YOR: Bíbélì Mímọ́ ní Èdè Yorùbá Òde-Òní" },
  { file: "IBO.json", ebible: "ibo", name: "IBO: Baịbụlụ Nsọ nʼIgbo Ndị Ugbu a" },
]

// eBible.org's VPL book codes, in canonical order, with the English names the
// other sources use (build-bible-db.ts keys abbreviations by these names).
const EBIBLE_BOOKS: Array<[string, string]> = [
  ["GEN", "Genesis"], ["EXO", "Exodus"], ["LEV", "Leviticus"], ["NUM", "Numbers"],
  ["DEU", "Deuteronomy"], ["JOS", "Joshua"], ["JDG", "Judges"], ["RUT", "Ruth"],
  ["1SA", "I Samuel"], ["2SA", "II Samuel"], ["1KI", "I Kings"], ["2KI", "II Kings"],
  ["1CH", "I Chronicles"], ["2CH", "II Chronicles"], ["EZR", "Ezra"], ["NEH", "Nehemiah"],
  ["EST", "Esther"], ["JOB", "Job"], ["PSA", "Psalms"], ["PRO", "Proverbs"],
  ["ECC", "Ecclesiastes"], ["SOL", "Song of Solomon"], ["ISA", "Isaiah"], ["JER", "Jeremiah"],
  ["LAM", "Lamentations"], ["EZE", "Ezekiel"], ["DAN", "Daniel"], ["HOS", "Hosea"],
  ["JOE", "Joel"], ["AMO", "Amos"], ["OBA", "Obadiah"], ["JON", "Jonah"],
  ["MIC", "Micah"], ["NAH", "Nahum"], ["HAB", "Habakkuk"], ["ZEP", "Zephaniah"],
  ["HAG", "Haggai"], ["ZEC", "Zechariah"], ["MAL", "Malachi"], ["MAT", "Matthew"],
  ["MAR", "Mark"], ["LUK", "Luke"], ["JOH", "John"], ["ACT", "Acts"],
  ["ROM", "Romans"], ["1CO", "I Corinthians"], ["2CO", "II Corinthians"], ["GAL", "Galatians"],
  ["EPH", "Ephesians"], ["PHI", "Philippians"], ["COL", "Colossians"], ["1TH", "I Thessalonians"],
  ["2TH", "II Thessalonians"], ["1TI", "I Timothy"], ["2TI", "II Timothy"], ["TIT", "Titus"],
  ["PHM", "Philemon"], ["HEB", "Hebrews"], ["JAM", "James"], ["1PE", "I Peter"],
  ["2PE", "II Peter"], ["1JO", "I John"], ["2JO", "II John"], ["3JO", "III John"],
  ["JUD", "Jude"], ["REV", "Revelation of John"],
]

interface BibleJSON {
  translation: string
  books: Array<{
    name: string
    chapters: Array<{ chapter: number; verses: Array<{ verse: number; text: string }> }>
  }>
}

/** Convert eBible.org VPL text ("GEN 1:1 In the beginning…") to our JSON. */
export function fromEbibleVpl(vpl: string, name: string): BibleJSON {
  const order = new Map(EBIBLE_BOOKS.map(([code], i) => [code, i]))
  const books: BibleJSON["books"] = EBIBLE_BOOKS.map(([, bookName]) => ({
    name: bookName,
    chapters: [],
  }))

  for (const line of vpl.split(/\r?\n/)) {
    const m = /^(\S+) (\d+):(\d+) (.*)$/.exec(line.replace(/^\uFEFF/, ""))
    if (!m) continue
    const index = order.get(m[1])
    // Deuterocanonical books, where present, are outside the 66-book canon
    // the database numbers by position.
    if (index === undefined) continue
    const text = m[4].trim()
    if (!text) continue

    const chapterNumber = Number(m[2])
    const chapters = books[index].chapters
    let chapter = chapters.find((c) => c.chapter === chapterNumber)
    if (!chapter) {
      chapter = { chapter: chapterNumber, verses: [] }
      chapters.push(chapter)
    }
    chapter.verses.push({ verse: Number(m[3]), text })
  }

  return { translation: name, books }
}

/** The database numbers books by position, so anything but the full 66 in
 *  order would put verses under the wrong book. */
export function checkCanon(data: BibleJSON): string | null {
  if (data.books.length !== EBIBLE_BOOKS.length) {
    return `has ${data.books.length} books, expected ${EBIBLE_BOOKS.length}`
  }
  const empty = data.books.filter((b) => b.chapters.length === 0).map((b) => b.name)
  return empty.length > 0 ? `has no text for ${empty.join(", ")}` : null
}

async function downloadFile(url: string, dest: string): Promise<void> {
  console.log(`  Downloading ${url}...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`)
  const buffer = await res.arrayBuffer()
  await Bun.write(dest, buffer)
  const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(1)
  console.log(`  ✓ Saved ${dest} (${sizeMB} MB)`)
}

function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 && // P
    bytes[1] === 0x4b && // K
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  )
}

async function unzip(
  zipPath: string,
  destDir: string,
  exclude: string[] = []
): Promise<void> {
  const args = ["unzip", "-o", zipPath, "-d", destDir]
  if (exclude.length > 0) args.push("-x", ...exclude)
  const proc = Bun.spawn(args, { stdout: "inherit", stderr: "inherit" })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`unzip failed (exit ${exitCode}) for ${zipPath}`)
  }
}

async function downloadSourcesZip(): Promise<void> {
  const allPresent = EXPECTED_TRANSLATIONS.every((f) =>
    existsSync(join(SOURCES_DIR, f))
  )
  if (allPresent) {
    console.log("  ⏭ All translations already present, skipping zip download")
    return
  }

  // Stage the zip in DATA_DIR so it extracts as `data/sources/...` (the zip's
  // internal layout has a top-level `sources/` directory).
  const zipDest = join(DATA_DIR, "sources.zip")
  await downloadFile(SOURCES_ZIP_URL, zipDest)

  // Validate that we got a real zip and not Google Drive's HTML interstitial
  // (happens if the file ID is wrong, the file is private, or quota exceeded).
  const head = new Uint8Array(await Bun.file(zipDest).slice(0, 4).arrayBuffer())
  if (!isZip(head)) {
    await rm(zipDest, { force: true })
    throw new Error(
      "Google Drive returned a non-zip response (likely an HTML page). " +
        "Verify the file's sharing is set to 'Anyone with the link' and that " +
        "the daily download quota has not been exceeded."
    )
  }

  console.log("  📦 Extracting sources.zip...")
  // Exclude macOS resource-fork files (`__MACOSX/`, `._*`) that appear when the
  // zip was created on macOS Finder.
  await unzip(zipDest, DATA_DIR, ["__MACOSX/*", "*/.*"])
  await rm(zipDest, { force: true })
  await rm(join(DATA_DIR, "__MACOSX"), { recursive: true, force: true })

  const missing = EXPECTED_TRANSLATIONS.filter(
    (f) => !existsSync(join(SOURCES_DIR, f))
  )
  if (missing.length > 0) {
    throw new Error(
      `Zip extracted but missing expected files: ${missing.join(", ")}`
    )
  }
  console.log(`  ✓ Extracted ${EXPECTED_TRANSLATIONS.length} translations`)
}

async function fetchTranslation(entry: (typeof FREE_TRANSLATIONS)[number]): Promise<BibleJSON> {
  if ("scrollmapper" in entry) {
    const url = `${SCROLLMAPPER_JSON}/${entry.scrollmapper}.json`
    console.log(`  Downloading ${url}...`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as BibleJSON
  }

  const zipDest = join(SOURCES_DIR, `${entry.ebible}_vpl.zip`)
  try {
    await downloadFile(`https://ebible.org/Scriptures/${entry.ebible}_vpl.zip`, zipDest)
    const head = new Uint8Array(await Bun.file(zipDest).slice(0, 4).arrayBuffer())
    if (!isZip(head)) throw new Error("the server sent something other than a zip file")
    const proc = Bun.spawn(["unzip", "-p", zipDest, `${entry.ebible}_vpl.txt`], {
      stdout: "pipe",
      stderr: "inherit",
    })
    const vpl = await new Response(proc.stdout).text()
    const code = await proc.exited
    if (code !== 0) throw new Error(`unzip failed (exit ${code})`)
    return fromEbibleVpl(vpl, entry.name)
  } finally {
    await rm(zipDest, { force: true })
  }
}

async function downloadFreeTranslations(): Promise<void> {
  for (const entry of FREE_TRANSLATIONS) {
    const dest = join(SOURCES_DIR, entry.file)
    if (existsSync(dest)) {
      console.log(`  ⏭ ${entry.file} already exists, skipping`)
      continue
    }

    // Mirrors fail now and then (v0.4.3's Linux build got a broken Yoruba
    // zip); a few tries ride that out.
    let lastError: unknown = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const data = await fetchTranslation(entry)
        const problem = checkCanon(data)
        if (problem) throw new Error(problem)
        await Bun.write(dest, JSON.stringify(data))
        console.log(`  ✓ Saved ${entry.file}`)
        lastError = null
        break
      } catch (err) {
        lastError = err
        console.log(`  ⚠ ${entry.file} attempt ${attempt} failed: ${err instanceof Error ? err.message : err}`)
        if (attempt < 3) await Bun.sleep(attempt * 5000)
      }
    }
    if (lastError) {
      // One unreachable source shouldn't fail a release; the database build
      // skips a missing file (keeping every other translation's id) and the
      // warning shows on the CI run.
      console.log(
        `::warning::Skipped ${entry.file}: ${lastError instanceof Error ? lastError.message : lastError}`
      )
    }
  }
}

async function downloadCrossRefs(): Promise<void> {
  const crossRefFile = join(CROSS_REFS_DIR, "cross_references.txt")
  const existing = Bun.file(crossRefFile)
  if ((await existing.exists()) && existing.size > 1000) {
    console.log("  ⏭ cross_references.txt already exists, skipping")
    return
  }

  const zipDest = join(CROSS_REFS_DIR, "cross-references.zip")
  await downloadFile(CROSS_REFS_URL, zipDest)
  await unzip(zipDest, CROSS_REFS_DIR)
  await rm(zipDest, { force: true })
}

async function main() {
  await mkdir(SOURCES_DIR, { recursive: true })
  await mkdir(CROSS_REFS_DIR, { recursive: true })

  console.log("\n📖 Downloading Bible translations (pre-built zip)...\n")
  await downloadSourcesZip()

  console.log("\n📖 Downloading free translations...\n")
  await downloadFreeTranslations()

  console.log("\n🔗 Downloading cross-references...\n")
  await downloadCrossRefs()

  console.log("\n✅ All source data downloaded!\n")
}

if (import.meta.main) main().catch((err) => {
  console.error("❌ Download failed:", err)
  process.exit(1)
})

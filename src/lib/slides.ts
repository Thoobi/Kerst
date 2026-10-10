import type { Slide, VerseRenderData } from "@/types"

/** Convert a slide into the render shape every output already draws. */
export function toRenderData(slide: Slide): VerseRenderData {
  switch (slide.kind) {
    case "scripture": {
      const { verse, translation } = slide
      return {
        reference: `${verse.book_name} ${verse.chapter}:${verse.verse} (${translation})`,
        segments: [{ verseNumber: verse.verse, text: verse.text }],
      }
    }
    case "lyrics":
      // No reference: only the words are big; the credit sits in a corner.
      return {
        style: "lyrics",
        reference: "",
        segments: slide.lines.map((text, i) => ({ text, lineBreak: i > 0 })),
        ...(slide.credit ? { credit: slide.credit } : {}),
        ...(slide.background ? { background: slide.background } : {}),
      }
    case "text":
      return {
        style: "lyrics",
        reference: "",
        segments: slide.lines.map((text, i) => ({ text, lineBreak: i > 0 })),
        ...(slide.background ? { background: slide.background } : {}),
      }
    case "image":
      return { reference: slide.title, segments: [], image: { url: slide.url } }
  }
}

/** Short operator-facing label, e.g. "John 3:16" or "Amazing Grace · Verse 1". */
export function slideLabel(slide: Slide): string {
  switch (slide.kind) {
    case "scripture":
      return `${slide.verse.book_name} ${slide.verse.chapter}:${slide.verse.verse}`
    case "lyrics":
      return `${slide.songTitle} · ${slide.sectionLabel}`
    case "text":
      return slide.title
    case "image":
      return slide.title
  }
}

import { describe, expect, it } from "vitest"
import { slideLabel, toRenderData } from "./slides"
import type { ImageSlide, LyricSlide, ScriptureSlide } from "@/types"

const scripture: ScriptureSlide = {
  kind: "scripture",
  translation: "KJV",
  verse: {
    id: 1,
    translation_id: 1,
    book_number: 43,
    book_name: "John",
    book_abbreviation: "Jn",
    chapter: 3,
    verse: 16,
    text: "For God so loved the world",
  },
}

const lyric: LyricSlide = {
  kind: "lyrics",
  songId: "s1",
  songTitle: "Amazing Grace",
  sectionLabel: "Verse 1",
  lines: ["Amazing grace", "How sweet the sound"],
  credit: "Amazing Grace · John Newton",
}

const image: ImageSlide = {
  kind: "image",
  url: "data:image/png;base64,slide",
  title: "Welcome · 3",
}

describe("toRenderData", () => {
  it("renders scripture exactly as before: reference with translation, one numbered segment", () => {
    expect(toRenderData(scripture)).toEqual({
      reference: "John 3:16 (KJV)",
      segments: [{ verseNumber: 16, text: "For God so loved the world" }],
    })
  })

  it("puts each lyric line on its own line, the first without a break", () => {
    expect(toRenderData(lyric).segments).toEqual([
      { text: "Amazing grace", lineBreak: false },
      { text: "How sweet the sound", lineBreak: true },
    ])
  })

  it("keeps lyrics free of a reference and carries the credit for the corner", () => {
    expect(toRenderData(lyric).reference).toBe("")
    expect(toRenderData(lyric).credit).toBe("Amazing Grace · John Newton")
    expect(toRenderData({ ...lyric, credit: undefined })).not.toHaveProperty("credit")
  })

  it("carries an image slide as a full-frame picture with no text", () => {
    expect(toRenderData(image)).toEqual({
      reference: "Welcome · 3",
      segments: [],
      image: { url: "data:image/png;base64,slide" },
    })
  })

  it("never gives text slides an image", () => {
    expect(toRenderData(scripture).image).toBeUndefined()
    expect(toRenderData(lyric).image).toBeUndefined()
  })
})

describe("slideLabel", () => {
  it("labels scripture by reference and lyrics by song and section", () => {
    expect(slideLabel(scripture)).toBe("John 3:16")
    expect(slideLabel(lyric)).toBe("Amazing Grace · Verse 1")
    expect(slideLabel(image)).toBe("Welcome · 3")
  })
})

import { describe, expect, it } from "vitest"
import { slideLabel, toRenderData } from "./slides"
import type { LyricSlide, ScriptureSlide } from "@/types"

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
  footer: "John Newton · Public Domain",
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

  it("shows the copyright footer in the reference slot", () => {
    expect(toRenderData(lyric).reference).toBe("John Newton · Public Domain")
    expect(toRenderData({ ...lyric, footer: undefined }).reference).toBe("")
  })
})

describe("slideLabel", () => {
  it("labels scripture by reference and lyrics by song and section", () => {
    expect(slideLabel(scripture)).toBe("John 3:16")
    expect(slideLabel(lyric)).toBe("Amazing Grace · Verse 1")
  })
})

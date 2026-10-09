import { describe, expect, it } from "vitest"
import { lyricPages, songFooter, songSlides, toLyricSlide } from "./song-slides"
import { toRenderData } from "./slides"
import type { Song } from "@/types"

const song: Song = {
  id: "s1",
  title: "Amazing Grace",
  author: "John Newton",
  copyright: "Public Domain",
  ccli_number: "22025",
  sections: [
    { id: "v1", kind: "verse", label: "Verse 1", lyrics: "Amazing grace\nHow sweet the sound\n\nThat saved a wretch\nLike me" },
    { id: "c", kind: "chorus", label: "Chorus", lyrics: "My chains are gone" },
    { id: "v2", kind: "verse", label: "Verse 2", lyrics: "Twas grace" },
  ],
  arrangement: ["v1", "c", "v2", "c"],
  source: "manual",
  created_at: 0,
  updated_at: 0,
}

describe("lyricPages", () => {
  it("splits at blank lines", () => {
    expect(lyricPages("a\nb\n\nc")).toEqual([["a", "b"], ["c"]])
  })

  it("splits long screens evenly rather than leaving a short tail", () => {
    expect(lyricPages("1\n2\n3\n4\n5\n6").map((p) => p.length)).toEqual([3, 3])
    expect(lyricPages("1\n2\n3\n4\n5").map((p) => p.length)).toEqual([3, 2])
    expect(lyricPages("1\n2\n3\n4").map((p) => p.length)).toEqual([4])
  })

  it("ignores stray blank lines and whitespace", () => {
    expect(lyricPages("\n\n  a  \n\n\n\nb\n")).toEqual([["a"], ["b"]])
    expect(lyricPages("")).toEqual([])
  })
})

describe("songSlides", () => {
  it("follows the sung order, repeating the chorus", () => {
    const slides = songSlides(song)
    expect(slides.map((s) => `${s.code}:${s.page + 1}/${s.pages}`)).toEqual([
      "V1:1/2",
      "V1:2/2",
      "C:1/1",
      "V2:1/1",
      "C:1/1",
    ])
    expect(slides.map((s) => s.order)).toEqual([0, 0, 1, 2, 3])
  })

  it("uses the written order when there is no arrangement", () => {
    const slides = songSlides({ ...song, arrangement: [] })
    expect(slides.map((s) => s.code)).toEqual(["V1", "V1", "C", "V2"])
  })

  it("skips arrangement entries whose section is gone", () => {
    expect(songSlides({ ...song, arrangement: ["c", "deleted", "v2"] }).map((s) => s.code)).toEqual([
      "C",
      "V2",
    ])
  })
})

describe("songFooter", () => {
  it("credits author, copyright and CCLI number", () => {
    expect(songFooter(song)).toBe("John Newton · © Public Domain · CCLI Song #22025")
  })

  it("does not double the copyright sign and skips what is missing", () => {
    expect(songFooter({ author: null, copyright: "© 2020 Hillsong", ccli_number: null })).toBe("© 2020 Hillsong")
    expect(songFooter({ author: null, copyright: null, ccli_number: null })).toBe("")
  })
})

describe("toLyricSlide", () => {
  it("renders each sung line on its own line with the credit in the reference slot", () => {
    const slide = toLyricSlide(song, songSlides(song)[1])
    expect(slide.sectionLabel).toBe("Verse 1 (2/2)")
    expect(toRenderData(slide)).toEqual({
      reference: "John Newton · © Public Domain · CCLI Song #22025",
      segments: [
        { text: "That saved a wretch", lineBreak: false },
        { text: "Like me", lineBreak: true },
      ],
    })
  })
})

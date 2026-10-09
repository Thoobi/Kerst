import { describe, expect, it } from "vitest"
import { parseArrangement, parseHeader, parseSongText, sectionCodes, songToText } from "./song-text"

describe("parseHeader", () => {
  it("reads the usual ways people label sections", () => {
    expect(parseHeader("Verse 1")).toEqual({ kind: "verse", label: "Verse 1" })
    expect(parseHeader("CHORUS:")).toEqual({ kind: "chorus", label: "Chorus" })
    expect(parseHeader("[Bridge]")).toEqual({ kind: "bridge", label: "Bridge" })
    expect(parseHeader("Pre-Chorus 2")).toEqual({ kind: "pre-chorus", label: "Pre-Chorus 2" })
    expect(parseHeader("pre chorus")).toEqual({ kind: "pre-chorus", label: "Pre-Chorus" })
    expect(parseHeader("Refrain")).toEqual({ kind: "chorus", label: "Chorus" })
    expect(parseHeader("[V2]")).toEqual({ kind: "verse", label: "Verse 2" })
    expect(parseHeader("Ending")).toEqual({ kind: "outro", label: "Outro" })
    expect(parseHeader("Interlude")).toEqual({ kind: "other", label: "Interlude" })
    expect(parseHeader("MISC 2")).toEqual({ kind: "other", label: "Misc 2" })
    expect(parseHeader("Instrumental")).toEqual({ kind: "other", label: "Instrumental" })
  })

  it("leaves lyric lines alone, including bare letters", () => {
    expect(parseHeader("Amazing grace how sweet the sound")).toBeNull()
    expect(parseHeader("O")).toBeNull()
    expect(parseHeader("I")).toBeNull()
    expect(parseHeader("Verse of my life")).toBeNull()
  })
})

describe("parseSongText with headers", () => {
  const text = `Verse 1
Amazing grace how sweet the sound
That saved a wretch like me

I once was lost but now am found

Chorus
My chains are gone

Verse 2
'Twas grace that taught my heart to fear

Chorus`

  it("makes a section per header and keeps blank lines inside as screen breaks", () => {
    const { sections } = parseSongText(text)
    expect(sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus", "Verse 2"])
    expect(sections[0].lyrics).toBe(
      "Amazing grace how sweet the sound\nThat saved a wretch like me\n\nI once was lost but now am found"
    )
  })

  it("treats a repeated empty header as singing that section again", () => {
    expect(parseSongText(text).arrangement).toEqual([0, 1, 2, 1])
  })

  it("leaves the order as written when nothing repeats", () => {
    expect(parseSongText("Verse 1\na\n\nChorus\nb").arrangement).toEqual([])
  })

  it("makes lyrics before the first header the first verse", () => {
    const { sections, arrangement } = parseSongText("Line one\n\nChorus\nchorus line\n\nChorus")
    expect(sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus"])
    expect(arrangement).toEqual([0, 1, 1])
  })
})

describe("parseSongText without headers", () => {
  it("splits on blank lines and spots the repeated paragraph as the chorus", () => {
    const { sections, arrangement } = parseSongText(
      "First verse line\nmore\n\nThis is the chorus\nsing it\n\nSecond verse\n\nthis is the chorus,\nSing it!"
    )
    expect(sections.map((s) => [s.kind, s.label])).toEqual([
      ["verse", "Verse 1"],
      ["chorus", "Chorus"],
      ["verse", "Verse 2"],
    ])
    expect(arrangement).toEqual([0, 1, 2, 1])
  })
})

describe("songToText", () => {
  it("round-trips through the parser", () => {
    const sections = [
      { kind: "verse" as const, label: "Verse 1", lyrics: "a\nb\n\nc" },
      { kind: "chorus" as const, label: "Chorus", lyrics: "d" },
    ]
    expect(parseSongText(songToText(sections)).sections).toEqual(sections)
  })
})

describe("sectionCodes and parseArrangement", () => {
  const sections = [
    { kind: "verse" as const, label: "Verse 1" },
    { kind: "chorus" as const, label: "Chorus" },
    { kind: "verse" as const, label: "Verse 2" },
    { kind: "pre-chorus" as const, label: "Pre-Chorus" },
    { kind: "chorus" as const, label: "Chorus" },
    { kind: "bridge" as const, label: "Bridge" },
  ]

  it("gives every section a short, unique code", () => {
    expect(sectionCodes(sections)).toEqual(["V1", "C", "V2", "PC", "C2", "B"])
  })

  it("reads an arrangement line in any case, reporting unknown codes", () => {
    const codes = sectionCodes(sections)
    expect(parseArrangement("v1 C, V2 c b X9", codes)).toEqual({
      order: [0, 1, 2, 1, 5],
      unknown: ["X9"],
    })
  })
})

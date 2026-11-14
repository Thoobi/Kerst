import { describe, expect, it } from "vitest"
import { LOWER_THIRD_LOOKS, currentLook, withTextColors } from "./lower-third-looks"
import { LOWER_THIRDS } from "./builtin-themes"
import type { BroadcastTheme } from "@/types/broadcast"

const custom: BroadcastTheme = {
  ...LOWER_THIRDS,
  verseText: { ...LOWER_THIRDS.verseText, fontFamily: "Inter", fontSize: 50 },
  reference: { ...LOWER_THIRDS.reference, fontFamily: "Inter", fontSize: 30 },
  layout: { ...LOWER_THIRDS.layout, textAreaHeight: 31 },
}

describe("lower third looks", () => {
  it.each(LOWER_THIRD_LOOKS.map((look) => [look.name, look] as const))(
    "%s keeps the fonts, sizes and band height, and sets a band transition",
    (_, look) => {
      const theme = { ...custom, ...look.apply(custom) }
      expect(theme.verseText.fontFamily).toBe("Inter")
      expect(theme.verseText.fontSize).toBe(50)
      expect(theme.reference.fontSize).toBe(30)
      expect(theme.layout.textAreaHeight).toBe(31)
      expect(theme.layout.anchor).toBe("bottom-center")
      // Lifting the band never moves the background (a camera stays full frame).
      expect(theme.layout.offsetY).toBe(0)
      expect(theme.bandTransition?.duration).toBeGreaterThan(0)
      expect(currentLook(theme)).toBe(look.id)
    }
  )

  it("drops a previous look's video, image, gradient and accent", () => {
    const busy: BroadcastTheme = {
      ...custom,
      textBox: {
        ...custom.textBox,
        video: { videoId: "v", file: "f.mp4" },
        image: { url: "x", fit: "cover", blur: 0, brightness: 100, tint: null },
        accent: { color: "#fff", width: 9, side: "left" },
      },
    }
    const classic = LOWER_THIRD_LOOKS.find((l) => l.id === "classic")!.apply(busy)
    expect(classic.textBox).toMatchObject({ video: null, image: null, gradient: null, accent: null, enabled: true })
  })

  it("is the built-in Lower Thirds' own look", () => {
    expect(currentLook(LOWER_THIRDS)).toBe("floating")
  })
})

describe("withTextColors", () => {
  it("sets the colour and clears song and Bible overrides of it, keeping the rest", () => {
    const theme: BroadcastTheme = {
      ...custom,
      lyricsText: { color: "#ff0000", fontSize: 40 },
      scriptureText: { color: "#00ff00", referenceColor: "#0000ff" },
    }
    const next = { ...theme, ...withTextColors(theme, { words: "#123456" }) }
    expect(next.verseText.color).toBe("#123456")
    expect(next.lyricsText).toEqual({ fontSize: 40 })
    expect(next.scriptureText).toEqual({ referenceColor: "#0000ff" })

    const ref = { ...next, ...withTextColors(next, { reference: "#abcdef" }) }
    expect(ref.reference.color).toBe("#abcdef")
    expect(ref.scriptureText).toEqual({})
  })
})

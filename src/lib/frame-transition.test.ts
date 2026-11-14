import { describe, expect, it } from "vitest"
import { bandTimeline, contentKey, ease, shouldTransition, transitionProgress, transitionSpecFor } from "./frame-transition"
import { BUILTIN_THEMES } from "./builtin-themes"
import type { BroadcastTheme, VerseRenderData } from "@/types/broadcast"

const theme: BroadcastTheme = {
  ...BUILTIN_THEMES[0],
  transition: { type: "fade", duration: 400, easing: "linear", direction: "up" },
}
const verse = (text: string, extra: Partial<VerseRenderData> = {}): VerseRenderData => ({
  reference: "John 3:16",
  segments: [{ text }],
  ...extra,
})

describe("shouldTransition", () => {
  it("animates new words, going on air and going off air", () => {
    expect(shouldTransition({ theme, verse: verse("a") }, { theme, verse: verse("b") })).toBe(true)
    expect(shouldTransition({ theme, verse: null }, { theme, verse: verse("a") })).toBe(true)
    expect(shouldTransition({ theme, verse: verse("a") }, { theme, verse: null })).toBe(true)
  })

  it("doesn't animate the same words: a theme edit, a video's play/pause, a timer's tick", () => {
    const edited = { ...theme, verseText: { ...theme.verseText, fontSize: 99 } }
    expect(shouldTransition({ theme, verse: verse("a") }, { theme: edited, verse: verse("a") })).toBe(false)

    const video = { id: "v", url: "u", duration: 9, loop: false, playing: true, position: 0, anchor: 1 }
    expect(
      shouldTransition(
        { theme, verse: verse("", { video }) },
        { theme, verse: verse("", { video: { ...video, playing: false, position: 3, anchor: 2 } }) }
      )
    ).toBe(false)

    const timer = { direction: "down" as const, seconds: 60, anchor: 1, running: true, caption: "", endText: "" }
    expect(
      shouldTransition(
        { theme, verse: verse("1:00", { timer }) },
        { theme, verse: verse("0:59", { timer: { ...timer, seconds: 59 } }) }
      )
    ).toBe(false)
    expect(contentKey(verse("1:00", { timer }))).not.toBe(contentKey(verse("1:00")))
  })

  it("cuts when the theme says so, or on the very first frame", () => {
    const cut = { ...theme, transition: { ...theme.transition, type: "none" as const } }
    expect(shouldTransition({ theme, verse: verse("a") }, { theme: cut, verse: verse("b") })).toBe(false)
    expect(shouldTransition(null, { theme, verse: verse("a") })).toBe(false)
  })
})

describe("easing", () => {
  it("runs 0 to 1 for every easing, and progress ends at 1", () => {
    for (const easing of ["linear", "ease-in", "ease-out", "ease-in-out"] as const) {
      expect(ease(easing, 0)).toBe(0)
      expect(ease(easing, 1)).toBe(1)
      expect(ease(easing, 0.5)).toBeGreaterThan(0)
      expect(ease(easing, 0.5)).toBeLessThan(1)
    }
    const transition = { from: { theme, verse: null }, start: 1000, spec: theme.transition }
    expect(transitionProgress(transition, 1200)).toBeCloseTo(0.5)
    expect(transitionProgress(transition, 1400)).toBe(1)
  })
})

describe("transitionSpecFor", () => {
  const band = { type: "pop" as const, duration: 450, easing: "ease-out" as const, direction: "up" as const }
  const lowerThird: BroadcastTheme = { ...theme, bandTransition: band }

  it("uses the band transition coming on and going off air", () => {
    expect(transitionSpecFor({ theme: lowerThird, verse: null }, { theme: lowerThird, verse: verse("a") })).toEqual(band)
    expect(transitionSpecFor({ theme: lowerThird, verse: verse("a") }, { theme: lowerThird, verse: null })).toEqual(band)
  })

  it("keeps the theme's transition for new words in the band", () => {
    expect(
      transitionSpecFor({ theme: lowerThird, verse: verse("a") }, { theme: lowerThird, verse: verse("b") })
    ).toEqual(theme.transition)
  })

  it("falls back to the theme's transition without a band transition", () => {
    expect(transitionSpecFor({ theme, verse: null }, { theme, verse: verse("a") })).toEqual(theme.transition)
  })

  it("doesn't animate a cut", () => {
    const cut: BroadcastTheme = { ...theme, bandTransition: { ...band, type: "cut" } }
    expect(shouldTransition({ theme: cut, verse: null }, { theme: cut, verse: verse("a") })).toBe(false)
    // New words still use the theme's own transition.
    expect(shouldTransition({ theme: cut, verse: verse("a") }, { theme: cut, verse: verse("b") })).toBe(true)
  })
})

describe("band first, then words", () => {
  const band = { type: "slide" as const, duration: 400, easing: "ease-out" as const, direction: "up" as const }

  it("keeps band and words together by default", () => {
    expect(bandTimeline(band, true)).toEqual({ total: 400, band: { start: 0, length: 400 }, text: { start: 0, length: 400 } })
    expect(bandTimeline({ ...band, textTiming: "with" }, true).total).toBe(400)
  })

  it("brings the words in after the band has landed, and takes them off first", () => {
    const on = bandTimeline({ ...band, textTiming: "after" }, true)
    expect(on.band).toEqual({ start: 0, length: 400 })
    expect(on.text.start).toBeGreaterThanOrEqual(400)
    expect(on.total).toBe(on.text.start + on.text.length)

    const off = bandTimeline({ ...band, textTiming: "after" }, false)
    expect(off.text.start).toBe(0)
    expect(off.band.start).toBeGreaterThanOrEqual(off.text.length)
    expect(off.total).toBe(off.band.start + 400)
  })

  it("starts the words as the band settles, with landing", () => {
    const on = bandTimeline({ ...band, textTiming: "landing" }, true)
    expect(on.text.start).toBeGreaterThan(0)
    expect(on.text.start).toBeLessThan(400)
  })

  it("runs the whole timeline, in linear time, when the words are apart", () => {
    const spec = { ...band, textTiming: "after" as const }
    const transition = { from: { theme, verse: null }, start: 0, spec }
    const total = bandTimeline(spec, true).total
    expect(transitionProgress(transition, total / 2)).toBeCloseTo(0.5, 5)
    expect(transitionProgress(transition, total)).toBe(1)
    // Words to words in a band that stays up: unchanged.
    const words = { from: { theme, verse: verse("a") }, start: 0, spec: theme.transition }
    expect(transitionProgress(words, theme.transition.duration)).toBe(1)
  })

  it("never splits a cut", () => {
    expect(bandTimeline({ ...band, type: "cut", textTiming: "after" }, true).total).toBe(400)
  })
})

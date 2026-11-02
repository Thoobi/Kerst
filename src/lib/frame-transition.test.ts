import { describe, expect, it } from "vitest"
import { contentKey, ease, shouldTransition, transitionProgress } from "./frame-transition"
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

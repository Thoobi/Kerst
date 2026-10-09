import { describe, expect, it } from "vitest"
import { fitFrame, renderScale } from "./output-frame"

const THEME = { width: 1920, height: 1080 }

describe("fitFrame", () => {
  it("uses every pixel of a 4K screen instead of upscaling a 1080p picture", () => {
    expect(fitFrame(THEME, { width: 3840, height: 2160 })).toEqual({ width: 3840, height: 2160 })
  })

  it("letterboxes a 16:9 theme on a 16:10 screen, at the screen's own pixels", () => {
    expect(fitFrame(THEME, { width: 1440, height: 900 })).toEqual({ width: 1440, height: 810 })
  })

  it("pillarboxes on a 4:3 projector", () => {
    expect(fitFrame(THEME, { width: 1024, height: 768 })).toEqual({ width: 1024, height: 576 })
  })

  it("rounds to whole pixels and never collapses to nothing", () => {
    expect(fitFrame(THEME, { width: 1366, height: 768 })).toEqual({ width: 1365, height: 768 })
    expect(fitFrame(THEME, { width: 0, height: 0 })).toEqual({ width: 1, height: 1 })
  })
})

describe("renderScale", () => {
  it("maps the theme onto the frame", () => {
    expect(renderScale(THEME, { width: 3840, height: 2160 })).toBe(2)
    expect(renderScale(THEME, { width: 1280, height: 720 })).toBeCloseTo(2 / 3)
  })
})

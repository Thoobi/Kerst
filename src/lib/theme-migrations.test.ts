import { describe, expect, it } from "vitest"
import type { BroadcastTheme } from "@/types/broadcast"
import { BUILTIN_THEMES } from "./builtin-themes"
import { normalizeTheme, seedFreeBoxesFromMetrics } from "./theme-migrations"
import type { VerseLayoutMetrics } from "./verse-renderer"

const stackedBase = BUILTIN_THEMES[0]

describe("normalizeTheme — surfaces", () => {
  it("fills in the container's image key for themes saved before surfaces", () => {
    const legacy = {
      ...stackedBase,
      textBox: {
        enabled: true,
        color: "#111111",
        opacity: 0.5,
        borderRadius: 8,
        padding: 12,
      },
    } as unknown as BroadcastTheme

    const normalized = normalizeTheme(legacy)
    expect(normalized.textBox.image).toBeNull()
    // Everything the theme did specify survives.
    expect(normalized.textBox).toMatchObject({
      enabled: true,
      color: "#111111",
      opacity: 0.5,
      borderRadius: 8,
      padding: 12,
    })
  })

  it("leaves per-element surfaces undefined when absent", () => {
    const normalized = normalizeTheme(stackedBase)
    expect(normalized.reference.surface).toBeUndefined()
    expect(normalized.verseText.surface).toBeUndefined()
  })

  it("fills defaults into a partially specified element surface", () => {
    const theme = {
      ...stackedBase,
      reference: {
        ...stackedBase.reference,
        surface: { enabled: true, color: "#222222" },
      },
    } as unknown as BroadcastTheme

    const surface = normalizeTheme(theme).reference.surface!
    expect(surface.enabled).toBe(true)
    expect(surface.color).toBe("#222222")
    expect(surface.image).toBeNull()
    expect(typeof surface.borderRadius).toBe("number")
    expect(typeof surface.padding).toBe("number")
  })
})

describe("normalizeTheme", () => {
  it("defaults layout.mode to stacked for legacy themes", () => {
    const legacy = {
      ...stackedBase,
      layout: { ...stackedBase.layout, mode: undefined },
    }
    expect(normalizeTheme(legacy).layout.mode).toBe("stacked")
  })

  it("keeps free mode when both boxes are valid", () => {
    const theme: BroadcastTheme = {
      ...stackedBase,
      layout: {
        ...stackedBase.layout,
        mode: "free",
        referenceBox: { x: 5, y: 5, width: 50, height: 10 },
        verseBox: { x: 5, y: 20, width: 60, height: 50 },
      },
    }
    expect(normalizeTheme(theme).layout.mode).toBe("free")
  })

  it("demotes free mode to stacked when boxes are missing", () => {
    const theme: BroadcastTheme = {
      ...stackedBase,
      layout: { ...stackedBase.layout, mode: "free" },
    }
    expect(normalizeTheme(theme).layout.mode).toBe("stacked")
  })

  it("demotes free mode to stacked when a box has non-finite values", () => {
    const theme: BroadcastTheme = {
      ...stackedBase,
      layout: {
        ...stackedBase.layout,
        mode: "free",
        referenceBox: { x: NaN, y: 0, width: 50, height: 10 },
        verseBox: { x: 5, y: 20, width: 60, height: 50 },
      },
    }
    expect(normalizeTheme(theme).layout.mode).toBe("stacked")
  })

  it("fills verse number defaults for themes missing the field", () => {
    const legacy = {
      ...stackedBase,
      verseNumbers: undefined,
    } as unknown as BroadcastTheme
    const normalized = normalizeTheme(legacy)
    expect(normalized.verseNumbers).toEqual({
      visible: true,
      fontSize: 18,
      color: "#ffffff",
      superscript: true,
    })
  })

  it("preserves existing verse number settings", () => {
    const normalized = normalizeTheme(stackedBase)
    expect(normalized.verseNumbers).toEqual(stackedBase.verseNumbers)
  })
})

describe("seedFreeBoxesFromMetrics", () => {
  const metrics = {
    textRect: { x: 192, y: 108, width: 1536, height: 864 },
    referenceRect: { x: 500, y: 200, width: 400, height: 72 },
    verseRect: { x: 300, y: 300, width: 900, height: 400 },
  } as VerseLayoutMetrics

  it("converts element rects to percent boxes that tightly wrap the content", () => {
    const seeded = seedFreeBoxesFromMetrics(metrics, {
      width: 1920,
      height: 1080,
    })
    expect(seeded).toEqual({
      referenceBox: { x: 26.04, y: 18.51, width: 20.84, height: 6.67 },
      verseBox: { x: 15.62, y: 27.77, width: 46.88, height: 37.04 },
    })
  })

  it("never rounds a box smaller than its source rect", () => {
    const seeded = seedFreeBoxesFromMetrics(metrics, {
      width: 1920,
      height: 1080,
    })!
    expect((seeded.verseBox.width / 100) * 1920).toBeGreaterThanOrEqual(
      metrics.verseRect!.width
    )
    expect((seeded.verseBox.height / 100) * 1080).toBeGreaterThanOrEqual(
      metrics.verseRect!.height
    )
  })

  it("returns null when an element rect is missing", () => {
    const withoutRef = { ...metrics, referenceRect: null } as VerseLayoutMetrics
    expect(
      seedFreeBoxesFromMetrics(withoutRef, { width: 1920, height: 1080 })
    ).toBeNull()
  })
})

describe("camera panel", () => {
  const sbs = BUILTIN_THEMES.find((t) => t.id === "builtin-side-by-side")!

  it("ships a Side by Side theme with the camera level with the words", () => {
    const panel = sbs.cameraPanel!
    expect(panel.enabled).toBe(true)
    expect(sbs.layout.mode).toBe("free")
    expect(panel.box.y).toBe(sbs.layout.verseBox!.y)
    expect(panel.box.height).toBe(sbs.layout.verseBox!.height)
    // Side by side: the camera ends before the words begin.
    expect(panel.box.x + panel.box.width).toBeLessThan(sbs.layout.verseBox!.x)
  })

  it("keeps a saved panel, and drops one whose box can't be placed", () => {
    expect(normalizeTheme(sbs).cameraPanel).toEqual(sbs.cameraPanel)
    const broken = { ...sbs, cameraPanel: { ...sbs.cameraPanel!, box: { x: 0, y: 0, width: 0, height: 10 } } }
    expect(normalizeTheme(broken).cameraPanel).toBeNull()
    expect(normalizeTheme(stackedBase).cameraPanel).toBeNull()
  })

  it("places the panel at the output's size and hides it under full-frame media", async () => {
    const { activePanel, cameraPanelRect } = await import("./verse-renderer")
    expect(cameraPanelRect(sbs, null, 0.5)).toEqual({
      rect: { x: 38.4, y: 135, width: 480, height: 270 },
      radius: { tl: 12, tr: 12, br: 12, bl: 12 },
    })
    expect(activePanel(sbs, { reference: "", segments: [], image: { url: "slide.png" } })).toBeNull()
    expect(activePanel({ ...sbs, cameraPanel: { ...sbs.cameraPanel!, enabled: false } }, null)).toBeNull()
  })
})

import { useEffect, useRef, useState, useCallback } from "react"
import * as fabric from "fabric"
import { useBroadcastStore, type DesignerSample, type SelectedElement } from "@/stores/broadcast-store"
import {
  cameraPanelRect,
  freeBoxesInBand,
  logoRect,
  textAreaRect,
  onThemeFontsLoaded,
  renderVerse,
  type VerseLayoutMetrics,
} from "@/lib/verse-renderer"
import { boxesToBand, seedFreeBoxesForTheme, seedFreeBoxesFromMetrics, SAMPLE_VERSE } from "@/lib/theme-migrations"
import { isLowerThird } from "@/lib/lower-third"
import { toast } from "sonner"
import { preloadThemeImages, themeImageCache } from "@/lib/theme-image-cache"
import { Button } from "@/components/ui/button"
import { PlusIcon, MinusIcon, Grid3X3Icon, MaximizeIcon, LockIcon, LockOpenIcon } from "lucide-react"
import type { BroadcastTheme, ElementBox, LogoCorner, VerseRenderData } from "@/types/broadcast"
import { latestCameraFrame, watchCamera } from "@/lib/mjpeg-reader"
import { BandVideo } from "@/components/ui/band-video"
import { ThemeVideo } from "@/components/ui/theme-video"
import { cn } from "@/lib/utils"

/**
 * The editor's copy of the band's looping video, playing out of sight: its
 * current frame is drawn into the band (the editor's canvas holds the pixels).
 */
const designerBand: { current: HTMLVideoElement | null } = { current: null }
/** Likewise the theme's background video, drawn into the editor's background. */
const designerBackground: { current: HTMLVideoElement | null } = { current: null }

/** The content the canvas shows the theme with (the toolbar's Bible / Song / Text). */

/** Boxes locked from the layers bar: still selectable, but they don't move. */
const lockedRegions = new Set<Region>()

const WS_WIDTH = 1920
const WS_HEIGHT = 1080
/** Grid spacing, in workspace px: 48 × 27 cells on a 16:9 frame. */
const GRID = 40
/** How close an edge must come to a guide to snap to it, in screen px. */
const SNAP_SCREEN_PX = 8
/** Smallest a box can be resized to, in workspace px. */
const MIN_BOX_PX = 24

type Region = "reference" | "verse" | "camera" | "logo"
type BoxKey = "referenceBox" | "verseBox"
const REGIONS: Region[] = ["reference", "verse", "camera", "logo"]

interface Regions {
  workspace: fabric.Rect | null
  reference: fabric.Rect | null
  verse: fabric.Rect | null
  camera: fabric.Rect | null
  logo: fabric.Rect | null
}

/** What the canvas shows the theme with: each content type lays out its own way. */
type Sample = DesignerSample

const SAMPLES: Record<Sample, VerseRenderData> = {
  scripture: { ...SAMPLE_VERSE, style: "scripture" },
  song: {
    reference: "",
    style: "lyrics",
    credit: "Song title · Writer",
    segments: [
      { text: "Lift your voice and let the whole room", lineBreak: true },
      { text: "Hear it sing tonight", lineBreak: true },
    ],
  },
  text: {
    reference: "",
    style: "lyrics",
    segments: [{ text: "Welcome! Grab a seat, we start in five minutes." }],
  },
  name: { style: "name", reference: "Worship Leader", segments: [{ text: "Jane Doe" }] },
}

/** The theme's scale on the 1920-wide workspace. */
const wsScale = (theme: BroadcastTheme) => WS_WIDTH / theme.resolution.width

/** A guide line shown while a box snaps to it, in workspace px. */
interface Guide {
  axis: "x" | "y"
  at: number
}

const REGION_COLORS: Record<Region, string> = {
  reference: "#f59e0b",
  verse: "#f59e0b",
  camera: "#38bdf8",
  logo: "#a78bfa",
}

function makeRegion(region: Region): fabric.Rect {
  const rect = new fabric.Rect({
    left: 0,
    top: 0,
    originX: "left",
    originY: "top",
    width: 100,
    height: 100,
    fill: "rgba(0,0,0,0.001)",
    stroke: REGION_COLORS[region],
    strokeWidth: 0,
    strokeDashArray: [8, 5],
    strokeUniform: true,
    selectable: true,
    hasBorders: true,
    borderColor: REGION_COLORS[region],
    borderScaleFactor: 2,
    cornerColor: "#ffffff",
    cornerStrokeColor: REGION_COLORS[region],
    cornerStyle: "circle",
    cornerSize: 12,
    transparentCorners: false,
    lockRotation: true,
    lockScalingFlip: true,
    evented: true,
    objectCaching: false,
    hoverCursor: "move",
  })
  rect.setControlsVisibility({ mtr: false })
  return rect
}

/** The free-mode box an element owns on the draft theme, in %. */
function boxOf(theme: BroadcastTheme, region: Region): ElementBox | null {
  if (region === "camera") return theme.cameraPanel?.enabled ? theme.cameraPanel.box : null
  if (region === "logo") return null
  if (theme.layout.mode !== "free") return null
  return (region === "reference" ? theme.layout.referenceBox : theme.layout.verseBox) ?? null
}

const round2 = (v: number) => Math.round(v * 100) / 100

type Rect = { x: number; y: number; width: number; height: number }
const WHOLE: Rect = { x: 0, y: 0, width: WS_WIDTH, height: WS_HEIGHT }

/** What a region's % box is of, in workspace px: a Lower Thirds band for its words (see `boxesIn`), else the frame. */
function frameFor(theme: BroadcastTheme, region: Region): Rect {
  if ((region === "reference" || region === "verse") && freeBoxesInBand(theme)) return textAreaRect(theme, wsScale(theme))
  return WHOLE
}

/** A workspace px rect as % of `frame`. */
function pxToBox(r: Rect, frame: Rect): ElementBox {
  return {
    x: round2(((r.x - frame.x) / frame.width) * 100),
    y: round2(((r.y - frame.y) / frame.height) * 100),
    width: round2((r.width / frame.width) * 100),
    height: round2((r.height / frame.height) * 100),
  }
}

function boxToPx(box: ElementBox, frame: Rect): Rect {
  return {
    x: frame.x + (box.x / 100) * frame.width,
    y: frame.y + (box.y / 100) * frame.height,
    width: (box.width / 100) * frame.width,
    height: (box.height / 100) * frame.height,
  }
}

/**
 * Write an element's place (workspace px) back to the draft. Reference and
 * verse boxes are free-mode boxes: a theme still stacked is detached first,
 * its boxes seeded from where the text is now, so nothing jumps; on a Lower
 * Thirds theme they're kept in the band, so they follow it. Detaching says
 * so, with a way back.
 */
function writeBox(region: Region, rect: Rect, metrics: VerseLayoutMetrics | null): void {
  const store = useBroadcastStore.getState()
  const theme = store.draftTheme
  if (!theme) return
  if (region === "camera") {
    if (theme.cameraPanel) store.updateDraftNested("cameraPanel.box", pxToBox(rect, WHOLE))
    return
  }
  if (region === "logo") {
    writeLogo(theme, rect)
    return
  }
  const key: BoxKey = region === "reference" ? "referenceBox" : "verseBox"
  if (theme.layout.mode !== "free" || !theme.layout.referenceBox || !theme.layout.verseBox) {
    // Seeded from where the text is now; a sample with no reference (a
    // song) seeds from the theme's own layout instead.
    const seeded =
      (metrics ? seedFreeBoxesFromMetrics(metrics, { width: WS_WIDTH, height: WS_HEIGHT }) : null) ??
      seedFreeBoxesForTheme(theme)
    if (!seeded) return
    const framed: BroadcastTheme = { ...theme, layout: { ...theme.layout, mode: "free", ...seeded, boxesIn: "frame" } }
    const inBand = isLowerThird(theme) ? boxesToBand(framed) : null
    const layout = { ...framed.layout, ...(inBand ?? {}) }
    const placed = { ...theme, layout }
    store.updateDraft({ layout: { ...layout, [key]: pxToBox(rect, frameFor(placed, region)) } })
    announceDetach(isLowerThird(theme))
    return
  }
  store.updateDraftNested(`layout.${key}`, pxToBox(rect, frameFor(theme, region)))
}

/** Say that dragging placed the words freely, with one click back. */
function announceDetach(band: boolean): void {
  toast("Placed freely", {
    id: "free-positioning",
    description: band
      ? "The reference and words now sit where you put them in the band, and move with it. They no longer flow together."
      : "The reference and words now sit where you put them. They no longer flow together.",
    duration: 8000,
    action: {
      label: band ? "Back to the band" : "Back to the flow",
      onClick: () => {
        const store = useBroadcastStore.getState()
        if (store.draftTheme) store.updateDraftNested("layout.mode", "stacked")
      },
    },
  })
}

/**
 * A logo moved or resized on the canvas: it keeps to the corner nearest
 * where it was dropped, its size the height it was given, and its margins
 * how far it sits from each edge (theme px).
 */
function writeLogo(theme: BroadcastTheme, rect: { x: number; y: number; width: number; height: number }): void {
  const logo = theme.logo
  if (!logo) return
  const k = wsScale(theme)
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  const corner = `${cy < WS_HEIGHT / 2 ? "top" : "bottom"}-${cx < WS_WIDTH / 2 ? "left" : "right"}` as LogoCorner
  const px = (v: number) => Math.max(0, Math.round(v / k))
  useBroadcastStore.getState().updateDraftNested("logo", {
    ...logo,
    corner,
    size: round2(Math.min(100, Math.max(1, (rect.height / WS_HEIGHT) * 100))),
    margins: {
      top: px(rect.y),
      right: px(WS_WIDTH - rect.x - rect.width),
      bottom: px(WS_HEIGHT - rect.y - rect.height),
      left: px(rect.x),
    },
  })
}

/**
 * Snap a value's candidate edges (e.g. left, centre and right) to the
 * nearest target within `threshold`. Returns the shift to apply and the
 * target snapped to.
 */
function snapAxis(edges: number[], targets: number[], threshold: number): { shift: number; at: number } | null {
  let best: { shift: number; at: number } | null = null
  for (const edge of edges) {
    for (const target of targets) {
      const d = target - edge
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.shift))) best = { shift: d, at: target }
    }
  }
  return best
}

export function DesignCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<fabric.Canvas | null>(null)
  const latestThemeRef = useRef<BroadcastTheme | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const objectsRef = useRef<Regions>({ workspace: null, reference: null, verse: null, camera: null, logo: null })
  const draggingRef = useRef<Region | null>(null)
  const latestMetricsRef = useRef<VerseLayoutMetrics | null>(null)
  const guidesRef = useRef<Guide[]>([])
  const gridRef = useRef(false)

  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const editingThemeId = useBroadcastStore((s) => s.editingThemeId)
  const selectedElement = useBroadcastStore((s) => s.selectedElement)
  const [zoomLevel, setZoomLevel] = useState(0)
  const [grid, setGrid] = useState(false)
  const sample = useBroadcastStore((s) => s.designerSample)
  const [locked, setLocked] = useState<Region[]>(() => [...lockedRegions])

  const resyncLatestTheme = useCallback(() => {
    const latestTheme = latestThemeRef.current
    const canvas = fabricRef.current
    if (!latestTheme || !canvas) return
    syncThemeToCanvas(latestTheme, objectsRef, canvas, undefined, latestMetricsRef, draggingRef.current)
  }, [])

  const showSample = (next: Sample) => {
    useBroadcastStore.getState().setDesignerSample(next)
    // Songs and texts have no reference: nothing to select there.
    if ((next === "song" || next === "text") && useBroadcastStore.getState().selectedElement === "reference") {
      useBroadcastStore.getState().setSelectedElement(null)
    }
    resyncLatestTheme()
  }
  const toggleLock = (region: Region) => {
    if (lockedRegions.has(region)) lockedRegions.delete(region)
    else lockedRegions.add(region)
    setLocked([...lockedRegions])
    resyncLatestTheme()
  }

  // Auto-zoom: fit workspace into container
  const autoZoom = useCallback(() => {
    const canvas = fabricRef.current
    const container = containerRef.current
    const workspace = objectsRef.current.workspace
    if (!canvas || !container || !workspace) return

    const cw = container.offsetWidth
    const ch = container.offsetHeight
    canvas.setDimensions({ width: cw, height: ch })

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    const scale = fabric.util.findScaleToFit(workspace, { width: cw, height: ch }) * 0.85
    canvas.setZoom(scale)

    const wsCenter = workspace.getCenterPoint()
    const vpTransform = canvas.viewportTransform!
    vpTransform[4] = cw / 2 - wsCenter.x * vpTransform[0]
    vpTransform[5] = ch / 2 - wsCenter.y * vpTransform[3]
    canvas.setViewportTransform(vpTransform)
    canvas.requestRenderAll()
    resyncLatestTheme()

    setZoomLevel(Math.round(scale * 100))
  }, [resyncLatestTheme])

  // Initialize Fabric canvas + workspace
  useEffect(() => {
    if (!canvasElRef.current || !containerRef.current || !editingThemeId) return

    const canvas = new fabric.Canvas(canvasElRef.current, {
      backgroundColor: "#18181b",
      controlsAboveOverlay: true,
      // Boxes resize freely; Shift keeps their shape.
      uniformScaling: false,
      preserveObjectStacking: true,
    })

    const cw = containerRef.current.offsetWidth
    const ch = containerRef.current.offsetHeight
    canvas.setDimensions({ width: cw, height: ch })

    // The 1920x1080 "page". Never assign it as canvas.clipPath: Fabric shares
    // one cache canvas per object, so the clip pass would mask the whole
    // canvas with the theme bitmap's alpha (blanking transparent themes).
    const workspace = new fabric.Rect({
      left: 0,
      top: 0,
      originX: "left",
      originY: "top",
      width: WS_WIDTH,
      height: WS_HEIGHT,
      fill: "white",
      selectable: false,
      evented: false,
      hasControls: false,
      shadow: new fabric.Shadow({ color: "rgba(0,0,0,0.4)", blur: 20 }),
    })
    canvas.add(workspace)
    objectsRef.current.workspace = workspace

    // Camera first, so the words' boxes sit over it and win the click; the
    // logo, drawn over everything, on top.
    const regions: Region[] = ["camera", "verse", "reference", "logo"]
    for (const region of regions) {
      const rect = makeRegion(region)
      // A logo keeps its shape: corner handles only.
      if (region === "logo") rect.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false })
      canvas.add(rect)
      objectsRef.current[region] = rect
    }

    const regionForObject = (obj: fabric.Object | undefined): Region | null => {
      const o = objectsRef.current
      if (!obj) return null
      if (obj === o.reference) return "reference"
      if (obj === o.verse) return "verse"
      if (obj === o.camera) return "camera"
      if (obj === o.logo) return "logo"
      return null
    }

    const onSelect = (e: { selected?: fabric.Object[] }) => {
      const region = regionForObject(e.selected?.[0])
      if (region) useBroadcastStore.getState().setSelectedElement(region)
    }
    canvas.on("selection:created", onSelect)
    canvas.on("selection:updated", onSelect)
    canvas.on("selection:cleared", () => useBroadcastStore.getState().setSelectedElement(null))

    // Where an element's edges can snap: the frame's edges and centre lines,
    // the other elements' edges and centres, and the grid when it's on.
    const snapTargets = (moving: Region) => {
      const xs = [0, WS_WIDTH / 2, WS_WIDTH]
      const ys = [0, WS_HEIGHT / 2, WS_HEIGHT]
      const theme = useBroadcastStore.getState().draftTheme
      if (theme) {
        for (const other of REGIONS) {
          if (other === moving) continue
          const box = boxOf(theme, other)
          const obj = objectsRef.current[other]
          const r = box
            ? boxToPx(box, frameFor(theme, other))
            : obj && obj.visible
              ? { x: obj.left, y: obj.top, width: obj.width, height: obj.height }
              : null
          if (!r) continue
          xs.push(r.x, r.x + r.width / 2, r.x + r.width)
          ys.push(r.y, r.y + r.height / 2, r.y + r.height)
        }
      }
      if (gridRef.current) {
        for (let x = 0; x <= WS_WIDTH; x += GRID) xs.push(x)
        for (let y = 0; y <= WS_HEIGHT; y += GRID) ys.push(y)
      }
      return { xs, ys }
    }
    const threshold = () => SNAP_SCREEN_PX / canvas.getZoom()

    canvas.on("object:moving", (e) => {
      const region = regionForObject(e.target)
      const obj = e.target
      if (!region || !obj) return
      draggingRef.current = region
      const width = obj.width * obj.scaleX
      const height = obj.height * obj.scaleY
      let x = obj.left
      let y = obj.top
      const guides: Guide[] = []
      // Hold Alt to place freely, without snapping.
      if (!(e.e as MouseEvent).altKey) {
        const { xs, ys } = snapTargets(region)
        const sx = snapAxis([x, x + width / 2, x + width], xs, threshold())
        const sy = snapAxis([y, y + height / 2, y + height], ys, threshold())
        if (sx) {
          x += sx.shift
          guides.push({ axis: "x", at: sx.at })
        }
        if (sy) {
          y += sy.shift
          guides.push({ axis: "y", at: sy.at })
        }
      }
      x = clamp(x, 0, Math.max(0, WS_WIDTH - width))
      y = clamp(y, 0, Math.max(0, WS_HEIGHT - height))
      obj.set({ left: x, top: y })
      guidesRef.current = guides
      writeBox(region, { x, y, width, height }, latestMetricsRef.current)
    })

    canvas.on("object:scaling", (e) => {
      const region = regionForObject(e.target)
      const obj = e.target
      if (!region || !obj) return
      draggingRef.current = region
      if (region === "logo") {
        // Scaled evenly from the corner dragged, kept on the frame.
        const k = Math.max(obj.scaleX, obj.scaleY)
        const w = Math.min(obj.width * k, WS_WIDTH)
        const h = (w / obj.width) * obj.height
        const k2 = Math.min(w / obj.width, WS_HEIGHT / obj.height)
        const x = clamp(obj.left, 0, Math.max(0, WS_WIDTH - obj.width * k2))
        const y = clamp(obj.top, 0, Math.max(0, WS_HEIGHT - h))
        obj.set({ left: x, top: y, scaleX: k2, scaleY: k2 })
        guidesRef.current = []
        writeBox(region, { x, y, width: obj.width * k2, height: obj.height * k2 }, latestMetricsRef.current)
        return
      }
      const corner = e.transform?.corner ?? ""
      let left = obj.left
      let top = obj.top
      let right = left + obj.width * obj.scaleX
      let bottom = top + obj.height * obj.scaleY
      const guides: Guide[] = []
      if (!(e.e as MouseEvent).altKey) {
        const { xs, ys } = snapTargets(region)
        const t = threshold()
        // Only the edges being dragged snap.
        if (corner.includes("l")) {
          const s = snapAxis([left], xs, t)
          if (s) {
            left += s.shift
            guides.push({ axis: "x", at: s.at })
          }
        } else if (corner.includes("r")) {
          const s = snapAxis([right], xs, t)
          if (s) {
            right += s.shift
            guides.push({ axis: "x", at: s.at })
          }
        }
        if (corner.includes("t")) {
          const s = snapAxis([top], ys, t)
          if (s) {
            top += s.shift
            guides.push({ axis: "y", at: s.at })
          }
        } else if (corner.includes("b")) {
          const s = snapAxis([bottom], ys, t)
          if (s) {
            bottom += s.shift
            guides.push({ axis: "y", at: s.at })
          }
        }
      }
      left = clamp(left, 0, WS_WIDTH - MIN_BOX_PX)
      top = clamp(top, 0, WS_HEIGHT - MIN_BOX_PX)
      right = clamp(right, left + MIN_BOX_PX, WS_WIDTH)
      bottom = clamp(bottom, top + MIN_BOX_PX, WS_HEIGHT)
      // Scale, not size, while Fabric is resizing (it measures from the
      // size); the rect goes back to scale 1 at its new size once let go.
      obj.set({ left, top, scaleX: (right - left) / obj.width, scaleY: (bottom - top) / obj.height })
      guidesRef.current = guides
      writeBox(region, { x: left, y: top, width: right - left, height: bottom - top }, latestMetricsRef.current)
    })

    const endDrag = () => {
      guidesRef.current = []
      if (!draggingRef.current) {
        canvas.requestRenderAll()
        return
      }
      draggingRef.current = null
      resyncLatestTheme()
    }
    canvas.on("object:modified", endDrag)
    canvas.on("mouse:up", endDrag)

    // Scroll pans; Ctrl/⌘ + scroll (or a pinch) zooms about the pointer.
    canvas.on("mouse:wheel", (opt) => {
      const e = opt.e as WheelEvent
      e.preventDefault()
      e.stopPropagation()
      if (e.ctrlKey || e.metaKey) {
        const zoom = clamp(canvas.getZoom() * 0.999 ** e.deltaY, 0.1, 4)
        canvas.zoomToPoint(new fabric.Point(e.offsetX, e.offsetY), zoom)
        setZoomLevel(Math.round(zoom * 100))
      } else {
        const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX
        const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY
        canvas.relativePan(new fabric.Point(-dx, -dy))
      }
      canvas.requestRenderAll()
    })

    // The grid and snap guides, over the page and under the handles.
    canvas.on("after:render", ({ ctx }) => {
      const vpt = canvas.viewportTransform
      const zoom = canvas.getZoom()
      ctx.save()
      ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])
      if (gridRef.current) {
        ctx.beginPath()
        for (let x = GRID; x < WS_WIDTH; x += GRID) {
          ctx.moveTo(x, 0)
          ctx.lineTo(x, WS_HEIGHT)
        }
        for (let y = GRID; y < WS_HEIGHT; y += GRID) {
          ctx.moveTo(0, y)
          ctx.lineTo(WS_WIDTH, y)
        }
        ctx.lineWidth = 1 / zoom
        ctx.strokeStyle = "rgba(255,255,255,0.12)"
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(WS_WIDTH / 2, 0)
        ctx.lineTo(WS_WIDTH / 2, WS_HEIGHT)
        ctx.moveTo(0, WS_HEIGHT / 2)
        ctx.lineTo(WS_WIDTH, WS_HEIGHT / 2)
        ctx.strokeStyle = "rgba(255,255,255,0.28)"
        ctx.stroke()
      }
      if (guidesRef.current.length > 0) {
        ctx.beginPath()
        for (const g of guidesRef.current) {
          if (g.axis === "x") {
            ctx.moveTo(g.at, 0)
            ctx.lineTo(g.at, WS_HEIGHT)
          } else {
            ctx.moveTo(0, g.at)
            ctx.lineTo(WS_WIDTH, g.at)
          }
        }
        ctx.lineWidth = 1.5 / zoom
        ctx.strokeStyle = "#ec4899"
        ctx.stroke()
      }
      ctx.restore()
    })

    fabricRef.current = canvas

    requestAnimationFrame(() => autoZoom())
    const observer = new ResizeObserver(() => autoZoom())
    observer.observe(containerRef.current)

    // Re-render once theme webfonts load — text measured against fallback
    // fonts before that would leave the bitmap and hit rects off.
    const unsubscribeFonts = onThemeFontsLoaded(() => resyncLatestTheme())

    return () => {
      unsubscribeFonts()
      observer.disconnect()
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
      void canvas.dispose()
      fabricRef.current = null
      objectsRef.current = { workspace: null, reference: null, verse: null, camera: null, logo: null }
    }
  }, [editingThemeId, autoZoom, resyncLatestTheme])

  // Sync draft theme to the existing Fabric objects (throttled to 1 per frame)
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !draftTheme) return
    latestThemeRef.current = draftTheme

    if (rafIdRef.current) return // already scheduled
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null
      const latest = latestThemeRef.current
      const latestCanvas = fabricRef.current
      if (!latest || !latestCanvas) return
      syncThemeToCanvas(
        latest,
        objectsRef,
        latestCanvas,
        () => resyncLatestTheme(),
        latestMetricsRef,
        draggingRef.current
      )
    })
  }, [draftTheme, resyncLatestTheme])

  // The selection follows the store, so picking an element from the
  // properties panel selects its box here too.
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const target = selectedElement ? objectsRef.current[selectedElement] : null
    const active = canvas.getActiveObject()
    if (target && target.visible && active !== target) canvas.setActiveObject(target)
    else if (!target && active) canvas.discardActiveObject()
    syncSelection(objectsRef.current, selectedElement)
    canvas.requestRenderAll()
  }, [selectedElement])

  useEffect(() => {
    gridRef.current = grid
    fabricRef.current?.requestRenderAll()
  }, [grid])

  // Arrow keys nudge the selected box 1px (Shift: 10px).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const region = useBroadcastStore.getState().selectedElement
      if (!region || !e.key.startsWith("Arrow")) return
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      if (target?.closest("[role=listbox],[role=menu],[role=slider],[role=tablist]")) return
      const theme = useBroadcastStore.getState().draftTheme
      const obj = objectsRef.current[region]
      if (!theme || !obj || !obj.visible || lockedRegions.has(region)) return
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0
      const own = boxOf(theme, region)
      const r = own ? boxToPx(own, frameFor(theme, region)) : { x: obj.left, y: obj.top, width: obj.width, height: obj.height }
      const x = clamp(r.x + dx, 0, Math.max(0, WS_WIDTH - r.width))
      const y = clamp(r.y + dy, 0, Math.max(0, WS_HEIGHT - r.height))
      writeBox(region, { x, y, width: r.width, height: r.height }, latestMetricsRef.current)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // A live camera background or panel moves: redraw a few times a second
  // (the editor needs to show it, not play it smoothly; outputs do that).
  const cameraUrl = draftTheme?.background.type === "camera" ? draftTheme.background.camera?.url : undefined
  const panelUrl = draftTheme?.cameraPanel?.enabled ? draftTheme.cameraPanel.camera?.url : undefined
  // Likewise a band video, a few times a second.
  const bandVideo = draftTheme?.textBox.enabled && draftTheme.textBox.video?.videoId ? draftTheme.textBox.video : null
  const bandBoxRef = useRef<HTMLDivElement | null>(null)
  const backgroundVideo =
    draftTheme?.background.type === "video" && draftTheme.background.video?.videoId ? draftTheme.background.video : null
  useEffect(() => {
    if (!bandVideo && !backgroundVideo) return
    const id = setInterval(resyncLatestTheme, 200)
    return () => clearInterval(id)
  }, [bandVideo, backgroundVideo, resyncLatestTheme])

  useEffect(() => {
    const urls = [cameraUrl, panelUrl].filter((u, i, all): u is string => !!u && all.indexOf(u) === i)
    if (urls.length === 0) return
    let last = 0
    const stops = urls.map((url) =>
      watchCamera(url, () => {
        const now = performance.now()
        if (now - last < 200) return
        last = now
        resyncLatestTheme()
      })
    )
    return () => stops.forEach((stop) => stop())
  }, [cameraUrl, panelUrl, resyncLatestTheme])

  const zoomBy = useCallback((factor: number) => {
    const canvas = fabricRef.current
    if (!canvas) return
    const zoom = clamp(canvas.getZoom() * factor, 0.1, 4)
    canvas.zoomToPoint(new fabric.Point(canvas.getWidth() / 2, canvas.getHeight() / 2), zoom)
    canvas.requestRenderAll()
    setZoomLevel(Math.round(zoom * 100))
  }, [])

  const elementLabel =
    selectedElement === "verse" ? "words" : selectedElement === "reference" ? "reference" : selectedElement === "camera" ? "camera" : selectedElement === "logo" ? "logo" : "none"
  const freeMode = draftTheme?.layout.mode === "free"

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 px-3" style={{ background: "#18181b" }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setGrid((g) => !g)}
          aria-pressed={grid}
          title="Show a grid and snap boxes to it"
          className={cn("h-7 gap-1.5 px-2 text-xs text-muted-foreground", grid && "bg-accent text-foreground")}
        >
          <Grid3X3Icon className="size-3.5" />
          Grid
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="icon-xs" onClick={() => zoomBy(0.9)} className="text-muted-foreground" title="Zoom out">
          <MinusIcon className="size-3" />
        </Button>
        <span className="min-w-12 text-center text-[0.625rem] font-medium tabular-nums text-muted-foreground">
          {zoomLevel}%
        </span>
        <Button variant="ghost" size="icon-xs" onClick={() => zoomBy(1.1)} className="text-muted-foreground" title="Zoom in">
          <PlusIcon className="size-3" />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={autoZoom} className="text-muted-foreground" title="Fit to screen">
          <MaximizeIcon className="size-3.5" />
        </Button>
      </div>

      <LayersBar
        theme={draftTheme}
        selected={selectedElement}
        locked={locked}
        onToggleLock={toggleLock}
        sample={sample}
        onSample={showSample}
      />

      {/* The band's video, playing out of sight for the canvas to copy. Not
          beside the <canvas>: Fabric moves that into a wrapper of its own,
          and React inserting next to it then fails and unmounts the app. */}
      {backgroundVideo && (
        <div aria-hidden className="pointer-events-none fixed left-0 top-0 h-[90px] w-[160px] overflow-hidden opacity-0">
          <ThemeVideo video={backgroundVideo} elementRef={designerBackground} style={{ position: "absolute", inset: 0 }} />
        </div>
      )}
      {bandVideo && (
        <div aria-hidden className="pointer-events-none fixed left-0 top-0 h-[90px] w-[160px] overflow-hidden opacity-0">
          <BandVideo video={bandVideo} boxRef={bandBoxRef} elementRef={designerBand} />
        </div>
      )}

      {/* Canvas container */}
      <div ref={containerRef} className="relative min-h-0 flex-1">
        <canvas ref={canvasElRef} />
        {!draftTheme && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "#18181b" }}>
            <p className="text-xs text-muted-foreground">Select a theme to begin editing</p>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex h-8 shrink-0 items-center gap-2 overflow-hidden border-t border-border/40 px-3 text-[0.5625rem] whitespace-nowrap text-muted-foreground/70" style={{ background: "#18181b" }}>
        <span>Output: {WS_WIDTH} × {WS_HEIGHT}px</span>
        <span>·</span>
        <span>
          {freeMode || selectedElement === "camera"
            ? "Drag to move, handles to resize, arrows to nudge · Alt: no snapping"
            : "Drag or resize the reference or words to place them freely"}
        </span>
        <span>·</span>
        <span>Scroll to pan, Ctrl+scroll to zoom</span>
        <span>·</span>
        <span>
          {selectedElement ? (
            <>Editing: <span className="font-medium text-primary">{elementLabel}</span></>
          ) : (
            "Click a box to select it"
          )}
        </span>
      </div>
    </div>
  )
}

const LAYER_LABELS: Record<Region, string> = {
  reference: "Reference",
  verse: "Words",
  camera: "Camera",
  logo: "Logo",
}

/**
 * Every element of the theme in a row: click one to select it (and open
 * its settings), lock it so it can't be knocked out of place. An element
 * the theme doesn't have (no camera, no logo, a song's missing reference)
 * shows dimmed; clicking it still opens its settings to add it.
 */
function LayersBar({
  theme,
  selected,
  locked,
  onToggleLock,
  sample,
  onSample,
}: {
  theme: BroadcastTheme | null
  selected: SelectedElement
  locked: Region[]
  onToggleLock: (region: Region) => void
  sample: Sample
  onSample: (sample: Sample) => void
}) {
  if (!theme) return null
  const present: Record<Region, boolean> = {
    reference: sample === "scripture" || sample === "name",
    verse: true,
    camera: !!theme.cameraPanel?.enabled,
    logo: !!theme.logo?.url,
  }
  return (
    <div
      className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-border/40 px-3"
      style={{ background: "#18181b" }}
    >
      <span className="mr-1 text-[0.625rem] font-medium tracking-wider text-muted-foreground/70 uppercase">Layers</span>
      {REGIONS.map((region) => {
        const isLocked = locked.includes(region)
        return (
          <div
            key={region}
            className={cn(
              "flex h-7 shrink-0 items-center rounded-md border text-xs",
              selected === region ? "border-primary/60 bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground",
              !present[region] && "opacity-50"
            )}
          >
            <button
              type="button"
              className="flex h-full items-center gap-1.5 pr-1 pl-2 hover:text-foreground"
              onClick={() => useBroadcastStore.getState().setSelectedElement(region)}
              title={present[region] ? `Select the ${LAYER_LABELS[region].toLowerCase()}` : `No ${LAYER_LABELS[region].toLowerCase()} yet: open its settings`}
            >
              <span className="size-2 rounded-full" style={{ background: REGION_COLORS[region] }} aria-hidden />
              {LAYER_LABELS[region]}
            </button>
            <button
              type="button"
              className={cn("flex h-full items-center pr-2 pl-0.5 hover:text-foreground", isLocked && "text-foreground")}
              onClick={() => onToggleLock(region)}
              aria-pressed={isLocked}
              aria-label={`${isLocked ? "Unlock" : "Lock"} the ${LAYER_LABELS[region].toLowerCase()}`}
              title={isLocked ? "Locked: click to let it move" : "Lock it in place"}
            >
              {isLocked ? <LockIcon className="size-3" /> : <LockOpenIcon className="size-3 opacity-40" />}
            </button>
          </div>
        )
      })}
      <div className="flex-1" />
      <span className="mr-1 shrink-0 text-[0.625rem] font-medium tracking-wider text-muted-foreground/70 uppercase">Show as</span>
      <div role="radiogroup" aria-label="Show the theme with" className="flex shrink-0 rounded-md bg-muted/40 p-0.5">
        {(
          [
            ["scripture", "Bible"],
            ["song", "Song"],
            ["text", "Text"],
            ["name", "Name"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={sample === value}
            onClick={() => onSample(value)}
            className={cn(
              "h-6 rounded-[5px] px-2 text-xs text-muted-foreground",
              sample === value ? "bg-card text-foreground shadow-sm" : "hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function syncSelection(objects: Regions, selected: SelectedElement) {
  for (const region of REGIONS) {
    objects[region]?.set({ strokeWidth: selected === region ? 0 : 1.5 })
  }
}

/** Sync BroadcastTheme properties to existing Fabric objects */
function syncThemeToCanvas(
  theme: BroadcastTheme,
  objectsRef: React.MutableRefObject<Regions>,
  canvas: fabric.Canvas,
  onImageReady?: () => void,
  metricsRef?: React.MutableRefObject<VerseLayoutMetrics | null>,
  dragging?: Region | null
) {
  const { workspace: ws, reference, verse, camera, logo } = objectsRef.current
  if (!ws || !reference || !verse || !camera || !logo) return

  // Covers the frame background and every surface fill.
  preloadThemeImages(theme, onImageReady)

  const { bitmap, metrics } = renderThemeBitmap(theme)
  ws.set({ fill: new fabric.Pattern({ source: bitmap, repeat: "no-repeat" }) })

  if (metrics && metricsRef) metricsRef.current = metrics

  // In free mode the regions ARE the layout boxes, so map them 1:1 for an
  // exact drag round-trip. Stacked, they wrap the drawn text; resizing
  // one detaches it into free mode.
  const freeMode = theme.layout.mode === "free" && metrics?.referenceBoxRect && metrics.verseBoxRect
  const rects: Record<"reference" | "verse", { x: number; y: number; width: number; height: number } | null> = {
    reference: freeMode ? metrics!.referenceBoxRect! : (metrics?.referenceRect ?? null),
    verse: freeMode ? metrics!.verseBoxRect! : (metrics?.verseRect ?? null),
  }
  for (const region of ["reference", "verse"] as const) {
    const obj = region === "reference" ? reference : verse
    // Content with no reference (a song, a text) has no reference to place.
    const rect = region === "reference" && !metrics?.referenceRect ? null : rects[region]
    obj.set({ visible: !!rect })
    if (!rect || dragging === region) continue
    const placed = clampRect(rect)
    obj.set({ left: placed.x, top: placed.y, width: Math.max(MIN_BOX_PX, placed.width), height: Math.max(MIN_BOX_PX, placed.height), scaleX: 1, scaleY: 1 })
  }

  const panel = cameraPanelRect(theme, null)
  camera.set({ visible: !!panel })
  if (panel && dragging !== "camera") {
    const placed = clampRect(panel.rect)
    camera.set({ left: placed.x, top: placed.y, width: placed.width, height: placed.height, scaleX: 1, scaleY: 1 })
  }
  if (!panel && canvas.getActiveObject() === camera) canvas.discardActiveObject()

  // Where the renderer puts the logo (it shows once its picture has loaded).
  const logoAt = logoRect(theme, null, wsScale(theme), themeImageCache())
  logo.set({ visible: !!logoAt })
  if (logoAt && dragging !== "logo") {
    const placed = clampRect(logoAt)
    logo.set({ left: placed.x, top: placed.y, width: Math.max(8, placed.width), height: Math.max(8, placed.height), scaleX: 1, scaleY: 1 })
  }
  for (const [region, obj] of [["reference", reference], ["verse", verse], ["camera", camera], ["logo", logo]] as const) {
    if (!obj.visible && canvas.getActiveObject() === obj) canvas.discardActiveObject()
    const locked = lockedRegions.has(region)
    obj.set({
      lockMovementX: locked,
      lockMovementY: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      hasControls: !locked,
      hoverCursor: locked ? "default" : "move",
    })
  }

  syncSelection(objectsRef.current, useBroadcastStore.getState().selectedElement)
  for (const obj of [reference, verse, camera, logo]) obj.setCoords()
  canvas.requestRenderAll()
}

function clampRect(rect: { x: number; y: number; width: number; height: number }) {
  const width = clamp(rect.width, 0, WS_WIDTH)
  const height = clamp(rect.height, 0, WS_HEIGHT)
  return {
    x: clamp(rect.x, 0, Math.max(0, WS_WIDTH - width)),
    y: clamp(rect.y, 0, Math.max(0, WS_HEIGHT - height)),
    width,
    height,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** Editor-only checkerboard so transparent backgrounds read as such (output stays truly transparent). */
function drawTransparencyCheckerboard(ctx: CanvasRenderingContext2D): void {
  const size = 40
  ctx.save()
  // Paint only behind already-rendered content: the theme render clears
  // transparent regions, so fill them from underneath.
  ctx.globalCompositeOperation = "destination-over"
  ctx.fillStyle = "#2c2c30"
  for (let y = 0; y < WS_HEIGHT; y += size) {
    for (let x = (y / size) % 2 === 0 ? 0 : size; x < WS_WIDTH; x += size * 2) {
      ctx.fillRect(x, y, size, size)
    }
  }
  ctx.fillStyle = "#232326"
  ctx.fillRect(0, 0, WS_WIDTH, WS_HEIGHT)
  ctx.restore()
}

/** "Camera" in a panel that has no picture yet, so its box reads as a camera in the editor. */
function drawPanelPlaceholder(ctx: CanvasRenderingContext2D, theme: BroadcastTheme, scale: number): void {
  const placed = cameraPanelRect(theme, null, scale)
  const url = theme.cameraPanel?.camera?.url
  if (!placed || (url && latestCameraFrame(url))) return
  const { rect } = placed
  ctx.save()
  ctx.fillStyle = "rgba(255,255,255,0.45)"
  ctx.font = `600 ${Math.round(Math.min(rect.height * 0.12, 44))}px "Geist Variable", sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(url ? "Camera — connecting…" : "Camera", rect.x + rect.width / 2, rect.y + rect.height / 2)
  if (!url) {
    ctx.font = `400 ${Math.round(Math.min(rect.height * 0.06, 22))}px "Geist Variable", sans-serif`
    ctx.fillText("Choose one in the Camera tab", rect.x + rect.width / 2, rect.y + rect.height / 2 + Math.min(rect.height * 0.12, 44))
  }
  ctx.restore()
}

function renderThemeBitmap(
  theme: BroadcastTheme,
): { bitmap: HTMLCanvasElement; metrics: ReturnType<typeof renderVerse> } {
  const offscreen = document.createElement("canvas")
  offscreen.width = WS_WIDTH
  offscreen.height = WS_HEIGHT
  const ctx = offscreen.getContext("2d")
  if (!ctx) return { bitmap: offscreen, metrics: null }

  // The workspace is always 1920 wide: draw any theme resolution to fit it.
  const scale = WS_WIDTH / theme.resolution.width
  const metrics = renderVerse(ctx, theme, SAMPLES[useBroadcastStore.getState().designerSample], {
    scale,
    imageCache: themeImageCache(),
    cameraImage: theme.background.type === "camera" ? latestCameraFrame(theme.background.camera?.url) : null,
    panelImage: latestCameraFrame(theme.cameraPanel?.camera?.url),
    bandVideo: designerBand.current,
    backgroundVideo: designerBackground.current,
  })
  drawPanelPlaceholder(ctx, theme, scale)
  if (theme.background.type === "transparent") {
    drawTransparencyCheckerboard(ctx)
  }
  return { bitmap: offscreen, metrics }
}

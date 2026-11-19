import type { CornerRadii, ShadowStyle } from "@/types/broadcast"

/** A corner rounding: one radius for all four corners, or each its own. */
export type Radius = number | CornerRadii

export function corners(r: Radius): CornerRadii {
  return typeof r === "number" ? { tl: r, tr: r, br: r, bl: r } : r
}

export function sameCorners(r: CornerRadii): boolean {
  return r.tl === r.tr && r.tr === r.br && r.br === r.bl
}

/** A surface's (or panel's) rounding: its own corners, or its one radius. */
export function radiusOf(thing: { borderRadius: number; radii?: CornerRadii | null }): Radius {
  return thing.radii ?? thing.borderRadius
}

export function scaleRadius(r: Radius, k: number): Radius {
  const c = corners(r)
  return typeof r === "number" ? r * k : { tl: c.tl * k, tr: c.tr * k, br: c.br * k, bl: c.bl * k }
}

/** Each corner less `d` (a border inside the edge follows the curve), never below 0. */
export function shrinkRadius(r: Radius, d: number): CornerRadii {
  const c = corners(r)
  return { tl: Math.max(0, c.tl - d), tr: Math.max(0, c.tr - d), br: Math.max(0, c.br - d), bl: Math.max(0, c.bl - d) }
}

/** CSS `border-radius` for `r`, divided by `ratio` (canvas px per CSS px). */
export function cssRadius(r: Radius, ratio = 1): string {
  const c = corners(r)
  return `${c.tl / ratio}px ${c.tr / ratio}px ${c.br / ratio}px ${c.bl / ratio}px`
}

/** The shadow plates and the camera card had before it could be styled. */
export const DEFAULT_SHADOW: ShadowStyle = { color: "#0000008c", x: 0, y: 12, blur: 40, spread: 0 }

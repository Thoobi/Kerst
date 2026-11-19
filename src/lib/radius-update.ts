import { sameCorners, type Radius } from "@/lib/corners"

/**
 * Store a rounding at `prefix` (a surface or the camera panel): one radius
 * stays a plain `borderRadius`, corners that differ go in `radii`.
 */
export function writeRadius(update: (path: string, value: unknown) => void, prefix: string, r: Radius): void {
  if (typeof r === "number" || sameCorners(r)) {
    update(`${prefix}.borderRadius`, typeof r === "number" ? r : r.tl)
    update(`${prefix}.radii`, null)
  } else {
    update(`${prefix}.radii`, r)
  }
}

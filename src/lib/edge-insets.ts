import type { EdgeInsets, SurfaceFill } from "@/types/broadcast"

/** The same value on every side. */
export function uniformInsets(value: number): EdgeInsets {
  return { top: value, right: value, bottom: value, left: value }
}

/** Whether every side is the same. */
export function isUniform(insets: EdgeInsets): boolean {
  return insets.top === insets.right && insets.right === insets.bottom && insets.bottom === insets.left
}

/** How far a surface insets its content on each side: its own sides, or its one padding all round. */
export function surfaceInsets(surface: Pick<SurfaceFill, "padding" | "paddings"> | null | undefined): EdgeInsets {
  if (!surface) return uniformInsets(0)
  return surface.paddings ?? uniformInsets(surface.padding)
}

export function scaleInsets(insets: EdgeInsets, k: number): EdgeInsets {
  return { top: insets.top * k, right: insets.right * k, bottom: insets.bottom * k, left: insets.left * k }
}

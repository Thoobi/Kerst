import type { BroadcastTheme, EdgeInsets } from "@/types/broadcast"

/**
 * Whether a theme is a lower third: words in a band over a picture that is
 * not its own (transparent for keying over a camera elsewhere, or a live
 * camera), rather than a full screen of its own. Such a band can be hidden
 * and revealed on air without going off air.
 */
export function isLowerThird(theme: Pick<BroadcastTheme, "background"> | null | undefined): boolean {
  const type = theme?.background.type
  return type === "transparent" || type === "camera"
}

/**
 * A Lower Thirds band's margins from the frame's edges, in theme px: its
 * own, or worked out from the width and lift it was given before margins
 * existed, so nothing moves until they're changed.
 */
export function bandMargins(theme: Pick<BroadcastTheme, "layout" | "resolution">): EdgeInsets {
  const { layout, resolution } = theme
  if (layout.bandMargins) return layout.bandMargins
  const side = Math.round(((100 - layout.textAreaWidth) / 200) * resolution.width)
  const lift = Math.round(layout.bandInset ?? 0)
  const top = layout.anchor.startsWith("top")
  return { left: side, right: side, top: top ? lift : 0, bottom: top ? 0 : lift }
}

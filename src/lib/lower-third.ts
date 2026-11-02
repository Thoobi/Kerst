import type { BroadcastTheme } from "@/types/broadcast"

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

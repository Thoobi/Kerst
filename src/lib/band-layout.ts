/**
 * Put the band video box over `rect` (canvas pixels, shown at `pixelRatio`
 * canvas pixels per CSS pixel), or hide it when `rect` is null.
 *
 * Hidden by opacity, not `display: none`: WebKit won't autoplay (and pauses)
 * video that isn't rendered, so the loop keeps running while the band is
 * away and is ready the moment it comes back.
 */
export function placeBand(
  box: HTMLDivElement | null,
  rect: { x: number; y: number; width: number; height: number } | null,
  radius: number,
  pixelRatio: number
): void {
  if (!box) return
  if (!rect) {
    box.style.opacity = "0"
    return
  }
  box.style.opacity = "1"
  box.style.left = `${rect.x / pixelRatio}px`
  box.style.top = `${rect.y / pixelRatio}px`
  box.style.width = `${rect.width / pixelRatio}px`
  box.style.height = `${rect.height / pixelRatio}px`
  box.style.borderRadius = `${radius / pixelRatio}px`
  // The copy on screen should be playing; nudge it if autoplay was refused.
  for (const video of box.querySelectorAll("video")) {
    if (video.style.opacity !== "0" && video.paused) void video.play().catch(() => {})
  }
}

/** Whether a band video element can show a frame yet. */
export function bandReady(element: HTMLVideoElement | null): boolean {
  return !!element && element.readyState >= 2 && element.videoWidth > 0
}

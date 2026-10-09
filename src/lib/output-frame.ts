/**
 * Sizing for drawing a theme at a target's real pixel size instead of
 * drawing at the theme's resolution and letting the browser rescale the
 * finished picture, which softens text and images alike.
 */

export interface FrameSize {
  width: number
  height: number
}

/**
 * The largest frame with the theme's aspect ratio that fits in `box`, in
 * whole pixels. The rest of the box is left for black bars.
 */
export function fitFrame(theme: FrameSize, box: FrameSize): FrameSize {
  const scale = Math.min(box.width / theme.width, box.height / theme.height)
  return {
    width: Math.max(1, Math.round(theme.width * scale)),
    height: Math.max(1, Math.round(theme.height * scale)),
  }
}

/** The `scale` to pass `renderVerse` so the theme fills `frame`. */
export function renderScale(theme: FrameSize, frame: FrameSize): number {
  return frame.width / theme.width
}

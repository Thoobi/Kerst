import type { CSSProperties, RefObject } from "react"
import { LoopingVideo } from "@/components/ui/looping-video"
import { surfaceVideoUrl, useMediaBase } from "@/lib/media-base"
import type { SurfaceVideo } from "@/types/broadcast"

/**
 * A theme's looping background video, behind the canvas (which leaves the
 * background clear for it). Each window builds the address from its own
 * media server, which changes every run.
 */
export function ThemeVideo({
  video,
  className,
  style,
  elementRef,
}: {
  video: SurfaceVideo
  className?: string
  style?: CSSProperties
  /** The copy on screen, for canvases that copy its frames (NDI, the editor). */
  elementRef?: RefObject<HTMLVideoElement | null>
}) {
  const mediaBase = useMediaBase()
  if (!mediaBase) return null
  return (
    <LoopingVideo
      url={surfaceVideoUrl(mediaBase, video)}
      poster={video.poster}
      playing
      className={className}
      style={style}
      elementRef={elementRef}
    />
  )
}

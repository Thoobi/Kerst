import type { RefObject } from "react"
import { LoopingVideo } from "@/components/ui/looping-video"
import { surfaceVideoUrl, useMediaBase } from "@/lib/media-base"
import type { SurfaceVideo } from "@/types/broadcast"

/**
 * A Lower Thirds band's looping video, behind the canvas, which cuts a hole
 * for it where the band is. The canvas owner moves it with `placeBand` in
 * the same step it draws, so the video and the band never fall out of line.
 */
export function BandVideo({
  video,
  boxRef,
  elementRef,
  onReady,
}: {
  video: SurfaceVideo
  boxRef: RefObject<HTMLDivElement | null>
  elementRef: RefObject<HTMLVideoElement | null>
  /** The video can show frames: the canvas can stop drawing its poster. */
  onReady?: () => void
}) {
  const mediaBase = useMediaBase()
  return (
    <div
      ref={boxRef}
      onLoadedDataCapture={onReady}
      // Rendered from the start (hidden by opacity) so the video may autoplay;
      // `placeBand` sizes it to the band.
      style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", opacity: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      {mediaBase && (
        <LoopingVideo
          url={surfaceVideoUrl(mediaBase, video)}
          poster={video.poster}
          playing
          elementRef={elementRef}
          style={{ position: "absolute", inset: 0 }}
        />
      )}
    </div>
  )
}

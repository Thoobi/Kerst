import { useEffect, useRef, type CSSProperties, type RefObject } from "react"
import { silentLoopUrl } from "@/lib/media-base"

interface LoopingVideoProps {
  url: string
  poster?: string
  playing: boolean
  className?: string
  style?: CSSProperties
  /** The video on screen, e.g. so NDI copies its frames. */
  elementRef?: RefObject<HTMLVideoElement | null>
}

/** A playing loop whose picture hasn't moved for this long has stalled: restart it. */
const STALL_MS = 1500

/**
 * A silent, endlessly looping video, e.g. a motion background behind
 * lyrics. It runs on its own rather than following a shared clock: windows
 * a moment apart are invisible, but corrective seeks were visible hitches.
 *
 * It loads the clip's silent copy (see `silentLoopUrl`) and loops it with
 * the browser's own `loop`. WebKitGTK froze muted clips that still had a
 * sound track, which once made its `loop` look broken and led to swapping
 * two copies at the end; that swap itself froze heavier clips (720p60) on
 * the copy taking over. Without sound, one copy loops cleanly. Should the
 * picture still stop while it ought to play, it's restarted.
 */
export function LoopingVideo({ url, poster, playing, className, style, elementRef }: LoopingVideoProps) {
  const ref = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    if (elementRef) elementRef.current = video
    if (!playing) {
      video.pause()
      return
    }
    void video.play().catch(() => {})
    let last = -1
    let still = 0
    const watchdog = setInterval(() => {
      if (video.paused && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
      if (video.currentTime !== last) {
        last = video.currentTime
        still = 0
        return
      }
      still += 500
      if (still >= STALL_MS) {
        still = 0
        video.currentTime = 0
        void video.play().catch(() => {})
      }
    }, 500)
    return () => {
      clearInterval(watchdog)
      video.pause()
    }
  }, [url, playing, elementRef])

  return (
    <div className={className} style={{ ...style, overflow: "hidden" }}>
      <video
        ref={ref}
        // The media server is another origin; without CORS, copying frames to
        // a canvas for NDI would taint it. Before `src`: React sets attributes
        // in order, and a load that starts before this is a no-CORS load.
        crossOrigin="anonymous"
        src={silentLoopUrl(url)}
        poster={poster}
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
    </div>
  )
}

import { useEffect, useRef, type CSSProperties, type RefObject } from "react"

/**
 * How long before the end the standby copy starts playing. Once its first
 * frame is on screen the two swap, so the loop is cut about this much short
 * of the very end.
 */
const SWAP_LEAD_S = 0.25

interface LoopingVideoProps {
  url: string
  poster?: string
  playing: boolean
  className?: string
  style?: CSSProperties
  /** Always the copy currently on screen, e.g. so NDI copies its frames. */
  elementRef?: RefObject<HTMLVideoElement | null>
}

/**
 * A silent, endlessly looping video, e.g. a motion background behind
 * lyrics. It runs on its own rather than following a shared clock: windows
 * a moment apart are invisible, but corrective seeks were visible hitches.
 *
 * Looping uses two copies. WebKitGTK can't loop one copy cleanly: its own
 * `loop` freezes, restarting from the end stalls ~0.6 s, and a jump back
 * just before the end gets swallowed by frames already queued. Here the
 * standby copy waits paused at the top, starts just before the end, and
 * the two swap once its first frame is showing, so nothing on screen ever
 * seeks.
 */
export function LoopingVideo({ url, poster, playing, className, style, elementRef }: LoopingVideoProps) {
  const aRef = useRef<HTMLVideoElement | null>(null)
  const bRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const a = aRef.current
    const b = bRef.current
    if (!a || !b) return
    let active = a
    let standby = b
    let stopped = false
    let swapping = false
    let handle = 0

    const show = (el: HTMLVideoElement, visible: boolean) => {
      el.style.opacity = visible ? "1" : "0"
    }
    show(active, true)
    show(standby, false)
    if (elementRef) elementRef.current = active
    standby.currentTime = 0

    const watch = () => {
      handle = active.requestVideoFrameCallback(onActiveFrame)
    }
    const onActiveFrame = (_now: number, frame: VideoFrameCallbackMetadata) => {
      if (stopped) return
      const nearEnd =
        Number.isFinite(active.duration) && frame.mediaTime >= active.duration - SWAP_LEAD_S
      if (nearEnd && !swapping && standby.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        swapping = true
        // Swap only once the standby copy is actually showing a frame, so
        // there is never a black gap between the two.
        standby.requestVideoFrameCallback(() => {
          if (stopped) return
          const finished = active
          active = standby
          standby = finished
          show(active, true)
          show(standby, false)
          if (elementRef) elementRef.current = active
          // Out of sight, the slow rewind doesn't matter.
          standby.pause()
          standby.currentTime = 0
          swapping = false
          watch()
        })
        void standby.play().catch(() => {
          swapping = false
        })
        return
      }
      watch()
    }

    if (playing) {
      void active.play().catch(() => {})
      watch()
    } else {
      active.pause()
    }
    return () => {
      stopped = true
      active.cancelVideoFrameCallback(handle)
      active.pause()
      standby.pause()
    }
  }, [url, playing, elementRef])

  const layer: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }
  const copy = (ref: RefObject<HTMLVideoElement | null>) => (
    <video
      ref={ref}
      src={url}
      poster={poster}
      muted
      playsInline
      preload="auto"
      // The media server is another origin; without CORS, copying frames to
      // a canvas for NDI would taint it.
      crossOrigin="anonymous"
      disablePictureInPicture
      style={layer}
    />
  )

  return (
    <div className={className} style={{ ...style, overflow: "hidden" }}>
      {copy(aRef)}
      {copy(bRef)}
    </div>
  )
}

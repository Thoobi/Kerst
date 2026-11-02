import { useEffect, useRef } from "react"
import { watchCamera, type CameraState } from "@/lib/mjpeg-reader"
import { cn } from "@/lib/utils"

export type { CameraState }

/**
 * A network camera's live picture, shown behind a theme canvas the way a
 * background video is. Frames come from the window's one shared connection
 * to the camera (see `watchCamera`), drawn into a canvas at the camera's own
 * size and fitted by CSS. Through a dropout the last frame stays up while
 * it reconnects.
 */
export function CameraLayer({
  url,
  fit = "cover",
  className,
  style,
  onStateChange,
}: {
  url: string
  fit?: "cover" | "contain"
  className?: string
  style?: React.CSSProperties
  onStateChange?: (state: CameraState) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const onStateRef = useRef(onStateChange)
  useEffect(() => {
    onStateRef.current = onStateChange
  }, [onStateChange])

  useEffect(() => {
    if (!url) return
    return watchCamera(
      url,
      (frame) => {
        const canvas = canvasRef.current
        if (!canvas) return
        if (canvas.width !== frame.width || canvas.height !== frame.height) {
          canvas.width = frame.width
          canvas.height = frame.height
        }
        canvas.getContext("2d")?.drawImage(frame, 0, 0)
      },
      (state) => onStateRef.current?.(state)
    )
  }, [url])

  if (!url) return null
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("pointer-events-none select-none bg-black", className)}
      style={{ objectFit: fit, ...style }}
    />
  )
}

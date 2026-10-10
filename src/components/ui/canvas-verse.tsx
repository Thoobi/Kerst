import { useRef, useEffect, useState, useCallback, memo } from "react"
import { backgroundRegion, onThemeFontsLoaded, renderVerse, themeForContent } from "@/lib/verse-renderer"
import { preloadFrameImages, themeImageCache } from "@/lib/theme-image-cache"
import { LoopingVideo } from "@/components/ui/looping-video"
import type { BroadcastTheme, VerseRenderData } from "@/types"
import { cn } from "@/lib/utils"

interface CanvasVerseProps {
  theme: BroadcastTheme
  verse: VerseRenderData | null
  className?: string
}

export const CanvasVerse = memo(function CanvasVerse({
  theme,
  verse,
  className,
}: CanvasVerseProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // Measure container width with ResizeObserver
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (w > 0) setContainerWidth(w)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || containerWidth === 0) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const aspectRatio = theme.resolution.width / theme.resolution.height
    const displayW = containerWidth
    const displayH = displayW / aspectRatio

    canvas.width = displayW * dpr
    canvas.height = displayH * dpr
    canvas.style.width = `${displayW}px`
    canvas.style.height = `${displayH}px`

    ctx.scale(dpr, dpr)
    const scale = displayW / theme.resolution.width
    renderVerse(ctx, theme, verse, {
      scale,
      imageCache: themeImageCache(),
      backgroundBehind: true,
    })
  }, [theme, verse, containerWidth])

  // Preload every image the frame uses (theme art, or a full-frame slide) so
  // the renderer finds them in the cache.
  useEffect(() => {
    preloadFrameImages(theme, verse, draw)
  }, [theme, verse, draw])

  // Redraw whenever theme, verse, or container size changes.
  useEffect(() => {
    draw()
  }, [draw])

  // Redraw once theme webfonts load so early frames drawn against fallback
  // font metrics are corrected.
  useEffect(() => onThemeFontsLoaded(() => draw()), [draw])

  // A motion background plays in a <video> behind the canvas, over the
  // theme's background region, which the canvas leaves transparent.
  const backgroundBox =
    verse?.background && containerWidth > 0
      ? backgroundRegion(themeForContent(theme, verse), containerWidth / theme.resolution.width)
      : null

  return (
    <div ref={containerRef} className={cn("relative w-full overflow-hidden rounded-md", className)}>
      {verse?.background && backgroundBox && (
        <LoopingVideo
          url={verse.background.url}
          poster={verse.background.poster}
          playing={verse.background.playing}
          className="absolute"
          style={{
            left: backgroundBox.x,
            top: backgroundBox.y,
            width: backgroundBox.width,
            height: backgroundBox.height,
          }}
        />
      )}
      <canvas ref={canvasRef} className="relative w-full rounded-md" />
    </div>
  )
})

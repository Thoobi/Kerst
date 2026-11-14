import { useRef, useEffect, useState, useCallback, memo } from "react"
import { activeCamera, backgroundRegion, computeVerseLayoutMetrics, onThemeFontsLoaded, renderVerse, themeForContent } from "@/lib/verse-renderer"
import { preloadFrameImages, themeImageCache } from "@/lib/theme-image-cache"
import { LoopingVideo } from "@/components/ui/looping-video"
import { CameraLayer } from "@/components/ui/camera-layer"
import { BandVideo } from "@/components/ui/band-video"
import { bandReady, placeBand } from "@/lib/band-layout"
import { useTimerTick } from "@/hooks/use-timer-tick"
import type { BroadcastTheme, VerseRenderData } from "@/types"
import { cn } from "@/lib/utils"
import {
  shouldTransition,
  transitionSpecFor,
  transitionProgress,
  TransitionRenderer,
  type ActiveTransition,
  type Frame,
} from "@/lib/frame-transition"

interface CanvasVerseProps {
  theme: BroadcastTheme
  verse: VerseRenderData | null
  className?: string
  /** Play the theme's transition when the words change, as the outputs do (the Live view). */
  animate?: boolean
}

export const CanvasVerse = memo(function CanvasVerse({
  theme,
  verse,
  className,
  animate = false,
}: CanvasVerseProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  // A running timer redraws as its reading changes.
  const timerTick = useTimerTick(verse?.timer)
  // The frame last drawn, and the transition away from it while it runs.
  const shownRef = useRef<Frame | null>(null)
  const transitionRef = useRef<ActiveTransition | null>(null)
  const transitions = useRef<TransitionRenderer | null>(null)
  const frameRequest = useRef<number | null>(null)
  const bandRef = useRef<HTMLVideoElement | null>(null)
  const bandBoxRef = useRef<HTMLDivElement | null>(null)
  // Redraw once the band's video can show itself.
  const [bandTick, setBandTick] = useState(0)

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
    const bandVideo = theme.textBox.enabled && theme.textBox.video?.videoId ? theme.textBox.video : null
    const bandOptions = (behind: boolean) => {
      const shown = behind && !!bandVideo && !!verse && !verse.image && !verse.video && bandReady(bandRef.current)
      if (shown) {
        const metrics = computeVerseLayoutMetrics(ctx, theme, verse, { scale })
        placeBand(bandBoxRef.current, metrics.textBoxRect, metrics.scaledTheme.textBox.borderRadius, 1)
      } else {
        placeBand(bandBoxRef.current, null, 0, 1)
      }
      return { bandVideo: bandRef.current, bandBehind: shown }
    }
    const options = { scale, imageCache: themeImageCache(), backgroundBehind: true }
    const frame: Frame = { theme, verse }
    const shown = shownRef.current
    if (animate && shown && shown.verse !== verse && shouldTransition(shown, frame)) {
      transitionRef.current = { from: shown, start: performance.now(), spec: transitionSpecFor(shown, frame) }
    }
    shownRef.current = frame

    const step = () => {
      frameRequest.current = null
      const transition = transitionRef.current
      const progress = transition ? transitionProgress(transition, performance.now()) : 1
      if (transition && progress < 1) {
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.restore()
        transitions.current ??= new TransitionRenderer()
        transitions.current.draw(ctx, transition.from, frame, progress, transition.spec, {
          ...options,
          ...bandOptions(false),
        })
        frameRequest.current = requestAnimationFrame(step)
        return
      }
      transitionRef.current = null
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.restore()
      renderVerse(ctx, theme, verse, { ...options, ...bandOptions(true) })
    }
    if (frameRequest.current !== null) cancelAnimationFrame(frameRequest.current)
    step()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the tick only marks when to redraw
  }, [theme, verse, containerWidth, timerTick, animate, bandTick])

  useEffect(
    () => () => {
      if (frameRequest.current !== null) cancelAnimationFrame(frameRequest.current)
    },
    []
  )

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
  const camera = activeCamera(theme, verse)
  const backgroundBox =
    (verse?.background || camera) && containerWidth > 0
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
      {camera && backgroundBox && (
        <CameraLayer
          url={camera.url}
          fit={camera.fit ?? "cover"}
          className="absolute"
          style={{
            left: backgroundBox.x,
            top: backgroundBox.y,
            width: backgroundBox.width,
            height: backgroundBox.height,
          }}
        />
      )}
      {theme.textBox.enabled && theme.textBox.video?.videoId && (
        <BandVideo
          video={theme.textBox.video}
          boxRef={bandBoxRef}
          elementRef={bandRef}
          onReady={() => setBandTick((n) => n + 1)}
        />
      )}
      <canvas ref={canvasRef} className="relative w-full rounded-md" />
    </div>
  )
})

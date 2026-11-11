import { createRoot } from "react-dom/client"
import { useRef, useEffect, useCallback, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { activeCamera, backgroundRegion, computeVerseLayoutMetrics, logoRect, onThemeFontsLoaded, renderVerse, themeForContent } from "@/lib/verse-renderer"
import { preloadFrameImages, themeImageCache } from "@/lib/theme-image-cache"
import { isAnimatedGif } from "@/lib/gif-frames"
import { LogoCanvas } from "@/components/broadcast/logo-canvas"
import { normalizeTheme } from "@/lib/theme-migrations"
import { fitFrame, renderScale } from "@/lib/output-frame"
import { SyncedVideo } from "@/components/ui/synced-video"
import { LoopingVideo } from "@/components/ui/looping-video"
import { CameraLayer } from "@/components/ui/camera-layer"
import { BandVideo } from "@/components/ui/band-video"
import { bandReady, placeBand } from "@/lib/band-layout"
import { latestCameraFrame } from "@/lib/mjpeg-reader"
import {
  shouldTransition,
  transitionProgress,
  TransitionRenderer,
  type ActiveTransition,
} from "@/lib/frame-transition"
import { forwardConsoleToLog } from "@/lib/console-to-log"
import { timerText } from "@/lib/timer"
import "./broadcast-fonts.css"
import type { BroadcastTheme, CameraFeed, SurfaceVideo, ThemeLogo, TimerClock, VerseRenderData, VideoPlayback } from "@/types/broadcast"
import type { CaptureConfigEventPayload } from "@/types"

interface BackgroundBox {
  left: number
  top: number
  width: number
  height: number
}

const sameBox = (a: BackgroundBox | null, b: BackgroundBox | null) =>
  a === b ||
  (a !== null && b !== null &&
    a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height)

// The output windows are where the audience's picture comes from; their
// warnings and errors belong in the log as much as the main window's.
forwardConsoleToLog()

/** Read output ID from URL query param (?output=main or ?output=alt). Defaults to "main". */
const OUTPUT_ID = new URLSearchParams(window.location.search).get("output") ?? "main"

interface BroadcastPayload {
  theme: BroadcastTheme
  verse: VerseRenderData | null
}

function BroadcastCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latestData = useRef<BroadcastPayload | null>(null)
  const ndiConfigRef = useRef<CaptureConfigEventPayload>({
    active: false,
    fps: 24,
    width: 1920,
    height: 1080,
  })
  const ndiCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastPushRef = useRef(0)
  const pushingRef = useRef(false)
  const pushNdiBurstRef = useRef<(() => void) | null>(null)
  // A playing video is shown by a <video> over the canvas (the browser
  // paints it far more cheaply than redrawing the canvas every frame); NDI
  // copies frames from that same element.
  const [video, setVideo] = useState<VideoPlayback | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  // A motion background plays in a <video> behind the canvas, over the
  // theme's background region, which the canvas leaves transparent. NDI
  // copies its frames.
  const [background, setBackground] = useState<VideoPlayback | null>(null)
  const backgroundRef = useRef<HTMLVideoElement | null>(null)
  const [backgroundBox, setBackgroundBox] = useState<BackgroundBox | null>(null)
  // A live camera in place of the theme's background, shown behind the canvas.
  const [camera, setCamera] = useState<CameraFeed | null>(null)
  // The same, for NDI frames drawn outside React.
  const cameraRef = useRef<CameraFeed | null>(null)
  // The theme's logo sits over the canvas and any video in its own small
  // canvas, so a GIF animates without redrawing the frame; NDI draws it
  // into its own frames.
  const [logo, setLogo] = useState<ThemeLogo | null>(null)
  const [logoBox, setLogoBox] = useState<BackgroundBox | null>(null)
  // A running timer draws itself: each window reads the clock.
  const [timer, setTimer] = useState<TimerClock | null>(null)
  // The theme's transition from the last content to the new, while it runs.
  const transitionRef = useRef<ActiveTransition | null>(null)
  // The timer animating it. A ref, not state: a transition ending in the
  // same moment the next one starts would batch "stopped" and "started"
  // into no change, and the new one would freeze part-way on screen.
  const transitionTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const screenTransitions = useRef(new TransitionRenderer())
  const ndiTransitions = useRef(new TransitionRenderer())
  // A Lower Thirds band's looping video: a <video> behind the canvas, which
  // leaves the band clear for it. During a transition, and for NDI, its
  // frames are drawn into the band instead, so the band moves as one.
  const [band, setBand] = useState<SurfaceVideo | null>(null)
  const bandRef = useRef<HTMLVideoElement | null>(null)
  const bandBoxRef = useRef<HTMLDivElement | null>(null)

  const logDebug = useCallback((message: string, meta?: unknown) => {
    if (!import.meta.env.DEV) return
    if (meta === undefined) {
      console.debug(`[broadcast-output] ${message}`)
      return
    }
    console.debug(`[broadcast-output] ${message}`, meta)
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const data = latestData.current
    if (!data) {
      // Black screen when no data
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      return
    }

    // Draw at the screen's real pixels. Drawing at the theme's resolution and
    // letting CSS rescale the finished picture blurs text and images.
    const { theme, verse } = data
    const dpr = window.devicePixelRatio || 1
    const frame = fitFrame(theme.resolution, {
      width: window.innerWidth * dpr,
      height: window.innerHeight * dpr,
    })
    // Resizing reallocates the canvas; with a background video this runs
    // every frame, so only do it when the size changed, and clear otherwise.
    if (canvas.width !== frame.width || canvas.height !== frame.height) {
      canvas.width = frame.width
      canvas.height = frame.height
      canvas.style.width = `${frame.width / dpr}px`
      canvas.style.height = `${frame.height / dpr}px`
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    const scale = renderScale(theme.resolution, frame)
    const transition = transitionRef.current
    const progress = transition ? transitionProgress(transition, performance.now()) : 1
    const transitioningNow = transition !== null && progress < 1
    // The band's video shows through the canvas when it's playing and still.
    const bandVideo = theme.textBox.enabled && theme.textBox.video?.videoId ? theme.textBox.video : null
    const bandBehind =
      !!bandVideo && !transitioningNow && !!verse && !verse.image && !verse.video && bandReady(bandRef.current)
    if (bandBehind) {
      const metrics = computeVerseLayoutMetrics(ctx, theme, verse, { scale })
      placeBand(bandBoxRef.current, metrics.textBoxRect, metrics.scaledTheme.textBox.borderRadius, dpr)
    } else {
      placeBand(bandBoxRef.current, null, 0, dpr)
    }
    const renderOptions = {
      scale,
      imageCache: themeImageCache(),
      video: videoRef.current,
      backgroundBehind: true,
      logoAbove: true,
      bandVideo: bandRef.current,
      bandBehind,
    }
    let drew: boolean
    if (transition && progress < 1) {
      screenTransitions.current.draw(ctx, transition.from, data, progress, transition.spec, renderOptions)
      drew = true
    } else {
      transitionRef.current = null
      drew = renderVerse(ctx, theme, verse, renderOptions) !== null
    }
    const region = backgroundRegion(themeForContent(theme, verse), scale)
    const box = {
      left: region.x / dpr,
      top: region.y / dpr,
      width: region.width / dpr,
      height: region.height / dpr,
    }
    setBackgroundBox((prev) => (prev && sameBox(prev, box) ? prev : box))
    const logoRegion = logoRect(theme, verse, scale, themeImageCache())
    const logoAt = logoRegion && {
      left: logoRegion.x / dpr,
      top: logoRegion.y / dpr,
      width: logoRegion.width / dpr,
      height: logoRegion.height / dpr,
    }
    setLogoBox((prev) => (sameBox(prev, logoAt) ? prev : logoAt))
    if (!drew) {
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      logDebug("renderVerse returned null; drew fallback frame")
    }
  }, [logDebug])

  // Redraw once a frame's images (theme art, or a full-frame slide) land. The
  // burst matters: without it NDI receivers keep the flat fallback frame
  // until the 2s keepalive fires.
  const preloadFrameAssets = useCallback((payload: BroadcastPayload) => {
    preloadFrameImages(payload.theme, payload.verse, () => {
      logDebug("Frame images loaded")
      draw()
      pushNdiBurstRef.current?.()
    })
  }, [draw, logDebug])

  const pushNdiFrame = useCallback(async () => {
    if (!ndiConfigRef.current.active) return
    if (pushingRef.current) return // back-pressure: skip if already pushing
    pushingRef.current = true

    try {
      const sourceWidth = ndiConfigRef.current.width
      const sourceHeight = ndiConfigRef.current.height

      // Render NDI frames at NDI's own resolution rather than rescaling the
      // window's canvas: a 4K sender gets real 4K text, not a stretched 1080p.
      const ndiCanvas = ndiCanvasRef.current ?? document.createElement("canvas")
      ndiCanvasRef.current = ndiCanvas
      ndiCanvas.width = sourceWidth
      ndiCanvas.height = sourceHeight
      const sourceCtx = ndiCanvas.getContext("2d", { willReadFrequently: true })
      if (!sourceCtx) return
      const data = latestData.current
      const ndiOptions = data && {
        scale: renderScale(data.theme.resolution, { width: sourceWidth, height: sourceHeight }),
        imageCache: themeImageCache(),
        video: videoRef.current,
        backgroundVideo: backgroundRef.current,
        cameraImage: latestCameraFrame(cameraRef.current?.url),
        bandVideo: bandRef.current,
      }
      const transition = transitionRef.current
      const progress = transition ? transitionProgress(transition, performance.now()) : 1
      let rendered: unknown = null
      if (data && ndiOptions && transition && progress < 1) {
        sourceCtx.clearRect(0, 0, sourceWidth, sourceHeight)
        ndiTransitions.current.draw(sourceCtx, transition.from, data, progress, transition.spec, ndiOptions)
        rendered = true
      } else if (data && ndiOptions) {
        rendered = renderVerse(sourceCtx, data.theme, data.verse, ndiOptions)
      }
      if (!rendered) {
        sourceCtx.fillStyle = "#000"
        sourceCtx.fillRect(0, 0, sourceWidth, sourceHeight)
      }

      // Raw bytes, not JSON: a playing video sends a full frame many times a second.
      const imageData = sourceCtx.getImageData(0, 0, sourceWidth, sourceHeight)
      await invoke("push_output_frame", new Uint8Array(imageData.data.buffer), {
        headers: {
          "x-output-id": OUTPUT_ID,
          "x-frame-width": String(sourceWidth),
          "x-frame-height": String(sourceHeight),
        },
      })
      lastPushRef.current = Date.now()
    } catch (error) {
      console.warn("[broadcast-output] push_output_frame failed", error)
    } finally {
      pushingRef.current = false
    }
  }, [])

  /** Push a burst of 3 frames after content changes (NDI receivers need a few frames to sync) */
  const pushNdiBurst = useCallback(() => {
    void pushNdiFrame()
    setTimeout(() => void pushNdiFrame(), 150)
    setTimeout(() => void pushNdiFrame(), 300)
  }, [pushNdiFrame])

  // Image loads finish after the burst that followed their theme update, and
  // the preload callback is defined above this — go through a ref so it can
  // re-burst without a definition cycle.
  useEffect(() => {
    pushNdiBurstRef.current = pushNdiBurst
  }, [pushNdiBurst])

  // Animate a transition: redraw and send NDI and the stream every frame
  // until it ends. A timer, not requestAnimationFrame: a window used only
  // for NDI may be hidden, and hidden windows get no animation frames.
  const animateTransition = useCallback(() => {
    if (transitionTimer.current !== null) return
    transitionTimer.current = setInterval(() => {
      draw()
      void pushNdiFrame()
      if (!transitionRef.current && transitionTimer.current !== null) {
        clearInterval(transitionTimer.current)
        transitionTimer.current = null
      }
    }, 1000 / 60)
  }, [draw, pushNdiFrame])

  useEffect(
    () => () => {
      if (transitionTimer.current !== null) clearInterval(transitionTimer.current)
      transitionTimer.current = null
    },
    []
  )

  useEffect(() => {
    // Black until the first frame arrives; the page background is black too.
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
    }

    const currentWindow = getCurrentWebviewWindow()
    logDebug("Listener registration started", { label: currentWindow.label })
    const unlisten = currentWindow.listen<BroadcastPayload>("broadcast:verse-update", (event) => {
      const previous = latestData.current
      latestData.current = {
        ...event.payload,
        theme: normalizeTheme(event.payload.theme),
      }
      // New words: go over to them the theme's way. A theme edit or a
      // video's play/pause keeps the words and just redraws.
      if (shouldTransition(previous, latestData.current)) {
        transitionRef.current = {
          from: previous!,
          start: performance.now(),
          spec: latestData.current.theme.transition,
        }
        animateTransition()
      }
      setVideo(event.payload.verse?.video ?? null)
      setBackground(event.payload.verse?.background ?? null)
      {
        const next = activeCamera(latestData.current.theme, event.payload.verse)
        cameraRef.current = next
        setCamera((prev) => (prev?.url === next?.url && prev?.fit === next?.fit ? prev : next))
        const textBox = latestData.current.theme.textBox
        const nextBand = textBox.enabled && textBox.video?.videoId ? textBox.video : null
        setBand((prev) =>
          prev?.videoId === nextBand?.videoId && prev?.file === nextBand?.file && prev?.poster === nextBand?.poster
            ? prev
            : nextBand
        )
      }
      setLogo(event.payload.theme.logo ?? null)
      setTimer(event.payload.verse?.timer ?? null)
      preloadFrameAssets(event.payload)
      logDebug("Received broadcast:verse-update", {
        hasVerse: Boolean(event.payload.verse),
        themeId: event.payload.theme.id,
      })
      draw()
      pushNdiBurst()
    })

    const unlistenNdiConfig = currentWindow.listen<CaptureConfigEventPayload>("broadcast:capture-config", (event) => {
      ndiConfigRef.current = event.payload
      logDebug("Received broadcast:capture-config", event.payload)
      // Push burst when NDI becomes active
      if (event.payload.active) pushNdiBurst()
    })

    // Request current capture status on mount (fixes race condition
    // where NDI or a stream is started before this window opens)
    void invoke<{ active: boolean; width: number; height: number; fps: number } | null>("get_capture_status", { outputId: OUTPUT_ID })
      .then((status) => {
        if (status && status.active) {
          ndiConfigRef.current = {
            active: true,
            fps: status.fps,
            width: status.width,
            height: status.height,
          }
          logDebug("Fetched capture status on mount", status)
        }
      })
      .catch(() => {
        // Command may not exist yet
      })

    // Redraw whenever a theme webfont finishes loading (the renderer requests
    // them on demand) so frames drawn against fallback metrics are replaced.
    const unsubscribeFonts = onThemeFontsLoaded(() => {
      draw()
      pushNdiBurst()
    })

    void currentWindow.emitTo("main", "broadcast:output-ready", { outputId: OUTPUT_ID }).then(() => {
      logDebug("Sent broadcast:output-ready")
    }).catch(() => {
      console.warn("[broadcast-output] failed to send output-ready event")
    })

    return () => {
      unsubscribeFonts()
      unlisten.then((fn) => fn())
      unlistenNdiConfig.then((fn) => fn())
    }
  }, [draw, logDebug, preloadFrameAssets, pushNdiFrame, pushNdiBurst, animateTransition])

  // Going fullscreen, moving to another monitor or a DPI change all resize
  // the window: redraw at the new pixel size.
  useEffect(() => {
    window.addEventListener("resize", draw)
    return () => window.removeEventListener("resize", draw)
  }, [draw])

  // While a video plays (or a background moves behind the text, or a GIF
  // logo is on screen), NDI needs every frame, not just one per change.
  // Pushes that can't keep up are skipped by pushNdiFrame's back-pressure.
  const moving =
    (video?.playing ?? false) ||
    (background?.playing ?? false) ||
    camera !== null ||
    band !== null ||
    (logo !== null && logoBox !== null && isAnimatedGif(logo.url))
  useEffect(() => {
    if (!moving) return
    const fps = ndiConfigRef.current.fps || 30
    const timer = setInterval(() => void pushNdiFrame(), 1000 / fps)
    return () => clearInterval(timer)
  }, [moving, pushNdiFrame])

  // Redraw a running timer each time its reading changes, and send NDI and
  // the stream that frame.
  useEffect(() => {
    if (!timer?.running) return
    let last = timerText(timer, Date.now())
    const id = setInterval(() => {
      const text = timerText(timer, Date.now())
      if (text === last) return
      last = text
      draw()
      void pushNdiFrame()
    }, 100)
    return () => clearInterval(id)
  }, [timer, draw, pushNdiFrame])

  // Slow keepalive: push one frame every 2s if idle (prevents NDI receivers from dropping the source)
  useEffect(() => {
    const timer = setInterval(() => {
      if (!ndiConfigRef.current.active) return
      const elapsed = Date.now() - lastPushRef.current
      if (elapsed > 2000) void pushNdiFrame()
    }, 2000)
    return () => clearInterval(timer)
  }, [pushNdiFrame])

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ position: "relative" }}>
        {background && backgroundBox && (
          <LoopingVideo
            url={background.url}
            poster={background.poster}
            playing={background.playing}
            elementRef={backgroundRef}
            style={{ position: "absolute", ...backgroundBox }}
          />
        )}
        {camera && backgroundBox && (
          <CameraLayer
            url={camera.url}
            fit={camera.fit ?? "cover"}
            style={{ position: "absolute", ...backgroundBox }}
          />
        )}
        {band && <BandVideo video={band} boxRef={bandBoxRef} elementRef={bandRef} onReady={draw} />}
        <canvas ref={canvasRef} style={{ display: "block", position: "relative" }} />
        {video && (
          <SyncedVideo
            playback={video}
            // Sound comes from the operator's window only, never doubled up.
            muted
            elementRef={videoRef}
            // A paused or seeked video changes picture without a new frame
            // from the main window: send it on.
            onFrame={() => void pushNdiFrame()}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              background: "#000",
            }}
          />
        )}
        {logo && logoBox && <LogoCanvas logo={logo} box={logoBox} />}
      </div>
    </div>
  )
}

const root = document.getElementById("broadcast-root")!
createRoot(root).render(<BroadcastCanvas />)

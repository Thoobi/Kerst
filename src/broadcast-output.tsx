import { createRoot } from "react-dom/client"
import { useRef, useEffect, useCallback, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { backgroundRegion, onThemeFontsLoaded, renderVerse } from "@/lib/verse-renderer"
import { preloadFrameImages, themeImageCache } from "@/lib/theme-image-cache"
import { normalizeTheme } from "@/lib/theme-migrations"
import { fitFrame, renderScale } from "@/lib/output-frame"
import { SyncedVideo } from "@/components/ui/synced-video"
import { LoopingVideo } from "@/components/ui/looping-video"
import { forwardConsoleToLog } from "@/lib/console-to-log"
import "./broadcast-fonts.css"
import type { BroadcastTheme, VerseRenderData, VideoPlayback } from "@/types/broadcast"
import type { NdiConfigEventPayload } from "@/types"

interface BackgroundBox {
  left: number
  top: number
  width: number
  height: number
}

const sameBox = (a: BackgroundBox, b: BackgroundBox) =>
  a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height

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
  const ndiConfigRef = useRef<NdiConfigEventPayload>({
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
    const result = renderVerse(ctx, theme, verse, {
      scale,
      imageCache: themeImageCache(),
      video: videoRef.current,
      backgroundBehind: true,
    })
    const region = backgroundRegion(theme, scale)
    const box = {
      left: region.x / dpr,
      top: region.y / dpr,
      width: region.width / dpr,
      height: region.height / dpr,
    }
    setBackgroundBox((prev) => (prev && sameBox(prev, box) ? prev : box))
    if (!result) {
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
      const rendered =
        data &&
        renderVerse(sourceCtx, data.theme, data.verse, {
          scale: renderScale(data.theme.resolution, { width: sourceWidth, height: sourceHeight }),
          imageCache: themeImageCache(),
          video: videoRef.current,
          backgroundVideo: backgroundRef.current,
        })
      if (!rendered) {
        sourceCtx.fillStyle = "#000"
        sourceCtx.fillRect(0, 0, sourceWidth, sourceHeight)
      }

      // Raw bytes, not JSON: a playing video sends a full frame many times a second.
      const imageData = sourceCtx.getImageData(0, 0, sourceWidth, sourceHeight)
      await invoke("push_ndi_frame", new Uint8Array(imageData.data.buffer), {
        headers: {
          "x-output-id": OUTPUT_ID,
          "x-frame-width": String(sourceWidth),
          "x-frame-height": String(sourceHeight),
        },
      })
      lastPushRef.current = Date.now()
    } catch (error) {
      console.warn("[broadcast-output] push_ndi_frame failed", error)
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
      latestData.current = {
        ...event.payload,
        theme: normalizeTheme(event.payload.theme),
      }
      setVideo(event.payload.verse?.video ?? null)
      setBackground(event.payload.verse?.background ?? null)
      preloadFrameAssets(event.payload)
      logDebug("Received broadcast:verse-update", {
        hasVerse: Boolean(event.payload.verse),
        themeId: event.payload.theme.id,
      })
      draw()
      pushNdiBurst()
    })

    const unlistenNdiConfig = currentWindow.listen<NdiConfigEventPayload>("broadcast:ndi-config", (event) => {
      ndiConfigRef.current = event.payload
      logDebug("Received broadcast:ndi-config", event.payload)
      // Push burst when NDI becomes active
      if (event.payload.active) pushNdiBurst()
    })

    // Request current NDI status on mount (fixes race condition
    // where NDI is started before this window opens)
    void invoke<{ active: boolean; width: number; height: number; fps: number } | null>("get_ndi_status", { outputId: OUTPUT_ID })
      .then((status) => {
        if (status && status.active) {
          ndiConfigRef.current = {
            active: true,
            fps: status.fps,
            width: status.width,
            height: status.height,
          }
          logDebug("Fetched NDI status on mount", status)
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
  }, [draw, logDebug, preloadFrameAssets, pushNdiFrame, pushNdiBurst])

  // Going fullscreen, moving to another monitor or a DPI change all resize
  // the window: redraw at the new pixel size.
  useEffect(() => {
    window.addEventListener("resize", draw)
    return () => window.removeEventListener("resize", draw)
  }, [draw])

  // While a video plays (or a background moves behind the text), NDI needs
  // every frame, not just one per change. Pushes that can't keep up are
  // skipped by pushNdiFrame's back-pressure.
  const videoPlaying = (video?.playing ?? false) || (background?.playing ?? false)
  useEffect(() => {
    if (!videoPlaying) return
    const fps = ndiConfigRef.current.fps || 30
    const timer = setInterval(() => void pushNdiFrame(), 1000 / fps)
    return () => clearInterval(timer)
  }, [videoPlaying, pushNdiFrame])

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
      </div>
    </div>
  )
}

const root = document.getElementById("broadcast-root")!
createRoot(root).render(<BroadcastCanvas />)

import { useEffect, useRef } from "react"
import { gifFrameAt, isAnimatedGif } from "@/lib/gif-frames"
import { drawImageSmooth } from "@/lib/image-scaling"
import { loadThemeImage } from "@/lib/theme-image-cache"
import type { ThemeLogo } from "@/types/broadcast"

/** Where the logo sits over the output, in CSS pixels. */
interface LogoBox {
  left: number
  top: number
  width: number
  height: number
}

/**
 * The logo, drawn by us at its exact pixel size. An <img> left to the
 * browser's scaling came out jagged in the AppImage's bundled WebKit (a
 * 1400px logo shown 120px tall), so it is shrunk in steps like the canvas
 * draws it. A GIF redraws only this small canvas, never the whole frame.
 */
export function LogoCanvas({ logo, box }: { logo: ThemeLogo; box: LogoBox }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const dpr = window.devicePixelRatio || 1
  const width = Math.max(1, Math.round(box.width * dpr))
  const height = Math.max(1, Math.round(box.height * dpr))

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    let cancelled = false
    let raf = 0
    let shown: CanvasImageSource | null = null

    const draw = (img: HTMLImageElement) => {
      const frame = gifFrameAt(logo.url, Date.now())
      const source = frame ?? img
      if (source === shown) return
      shown = source
      const sw = frame ? frame.width : img.naturalWidth
      const sh = frame ? frame.height : img.naturalHeight
      ctx.clearRect(0, 0, width, height)
      ctx.imageSmoothingQuality = "high"
      if (sw > 0 && sh > 0) drawImageSmooth(ctx, source, 0, 0, sw, sh, 0, 0, width, height)
      else ctx.drawImage(source, 0, 0, width, height)
    }

    void loadThemeImage(logo.url).then((img) => {
      if (cancelled || !img) return
      draw(img)
      if (!isAnimatedGif(logo.url)) return
      const tick = () => {
        draw(img)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [logo.url, width, height])

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      style={{ position: "absolute", ...box, opacity: logo.opacity / 100, pointerEvents: "none" }}
    />
  )
}

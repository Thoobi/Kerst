import { useEffect, useState } from "react"
import { libraryApi } from "@/lib/library-api"
import type { SurfaceVideo } from "@/types/broadcast"

let base: string | null = null
let pending: Promise<string | null> | null = null

/** This run's local media server address, asked once per window. */
export function loadMediaBase(): Promise<string | null> {
  if (base) return Promise.resolve(base)
  pending ??= libraryApi
    .mediaBaseUrl()
    .then((url) => (base = url))
    .catch((error) => {
      console.warn("[media-base] unavailable", error)
      pending = null
      return null
    })
  return pending
}

/** The media server address, once known (null until then). */
export function useMediaBase(): string | null {
  const [value, setValue] = useState(base)
  useEffect(() => {
    if (value) return
    let live = true
    void loadMediaBase().then((url) => {
      if (live) setValue(url)
    })
    return () => {
      live = false
    }
  }, [value])
  return value
}

/** Where a window loads a band video from. */
export function surfaceVideoUrl(mediaBase: string, video: SurfaceVideo): string {
  return `${mediaBase}/${encodeURIComponent(video.videoId)}/${encodeURIComponent(video.file)}`
}

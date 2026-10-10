import { useCallback, useEffect, useState } from "react"
import * as clock from "@/lib/video-playback"
import type { VideoPlayback } from "@/types"

/**
 * A video clock owned by one component, e.g. the Preview panel's player,
 * driven by the same rules as the live one but touching nothing else.
 * Starts paused at the top.
 */
export function useLocalPlayback(source: VideoPlayback) {
  const [playback, setPlayback] = useState<VideoPlayback>(() => ({
    ...source,
    playing: false,
    position: 0,
    anchor: Date.now(),
  }))

  const change = useCallback(
    (fn: (p: VideoPlayback, now: number) => VideoPlayback) => setPlayback((p) => fn(p, Date.now())),
    []
  )

  // Like the live clock, a video that isn't looping pauses on its last frame.
  useEffect(() => {
    const now = Date.now()
    const remaining = clock.msUntilEnd(playback, now)
    if (remaining === null) return
    const endsAt = now + remaining
    const timer = setTimeout(
      () => setPlayback((p) => (p === playback ? clock.pause(p, Math.max(Date.now(), endsAt)) : p)),
      remaining
    )
    return () => clearTimeout(timer)
  }, [playback])

  return {
    playback,
    togglePlay: () =>
      change((p, now) => (p.playing && !clock.hasEnded(p, now) ? clock.pause(p, now) : clock.play(p, now))),
    seek: (seconds: number) => change((p, now) => clock.seek(p, seconds, now)),
    restart: () => change((p, now) => clock.seek(p, 0, now)),
    setLoop: (loop: boolean) => change((p, now) => clock.setLoop(p, loop, now)),
  }
}

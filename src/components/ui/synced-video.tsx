import { useCallback, useEffect, useRef, type CSSProperties, type RefObject } from "react"
import {
  correction,
  hasEnded,
  INITIAL_SEEK_LATENCY,
  leadTarget,
  nextSeekLatency,
  PAUSED_TOLERANCE,
  PLAYING_TOLERANCE,
  positionAt,
  SEEK_COOLDOWN_MS,
} from "@/lib/video-playback"
import type { VideoPlayback } from "@/types"

/** How often a playing copy checks it hasn't drifted from the clock. */
const DRIFT_CHECK_MS = 1000
/** A seek that hasn't landed by now is given up on, so checks resume. */
const SEEK_GIVE_UP_MS = 5000

/** A seek this copy started and is waiting to land. */
interface PendingSeek {
  /** `performance.now()` when it was started. */
  startedAt: number
  target: number
  /** Seeked, now waiting for the picture to move again (playing only). */
  resuming: boolean
}

interface SyncedVideoProps {
  playback: VideoPlayback
  muted: boolean
  /** 0–1. */
  volume?: number
  className?: string
  style?: CSSProperties
  /** Receives the element, e.g. so NDI can copy its frames. */
  elementRef?: RefObject<HTMLVideoElement | null>
  /** A new frame is showing after a load or a seek (not on every frame). */
  onFrame?: () => void
  /** The webview refused to start playback, e.g. unmuted autoplay. */
  onPlayBlocked?: (error: unknown) => void
}

/**
 * One window's copy of the live video, kept in step with the shared clock
 * (see `VideoPlayback`): it seeks when it drifts too far and plays or pauses
 * as the clock says.
 *
 * Seeking a playing video is slow in WebKitGTK (it decodes from the last
 * keyframe), so a seek is never interrupted by another, aims ahead by how
 * long this copy's seeks take, and is followed by a cooldown. Without that,
 * every correction landed behind and triggered the next one: the picture
 * froze and jumped once a second.
 */
export function SyncedVideo({
  playback,
  muted,
  volume = 1,
  className,
  style,
  elementRef,
  onFrame,
  onPlayBlocked,
}: SyncedVideoProps) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const playbackRef = useRef(playback)
  const onPlayBlockedRef = useRef(onPlayBlocked)

  useEffect(() => {
    onPlayBlockedRef.current = onPlayBlocked
  }, [onPlayBlocked])

  const pendingSeekRef = useRef<PendingSeek | null>(null)
  const seekLatencyRef = useRef(INITIAL_SEEK_LATENCY)
  const lastSeekAtRef = useRef(0)

  /** Seek to `target`, recording it so checks wait for it to land. */
  const seekTo = useCallback((el: HTMLVideoElement, target: number) => {
    el.currentTime = target
    pendingSeekRef.current = { startedAt: performance.now(), target, resuming: false }
    lastSeekAtRef.current = Date.now()
  }, [])

  const sync = useCallback(() => {
    const el = ref.current
    if (!el || el.readyState < HTMLMediaElement.HAVE_METADATA) return
    const p = playbackRef.current
    const now = Date.now()

    const pending = pendingSeekRef.current
    if (pending && performance.now() - pending.startedAt > SEEK_GIVE_UP_MS) {
      pendingSeekRef.current = null
    }
    // Judge drift only when no seek is landing and, while playing, the last
    // correction has had time to settle.
    const settled =
      pendingSeekRef.current === null &&
      (!p.playing || now - lastSeekAtRef.current >= SEEK_COOLDOWN_MS)
    if (settled) {
      const expected = positionAt(p, now)
      const tolerance = p.playing ? PLAYING_TOLERANCE : PAUSED_TOLERANCE
      if (correction(el.currentTime, expected, p.duration, p.loop, tolerance) !== null) {
        seekTo(el, p.playing ? leadTarget(expected, seekLatencyRef.current, p.duration, p.loop) : expected)
      }
    }

    const shouldPlay = p.playing && !hasEnded(p, now)
    if (shouldPlay && el.paused) {
      el.play().catch((error: unknown) => {
        // A newer pause or source change interrupting play() is not a failure.
        if (error instanceof DOMException && error.name === "AbortError") return
        onPlayBlockedRef.current?.(error)
      })
    } else if (!shouldPlay && !el.paused) {
      el.pause()
    }
  }, [seekTo])

  const onSeeked = useCallback(() => {
    onFrame?.()
    const pending = pendingSeekRef.current
    if (!pending) return
    // A paused seek has landed once seeked; a playing one once it moves.
    if (playbackRef.current.playing) pending.resuming = true
    else pendingSeekRef.current = null
  }, [onFrame])

  const onTimeUpdate = useCallback(() => {
    const el = ref.current
    const pending = pendingSeekRef.current
    if (!el || !pending?.resuming || el.currentTime <= pending.target + 0.01) return
    const measured = (performance.now() - pending.startedAt) / 1000
    seekLatencyRef.current = nextSeekLatency(seekLatencyRef.current, measured)
    pendingSeekRef.current = null
  }, [])

  useEffect(() => {
    playbackRef.current = playback
    sync()
  }, [playback, sync])

  useEffect(() => {
    if (!playback.playing) return
    const timer = setInterval(sync, DRIFT_CHECK_MS)
    return () => clearInterval(timer)
  }, [playback.playing, sync])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.muted = muted
    el.volume = Math.min(1, Math.max(0, volume))
  }, [muted, volume])

  // Looping is done here, not with the `loop` attribute: WebKitGTK's own
  // looping freezes the picture and sound at the top of the second pass.
  // Starting again from the ended state plays fine.
  const onEnded = useCallback(() => {
    const el = ref.current
    const p = playbackRef.current
    if (!el || !p.loop || !p.playing) return
    // Aim ahead like any playing seek. This copy can finish a hair before
    // the clock wraps; landing just short of the end would end again at
    // once, so go to the top then and let the drift check absorb it.
    const target = leadTarget(positionAt(p, Date.now()), seekLatencyRef.current, p.duration, true)
    seekTo(el, p.duration - target < 0.5 ? 0 : target)
    sync()
  }, [seekTo, sync])

  const setRef = useCallback(
    (el: HTMLVideoElement | null) => {
      ref.current = el
      if (elementRef) elementRef.current = el
    },
    [elementRef]
  )

  return (
    <video
      ref={setRef}
      src={playback.url}
      poster={playback.poster}
      muted={muted}
      playsInline
      preload="auto"
      // The media server is another origin; without CORS, copying frames to
      // a canvas for NDI would taint it.
      crossOrigin="anonymous"
      disablePictureInPicture
      onLoadedMetadata={sync}
      onLoadedData={onFrame}
      onSeeked={onSeeked}
      onTimeUpdate={onTimeUpdate}
      onEnded={onEnded}
      className={className}
      style={style}
    />
  )
}

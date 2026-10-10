import type { VideoPlayback } from "@/types"

/**
 * The shared video clock (see `VideoPlayback`): pure functions the main
 * window uses to change it and every window uses to follow it.
 */

/** Seconds into the video at `now`. Looping wraps; otherwise it stops at the end. */
export function positionAt(playback: VideoPlayback, now: number): number {
  const { duration } = playback
  let position = playback.position
  if (playback.playing) position += Math.max(0, now - playback.anchor) / 1000
  if (duration <= 0) return Math.max(0, position)
  if (playback.loop) return ((position % duration) + duration) % duration
  return Math.min(Math.max(0, position), duration)
}

/** Whether a non-looping video has played to its end by `now`. */
export function hasEnded(playback: VideoPlayback, now: number): boolean {
  return !playback.loop && playback.duration > 0 && positionAt(playback, now) >= playback.duration
}

/** Milliseconds from `now` until a playing, non-looping video ends; null if it never will. */
export function msUntilEnd(playback: VideoPlayback, now: number): number | null {
  if (!playback.playing || playback.loop || playback.duration <= 0) return null
  return Math.max(0, (playback.duration - positionAt(playback, now)) * 1000)
}

/** Play from where it is; a video that has ended starts again from the top. */
export function play(playback: VideoPlayback, now: number): VideoPlayback {
  const position = hasEnded(playback, now) ? 0 : positionAt(playback, now)
  return { ...playback, playing: true, position, anchor: now }
}

export function pause(playback: VideoPlayback, now: number): VideoPlayback {
  return { ...playback, playing: false, position: positionAt(playback, now), anchor: now }
}

export function seek(playback: VideoPlayback, seconds: number, now: number): VideoPlayback {
  const max = playback.duration > 0 ? playback.duration : Infinity
  return { ...playback, position: Math.min(Math.max(0, seconds), max), anchor: now }
}

/**
 * Turning looping on or off must not move the picture: re-anchor at the
 * current position first, or the clock would jump to wherever the other
 * mode would have it by now.
 */
export function setLoop(playback: VideoPlayback, loop: boolean, now: number): VideoPlayback {
  return { ...playback, position: positionAt(playback, now), anchor: now, loop }
}

/**
 * How far a window's copy may wander from the clock before it is pulled
 * back. Seeking costs a visible hitch, so small drift is left alone while
 * playing; when paused the picture should land exactly where it was put.
 */
export const PLAYING_TOLERANCE = 0.5
export const PAUSED_TOLERANCE = 0.05

/**
 * After pulling a playing copy back, leave it alone this long before
 * judging it again: a seek has to settle, and judging it mid-flight is
 * what turned drift correction into a freeze-and-jump loop. With several
 * copies decoding at once, seeks were measured landing 1.2–2.6 s later.
 */
export const SEEK_COOLDOWN_MS = 5000

/**
 * A playing seek doesn't land instantly: WebKitGTK decodes from the last
 * keyframe first, measured at 0.3–0.8 s with keyframes every 3 s. Aiming
 * this far ahead makes the copy land in step instead of behind. Each copy
 * learns its own figure; this is where it starts.
 */
export const INITIAL_SEEK_LATENCY = 0.5

/** Fold a measured seek time (seconds) into a copy's running estimate. */
export function nextSeekLatency(previous: number, measured: number): number {
  const blended = previous * 0.5 + measured * 0.5
  return Math.min(2, Math.max(0.05, blended))
}

/**
 * Where to seek so a playing copy lands on the clock: `lead` seconds past
 * where the clock is now, wrapped for a loop, held inside the video
 * otherwise.
 */
export function leadTarget(expected: number, lead: number, duration: number, loop: boolean): number {
  const target = expected + lead
  if (duration <= 0) return target
  if (loop) return target % duration
  return Math.min(target, duration)
}

/**
 * Where a window's copy should seek to, or null if it is close enough.
 * Distance wraps around for a looping video, so a copy that has just looped
 * a moment before the clock is not sent back to the end.
 */
export function correction(
  current: number,
  expected: number,
  duration: number,
  loop: boolean,
  tolerance: number
): number | null {
  let drift = Math.abs(current - expected)
  if (loop && duration > 0) drift = Math.min(drift, duration - drift)
  return drift > tolerance ? expected : null
}

/** "1:05", or "1:02:05" past an hour. */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, "0")
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`
}

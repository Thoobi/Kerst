import type { TimerClock, VerseRenderData } from "@/types"

/** Seconds on the clock at `now`; a countdown stops at zero. */
export function timerSeconds(clock: TimerClock, now: number): number {
  const elapsed = clock.running ? (now - clock.anchor) / 1000 : 0
  return clock.direction === "down" ? Math.max(0, clock.seconds - elapsed) : clock.seconds + elapsed
}

/** "4:05", or "1:02:09" past an hour. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = Math.floor(s % 60)
  const ss = String(seconds).padStart(2, "0")
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${ss}` : `${minutes}:${ss}`
}

/** Whether a countdown has run out. */
export function timerEnded(clock: TimerClock, now: number): boolean {
  return clock.direction === "down" && timerSeconds(clock, now) <= 0
}

/**
 * What the clock reads at `now`. A countdown rounds up, so it starts on
 * 5:00 and reads 0:00 only once it is over; then it shows `endText` if set.
 */
export function timerText(clock: TimerClock, now: number): string {
  if (timerEnded(clock, now) && clock.endText.trim()) return clock.endText.trim()
  const seconds = timerSeconds(clock, now)
  return formatClock(clock.direction === "down" ? Math.ceil(seconds - 1e-6) : seconds)
}

/** A timer frame with its words filled in for `now`; anything else unchanged. */
export function withTimerText(verse: VerseRenderData | null, now: number): VerseRenderData | null {
  if (!verse?.timer) return verse
  return {
    ...verse,
    reference: verse.timer.caption.trim(),
    segments: [{ text: timerText(verse.timer, now) }],
  }
}

/**
 * Seconds from `now` until the next "HH:MM" on the wall clock, or null if
 * the time is not valid. A time already past today is tomorrow's.
 */
export function secondsUntil(time: string, now: Date): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  const target = new Date(now)
  target.setHours(hours, minutes, 0, 0)
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)
  return (target.getTime() - now.getTime()) / 1000
}

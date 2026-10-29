import { describe, expect, it } from "vitest"
import { formatClock, secondsUntil, timerText, withTimerText } from "./timer"
import type { TimerClock } from "@/types"

const clock = (patch: Partial<TimerClock> = {}): TimerClock => ({
  direction: "down",
  seconds: 300,
  anchor: 1_000_000,
  running: true,
  caption: "",
  endText: "",
  ...patch,
})

describe("formatClock", () => {
  it("shows minutes and seconds, hours once past one", () => {
    expect(formatClock(0)).toBe("0:00")
    expect(formatClock(65)).toBe("1:05")
    expect(formatClock(3729)).toBe("1:02:09")
  })
})

describe("timerText", () => {
  it("counts down from the full time and rounds up", () => {
    expect(timerText(clock(), 1_000_000)).toBe("5:00")
    expect(timerText(clock(), 1_000_500)).toBe("5:00")
    expect(timerText(clock(), 1_001_000)).toBe("4:59")
    expect(timerText(clock(), 1_299_500)).toBe("0:01")
  })

  it("stops at zero, or shows the end text", () => {
    expect(timerText(clock(), 1_400_000)).toBe("0:00")
    expect(timerText(clock({ endText: "Welcome!" }), 1_400_000)).toBe("Welcome!")
  })

  it("holds still while paused", () => {
    expect(timerText(clock({ running: false, seconds: 42 }), 9_000_000)).toBe("0:42")
  })

  it("counts up", () => {
    expect(timerText(clock({ direction: "up", seconds: 0 }), 1_090_900)).toBe("1:30")
  })
})

describe("withTimerText", () => {
  it("fills the words and caption of a timer frame only", () => {
    const frame = withTimerText(
      { reference: "", segments: [], timer: clock({ caption: " Starting in " }) },
      1_000_000
    )
    expect(frame?.reference).toBe("Starting in")
    expect(frame?.segments).toEqual([{ text: "5:00" }])
    const verse = { reference: "John 3:16", segments: [] }
    expect(withTimerText(verse, 0)).toBe(verse)
  })
})

describe("secondsUntil", () => {
  const now = new Date(2026, 9, 29, 9, 40, 0)
  it("counts to a time later today", () => {
    expect(secondsUntil("10:00", now)).toBe(20 * 60)
  })
  it("rolls a past time to tomorrow", () => {
    expect(secondsUntil("9:00", now)).toBe((24 * 60 - 40) * 60)
  })
  it("rejects nonsense", () => {
    expect(secondsUntil("25:00", now)).toBeNull()
    expect(secondsUntil("ten", now)).toBeNull()
  })
})

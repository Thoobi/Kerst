import { describe, expect, it } from "vitest"
import {
  correction,
  leadTarget,
  nextSeekLatency,
  formatTime,
  hasEnded,
  msUntilEnd,
  pause,
  play,
  positionAt,
  seek,
  setLoop,
} from "./video-playback"
import type { VideoPlayback } from "@/types"

const base: VideoPlayback = {
  id: "v",
  url: "asset://v.mp4",
  duration: 60,
  loop: false,
  playing: false,
  position: 0,
  anchor: 1_000,
}

describe("positionAt", () => {
  it("stands still while paused", () => {
    expect(positionAt({ ...base, position: 12 }, 999_999)).toBe(12)
  })

  it("moves in real time while playing and stops at the end", () => {
    const playing = { ...base, playing: true, position: 10 }
    expect(positionAt(playing, 6_000)).toBe(15)
    expect(positionAt(playing, 1_000_000)).toBe(60)
  })

  it("wraps when looping", () => {
    const looping = { ...base, playing: true, loop: true, position: 50 }
    expect(positionAt(looping, 21_000)).toBe(10)
  })

  it("never runs backwards if the anchor is in the future", () => {
    expect(positionAt({ ...base, playing: true, position: 5 }, 0)).toBe(5)
  })
})

describe("transport", () => {
  it("pause freezes where it got to; play carries on from there", () => {
    const playing = play(base, 1_000)
    const paused = pause(playing, 11_000)
    expect(paused).toMatchObject({ playing: false, position: 10, anchor: 11_000 })
    expect(positionAt(play(paused, 50_000), 52_000)).toBe(12)
  })

  it("play after the end starts again from the top", () => {
    const ended = { ...base, playing: true, position: 59 }
    expect(hasEnded(ended, 5_000)).toBe(true)
    expect(play(ended, 5_000)).toMatchObject({ playing: true, position: 0, anchor: 5_000 })
  })

  it("seek clamps to the video and keeps playing state", () => {
    expect(seek({ ...base, playing: true }, 90, 2_000)).toMatchObject({ position: 60, playing: true, anchor: 2_000 })
    expect(seek(base, -3, 2_000).position).toBe(0)
  })

  it("toggling loop does not jump to where the other mode would be", () => {
    // 20s in, a looping video has wrapped to 10s; turned off, it stays there
    // rather than jumping to the end it would have reached.
    const wrapping = { ...base, playing: true, loop: true, position: 50 }
    expect(positionAt(setLoop(wrapping, false, 21_000), 21_000)).toBe(10)
    // Mid-video, looping on keeps the picture where it is.
    const midway = { ...base, playing: true, position: 20 }
    expect(positionAt(setLoop(midway, true, 11_000), 11_000)).toBe(30)
  })

  it("knows when a playing, non-looping video will end", () => {
    expect(msUntilEnd({ ...base, playing: true, position: 55 }, 1_000)).toBe(5_000)
    expect(msUntilEnd({ ...base, playing: true, loop: true }, 1_000)).toBeNull()
    expect(msUntilEnd(base, 1_000)).toBeNull()
  })
})

describe("correction", () => {
  it("leaves small drift alone and pulls large drift back", () => {
    expect(correction(10.1, 10, 60, false, 0.25)).toBeNull()
    expect(correction(11, 10, 60, false, 0.25)).toBe(10)
  })

  it("measures drift around the loop point", () => {
    expect(correction(59.9, 0.05, 60, true, 0.25)).toBeNull()
    expect(correction(59.9, 0.05, 60, false, 0.25)).toBe(0.05)
  })
})

describe("seek latency", () => {
  it("aims ahead of the clock, wrapping a loop and stopping at the end otherwise", () => {
    expect(leadTarget(10, 0.5, 60, false)).toBe(10.5)
    expect(leadTarget(59.8, 0.5, 60, true)).toBeCloseTo(0.3)
    expect(leadTarget(59.8, 0.5, 60, false)).toBe(60)
  })

  it("learns from measurements without overreacting to one", () => {
    expect(nextSeekLatency(0.5, 0.8)).toBeCloseTo(0.65)
    expect(nextSeekLatency(0.5, 30)).toBe(2)
    expect(nextSeekLatency(0.1, 0)).toBe(0.05)
  })
})

it("formats times", () => {
  expect(formatTime(0)).toBe("0:00")
  expect(formatTime(65.9)).toBe("1:05")
  expect(formatTime(3725)).toBe("1:02:05")
  expect(formatTime(NaN)).toBe("0:00")
})

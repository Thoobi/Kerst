import { useEffect, useState } from "react"
import { timerText } from "@/lib/timer"
import type { TimerClock } from "@/types"

/**
 * A count that goes up each time a running timer's reading changes, so a
 * canvas showing it knows to redraw.
 */
export function useTimerTick(clock: TimerClock | undefined): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!clock?.running) return
    let last = timerText(clock, Date.now())
    const id = setInterval(() => {
      const text = timerText(clock, Date.now())
      if (text === last) return
      last = text
      setTick((n) => n + 1)
    }, 200)
    return () => clearInterval(id)
  }, [clock])
  return tick
}

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { secondsUntil, timerSeconds, withTimerText } from "@/lib/timer"
import { DEFAULT_TIMER_SIZE } from "@/lib/verse-renderer"
import { useBroadcastStore } from "./broadcast-store"
import { backgroundPlayback } from "./videos-store"
import type {
  TimerClock,
  TimerStyle,
  VerseRenderData,
  VideoPlayback,
} from "@/types"

/** Count down a length of time, down to a time of day, or up from zero. */
export type TimerMode = "countdown" | "until" | "countup"

interface TimerState {
  mode: TimerMode
  /** Countdown length, in seconds. */
  duration: number
  /** "HH:MM" the "until" countdown ends at. */
  until: string
  caption: string
  endText: string
  style: TimerStyle
  /** A library video looped behind the timer, or null for the theme's background. */
  backgroundVideoId: string | null
  clock: TimerClock
  /** The outputs showing the timer in place of the live content. */
  outputIds: string[]

  setMode: (mode: TimerMode) => void
  setDuration: (seconds: number) => void
  setUntil: (time: string) => void
  setCaption: (caption: string) => void
  setEndText: (endText: string) => void
  /** Change how the timer looks; unset fields follow each output's theme. */
  setStyle: (patch: Partial<TimerStyle>) => void
  setBackgroundVideo: (videoId: string | null) => void
  start: () => void
  pause: () => void
  /** Stop and go back to the start: the full length, the time left until, or zero. */
  reset: () => void
  /** Add (or with a negative `delta`, take off) seconds. */
  adjust: (delta: number) => void
  toggleOutput: (outputId: string) => void
  /** Take the timer off every output. */
  hide: () => void
  /** The motion background playing behind the timer, if one is chosen. */
  background: () => VideoPlayback | undefined
}

/** What is kept between runs of the app. */
type Settings = Pick<
  TimerState,
  | "mode"
  | "duration"
  | "until"
  | "caption"
  | "endText"
  | "style"
  | "backgroundVideoId"
>

/** The clock as it stands before it is started. */
function startingClock(
  settings: Settings,
  running: boolean,
  now = Date.now()
): TimerClock {
  const { mode, duration, until, caption, endText, style } = settings
  const seconds =
    mode === "countdown"
      ? duration
      : mode === "until"
        ? (secondsUntil(until, new Date(now)) ?? 0)
        : 0
  return {
    direction: mode === "countup" ? "up" : "down",
    seconds,
    anchor: now,
    running,
    caption,
    endText,
    style,
  }
}

/** The render data an output draws for `clock`, over `background` if given. */
export function timerFrame(
  clock: TimerClock,
  background?: VideoPlayback
): VerseRenderData {
  // Filled in now for anything that reads the words; outputs re-read the clock as it runs.
  return withTimerText(
    {
      style: "lyrics",
      reference: "",
      segments: [],
      timer: clock,
      ...(background ? { background } : {}),
    },
    Date.now()
  )!
}

const DEFAULTS: Settings = {
  mode: "countdown",
  duration: 5 * 60,
  until: "10:00",
  caption: "Starting in",
  endText: "",
  style: { size: DEFAULT_TIMER_SIZE },
  backgroundVideoId: null,
}

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => {
      // The background's clock, kept so a running loop isn't restarted by every tick.
      let background: VideoPlayback | undefined
      const currentBackground = () => {
        const id = get().backgroundVideoId
        if (!id) return (background = undefined)
        if (background?.id !== id) background = backgroundPlayback(id)
        return background
      }

      /** Change the clock, and the outputs showing it. */
      const setClock = (clock: TimerClock) => {
        set({ clock })
        publish()
      }

      const publish = () => {
        const { outputIds, clock } = get()
        if (outputIds.length > 0) {
          useBroadcastStore
            .getState()
            .setTimerOverlay(timerFrame(clock, currentBackground()), outputIds)
        }
      }

      /** The clock frozen at its reading now, for a change that keeps the time. */
      const now = () => {
        const at = Date.now()
        return { at, seconds: timerSeconds(get().clock, at) }
      }

      return {
        ...DEFAULTS,
        clock: startingClock(DEFAULTS, false),
        outputIds: [],

        setMode: (mode) => {
          set({ mode })
          setClock(startingClock(get(), false))
        },

        setDuration: (seconds) => {
          set({ duration: Math.max(0, Math.round(seconds)) })
          if (get().mode === "countdown" && !get().clock.running)
            setClock(startingClock(get(), false))
        },

        setUntil: (until) => {
          set({ until })
          if (get().mode === "until")
            setClock(startingClock(get(), get().clock.running))
        },

        setCaption: (caption) => {
          set({ caption })
          setClock({ ...get().clock, caption })
        },

        setEndText: (endText) => {
          set({ endText })
          setClock({ ...get().clock, endText })
        },

        setStyle: (patch) => {
          const style = { ...get().style, ...patch }
          set({ style })
          setClock({ ...get().clock, style })
        },

        setBackgroundVideo: (backgroundVideoId) => {
          set({ backgroundVideoId })
          publish()
        },

        background: () => currentBackground(),

        start: () => {
          const { clock, mode } = get()
          if (clock.running) return
          const { at, seconds } = now()
          // Aim at the time of day afresh; a finished countdown starts over.
          if (
            mode === "until" ||
            (clock.direction === "down" && seconds <= 0)
          ) {
            setClock(startingClock(get(), true, at))
          } else {
            setClock({ ...clock, seconds, anchor: at, running: true })
          }
        },

        pause: () => {
          const { clock } = get()
          if (!clock.running) return
          const { at, seconds } = now()
          setClock({ ...clock, seconds, anchor: at, running: false })
        },

        reset: () => setClock(startingClock(get(), false)),

        adjust: (delta) => {
          const { at, seconds } = now()
          setClock({
            ...get().clock,
            seconds: Math.max(0, seconds + delta),
            anchor: at,
          })
        },

        toggleOutput: (outputId) => {
          const { outputIds, clock } = get()
          const next = outputIds.includes(outputId)
            ? outputIds.filter((id) => id !== outputId)
            : [...outputIds, outputId]
          set({ outputIds: next })
          useBroadcastStore
            .getState()
            .setTimerOverlay(timerFrame(clock, currentBackground()), next)
        },

        hide: () => {
          set({ outputIds: [] })
          useBroadcastStore.getState().setTimerOverlay(null, [])
        },
      }
    },
    {
      name: "litdeck-timer",
      partialize: (s): Settings => ({
        mode: s.mode,
        duration: s.duration,
        until: s.until,
        caption: s.caption,
        endText: s.endText,
        style: s.style,
        backgroundVideoId: s.backgroundVideoId,
      }),
      // The clock is never saved: start from the saved settings.
      onRehydrateStorage: () => (state) => state?.reset(),
    }
  )
)

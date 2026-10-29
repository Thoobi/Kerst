import { useMemo, useState } from "react"
import { CheckIcon, EyeOffIcon, MinusIcon, PauseIcon, PlayIcon, PlusIcon, RotateCcwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CanvasVerse } from "@/components/ui/canvas-verse"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { BackgroundPicker } from "@/components/panels/background-picker"
import { isTypingOrHandled } from "@/lib/operator-keys"
import { themeForContent } from "@/lib/verse-renderer"
import { cn } from "@/lib/utils"
import { useBroadcastStore } from "@/stores"
import { timerFrame, useTimerStore, type TimerMode } from "@/stores/timer-store"
import type { BroadcastTheme } from "@/types"

const MODES: { id: TimerMode; label: string }[] = [
  { id: "countdown", label: "Countdown" },
  { id: "until", label: "Until a time" },
  { id: "countup", label: "Count up" },
]

const PRESET_MINUTES = [1, 2, 3, 5, 10, 15, 20, 30]

/**
 * A countdown or count-up for the screens: set it, pick the outputs to show
 * it on, start it. Outputs left unpicked keep showing the live content, so
 * one screen can count down while another carries the Bible.
 */
export function TimerPanel() {
  const mode = useTimerStore((s) => s.mode)
  const duration = useTimerStore((s) => s.duration)
  const until = useTimerStore((s) => s.until)
  const caption = useTimerStore((s) => s.caption)
  const endText = useTimerStore((s) => s.endText)
  const clock = useTimerStore((s) => s.clock)
  const outputIds = useTimerStore((s) => s.outputIds)
  const backgroundVideoId = useTimerStore((s) => s.backgroundVideoId)
  const outputs = useBroadcastStore((s) => s.outputs)
  const themes = useBroadcastStore((s) => s.themes)
  const isLive = useBroadcastStore((s) => s.isLive)

  // Preview on the theme of the first output it is going to, else the main one.
  const previewOutput = outputs.find((o) => outputIds.includes(o.id)) ?? outputs[0]
  const previewTheme = themes.find((t) => t.id === previewOutput?.themeId) ?? themes[0]

  const frame = useMemo(
    () => timerFrame(clock, useTimerStore.getState().background()),
    // The background is looked up from its id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clock, backgroundVideoId]
  )
  const timer = useTimerStore.getState()

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (isTypingOrHandled(event)) return
    if (event.key !== " ") return
    event.preventDefault()
    if (useTimerStore.getState().clock.running) timer.pause()
    else timer.start()
  }

  return (
    <div
      data-slot="timer-panel"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs outline-none"
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2.5">
        <div role="radiogroup" aria-label="Timer kind" className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {MODES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              onClick={() => timer.setMode(id)}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                mode === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto border-r border-border p-3">
          {mode === "countdown" && <DurationField duration={duration} />}
          {mode === "until" && (
            <Field label="Ends at">
              <Input
                type="time"
                value={until}
                onChange={(e) => timer.setUntil(e.target.value)}
                aria-label="Ends at"
              />
            </Field>
          )}
          <Field label="Caption">
            <Input
              value={caption}
              onChange={(e) => timer.setCaption(e.target.value)}
              placeholder="e.g. Service starts in"
            />
          </Field>
          {mode !== "countup" && (
            <Field label="When it ends, show">
              <Input
                value={endText}
                onChange={(e) => timer.setEndText(e.target.value)}
                placeholder="0:00"
              />
            </Field>
          )}
          <TimerLook theme={previewTheme} />
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3">
          {previewTheme && (
            <div className="mx-auto w-full max-w-xl rounded-lg bg-surface-sunken p-1.5 ring-1 ring-border ring-inset">
              <CanvasVerse theme={previewTheme} verse={frame} />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => timer.adjust(-60)} title="Take a minute off">
              <MinusIcon />
              1 min
            </Button>
            {clock.running ? (
              <Button size="sm" onClick={() => timer.pause()}>
                <PauseIcon />
                Pause
              </Button>
            ) : (
              <Button size="sm" onClick={() => timer.start()}>
                <PlayIcon />
                Start
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => timer.reset()} title="Stop and go back to the start">
              <RotateCcwIcon />
              Reset
            </Button>
            <Button variant="outline" size="sm" onClick={() => timer.adjust(60)} title="Add a minute">
              <PlusIcon />
              1 min
            </Button>
          </div>

          <div className="mx-auto flex w-full max-w-xl flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Show on</span>
              {outputIds.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => timer.hide()}>
                  <EyeOffIcon />
                  Hide timer
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {outputs.map((output) => {
                const on = outputIds.includes(output.id)
                const theme = themes.find((t) => t.id === output.themeId)
                return (
                  <button
                    key={output.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => timer.toggleOutput(output.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left ring-1 ring-border transition-colors hover:bg-muted",
                      on && "bg-primary/10 ring-primary"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded border border-border",
                        on && "border-primary bg-primary text-primary-foreground"
                      )}
                    >
                      {on && <CheckIcon className="size-3" />}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-xs font-medium">{output.name}</span>
                      {theme && <span className="text-[0.6875rem] text-muted-foreground">{theme.name}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-[0.6875rem] text-muted-foreground">
              {outputIds.length === 0
                ? "Pick the outputs to show the timer on. The rest keep showing the live content."
                : isLive
                  ? "The outputs not picked keep showing the live content."
                  : "Turn on Live to put it on screen."}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Size, colours and background: the timer's own, over each output's theme. */
function TimerLook({ theme }: { theme: BroadcastTheme | undefined }) {
  const style = useTimerStore((s) => s.style)
  const backgroundVideoId = useTimerStore((s) => s.backgroundVideoId)
  const { setStyle, setBackgroundVideo } = useTimerStore.getState()
  const [choosingVideo, setChoosingVideo] = useState(false)
  const backgroundMode = backgroundVideoId || choosingVideo ? "video" : style.backgroundColor ? "colour" : "theme"
  const words = theme ? themeForContent(theme, { reference: "", segments: [], style: "lyrics" }) : undefined

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <Field label={`Size · ${style.size}%`}>
        <Slider
          min={100}
          max={600}
          step={10}
          value={[style.size]}
          onValueChange={([size]) => setStyle({ size })}
          aria-label="Size"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Time colour">
          <ColorInput
            value={style.color ?? words?.verseText.color ?? "#ffffff"}
            onChange={(color) => setStyle({ color })}
            label="Time colour"
          />
        </Field>
        <Field label="Caption colour">
          <ColorInput
            value={style.captionColor ?? words?.reference.color ?? "#ffffff"}
            onChange={(captionColor) => setStyle({ captionColor })}
            label="Caption colour"
          />
        </Field>
      </div>
      {(style.color || style.captionColor) && (
        <Button
          variant="ghost"
          size="xs"
          className="-mt-2 self-start"
          onClick={() => setStyle({ color: undefined, captionColor: undefined })}
        >
          Use the theme's colours
        </Button>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Background</span>
        <div role="radiogroup" aria-label="Background" className="flex gap-0.5 rounded-md bg-muted p-0.5">
          {(
            [
              ["theme", "Theme"],
              ["colour", "Colour"],
              ["video", "Video"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={backgroundMode === mode}
              onClick={() => {
                setChoosingVideo(mode === "video")
                if (mode === "video") return
                if (backgroundVideoId) setBackgroundVideo(null)
                setStyle({
                  backgroundColor:
                    mode === "colour" ? (style.backgroundColor ?? theme?.background.color.slice(0, 7) ?? "#000000") : undefined,
                })
              }}
              className={cn(
                "h-7 flex-1 rounded-[5px] text-xs transition-colors",
                backgroundMode === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {backgroundMode === "video" && (
          <BackgroundPicker
            videoId={backgroundVideoId}
            onChoose={async (videoId) => {
              setBackgroundVideo(videoId)
              if (videoId) setStyle({ backgroundColor: undefined })
              else setChoosingVideo(false)
            }}
          />
        )}
        {backgroundMode === "colour" && style.backgroundColor && (
          <ColorInput
            value={style.backgroundColor}
            onChange={(backgroundColor) => setStyle({ backgroundColor })}
            label="Background colour"
          />
        )}
      </div>
    </div>
  )
}

function ColorInput({ value, onChange, label }: { value: string; onChange: (color: string) => void; label: string }) {
  return (
    <input
      type="color"
      value={value.slice(0, 7)}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full cursor-pointer rounded-md border border-input bg-transparent p-0.5"
      aria-label={label}
    />
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

/** Minutes and seconds, with one-click lengths. */
function DurationField({ duration }: { duration: number }) {
  const minutes = Math.floor(duration / 60)
  const seconds = duration % 60
  // Typed text, kept while editing so an empty box doesn't snap back to 0.
  const [draft, setDraft] = useState<{ minutes?: string; seconds?: string }>({})
  const setDuration = useTimerStore.getState().setDuration

  const commit = (part: "minutes" | "seconds", text: string) => {
    setDraft((d) => ({ ...d, [part]: text }))
    const value = Number(text)
    if (!Number.isFinite(value) || value < 0) return
    setDuration(part === "minutes" ? value * 60 + seconds : minutes * 60 + Math.min(59, value))
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">Length</span>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          value={draft.minutes ?? String(minutes)}
          onChange={(e) => commit("minutes", e.target.value)}
          onBlur={() => setDraft({})}
          aria-label="Minutes"
          className="w-20 tabular-nums"
        />
        <span className="text-xs text-muted-foreground">min</span>
        <Input
          type="number"
          min={0}
          max={59}
          inputMode="numeric"
          value={draft.seconds ?? String(seconds)}
          onChange={(e) => commit("seconds", e.target.value)}
          onBlur={() => setDraft({})}
          aria-label="Seconds"
          className="w-20 tabular-nums"
        />
        <span className="text-xs text-muted-foreground">sec</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {PRESET_MINUTES.map((m) => (
          <Button
            key={m}
            variant={duration === m * 60 ? "secondary" : "ghost"}
            size="xs"
            onClick={() => {
              setDraft({})
              setDuration(m * 60)
            }}
          >
            {m} min
          </Button>
        ))}
      </div>
    </div>
  )
}

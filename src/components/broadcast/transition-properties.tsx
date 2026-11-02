import { useBroadcastStore } from "@/stores/broadcast-store"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { BroadcastTheme } from "@/types"

type Transition = BroadcastTheme["transition"]

const TYPES: [Transition["type"], string][] = [
  ["none", "Cut"],
  ["fade", "Fade"],
  ["slide", "Slide"],
  ["scale", "Zoom"],
]

const DIRECTIONS: [Transition["direction"], string][] = [
  ["up", "↑ Up"],
  ["down", "↓ Down"],
  ["left", "← Left"],
  ["right", "→ Right"],
]

/**
 * How the words change on this theme: cut, fade, slide or zoom. Going on
 * and off air, a Lower Thirds band comes and goes the same way with its
 * words; from verse to verse the band stays put and only the words move.
 */
export function TransitionProperties() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)
  if (!draftTheme) return null
  const transition = draftTheme.transition

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <div>
        <h4 className="text-xs font-semibold">Transition</h4>
        <p className="text-[0.6875rem] text-muted-foreground">
          When the words change. A lower-third band slides or fades in and out with its words.
        </p>
      </div>

      <div role="radiogroup" aria-label="Transition" className="flex rounded-md bg-muted p-0.5">
        {TYPES.map(([type, label]) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={transition.type === type}
            onClick={() => update("transition.type", type)}
            className={cn(
              "h-7 flex-1 rounded-[5px] text-xs transition-colors",
              transition.type === type
                ? "bg-card font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {transition.type !== "none" && (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Length</label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {(transition.duration / 1000).toFixed(2)}s
              </span>
            </div>
            <Slider
              min={100}
              max={2000}
              step={50}
              value={[transition.duration]}
              onValueChange={([v]) => update("transition.duration", v)}
              aria-label="Transition length"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Easing</label>
              <Select value={transition.easing} onValueChange={(v) => update("transition.easing", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ease-in-out">Smooth</SelectItem>
                  <SelectItem value="ease-out">Gentle stop</SelectItem>
                  <SelectItem value="ease-in">Gentle start</SelectItem>
                  <SelectItem value="linear">Even</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {transition.type === "slide" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Direction</label>
                <Select value={transition.direction} onValueChange={(v) => update("transition.direction", v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIRECTIONS.map(([direction, label]) => (
                      <SelectItem key={direction} value={direction}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

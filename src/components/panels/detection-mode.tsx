import { MicIcon } from "lucide-react"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { cn } from "@/lib/utils"

const MODES = [
  ["manual", "Off", "Detected verses only move the Bible panel and Preview; nothing goes on air"],
  ["ask", "Ask", "Each detected verse is offered over the Live view; one click puts it on air"],
  ["auto", "Auto", "Detected verses go straight on air"],
] as const

/**
 * What happens to verses the detector hears: Off, Ask or Auto. It sits in
 * the Bible panel, beside the verses it's about, so it isn't mistaken for a
 * switch on how Preview goes live.
 */
export function DetectionModeSwitch() {
  const autoLive = useBroadcastStore((s) => s.autoLive)
  const askLive = useBroadcastStore((s) => s.askLive)
  const current = autoLive ? "auto" : askLive ? "ask" : "manual"
  return (
    <div className="flex shrink-0 items-center gap-1.5" title="What happens to verses the detector hears in the sermon">
      <span className="flex items-center gap-1 text-[0.6875rem] font-medium text-muted-foreground">
        <MicIcon className="size-3" aria-hidden />
        Detected
      </span>
      <div role="radiogroup" aria-label="Detected verses" className="flex items-center rounded-lg bg-muted p-0.5">
        {MODES.map(([mode, label, help]) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={current === mode}
            title={help}
            onClick={() => useBroadcastStore.getState().setVerseMode(mode)}
            className={cn(
              "h-7 rounded-md px-2 text-xs font-medium transition-colors",
              current === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              current === mode && mode === "auto" && "text-live-pulse"
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

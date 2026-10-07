import { useState } from "react"
import { LevelMeter } from "@/components/ui/level-meter"
import { MicIcon, MicOffIcon, PaletteIcon, CastIcon, SunIcon, MoonIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SettingsDialog } from "@/components/settings-dialog"
import { ThemeDesigner } from "@/components/broadcast/theme-designer"
import { BroadcastOutputsDialog } from "@/components/broadcast/broadcast-outputs-dialog"
import { useAudioStore, useTranscriptStore, useBroadcastStore } from "@/stores"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

/** Subscribes to the audio level on its own so ticks don't re-render the bar. */
function MicStatus() {
  const rms = useAudioStore((s) => s.level.rms)
  const isTranscribing = useTranscriptStore((s) => s.isTranscribing)

  return (
    <div
      className={cn(
        "flex h-7 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors",
        isTranscribing
          ? "border-border bg-card text-foreground"
          : "border-transparent text-muted-foreground"
      )}
    >
      {isTranscribing ? (
        <MicIcon className="size-3.5 text-primary" />
      ) : (
        <MicOffIcon className="size-3.5" />
      )}
      {isTranscribing ? "Listening" : "Mic off"}
      {isTranscribing && <LevelMeter level={rms} bars={5} />}
    </div>
  )
}

function OnAirStatus() {
  const isLive = useBroadcastStore((s) => s.isLive)

  return (
    <div
      className={cn(
        "flex h-7 items-center gap-2 rounded-full px-3 text-xs font-semibold tracking-wide transition-colors",
        isLive
          ? "bg-live-pulse/15 text-live-pulse"
          : "text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          isLive
            ? "animate-pulse bg-live-pulse shadow-[0_0_8px] shadow-live-pulse"
            : "bg-muted-foreground/40"
        )}
      />
      {isLive ? "ON AIR" : "Off air"}
    </div>
  )
}

export function TransportBar() {
  const { theme, setTheme } = useTheme()
  const [broadcastOpen, setBroadcastOpen] = useState(false)

  return (
    <header
      data-slot="transport-bar"
      className="grid h-12 grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-card px-3"
    >
      <div className="flex items-center gap-2">
        <img src="/rhema.svg" alt="" className="size-6 rounded-md" />
        <span className="text-sm font-semibold tracking-tight text-foreground">
          Light
        </span>
      </div>

      <div className="flex items-center gap-1 rounded-full bg-background p-0.5">
        <MicStatus />
        <OnAirStatus />
      </div>

      <div className="flex items-center justify-end gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          title="Broadcast outputs"
          data-tour="broadcast"
          onClick={() => setBroadcastOpen(true)}
        >
          <CastIcon className="size-4" />
        </Button>
        <BroadcastOutputsDialog open={broadcastOpen} onOpenChange={setBroadcastOpen} />
        <Button
          variant="ghost"
          size="icon-sm"
          title="Theme designer"
          data-tour="theme"
          onClick={() => useBroadcastStore.getState().setDesignerOpen(true)}
        >
          <PaletteIcon className="size-4" />
        </Button>
        <ThemeDesigner />
        <Button
          variant="ghost"
          size="icon-sm"
          title="Toggle light / dark"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? (
            <SunIcon className="size-4" />
          ) : (
            <MoonIcon className="size-4" />
          )}
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <SettingsDialog />
      </div>
    </header>
  )
}

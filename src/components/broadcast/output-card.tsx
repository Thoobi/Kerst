import { useEffect, useState } from "react"
import {
  CastIcon,
  CopyIcon,
  MonitorIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RadioIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { CanvasVerse } from "@/components/ui/canvas-verse"
import { cn } from "@/lib/utils"
import {
  STREAM_PLATFORM_LABELS,
  ndiFrameRateToNumber,
  ndiResolutionDimensions,
} from "@/lib/broadcast-output-control"
import { useBroadcastStore } from "@/stores"
import { outputVerse } from "@/stores/broadcast-store"
import type { BroadcastOutput, BroadcastOutputStatus, DestinationStatus, StreamStatus } from "@/types"
import { MAIN_OUTPUT_ID, isOnAir } from "@/types"

interface OutputCardProps {
  output: BroadcastOutput
  status: BroadcastOutputStatus | undefined
  /** Human-readable monitor description, when the monitor list is known. */
  monitorLabel?: string
  onEdit: () => void
  onToggle: (enabled: boolean) => void
  onDuplicate: () => void
  onRemove: () => void
  busy?: boolean
}

function transportLabel(output: BroadcastOutput, monitorLabel: string | undefined): string {
  if (output.type === "display") {
    return monitorLabel ?? `Display ${output.monitorIndex + 1}`
  }
  if (output.type === "stream") {
    const { stream } = output
    const platforms = [
      ...new Set(stream.destinations.filter((d) => d.enabled).map((d) => STREAM_PLATFORM_LABELS[d.platform])),
    ]
    const dims = ndiResolutionDimensions(stream.resolution)
    const picture = stream.camera ? "camera" : "graphics"
    return `${platforms.join(" + ") || "No destination"} · ${dims.height}p${ndiFrameRateToNumber(stream.frameRate)} · ${picture}`
  }
  const dims = ndiResolutionDimensions(output.ndi.resolution)
  const alpha = output.ndi.alphaMode === "noneOpaque" ? "opaque" : "alpha"
  return `NDI · ${output.ndi.sourceName} · ${dims.height}p${ndiFrameRateToNumber(output.ndi.frameRate)} · ${alpha}`
}

function formatUptime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [enabled])
  return now
}

const DESTINATION_LABEL: Record<DestinationStatus["state"], string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
}

/** One line per destination while streaming: is it actually getting the stream? */
function StreamHealth({ status }: { status: StreamStatus }) {
  return (
    <ul className="flex flex-col gap-1 px-0.5">
      {status.destinations.map((d) => (
        <li key={d.id} className="flex items-center gap-1.5 text-[0.6875rem]" title={d.error ?? undefined}>
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              d.state === "live" && "bg-destructive",
              d.state === "connecting" && "animate-pulse bg-muted-foreground",
              d.state === "reconnecting" && "animate-pulse bg-amber-400"
            )}
          />
          <span className="font-medium">{d.name}</span>
          <span
            className={cn(
              "truncate",
              d.state === "reconnecting" ? "text-amber-400" : "text-muted-foreground"
            )}
          >
            {DESTINATION_LABEL[d.state]}
            {d.state === "live" && d.bitrateKbps > 0 && ` · ${(d.bitrateKbps / 1000).toFixed(1)} Mbps`}
            {d.state === "reconnecting" && d.error && ` · ${d.error}`}
          </span>
        </li>
      ))}
      {status.encoderState === "restarting" && (
        <li className="truncate text-[0.6875rem] text-amber-400" title={status.error ?? undefined}>
          Encoder restarting{status.error ? ` · ${status.error}` : ""}
        </li>
      )}
    </ul>
  )
}

export function OutputCard({
  output,
  status,
  monitorLabel,
  onEdit,
  onToggle,
  onDuplicate,
  onRemove,
  busy = false,
}: OutputCardProps) {
  const themes = useBroadcastStore((s) => s.themes)
  const verse = useBroadcastStore((s) => outputVerse(s, output.id))
  const renameOutput = useBroadcastStore((s) => s.renameOutput)
  const streamStatus = useBroadcastStore((s) => s.streamStatus[output.id])

  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(output.name)
  const [confirmingStop, setConfirmingStop] = useState(false)

  const theme = themes.find((t) => t.id === output.themeId) ?? themes[0]
  const onAir = isOnAir(output, status)
  const isDefault = output.id === MAIN_OUTPUT_ID
  const streaming = output.type === "stream" && onAir
  const now = useNow(streaming)
  const streamTrouble =
    streaming &&
    streamStatus !== undefined &&
    (streamStatus.encoderState === "restarting" ||
      streamStatus.destinations.some((d) => d.state === "reconnecting"))

  const handleToggle = (enabled: boolean) => {
    // Ending a livestream by a stray click would cut off everyone watching.
    if (streaming && !enabled) setConfirmingStop(true)
    else onToggle(enabled)
  }

  const commitRename = () => {
    const name = draftName.trim()
    if (name && name !== output.name) renameOutput(output.id, name)
    else setDraftName(output.name)
    setRenaming(false)
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-2.5 transition-colors hover:border-foreground/20">
      <div className="relative overflow-hidden rounded-md border border-foreground/10">
        {theme ? (
          <CanvasVerse
            theme={theme}
            verse={onAir ? verse : null}
            className={cn("aspect-video w-full", !onAir && "opacity-45 saturate-50")}
          />
        ) : (
          <div className="aspect-video w-full bg-muted" />
        )}
        <span
          className={cn(
            "absolute top-1.5 left-1.5 inline-flex items-center gap-1.5 rounded-4xl border px-2 py-0.5 text-[0.625rem] font-semibold tracking-wider uppercase backdrop-blur-sm",
            onAir && output.type === "display" && "border-destructive/40 bg-destructive/15 text-destructive",
            onAir && output.type === "ndi" && "border-emerald-500/40 bg-emerald-500/15 text-emerald-400",
            streaming && !streamTrouble && "border-destructive/40 bg-destructive/15 text-destructive",
            streamTrouble && "border-amber-500/40 bg-amber-500/15 text-amber-400",
            !onAir && "border-border bg-background/70 text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              onAir && output.type === "display" && "animate-pulse bg-destructive",
              onAir && output.type === "ndi" && "bg-emerald-400",
              streaming && !streamTrouble && "animate-pulse bg-destructive",
              streamTrouble && "animate-pulse bg-amber-400",
              !onAir && "bg-muted-foreground"
            )}
          />
          {streaming
            ? `${streamTrouble ? "Reconnecting" : "Live"}${streamStatus ? ` · ${formatUptime(now - streamStatus.startedAtMs)}` : ""}`
            : onAir
              ? output.type === "display"
                ? "Live"
                : "Streaming"
              : "Off"}
        </span>
      </div>

      <div className="flex items-start justify-between gap-2 px-0.5">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <Input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename()
                if (e.key === "Escape") {
                  setDraftName(output.name)
                  setRenaming(false)
                }
              }}
              className="h-6 px-1.5 py-0 text-sm"
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold">{output.name}</span>
              {isDefault && (
                <Badge variant="outline" className="h-4 px-1.5 text-[0.5625rem] tracking-wider uppercase">
                  Default
                </Badge>
              )}
            </div>
          )}
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {output.type === "display" ? (
              <MonitorIcon className="size-3 shrink-0" />
            ) : output.type === "stream" ? (
              <CastIcon className="size-3 shrink-0" />
            ) : (
              <RadioIcon className="size-3 shrink-0" />
            )}
            <span className="truncate">{transportLabel(output, monitorLabel)}</span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label={`${output.name} options`}
          >
            <MoreHorizontalIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={onEdit}>
              <SettingsIcon className="size-3.5" />
              Edit settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setDraftName(output.name)
                setRenaming(true)
              }}
            >
              <PencilIcon className="size-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <CopyIcon className="size-3.5" />
              Duplicate
            </DropdownMenuItem>
            {!isDefault && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                  <Trash2Icon className="size-3.5" />
                  Remove
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {streaming && streamStatus && <StreamHealth status={streamStatus} />}

      <div className="flex items-center justify-between px-0.5 pb-0.5">
        <span className="truncate text-[0.6875rem] text-muted-foreground">{theme?.name ?? "No theme"}</span>
        <Switch
          checked={onAir}
          disabled={busy}
          onCheckedChange={handleToggle}
          aria-label={`${output.name} on air`}
        />
      </div>

      <Dialog open={confirmingStop} onOpenChange={setConfirmingStop}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>End the livestream?</DialogTitle>
            <DialogDescription>
              Everyone watching {output.name} will see the broadcast end. Going live again starts
              a new stream on some platforms.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton={false}>
            <Button variant="ghost" onClick={() => setConfirmingStop(false)}>
              Keep streaming
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmingStop(false)
                onToggle(false)
              }}
            >
              End stream
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

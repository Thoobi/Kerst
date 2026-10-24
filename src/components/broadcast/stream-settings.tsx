import { useCallback, useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  NDI_FRAME_RATE_OPTIONS,
  STREAM_BITRATE_OPTIONS,
  STREAM_PLATFORM_LABELS,
  STREAM_RESOLUTION_OPTIONS,
} from "@/lib/broadcast-output-control"
import type {
  BroadcastOutputStreamSettings,
  CameraInfo,
  DeviceInfo,
  FfmpegInfo,
  NdiFrameRate,
  StreamDestinationSettings,
  StreamPlatform,
} from "@/types"
import { STREAM_PLATFORM_URLS, newStreamDestination } from "@/types"

const GRAPHICS_ONLY = "__graphics__"
const NO_AUDIO = "__silent__"

const KEY_HELP: Record<StreamPlatform, string> = {
  youtube: "YouTube Studio → Go live → Stream key",
  facebook: "Facebook Live Producer → Streaming software → Stream key",
  custom: "The key your streaming server gave you",
}

/** Hardware encoders leave the CPU free for the rest of Litdeck. */
function describeEncoder(encoder: string): string {
  const names: Record<string, string> = {
    h264_nvenc: "NVIDIA GPU",
    h264_vaapi: "GPU (VAAPI)",
    h264_qsv: "Intel Quick Sync",
    h264_amf: "AMD GPU",
    h264_mf: "Windows Media Foundation",
    h264_videotoolbox: "Apple VideoToolbox",
    libx264: "CPU (x264)",
    libopenh264: "CPU (OpenH264)",
  }
  return names[encoder] ?? encoder
}

function Label({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <span id={id} className="text-xs text-muted-foreground">
      {children}
    </span>
  )
}

function DestinationRow({
  destination,
  onChange,
  onRemove,
  canRemove,
}: {
  destination: StreamDestinationSettings
  onChange: (patch: Partial<StreamDestinationSettings>) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const [showKey, setShowKey] = useState(false)
  const labelId = `dest-${destination.id}`
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-card p-2.5",
        !destination.enabled && "opacity-60"
      )}
    >
      <div className="flex items-center gap-2">
        <Select
          value={destination.platform}
          onValueChange={(value) => {
            const platform = value as StreamPlatform
            onChange({
              platform,
              url: platform === "custom" ? "" : STREAM_PLATFORM_URLS[platform],
            })
          }}
        >
          <SelectTrigger aria-labelledby={labelId} className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STREAM_PLATFORM_LABELS) as StreamPlatform[]).map(
              (p) => (
                <SelectItem key={p} value={p}>
                  {STREAM_PLATFORM_LABELS[p]}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
        <Switch
          checked={destination.enabled}
          onCheckedChange={(enabled) => onChange({ enabled })}
          aria-label={`Stream to ${STREAM_PLATFORM_LABELS[destination.platform]}`}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!canRemove}
          onClick={onRemove}
          aria-label="Remove destination"
          className="text-muted-foreground"
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
      {destination.platform === "custom" && (
        <Input
          value={destination.url}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="rtmp://server/app"
          aria-label="Server URL"
          className="h-8"
        />
      )}
      <div className="relative">
        <Input
          id={labelId}
          type={showKey ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          value={destination.key}
          onChange={(e) => onChange({ key: e.target.value })}
          placeholder="Stream key"
          className="h-8 pr-8 font-mono text-xs"
        />
        <button
          type="button"
          onClick={() => setShowKey((v) => !v)}
          aria-label={showKey ? "Hide stream key" : "Show stream key"}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {showKey ? (
            <EyeOffIcon className="size-3.5" />
          ) : (
            <EyeIcon className="size-3.5" />
          )}
        </button>
      </div>
      <span className="text-[0.6875rem] text-muted-foreground">
        {KEY_HELP[destination.platform]}
      </span>
    </div>
  )
}

export function StreamSettings({
  value,
  onChange,
}: {
  value: BroadcastOutputStreamSettings
  onChange: (patch: Partial<BroadcastOutputStreamSettings>) => void
}) {
  const [cameras, setCameras] = useState<CameraInfo[]>([])
  const [audioDevices, setAudioDevices] = useState<DeviceInfo[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [info, setInfo] = useState<FfmpegInfo | null>(null)
  const [infoError, setInfoError] = useState<string | null>(null)

  const loadDevices = useCallback(
    () =>
      Promise.all([
        invoke<CameraInfo[]>("list_stream_cameras").catch(() => []),
        invoke<DeviceInfo[]>("get_audio_devices").catch(() => []),
      ]).then(([cams, devices]) => {
        setCameras(cams)
        setAudioDevices(devices)
      }),
    []
  )

  const refreshDevices = async () => {
    setRefreshing(true)
    try {
      await loadDevices()
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadDevices()
    invoke<FfmpegInfo>("get_stream_info")
      .then(setInfo)
      .catch((e) => setInfoError(String(e)))
  }, [loadDevices])

  const updateDestination = (
    id: string,
    patch: Partial<StreamDestinationSettings>
  ) =>
    onChange({
      destinations: value.destinations.map((d) =>
        d.id === id ? { ...d, ...patch } : d
      ),
    })

  const usedPlatforms = new Set(value.destinations.map((d) => d.platform))
  const nextPlatform: StreamPlatform = !usedPlatforms.has("youtube")
    ? "youtube"
    : !usedPlatforms.has("facebook")
      ? "facebook"
      : "custom"

  // A saved camera or device that is unplugged still shows, so the setting
  // isn't silently lost.
  const cameraMissing =
    value.camera !== null && !cameras.some((c) => c.id === value.camera)
  const audioMissing =
    value.audioDevice !== null &&
    !audioDevices.some((d) => d.id === value.audioDevice)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Destinations</Label>
        {value.destinations.map((destination) => (
          <DestinationRow
            key={destination.id}
            destination={destination}
            canRemove={value.destinations.length > 1}
            onChange={(patch) => updateDestination(destination.id, patch)}
            onRemove={() =>
              onChange({
                destinations: value.destinations.filter(
                  (d) => d.id !== destination.id
                ),
              })
            }
          />
        ))}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            onChange({
              destinations: [
                ...value.destinations,
                newStreamDestination(nextPlatform),
              ],
            })
          }
        >
          <PlusIcon className="size-3.5" />
          Add destination
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label id="stream-camera-label">Picture</Label>
          <Button
            variant="ghost"
            size="xs"
            disabled={refreshing}
            onClick={() => void refreshDevices()}
            className="h-5 gap-1 px-1.5 text-[0.625rem] text-muted-foreground"
          >
            <RefreshCwIcon
              className={cn("size-3", refreshing && "animate-spin")}
            />
            Refresh
          </Button>
        </div>
        <Select
          value={value.camera ?? GRAPHICS_ONLY}
          onValueChange={(v) =>
            onChange({ camera: v === GRAPHICS_ONLY ? null : v })
          }
        >
          <SelectTrigger
            aria-labelledby="stream-camera-label"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GRAPHICS_ONLY}>
              Slides and lyrics only
            </SelectItem>
            {cameras.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                Camera: {c.name}
              </SelectItem>
            ))}
            {cameraMissing && value.camera && (
              <SelectItem value={value.camera}>
                Camera: {value.camera} (not connected)
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {value.camera !== null && (
          <span className="text-[0.6875rem] leading-snug text-muted-foreground">
            Lyrics and scripture go over the camera. Pick a theme with a
            transparent background, like a lower third.
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label id="stream-resolution-label">Resolution</Label>
          <Select
            value={value.resolution}
            onValueChange={(v) =>
              onChange({
                resolution: v as BroadcastOutputStreamSettings["resolution"],
              })
            }
          >
            <SelectTrigger
              aria-labelledby="stream-resolution-label"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STREAM_RESOLUTION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label id="stream-framerate-label">Frame rate</Label>
          <Select
            value={value.frameRate}
            onValueChange={(v) => onChange({ frameRate: v as NdiFrameRate })}
          >
            <SelectTrigger
              aria-labelledby="stream-framerate-label"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NDI_FRAME_RATE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label id="stream-bitrate-label">Bitrate</Label>
          <Select
            value={String(value.videoBitrateKbps)}
            onValueChange={(v) => onChange({ videoBitrateKbps: Number(v) })}
          >
            <SelectTrigger
              aria-labelledby="stream-bitrate-label"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STREAM_BITRATE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <span className="-mt-2 text-[0.6875rem] leading-snug text-muted-foreground">
        4.5 Mbps suits most connections. Upload speed should be at least double the bitrate for
        each destination.
      </span>

      <div
        className={cn(
          "grid gap-3",
          value.camera !== null ? "grid-cols-[1fr_7rem]" : "grid-cols-1"
        )}
      >
        <div className="flex flex-col gap-1.5">
          <Label id="stream-audio-label">Sound</Label>
          <Select
            value={value.audioDevice ?? NO_AUDIO}
            onValueChange={(v) =>
              onChange({ audioDevice: v === NO_AUDIO ? null : v })
            }
          >
            <SelectTrigger
              aria-labelledby="stream-audio-label"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_AUDIO}>No sound</SelectItem>
              {audioDevices.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
              {audioMissing && value.audioDevice && (
                <SelectItem value={value.audioDevice}>
                  {value.audioDevice} (not connected)
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        {value.camera !== null && (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="stream-audio-delay"
              className="text-xs text-muted-foreground"
            >
              Sound delay (ms)
            </label>
            <Input
              id="stream-audio-delay"
              type="number"
              min={0}
              max={2000}
              step={10}
              value={value.audioDelayMs}
              onChange={(e) =>
                onChange({
                  audioDelayMs: Math.max(
                    0,
                    Math.min(2000, Number(e.target.value) || 0)
                  ),
                })
              }
            />
          </div>
        )}
      </div>
      <span className="-mt-2 text-[0.6875rem] leading-snug text-muted-foreground">
        Use the feed from your sound desk. Its first two channels become left
        and right.
        {value.camera !== null &&
          " If lips move after the sound, raise the delay."}
      </span>

      <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2 text-[0.6875rem] leading-snug text-muted-foreground">
        {info ? (
          info.encoder ? (
            <>
              Encoding on {describeEncoder(info.encoder)} · ffmpeg{" "}
              {info.version}
              {!info.rtmps &&
                " · this ffmpeg can't use RTMPS, so YouTube and Facebook won't connect"}
            </>
          ) : (
            "ffmpeg has no working H.264 encoder on this computer."
          )
        ) : infoError ? (
          infoError
        ) : (
          "Checking this computer's video encoder…"
        )}
        <br />
        Streaming songs needs a streaming licence from your licensing body (for
        example CCLI).
      </div>
    </div>
  )
}

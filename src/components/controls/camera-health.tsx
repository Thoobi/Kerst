import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { VideoIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DEVICE_CAMERA_PREFIX, isDeviceCamera } from "@/lib/mjpeg-reader"
import { cn } from "@/lib/utils"
import { worstState, type CameraHealth } from "@/lib/camera-health"
import { useSettingsStore } from "@/stores/settings-store"

/** How often the health is asked for, in ms. */
const POLL_MS = 2000

const LABEL: Record<CameraHealth["state"], string> = {
  live: "Live",
  stalled: "No pictures for a few seconds",
  connecting: "Connecting…",
  down: "Can't be shown, retrying",
}

const DOT: Record<CameraHealth["state"], string> = {
  live: "bg-emerald-500",
  stalled: "bg-amber-500",
  connecting: "bg-amber-500 animate-pulse",
  down: "bg-red-500",
}

function rate(kbps: number): string {
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mb/s` : `${kbps} kb/s`
}

/**
 * The cameras in use, in the navbar: a dot as green as the worst of them
 * (live, amber stalling or reconnecting, red down), and on click each one's
 * state, why it's down, its picture size and data rate. Hidden while no
 * camera is in use.
 */
export function CameraHealthIndicator() {
  const saved = useSettingsStore((s) => s.cameras)
  const [cameras, setCameras] = useState<CameraHealth[]>([])

  useEffect(() => {
    let live = true
    const poll = () => {
      invoke<CameraHealth[]>("camera_health")
        .then((list) => {
          if (live) setCameras(list)
        })
        .catch(() => {})
    }
    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])

  const worst = worstState(cameras)
  if (!worst) return null
  const nameOf = (url: string) => saved.find((c) => c.url === url)?.name ?? (isDeviceCamera(url) ? url.slice(DEVICE_CAMERA_PREFIX.length) : url)
  const summary =
    worst === "live" ? `${cameras.length === 1 ? "Camera" : "Cameras"} live` : `Camera: ${LABEL[worst].toLowerCase()}`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={summary}
          aria-label={summary}
          className="relative flex size-8 items-center justify-center rounded-md text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <VideoIcon className="size-4" />
          <span className={cn("absolute top-1.5 right-1.5 size-2 rounded-full ring-2 ring-card", DOT[worst])} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <p className="border-b border-border px-3 py-2 text-xs font-semibold">Cameras in use</p>
        <ul className="flex flex-col divide-y divide-border">
          {cameras.map((camera) => (
            <li key={camera.url} className="flex flex-col gap-0.5 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={cn("size-2 shrink-0 rounded-full", DOT[camera.state])} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{nameOf(camera.url)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{LABEL[camera.state]}</span>
              </div>
              {camera.problem && camera.state !== "live" && (
                <p className="pl-4 text-xs text-amber-600 dark:text-amber-400">{camera.problem}</p>
              )}
              <p className="pl-4 text-[0.6875rem] text-muted-foreground tabular-nums">
                {[
                  camera.width && camera.height ? `${camera.width}×${camera.height}` : null,
                  camera.state === "live" || camera.kbps > 0 ? rate(camera.kbps) : null,
                  camera.readers > 0 ? `shown in ${camera.readers} ${camera.readers === 1 ? "place" : "places"}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

import { useState } from "react"
import { PlusIcon, SearchIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { findCameraAgain } from "@/lib/camera-discovery"
import { resolveCameraAddress } from "@/lib/mjpeg-reader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CameraLayer } from "@/components/ui/camera-layer"
import { useSettingsStore } from "@/stores/settings-store"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { useTimerStore } from "@/stores/timer-store"
import type { SavedCamera } from "@/stores/settings-store"

/** Point the saved camera, and everything showing it, at `url`. */
function moveCamera(cameraId: string, url: string) {
  useSettingsStore.getState().updateCamera(cameraId, { url })
  // The phone's Wi-Fi address changed: every theme, Bible style and timer
  // showing this camera follows it.
  useBroadcastStore.getState().retargetCamera(cameraId, url)
  useTimerStore.getState().retargetCamera(cameraId, url)
}

function CameraRow({ camera }: { camera: SavedCamera }) {
  const { updateCamera, removeCamera } = useSettingsStore.getState()
  const [state, setState] = useState<"connecting" | "live" | "error">("connecting")
  // Why it can't be shown, as the camera or the relay put it.
  const [problem, setProblem] = useState<string | null>(null)
  // Share of the subnet searched, while looking for the camera's new address.
  const [searching, setSearching] = useState<number | null>(null)
  // The address as typed; connected to on Enter or leaving the field, not per keystroke.
  const [draft, setDraft] = useState<string | null>(null)

  const findAgain = async () => {
    setSearching(0)
    const url = await findCameraAgain(camera.url, setSearching)
    setSearching(null)
    if (url) {
      moveCamera(camera.id, url)
      toast.success(`Found ${camera.name}`, { description: url })
    } else {
      toast.error(`Couldn't find ${camera.name}`, {
        description: "Check the phone is on the same Wi-Fi with its camera app open, then enter the address it shows.",
      })
    }
  }

  return (
    <div className="flex gap-3 rounded-lg border p-2.5">
      <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-md bg-black">
        <CameraLayer url={camera.url} fit="cover" onStateChange={(next, why) => {
            setState(next)
            setProblem(why)
          }} className="absolute inset-0 size-full" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Input
          value={camera.name}
          onChange={(e) => updateCamera(camera.id, { name: e.target.value })}
          className="h-7"
          aria-label="Camera name"
        />
        <Input
          value={draft ?? camera.url}
          title="When the phone's Wi-Fi address changes, update it here: everything using this camera follows"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
          }}
          onBlur={() => {
            if (draft === null) return
            const typed = draft
            setDraft(null)
            void resolveCameraAddress(typed).then(({ url }) => {
              if (url && url !== camera.url) moveCamera(camera.id, url)
            })
          }}
          className="h-7 font-mono text-xs"
          aria-label="Camera address"
        />
        <div className="flex items-start justify-between gap-2">
          <span
            className={
              state === "live"
                ? "text-xs text-emerald-600 dark:text-emerald-400"
                : state === "error"
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
            }
          >
            {searching !== null
              ? `Looking on the network… ${Math.round(searching * 100)}%`
              : state === "live"
                ? "Connected"
                : state === "error"
                  ? `${problem ?? "Can't reach the camera."} Retrying…`
                  : "Connecting…"}
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            {state !== "live" && (
              <Button
                variant="ghost"
                size="xs"
                disabled={searching !== null}
                onClick={() => void findAgain()}
                title="The phone may have a new Wi-Fi address: look for it nearby on the network"
              >
                <SearchIcon />
                Find on network
              </Button>
            )}
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            onClick={() => removeCamera(camera.id)}
            aria-label={`Remove ${camera.name}`}
            title="Remove"
          >
            <Trash2Icon />
          </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Network cameras to use as a background behind themes, the Bible style or
 * the timer: a phone running DroidCam or IP Webcam, or any MJPEG camera on the network.
 */
export function CamerasSection() {
  const cameras = useSettingsStore((s) => s.cameras)
  const [url, setUrl] = useState("")
  const [name, setName] = useState("")

  // Asking the phone which app it runs, when only an IP was typed.
  const [checking, setChecking] = useState(false)

  const add = async () => {
    if (!url.trim() || checking) return
    setChecking(true)
    const resolved = await resolveCameraAddress(url)
    setChecking(false)
    if (!resolved.url) return
    const cameraName = name.trim() || `Camera ${cameras.length + 1}`
    useSettingsStore.getState().addCamera({ name: cameraName, url: resolved.url })
    setUrl("")
    setName("")
    if (!resolved.found) {
      toast.warning(`Nothing answered at that IP yet`, {
        description: `Saved with IP Webcam's port. If it's DroidCam, change ${cameraName}'s address below to end in :4747.`,
      })
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Use a camera on your network as a background, e.g. behind the Lower Thirds band. With{" "}
        <span className="font-medium text-foreground">DroidCam</span> or{" "}
        <span className="font-medium text-foreground">IP Webcam</span> on a phone, open the app and enter just the IP
        it shows, like <span className="font-mono text-xs">192.168.1.57</span>; Litdeck works out which app it is and
        reconnects on its own if Wi-Fi drops. DroidCam serves one viewer at a time, so close it in any browser or other
        computer first. Other cameras: enter their full MJPEG address.
      </p>

      <form
        className="flex flex-col gap-2 rounded-lg border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Add a camera</label>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Pulpit)" className="w-40" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Phone's IP, e.g. 192.168.1.57"
            disabled={checking}
            className="flex-1 font-mono text-xs"
            aria-label="Camera address"
          />
          <Button type="submit" size="sm" disabled={!url.trim() || checking}>
            <PlusIcon />
            {checking ? "Checking…" : "Add"}
          </Button>
        </div>
      </form>

      {cameras.length > 0 ? (
        <div className="flex flex-col gap-2">
          {cameras.map((camera) => (
            <CameraRow key={camera.id} camera={camera} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No cameras yet.</p>
      )}
    </div>
  )
}

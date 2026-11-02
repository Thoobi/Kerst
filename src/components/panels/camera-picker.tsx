import { CameraIcon, PlusIcon, VideoOffIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { openSettings } from "@/lib/settings-dialog"
import { useSettingsStore } from "@/stores/settings-store"
import type { CameraFeed } from "@/types"

const NONE = "__none__"

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * Choose a network camera (added in Settings → Cameras) to show live in
 * place of the theme's background. The feed keeps the camera's id and its
 * address: output windows load the address, and changing the camera's
 * address in Settings updates every feed with its id.
 */
export function CameraPicker({
  feed,
  onChoose,
}: {
  feed: CameraFeed | null | undefined
  onChoose: (feed: CameraFeed | null) => void
}) {
  const cameras = useSettingsStore((s) => s.cameras)
  const current = cameras.find((c) => c.id === feed?.cameraId) ?? cameras.find((c) => c.url === feed?.url)
  const url = feed?.url ?? null
  const label = current?.name ?? (url ? hostOf(url) : "Choose camera")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="max-w-48" title={url ? `Camera: ${url}` : "Choose a camera"}>
          <CameraIcon />
          <span className="truncate">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs">Live camera behind the words</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current?.id ?? NONE}
          onValueChange={(value) => {
            const camera = cameras.find((c) => c.id === value)
            onChoose(camera ? { cameraId: camera.id, url: camera.url, fit: feed?.fit ?? "cover" } : null)
          }}
        >
          <DropdownMenuRadioItem value={NONE} className="text-xs">
            <VideoOffIcon className="size-3.5 text-muted-foreground" />
            No camera
          </DropdownMenuRadioItem>
          {cameras.length > 0 && <DropdownMenuSeparator />}
          {cameras.map((camera) => (
            <DropdownMenuRadioItem key={camera.id} value={camera.id} className="text-xs">
              <CameraIcon className="size-3.5 text-muted-foreground" />
              <span className="truncate">{camera.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs" onSelect={() => openSettings("cameras")}>
          <PlusIcon className="size-3.5" />
          Add or manage cameras…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

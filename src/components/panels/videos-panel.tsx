import { useEffect, useState } from "react"
import { ask, open } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"
import {
  EllipsisIcon,
  FilmIcon,
  PencilIcon,
  RepeatIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { libraryFileUrl } from "@/lib/library-api"
import { isTypingOrHandled } from "@/lib/operator-keys"
import { formatTime } from "@/lib/video-playback"
import { cn } from "@/lib/utils"
import { useBroadcastStore } from "@/stores"
import { useVideosStore, type VideoImportOutcome } from "@/stores/videos-store"
import type { Video } from "@/types"

/** Containers the library accepts (rhema_library::videos::VIDEO_EXTENSIONS). */
const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "webm", "ogv", "mkv"]

function reportImport(outcome: VideoImportOutcome) {
  if (outcome.imported.length === 1) {
    toast.success(`Imported “${outcome.imported[0].title}”`)
  } else if (outcome.imported.length > 1) {
    toast.success(`Imported ${outcome.imported.length} videos`)
  }
  for (const { file, reason } of outcome.unplayable) {
    toast.warning(`Can't play ${file}`, {
      description: `Not imported: ${reason}. MP4 (H.264 video, AAC audio) plays everywhere; convert it to that and import it again.`,
    })
  }
  for (const { file, reason } of outcome.failed) {
    toast.error(`Could not import ${file}`, { description: reason })
  }
}

async function pickAndImport() {
  const picked = await open({
    multiple: true,
    title: "Import videos",
    filters: [{ name: "Videos", extensions: VIDEO_EXTENSIONS }],
  })
  if (!picked || picked.length === 0) return
  reportImport(await useVideosStore.getState().importPaths(picked))
}

/**
 * The video library: import clips, click one to put it on the live output.
 * Playback is controlled from under the Live panel; Space here plays and
 * pauses.
 */
export function VideosPanel() {
  const videos = useVideosStore((s) => s.videos)
  const loadError = useVideosStore((s) => s.loadError)
  const importing = useVideosStore((s) => s.importing)
  const isLive = useBroadcastStore((s) => s.isLive)
  const liveVideoId = useBroadcastStore((s) => s.liveVerse?.video?.id ?? null)
  const [renaming, setRenaming] = useState<string | null>(null)

  useEffect(() => {
    void useVideosStore.getState().loadVideos()
  }, [])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (isTypingOrHandled(event) || event.key !== " " || liveVideoId === null) return
    event.preventDefault()
    useVideosStore.getState().togglePlay()
  }

  return (
    <div
      data-slot="videos-panel"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs outline-none"
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2.5">
        <span className="text-xs text-muted-foreground">
          {videos.length > 0 ? `${videos.length} video${videos.length === 1 ? "" : "s"}` : "Videos"}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => void pickAndImport()}
          disabled={importing !== null}
          title="Import MP4, MOV or WebM videos"
        >
          <UploadIcon />
          Import
        </Button>
      </div>

      {importing && (
        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="truncate text-xs">
            {importing.phase === "copying" ? "Copying" : "Checking"} {importing.name}
            {importing.count > 1 && (
              <span className="text-muted-foreground">
                {" "}
                · {importing.index + 1} of {importing.count}
              </span>
            )}
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full bg-primary transition-[width]",
                importing.phase === "checking" && "animate-pulse"
              )}
              style={{
                width:
                  importing.phase === "checking"
                    ? "100%"
                    : `${importing.total ? (importing.copied / importing.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadError ? (
          <p className="p-4 text-xs text-destructive">{loadError}</p>
        ) : videos.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2.5 p-2.5">
            {videos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                live={isLive && liveVideoId === video.id}
                cued={!isLive && liveVideoId === video.id}
                renaming={renaming === video.id}
                onRename={() => setRenaming(video.id)}
                onRenameDone={() => setRenaming(null)}
              />
            ))}
          </div>
        ) : (
          !importing && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <FilmIcon className="size-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">No videos yet</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Import MP4, MOV or WebM files. They're copied into the library, so they still play
                  once the USB stick has gone home.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void pickAndImport()}>
                <UploadIcon />
                Import videos
              </Button>
            </div>
          )
        )}
      </div>
    </div>
  )
}

function VideoCard({
  video,
  live,
  cued,
  renaming,
  onRename,
  onRenameDone,
}: {
  video: Video
  live: boolean
  cued: boolean
  renaming: boolean
  onRename: () => void
  onRenameDone: () => void
}) {
  const onDelete = async () => {
    const confirmed = await ask(`Delete “${video.title}” from the library?`, {
      title: "Delete video",
      kind: "warning",
      okLabel: "Delete",
    })
    if (!confirmed) return
    try {
      await useVideosStore.getState().deleteVideo(video.id)
    } catch (error) {
      toast.error("Could not delete the video", { description: String(error) })
    }
  }

  const onToggleLoop = async () => {
    try {
      await useVideosStore.getState().setLoop(video.id, !video.loop)
    } catch (error) {
      toast.error("Could not change looping", { description: String(error) })
    }
  }

  return (
    <div className="group flex min-w-0 flex-col gap-1">
      <button
        type="button"
        onClick={() => useVideosStore.getState().presentVideo(video.id)}
        className={cn(
          "relative aspect-video overflow-hidden rounded-md bg-black ring-1 ring-border transition-shadow outline-none hover:ring-foreground/40 focus-visible:ring-2 focus-visible:ring-ring",
          cued && "ring-2 ring-primary",
          live && "ring-2 ring-live-pulse"
        )}
        title={`${video.title}: send to live`}
      >
        {video.poster_path ? (
          <img
            src={libraryFileUrl(video.poster_path)}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="size-full object-contain"
          />
        ) : (
          <FilmIcon className="m-auto size-6 text-white/40" />
        )}
        {video.duration_ms !== null && (
          <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[0.625rem] text-white">
            {formatTime(video.duration_ms / 1000)}
          </span>
        )}
        {video.loop && (
          <span
            className="absolute bottom-1 left-1 rounded bg-black/70 p-1 text-white"
            title="Loops"
          >
            <RepeatIcon className="size-2.5" />
          </span>
        )}
        {live && (
          <span className="absolute top-1 right-1 rounded bg-live-pulse px-1.5 py-0.5 text-[0.5625rem] font-semibold tracking-wider text-white uppercase">
            Live
          </span>
        )}
        {cued && (
          <span className="absolute top-1 right-1 rounded bg-primary px-1.5 py-0.5 text-[0.5625rem] font-semibold tracking-wider text-primary-foreground uppercase">
            Cued
          </span>
        )}
      </button>

      <div className="flex min-w-0 items-center gap-0.5">
        {renaming ? (
          <RenameInput video={video} onDone={onRenameDone} />
        ) : (
          <span className="min-w-0 flex-1 truncate px-0.5 text-xs" title={video.source_name ?? video.title}>
            {video.title}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              aria-label={`More for ${video.title}`}
            >
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuCheckboxItem checked={video.loop} onCheckedChange={() => void onToggleLoop()}>
              Loop
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem onSelect={onRename}>
              <PencilIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => void onDelete()}>
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function RenameInput({ video, onDone }: { video: Video; onDone: () => void }) {
  const [title, setTitle] = useState(video.title)

  const commit = async () => {
    onDone()
    const trimmed = title.trim()
    if (!trimmed || trimmed === video.title) return
    try {
      await useVideosStore.getState().rename(video.id, trimmed)
    } catch (error) {
      toast.error("Could not rename the video", { description: String(error) })
    }
  }

  return (
    <Input
      autoFocus
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape") onDone()
      }}
      aria-label="Video title"
      className="h-6 flex-1 px-1.5 text-xs"
    />
  )
}

import { toast } from "sonner"
import { FilmIcon, ImageOffIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { libraryFileUrl } from "@/lib/library-api"
import { useVideosStore } from "@/stores/videos-store"

const THEME = "theme"

/**
 * Choose a motion background for a song or text: a library video looped
 * silently behind its words instead of the theme's background.
 */
export function BackgroundPicker({
  videoId,
  onChoose,
}: {
  videoId: string | null
  onChoose: (videoId: string | null) => Promise<void>
}) {
  const videos = useVideosStore((s) => s.videos)
  const current = videos.find((v) => v.id === videoId) ?? null

  const choose = async (value: string) => {
    try {
      await onChoose(value === THEME ? null : value)
    } catch (error) {
      toast.error("Could not change the background", { description: String(error) })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="max-w-40"
          title={current ? `Background: ${current.title}` : "Background: the theme's"}
        >
          {current?.poster_path ? (
            <img
              src={libraryFileUrl(current.poster_path)}
              alt=""
              className="h-4 w-7 shrink-0 rounded-sm object-cover"
            />
          ) : (
            <FilmIcon />
          )}
          <span className="truncate">{current ? current.title : "Background"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-64">
        <DropdownMenuLabel className="text-xs">Behind the words</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current?.id ?? THEME} onValueChange={(value) => void choose(value)}>
          <DropdownMenuRadioItem value={THEME} className="text-xs">
            <ImageOffIcon className="size-3.5 text-muted-foreground" />
            Theme background
          </DropdownMenuRadioItem>
          {videos.length > 0 && <DropdownMenuSeparator />}
          {videos.map((video) => (
            <DropdownMenuRadioItem key={video.id} value={video.id} className="text-xs">
              {video.poster_path ? (
                <img
                  src={libraryFileUrl(video.poster_path)}
                  alt=""
                  loading="lazy"
                  className="h-5 w-9 shrink-0 rounded-sm bg-black object-cover"
                />
              ) : (
                <FilmIcon className="size-3.5 text-muted-foreground" />
              )}
              <span className="truncate">{video.title}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {videos.length === 0 && (
          <p className="px-2 py-1.5 text-[0.6875rem] text-muted-foreground">
            Import a video in the Videos tab to use it here.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

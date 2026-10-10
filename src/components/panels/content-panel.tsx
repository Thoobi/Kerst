import { BookOpenIcon, FilmIcon, MegaphoneIcon, MusicIcon, PresentationIcon } from "lucide-react"
import { SearchPanel } from "@/components/panels/search-panel"
import { SlidesPanel } from "@/components/panels/slides-panel"
import { SongsPanel } from "@/components/panels/songs-panel"
import { VideosPanel } from "@/components/panels/videos-panel"
import { TextsPanel } from "@/components/panels/texts-panel"
import { useContentTabStore, type ContentTab } from "@/stores/content-tab-store"
import { cn } from "@/lib/utils"


const TABS: { id: ContentTab; label: string; icon: typeof BookOpenIcon }[] = [
  { id: "bible", label: "Bible", icon: BookOpenIcon },
  { id: "songs", label: "Songs", icon: MusicIcon },
  { id: "slides", label: "Slides", icon: PresentationIcon },
  { id: "videos", label: "Videos", icon: FilmIcon },
  { id: "texts", label: "Texts", icon: MegaphoneIcon },
]

/**
 * What the operator can put on screen, one tab per kind of content.
 * Inactive tabs stay mounted (just hidden) so switching never loses a
 * search or a scroll position.
 */
export function ContentPanel() {
  const tab = useContentTabStore((s) => s.tab)
  const setTab = useContentTabStore((s) => s.setTab)

  return (
    <div data-slot="content-panel" className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div role="tablist" className="flex shrink-0 items-center gap-0.5 self-start rounded-lg bg-muted p-0.5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
              tab === id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className={cn("size-3.5", tab === id ? "text-primary" : "text-muted-foreground")} />
            {label}
          </button>
        ))}
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "bible" && "hidden")}>
        <SearchPanel />
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "songs" && "hidden")}>
        <SongsPanel />
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "slides" && "hidden")}>
        <SlidesPanel />
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "videos" && "hidden")}>
        <VideosPanel />
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "texts" && "hidden")}>
        <TextsPanel />
      </div>
    </div>
  )
}

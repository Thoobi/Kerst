import { useEffect, useRef, useState } from "react"
import { ask } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"
import {
  MusicIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SongEditorDialog } from "@/components/panels/song-editor-dialog"
import { cn } from "@/lib/utils"
import { isTypingOrHandled } from "@/lib/operator-keys"
import { useBroadcastStore, useSongsStore } from "@/stores"
import type { Song } from "@/types"

/** Letter keys that jump to a section, as on most worship software. */
const SECTION_KEYS: Record<string, string> = {
  c: "C",
  b: "B",
  p: "PC",
  t: "T",
  i: "I",
  o: "O",
}

/**
 * The song library: search, pick a song, click a screen to put it live.
 * Arrows step through the sung order; 1–9 jump to that verse, C to the next
 * chorus, B bridge, P pre-chorus, T tag, I intro, O outro.
 */
export function SongsPanel() {
  const results = useSongsStore((s) => s.results)
  const query = useSongsStore((s) => s.query)
  const activeSong = useSongsStore((s) => s.activeSong)
  const slides = useSongsStore((s) => s.slides)
  const cursor = useSongsStore((s) => s.cursor)
  const presented = useSongsStore((s) => s.presented)
  const loadError = useSongsStore((s) => s.loadError)
  const isLive = useBroadcastStore((s) => s.isLive)
  const liveVerse = useBroadcastStore((s) => s.liveVerse)

  const [editing, setEditing] = useState<{ song: Song | null } | null>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    void useSongsStore.getState().search("")
  }, [])

  useEffect(() => {
    if (cursor !== null)
      cardRefs.current[cursor]?.scrollIntoView({ block: "nearest" })
  }, [cursor])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (isTypingOrHandled(event)) return
    const { step, jumpToSection } = useSongsStore.getState()
    const key = event.key
    if (
      key === "ArrowRight" ||
      key === "ArrowDown" ||
      key === "PageDown" ||
      key === " "
    )
      step(1)
    else if (key === "ArrowLeft" || key === "ArrowUp" || key === "PageUp")
      step(-1)
    else if (/^[1-9]$/.test(key)) jumpToSection(`V${key}`)
    else if (SECTION_KEYS[key.toLowerCase()])
      jumpToSection(SECTION_KEYS[key.toLowerCase()])
    else return
    event.preventDefault()
  }

  const onDelete = async () => {
    if (!activeSong) return
    const confirmed = await ask(
      `Delete “${activeSong.title}” from the song library?`,
      {
        title: "Delete song",
        kind: "warning",
        okLabel: "Delete",
      }
    )
    if (!confirmed) return
    try {
      await useSongsStore.getState().deleteSong(activeSong.id)
    } catch (error) {
      toast.error("Could not delete the song", { description: String(error) })
    }
  }

  const onAirIndex =
    isLive && presented !== null && liveVerse === presented ? cursor : null

  return (
    <>
      <div
        data-slot="songs-panel"
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs outline-none"
        onKeyDown={onKeyDown}
        tabIndex={-1}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2.5">
          <div className="relative w-64 min-w-0">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) =>
                void useSongsStore.getState().search(e.target.value)
              }
              placeholder="Search titles and lyrics"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setEditing({ song: null })}
          >
            <PlusIcon />
            New song
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(11rem,15rem)_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto border-r border-border p-1.5">
            {loadError ? (
              <p className="p-2 text-xs text-destructive">{loadError}</p>
            ) : results.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">
                {query.trim() ? "No songs match." : "No songs yet."}
              </p>
            ) : (
              results.map((song) => (
                <button
                  key={song.id}
                  type="button"
                  onClick={() =>
                    void useSongsStore.getState().openSong(song.id)
                  }
                  className={cn(
                    "block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted",
                    activeSong?.id === song.id && "bg-muted"
                  )}
                >
                  <span className="block truncate text-xs font-medium">
                    {song.title}
                  </span>
                  <span className="block truncate text-[0.6875rem] text-muted-foreground">
                    {song.first_line ?? song.author ?? ""}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="flex min-h-0 flex-col">
            {activeSong ? (
              <>
                <div className="flex shrink-0 items-center gap-2 px-3 pt-2.5 pb-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {activeSong.title}
                    </div>
                    {activeSong.author && (
                      <div className="truncate text-[0.6875rem] text-muted-foreground">
                        {activeSong.author}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void onDelete()}
                    title="Delete this song"
                  >
                    <Trash2Icon />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing({ song: activeSong })}
                  >
                    <PencilIcon />
                    Edit
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {slides.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">
                      This song has no lyrics yet. Edit it to add some.
                    </p>
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2 p-2.5 pt-1">
                      {slides.map((slide, index) => {
                        const live = index === onAirIndex
                        return (
                          <button
                            key={`${slide.order}-${slide.page}`}
                            ref={(el) => {
                              cardRefs.current[index] = el
                            }}
                            type="button"
                            onClick={() =>
                              useSongsStore.getState().presentSlide(index)
                            }
                            className={cn(
                              "relative flex min-h-24 flex-col gap-1.5 rounded-md bg-surface-sunken p-2 text-left ring-1 ring-border transition-shadow outline-none hover:ring-foreground/40 focus-visible:ring-2 focus-visible:ring-ring",
                              index === cursor && "ring-2 ring-primary",
                              live && "ring-2 ring-live-pulse"
                            )}
                            title={`${slide.section.label}: send to live`}
                          >
                            <span className="flex items-center gap-1.5">
                              <span className="rounded bg-muted px-1 py-0.5 font-mono text-[0.625rem] font-semibold">
                                {slide.code}
                              </span>
                              <span className="truncate text-[0.625rem] text-muted-foreground">
                                {slide.section.label}
                                {slide.pages > 1 &&
                                  ` · ${slide.page + 1}/${slide.pages}`}
                              </span>
                              {live && (
                                <span className="ml-auto rounded bg-live-pulse px-1.5 py-0.5 text-[0.5625rem] font-semibold tracking-wider text-white uppercase">
                                  Live
                                </span>
                              )}
                            </span>
                            <span className="text-xs leading-snug">
                              {slide.lines.map((line, i) => (
                                <span key={i} className="block">
                                  {line}
                                </span>
                              ))}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <MusicIcon className="size-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    {results.length ? "Pick a song" : "Add your first song"}
                  </p>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                    Paste lyrics with headings like “Verse 1” and “Chorus”, and
                    they're split into screens for you.
                  </p>
                </div>
                {results.length === 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing({ song: null })}
                  >
                    <PlusIcon />
                    New song
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Outside the panel: React bubbles portal key events to their React
        parent, and typing lyrics must not step the live output. */}
      <SongEditorDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        song={editing?.song ?? null}
        onSaved={(song) => void useSongsStore.getState().openSong(song.id)}
      />
    </>
  )
}

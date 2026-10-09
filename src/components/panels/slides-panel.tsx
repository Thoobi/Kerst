import { useEffect, useRef } from "react"
import { ask } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"
import { PresentationIcon, Trash2Icon, UploadIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { deckSlideUrl } from "@/lib/library-api"
import { cn } from "@/lib/utils"
import { useBroadcastStore } from "@/stores"
import { useSlidesStore, type ImportOutcome } from "@/stores/slides-store"

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.ppt,.pptx,.pps,.ppsx,.key,.odp"

function reportImport(outcome: ImportOutcome) {
  for (const deck of outcome.imported) {
    toast.success(`Imported “${deck.title}”`, {
      description: `${deck.slides.length} slide${deck.slides.length === 1 ? "" : "s"}`,
    })
  }
  if (outcome.needsPdf.length > 0) {
    toast.warning("Save these as PDF first", {
      description: `${outcome.needsPdf.join(", ")} can't be imported directly yet. Export or save the presentation as a PDF, then import that.`,
    })
  }
  if (outcome.unsupported.length > 0) {
    toast.warning("Skipped files that aren't slides", {
      description: `${outcome.unsupported.join(", ")}. Import a PDF, or PNG/JPEG images.`,
    })
  }
  if (outcome.error) toast.error("Import failed", { description: outcome.error })
  if (outcome.cancelled) toast("Import cancelled")
}

/**
 * Imported presentations: pick a deck, click a slide to put it on the live
 * output, step with the arrow keys or a presentation clicker.
 */
export function SlidesPanel() {
  const decks = useSlidesStore((s) => s.decks)
  const activeDeck = useSlidesStore((s) => s.activeDeck)
  const cursor = useSlidesStore((s) => s.cursor)
  const importing = useSlidesStore((s) => s.importing)
  const loadError = useSlidesStore((s) => s.loadError)
  const isLive = useBroadcastStore((s) => s.isLive)
  const liveUrl = useBroadcastStore((s) => s.liveVerse?.image?.url ?? null)

  const fileInput = useRef<HTMLInputElement>(null)
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    void useSlidesStore.getState().loadDecks()
  }, [])

  // Keep the current slide in view when stepping with the keyboard.
  useEffect(() => {
    if (cursor !== null) thumbRefs.current[cursor]?.scrollIntoView({ block: "nearest" })
  }, [cursor])

  const pickFiles = () => fileInput.current?.click()

  const onFilesPicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = "" // so picking the same file again still fires
    if (files.length === 0) return
    reportImport(await useSlidesStore.getState().importFiles(files))
  }

  const onDelete = async () => {
    if (!activeDeck) return
    const confirmed = await ask(`Delete “${activeDeck.title}” and its ${activeDeck.slides.length} slides?`, {
      title: "Delete presentation",
      kind: "warning",
      okLabel: "Delete",
    })
    if (!confirmed) return
    try {
      await useSlidesStore.getState().deleteDeck(activeDeck.id)
    } catch (error) {
      toast.error("Could not delete the presentation", { description: String(error) })
    }
  }

  // Arrow keys, Page Up/Down and Space match what presentation clickers send.
  const onKeyDown = (event: React.KeyboardEvent) => {
    const { step, presentSlide } = useSlidesStore.getState()
    const last = (activeDeck?.slides.length ?? 0) - 1
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
      case "PageDown":
      case " ":
        step(1)
        break
      case "ArrowLeft":
      case "ArrowUp":
      case "PageUp":
        step(-1)
        break
      case "Home":
        presentSlide(0)
        break
      case "End":
        if (last >= 0) presentSlide(last)
        break
      default:
        return
    }
    event.preventDefault()
  }

  return (
    <div
      data-slot="slides-panel"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs outline-none"
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => void onFilesPicked(e)}
      />

      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2.5">
        {decks.length > 0 ? (
          <Select
            value={activeDeck?.id ?? ""}
            onValueChange={(id) => void useSlidesStore.getState().openDeck(id)}
          >
            <SelectTrigger size="sm" className="h-8 w-56 min-w-0 text-xs">
              <SelectValue placeholder="Choose a presentation" />
            </SelectTrigger>
            <SelectContent>
              {decks.map((deck) => (
                <SelectItem key={deck.id} value={deck.id} className="text-xs">
                  {deck.title}
                  <span className="text-muted-foreground"> · {deck.slide_count}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground">Presentations</span>
        )}

        {activeDeck && (
          <span className="truncate text-[0.6875rem] text-muted-foreground">
            {cursor !== null ? `${cursor + 1} / ` : ""}
            {activeDeck.slides.length} slides
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {activeDeck && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void onDelete()}
              disabled={importing !== null}
              title="Delete this presentation"
            >
              <Trash2Icon />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={pickFiles}
            disabled={importing !== null}
            title="Import a PDF, or slide images (PNG/JPEG)"
          >
            <UploadIcon />
            Import
          </Button>
        </div>
      </div>

      {importing && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs">
              Importing {importing.source}
              <span className="text-muted-foreground">
                {" "}
                · {Math.min(importing.done + 1, importing.total)} of {importing.total}
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${importing.total ? (importing.done / importing.total) * 100 : 0}%` }}
              />
            </div>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => useSlidesStore.getState().cancelImport()}
          >
            <XIcon />
            Cancel
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadError ? (
          <p className="p-4 text-xs text-destructive">{loadError}</p>
        ) : activeDeck ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2 p-2.5">
            {activeDeck.slides.map((slide, index) => {
              const url = deckSlideUrl(slide.path)
              const live = isLive && liveUrl === url
              return (
                <button
                  key={slide.id}
                  ref={(el) => {
                    thumbRefs.current[index] = el
                  }}
                  type="button"
                  onClick={() => useSlidesStore.getState().presentSlide(index)}
                  className={cn(
                    "group relative aspect-video overflow-hidden rounded-md bg-black ring-1 ring-border transition-shadow outline-none hover:ring-foreground/40 focus-visible:ring-2 focus-visible:ring-ring",
                    index === cursor && "ring-2 ring-primary",
                    live && "ring-2 ring-live-pulse"
                  )}
                  title={`Slide ${index + 1}: send to live`}
                >
                  <img
                    src={url}
                    alt={`Slide ${index + 1}`}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="size-full object-contain"
                  />
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[0.625rem] text-white">
                    {index + 1}
                  </span>
                  {live && (
                    <span className="absolute top-1 right-1 rounded bg-live-pulse px-1.5 py-0.5 text-[0.5625rem] font-semibold tracking-wider text-white uppercase">
                      Live
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          !importing && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <PresentationIcon className="size-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">No presentations yet</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Import a PDF, or slide images exported from PowerPoint, Keynote or Google Slides.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={pickFiles}>
                <UploadIcon />
                Import slides
              </Button>
            </div>
          )
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { BookOpenIcon } from "lucide-react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { libraryApi } from "@/lib/library-api"
import { parseTypedReference } from "@/lib/quick-search"
import { useBibleStore } from "@/stores/bible-store"
import { ADDABLE, type AddableKind } from "@/lib/service-items"
import { useServiceStore, type NewServiceItem } from "@/stores/service-store"
import { useSlidesStore } from "@/stores/slides-store"
import { useTextsStore } from "@/stores/texts-store"
import { useVideosStore } from "@/stores/videos-store"
import type { SongSummary } from "@/types"

interface Choice {
  id: string
  label: string
  detail?: string
  item: NewServiceItem
}

/** Everything of `kind` that can be added, from the library. */
async function choicesFor(kind: AddableKind): Promise<Choice[]> {
  switch (kind) {
    case "song": {
      const songs: SongSummary[] = await libraryApi.listSongs()
      return songs.map((s) => ({
        id: s.id,
        label: s.title,
        detail: s.author ?? s.first_line ?? undefined,
        item: { kind: "song", title: s.title, payload: { songId: s.id } },
      }))
    }
    case "deck": {
      await useSlidesStore.getState().loadDecks()
      return useSlidesStore.getState().decks.map((d) => ({
        id: d.id,
        label: d.title,
        detail: `${d.slide_count} slides`,
        item: { kind: "deck", title: d.title, payload: { deckId: d.id } },
      }))
    }
    case "media": {
      await useVideosStore.getState().loadVideos()
      return useVideosStore.getState().videos.map((v) => ({
        id: v.id,
        label: v.title,
        item: { kind: "media", title: v.title, payload: { videoId: v.id } },
      }))
    }
    case "announcement": {
      await useTextsStore.getState().loadTexts()
      return useTextsStore.getState().texts.map((t) => ({
        id: t.id,
        label: t.title,
        detail: t.body.split("\n").find((line) => line.trim()),
        item: { kind: "announcement", title: t.title, payload: { textId: t.id } },
      }))
    }
    case "scripture":
      return []
  }
}

/**
 * Pick something from the library to add to the open service. Bible verses
 * are typed as a reference ("John 3:16"), or the verse selected in the Bible
 * tab is offered.
 */
export function AddServiceItemDialog({ kind, onClose }: { kind: AddableKind | null; onClose: () => void }) {
  const [choices, setChoices] = useState<Choice[] | null>(null)
  const [query, setQuery] = useState("")
  const books = useBibleStore((s) => s.books)
  const selectedVerse = useBibleStore((s) => s.selectedVerse)

  useEffect(() => {
    if (!kind) return
    let cancelled = false
    void choicesFor(kind)
      .then((list) => !cancelled && setChoices(list))
      .catch((error) => toast.error("Could not load the library", { description: String(error) }))
    return () => {
      cancelled = true
      setChoices(null)
      setQuery("")
    }
  }, [kind])

  const add = async (item: NewServiceItem) => {
    onClose()
    try {
      await useServiceStore.getState().addItem(item)
    } catch (error) {
      toast.error("Could not add it to the service", { description: String(error) })
    }
  }

  const typed = kind === "scripture" ? parseTypedReference(query, books) : null
  const label = ADDABLE.find((a) => a.kind === kind)?.label ?? ""

  return (
    <CommandDialog
      open={kind !== null}
      onOpenChange={(open) => !open && onClose()}
      title={`Add ${label.toLowerCase()}`}
      description="Choose what to add to the service"
    >
      <Command shouldFilter={kind !== "scripture"}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={kind === "scripture" ? "Type a reference, e.g. John 3:16" : `Search ${label.toLowerCase()}s…`}
        />
        <CommandList>
          {kind === "scripture" ? (
            <CommandGroup>
              {typed && (
                <CommandItem
                  value={`typed ${query}`}
                  onSelect={() =>
                    void add({
                      kind: "scripture",
                      title: `${typed.book.name} ${typed.chapter}:${typed.verse}`,
                      payload: { bookNumber: typed.book.book_number, chapter: typed.chapter, verse: typed.verse },
                    })
                  }
                >
                  <BookOpenIcon />
                  Add {typed.book.name} {typed.chapter}:{typed.verse}
                </CommandItem>
              )}
              {selectedVerse && (
                <CommandItem
                  value="selected verse"
                  onSelect={() =>
                    void add({
                      kind: "scripture",
                      title: `${selectedVerse.book_name} ${selectedVerse.chapter}:${selectedVerse.verse}`,
                      payload: {
                        bookNumber: selectedVerse.book_number,
                        chapter: selectedVerse.chapter,
                        verse: selectedVerse.verse,
                      },
                    })
                  }
                >
                  <BookOpenIcon />
                  Add the selected verse, {selectedVerse.book_name} {selectedVerse.chapter}:{selectedVerse.verse}
                </CommandItem>
              )}
              {!typed && !selectedVerse && (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Type a full reference with chapter and verse.
                </p>
              )}
            </CommandGroup>
          ) : (
            <>
              <CommandEmpty>
                {choices === null ? "Loading…" : `No ${label.toLowerCase()}s in the library yet.`}
              </CommandEmpty>
              <CommandGroup>
                {choices?.map((choice) => (
                  <CommandItem
                    key={choice.id}
                    value={`${choice.label} ${choice.detail ?? ""} ${choice.id}`}
                    onSelect={() => void add(choice.item)}
                  >
                    <span className="truncate">{choice.label}</span>
                    {choice.detail && (
                      <span className="ml-auto truncate text-xs text-muted-foreground">{choice.detail}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

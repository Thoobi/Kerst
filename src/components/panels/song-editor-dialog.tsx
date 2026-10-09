import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { lyricPages } from "@/lib/song-slides"
import { parseArrangement, parseSongText, sectionCodes, songToText } from "@/lib/song-text"
import { cn } from "@/lib/utils"
import { useSongsStore } from "@/stores"
import type { Song, SongInput } from "@/types"

const LYRICS_PLACEHOLDER = `Verse 1
Amazing grace, how sweet the sound
That saved a wretch like me

Chorus
My chains are gone, I've been set free

Verse 2
'Twas grace that taught my heart to fear`

interface SongEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The song to edit, or null for a new one. */
  song: Song | null
  onSaved?: (song: Song) => void
}

/**
 * Remounts per song (keyed by the caller) so every open starts from the
 * song's saved state.
 */
export function SongEditorDialog({ open, onOpenChange, song, onSaved }: SongEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-4rem)] flex-col gap-4 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{song ? "Edit song" : "New song"}</DialogTitle>
          <DialogDescription>
            Start each section with a heading like “Verse 1”, “Chorus” or “Bridge”. A blank line
            inside a section starts a new screen. Pasted lyrics without headings are split on blank
            lines, and a repeated paragraph becomes the chorus.
          </DialogDescription>
        </DialogHeader>
        <SongEditorForm key={song?.id ?? "new"} song={song} onOpenChange={onOpenChange} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  )
}

function SongEditorForm({
  song,
  onOpenChange,
  onSaved,
}: Omit<SongEditorDialogProps, "open">) {
  const [title, setTitle] = useState(song?.title ?? "")
  const [author, setAuthor] = useState(song?.author ?? "")
  const [copyright, setCopyright] = useState(song?.copyright ?? "")
  const [ccli, setCcli] = useState(song?.ccli_number ?? "")
  const [lyrics, setLyrics] = useState(song ? songToText(song.sections) : "")
  // An existing song's order is the operator's choice; for a new song it
  // follows what the pasted lyrics imply until the operator types one.
  const [arrangement, setArrangement] = useState<string | null>(() => {
    if (!song || song.arrangement.length === 0) return null
    const codes = sectionCodes(song.sections)
    const codeById = new Map(song.sections.map((s, i) => [s.id, codes[i]]))
    return song.arrangement.map((id) => codeById.get(id) ?? "").filter(Boolean).join(" ")
  })
  const [saving, setSaving] = useState(false)

  const parsed = useMemo(() => parseSongText(lyrics), [lyrics])
  const codes = useMemo(() => sectionCodes(parsed.sections), [parsed])
  const arrangementText =
    arrangement ?? parsed.arrangement.map((i) => codes[i]).join(" ")
  const order = useMemo(() => parseArrangement(arrangementText, codes), [arrangementText, codes])

  const problems = [
    !title.trim() && "Give the song a title.",
    parsed.sections.length === 0 && "Add some lyrics.",
    order.unknown.length > 0 &&
      `The order mentions ${order.unknown.join(", ")}, which ${order.unknown.length === 1 ? "isn't a section" : "aren't sections"}.`,
  ].filter((p): p is string => Boolean(p))

  const save = async () => {
    if (problems.length > 0) return
    // Keep section ids when a section keeps its name, so anything pointing
    // at a section survives an edit.
    const idByLabel = new Map(song?.sections.map((s) => [s.label.toLowerCase(), s.id]))
    const input: SongInput = {
      id: song?.id,
      title: title.trim(),
      author: author.trim() || null,
      copyright: copyright.trim() || null,
      ccli_number: ccli.trim() || null,
      sections: parsed.sections.map((s) => ({ ...s, id: idByLabel.get(s.label.toLowerCase()) })),
      arrangement: order.order,
      source: song?.source ?? "manual",
    }
    setSaving(true)
    try {
      const saved = await useSongsStore.getState().saveSong(input)
      toast.success(`Saved “${saved.title}”`)
      onSaved?.(saved)
      onOpenChange(false)
    } catch (error) {
      toast.error("Could not save the song", { description: String(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_15rem] gap-4">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!song} />
            </Field>
            <Field label="Author">
              <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
            </Field>
            <Field label="Copyright">
              <Input value={copyright} onChange={(e) => setCopyright(e.target.value)} placeholder="2020 Example Music" />
            </Field>
            <Field label="CCLI song number">
              <Input value={ccli} onChange={(e) => setCcli(e.target.value)} inputMode="numeric" />
            </Field>
          </div>
          <Field label="Lyrics" className="min-h-0 flex-1">
            <Textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder={LYRICS_PLACEHOLDER}
              spellCheck={false}
              className="h-80 min-h-0 flex-1 resize-none [field-sizing:fixed] font-mono text-xs leading-relaxed"
            />
          </Field>
          <Field label="Order">
            <Input
              value={arrangementText}
              onChange={(e) => setArrangement(e.target.value)}
              placeholder="As written"
              className="font-mono text-xs"
            />
          </Field>
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">Sections found</span>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto rounded-lg bg-muted/40 p-2">
            {parsed.sections.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">Sections appear here as you type.</p>
            ) : (
              parsed.sections.map((section, i) => {
                const screens = lyricPages(section.lyrics).length
                return (
                  <div key={i} className="flex items-center gap-2 rounded-md bg-card px-2 py-1.5 text-xs ring-1 ring-border">
                    <span className="w-8 shrink-0 rounded bg-muted px-1 py-0.5 text-center font-mono text-[0.625rem]">
                      {codes[i]}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{section.label}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {screens} screen{screens === 1 ? "" : "s"}
                    </span>
                  </div>
                )
              })
            )}
          </div>
          <p className="text-[0.6875rem] text-muted-foreground">
            Type the order with these codes, e.g. <span className="font-mono">V1 C V2 C B C</span>. Leave it empty to sing
            sections as written.
          </p>
        </div>
      </div>

      <DialogFooter className="items-center sm:justify-between">
        <p className={cn("text-xs", problems.length ? "text-destructive" : "text-muted-foreground")}>
          {problems[0] ?? `${order.order.length || parsed.sections.length} sections in the sung order.`}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || problems.length > 0}>
            {saving ? "Saving…" : "Save song"}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

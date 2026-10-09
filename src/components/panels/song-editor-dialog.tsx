import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

export function SongEditorDialog({ open, onOpenChange, song, onSaved }: SongEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(48rem,calc(100vh-4rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {/* Keyed so every open starts from the song's saved state. */}
        <SongEditorForm key={song?.id ?? "new"} song={song} onOpenChange={onOpenChange} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  )
}

function SongEditorForm({ song, onOpenChange, onSaved }: Omit<SongEditorDialogProps, "open">) {
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
  const arrangementText = arrangement ?? parsed.arrangement.map((i) => codes[i]).join(" ")
  const order = useMemo(() => parseArrangement(arrangementText, codes), [arrangementText, codes])
  const sungOrder = order.order.length > 0 ? order.order : parsed.sections.map((_, i) => i)
  const screenCount = sungOrder.reduce((n, i) => n + lyricPages(parsed.sections[i].lyrics).length, 0)

  const problem =
    (!title.trim() && "Give the song a title.") ||
    (parsed.sections.length === 0 && "Add some lyrics.") ||
    (order.unknown.length > 0 &&
      `“${order.unknown.join(", ")}” in the order ${order.unknown.length === 1 ? "isn't a section" : "aren't sections"}.`) ||
    null

  const save = async () => {
    if (problem) return
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
      <header className="shrink-0 border-b border-border px-6 py-4 pr-14">
        <DialogTitle className="text-base">{song ? "Edit song" : "New song"}</DialogTitle>
        <DialogDescription className="sr-only">
          Type or paste the lyrics, then set the order and credits.
        </DialogDescription>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_19rem]">
        {/* Main: the song itself */}
        <div className="flex min-h-0 flex-col gap-5 px-6 py-5">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Song title"
            autoFocus={!song}
            aria-label="Song title"
            className="h-11 shrink-0 text-lg font-semibold md:text-lg"
          />
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm font-medium">Lyrics</span>
              <span className="truncate text-xs text-muted-foreground">
                Headings like <em>Verse 1</em> or <em>Chorus</em> start a section · a blank line starts a new screen
              </span>
            </div>
            <Textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder={LYRICS_PLACEHOLDER}
              spellCheck={false}
              aria-label="Lyrics"
              className="min-h-0 flex-1 resize-none p-4 text-sm leading-7 [field-sizing:fixed] md:text-sm"
            />
          </div>
        </div>

        {/* Sidebar: what was understood, and the details */}
        <aside className="min-h-0 space-y-7 overflow-y-auto border-l border-border bg-muted/30 px-5 py-5">
          <SidebarGroup title="Sections" aside={parsed.sections.length ? `${screenCount} screens` : undefined}>
            {parsed.sections.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Sections show up here as you type. Pasted lyrics without headings are split at blank lines, and a
                paragraph that repeats becomes the chorus.
              </p>
            ) : (
              <ul className="space-y-1">
                {parsed.sections.map((section, i) => {
                  const screens = lyricPages(section.lyrics).length
                  return (
                    <li key={i} className="flex items-center gap-2.5 py-1 text-sm">
                      <CodeChip>{codes[i]}</CodeChip>
                      <span className="min-w-0 flex-1 truncate">{section.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {screens} {screens === 1 ? "screen" : "screens"}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </SidebarGroup>

          <SidebarGroup title="Sung order">
            <Input
              value={arrangementText}
              onChange={(e) => setArrangement(e.target.value)}
              placeholder="As written"
              aria-label="Sung order"
              aria-invalid={order.unknown.length > 0 || undefined}
              className="font-mono text-sm"
            />
            {sungOrder.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1">
                {sungOrder.map((i, n) => (
                  <CodeChip key={n}>{codes[i]}</CodeChip>
                ))}
              </div>
            )}
            <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
              Codes from the list above, e.g. <span className="font-mono">V1 C V2 C B C</span>. Empty means as
              written.
            </p>
          </SidebarGroup>

          <SidebarGroup title="Credits">
            <div className="space-y-3">
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
          </SidebarGroup>
        </aside>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-border px-6 py-3.5">
        <p className={cn("min-w-0 truncate text-xs", problem ? "text-destructive" : "text-muted-foreground")}>
          {problem ??
            `${parsed.sections.length} ${parsed.sections.length === 1 ? "section" : "sections"} · ${screenCount} screens in the sung order`}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || problem !== null}>
            {saving ? "Saving…" : "Save song"}
          </Button>
        </div>
      </footer>
    </>
  )
}

function SidebarGroup({
  title,
  aside,
  children,
}: {
  title: string
  aside?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {aside && <span className="text-xs text-muted-foreground tabular-nums">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

function CodeChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 min-w-8 shrink-0 items-center justify-center rounded-md bg-background px-1.5 font-mono text-[0.6875rem] font-semibold ring-1 ring-border">
      {children}
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

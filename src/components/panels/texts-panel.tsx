import { useEffect, useRef, useState } from "react"
import { ask } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"
import { MegaphoneIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { BackgroundPicker } from "@/components/panels/background-picker"
import { isTypingOrHandled } from "@/lib/operator-keys"
import { cn } from "@/lib/utils"
import { useBroadcastStore } from "@/stores"
import { textScreens, useTextsStore } from "@/stores/texts-store"
import type { Text } from "@/types"

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/**
 * Free texts such as announcements: write one, click a screen to put it on
 * the live output, step with the arrow keys or a clicker. Blank lines split
 * screens, like song lyrics.
 */
export function TextsPanel() {
  const texts = useTextsStore((s) => s.texts)
  const activeText = useTextsStore((s) => s.activeText)
  const screens = useTextsStore((s) => s.screens)
  const cursor = useTextsStore((s) => s.cursor)
  const presented = useTextsStore((s) => s.presented)
  const loadError = useTextsStore((s) => s.loadError)
  const isLive = useBroadcastStore((s) => s.isLive)
  const liveVerse = useBroadcastStore((s) => s.liveVerse)
  const [editing, setEditing] = useState<{ text: Text | null } | null>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    void useTextsStore.getState().loadTexts()
  }, [])

  useEffect(() => {
    if (cursor !== null) cardRefs.current[cursor]?.scrollIntoView({ block: "nearest" })
  }, [cursor])

  const onAirIndex = isLive && presented !== null && liveVerse === presented ? cursor : null

  const onDelete = async () => {
    if (!activeText) return
    const confirmed = await ask(`Delete “${activeText.title}”?`, {
      title: "Delete text",
      kind: "warning",
      okLabel: "Delete",
    })
    if (!confirmed) return
    try {
      await useTextsStore.getState().deleteText(activeText.id)
    } catch (error) {
      toast.error("Could not delete the text", { description: String(error) })
    }
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (isTypingOrHandled(event)) return
    const { step, presentScreen } = useTextsStore.getState()
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
        presentScreen(0)
        break
      default:
        return
    }
    event.preventDefault()
  }

  return (
    <>
      <div
        data-slot="texts-panel"
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs outline-none"
        onKeyDown={onKeyDown}
        tabIndex={-1}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2.5">
          <span className="text-xs text-muted-foreground">
            {texts.length > 0 ? plural(texts.length, "text") : "Texts"}
          </span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setEditing({ text: null })}>
            <PlusIcon />
            New text
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(11rem,15rem)_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto border-r border-border p-1.5">
            {loadError ? (
              <p className="p-2 text-xs text-destructive">{loadError}</p>
            ) : texts.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">No texts yet.</p>
            ) : (
              texts.map((text) => (
                <button
                  key={text.id}
                  type="button"
                  onClick={() => useTextsStore.getState().openText(text.id)}
                  className={cn(
                    "block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted",
                    activeText?.id === text.id && "bg-muted"
                  )}
                >
                  <span className="block truncate text-xs font-medium">{text.title}</span>
                  <span className="block truncate text-[0.6875rem] text-muted-foreground">
                    {text.body.split("\n").find((line) => line.trim()) ?? ""}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="flex min-h-0 flex-col">
            {activeText ? (
              <>
                <div className="flex shrink-0 items-center gap-2 px-3 pt-2.5 pb-1.5">
                  <div className="min-w-0 flex-1 truncate text-sm font-medium">{activeText.title}</div>
                  <BackgroundPicker
                    videoId={activeText.background_video_id}
                    onChoose={(videoId) => useTextsStore.getState().setBackground(videoId)}
                  />
                  <Button variant="ghost" size="icon-sm" onClick={() => void onDelete()} title="Delete this text">
                    <Trash2Icon />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditing({ text: activeText })}>
                    <PencilIcon />
                    Edit
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {screens.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">This text is empty. Edit it to add some words.</p>
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2 p-2.5 pt-1">
                      {screens.map((lines, index) => {
                        const live = index === onAirIndex
                        return (
                          <button
                            key={index}
                            ref={(el) => {
                              cardRefs.current[index] = el
                            }}
                            type="button"
                            onClick={() => useTextsStore.getState().presentScreen(index)}
                            className={cn(
                              "relative flex min-h-24 flex-col gap-1 rounded-md bg-surface-sunken p-2 text-left ring-1 ring-border transition-shadow outline-none hover:ring-foreground/40 focus-visible:ring-2 focus-visible:ring-ring",
                              index === cursor && "ring-2 ring-primary",
                              live && "ring-2 ring-live-pulse"
                            )}
                          >
                            <span className="font-mono text-[0.625rem] text-muted-foreground">{index + 1}</span>
                            {lines.map((line, i) => (
                              <span key={i} className="truncate text-xs">
                                {line}
                              </span>
                            ))}
                            {live && (
                              <span className="absolute top-1.5 right-1.5 rounded bg-live-pulse px-1.5 py-0.5 text-[0.5625rem] font-semibold tracking-wider text-white uppercase">
                                Live
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <MegaphoneIcon className="size-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Announcements and other text</p>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                    Write a notice, a welcome or any words to put on screen. Blank lines split it into
                    screens.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditing({ text: null })}>
                  <PlusIcon />
                  New text
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <TextEditorDialog editing={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function TextEditorDialog({
  editing,
  onClose,
}: {
  editing: { text: Text | null } | null
  onClose: () => void
}) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex flex-col gap-4 sm:max-w-2xl">
        {editing && <TextEditorForm key={editing.text?.id ?? "new"} text={editing.text} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function TextEditorForm({ text, onClose }: { text: Text | null; onClose: () => void }) {
  const [title, setTitle] = useState(text?.title ?? "")
  const [body, setBody] = useState(text?.body ?? "")
  const [saving, setSaving] = useState(false)
  const screenCount = textScreens(body).length

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await useTextsStore.getState().saveText({ id: text?.id, title: title.trim(), body })
      onClose()
    } catch (error) {
      toast.error("Could not save the text", { description: String(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div>
        <DialogTitle>{text ? "Edit text" : "New text"}</DialogTitle>
        <DialogDescription className="mt-1 text-xs">
          Each blank line starts a new screen. Long screens are split for you.
        </DialogDescription>
      </div>
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title, e.g. Announcements"
        aria-label="Title"
      />
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={"Youth camp this Friday\nSign up at the welcome desk\n\nCoffee and tea after the service"}
        className="min-h-64 font-mono text-sm"
        aria-label="Text"
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{plural(screenCount, "screen")}</span>
        <Button variant="ghost" className="ml-auto" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={!title.trim() || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </>
  )
}

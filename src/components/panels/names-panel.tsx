import { useState } from "react"
import { PencilIcon, PlusIcon, Trash2Icon, UserRoundIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useBroadcastStore, usePreviewStore } from "@/stores"
import { useSettingsStore, type SpeakerName } from "@/stores/settings-store"
import { nameRenderData } from "@/lib/speaker-names"

/** Put `speaker` in the preview and, when live, on air. */
function presentName(speaker: SpeakerName) {
  const content = nameRenderData(speaker)
  usePreviewStore.getState().show(content)
  useBroadcastStore.getState().setLiveVerse(content)
}

function NameForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Pick<SpeakerName, "name" | "title">
  submitLabel: string
  onSubmit: (value: { name: string; title: string }) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [title, setTitle] = useState(initial?.title ?? "")
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        onSubmit({ name: name.trim(), title: title.trim() })
        if (!initial) {
          setName("")
          setTitle("")
        }
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Jane Doe" className="h-8 min-w-36 flex-1" aria-label="Name" autoFocus={!!initial} />
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Lead Pastor" className="h-8 min-w-36 flex-1" aria-label="Title" />
      <Button type="submit" size="sm" disabled={!name.trim()}>
        {!initial && <PlusIcon />}
        {submitLabel}
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </form>
  )
}

/**
 * Names to show on screen: a guest speaker, someone giving a testimony, the
 * worship leader. Click one to show it (on air when live) with whichever
 * theme the output has: on a lower third, a name strap in the band.
 */
export function NamesPanel() {
  const speakers = useSettingsStore((s) => s.speakers)
  const live = useBroadcastStore((s) => s.liveVerse)
  const [editing, setEditing] = useState<string | null>(null)
  const { addSpeaker, updateSpeaker, removeSpeaker } = useSettingsStore.getState()
  const onAir = (s: SpeakerName) =>
    live?.style === "name" && live.segments[0]?.text === s.name.trim() && live.reference === s.title.trim()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <NameForm submitLabel="Add" onSubmit={(value) => addSpeaker(value)} />
      {speakers.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
          <UserRoundIcon className="size-8 opacity-50" />
          <p className="text-sm">No names yet.</p>
          <p className="max-w-72 text-xs">
            Add the people who speak, lead or share, then click a name to show it: on a lower third it&apos;s a name strap.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {speakers.map((speaker) =>
            editing === speaker.id ? (
              <li key={speaker.id} className="rounded-lg border p-2">
                <NameForm
                  initial={speaker}
                  submitLabel="Save"
                  onSubmit={(value) => {
                    updateSpeaker(speaker.id, value)
                    setEditing(null)
                  }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={speaker.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => presentName(speaker)}
                  title="Show this name (on air when live)"
                  className={cn(
                    "flex min-w-0 flex-1 flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    onAir(speaker) ? "border-primary bg-primary/10" : "border-border hover:bg-muted/60"
                  )}
                >
                  <span className="truncate text-sm font-medium">{speaker.name}</span>
                  {speaker.title && <span className="truncate text-xs text-muted-foreground">{speaker.title}</span>}
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => setEditing(speaker.id)}
                  aria-label={`Edit ${speaker.name}`}
                  title="Edit"
                >
                  <PencilIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => removeSpeaker(speaker.id)}
                  aria-label={`Remove ${speaker.name}`}
                  title="Remove"
                >
                  <Trash2Icon />
                </Button>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  )
}

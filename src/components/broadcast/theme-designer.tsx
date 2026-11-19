import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useBroadcastStore } from "@/stores"
import { flushBroadcastThemes } from "@/stores/broadcast-store"
import { MAIN_OUTPUT_ID } from "@/types"
import { Button } from "@/components/ui/button"
import { CheckIcon, LoaderCircleIcon, Redo2Icon, SaveIcon, TrashIcon, TriangleAlertIcon, Undo2Icon, XIcon } from "lucide-react"
import { ThemeLibrary } from "@/components/broadcast/theme-library"
import { DesignCanvas } from "@/components/broadcast/design-canvas"
import { PropertiesPanel } from "@/components/broadcast/properties-panel"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** Names a theme starts with (see `createNewTheme`): saving one asks for a real name. */
const STARTING_NAMES = new Set(["Untitled Theme", "Side by Side"])

export function ThemeDesigner() {
  const isDesignerOpen = useBroadcastStore((s) => s.isDesignerOpen)
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const themes = useBroadcastStore((s) => s.themes)

  // Open on the theme the main output is showing, so what's edited is what's on screen.
  useEffect(() => {
    if (isDesignerOpen && !draftTheme && themes.length > 0) {
      const { outputs, activeThemeId } = useBroadcastStore.getState()
      const shownId = outputs.find((o) => o.id === MAIN_OUTPUT_ID)?.themeId ?? activeThemeId
      const shown = themes.find((t) => t.id === shownId) ?? themes[0]
      useBroadcastStore.getState().startEditing(shown.id)
    }
  }, [isDesignerOpen, draftTheme, themes])

  // "saving" while it's written to disk, then "saved" (or "failed") for a moment.
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle")
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current)
  }, [])

  const canUndo = useBroadcastStore((s) => s.draftPast.length > 0)
  const canRedo = useBroadcastStore((s) => s.draftFuture.length > 0)

  // Ctrl+Z undoes, Ctrl+Shift+Z or Ctrl+Y redoes, while the designer is
  // open; a text field keeps its own undo.
  useEffect(() => {
    if (!isDesignerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key !== "z" && key !== "y") return
      const target = e.target as HTMLElement | null
      const typing =
        target?.isContentEditable ||
        target?.tagName === "TEXTAREA" ||
        (target?.tagName === "INPUT" && !["checkbox", "radio", "range", "color"].includes((target as HTMLInputElement).type))
      if (typing) return
      e.preventDefault()
      const store = useBroadcastStore.getState()
      if (key === "y" || e.shiftKey) store.redoDraft()
      else store.undoDraft()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isDesignerOpen])

  const handleDiscard = () => {
    useBroadcastStore.getState().discardDraft()
  }

  // A built-in is saved as a copy, and a new theme still has its starting
  // name: ask what to call it rather than saving "… (Custom)" or "Untitled".
  const [naming, setNaming] = useState<string | null>(null)
  const handleSave = () => {
    if (saveState === "saving") return
    const draft = useBroadcastStore.getState().draftTheme
    if (!draft) return
    if (draft.builtin || STARTING_NAMES.has(draft.name)) {
      setNaming(draft.builtin ? `My ${draft.name}` : draft.name === "Untitled Theme" ? "" : draft.name)
      return
    }
    save()
  }

  const save = (name?: string) => {
    setNaming(null)
    const savedId = useBroadcastStore.getState().saveDraft(name)
    if (!savedId) return
    if (resetTimer.current) clearTimeout(resetTimer.current)
    setSaveState("saving")
    // Let "Saving…" paint even when the disk is quick.
    const shown = new Promise((resolve) => setTimeout(resolve, 400))
    void Promise.all([flushBroadcastThemes(), shown]).then(([ok]) => {
      setSaveState(ok ? "saved" : "failed")
      resetTimer.current = setTimeout(() => setSaveState("idle"), ok ? 2000 : 4000)
      if (!ok) {
        toast.error("Couldn't save the theme", {
          description: "Your changes are still on screen. Try saving again.",
        })
        return
      }
      warnIfNotShown(savedId)
    })
  }

  const handleClose = () => {
    useBroadcastStore.getState().setDesignerOpen(false)
  }

  return (
    <DialogPrimitive.Root
      open={isDesignerOpen}
      onOpenChange={(open) =>
        useBroadcastStore.getState().setDesignerOpen(open)
      }
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />

        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background text-foreground outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            Theme Designer
          </DialogPrimitive.Title>

          {/* Top bar */}
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 bg-card">
            <span className="text-xl font-semibold text-foreground">
              Theme Designer
            </span>

            <div className="flex-1" />

            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                disabled={!canUndo}
                onClick={() => useBroadcastStore.getState().undoDraft()}
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <Undo2Icon className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={!canRedo}
                onClick={() => useBroadcastStore.getState().redoDraft()}
                title="Redo (Ctrl+Shift+Z)"
                aria-label="Redo"
              >
                <Redo2Icon className="size-4" />
              </Button>
            </div>

            <Button variant="outline" onClick={handleDiscard}>
              <TrashIcon className="size-4" />
              Discard
            </Button>
            <Button
              className="min-w-36 bg-primary text-primary-foreground hover:bg-primary/80"
              onClick={handleSave}
              disabled={saveState === "saving"}
              aria-live="polite"
            >
              {saveState === "saving" ? (
                <>
                  <LoaderCircleIcon className="size-4 animate-spin" />
                  Saving…
                </>
              ) : saveState === "saved" ? (
                <>
                  <CheckIcon className="size-4" />
                  Saved
                </>
              ) : saveState === "failed" ? (
                <>
                  <TriangleAlertIcon className="size-4" />
                  Not saved
                </>
              ) : (
                <>
                  <SaveIcon className="size-4" />
                  Save Theme
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={handleClose}
            >
              <XIcon strokeWidth={2} />
              Close
            </Button>
          </div>

          <NameThemeDialog
            initial={naming}
            onCancel={() => setNaming(null)}
            onSave={(name) => save(name)}
          />

          {/* 3-panel layout */}
          <div
            className="min-h-0 flex-1"
            style={{
              display: "grid",
              gridTemplateColumns: "260px 1fr 320px",
            }}
          >
            {/* Left: Theme Library */}
            <ThemeLibrary />

            {/* Center: Design Canvas */}
            <DesignCanvas />

            {/* Right: Properties Panel */}
            <PropertiesPanel />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * A saved theme no output shows can't be seen on screen (saving a built-in
 * makes a copy, and only outputs already on the built-in move to it): say
 * so, and offer to put it on the main output.
 */
function warnIfNotShown(themeId: string): void {
  const { outputs, themes } = useBroadcastStore.getState()
  const theme = themes.find((t) => t.id === themeId)
  if (!theme) return
  const showing = outputs.filter((o) => o.themeId === themeId)
  if (showing.length > 0) {
    toast.success(`Saved “${theme.name}”`, {
      description: `Showing on ${showing.map((o) => o.name).join(", ")}.`,
    })
    return
  }
  const main = outputs.find((o) => o.id === MAIN_OUTPUT_ID)
  toast.warning(`Saved “${theme.name}”, but no output is using it`, {
    description: "Put it on an output to see it on screen.",
    duration: 10000,
    action: main
      ? {
          label: `Show on ${main.name}`,
          onClick: () => useBroadcastStore.getState().setOutputTheme(main.id, themeId),
        }
      : undefined,
  })
}

/** "Name this theme", shown on Save while `initial` is set. Enter saves. */
function NameThemeDialog({
  initial,
  onCancel,
  onSave,
}: {
  initial: string | null
  onCancel: () => void
  onSave: (name: string) => void
}) {
  return (
    <Dialog open={initial !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        {initial !== null && <NameThemeForm initial={initial} onCancel={onCancel} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  )
}

function NameThemeForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: string
  onCancel: () => void
  onSave: (name: string) => void
}) {
  const [name, setName] = useState(initial)
  const trimmed = name.trim()
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (trimmed) onSave(trimmed)
      }}
    >
      <DialogHeader>
        <DialogTitle>Name this theme</DialogTitle>
        <DialogDescription>It&apos;s saved under this name in your themes. You can rename it later.</DialogDescription>
      </DialogHeader>
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onFocus={(e) => e.target.select()}
        placeholder="e.g. Sunday Side by Side"
        aria-label="Theme name"
        maxLength={60}
      />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!trimmed}>
          <SaveIcon className="size-4" />
          Save Theme
        </Button>
      </DialogFooter>
    </form>
  )
}

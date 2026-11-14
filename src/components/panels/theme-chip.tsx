import { useState } from "react"
import { ChevronDownIcon, EyeOffIcon, LayersIcon, PaletteIcon, PencilIcon, PinIcon, PlusIcon, XIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { CanvasVerse } from "@/components/ui/canvas-verse"
import { THUMBNAIL_VERSE } from "@/components/broadcast/theme-library"
import { isLowerThird } from "@/lib/lower-third"
import { cn } from "@/lib/utils"
import { useBroadcastStore } from "@/stores"
import { useContentTabStore } from "@/stores/content-tab-store"
import { MAIN_OUTPUT_ID } from "@/types"
import type { BroadcastTheme } from "@/types"

/** Pinned themes first, then the built-ins, then the rest, each in their own order. */
function switcherOrder(themes: BroadcastTheme[]): BroadcastTheme[] {
  const rank = (t: BroadcastTheme) => (t.pinned ? 0 : t.builtin ? 1 : 2)
  return themes.map((t, i) => [t, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([t]) => t)
}

/**
 * The main output's theme in the navbar: its name, and a popover to switch
 * each output's theme with one click or open its style.
 */
export function ThemeChip() {
  const themes = useBroadcastStore((s) => s.themes)
  const outputs = useBroadcastStore((s) => s.outputs)
  const activeThemeId = useBroadcastStore((s) => s.activeThemeId)
  const bandHidden = useBroadcastStore((s) => s.lowerThirdHidden)
  const styleOpen = useContentTabStore((s) => s.themeStyleOpen)
  const [open, setOpen] = useState(false)

  const mainThemeId = outputs.find((o) => o.id === MAIN_OUTPUT_ID)?.themeId ?? activeThemeId
  const mainTheme = themes.find((t) => t.id === mainThemeId) ?? themes[0]
  const anyLowerThird = outputs.some((o) => isLowerThird(themes.find((t) => t.id === o.themeId)))
  const ordered = switcherOrder(themes)

  const openStyle = () => {
    setOpen(false)
    if (anyLowerThird) {
      useContentTabStore.getState().setThemeStyleOpen(true)
    } else if (mainTheme) {
      openDesigner(mainTheme.id)
    }
  }
  const openDesigner = (themeId: string) => {
    setOpen(false)
    const broadcast = useBroadcastStore.getState()
    broadcast.startEditing(themeId)
    broadcast.setDesignerOpen(true)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={
            bandHidden && anyLowerThird
              ? "The lower third's band is hidden. Switch themes, or open the style to show it again (or press H)"
              : "The live theme: switch it, or style it"
          }
          className={cn(
            "flex h-6 max-w-44 min-w-0 items-center gap-1 rounded-full px-2 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            open || styleOpen
              ? "bg-primary/15 text-primary hover:bg-primary/25"
              : "border border-border text-foreground hover:bg-muted"
          )}
        >
          {bandHidden && anyLowerThird ? (
            <EyeOffIcon className="size-3.5 shrink-0 text-amber-500" aria-label="Band hidden" />
          ) : (
            <PaletteIcon className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{mainTheme?.name ?? "Theme"}</span>
          <ChevronDownIcon className="size-3 shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[26rem] max-w-[calc(100vw-2rem)] p-0"
        // Don't focus the first thumbnail on open: its focus ring reads as "selected".
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto p-3">
          <Scenes />
          {outputs.map((output) => {
            const current = output.themeId ?? activeThemeId
            return (
              <div key={output.id} className="flex flex-col gap-1.5">
                {outputs.length > 1 && (
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    {output.name}
                  </span>
                )}
                <div role="radiogroup" aria-label={`${output.name} theme`} className="grid grid-cols-4 gap-2">
                  {ordered.map((theme) => {
                    const on = theme.id === current
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        title={on ? `${theme.name}: on ${output.name}` : `Show ${theme.name} on ${output.name}`}
                        onClick={() => useBroadcastStore.getState().setOutputTheme(output.id, theme.id)}
                        className="group flex min-w-0 flex-col gap-1 text-left outline-none"
                      >
                        <div
                          className={cn(
                            "relative overflow-hidden rounded-md ring-offset-1 ring-offset-popover transition-shadow",
                            on ? "ring-2 ring-primary" : "ring-1 ring-border group-hover:ring-foreground/40 group-focus-visible:ring-2 group-focus-visible:ring-ring"
                          )}
                        >
                          <CanvasVerse theme={theme} verse={THUMBNAIL_VERSE} className="w-full" />
                          {theme.pinned && (
                            <PinIcon className="absolute top-1 right-1 size-2.5 text-white drop-shadow" aria-label="Pinned" />
                          )}
                        </div>
                        <span className={cn("truncate text-[0.6875rem]", on ? "font-medium text-foreground" : "text-muted-foreground")}>
                          {theme.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <Button variant="secondary" size="xs" onClick={openStyle}>
            <PaletteIcon />
            {anyLowerThird ? "Lower third style…" : "Style…"}
          </Button>
          {mainTheme && (
            <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => openDesigner(mainTheme.id)}>
              <PencilIcon />
              Edit in designer
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Saved sets of every output's theme ("Sermon", "Worship"): one click
 * switches them all. The scene that matches what's on now is marked.
 */
function Scenes() {
  const scenes = useBroadcastStore((s) => s.scenes)
  const outputs = useBroadcastStore((s) => s.outputs)
  const [naming, setNaming] = useState<string | null>(null)
  const current = scenes.find((scene) => outputs.every((o) => !scene.themes[o.id] || scene.themes[o.id] === o.themeId))
  const save = () => {
    if (naming === null) return
    useBroadcastStore.getState().saveScene(naming)
    setNaming(null)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Scenes</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {scenes.map((scene) => (
          <span key={scene.id} className="group relative">
            <button
              type="button"
              onClick={() => useBroadcastStore.getState().applyScene(scene.id)}
              title={`Switch every output to ${scene.name}`}
              aria-pressed={current?.id === scene.id}
              className={cn(
                "flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                current?.id === scene.id
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border hover:bg-muted"
              )}
            >
              <LayersIcon className="size-3" />
              {scene.name}
            </button>
            <button
              type="button"
              onClick={() => useBroadcastStore.getState().deleteScene(scene.id)}
              aria-label={`Delete ${scene.name}`}
              title="Delete this scene"
              className="absolute -top-1.5 -right-1.5 hidden size-4 items-center justify-center rounded-full bg-muted text-muted-foreground shadow ring-1 ring-border group-hover:flex hover:text-foreground"
            >
              <XIcon className="size-2.5" />
            </button>
          </span>
        ))}
        {naming === null ? (
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => setNaming("")}
            title="Save which theme each output uses now, to switch back in one click"
          >
            <PlusIcon />
            Save current…
          </Button>
        ) : (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <Input
              autoFocus
              value={naming}
              onChange={(e) => setNaming(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation()
                  setNaming(null)
                }
              }}
              placeholder="e.g. Sermon"
              className="h-7 w-32 text-xs"
              aria-label="Scene name"
            />
            <Button type="submit" size="xs">
              Save
            </Button>
          </form>
        )}
      </div>
      {scenes.length === 0 && naming === null && (
        <p className="text-[0.6875rem] text-muted-foreground">
          Set each output&apos;s theme below, then save it as a scene, e.g. Sermon or Worship.
        </p>
      )}
    </div>
  )
}

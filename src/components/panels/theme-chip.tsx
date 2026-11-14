import { useState } from "react"
import { ChevronDownIcon, EyeOffIcon, PaletteIcon, PencilIcon, PinIcon } from "lucide-react"
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

import { useMemo } from "react"
import { BoldIcon, RotateCcwIcon } from "lucide-react"
import { PanelHeader } from "@/components/ui/panel-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { HorizontalAlignButtons, VerticalAlignButtons } from "@/components/broadcast/align-buttons"
import { computeVerseLayoutMetrics } from "@/lib/verse-renderer"
import { cn } from "@/lib/utils"
import { useBroadcastStore, usePreviewStore } from "@/stores"
import { MAIN_OUTPUT_ID } from "@/types"
import type { BroadcastTheme, LyricsStyle, VerseRenderData } from "@/types"

/** Stands in for the words when the preview isn't showing a song or text. */
const SAMPLE: VerseRenderData = {
  style: "lyrics",
  reference: "",
  segments: ["Way maker, miracle worker", "Promise keeper", "Light in the darkness", "My God, that is who You are"].map(
    (text, i) => ({ text, lineBreak: i > 0 })
  ),
}

let measureCtx: CanvasRenderingContext2D | null = null

/** The size the words actually show at, at the theme's resolution. */
function useShownSize(theme: BroadcastTheme | undefined, content: VerseRenderData): number | null {
  return useMemo(() => {
    if (!theme) return null
    measureCtx ??= document.createElement("canvas").getContext("2d")
    if (!measureCtx) return null
    const fitted = computeVerseLayoutMetrics(measureCtx, theme, content).fittedVerseFontSize
    return fitted === undefined ? null : Math.round(fitted)
  }, [theme, content])
}

function Field({ label, children, aside }: { label: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {aside}
      </div>
      {children}
    </div>
  )
}

/**
 * Quick styling for songs and texts, beside the Songs and Texts tabs:
 * size, weight, spacing, alignment, colour, outline and how much of the
 * screen the words get, applied at once to the Preview, Live and outputs.
 * It's stored on the main output's theme as its song and text style, so
 * scripture keeps the theme's own look.
 */
export function LyricsStylePanel() {
  const themes = useBroadcastStore((s) => s.themes)
  const outputs = useBroadcastStore((s) => s.outputs)
  const activeThemeId = useBroadcastStore((s) => s.activeThemeId)
  const preview = usePreviewStore((s) => s.content)

  const themeId = outputs.find((o) => o.id === MAIN_OUTPUT_ID)?.themeId ?? activeThemeId
  const theme = themes.find((t) => t.id === themeId) ?? themes[0]
  const content = preview?.style === "lyrics" ? preview : SAMPLE
  const shown = useShownSize(theme, content)
  if (!theme) return null

  const base = theme.verseText
  const style: LyricsStyle = theme.lyricsText ?? {}
  const update = (patch: Partial<LyricsStyle>) => useBroadcastStore.getState().updateLyricsStyle(patch)

  const fontSize = style.fontSize ?? base.fontSize
  const fontWeight = style.fontWeight ?? base.fontWeight
  const lineHeight = style.lineHeight ?? base.lineHeight
  const color = style.color ?? base.color
  const shrinkToFit = (style.shrinkToFit ?? base.shrinkToFit) !== false
  const outline = style.outline === undefined ? base.outline : style.outline
  const area = style.area ?? "theme"
  const bold = fontWeight >= 600
  const shrunk = shrinkToFit && shown !== null && shown < fontSize
  const customised = theme.lyricsText !== undefined && Object.keys(theme.lyricsText).length > 0

  return (
    <div
      data-slot="lyrics-style-panel"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs"
    >
      <PanelHeader title="Song & text style">
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          disabled={!customised}
          onClick={() => useBroadcastStore.getState().updateLyricsStyle(null)}
          title="Go back to the theme's own text style"
        >
          <RotateCcwIcon />
          Reset
        </Button>
      </PanelHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3.5 pb-3.5">
        <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
          Changes show at once in Preview and Live. They're saved on{" "}
          <span className="font-medium text-foreground">{theme.name}</span>
          {theme.builtin && " (as a custom copy)"}; Bible verses keep the theme's look.
        </p>

        <Field label="Size" aside={<span className="text-xs tabular-nums text-muted-foreground">{fontSize}px</span>}>
          <div className="flex items-center gap-2">
            <Slider
              min={24}
              max={220}
              step={1}
              value={[fontSize]}
              onValueChange={([v]) => update({ fontSize: v })}
              className="flex-1"
              aria-label="Text size"
            />
            <Input
              type="number"
              min={8}
              max={300}
              value={fontSize}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (v >= 8 && v <= 300) update({ fontSize: v })
              }}
              className="h-8 w-16"
              aria-label="Text size in pixels"
            />
          </div>
          <p className={cn("text-[0.6875rem]", shrunk ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
            {shown === null
              ? ""
              : shrunk
                ? `Showing at ${shown}px to fit. Give it the whole screen, or turn off Shrink to fit.`
                : `Showing at ${shown}px.`}
          </p>
        </Field>

        <label className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Shrink to fit</span>
          <Switch checked={shrinkToFit} onCheckedChange={(on) => update({ shrinkToFit: on })} />
        </label>

        <Field label="Text area">
          <div role="radiogroup" aria-label="Text area" className="flex rounded-md bg-muted p-0.5">
            {(
              [
                ["theme", "Theme's box"],
                ["screen", "Whole screen"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={area === value}
                onClick={() => update({ area: value })}
                className={cn(
                  "h-7 flex-1 rounded-[5px] text-xs transition-colors",
                  area === value ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Line spacing"
          aside={<span className="text-xs tabular-nums text-muted-foreground">{lineHeight.toFixed(2)}</span>}
        >
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-pressed={bold}
              title={bold ? "Bold (click for regular)" : "Bold"}
              onClick={() => update({ fontWeight: bold ? 400 : 700 })}
              className={cn("shrink-0", bold && "border-primary bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary")}
            >
              <BoldIcon />
            </Button>
            <Slider
              min={0.8}
              max={2.2}
              step={0.05}
              value={[lineHeight]}
              onValueChange={([v]) => update({ lineHeight: v })}
              className="flex-1"
              aria-label="Line spacing"
            />
          </div>
        </Field>

        <Field label="Alignment">
          <HorizontalAlignButtons
            value={style.horizontalAlign ?? base.horizontalAlign ?? theme.layout.textAlign}
            onChange={(v) => update({ horizontalAlign: v })}
          />
          <VerticalAlignButtons
            value={style.verticalAlign ?? (area === "screen" ? "middle" : (base.verticalAlign ?? "top"))}
            onChange={(v) => update({ verticalAlign: v })}
          />
        </Field>

        <Field label="Colour">
          <input
            type="color"
            value={color.slice(0, 7)}
            onChange={(e) => update({ color: e.target.value })}
            className="h-8 w-full cursor-pointer rounded-md border border-input bg-transparent p-0.5"
            aria-label="Text colour"
          />
        </Field>

        <Field
          label="Outline"
          aside={<Switch checked={!!outline} onCheckedChange={(on) => update({ outline: on ? { color: "#000000", width: 3 } : null })} />}
        >
          {outline && (
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={outline.color.slice(0, 7)}
                onChange={(e) => update({ outline: { ...outline, color: e.target.value } })}
                className="h-7 w-8 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
                aria-label="Outline colour"
              />
              <Slider
                min={0.5}
                max={20}
                step={0.5}
                value={[outline.width]}
                onValueChange={([width]) => update({ outline: { ...outline, width } })}
                className="flex-1"
                aria-label="Outline thickness"
              />
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{outline.width}px</span>
            </div>
          )}
        </Field>
      </div>
    </div>
  )
}

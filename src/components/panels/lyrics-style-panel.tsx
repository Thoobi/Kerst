import { useMemo, useState } from "react"
import { BoldIcon, RotateCcwIcon, XIcon } from "lucide-react"
import { PanelHeader } from "@/components/ui/panel-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { HorizontalAlignButtons, VerticalAlignButtons } from "@/components/broadcast/align-buttons"
import { BackgroundPicker } from "@/components/panels/background-picker"
import { setScriptureBackground } from "@/hooks/use-broadcast"
import { toRenderData } from "@/lib/slides"
import { computeVerseLayoutMetrics } from "@/lib/verse-renderer"
import { cn } from "@/lib/utils"
import { useBibleStore, useBroadcastStore, usePreviewStore } from "@/stores"
import { useContentTabStore } from "@/stores/content-tab-store"
import { MAIN_OUTPUT_ID } from "@/types"
import type { BroadcastTheme, LyricsStyle, ScriptureStyle, VerseRenderData } from "@/types"

type Kind = "lyrics" | "scripture"

/** Stands in for the words when the preview isn't showing a song or text. */
const SAMPLE: VerseRenderData = {
  style: "lyrics",
  reference: "",
  segments: ["Way maker, miracle worker", "Promise keeper", "Light in the darkness", "My God, that is who You are"].map(
    (text, i) => ({ text, lineBreak: i > 0 })
  ),
}

/** Stands in for the verse when none is picked yet. */
const SAMPLE_VERSE: VerseRenderData = {
  style: "scripture",
  reference: "John 3:16 (KJV)",
  segments: [
    {
      verseNumber: 16,
      text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
    },
  ],
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

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md bg-muted p-0.5">
      {options.map(([option, text]) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "h-7 flex-1 rounded-[5px] text-xs transition-colors",
            value === option ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
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
 * scripture keeps its own look.
 */
export function LyricsStylePanel() {
  return <TextStylePanel kind="lyrics" />
}

/**
 * The same for Bible verses, opened from the Bible tab: the verse text, the
 * reference and the background, stored on the main output's theme as its
 * Bible style.
 */
export function ScriptureStylePanel() {
  return <TextStylePanel kind="scripture" />
}

function TextStylePanel({ kind }: { kind: Kind }) {
  const themes = useBroadcastStore((s) => s.themes)
  const outputs = useBroadcastStore((s) => s.outputs)
  const activeThemeId = useBroadcastStore((s) => s.activeThemeId)
  const preview = usePreviewStore((s) => s.content)
  const selectedVerse = useBibleStore((s) => s.selectedVerse)
  const translations = useBibleStore((s) => s.translations)
  const activeTranslationId = useBibleStore((s) => s.activeTranslationId)
  // "Video" picked, but no video chosen from the list yet.
  const [choosingVideo, setChoosingVideo] = useState(false)

  const themeId = outputs.find((o) => o.id === MAIN_OUTPUT_ID)?.themeId ?? activeThemeId
  const theme = themes.find((t) => t.id === themeId) ?? themes[0]
  const translation = translations.find((t) => t.id === activeTranslationId)?.abbreviation ?? "KJV"
  const content = useMemo(() => {
    if (kind === "lyrics") return preview?.style === "lyrics" ? preview : SAMPLE
    return selectedVerse ? toRenderData({ kind: "scripture", verse: selectedVerse, translation }) : SAMPLE_VERSE
  }, [kind, preview, selectedVerse, translation])
  const shown = useShownSize(theme, content)
  if (!theme) return null

  const base = theme.verseText
  const style: ScriptureStyle = (kind === "lyrics" ? theme.lyricsText : theme.scriptureText) ?? {}
  const update = (patch: Partial<ScriptureStyle>) => {
    const broadcast = useBroadcastStore.getState()
    if (kind === "lyrics") broadcast.updateLyricsStyle(patch as Partial<LyricsStyle>)
    else broadcast.updateScriptureStyle(patch)
  }
  const reset = () => {
    const broadcast = useBroadcastStore.getState()
    if (kind === "lyrics") broadcast.updateLyricsStyle(null)
    else if (style.backgroundVideoId) {
      // Through the background helper so a live verse loses its video too.
      setScriptureBackground(null)
      broadcast.updateScriptureStyle(null)
    } else broadcast.updateScriptureStyle(null)
  }

  const fontSize = style.fontSize ?? base.fontSize
  const fontWeight = style.fontWeight ?? base.fontWeight
  const lineHeight = style.lineHeight ?? base.lineHeight
  const color = style.color ?? base.color
  const shrinkToFit = (style.shrinkToFit ?? base.shrinkToFit) !== false
  const outline = style.outline === undefined ? base.outline : style.outline
  const area = style.area ?? "theme"
  const bold = fontWeight >= 600
  const shrunk = shrinkToFit && shown !== null && shown < fontSize
  const customised = Object.values(style).some((value) => value !== undefined && value !== null)
  const referenceSize = style.referenceFontSize ?? theme.reference.fontSize
  const referenceColor = style.referenceColor ?? theme.reference.color
  const backgroundMode =
    style.backgroundVideoId || choosingVideo ? "video" : style.backgroundColor ? "colour" : "theme"

  return (
    <div
      data-slot={kind === "lyrics" ? "lyrics-style-panel" : "scripture-style-panel"}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs"
    >
      <PanelHeader title={kind === "lyrics" ? "Song & text style" : "Bible style"}>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            disabled={!customised}
            onClick={reset}
            title="Go back to the theme's own style"
          >
            <RotateCcwIcon />
            Reset
          </Button>
          {kind === "scripture" && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              onClick={() => useContentTabStore.getState().setBibleStyleOpen(false)}
              title="Close and show detections"
              aria-label="Close Bible style"
            >
              <XIcon />
            </Button>
          )}
        </div>
      </PanelHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3.5 pb-3.5">
        <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
          Changes show at once in Preview and Live. They're saved on{" "}
          <span className="font-medium text-foreground">{theme.name}</span>
          {theme.builtin && " (as a custom copy)"}
          {kind === "lyrics" ? "; Bible verses keep their own look." : "; songs and texts keep their own look."}
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
                ? `Only ${shown}px fits, so it shows at ${shown}px. To go bigger:`
                : `Showing at ${shown}px.`}
          </p>
          {shrunk && (
            <div className="flex flex-wrap gap-1.5">
              {area !== "screen" && (
                <Button variant="outline" size="xs" onClick={() => update({ area: "screen" })}>
                  Use whole screen
                </Button>
              )}
              <Button
                variant="outline"
                size="xs"
                onClick={() => update({ shrinkToFit: false })}
                title="Shows the exact size; long text may run off the screen"
              >
                Turn off Shrink to fit
              </Button>
            </div>
          )}
        </Field>

        <label className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Shrink to fit</span>
          <Switch checked={shrinkToFit} onCheckedChange={(on) => update({ shrinkToFit: on })} />
        </label>

        <Field label="Text area">
          <Segmented
            label="Text area"
            value={area}
            options={[
              ["theme", "Theme's box"],
              ["screen", "Whole screen"],
            ]}
            onChange={(value) => update({ area: value })}
          />
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

        {kind === "scripture" && (
          <>
            <Field
              label="Reference"
              aside={<span className="text-xs tabular-nums text-muted-foreground">{referenceSize}px</span>}
            >
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={referenceColor.slice(0, 7)}
                  onChange={(e) => update({ referenceColor: e.target.value })}
                  className="h-7 w-8 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  aria-label="Reference colour"
                />
                <Slider
                  min={12}
                  max={160}
                  step={1}
                  value={[referenceSize]}
                  onValueChange={([v]) => update({ referenceFontSize: v })}
                  className="flex-1"
                  aria-label="Reference size"
                />
              </div>
            </Field>

            <Field label="Background">
              <Segmented
                label="Background"
                value={backgroundMode}
                options={[
                  ["theme", "Theme"],
                  ["colour", "Colour"],
                  ["video", "Video"],
                ]}
                onChange={(mode) => {
                  setChoosingVideo(mode === "video")
                  if (mode === "video") return
                  if (style.backgroundVideoId) setScriptureBackground(null)
                  update({
                    backgroundColor:
                      mode === "colour" ? (style.backgroundColor ?? theme.background.color.slice(0, 7)) : undefined,
                  })
                }}
              />
              {backgroundMode === "video" && (
                <BackgroundPicker
                  videoId={style.backgroundVideoId ?? null}
                  onChoose={async (videoId) => {
                    setScriptureBackground(videoId)
                    if (videoId) update({ backgroundColor: undefined })
                    else setChoosingVideo(false)
                  }}
                />
              )}
              {backgroundMode === "colour" && style.backgroundColor && (
                <input
                  type="color"
                  value={style.backgroundColor.slice(0, 7)}
                  onChange={(e) => update({ backgroundColor: e.target.value })}
                  className="h-8 w-full cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                  aria-label="Background colour"
                />
              )}
            </Field>
          </>
        )}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from "react"
import { BoldIcon, ChevronsUpDownIcon, CheckIcon } from "lucide-react"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { SurfaceControls } from "@/components/broadcast/surface-properties"
import { HorizontalAlignButtons, VerticalAlignButtons } from "@/components/broadcast/align-buttons"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { computeVerseLayoutMetrics } from "@/lib/verse-renderer"
import { SAMPLE_VERSE } from "@/lib/theme-migrations"
import type { BroadcastTheme } from "@/types"
import { parseColorOpacity, buildColorWithOpacity } from "@/lib/color-utils"
import { listAllFonts } from "@/lib/fonts"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/** A canvas context only for measuring text; never drawn to screen. */
let measureCtx: CanvasRenderingContext2D | null = null

/**
 * The verse text's actual on-screen size for the editor's sample verse, at
 * the theme's resolution. Below the set size means it was shrunk to fit.
 */
function useShownVerseSize(theme: BroadcastTheme): number | null {
  return useMemo(() => {
    measureCtx ??= document.createElement("canvas").getContext("2d")
    if (!measureCtx) return null
    const fitted = computeVerseLayoutMetrics(measureCtx, theme, SAMPLE_VERSE).fittedVerseFontSize
    return fitted === undefined ? null : Math.round(fitted)
  }, [theme])
}

/**
 * What size the text really shows at, and the switch for shrinking it to
 * fit. Without this the size control seemed broken: past what fits the
 * box, raising it changed nothing on screen.
 */
function ShrinkToFitControl({ theme, onChange }: { theme: BroadcastTheme; onChange: (on: boolean) => void }) {
  const shown = useShownVerseSize(theme)
  const shrinking = theme.verseText.shrinkToFit !== false
  const shrunk = shrinking && shown !== null && shown < theme.verseText.fontSize
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Shrink to fit box</span>
        <Switch checked={shrinking} onCheckedChange={onChange} />
      </label>
      {shrunk ? (
        <p className="text-[0.6875rem] text-amber-600 dark:text-amber-400">
          Showing at {shown}px: shrunk to fit the text box. Make the box bigger, or turn this off to
          always use {theme.verseText.fontSize}px.
        </p>
      ) : (
        <p className="text-[0.6875rem] text-muted-foreground">
          {shrinking
            ? "Text this size fits. Longer passages and songs shrink to stay inside the box."
            : "Always this size. Long passages may run past the box."}
        </p>
      )}
    </div>
  )
}

/**
 * An outline around the letters: on/off, thickness and colour. Sits with
 * the font settings so it's found where you'd look for it.
 */
function OutlineControl({
  outline,
  onChange,
}: {
  outline: { color: string; width: number } | null
  onChange: (outline: { color: string; width: number } | null) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Outline</span>
        <Switch
          checked={outline !== null}
          onCheckedChange={(on) => onChange(on ? { color: "#000000", width: 3 } : null)}
        />
      </label>
      {outline && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={parseColorOpacity(outline.color).hex}
            onChange={(e) => onChange({ ...outline, color: e.target.value })}
            className="h-7 w-8 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
            aria-label="Outline colour"
          />
          <Slider
            min={0.5}
            max={20}
            step={0.5}
            value={[outline.width]}
            onValueChange={([width]) => onChange({ ...outline, width })}
            className="flex-1"
            aria-label="Outline thickness"
          />
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {outline.width}px
          </span>
        </div>
      )}
    </div>
  )
}

function FontFamilyPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (font: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [fonts, setFonts] = useState<{ bundled: string[]; system: string[] }>({
    bundled: [],
    system: [],
  })

  useEffect(() => {
    let cancelled = false
    void listAllFonts().then((result) => {
      if (!cancelled) setFonts(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const renderItem = (font: string) => (
    <CommandItem
      key={font}
      value={font}
      onSelect={() => {
        onChange(font)
        setOpen(false)
      }}
    >
      <CheckIcon
        className={`size-3.5 ${font === value ? "opacity-100" : "opacity-0"}`}
      />
      <span style={{ fontFamily: `"${font}"` }}>{font}</span>
    </CommandItem>
  )

  return (
    // modal: the designer lives in a Radix Dialog whose scroll lock swallows
    // wheel events in portaled popover content — modal popovers manage their
    // own lock, restoring wheel scrolling in the font list.
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate" style={{ fontFamily: `"${value}"` }}>
            {value}
          </span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search fonts…" />
          <CommandList className="max-h-64">
            <CommandEmpty>No font found.</CommandEmpty>
            <CommandGroup heading="Bundled">
              {fonts.bundled.map(renderItem)}
            </CommandGroup>
            {fonts.system.length > 0 && (
              <CommandGroup heading="System">
                {fonts.system.map(renderItem)}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

const FONT_WEIGHTS = [
  { value: "100", label: "100 - Thin" },
  { value: "200", label: "200 - Extra Light" },
  { value: "300", label: "300 - Light" },
  { value: "400", label: "400 - Regular" },
  { value: "500", label: "500 - Medium" },
  { value: "600", label: "600 - Semi Bold" },
  { value: "700", label: "700 - Bold" },
  { value: "800", label: "800 - Extra Bold" },
  { value: "900", label: "900 - Black" },
]



const TEXT_TRANSFORM_OPTIONS = [
  { value: "none", label: "None" },
  { value: "uppercase", label: "Uppercase" },
  { value: "lowercase", label: "Lowercase" },
  { value: "capitalize", label: "Capitalize" },
] as const

const TEXT_DECORATION_OPTIONS = [
  { value: "none", label: "None" },
  { value: "underline", label: "Underline" },
  { value: "line-through", label: "Line Through" },
] as const

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-0.5 pb-1">
      <h4 className="text-xs font-semibold">{title}</h4>
      <p className="text-[11px] text-muted-foreground">{description}</p>
    </div>
  )
}

function FontControls({ prefix }: { prefix: "verseText" | "reference" }) {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme) return null

  const data = prefix === "verseText" ? draftTheme.verseText : draftTheme.reference
  const { hex: colorHex, opacity: colorOpacity } = parseColorOpacity(data.color)
  const horizontalAlign = data.horizontalAlign ?? draftTheme.layout.textAlign
  const verticalAlign = data.verticalAlign ?? "top"
  const textTransform = data.textTransform ?? "none"
  const textDecoration = data.textDecoration ?? "none"

  return (
    <div className="flex flex-col gap-3">
      {/* Font Family */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Font Family</label>
        <FontFamilyPicker
          value={data.fontFamily}
          onChange={(v) => update(`${prefix}.fontFamily`, v)}
        />
      </div>

      {/* Font Weight, with a one-click Bold beside it */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Font Weight</label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-pressed={data.fontWeight >= 600}
            title={data.fontWeight >= 600 ? "Bold (click for regular)" : "Bold"}
            onClick={() => update(`${prefix}.fontWeight`, data.fontWeight >= 600 ? 400 : 700)}
            className={cn(
              "shrink-0",
              data.fontWeight >= 600 && "border-primary bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
            )}
          >
            <BoldIcon />
          </Button>
          <Select
            value={String(data.fontWeight)}
            onValueChange={(v) => update(`${prefix}.fontWeight`, Number(v))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHTS.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <OutlineControl
        outline={data.outline ?? null}
        onChange={(outline) => update(`${prefix}.outline`, outline)}
      />

      {/* Font Size */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">Font Size</label>
          <span className="text-xs tabular-nums text-muted-foreground">{data.fontSize}px</span>
        </div>
        <div className="flex items-center gap-2">
          <Slider
            min={8}
            max={200}
            step={1}
            value={[data.fontSize]}
            onValueChange={([v]) => update(`${prefix}.fontSize`, v)}
            className="flex-1"
          />
          <Input
            type="number"
            min={8}
            max={200}
            value={data.fontSize}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (v >= 8 && v <= 200) update(`${prefix}.fontSize`, v)
            }}
            className="w-16"
          />
        </div>
      </div>

      {prefix === "verseText" && (
        <ShrinkToFitControl
          theme={draftTheme}
          onChange={(on) => update("verseText.shrinkToFit", on)}
        />
      )}

      {/* Line Height — only for verse text, reference type doesn't have lineHeight */}
      {prefix === "verseText" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Line Height</label>
            <span className="text-xs tabular-nums text-muted-foreground">{(draftTheme.verseText.lineHeight).toFixed(2)}</span>
          </div>
          <Slider
            min={0.5}
            max={3.0}
            step={0.05}
            value={[draftTheme.verseText.lineHeight]}
            onValueChange={([v]) => update("verseText.lineHeight", v)}
          />
        </div>
      )}

      {/* Letter Spacing */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">Letter Spacing</label>
          <span className="text-xs tabular-nums text-muted-foreground">{data.letterSpacing}px</span>
        </div>
        <Slider
          min={-5}
          max={50}
          step={0.5}
          value={[data.letterSpacing]}
          onValueChange={([v]) => update(`${prefix}.letterSpacing`, v)}
        />
      </div>

      {/* Alignment */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Alignment</label>
        <HorizontalAlignButtons
          value={horizontalAlign}
          onChange={(v) => update(`${prefix}.horizontalAlign`, v)}
          justify={prefix === "verseText"}
        />
      </div>

      {/* Vertical Alignment */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Vertical Alignment</label>
        <VerticalAlignButtons value={verticalAlign} onChange={(v) => update(`${prefix}.verticalAlign`, v)} />
      </div>

      {/* Text Transform */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Text Transform</label>
        <Select
          value={textTransform}
          onValueChange={(v) => update(`${prefix}.textTransform`, v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEXT_TRANSFORM_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Text Decoration */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Text Decoration</label>
        <Select
          value={textDecoration}
          onValueChange={(v) => update(`${prefix}.textDecoration`, v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEXT_DECORATION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Text Color */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Text Color</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={colorHex}
            onChange={(e) =>
              update(`${prefix}.color`, buildColorWithOpacity(e.target.value, colorOpacity))
            }
            className="h-7 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
          />
          <Input
            value={colorHex}
            onChange={(e) => {
              const v = e.target.value
              if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                update(`${prefix}.color`, buildColorWithOpacity(v, colorOpacity))
              }
            }}
            className="w-20 font-mono"
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">Opacity</label>
          <span className="text-xs tabular-nums text-muted-foreground">{colorOpacity}%</span>
        </div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[colorOpacity]}
          onValueChange={([v]) =>
            update(`${prefix}.color`, buildColorWithOpacity(colorHex, v))
          }
        />
      </div>
    </div>
  )
}

function ReferenceProperties() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme) return null

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title="Reference Text" description="Customize how reference text appears" />
      <FontControls prefix="reference" />

      {/* Uppercase */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">Uppercase</label>
        <input
          type="checkbox"
          checked={draftTheme.reference.uppercase}
          onChange={(e) => update("reference.uppercase", e.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary"
        />
      </div>

      <SurfaceControls
        prefix="reference.surface"
        title="Reference Plate"
        description="A chip behind the reference alone"
      />

      {/* Reference Position (stacked mode only — free mode positions by box) */}
      {draftTheme.layout.mode !== "free" && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Reference Position</label>
          <Select
            value={draftTheme.reference.position}
            onValueChange={(v) => update("reference.position", v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="above">Above Verse</SelectItem>
              <SelectItem value="below">Below Verse</SelectItem>
              <SelectItem value="inline">Inline</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

function VerseProperties() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme) return null

  const shadow = draftTheme.verseText.shadow

  const shadowColor = shadow ? parseColorOpacity(shadow.color) : { hex: "#000000", opacity: 100 }

  const verseNumbers = draftTheme.verseNumbers
  const verseNumberColor = parseColorOpacity(verseNumbers.color)
  const superscriptSizePct = Math.round(
    (verseNumbers.fontSize / draftTheme.verseText.fontSize) * 100
  )

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title="Verse Text" description="Customize how verse text appears" />
      <FontControls prefix="verseText" />

      {/* Verse Numbers */}
      <div className="flex flex-col gap-3 border-t pt-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold">Verse Numbers</label>
          <input
            type="checkbox"
            checked={verseNumbers.visible}
            onChange={(e) => update("verseNumbers.visible", e.target.checked)}
            className="h-4 w-4 rounded border-input accent-primary"
          />
        </div>

        {verseNumbers.visible && (
          <div className="flex flex-col gap-3">
            {/* Superscript */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Superscript</label>
              <input
                type="checkbox"
                checked={verseNumbers.superscript}
                onChange={(e) => update("verseNumbers.superscript", e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
            </div>

            {/* Superscript Size */}
            {verseNumbers.superscript && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Size</label>
                  <span className="text-xs tabular-nums text-muted-foreground">{superscriptSizePct}%</span>
                </div>
                <Slider
                  min={20}
                  max={100}
                  step={1}
                  value={[superscriptSizePct]}
                  onValueChange={([v]) => {
                    const newFontSize = Math.round((v / 100) * draftTheme.verseText.fontSize)
                    update("verseNumbers.fontSize", newFontSize)
                  }}
                />
              </div>
            )}

            {/* Number Color */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Number Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={verseNumberColor.hex}
                  onChange={(e) =>
                    update(
                      "verseNumbers.color",
                      buildColorWithOpacity(e.target.value, verseNumberColor.opacity)
                    )
                  }
                  className="h-7 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
                />
                <Input
                  value={verseNumberColor.hex}
                  onChange={(e) => {
                    const v = e.target.value
                    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                      update(
                        "verseNumbers.color",
                        buildColorWithOpacity(v, verseNumberColor.opacity)
                      )
                    }
                  }}
                  className="w-20 font-mono"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Opacity</label>
                <span className="text-xs tabular-nums text-muted-foreground">{verseNumberColor.opacity}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[verseNumberColor.opacity]}
                onValueChange={([v]) =>
                  update("verseNumbers.color", buildColorWithOpacity(verseNumberColor.hex, v))
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* Text Shadow */}
      <div className="flex flex-col gap-3 border-t pt-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold">Text Shadow</label>
          <input
            type="checkbox"
            checked={shadow !== null}
            onChange={(e) => {
              if (e.target.checked) {
                update("verseText.shadow", { color: "#00000080", blur: 4, x: 2, y: 2 })
              } else {
                update("verseText.shadow", null)
              }
            }}
            className="h-4 w-4 rounded border-input accent-primary"
          />
        </div>

        {shadow && (
          <div className="flex flex-col gap-3">
            {/* Offset X */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Offset X</label>
                <span className="text-xs tabular-nums text-muted-foreground">{shadow.x}px</span>
              </div>
              <Slider
                min={-20}
                max={50}
                step={1}
                value={[shadow.x]}
                onValueChange={([v]) => update("verseText.shadow.x", v)}
              />
            </div>

            {/* Offset Y */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Offset Y</label>
                <span className="text-xs tabular-nums text-muted-foreground">{shadow.y}px</span>
              </div>
              <Slider
                min={-20}
                max={50}
                step={1}
                value={[shadow.y]}
                onValueChange={([v]) => update("verseText.shadow.y", v)}
              />
            </div>

            {/* Blur */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Blur</label>
                <span className="text-xs tabular-nums text-muted-foreground">{shadow.blur}px</span>
              </div>
              <Slider
                min={0}
                max={50}
                step={1}
                value={[shadow.blur]}
                onValueChange={([v]) => update("verseText.shadow.blur", v)}
              />
            </div>

            {/* Shadow Color */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Shadow Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={shadowColor.hex}
                  onChange={(e) =>
                    update(
                      "verseText.shadow.color",
                      buildColorWithOpacity(e.target.value, shadowColor.opacity)
                    )
                  }
                  className="h-7 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
                />
                <Input
                  value={shadowColor.hex}
                  onChange={(e) => {
                    const v = e.target.value
                    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                      update(
                        "verseText.shadow.color",
                        buildColorWithOpacity(v, shadowColor.opacity)
                      )
                    }
                  }}
                  className="w-20 font-mono"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Opacity</label>
                <span className="text-xs tabular-nums text-muted-foreground">{shadowColor.opacity}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[shadowColor.opacity]}
                onValueChange={([v]) =>
                  update(
                    "verseText.shadow.color",
                    buildColorWithOpacity(shadowColor.hex, v)
                  )
                }
              />
            </div>
          </div>
        )}
      </div>

      <SurfaceControls
        prefix="verseText.surface"
        title="Verse Plate"
        description="A plate behind the verse text alone"
      />
    </div>
  )
}

export function TextProperties() {
  const selectedElement = useBroadcastStore((s) => s.selectedElement)

  if (selectedElement === "reference") {
    return <ReferenceProperties />
  }

  if (selectedElement === "verse") {
    return <VerseProperties />
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <p className="text-sm font-medium text-muted-foreground">No element selected</p>
      <p className="text-xs text-muted-foreground">
        Click on verse, reference, or translation text in the canvas to edit its properties
      </p>
    </div>
  )
}

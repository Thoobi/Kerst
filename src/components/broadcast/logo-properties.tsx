import { useBroadcastStore } from "@/stores/broadcast-store"
import { pickThemeBackgroundImage } from "@/lib/theme-designer-files"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { LogoCorner, ThemeLogo } from "@/types/broadcast"

const DEFAULT_LOGO: Omit<ThemeLogo, "url"> = {
  corner: "top-right",
  size: 10,
  opacity: 100,
  margin: 4,
  overMedia: false,
}

const CORNERS: { value: LogoCorner; label: string }[] = [
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
]

function SliderRow({
  label,
  value,
  unit,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  unit: string
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value}
          {unit}
        </span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
    </div>
  )
}

export function LogoProperties() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme) return null
  const logo = draftTheme.logo ?? null

  const pick = () => {
    void (async () => {
      const url = await pickThemeBackgroundImage()
      if (url) update("logo", { ...DEFAULT_LOGO, ...logo, url })
    })()
  }

  if (!logo) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          A logo sits in a corner of the screen over everything else. PNG, SVG and animated GIF
          all work; a transparent background looks best.
        </p>
        <Button variant="outline" size="sm" className="w-full" onClick={pick}>
          Add Logo
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center rounded border border-border bg-[repeating-conic-gradient(#8884_0_25%,transparent_0_50%)] bg-[length:12px_12px] p-1">
          <img src={logo.url} alt="" className="max-h-full max-w-full object-contain" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Button variant="outline" size="sm" className="w-full" onClick={pick}>
            Change Logo
          </Button>
          <Button variant="ghost" size="sm" className="w-full" onClick={() => update("logo", null)}>
            Remove
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Corner</label>
        <div role="radiogroup" aria-label="Corner" className="grid grid-cols-2 gap-0.5 rounded-md bg-muted p-0.5">
          {CORNERS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={logo.corner === c.value}
              onClick={() => update("logo.corner", c.value)}
              className={cn(
                "h-7 rounded-[5px] text-xs text-muted-foreground transition-colors",
                logo.corner === c.value ? "bg-card text-foreground shadow-sm" : "hover:text-foreground"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <SliderRow
        label="Size"
        value={logo.size}
        unit="% of height"
        min={2}
        max={40}
        onChange={(v) => update("logo.size", v)}
      />
      <SliderRow
        label="Margin"
        value={logo.margin}
        unit="%"
        min={0}
        max={15}
        step={0.5}
        onChange={(v) => update("logo.margin", v)}
      />
      <SliderRow
        label="Opacity"
        value={logo.opacity}
        unit="%"
        min={5}
        max={100}
        onChange={(v) => update("logo.opacity", v)}
      />

      <label className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Also over slides and videos</span>
        <Switch checked={logo.overMedia} onCheckedChange={(on) => update("logo.overMedia", on)} />
      </label>
    </div>
  )
}

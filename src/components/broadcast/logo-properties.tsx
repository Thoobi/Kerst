import { useState } from "react"
import { toast } from "sonner"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { pickThemeBackgroundImage } from "@/lib/theme-designer-files"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { logoMargins } from "@/lib/verse-renderer"
import { Link2Icon, Unlink2Icon } from "lucide-react"
import type { LogoCorner, LogoMargins, ThemeLogo } from "@/types/broadcast"

type Side = keyof LogoMargins

/** The corner a logo moves to when `side` is set: that side, and the corner's other side kept. */
function cornerFor(corner: LogoCorner, side: Side): LogoCorner {
  const vertical = side === "top" || side === "bottom" ? side : corner.startsWith("top") ? "top" : "bottom"
  const horizontal = side === "left" || side === "right" ? side : corner.endsWith("left") ? "left" : "right"
  return `${vertical}-${horizontal}` as LogoCorner
}

/** Whether `side` places a logo in `corner` (the other two don't, until typed in). */
const placesLogo = (corner: LogoCorner, side: Side) => corner.includes(side)

/**
 * Top, right, bottom and left margins around a picture of the frame, like
 * padding in a design tool. The two sides at the logo's corner place it;
 * typing in one of the others moves the logo over to that side. Linked,
 * one value sets all four.
 */
function MarginBox({
  logo,
  frame,
  onChange,
}: {
  logo: ThemeLogo
  frame: { width: number; height: number }
  onChange: (patch: Partial<ThemeLogo>) => void
}) {
  const margins = logoMargins(logo, frame.height)
  // Each side on its own to start, as in a design tool; the link sets all four at once.
  const [link, setLink] = useState(false)

  const set = (side: Side, value: number) => {
    const max = side === "top" || side === "bottom" ? frame.height : frame.width
    const v = Math.max(0, Math.min(max, Math.round(value)))
    const next: LogoMargins = link ? { top: v, right: v, bottom: v, left: v } : { ...margins, [side]: v }
    onChange({ margins: next, corner: link ? logo.corner : cornerFor(logo.corner, side) })
  }

  const field = (side: Side, className: string) => {
    const active = link || placesLogo(logo.corner, side)
    return (
      <Input
        type="number"
        min={0}
        step={1}
        aria-label={`${side[0].toUpperCase()}${side.slice(1)} margin`}
        title={active ? `${side} margin, px` : `Type here to move the logo to the ${side}`}
        value={margins[side]}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) set(side, v)
        }}
        className={cn("h-7 w-16 px-1.5 text-center text-xs tabular-nums", !active && "text-muted-foreground/60", className)}
      />
    )
  }

  const top = logo.corner.startsWith("top")
  const left = logo.corner.endsWith("left")
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">Margins</label>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-pressed={link}
          title={link ? "Margins linked: one value for every side" : "Link the margins"}
          onClick={() => {
            if (!link) {
              const v = left ? margins.left : margins.right
              onChange({ margins: { top: v, right: v, bottom: v, left: v } })
            }
            setLink(!link)
          }}
          className={cn("text-muted-foreground", link && "bg-accent text-foreground")}
        >
          {link ? <Link2Icon className="size-3.5" /> : <Unlink2Icon className="size-3.5" />}
        </Button>
      </div>
      <div className="grid grid-cols-[auto_1fr_auto] grid-rows-[auto_auto_auto] items-center justify-items-center gap-1.5">
        <div className="col-start-2 row-start-1">{field("top", "")}</div>
        <div className="col-start-1 row-start-2">{field("left", "")}</div>
        {/* The frame, with the logo in its corner: click a corner to move it there. */}
        <div className="relative col-start-2 row-start-2 aspect-video w-full max-w-28 rounded border border-border bg-muted/40">
          {(["top-left", "top-right", "bottom-left", "bottom-right"] as LogoCorner[]).map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Move the logo to the ${c.replace("-", " ")}`}
              onClick={() => onChange({ corner: c })}
              className={cn(
                "absolute size-1/2 rounded-sm hover:bg-foreground/5",
                c.startsWith("top") ? "top-0" : "bottom-0",
                c.endsWith("left") ? "left-0" : "right-0"
              )}
            />
          ))}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute size-3 rounded-[3px] bg-primary",
              top ? "top-1.5" : "bottom-1.5",
              left ? "left-1.5" : "right-1.5"
            )}
          />
        </div>
        <div className="col-start-3 row-start-2">{field("right", "")}</div>
        <div className="col-start-2 row-start-3">{field("bottom", "")}</div>
      </div>
      <p className="text-[0.625rem] text-muted-foreground">
        In px. The logo measures from the two sides of its corner; type in another side to move it there.
      </p>
    </div>
  )
}

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
      try {
        const url = await pickThemeBackgroundImage()
        if (url) update("logo", { ...DEFAULT_LOGO, ...logo, url })
      } catch (error) {
        toast.error("Could not add the logo", { description: String(error) })
      }
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
      <MarginBox
        logo={logo}
        frame={draftTheme.resolution}
        onChange={(patch) => update("logo", { ...logo, ...patch })}
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

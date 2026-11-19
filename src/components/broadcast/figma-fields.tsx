import { useState } from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { ScrubField } from "@/components/broadcast/sides-editor"
import { corners, DEFAULT_SHADOW, sameCorners, type Radius } from "@/lib/corners"
import { buildColorWithOpacity, parseColorOpacity } from "@/lib/color-utils"
import { cn } from "@/lib/utils"
import type { CornerRadii, ShadowStyle } from "@/types/broadcast"

type Corner = keyof CornerRadii

/** A rounded corner, turned to the corner it sets. */
function CornerGlyph({ corner }: { corner: Corner | "all" }) {
  const turn = { tl: 0, tr: 90, br: 180, bl: 270, all: 0 }[corner]
  return (
    <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden style={{ transform: `rotate(${turn}deg)` }}>
      {corner === "all" ? (
        <rect x="1.5" y="1.5" width="9" height="9" rx="3" className="stroke-foreground" strokeWidth="1.25" />
      ) : (
        <path d="M1.5 10.5V5.5a4 4 0 0 1 4-4h5" className="stroke-foreground" strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  )
}

function SectionToggle({
  pressed,
  onClick,
  title,
  children,
}: {
  pressed: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={title}
      className={cn(
        "flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        pressed && "bg-muted text-foreground"
      )}
    >
      {children}
    </button>
  )
}

/**
 * Corner rounding as design tools set it: one radius for every corner, or
 * (the toggle) each corner its own. Drag an icon sideways to scrub.
 */
export function RadiusEditor({
  label = "Corner radius",
  value,
  max = 400,
  onChange,
}: {
  label?: string
  value: Radius
  max?: number
  onChange: (value: Radius) => void
}) {
  const c = corners(value)
  const [separate, setSeparate] = useState(typeof value !== "number" && !sameCorners(c))
  const field = (corner: Corner, name: string) => (
    <ScrubField
      label={`${label}: ${name}`}
      icon={<CornerGlyph corner={corner} />}
      value={c[corner]}
      max={max}
      onChange={(v) => onChange({ ...c, [corner]: v })}
    />
  )
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <SectionToggle
          pressed={separate}
          onClick={() => {
            // Back to one radius: the top left's, for every corner.
            if (separate) onChange(c.tl)
            setSeparate(!separate)
          }}
          title={separate ? "One radius for every corner" : "Round each corner on its own"}
        >
          <svg viewBox="0 0 12 12" className="size-3.5" fill="none" aria-hidden>
            {(["tl", "tr", "br", "bl"] as Corner[]).map((corner, i) => (
              <path
                key={corner}
                d="M1 5V3a2 2 0 0 1 2-2h2"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
                transform={`rotate(${i * 90} 6 6)`}
              />
            ))}
          </svg>
        </SectionToggle>
      </div>
      {separate ? (
        <div className="grid grid-cols-2 gap-1.5">
          {field("tl", "top left")}
          {field("tr", "top right")}
          {field("bl", "bottom left")}
          {field("br", "bottom right")}
        </div>
      ) : (
        <ScrubField
          label={label}
          icon={<CornerGlyph corner="all" />}
          value={c.tl}
          max={max}
          onChange={(v) => onChange(v)}
        />
      )}
    </div>
  )
}

/** A letter standing in for an icon, as design tools label X and Y. */
const Letter = ({ children }: { children: string }) => (
  <span className="w-3 text-center text-[0.625rem] font-semibold text-muted-foreground">{children}</span>
)

/**
 * A drop shadow, set the way design tools do: on or off (the eye), its
 * colour and opacity, X and Y offset, blur and spread.
 */
export function ShadowEditor({
  enabled,
  value,
  onToggle,
  onChange,
}: {
  enabled: boolean
  value: ShadowStyle | null | undefined
  onToggle: (on: boolean) => void
  onChange: (value: ShadowStyle) => void
}) {
  const style = value ?? DEFAULT_SHADOW
  const { hex, opacity } = parseColorOpacity(style.color)
  const set = (patch: Partial<ShadowStyle>) => onChange({ ...style, ...patch })
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Drop shadow</span>
        <SectionToggle pressed={enabled} onClick={() => onToggle(!enabled)} title={enabled ? "Hide the shadow" : "Show a shadow"}>
          {enabled ? <EyeIcon className="size-3.5" /> : <EyeOffIcon className="size-3.5" />}
        </SectionToggle>
      </div>
      {enabled && (
        <>
          <div className="flex items-center gap-1.5">
            <label className="flex h-7 flex-1 items-center gap-2 rounded-md bg-muted/60 px-1.5">
              <input
                type="color"
                value={hex}
                onChange={(e) => set({ color: buildColorWithOpacity(e.target.value, opacity) })}
                className="size-4 cursor-pointer rounded-sm border-0 bg-transparent p-0"
                aria-label="Shadow colour"
              />
              <span className="font-mono text-xs uppercase">{hex.replace("#", "")}</span>
            </label>
            <div className="w-24">
              <ScrubField
                label="Shadow opacity"
                icon={<Letter>%</Letter>}
                value={opacity}
                max={100}
                unit="%"
                onChange={(v) => set({ color: buildColorWithOpacity(hex, v) })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <ScrubField label="Shadow X" icon={<Letter>X</Letter>} value={style.x} min={-200} max={200} onChange={(v) => set({ x: v })} />
            <ScrubField label="Shadow Y" icon={<Letter>Y</Letter>} value={style.y} min={-200} max={200} onChange={(v) => set({ y: v })} />
            <ScrubField label="Shadow blur" icon={<Letter>B</Letter>} value={style.blur} max={200} onChange={(v) => set({ blur: v })} />
            <ScrubField label="Shadow spread" icon={<Letter>S</Letter>} value={style.spread} min={-100} max={200} onChange={(v) => set({ spread: v })} />
          </div>
        </>
      )}
    </div>
  )
}

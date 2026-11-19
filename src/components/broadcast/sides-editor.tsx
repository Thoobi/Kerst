import { useRef, useState } from "react"
import { SquareDashedIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { EdgeInsets } from "@/types/broadcast"

type Side = keyof EdgeInsets
/** Which edges a field sets: one side, or a pair (left and right, top and bottom). */
type Edges = Side[]

/** A small square with the edges a field sets drawn bright, as in a design tool. */
export function EdgeGlyph({ edges }: { edges: Edges }) {
  const on = (side: Side) => edges.includes(side)
  const line = (side: Side, d: string) => (
    <path
      key={side}
      d={d}
      strokeWidth={on(side) ? 1.75 : 1}
      className={on(side) ? "stroke-foreground" : "stroke-muted-foreground/40"}
    />
  )
  return (
    <svg viewBox="0 0 12 12" className="size-3" fill="none" strokeLinecap="round" aria-hidden>
      {line("top", "M2.5 1.5h7")}
      {line("right", "M10.5 2.5v7")}
      {line("bottom", "M2.5 10.5h7")}
      {line("left", "M1.5 2.5v7")}
    </svg>
  )
}

/**
 * A number with its icon in front. Dragging sideways on the icon scrubs the
 * value (Shift for steps of 10); typing works as usual.
 */
export function ScrubField({
  label,
  edges,
  icon,
  value,
  min = 0,
  max,
  unit = "px",
  onChange,
}: {
  label: string
  /** The edges its icon lights up, for padding and margins. */
  edges?: Edges
  /** Any other icon (or a letter) in front of the number. */
  icon?: React.ReactNode
  value: number
  min?: number
  max: number
  unit?: string
  onChange: (value: number) => void
}) {
  const drag = useRef<{ x: number; start: number } | null>(null)
  const clampTo = (v: number) => Math.max(min, Math.min(max, Math.round(v)))
  return (
    <label
      className="group flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-transparent bg-muted/60 pr-1.5 transition-colors hover:border-border focus-within:border-ring focus-within:bg-background"
      title={label}
    >
      <span
        className="flex h-full cursor-ew-resize touch-none items-center pl-2 select-none"
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, start: value }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const step = e.shiftKey ? 10 : 1
          onChange(clampTo(d.start + Math.round((e.clientX - d.x) / 2) * step))
        }}
        onPointerUp={(e) => {
          drag.current = null
          e.currentTarget.releasePointerCapture(e.pointerId)
        }}
      >
        {icon ?? <EdgeGlyph edges={edges ?? []} />}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        aria-label={label}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(clampTo(v))
        }}
        className="w-full min-w-0 bg-transparent text-xs tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="text-[0.625rem] text-muted-foreground/70">{unit}</span>
    </label>
  )
}

/**
 * Padding (or any value per side) the way design tools show it: left and
 * right together, top and bottom together, and a toggle to set each of the
 * four sides on its own.
 */
export function SidesEditor({
  label,
  value,
  max = 400,
  onChange,
}: {
  label: string
  value: EdgeInsets
  max?: number
  onChange: (value: EdgeInsets) => void
}) {
  const paired = value.left === value.right && value.top === value.bottom
  const [separate, setSeparate] = useState(!paired)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button
          type="button"
          aria-pressed={separate}
          onClick={() => {
            if (separate) {
              // Back to pairs: each pair takes its first side's value.
              onChange({ top: value.top, bottom: value.top, left: value.left, right: value.left })
            }
            setSeparate(!separate)
          }}
          title={separate ? "Set left and right, top and bottom together" : "Set each side on its own"}
          className={cn(
            "flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            separate && "bg-muted text-foreground"
          )}
        >
          <SquareDashedIcon className="size-3.5" />
        </button>
      </div>
      {separate ? (
        <div className="grid grid-cols-2 gap-1.5">
          <ScrubField label={`${label}: top`} edges={["top"]} value={value.top} max={max} onChange={(v) => onChange({ ...value, top: v })} />
          <ScrubField label={`${label}: right`} edges={["right"]} value={value.right} max={max} onChange={(v) => onChange({ ...value, right: v })} />
          <ScrubField label={`${label}: bottom`} edges={["bottom"]} value={value.bottom} max={max} onChange={(v) => onChange({ ...value, bottom: v })} />
          <ScrubField label={`${label}: left`} edges={["left"]} value={value.left} max={max} onChange={(v) => onChange({ ...value, left: v })} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <ScrubField
            label={`${label}: left and right`}
            edges={["left", "right"]}
            value={value.left}
            max={max}
            onChange={(v) => onChange({ ...value, left: v, right: v })}
          />
          <ScrubField
            label={`${label}: top and bottom`}
            edges={["top", "bottom"]}
            value={value.top}
            max={max}
            onChange={(v) => onChange({ ...value, top: v, bottom: v })}
          />
        </div>
      )}
    </div>
  )
}


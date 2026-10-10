import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignVerticalJustifyCenterIcon,
  AlignVerticalJustifyEndIcon,
  AlignVerticalJustifyStartIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

type Horizontal = "left" | "center" | "right" | "justify"
type Vertical = "top" | "middle" | "bottom"

interface Option<T extends string> {
  value: T
  label: string
  icon: typeof AlignLeftIcon
}

const HORIZONTAL: Option<Horizontal>[] = [
  { value: "left", label: "Left", icon: AlignLeftIcon },
  { value: "center", label: "Centre", icon: AlignCenterIcon },
  { value: "right", label: "Right", icon: AlignRightIcon },
  { value: "justify", label: "Justify", icon: AlignJustifyIcon },
]

const VERTICAL: Option<Vertical>[] = [
  { value: "top", label: "Top", icon: AlignVerticalJustifyStartIcon },
  { value: "middle", label: "Middle", icon: AlignVerticalJustifyCenterIcon },
  { value: "bottom", label: "Bottom", icon: AlignVerticalJustifyEndIcon },
]

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md bg-muted p-0.5">
      {options.map(({ value: option, label: optionLabel, icon: Icon }) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          title={optionLabel}
          onClick={() => onChange(option)}
          className={cn(
            "flex h-7 flex-1 items-center justify-center rounded-[5px] text-muted-foreground transition-colors",
            value === option ? "bg-card text-foreground shadow-sm" : "hover:text-foreground"
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  )
}

/** Left / centre / right (and justify, for paragraphs) as one row of buttons. */
export function HorizontalAlignButtons({
  value,
  onChange,
  justify = false,
}: {
  value: Horizontal
  onChange: (value: Horizontal) => void
  /** Offer justify too: only paragraphs (the verse text) use it. */
  justify?: boolean
}) {
  return (
    <Segmented
      label="Horizontal alignment"
      options={justify ? HORIZONTAL : HORIZONTAL.filter((o) => o.value !== "justify")}
      value={value}
      onChange={onChange}
    />
  )
}

/** Top / middle / bottom as one row of buttons. */
export function VerticalAlignButtons({ value, onChange }: { value: Vertical; onChange: (value: Vertical) => void }) {
  return <Segmented label="Vertical alignment" options={VERTICAL} value={value} onChange={onChange} />
}

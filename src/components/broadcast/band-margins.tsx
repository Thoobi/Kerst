import { useState } from "react"
import { Link2Icon, Unlink2Icon } from "lucide-react"
import { ScrubField } from "@/components/broadcast/sides-editor"
import { bandMargins } from "@/lib/lower-third"
import { cn } from "@/lib/utils"
import type { BroadcastTheme, EdgeInsets } from "@/types/broadcast"

/**
 * A Lower Thirds band's margins from the frame's edges, in px: left and
 * right (linked by default, so the band stays centred) and how far it's
 * lifted off the edge it sits on. The band's height is set apart.
 */
export function BandMarginsControl({
  theme,
  onChange,
}: {
  theme: BroadcastTheme
  onChange: (margins: EdgeInsets) => void
}) {
  const m = bandMargins(theme)
  const [linked, setLinked] = useState(m.left === m.right)
  const top = theme.layout.anchor.startsWith("top")
  const { width, height } = theme.resolution
  const lift = top ? "top" : "bottom"
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Margins</span>
        <button
          type="button"
          aria-pressed={linked}
          onClick={() => {
            if (!linked) onChange({ ...m, right: m.left })
            setLinked(!linked)
          }}
          title={linked ? "Left and right together (the band stays centred): click to set each" : "Set left and right together"}
          className={cn(
            "flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            linked && "bg-muted text-foreground"
          )}
        >
          {linked ? <Link2Icon className="size-3.5" /> : <Unlink2Icon className="size-3.5" />}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <ScrubField
          label="Left margin"
          edges={linked ? ["left", "right"] : ["left"]}
          value={m.left}
          max={Math.round(width / 2)}
          onChange={(v) => onChange(linked ? { ...m, left: v, right: v } : { ...m, left: v })}
        />
        {!linked && (
          <ScrubField label="Right margin" edges={["right"]} value={m.right} max={Math.round(width / 2)} onChange={(v) => onChange({ ...m, right: v })} />
        )}
        <ScrubField
          label={top ? "Top margin" : "Bottom margin"}
          edges={[lift]}
          value={m[lift]}
          max={Math.round(height / 2)}
          onChange={(v) => onChange({ ...m, [lift]: v })}
        />
      </div>
      <p className="text-[0.625rem] text-muted-foreground">
        In px from the frame&apos;s edges. 0 all round is a full-width band on the {top ? "top" : "bottom"} edge.
      </p>
    </div>
  )
}

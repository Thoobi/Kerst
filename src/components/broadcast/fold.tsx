import { useState } from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const STORAGE_PREFIX = "litdeck.designer.fold."

function readOpen(id: string, fallback: boolean): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_PREFIX + id)
    return saved === null ? fallback : saved === "1"
  } catch {
    return fallback
  }
}

/**
 * A section of the properties panel that folds away under its title, so
 * the long Text tab can be scanned. Each remembers whether it was open.
 */
export function Fold({
  id,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  /** Remembers this section's open state between uses. */
  id: string
  title: string
  /** A word or two shown while folded, e.g. "On" or "Off". */
  summary?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen))
  const toggle = () => {
    setOpen((was) => {
      try {
        localStorage.setItem(STORAGE_PREFIX + id, was ? "0" : "1")
      } catch {
        // Not remembered; it still folds.
      }
      return !was
    })
  }
  return (
    <section className="flex flex-col border-t pt-1">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex h-8 items-center gap-1.5 rounded text-left text-xs font-semibold hover:text-foreground"
      >
        <ChevronDownIcon className={cn("size-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        <span className="flex-1">{title}</span>
        {!open && summary && <span className="text-[0.6875rem] font-normal text-muted-foreground">{summary}</span>}
      </button>
      {open && <div className="flex flex-col gap-3 pt-1 pb-3">{children}</div>}
    </section>
  )
}

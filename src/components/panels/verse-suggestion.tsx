import { useEffect } from "react"
import { EarIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { presentVerse } from "@/hooks/use-broadcast"
import { isTypingOrHandled } from "@/lib/operator-keys"
import { useBroadcastStore } from "@/stores"
import { cn } from "@/lib/utils"

/** How long a heard verse is offered before it goes away by itself. */
const SUGGESTION_MS = 30_000

/** Put the offered verse on air. */
function showSuggestion() {
  const suggestion = useBroadcastStore.getState().verseSuggestion
  if (!suggestion) return
  useBroadcastStore.getState().clearSuggestion()
  void presentVerse(suggestion.verse)
}

/**
 * A verse the detector heard, offered over the Live view while asking:
 * Show (Enter) puts it on air, Dismiss (Esc) or 30 seconds clears it, and a
 * newer verse replaces it.
 */
export function VerseSuggestion() {
  const suggestion = useBroadcastStore((s) => s.verseSuggestion)

  useEffect(() => {
    if (!suggestion) return
    const timer = setTimeout(() => {
      // Only this one: a newer verse keeps its own time.
      if (useBroadcastStore.getState().verseSuggestion === suggestion) useBroadcastStore.getState().clearSuggestion()
    }, SUGGESTION_MS - (Date.now() - suggestion.heardAt))
    const onKey = (event: KeyboardEvent) => {
      if (isTypingOrHandled(event)) return
      if (event.key === "Enter") {
        // A focused button takes its own Enter.
        if (event.target instanceof HTMLElement && event.target.closest("button, a, [role=button]")) return
        event.preventDefault()
        showSuggestion()
      } else if (event.key === "Escape") {
        event.preventDefault()
        useBroadcastStore.getState().clearSuggestion()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("keydown", onKey)
    }
  }, [suggestion])

  if (!suggestion) return null
  const { verse } = suggestion

  return (
    <div className="absolute inset-x-3 top-3 z-10 flex flex-col gap-1.5 rounded-lg border border-primary/40 bg-card/95 p-2.5 shadow-lg backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <EarIcon className="size-3.5 text-primary" />
        <span>Heard</span>
        <span className="font-semibold text-foreground">
          {verse.book_name} {verse.chapter}:{verse.verse}
        </span>
      </div>
      {verse.text && <p className={cn("line-clamp-2 text-xs text-foreground/80")}>{verse.text}</p>}
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="xs" onClick={() => useBroadcastStore.getState().clearSuggestion()} title="Dismiss (Esc)">
          <XIcon />
          Dismiss
        </Button>
        <Button size="xs" onClick={showSuggestion} title="Put it on air (Enter)">
          Show
          <kbd className="ml-0.5 rounded bg-primary-foreground/20 px-1 text-[0.625rem]">↵</kbd>
        </Button>
      </div>
    </div>
  )
}

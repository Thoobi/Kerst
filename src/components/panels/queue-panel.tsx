import { PanelHeader } from "@/components/ui/panel-header"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  PlayIcon,
  XIcon,
  GripVerticalIcon,
} from "lucide-react"
import { useQueueStore } from "@/stores"
import { presentVerse } from "@/hooks/use-broadcast"
import { bibleActions } from "@/hooks/use-bible"
import type { QueueItem } from "@/types"

function QueueItemRow({
  item,
  index,
  isActive,
  isHighlighted,
}: {
  item: QueueItem
  index: number
  isActive: boolean
  isHighlighted: boolean
}) {
  const handlePresent = () => {
    useQueueStore.getState().setActive(index)
    // Navigate the Bible panel to the presented verse, as detections do
    bibleActions.navigateToVerse(
      item.verse.book_number,
      item.verse.chapter,
      item.verse.verse
    )
    void presentVerse(item.verse)
  }

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    useQueueStore.getState().removeItem(item.id)
  }

  const isAi = item.source !== "manual"

  return (
    <div
      data-queue-idx={index}
      onClick={handlePresent}
      className={cn(
        "group relative flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 transition-colors",
        isHighlighted
          ? "animate-pulse bg-amber-500/15 ring-1 ring-amber-500/40 ring-inset"
          : isActive
            ? "bg-primary/10"
            : "hover:bg-muted/60"
      )}
    >
      {isActive && !isHighlighted && (
        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />
      )}

      <span className="w-4 shrink-0 text-right font-mono text-[0.6875rem] text-muted-foreground tabular-nums group-hover:hidden">
        {index + 1}
      </span>
      <GripVerticalIcon className="hidden size-4 shrink-0 text-muted-foreground group-hover:block" />

      <span
        className={cn(
          "flex-1 truncate text-sm",
          isActive ? "font-semibold text-foreground" : "font-medium text-foreground/90"
        )}
      >
        {item.reference}
      </span>

      <span
        title={isAi ? "Detected" : "Added manually"}
        className={cn(
          "shrink-0 text-[0.625rem] font-medium uppercase tracking-wide group-hover:hidden",
          isAi ? "text-ai-direct" : "text-muted-foreground"
        )}
      >
        {isAi ? "AI" : "Manual"}
      </span>

      <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
        <Button
          variant="ghost"
          size="icon-xs"
          title="Present"
          onClick={(e) => {
            e.stopPropagation()
            handlePresent()
          }}
        >
          <PlayIcon />
        </Button>
        <Button variant="ghost" size="icon-xs" title="Remove" onClick={handleRemove}>
          <XIcon />
        </Button>
      </div>
    </div>
  )
}

export function QueuePanel() {
  const items = useQueueStore((s) => s.items)
  const activeIndex = useQueueStore((s) => s.activeIndex)
  const highlightedId = useQueueStore((s) => s.highlightedId)

  return (
    <div
      data-slot="queue-panel"
      className="flex min-h-0 basis-2/5 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs"
    >
      <PanelHeader title="Queue">
        <span className="rounded-full bg-muted px-1.5 font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
          {items.length}
        </span>
        {items.length > 0 && (
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => useQueueStore.getState().clearQueue()}
          >
            Clear
          </Button>
        )}
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-0.5 px-1.5 pb-1.5">
          {items.length === 0 && (
            <p className="px-4 py-8 text-center text-xs leading-relaxed text-muted-foreground">
              Detected and queued verses line up here.
            </p>
          )}
          {items.map((item, idx) => (
            <QueueItemRow
              key={item.id}
              item={item}
              index={idx}
              isActive={idx === activeIndex}
              isHighlighted={item.id === highlightedId}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

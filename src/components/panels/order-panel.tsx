import { useState } from "react"
import { cn } from "@/lib/utils"
import { QueueActions, QueueList } from "@/components/panels/queue-panel"
import { ServicePanel } from "@/components/panels/service-panel"
import { useQueueStore } from "@/stores"

type OrderTab = "service" | "queue"

/**
 * What comes next: the planned service order, and the queue of verses
 * detected or queued during the message. Both stay mounted so switching
 * never loses a scroll position.
 */
export function OrderPanel() {
  const [tab, setTab] = useState<OrderTab>("service")
  const queued = useQueueStore((s) => s.items.length)

  const tabButton = (id: OrderTab, label: string) => (
    <button
      key={id}
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
        tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      {id === "queue" && queued > 0 && tab !== "queue" && (
        <span className="rounded-full bg-primary/15 px-1.5 font-mono text-[0.625rem] text-primary tabular-nums">
          {queued}
        </span>
      )}
    </button>
  )

  return (
    <div
      data-slot="order-panel"
      className="flex min-h-0 basis-2/5 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs"
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 px-2">
        <div role="tablist" className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {tabButton("service", "Service")}
          {tabButton("queue", "Queue")}
        </div>
        {tab === "queue" && (
          <div className="flex items-center gap-1.5">
            <QueueActions />
          </div>
        )}
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "service" && "hidden")}>
        <ServicePanel />
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "queue" && "hidden")}>
        <QueueList />
      </div>
    </div>
  )
}

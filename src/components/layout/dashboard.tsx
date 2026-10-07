import { TransportBar } from "@/components/controls/transport-bar"
import { TranscriptPanel } from "@/components/panels/transcript-panel"
import { PreviewPanel } from "@/components/panels/preview-panel"
import { LiveOutputPanel } from "@/components/panels/live-output-panel"
import { QueuePanel } from "@/components/panels/queue-panel"
import { SearchPanel } from "@/components/panels/search-panel"
import { DetectionsPanel } from "@/components/panels/detections-panel"
import { EmbeddingWarningBanner } from "@/components/ui/embedding-warning-banner"

/**
 * Three-column operator layout:
 *
 *   transcript │ preview · live      │ queue
 *              │ search              │ detections
 *
 * The monitor row sizes to the 16:9 canvases, so search takes whatever
 * height is left and never squeezes the program output.
 */
export function Dashboard() {
  return (
    <div className="fixed inset-0 grid grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-background">
      <TransportBar />

      {/* Collapses to nothing when there is nothing to warn about */}
      <EmbeddingWarningBanner />

      <div className="grid min-h-0 grid-cols-[clamp(260px,22vw,340px)_minmax(0,1fr)_clamp(280px,24vw,360px)] gap-2 p-2">
        <TranscriptPanel />

        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          <div className="grid shrink-0 grid-cols-2 gap-2">
            <PreviewPanel />
            <LiveOutputPanel />
          </div>
          <SearchPanel />
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <QueuePanel />
          <DetectionsPanel />
        </div>
      </div>
    </div>
  )
}

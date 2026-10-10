import { TransportBar } from "@/components/controls/transport-bar"
import { TranscriptPanel } from "@/components/panels/transcript-panel"
import { PreviewPanel } from "@/components/panels/preview-panel"
import { LiveOutputPanel } from "@/components/panels/live-output-panel"
import { OrderPanel } from "@/components/panels/order-panel"
import { ContentPanel } from "@/components/panels/content-panel"
import { DetectionsPanel } from "@/components/panels/detections-panel"
import { LyricsStylePanel } from "@/components/panels/lyrics-style-panel"
import { useContentTabStore } from "@/stores/content-tab-store"
import { EmbeddingWarningBanner } from "@/components/ui/embedding-warning-banner"

/**
 * Three-column operator layout:
 *
 *   transcript │ preview · live      │ queue
 *              │ content (Bible ·    │ detections
 *              │   Slides tabs)      │
 *
 * The monitor row sizes to the 16:9 canvases, so the content tabs take
 * whatever height is left and never squeeze the program output.
 */
export function Dashboard() {
  const contentTab = useContentTabStore((s) => s.tab)
  const styling = contentTab === "songs" || contentTab === "texts"
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
          <ContentPanel />
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <OrderPanel />
          {/* Songs and texts get quick text styling here; detections stay
              mounted underneath so live detection keeps running. */}
          {styling && <LyricsStylePanel />}
          <div className={styling ? "hidden" : "contents"}>
            <DetectionsPanel />
          </div>
        </div>
      </div>
    </div>
  )
}

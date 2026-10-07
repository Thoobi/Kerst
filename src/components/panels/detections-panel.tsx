import { useEffect, useMemo } from "react"
import { PanelHeader } from "@/components/ui/panel-header"
import { ConfidenceDot } from "@/components/ui/confidence-dot"
import { Button } from "@/components/ui/button"
import { PlayIcon, PlusIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDetection, detectionActions } from "@/hooks/use-detection"
import { bibleActions } from "@/hooks/use-bible"
import { useQueueStore, useBibleStore } from "@/stores"
import { presentVerse } from "@/hooks/use-broadcast"
import { mark } from "@/lib/latency-marks"
import type { DetectionResult } from "@/types"

const SOURCE_COLORS: Record<string, { text: string; label: string }> = {
  direct: { text: "text-ai-direct", label: "Direct" },
  semantic: { text: "text-ai-semantic", label: "Semantic" },
}

function DetectionCard({ detection }: { detection: DetectionResult }) {
  const handlePresent = () => {
    // Navigate book search panel to this verse
    if (detection.book_number > 0) {
      bibleActions.navigateToVerse(
        detection.book_number,
        detection.chapter,
        detection.verse
      )
    }
    // Refetch full verse text, select for preview, and set live
    void presentVerse({
      id: 0,
      translation_id: useBibleStore.getState().activeTranslationId,
      book_number: detection.book_number,
      book_name: detection.book_name,
      book_abbreviation: "",
      chapter: detection.chapter,
      verse: detection.verse,
      text: detection.verse_text,
    })
  }

  const handleQueue = () => {
    useQueueStore.getState().addItem({
      id: crypto.randomUUID(),
      verse: {
        id: 0,
        translation_id: useBibleStore.getState().activeTranslationId,
        book_number: detection.book_number,
        book_name: detection.book_name,
        book_abbreviation: "",
        chapter: detection.chapter,
        verse: detection.verse,
        text: detection.verse_text,
      },
      reference: detection.verse_ref,
      confidence: detection.confidence,
      source: detection.source === "direct" ? "ai-direct" : "ai-semantic",
      added_at: Date.now(),
    })
  }

  return (
    <div className="group rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/60">
      <div className="flex items-center gap-2">
        <ConfidenceDot confidence={detection.confidence} size="sm" />
        <span className="flex-1 truncate text-sm font-semibold text-foreground">
          {detection.verse_ref}
        </span>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button variant="ghost" size="icon-xs" title="Add to queue" onClick={handleQueue}>
            <PlusIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Dismiss ${detection.verse_ref}`}
            title="Dismiss"
            onClick={() =>
              detectionActions.dismissDetection(
                detection.verse_ref,
                detection.source
              )
            }
          >
            <XIcon />
          </Button>
        </div>
        <Button size="xs" variant="secondary" className="shrink-0 group-hover:bg-primary group-hover:text-primary-foreground" onClick={handlePresent}>
          <PlayIcon />
          Present
        </Button>
      </div>

      {detection.verse_text && (
        <p className="mt-1 line-clamp-2 pl-3.5 font-serif text-[0.8125rem] leading-relaxed text-muted-foreground">
          {detection.verse_text}
        </p>
      )}
    </div>
  )
}

function DetectionColumn({
  source,
  detections,
}: {
  source: "direct" | "semantic"
  detections: DetectionResult[]
}) {
  const style = SOURCE_COLORS[source]
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 px-3.5 pt-1 pb-1">
        <span className={cn("text-[0.6875rem] font-medium", style.text)}>
          {style.label}
        </span>
        <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
          {detections.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
        {detections.length === 0 ? (
          <p className="px-2.5 py-3 text-xs text-muted-foreground">
            No {style.label.toLowerCase()} detections yet
          </p>
        ) : (
          detections.map((detection, i) => (
            <DetectionCard key={`${detection.verse_ref}-${i}`} detection={detection} />
          ))
        )}
      </div>
    </div>
  )
}

export function DetectionsPanel() {
  const { detections } = useDetection()

  // Latency debugging: when the list changes, mark the React commit and the
  // next animation frame (≈ actual pixels on screen).
  useEffect(() => {
    if (detections.length === 0) return
    mark(
      `detections-commit n=${detections.length} first=${detections[0]?.verse_ref ?? ""} src=${detections[0]?.source ?? "?"}`
    )
    const raf = requestAnimationFrame(() => mark("detections-paint"))
    return () => cancelAnimationFrame(raf)
  }, [detections])

  // Issue #104: direct (spoken references) and semantic (quoted text)
  // detections in separate sections, so a burst of direct hits doesn't push
  // the semantic ones out of view.
  const directDetections = useMemo(
    () => detections.filter((d) => d.source === "direct"),
    [detections]
  )
  const semanticDetections = useMemo(
    () => detections.filter((d) => d.source !== "direct"),
    [detections]
  )

  return (
    <div
      data-slot="detections-panel"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs"
    >
      <PanelHeader title="Detections">
        {detections.length > 0 && (
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => detectionActions.clearDetections()}
          >
            Clear
          </Button>
        )}
      </PanelHeader>

      {detections.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs leading-relaxed text-muted-foreground">
          Verses heard in the sermon show up here.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col divide-y divide-border">
          <DetectionColumn source="direct" detections={directDetections} />
          <DetectionColumn source="semantic" detections={semanticDetections} />
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { PanelHeader } from "@/components/ui/panel-header"
import { LevelMeter } from "@/components/ui/level-meter"
import { Button } from "@/components/ui/button"
import { ApiKeyPrompt } from "@/components/ui/api-key-prompt"
import { cn } from "@/lib/utils"
import { MicIcon, MicOffIcon } from "lucide-react"
import {
  useAudioStore,
  useDetectionStore,
  useQueueStore,
  useBibleStore,
  useBroadcastStore,
  useTranscriptStore,
} from "@/stores"
import { useTauriEvent } from "@/hooks/use-tauri-event"
import { useTranscription } from "@/hooks/use-transcription"
import { bibleActions } from "@/hooks/use-bible"
import { presentVerse } from "@/hooks/use-broadcast"
import { mark, observeLongTasks } from "@/lib/latency-marks"
import { pickAutoPresentTarget } from "@/lib/auto-present-target"
import type { DetectionResult, ReadingAdvance } from "@/types"

/**
 * Leaf component that subscribes to the audio level only. Isolated so the
 * high-frequency `audio_level` tick (many times per second during recording)
 * does NOT re-render the transcript list, connection dot, or button subtree.
 */
function AudioLevelMeter() {
  const rms = useAudioStore((s) => s.level.rms)
  return <LevelMeter level={rms} bars={6} />
}

/**
 * Leaf component that subscribes to `currentPartial`. Partials update per audio tick.
 */
function LivePartialLine({ scrollRef }: { scrollRef: RefObject<HTMLDivElement | null> }) {
  const currentPartial = useTranscriptStore((s) => s.currentPartial)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [currentPartial, scrollRef])

  if (!currentPartial) return null

  return (
    <p className="border-l-2 border-primary pl-3 text-[0.9375rem] leading-7 text-foreground">
      {currentPartial}
      <span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-primary align-middle" />
    </p>
  )
}

export function TranscriptPanel() {
  const [showKeyPrompt, setShowKeyPrompt] = useState(false)
  const onMissingApiKey = useCallback(() => setShowKeyPrompt(true), [])
  const {
    segments,
    isTranscribing,
    connectionStatus,
    startTranscription,
    stopTranscription,
  } = useTranscription({ onMissingApiKey })
  const hasPartial = useTranscriptStore((s) => s.currentPartial.length > 0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Latency debugging: surface main-thread stalls in the unified [LAT] log.
  useEffect(() => observeLongTasks(), [])

  useTauriEvent<{ rms: number; peak: number }>("audio_level", (payload) => {
    useAudioStore.getState().setLevel(payload)
  })

  // Listen for voice translation commands: "read in NIV", "switch to ESV"
  useTauriEvent<{ abbreviation: string; translation_id: number }>(
    "translation_command",
    (data) => {
      useBibleStore.getState().setActiveTranslation(data.translation_id)
      console.log(`[VOICE] Translation switched to ${data.abbreviation}`)
    }
  )

  // Listen for detection results from the backend (batch replaces previous detections)
  useTauriEvent<DetectionResult[]>("verse_detections", (detections) => {
    mark(
      `verse_detections received src=${detections[0]?.source ?? "?"} n=${detections.length} first=${detections[0]?.verse_ref ?? ""}`
    )
    useDetectionStore.getState().addDetections(detections)
    mark(`addDetections done src=${detections[0]?.source ?? "?"}`)

    // Auto-navigate book search + select verse for preview/live. Picks the
    // most confident direct hit and skips operator-dismissed references —
    // see pickAutoPresentTarget for why.
    const directHit = pickAutoPresentTarget(detections, (verseRef) =>
      useDetectionStore.getState().isDismissed(verseRef, "direct")
    )
    if (directHit && directHit.book_number > 0) {
      const detectedVerse = {
        id: 0,
        translation_id: useBibleStore.getState().activeTranslationId,
        book_number: directHit.book_number,
        book_name: directHit.book_name,
        book_abbreviation: "",
        chapter: directHit.chapter,
        verse: directHit.verse,
        text: directHit.verse_text,
      }
      // Detections always update the preview. They only reach the live
      // display when auto-live is on — otherwise the operator presents
      // manually (issue #105).
      if (useBroadcastStore.getState().autoLive) {
        void presentVerse(detectedVerse)
      } else {
        bibleActions.selectVerse(detectedVerse)
      }
      // Navigate book search panel to this verse
      useBibleStore
        .getState()
        .setPendingNavigation({
          bookNumber: directHit.book_number,
          chapter: directHit.chapter,
          verse: directHit.verse,
        })
    }

    // Auto-queue high-confidence detections
    for (const d of detections) {
      // Check if this detection refines an existing chapter-only queue item
      if (
        !d.is_chapter_only &&
        d.source === "direct" &&
        useQueueStore
          .getState()
          .updateEarlyRef(
            d.book_number,
            d.chapter,
            d.verse,
            d.verse_ref,
            d.verse_text,
          )
      ) {
        continue
      }

      if (d.auto_queued) {
        const queue = useQueueStore.getState()
        // For chapter-only detections, match by book+chapter (any verse) to
        // avoid re-adding "Mark 1:1" when "Mark 1:2" already exists from a
        // previous chapter-only → refinement cycle.
        const dupIdx = d.is_chapter_only
          ? queue.items.findIndex(
              (i) =>
                i.verse.book_number === d.book_number &&
                i.verse.chapter === d.chapter,
            )
          : queue.findDuplicate(d.book_number, d.chapter, d.verse)
        if (dupIdx !== -1) {
          const existing = queue.items[dupIdx]
          // Backfill text if the existing item was queued without it
          // (e.g. an earlier detection emitted with empty verse text).
          if (!existing.verse.text && d.verse_text) {
            queue.backfillText(existing.id, d.verse_text)
          }
          queue.flashItem(existing.id)
          if (!d.is_chapter_only) queue.setActive(dupIdx)
          continue
        }
        queue.addItem({
          id: crypto.randomUUID(),
          verse: {
            id: 0,
            translation_id: useBibleStore.getState().activeTranslationId,
            book_number: d.book_number,
            book_name: d.book_name,
            book_abbreviation: "",
            chapter: d.chapter,
            verse: d.verse,
            text: d.verse_text,
          },
          reference: d.verse_ref,
          confidence: d.confidence,
          source: d.source === "direct" ? "ai-direct" : "ai-semantic",
          added_at: Date.now(),
          is_chapter_only: d.is_chapter_only,
        })
      }
    }
  })

  // Reading mode navigation: auto-navigate book panel when reading mode
  // advances to a new verse (chapter commands, verse commands, text matching).
  // Does NOT add to queue — only direct/semantic feed the queue.
  useTauriEvent<ReadingAdvance>("reading_mode_verse", (advance) => {
    mark(`reading_mode_verse received ${advance.reference ?? ""}`)
    if (advance.book_number > 0) {
      const advanceVerse = {
        id: 0,
        translation_id: useBibleStore.getState().activeTranslationId,
        book_number: advance.book_number,
        book_name: advance.book_name,
        book_abbreviation: "",
        chapter: advance.chapter,
        verse: advance.verse,
        text: advance.verse_text,
      }
      // Same auto-live gate as detections: preview always follows, the live
      // display only when the operator allows it (issue #105).
      if (useBroadcastStore.getState().autoLive) {
        void presentVerse(advanceVerse)
      } else {
        bibleActions.selectVerse(advanceVerse)
      }
      useBibleStore.getState().setPendingNavigation({
        bookNumber: advance.book_number,
        chapter: advance.chapter,
        verse: advance.verse,
      })
    }
  })

  // Auto-scroll on segment additions. Partial-driven scrolling lives in
  // LivePartialLine so the panel doesn't re-render per audio tick.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [segments])

  return (
    <div
      data-slot="transcript-panel"
      className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs"
    >
      <PanelHeader title="Transcript">
        {isTranscribing && (
          <span
            className={cn(
              "size-1.5 rounded-full",
              connectionStatus === "connected"
                ? "bg-emerald-500"
                : connectionStatus === "connecting"
                  ? "animate-pulse bg-amber-500"
                  : connectionStatus === "error"
                    ? "bg-red-500"
                    : "bg-muted-foreground/40"
            )}
            title={connectionStatus}
          />
        )}
        <AudioLevelMeter />
      </PanelHeader>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        {/* Faded top edge so older lines dissolve rather than clip */}
        <div className="pointer-events-none sticky top-0 z-10 -mb-8 h-8 bg-linear-to-b from-card to-transparent" />

        <div className="flex flex-col gap-3 px-4 pt-2 pb-4">
          {segments.length === 0 && !hasPartial && !isTranscribing && (
            <div className="flex flex-col items-center gap-2 px-4 pt-16 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                <MicIcon className="size-4 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">
                Nothing heard yet
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Start transcribing and the sermon will appear here as it's spoken.
              </p>
            </div>
          )}

          {/* Final segments — recent ones brighter, older ones fade */}
          {segments.map((seg, idx) => {
            const distFromEnd = segments.length - 1 - idx
            const opacity =
              distFromEnd === 0
                ? "text-foreground/85"
                : distFromEnd === 1
                  ? "text-foreground/65"
                  : distFromEnd <= 3
                    ? "text-foreground/45"
                    : "text-foreground/30"
            return (
              <p
                key={seg.id}
                className={`text-[0.9375rem] leading-7 transition-colors duration-300 ${opacity}`}
              >
                {seg.text}
              </p>
            )
          })}

          {/* Partial (in-progress) text rendered by leaf subscriber */}
          <LivePartialLine scrollRef={scrollRef} />
        </div>
      </div>

      <div className="p-2">
        {isTranscribing ? (
          <Button
            variant="destructive"
            className="w-full"
            onClick={stopTranscription}
          >
            <MicOffIcon className="size-4" />
            Stop transcribing
          </Button>
        ) : (
          <Button className="w-full" onClick={startTranscription}>
            <MicIcon className="size-4" />
            Start transcribing
          </Button>
        )}
      </div>

      <ApiKeyPrompt
        open={showKeyPrompt}
        onOpenChange={setShowKeyPrompt}
        service="Deepgram"
        description="Live transcription needs a Deepgram API key. Add it in settings so the app can start listening."
      />
    </div>
  )
}

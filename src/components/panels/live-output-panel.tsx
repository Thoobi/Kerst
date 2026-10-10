import { useEffect } from "react"
import { toast } from "sonner"
import { PanelHeader } from "@/components/ui/panel-header"
import { CanvasVerse } from "@/components/ui/canvas-verse"
import { SyncedVideo } from "@/components/ui/synced-video"
import { Switch } from "@/components/ui/switch"
import { LiveVideoTransport } from "@/components/controls/video-transport"
import { useVideosStore } from "@/stores/videos-store"
import { cn } from "@/lib/utils"
import { useBroadcastStore, useBibleStore } from "@/stores"
import { presentVerse, toVerseRenderData } from "@/hooks/use-broadcast"
import { bibleActions } from "@/hooks/use-bible"

export function LiveOutputPanel() {
  const isLive = useBroadcastStore((s) => s.isLive)
  const autoLive = useBroadcastStore((s) => s.autoLive)
  const liveVerse = useBroadcastStore((s) => s.liveVerse)
  const themes = useBroadcastStore((s) => s.themes)
  const activeThemeId = useBroadcastStore((s) => s.activeThemeId)
  const activeTranslationId = useBibleStore((s) => s.activeTranslationId)
  const volume = useVideosStore((s) => s.volume)
  const muted = useVideosStore((s) => s.muted)

  const activeTheme = themes.find((t) => t.id === activeThemeId) ?? themes[0]

  // The live output renders only what was explicitly presented — it no longer
  // follows the preview selection, so detections can't override the operator.
  const verseData = isLive ? liveVerse : null

  // Refetch the live verse when the translation changes so the live output
  // text follows the new translation. Updates the live output only — the
  // preview keeps whatever the operator is browsing.
  useEffect(() => {
    const source = useBroadcastStore.getState().liveSourceVerse
    if (!source) return
    bibleActions
      .fetchVerse(source.book_number, source.chapter, source.verse)
      .then((v) => {
        if (!v) return
        const bible = useBibleStore.getState()
        const abbreviation =
          bible.translations.find((t) => t.id === bible.activeTranslationId)
            ?.abbreviation ?? "KJV"
        useBroadcastStore
          .getState()
          .setLiveVerse(toVerseRenderData(v, abbreviation), v)
      })
      .catch(() => {})
  }, [activeTranslationId])

  const handleGoLive = (checked: boolean) => {
    useBroadcastStore.getState().setLive(checked)
    // Going live with nothing presented yet: present the current preview
    // verse so the output isn't blank.
    if (checked && !useBroadcastStore.getState().liveVerse) {
      const selected = useBibleStore.getState().selectedVerse
      if (selected) void presentVerse(selected)
    }
  }

  return (
    <div
      data-slot="live-output-panel"
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-colors",
        isLive ? "border-live-pulse/50" : "border-border"
      )}
    >
      <PanelHeader title="Live">
        <label
          className="flex cursor-pointer items-center gap-1.5"
          title="When on, detected verses are presented to the live display automatically. Turn off for manual control."
        >
          <span
            className={cn(
              "text-xs transition-colors",
              autoLive ? "text-foreground" : "text-muted-foreground"
            )}
          >
            Auto
          </span>
          <Switch
            checked={autoLive}
            onCheckedChange={(checked) =>
              useBroadcastStore.getState().setAutoLive(checked)
            }
          />
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={isLive}
          onClick={() => handleGoLive(!isLive)}
          className={cn(
            "flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            isLive
              ? "bg-live-pulse text-white hover:bg-live-pulse/85"
              : "border border-border text-foreground hover:bg-muted"
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              isLive ? "animate-pulse bg-white" : "bg-live-pulse"
            )}
          />
          {isLive ? "On air" : "Go live"}
        </button>
      </PanelHeader>

      <div className="px-2 pb-2">
        <div
          className={cn(
            "relative rounded-lg bg-surface-sunken p-1.5 ring-1 ring-inset transition-shadow",
            isLive ? "ring-live-pulse/30" : "ring-border"
          )}
        >
          <CanvasVerse theme={activeTheme} verse={verseData} />
          {verseData?.video && (
            // The one copy of a live video that makes sound: outputs play
            // muted, so the audio never doubles up.
            <SyncedVideo
              playback={verseData.video}
              muted={muted}
              volume={volume}
              onPlayBlocked={(error) =>
                toast.warning("The video's sound couldn't start", { description: String(error) })
              }
              className="absolute inset-1.5 size-[calc(100%-0.75rem)] rounded-md bg-black object-contain"
            />
          )}
          {!isLive && (
            <div className="absolute inset-1.5 flex items-center justify-center rounded-md bg-black/55">
              <span className="rounded-full bg-black/50 px-2.5 py-1 text-[0.6875rem] font-medium tracking-wide text-white/70">
                Off air
              </span>
            </div>
          )}
        </div>
      </div>
      {liveVerse?.video && <LiveVideoTransport playback={liveVerse.video} title={liveVerse.reference} />}
    </div>
  )
}

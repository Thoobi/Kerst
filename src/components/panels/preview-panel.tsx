import { useEffect, useState } from "react"
import { PanelHeader } from "@/components/ui/panel-header"
import { CanvasVerse } from "@/components/ui/canvas-verse"
import { SyncedVideo } from "@/components/ui/synced-video"
import { VideoTransport } from "@/components/controls/video-transport"
import { useLocalPlayback } from "@/hooks/use-local-playback"
import { useBibleStore, useBroadcastStore, usePreviewStore } from "@/stores"
import { bibleActions } from "@/hooks/use-bible"
import { toVerseRenderData } from "@/hooks/use-broadcast"
import type { BroadcastTheme, VideoPlayback } from "@/types"

export function PreviewPanel() {
  const selectedVerse = useBibleStore((s) => s.selectedVerse)
  const previewContent = usePreviewStore((s) => s.content)
  const translations = useBibleStore((s) => s.translations)
  const activeTranslationId = useBibleStore((s) => s.activeTranslationId)

  // When translation changes, re-fetch the selected verse in the new translation
  useEffect(() => {
    const verse = useBibleStore.getState().selectedVerse
    if (verse && verse.book_number > 0 && verse.chapter > 0 && verse.verse > 0) {
      bibleActions
        .fetchVerse(verse.book_number, verse.chapter, verse.verse)
        .then((v) => {
          if (v) bibleActions.selectVerse(v)
        })
        .catch(() => {})
    }
  }, [activeTranslationId])
  const themes = useBroadcastStore((s) => s.themes)
  const activeThemeId = useBroadcastStore((s) => s.activeThemeId)

  const activeTheme = themes.find((t) => t.id === activeThemeId) ?? themes[0]
  const translation = translations.find((t) => t.id === activeTranslationId)?.abbreviation ?? "KJV"

  // A clicked slide or lyric takes the preview until a Bible verse is picked again.
  const verseData =
    previewContent ?? (selectedVerse ? toVerseRenderData(selectedVerse, translation) : null)

  return (
    <div
      data-slot="preview-panel"
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs"
    >
      <PanelHeader title="Preview">
        {previewContent ? (
          <span className="truncate text-[0.6875rem] text-muted-foreground">
            {previewContent.reference || previewContent.credit}
          </span>
        ) : (
          <span className="font-mono text-[0.6875rem] text-muted-foreground">
            {translation}
          </span>
        )}
      </PanelHeader>
      {previewContent?.video ? (
        // Keyed by video so a newly clicked one starts from the top.
        <PreviewVideo
          key={previewContent.video.url}
          source={previewContent.video}
          title={previewContent.reference}
          theme={activeTheme}
        />
      ) : (
        <div className="px-2 pb-2">
          <div className="rounded-lg bg-surface-sunken p-1.5 ring-1 ring-border ring-inset">
            <CanvasVerse theme={activeTheme} verse={verseData} />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * A private player for the previewed video, with the same controls as the
 * live one but its own clock: watching or scrubbing here never touches the
 * outputs. Muted to start, as it plays through the same speakers as the
 * live sound.
 */
function PreviewVideo({
  source,
  title,
  theme,
}: {
  source: VideoPlayback
  title: string
  theme: BroadcastTheme
}) {
  const { playback, togglePlay, seek, restart, setLoop } = useLocalPlayback(source)
  const [muted, setMuted] = useState(true)
  const [volume, setVolume] = useState(1)

  return (
    <>
      <div className="px-2 pb-2">
        <div className="rounded-lg bg-surface-sunken p-1.5 ring-1 ring-border ring-inset">
          <SyncedVideo
            playback={playback}
            muted={muted}
            volume={volume}
            className="w-full rounded-md bg-black object-contain"
            style={{ aspectRatio: `${theme.resolution.width} / ${theme.resolution.height}` }}
          />
        </div>
      </div>
      <VideoTransport
        playback={playback}
        title={title}
        muted={muted}
        volume={volume}
        onTogglePlay={togglePlay}
        onRestart={restart}
        onSeek={seek}
        onLoopChange={setLoop}
        onMutedChange={setMuted}
        onVolumeChange={(value) => {
          setVolume(value)
          setMuted(false)
        }}
        onStop={() => usePreviewStore.getState().clear()}
        stopTitle="Clear the preview"
      />
    </>
  )
}

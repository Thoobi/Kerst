import { useEffect } from "react"
import { PanelHeader } from "@/components/ui/panel-header"
import { CanvasVerse } from "@/components/ui/canvas-verse"
import { useBibleStore, useBroadcastStore, usePreviewStore } from "@/stores"
import { bibleActions } from "@/hooks/use-bible"
import { toVerseRenderData } from "@/hooks/use-broadcast"

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
            {previewContent.reference}
          </span>
        ) : (
          <span className="font-mono text-[0.6875rem] text-muted-foreground">
            {translation}
          </span>
        )}
      </PanelHeader>
      <div className="px-2 pb-2">
        <div className="rounded-lg bg-surface-sunken p-1.5 ring-1 ring-border ring-inset">
          <CanvasVerse theme={activeTheme} verse={verseData} />
        </div>
      </div>
    </div>
  )
}

import { useState } from "react"
import { PencilIcon } from "lucide-react"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TextProperties } from "@/components/broadcast/text-properties"
import { BackgroundProperties } from "@/components/broadcast/background-properties"
import { LayoutProperties } from "@/components/broadcast/layout-properties"
import { LogoProperties } from "@/components/broadcast/logo-properties"
import { TransitionProperties } from "@/components/broadcast/transition-properties"
import { CameraPanelProperties } from "@/components/broadcast/camera-panel-properties"

export function PropertiesPanel() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const selectedElement = useBroadcastStore((s) => s.selectedElement)
  const [tab, setTab] = useState("text")
  // Clicking a box on the canvas opens its tab (adjusted while rendering,
  // the moment the selection changes).
  const [shownFor, setShownFor] = useState(selectedElement)
  if (shownFor !== selectedElement) {
    setShownFor(selectedElement)
    if (selectedElement === "camera") setTab("camera")
    else if (selectedElement === "logo") setTab("logo")
    else if (selectedElement === "verse" || selectedElement === "reference") setTab("text")
  }

  if (!draftTheme) {
    return (
      <div className="flex h-full flex-col items-center justify-center border-l border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Select a theme to edit</p>
      </div>
    )
  }

  const subtitle =
    selectedElement === "verse"
      ? "Editing verse properties"
      : selectedElement === "reference"
        ? "Editing reference properties"
        : selectedElement === "camera"
          ? "Editing the camera panel"
          : selectedElement === "logo"
            ? "Editing the logo"
        : "Select an element or use tabs below"

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-card">
      {/* Header */}
      <div className="flex h-14 flex-col gap-0.5 border-b border-border px-4 py-2">
        <ThemeName />
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 px-4 pt-3">
          <TabsList variant="default" className="grid w-full grid-cols-4">
            <TabsTrigger value="text" className="min-w-0 px-1 text-xs">Text</TabsTrigger>
            <TabsTrigger value="layout" className="min-w-0 px-1 text-xs">Layout</TabsTrigger>
            <TabsTrigger value="camera" className="min-w-0 px-1 text-xs">Camera</TabsTrigger>
            <TabsTrigger value="logo" className="min-w-0 px-1 text-xs">Logo</TabsTrigger>
          </TabsList>
        </div>

        {/* Radix wraps the content in a display:table div that grows to its
            widest child and spills past the panel; a block keeps it to the panel's width. */}
        <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
          <TabsContent value="text" className="mt-0 p-4">
            <TextProperties />
          </TabsContent>
          <TabsContent value="layout" className="mt-0 p-4">
            <div className="flex flex-col gap-4">
              <BackgroundProperties />
              <div className="border-t pt-4">
                <LayoutProperties />
              </div>
              <TransitionProperties />
            </div>
          </TabsContent>
          <TabsContent value="camera" className="mt-0 p-4">
            <CameraPanelProperties />
          </TabsContent>
          <TabsContent value="logo" className="mt-0 p-4">
            <LogoProperties />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  )
}

/**
 * The theme's name, renamed in place: click it, type, Enter. A built-in
 * keeps its name; saving it asks what to call the copy.
 */
function ThemeName() {
  const theme = useBroadcastStore((s) => s.draftTheme)
  const [editing, setEditing] = useState<string | null>(null)
  if (!theme) return null
  if (theme.builtin) {
    return (
      <h3 className="truncate text-sm font-semibold" title="Built-in: Save makes a copy you can name">
        {theme.name}
      </h3>
    )
  }
  const commit = () => {
    const name = editing?.trim()
    if (name && name !== theme.name) useBroadcastStore.getState().renameTheme(theme.id, name)
    setEditing(null)
  }
  if (editing !== null) {
    return (
      <input
        autoFocus
        value={editing}
        maxLength={60}
        aria-label="Theme name"
        onChange={(e) => setEditing(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") setEditing(null)
        }}
        className="-mx-1 h-5 rounded bg-muted px-1 text-sm font-semibold outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(theme.name)}
      title="Rename this theme"
      className="group -mx-1 flex min-w-0 items-center gap-1.5 rounded px-1 text-left text-sm font-semibold hover:bg-muted"
    >
      <span className="truncate">{theme.name}</span>
      <PencilIcon className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
    </button>
  )
}

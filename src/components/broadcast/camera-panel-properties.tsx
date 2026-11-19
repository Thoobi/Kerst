import { useBroadcastStore } from "@/stores/broadcast-store"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CameraPicker } from "@/components/panels/camera-picker"
import { RadiusEditor, ShadowEditor } from "@/components/broadcast/figma-fields"
import { radiusOf } from "@/lib/corners"
import { writeRadius } from "@/lib/radius-update"
import { SidesEditor } from "@/components/broadcast/sides-editor"
import { isUniform, surfaceInsets } from "@/lib/edge-insets"
import { ArrowLeftRightIcon, RectangleHorizontalIcon } from "lucide-react"
import type { BroadcastTheme, CameraPanel, ElementBox, SurfaceFill } from "@/types/broadcast"

/** A words card to start from: dark, see-through, rounded, just off the words. */
const NEW_WORDS_CARD: SurfaceFill = {
  enabled: true,
  color: "#000000",
  opacity: 0.35,
  borderRadius: 24,
  padding: 8,
  image: null,
  border: null,
  shadow: true,
}

/** A new panel: 16:9 on the left half, level with the frame's middle. */
const DEFAULT_CAMERA_PANEL: CameraPanel = {
  enabled: true,
  camera: null,
  box: { x: 4, y: 25, width: 50, height: 50 },
  borderRadius: 24,
  border: null,
  shadow: true,
}

const round2 = (v: number) => Math.round(v * 100) / 100

/** `box` mirrored across the frame's middle, left to right. */
const mirrored = (box: ElementBox): ElementBox => ({ ...box, x: round2(100 - box.x - box.width) })

/**
 * Put the camera on the other side and the words with it, so a Side by
 * Side theme can have the camera on the left or the right.
 */
function swapSides(theme: BroadcastTheme): Partial<BroadcastTheme> {
  const panel = theme.cameraPanel
  if (!panel) return {}
  const layout = theme.layout
  const free = layout.mode === "free" && layout.referenceBox && layout.verseBox
  return {
    cameraPanel: { ...panel, box: mirrored(panel.box) },
    ...(free
      ? { layout: { ...layout, referenceBox: mirrored(layout.referenceBox!), verseBox: mirrored(layout.verseBox!) } }
      : {}),
  }
}

/** The panel's height set so the box is 16:9 on this theme's frame, kept on screen. */
function sixteenByNine(theme: BroadcastTheme, box: ElementBox): ElementBox {
  const { width, height } = theme.resolution
  const heightPct = ((box.width / 100) * width * (9 / 16)) / height * 100
  const h = round2(Math.min(100, heightPct))
  return { ...box, height: h, y: round2(Math.min(box.y, 100 - h)) }
}

function BoxField({
  label,
  value,
  px,
  onChange,
}: {
  label: string
  value: number
  px: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <span className="text-[10px] tabular-nums text-muted-foreground">{px}px</span>
      </div>
      <Input
        type="number"
        min={0}
        max={100}
        step={0.5}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v) && v >= 0 && v <= 100) onChange(v)
        }}
      />
    </div>
  )
}

/**
 * The Camera tab: a live camera in a box of its own, placed anywhere (drag
 * and resize it on the canvas), e.g. beside the words in a Side by Side theme.
 */
export function CameraPanelProperties() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)
  const updateDraft = useBroadcastStore((s) => s.updateDraft)
  if (!draftTheme) return null

  const panel = draftTheme.cameraPanel
  const enabled = !!panel?.enabled

  const setEnabled = (on: boolean) => {
    if (on) {
      updateDraft({ cameraPanel: { ...(panel ?? DEFAULT_CAMERA_PANEL), enabled: true } })
      useBroadcastStore.getState().setSelectedElement("camera")
    } else if (panel) {
      update("cameraPanel.enabled", false)
      if (useBroadcastStore.getState().selectedElement === "camera") useBroadcastStore.getState().setSelectedElement(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5 pb-1">
        <h4 className="text-xs font-semibold">Camera panel</h4>
        <p className="text-[0.6875rem] text-muted-foreground">
          A live camera in its own box beside the words, over the background. Drag and resize it on the canvas.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="camera-panel-on">
          Show a camera panel
        </label>
        <Switch id="camera-panel-on" checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {enabled && panel && (
        <>
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-muted-foreground">Camera</label>
            <CameraPicker feed={panel.camera} onChoose={(feed) => update("cameraPanel.camera", feed)} />
          </div>

          {panel.camera && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Fit</label>
              <Select value={panel.camera.fit ?? "cover"} onValueChange={(v) => update("cameraPanel.camera.fit", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cover">Fill the box (crop the edges)</SelectItem>
                  <SelectItem value="contain">Whole picture (bars if needed)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => updateDraft(swapSides(draftTheme))}>
              <ArrowLeftRightIcon className="size-3.5" />
              Swap sides
            </Button>
            <Button variant="outline" size="sm" onClick={() => update("cameraPanel.box", sixteenByNine(draftTheme, panel.box))}>
              <RectangleHorizontalIcon className="size-3.5" />
              Make 16:9
            </Button>
          </div>

          <div className="flex flex-col gap-3 border-t pt-3">
            <RadiusEditor value={radiusOf(panel)} onChange={(r) => writeRadius(update, "cameraPanel", r)} />
          </div>

          <ShadowEditor
            enabled={panel.shadow}
            value={panel.shadowStyle}
            onToggle={(on) => update("cameraPanel.shadow", on)}
            onChange={(style) => update("cameraPanel.shadowStyle", style)}
          />

          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="camera-panel-border">
              Border
            </label>
            <Switch
              id="camera-panel-border"
              checked={!!panel.border}
              onCheckedChange={(on) => update("cameraPanel.border", on ? { color: "#ffffff", width: 4 } : null)}
            />
          </div>
          {panel.border && (
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={panel.border.color}
                onChange={(e) => update("cameraPanel.border.color", e.target.value)}
                className="h-7 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
                aria-label="Border colour"
              />
              <div className="flex flex-1 flex-col gap-1">
                <Slider
                  min={1}
                  max={24}
                  step={1}
                  value={[panel.border.width]}
                  onValueChange={([v]) => update("cameraPanel.border.width", v)}
                />
              </div>
              <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{panel.border.width}px</span>
            </div>
          )}

          <WordsCard />

          <details className="group border-t pt-3">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground">
              Exact position
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-[11px] text-muted-foreground">As % of the output size.</p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["x", "X", "width"],
                    ["y", "Y", "height"],
                    ["width", "Width", "width"],
                    ["height", "Height", "height"],
                  ] as const
                ).map(([key, label, axis]) => (
                  <BoxField
                    key={key}
                    label={label}
                    value={panel.box[key]}
                    px={Math.round((panel.box[key] / 100) * draftTheme.resolution[axis])}
                    onChange={(v) => update(`cameraPanel.box.${key}`, v)}
                  />
                ))}
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  )
}


/**
 * The card behind the words (the verse plate), next to the camera's: its
 * rounding, padding, shadow and border, so the two cards can be matched.
 * Its colour and picture are under Text → Words Plate.
 */
function WordsCard() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)
  if (!draftTheme) return null
  const card = draftTheme.verseText.surface
  const on = !!card?.enabled
  const panel = draftTheme.cameraPanel

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h4 className="text-xs font-semibold">Words card</h4>
          <p className="text-[0.625rem] text-muted-foreground">The words&apos; own card: Bible verses, songs and texts.</p>
        </div>
        <Switch
          checked={on}
          onCheckedChange={(next) =>
            card ? update("verseText.surface.enabled", next) : update("verseText.surface", { ...NEW_WORDS_CARD, enabled: next })
          }
          aria-label="Words card"
        />
      </div>
      {on && card && (
        <>
          <RadiusEditor value={radiusOf(card)} onChange={(r) => writeRadius(update, "verseText.surface", r)} />
          <SidesEditor
            label="Padding"
            value={surfaceInsets(card)}
            onChange={(sides) => {
              if (isUniform(sides)) {
                update("verseText.surface.padding", sides.top)
                update("verseText.surface.paddings", null)
              } else {
                update("verseText.surface.paddings", sides)
              }
            }}
          />
          <ShadowEditor
            enabled={!!card.shadow}
            value={card.shadowStyle}
            onToggle={(on) => update("verseText.surface.shadow", on)}
            onChange={(style) => update("verseText.surface.shadowStyle", style)}
          />
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="words-card-border">
              Border
            </label>
            <Switch
              id="words-card-border"
              checked={!!card.border}
              onCheckedChange={(v) => update("verseText.surface.border", v ? { color: "#ffffff", width: 4 } : null)}
            />
          </div>
          {card.border && (
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={card.border.color}
                onChange={(e) => update("verseText.surface.border.color", e.target.value)}
                className="h-7 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
                aria-label="Words card border colour"
              />
              <Slider
                className="flex-1"
                min={1}
                max={24}
                step={1}
                value={[card.border.width]}
                onValueChange={([v]) => update("verseText.surface.border.width", v)}
              />
              <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{card.border.width}px</span>
            </div>
          )}
          {panel && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                update("verseText.surface", {
                  ...card,
                  borderRadius: panel.borderRadius,
                  radii: panel.radii ? { ...panel.radii } : null,
                  shadow: panel.shadow,
                  shadowStyle: panel.shadowStyle ? { ...panel.shadowStyle } : null,
                  border: panel.border ? { ...panel.border } : null,
                })
              }
            >
              Match the camera card
            </Button>
          )}
        </>
      )}
    </div>
  )
}

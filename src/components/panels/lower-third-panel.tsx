import { useMemo, useState } from "react"
import { EyeIcon, EyeOffIcon, ImageIcon, PlayIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { PanelHeader } from "@/components/ui/panel-header"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { CanvasVerse } from "@/components/ui/canvas-verse"
import { BackgroundPicker } from "@/components/panels/background-picker"
import { FontFamilyPicker } from "@/components/broadcast/text-properties"
import { Field, Segmented } from "@/components/panels/style-controls"
import { FLOAT_LIFT, FLOAT_WIDTH, LOWER_THIRD_LOOKS, currentLook, withTextColors } from "@/lib/lower-third-looks"
import { bandTimeline } from "@/lib/frame-transition"
import { buildColorWithOpacity, parseColorOpacity } from "@/lib/color-utils"
import { pickThemeBackgroundImage } from "@/lib/theme-designer-files"
import { libraryFileUrl } from "@/lib/library-api"
import { cn } from "@/lib/utils"
import { useBroadcastStore, usePreviewStore } from "@/stores"
import { lowerThirdThemeId } from "@/stores/broadcast-store"
import { useContentTabStore } from "@/stores/content-tab-store"
import { useVideosStore } from "@/stores/videos-store"
import type { BandTransition, BroadcastTheme, SurfaceFill, VerseRenderData } from "@/types/broadcast"

/** Stands in for the words when the preview has none. */
const SAMPLE: VerseRenderData = {
  style: "scripture",
  reference: "John 3:16 (KJV)",
  segments: [{ verseNumber: 16, text: "For God so loved the world, that he gave his only begotten Son." }],
}

type Fill = "none" | "colour" | "gradient" | "image" | "video"

function fillOf(band: SurfaceFill): Fill {
  if (!band.enabled) return "none"
  if (band.video?.videoId) return "video"
  if (band.image) return "image"
  if (band.gradient?.stops.length) return "gradient"
  return "colour"
}

const DEFAULT_TRANSITION: BandTransition = { type: "fade", duration: 300, easing: "ease-out", direction: "up" }

/** A colour swatch input from a theme colour, which may carry alpha or be "transparent". */
function hexOf(color: string): string {
  return /^#[0-9a-fA-F]{6}/.test(color) ? color.slice(0, 7) : "#000000"
}

function ColourInput({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label: string }) {
  return (
    <input
      type="color"
      value={hexOf(value)}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-9 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
      aria-label={label}
    />
  )
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number) => void
}) {
  return (
    <Field label={label} aside={<span className="text-xs tabular-nums text-muted-foreground">{Math.round(value)}{unit}</span>}>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} aria-label={label} />
    </Field>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border px-3 py-3 last:border-b-0">
      <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

/** A see-through checkerboard, so a transparent band reads as see-through. */
const CHECKER =
  "bg-[conic-gradient(#3f3f46_25%,#27272a_0_50%,#3f3f46_0_75%,#27272a_0)] bg-[length:16px_16px]"

/**
 * The Lower Third's own properties: a look to start from, the band's fill,
 * shape and accent, the words' colours and font, and how the band comes on
 * and goes off air. Changes save to the lower third's theme at once (a
 * built-in is copied first) and show on every output using it.
 */
export function LowerThirdPanel() {
  const themes = useBroadcastStore((s) => s.themes)
  const outputs = useBroadcastStore((s) => s.outputs)
  const activeThemeId = useBroadcastStore((s) => s.activeThemeId)
  const isLive = useBroadcastStore((s) => s.isLive)
  const bandHidden = useBroadcastStore((s) => s.lowerThirdHidden)
  const preview = usePreviewStore((s) => s.content)
  const themeId = lowerThirdThemeId({ themes, outputs, activeThemeId })
  const theme = themes.find((t) => t.id === themeId)
  // The sample band in the panel, taken off and brought back to show the transition.
  const [sampleShown, setSampleShown] = useState(true)
  // "Video" picked, but no video chosen from the list yet.
  const [choosingVideo, setChoosingVideo] = useState(false)
  const close = () => useContentTabStore.getState().setThemeStyleOpen(false)

  const words = useMemo<VerseRenderData>(
    () => (preview && !preview.image && !preview.video && !preview.timer && preview.segments.length ? preview : SAMPLE),
    [preview]
  )

  if (!theme) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <PanelHeader title="Lower third">
          <Button variant="ghost" size="icon-xs" className="text-muted-foreground" onClick={close} aria-label="Close">
            <XIcon />
          </Button>
        </PanelHeader>
        <p className="p-4 text-sm text-muted-foreground">
          No output shows a lower third. Choose the Lower Thirds theme for an output (Outputs, or the theme library),
          then style it here.
        </p>
      </div>
    )
  }

  const update = (change: (t: BroadcastTheme) => Partial<BroadcastTheme>) =>
    useBroadcastStore.getState().updateLowerThird(change)
  const setBand = (patch: Partial<SurfaceFill>) => update((t) => ({ textBox: { ...t.textBox, ...patch } }))
  const setLayout = (patch: Partial<BroadcastTheme["layout"]>) => update((t) => ({ layout: { ...t.layout, ...patch } }))
  const setTransition = (patch: Partial<BandTransition>) =>
    update((t) => ({ bandTransition: { ...(t.bandTransition ?? { ...DEFAULT_TRANSITION, ...t.transition }), ...patch } as BandTransition }))

  const band = theme.textBox
  const fill = fillOf(band)
  const floating = theme.layout.textAreaWidth < 100 || (theme.layout.bandInset ?? 0) > 0
  const look = currentLook(theme)
  const transition: BandTransition = theme.bandTransition ?? {
    ...DEFAULT_TRANSITION,
    ...(["fade", "slide", "wipe", "pop", "cut"].includes(theme.transition.type) ? theme.transition : {}),
  } as BandTransition
  const chip = theme.reference.surface
  const stops = band.gradient?.stops ?? []
  const top = parseColorOpacity(stops[0]?.color ?? "#00000000")
  const bottom = parseColorOpacity(stops[stops.length - 1]?.color ?? "#000000d9")

  const chooseFill = async (next: Fill) => {
    const base = { enabled: true, video: null, image: null, gradient: null }
    if (next === "none") return setBand({ enabled: false })
    if (next === "colour") return setBand({ ...base, opacity: band.opacity || 0.8 })
    if (next === "gradient") {
      return setBand({
        ...base,
        opacity: 1,
        gradient: {
          angle: 90,
          stops: [
            { color: "#00000000", position: 0 },
            { color: buildColorWithOpacity(hexOf(band.color), 85), position: 100 },
          ],
        },
      })
    }
    if (next === "image") {
      try {
        const url = await pickThemeBackgroundImage()
        if (url) setBand({ ...base, image: { url, fit: "cover", blur: 0, brightness: 100, tint: null } })
      } catch (error) {
        toast.error("Could not use that image", { description: String(error) })
      }
      return
    }
    // Video: chosen from the list below; until then the band keeps its fill.
    setChoosingVideo(true)
  }

  const setGradientStop = (index: 0 | 1, hex: string, opacity: number) => {
    const next = [
      { color: index === 0 ? buildColorWithOpacity(hex, opacity) : (stops[0]?.color ?? "#00000000"), position: 0 },
      {
        color: index === 1 ? buildColorWithOpacity(hex, opacity) : (stops[stops.length - 1]?.color ?? "#000000d9"),
        position: 100,
      },
    ]
    setBand({ gradient: { angle: band.gradient?.angle ?? 90, stops: next } })
  }

  const playTransition = () => {
    setSampleShown(false)
    // Off, then back on once it has gone, so both halves show.
    setTimeout(() => setSampleShown(true), Math.max(400, bandTimeline(transition, false).total + 250))
  }

  return (
    <div
      data-slot="lower-third-panel"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs"
    >
      <PanelHeader title="Lower third">
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={close}
          title="Close and show detections"
          aria-label="Close lower third"
        >
          <XIcon />
        </Button>
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              !isLive ? "bg-muted-foreground/40" : bandHidden ? "bg-amber-500" : "bg-live-pulse"
            )}
          />
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">
            {!isLive ? "Off air: go live to show the band" : bandHidden ? "Band hidden, still on air" : "Band on screen"}
          </span>
          <Button
            variant={bandHidden ? "default" : "outline"}
            size="sm"
            disabled={!isLive}
            aria-pressed={bandHidden}
            onClick={() => useBroadcastStore.getState().setLowerThirdHidden(!bandHidden)}
            title={bandHidden ? "Bring the band back on screen (H)" : "Take the band off screen, staying on air (H)"}
          >
            {bandHidden ? <EyeIcon /> : <EyeOffIcon />}
            {bandHidden ? "Show band" : "Hide band"}
          </Button>
        </div>
        <div className="px-3 pt-3">
          <div className={cn("relative overflow-hidden rounded-md", CHECKER)}>
            <CanvasVerse theme={theme} verse={sampleShown ? words : null} animate />
            <Button
              variant="secondary"
              size="xs"
              className="absolute top-1.5 right-1.5 opacity-90"
              onClick={playTransition}
              title="Take the band off and bring it back, here only"
            >
              <PlayIcon />
              Play
            </Button>
          </div>
          <p className="mt-1.5 truncate text-[0.6875rem] text-muted-foreground" title={theme.name}>
            Changes save to <span className="font-medium text-foreground">{theme.name}</span> and show on its outputs at once.
          </p>
        </div>

        <Section title="Looks">
          <div className="grid grid-cols-2 gap-2">
            {LOWER_THIRD_LOOKS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => useBroadcastStore.getState().applyLowerThirdLook(option.id)}
                title={option.description}
                aria-pressed={look === option.id}
                className={cn(
                  "group flex flex-col gap-1 rounded-md border p-1 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  look === option.id ? "border-primary bg-primary/10" : "border-border hover:border-foreground/30"
                )}
              >
                <div className={cn("overflow-hidden rounded-sm", CHECKER)}>
                  <CanvasVerse theme={{ ...theme, ...option.apply(theme) }} verse={SAMPLE} />
                </div>
                <span className="px-0.5 text-xs font-medium">{option.name}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Background">
          <Segmented
            label="Band fill"
            value={choosingVideo ? "video" : fill}
            options={[
              ["none", "None"],
              ["colour", "Colour"],
              ["gradient", "Gradient"],
              ["image", "Image"],
              ["video", "Video"],
            ]}
            onChange={(next) => {
              setChoosingVideo(next === "video")
              void chooseFill(next)
            }}
          />

          {fill === "none" && !choosingVideo && (
            <p className="text-[0.6875rem] text-muted-foreground">
              No band: just the words, over whatever is behind (transparent for keying, or the camera).
            </p>
          )}

          {fill === "colour" && !choosingVideo && (
            <Field label="Colour">
              <div className="flex items-center gap-2">
                <ColourInput value={band.color} onChange={(color) => setBand({ color })} label="Band colour" />
                <Slider
                  min={0}
                  max={100}
                  value={[Math.round(band.opacity * 100)]}
                  onValueChange={([v]) => setBand({ opacity: v / 100 })}
                  className="flex-1"
                  aria-label="Band opacity"
                />
                <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                  {Math.round(band.opacity * 100)}%
                </span>
              </div>
            </Field>
          )}

          {fill === "gradient" && !choosingVideo && (
            <>
              {([0, 1] as const).map((index) => {
                const stop = index === 0 ? top : bottom
                return (
                  <Field key={index} label={index === 0 ? "Top" : "Bottom"}>
                    <div className="flex items-center gap-2">
                      <ColourInput
                        value={stop.hex}
                        onChange={(hex) => setGradientStop(index, hex, stop.opacity)}
                        label={`${index === 0 ? "Top" : "Bottom"} colour`}
                      />
                      <Slider
                        min={0}
                        max={100}
                        value={[stop.opacity]}
                        onValueChange={([v]) => setGradientStop(index, stop.hex, v)}
                        className="flex-1"
                        aria-label={`${index === 0 ? "Top" : "Bottom"} opacity`}
                      />
                      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{stop.opacity}%</span>
                    </div>
                  </Field>
                )
              })}
              <Segmented
                label="Gradient direction"
                value={String(band.gradient?.angle ?? 90)}
                options={[
                  ["90", "Top → bottom"],
                  ["0", "Left → right"],
                ]}
                onChange={(angle) => setBand({ gradient: { angle: Number(angle), stops } })}
              />
            </>
          )}

          {fill === "image" && !choosingVideo && (
            <div className="flex items-center gap-2">
              {band.image && (
                <img src={band.image.url} alt="" className="h-8 w-14 shrink-0 rounded border object-cover" />
              )}
              <Button variant="outline" size="xs" onClick={() => void chooseFill("image")}>
                <ImageIcon />
                Choose image…
              </Button>
            </div>
          )}

          {(fill === "video" || choosingVideo) && (
            <Field label="Video">
              <div className="rounded-md border">
                <BackgroundPicker
                  videoId={band.video?.videoId ?? null}
                  onChoose={async (videoId) => {
                    const chosen = useVideosStore.getState().videos.find((v) => v.id === videoId)
                    setChoosingVideo(false)
                    if (!chosen) return
                    setBand({
                      enabled: true,
                      image: null,
                      gradient: null,
                      video: {
                        videoId: chosen.id,
                        file: chosen.path.split(/[\\/]/).pop() ?? "",
                        poster: chosen.poster_path ? libraryFileUrl(chosen.poster_path) : undefined,
                      },
                    })
                  }}
                />
              </div>
              <p className="text-[0.6875rem] text-muted-foreground">
                A short clip loops silently in the band. Import clips in the Videos tab.
              </p>
            </Field>
          )}

          <Field label="Shape">
            <Segmented
              label="Band shape"
              value={floating ? "floating" : "full"}
              options={[
                ["full", "Full width"],
                ["floating", "Floating"],
              ]}
              onChange={(shape) =>
                setLayout(
                  shape === "floating"
                    ? { textAreaWidth: FLOAT_WIDTH, bandInset: FLOAT_LIFT, offsetY: 0 }
                    : { textAreaWidth: 100, bandInset: 0, offsetY: 0 }
                )
              }
            />
          </Field>
          {floating && (
            <>
              <SliderField
                label="Width"
                value={theme.layout.textAreaWidth}
                min={50}
                max={100}
                unit="%"
                onChange={(v) => setLayout({ textAreaWidth: Math.round(v) })}
              />
              <SliderField
                label="Lift from the bottom"
                value={theme.layout.bandInset ?? 0}
                min={0}
                max={160}
                unit="px"
                onChange={(v) => setLayout({ bandInset: Math.round(v) })}
              />
            </>
          )}
          <SliderField
            label="Height"
            value={theme.layout.textAreaHeight}
            min={12}
            max={60}
            unit="%"
            onChange={(v) => useBroadcastStore.getState().setBandHeight(v)}
          />
          {fill !== "none" && (
            <SliderField
              label="Corners"
              value={band.borderRadius}
              min={0}
              max={48}
              unit="px"
              onChange={(v) => setBand({ borderRadius: Math.round(v) })}
            />
          )}

          {fill !== "none" && (
            <Field
              label="Accent stripe"
              aside={
                <Switch
                  checked={!!band.accent}
                  onCheckedChange={(on) => setBand({ accent: on ? { color: "#a3e635", width: 10, side: "left" } : null })}
                  aria-label="Accent stripe"
                />
              }
            >
              {band.accent && (
                <div className="flex items-center gap-2">
                  <ColourInput
                    value={band.accent.color}
                    onChange={(color) => setBand({ accent: { ...band.accent!, color } })}
                    label="Accent colour"
                  />
                  <div className="flex-1">
                    <Segmented
                      label="Accent side"
                      value={band.accent.side}
                      options={[
                        ["left", "Left"],
                        ["top", "Top"],
                      ]}
                      onChange={(side) => setBand({ accent: { ...band.accent!, side } })}
                    />
                  </div>
                  <Slider
                    min={2}
                    max={30}
                    value={[band.accent.width]}
                    onValueChange={([width]) => setBand({ accent: { ...band.accent!, width } })}
                    className="w-16 shrink-0"
                    aria-label="Accent thickness"
                  />
                </div>
              )}
            </Field>
          )}
        </Section>

        <Section title="Text">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Words">
              <ColourInput
                value={theme.verseText.color}
                onChange={(color) => update((t) => withTextColors(t, { words: color }))}
                label="Words colour"
              />
            </Field>
            <Field label="Reference">
              <ColourInput
                value={theme.reference.color}
                onChange={(color) => update((t) => withTextColors(t, { reference: color }))}
                label="Reference colour"
              />
            </Field>
          </div>
          <Field
            label="Reference tag"
            aside={
              <Switch
                checked={!!chip?.enabled}
                onCheckedChange={(on) =>
                  update((t) => ({
                    reference: {
                      ...t.reference,
                      surface: {
                        color: "#a3e635",
                        opacity: 1,
                        borderRadius: 8,
                        padding: 12,
                        image: null,
                        ...t.reference.surface,
                        enabled: on,
                      },
                    },
                  }))
                }
                aria-label="Reference tag"
              />
            }
          >
            {chip?.enabled && (
              <div className="flex items-center gap-2">
                <ColourInput
                  value={chip.color}
                  onChange={(color) => update((t) => ({ reference: { ...t.reference, surface: { ...chip, color } } }))}
                  label="Tag colour"
                />
                <span className="text-[0.6875rem] text-muted-foreground">
                  The reference sits in a coloured tag above the band.
                </span>
              </div>
            )}
          </Field>
          <Field label="Font">
            <FontFamilyPicker
              value={theme.verseText.fontFamily}
              onChange={(fontFamily) =>
                update((t) => ({
                  verseText: { ...t.verseText, fontFamily },
                  reference: { ...t.reference, fontFamily },
                }))
              }
            />
          </Field>
        </Section>

        <Section title="Transition">
          <Segmented
            label="Band transition"
            value={transition.type}
            options={[
              ["fade", "Fade"],
              ["slide", "Slide"],
              ["wipe", "Wipe"],
              ["pop", "Pop"],
              ["cut", "Cut"],
            ]}
            onChange={(type) => setTransition({ type })}
          />
          {(transition.type === "slide" || transition.type === "wipe") && (
            <Field label="From">
              <Segmented
                label="Transition direction"
                value={transition.direction}
                options={[
                  ["up", "Bottom"],
                  ["down", "Top"],
                  ["right", "Left"],
                  ["left", "Right"],
                ]}
                onChange={(direction) => setTransition({ direction })}
              />
            </Field>
          )}
          {transition.type !== "cut" && (
            <Field label="Words">
              <Segmented
                label="When the words come in"
                value={transition.textTiming ?? "with"}
                options={[
                  ["with", "With the band"],
                  ["landing", "As it lands"],
                  ["after", "After it lands"],
                ]}
                onChange={(textTiming) => setTransition({ textTiming })}
              />
            </Field>
          )}
          {transition.type !== "cut" && (
            <SliderField
              label="Speed"
              value={transition.duration}
              min={150}
              max={1200}
              step={50}
              unit=" ms"
              onChange={(duration) => setTransition({ duration: Math.round(duration) })}
            />
          )}
          <p className="text-[0.6875rem] text-muted-foreground">
            How the band comes on and goes off air, and with Hide/Show band. With the words after the band, they
            also leave first. Press Play above to see it.
          </p>
        </Section>
      </div>
    </div>
  )
}

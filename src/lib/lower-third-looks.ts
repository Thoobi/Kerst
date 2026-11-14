import type { BandTransition, BroadcastTheme, LyricsStyle, SurfaceFill } from "@/types/broadcast"

/**
 * One-click looks for a Lower Thirds band. Each sets the band (fill,
 * corners, width, accent), the reference chip, the words' colours and
 * shadow, and how the band comes on and goes off air. It keeps what the
 * operator chose that isn't about the look: fonts, sizes and band height.
 */
export interface LowerThirdLook {
  id: string
  name: string
  /** One line on what it looks like, for the tooltip. */
  description: string
  apply: (theme: BroadcastTheme) => Partial<BroadcastTheme>
}

/** The brand accent. */
const LIME = "#a3e635"
const GOLD = "#fbbf24"

const NO_CHIP: SurfaceFill = {
  enabled: false,
  color: "#000000",
  opacity: 1,
  borderRadius: 8,
  padding: 12,
  image: null,
}

/** A band surface, starting from the theme's own so padding stays. */
function band(theme: BroadcastTheme, fill: Partial<SurfaceFill>): SurfaceFill {
  return {
    ...theme.textBox,
    enabled: true,
    image: null,
    video: null,
    gradient: null,
    accent: null,
    ...fill,
  }
}

/** Full width and sitting on the bottom edge, or a card lifted off it. */
function placement(theme: BroadcastTheme, floating: boolean): BroadcastTheme["layout"] {
  return {
    ...theme.layout,
    anchor: "bottom-center",
    offsetX: 0,
    offsetY: 0,
    bandInset: floating ? FLOAT_LIFT : 0,
    textAreaWidth: floating ? FLOAT_WIDTH : 100,
  }
}

/** A floating band's width, in % of the frame. */
export const FLOAT_WIDTH = 90
/** How far a floating band sits above the bottom edge (`layout.bandInset`), in theme px (at 1080p). */
export const FLOAT_LIFT = 40

function transition(type: BandTransition["type"], direction: BandTransition["direction"], duration: number): BandTransition {
  return { type, direction, duration, easing: "ease-out" }
}

/**
 * Words and reference colours on the theme, with any song or Bible style
 * colour override cleared, so the colour shows for songs and verses alike.
 */
export function withTextColors(
  theme: BroadcastTheme,
  colors: { words?: string; reference?: string }
): Partial<BroadcastTheme> {
  const clear = <T extends LyricsStyle & { referenceColor?: string }>(style: T | undefined): T | undefined => {
    if (!style) return style
    const next = { ...style }
    if (colors.words !== undefined) delete next.color
    if (colors.reference !== undefined) delete next.referenceColor
    return next
  }
  return {
    verseText: colors.words !== undefined ? { ...theme.verseText, color: colors.words } : theme.verseText,
    reference: colors.reference !== undefined ? { ...theme.reference, color: colors.reference } : theme.reference,
    lyricsText: clear(theme.lyricsText),
    savedLyricsText: clear(theme.savedLyricsText),
    scriptureText: clear(theme.scriptureText),
    savedScriptureText: clear(theme.savedScriptureText),
  }
}

/** Colours, shadow and reference chip together, as every look sets them. */
function text(
  theme: BroadcastTheme,
  words: string,
  reference: string,
  shadow: BroadcastTheme["verseText"]["shadow"],
  chip: SurfaceFill = NO_CHIP
): Partial<BroadcastTheme> {
  const colored = withTextColors(theme, { words, reference })
  return {
    ...colored,
    verseText: { ...colored.verseText!, shadow },
    reference: { ...colored.reference!, surface: chip },
  }
}

const SOFT_SHADOW = { color: "rgba(0,0,0,0.6)", blur: 6, x: 0, y: 2 }
const STRONG_SHADOW = { color: "rgba(0,0,0,0.9)", blur: 14, x: 0, y: 3 }

export const LOWER_THIRD_LOOKS: LowerThirdLook[] = [
  {
    id: "floating",
    name: "Floating",
    description: "A rounded dark card lifted off the bottom, springing in",
    apply: (theme) => ({
      ...text(theme, "#ffffff", GOLD, SOFT_SHADOW),
      textBox: band(theme, {
        color: "#0b0b10",
        opacity: 0.82,
        borderRadius: 20,
        gradient: { angle: 90, stops: [{ color: "#1f2937", position: 0 }, { color: "#0b0b10", position: 100 }] },
        accent: { color: GOLD, width: 6, side: "top" },
      }),
      layout: placement(theme, true),
      bandTransition: transition("pop", "up", 450),
    }),
  },
  {
    id: "classic",
    name: "Classic",
    description: "A full-width dark band along the bottom, fading in",
    apply: (theme) => ({
      ...text(theme, "#ffffff", GOLD, SOFT_SHADOW),
      textBox: band(theme, { color: "#000000", opacity: 0.7, borderRadius: 0 }),
      layout: placement(theme, false),
      bandTransition: transition("fade", "up", 300),
    }),
  },
  {
    id: "accent-bar",
    name: "Accent bar",
    description: "A solid band with a coloured stripe, wiping in from the left",
    apply: (theme) => ({
      ...text(theme, "#ffffff", LIME, null),
      textBox: band(theme, {
        color: "#111318",
        opacity: 0.95,
        borderRadius: 6,
        accent: { color: LIME, width: 12, side: "left" },
      }),
      layout: placement(theme, true),
      bandTransition: transition("wipe", "right", 500),
    }),
  },
  {
    id: "gradient-fade",
    name: "Gradient fade",
    description: "No hard edge: dark rising from the bottom into the picture",
    apply: (theme) => ({
      ...text(theme, "#ffffff", GOLD, STRONG_SHADOW),
      textBox: band(theme, {
        color: "#000000",
        opacity: 1,
        borderRadius: 0,
        gradient: {
          angle: 90,
          stops: [
            { color: "#00000000", position: 0 },
            { color: "#0000008c", position: 45 },
            { color: "#000000d9", position: 100 },
          ],
        },
      }),
      layout: placement(theme, false),
      bandTransition: transition("slide", "up", 450),
    }),
  },
  {
    id: "name-tag",
    name: "Name tag",
    description: "The reference in a bright tag above a slim band",
    apply: (theme) => ({
      ...text(theme, "#ffffff", "#0b0b0b", SOFT_SHADOW, {
        enabled: true,
        color: LIME,
        opacity: 1,
        borderRadius: 8,
        padding: 12,
        image: null,
      }),
      textBox: band(theme, { color: "#0f172a", opacity: 0.88, borderRadius: 12 }),
      layout: placement(theme, true),
      bandTransition: transition("slide", "up", 400),
    }),
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "No band, just the words with a strong shadow",
    apply: (theme) => ({
      ...text(theme, "#ffffff", GOLD, STRONG_SHADOW),
      textBox: { ...band(theme, {}), enabled: false },
      layout: placement(theme, false),
      bandTransition: transition("fade", "up", 350),
    }),
  },
]

/** The look `theme` was last given, if it still matches one (by its band and transition). */
export function currentLook(theme: BroadcastTheme): string | null {
  for (const look of LOWER_THIRD_LOOKS) {
    const applied = look.apply(theme)
    const same =
      JSON.stringify(applied.textBox) === JSON.stringify(theme.textBox) &&
      JSON.stringify(applied.bandTransition) === JSON.stringify(theme.bandTransition) &&
      applied.layout?.textAreaWidth === theme.layout.textAreaWidth
    if (same) return look.id
  }
  return null
}

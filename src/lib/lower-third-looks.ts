import { bandMargins } from "@/lib/lower-third"
import type { BandTransition, BroadcastTheme, LyricsStyle, SurfaceFill, EdgeInsets, ShadowStyle } from "@/types/broadcast"

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
    // One look's border, shadow or corner shapes don't carry into the next.
    border: null,
    shadow: false,
    shadowStyle: null,
    radii: null,
    ...fill,
  }
}

/** A band at `margins` from the frame's edges (theme px at 1080p), anchored to the bottom. */
function placedAt(theme: BroadcastTheme, margins: EdgeInsets): BroadcastTheme["layout"] {
  return { ...placement(theme, true), bandMargins: margins }
}

const DEEP_SHADOW: ShadowStyle = { color: "#0000008c", x: 0, y: 16, blur: 48, spread: 0 }
const SOFT_CARD_SHADOW: ShadowStyle = { color: "#00000059", x: 0, y: 8, blur: 28, spread: 0 }
const NEWS_BLUE = "#0b2a5b"

/** Full width and sitting on the bottom edge, or a card lifted off it. */
function placement(theme: BroadcastTheme, floating: boolean): BroadcastTheme["layout"] {
  return {
    ...theme.layout,
    anchor: "bottom-center",
    offsetX: 0,
    offsetY: 0,
    bandInset: floating ? FLOAT_LIFT : 0,
    textAreaWidth: floating ? FLOAT_WIDTH : 100,
    bandMargins: floating ? floatingMargins(theme.resolution.width) : FULL_WIDTH_MARGINS,
  }
}

/** A full-width band: on the bottom edge, side to side. */
export const FULL_WIDTH_MARGINS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 }

/** A floating band's margins: FLOAT_WIDTH of the frame wide, lifted FLOAT_LIFT off the bottom. */
export function floatingMargins(frameWidth: number): EdgeInsets {
  const side = Math.round(((100 - FLOAT_WIDTH) / 200) * frameWidth)
  return { top: 0, right: side, bottom: FLOAT_LIFT, left: side }
}

/** A floating band's width, in % of the frame. */
export const FLOAT_WIDTH = 90
/** How far a floating band sits above the bottom edge (`layout.bandInset`), in theme px (at 1080p). */
export const FLOAT_LIFT = 40

/** A band transition; the words follow once the band has landed, unless said. */
function transition(
  type: BandTransition["type"],
  direction: BandTransition["direction"],
  duration: number,
  textTiming: BandTransition["textTiming"] = "after"
): BandTransition {
  return { type, direction, duration, easing: "ease-out", textTiming }
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
      // No band to come first: the words are the whole thing.
      bandTransition: transition("fade", "up", 350, "with"),
    }),
  },
  {
    id: "rounded-card",
    name: "Rounded card",
    description: "A soft dark card with a fine edge and a deep shadow, popping up",
    apply: (theme) => ({
      ...text(theme, "#ffffff", LIME, null),
      textBox: band(theme, {
        color: "#0e1014",
        opacity: 0.92,
        borderRadius: 24,
        border: { color: "#ffffff1f", width: 2 },
        shadow: true,
        shadowStyle: DEEP_SHADOW,
      }),
      layout: placedAt(theme, { top: 0, right: 96, bottom: 48, left: 96 }),
      bandTransition: transition("pop", "up", 450),
    }),
  },
  {
    id: "glass",
    name: "Glass",
    description: "A light, see-through panel with a bright edge over the picture",
    apply: (theme) => ({
      ...text(theme, "#ffffff", "#e0f2fe", STRONG_SHADOW),
      textBox: band(theme, {
        color: "#ffffff",
        opacity: 0.14,
        borderRadius: 20,
        border: { color: "#ffffff59", width: 2 },
        shadow: true,
        shadowStyle: SOFT_CARD_SHADOW,
      }),
      layout: placedAt(theme, { top: 0, right: 96, bottom: 48, left: 96 }),
      bandTransition: transition("fade", "up", 400),
    }),
  },
  {
    id: "tab",
    name: "Tab",
    description: "A card rising from the bottom edge, rounded only on top",
    apply: (theme) => ({
      ...text(theme, "#ffffff", GOLD, SOFT_SHADOW),
      textBox: band(theme, {
        color: "#111318",
        opacity: 0.95,
        borderRadius: 0,
        radii: { tl: 22, tr: 22, br: 0, bl: 0 },
        shadow: true,
        shadowStyle: { color: "#00000080", x: 0, y: -6, blur: 30, spread: 0 },
      }),
      layout: placedAt(theme, { top: 0, right: 120, bottom: 0, left: 120 }),
      bandTransition: transition("slide", "up", 450),
    }),
  },
  {
    id: "news",
    name: "News",
    description: "A deep blue full-width band, a gold line on top and a gold reference tag, wiping in",
    apply: (theme) => ({
      ...text(theme, "#ffffff", "#0b0b0b", null, {
        enabled: true,
        color: GOLD,
        opacity: 1,
        borderRadius: 4,
        padding: 10,
        image: null,
      }),
      textBox: band(theme, {
        color: NEWS_BLUE,
        opacity: 0.96,
        borderRadius: 0,
        accent: { color: GOLD, width: 6, side: "top" },
      }),
      layout: placement(theme, false),
      bandTransition: transition("wipe", "right", 500),
    }),
  },
  {
    id: "outline",
    name: "Outline",
    description: "No fill: a rounded white frame around the words",
    apply: (theme) => ({
      ...text(theme, "#ffffff", "#ffffff", STRONG_SHADOW),
      textBox: band(theme, {
        color: "#000000",
        opacity: 0.25,
        borderRadius: 18,
        border: { color: "#ffffff", width: 3 },
      }),
      layout: placedAt(theme, { top: 0, right: 96, bottom: 48, left: 96 }),
      bandTransition: transition("fade", "up", 350),
    }),
  },
  {
    id: "light-card",
    name: "Light card",
    description: "A white card with dark words, for bright rooms and daytime streams",
    apply: (theme) => ({
      ...text(theme, "#111318", "#2563eb", null),
      textBox: band(theme, {
        color: "#ffffff",
        opacity: 0.97,
        borderRadius: 18,
        shadow: true,
        shadowStyle: SOFT_CARD_SHADOW,
      }),
      layout: placedAt(theme, { top: 0, right: 96, bottom: 48, left: 96 }),
      bandTransition: transition("pop", "up", 450),
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
      JSON.stringify(applied.layout ? bandMargins({ ...theme, layout: applied.layout }) : null) ===
        JSON.stringify(bandMargins(theme))
    if (same) return look.id
  }
  return null
}

/**
 * Where the installers are served from. Set NEXT_PUBLIC_DOWNLOADS_URL at build
 * time to use another address, e.g. the bucket's r2.dev URL before
 * downloads.litdeck.space is connected (documentation/downloads.md).
 */
const DOWNLOADS_BASE = (process.env.NEXT_PUBLIC_DOWNLOADS_URL || "https://downloads.litdeck.space").replace(/\/+$/, "");

export const SITE = {
  name: "Litdeck",
  legalName: "Litdeck",
  tagline: "Everything you put on screen, live, in one app.",
  shortDescription:
    "Live presentation software: lyrics, slides, videos, scripture and announcements on every screen and over NDI. For services, conferences, classrooms, gigs and any live event.",
  description:
    "Litdeck runs everything you put on screen at a live event: lyrics over motion backgrounds, slides, videos, scripture and announcements, planned in a running order and shown on every display and over NDI. Use it for a worship service, a conference, a classroom or a gig, and drive it from a Stream Deck or let it listen for Bible references as they're spoken.",
  url: "https://litdeck.space",
  locale: "en_US",
  founded: "2025",
  category: "MultimediaApplication",
  operatingSystems: ["Windows", "macOS", "Linux"],
  downloads: {
    // Installers live in our own storage, not on GitHub. CI uploads each
    // release to /v<version>/ and, once the release is published, copies the
    // three files below to /latest/ under these exact names
    // (.github/workflows/build-release.yml and release-download-guard.yml,
    // set up as in documentation/downloads.md). Rename all three together.
    base: DOWNLOADS_BASE,
    windows: `${DOWNLOADS_BASE}/latest/Litdeck-windows-x64-setup.exe`,
    // Apple Silicon only — the build matrix has no x86_64-apple-darwin target.
    mac: `${DOWNLOADS_BASE}/latest/Litdeck-macos-arm64.dmg`,
    // AppImage runs on any distro without a package manager step, so it is the
    // one-click choice.
    linux: `${DOWNLOADS_BASE}/latest/Litdeck-linux-x86_64.AppImage`,
  },
  stats: {
    languages: "2+",
    translations: "6+",
  },
} as const;

/**
 * Where a "Download" CTA should point: straight at the installer for the
 * visitor's platform. Volunteers should not have to pick a file out of a
 * list. Unrecognised platforms (phones, tablets) land on the download section,
 * which lists every platform.
 */
export function downloadHref(platform: string | null | undefined): string {
  switch (platform) {
    case "windows":
      return SITE.downloads.windows;
    case "mac":
      return SITE.downloads.mac;
    case "linux":
      return SITE.downloads.linux;
    default:
      return "/#download";
  }
}

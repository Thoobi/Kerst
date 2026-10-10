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
  repo: {
    owner: "Thoobi",
    name: "Kerst",
    url: "https://github.com/Thoobi/Kerst",
    releases: "https://github.com/Thoobi/Kerst/releases",
    latestRelease: "https://github.com/Thoobi/Kerst/releases/latest",
    // `/releases/latest` resolves to the newest published, non-prerelease
    // release, so these track each tagged release with no hand re-upload. The
    // release workflow ships a copy of each installer under these exact stable
    // filenames (Tauri's own bundle names carry the version); keep them in sync
    // with the `aliases` list in .github/workflows/build-release.yml or these
    // links 404.
    downloadWindows:
      "https://github.com/Thoobi/Kerst/releases/latest/download/Litdeck-windows-x64-setup.exe",
    // Apple Silicon only — the build matrix has no x86_64-apple-darwin target.
    downloadMac:
      "https://github.com/Thoobi/Kerst/releases/latest/download/Litdeck-macos-arm64.dmg",
    // AppImage runs on any distro without a package manager step, so it is the
    // one-click choice; .deb and .rpm stay on the release page.
    downloadLinux:
      "https://github.com/Thoobi/Kerst/releases/latest/download/Litdeck-linux-x86_64.AppImage",
  },
  stats: {
    languages: "2+",
    translations: "6+",
  },
} as const;

/**
 * Where a "Download" CTA should point: straight at the installer for the
 * visitor's platform. Volunteers should not have to pick a file out of a
 * GitHub release page. Unrecognised platforms still land on the release list,
 * where every bundle (.msi, .deb, .rpm) is available.
 */
export function downloadHref(platform: string | null | undefined): string {
  switch (platform) {
    case "windows":
      return SITE.repo.downloadWindows;
    case "mac":
      return SITE.repo.downloadMac;
    case "linux":
      return SITE.repo.downloadLinux;
    default:
      return SITE.repo.latestRelease;
  }
}

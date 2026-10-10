export const SITE = {
  name: "Light",
  legalName: "openbezal",
  tagline: "Everything your church puts on screen, in one free app.",
  shortDescription:
    "Free, open-source church presentation software: songs, scripture, slides, videos and announcements on every screen and over NDI, with AI that finds the verse as it's preached.",
  description:
    "Light runs everything a church puts on screen: song lyrics with motion backgrounds, Bible passages, slides, videos and announcements, planned in a service order and shown on every display and over NDI. While the pastor preaches, it listens and puts each verse on screen the moment it's read.",
  url: "https://openrhema.com",
  locale: "en_US",
  twitterHandle: "@openbezal",
  founded: "2025",
  category: "ChurchSoftware",
  operatingSystems: ["Windows", "macOS", "Linux"],
  repo: {
    owner: "openbezal",
    name: "rhema",
    url: "https://github.com/openbezal/rhema",
    releases: "https://github.com/openbezal/rhema/releases",
    latestRelease: "https://github.com/openbezal/rhema/releases/latest",
    // `/releases/latest` resolves to the newest published, non-prerelease
    // release, so these track each tagged release with no hand re-upload. The
    // release workflow ships a copy of each installer under these exact stable
    // filenames (Tauri's own bundle names carry the version); keep them in sync
    // with the `aliases` list in .github/workflows/build-release.yml or these
    // links 404. Still Rhema-* from before the rename to Light: change both
    // together.
    downloadWindows:
      "https://github.com/openbezal/rhema/releases/latest/download/Rhema-windows-x64-setup.exe",
    // Apple Silicon only — the build matrix has no x86_64-apple-darwin target.
    downloadMac:
      "https://github.com/openbezal/rhema/releases/latest/download/Rhema-macos-arm64.dmg",
    // AppImage runs on any distro without a package manager step, so it is the
    // one-click choice; .deb and .rpm stay on the release page.
    downloadLinux:
      "https://github.com/openbezal/rhema/releases/latest/download/Rhema-linux-x86_64.AppImage",
    discussions: "https://github.com/openbezal/rhema/discussions",
    stars: { fallback: 221 },
  },
  socials: {
    github: "https://github.com/openbezal/rhema",
    twitter: "https://x.com/openbezal",
    linkedin: "https://www.linkedin.com/company/openbezal",
    email: "mailto:hello@openbezal.com",
  },
  stats: {
    languages: "2+",
    translations: "6+",
  },
} as const;

/**
 * Where a "Download" CTA should point: straight at the installer for the
 * visitor's platform. Church volunteers should not have to pick a file out of a
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

export async function getGitHubStars(): Promise<number> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(
      `https://api.github.com/repos/${SITE.repo.owner}/${SITE.repo.name}`,
      { headers }
    );
    if (!res.ok) return SITE.repo.stars.fallback;
    const data = (await res.json()) as { stargazers_count?: number };
    return typeof data.stargazers_count === "number"
      ? data.stargazers_count
      : SITE.repo.stars.fallback;
  } catch {
    return SITE.repo.stars.fallback;
  }
}

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { IconCheck, IconChevronDown, IconCopy, IconDownload, IconTerminal2 } from "@tabler/icons-react";
import { SITE } from "../../_lib/site";
import { cn } from "../../_lib/utils";

type Distro = {
  id: string;
  label: string;
  command: string;
  note: string;
};

// Each command is run as-is in a clean container of that distro before it
// ships (see documentation/downloads.md). Keep them one line, so a single
// paste does the whole install.
const DISTROS: ReadonlyArray<Distro> = [
  {
    id: "debian",
    label: "Ubuntu 24.04+, Debian 13+, Mint 22+",
    command: `wget -O /tmp/litdeck.deb ${SITE.downloads.deb} && sudo apt install -y /tmp/litdeck.deb`,
    note: "Installs the .deb with apt, which pulls in everything Litdeck needs. Open it from your app menu.",
  },
  {
    id: "fedora",
    label: "Fedora 39+",
    command: `sudo dnf install -y ${SITE.downloads.rpm}`,
    note: "dnf downloads the .rpm and installs its dependencies. Open Litdeck from your app menu.",
  },
  {
    id: "opensuse",
    label: "openSUSE Tumbleweed",
    command: `sudo zypper install -y --allow-unsigned-rpm ${SITE.downloads.rpm}`,
    note: "The package isn't signed yet, so zypper needs --allow-unsigned-rpm to accept it.",
  },
  {
    id: "appimage",
    label: "Arch, Manjaro and other distros",
    command: `mkdir -p ~/Applications && curl -fL -o ~/Applications/Litdeck.AppImage ${SITE.downloads.linux} && chmod +x ~/Applications/Litdeck.AppImage && ~/Applications/Litdeck.AppImage`,
    note: "The AppImage runs on any x86_64 distro with no install step. It needs FUSE 2 (fuse2 on Arch, libfuse2 elsewhere).",
  },
];

const noSubscribe = () => () => {};

/** Best guess from the user agent; most Linux browsers don't say which distro. */
function guessDistro(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (/fedora|red hat|rhel/.test(ua)) return "fedora";
  if (/opensuse|suse/.test(ua)) return "opensuse";
  if (/arch|manjaro|endeavour/.test(ua)) return "appimage";
  return "debian";
}

/** One copy-paste install command per distro, plus the raw packages. */
export function LinuxInstall({ className }: { className?: string }) {
  // The server renders Debian; the browser swaps in its guess after hydration.
  const guessed = useSyncExternalStore(noSubscribe, guessDistro, () => "debian");
  const [picked, setPicked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const id = picked ?? guessed;
  const distro = DISTROS.find((d) => d.id === id) ?? DISTROS[0];

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(distro.command);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (http, iframes); the command is selectable.
    }
  };

  return (
    <div
      id="linux"
      className={cn(
        "w-full scroll-mt-28 rounded-2xl border border-white/10 bg-black/40 p-4 text-left backdrop-blur-md sm:p-5",
        className
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2 text-[15px] font-medium text-foreground">
          <IconTerminal2 size={18} stroke={1.75} className="text-accent" aria-hidden />
          Install on Linux
        </span>
        <label className="relative">
          <span className="sr-only">Your distribution</span>
          <select
            value={id}
            onChange={(e) => setPicked(e.target.value)}
            className="h-9 w-full appearance-none rounded-lg border border-white/10 bg-[#0b0c0e] pr-9 pl-3 text-[14px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:w-auto"
          >
            {DISTROS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <IconChevronDown
            size={16}
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
        </label>
      </div>

      <div className="mt-4 flex items-stretch overflow-hidden rounded-xl border border-white/10 bg-[#060708]">
        <pre className="min-w-0 flex-1 overflow-x-auto px-4 py-3 font-mono text-[13px] leading-6 text-foreground [scrollbar-width:thin]">
          <span className="text-accent select-none">$ </span>
          {distro.command}
        </pre>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy command"}
          className="flex w-12 shrink-0 items-center justify-center border-l border-white/10 text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
        >
          {copied ? <IconCheck size={18} className="text-accent" /> : <IconCopy size={18} />}
        </button>
      </div>
      <p className="mt-3 text-[13px] leading-5 text-muted-foreground" aria-live="polite">
        {copied ? "Copied. Paste it into a terminal." : distro.note}
      </p>
      <p className="mt-1.5 text-[12px] leading-5 text-subtle-foreground">
        Litdeck needs a 64-bit distro from 2024 or later (glibc 2.38+). Ubuntu 22.04, Debian 12, Mint 21 and
        openSUSE Leap aren&apos;t supported yet.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.06] pt-4 text-[13px] text-subtle-foreground">
        <span>Or download the package:</span>
        {[
          { label: ".deb", href: SITE.downloads.deb },
          { label: ".rpm", href: SITE.downloads.rpm },
          { label: "AppImage", href: SITE.downloads.linux },
        ].map((p) => (
          <a
            key={p.label}
            href={p.href}
            className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconDownload size={14} aria-hidden />
            {p.label}
          </a>
        ))}
      </div>
    </div>
  );
}

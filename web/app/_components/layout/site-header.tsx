"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  IconArrowUpRight,
  IconBook2,
  IconBroadcast,
  IconChevronDown,
  IconListNumbers,
  IconMusic,
  IconX,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { Button } from "../ui/button";
import { LitdeckLogo } from "../ui/litdeck-logo";
import { downloadHref } from "../../_lib/site";
import { usePlatform } from "../../_lib/use-platform";
import { cn } from "../../_lib/utils";

type Feature = { href: string; title: string; body: string; icon: TablerIcon; preview: Preview };
type Preview = "listen" | "songs" | "order" | "screens";

const PRODUCT: ReadonlyArray<Feature> = [
  { href: "/#features", title: "Lyrics and backgrounds", body: "Words that fill the screen", icon: IconMusic, preview: "songs" },
  { href: "/#how", title: "The running order", body: "Plan it, then click through", icon: IconListNumbers, preview: "order" },
  { href: "/#features", title: "Every screen and the stream", body: "Projectors, monitors and NDI", icon: IconBroadcast, preview: "screens" },
  { href: "/#listen", title: "Listens, if you want", body: "Bible verses found as they're said", icon: IconBook2, preview: "listen" },
];

// Absolute (/#…) so the links work from any page that shares this header.
const LINKS = [
  { href: "/#uses", label: "Use cases" },
  { href: "/#how", label: "How it works" },
  { href: "/docs", label: "Docs" },
] as const;

/** The header every marketing page shares. */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const platform = usePlatform();

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrolled(window.scrollY > 8);
      progressRef.current?.style.setProperty("--progress", String(max > 0 ? window.scrollY / max : 0));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const bar = cn(
    "flex h-12 items-center rounded-2xl border transition-[background-color,border-color,box-shadow] duration-300",
    scrolled
      ? "border-white/10 bg-[#0b0c0e]/70 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      : "border-white/[0.06] bg-white/[0.02] backdrop-blur-md"
  );

  return (
    <header className="sticky top-0 z-50 w-full px-3 pt-3 sm:px-5">
      {/* How far down the page you are: a thin beam along the very top. */}
      <div
        ref={progressRef}
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[2px] origin-left bg-gradient-to-r from-accent-deep via-accent to-[#f1fcd6] shadow-[0_0_12px_var(--accent)]"
        style={{ transform: "scaleX(var(--progress, 0))" }}
      />

      <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-3">
        {/* Left: the name and the way round the site. */}
        <div className={cn(bar, "gap-1 pr-1.5 pl-3.5")}>
          <Link href="/" aria-label="Litdeck home" className="mr-2 shrink-0">
            <LitdeckLogo size="sm" />
          </Link>
          <span aria-hidden className="mr-1 hidden h-5 w-px bg-white/10 lg:block" />
          <DesktopNav />
        </div>

        {/* Right: the download. */}
        <div className={cn(bar, "gap-1.5 px-1.5")}>
          <Button href={downloadHref(platform)} variant="light" size="md" className="h-9 rounded-xl px-3.5 text-[14px]">
            Download
          </Button>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
            className="flex size-9 flex-col items-center justify-center gap-[5px] rounded-xl hover:bg-white/[0.06] lg:hidden"
          >
            <span className="h-px w-4 bg-foreground" />
            <span className="h-px w-4 bg-foreground" />
          </button>
        </div>
      </div>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}

/**
 * The links, with a soft pill that glides to whichever one you point at, and
 * a Product panel that previews what each part of Litdeck does.
 */
function DesktopNav() {
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const [productOpen, setProductOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pointAt = useCallback((el: HTMLElement) => {
    const nav = navRef.current;
    if (!nav) return;
    const a = el.getBoundingClientRect();
    const b = nav.getBoundingClientRect();
    setPill({ left: a.left - b.left, width: a.width });
  }, []);

  const openProduct = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setProductOpen(true);
  };
  const closeProductSoon = () => {
    closeTimer.current = setTimeout(() => setProductOpen(false), 140);
  };

  const item =
    "relative z-10 flex h-9 items-center gap-1 rounded-xl px-3 text-[14px] text-muted-foreground transition-colors hover:text-foreground";

  return (
    <nav
      ref={navRef}
      aria-label="Primary"
      className="relative hidden items-center lg:flex"
      onMouseLeave={() => {
        setPill(null);
        closeProductSoon();
      }}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 h-9 -translate-y-1/2 rounded-xl bg-white/[0.07] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          pill ? "opacity-100" : "opacity-0"
        )}
        style={pill ? { left: pill.left, width: pill.width } : undefined}
      />

      <div className="relative" onMouseEnter={openProduct} onMouseLeave={closeProductSoon}>
        <button
          type="button"
          aria-expanded={productOpen}
          aria-haspopup="true"
          onMouseEnter={(e) => pointAt(e.currentTarget)}
          onFocus={(e) => {
            pointAt(e.currentTarget);
            openProduct();
          }}
          onClick={() => setProductOpen((v) => !v)}
          className={cn(item, productOpen && "text-foreground")}
        >
          Product
          <IconChevronDown
            size={14}
            stroke={2}
            aria-hidden
            className={cn("transition-transform duration-300", productOpen && "rotate-180")}
          />
        </button>
        <ProductPanel open={productOpen} onNavigate={() => setProductOpen(false)} />
      </div>

      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          onMouseEnter={(e) => pointAt(e.currentTarget)}
          onFocus={(e) => pointAt(e.currentTarget)}
          className={item}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

function ProductPanel({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const [active, setActive] = useState<Preview>("songs");
  return (
    <div
      className={cn(
        "absolute top-full left-0 w-[640px] pt-3 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"
      )}
    >
      <div className="grid grid-cols-[1fr_250px] gap-2 rounded-2xl border border-white/10 bg-[#0b0c0e] p-2 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.95)] backdrop-blur-xl">
        <ul className="flex flex-col gap-0.5 p-1">
          {PRODUCT.map((f) => (
            <li key={f.title}>
              <Link
                href={f.href}
                onClick={onNavigate}
                onMouseEnter={() => setActive(f.preview)}
                onFocus={() => setActive(f.preview)}
                className={cn(
                  "group flex items-center gap-3 rounded-xl p-2.5 transition-colors",
                  active === f.preview ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
                    active === f.preview
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-white/10 text-muted-foreground"
                  )}
                >
                  <f.icon size={18} stroke={1.75} aria-hidden />
                </span>
                <span className="flex flex-col">
                  <span className="text-[14px] text-foreground">{f.title}</span>
                  <span className="text-[13px] text-subtle-foreground">{f.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-black/40" aria-hidden>
          <PanelPreview kind={active} />
        </div>
      </div>
    </div>
  );
}

/** A tiny live picture of each part of Litdeck, for the Product panel. */
function PanelPreview({ kind }: { kind: Preview }) {
  return (
    <div key={kind} className="animate-[preview-in_400ms_cubic-bezier(0.22,1,0.36,1)] absolute inset-0 flex flex-col p-4">
      <span className="font-mono text-[10px] tracking-[0.14em] text-subtle-foreground uppercase">
        {kind === "listen" && "Detected · Reference"}
        {kind === "songs" && "Live · Song"}
        {kind === "order" && "Running order"}
        {kind === "screens" && "Outputs · 3"}
      </span>
      <div className="mt-3 flex flex-1 flex-col justify-center">
        {kind === "listen" && (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] leading-5 text-muted-foreground">
              &ldquo;&hellip;Paul tells the <span className="rounded bg-accent/15 px-0.5 text-accent">Romans in chapter eight, verse twenty-eight</span>&hellip;&rdquo;
            </p>
            <div className="rounded-lg border border-accent/30 bg-accent/[0.06] px-3 py-2">
              <span className="text-[13px] font-medium text-foreground">Romans 8:28</span>
            </div>
          </div>
        )}
        {kind === "songs" && (
          <div className="motion-bg flex aspect-video flex-col items-center justify-center rounded-lg px-3 text-center font-display text-[13px] leading-tight font-semibold text-white">
            Leave the lights on,
            <br />
            sing it back to me
          </div>
        )}
        {kind === "order" && (
          <ol className="flex flex-col gap-1 text-[12px]">
            {["Doors open", "Keynote", "Encore", "Sponsor reel"].map((t, i) => (
              <li
                key={t}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5",
                  i === 1 ? "bg-accent/10 text-foreground" : "text-muted-foreground"
                )}
              >
                <span className="font-mono text-[10px] text-subtle-foreground">0{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
        )}
        {kind === "screens" && (
          <div className="flex flex-col gap-2 font-mono text-[11px] text-muted-foreground">
            {["Main projector", "Confidence", "NDI → OBS"].map((s) => (
              <span key={s} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const MOBILE_LINKS = [
  { href: "/#product", label: "The app" },
  { href: "/#uses", label: "Use cases" },
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/docs", label: "Docs" },
] as const;

/** Phones: the whole screen becomes the menu, numbered like channels. */
function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const platform = usePlatform();
  return (
    <div
      id="mobile-nav"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className={cn(
        "fixed inset-0 z-[70] flex flex-col bg-[#07080a]/[0.97] backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden",
        open ? "visible opacity-100" : "invisible opacity-0"
      )}
    >
      <div className="beam h-[520px] opacity-60" aria-hidden />
      <div className="relative flex h-[68px] items-center justify-between px-6 pt-3">
        <LitdeckLogo size="sm" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="flex size-10 items-center justify-center rounded-xl border border-white/10 text-foreground"
        >
          <IconX size={18} />
        </button>
      </div>

      <nav aria-label="Mobile" className="relative mt-8 flex flex-col px-6">
        <span className="mb-3 font-mono text-[11px] tracking-[0.14em] text-subtle-foreground uppercase">[ Menu ]</span>
        {MOBILE_LINKS.map((l, i) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={onClose}
            className={cn(
              "group flex items-center gap-4 border-b border-white/[0.07] py-4 transition-all duration-500",
              open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
            )}
            style={{ transitionDelay: open ? `${80 + i * 50}ms` : "0ms" }}
          >
            <span className="font-mono text-[12px] text-accent tabular-nums">0{i + 1}</span>
            <span className="flex-1 font-display text-[34px] leading-none font-bold tracking-[-0.04em] text-foreground">
              {l.label}
            </span>
            <IconArrowUpRight size={20} className="text-subtle-foreground transition-colors group-hover:text-accent" />
          </Link>
        ))}
      </nav>

      <div className="relative mt-auto flex flex-col gap-3 px-6 pb-8">
        <Button href={downloadHref(platform)} variant="light" size="lg" className="justify-center">
          Download Litdeck
        </Button>
      </div>
    </div>
  );
}


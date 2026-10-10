import Link from "next/link";
import {
  IconBrandApple,
  IconBrandUbuntu,
  IconBrandWindows,
} from "@tabler/icons-react";
import { Container } from "../ui/container";
import { LitdeckLogo } from "../ui/litdeck-logo";
import { SITE } from "../../_lib/site";
import { FooterGlow } from "./footer-glow";

const GROUPS = [
  {
    heading: "Product",
    links: [
      { label: "The app", href: "/#product" },
      { label: "Use cases", href: "/#uses" },
      { label: "Features", href: "/#features" },
      { label: "How it works", href: "/#how" },
      { label: "Download", href: "/#download" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Getting started", href: "/docs/getting-started/installation" },
    ],
  },
];

/** The footer every marketing page shares. */
export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-border pt-20 lg:pt-[100px]">
      <Container>
        <div className="grid grid-cols-1 gap-12 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))] md:gap-8">
          <div className="flex flex-col gap-3">
            <LitdeckLogo />
            <p className="max-w-[300px] text-lg leading-6 tracking-[-0.01em] text-muted-foreground">
              Presentation software for any live event.
              Lyrics, slides, video and scripture, on every screen.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-border-strong px-3 py-1 text-[13px] text-muted-foreground">
                <IconBrandWindows size={16} aria-hidden stroke={2} />
                Windows
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-border-strong px-3 py-1 text-[13px] text-muted-foreground">
                <IconBrandApple size={16} aria-hidden stroke={2} />
                macOS
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-border-strong px-3 py-1 text-[13px] text-muted-foreground">
                <IconBrandUbuntu size={16} aria-hidden stroke={2} />
                Linux
              </span>
            </div>
          </div>
          {GROUPS.map((g) => (
            <nav
              key={g.heading}
              aria-label={g.heading}
              className="flex flex-col gap-[10px]"
            >
              <h4 className="text-[15px] leading-6 text-foreground">
                {g.heading}
              </h4>
              <ul className="flex flex-col gap-[10px]">
                {g.links.map((l) => (
                  <li key={l.label}>
                    <FooterLink href={l.href}>
                      {l.label}
                    </FooterLink>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-border pt-8 text-[13px] leading-5 text-subtle-foreground md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} {SITE.legalName}.</p>
        </div>
      </Container>
      <FooterGlow />
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  const className =
    "text-[15px] leading-6 text-muted-foreground transition-colors hover:text-foreground";
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

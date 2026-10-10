import { IconBrandApple, IconBrandUbuntu, IconBrandWindows } from "@tabler/icons-react";
import { Button } from "../ui/button";
import { DownloadButton } from "../ui/download-button";
import { Reveal } from "../ui/reveal";
import { Lit } from "./section-heading";
import { SITE } from "../../_lib/site";

const PLATFORMS = [
  { label: "Windows", href: SITE.downloads.windows, icon: IconBrandWindows },
  { label: "macOS (Apple silicon)", href: SITE.downloads.mac, icon: IconBrandApple },
  { label: "Linux (AppImage)", href: SITE.downloads.linux, icon: IconBrandUbuntu },
] as const;

/** The last word: the beam comes back on, over the download. */
export function DownloadSection() {
  return (
    <section
      id="download"
      aria-labelledby="download-heading"
      className="relative overflow-hidden pt-32 pb-28 lg:pt-44 lg:pb-40"
    >
      <div className="beam h-[760px]" aria-hidden />
      <div aria-hidden className="pointer-events-none absolute top-0 left-1/2 h-2 w-32 -translate-x-1/2 rounded-full bg-[#f3fde0] blur-md" />
      <Reveal className="relative mx-auto flex max-w-[900px] flex-col items-center px-5 text-center sm:px-8">
        <h2
          id="download-heading"
          className="font-display text-[60px] leading-[0.88] font-extrabold tracking-[-0.045em] text-foreground sm:text-[100px] lg:text-[136px]"
        >
          Ready when <Lit>you are.</Lit>
        </h2>
        <p className="mt-6 max-w-[520px] text-lg leading-7 text-muted-foreground">
          Download Litdeck and have your first show lined up before the coffee&apos;s cold.
        </p>
        <div className="mt-9">
          <DownloadButton size="lg" />
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {PLATFORMS.map((p) => (
            <Button key={p.label} href={p.href} variant="ghost" size="md" className="bg-black/30 backdrop-blur-md">
              <p.icon size={16} aria-hidden stroke={1.75} />
              {p.label}
            </Button>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

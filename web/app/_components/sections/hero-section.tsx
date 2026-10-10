import { IconArrowDown, IconBrandApple, IconBrandUbuntu, IconBrandWindows } from "@tabler/icons-react";
import { Button } from "../ui/button";
import { DownloadButton } from "../ui/download-button";
import { AppShowcase } from "./showcase-section";

/**
 * The stage at dusk: a rounded sky card, deep blue at the top and glowing at
 * the horizon, with the headline in white serif and the real app floating in
 * it as a frosted window.
 */
export function HeroSection() {
  return (
    <section id="top" aria-label="Litdeck introduction" className="relative -mt-[60px] px-2 pt-2 sm:px-3 sm:pt-3">
      <div className="theme-dark dusk relative overflow-hidden rounded-[28px] sm:rounded-[36px]">
        {/* The horizon glow, breathing slowly. */}
        <div aria-hidden className="dusk-sun pointer-events-none absolute inset-x-0 bottom-0 h-[70%]" />
        <div aria-hidden className="dusk-grain pointer-events-none absolute inset-0" />

        <div className="relative mx-auto flex w-full max-w-[1180px] flex-col items-center px-5 pt-36 pb-16 text-center sm:px-8 md:pt-44 md:pb-24">
          <a
            href="#download"
            className="inline-flex items-center gap-2.5 rounded-full border border-white/20 bg-white/10 py-1 pr-3.5 pl-1 text-[13px] text-white/85 backdrop-blur-md transition-colors hover:bg-white/15"
          >
            <span className="rounded-full bg-white px-2 py-0.5 text-[12px] font-medium text-[#0d0e12]">New</span>
            <span className="sm:hidden">Live presentation</span>
            <span className="hidden sm:inline">Live presentation for Windows, macOS and Linux</span>
          </a>

          <h1 className="mt-8 font-serif text-[64px] leading-[0.92] font-normal tracking-[-0.03em] text-white sm:text-[96px] md:text-[124px] lg:text-[148px]">
            Run the <em className="italic">show.</em>
          </h1>

          <p className="mt-6 max-w-[620px] text-pretty text-lg leading-7 text-white/80 md:text-xl md:leading-8">
            Lyrics, slides, videos, scripture and announcements on every screen in the room and out to the
            stream. One app for whoever&apos;s running it: a service, a conference, a classroom or a
            Friday-night gig.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <DownloadButton size="lg" />
            <Button href="#product" variant="ghost" size="lg" className="border-white/25 bg-white/5 backdrop-blur-md">
              See it in action
              <IconArrowDown size={16} aria-hidden stroke={2} />
            </Button>
          </div>
          <p className="mt-4 flex items-center gap-3 text-[13px] text-white/60">
            <IconBrandWindows size={14} aria-label="Windows" />
            <IconBrandApple size={14} aria-label="macOS" />
            <IconBrandUbuntu size={14} aria-label="Linux" />
            <span>Windows, macOS and Linux</span>
          </p>

          <div className="mt-16 w-full md:mt-20">
            <AppShowcase />
          </div>
        </div>
      </div>
    </section>
  );
}

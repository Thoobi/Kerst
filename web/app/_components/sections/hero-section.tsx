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

          <h1 className="font-serif text-[64px] leading-[0.92] font-normal tracking-[-0.03em] text-white sm:text-[96px] md:text-[124px] lg:text-[148px]">
            {/* Each word comes out of the blur a beat after the last. */}
            <span className="blur-in inline-block" style={{ "--blur-delay": "100ms" } as React.CSSProperties}>Run</span>{" "}
            <span className="blur-in inline-block" style={{ "--blur-delay": "220ms" } as React.CSSProperties}>the</span>{" "}
            <em className="blur-in inline-block italic" style={{ "--blur-delay": "360ms" } as React.CSSProperties}>show.</em>
          </h1>

          <p
            className="blur-in mt-6 max-w-[620px] text-pretty text-lg leading-7 text-white/80 md:text-xl md:leading-8"
            style={{ "--blur-delay": "560ms" } as React.CSSProperties}
          >
            Lyrics, slides, videos, scripture and announcements on every screen in the room and out to the
            stream. One app for whoever&apos;s running it: a service, a conference, a classroom or a
            Friday-night gig.
          </p>

          <div
            className="blur-in mt-9 flex flex-wrap items-center justify-center gap-3"
            style={{ "--blur-delay": "720ms" } as React.CSSProperties}
          >
            <DownloadButton size="lg" />
            <Button href="#product" variant="ghost" size="lg" className="border-white/25 bg-white/5 backdrop-blur-md">
              See it in action
              <IconArrowDown size={16} aria-hidden stroke={2} />
            </Button>
          </div>
          <p
            className="blur-in mt-4 flex items-center gap-3 text-[13px] text-white/60"
            style={{ "--blur-delay": "820ms" } as React.CSSProperties}
          >
            <IconBrandWindows size={14} aria-label="Windows" />
            <IconBrandApple size={14} aria-label="macOS" />
            <IconBrandUbuntu size={14} aria-label="Linux" />
            <span>Windows, macOS and Linux</span>
          </p>

          <div className="blur-in mt-16 w-full md:mt-20" style={{ "--blur-delay": "950ms" } as React.CSSProperties}>
            <AppShowcase />
          </div>
        </div>
      </div>
    </section>
  );
}

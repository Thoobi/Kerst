import { IconArrowDown, IconBrandApple, IconBrandUbuntu, IconBrandWindows } from "@tabler/icons-react";
import { Button } from "../ui/button";
import { DownloadButton } from "../ui/download-button";
import { Lit } from "./section-heading";

/** Dust in the beam: fixed positions so server and client agree. */
const MOTES = [
  { left: "44%", top: "8%", x: "18px", y: "160px", d: "13s", delay: "0s", o: 0.8 },
  { left: "52%", top: "14%", x: "-24px", y: "190px", d: "16s", delay: "-4s", o: 0.6 },
  { left: "48%", top: "22%", x: "30px", y: "150px", d: "12s", delay: "-8s", o: 0.7 },
  { left: "56%", top: "6%", x: "-14px", y: "220px", d: "18s", delay: "-2s", o: 0.5 },
  { left: "40%", top: "30%", x: "22px", y: "130px", d: "15s", delay: "-11s", o: 0.6 },
  { left: "59%", top: "26%", x: "-30px", y: "170px", d: "14s", delay: "-6s", o: 0.7 },
  { left: "46%", top: "38%", x: "12px", y: "120px", d: "11s", delay: "-3s", o: 0.5 },
  { left: "54%", top: "34%", x: "-10px", y: "140px", d: "17s", delay: "-9s", o: 0.6 },
  { left: "36%", top: "18%", x: "26px", y: "200px", d: "19s", delay: "-13s", o: 0.4 },
  { left: "63%", top: "16%", x: "-26px", y: "180px", d: "16s", delay: "-7s", o: 0.4 },
] as const;

export function HeroSection() {
  return (
    <section
      id="top"
      aria-label="Litdeck introduction"
      className="relative -mt-[60px] overflow-hidden pt-[60px]"
    >
      <div className="beam h-[780px]" aria-hidden />
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {MOTES.map((m, i) => (
          <span
            key={i}
            className="mote"
            style={
              {
                left: m.left,
                top: m.top,
                "--mote-x": m.x,
                "--mote-y": m.y,
                "--mote-duration": m.d,
                "--mote-delay": m.delay,
                "--mote-opacity": m.o,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      {/* The lens the beam comes from. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 h-3 w-40 -translate-x-1/2 rounded-full bg-[#f3fde0] blur-md"
      />

      <div className="relative mx-auto flex w-full max-w-[1240px] flex-col items-center px-5 pt-16 pb-10 text-center sm:px-8 md:pt-24 md:pb-16">
        <a
          href="#download"
          className="group inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-black/30 py-1 pr-3.5 pl-1 font-mono text-[11px] tracking-[0.12em] whitespace-nowrap text-muted-foreground uppercase backdrop-blur-md transition-colors hover:text-foreground"
        >
          <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-[#0f1402]">New</span>
          <span className="sm:hidden">Live presentation</span>
          <span className="hidden sm:inline">Live presentation · Windows · macOS · Linux</span>
        </a>

        <h1 className="mt-8 font-display text-[60px] leading-[0.9] font-extrabold tracking-[-0.045em] text-foreground sm:text-[100px] md:text-[128px] lg:text-[156px]">
          Run the
          <br />
          <Lit>show.</Lit>
        </h1>

        <p className="mt-7 max-w-[640px] text-pretty text-lg leading-7 text-muted-foreground md:text-xl md:leading-8">
          Lyrics, slides, videos, scripture and announcements on every screen in
          the room and out to the stream. One app for whoever&apos;s running
          it: a service, a conference, a classroom or a Friday-night gig.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <DownloadButton size="lg" />
          <Button href="#product" variant="ghost" size="lg">
            See the app
            <IconArrowDown size={16} aria-hidden stroke={2} />
          </Button>
        </div>
        <p className="mt-4 flex items-center gap-3 text-[13px] text-subtle-foreground">
          <IconBrandWindows size={14} aria-label="Windows" />
          <IconBrandApple size={14} aria-label="macOS" />
          <IconBrandUbuntu size={14} aria-label="Linux" />
          <span>Windows, macOS and Linux</span>
        </p>

      </div>
    </section>
  );
}

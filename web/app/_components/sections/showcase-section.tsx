"use client";

import { useState } from "react";
import {
  IconAdjustmentsHorizontal,
  IconBook2,
  IconBroadcast,
  IconLayoutDashboard,
  IconMusic,
  IconDeviceRemote,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { cn } from "../../_lib/utils";
import { Reveal } from "../ui/reveal";
import { Lit, SectionHeading } from "./section-heading";

type Shot = {
  id: string;
  label: string;
  icon: TablerIcon;
  src: string;
  alt: string;
  caption: string;
  /** Dialog captures are narrower than the full window, so they sit centred. */
  narrow?: boolean;
};

const SHOTS: ReadonlyArray<Shot> = [
  {
    id: "run",
    label: "Run the show",
    icon: IconLayoutDashboard,
    src: "/screens/texts.webp",
    alt: "Litdeck with an evening event's running order on the right and its welcome slide on air in Preview and Live",
    caption: "The running order on the right, Preview and Live up top, and whatever you're working on underneath. Click a slide and it's on air.",
  },
  {
    id: "lyrics",
    label: "Lyrics",
    icon: IconMusic,
    src: "/screens/songs.webp",
    alt: "The Songs tab with a hymn split into slides, the first verse on air, and the song style controls beside it",
    caption: "Songs split into slides you can see at a glance. Style the words right beside them and watch Preview and Live change as you go.",
  },
  {
    id: "scripture",
    label: "Scripture",
    icon: IconBook2,
    src: "/screens/listen.webp",
    alt: "Litdeck listening to a talk, with the transcript on the left, Psalm 23 on air and detected verses on the right",
    caption: "Optional, for worship teams: Litdeck listens to the speaker and has each Bible verse ready the moment it's mentioned.",
  },
  {
    id: "design",
    label: "Design",
    icon: IconAdjustmentsHorizontal,
    src: "/screens/designer.webp",
    alt: "The theme designer with a 1920 by 1080 canvas, the theme library and text properties",
    caption: "Build your look on a full-size canvas: fonts, colours, backgrounds and layout, saved as themes you can share.",
  },
  {
    id: "outputs",
    label: "Outputs",
    icon: IconBroadcast,
    src: "/screens/output-ndi.webp",
    alt: "Broadcast settings for an output sent as an NDI feed with resolution, frame rate and alpha options",
    caption: "Every projector, confidence monitor and NDI feed gets its own theme. Send keyable graphics straight into OBS or vMix.",
    narrow: true,
  },
  {
    id: "remote",
    label: "Remote",
    icon: IconDeviceRemote,
    src: "/screens/remote.webp",
    alt: "Remote control settings with OSC and HTTP listeners running and a log of incoming commands",
    caption: "Drive it from a Stream Deck, Companion, TouchOSC or your own scripts over OSC and HTTP.",
    narrow: true,
  },
];

/** The real app, one tab per job. */
export function ShowcaseSection() {
  const [active, setActive] = useState(SHOTS[0].id);
  const shot = SHOTS.find((s) => s.id === active) ?? SHOTS[0];

  return (
    <section id="product" aria-labelledby="product-heading" className="relative py-20 lg:py-28">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-12 px-5 sm:px-8 lg:gap-16">
        <Reveal>
          <SectionHeading
            id="product-heading"
            index="01"
            eyebrow="The app"
            align="center"
            className="mx-auto"
            subtitle="What you see below is Litdeck itself, not a mock-up. One window for the whole show, built for the volunteers and crews who run it."
          >
            One window. <Lit>Every screen.</Lit>
          </SectionHeading>
        </Reveal>

        <Reveal className="flex flex-col items-center gap-6">
          <div
            role="tablist"
            aria-label="Parts of the app"
            className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-border bg-black/40 p-1 backdrop-blur-md [scrollbar-width:none]"
          >
            {SHOTS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                id={`shot-tab-${s.id}`}
                aria-selected={s.id === active}
                aria-controls="shot-panel"
                onClick={() => setActive(s.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-[14px] whitespace-nowrap transition-colors",
                  s.id === active
                    ? "bg-white/[0.08] text-foreground shadow-[inset_0_0_0_1px_rgba(198,244,50,0.35)]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <s.icon size={16} stroke={1.75} aria-hidden className={s.id === active ? "text-accent" : undefined} />
                {s.label}
              </button>
            ))}
          </div>

          <figure
            id="shot-panel"
            role="tabpanel"
            aria-labelledby={`shot-tab-${shot.id}`}
            className="relative w-full"
          >
            <div className="rounded-[20px] border border-white/10 bg-[#0c0d0f]/80 p-1.5 shadow-[0_0_0_1px_rgba(214,248,120,0.06),0_0_140px_-30px_rgba(198,244,50,0.3),0_60px_120px_-40px_rgba(0,0,0,0.9)] md:p-2">
              {/* Window chrome, so it reads as the desktop app it is. */}
              <div className="flex items-center gap-1.5 px-2.5 pt-1 pb-2">
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="ml-3 font-mono text-[11px] tracking-[0.1em] text-subtle-foreground uppercase">Litdeck · {shot.label}</span>
              </div>
              <div className="relative aspect-[1508/949] w-full overflow-hidden rounded-xl bg-[#0b0b0d]">
                {SHOTS.map((s) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={s.id}
                    src={s.src}
                    alt={s.id === shot.id ? s.alt : ""}
                    aria-hidden={s.id !== shot.id || undefined}
                    loading={s.id === SHOTS[0].id ? "eager" : "lazy"}
                    className={cn(
                      "absolute inset-0 m-auto transition-opacity duration-500",
                      s.narrow ? "h-[92%] w-auto max-w-[92%] rounded-xl object-contain" : "size-full object-cover object-top",
                      s.id === shot.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                ))}
              </div>
            </div>
            <figcaption className="mx-auto mt-6 max-w-[640px] text-center text-[16px] leading-7 text-muted-foreground">
              {shot.caption}
            </figcaption>
            {/* Light spilling onto the floor below the screen. */}
            <div className="pointer-events-none absolute -bottom-10 left-1/2 -z-10 h-32 w-[80%] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(closest-side,rgba(198,244,50,0.16),transparent)] blur-2xl" />
          </figure>
        </Reveal>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { IconBook2, IconEar, IconHandClick, IconMicrophone } from "@tabler/icons-react";
import { Reveal } from "../ui/reveal";
import { Lit, SectionHeading } from "./section-heading";
import { cn } from "../../_lib/utils";

type Moment = {
  /** What the pastor says, word by word. */
  words: string[];
  /** Which words (by index) Litdeck picks up on. */
  match: [number, number];
  how: "Reference" | "Quotation";
  reference: string;
  verse: string;
};

const MOMENTS: Moment[] = [
  {
    words: "Church, hold on to this. Paul tells the Romans in chapter eight, verse twenty-eight, that all things work together for good.".split(" "),
    match: [8, 13],
    how: "Reference",
    reference: "Romans 8:28",
    verse:
      "And we know that all things work together for good to them that love God, to them who are the called according to his purpose.",
  },
  {
    words: "And why does He bother with us at all? Because God so loved the world that He gave His only Son.".split(" "),
    match: [10, 20],
    how: "Quotation",
    reference: "John 3:16",
    verse:
      "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
  },
];

const WORD_MS = 190;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function useReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_MOTION);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false
  );
}

/** Plays the moments in turn while the section is on screen. */
function useMoments(active: boolean) {
  const reduced = useReducedMotion();
  const [moment, setMoment] = useState(0);
  const [spoken, setSpoken] = useState(0);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!active || reduced) return;
    const current = MOMENTS[moment];
    if (spoken < current.words.length) {
      const t = setTimeout(() => setSpoken((n) => n + 1), WORD_MS);
      return () => clearTimeout(t);
    }
    if (!live) {
      const t = setTimeout(() => setLive(true), 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setMoment((m) => (m + 1) % MOMENTS.length);
      setSpoken(0);
      setLive(false);
    }, 3600);
    return () => clearTimeout(t);
  }, [active, reduced, moment, spoken, live]);

  const current = MOMENTS[moment];
  // Without motion, show the first find, finished and live.
  if (reduced) return { current, spoken: current.words.length, detected: true, live: true };
  const detected = spoken > current.match[1];
  return { current, spoken, detected, live };
}

export function ListenSection() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { threshold: 0.3 });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const { current, spoken, detected, live } = useMoments(active);

  return (
    <section id="listen" aria-labelledby="listen-heading" className="relative py-20 lg:py-28">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-14 px-5 sm:px-8 lg:gap-20">
        <Reveal>
          <SectionHeading
            id="listen-heading"
            index="04"
            eyebrow="Optional · For worship teams"
            align="center"
            subtitle="Turn on listening and Litdeck follows the speaker. Give a Bible reference, or simply quote a verse, and it finds the passage and gets it ready for the screen. Not that kind of event? Leave it off; nothing else depends on it."
          >
            Say the verse. <Lit>It&apos;s already there.</Lit>
          </SectionHeading>
        </Reveal>

        <Reveal>
          <div
            ref={ref}
            className="lit-card grid overflow-hidden rounded-3xl md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
            aria-hidden
          >
            {/* The pulpit microphone. */}
            <div className="flex min-h-[300px] flex-col gap-6 border-b border-border p-6 md:border-r md:border-b-0 md:p-9">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
                  <IconMicrophone size={16} stroke={1.75} />
                  Input · Stage mic
                </span>
                <span className="flex h-4 items-end gap-[3px]">
                  {[0.9, 0.5, 1.2, 0.7, 1, 0.6].map((d, i) => (
                    <span
                      key={i}
                      className="level-bar w-[3px] rounded-full bg-accent"
                      style={{ height: "100%", animationDuration: `${d}s`, animationDelay: `${-i * 0.17}s` }}
                    />
                  ))}
                </span>
              </div>
              <p className="font-display text-[26px] leading-[1.2] font-medium tracking-[-0.03em] text-foreground/30 md:text-[34px]">
                {current.words.map((w, i) => {
                  const said = i < spoken;
                  const inMatch = i >= current.match[0] && i <= current.match[1];
                  return (
                    <span
                      key={`${current.reference}-${i}`}
                      className={cn(
                        "transition-colors duration-300",
                        said && "text-foreground",
                        said && inMatch && detected && "rounded bg-accent/15 text-accent"
                      )}
                    >
                      {w}{" "}
                    </span>
                  );
                })}
                <span className="ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-[0.1em] animate-pulse bg-accent" />
              </p>
            </div>

            {/* What the operator sees: the find, then the screen. */}
            <div className="flex flex-col gap-5 bg-black/20 p-6 md:p-9">
              <div
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-500",
                  detected ? "border-accent/40 bg-accent/[0.07] opacity-100" : "translate-y-2 border-border opacity-0"
                )}
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <IconBook2 size={18} stroke={1.75} />
                </span>
                <span className="flex flex-col">
                  <span className="text-[15px] font-medium text-foreground">{current.reference}</span>
                  <span className="text-[12px] text-muted-foreground">Found from a {current.how.toLowerCase()}</span>
                </span>
                <span
                  className={cn(
                    "ml-auto rounded-[4px] px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider uppercase transition-colors duration-300",
                    live ? "bg-red-500/90 text-white" : "bg-white/10 text-muted-foreground"
                  )}
                >
                  {live ? "Live" : "Ready"}
                </span>
              </div>

              <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(80%_70%_at_50%_40%,#16200a_0%,#070906_80%)]">
                <div
                  className={cn(
                    "absolute inset-0 flex flex-col items-center justify-center gap-3 px-[8%] text-center transition-all duration-700",
                    live ? "opacity-100 blur-0" : "opacity-0 blur-sm"
                  )}
                >
                  <p className="font-display text-[clamp(14px,2.1vw,26px)] leading-[1.2] font-medium tracking-[-0.02em] text-white">{current.verse}</p>
                  <span className="font-mono text-[clamp(9px,1vw,12px)] tracking-[0.2em] text-accent uppercase">
                    {current.reference} · KJV
                  </span>
                </div>
                {!live && (
                  <span className="absolute inset-0 flex items-center justify-center text-[13px] text-subtle-foreground">
                    <span className="font-mono text-[11px] tracking-[0.14em] uppercase">Listening&hellip;</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </Reveal>

        <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
          {[
            {
              icon: IconEar,
              title: "References and quotes",
              body: "“Romans eight twenty-eight” or the verse itself, word for word or close to it.",
            },
            {
              icon: IconHandClick,
              title: "You stay in charge",
              body: "Each find waits in the queue for you to put up, or let it go live on its own.",
            },
            {
              icon: IconMicrophone,
              title: "On your computer, or the cloud",
              body: "Run speech recognition offline with Whisper, or use Deepgram for the sharpest ear.",
            },
          ].map((f, i) => (
            <Reveal key={f.title} delay={i * 90} className="flex flex-col gap-2 bg-background p-6 md:p-8">
              <f.icon size={20} stroke={1.75} className="text-accent" aria-hidden />
              <h3 className="mt-2 text-[17px] font-medium text-foreground">{f.title}</h3>
              <p className="text-[15px] leading-6 text-muted-foreground">{f.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

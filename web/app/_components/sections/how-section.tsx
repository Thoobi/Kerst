import { Reveal } from "../ui/reveal";
import { Lit, SectionHeading } from "./section-heading";

const STEPS = [
  {
    when: "Before",
    title: "Line it up",
    body: "Build the running order: songs, slides, videos, notices and readings. Pick a theme for each screen and check how everything sits in Preview.",
  },
  {
    when: "Showtime",
    title: "Click through",
    body: "Everything goes out to the projectors, the confidence monitor and the stream together, with what's next always beside what's live.",
  },
  {
    when: "Hands free",
    title: "Let it follow",
    body: "Drive it from a Stream Deck, a phone or any OSC or HTTP controller, or turn on listening and let it pick up Bible references as they're spoken.",
  },
] as const;

/** An event with Litdeck, start to finish, along a lit thread. */
export function HowSection() {
  return (
    <section id="how" aria-labelledby="how-heading" className="relative py-20 lg:py-28">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-14 px-5 sm:px-8 lg:gap-20">
        <Reveal>
          <SectionHeading
            id="how-heading"
            index="04"
            eyebrow="How it works"
            subtitle="Do the work ahead of time, so on the day you can watch the room instead of hunting for the next slide."
          >
            Plan ahead. <Lit>Stay calm live.</Lit>
          </SectionHeading>
        </Reveal>

        <ol className="relative grid gap-12 md:grid-cols-3 md:gap-8">
          {/* The thread the steps hang on. */}
          <span
            aria-hidden
            className="absolute top-[22px] right-0 left-0 hidden h-px bg-gradient-to-r from-accent/0 via-accent/60 to-accent/0 md:block"
          />
          <span
            aria-hidden
            className="absolute top-0 bottom-0 left-[22px] w-px bg-gradient-to-b from-accent/60 via-accent/30 to-accent/0 md:hidden"
          />
          {STEPS.map((step, i) => (
            <Reveal key={step.title} as="li" delay={i * 120} className="relative flex gap-6 md:flex-col">
              <span className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-background font-mono text-[15px] text-accent shadow-[0_0_30px_-4px_var(--accent)]">
                {i + 1}
              </span>
              <div className="flex flex-col gap-3">
                <span className="font-mono text-[12px] tracking-[0.12em] text-subtle-foreground uppercase">{step.when}</span>
                <h3 className="font-serif text-[42px] leading-none tracking-[-0.02em] text-foreground">{step.title}</h3>
                <p className="text-[16px] leading-7 text-muted-foreground">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

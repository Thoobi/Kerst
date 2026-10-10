import { IconBrandApple, IconBrandUbuntu, IconBrandWindows } from "@tabler/icons-react";
import { Button } from "../ui/button";
import { Container } from "../ui/container";
import { DownloadButton } from "../ui/download-button";
import { Reveal } from "../ui/reveal";
import { SectionHeading } from "./section-heading";
import { SITE } from "../../_lib/site";

const STEPS = [
  {
    when: "During the week",
    title: "Plan the service",
    body: "Build the running order: the worship set, the readings, the sermon slides, the notices and the video. Give each song its background and check how the words sit on screen.",
  },
  {
    when: "Sunday morning",
    title: "Present everything",
    body: "Click through the order. Lyrics, verses, slides, videos and announcements go out to the projectors and the stream together, with a preview of what's next beside what's live.",
  },
  {
    when: "During the sermon",
    title: "Let Light follow along",
    body: "As the pastor reads or quotes a passage, Light hears it and queues the verse. Put it up yourself, or let it go live on its own.",
  },
] as const;

/**
 * A Sunday with Light, start to finish: how the pieces fit into the day a
 * church actually has, ending in the download.
 */
export function SundaySection() {
  return (
    <section id="sunday" aria-labelledby="sunday-heading" className="border-t border-border py-20 lg:py-28">
      <Container className="flex flex-col gap-12 lg:gap-16">
        <Reveal>
          <SectionHeading
            id="sunday-heading"
            subtitle="Light is built around the day your team already has: plan ahead, run it calmly, and stay with the sermon without hunting for references."
          >
            A Sunday with Light
          </SectionHeading>
        </Reveal>

        <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} as="li" delay={i * 100} className="flex flex-col gap-4 bg-background p-8 md:p-10">
              <span className="flex items-center gap-3 text-[13px] leading-5 text-subtle-foreground">
                <span className="flex size-7 items-center justify-center rounded-full border border-border-strong font-mono text-[13px] text-foreground">
                  {i + 1}
                </span>
                {step.when}
              </span>
              <h3 className="text-2xl font-medium leading-8 tracking-[-0.02em] text-foreground">{step.title}</h3>
              <p className="text-lg leading-7 tracking-[-0.01em] text-muted-foreground">{step.body}</p>
            </Reveal>
          ))}
        </ol>

        <Reveal>
          <div
            id="download"
            className="flex flex-col items-center gap-6 rounded-2xl border border-border-strong px-6 py-14 text-center"
            style={{
              background:
                "radial-gradient(70% 120% at 50% 0%, rgba(0,153,255,0.16) 0%, rgba(0,153,255,0.04) 45%, transparent 75%)",
            }}
          >
            <h3 className="text-balance text-3xl font-medium leading-tight tracking-[-0.03em] text-foreground sm:text-4xl md:text-5xl">
              Ready for this Sunday?
            </h3>
            <p className="max-w-[560px] text-lg leading-7 text-muted-foreground">
              Download Light for free. No account, no subscription, nothing to
              set up online.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <DownloadButton size="lg" />
              <Button href={SITE.repo.releases} variant="ghost" size="lg">
                All downloads
              </Button>
            </div>
            <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px] text-subtle-foreground">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <IconBrandWindows size={14} aria-hidden /> Windows
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <IconBrandApple size={14} aria-hidden /> macOS (Apple silicon)
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <IconBrandUbuntu size={14} aria-hidden /> Linux
              </span>
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

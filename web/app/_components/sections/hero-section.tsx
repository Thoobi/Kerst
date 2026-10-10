import { IconBrandGithub } from "@tabler/icons-react";
import { Button } from "../ui/button";
import { Container } from "../ui/container";
import { DownloadButton } from "../ui/download-button";
import { SITE } from "../../_lib/site";

export function HeroSection({ stars }: { stars: number }) {
  return (
    <section id="top" className="relative overflow-hidden" aria-label="Light introduction">
      <HeroGlow />
      <Container
        as="div"
        className="relative flex flex-col items-center gap-14 py-20 text-center md:py-24 lg:py-28"
      >
        <div className="flex max-w-[880px] flex-col items-center gap-6">
          <p className="rounded-full border border-border-strong px-3 py-1 text-[13px] leading-5 text-muted-foreground">
            Free and open source · Windows, macOS and Linux
          </p>
          <h1 className="text-balance font-medium tracking-[-0.035em] text-foreground text-[44px] leading-[1.05] sm:text-[56px] md:text-[72px] lg:text-[84px] lg:tracking-[-0.05em]">
            <span>Everything your church puts on screen. </span>
            <span className="text-accent">In one free app.</span>
          </h1>
          <p className="max-w-[760px] text-pretty text-base leading-[1.5] text-muted-foreground sm:text-lg md:text-xl lg:text-2xl lg:leading-8">
            Songs over motion backgrounds, scripture, slides, videos and
            announcements, planned in one running order and shown on every
            screen. And while the pastor preaches, Light puts each verse up the
            moment it&apos;s read.
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <DownloadButton size="lg" />
            <Button
              href={SITE.repo.url}
              variant="secondary"
              size="lg"
              aria-label={`Light on GitHub, ${stars} stars`}
            >
              <IconBrandGithub size={18} aria-hidden stroke={2} />
              <span>
                Star on GitHub <span className="text-muted-foreground">• {stars}</span>
              </span>
            </Button>
          </div>
        </div>

        <ScreenPreview />
      </Container>
    </section>
  );
}

/**
 * What the congregation sees: a lyric screen over a motion background, as
 * Light draws it, with the operator's service order beside it.
 */
function ScreenPreview() {
  const order = [
    { kind: "Song", title: "Way Maker", live: true },
    { kind: "Bible", title: "John 3:16" },
    { kind: "Text", title: "Announcements" },
    { kind: "Video", title: "Mission update" },
    { kind: "Song", title: "Goodness of God" },
  ];
  return (
    <div className="w-full max-w-[1080px]" aria-hidden>
      <div className="grid gap-3 rounded-2xl border border-border-strong bg-surface p-3 text-left shadow-[0_40px_120px_-40px_rgba(0,153,255,0.35)] md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="relative aspect-video overflow-hidden rounded-xl">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 20% 110%, #ff7a18 0%, rgba(255,122,24,0.35) 35%, transparent 60%), radial-gradient(90% 80% at 85% -10%, #0099ff 0%, rgba(0,153,255,0.25) 40%, transparent 70%), linear-gradient(160deg, #0b0b12 0%, #12101c 100%)",
            }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center font-medium text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.5)] sm:gap-2">
            <span className="text-[clamp(14px,3.2vw,34px)] leading-tight tracking-[-0.02em]">
              Way maker, miracle worker
            </span>
            <span className="text-[clamp(14px,3.2vw,34px)] leading-tight tracking-[-0.02em]">
              Promise keeper, light in the darkness
            </span>
          </div>
          <span className="absolute right-3 bottom-2 text-[clamp(8px,1vw,11px)] text-white/75">
            Way Maker · Sinach
          </span>
          <span className="absolute top-3 left-3 rounded bg-red-500 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-white uppercase">
            Live
          </span>
        </div>
        <div className="hidden flex-col gap-1 rounded-xl border border-border bg-background/60 p-2 md:flex">
          <span className="px-2 pt-1 pb-2 text-[13px] font-medium text-foreground">Sunday Service</span>
          {order.map((item, i) => (
            <span
              key={item.title}
              className={
                "flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] " +
                (item.live ? "bg-accent/15 text-foreground" : "text-muted-foreground")
              }
            >
              <span className="w-4 text-right font-mono text-[11px] text-subtle-foreground">{i + 1}</span>
              <span className="w-10 text-[11px] text-subtle-foreground">{item.kind}</span>
              <span className="truncate">{item.title}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeroGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-[520px] w-full max-w-[1440px] opacity-60"
      style={{
        background:
          "radial-gradient(60% 50% at 50% 0%, rgba(0,153,255,0.18) 0%, rgba(0,153,255,0.05) 40%, transparent 70%)",
      }}
    />
  );
}

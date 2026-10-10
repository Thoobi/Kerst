import {
  IconArrowLeft,
  IconArrowRight,
  IconBroadcast,
  IconDeviceDesktop,
  IconDeviceTv,
  IconGripVertical,
  IconListNumbers,
  IconMessageCircle,
  IconMovie,
  IconMusic,
  IconPalette,
  IconPresentation,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { Reveal } from "../ui/reveal";
import { Lit, SectionHeading } from "./section-heading";
import { cn } from "../../_lib/utils";

export function FeaturesSection() {
  return (
    <section id="features" aria-labelledby="features-heading" className="relative py-20 lg:py-28">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-14 px-5 sm:px-8 lg:gap-20">
        <Reveal>
          <SectionHeading
            id="features-heading"
            index="03"
            eyebrow="Everything on screen"
            subtitle="One app for the whole show, from the first song to the last notice. No second program for the stream, no juggling windows."
          >
            The whole show. <Lit>One app.</Lit>
          </SectionHeading>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <Tile
            className="md:col-span-4"
            icon={IconMusic}
            title="Songs that fill the screen"
            body="Bring your library from OpenLyrics, SongSelect or ChordPro. Words sit large over looping motion backgrounds, with the credit tucked in the corner."
          >
            <div className="motion-bg relative flex h-full min-h-[220px] flex-col items-center justify-center gap-1 rounded-xl px-6 text-center">
              <p className="font-display text-[clamp(18px,2.6vw,32px)] leading-[1.05] font-semibold tracking-[-0.03em] text-white [text-shadow:0_2px_16px_rgba(0,0,0,0.4)]">
                Leave the lights on, sing it back to me
              </p>
              <p className="font-display text-[clamp(18px,2.6vw,32px)] leading-[1.05] font-semibold tracking-[-0.03em] text-white [text-shadow:0_2px_16px_rgba(0,0,0,0.4)]">
                One more time, as loud as it can be
              </p>
              <span className="absolute right-3 bottom-2 text-[11px] text-white/70">Encore · The House Band</span>
            </div>
          </Tile>

          <Tile
            className="md:col-span-2"
            icon={IconListNumbers}
            title="A running order"
            body="Line the night up. Drag to rearrange, click to bring anything up."
          >
            <ol className="flex flex-col gap-1.5 text-[13px]">
              {[
                ["Text", "Doors open", false],
                ["Slides", "Keynote", true],
                ["Song", "Encore", false],
                ["Video", "Sponsor reel", false],
              ].map(([kind, title, live]) => (
                <li
                  key={title as string}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-2",
                    live ? "border-accent/40 bg-accent/[0.08] text-foreground" : "border-border text-muted-foreground"
                  )}
                >
                  <IconGripVertical size={14} className="text-subtle-foreground" aria-hidden />
                  <span className="w-10 text-[11px] text-subtle-foreground">{kind}</span>
                  <span className="truncate">{title}</span>
                  {live && <span className="ml-auto size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />}
                </li>
              ))}
            </ol>
          </Tile>

          <Tile
            className="md:col-span-2"
            icon={IconPalette}
            title="Style it beside the lyrics"
            body="Size, spacing, alignment and outline, changed right next to the song, and seen in Preview at once."
          >
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-black/30 p-4">
              <Control label="Size" value="96px" fill="62%" />
              <Control label="Line spacing" value="1.20" fill="40%" />
              <div className="flex gap-1.5">
                {["Left", "Centre", "Right"].map((a) => (
                  <span
                    key={a}
                    className={cn(
                      "flex-1 rounded-md py-1 text-center text-[11px]",
                      a === "Centre" ? "bg-white/10 text-foreground" : "text-subtle-foreground"
                    )}
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          </Tile>

          <Tile
            className="md:col-span-2"
            icon={IconMovie}
            title="Video, in step"
            body="Play on every screen at once, in sync, with sound only from the operator's computer."
          >
            <div className="flex flex-col gap-2.5">
              {["Projector", "Side screen", "Stream"].map((s) => (
                <div key={s} className="flex items-center gap-3 text-[12px] text-muted-foreground">
                  <span className="w-20 shrink-0">{s}</span>
                  <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                    <span className="absolute inset-y-0 left-0 w-[58%] rounded-full bg-gradient-to-r from-accent-deep to-accent" />
                  </span>
                  <span className="font-mono text-[11px] text-subtle-foreground">1:42</span>
                </div>
              ))}
            </div>
          </Tile>

          <Tile
            className="md:col-span-2"
            icon={IconMessageCircle}
            title="Announcements"
            body="Write welcomes, schedules and Wi-Fi details straight into Litdeck, and put them up like lyrics."
          >
            <div className="rounded-xl border border-border bg-[linear-gradient(135deg,#0f1a2a_0%,#1d1030_60%,#2b1208_100%)] p-4">
              <span className="font-mono text-[10px] tracking-[0.25em] text-white/60 uppercase">Welcome</span>
              <p className="mt-1 font-display text-[28px] leading-[0.95] font-extrabold tracking-[-0.045em] text-white">We&apos;re glad you&apos;re here</p>
              <p className="mt-2 text-[12px] text-white/70">Grab a drink, find a seat. We start at 7.</p>
            </div>
          </Tile>

          <Tile
            className="md:col-span-3"
            icon={IconBroadcast}
            title="Every screen, and the stream"
            body="Drive projectors and confidence monitors, and send clean, keyable graphics to OBS or vMix over NDI."
          >
            <Outputs />
          </Tile>

          <Tile
            className="md:col-span-3"
            icon={IconPresentation}
            title="Slides"
            body="Import a deck as PDF or images and step through with the arrow keys or a clicker."
          >
            <div className="flex items-center gap-3">
              <kbd className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-strong text-muted-foreground">
                <IconArrowLeft size={14} />
              </kbd>
              <div className="grid flex-1 grid-cols-3 gap-2">
                {["Welcome", "Build it in the open", "Point one"].map((t, i) => (
                  <div
                    key={t}
                    className={cn(
                      "flex aspect-video items-center justify-center rounded-md px-1 text-center font-display text-[clamp(9px,1.1vw,14px)] leading-tight font-bold tracking-[-0.03em]",
                      i === 1
                        ? "bg-[#f3f6ec] text-[#10140a] ring-2 ring-accent ring-offset-2 ring-offset-background"
                        : "bg-white/[0.06] text-muted-foreground"
                    )}
                  >
                    {t}
                  </div>
                ))}
              </div>
              <kbd className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-accent/40 text-accent">
                <IconArrowRight size={14} />
              </kbd>
            </div>
          </Tile>
        </div>
      </div>
    </section>
  );
}

function Tile({
  icon: Icon,
  title,
  body,
  className,
  children,
}: {
  icon: TablerIcon;
  title: string;
  body: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal className={cn("flex", className)}>
      <article className="lit-card group flex w-full flex-col gap-6 overflow-hidden rounded-2xl p-5 transition-colors duration-300 hover:border-border-strong md:p-6">
        <div className="flex-1" aria-hidden>
          {children}
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="flex items-center gap-2 font-display text-[19px] font-semibold tracking-[-0.02em] text-foreground">
            <Icon size={18} stroke={1.75} className="text-accent" aria-hidden />
            {title}
          </h3>
          <p className="text-[15px] leading-6 text-muted-foreground">{body}</p>
        </div>
      </article>
    </Reveal>
  );
}

function Control({ label, value, fill }: { label: string; value: string; fill: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex justify-between text-[11px] text-muted-foreground">
        {label}
        <span className="font-mono text-subtle-foreground">{value}</span>
      </span>
      <span className="relative h-1 rounded-full bg-white/10">
        <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: fill }} />
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-background"
          style={{ left: fill }}
        />
      </span>
    </div>
  );
}

/** One computer feeding the room and the stream. */
function Outputs() {
  const outs: { icon: TablerIcon; label: string }[] = [
    { icon: IconDeviceTv, label: "Main projector" },
    { icon: IconDeviceDesktop, label: "Confidence monitor" },
    { icon: IconBroadcast, label: "NDI to OBS / vMix" },
  ];
  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col items-center gap-2">
        <span className="flex size-14 items-center justify-center rounded-2xl border border-accent/40 bg-accent/10 shadow-[0_0_40px_-8px_var(--accent)]">
          <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
            <path d="M16 3 L25 20 H7 Z" fill="var(--accent)" opacity="0.9" />
            <path d="M16 3 L20.5 20 H11.5 Z" fill="#fff" opacity="0.95" />
            <rect x="4" y="21.5" width="24" height="3" rx="1.5" fill="#fff" />
          </svg>
        </span>
        <span className="text-[11px] text-subtle-foreground">Litdeck</span>
      </div>
      <div className="relative flex flex-1 flex-col gap-2">
        {outs.map((o) => (
          <div key={o.label} className="flex items-center gap-2">
            <span className="h-px flex-1 bg-gradient-to-r from-accent/70 to-accent/10" />
            <span className="flex items-center gap-2 rounded-lg border border-border bg-black/30 px-2.5 py-1.5 text-[12px] text-muted-foreground">
              <o.icon size={14} stroke={1.75} aria-hidden />
              {o.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

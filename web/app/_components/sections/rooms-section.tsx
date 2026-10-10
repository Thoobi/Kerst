import {
  IconBroadcast,
  IconBuildingChurch,
  IconConfetti,
  IconMicrophone2,
  IconPresentation,
  IconSchool,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { Reveal } from "../ui/reveal";
import { Lit, SectionHeading } from "./section-heading";

const ROOMS: ReadonlyArray<{ icon: TablerIcon; title: string; body: string; uses: string }> = [
  {
    icon: IconPresentation,
    title: "Conferences and talks",
    body: "Speaker slides, session titles and sponsor loops, with what's next on the confidence monitor.",
    uses: "Slides · Texts · Video",
  },
  {
    icon: IconMicrophone2,
    title: "Concerts and gigs",
    body: "Lyrics over motion backgrounds for the crowd, clean lower thirds for the stream.",
    uses: "Lyrics · Backgrounds · NDI",
  },
  {
    icon: IconSchool,
    title: "Classrooms and lectures",
    body: "Step through a deck, play a clip in sync on every screen, put the reading up in big type.",
    uses: "Slides · Video · Texts",
  },
  {
    icon: IconBuildingChurch,
    title: "Worship services",
    body: "Songs, readings and notices in one running order, and verses found as they're spoken.",
    uses: "Lyrics · Scripture · Listening",
  },
  {
    icon: IconBroadcast,
    title: "Livestreams",
    body: "Keyable graphics straight into OBS or vMix over NDI, each feed with its own look.",
    uses: "NDI · Themes · Remote",
  },
  {
    icon: IconConfetti,
    title: "Everything else",
    body: "Weddings, quiz nights, community meetings, launch parties. If it has a screen, it fits.",
    uses: "Whatever the night needs",
  },
];

/** Who it's for: anyone with a screen and an audience. */
export function RoomsSection() {
  return (
    <section id="uses" aria-labelledby="uses-heading" className="relative py-20 lg:py-28">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-12 px-5 sm:px-8 lg:gap-16">
        <Reveal>
          <SectionHeading
            id="uses-heading"
            index="02"
            eyebrow="Made for any room"
            subtitle="Litdeck doesn't mind what the occasion is. If there's an audience and a screen, it'll run the show, from a classroom projector to a festival stage."
          >
            Any stage. <Lit>Any crowd.</Lit>
          </SectionHeading>
        </Reveal>

        <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {ROOMS.map((room, i) => (
            <Reveal
              key={room.title}
              as="li"
              delay={(i % 3) * 90}
              className="group relative flex flex-col gap-4 bg-background p-7 transition-colors hover:bg-white/[0.02] md:p-8"
            >
              <span className="flex size-11 items-center justify-center rounded-xl border border-accent/30 bg-accent/[0.06] text-accent shadow-[0_0_30px_-10px_var(--accent)]">
                <room.icon size={22} stroke={1.6} aria-hidden />
              </span>
              <h3 className="font-display text-[26px] leading-tight font-bold tracking-[-0.035em] text-foreground">{room.title}</h3>
              <p className="text-[15px] leading-6 text-muted-foreground">{room.body}</p>
              <span className="mt-auto pt-2 font-mono text-[11px] tracking-[0.12em] text-subtle-foreground uppercase">{room.uses}</span>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

import {
  IconBroadcast,
  IconBook2,
  IconListNumbers,
  IconMessageCircle,
  IconMicrophone2,
  IconMovie,
  IconMusic,
  IconPalette,
  IconPresentation,
} from "@tabler/icons-react";
import { Container } from "../ui/container";
import { FeatureCard } from "../ui/feature-card";
import { Reveal } from "../ui/reveal";
import { SectionHeading } from "./section-heading";

const FEATURES = [
  {
    icon: IconMusic,
    title: "Songs",
    body: "Bring your library from OpenLyrics, SongSelect or ChordPro. Lyrics fill the screen, credits sit quietly in the corner, motion backgrounds loop behind.",
  },
  {
    icon: IconMicrophone2,
    title: "Scripture as it's preached",
    body: "Light listens to the sermon and puts each verse on screen the moment it's read, quoted or cited. Or look one up yourself in a keystroke.",
    accent: true,
  },
  {
    icon: IconListNumbers,
    title: "A running order",
    body: "Line up songs, readings, slides, videos and announcements for the service. Drag to rearrange, click to bring anything up ready to go.",
  },
  {
    icon: IconPresentation,
    title: "Slides",
    body: "Import a deck as PDF or images and step through it with the arrow keys or a presentation clicker.",
  },
  {
    icon: IconMovie,
    title: "Video",
    body: "Play videos on every screen at once, in step, with the sound coming from the operator's computer and nowhere else.",
  },
  {
    icon: IconMessageCircle,
    title: "Announcements",
    body: "Write notices, welcomes and anything else straight into Light, and put them up like lyrics.",
  },
  {
    icon: IconPalette,
    title: "Themes",
    body: "Design how words look on screen, then tweak song size and spacing right beside the lyrics without leaving the service.",
  },
  {
    icon: IconBroadcast,
    title: "Every screen and the stream",
    body: "Drive projectors and confidence monitors, and send clean, keyable graphics to OBS or vMix over NDI.",
  },
  {
    icon: IconBook2,
    title: "Free, open, yours",
    body: "No subscription and no account. Your songs and media stay on your computer, and the code is open for anyone to improve.",
  },
] as const;

export function FeaturesSection() {
  return (
    <section id="features" aria-labelledby="features-heading" className="py-20 lg:py-28">
      <Container className="flex flex-col gap-12 lg:gap-16">
        <Reveal>
          <SectionHeading
            id="features-heading"
            subtitle="One app for the whole service, from the first song to the last announcement, built for the volunteers who run it."
          >
            Everything on screen, <span className="text-accent">handled.</span>
          </SectionHeading>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 80} className="flex">
              <FeatureCard
                icon={f.icon}
                title={f.title}
                body={f.body}
                iconTone={"accent" in f && f.accent ? "accent" : "default"}
              />
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

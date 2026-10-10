import { HeroSection } from "../_components/sections/hero-section";
import { Ribbon } from "../_components/sections/ribbon";
import { ListenSection } from "../_components/sections/listen-section";
import { FeaturesSection } from "../_components/sections/features-section";
import { HowSection } from "../_components/sections/how-section";
import { RoomsSection } from "../_components/sections/rooms-section";
import { DownloadSection } from "../_components/sections/download-section";

export default function Home() {
  return (
    <>
      <HeroSection />
      <Ribbon />
      <RoomsSection />
      <FeaturesSection />
      <ListenSection />
      <HowSection />
      <DownloadSection />
    </>
  );
}

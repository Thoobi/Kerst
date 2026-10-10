import { HeroSection } from "../_components/sections/hero-section";
import { FeaturesSection } from "../_components/sections/features-section";
import { SundaySection } from "../_components/sections/sunday-section";
import { getGitHubStars } from "../_lib/site";

export default async function Home() {
  const stars = await getGitHubStars();
  return (
    <>
      <HeroSection stars={stars} />
      <FeaturesSection />
      <SundaySection />
    </>
  );
}

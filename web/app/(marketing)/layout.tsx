import type { ReactNode } from "react";
import { SmoothScrollProvider } from "../_components/ui/smooth-scroll-provider";
import { SiteHeader } from "../_components/layout/site-header";
import { SiteFooter } from "../_components/layout/site-footer";
import { getGitHubStars } from "../_lib/site";

/** Every marketing page shares the header and footer. */
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const stars = await getGitHubStars();
  return (
    <SmoothScrollProvider>
      <SiteHeader stars={stars} />
      <main>{children}</main>
      <SiteFooter />
    </SmoothScrollProvider>
  );
}

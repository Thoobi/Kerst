import type { ReactNode } from "react";
import { SmoothScrollProvider } from "../_components/ui/smooth-scroll-provider";
import { SiteHeader } from "../_components/layout/site-header";
import { SiteFooter } from "../_components/layout/site-footer";

/** Every marketing page shares the header and footer. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <SmoothScrollProvider>
      <div className="grain">
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </div>
    </SmoothScrollProvider>
  );
}

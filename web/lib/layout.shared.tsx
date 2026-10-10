import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { LitdeckLogo } from "@/app/_components/ui/litdeck-logo";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <LitdeckLogo size="sm" />,
      url: "/",
    },
    links: [
      {
        text: "Home",
        url: "/",
        active: "url",
      },
      {
        text: "Documentation",
        url: "/docs",
        active: "nested-url",
      },
      {
        text: "Download",
        url: "/#download",
      },
    ],
  };
}

import type { Metadata, Viewport } from "next";
import { Google_Sans, Inter, JetBrains_Mono, Unbounded } from "next/font/google";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./globals.css";
import { SITE } from "./_lib/site";
import { StructuredData } from "./_components/seo/structured-data";

// Text: everything that isn't a headline.
const sans = Google_Sans({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-google-sans",
  display: "swap",
});

// Display: Inter for the big, bold words.
const display = Inter({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-inter",
  display: "swap",
});

// Mono: the control-room details (timecodes, labels, ON AIR).
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

// Sign-off: the wide, heavy name lit at the foot of every page.
const signage = Unbounded({
  subsets: ["latin"],
  weight: "800",
  variable: "--font-unbounded",
  display: "swap",
});

const TITLE = `${SITE.name} — Live presentation software`;
const OG_TITLE = `${SITE.name} — ${SITE.tagline}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: TITLE,
    template: `%s — ${SITE.name}`,
  },
  description: SITE.shortDescription,
  applicationName: SITE.name,
  generator: "Next.js",
  referrer: "origin-when-cross-origin",
  keywords: [
    "live presentation software",
    "ProPresenter alternative",
    "lyrics projection",
    "church presentation software",
    "conference stage display",
    "event slides and announcements",
    "NDI overlay",
    "OBS and vMix graphics",
    "Bible verse detection",
    "presentation app for events",
    "Litdeck",
  ],
  authors: [{ name: SITE.legalName, url: SITE.url }],
  creator: SITE.legalName,
  publisher: SITE.legalName,
  category: "Software",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    title: OG_TITLE,
    description: SITE.description,
    siteName: SITE.name,
    url: SITE.url,
    locale: SITE.locale,
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: SITE.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // icon and apple-icon are wired automatically from app/icon.svg and
  // app/apple-icon.tsx — overriding here would suppress Next.js's defaults.
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#07080a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark h-full antialiased ${sans.variable} ${display.variable} ${mono.variable} ${signage.variable}`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <body
        className="min-h-full bg-background text-foreground"
        suppressHydrationWarning
      >
        <StructuredData />
        <RootProvider
          theme={{
            defaultTheme: "dark",
            forcedTheme: "dark",
            enableSystem: false,
          }}
          search={{
            options: {
              type: "static",
            },
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}

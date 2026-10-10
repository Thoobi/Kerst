import { SITE } from "../../_lib/site";

const ORG_ID = `${SITE.url}/#organization`;
const SITE_ID = `${SITE.url}/#website`;
const APP_ID = `${SITE.url}/#software`;

export function StructuredData() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID,
        name: SITE.legalName,
        alternateName: SITE.name,
        url: SITE.url,
        logo: {
          "@type": "ImageObject",
          url: `${SITE.url}/icon.svg`,
          width: 1024,
          height: 1024,
        },
        foundingDate: SITE.founded,
      },
      {
        "@type": "WebSite",
        "@id": SITE_ID,
        url: SITE.url,
        name: SITE.name,
        description: SITE.description,
        inLanguage: "en",
        publisher: { "@id": ORG_ID },
      },
      {
        "@type": "SoftwareApplication",
        "@id": APP_ID,
        name: SITE.name,
        url: SITE.url,
        description: SITE.description,
        applicationCategory: "MultimediaApplication",
        operatingSystem: SITE.operatingSystems.join(", "),
        downloadUrl: SITE.repo.downloadWindows,
        installUrl: `${SITE.url}/#download`,
        softwareVersion: "latest",
        publisher: { "@id": ORG_ID },
        featureList: [
          "Song lyrics with motion backgrounds; imports OpenLyrics, SongSelect and ChordPro",
          "Optional speech listening that finds Bible verses as they are spoken",
          "Remote control over OSC and HTTP for Stream Deck, Companion and TouchOSC",
          "Running order planning for songs, slides, videos, scripture and announcements",
          "PDF and image slide decks",
          "Video playback in step across every screen",
          "Multiple displays and NDI output for OBS Studio and vMix",
        ],
        keywords:
          "presentation software, live event slides, lyrics projection, church presentation software, conference display, NDI, OBS graphics",
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}

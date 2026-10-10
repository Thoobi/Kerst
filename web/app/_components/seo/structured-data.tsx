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
        sameAs: [
          SITE.socials.github,
          SITE.socials.twitter,
          SITE.socials.linkedin,
        ],
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
        installUrl: SITE.repo.releases,
        softwareVersion: "latest",
        license: "https://opensource.org/licenses/MIT",
        isAccessibleForFree: true,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
        },
        publisher: { "@id": ORG_ID },
        featureList: [
          "Song lyrics with motion backgrounds; imports OpenLyrics, SongSelect and ChordPro",
          "Bible verses detected from live sermon audio and shown as they are read",
          "Service order planning for songs, scripture, slides, videos and announcements",
          "PDF and image slide decks",
          "Video playback in step across every screen",
          "Multiple displays and NDI output for OBS Studio and vMix",
          "Free and open source",
        ],
        keywords:
          "church presentation software, worship lyrics, song projection, Bible verse detection, NDI, free church software",
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

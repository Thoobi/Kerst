import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "next/og";
import { SITE } from "./_lib/site";

export const dynamic = "force-static";
export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconSvg = readFileSync(join(__dirname, "icon.svg"), "utf8");
const iconDataUrl = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString("base64")}`;

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(55% 70% at 50% 0%, rgba(214,248,120,0.45) 0%, rgba(198,244,50,0.12) 40%, transparent 72%), #07080a",
          color: "#FFFFFF",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            color: "rgba(255,255,255,0.7)",
            fontSize: 28,
            letterSpacing: "-0.02em",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={iconDataUrl}
            width={56}
            height={56}
            alt=""
            style={{ borderRadius: 12, display: "block" }}
          />
          <span style={{ color: "#FFFFFF", fontWeight: 600 }}>{SITE.name}</span>
          <span>·</span>
          <span>litdeck.space</span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            maxWidth: 1000,
          }}
        >
          <div
            style={{
              fontSize: 88,
              lineHeight: 1.02,
              letterSpacing: "-0.05em",
              fontWeight: 600,
              color: "#FFFFFF",
            }}
          >
            Run the show.
          </div>
          <div
            style={{
              fontSize: 88,
              lineHeight: 1.02,
              letterSpacing: "-0.05em",
              fontWeight: 600,
              color: "#c6f432",
              fontStyle: "italic",
            }}
          >
            Light every screen.
          </div>
          <div
            style={{
              fontSize: 28,
              lineHeight: 1.4,
              color: "rgba(255,255,255,0.7)",
              maxWidth: 880,
              marginTop: 12,
            }}
          >
            Lyrics, slides, videos, scripture and announcements on every
            screen and over NDI.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            color: "rgba(255,255,255,0.6)",
            fontSize: 22,
          }}
        >
          <span
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            Windows · macOS · Linux
          </span>
          <span
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            Windows · macOS · Linux
          </span>
          <span
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            NDI · OBS · vMix
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}

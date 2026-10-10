import { IconBrandApple, IconBrandUbuntu, IconBrandWindows } from "@tabler/icons-react";
import { Button } from "../ui/button";
import { DownloadButton } from "../ui/download-button";
import { Reveal } from "../ui/reveal";
import { LinuxInstall } from "./linux-install";
import { SITE } from "../../_lib/site";

const PLATFORMS = [
  { label: "Windows", href: SITE.downloads.windows, icon: IconBrandWindows },
  { label: "macOS (Apple silicon)", href: SITE.downloads.mac, icon: IconBrandApple },
  { label: "Linux", href: "#linux", icon: IconBrandUbuntu },
] as const;

/** The last word: the dusk sky again, over the download. */
export function DownloadSection() {
  return (
    <section id="download" aria-labelledby="download-heading" className="relative px-2 pt-20 sm:px-3 lg:pt-28">
      <div className="theme-dark dusk relative overflow-hidden rounded-[28px] pt-28 pb-24 sm:rounded-[36px] lg:pt-36 lg:pb-32">
      <div aria-hidden className="dusk-sun pointer-events-none absolute inset-x-0 bottom-0 h-[80%]" />
      <div aria-hidden className="dusk-grain pointer-events-none absolute inset-0" />
      <Reveal className="relative mx-auto flex max-w-[900px] flex-col items-center px-5 text-center sm:px-8">
        <h2
          id="download-heading"
          className="font-serif text-[64px] leading-[0.92] font-normal tracking-[-0.03em] text-white sm:text-[104px] lg:text-[140px]"
        >
          Ready when <em className="italic">you are.</em>
        </h2>
        <p className="mt-6 max-w-[520px] text-lg leading-7 text-white/80">
          Download Litdeck and have your first show lined up before the coffee&apos;s cold.
        </p>
        <div className="mt-9">
          <DownloadButton size="lg" />
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {PLATFORMS.map((p) => (
            <Button key={p.label} href={p.href} variant="ghost" size="md" className="bg-surface backdrop-blur-md">
              <p.icon size={16} aria-hidden stroke={1.75} />
              {p.label}
            </Button>
          ))}
        </div>
        <LinuxInstall className="mt-10 max-w-[760px]" />
      </Reveal>
      </div>
    </section>
  );
}

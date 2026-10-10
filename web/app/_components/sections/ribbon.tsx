import { Isocon, type IsoconName } from "../ui/isocon";

const ITEMS: ReadonlyArray<{ word: string; icon: IsoconName }> = [
  { word: "Lyrics", icon: "groups" },
  { word: "Scripture", icon: "transcribe" },
  { word: "Slides", icon: "stacks" },
  { word: "Video", icon: "pip" },
  { word: "Announcements", icon: "toast" },
  { word: "Running order", icon: "event-list" },
  { word: "Motion backgrounds", icon: "cards" },
  { word: "Every screen", icon: "desktop-landscape" },
  { word: "NDI", icon: "output" },
  { word: "Themes", icon: "diamond" },
];

/** A slow ribbon of everything Litdeck puts on screen, each with its isometric icon. */
export function Ribbon() {
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {ITEMS.map(({ word, icon }, i) => (
        <li key={word} className="flex items-center gap-4 px-7 md:gap-5 md:px-10">
          <Isocon
            name={icon}
            className={"size-11 shrink-0 md:size-14 " + (i % 2 ? "text-foreground/45" : "text-accent")}
          />
          <span
            className={
              "font-serif text-[40px] tracking-[-0.02em] whitespace-nowrap md:text-[56px] " +
              (i % 2 ? "text-subtle-foreground italic" : "text-foreground")
            }
          >
            {word}
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <div
      className="relative overflow-hidden border-y border-border py-7 [mask-image:linear-gradient(90deg,transparent,#000_15%,#000_85%,transparent)]"
      aria-label={ITEMS.map((i) => i.word).join(", ")}
    >
      <div className="marquee">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

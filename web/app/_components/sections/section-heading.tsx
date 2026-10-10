import { cn } from "../../_lib/utils";

/**
 * A control-room label: mono, upper case, with a channel number, like the
 * captions on a vision mixer.
 */
export function Eyebrow({
  children,
  index,
  className,
}: {
  children: React.ReactNode;
  index?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-3 font-mono text-[12px] leading-5 tracking-[0.14em] text-muted-foreground uppercase",
        className
      )}
    >
      {index && (
        <span className="rounded-[4px] border border-accent/40 px-1.5 text-accent tabular-nums">{index}</span>
      )}
      <span className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" aria-hidden />
      {children}
    </span>
  );
}

export function SectionHeading({
  children,
  eyebrow,
  index,
  subtitle,
  className,
  align = "left",
  id,
}: {
  children: React.ReactNode;
  eyebrow?: React.ReactNode;
  index?: string;
  subtitle?: React.ReactNode;
  className?: string;
  align?: "left" | "center";
  id?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6",
        align === "center" ? "items-center text-center" : "items-start",
        className
      )}
    >
      {eyebrow && <Eyebrow index={index}>{eyebrow}</Eyebrow>}
      <h2
        id={id}
        className="max-w-[16ch] text-balance font-serif text-[48px] leading-[0.98] font-normal tracking-[-0.025em] text-foreground sm:text-[64px] lg:text-[88px]"
      >
        {children}
      </h2>
      {subtitle && (
        <p
          className={cn(
            "max-w-[600px] text-pretty text-lg leading-7 text-muted-foreground lg:text-xl lg:leading-8",
            align === "center" && "mx-auto"
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

/** The second voice of a heading: italic, a shade quieter. */
export function Lit({ children }: { children: React.ReactNode }) {
  return <em className="text-subtle-foreground italic">{children}</em>;
}

import { cn } from "../../_lib/utils";

/**
 * Litdeck's mark: a beam of light falling on a screen. Drawn in currentColor
 * with the beam in the accent, so it sits on any background.
 */
export function LitdeckMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <path d="M16 3 L25 20 H7 Z" fill="var(--accent)" opacity="0.9" />
      <path d="M16 3 L20.5 20 H11.5 Z" fill="currentColor" opacity="0.95" />
      <rect x="4" y="21.5" width="24" height="3" rx="1.5" fill="currentColor" />
      <rect x="10" y="26.5" width="12" height="2" rx="1" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

export function LitdeckLogo({
  className,
  wordmarkClassName,
  size = "md",
}: {
  className?: string;
  wordmarkClassName?: string;
  size?: "sm" | "md" | "lg";
}) {
  const iconSize = size === "sm" ? "size-6" : size === "lg" ? "size-10" : "size-[30px]";
  const textSize =
    size === "sm"
      ? "text-lg tracking-[-0.6px] leading-6"
      : size === "lg"
        ? "text-[28px] tracking-[-1px] leading-[36px]"
        : "text-2xl tracking-[-0.8px] leading-[32px]";

  return (
    <span className={cn("inline-flex items-center gap-2 text-foreground", className)}>
      <LitdeckMark className={iconSize} />
      <span className={cn("font-display font-bold tracking-[-0.04em]", textSize, wordmarkClassName)}>Litdeck</span>
    </span>
  );
}

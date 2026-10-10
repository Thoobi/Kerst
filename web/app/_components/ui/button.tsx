import * as React from "react";
import Link from "next/link";
import { cn } from "../../_lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "light";
type Size = "md" | "lg";

type Common = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
};

type AsButton = Common &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size" | "children"> & {
    href?: undefined;
  };

type AsLink = Common &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "size" | "children"> & {
    href: string;
  };

type ButtonProps = AsButton | AsLink;

const base =
  "inline-flex items-center justify-center gap-[10px] rounded-full whitespace-nowrap font-medium tracking-[-0.3px] transition-colors transition-transform duration-200 ease-out will-change-transform hover:-translate-y-[1px] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60";

const sizes: Record<Size, string> = {
  md: "px-[14px] py-[6px] text-[15px] leading-6",
  lg: "px-5 py-[10px] text-[17px] leading-6",
};

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-white/90",
  secondary:
    "bg-surface-strong text-foreground hover:bg-white/25",
  ghost:
    "border border-border-strong bg-transparent text-foreground hover:bg-white/5",
  // Lit from within: the main call to action.
  light:
    "bg-[linear-gradient(180deg,#e4fb9a_0%,var(--accent)_55%,var(--accent-deep)_130%)] text-[#0f1402] shadow-[0_0_0_1px_rgba(214,248,120,0.5),0_8px_30px_-6px_rgba(150,230,60,0.55),inset_0_1px_0_rgba(255,255,255,0.6)] hover:shadow-[0_0_0_1px_rgba(214,248,120,0.7),0_10px_40px_-6px_rgba(150,230,60,0.75),inset_0_1px_0_rgba(255,255,255,0.6)]",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = cn(base, sizes[size], variants[variant], className);

  if ("href" in rest && rest.href) {
    const { href, target, rel, ...anchorRest } = rest as AsLink;
    const isExternal = /^https?:\/\//.test(href);
    if (isExternal) {
      return (
        <a
          href={href}
          target={target ?? "_blank"}
          rel={rel ?? "noopener noreferrer"}
          className={classes}
          {...anchorRest}
        >
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={classes} {...anchorRest}>
        {children}
      </Link>
    );
  }

  const { type = "button", ...buttonRest } = rest as AsButton;
  return (
    <button type={type} className={classes} {...buttonRest}>
      {children}
    </button>
  );
}

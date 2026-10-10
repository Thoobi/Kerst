"use client";

import { useEffect, useRef } from "react";

/**
 * The name at the foot of the page, drawn like an LED wall: a dim grid of
 * pixels in the shape of the letters, and a spotlight that lights them up.
 * The spot follows the pointer while it's over the footer and drifts across
 * on its own otherwise (and on touch screens). Position lives in CSS
 * variables (--mx, --my, --on) set from a rAF loop, so nothing re-renders.
 */
export function FooterGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const set = (x: number, y: number, on: number) => {
      node.style.setProperty("--mx", `${x.toFixed(2)}%`);
      node.style.setProperty("--my", `${y.toFixed(2)}%`);
      node.style.setProperty("--on", on.toFixed(3));
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      set(50, 50, 1);
      return;
    }

    let visible = false;
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;
    // Where the spot is now, eased towards where it wants to be.
    const spot = { x: 50, y: 50, on: 0 };

    const loop = (t: number) => {
      frame = 0;
      if (!visible) return;
      let tx: number;
      let ty: number;
      if (pointer) {
        const r = node.getBoundingClientRect();
        tx = ((pointer.x - r.left) / r.width) * 100;
        ty = ((pointer.y - r.top) / r.height) * 100;
      } else {
        // A slow figure of eight across the wall.
        tx = 50 + 38 * Math.sin(t / 2600);
        ty = 50 + 18 * Math.sin(t / 1300);
      }
      spot.x += (tx - spot.x) * 0.12;
      spot.y += (ty - spot.y) * 0.12;
      spot.on += (1 - spot.on) * 0.04;
      set(spot.x, spot.y, spot.on);
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!frame) frame = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    io.observe(node);

    const footer = node.closest("footer") ?? node;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") pointer = { x: e.clientX, y: e.clientY };
    };
    const onLeave = () => {
      pointer = null;
    };
    footer.addEventListener("pointermove", onMove as EventListener);
    footer.addEventListener("pointerleave", onLeave);

    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      footer.removeEventListener("pointermove", onMove as EventListener);
      footer.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const word =
    "block pt-[0.12em] pb-[0.22em] text-center font-signage text-[17vw] leading-[0.85] tracking-[-0.035em] select-none xl:text-[245px]";
  // One LED every 7px; the dot sits inside its cell like a real panel pixel.
  const pixels = "radial-gradient(circle, currentColor 0 1.6px, transparent 2.1px) 0 0 / 7px 7px";
  const spotMask = "radial-gradient(circle min(26vw, 340px) at var(--mx) var(--my), #000 0%, rgba(0,0,0,0.5) 35%, transparent 70%)";

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none relative mt-6 overflow-hidden pb-[4vh]"
      style={{ "--mx": "50%", "--my": "50%", "--on": 0 } as React.CSSProperties}
    >
      {/* The wall switched off: every pixel there, barely glowing. */}
      <span
        className={word + " bg-clip-text text-transparent [-webkit-text-stroke:1px_rgba(255,255,255,0.06)]"}
        style={{ background: pixels, color: "rgba(255,255,255,0.09)", WebkitBackgroundClip: "text", backgroundClip: "text" }}
      >
        Litdeck
      </span>

      {/* The same pixels, lit where the spot falls. */}
      <span
        className={word + " absolute inset-x-0 top-0 bg-clip-text text-transparent"}
        style={{
          background: `${pixels}, linear-gradient(180deg, rgba(255,236,222,0.38), rgba(155,176,255,0.26) 55%, rgba(193,168,255,0.14))`,
          color: "#dfe6ff",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          opacity: "var(--on)",
          maskImage: spotMask,
          WebkitMaskImage: spotMask,
          filter: "drop-shadow(0 0 14px rgba(120, 145, 255, 0.6))",
        }}
      >
        Litdeck
      </span>

      {/* The spot's spill on the wall behind the letters. */}
      <div
        className="absolute inset-0"
        style={{
          opacity: "calc(var(--on) * 0.9)",
          background:
            "radial-gradient(circle min(22vw, 300px) at var(--mx) var(--my), rgba(110, 135, 255, 0.14), rgba(193, 168, 255, 0.05) 50%, transparent 75%)",
        }}
      />
      {/* The floor line the wall stands on. */}
      <div className="absolute bottom-0 left-1/2 h-px w-[80%] -translate-x-1/2 bg-gradient-to-r from-transparent via-foreground/15 to-transparent" />
    </div>
  );
}

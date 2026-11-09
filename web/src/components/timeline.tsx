"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Plays everything inside once when it scrolls into view, then holds the last frame: elements marked with cue()
 * through the Web Animations API, and SVG (SMIL) animations from their start.
 */
export function Timeline({ duration, children, className = "" }: { duration: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const svgs = [...el.querySelectorAll("svg")];
    const cues = [...el.querySelectorAll<HTMLElement | SVGElement>("[data-at]")];
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const s of svgs) {
      s.pauseAnimations();
      s.setCurrentTime(still ? duration / 1000 : 0);
    }
    const play = () => {
      for (const c of cues) {
        const delay = still ? 0 : Number(c.dataset.at) * duration;
        if (c.dataset.len) {
          c.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
            delay,
            duration: still ? 0 : Number(c.dataset.len) * duration,
            fill: "both",
          });
        } else {
          c.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], {
            delay,
            duration: still ? 0 : 450,
            easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
            fill: "both",
          });
        }
      }
      if (!still) for (const s of svgs) s.unpauseAnimations();
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        play();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [duration]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type { ShowcaseScreen } from "@/lib/showcase";

export function ScreenGallery({ screens, desktop = false, wideAspect, label }: { screens: ShowcaseScreen[]; desktop?: boolean; wideAspect?: string; label: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const step = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + screens.length) % screens.length)), [screens.length]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close, step]);

  const current = open === null ? null : screens[open];

  return (
    <>
      <div
        className={
          desktop
            ? "grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            : "-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 [scrollbar-width:thin]"
        }
      >
        {screens.map((s, i) => {
          const wide = desktop || s.width >= 1200;
          return (
          <button
            key={s.src}
            type="button"
            onClick={() => setOpen(i)}
            className={`group shrink-0 snap-start text-left ${desktop ? "" : wide ? "w-[300px] sm:w-[500px]" : "w-[200px] sm:w-[230px]"}`}
          >
            <div
              className={`overflow-hidden rounded-2xl border border-line bg-panel transition duration-300 group-hover:-translate-y-1 group-hover:border-line-2 ${
                desktop ? (wideAspect ?? "aspect-[1440/1000]") : wide ? "aspect-[300/433] sm:aspect-[500/498]" : "aspect-[390/844]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.thumb ?? s.src} alt={`${label}: ${s.name}`} loading="lazy" className={`size-full object-cover ${wide && !desktop ? "object-left-top" : "object-top"}`} />
            </div>
            <div className="mt-3 flex items-baseline gap-2 text-sm">
              <span className="font-mono text-xs text-dim">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-muted transition group-hover:text-fg">{s.name}</span>
            </div>
          </button>
          );
        })}
      </div>

      {current && open !== null && (
        <div role="dialog" aria-modal="true" aria-label={`${label}: ${current.name}`} className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm" onClick={close}>
          <div className="flex items-center gap-4 px-5 py-4 text-sm" onClick={(e) => e.stopPropagation()}>
            <span className="font-mono text-xs text-dim">
              {open + 1} / {screens.length}
            </span>
            <span className="text-fg">
              {label} · {current.name}
            </span>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => step(-1)} className="rounded-lg border border-line-2 px-3 py-1.5 text-muted hover:text-fg" aria-label="Previous screen">
                ←
              </button>
              <button type="button" onClick={() => step(1)} className="rounded-lg border border-line-2 px-3 py-1.5 text-muted hover:text-fg" aria-label="Next screen">
                →
              </button>
              <button type="button" onClick={close} className="rounded-lg border border-line-2 px-3 py-1.5 text-muted hover:text-fg" aria-label="Close">
                Close
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-10" onClick={close}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.src}
              alt={`${label}: ${current.name}`}
              onClick={(e) => e.stopPropagation()}
              className={`mx-auto rounded-xl ${desktop || current.width >= 1200 ? "w-full max-w-6xl" : "w-full max-w-[420px]"}`}
            />
          </div>
        </div>
      )}
    </>
  );
}

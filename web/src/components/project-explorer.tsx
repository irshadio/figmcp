"use client";

import { useState } from "react";
import type { Product } from "@/lib/projects";
import { ScreenGallery } from "./screen-gallery";

type Theme = "light" | "dark";

export function ProjectExplorer({ products, label }: { products: Product[]; label: string }) {
  const [active, setActive] = useState(products[0].key);
  const [theme, setTheme] = useState<Theme>("light");
  const product = products.find((p) => p.key === active)!;
  const total = product.flows.reduce((n, f) => n + f.screens.length, 0);

  return (
    <div>
      <div className="sticky top-16 z-30 -mx-4 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Products" className="flex max-w-full overflow-x-auto rounded-full border border-line-2 bg-white/[0.03] p-1 [scrollbar-width:none]">
            {products.map((p) => {
              const on = p.key === active;
              return (
                <button
                  key={p.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActive(p.key)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition ${on ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
          <div role="radiogroup" aria-label="Theme" className="ml-auto inline-flex rounded-full border border-line-2 bg-white/[0.03] p-1">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={theme === t}
                onClick={() => setTheme(t)}
                className={`rounded-full px-3.5 py-1.5 text-sm capitalize transition ${theme === t ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.03em] text-fg sm:text-4xl">{product.name}</h2>
          <p className="mt-2 font-mono text-sm text-sky">{product.platform}</p>
          <p className="mt-4 max-w-3xl leading-relaxed text-pretty text-muted">{product.summary}</p>
        </div>
        <div className="font-mono text-sm text-dim">
          {product.flows.length} flows · {total} screens
        </div>
      </div>

      <nav aria-label="Flows" className="mt-6 flex flex-wrap gap-2">
        {product.flows.map((f) => (
          <a
            key={f.key}
            href={`#${product.key}-${f.key}`}
            className="rounded-full border border-line-2 bg-white/[0.03] px-3.5 py-1.5 text-sm text-muted transition hover:border-sky/40 hover:text-fg"
          >
            {f.name} <span className="font-mono text-xs text-dim">{f.screens.length}</span>
          </a>
        ))}
      </nav>

      {product.flows.map((f, i) => {
        const screens = f.screens.flatMap((s) => {
          const img = s[theme] ?? s.light ?? s.dark;
          return img ? [{ ...img, name: `${s.code} · ${s.name}` }] : [];
        });
        return (
          <section key={`${product.key}-${f.key}`} id={`${product.key}-${f.key}`} className="scroll-mt-36 border-t border-line pt-10 mt-12">
            <div className="mb-5 flex items-baseline justify-between gap-4">
              <h3 className="flex items-baseline gap-3 text-xl font-medium text-fg">
                <span className="font-mono text-xs text-dim">{String(i + 1).padStart(2, "0")}</span>
                {f.name}
              </h3>
              <span className="text-sm text-dim">
                {screens.length} screens{product.device === "mobile" ? " · scroll sideways" : ""}
              </span>
            </div>
            <ScreenGallery key={theme} screens={screens} desktop={product.device === "desktop"} label={`${label} ${product.name}`} />
          </section>
        );
      })}
    </div>
  );
}

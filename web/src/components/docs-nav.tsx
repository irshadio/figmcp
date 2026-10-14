"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { docsNav } from "@/lib/site";
import { ArrowRight } from "./icons";

const flat = docsNav.flatMap((s) => s.items);
const normalize = (p: string) => (p.length > 1 ? p.replace(/\/$/, "") : p);

export function DocsSidebar() {
  const pathname = normalize(usePathname());
  const [open, setOpen] = useState(false);
  const current = flat.find((i) => i.href === pathname);

  const list = (
    <nav className="space-y-8">
      {docsNav.map((section) => (
        <div key={section.title}>
          <div className="mb-2 px-3 font-mono text-[11px] tracking-wider text-dim uppercase">{section.title}</div>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = item.href === pathname;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`relative block rounded-lg px-3 py-1.5 text-sm transition ${
                      active ? "bg-sky/10 text-ice" : "text-muted hover:bg-white/[0.03] hover:text-fg"
                    }`}
                  >
                    {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-sky" />}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <div className="sticky top-16 z-30 -mx-4 border-b border-line bg-bg/85 px-4 backdrop-blur-xl lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between py-3 text-sm"
        >
          <span className="text-muted">
            Docs <span className="text-dim">/</span> <span className="text-fg">{current?.label ?? "Introduction"}</span>
          </span>
          <ArrowRight width={16} height={16} className={`text-dim transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        {open && <div className="max-h-[70dvh] overflow-y-auto pt-2 pb-6">{list}</div>}
      </div>
      <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 overflow-y-auto py-10 pr-4 lg:block">{list}</aside>
    </>
  );
}

export function DocsPager() {
  const pathname = normalize(usePathname());
  const i = flat.findIndex((x) => x.href === pathname);
  const prev = i > 0 ? flat[i - 1] : null;
  const next = i >= 0 && i < flat.length - 1 ? flat[i + 1] : null;
  return (
    <div className="mt-16 grid gap-3 border-t border-line pt-8 sm:grid-cols-2">
      {prev ? (
        <Link href={prev.href} className="rounded-xl border border-line p-4 transition hover:border-line-2 hover:bg-white/[0.02]">
          <div className="text-xs text-dim">Previous</div>
          <div className="mt-1 text-sm text-fg">{prev.label}</div>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={next.href} className="rounded-xl border border-line p-4 text-right transition hover:border-line-2 hover:bg-white/[0.02]">
          <div className="text-xs text-dim">Next</div>
          <div className="mt-1 text-sm text-fg">{next.label}</div>
        </Link>
      )}
    </div>
  );
}

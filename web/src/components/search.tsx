"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { docsNav } from "@/lib/site";
import { track } from "@/lib/analytics";
import { slugify } from "@/lib/slug";

type Entry = { page: string; heading: string; href: string; text: string; level: number };

let cache: Promise<Entry[]> | null = null;

function loadIndex(): Promise<Entry[]> {
  cache ??= Promise.all(
    docsNav
      .flatMap((s) => s.items)
      .map(async (item) => {
        try {
          const html = await (await fetch(item.href)).text();
          const article = new DOMParser().parseFromString(html, "text/html").querySelector("article");
          if (!article) return [];
          const out: Entry[] = [];
          let cur: Entry = { page: item.label, heading: item.label, href: item.href, text: "", level: 1 };
          const push = () => out.push({ ...cur, text: cur.text.replace(/\s+/g, " ").trim() });
          for (const el of article.querySelectorAll("h1, h2, h3, p, li, td, dt, dd, [id] > a > code")) {
            const tag = el.tagName.toLowerCase();
            if (tag === "h2" || tag === "h3" || (tag === "code" && el.closest("[id]"))) {
              const host = tag === "code" ? (el.closest("[id]") as HTMLElement) : (el as HTMLElement);
              push();
              const heading = el.textContent ?? "";
              cur = { page: item.label, heading, href: `${item.href}#${host.id || slugify(heading)}`, text: "", level: tag === "h3" ? 3 : 2 };
            } else if (tag !== "h1") {
              cur.text += ` ${el.textContent}`;
            }
          }
          push();
          return out;
        } catch {
          return [];
        }
      }),
  ).then((all) => all.flat());
  return cache;
}

function score(e: Entry, terms: string[]) {
  const h = e.heading.toLowerCase();
  const t = e.text.toLowerCase();
  let s = 0;
  for (const term of terms) {
    if (h.includes(term)) s += h.startsWith(term) ? 12 : 8;
    else if (e.page.toLowerCase().includes(term)) s += 3;
    else if (t.includes(term)) s += 1;
    else return 0;
  }
  return s;
}

function snippet(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  const at = Math.max(0, ...terms.map((t) => lower.indexOf(t)));
  const start = Math.max(0, at - 40);
  return (start > 0 ? "…" : "") + text.slice(start, start + 120) + (text.length > start + 120 ? "…" : "");
}

function Mark({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 ? (
          <mark key={i} className="rounded bg-sky/20 px-px text-ice">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function Search() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<Entry[] | null>(null);
  const [active, setActive] = useState(0);
  const [mac, setMac] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const router = useRouter();

  const show = useCallback(() => {
    track("search_open");
    setOpen(true);
    loadIndex().then(setIndex);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setMac(!/Win|Linux/i.test(navigator.userAgent)), 0);
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [show]);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => input.current?.focus(), 10);
    document.documentElement.style.overflow = "hidden";
    return () => {
      clearTimeout(id);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const terms = useMemo(() => q.toLowerCase().split(/\s+/).filter(Boolean), [q]);
  const results = useMemo(() => {
    if (!index) return [];
    if (!terms.length) return index.filter((e) => e.level === 1);
    return index
      .map((e) => ({ e, s: score(e, terms) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((r) => r.e);
  }, [index, terms]);

  const close = () => {
    setOpen(false);
    setQ("");
    setActive(0);
  };
  const go = (e?: Entry) => {
    if (!e) return;
    track("search", { search_term: q.trim() || undefined, result: e.href });
    close();
    router.push(e.href);
  };

  useEffect(() => {
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label="Search docs"
        className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white/[0.02] px-2.5 text-sm text-dim transition hover:border-line-2 hover:text-muted lg:w-52"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="hidden lg:inline">Search docs</span>
        <kbd className="ml-auto hidden rounded border border-line-2 px-1.5 font-mono text-[10px] text-dim lg:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={close}>
          <div
            role="dialog"
            aria-label="Search docs"
            className="w-full max-w-xl animate-[fadeUp_.18s_ease-out_both] overflow-hidden rounded-2xl border border-line-2 bg-[#0a0e17] shadow-[0_30px_80px_-10px_#000]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-dim" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={input}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") close();
                  else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === "Enter") go(results[active]);
                }}
                placeholder="Search the docs…"
                className="h-14 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-dim"
              />
              <kbd className="rounded border border-line-2 px-1.5 py-0.5 font-mono text-[10px] text-dim">Esc</kbd>
            </div>
            <ul ref={list} className="max-h-[55vh] overflow-y-auto p-2">
              {!index && <li className="px-3 py-8 text-center text-sm text-dim">Loading…</li>}
              {index && !results.length && <li className="px-3 py-8 text-center text-sm text-dim">No results for “{q}”</li>}
              {results.map((e, i) => (
                <li key={e.href + i} data-i={i}>
                  <button
                    type="button"
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(e)}
                    className={`block w-full rounded-xl px-3 py-2.5 text-left transition-colors ${i === active ? "bg-sky/10" : ""}`}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      {e.level > 1 && <span className="text-xs text-dim">{e.page} ›</span>}
                      <span className={i === active ? "text-ice" : "text-fg"}>
                        <Mark text={e.heading} terms={terms} />
                      </span>
                    </div>
                    {terms.length > 0 && e.text && (
                      <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                        <Mark text={snippet(e.text, terms)} terms={terms} />
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-4 border-t border-line px-4 py-2.5 font-mono text-[10.5px] text-dim">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>esc close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

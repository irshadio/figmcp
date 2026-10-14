"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type ShowcaseKind = "mobile" | "web";
type Filter = "all" | ShowcaseKind;

const FilterContext = createContext<{ filter: Filter; setFilter: (f: Filter) => void }>({ filter: "all", setFilter: () => {} });

export function FilterScope({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState<Filter>("all");
  return <FilterContext.Provider value={{ filter, setFilter }}>{children}</FilterContext.Provider>;
}

export function FilterTabs({ counts }: { counts: Record<Filter, number> }) {
  const { filter, setFilter } = useContext(FilterContext);
  const tabs: [Filter, string][] = [
    ["all", "All"],
    ["mobile", "Mobile apps"],
    ["web", "Web"],
  ];
  return (
    <div role="tablist" aria-label="Filter projects" className="inline-flex rounded-full border border-line-2 bg-white/[0.03] p-1">
      {tabs.map(([key, label]) => {
        const on = filter === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => setFilter(key)}
            data-track="showcase_filter"
            data-track-location={key}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition ${on ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}
          >
            {label}
            <span className={`font-mono text-xs ${on ? "text-bg/60" : "text-dim"}`}>{counts[key]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Renders children only when the current filter includes [kind]. */
export function FilterItem({ kind, children }: { kind: ShowcaseKind; children: ReactNode }) {
  const { filter } = useContext(FilterContext);
  return filter === "all" || filter === kind ? children : null;
}

/** The value for the current filter. */
export function ByFilter({ values }: { values: Partial<Record<Filter, ReactNode>> }) {
  const { filter } = useContext(FilterContext);
  return values[filter] ?? null;
}

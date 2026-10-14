"use client";

import { useState } from "react";

export function OutputTabs({ tabs }: { tabs: { label: string; file: string; body: React.ReactNode }[] }) {
  const [active, setActive] = useState(0);
  return (
    <div className="overflow-hidden rounded-2xl border border-line-2 bg-[#0a0b10]">
      <div className="flex items-center gap-1 border-b border-line px-2 py-2">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setActive(i)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              i === active ? "bg-white/8 text-fg" : "text-dim hover:text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto truncate pr-2 font-mono text-[11px] text-dim">{tabs[active].file}</span>
      </div>
      <div key={active} className="animate-[fadeUp_.35s_ease-out_both]">
        {tabs[active].body}
      </div>
    </div>
  );
}

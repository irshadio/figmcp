import type { ReactNode } from "react";

export function Callout({ title, children, tone = "info" }: { title?: string; children: ReactNode; tone?: "info" | "warn" }) {
  const c = tone === "warn" ? "border-warn/25 bg-warn/[0.05] [&_strong]:text-warn" : "border-sky/25 bg-sky/[0.05]";
  return (
    <div className={`my-6 rounded-xl border px-4 py-3.5 text-[14.5px] ${c}`}>
      {title && <strong className="mb-1 block text-fg">{title}</strong>}
      <div className="[&>p]:my-1">{children}</div>
    </div>
  );
}

export function Steps({ children }: { children: ReactNode }) {
  return <div className="relative my-8 ml-3 space-y-10 border-l border-line pl-8 [counter-reset:step]">{children}</div>;
}

export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative [counter-increment:step]">
      <span className="absolute top-0 -left-[45px] grid size-7 place-items-center rounded-full border border-line-2 bg-bg font-mono text-xs text-sky before:content-[counter(step)]" />
      <h3 className="!mt-0 text-base font-semibold text-fg">{title}</h3>
      {children}
    </div>
  );
}

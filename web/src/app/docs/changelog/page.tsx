import type { Metadata } from "next";
import { releases } from "@/lib/changelog";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Changelog" };

async function publishDates(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${site.pkg.replace("/", "%2f")}`, { cache: "force-cache" });
    if (!res.ok) return {};
    const data = await res.json();
    return data.time ?? {};
  } catch {
    return {};
  }
}

const badge = {
  new: "border-sky/30 bg-sky/10 text-sky",
  improved: "border-ok/30 bg-ok/10 text-ok",
  fixed: "border-warn/30 bg-warn/10 text-warn",
};

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : null;

export default async function Page() {
  const dates = await publishDates();
  return (
    <>
      <h1>Changelog</h1>
      <p className="text-lg text-muted">
        What&apos;s new in each release of <a href={site.npm}>{site.pkg}</a>.
      </p>
      <div className="not-prose relative mt-12 space-y-12 border-l border-line pl-8">
        {releases.map((r) => {
          const date = r.version ? fmt(dates[r.version]) : null;
          return (
            <section key={r.version ?? "next"} id={r.version ? `v${r.version}` : "next"} className="relative scroll-mt-24">
              <span
                className={`absolute top-2 -left-[37px] size-[9px] rounded-full ring-4 ring-bg ${r.version ? "bg-sky" : "bg-dim"}`}
              />
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="!m-0 text-xl font-semibold tracking-tight text-fg">{r.version ? `v${r.version}` : r.title}</h2>
                {date && <span className="font-mono text-xs text-dim">{date}</span>}
                {!r.version && (
                  <span className="rounded-full border border-line-2 px-2 py-0.5 font-mono text-[10px] text-dim uppercase">
                    Not on npm yet
                  </span>
                )}
              </div>
              <ul className="mt-4 space-y-3">
                {r.notes.map((n) => (
                  <li key={n.text} className="flex gap-3 text-[14.5px] leading-relaxed text-[#c3cddc]">
                    <span className={`mt-0.5 h-fit w-[72px] shrink-0 rounded-md border py-px text-center font-mono text-[10px] uppercase ${badge[n.type]}`}>
                      {n.type}
                    </span>
                    <span>{n.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}

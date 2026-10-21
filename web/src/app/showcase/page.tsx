import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CopyCommand } from "@/components/copy-command";
import { ArrowRight, FigmaIcon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { ScreenGallery } from "@/components/screen-gallery";
import { ByFilter, FilterItem, FilterScope, FilterTabs, type ShowcaseKind } from "@/components/showcase-filter";
import { pageMeta } from "@/lib/seo";
import { coverOf, projects, screensOf, systemOf, type ShowcaseProject } from "@/lib/showcase";

const groups: Record<"all" | ShowcaseKind, ShowcaseProject[]> = {
  all: projects,
  mobile: projects.filter((p) => p.type === "mobile"),
  web: projects.filter((p) => p.type === "web"),
  brand: projects.filter((p) => p.type === "brand"),
  deck: projects.filter((p) => p.type === "deck"),
};
const STATS: { label: string; count: (list: ShowcaseProject[]) => number }[] = [
  { label: "projects", count: (list) => list.length },
  { label: "screens and boards", count: (list) => list.reduce((n, p) => n + screensOf(p.slug).length, 0) },
  { label: "design systems", count: (list) => list.length },
];
const number = (list: ShowcaseProject[], p: ShowcaseProject) => String(list.indexOf(p) + 1).padStart(2, "0");

export const metadata: Metadata = pageMeta({
  title: "Showcase",
  path: "/showcase",
  description:
    "App, web, brand and deck designs built in Figma by a coding agent through figmcp: a Series A pitch deck, an electronics brand identity, a coffee brand identity, an electronics store, a dating app, a travel booking app, an invoicing website, a project management tool, a healthcare app, a food delivery app, a restaurant dashboard, a stock trading app and a coffee ordering app, each with its own design system.",
});

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 font-mono text-xs tracking-wider text-sky uppercase">
      <span className="h-px w-6 bg-sky/60" />
      {children}
    </div>
  );
}

export default function Page() {
  return (
    <main>
      <FilterScope>
        <section className="relative overflow-hidden pt-32 pb-16 sm:pt-40">
          <div className="grid-bg pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[860px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,#ff5a4e66,transparent)] blur-3xl" />
          <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
            <Reveal>
              <Eyebrow>Showcase</Eyebrow>
            </Reveal>
            <Reveal delay={60}>
              <h1 className="text-gradient mt-5 text-[40px] leading-[1.05] font-semibold tracking-[-0.04em] text-balance sm:text-6xl">
                Designed in Figma by a coding agent
              </h1>
            </Reveal>
            <Reveal delay={120}>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-muted">
                Every screen, component, variable and text style below was created from plain-language prompts with{" "}
                <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.9em] text-ice">use_figma</code>, then checked
                with screenshots and fixed by the same agent.
              </p>
            </Reveal>
            <Reveal delay={180} className="mt-10 flex justify-center">
              <FilterTabs counts={{ all: groups.all.length, mobile: groups.mobile.length, web: groups.web.length, brand: groups.brand.length, deck: groups.deck.length }} />
            </Reveal>
            <Reveal delay={220} className="mt-6 grid grid-cols-3 gap-3 sm:mx-auto sm:max-w-xl">
              {STATS.map(({ label, count }) => (
                <div key={label} className="rounded-2xl border border-line bg-white/[0.02] px-4 py-4">
                  <div className="text-3xl font-semibold tracking-tight text-fg">
                    <ByFilter values={{ all: count(groups.all), mobile: count(groups.mobile), web: count(groups.web), brand: count(groups.brand), deck: count(groups.deck) }} />
                  </div>
                  <div className="mt-1 text-sm text-muted">{label}</div>
                </div>
              ))}
            </Reveal>
            <Reveal delay={260} className="mt-5 flex flex-wrap justify-center gap-2">
              {projects.map((p) => (
                <FilterItem key={p.slug} kind={p.type}>
                  <a
                    href={`#${p.slug}`}
                    className="rounded-full border border-line-2 bg-white/[0.03] px-4 py-1.5 text-sm text-muted transition hover:border-sky/40 hover:text-fg"
                  >
                    {p.name}
                  </a>
                </FilterItem>
              ))}
            </Reveal>
          </div>
        </section>

        {projects.map((p) => {
          const screens = screensOf(p.slug);
          const system = systemOf(p.slug);
          const cover = coverOf(p.slug);
          return (
            <FilterItem key={p.slug} kind={p.type}>
              <section id={p.slug} className="scroll-mt-20 border-t border-line py-20 sm:py-24">
                <div className="mx-auto max-w-7xl px-4 sm:px-6">
                  <Reveal className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-dim">
                          <ByFilter values={{ all: number(groups.all, p), [p.type]: number(groups[p.type], p) }} />
                        </span>
                        <span className="size-2 rounded-full" style={{ background: p.accent }} />
                        <span className="font-mono text-xs tracking-wider text-muted uppercase">{p.kind}</span>
                      </div>
                      <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] text-fg sm:text-5xl">{p.name}</h2>
                      <p className="mt-2 font-mono text-sm text-sky">{p.platform}</p>
                      {p.figma && (
                        <a
                          href={p.figma}
                          target="_blank"
                          rel="noreferrer"
                          data-track="open_figma"
                          data-track-location={p.slug}
                          className="mt-6 inline-flex items-center gap-2.5 rounded-xl bg-fg px-4 py-2.5 text-sm font-medium text-bg transition hover:bg-white"
                        >
                          <FigmaIcon />
                          Open in Figma
                          <ArrowRight width={14} height={14} />
                        </a>
                      )}
                      <p className="mt-6 text-lg leading-relaxed text-pretty text-muted">{p.summary}</p>
                      <p className="mt-4 leading-relaxed text-pretty text-muted">{p.style}</p>
                      <dl className="mt-8 grid grid-cols-2 gap-3">
                        {p.facts.map(([k, v]) => (
                          <div key={k} className="rounded-xl border border-line bg-white/[0.02] px-4 py-3">
                            <dt className="text-xs text-dim">{k}</dt>
                            <dd className="mt-1 text-sm text-fg">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    <div className="rounded-2xl border border-line bg-panel/60 p-5 sm:p-6">
                      <div className="font-mono text-xs tracking-wider text-dim uppercase">Example prompts</div>
                      <ul className="mt-4 space-y-3">
                        {p.prompts.map((q) => (
                          <li key={q} className="flex gap-3 rounded-xl border border-line bg-bg/60 px-4 py-3 text-sm leading-relaxed text-muted">
                            <span className="select-none font-mono text-sky">›</span>
                            <span>{q}</span>
                          </li>
                        ))}
                      </ul>
                      <a
                        href={system.src}
                        target="_blank"
                        rel="noreferrer"
                        className="group mt-5 block overflow-hidden rounded-xl border border-line transition hover:border-line-2"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={system.src} alt={`${p.name} design system`} loading="lazy" className="h-44 w-full object-cover object-top opacity-90 transition group-hover:opacity-100" />
                        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-sm text-muted group-hover:text-fg">
                          Design system
                          <ArrowRight width={14} height={14} />
                        </div>
                      </a>
                    </div>
                  </Reveal>

                  {cover && (
                    <Reveal className="mt-14 overflow-hidden rounded-2xl border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={cover.src} alt={`${p.name} cover`} loading="lazy" className="w-full" />
                    </Reveal>
                  )}

                  <div className="mt-14">
                    <div className="mb-5 flex items-baseline justify-between gap-4">
                      <h3 className="font-medium text-fg">{screens.length} screens</h3>
                      <span className="text-sm text-dim">{p.desktop || p.type === "brand" || p.type === "deck" ? "Click to view full size" : "Scroll sideways · click to view full size"}</span>
                    </div>
                    <ScreenGallery screens={screens} desktop={p.desktop || p.type === "brand" || p.type === "deck"} wideAspect={p.type === "brand" || p.type === "deck" ? "aspect-video" : undefined} label={p.name} />
                  </div>
                </div>
              </section>
            </FilterItem>
          );
        })}
      </FilterScope>

      <section className="border-t border-line py-24">
        <Reveal className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <h2 className="text-gradient text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">Design your own</h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Install figmcp, open a file in Figma Desktop, run the plugin and describe the app you want.
          </p>
          <div className="mx-auto mt-8 max-w-xl">
            <CopyCommand command="npx -y @irshad.io/figma-local-mcp@latest setup" large />
          </div>
          <Link href="/docs/design-in-figma" className="mt-6 inline-flex items-center gap-2 text-sm text-sky hover:text-ice">
            How designing in Figma works
            <ArrowRight width={14} height={14} />
          </Link>
        </Reveal>
      </section>
    </main>
  );
}

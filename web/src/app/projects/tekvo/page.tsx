import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, FigmaIcon, GitHubIcon, PlayIcon } from "@/components/icons";
import { ProjectExplorer } from "@/components/project-explorer";
import { HeroStack, Journey } from "@/components/project-story";
import { PrototypeEmbed } from "@/components/prototype-embed";
import { Reveal } from "@/components/reveal";
import { ScreenGallery } from "@/components/screen-gallery";
import { tekvoHero, tekvoJourney, tekvoProject as p } from "@/lib/projects";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Tekvo",
  path: "/projects/tekvo",
  description:
    "Tekvo, a full electronics e-commerce platform designed in Figma: customer app, rider app, admin dashboard and hub and store dashboard, every flow in light and dark.",
});

const flows = p.products.reduce((n, x) => n + x.flows.length, 0);
const screens = p.products.reduce((n, x) => n + x.flows.reduce((m, f) => m + f.screens.length, 0), 0);
const STATS: [string, string][] = [
  [String(p.products.length), "products"],
  [String(flows), "flows"],
  [String(screens), "screens"],
  ["2", "themes"],
];
const storeShots = p.store.filter((s) => /Phone|6\.9in/.test(s.name));
const storeArt = p.store.filter((s) => !storeShots.includes(s));

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 font-mono text-xs tracking-wider uppercase" style={{ color: p.accent }}>
      <span className="h-px w-6 opacity-60" style={{ background: p.accent }} />
      {children}
    </div>
  );
}

function SectionHead({ eyebrow, title, children }: { eyebrow?: string; title: string; children: ReactNode }) {
  return (
    <div className="mb-8 max-w-3xl">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className={`${eyebrow ? "mt-4 " : ""}text-3xl font-semibold tracking-[-0.03em] text-fg sm:text-4xl`}>{title}</h2>
      <p className="mt-3 leading-relaxed text-pretty text-muted">{children}</p>
    </div>
  );
}

export default function Page() {
  return (
    <main>
      <section className="relative overflow-hidden pt-32 pb-12 sm:pt-40">
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[860px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,#1f6feb55,transparent)] blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <Reveal>
              <Link href="/showcase" className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
                <ArrowRight width={14} height={14} className="rotate-180" />
                All work
              </Link>
            </Reveal>
            <Reveal delay={60} className="mt-8">
              <Eyebrow>Project · {p.kind}</Eyebrow>
            </Reveal>
            <Reveal delay={100}>
              <h1 className="text-gradient mt-5 text-5xl leading-[1.05] font-semibold tracking-[-0.04em] sm:text-7xl">{p.name}</h1>
            </Reveal>
            <Reveal delay={140}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted">{p.summary}</p>
            </Reveal>
            <Reveal delay={160} className="mt-8 flex flex-wrap gap-3">
              <a
                href={p.figma}
                target="_blank"
                rel="noreferrer"
                data-track="open_figma"
                data-track-location={p.slug}
                className="inline-flex items-center gap-2.5 rounded-xl bg-fg px-4 py-2.5 text-sm font-medium text-bg transition hover:bg-white"
              >
                <FigmaIcon />
                Open in Figma
                <ArrowRight width={14} height={14} />
              </a>
              <a
                href={p.prototype}
                target="_blank"
                rel="noreferrer"
                data-track="open_prototype"
                data-track-location={p.slug}
                className="inline-flex items-center gap-2.5 rounded-xl border border-line-2 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-fg transition hover:border-sky/40 hover:bg-white/[0.08]"
              >
                <PlayIcon width={15} height={15} fill="currentColor" />
                View prototype
                <ArrowRight width={14} height={14} />
              </a>
              <span className="group relative inline-flex cursor-not-allowed">
                <button
                  type="button"
                  disabled
                  aria-describedby="codebase-soon"
                  className="pointer-events-none inline-flex items-center gap-2.5 rounded-xl border border-line bg-white/[0.02] px-4 py-2.5 text-sm font-medium text-dim"
                >
                  <GitHubIcon width={16} height={16} />
                  Codebase
                </button>
                <span
                  id="codebase-soon"
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 translate-y-1 rounded-lg border border-line-2 bg-panel px-2.5 py-1 text-xs whitespace-nowrap text-fg opacity-0 shadow-xl transition group-hover:translate-y-0 group-hover:opacity-100"
                >
                  Coming soon
                </span>
              </span>
            </Reveal>
            <Reveal delay={180} className="mt-10 grid grid-cols-2 gap-3 sm:max-w-2xl sm:grid-cols-4">
              {STATS.map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-line bg-white/[0.02] px-4 py-4">
                  <div className="text-3xl font-semibold tracking-tight text-fg">{value}</div>
                  <div className="mt-1 text-sm text-muted">{label}</div>
                </div>
              ))}
            </Reveal>
            <Reveal delay={220} className="mt-6 flex flex-wrap gap-2">
              {[
                ["#prototype", "Try the prototype"],
                ["#journey", "Life of an order"],
                ["#products", "Every screen"],
                ["#system", "Design system"],
                ["#store", "App store"],
              ].map(([href, label]) => (
                <a
                  key={label}
                  href={href}
                  className="rounded-full border border-line-2 bg-white/[0.03] px-4 py-1.5 text-sm text-muted transition hover:border-sky/40 hover:text-fg"
                >
                  {label}
                </a>
              ))}
            </Reveal>
          </div>
          <Reveal delay={120}>
            <HeroStack dashboard={tekvoHero.dashboard} phones={tekvoHero.phones} label={p.name} />
          </Reveal>
        </div>
      </section>

      <section id="prototype" className="relative scroll-mt-20 overflow-hidden border-t border-line py-20 sm:py-28">
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,#1f6feb33,transparent)] blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Reveal>
            <SectionHead eyebrow="Interactive" title="Try the app">
              This is the real Figma prototype, wired screen to screen. Sign in, browse, open a product, add it to the cart and check out, right here on the
              page.
            </SectionHead>
            <ul className="space-y-3 text-sm text-muted">
              {[
                "Tap buttons, tabs and cards to move between screens",
                "Scroll long screens like Home and Product details",
                "Open it full screen for the best view",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="select-none font-mono" style={{ color: p.accent }}>
                    ›
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            <a
              href={p.prototype}
              target="_blank"
              rel="noreferrer"
              data-track="open_prototype"
              data-track-location="embed"
              className="mt-8 inline-flex items-center gap-2 text-sm text-sky hover:text-ice"
            >
              Open full screen in Figma
              <ArrowRight width={14} height={14} />
            </a>
          </Reveal>
          <Reveal delay={120}>
            <PrototypeEmbed src={p.embed} poster={tekvoHero.poster} title={`${p.name} prototype`} />
          </Reveal>
        </div>
      </section>

      <section id="journey" className="scroll-mt-20 border-t border-line py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHead eyebrow="End to end" title="The life of an order">
            One order touches all four products. Follow it from checkout, through routing, the hub and the rider, to the cash landing at head office.
          </SectionHead>
          <div className="mt-14">
            <Journey steps={tekvoJourney} label={p.name} />
          </div>
        </div>
      </section>

      <section id="products" className="scroll-mt-16 border-t border-line py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <ProjectExplorer products={p.products} label={p.name} />
        </div>
      </section>

      <section id="blueprint" className="scroll-mt-20 border-t border-line py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHead title="Order and money flow">
            How an order is routed to a hub or store, accepted, handed to their own drivers, tracked through custody and delivered, and how cash moves from the
            driver to remittance. The four products are designed around this one chain.
          </SectionHead>
          <a
            href={p.blueprint.src}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-2xl border border-line transition hover:border-line-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.blueprint.src} alt={`${p.name} order and money flow`} loading="lazy" className="w-full" />
          </a>
        </div>
      </section>

      <section id="system" className="scroll-mt-20 border-t border-line py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHead title="Design system">
            Foundations and components shared by every product, the app widget library the mobile screens are built from, and the web components behind both
            dashboards.
          </SectionHead>
          <div className="space-y-12">
            {p.system.map((g) => (
              <div key={g.name}>
                <h3 className="mb-5 font-medium text-fg">
                  {g.name} <span className="ml-1 font-mono text-xs text-dim">{g.images.length}</span>
                </h3>
                <ScreenGallery screens={g.images} desktop label={`${p.name} ${g.name}`} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="store" className="scroll-mt-20 border-t border-line py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHead title="Covers and app store">
            Project covers, app icons for iOS and Android, and the listing screenshots for the App Store and Google Play.
          </SectionHead>
          <div className="mb-10 grid gap-5 lg:grid-cols-2">
            {p.covers.map((c) => (
              <div key={c.src} className="overflow-hidden rounded-2xl border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.src} alt={`${p.name} ${c.name}`} loading="lazy" width={c.width} height={c.height} className="w-full" />
              </div>
            ))}
          </div>
          <ScreenGallery screens={storeShots} label={`${p.name} store`} />
          <div className="mt-10">
            <ScreenGallery screens={storeArt} desktop label={`${p.name} store`} />
          </div>
        </div>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Architecture } from "@/components/architecture";
import { Code } from "@/components/code";
import { Compare } from "@/components/compare";
import { CopyCommand } from "@/components/copy-command";
import { Faq } from "@/components/faq";
import { HeroDemo } from "@/components/hero-demo";
import {
  ArchiveIcon,
  ArrowRight,
  BoltIcon,
  EyeIcon,
  GitHubIcon,
  ImageIcon,
  NpmIcon,
  LayersIcon,
  LinkIcon,
  LockIcon,
  PaletteIcon,
  PenIcon,
} from "@/components/icons";
import { Os } from "@/components/os";
import { OutputTabs } from "@/components/output-tabs";
import { Prompts } from "@/components/prompts";
import { Reveal } from "@/components/reveal";
import { WorksWith } from "@/components/works-with";
import { site } from "@/lib/site";

const flutterSample = `
class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFFFFFFF),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SvgPicture.asset('assets/svg/hero.svg', height: 256),
              const SizedBox(height: 32),
              const Text(
                'Design to code, locally',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}`;

const reactSample = `
export default function Onboarding() {
  return (
    <div className="flex flex-col gap-8 bg-white px-6 pt-12">
      <img alt="" src={hero} className="h-64 w-full rounded-3xl" />
      <h1 className="text-[28px] font-bold leading-[34px] text-[#0a1f44]">
        Design to code, locally
      </h1>
      <p className="text-base leading-6 text-[#5b6679]">
        Turn frames into Flutter and React code.
      </p>
      <button className="h-14 rounded-2xl bg-[#0553b1] text-white">
        Get started
      </button>
    </div>
  );
}`;

const useFigmaSample = `
const frame = figma.createFrame();
frame.name = "Login";
frame.resize(390, 844);
frame.layoutMode = "VERTICAL";
frame.itemSpacing = 20;
frame.paddingLeft = frame.paddingRight = 24;

await figma.loadFontAsync({ family: "Inter", style: "Bold" });
const title = figma.createText();
title.fontName = { family: "Inter", style: "Bold" };
title.characters = "Welcome back";
frame.appendChild(title);

figma.viewport.scrollAndZoomIntoView([frame]);
return frame;`;

const tools = [
  { group: "Read", name: "get_design_context", text: "Reference code, assets and a screenshot for a node. The main tool." },
  { group: "Read", name: "get_metadata", text: "Layer tree as XML: ids, types, names, positions and sizes." },
  { group: "Read", name: "get_screenshot", text: "PNG of a node or the selection, up to 2x its size." },
  { group: "Read", name: "get_variable_defs", text: "Variables and styles used by a node, resolved for its mode." },
  { group: "Read", name: "download_assets", text: "Renders, original image fills and vector SVGs." },
  { group: "Write", name: "use_figma", text: "Run plugin API scripts to create and edit designs." },
  { group: "Connect", name: "get_code_connect_map", text: "Which instances map to which code components." },
  { group: "Connect", name: "add_code_connect_map", text: "Map a design component to a code component." },
  { group: "Connect", name: "remove_code_connect_map", text: "Remove a component mapping." },
  { group: "Status", name: "whoami", text: "Connection, pairing code, open file, selection, snapshots." },
  { group: "Status", name: "save_design_export", text: "Write a full design export of a node to JSON." },
  { group: "Status", name: "import_design_export", text: "Load an export JSON as a snapshot." },
];

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 font-mono text-xs tracking-wider text-sky uppercase">
      <span className="h-px w-6 bg-sky/60" />
      {children}
    </div>
  );
}

function SectionHead({ eyebrow, title, text }: { eyebrow: string; title: ReactNode; text?: ReactNode }) {
  return (
    <Reveal className="mx-auto max-w-3xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="text-gradient mt-4 text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">{title}</h2>
      {text && <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted">{text}</p>}
    </Reveal>
  );
}

function Feature({ icon, title, children, className = "", delay = 0 }: { icon: ReactNode; title: string; children: ReactNode; className?: string; delay?: number }) {
  return (
    <Reveal
      delay={delay}
      className={`group relative overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-white/[0.035] to-transparent p-6 transition-colors hover:border-line-2 ${className}`}
    >
      <div className="pointer-events-none absolute -top-24 -right-24 size-48 rounded-full bg-sky/10 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
      <div className="grid size-10 place-items-center rounded-xl border border-line-2 bg-white/[0.03] text-ice">{icon}</div>
      <h3 className="mt-5 font-medium text-fg">{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
    </Reveal>
  );
}

export const metadata: Metadata = { alternates: { canonical: "/" } };

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: site.name,
      alternateName: "Figma Local MCP",
      description: site.description,
      url: site.url,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Windows",
      softwareVersion: site.version,
      downloadUrl: site.npm,
      installUrl: `${site.url}/docs/installation`,
      softwareRequirements: "Node.js 18 or newer, Figma Desktop",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      author: { "@type": "Person", name: "irshadio", url: site.github },
      sameAs: [site.github, site.npm],
    },
    { "@type": "WebSite", name: site.name, alternateName: "Figma Local MCP", url: site.url },
  ],
};

export default function Home() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40">
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className="animate-aurora pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,#0553b1aa,transparent)] blur-3xl" />
        <div className="pointer-events-none absolute top-20 left-[15%] h-[300px] w-[400px] rounded-full bg-[radial-gradient(closest-side,#54c5f830,transparent)] blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-4xl text-center">
            <Reveal>
              <Link
                href="/docs/design-in-figma"
                className="group inline-flex items-center gap-2 rounded-full border border-line-2 bg-white/[0.03] py-1 pr-3 pl-1 text-xs text-muted backdrop-blur transition hover:border-sky/40 hover:text-fg"
              >
                <span className="rounded-full bg-sky/15 px-2 py-0.5 font-mono text-[11px] text-sky">v{site.version}</span>
                Your agent can now design in Figma
                <ArrowRight width={14} height={14} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-7 text-[44px] leading-[1.02] font-semibold tracking-[-0.045em] text-balance sm:text-7xl lg:text-[88px]">
                <span className="text-gradient">Design to code,</span>
                <br />
                <span className="text-sky-gradient">locally.</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-pretty text-muted sm:text-xl">
                A local MCP server that puts the Figma file you have open into your coding agent. Turn frames into Flutter
                and React code, or let the agent design on the canvas. No Figma API calls, no rate limits.
              </p>
            </Reveal>
            <Reveal delay={240} className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-4">
              <CopyCommand command={site.install} large />
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/docs/installation"
                  data-track="click_get_started"
                  data-track-location="hero"
                  className="inline-flex items-center gap-2 rounded-xl bg-fg px-5 py-2.5 text-sm font-medium text-bg transition hover:bg-white"
                >
                  Get started <ArrowRight width={16} height={16} />
                </Link>
                <a
                  href={site.github}
                  target="_blank"
                  rel="noreferrer"
                  data-track="click_github"
                  data-track-location="hero"
                  className="inline-flex items-center gap-2 rounded-xl border border-line-2 bg-white/[0.02] px-5 py-2.5 text-sm font-medium text-fg transition hover:bg-white/[0.06]"
                >
                  <GitHubIcon width={16} height={16} /> GitHub
                </a>
                <a
                  href={site.npm}
                  target="_blank"
                  rel="noreferrer"
                  data-track="click_npm"
                  data-track-location="hero"
                  className="group inline-flex items-center gap-2 rounded-xl border border-line-2 bg-white/[0.02] px-5 py-2.5 text-sm font-medium text-fg transition hover:bg-white/[0.06]"
                >
                  <NpmIcon width={22} height={22} className="text-[#cb3837]" /> Package
                </a>
              </div>
              <p className="text-xs text-dim">Needs Node.js 18+ and Figma Desktop</p>
            </Reveal>
          </div>

          <Reveal delay={320} className="mx-auto mt-16 max-w-6xl sm:mt-20">
            <HeroDemo />
          </Reveal>
        </div>
      </section>

      <WorksWith />

      <section id="features" className="relative scroll-mt-16 py-28 sm:py-36">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHead
            eyebrow="Why local"
            title="Your design, read straight from the canvas."
            text="A development plugin streams the open file over localhost, so reads never touch the Figma REST API. No tokens, no quotas, no waiting."
          />
          <div className="mt-16 grid gap-4 md:grid-cols-3">
            {[
              { big: "0", label: "Figma API calls", text: "Everything is read from Figma Desktop through the plugin. No personal access token to create." },
              { big: "∞", label: "requests", text: "No rate limits. Ask for the same frame a hundred times while you iterate." },
              { big: "127.0.0.1", label: "only", text: "The plugin talks to a server on your machine, guarded by a pairing code. No cloud relay." },
            ].map((s, i) => (
              <Reveal key={s.label} delay={i * 90} className="relative overflow-hidden rounded-2xl border border-line bg-panel/60 p-7">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky/50 to-transparent" />
                <div className="flex items-baseline gap-2">
                  <span className="text-sky-gradient font-mono text-4xl font-semibold tracking-tight sm:text-5xl">{s.big}</span>
                  <span className="text-sm text-muted">{s.label}</span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted">{s.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-12 sm:py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <Eyebrow>Read</Eyebrow>
            <h2 className="text-gradient mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Frames in, code out.</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              Select a frame or paste a link with <code className="font-mono text-ice">node-id</code>. You get reference code
              for your stack, the assets it uses and a screenshot to check against.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-muted">
              {[
                "Flutter widgets when the project has a pubspec.yaml",
                "React + Tailwind for everything else",
                "SVGs and images saved into the folders your project declares",
                "Your own components named, through Code Connect",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sky" />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <OutputTabs
              tabs={[
                { label: "Flutter", file: "onboarding_screen.dart", body: <Code code={flutterSample} lang="dart" bare /> },
                { label: "React", file: "Onboarding.tsx", body: <Code code={reactSample} lang="tsx" bare /> },
              ]}
            />
          </Reveal>
        </div>
      </section>

      <section className="relative py-12 sm:py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20">
          <Reveal className="lg:order-2">
            <Eyebrow>Write</Eyebrow>
            <h2 className="text-gradient mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Prompt in, design out.</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              Ask for a screen and the agent builds it in the open file with Figma plugin API scripts, then takes a
              screenshot to check its work. It reuses your components, styles and variables.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-muted">
              {["Auto layout, real text and web images", "Each script is one undo step in Figma", "No Dev Mode seat needed"].map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sky" />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120} className="lg:order-1">
            <div className="overflow-hidden rounded-2xl border border-line-2 bg-[#070a11]">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <span className="font-mono text-xs text-fg">use_figma</span>
                <span className="rounded-full border border-ok/30 bg-ok/10 px-2 py-0.5 font-mono text-[10.5px] text-ok">1 undo step</span>
              </div>
              <Code code={useFigmaSample} lang="js" bare />
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative py-28 sm:py-36">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHead eyebrow="Features" title="Everything the agent needs from a design." />
          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Feature icon={<LayersIcon />} title="Full design context" className="lg:col-span-2" delay={0}>
              Layout, auto layout, paints, effects, text styles, components and interactions, turned into code that follows
              the structure of the frame.
            </Feature>
            <Feature icon={<ImageIcon />} title="Assets and SVGs" delay={60}>
              Exported renders, original image fills and SVGs of vector layers, saved where your project expects them.
            </Feature>
            <Feature icon={<PaletteIcon />} title="Variables and styles" delay={120}>
              Design tokens resolved for the node&apos;s own mode, ready to map to your theme.
            </Feature>
            <Feature icon={<LinkIcon />} title="Code Connect" delay={0}>
              Map design components to your code components once. Instances come back as your own widgets.
            </Feature>
            <Feature icon={<ArchiveIcon />} title="Offline snapshots" delay={60}>
              Save a frame as a snapshot and keep reading it with the plugin closed.
            </Feature>
            <Feature icon={<EyeIcon />} title="Screenshots to verify" className="lg:col-span-2" delay={120}>
              Every read can include a screenshot, so the agent compares its output with the design instead of guessing.
            </Feature>
            <Feature icon={<PenIcon />} title="Design on the canvas" className="lg:col-span-2" delay={0}>
              The agent creates and edits frames in the file you have open, one undo step per script.
            </Feature>
            <Feature icon={<LockIcon />} title="Paired and local" delay={60}>
              The plugin connects only to localhost and needs your pairing code.
            </Feature>
            <Feature icon={<BoltIcon />} title="Updates itself" delay={120}>
              Run setup again to update. The plugin refreshes in place, no re-import.
            </Feature>
          </div>
        </div>
      </section>

      <section id="how" className="relative scroll-mt-16 border-y border-line bg-bg-2/40 py-28 sm:py-36">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHead
            eyebrow="How it works"
            title="Three steps, then just ask."
            text="The plugin in Figma Desktop and the MCP server on your machine talk over a local WebSocket. Your agent talks to the server."
          />
          <Reveal className="mx-auto mt-16 max-w-5xl">
            <Architecture />
          </Reveal>
          <div className="mt-20 grid gap-4 lg:grid-cols-3">
            {[
              {
                n: "01",
                title: "Run setup",
                text: "Registers the server with Claude Code, copies the Figma plugin to your home folder and prints your pairing code.",
                cmd: "npx -y @irshad.io/figma-local-mcp@latest setup",
              },
              {
                n: "02",
                title: "Import the plugin once",
                text: "In Figma Desktop: Plugins › Development › Import plugin from manifest…, then pick the manifest setup copied.",
                cmd: "~/.figma-local-mcp/plugin/manifest.json",
              },
              {
                n: "03",
                title: "Pair and ask",
                text: "Run Plugins › Development › figmcp, enter the code and wait for the green dot. Then ask your agent.",
                cmd: "implement the selected Figma frame",
              },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 100} className="flex flex-col rounded-2xl border border-line bg-panel/70 p-6">
                <span className="font-mono text-sm text-sky">{s.n}</span>
                <h3 className="mt-3 text-lg font-medium text-fg">{s.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{s.text}</p>
                <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-black/30 px-3 py-2.5 font-mono text-xs whitespace-nowrap text-ice [scrollbar-width:none]">
                  {i === 2 ? <span className="text-sky">&gt; </span> : null}
                  {i === 1 ? (
                    <Os mac={s.cmd} win="%USERPROFILE%\.figma-local-mcp\plugin\manifest.json" />
                  ) : (
                    s.cmd
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-28 sm:py-36">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHead
            eyebrow="Prompts"
            title="Just ask."
            text="No commands to learn. Copy one of these to get started, then talk to your agent the way you normally do."
          />
          <div className="mt-16">
            <Prompts />
          </div>
        </div>
      </section>

      <section id="tools" className="relative scroll-mt-16 py-28 sm:py-36">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHead
            eyebrow="Tools"
            title="Twelve tools. One local server."
            text="Familiar names for anyone who has used a Figma MCP before, so existing prompts and skills keep working."
          />
          <Reveal className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((t) => (
              <div key={t.name} className="group bg-bg p-6 transition-colors hover:bg-panel">
                <div className="flex items-center justify-between gap-3">
                  <code className="truncate font-mono text-sm text-fg transition-colors group-hover:text-ice">{t.name}</code>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                      t.group === "Write" ? "border-ok/30 text-ok" : "border-line-2 text-dim"
                    }`}
                  >
                    {t.group}
                  </span>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">{t.text}</p>
              </div>
            ))}
          </Reveal>
          <Reveal className="mt-8 text-center">
            <Link href="/docs/tools" className="inline-flex items-center gap-1.5 text-sm text-sky hover:text-ice">
              Tools reference <ArrowRight width={15} height={15} />
            </Link>
          </Reveal>
        </div>
      </section>

      <section id="compare" className="relative scroll-mt-16 border-t border-line py-28 sm:py-36">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHead
            eyebrow="Compare"
            title="Local, next to Figma's own MCP."
            text="Both connect your agent to Figma. This one reads through a plugin on your machine, so reads are never metered."
          />
          <div className="mt-16">
            <Compare />
          </div>
        </div>
      </section>

      <section id="faq" className="relative scroll-mt-16 py-28 sm:py-36">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHead eyebrow="FAQ" title="Questions, answered." />
          <div className="mt-14">
            <Faq />
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-line py-28 sm:py-40">
        <div className="grid-bg pointer-events-none absolute inset-0 rotate-180" />
        <div className="animate-aurora pointer-events-none absolute bottom-[-260px] left-1/2 h-[520px] w-[1000px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,#0553b199,transparent)] blur-3xl" />
        <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-5xl font-semibold tracking-[-0.045em] text-balance sm:text-7xl">
            <span className="text-gradient">Open Figma.</span> <span className="text-sky-gradient">Start building.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-lg text-muted">One command sets up the server and the plugin.</p>
          <div className="mx-auto mt-10 max-w-xl">
            <CopyCommand command={site.install} large />
          </div>
          <div className="mt-6 flex justify-center gap-6 text-sm">
            <Link href="/docs" className="text-muted hover:text-fg">
              Read the docs
            </Link>
            <a href={site.npm} target="_blank" rel="noreferrer" className="text-muted hover:text-fg">
              View on npm
            </a>
          </div>
        </Reveal>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { Code } from "@/components/code";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMeta({
  title: "Introduction",
  path: "/docs",
  description:
    "figmcp gives Claude Code, Cursor and other coding agents the Figma file open in Figma Desktop: Figma to Flutter and React code, no API limits.",
});

const cards = [
  { href: "/docs/installation", title: "Installation", text: "Set up the server and the Figma plugin in a few minutes." },
  { href: "/docs/design-to-code", title: "Design to code", text: "Turn frames into Flutter or React + Tailwind." },
  { href: "/docs/design-in-figma", title: "Design in Figma", text: "Let your agent build screens on the canvas." },
  { href: "/docs/tools", title: "Tools reference", text: "Every tool the server exposes and its options." },
];

export default function Page() {
  return (
    <>
      <p className="!mb-2 font-mono text-xs tracking-wider text-sky uppercase">Documentation</p>
      <h1>Introduction</h1>
      <p className="text-lg text-muted">
        {site.name} is an MCP server that gives your coding agent the Figma file you have open in Figma Desktop. It reads
        designs through a local development plugin, so it never calls the Figma API and has no rate limits.
      </p>
      <p>With it, your agent can:</p>
      <ul>
        <li>
          <strong>Turn frames into code.</strong> Flutter widgets for Flutter projects, React + Tailwind for everything else,
          with the assets and a screenshot to compare against.
        </li>
        <li>
          <strong>Design in Figma.</strong> Create and edit frames in the open file by running Figma plugin API scripts.
        </li>
        <li>
          <strong>Use your components.</strong> Map design components to code components with Code Connect.
        </li>
        <li>
          <strong>Work offline.</strong> Read saved snapshots when the plugin is closed.
        </li>
      </ul>
      <h2>Quick start</h2>
      <Code code={site.install} lang="bash" title="Terminal" />
      <p>
        Then import the plugin once, pair it, and ask your agent to <code>implement the selected Figma frame</code>. The{" "}
        <Link href="/docs/installation">installation guide</Link> walks through each step.
      </p>
      <div className="not-prose mt-10 grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group rounded-xl border border-line bg-white/[0.015] p-5 !no-underline transition hover:border-sky/30 hover:bg-sky/[0.03]"
          >
            <div className="font-medium text-fg group-hover:text-ice">{c.title}</div>
            <div className="mt-1 text-sm text-muted">{c.text}</div>
          </Link>
        ))}
      </div>
    </>
  );
}

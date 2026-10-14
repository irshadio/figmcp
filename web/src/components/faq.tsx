import type { ReactNode } from "react";
import { site } from "@/lib/site";
import { Reveal } from "./reveal";

export const faqs: { q: string; a: ReactNode; text: string }[] = [
  {
    q: "Is it free?",
    text: "Yes. The server and the plugin are free to use, and there are no usage limits or accounts.",
    a: <>Yes. The server and the plugin are free to use, with no usage limits and no account to create.</>,
  },
  {
    q: "Do my designs leave my machine?",
    text: "The plugin sends design data only to the server on your own computer, over 127.0.0.1. From there, your coding agent decides what to send to its model, the same as any code or file it reads.",
    a: (
      <>
        The plugin sends design data only to the server on your own computer, over <code>127.0.0.1</code>, and only after
        you enter your pairing code. From there, your coding agent sends what it needs to its model, the same as any file
        it reads in your project.
      </>
    ),
  },
  {
    q: "Which Figma plan do I need?",
    text: "Any plan, including the free Starter plan. You need Figma Desktop to run the development plugin. Designing in Figma needs edit access to the file.",
    a: (
      <>
        Any plan, including the free Starter plan. You need Figma Desktop to run the development plugin, and designing in
        Figma needs edit access to the file. No Dev Mode seat is needed.
      </>
    ),
  },
  {
    q: "Does it work on Windows?",
    text: "Yes. It works on macOS and Windows with Node.js 18 or newer and Figma Desktop. The docs show paths and commands for both.",
    a: (
      <>
        Yes. It works on macOS and Windows with Node.js 18 or newer and Figma Desktop. The docs switch paths and commands
        between the two.
      </>
    ),
  },
  {
    q: "Does it work without Claude Code?",
    text: "Yes. Any MCP client that runs stdio servers works, including Cursor and Claude Desktop. Setup registers Claude Code automatically and prints the config for other clients.",
    a: (
      <>
        Yes. Any MCP client that runs stdio servers works, including Cursor and Claude Desktop. Setup registers Claude Code
        automatically and prints the config for the others. See <a href="/docs/configuration">client setup</a>.
      </>
    ),
  },
  {
    q: "How is it different from Figma's own MCP server?",
    text: "It reads the file through a plugin on your machine instead of Figma's servers, so there are no read limits and no paid seat is needed. It also writes Flutter code and keeps offline snapshots.",
    a: (
      <>
        It reads the file through a plugin on your machine instead of Figma&apos;s servers, so there are no read limits
        and no paid seat is needed. It also writes native Flutter code and keeps offline snapshots. See the{" "}
        <a href="#compare">comparison</a> above.
      </>
    ),
  },
  {
    q: "Where do I report a bug?",
    text: "Open an issue on GitHub with the output of whoami.",
    a: (
      <>
        Open an issue on <a href={`${site.github}/issues`}>GitHub</a> with the output of <code>whoami</code>.
      </>
    ),
  },
];

export function Faq() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.text } })),
  };
  return (
    <div className="mx-auto max-w-3xl divide-y divide-line border-y border-line">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {faqs.map((f, i) => (
        <Reveal key={f.q} delay={i * 40}>
          <details className="group py-1 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-[17px] font-medium text-fg transition-colors hover:text-ice">
              {f.q}
              <span className="relative size-4 shrink-0 text-dim transition-transform duration-300 group-open:rotate-45">
                <span className="absolute top-1/2 left-0 h-px w-4 -translate-y-1/2 bg-current" />
                <span className="absolute top-0 left-1/2 h-4 w-px -translate-x-1/2 bg-current" />
              </span>
            </summary>
            <div className="pr-10 pb-6 text-[15px] leading-relaxed text-muted [&_a]:text-sky [&_a]:underline [&_a]:decoration-sky/40 [&_a]:underline-offset-2 [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:text-ice">
              {f.a}
            </div>
          </details>
        </Reveal>
      ))}
    </div>
  );
}

import Link from "next/link";
import { site } from "@/lib/site";
import { GitHubIcon, NpmIcon } from "./icons";
import { LogoMark } from "./logo";

const cols = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#how", label: "How it works" },
      { href: "/#tools", label: "Tools" },
      { href: "/#compare", label: "Compare" },
      { href: "/#faq", label: "FAQ" },
      { href: "/docs/changelog", label: "Changelog" },
    ],
  },
  {
    title: "Docs",
    links: [
      { href: "/docs/installation", label: "Installation" },
      { href: "/docs/design-to-code", label: "Design to code" },
      { href: "/docs/design-in-figma", label: "Design in Figma" },
      { href: "/docs/troubleshooting", label: "Troubleshooting" },
    ],
  },
  {
    title: "Project",
    links: [
      { href: site.github, label: "GitHub" },
      { href: site.npm, label: "npm" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Link href="/" className="flex items-center gap-2.5 font-medium">
            <LogoMark size={26} />
            {site.name}
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            Design to code and code to design, on your own machine.
          </p>
          <div className="mt-5 flex gap-2">
            <a href={site.github} target="_blank" rel="noreferrer" aria-label="GitHub" className="grid size-9 place-items-center rounded-lg border border-line text-muted transition hover:text-fg">
              <GitHubIcon />
            </a>
            <a href={site.npm} target="_blank" rel="noreferrer" aria-label="npm" className="grid size-9 place-items-center rounded-lg border border-line text-muted transition hover:text-fg">
              <NpmIcon />
            </a>
          </div>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h4 className="text-sm font-medium text-fg">{c.title}</h4>
            <ul className="mt-4 space-y-2.5">
              {c.links.map((l) => (
                <li key={l.label}>
                  {l.href.startsWith("http") ? (
                    <a href={l.href} target="_blank" rel="noreferrer" className="text-sm text-muted transition hover:text-fg">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="text-sm text-muted transition hover:text-fg">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-line px-4 py-6 text-xs text-dim sm:flex-row sm:justify-between sm:px-6">
        <span>© {new Date().getFullYear()} irshadio</span>
        <span>Not affiliated with Figma, Inc.</span>
      </div>
    </footer>
  );
}

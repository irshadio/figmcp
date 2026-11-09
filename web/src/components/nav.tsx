"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { projectLinks } from "@/lib/projects";
import { site } from "@/lib/site";
import { GitHubIcon, MenuIcon, NpmIcon } from "./icons";
import { Logo } from "./logo";
import { Search } from "./search";

const links = [
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/#tools", label: "Tools" },
  { href: "/showcase", label: "Showcase", highlight: true },
  { href: "/docs", label: "Docs" },
];

function Highlighted({ label }: { label: string }) {
  return <span className="text-rainbow font-medium">{label}</span>;
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled || open ? "border-b border-line bg-bg/75 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-medium tracking-tight">
          <Logo height={24} />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          <div className="group relative">
            <button
              type="button"
              aria-haspopup="true"
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition hover:text-fg ${pathname.startsWith("/projects") ? "text-fg" : "text-muted"}`}
            >
              Projects
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="transition group-hover:rotate-180 group-focus-within:rotate-180">
                <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="invisible absolute top-full left-0 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <div className="w-72 rounded-xl border border-line-2 bg-panel/95 p-1.5 shadow-2xl backdrop-blur-xl">
                {projectLinks.map((p) => (
                  <Link key={p.href} href={p.href} className="block rounded-lg px-3 py-2.5 transition hover:bg-white/6">
                    <div className="text-sm text-fg">{p.name}</div>
                    <div className="mt-0.5 text-xs text-muted">{p.kind}</div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 text-sm transition hover:text-fg ${
                (pathname.startsWith("/docs") && l.href === "/docs") || (pathname === "/showcase" && l.href === "/showcase") ? "text-fg" : "text-muted"
              }`}
            >
              {l.highlight ? <Highlighted label={l.label} /> : l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Search />
          <a
            href={site.github}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            data-track="click_github"
            data-track-location="nav"
            className="hidden size-9 place-items-center rounded-lg text-muted transition hover:bg-white/6 hover:text-fg sm:grid"
          >
            <GitHubIcon />
          </a>
          <a
            href={site.npm}
            target="_blank"
            rel="noreferrer"
            aria-label="npm package"
            data-track="click_npm"
            data-track-location="nav"
            className="hidden size-9 place-items-center rounded-lg text-muted transition hover:bg-white/6 hover:text-[#cb3837] sm:grid"
          >
            <NpmIcon width={22} height={22} />
          </a>
          <Link
            href="/docs/installation"
            data-track="click_get_started"
            data-track-location="nav"
            className="hidden rounded-lg bg-coral px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-[#ff6f64] sm:inline-block"
          >
            Get started
          </Link>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-white/6 hover:text-fg md:hidden"
          >
            <MenuIcon />
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line px-4 pt-2 pb-4 md:hidden">
          <div className="px-2 pt-2.5 pb-1 font-mono text-xs tracking-wider text-dim uppercase">Projects</div>
          {projectLinks.map((p) => (
            <Link key={p.href} href={p.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2.5 text-muted hover:text-fg">
              {p.name}
            </Link>
          ))}
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2.5 text-muted hover:text-fg">
              {l.highlight ? <Highlighted label={l.label} /> : l.label}
            </Link>
          ))}
          <a href={site.github} target="_blank" rel="noreferrer" className="block rounded-lg px-2 py-2.5 text-muted hover:text-fg">
            GitHub
          </a>
          <a href={site.npm} target="_blank" rel="noreferrer" className="block rounded-lg px-2 py-2.5 text-muted hover:text-fg">
            npm
          </a>
        </nav>
      )}
    </header>
  );
}

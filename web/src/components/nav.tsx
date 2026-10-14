"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { site } from "@/lib/site";
import { GitHubIcon, MenuIcon, NpmIcon } from "./icons";
import { LogoMark } from "./logo";
import { Search } from "./search";

const links = [
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/#tools", label: "Tools" },
  { href: "/docs", label: "Docs" },
];

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
          <LogoMark size={26} />
          <span>{site.name}</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 text-sm transition hover:text-fg ${
                pathname.startsWith("/docs") && l.href === "/docs" ? "text-fg" : "text-muted"
              }`}
            >
              {l.label}
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
            className="hidden rounded-lg bg-fg px-3.5 py-1.5 text-sm font-medium text-bg transition hover:bg-white sm:inline-block"
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
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2.5 text-muted hover:text-fg">
              {l.label}
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

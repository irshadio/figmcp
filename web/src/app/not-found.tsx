import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true } };

export default function NotFound() {
  return (
    <main className="relative grid min-h-[80dvh] place-items-center px-4 pt-16 text-center">
      <div className="grid-bg pointer-events-none absolute inset-0" />
      <div className="relative">
        <p className="font-mono text-sm text-sky">404</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Node not found</h1>
        <p className="mx-auto mt-4 max-w-sm text-muted">This page isn&apos;t in the file. Check the link or head back.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className="rounded-lg bg-fg px-4 py-2 text-sm font-medium text-bg">
            Home
          </Link>
          <Link href="/docs" className="rounded-lg border border-line-2 px-4 py-2 text-sm text-fg">
            Docs
          </Link>
        </div>
      </div>
    </main>
  );
}

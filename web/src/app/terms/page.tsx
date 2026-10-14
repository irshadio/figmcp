import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMeta({
  title: "Terms of Use",
  path: "/terms",
  description: "Terms for using figmcp, the local Figma MCP server, and the figmcp.web.app website.",
});

export default function Page() {
  return (
    <main className="relative px-4 pt-32 pb-24 sm:px-6">
      <article className="prose-docs mx-auto max-w-3xl">
        <h1>Terms of Use</h1>
        <p className="text-lg text-muted">
          These terms cover the figmcp software (the npm package <code>{site.pkg}</code> and the Figma plugin) and the
          website {site.url.replace("https://", "")}.
        </p>

        <h2>The software</h2>
        <p>
          figmcp is free software. Your use of the code is governed by the license in the{" "}
          <a href={`${site.github}/blob/main/LICENSE`}>GitHub repository</a>. Where these terms and that license differ
          about the software, the license applies.
        </p>

        <h2>No warranty</h2>
        <p>
          The software and the website are provided &ldquo;as is&rdquo;, without warranty of any kind. Generated code is
          a reference: review it before you ship it, and keep backups of your Figma files. Scripts run through{" "}
          <code>use_figma</code> change the open file, and each run can be undone in Figma.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the extent the law allows, the author is not liable for any damages arising from the use of the software or
          the website, including lost data, lost work or changes to your design files.
        </p>

        <h2>Your designs and other services</h2>
        <p>
          You are responsible for having the rights to the designs you open and for following the terms of the services
          you use with figmcp, including Figma and your coding agent or AI provider. figmcp doesn&apos;t send your
          designs anywhere; your coding agent decides what it shares with its model.
        </p>

        <h2>Trademarks</h2>
        <p>
          Figma is a trademark of Figma, Inc. Claude, Cursor, Flutter, React and other names are trademarks of their
          owners and are used only to describe compatibility. figmcp is not affiliated with or endorsed by any of them.
        </p>

        <h2>Privacy</h2>
        <p>
          How the website uses analytics is described in the <Link href="/privacy">Privacy Policy</Link>.
        </p>

        <h2>Changes</h2>
        <p>
          These terms may be updated. The date below shows the latest version, and continued use means you accept it.
        </p>

        <h2>Contact</h2>
        <p>
          Questions: open an issue on <a href={`${site.github}/issues`}>GitHub</a>.
        </p>
        <p className="text-sm text-dim">Last updated October 14, 2026.</p>
      </article>
    </main>
  );
}

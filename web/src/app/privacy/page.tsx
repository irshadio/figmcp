import type { Metadata } from "next";
import { CookieSettings } from "@/components/cookie-settings";
import { pageMeta } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMeta({
  title: "Privacy Policy",
  path: "/privacy",
  description: "What figmcp.web.app and the figmcp MCP server collect: anonymous website analytics only, and nothing from your designs or code.",
});

export default function Page() {
  return (
    <main className="relative px-4 pt-32 pb-24 sm:px-6">
      <article className="prose-docs mx-auto max-w-3xl">
        <h1>Privacy Policy</h1>
        <p className="text-lg text-muted">Short version: the tool collects nothing, and this website counts visits.</p>

        <h2>The figmcp server and plugin</h2>
        <p>
          The MCP server and the Figma plugin run on your computer. Design data goes from the plugin to the server over{" "}
          <code>127.0.0.1</code> and stays on your machine, apart from what your coding agent sends to its own model.
          There is no telemetry, no account and no tracking in the npm package or the plugin.
        </p>

        <h2>This website</h2>
        <p>
          {site.url.replace("https://", "")} uses Google Analytics to understand how the site is used: which pages are
          visited, how people arrive, and actions such as copying the install command or searching the docs. It records
          your approximate location (country and city), device and browser type. It doesn&apos;t record your name, email
          or IP address, and the data isn&apos;t used for ads or sold.
        </p>
        <p>
          Google Analytics sets first-party cookies (<code>_ga</code> and <code>_ga_*</code>) that last up to two years.
          Visitors in the EU, EEA, UK and Switzerland are asked first, and analytics cookies stay off unless they accept.
          You can change your choice at any time:
        </p>
        <p>
          <CookieSettings className="rounded-lg border border-line-2 px-4 py-2 text-sm text-fg transition hover:bg-white/[0.05]" />
        </p>
        <p>
          You can also block analytics with any content blocker or the{" "}
          <a href="https://tools.google.com/dlpage/gaoptout">Google Analytics opt-out add-on</a>. See how Google uses this
          data in <a href="https://policies.google.com/technologies/partner-sites">Google&apos;s policy</a>.
        </p>

        <h2>Hosting</h2>
        <p>
          The site is hosted on Firebase Hosting, which keeps standard server logs (such as IP address and user agent) for
          security and reliability.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about privacy: open an issue on <a href={`${site.github}/issues`}>GitHub</a>.
        </p>
        <p className="text-sm text-dim">Last updated October 14, 2026.</p>
      </article>
    </main>
  );
}

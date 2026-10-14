import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { Code } from "@/components/code";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMeta({
  title: "Troubleshooting",
  path: "/docs/troubleshooting",
  description:
    "Fix common Figma Local MCP issues: the plugin dot stays grey, a lost pairing code, port 3947 in use or edits failing in Dev Mode.",
});

export default function Page() {
  return (
    <>
      <h1>Troubleshooting</h1>
      <p className="text-lg text-muted">Most problems come down to the connection. Start with <code>whoami</code>.</p>
      <Code code="run whoami" title="Prompt" copy={false} />
      <p>
        It reports whether the plugin is connected, the pairing code, the open file and selection, the port, and any
        saved snapshots.
      </p>

      <h2>The dot stays grey</h2>
      <p>
        The plugin can&apos;t reach the server. Start your coding agent first so it starts the server, then run the plugin
        again. If you just ran setup, restart the agent so it loads the server.
      </p>

      <h2>Lost the pairing code</h2>
      <p>
        Run setup again (it prints the same code), or ask your agent to run <code>whoami</code>.
      </p>
      <Code code={site.install} lang="bash" title="Terminal" />

      <h2>&quot;Not connected and no saved snapshot contains it&quot;</h2>
      <p>
        The plugin isn&apos;t running and the node was never read before. Open the file in Figma Desktop, run the plugin
        and keep its window open.
      </p>

      <h2>use_figma can&apos;t edit the file</h2>
      <p>
        If you switched the file to Dev Mode, switch back to Design mode. Dev Mode is read-only, so edits only work in
        Design mode.
      </p>

      <h2>The plugin is refused</h2>
      <p>
        If <code>whoami</code> shows a <code>refusedOrigin</code> and you&apos;re sure it&apos;s the plugin, add that origin
        to <code>FIGMA_LOCAL_MCP_ALLOW_ORIGINS</code>.
      </p>

      <h2>Port 3947 is taken</h2>
      <p>
        Another instance of the server on the port is fine: requests go through it. If a different program holds port
        3947, quit it. The plugin always connects to that port.
      </p>

      <h2>Still stuck?</h2>
      <p>
        Open an issue on <a href={`${site.github}/issues`}>GitHub</a> with the output of <code>whoami</code>.
      </p>
    </>
  );
}

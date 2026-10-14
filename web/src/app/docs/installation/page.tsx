import type { Metadata } from "next";
import Link from "next/link";
import { Callout, Step, Steps } from "@/components/callout";
import { Code } from "@/components/code";
import { site } from "@/lib/site";
import { Os, OsCode, OsPath } from "@/components/os";

export const metadata: Metadata = { title: "Installation" };

export default function Page() {
  return (
    <>
      <h1>Installation</h1>
      <p className="text-lg text-muted">Set up the server, import the plugin once, and pair them.</p>

      <h2>Requirements</h2>
      <ul>
        <li>Node.js 18 or newer</li>
        <li>Figma Desktop (the plugin runs there, not in the browser)</li>
        <li>macOS or Windows</li>
        <li>An MCP client: Claude Code, Cursor, Claude Desktop or any other</li>
      </ul>

      <Steps>
        <Step title="Run setup">
          <OsCode lang="bash" mac={{ code: site.install, title: "Terminal" }} win={{ code: site.install, title: "PowerShell" }} />
          <p>It does three things:</p>
          <ul>
            <li>Registers the server with Claude Code (user scope) when the <code>claude</code> command is installed.</li>
            <li>
              Copies the Figma plugin to{" "}
              <OsPath mac="~/.figma-local-mcp/plugin" win="%USERPROFILE%\.figma-local-mcp\plugin" /> and opens that
              folder in <Os mac="Finder" win="File Explorer" />.
            </li>
            <li>Prints your pairing code and the MCP config for other clients.</li>
          </ul>
          <p>
            Using another client? Copy the config it prints into that client&apos;s MCP settings. See{" "}
            <Link href="/docs/configuration">Configuration</Link>.
          </p>
        </Step>

        <Step title="Import the plugin (once)">
          <p>
            In Figma Desktop, go to <strong>Plugins › Development › Import plugin from manifest…</strong> and choose:
          </p>
          <OsCode
            mac={{ code: "~/.figma-local-mcp/plugin/manifest.json", title: "Manifest" }}
            win={{ code: "%USERPROFILE%\\.figma-local-mcp\\plugin\\manifest.json", title: "Manifest" }}
          />
          <Os
            mac={
              <p>
                In the file picker, press <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>G</kbd> and paste the path.
              </p>
            }
            win={
              <p>
                In the file picker, paste the path into the <strong>File name</strong> box and press <kbd>Enter</kbd>.
                The folder is hidden by default, so pasting is quicker than browsing to it.
              </p>
            }
          />
        </Step>

        <Step title="Pair and connect">
          <p>
            Restart your coding agent so it loads the server. In Figma Desktop, open a design and run{" "}
            <strong>Plugins › Development › Figma Local MCP</strong>. Enter the pairing code. The dot turns green once
            it&apos;s connected.
          </p>
          <Callout>
            Keep the plugin window open while you work. Lost the code? Run setup again, or ask your agent to run{" "}
            <code>whoami</code>.
          </Callout>
        </Step>

        <Step title="Ask">
          <p>Select a frame in Figma and ask your agent:</p>
          <Code code="implement the selected Figma frame" title="Prompt" copy={false} />
        </Step>
      </Steps>

      <h2>Update</h2>
      <p>Run setup again, then restart your agent and run the plugin. The plugin updates itself, so there&apos;s no need to import it again.</p>
      <Code code={site.install} lang="bash" title="Terminal" />
    </>
  );
}

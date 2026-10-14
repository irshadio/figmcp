import type { Metadata } from "next";
import { Architecture } from "@/components/architecture";
import { OsPath } from "@/components/os";

export const metadata: Metadata = { title: "How it works" };

export default function Page() {
  return (
    <>
      <h1>How it works</h1>
      <p className="text-lg text-muted">Three pieces on your machine, connected locally.</p>
      <div className="not-prose my-10 rounded-2xl border border-line bg-white/[0.015] p-5 sm:p-8">
        <Architecture />
      </div>

      <h2>The plugin</h2>
      <p>
        A development plugin runs inside Figma Desktop. It reads the open file with the Figma plugin API (layers, layout,
        paints, text, variables, components, images) and runs the scripts your agent sends for <code>use_figma</code>.
      </p>
      <p>
        It connects to the server over a WebSocket on <code>127.0.0.1:3947</code>. The server accepts it only with your
        pairing code, which is created once and kept in{" "}
        <OsPath mac="~/.figma-local-mcp" win="%USERPROFILE%\.figma-local-mcp" />.
      </p>

      <h2>The server</h2>
      <p>
        Your MCP client starts <code>figma-local-mcp</code> and talks to it over stdio. The server turns plugin data into
        what the agent needs: reference code, assets, screenshots, metadata and variables.
      </p>
      <p>
        If several clients start a server, the first one serves the port and the others send their requests through it,
        so one plugin window serves them all.
      </p>

      <h2>No Figma API</h2>
      <p>
        Every read goes through the plugin, so there&apos;s no personal access token, no REST API quota and no rate limit.
        When the plugin is closed, the server falls back to the newest saved snapshot that holds the node. See{" "}
        <a href="/docs/snapshots">Offline snapshots</a>.
      </p>

      <h2>Where things live</h2>
      <table>
        <thead>
          <tr>
            <th>Path</th>
            <th>What</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><OsPath mac="~/.figma-local-mcp/plugin" win="%USERPROFILE%\.figma-local-mcp\plugin" /></td>
            <td>The Figma plugin. Refreshed whenever the package updates.</td>
          </tr>
          <tr>
            <td><OsPath mac="~/.figma-local-mcp/snapshots" win="%USERPROFILE%\.figma-local-mcp\snapshots" /></td>
            <td>Saved snapshots and cached plugin reads.</td>
          </tr>
          <tr>
            <td><OsPath mac="~/.figma-local-mcp/assets" win="%USERPROFILE%\.figma-local-mcp\assets" /></td>
            <td>Screenshots and downloaded assets.</td>
          </tr>
          <tr>
            <td><OsPath mac=".figma-local/code-connect.json" win=".figma-local\code-connect.json" /></td>
            <td>Code Connect mappings, in your project.</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

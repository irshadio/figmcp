import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { Os, OsCode, OsPath } from "@/components/os";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMeta({
  title: "Configuration",
  path: "/docs/configuration",
  description:
    "Set up figmcp in Claude Code, Cursor, Claude Desktop or any MCP client on macOS and Windows, plus environment variables.",
});

type Platform = "mac" | "win";
type Default = { mac: string; win: string } | null;

const env: [string, Default, string][] = [
  [
    "FIGMA_LOCAL_MCP_DIR",
    { mac: "~/.figma-local-mcp", win: "%USERPROFILE%\\.figma-local-mcp" },
    "Data folder: plugin, pairing code, snapshots and assets.",
  ],
  ["FIGMA_LOCAL_MCP_FRAMEWORK", null, "Force flutter or react when the client doesn't say."],
  [
    "FIGMA_LOCAL_MCP_CODE_CONNECT",
    { mac: ".figma-local/code-connect.json", win: ".figma-local\\code-connect.json" },
    "Path of the Code Connect mappings file.",
  ],
  ["FIGMA_LOCAL_MCP_ALLOW_ORIGINS", null, "Comma separated extra origins the server accepts for the plugin."],
];

const paths: Record<Platform, { node: string; server: string }> = {
  mac: {
    node: "/usr/local/bin/node",
    server: "/Users/you/.figma-local-mcp/app/node_modules/@irshad.io/figma-local-mcp/bin/figma-local-mcp.js",
  },
  win: {
    node: "C:\\Program Files\\nodejs\\node.exe",
    server: "C:\\Users\\you\\.figma-local-mcp\\app\\node_modules\\@irshad.io\\figma-local-mcp\\bin\\figma-local-mcp.js",
  },
};

const configFor = (os: Platform, vars?: Record<string, string>) =>
  JSON.stringify(
    { mcpServers: { "figma-local": { command: paths[os].node, args: [paths[os].server], ...(vars ? { env: vars } : {}) } } },
    null,
    2,
  );

const quote = (p: string) => (p.includes(" ") ? `"${p}"` : p);
const addCommand = (os: Platform) =>
  `claude mcp add figma-local --scope user -- ${quote(paths[os].node)} ${quote(paths[os].server)}`;

const shell = { mac: "Terminal", win: "PowerShell" };

export default function Page() {
  return (
    <>
      <h1>Configuration</h1>
      <p className="text-lg text-muted">Set up your MCP client and tune the server.</p>

      <h2 id="claude-code">Claude Code</h2>
      <p>
        Setup registers the server for you as <code>figma-local</code> (user scope) when the <code>claude</code> command
        is installed. Restart Claude Code to load it, then check it with <code>/mcp</code>.
      </p>
      <OsCode lang="bash" mac={{ code: site.install, title: shell.mac }} win={{ code: site.install, title: shell.win }} />
      <p>
        To register it by hand, use the <code>node</code> path and server path that setup prints:
      </p>
      <OsCode lang="bash" mac={{ code: addCommand("mac"), title: shell.mac }} win={{ code: addCommand("win"), title: shell.win }} />

      <h2 id="cursor">Cursor</h2>
      <p>
        Run setup, then add the server to <OsPath mac="~/.cursor/mcp.json" win="%USERPROFILE%\.cursor\mcp.json" /> for
        every project, or to <OsPath mac=".cursor/mcp.json" win=".cursor\mcp.json" /> in one project. Use the paths from
        the config setup prints.
      </p>
      <OsCode
        lang="json"
        mac={{ code: configFor("mac"), title: "~/.cursor/mcp.json" }}
        win={{ code: configFor("win"), title: "%USERPROFILE%\\.cursor\\mcp.json" }}
      />
      <p>
        Open <strong>Cursor Settings › MCP</strong> and check that <code>figma-local</code> is enabled with a green dot.
      </p>

      <h2 id="claude-desktop">Claude Desktop</h2>
      <p>
        Run setup, then open <strong>Settings › Developer › Edit Config</strong> and add the server to{" "}
        <OsPath
          mac="~/Library/Application Support/Claude/claude_desktop_config.json"
          win="%APPDATA%\Claude\claude_desktop_config.json"
        />
        :
      </p>
      <OsCode
        lang="json"
        mac={{ code: configFor("mac"), title: "claude_desktop_config.json" }}
        win={{ code: configFor("win"), title: "claude_desktop_config.json" }}
      />
      <p>
        <Os
          mac="Quit Claude Desktop with ⌘Q and reopen it to load the server."
          win="Quit Claude Desktop from the system tray and reopen it to load the server."
        />
      </p>

      <h2 id="other-clients">Other MCP clients</h2>
      <p>
        Any client that runs stdio MCP servers works. Setup prints a config block in the common{" "}
        <code>mcpServers</code> format. Copy the one it prints: the paths are specific to your machine.
      </p>
      <OsCode lang="json" mac={{ code: configFor("mac"), title: "mcp.json" }} win={{ code: configFor("win"), title: "mcp.json" }} />
      <p>
        Setup installs a copy of the server under{" "}
        <OsPath mac="~/.figma-local-mcp/app" win="%USERPROFILE%\.figma-local-mcp\app" /> so your client starts it
        directly, without resolving the package through npx on every start.
      </p>

      <h2 id="environment">Environment variables</h2>
      <p>
        Set these in the <code>env</code> of your MCP client config.
      </p>
      <table>
        <thead>
          <tr>
            <th>Variable</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {env.map(([k, d, t]) => (
            <tr key={k}>
              <td>
                <code>{k}</code>
              </td>
              <td className="text-dim">{d ? <OsPath mac={d.mac} win={d.win} /> : "—"}</td>
              <td>{t}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <OsCode
        lang="json"
        copy={false}
        mac={{ code: configFor("mac", { FIGMA_LOCAL_MCP_FRAMEWORK: "flutter" }), title: "mcp.json" }}
        win={{ code: configFor("win", { FIGMA_LOCAL_MCP_FRAMEWORK: "flutter" }), title: "mcp.json" }}
      />
    </>
  );
}

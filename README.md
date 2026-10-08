# figma-local-mcp

An MCP server that reads the file open in Figma Desktop through a local
plugin and turns frames into Flutter or React code. It never calls the Figma
API, so there are no rate limits, tokens or seat costs.

## Requirements

- Node.js 18 or later
- Figma Desktop (the browser version cannot run development plugins)
- An MCP client: Claude Code, Cursor, Claude Desktop, …

## Installation

### 1. Run the setup

```bash
npx -y @irshad.io/figma-local-mcp@latest setup
```

This installs the server in `~/.figma-local-mcp/app`, registers it with
Claude Code (when it is installed), copies the Figma plugin to
`~/.figma-local-mcp/plugin`, opens that folder and prints your pairing code.

For other MCP clients (Cursor, Claude Desktop, …), copy the config the setup
prints into the client's MCP config. It looks like this:

```json
{
  "mcpServers": {
    "figma-local": {
      "command": "/usr/local/bin/node",
      "args": ["/Users/you/.figma-local-mcp/app/node_modules/@irshad.io/figma-local-mcp/bin/figma-local-mcp.js"]
    }
  }
}
```

Restart your MCP client afterwards.

### 2. Import the Figma plugin (once)

In Figma Desktop: **Plugins > Development > Import plugin from manifest…**
and choose `~/.figma-local-mcp/plugin/manifest.json`.

On macOS, press **Cmd+Shift+G** in the file picker and paste the path.

### 3. Connect

1. Open your design in Figma Desktop.
2. Run **Plugins > Development > Figma Local MCP** and keep its window open.
3. Enter the pairing code printed by the setup. The plugin remembers it.

The dot in the plugin turns green when your MCP client is running and
connected. To see the pairing code again, run the setup again or ask your
AI tool to run `whoami`.

## Usage

Select a frame in Figma and ask your AI tool, for example:

- "Implement the selected Figma frame."
- "Build this screen: https://www.figma.com/design/…?node-id=12-345"
- "Take a screenshot of the selected frame."
- "List the colours and text styles used in this frame."

Flutter projects (with a `pubspec.yaml`) get Flutter widgets; other
projects get React + Tailwind. To choose, say "in Flutter" or "in React".

### Tools

| Tool | What it does |
|---|---|
| `get_design_context` | Code for a frame, with its assets, variables and a screenshot |
| `get_screenshot` | PNG of a node |
| `get_metadata` | Layer outline (ids, names, positions, sizes) |
| `get_variable_defs` | Variables and styles used by a node |
| `download_assets` | Images, SVG icons and renders of a node |
| `get_code_connect_map` / `add_code_connect_map` / `remove_code_connect_map` | Map Figma components to your code components |
| `save_design_export` / `import_design_export` | Save a frame to JSON, or load one |
| `whoami` | Connection status, pairing code, open file and selection |

Every tool takes an optional `nodeId` (`1:2`, or `1-2` from a Figma URL).
Without it, the current selection is used. Frames you have read before
stay readable from saved snapshots when the plugin is closed.

## Updating

```bash
npx -y @irshad.io/figma-local-mcp@latest setup
```

This installs the newest version in place. Then close and run the plugin
again in Figma, and restart your MCP client (Claude Code: `/mcp`, then
reconnect). The plugin does not need to be imported again.

## Troubleshooting

| Problem | Fix |
|---|---|
| The plugin dot stays grey | Start your MCP client (it starts the server), then run the plugin again. |
| The plugin asks for the code again | Run `npx -y @irshad.io/figma-local-mcp setup` and enter the code it prints. |
| Running the command in a terminal seems to hang | That is the server waiting for an MCP client. Press Ctrl+C; use `setup` instead. |
| "Plugin is not connected" | Keep the plugin window open in Figma Desktop while you work. |

## Settings

Optional environment variables, set in the MCP client's config:

| Variable | Default | Purpose |
|---|---|---|
| `FIGMA_LOCAL_MCP_FRAMEWORK` | detected | `flutter` or `react` |
| `FIGMA_LOCAL_MCP_DIR` | `~/.figma-local-mcp` | Where snapshots, assets and the plugin are kept |

## License

MIT

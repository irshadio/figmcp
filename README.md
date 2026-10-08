# Local Design MCP

Turn Figma frames into Flutter and React code with Claude Code, locally,
with no Figma API calls and no rate limits.

## Install

Needs Node.js 18+ and Figma Desktop.

1. Set up the server:

   ```bash
   npx -y @irshad.io/figma-local-mcp@latest setup
   ```

   It registers the server with Claude Code, copies the Figma plugin to
   `~/.figma-local-mcp/plugin` and prints your pairing code. For other MCP
   clients, copy the config it prints.

2. Import the plugin (once): in Figma Desktop, go to **Plugins > Development >
   Import plugin from manifest…** and choose
   `~/.figma-local-mcp/plugin/manifest.json` (on macOS, press Cmd+Shift+G in
   the file picker and paste the path).

3. Restart Claude Code. In Figma Desktop, run **Plugins > Development > Local
   Design MCP** and enter the pairing code. The dot turns green when
   connected.

## Use

Select a frame in Figma and ask Claude Code:

```
implement the selected Figma frame
```

Or paste a Figma link with `node-id`. Flutter projects get Flutter
widgets; other projects get React + Tailwind. Keep the plugin window open
while you work.

## Update

```bash
npx -y @irshad.io/figma-local-mcp@latest setup
```

Then restart Claude Code and run the plugin again. The plugin updates
itself; no need to import it again.

## Troubleshooting

- **Dot stays grey:** start Claude Code first, then run the plugin again.
- **Lost the pairing code:** run the setup again, or ask Claude Code to run `whoami`.

## License

MIT

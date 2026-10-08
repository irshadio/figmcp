# Local Design MCP

Turn Figma frames into Flutter and React code with Claude Code, locally,
with no Figma API calls and no rate limits.

## Install

Needs Node.js 18+ and Figma Desktop.

1. Set up the server:

   ```bash
   npx -y @irshad.io/figma-local-mcp@latest setup
   ```

   It registers the server with Claude Code and prints your pairing code.
   For other MCP clients, copy the config it prints.

2. Install the plugin:
   [Local Design MCP on Figma Community](https://www.figma.com/community/plugin/1690019868157511479)

3. Restart Claude Code. In Figma Desktop, run **Plugins > Local Design MCP**
   and enter the pairing code. The dot turns green when connected.

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

Then restart Claude Code.

## Troubleshooting

- **Dot stays grey:** start Claude Code first, then run the plugin again.
- **Lost the pairing code:** run the setup again, or ask Claude Code to run `whoami`.

## License

MIT

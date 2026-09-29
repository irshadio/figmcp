# figma-local-mcp

A local MCP server that answers the same tools as the Figma Dev Mode MCP
server, without ever calling the Figma API. A development plugin in Figma
Desktop reads the open file and streams it to the server over a localhost
WebSocket, so there are no rate limits, tokens or seat costs.

```
Figma Desktop ── plugin (ui.html) ──ws://localhost:3947──> MCP server ──stdio──> agent
                                                           │
                                   ~/.figma-local-mcp/     └─ snapshots/ assets/
```

## Tools

| Tool | Returns |
|---|---|
| `get_design_context` | Reference React + Tailwind code, the asset URLs it uses, variables/styles, and a screenshot. Over 800 layers it returns metadata instead (unless `forceCode`). |
| `get_metadata` | XML outline (ids, types, names, positions, sizes). No `nodeId`: the pages and saved snapshots. Starts with `Currently selected nodes:` when something is selected. |
| `get_screenshot` | PNG, longer edge capped by `maxDimension` (default 1024, up to 2x), as a local URL and file path; inline with `enableBase64Response`. |
| `get_variable_defs` | `{ "name": value }` for the variables and styles used, resolved for the node's mode. |
| `download_assets` | `export` render (`defaultFormat`, `defaultScale`), `rawImages`, `svgAssets` and rendered masked/rotated layers (20 each). |
| `get_code_connect_map` | `{ nodeId: { codeConnectName, codeConnectSrc, label } }` for the instances in a node, plus components not mapped yet. |
| `add_code_connect_map` / `remove_code_connect_map` | Map a component (or its whole set) to a code component, or remove the mapping. |
| `save_design_export` | Writes a full export of a node to a JSON file, for build scripts. |
| `whoami` | Connection status, pairing code, open file, selection, project and Code Connect file, saved snapshots. |
| `import_design_export` | Saves a design export JSON as a snapshot. |

Inputs match the official tools (`nodeId` as `1:2`, `1-2` or `I1:2;3:4`;
`fileKey` is accepted and ignored). `nodeId` is optional everywhere: without
it, the current selection in Figma is used.

### What the generated code carries

- Exact values from the node tree: auto-layout as flex (negative spacing,
  reversed stacking, wrap), grids, constraints for absolute children
  (left/right/centre/stretch/scale, without transforms), min/max sizes.
- Design variables as `var(--name,value)` (colours, spacing, padding, radii,
  font sizes), text styles as `data-text-style`.
- Fills in Figma order: solid, gradient (angle and stops from the handles),
  image FILL/FIT/CROP/TILE; strokes drawn over the box (inside, centre,
  outside, per side, gradient); shadows (following the content when the box
  has no fill), blurs and blend modes.
- Text: runs with their own font, size, line height (taken from Figma's
  box when Figma rounds or uses font metrics), letter spacing, case,
  decoration, colour or gradient; paragraphs with spacing; max lines and
  ellipsis; links.
- Instances with `data-component` and `data-variant`; mapped components as
  the code component with their properties; prototype actions as
  `data-interactions`.
- Vectors, icons, arcs and dashed shapes as SVG assets; masked groups and
  rotated containers as 2x renders marked `data-rasterized`.

### Code Connect

Mappings live in the project the agent runs in:
`.figma-local/code-connect.json` (the folder ignores itself in git; set
`FIGMA_LOCAL_MCP_CODE_CONNECT` for another file). A mapping is keyed by the
component set, so every variant of a button maps at once. With a mapping,
`get_design_context` emits `<AppPrimaryButton state="Default" text="…" />`
instead of the button's layers; pass `disableCodeConnect: true` to see the
layers.

## Setup

1. Install the dependencies (Node 18+):

   ```bash
   cd ~/Desktop/figma-mcp && npm install
   ```

2. Register the server with the agent, for example Claude Code:

   ```bash
   claude mcp add figma-local --scope user -- node ~/Desktop/figma-mcp/bin/figma-local-mcp.js
   ```

   Restart the session afterwards. To be sure nothing calls the paid server,
   disable the official Figma MCP/plugin while you use this one.

3. In Figma Desktop, go to **Plugins > Development > Import plugin from
   manifest…** and choose `plugin/manifest.json`. Run it with **Plugins >
   Development > Figma Local MCP** and keep its window open. The first time
   it asks for the pairing code: ask the agent to run `whoami` and type the
   `pairingCode` it shows. The plugin remembers it; the dot turns green when
   a server is connected.

4. Select a frame and ask for it: "implement the selected frame", or give a
   figma.com link with `node-id`.

## How it runs

- Each agent session starts its own server process. The first one owns
  port 3947: it accepts the plugin, serves `/assets/*` and exposes a
  secret-protected `/rpc` that the other instances call. When the owner
  exits, the next instance that needs the plugin takes over the port, and
  the plugin reconnects on its own.
- Everything binds to `127.0.0.1`. `/rpc` requires the random secret in
  `~/.figma-local-mcp/secret` (mode 0600). Asset names are SHA-256 content
  hashes.
- WebSocket connections need the pairing code (`~/.figma-local-mcp/pairing`,
  mode 0600, shown by `whoami`) and an opaque origin (`null`, what the
  plugin iframe sends). Ordinary web pages are refused by origin, and a page
  posing as the plugin cannot guess the code: after 20 wrong codes in a
  minute, pairing is locked for a minute.
- The plugin only reads the document. Its network access is limited to
  `localhost:3947` (`devAllowedDomains`).

### Settings (environment)

| Variable | Default |
|---|---|
| `FIGMA_LOCAL_MCP_PORT` | `3947`. If you change it, change `plugin/manifest.json` and `PORT` in `plugin/ui.html` too. |
| `FIGMA_LOCAL_MCP_DIR` | `~/.figma-local-mcp` |
| `FIGMA_LOCAL_MCP_ALLOW_ORIGINS` | Extra WebSocket origins to accept (comma separated). Use only if the server logs `refused a connection from origin …` for the plugin. |

### Import existing exports

```bash
node bin/figma-local-mcp.js import path/to/export.json [more.json …]
```

The format is `{ exportedAt, page, frames: [{ id, name, previewPng2x, tree }], images }`,
the same as the plugin's snapshots.

## Development

```bash
npm test
```

### Checking pixel accuracy

`tools/visual-check.js` renders the generated code in headless Chrome (React,
Babel and Tailwind 3.4 from CDNs; your own font files) and compares it with
the design:

```bash
npm run visual-check -- selection --fonts path/to/app/fonts
npm run visual-check -- 322:4268 --fonts path/to/app/fonts --out /tmp/check
npm run visual-check -- --export design.json --fonts path/to/app/fonts
```

It reports every element whose box differs from Figma's by more than
0.5 px (1 px for text), separating those caused by fonts you did not
provide, and the share of pixels that differ from Figma's own 2x render,
with `design.png`, `rendered.png` and `diff.png` to inspect. Text
anti-aliasing always differs a little between Figma and Chrome.

The tests cover code generation, the metadata XML, snapshot reads, live
reads through a stand-in plugin, origin and secret checks, and port
takeover between two instances.

## Differences from the official server

- The code is generated locally from the node tree, following the same
  conventions (flex for auto-layout, exact px values, `data-node-id` on every
  element, `var(--name,value)` for variables), but not byte-identical.
  Unmapped instances are inlined rather than split into components.
- Rotated leaves are turned inside their bounding box; rotated containers
  and masked groups ship as 2x renders.
- Asset URLs work while a server is running; the same files are always on
  disk at the `path` given with each URL.
- Only reads are supported: tools that write to Figma (`use_figma`,
  `generate_figma_design`, `create_new_file`, `upload_assets`) and FigJam,
  Slides and shader tools are not implemented.

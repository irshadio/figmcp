export type Release = { version: string | null; title?: string; notes: { type: "new" | "improved" | "fixed"; text: string }[] };

export const releases: Release[] = [
  {
    version: "1.4.2",
    notes: [{ type: "improved", text: "Listed in the official MCP Registry as io.github.irshadio/figmcp." }],
  },
  {
    version: "1.4.1",
    notes: [
      { type: "improved", text: "New name: figmcp. The plugin shows as figmcp in Figma; the npm package and setup command stay the same." },
    ],
  },
  {
    version: "1.4.0",
    notes: [
      { type: "new", text: "Design in Figma: use_figma runs Figma plugin API scripts to create and edit frames in the open file, one undo step per script." },
      { type: "improved", text: "Redesigned plugin panel with a status card, live indicator and footer links." },
      { type: "improved", text: "The plugin is now called Figma Local MCP." },
      { type: "improved", text: "Designs can load images from the web." },
      { type: "improved", text: "The server reports its real version to MCP clients." },
    ],
  },
  {
    version: "1.3.3",
    notes: [
      { type: "fixed", text: "The plugin is shared as a development plugin again, imported from its manifest." },
    ],
  },
  {
    version: "1.3.0",
    notes: [
      { type: "improved", text: "Shorter README and a simpler first run." },
      { type: "improved", text: "Localhost is listed in the plugin's allowed domains." },
    ],
  },
  {
    version: "1.2.0",
    notes: [
      { type: "new", text: "First npm release: npx @irshad.io/figma-local-mcp setup registers the server and installs the plugin in one command." },
      { type: "new", text: "Flutter output: widgets for Flutter projects, with assets saved into the folders pubspec.yaml declares." },
      { type: "new", text: "Live plugin bridge over localhost, offline snapshots and Code Connect mappings." },
      { type: "improved", text: "Faster reads: exports run together and hidden layers are skipped." },
      { type: "fixed", text: "Text line boxes with several runs, hugging text widths and SVG render bounds." },
    ],
  },
];

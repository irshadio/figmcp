export type Release = { version: string | null; title?: string; notes: { type: "new" | "improved" | "fixed"; text: string }[] };

export const releases: Release[] = [
  {
    version: "1.5.1",
    notes: [
      { type: "improved", text: "New figmcp logo: the plugin panel opens with the wordmark, in light and dark themes." },
      { type: "improved", text: "The README has a new banner and the tagline \"Design and code, locally.\", since figmcp now works in both directions." },
    ],
  },
  {
    version: "1.5.0",
    notes: [
      { type: "new", text: "verify_code renders Flutter code with flutter test and compares it with Figma's render, inside your own project when you name the widget's file." },
      { type: "new", text: "search_design_system lists the components, styles and variables of the open file, so designs reuse them." },
      { type: "new", text: "place_image puts local images and SVGs into the open file." },
      { type: "new", text: "Flutter: projects using flutter_screenutil get .w, .h, .r and .sp lengths." },
      { type: "new", text: "Flutter: Figma text styles become named AppTextStyles." },
      { type: "improved", text: "Flutter: inner shadows and blend modes are drawn." },
      { type: "improved", text: "Faster reads: images the server already has, and images of hidden layers, are not sent again; large nodes stop reading early." },
      { type: "fixed", text: "A malformed request or plugin message no longer stops the server; requests must come from this machine." },
      { type: "fixed", text: "save_design_export no longer replaces JSON files that are not design exports." },
      { type: "fixed", text: "Flutter: text no longer takes the letter spacing of the app's theme." },
      { type: "improved", text: "A link to the website in the plugin panel." },
    ],
  },
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

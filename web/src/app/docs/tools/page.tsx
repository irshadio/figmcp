import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Tools",
  path: "/docs/tools",
  description:
    "Reference for every figmcp tool: get_design_context, verify_code, get_screenshot, get_metadata, download_assets, use_figma, search_design_system, place_image, Code Connect and more.",
});

type Arg = [name: string, desc: string];
type Tool = { name: string; desc: string; args: Arg[] };

const node: Arg = ["nodeId", "Node id like 1:2, or 1-2 from a URL. Defaults to the current selection."];

const groups: { title: string; tools: Tool[] }[] = [
  {
    title: "Read",
    tools: [
      {
        name: "get_design_context",
        desc: "The main tool for design to code. Returns reference code (Flutter, React + Tailwind or HTML + Tailwind), the assets it uses, a screenshot and the variables in the node. Large nodes return metadata instead of code unless forceCode is set.",
        args: [
          node,
          ["framework", "react, html or flutter. Default: from the client, then FIGMA_LOCAL_MCP_FRAMEWORK, then the project (pubspec.yaml, or a static site)."],
          ["clientLanguages", 'Comma separated languages of the client, e.g. "dart".'],
          ["clientFrameworks", 'Comma separated frameworks of the client, e.g. "flutter".'],
          ["screen", "Draw the node as a phone screen that fills the screen and scrolls when tall (default: portrait frames 300-480 wide)."],
          ["screenUtil", "Flutter: write lengths with flutter_screenutil (.w, .h, .r, .sp). Default: when pubspec.yaml depends on flutter_screenutil."],
          ["assetsDir", "Folder of the assets in the code. Flutter: from pubspec.yaml; React: public/figma; HTML: assets/figma."],
          ["excludeScreenshot", "Leave the screenshot out of the response."],
          ["forceCode", "Always return code, even for very large nodes."],
          ["disableCodeConnect", "Draw mapped components from their layers instead of naming the code component."],
        ],
      },
      {
        name: "get_metadata",
        desc: "Layer tree in XML: node ids, types, names, positions and sizes. Good for an overview of a page or a large frame. Prefer get_design_context for code.",
        args: [node],
      },
      {
        name: "get_screenshot",
        desc: "A PNG of a node or the selection. The response gives a local URL and file path.",
        args: [
          node,
          ["maxDimension", "Longest edge in pixels (default 1024, up to 2x the node size)."],
          ["contentsOnly", "Render the node in isolation, without overlapping content."],
          ["enableBase64Response", "Also include the PNG inline as base64."],
        ],
      },
      {
        name: "get_variable_defs",
        desc: "Variables and styles used by a node, e.g. { 'icon/default/secondary': #949494 }, resolved for the node's own mode.",
        args: [node],
      },
      {
        name: "download_assets",
        desc: "Assets for one node: an exported render, the original image fills (up to 20) and SVGs of the vector layers (up to 20).",
        args: [node, ["defaultFormat", "png, jpg, svg or pdf (default png)."], ["defaultScale", "Export scale, 0.01 to 4 (default 1)."]],
      },
      {
        name: "verify_code",
        desc: "Check Flutter, React or HTML code against the design: renders it at 2x (Flutter with flutter test, React and HTML in headless Chrome with Tailwind) and compares the render with Figma's own. Returns analyzer or runtime errors, broken images, the share of differing pixels and a diff image. With file, it checks your widget, component or page inside your project; without it, the generated reference code, layer by layer.",
        args: [
          node,
          ["framework", "flutter, react or html (default: from the file, then the client and the project)."],
          ["file", "Flutter: the .dart file under lib/. React: a .jsx or .tsx component. HTML: an .html page."],
          ["widget", "Flutter: the widget class in file (default: its first widget class)."],
          ["css", "React and HTML: a stylesheet to load, e.g. the one with the design tokens."],
          ["tailwind", "React and HTML: Tailwind 3 or 4 (default: the project's, else 4)."],
          ["viewport", 'Lay the code out on a screen of this size, e.g. "360x780", and report overflows with the render.'],
          ["fonts", "Folders with font files (default: the project's assets/fonts and the system fonts)."],
          ["flutter", "Path of the flutter tool, when it is not on PATH."],
        ],
      },
    ],
  },
  {
    title: "Write",
    tools: [
      {
        name: "use_figma",
        desc: "Create or edit designs in the open file by running JavaScript against the Figma plugin API. The whole run is one undo step.",
        args: [
          ["code", "Body of an async function run with figma in scope."],
          ["timeoutMs", "How long to wait for the script (default 60000, max 600000)."],
        ],
      },
      {
        name: "search_design_system",
        desc: "Local components and component sets with their properties and variant options, library components the file already uses, and local paint, text and effect styles and variables with their values. Call it before designing, so the agent reuses what the file has.",
        args: [
          ["query", 'Words that must all appear in the name or description, e.g. "button primary". Empty lists everything.'],
          ["kinds", "components, styles and/or variables (default: all)."],
          ["allPages", "Search components on every page, not just the current one."],
          ["limit", "Most results per kind (default 50)."],
        ],
      },
      {
        name: "place_image",
        desc: "Put an image file from your computer into the open file: a PNG, JPG or GIF becomes a layer with the image fill (or the fill of an existing layer), and an SVG becomes editable vectors.",
        args: [
          ["path", "The image file, absolute or relative to the project."],
          ["nodeId", "Set the image as the fill of this layer instead of making a new one."],
          ["parentId", "Frame or group to put the new layer in (default: the current page)."],
          ["width, height", "Size of the new layer; one keeps the aspect ratio."],
          ["x, y", "Position of the new layer."],
          ["scaleMode", "FILL, FIT, CROP or TILE (default FILL)."],
        ],
      },
    ],
  },
  {
    title: "Code Connect",
    tools: [
      {
        name: "get_code_connect_map",
        desc: "Mapping from the component instances in a node to code components, plus the components not mapped yet.",
        args: [node],
      },
      {
        name: "add_code_connect_map",
        desc: "Map a design component to a code component. A component in a set maps the whole set.",
        args: [
          node,
          ["componentName", "Code component name, e.g. AppPrimaryButton."],
          ["source", "Path of the code component in the project."],
          ["label", "Framework, e.g. Flutter or React."],
        ],
      },
      { name: "remove_code_connect_map", desc: "Remove the mapping of a component (by instance, component or set id).", args: [node] },
    ],
  },
  {
    title: "Status and snapshots",
    tools: [
      {
        name: "whoami",
        desc: "Connection status: whether the plugin is connected, the pairing code, the open file, page and selection, the project, Code Connect and saved snapshots. Use it when a read fails.",
        args: [],
      },
      {
        name: "save_design_export",
        desc: "Write a full design export of a node (default: the selection) to a JSON file.",
        args: [node, ["path", "Absolute .json path to write (default: the data folder)."]],
      },
      {
        name: "import_design_export",
        desc: "Save a design export JSON as a snapshot, so its nodes can be read without the plugin.",
        args: [["path", "Absolute path of the export JSON file."]],
      },
    ],
  },
];

export default function Page() {
  return (
    <>
      <h1>Tools</h1>
      <p className="text-lg text-muted">Every tool the server exposes. Your agent picks them; you just ask.</p>
      {groups.map((g) => (
        <section key={g.title}>
          <h2>{g.title}</h2>
          {g.tools.map((t) => (
            <div key={t.name} id={t.name} className="not-prose my-5 scroll-mt-24 rounded-xl border border-line bg-white/[0.015] p-5">
              <a href={`#${t.name}`} className="!no-underline">
                <code className="!border-0 !bg-transparent !p-0 font-mono text-[15px] !text-fg">{t.name}</code>
              </a>
              <p className="!mt-2 !mb-0 text-sm text-muted">{t.desc}</p>
              {t.args.length > 0 && (
                <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-line pt-4 text-sm sm:grid-cols-[minmax(0,180px)_1fr]">
                  {t.args.map(([n, d]) => (
                    <div key={n} className="contents">
                      <dt className="font-mono text-[13px] text-ice">{n}</dt>
                      <dd className="mb-2 text-muted sm:mb-0">{d}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

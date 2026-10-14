export const site = {
  name: "Figma Local MCP",
  url: "https://figmcp.web.app",
  version: process.env.NEXT_PUBLIC_PKG_VERSION ?? "",
  pkg: "@irshad.io/figma-local-mcp",
  npm: "https://www.npmjs.com/package/@irshad.io/figma-local-mcp",
  github: "https://github.com/irshadio/figmcp",
  install: "npx -y @irshad.io/figma-local-mcp@latest setup",
  title: "Figma Local MCP: Figma to Flutter and React code, locally",
  description:
    "A local Figma MCP server for Claude Code, Cursor and any MCP client. Turn Figma frames into Flutter and React code, or design in Figma. No API limits.",
};

export const docsNav = [
  {
    title: "Get started",
    items: [
      { href: "/docs", label: "Introduction" },
      { href: "/docs/installation", label: "Installation" },
      { href: "/docs/how-it-works", label: "How it works" },
    ],
  },
  {
    title: "Guides",
    items: [
      { href: "/docs/design-to-code", label: "Design to code" },
      { href: "/docs/design-in-figma", label: "Design in Figma" },
      { href: "/docs/code-connect", label: "Code Connect" },
      { href: "/docs/snapshots", label: "Offline snapshots" },
    ],
  },
  {
    title: "Reference",
    items: [
      { href: "/docs/tools", label: "Tools" },
      { href: "/docs/configuration", label: "Clients & config" },
      { href: "/docs/troubleshooting", label: "Troubleshooting" },
      { href: "/docs/changelog", label: "Changelog" },
    ],
  },
];

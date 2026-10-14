import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const nextConfig: NextConfig = {
  output: "export",
  env: { NEXT_PUBLIC_PKG_VERSION: pkg.version },
  images: { unoptimized: true },
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

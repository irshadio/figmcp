import type { MetadataRoute } from "next";
import { docsNav, site } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["/", ...docsNav.flatMap((s) => s.items.map((i) => i.href)), "/showcase", "/projects/tekvo", "/privacy", "/terms"];
  const lastModified = new Date();
  return [...new Set(pages)].map((path) => ({
    url: `${site.url}${path === "/" ? "" : path}`,
    lastModified,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : path.startsWith("/docs") ? 0.8 : 0.5,
  }));
}

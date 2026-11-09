import type { Metadata } from "next";
import { site } from "./site";

export function pageMeta({
  title,
  description,
  path,
  image = { url: "/og.png", width: 1920, height: 1080 },
}: {
  title: string;
  description: string;
  path: string;
  image?: { url: string; width: number; height: number };
}): Metadata {
  const full = `${title} · ${site.name}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      url: path,
      siteName: site.name,
      title: full,
      description,
      images: [{ ...image, alt: site.name }],
    },
    twitter: { card: "summary_large_image", title: full, description, images: [image.url] },
  };
}

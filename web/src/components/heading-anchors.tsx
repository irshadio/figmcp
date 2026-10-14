"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { slugify } from "@/lib/slug";

export function HeadingAnchors() {
  const pathname = usePathname();
  useEffect(() => {
    document.querySelectorAll<HTMLElement>("article h2, article h3").forEach((h) => {
      if (!h.id) h.id = slugify(h.textContent ?? "");
    });
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, [pathname]);
  return null;
}

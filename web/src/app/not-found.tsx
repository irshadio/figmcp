import type { Metadata } from "next";
import { NotFoundCanvas } from "@/components/not-found-canvas";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true } };

export default function NotFound() {
  return (
    <main className="relative pt-16">
      <NotFoundCanvas />
    </main>
  );
}

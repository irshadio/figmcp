import { DocsPager, DocsSidebar } from "@/components/docs-nav";
import { HeadingAnchors } from "@/components/heading-anchors";
import { OsSwitch } from "@/components/os";

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(60%_100%_at_50%_0%,#0553b126,transparent)]" />
      <div className="relative mx-auto max-w-7xl gap-12 px-4 pt-16 sm:px-6 lg:flex">
        <DocsSidebar />
        <main className="min-w-0 flex-1 pt-10 pb-24 lg:pt-14">
          <div className="mx-auto mb-8 flex max-w-3xl items-center justify-end gap-3 text-xs text-dim">
            <span className="hidden sm:inline">Instructions for</span>
            <OsSwitch />
          </div>
          <article className="prose-docs mx-auto max-w-3xl">{children}</article>
          <HeadingAnchors />
          <div className="mx-auto max-w-3xl">
            <DocsPager />
          </div>
        </main>
      </div>
    </div>
  );
}

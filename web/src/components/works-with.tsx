import Link from "next/link";
import { brandPaths } from "./brand-paths";
import { Reveal } from "./reveal";

type Item = { label: string; icon: keyof typeof brandPaths | "mcp"; color: string; href?: string; soon?: boolean };

const clients: Item[] = [
  { label: "Claude Code", href: "/docs/configuration#claude-code", icon: "claude", color: "#D97757" },
  { label: "Cursor", href: "/docs/configuration#cursor", icon: "cursor", color: "#FFFFFF" },
  { label: "Claude Desktop", href: "/docs/configuration#claude-desktop", icon: "claude", color: "#D97757" },
  { label: "Any MCP client", href: "/docs/configuration#other-clients", icon: "mcp", color: "#B3E5FC" },
];

const outputs: Item[] = [
  { label: "Flutter", href: "/docs/design-to-code#flutter", icon: "flutter", color: "#54C5F8" },
  { label: "React + Tailwind", href: "/docs/design-to-code#react", icon: "react", color: "#61DAFB" },
  { label: "SwiftUI", icon: "swift", color: "#F05138", soon: true },
  { label: "Android XML", icon: "android", color: "#3DDC84", soon: true },
  { label: "Jetpack Compose", icon: "compose", color: "#4285F4", soon: true },
  { label: "Laravel", icon: "laravel", color: "#FF2D20", soon: true },
];

function Glyph({ item }: { item: Item }) {
  if (item.icon === "mcp")
    return (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={item.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m5 8 4 4-4 4M12 16h7" />
      </svg>
    );
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill={item.color} aria-hidden>
      <path d={brandPaths[item.icon]} />
    </svg>
  );
}

function Tile({ item, delay }: { item: Item; delay: number }) {
  const body = (
    <>
      <div
        className={`relative grid size-16 place-items-center rounded-2xl border transition duration-300 ${
          item.soon
            ? "border-line bg-white/[0.015] opacity-45 grayscale"
            : "border-line-2 bg-white/[0.03] group-hover:-translate-y-0.5 group-hover:border-sky/40 group-hover:shadow-[0_10px_40px_-10px_#54c5f855]"
        }`}
      >
        <Glyph item={item} />
      </div>
      <div className={`text-[13px] leading-tight transition-colors ${item.soon ? "text-dim" : "text-fg group-hover:text-ice"}`}>
        {item.label}
      </div>
      {item.soon && (
        <span className="-mt-1.5 rounded-full border border-line-2 px-2 py-0.5 font-mono text-[10px] tracking-wide text-dim uppercase">
          Soon
        </span>
      )}
    </>
  );
  const cls = "group flex flex-col items-center gap-3 rounded-2xl text-center outline-none focus-visible:ring-2 focus-visible:ring-sky/60";
  return (
    <Reveal delay={delay} className="w-[104px] sm:w-[120px]">
      {item.href ? (
        <Link href={item.href} className={cls} aria-label={`${item.label} setup`}>
          {body}
        </Link>
      ) : (
        <div className={`${cls} cursor-default`} title="Coming soon">
          {body}
        </div>
      )}
    </Reveal>
  );
}

function Group({ title, items }: { title: string; items: Item[] }) {
  return (
    <div className="flex flex-col items-center">
      <Reveal as="h3" className="font-mono text-xs tracking-wider text-dim uppercase">
        {title}
      </Reveal>
      <div className="mt-8 flex flex-wrap items-start justify-center gap-x-4 gap-y-8 sm:gap-x-6">
        {items.map((item, i) => (
          <Tile key={item.label} item={item} delay={i * 60} />
        ))}
      </div>
    </div>
  );
}

export function WorksWith() {
  return (
    <section className="border-y border-line bg-bg-2/50">
      <div className="mx-auto flex max-w-5xl flex-col gap-14 px-4 py-16 sm:px-6 sm:py-20">
        <Group title="Works with any MCP client" items={clients} />
        <div className="mx-auto h-px w-full max-w-md bg-gradient-to-r from-transparent via-line-2 to-transparent" />
        <Group title="Generates code for" items={outputs} />
      </div>
    </section>
  );
}

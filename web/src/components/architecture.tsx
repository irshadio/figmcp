import type { ReactNode } from "react";
import { LogoMark } from "./logo";

function Node({ title, sub, icon, accent = false }: { title: string; sub: string; icon: ReactNode; accent?: boolean }) {
  return (
    <div
      className={`relative z-10 flex w-full items-center gap-3 rounded-2xl border p-4 md:w-auto md:min-w-[190px] md:flex-col md:items-start md:gap-4 md:p-5 ${
        accent ? "glow-ring border-sky/30 bg-[#1a0f0f]" : "border-line-2 bg-panel"
      }`}
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-line-2 bg-white/[0.03]">{icon}</div>
      <div>
        <div className="font-medium text-fg">{title}</div>
        <div className="mt-0.5 font-mono text-xs text-dim">{sub}</div>
      </div>
    </div>
  );
}

function Link({ label, delay = 0 }: { label: string; delay?: number }) {
  return (
    <div className="relative flex h-14 w-full items-center justify-center md:h-auto md:flex-1 md:self-center">
      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gradient-to-b from-sky/0 via-sky/50 to-sky/0 md:hidden" />
      <div className="absolute inset-x-0 top-1/2 hidden h-px bg-gradient-to-r from-sky/0 via-sky/50 to-sky/0 md:block">
        <span
          className="absolute -top-[3px] size-[7px] rounded-full bg-sky shadow-[0_0_12px_2px_#ff6b5f]"
          style={{ animation: `packet 2.4s ${delay}ms ease-in-out infinite` }}
        />
        <span
          className="absolute -top-[3px] size-[7px] rounded-full bg-sun shadow-[0_0_12px_2px_#ffc93c]"
          style={{ animation: `packet-back 2.4s ${delay + 1200}ms ease-in-out infinite` }}
        />
      </div>
      <span className="relative rounded-full border border-line-2 bg-bg px-2.5 py-0.5 font-mono text-[11px] text-muted md:-translate-y-6">
        {label}
      </span>
    </div>
  );
}

const FigmaGlyph = () => (
  <svg width="16" height="22" viewBox="0 0 38 57" aria-hidden>
    <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0Z" fill="#1ABCFE" />
    <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0Z" fill="#0ACF83" />
    <path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19Z" fill="#FF7262" />
    <path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5Z" fill="#F24E1E" />
    <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5Z" fill="#A259FF" />
  </svg>
);

const TermGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffdca8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m5 8 4 4-4 4M12 16h7" />
  </svg>
);

export function Architecture() {
  return (
    <div className="flex flex-col items-stretch md:flex-row md:items-center">
      <Node title="Figma Desktop" sub="development plugin" icon={<FigmaGlyph />} />
      <Link label="WebSocket · 127.0.0.1:3947" />
      <Node title="figma-local-mcp" sub="node server" icon={<LogoMark size={22} />} accent />
      <Link label="MCP · stdio" delay={600} />
      <Node title="Coding agent" sub="Claude Code, Cursor, …" icon={<TermGlyph />} />
    </div>
  );
}

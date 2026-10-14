"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

export function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy to clipboard"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {}
      }}
      className={`grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-fg ${className}`}
    >
      {copied ? <CheckIcon className="text-ok" /> : <CopyIcon />}
    </button>
  );
}

export function CopyCommand({ command, large = false }: { command: string; large?: boolean }) {
  return (
    <div
      className={`glow-ring group flex w-full max-w-full items-center gap-3 rounded-2xl border border-line-2 bg-panel/80 font-mono backdrop-blur ${
        large ? "py-3 pr-3 pl-5 text-[13px] sm:text-[15px]" : "py-2 pr-2 pl-4 text-[12.5px] sm:text-sm"
      }`}
    >
      <span className="select-none text-sky">$</span>
      <code className="min-w-0 flex-1 break-all text-fg sm:break-normal sm:whitespace-nowrap">{command}</code>
      <CopyButton text={command} />
    </div>
  );
}

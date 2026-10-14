"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Code, type Lang } from "./code";

export type OS = "mac" | "win";

const KEY = "figmcp-os";
const EVENT = "figmcp-os-change";

function read(): OS {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "mac" || saved === "win") return saved;
  } catch {}
  return /Win/i.test(navigator.userAgent) ? "win" : "mac";
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useOs(): [OS, (os: OS) => void] {
  const os = useSyncExternalStore(subscribe, read, () => "mac" as OS);
  const set = (next: OS) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  };
  return [os, set];
}

const AppleGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M16.37 12.77c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.27-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65l.04-.03ZM14.1 6.02c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.75-.96 2.79 1.02.08 2.05-.52 2.68-1.27Z" />
  </svg>
);

const WindowsGlyph = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M1 3.5 10 2.2v8.6H1V3.5Zm10-1.4L23 .5v10.3H11V2.1ZM1 12.2h9v8.6l-9-1.3v-7.3Zm10 0h12v11.3l-12-1.7v-9.6Z" />
  </svg>
);

export function OsSwitch({ small = false }: { small?: boolean }) {
  const [os, setOs] = useOs();
  const opts: [OS, string, ReactNode][] = [
    ["mac", "macOS", <AppleGlyph key="a" />],
    ["win", "Windows", <WindowsGlyph key="w" />],
  ];
  return (
    <div role="radiogroup" aria-label="Operating system" className={`inline-flex rounded-lg border border-line bg-black/30 p-0.5 ${small ? "text-[11px]" : "text-xs"}`}>
      {opts.map(([key, label, glyph]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={os === key}
          onClick={() => setOs(key)}
          className={`inline-flex items-center gap-1.5 rounded-md font-medium transition ${small ? "px-2 py-0.5" : "px-2.5 py-1"} ${
            os === key ? "bg-white/10 text-fg" : "text-dim hover:text-muted"
          }`}
        >
          {glyph}
          {label}
        </button>
      ))}
    </div>
  );
}

export function Os({ mac, win }: { mac: ReactNode; win: ReactNode }) {
  const [os] = useOs();
  return <>{os === "win" ? win : mac}</>;
}

export function OsPath({ mac, win }: { mac: string; win: string }) {
  const [os] = useOs();
  return <code>{os === "win" ? win : mac}</code>;
}

type Variant = { code: string; title?: string; lang?: Lang };

export function OsCode({ mac, win, lang = "text", copy = true }: { mac: Variant; win: Variant; lang?: Lang; copy?: boolean }) {
  const [os] = useOs();
  const v = os === "win" ? win : mac;
  return <Code code={v.code} lang={v.lang ?? lang} title={v.title} copy={copy} extra={<OsSwitch small />} />;
}

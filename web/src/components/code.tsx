import type { ReactNode } from "react";
import { CopyButton } from "./copy-command";

export type Lang = "bash" | "json" | "dart" | "tsx" | "js" | "text";

const KEYWORDS: Record<string, string[]> = {
  dart: ["import", "class", "extends", "final", "const", "return", "override", "Widget", "build", "void", "new", "required", "this", "super", "static"],
  tsx: ["import", "from", "export", "default", "function", "return", "const", "let", "await", "async", "new", "type"],
  js: ["import", "from", "export", "default", "function", "return", "const", "let", "await", "async", "new", "for", "of", "if"],
  json: ["true", "false", "null"],
  bash: ["npx", "npm", "claude", "export", "cd"],
};

const TOKEN = /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|(<\/?[A-Za-z][\w.]*|\/?>)|(\b[A-Za-z_$][\w$]*\b)|(\s+|.)/g;

function highlight(src: string, lang: Lang): ReactNode[] {
  if (lang === "text") return [src];
  const kw = new Set(KEYWORDS[lang] ?? []);
  const shell = lang === "bash";
  const out: ReactNode[] = [];
  let m: RegExpExecArray | null;
  let i = 0;
  const re = new RegExp(TOKEN.source, "g");
  while ((m = re.exec(src))) {
    const [t, comment, str, num, tag, word] = m;
    const next = src[re.lastIndex];
    let cls = "";
    if (comment && (lang === "bash" ? comment.startsWith("#") : comment.startsWith("//"))) cls = "text-dim italic";
    else if (comment) {
      re.lastIndex = m.index + 1;
      out.push(t[0]);
      continue;
    } else if (str) cls = lang === "json" && src.slice(re.lastIndex).trimStart().startsWith(":") ? "text-ice" : "text-[#a5e3a1]";
    else if (num) cls = "text-warn";
    else if (tag && (lang === "tsx" || lang === "js")) cls = "text-sky";
    else if (tag) {
      re.lastIndex = m.index + 1;
      out.push(<span key={i++}>{t[0]}</span>);
      continue;
    } else if (word && kw.has(word)) cls = "text-[#c792ea]";
    else if (shell) cls = "";
    else if (word && /^[A-Z]/.test(word)) cls = "text-sky";
    else if (word && next === "(") cls = "text-[#82aaff]";
    else if (word && next === ":") cls = "text-muted";
    out.push(cls ? <span key={i++} className={cls}>{t}</span> : t);
  }
  return out;
}

export function Code({
  code,
  lang = "text",
  title,
  copy = true,
  bare = false,
  extra,
  className = "",
}: {
  code: string;
  lang?: Lang;
  title?: string;
  copy?: boolean;
  bare?: boolean;
  extra?: ReactNode;
  className?: string;
}) {
  const body = code.replace(/^\n+|\s+$/g, "");
  if (bare)
    return (
      <pre className={`overflow-x-auto p-5 font-mono text-[12.5px] leading-6 text-[#d6deeb] ${className}`}>
        <code>{highlight(body, lang)}</code>
      </pre>
    );
  return (
    <div className={`not-prose my-5 overflow-hidden rounded-xl border border-line bg-[#0a0b10] ${className}`}>
      {(title || copy) && (
        <div className="flex h-10 items-center justify-between border-b border-line pr-1 pl-4">
          <span className="min-w-0 truncate font-mono text-xs text-dim">{title ?? lang}</span>
          <div className="flex shrink-0 items-center gap-2">
            {extra}
            {copy ? <CopyButton text={body} /> : extra ? <span className="w-1" /> : null}
          </div>
        </div>
      )}
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6 text-[#d6deeb]">
        <code>{highlight(body, lang)}</code>
      </pre>
    </div>
  );
}

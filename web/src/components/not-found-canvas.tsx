"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LogoMark } from "./logo";

const SWATCHES = ["#FF5A4E", "#FFC93C", "#3B82F6", "#22C55E", "#A855F7", "#F2F3F6", "#111318"];
const RING = 28;

type Fill = { id: string; type: "solid" | "linear"; color: string; stops: string[]; opacity: number; visible: boolean };
type Stroke = { id: string; color: string; weight: number; align: "inside" | "center" | "outside"; visible: boolean };
type Effect = { id: string; type: "drop" | "blur"; x: number; y: number; blur: number; color: string; visible: boolean };
/** A path node; position and handle offsets are fractions of the vector's width and height. */
type Pt = { x: number; y: number; ix: number; iy: number; ox: number; oy: number };
type Vec = {
  id: string;
  group: string;
  name: string;
  shape: "pill" | "ring";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  radii: [number, number, number, number];
  opacity: number;
  visible: boolean;
  locked: boolean;
  flipX: boolean;
  flipY: boolean;
  fills: Fill[];
  strokes: Stroke[];
  effects: Effect[];
  paths: Pt[][] | null;
};

const GROUPS = [
  { id: "g1", name: "4" },
  { id: "g2", name: "0" },
  { id: "g3", name: "4" },
];

let seq = 0;
const uid = (p: string) => `${p}${++seq}`;
const solid = (color: string): Fill => ({ id: uid("f"), type: "solid", color, stops: [color, color], opacity: 100, visible: true });

function vec(group: string, name: string, shape: Vec["shape"], x: number, y: number, w: number, h: number, rotation: number, fill: Fill): Vec {
  const r = shape === "ring" ? 65 : Math.min(w, h) / 2;
  return { id: `${group}-${name.toLowerCase()}`, group, name, shape, x, y, w, h, rotation, radii: [r, r, r, r], opacity: 100, visible: true, locked: false, flipX: false, flipY: false, fills: [fill], strokes: [], effects: [], paths: null };
}

const DIAG = (Math.atan2(90, -44) * 180) / Math.PI;
const four = (g: string, dx: number) => [
  vec(g, "Diagonal", "pill", dx - 24, -26, 128, 28, DIAG, solid("#FF5A4E")),
  vec(g, "Stem", "pill", dx + 20, 0, 28, 150, 0, solid("#3B82F6")),
  vec(g, "Bar", "pill", dx - 2, 21, 116, 28, 0, solid("#FFC93C")),
];
const start = (): Vec[] => [
  ...four("g1", -150),
  vec("g2", "Ring", "ring", 0, 0, 130, 170, 0, { id: uid("f"), type: "linear", color: "#FF5A4E", stops: ["#FF5A4E", "#FFC93C", "#3B82F6"], opacity: 100, visible: true }),
  ...four("g3", 150),
];

const rad = (d: number) => (d * Math.PI) / 180;
const hex = (s: string) => {
  const v = s.replace(/[^0-9a-f]/gi, "").slice(0, 6);
  return v.length === 6 ? `#${v.toUpperCase()}` : null;
};

function bounds(v: Vec) {
  const c = Math.abs(Math.cos(rad(v.rotation)));
  const s = Math.abs(Math.sin(rad(v.rotation)));
  const bw = v.w * c + v.h * s;
  const bh = v.w * s + v.h * c;
  return { x0: v.x - bw / 2, y0: v.y - bh / 2, x1: v.x + bw / 2, y1: v.y + bh / 2 };
}

/** Rounded rectangle path with four radii: top-left, top-right, bottom-right, bottom-left. */
function rrect(x: number, y: number, w: number, h: number, r: number[]) {
  const m = Math.min(w, h) / 2;
  const [a, b, c, d] = r.map((v) => Math.max(0, Math.min(v, m)));
  return `M${x + a} ${y}H${x + w - b}A${b} ${b} 0 0 1 ${x + w} ${y + b}V${y + h - c}A${c} ${c} 0 0 1 ${x + w - c} ${y + h}H${x + d}A${d} ${d} 0 0 1 ${x} ${y + h - d}V${y + a}A${a} ${a} 0 0 1 ${x + a} ${y}Z`;
}

const K = 0.5523;
const near = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

function rrectNodes(x: number, y: number, w: number, h: number, r: number[]): Pt[] {
  const m = Math.min(w, h) / 2;
  const [a, b, c, d] = r.map((v) => Math.max(0, Math.min(v, m)));
  const raw: Pt[] = [
    { x: x + a, y, ix: -a * K, iy: 0, ox: 0, oy: 0 },
    { x: x + w - b, y, ix: 0, iy: 0, ox: b * K, oy: 0 },
    { x: x + w, y: y + b, ix: 0, iy: -b * K, ox: 0, oy: 0 },
    { x: x + w, y: y + h - c, ix: 0, iy: 0, ox: 0, oy: c * K },
    { x: x + w - c, y: y + h, ix: c * K, iy: 0, ox: 0, oy: 0 },
    { x: x + d, y: y + h, ix: 0, iy: 0, ox: -d * K, oy: 0 },
    { x, y: y + h - d, ix: 0, iy: d * K, ox: 0, oy: 0 },
    { x, y: y + a, ix: 0, iy: 0, ox: 0, oy: -a * K },
  ];
  const out: Pt[] = [];
  for (const p of raw) {
    const last = out[out.length - 1];
    if (last && near(last, p)) Object.assign(last, { ox: p.ox, oy: p.oy });
    else out.push({ ...p });
  }
  if (out.length > 1 && near(out[0], out[out.length - 1])) {
    const last = out.pop()!;
    Object.assign(out[0], { ix: last.ix, iy: last.iy });
  }
  return out;
}

function toNodes(v: Vec): Pt[][] {
  const subs = [rrectNodes(0, 0, v.w, v.h, v.radii)];
  if (v.shape === "ring") {
    const t = Math.min(RING, v.w / 2 - 1, v.h / 2 - 1);
    subs.push(rrectNodes(t, t, v.w - 2 * t, v.h - 2 * t, v.radii.map((r) => r - t)));
  }
  return subs.map((sub) => sub.map((p) => ({ x: p.x / v.w, y: p.y / v.h, ix: p.ix / v.w, iy: p.iy / v.h, ox: p.ox / v.w, oy: p.oy / v.h })));
}

function nodesPath(paths: Pt[][], w: number, h: number) {
  const f = (n: number) => +n.toFixed(2);
  return paths
    .map((sub) => {
      let d = `M${f(sub[0].x * w)} ${f(sub[0].y * h)}`;
      sub.forEach((p, i) => {
        const q = sub[(i + 1) % sub.length];
        d += `C${f((p.x + p.ox) * w)} ${f((p.y + p.oy) * h)} ${f((q.x + q.ix) * w)} ${f((q.y + q.iy) * h)} ${f(q.x * w)} ${f(q.y * h)}`;
      });
      return `${d}Z`;
    })
    .join("");
}

/** Converts a canvas delta into the vector's unrotated, unflipped local space. */
function toLocal(v: Vec, dx: number, dy: number) {
  const c = Math.cos(rad(v.rotation));
  const s = Math.sin(rad(v.rotation));
  return { x: (dx * c + dy * s) * (v.flipX ? -1 : 1), y: (-dx * s + dy * c) * (v.flipY ? -1 : 1) };
}

type NodeRef = { s: number; i: number; part: "p" | "in" | "out" };

function moveNode(v: Vec, paths: Pt[][], ref: NodeRef, dx: number, dy: number, free: boolean): Pt[][] {
  const l = toLocal(v, dx, dy);
  const fx = l.x / v.w;
  const fy = l.y / v.h;
  return paths.map((sub, si) =>
    si !== ref.s
      ? sub
      : sub.map((p, i) => {
          if (i !== ref.i) return p;
          if (ref.part === "p") return { ...p, x: p.x + fx, y: p.y + fy };
          const [hk, ok] = ref.part === "in" ? (["i", "o"] as const) : (["o", "i"] as const);
          const nx = p[`${hk}x`] + fx;
          const ny = p[`${hk}y`] + fy;
          const next = { ...p, [`${hk}x`]: nx, [`${hk}y`]: ny };
          const ox = p[`${ok}x`] * v.w;
          const oy = p[`${ok}y`] * v.h;
          const len = Math.hypot(ox, oy);
          const nlen = Math.hypot(nx * v.w, ny * v.h);
          if (!free && len && nlen) Object.assign(next, { [`${ok}x`]: (-nx * v.w * len) / nlen / v.w, [`${ok}y`]: (-ny * v.h * len) / nlen / v.h });
          return next;
        }),
  );
}

function setCorner(v: Vec, paths: Pt[][], si: number, i: number, smooth: boolean): Pt[][] {
  const sub = paths[si];
  const a = sub[(i - 1 + sub.length) % sub.length];
  const b = sub[(i + 1) % sub.length];
  const tx = (b.x - a.x) / 4;
  const ty = (b.y - a.y) / 4;
  return paths.map((s2, k) => (k !== si ? s2 : s2.map((p, j) => (j !== i ? p : smooth ? { ...p, ix: -tx, iy: -ty, ox: tx, oy: ty } : { ...p, ix: 0, iy: 0, ox: 0, oy: 0 }))));
}

function geometry(v: Vec) {
  if (v.paths) return nodesPath(v.paths, v.w, v.h);
  const outer = rrect(0, 0, v.w, v.h, v.radii);
  if (v.shape === "pill") return outer;
  const t = Math.min(RING, v.w / 2 - 1, v.h / 2 - 1);
  return outer + rrect(t, t, v.w - 2 * t, v.h - 2 * t, v.radii.map((r) => r - t));
}

function VecArt({ v }: { v: Vec }) {
  const d = geometry(v);
  const clip = `nf-clip-${v.id}`;
  const shadows = v.effects.filter((e) => e.visible && e.type === "drop").map((e) => `drop-shadow(${e.x}px ${e.y}px ${e.blur / 2}px ${e.color})`);
  const blur = v.effects.find((e) => e.visible && e.type === "blur");
  const filter = [...shadows, blur ? `blur(${blur.blur / 4}px)` : ""].join(" ").trim();
  return (
    <svg width={v.w} height={v.h} className="block overflow-visible" style={{ filter: filter || undefined }} aria-hidden>
      <defs>
        <clipPath id={clip}>
          <path d={d} clipRule="evenodd" />
        </clipPath>
        {v.fills.map((f) =>
          f.type === "linear" ? (
            <linearGradient key={f.id} id={`nf-g-${f.id}`} x1="0" y1="0" x2="1" y2="1">
              {f.stops.map((s, i) => (
                <stop key={i} offset={f.stops.length === 1 ? 0 : i / (f.stops.length - 1)} stopColor={s} />
              ))}
            </linearGradient>
          ) : null,
        )}
      </defs>
      {[...v.fills].reverse().map((f) =>
        f.visible ? <path key={f.id} d={d} fillRule="evenodd" fill={f.type === "linear" ? `url(#nf-g-${f.id})` : f.color} fillOpacity={f.opacity / 100} /> : null,
      )}
      {v.strokes.map((s) =>
        s.visible ? (
          s.align === "inside" ? (
            <path key={s.id} d={d} fill="none" stroke={s.color} strokeWidth={s.weight * 2} clipPath={`url(#${clip})`} />
          ) : (
            <path key={s.id} d={d} fill="none" stroke={s.color} strokeWidth={s.align === "outside" ? s.weight * 2 : s.weight} />
          )
        ) : null,
      )}
    </svg>
  );
}

/* Sidebar kit, sized like an editor panel. */

function Section({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <section className="border-b border-line px-3 pt-1.5 pb-3">
      <div className="flex h-8 items-center justify-between">
        <h3 className="text-[11px] font-semibold text-fg">{title}</h3>
        {actions && <div className="flex items-center gap-0.5">{actions}</div>}
      </div>
      {children ? <div className="space-y-2">{children}</div> : null}
    </section>
  );
}

function IconBtn({ label, onClick, pressed, children }: { label: string; onClick?: () => void; pressed?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-white/[0.07] hover:text-fg ${pressed ? "bg-blue/20 text-blue" : ""}`}
    >
      {children}
    </button>
  );
}

const I = {
  plus: <path d="M8 3v10M3 8h10" />,
  minus: <path d="M3 8h10" />,
  eye: (
    <>
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  eyeOff: <path d="M2 2l12 12M6.5 4a5.6 5.6 0 0 1 1.5-.5c4 0 6.5 4.5 6.5 4.5a11 11 0 0 1-1.6 2M4.2 4.7C2.5 6 1.5 8 1.5 8S4 12.5 8 12.5a6 6 0 0 0 3-.8" />,
  lock: (
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </>
  ),
  unlock: (
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5-.5" />
    </>
  ),
  copy: (
    <>
      <rect x="5" y="5" width="8.5" height="8.5" rx="1.2" />
      <path d="M11 5V3.5A1 1 0 0 0 10 2.5H3.5a1 1 0 0 0-1 1V10a1 1 0 0 0 1 1H5" />
    </>
  ),
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9" />,
  link: <path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 0 1 4.5 9l1-1" />,
  corners: <path d="M2.5 6V3.5a1 1 0 0 1 1-1H6M10 2.5h2.5a1 1 0 0 1 1 1V6M13.5 10v2.5a1 1 0 0 1-1 1H10M6 13.5H3.5a1 1 0 0 1-1-1V10" />,
  flipH: <path d="M8 2v12M6 4.5 2.5 12H6zM10 4.5l3.5 7.5H10z" />,
  flipV: <path d="M2 8h12M4.5 6 12 2.5V6zM4.5 10 12 13.5V10z" />,
  rotate: <path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3" />,
};
const Ico = ({ d }: { d: ReactNode }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

function Num({ label, value, onChange, suffix, step = 1, min, max, title }: { label: ReactNode; value: number; onChange: (v: number) => void; suffix?: string; step?: number; min?: number; max?: number; title: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const scrub = useRef<{ x: number; v: number } | null>(null);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const commit = (s: string) => {
    const n = Number.parseFloat(s);
    if (Number.isFinite(n)) onChange(clamp(Math.round(n)));
    setDraft(null);
  };
  return (
    <div className="flex h-7 items-center rounded border border-transparent bg-white/[0.05] hover:border-line-2 focus-within:border-blue">
      <span
        title={`${title} · drag to change`}
        className="flex h-full w-6 shrink-0 cursor-ew-resize items-center justify-center text-[11px] text-dim select-none"
        onPointerDown={(e) => {
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          scrub.current = { x: e.clientX, v: value };
        }}
        onPointerMove={(e) => scrub.current && onChange(clamp(Math.round(scrub.current.v + (e.clientX - scrub.current.x) * step * (e.shiftKey ? 10 : 1))))}
        onPointerUp={() => (scrub.current = null)}
      >
        {label}
      </span>
      <input
        aria-label={title}
        inputMode="decimal"
        className="h-full w-full min-w-0 bg-transparent pe-1 font-mono text-[11px] text-fg outline-none"
        value={draft ?? String(Math.round(value))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            onChange(clamp(value + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1)));
          }
        }}
      />
      {suffix && <span className="pe-2 text-[11px] text-dim">{suffix}</span>}
    </div>
  );
}

function hexToHsv(c: string): [number, number, number] {
  const n = Number.parseInt((hex(c) ?? "#FFFFFF").slice(1), 16);
  const r = (n >> 16) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = !d ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, max ? d / max : 0, max];
}

function hsvToHex(h: number, s: number, v: number) {
  const f = (k: number) => {
    const x = (k + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(x, 4 - x, 1))) * 255);
  };
  return `#${[f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

const PICKER_W = 240;

function ColorPicker({ color, anchor, onChange, onClose, chip }: { color: string; anchor: DOMRect; onChange: (c: string) => void; onClose: () => void; chip: HTMLElement | null }) {
  const [hsv, setHsv] = useState(() => hexToHsv(color));
  const box = useRef<HTMLDivElement>(null);
  const [h, sat, val] = hsv;

  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !chip?.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [onClose, chip]);

  const set = (next: [number, number, number]) => {
    setHsv(next);
    onChange(hsvToHex(...next));
  };
  const track = (e: ReactPointerEvent<HTMLDivElement>, fn: (fx: number, fy: number) => void) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const at = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      fn(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)));
    };
    at(e);
    el.onpointermove = (ev) => at(ev);
    el.onpointerup = () => (el.onpointermove = null);
  };

  const aside = chip?.closest("aside")?.getBoundingClientRect();
  const left = Math.max(8, (aside?.left ?? anchor.left) - PICKER_W - 8);
  const top = Math.max(72, Math.min(anchor.top - 12, window.innerHeight - 330));

  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label="Colour picker"
      className="fixed z-[60] rounded-lg border border-line-2 bg-[#16181f] text-[11px] shadow-[0_20px_50px_-10px_#000]"
      style={{ left, top, width: PICKER_W }}
    >
      <div className="flex h-9 items-center justify-between border-b border-line px-3">
        <span className="font-semibold text-fg">Solid</span>
        <IconBtn label="Close" onClick={onClose}>
          <Ico d={<path d="M4 4l8 8M12 4l-8 8" />} />
        </IconBtn>
      </div>
      <div className="space-y-3 p-3">
        <div
          className="relative h-36 cursor-crosshair rounded"
          style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex(h, 1, 1)})` }}
          onPointerDown={(e) => track(e, (fx, fy) => set([h, fx, 1 - fy]))}
        >
          <span className="pointer-events-none absolute size-3 -translate-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_#0006]" style={{ left: `${sat * 100}%`, top: `${(1 - val) * 100}%` }} />
        </div>
        <div
          className="relative h-3 cursor-pointer rounded-full"
          style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
          onPointerDown={(e) => track(e, (fx) => set([fx * 360, sat, val]))}
        >
          <span className="pointer-events-none absolute top-1/2 size-3.5 -translate-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_#0006]" style={{ left: `${(h / 360) * 100}%`, background: hsvToHex(h, 1, 1) }} />
        </div>
        <div className="flex h-7 items-center gap-2 rounded bg-white/[0.05] px-2">
          <span className="text-dim">Hex</span>
          <HexInput color={color} onChange={(c) => {
            setHsv(hexToHsv(c));
            onChange(c);
          }} />
          <span className="block size-4 rounded-sm border border-white/20" style={{ background: color }} />
        </div>
        <div>
          <p className="mb-1.5 text-dim">Site colours</p>
          <div className="flex flex-wrap gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => {
                  setHsv(hexToHsv(c));
                  onChange(c);
                }}
                className={`size-5 rounded border ${c.toLowerCase() === color.toLowerCase() ? "border-white ring-2 ring-white/30" : "border-white/15"}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ColorChip({ color, onChange, label }: { color: string; onChange: (c: string) => void; label: string }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [chip, setChip] = useState<HTMLButtonElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  return (
    <>
      <button
        ref={setChip}
        type="button"
        aria-label={label}
        aria-expanded={!!anchor}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor((a) => (a ? null : r));
        }}
        className={`block size-4 shrink-0 rounded-sm border ${anchor ? "border-blue ring-2 ring-blue/40" : "border-white/20"}`}
        style={{ background: color }}
      />
      {anchor && <ColorPicker color={color} anchor={anchor} onChange={onChange} onClose={close} chip={chip} />}
    </>
  );
}

function HexInput({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  return (
    <input
      aria-label="Hex colour"
      spellCheck={false}
      key={color}
      defaultValue={color.replace("#", "").toUpperCase()}
      onBlur={(e) => {
        const h = hex(e.target.value);
        if (h) onChange(h);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="w-[7ch] min-w-0 flex-1 bg-transparent font-mono text-[11px] text-fg uppercase outline-none"
    />
  );
}

function ListRow({ visible, onToggle, onRemove, children, label }: { visible: boolean; onToggle: () => void; onRemove: () => void; children: ReactNode; label: string }) {
  return (
    <div className={`flex items-center gap-1 ${visible ? "" : "opacity-50"}`}>
      <div className="min-w-0 flex-1">{children}</div>
      <IconBtn label={visible ? `Hide ${label}` : `Show ${label}`} onClick={onToggle}>
        <Ico d={visible ? I.eye : I.eyeOff} />
      </IconBtn>
      <IconBtn label={`Remove ${label}`} onClick={onRemove}>
        <Ico d={I.minus} />
      </IconBtn>
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-7 rounded bg-white/[0.05] p-px">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex flex-1 items-center justify-center rounded text-[11px] ${o.value === value ? "bg-white/[0.1] text-fg" : "text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Quarter-arc rotate cursor, turned to face the corner it sits on (deg = corner direction on screen). */
function rotateCursor(deg: number) {
  const turn = Math.round((deg + 45) / 5) * 5;
  const glyph = "<path d='M5 7A12 12 0 0 1 17 19'/><path d='M8.5 3.5 5 7l3.5 3.5'/><path d='M13.5 15.5 17 19l3.5-3.5'/>";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'><g transform='translate(-1.5 1.5) rotate(${turn} 13.5 10.5)'><g stroke='white' stroke-width='4'>${glyph}</g><g stroke='black' stroke-width='1.6'>${glyph}</g></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
}

const DIRS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0],
];

function resizeCursor(hx: number, hy: number, rot: number) {
  const a = ((((Math.atan2(hy, hx) * 180) / Math.PI + rot) % 180) + 180) % 180;
  return a < 22.5 || a >= 157.5 ? "ew-resize" : a < 67.5 ? "nwse-resize" : a < 112.5 ? "ns-resize" : "nesw-resize";
}

/** Figma-style transform handles: corner squares, edge strips and rotation zones outside the corners. */
function TransformHandles({ rot, onResize, onRotate }: { rot: number; onResize: (e: ReactPointerEvent, hx: number, hy: number) => void; onRotate: (e: ReactPointerEvent) => void }) {
  return (
    <>
      {DIRS.filter(([hx, hy]) => hx && hy).map(([hx, hy]) => (
        <span
          key={`r${hx}${hy}`}
          onPointerDown={onRotate}
          className="absolute size-5"
          style={{ cursor: rotateCursor((Math.atan2(hy, hx) * 180) / Math.PI + rot), [hx < 0 ? "left" : "right"]: -22, [hy < 0 ? "top" : "bottom"]: -22 }}
        />
      ))}
      {DIRS.filter(([hx, hy]) => !hx || !hy).map(([hx, hy]) => (
        <span
          key={`e${hx}${hy}`}
          onPointerDown={(e) => onResize(e, hx, hy)}
          className="absolute"
          style={
            hx
              ? { top: 6, bottom: 6, width: 8, [hx < 0 ? "left" : "right"]: -4, cursor: resizeCursor(hx, hy, rot) }
              : { left: 6, right: 6, height: 8, [hy < 0 ? "top" : "bottom"]: -4, cursor: resizeCursor(hx, hy, rot) }
          }
        />
      ))}
      {DIRS.filter(([hx, hy]) => hx && hy).map(([hx, hy]) => (
        <span
          key={`c${hx}${hy}`}
          onPointerDown={(e) => onResize(e, hx, hy)}
          className="absolute size-2.5 border border-blue bg-white"
          style={{ [hx < 0 ? "left" : "right"]: -6, [hy < 0 ? "top" : "bottom"]: -6, cursor: resizeCursor(hx, hy, rot) }}
        />
      ))}
    </>
  );
}

function NodeEditor({ v, active, onNodeDown, onToggle }: { v: Vec; active: [number, number] | null; onNodeDown: (e: ReactPointerEvent, ref: NodeRef) => void; onToggle: (s: number, i: number) => void }) {
  if (!v.paths) return null;
  const P = (x: number, y: number) => ({ x: x * v.w, y: y * v.h });
  const shown = new Set<string>();
  if (active) {
    const sub = v.paths[active[0]];
    const n = sub.length;
    shown.add(`${active[0]}:${active[1]}:in`).add(`${active[0]}:${active[1]}:out`);
    shown.add(`${active[0]}:${(active[1] - 1 + n) % n}:out`).add(`${active[0]}:${(active[1] + 1) % n}:in`);
  }
  return (
    <svg width={v.w} height={v.h} className="absolute inset-0 overflow-visible">
      <path d={nodesPath(v.paths, v.w, v.h)} fill="none" stroke="#3B82F6" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      {v.paths.map((sub, si) =>
        sub.map((p, i) => {
          const a = P(p.x, p.y);
          return (["in", "out"] as const).map((part) => {
            const hx = part === "in" ? p.ix : p.ox;
            const hy = part === "in" ? p.iy : p.oy;
            if (!shown.has(`${si}:${i}:${part}`) || (!hx && !hy)) return null;
            const b = P(p.x + hx, p.y + hy);
            return (
              <g key={`${si}-${i}-${part}`}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#3B82F6" strokeWidth={1} pointerEvents="none" />
                <circle cx={b.x} cy={b.y} r={4} fill="#fff" stroke="#3B82F6" strokeWidth={1.2} className="cursor-pointer" onPointerDown={(e) => onNodeDown(e, { s: si, i, part })} />
              </g>
            );
          });
        }),
      )}
      {v.paths.map((sub, si) =>
        sub.map((p, i) => {
          const a = P(p.x, p.y);
          const on = active?.[0] === si && active?.[1] === i;
          return (
            <rect
              key={`${si}-${i}`}
              x={a.x - 4}
              y={a.y - 4}
              width={8}
              height={8}
              rx={1}
              fill={on ? "#3B82F6" : "#fff"}
              stroke="#3B82F6"
              strokeWidth={1.2}
              className="cursor-move"
              onPointerDown={(e) => onNodeDown(e, { s: si, i, part: "p" })}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onToggle(si, i);
              }}
            />
          );
        }),
      )}
    </svg>
  );
}

function Cursor({ color, label, className, style }: { color: string; label: string; className: string; style?: CSSProperties }) {
  return (
    <div className={`pointer-events-none absolute z-30 ${className}`} style={style} aria-hidden>
      <svg width="22" height="22" viewBox="0 0 24 24">
        <path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill={color} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span className="ml-4 inline-block rounded-md px-2 py-0.5 font-mono text-[11px] font-medium whitespace-nowrap text-white" style={{ background: color }}>
        {label}
      </span>
    </div>
  );
}

const pages = [
  { name: "Home", href: "/" },
  { name: "Docs", href: "/docs" },
  { name: "Showcase", href: "/showcase" },
];

type Sel = { kind: "vec"; id: string } | { kind: "group"; id: string } | { kind: "multi"; ids: string[] } | null;
type Box = { x0: number; y0: number; x1: number; y1: number };
type Drag = {
  mode: "move" | "resize" | "rotate" | "node";
  ids: string[];
  sx: number;
  sy: number;
  start: Vec[];
  hx: number;
  hy: number;
  box: Box | null;
  cx: number;
  cy: number;
  a0: number;
  node: NodeRef | null;
};

export function NotFoundCanvas() {
  const [vecs, setVecsRaw] = useState<Vec[]>(start);
  const [sel, setSel] = useState<Sel>({ kind: "vec", id: "g2-ring" });
  const [open, setOpen] = useState<Record<string, boolean>>({ g1: true, g2: true, g3: true });
  const [lockRatio, setLockRatio] = useState(false);
  const [split, setSplit] = useState(false);
  const [exportFmt, setExportFmt] = useState<"svg" | "png">("svg");
  const history = useRef<Vec[][]>([]);
  const drag = useRef<Drag | null>(null);
  const origin = useRef<HTMLDivElement>(null);
  const marqueeStart = useRef<{ x: number; y: number; base: string[] } | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [edit, setEdit] = useState<{ id: string; node: [number, number] | null } | null>(null);
  const [angle, setAngle] = useState<number | null>(null);

  const setVecs = useCallback((fn: (l: Vec[]) => Vec[], record = true) => {
    setVecsRaw((l) => {
      if (record) history.current = [...history.current.slice(-49), l];
      return fn(l);
    });
  }, []);
  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) setVecsRaw(prev);
  }, []);

  const selectedIds = useMemo(() => (!sel ? [] : sel.kind === "vec" ? [sel.id] : sel.kind === "multi" ? sel.ids : vecs.filter((v) => v.group === sel.id).map((v) => v.id)), [sel, vecs]);
  const v = sel?.kind === "vec" ? (vecs.find((x) => x.id === sel.id) ?? null) : null;
  const groupBox = useMemo(() => {
    if (sel?.kind !== "group" && sel?.kind !== "multi") return null;
    const bs = vecs.filter((x) => selectedIds.includes(x.id) && x.visible).map(bounds);
    if (!bs.length) return null;
    return { x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) };
  }, [sel, vecs, selectedIds]);

  const patch = useCallback((id: string, p: Partial<Vec>, record = true) => setVecs((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)), record), [setVecs]);

  const duplicate = useCallback(() => {
    if (sel?.kind !== "vec") return;
    const src = vecs.find((x) => x.id === sel.id);
    if (!src) return;
    const copy: Vec = { ...structuredClone(src), id: uid(`${src.group}-copy`), name: `${src.name} copy`, x: src.x + 20, y: src.y + 20, locked: false };
    setVecs((l) => {
      const i = l.findIndex((x) => x.id === src.id);
      return [...l.slice(0, i + 1), copy, ...l.slice(i + 1)];
    });
    setSel({ kind: "vec", id: copy.id });
  }, [sel, vecs, setVecs]);
  const remove = useCallback(() => {
    if (!selectedIds.length) return;
    setVecs((l) => l.filter((x) => !selectedIds.includes(x.id)));
    setSel(null);
  }, [selectedIds, setVecs]);

  const editing = edit && sel?.kind === "vec" && sel.id === edit.id ? edit : null;

  const begin = (e: ReactPointerEvent, mode: Drag["mode"], ids: string[], extra: Partial<Drag> = {}) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const movable = vecs.filter((x) => ids.includes(x.id) && !x.locked);
    if (!movable.length) return;
    history.current = [...history.current.slice(-49), vecs];
    drag.current = { mode, ids: movable.map((x) => x.id), sx: e.clientX, sy: e.clientY, start: movable, hx: 0, hy: 0, box: null, cx: 0, cy: 0, a0: 0, node: null, ...extra };
  };

  const beginRotate = (e: ReactPointerEvent, ids: string[], cx: number, cy: number) => {
    const p = local(e);
    begin(e, "rotate", ids, { cx, cy, a0: Math.atan2(p.y - cy, p.x - cx) });
  };

  const enterEdit = useCallback(
    (id: string) => {
      const t = vecs.find((x) => x.id === id);
      if (!t || t.locked) return;
      if (!t.paths) patch(id, { paths: toNodes(t) });
      setSel({ kind: "vec", id });
      setEdit({ id, node: null });
    },
    [vecs, patch],
  );

  const local = (e: ReactPointerEvent) => {
    const r = origin.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };

  const beginMarquee = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("a,button")) return;
    if (edit) {
      setEdit(null);
      return;
    }
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = local(e);
    marqueeStart.current = { ...p, base: e.shiftKey ? selectedIds : [] };
    setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    if (!e.shiftKey) setSel(null);
  };

  const endPointer = () => {
    drag.current = null;
    setAngle(null);
    marqueeStart.current = null;
    setMarquee(null);
  };

  const pickIds = (ids: string[]): Sel => (ids.length === 0 ? null : ids.length === 1 ? { kind: "vec", id: ids[0] } : { kind: "multi", ids });

  const toggleInSelection = (id: string) => setSel(pickIds(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]));

  const onMove = (e: ReactPointerEvent) => {
    const m = marqueeStart.current;
    if (m) {
      const p = local(e);
      const box = { x0: Math.min(m.x, p.x), y0: Math.min(m.y, p.y), x1: Math.max(m.x, p.x), y1: Math.max(m.y, p.y) };
      setMarquee(box);
      const hit = vecs.filter((x) => {
        if (!x.visible) return false;
        const b = bounds(x);
        return b.x0 < box.x1 && b.x1 > box.x0 && b.y0 < box.y1 && b.y1 > box.y0;
      });
      setSel(pickIds([...new Set([...m.base, ...hit.map((x) => x.id)])]));
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.mode === "move") {
      setVecs((l) => l.map((x) => {
        const s = d.start.find((o) => o.id === x.id);
        return s ? { ...x, x: s.x + dx, y: s.y + dy } : x;
      }), false);
      return;
    }
    if (d.mode === "node" && d.node) {
      const s = d.start[0];
      if (s.paths) patch(s.id, { paths: moveNode(s, s.paths, d.node, dx, dy, e.altKey) }, false);
      return;
    }
    if (d.mode === "rotate") {
      const p = local(e);
      let da = ((Math.atan2(p.y - d.cy, p.x - d.cx) - d.a0) * 180) / Math.PI;
      if (e.shiftKey) da = d.start.length === 1 ? Math.round((d.start[0].rotation + da) / 15) * 15 - d.start[0].rotation : Math.round(da / 15) * 15;
      const c = Math.cos(rad(da));
      const sn = Math.sin(rad(da));
      const norm = (r: number) => Math.round((((((r + 180) % 360) + 360) % 360) - 180) * 100) / 100;
      setAngle(norm((d.start.length === 1 ? d.start[0].rotation : 0) + da));
      setVecs((l) => l.map((x) => {
        const s = d.start.find((o) => o.id === x.id);
        if (!s) return x;
        const ox = s.x - d.cx;
        const oy = s.y - d.cy;
        return { ...x, x: d.cx + ox * c - oy * sn, y: d.cy + ox * sn + oy * c, rotation: norm(s.rotation + da) };
      }), false);
      return;
    }
    const uniform = lockRatio || e.shiftKey;
    if (d.box) {
      const b = d.box;
      const bw = b.x1 - b.x0;
      const bh = b.y1 - b.y0;
      let kx = d.hx ? Math.max(8, bw + d.hx * dx) / bw : 1;
      let ky = d.hy ? Math.max(8, bh + d.hy * dy) / bh : 1;
      if (uniform) {
        const k = d.hx && d.hy ? (Math.abs(kx - 1) > Math.abs(ky - 1) ? kx : ky) : d.hx ? kx : ky;
        kx = k;
        ky = k;
      }
      const ax = d.hx > 0 ? b.x0 : d.hx < 0 ? b.x1 : (b.x0 + b.x1) / 2;
      const ay = d.hy > 0 ? b.y0 : d.hy < 0 ? b.y1 : (b.y0 + b.y1) / 2;
      setVecs((l) => l.map((x) => {
        const s = d.start.find((o) => o.id === x.id);
        if (!s) return x;
        const c = Math.cos(rad(s.rotation));
        const sn = Math.sin(rad(s.rotation));
        return { ...x, x: ax + (s.x - ax) * kx, y: ay + (s.y - ay) * ky, w: Math.max(4, s.w * Math.hypot(c * kx, sn * ky)), h: Math.max(4, s.h * Math.hypot(sn * kx, c * ky)) };
      }), false);
      return;
    }
    const s = d.start[0];
    const c = Math.cos(rad(s.rotation));
    const sn = Math.sin(rad(s.rotation));
    const lx = dx * c + dy * sn;
    const ly = -dx * sn + dy * c;
    let w = d.hx ? Math.max(4, s.w + d.hx * lx) : s.w;
    let h = d.hy ? Math.max(4, s.h + d.hy * ly) : s.h;
    if (uniform) {
      const k = d.hx && d.hy ? (Math.abs(w / s.w - 1) > Math.abs(h / s.h - 1) ? w / s.w : h / s.h) : d.hx ? w / s.w : h / s.h;
      w = s.w * k;
      h = s.h * k;
    }
    const gx = (d.hx * (w - s.w)) / 2;
    const gy = (d.hy * (h - s.h)) / 2;
    patch(s.id, { w, h, x: s.x + gx * c - gy * sn, y: s.y + gx * sn + gy * c }, false);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
        return;
      }
      if (editing) {
        const t = vecs.find((x) => x.id === editing.id);
        if (e.key === "Escape" || e.key === "Enter") {
          e.preventDefault();
          setEdit(null);
          return;
        }
        if (!t?.paths || !editing.node) return;
        const [si, ni] = editing.node;
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          if (t.paths[si].length <= 2) return;
          patch(t.id, { paths: t.paths.map((sub, k) => (k === si ? sub.filter((_, j) => j !== ni) : sub)) });
          setEdit({ id: t.id, node: null });
          return;
        }
        const st = e.shiftKey ? 10 : 1;
        const nm: Record<string, [number, number]> = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] };
        if (nm[e.key]) {
          e.preventDefault();
          patch(t.id, { paths: moveNode(t, t.paths, { s: si, i: ni, part: "p" }, nm[e.key][0], nm[e.key][1], true) });
        }
        return;
      }
      if (!selectedIds.length) return;
      if (e.key === "Enter" && sel?.kind === "vec") {
        e.preventDefault();
        enterEdit(sel.id);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove();
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const m = moves[e.key];
      if (m) {
        e.preventDefault();
        setVecs((l) => l.map((x) => (selectedIds.includes(x.id) && !x.locked ? { ...x, x: x.x + m[0], y: x.y + m[1] } : x)));
      }
      if (e.key === "Escape") setSel((s) => (s?.kind === "vec" ? { kind: "group", id: vecs.find((x) => x.id === s.id)?.group ?? "" } : null));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selectedIds, vecs, undo, duplicate, remove, setVecs, editing, sel, patch, enterEdit]);

  const frame = useMemo(() => {
    const bs = vecs.filter((x) => x.visible).map(bounds);
    if (!bs.length) return { x0: -60, y0: -60, x1: 60, y1: 60 };
    return { x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) };
  }, [vecs]);

  const align = (where: "l" | "c" | "r" | "t" | "m" | "b") => {
    if (!v) return;
    const b = bounds(v);
    const dx = where === "l" ? frame.x0 - b.x0 : where === "r" ? frame.x1 - b.x1 : where === "c" ? (frame.x0 + frame.x1) / 2 - v.x : 0;
    const dy = where === "t" ? frame.y0 - b.y0 : where === "b" ? frame.y1 - b.y1 : where === "m" ? (frame.y0 + frame.y1) / 2 - v.y : 0;
    patch(v.id, { x: v.x + dx, y: v.y + dy });
  };

  const exportSelection = async () => {
    const list = sel ? vecs.filter((x) => selectedIds.includes(x.id)) : vecs;
    const shown = list.filter((x) => x.visible);
    if (!shown.length) return;
    const bs = shown.map(bounds);
    const pad = 16;
    const x0 = Math.min(...bs.map((b) => b.x0)) - pad;
    const y0 = Math.min(...bs.map((b) => b.y0)) - pad;
    const w = Math.max(...bs.map((b) => b.x1)) + pad - x0;
    const h = Math.max(...bs.map((b) => b.y1)) + pad - y0;
    const body = shown
      .map((x) => {
        const defs = x.fills.filter((f) => f.type === "linear").map((f) => `<linearGradient id="g${f.id}" x1="0" y1="0" x2="1" y2="1">${f.stops.map((s, i) => `<stop offset="${f.stops.length === 1 ? 0 : i / (f.stops.length - 1)}" stop-color="${s}"/>`).join("")}</linearGradient>`).join("");
        const paths = [...x.fills].reverse().filter((f) => f.visible).map((f) => `<path d="${geometry(x)}" fill-rule="evenodd" fill="${f.type === "linear" ? `url(#g${f.id})` : f.color}" fill-opacity="${f.opacity / 100}"/>`).join("");
        const sx = x.flipX ? -1 : 1;
        const sy = x.flipY ? -1 : 1;
        return `<defs>${defs}</defs><g opacity="${x.opacity / 100}" transform="translate(${x.x - x0} ${x.y - y0}) rotate(${x.rotation}) scale(${sx} ${sy}) translate(${-x.w / 2} ${-x.h / 2})">${paths}</g>`;
      })
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
    const name = sel?.kind === "vec" ? (v?.name ?? "vector") : sel?.kind === "group" ? `digit-${GROUPS.find((g) => g.id === sel.id)?.name}` : sel?.kind === "multi" ? "selection" : "404";
    let url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    if (exportFmt === "png") {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * 2);
      canvas.height = Math.round(h * 2);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      url = canvas.toDataURL("image/png");
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.toLowerCase().replace(/\s+/g, "-")}.${exportFmt}`;
    a.click();
  };

  const groupSelected = sel?.kind === "group" ? sel.id : null;

  return (
    <div className="relative flex h-[calc(100dvh-4rem)] min-h-[620px]">
      <aside className="z-10 hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-panel/95 py-2 text-[12px] lg:flex">
        <p className="px-4 pt-1 pb-2 text-[11px] font-semibold text-fg">Layers</p>
        <div className="flex items-center gap-1.5 px-4 py-1.5 text-fg">
          <span className="font-mono text-[11px] text-dim">#</span> Frame 404
        </div>
        {GROUPS.map((g) => {
          const kids = vecs.filter((x) => x.group === g.id);
          if (!kids.length) return null;
          return (
            <div key={g.id}>
              <div className={`group/row flex items-center pr-2 pl-5 ${groupSelected === g.id ? "bg-blue/20 text-fg" : "text-muted hover:bg-white/[0.04]"}`}>
                <button type="button" aria-label={open[g.id] ? "Collapse" : "Expand"} onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))} className="grid size-5 place-items-center text-dim">
                  <svg width="8" height="8" viewBox="0 0 10 10" className={`transition ${open[g.id] ? "rotate-90" : ""}`} aria-hidden>
                    <path d="M3 1.5 7 5l-4 3.5z" fill="currentColor" />
                  </svg>
                </button>
                <button type="button" onClick={() => setSel({ kind: "group", id: g.id })} className="flex flex-1 items-center gap-2 py-1.5 text-left">
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                    <rect x="1" y="1" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeDasharray="2 1.5" />
                  </svg>
                  Digit {g.name}
                </button>
              </div>
              {open[g.id] &&
                kids.map((x) => {
                  const on = (sel?.kind === "vec" || sel?.kind === "multi") && selectedIds.includes(x.id);
                  return (
                    <div key={x.id} className={`group/row flex items-center pr-2 pl-11 ${on ? "bg-blue/20 text-fg" : groupSelected === g.id ? "bg-blue/[0.08] text-muted" : "text-muted hover:bg-white/[0.04]"}`}>
                      <button type="button" onClick={(e) => (e.shiftKey ? toggleInSelection(x.id) : setSel({ kind: "vec", id: x.id }))} className={`flex min-w-0 flex-1 items-center gap-2 py-1 text-left ${x.visible ? "" : "opacity-40"}`}>
                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                          <path d="M2 10 10 2M2 10h3M10 2v3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                        </svg>
                        <span className="truncate">{x.name}</span>
                      </button>
                      <span className={`flex items-center ${x.locked || !x.visible ? "" : "opacity-0 group-hover/row:opacity-100"}`}>
                        <IconBtn label={x.locked ? "Unlock" : "Lock"} onClick={() => patch(x.id, { locked: !x.locked })}>
                          <Ico d={x.locked ? I.lock : I.unlock} />
                        </IconBtn>
                        <IconBtn label={x.visible ? "Hide" : "Show"} onClick={() => patch(x.id, { visible: !x.visible })}>
                          <Ico d={x.visible ? I.eye : I.eyeOff} />
                        </IconBtn>
                      </span>
                    </div>
                  );
                })}
            </div>
          );
        })}
        <p className="mt-5 px-4 pb-2 text-[11px] font-semibold text-fg">Pages</p>
        {pages.map((p) => (
          <Link key={p.name} href={p.href} className="px-4 py-1.5 text-muted hover:bg-white/[0.04] hover:text-fg">
            {p.name}
          </Link>
        ))}
        <div className="flex items-center gap-2 bg-coral/10 px-4 py-1.5 text-coral">
          <span className="line-through decoration-coral/60">This page</span>
          <span className="ml-auto font-mono text-[10px]">missing</span>
        </div>
      </aside>

      <section className="relative flex-1 touch-none overflow-hidden" onPointerMove={onMove} onPointerUp={endPointer} onPointerDown={beginMarquee}>
        <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(#ffffff26 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
        <div className="pointer-events-none absolute top-[36%] left-1/2 h-[420px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,#ff5a4e2a,transparent)] blur-3xl" />

        <div ref={origin} className="absolute top-[36%] left-1/2 h-0 w-0">
          {vecs.map((x) => {
            if (!x.visible) return null;
            const on = sel?.kind === "vec" && sel.id === x.id;
            return (
              <div
                key={x.id}
                onPointerDown={(e) => {
                  if (editing?.id === x.id) {
                    e.stopPropagation();
                    setEdit({ id: x.id, node: null });
                    return;
                  }
                  if (e.shiftKey) {
                    e.stopPropagation();
                    toggleInSelection(x.id);
                    return;
                  }
                  if (sel?.kind !== "vec" && selectedIds.includes(x.id)) {
                    begin(e, "move", selectedIds);
                    return;
                  }
                  setSel({ kind: "vec", id: x.id });
                  begin(e, "move", [x.id]);
                }}
                onDoubleClick={() => enterEdit(x.id)}
                className={`group absolute select-none ${x.locked || editing?.id === x.id ? "cursor-default" : "cursor-move"}`}
                style={{ left: x.x - x.w / 2, top: x.y - x.h / 2, width: x.w, height: x.h, transform: `rotate(${x.rotation}deg)`, opacity: x.opacity / 100 }}
              >
                <div className="relative" style={{ transform: `scale(${x.flipX ? -1 : 1}, ${x.flipY ? -1 : 1})` }}>
                  <VecArt v={x} />
                  {editing?.id === x.id && (
                    <NodeEditor
                      v={x}
                      active={editing.node}
                      onNodeDown={(e, ref) => {
                        setEdit({ id: x.id, node: [ref.s, ref.i] });
                        begin(e, "node", [x.id], { node: ref });
                      }}
                      onToggle={(si, i) => {
                        const pt = x.paths![si][i];
                        patch(x.id, { paths: setCorner(x, x.paths!, si, i, !(pt.ix || pt.iy || pt.ox || pt.oy)) });
                      }}
                    />
                  )}
                </div>
                {!on && <div className={`pointer-events-none absolute -inset-px border border-blue/70 ${sel?.kind === "multi" && selectedIds.includes(x.id) ? "block" : "hidden group-hover:block"}`} />}
                {on && editing?.id !== x.id && (
                  <>
                    <div className="pointer-events-none absolute -inset-px border-[1.5px] border-blue" />
                    {!x.locked && (
                      <TransformHandles
                        rot={x.rotation}
                        onResize={(e, hx, hy) => begin(e, "resize", [x.id], { hx, hy })}
                        onRotate={(e) => beginRotate(e, [x.id], x.x, x.y)}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
          {v && v.visible && (
            <span className="pointer-events-none absolute -translate-x-1/2 rounded bg-blue px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-white" style={{ left: v.x, top: bounds(v).y1 + 10 }}>
              {editing ? "Editing nodes · Enter to finish" : angle !== null ? `${angle}°` : `${Math.round(v.w)} × ${Math.round(v.h)}`}
            </span>
          )}
          {groupBox && (sel?.kind === "group" || sel?.kind === "multi") && (
            <>
              <div
                onPointerDown={(e) => begin(e, "move", selectedIds)}
                className="absolute cursor-move border-[1.5px] border-blue"
                style={{ left: groupBox.x0 - 6, top: groupBox.y0 - 6, width: groupBox.x1 - groupBox.x0 + 12, height: groupBox.y1 - groupBox.y0 + 12 }}
              >
                <TransformHandles
                  rot={0}
                  onResize={(e, hx, hy) => begin(e, "resize", selectedIds, { hx, hy, box: groupBox })}
                  onRotate={(e) => beginRotate(e, selectedIds, (groupBox.x0 + groupBox.x1) / 2, (groupBox.y0 + groupBox.y1) / 2)}
                />
              </div>
              <span className="pointer-events-none absolute -translate-x-1/2 rounded bg-blue px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-white" style={{ left: (groupBox.x0 + groupBox.x1) / 2, top: groupBox.y1 + 14 }}>
                {angle !== null ? `${angle}°` : sel.kind === "group" ? "Group" : `${selectedIds.length} layers`} · {Math.round(groupBox.x1 - groupBox.x0)} × {Math.round(groupBox.y1 - groupBox.y0)}
              </span>
            </>
          )}
          <Cursor color="#3B82F6" label="agent" className="animate-[nf-agent_11s_ease-in-out_infinite]" style={{ left: -300, top: 100 }} />
          <div
            className="pointer-events-none absolute z-30 hidden animate-[nf-agent_11s_ease-in-out_infinite] rounded-lg border border-line-2 bg-panel px-3 py-2 text-left font-mono text-xs whitespace-nowrap sm:block"
            style={{ left: -330, top: 150 }}
            aria-hidden
          >
            <span className="text-blue">&gt;</span> get_design_context
            <br />
            <span className="text-coral">Error: node not found</span>
          </div>
          {marquee && (
            <div
              className="pointer-events-none absolute z-20 border border-blue bg-blue/10"
              style={{ left: marquee.x0, top: marquee.y0, width: marquee.x1 - marquee.x0, height: marquee.y1 - marquee.y0 }}
            />
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-24 px-4 text-center">
          <p className="font-mono text-xs text-dim">Every piece is a vector. Select, resize, rotate and reshape it.</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">This frame isn&apos;t on the canvas</h1>
          <p className="mx-auto mt-3 max-w-md text-muted">The link points to a layer that was moved, renamed or never drawn.</p>
          <div className="pointer-events-auto mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/" className="rounded-xl bg-coral px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_30px_-8px_#ff5a4e] transition hover:bg-[#ff6f64]">
              Back to home
            </Link>
            <Link href="/docs" className="rounded-xl border border-line-2 bg-white/[0.02] px-5 py-2.5 text-sm font-medium text-fg transition hover:bg-white/[0.06]">
              Read the docs
            </Link>
          </div>
        </div>

        <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-line-2 bg-panel/95 p-1.5 shadow-[0_20px_60px_-20px_#000] backdrop-blur">
          <span className="grid size-8 place-items-center rounded-lg">
            <LogoMark size={18} />
          </span>
          <span className="grid size-8 place-items-center rounded-lg bg-blue text-white" title="Move">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
              <path d="M4 3l7 17 2.4-7.1L20 10z" />
            </svg>
          </span>
          <button type="button" onClick={undo} className="rounded-lg px-2.5 py-1.5 font-mono text-xs text-muted hover:bg-white/[0.06] hover:text-fg" title="Undo (⌘Z)">
            Undo
          </button>
          <button
            type="button"
            onClick={() => {
              history.current = [...history.current, vecs];
              setVecsRaw(start());
              setSel({ kind: "vec", id: "g2-ring" });
            }}
            className="rounded-lg px-2.5 py-1.5 font-mono text-xs text-muted hover:bg-white/[0.06] hover:text-fg"
          >
            Reset
          </button>
          <span className="mx-1 h-5 w-px bg-line-2" />
          <span className="px-2 font-mono text-xs text-dim">100%</span>
        </div>
      </section>

      <aside className="z-10 hidden w-[264px] shrink-0 flex-col overflow-y-auto border-l border-line bg-panel/95 text-[12px] md:flex">
        <div className="sticky top-0 z-10 flex h-10 shrink-0 items-center gap-4 border-b border-line bg-panel px-3 text-[12px]">
          <span className="font-semibold text-fg">Design</span>
          <span className="text-dim">Prototype</span>
          <span className="ml-auto font-mono text-[11px] text-dim">100%</span>
        </div>

        {v ? (
          <>
            {editing && v.paths && (
              <Section
                title={<span className="text-blue">Edit nodes</span>}
                actions={
                  <button type="button" onClick={() => setEdit(null)} className="rounded bg-blue px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue/90">
                    Done
                  </button>
                }
              >
                {editing.node ? (
                  (() => {
                    const [si, ni] = editing.node;
                    const pt = v.paths[si]?.[ni];
                    if (!pt) return null;
                    const smooth = !!(pt.ix || pt.iy || pt.ox || pt.oy);
                    const setPt = (q: Partial<Pt>) => patch(v.id, { paths: v.paths!.map((sub, k) => (k !== si ? sub : sub.map((o, j) => (j === ni ? { ...o, ...q } : o)))) });
                    return (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <Num label="X" title="Node X" value={pt.x * v.w} onChange={(x) => setPt({ x: x / v.w })} />
                          <Num label="Y" title="Node Y" value={pt.y * v.h} onChange={(y) => setPt({ y: y / v.h })} />
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="flex-1">
                            <Segmented
                              label="Corner type"
                              value={smooth ? "smooth" : "sharp"}
                              onChange={(t) => patch(v.id, { paths: setCorner(v, v.paths!, si, ni, t === "smooth") })}
                              options={[{ value: "sharp", label: "Sharp" }, { value: "smooth", label: "Smooth" }]}
                            />
                          </div>
                          <IconBtn
                            label="Delete node"
                            onClick={() => {
                              if (v.paths![si].length <= 2) return;
                              patch(v.id, { paths: v.paths!.map((sub, k) => (k === si ? sub.filter((_, j) => j !== ni) : sub)) });
                              setEdit({ id: v.id, node: null });
                            }}
                          >
                            <Ico d={I.trash} />
                          </IconBtn>
                        </div>
                      </>
                    );
                  })()
                ) : (
                  <p className="text-[11px] leading-relaxed text-muted">Drag a node or its handles. Double-click a node to switch sharp and smooth. Alt breaks mirrored handles.</p>
                )}
              </Section>
            )}
            <Section
              title={
                <span className="flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                    <path d="M2 10 10 2M2 10h3M10 2v3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                  </svg>
                  {v.name}
                  <span className="font-normal text-dim">· Vector</span>
                </span>
              }
              actions={
                <>
                  <IconBtn label="Duplicate (⌘D)" onClick={duplicate}>
                    <Ico d={I.copy} />
                  </IconBtn>
                  <IconBtn label="Delete" onClick={remove}>
                    <Ico d={I.trash} />
                  </IconBtn>
                </>
              }
            >
              <div className="flex justify-between" role="group" aria-label="Align to frame">
                {([
                  ["l", "Align left", "M3 2v12M5.5 5h7v2.5h-7zM5.5 9h4.5v2.5H5.5z"],
                  ["c", "Align horizontal centres", "M8 2v12M4 5h8v2.5H4zM5.5 9h5v2.5h-5z"],
                  ["r", "Align right", "M13 2v12M3.5 5h7v2.5h-7zM6 9h4.5v2.5H6z"],
                  ["t", "Align top", "M2 3h12M5 5.5v7h2.5v-7zM9 5.5v4.5h2.5V5.5z"],
                  ["m", "Align vertical centres", "M2 8h12M5 4v8h2.5V4zM9 5.5v5h2.5v-5z"],
                  ["b", "Align bottom", "M2 13h12M5 3.5v7h2.5v-7zM9 6v4.5h2.5V6z"],
                ] as const).map(([k, label, d]) => (
                  <IconBtn key={k} label={label} onClick={() => align(k)}>
                    <Ico d={<path d={d} />} />
                  </IconBtn>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Num label="X" title="X position" value={v.x} onChange={(x) => patch(v.id, { x })} />
                <Num label="Y" title="Y position" value={v.y} onChange={(y) => patch(v.id, { y })} />
              </div>
              <div className="flex items-center gap-1">
                <div className="grid flex-1 grid-cols-2 gap-2">
                  <Num label="W" title="Width" min={16} value={v.w} onChange={(w) => patch(v.id, lockRatio ? { w, h: Math.max(16, (w / v.w) * v.h) } : { w })} />
                  <Num label="H" title="Height" min={16} value={v.h} onChange={(h) => patch(v.id, lockRatio ? { h, w: Math.max(16, (h / v.h) * v.w) } : { h })} />
                </div>
                <IconBtn label="Constrain proportions" pressed={lockRatio} onClick={() => setLockRatio((x) => !x)}>
                  <Ico d={I.link} />
                </IconBtn>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex-1">
                  <Num label={<Ico d={I.rotate} />} title="Rotation" suffix="°" min={-180} max={180} value={v.rotation} onChange={(rotation) => patch(v.id, { rotation })} />
                </div>
                <IconBtn label="Flip horizontal" pressed={v.flipX} onClick={() => patch(v.id, { flipX: !v.flipX })}>
                  <Ico d={I.flipH} />
                </IconBtn>
                <IconBtn label="Flip vertical" pressed={v.flipY} onClick={() => patch(v.id, { flipY: !v.flipY })}>
                  <Ico d={I.flipV} />
                </IconBtn>
              </div>
            </Section>

            <Section
              title="Layer"
              actions={
                <>
                  <IconBtn label={v.locked ? "Unlock" : "Lock"} pressed={v.locked} onClick={() => patch(v.id, { locked: !v.locked })}>
                    <Ico d={v.locked ? I.lock : I.unlock} />
                  </IconBtn>
                  <IconBtn label={v.visible ? "Hide" : "Show"} onClick={() => patch(v.id, { visible: !v.visible })}>
                    <Ico d={v.visible ? I.eye : I.eyeOff} />
                  </IconBtn>
                </>
              }
            >
              <div className="flex items-center gap-1">
                <div className="grid flex-1 grid-cols-2 gap-2">
                  <Num label="%" title="Opacity" min={0} max={100} value={v.opacity} onChange={(opacity) => patch(v.id, { opacity })} />
                  {!split && !v.paths && <Num label="◜" title="Corner radius" min={0} value={v.radii[0]} onChange={(r) => patch(v.id, { radii: [r, r, r, r] })} />}
                </div>
                {!v.paths && (
                  <IconBtn label="Independent corners" pressed={split} onClick={() => setSplit((x) => !x)}>
                    <Ico d={I.corners} />
                  </IconBtn>
                )}
              </div>
              {v.paths && (
                <div className="flex h-7 items-center justify-between rounded bg-white/[0.05] px-2 text-[11px] text-muted">
                  Custom path · {v.paths.reduce((n, sub) => n + sub.length, 0)} nodes
                  <button
                    type="button"
                    onClick={() => {
                      setEdit(null);
                      patch(v.id, { paths: null });
                    }}
                    className="text-blue hover:underline"
                  >
                    Reset shape
                  </button>
                </div>
              )}
              {split && !v.paths && (
                <div className="grid grid-cols-2 gap-2">
                  {(["◜", "◝", "◞", "◟"] as const).map((g, i) => (
                    <Num key={g} label={g} title={["Top left", "Top right", "Bottom right", "Bottom left"][i] + " radius"} min={0} value={v.radii[i]} onChange={(r) => patch(v.id, { radii: v.radii.map((x, k) => (k === i ? r : x)) as Vec["radii"] })} />
                  ))}
                </div>
              )}
            </Section>

            <Section
              title="Fill"
              actions={
                <IconBtn label="Add fill" onClick={() => patch(v.id, { fills: [solid("#F2F3F6"), ...v.fills] })}>
                  <Ico d={I.plus} />
                </IconBtn>
              }
            >
              {v.fills.map((f, i) => {
                const setF = (p: Partial<Fill>) => patch(v.id, { fills: v.fills.map((x, k) => (k === i ? { ...x, ...p } : x)) });
                return (
                  <ListRow key={f.id} label="fill" visible={f.visible} onToggle={() => setF({ visible: !f.visible })} onRemove={() => patch(v.id, { fills: v.fills.filter((_, k) => k !== i) })}>
                    <div className="space-y-1.5">
                      <div className="flex h-7 items-center gap-2 rounded bg-white/[0.05] px-1.5">
                        {f.type === "solid" ? (
                          <>
                            <ColorChip label="Edit fill" color={f.color} onChange={(color) => setF({ color })} />
                            <HexInput color={f.color} onChange={(color) => setF({ color })} />
                          </>
                        ) : (
                          <>
                            <span className="block size-4 rounded-sm border border-white/20" style={{ background: `linear-gradient(135deg, ${f.stops.join(", ")})` }} />
                            <span className="flex-1 text-[11px] text-fg">Linear</span>
                          </>
                        )}
                        <input
                          aria-label="Fill opacity"
                          value={f.opacity}
                          inputMode="numeric"
                          onChange={(e) => setF({ opacity: Math.min(100, Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0)) })}
                          className="w-8 border-l border-white/10 bg-transparent pl-1.5 text-right font-mono text-[11px] text-fg outline-none"
                        />
                        <span className="text-[11px] text-dim">%</span>
                      </div>
                      <Segmented label="Fill type" value={f.type} onChange={(type) => setF({ type, stops: type === "linear" && f.stops.length < 2 ? [f.color, "#3B82F6"] : f.stops })} options={[{ value: "solid", label: "Solid" }, { value: "linear", label: "Linear" }]} />
                      {f.type === "linear" && (
                        <div className="flex items-center gap-2 px-0.5 text-[11px] text-dim">
                          Stops
                          {f.stops.map((s, si) => <ColorChip key={si} label={`Stop ${si + 1}`} color={s} onChange={(c) => setF({ stops: f.stops.map((x, k) => (k === si ? c : x)) })} />)}
                        </div>
                      )}
                    </div>
                  </ListRow>
                );
              })}
            </Section>

            <Section
              title="Stroke"
              actions={
                <IconBtn label="Add stroke" onClick={() => patch(v.id, { strokes: [...v.strokes, { id: uid("s"), color: "#F2F3F6", weight: 2, align: "inside", visible: true }] })}>
                  <Ico d={I.plus} />
                </IconBtn>
              }
            >
              {v.strokes.map((s, i) => {
                const setS = (p: Partial<Stroke>) => patch(v.id, { strokes: v.strokes.map((x, k) => (k === i ? { ...x, ...p } : x)) });
                return (
                  <ListRow key={s.id} label="stroke" visible={s.visible} onToggle={() => setS({ visible: !s.visible })} onRemove={() => patch(v.id, { strokes: v.strokes.filter((_, k) => k !== i) })}>
                    <div className="space-y-1.5">
                      <div className="flex h-7 items-center gap-2 rounded bg-white/[0.05] px-1.5">
                        <ColorChip label="Edit stroke" color={s.color} onChange={(color) => setS({ color })} />
                        <HexInput color={s.color} onChange={(color) => setS({ color })} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Num label="≡" title="Stroke weight" min={0} value={s.weight} onChange={(weight) => setS({ weight })} />
                        <select
                          aria-label="Stroke position"
                          value={s.align}
                          onChange={(e) => setS({ align: e.target.value as Stroke["align"] })}
                          className="h-7 rounded bg-white/[0.05] px-1.5 text-[11px] text-fg outline-none"
                        >
                          <option value="inside">Inside</option>
                          <option value="center">Center</option>
                          <option value="outside">Outside</option>
                        </select>
                      </div>
                    </div>
                  </ListRow>
                );
              })}
            </Section>

            <Section
              title="Effects"
              actions={
                <IconBtn label="Add effect" onClick={() => patch(v.id, { effects: [...v.effects, { id: uid("e"), type: "drop", x: 0, y: 8, blur: 24, color: "#00000099", visible: true }] })}>
                  <Ico d={I.plus} />
                </IconBtn>
              }
            >
              {v.effects.map((fx, i) => {
                const setE = (p: Partial<Effect>) => patch(v.id, { effects: v.effects.map((x, k) => (k === i ? { ...x, ...p } : x)) });
                return (
                  <ListRow key={fx.id} label="effect" visible={fx.visible} onToggle={() => setE({ visible: !fx.visible })} onRemove={() => patch(v.id, { effects: v.effects.filter((_, k) => k !== i) })}>
                    <div className="space-y-1.5">
                      <select
                        aria-label="Effect type"
                        value={fx.type}
                        onChange={(e) => setE({ type: e.target.value as Effect["type"] })}
                        className="h-7 w-full rounded bg-white/[0.05] px-1.5 text-[11px] text-fg outline-none"
                      >
                        <option value="drop">Drop shadow</option>
                        <option value="blur">Layer blur</option>
                      </select>
                      <div className="grid grid-cols-3 gap-1.5">
                        {fx.type === "drop" && <Num label="X" title="Shadow X" value={fx.x} onChange={(x) => setE({ x })} />}
                        {fx.type === "drop" && <Num label="Y" title="Shadow Y" value={fx.y} onChange={(y) => setE({ y })} />}
                        <Num label="B" title="Blur" min={0} value={fx.blur} onChange={(blur) => setE({ blur })} />
                      </div>
                    </div>
                  </ListRow>
                );
              })}
            </Section>

            <Section title="Export">
              <div className="flex gap-2">
                <select aria-label="Export format" value={exportFmt} onChange={(e) => setExportFmt(e.target.value as "svg" | "png")} className="h-7 flex-1 rounded bg-white/[0.05] px-1.5 text-[11px] text-fg outline-none">
                  <option value="svg">SVG</option>
                  <option value="png">PNG · 2x</option>
                </select>
              </div>
              <button type="button" onClick={exportSelection} className="h-7 w-full rounded border border-line-2 text-[11px] text-fg hover:bg-white/[0.06]">
                Export {v.name}
              </button>
            </Section>
          </>
        ) : (sel?.kind === "group" || sel?.kind === "multi") && groupBox ? (
          <>
            <Section
              title={
                sel.kind === "group" ? (
                  <span>Digit {GROUPS.find((g) => g.id === sel.id)?.name} <span className="font-normal text-dim">· Group</span></span>
                ) : (
                  <span>{selectedIds.length} layers <span className="font-normal text-dim">· Mixed</span></span>
                )
              } actions={<IconBtn label="Delete" onClick={remove}><Ico d={I.trash} /></IconBtn>}>
              <div className="grid grid-cols-2 gap-2">
                <Num label="X" title="Group X" value={(groupBox.x0 + groupBox.x1) / 2} onChange={(x) => {
                  const d = x - (groupBox.x0 + groupBox.x1) / 2;
                  setVecs((l) => l.map((o) => (selectedIds.includes(o.id) && !o.locked ? { ...o, x: o.x + d } : o)));
                }} />
                <Num label="Y" title="Group Y" value={(groupBox.y0 + groupBox.y1) / 2} onChange={(y) => {
                  const d = y - (groupBox.y0 + groupBox.y1) / 2;
                  setVecs((l) => l.map((o) => (selectedIds.includes(o.id) && !o.locked ? { ...o, y: o.y + d } : o)));
                }} />
                <Num label="W" title="Group width" value={groupBox.x1 - groupBox.x0} onChange={() => {}} />
                <Num label="H" title="Group height" value={groupBox.y1 - groupBox.y0} onChange={() => {}} />
              </div>
            </Section>
            <Section title="Export">
              <select aria-label="Export format" value={exportFmt} onChange={(e) => setExportFmt(e.target.value as "svg" | "png")} className="h-7 w-full rounded bg-white/[0.05] px-1.5 text-[11px] text-fg outline-none">
                <option value="svg">SVG</option>
                <option value="png">PNG · 2x</option>
              </select>
              <button type="button" onClick={exportSelection} className="h-7 w-full rounded border border-line-2 text-[11px] text-fg hover:bg-white/[0.06]">
                Export {sel.kind === "group" ? "digit" : "selection"}
              </button>
            </Section>
          </>
        ) : (
          <>
            <Section title="Frame 404">
              <p className="text-[12px] leading-relaxed text-muted">Click a piece of the 404 to select its vector. Double-click it or press Enter to edit its nodes. Drag on the canvas to select several, Shift-click to add or remove.</p>
            </Section>
            <Section title="Export">
              <select aria-label="Export format" value={exportFmt} onChange={(e) => setExportFmt(e.target.value as "svg" | "png")} className="h-7 w-full rounded bg-white/[0.05] px-1.5 text-[11px] text-fg outline-none">
                <option value="svg">SVG</option>
                <option value="png">PNG · 2x</option>
              </select>
              <button type="button" onClick={exportSelection} className="h-7 w-full rounded border border-line-2 text-[11px] text-fg hover:bg-white/[0.06]">
                Export your 404
              </button>
            </Section>
          </>
        )}
        <p className="mt-auto px-3 py-3 font-mono text-[10px] leading-relaxed text-dim">⌘Z undo · ⌘D duplicate · ⌫ delete · Enter edit nodes · Shift constrain · Alt break handles · Esc up a level</p>
      </aside>
    </div>
  );
}

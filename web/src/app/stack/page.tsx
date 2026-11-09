import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CopyCommand } from "@/components/copy-command";
import { DeviceFrame } from "@/components/device-frame";
import { brandPaths } from "@/components/brand-paths";
import { ArrowRight, GitHubIcon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { StackLogo, StackMark } from "@/components/stack-logo";
import { Timeline } from "@/components/timeline";
import { cue } from "@/lib/cue";
import { pageMeta } from "@/lib/seo";
import { site, stack } from "@/lib/site";

export const metadata: Metadata = pageMeta({
  title: "Stack",
  path: "/stack",
  image: { url: "/stack/og.png", width: 1200, height: 630 },
  description:
    "Stack is the add-on for figmcp that takes your Figma design to production: data model, backend, infra, verified deploys and day-two operations. Node.js, Python, Go and Rust, from one spec.",
});

type Tone = "blue" | "coral" | "sun";
const TONE = {
  blue: { text: "text-blue", line: "bg-blue/60", border: "border-blue/30", soft: "bg-blue/10" },
  coral: { text: "text-coral", line: "bg-coral/60", border: "border-coral/30", soft: "bg-coral/10" },
  sun: { text: "text-sun", line: "bg-sun/60", border: "border-sun/30", soft: "bg-sun/10" },
} as const;
const DOTS = ["bg-coral", "bg-sun", "bg-blue"];

function Eyebrow({ children, tone = "blue" }: { children: ReactNode; tone?: Tone }) {
  return (
    <div className={`inline-flex items-center gap-2 font-mono text-xs tracking-wider uppercase ${TONE[tone].text}`}>
      <span className={`h-px w-6 ${TONE[tone].line}`} />
      {children}
    </div>
  );
}

function SectionHead({ eyebrow, title, text, tone }: { eyebrow: string; title: ReactNode; text?: ReactNode; tone?: Tone }) {
  return (
    <Reveal className="mx-auto max-w-3xl text-center">
      <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
      <h2 className="text-gradient mt-4 text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-6xl">{title}</h2>
      {text && <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-pretty text-muted">{text}</p>}
    </Reveal>
  );
}

function Check({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-ok ${className}`} aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

const UPTIME = Array.from({ length: 42 }, (_, i) => (i === 17 ? "warn" : "ok"));

function Uptime({ bars, height }: { bars: number; height: string }) {
  return (
    <div className={`flex items-end gap-[3px] ${height}`}>
      {UPTIME.slice(0, bars).map((s, i) => (
        <span key={i} className={`w-full rounded-[2px] ${s === "ok" ? "bg-ok/70" : "bg-warn"}`} style={{ height: `${s === "ok" ? 65 + ((i * 37) % 35) : 42}%` }} />
      ))}
    </div>
  );
}

// One 16 s run, played once when the board scrolls into view and held on the last frame.
// Board coordinates are in px on a 1480 × 880 canvas; times are fractions of the run.
const RUN = 16000;
const LINE = "#c9ccd4";
const CURSOR_PATH = "M570 90L68 304L301 477L700 212L700 392L710 632L710 772L1400 212";

function Cursor() {
  return (
    <g>
      <path d="M0 0 L0 17 L4.6 12.6 L7.6 19.4 L10.6 18.1 L7.7 11.5 L14 11.3 Z" fill="#3B82F6" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="13" y="18" width="50" height="22" rx="11" fill="#3B82F6" />
      <text x="38" y="33" textAnchor="middle" fontSize="12" fontWeight="600" fill="#fff" fontFamily="inherit">
        Stack
      </text>
    </g>
  );
}

type Field = { key: string; type: string; note: string };

const MODEL: Field[] = [
  { key: "id", type: "uuid", note: "" },
  { key: "number", type: "string", note: '"TK-20517"' },
  { key: "status", type: "OrderStatus", note: '"Confirmed"' },
  { key: "placed_at", type: "timestamp", note: '"4:32 PM"' },
  { key: "items", type: "OrderItem[]", note: "3 products" },
  { key: "total", type: "Money", note: '"AED 5,747"' },
  { key: "item_count", type: "int", note: '"3 items"' },
  { key: "progress", type: "Step[]", note: "4 steps" },
  { key: "delivery", type: "Delivery", note: '"by 9 PM"' },
  { key: "links", type: "Links", note: "buttons" },
];

const MODEL_TOP = 108;
const lineY = (i: number) => MODEL_TOP + 58 + 20 * i;
const MODEL_LEFT = 480;

type Mapping = { box: [number, number, number, number]; lines: number[]; color: string };

// Regions of the first order card on the phone, and the model lines they become.
const MAPPINGS: Mapping[] = [
  { box: [80, 317, 155, 328], lines: [2], color: "#FF5A4E" },
  { box: [240, 320, 290, 335], lines: [3], color: "#FFC93C" },
  { box: [80, 330, 162, 340], lines: [4], color: "#3B82F6" },
  { box: [80, 348, 187, 382], lines: [5], color: "#4ade80" },
  { box: [195, 370, 278, 381], lines: [6, 7], color: "#a78bfa" },
  { box: [80, 389, 290, 405], lines: [8], color: "#FF5A4E" },
  { box: [80, 414, 229, 424], lines: [9], color: "#FFC93C" },
  { box: [80, 440, 290, 465], lines: [10], color: "#3B82F6" },
];
const mapAt = (k: number) => 0.26 + 0.035 * k;

const STEPS = [
  ["Select a screen", 0.02],
  ["Infer the data model", 0.2],
  ["Generate Go handlers", 0.57],
  ["Call the API", 0.8],
] as const;

function StepBar({ animated }: { animated: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {STEPS.map(([label, at], i) => (
        <span key={label} className="flex items-center gap-2">
          {i > 0 && <span className="h-px w-6 bg-white/15" />}
          <span
            {...(animated ? cue(at) : {})}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] py-1 pr-3 pl-1 text-[12.5px] font-medium text-[#e6e8ee]"
          >
            <span className="grid size-5 place-items-center rounded-full bg-[#3B82F6] text-[11px] text-white">{i + 1}</span>
            {label}
          </span>
        </span>
      ))}
    </div>
  );
}

function CodeBlock({ title, meta, children }: { title: ReactNode; meta: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[10px] bg-[#1e1f26] shadow-[0_14px_30px_-8px_#000000a0] ring-1 ring-white/10">
      <div className="flex h-9 items-center justify-between border-b border-white/[0.07] px-4 text-[11.5px]">
        <span className="font-medium text-[#d6d8de]">{title}</span>
        <span className="text-[#7c818c]">{meta}</span>
      </div>
      {children}
    </div>
  );
}

function ModelCode({ animated }: { animated: boolean }) {
  const lineAt = (i: number) => {
    const k = MAPPINGS.findIndex((m) => m.lines.includes(i));
    return k < 0 ? 0.23 : mapAt(k) + 0.02 + MAPPINGS[k].lines.indexOf(i) * 0.01;
  };
  const a = (at: number) => (animated ? cue(at) : {});
  return (
    <CodeBlock title="Order" meta="model · from My orders">
      <div className="px-4 py-3 font-mono text-[12px] leading-5">
        <div {...a(0.22)} className="text-[#c792ea]">
          model <span className="text-[#ffcb6b]">Order</span> <span className="text-[#d6deeb]">{"{"}</span>
        </div>
        {MODEL.map((f, i) => (
          <div key={f.key} {...a(lineAt(i + 1))} className="flex gap-2 pl-4 whitespace-nowrap">
            <span className="w-[78px] shrink-0 text-[#d6deeb]">{f.key}</span>
            <span className="w-[86px] shrink-0 text-[#82aaff]">{f.type}</span>
            {f.note && <span className="truncate text-[#6b7280]">{"// " + f.note}</span>}
          </div>
        ))}
        <div {...a(mapAt(MAPPINGS.length))} className="text-[#d6deeb]">
          {"}"}
        </div>
      </div>
    </CodeBlock>
  );
}


const kw = (t: string) => <span className="text-[#c792ea]">{t}</span>;
const ty = (t: string) => <span className="text-[#ffcb6b]">{t}</span>;
const fn = (t: string) => <span className="text-[#82aaff]">{t}</span>;
const str = (t: string) => <span className="text-[#a5e3a1]">&quot;{t}&quot;</span>;

const GO: [number, ReactNode][] = [
  [0, <>{kw("func")} (h *{ty("Handler")}) {fn("List")}(</>],
  [1, <>w http.{ty("ResponseWriter")}, r *http.{ty("Request")},</>],
  [0, ") {"],
  [1, <>ctx, q := r.{fn("Context")}(), r.URL.{fn("Query")}()</>],
  [1, <>page, err := h.store.{fn("ListOrders")}(ctx,</>],
  [2, <>{ty("ListOrdersParams")}{"{"}</>],
  [3, <>CustomerID: auth.{fn("UserID")}(ctx),</>],
  [3, <>Status:     q.{fn("Get")}({str("status")}),</>],
  [3, <>Cursor:     q.{fn("Get")}({str("cursor")}),</>],
  [3, <>Limit:      <span className="text-[#f78c6c]">20</span>,</>],
  [2, "})"],
  [1, <>{kw("if")} err != {kw("nil")} {"{"}</>],
  [2, <>httpx.{fn("Error")}(w, err)</>],
  [2, kw("return")],
  [1, "}"],
  [1, <>httpx.{fn("JSON")}(w, http.StatusOK, page)</>],
  [0, "}"],
];
const GO_AT = 0.59;

function GoCode({ animated }: { animated: boolean }) {
  return (
    <CodeBlock title="internal/orders/handler.go" meta="Go · chi · generated">
      <div className="px-4 py-3 font-mono text-[11px] leading-4 whitespace-pre text-[#d6deeb]">
        <div {...(animated ? cue(GO_AT - 0.01) : {})} className="text-[#6b7280]">
          {"// GET /v1/orders, from the Order model"}
        </div>
        {GO.map(([depth, line], i) => (
          <div key={i} {...(animated ? cue(GO_AT + i * 0.011) : {})} style={{ ...(animated ? { opacity: 0 } : {}), paddingLeft: depth * 14 }}>
            {line}
          </div>
        ))}
      </div>
    </CodeBlock>
  );
}

const S = (v: string) => <span className="text-[#a5e3a1]">&quot;{v}&quot;</span>;
const N = (v: number) => <span className="text-[#f78c6c]">{v}</span>;
const K = (k: string) => <span className="text-[#ffcb6b]">&quot;{k}&quot;</span>;

const RESPONSE: [number, ReactNode][] = [
  [0, "{"],
  [1, <>{K("items")}: [{"{"}</>],
  [2, <>{K("id")}: {S("ord_8f2c")}, {K("number")}: {S("TK-20517")},</>],
  [2, <>{K("status")}: {S("confirmed")},</>],
  [2, <>{K("placed_at")}: {S("2026-10-23T16:32:00+04:00")},</>],
  [2, <>{K("items")}: [</>],
  [3, <>{"{ "}{K("name")}: {S("Nova X Pro 5G")}, {K("qty")}: {N(1)},</>],
  [3, <>{"  "}{K("price")}: {N(3299)}, {K("image")}: {S("img/nova.webp")} {"},"}</>],
  [3, <>{"{ "}{K("name")}: {S("Pulse ANC Max")}, {K("qty")}: {N(1)},</>],
  [3, <>{"  "}{K("price")}: {N(1499)}, {K("image")}: {S("img/pulse.webp")} {"},"}</>],
  [3, <>{"{ "}{K("name")}: {S("Orbit Watch 2")}, {K("qty")}: {N(1)},</>],
  [3, <>{"  "}{K("price")}: {N(949)}, {K("image")}: {S("img/orbit.webp")} {"}"}</>],
  [2, "],"],
  [2, <>{K("total")}: {"{ "}{K("amount")}: {N(5747)}, {K("currency")}: {S("AED")} {"},"}</>],
  [2, <>{K("item_count")}: {N(3)},</>],
  [2, <>{K("progress")}: {"{ "}{K("step")}: {N(1)}, {K("of")}: [{S("confirmed")}, {S("packed")},</>],
  [3, <>{S("on_the_way")}, {S("delivered")}] {"},"}</>],
  [2, <>{K("delivery")}: {"{ "}{K("eta")}: {S("2026-10-23T21:00+04:00")},</>],
  [3, <>{K("shipments")}: {N(2)} {"},"}</>],
  [2, <>{K("links")}: {"{"}</>],
  [3, <>{K("details")}: {S("/v1/orders/ord_8f2c")},</>],
  [3, <>{K("track")}: {S("/v1/orders/ord_8f2c/tracking")}</>],
  [2, "}"],
  [1, "}],"],
  [1, <>{K("next")}: {S("cur_2")}</>],
  [0, "}"],
];
const RESPONSE_AT = 0.88;

function ApiRequest({ animated }: { animated: boolean }) {
  const a = (at: number) => (animated ? cue(at) : {});
  return (
    <CodeBlock
      title={
        <>
          <span className="font-semibold text-[#4ade80]">GET</span> List orders
        </>
      }
      meta="Stack · local API"
    >
      <div className="flex items-center gap-2 p-3">
        <div className="flex min-w-0 flex-1 items-center rounded-md bg-[#15161b] ring-1 ring-white/10">
          <span className="border-r border-white/10 px-2 py-1.5 font-mono text-[11px] font-semibold text-[#4ade80]">GET</span>
          <span className="truncate px-2 font-mono text-[11px] text-[#d6deeb]">localhost:8080/v1/orders?status=active</span>
        </div>
        <span className="rounded-md bg-[#3B82F6] px-3.5 py-1.5 text-[11.5px] font-semibold text-white">Send</span>
      </div>
      <div className="flex gap-4 border-t border-white/[0.07] px-3 pt-2 text-[11px] text-[#7c818c]">
        <span>Params</span>
        <span className="border-b border-[#3B82F6] pb-1.5 text-[#d6d8de]">Headers (1)</span>
        <span>Body</span>
      </div>
      <div className="flex gap-3 border-t border-white/[0.07] px-3 py-2 font-mono text-[10.5px]">
        <span className="text-[#d6d8de]">Authorization</span>
        <span className="truncate text-[#7c818c]">Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…</span>
      </div>
      <div {...a(RESPONSE_AT - 0.02)} className="border-t border-white/[0.07]">
        <div className="flex items-center gap-3 px-3 py-2 text-[11px]">
          <span className="text-[#d6d8de]">Body</span>
          <span className="text-[#7c818c]">JSON</span>
          <span className="ml-auto rounded bg-[#4ade80]/10 px-1.5 py-0.5 font-semibold text-[#4ade80]">200 OK</span>
          <span className="text-[#7c818c]">41 ms</span>
          <span className="text-[#7c818c]">2.1 KB</span>
        </div>
        <div className="px-3 pb-1 font-mono text-[10px] text-[#6b7280]">content-type: application/json · x-request-id: 01JB7Q4K2M</div>
        <div className="px-3 pb-3 font-mono text-[10.5px] leading-[17px] whitespace-nowrap text-[#d6deeb]">
          {RESPONSE.map(([depth, line], i) => (
            <div key={i} {...a(RESPONSE_AT + i * 0.0045)} style={{ ...(animated ? { opacity: 0 } : {}), paddingLeft: depth * 12 }}>
              {line}
            </div>
          ))}
        </div>
      </div>
    </CodeBlock>
  );
}

function Phone({ className = "" }: { className?: string }) {
  return (
    <DeviceFrame className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/showcase/tekvo/customer/21-my-orders-light.jpg" alt="My orders screen from the Tekvo app" className="size-full object-cover object-top" />
    </DeviceFrame>
  );
}

function HeroBoard() {
  return (
    <div className="relative h-[880px] w-[1480px] overflow-hidden rounded-3xl border border-white/10 bg-[#15161b] bg-[radial-gradient(#2c2e36_1px,transparent_1px)] [background-size:22px_22px] shadow-[0_1px_0_0_#ffffff0f_inset,0_40px_120px_-40px_#000]">
      <div className="absolute inset-x-0 top-6">
        <StepBar animated />
      </div>

      <div {...cue(0)} className="absolute top-[186px] left-[50px] w-[270px]">
        <div className="absolute -top-5 left-1 text-[11px] whitespace-nowrap text-[#9a9ea8]">My orders · Figma</div>
        <Phone />
      </div>

      <svg viewBox="0 0 1480 880" className="absolute inset-0 size-full" aria-hidden>
        {MAPPINGS.flatMap((m, k) =>
          m.lines.map((line) => {
            const x1 = m.box[2] + 4;
            const y1 = (m.box[1] + m.box[3]) / 2;
            const y2 = lineY(line);
            return (
              <path
                key={`${k}-${line}`}
                d={`M${x1} ${y1}C${x1 + 80} ${y1} ${MODEL_LEFT - 80} ${y2} ${MODEL_LEFT - 6} ${y2}`}
                pathLength={1}
                fill="none"
                stroke={m.color}
                strokeOpacity="0.8"
                strokeWidth="1.5"
                {...cue(mapAt(k) + 0.004, { len: 0.02 })}
              />
            );
          }),
        )}
        <path d="M660 414V468" pathLength={1} fill="none" stroke={LINE} strokeWidth="2" strokeLinecap="round" {...cue(0.56, { len: 0.01 })} />
        <path d="M653 460l7 10 7-10" fill="none" stroke={LINE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...cue(0.57)} />
        <path d="M848 640H916" pathLength={1} fill="none" stroke={LINE} strokeWidth="2" strokeLinecap="round" {...cue(0.79, { len: 0.01 })} />
        <path d="M908 633l10 7-10 7" fill="none" stroke={LINE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...cue(0.8)} />
      </svg>

      <div {...cue(0.2)} className="absolute top-[108px] left-[480px] w-[360px]">
        <ModelCode animated />
      </div>
      <div {...cue(0.57)} className="absolute top-[476px] left-[480px] w-[360px]">
        <GoCode animated />
      </div>
      <div {...cue(0.8)} className="absolute top-[134px] left-[930px] w-[500px]">
        <ApiRequest animated />
      </div>

      <svg viewBox="0 0 1480 880" className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        <rect x="68" y="304" width="0" height="0" fill="#3B82F612" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="5 4" rx="8">
          <animate attributeName="width" dur={`${RUN}ms`} fill="freeze" values="0;0;233;233" keyTimes="0;0.1;0.18;1" />
          <animate attributeName="height" dur={`${RUN}ms`} fill="freeze" values="0;0;173;173" keyTimes="0;0.1;0.18;1" />
        </rect>
        {MAPPINGS.map((m, k) => (
          <rect
            key={k}
            x={m.box[0] - 3}
            y={m.box[1] - 3}
            width={m.box[2] - m.box[0] + 6}
            height={m.box[3] - m.box[1] + 6}
            rx="3"
            fill={`${m.color}22`}
            stroke={m.color}
            strokeWidth="1.25"
            {...cue(mapAt(k))}
          />
        ))}
        <circle cx="1390" cy="197" r="0" fill="none" stroke="#3B82F6" strokeWidth="2">
          <animate attributeName="r" dur={`${RUN}ms`} fill="freeze" values="0;0;22;22" keyTimes="0;0.86;0.885;1" />
          <animate attributeName="opacity" dur={`${RUN}ms`} fill="freeze" values="0;0;0.8;0;0" keyTimes="0;0.86;0.862;0.885;1" />
        </circle>
        <g opacity="0">
          <Cursor />
          <animateMotion
            dur={`${RUN}ms`}
            fill="freeze"
            path={CURSOR_PATH}
            keyPoints="0;0.197;0.302;0.476;0.541;0.628;0.678;1;1"
            keyTimes="0;0.1;0.18;0.26;0.55;0.62;0.78;0.86;1"
            calcMode="linear"
          />
          <animate attributeName="opacity" dur={`${RUN}ms`} fill="freeze" values="0;0;1;1" keyTimes="0;0.04;0.06;1" />
        </g>
      </svg>
    </div>
  );
}

function HeroBoardMobile() {
  return (
    <div className="mx-auto max-w-md space-y-5 rounded-3xl border border-white/10 bg-[#15161b] bg-[radial-gradient(#2c2e36_1px,transparent_1px)] [background-size:22px_22px] p-5">
      <div className="mx-auto w-[220px]">
        <Phone />
      </div>
      <ModelCode animated={false} />
      <GoCode animated={false} />
      <ApiRequest animated={false} />
    </div>
  );
}

type Brand = keyof typeof brandPaths;


function BrandIcon({ icon, color, size = 24 }: { icon: Brand; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d={brandPaths[icon]} />
    </svg>
  );
}

function Bento({ title, text, tone, children, className = "", delay = 0 }: { title: string; text: string; tone: Tone; children: ReactNode; className?: string; delay?: number }) {
  return (
    <Reveal delay={delay} className={`group relative flex flex-col overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-white/[0.04] to-white/[0.01] transition-colors hover:border-line-2 ${className}`}>
      <div className={`pointer-events-none absolute -top-32 -right-32 size-72 rounded-full opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-80 ${TONE[tone].soft}`} />
      <div className="relative px-7 pt-7">
        <h3 className="text-xl font-semibold tracking-[-0.02em] text-fg">{title}</h3>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-pretty text-muted">{text}</p>
      </div>
      <div className="relative mt-auto px-7 pt-7 pb-7">{children}</div>
    </Reveal>
  );
}

const languages: [string, string, Brand, string][] = [
  ["Node.js", "Fastify · Drizzle", "node", "#5FA04E"],
  ["Python", "FastAPI · SQLAlchemy", "python", "#4B8BBE"],
  ["Go", "chi · sqlc", "go", "#00ADD8"],
  ["Rust", "axum · sqlx", "rust", "#DEA584"],
];

const modules = ["Auth", "Billing", "Email", "Storage", "Notifications", "Admin", "Analytics", "Audit log", "Feature flags"];

const stages: { phase: string; tone: Tone; items: string[] }[] = [
  { phase: "Design", tone: "coral", items: ["Product plan", "Design plan", "Design in Figma", "Frontend"] },
  { phase: "Build", tone: "sun", items: ["Data model", "System spec", "Backend", "Infra"] },
  { phase: "Ship and run", tone: "blue", items: ["Verify", "Wire the frontend", "Deploy", "Operate"] },
];

const compareCols = ["Stack", "Your agent alone", "Prompt-to-app builders", "Backend as a service"];
const compareRows: [string, (boolean | string)[]][] = [
  ["Starts from your Figma design", [true, false, false, false]],
  ["You own all the code", [true, true, "Partly", false]],
  ["Node.js, Python, Go or Rust", [true, true, false, false]],
  ["One spec the whole stack follows", [true, false, false, "Schema only"]],
  ["Tested against the API contract", [true, false, false, false]],
  ["Runs on your own infrastructure", [true, true, false, false]],
  ["Backups, restore drills and rollback", [true, false, false, true]],
];

const faqs: { q: string; a: ReactNode }[] = [
  {
    q: "Do I need figmcp?",
    a: <>Yes. Stack is a package you add to figmcp. Its tools appear on figmcp&apos;s server once it&apos;s installed, and figmcp works exactly as before without it.</>,
  },
  {
    q: "Do I need a Figma design?",
    a: <>No, but it&apos;s what makes Stack different. With a design, the data model and the frontend wiring come from your frames. Without one, Stack starts from a brief or a spec.</>,
  },
  { q: "Who owns the code?", a: <>You do. It&apos;s ordinary code in your repository, with no runtime to depend on. Hand it to a developer or stop using Stack at any time.</> },
  {
    q: "Where does my app run?",
    a: <>On your infrastructure: your own server, Fly.io, AWS or Google Cloud. Stack never hosts your app, and your secrets stay on your machine, in your repo (encrypted) and in your CI.</>,
  },
  {
    q: "Can it break production?",
    a: <>Every deploy, migration and rollback shows a plan first, and only the exact plan you confirm is applied. Production needs a passing staging deploy of the same build and a fresh backup.</>,
  },
  { q: "Which databases does it use?", a: <>PostgreSQL for your data, Redis for cache, queues and rate limits when the spec needs them, and S3-compatible storage for files.</> },
];

function Cell({ v }: { v: boolean | string }) {
  if (v === true) return <Check className="mx-auto size-[18px]" />;
  if (v === false) return <span className="mx-auto block h-px w-3 bg-dim" aria-label="No" />;
  return <span className="text-xs text-muted">{v}</span>;
}

export default function Page() {
  return (
    <main className="overflow-x-clip">
      <section className="relative overflow-hidden pt-32 pb-16 sm:pt-40">
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className="animate-aurora pointer-events-none absolute -top-48 left-1/2 h-[560px] w-[980px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,#3b82f650,transparent)] blur-3xl" />
        <div className="pointer-events-none absolute top-20 left-[4%] h-[340px] w-[460px] rounded-full bg-[radial-gradient(closest-side,#ff5a4e30,transparent)] blur-3xl" />
        <div className="pointer-events-none absolute top-40 right-[4%] h-[320px] w-[440px] rounded-full bg-[radial-gradient(closest-side,#ffc93c26,transparent)] blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-4xl text-center">
            <Reveal className="flex justify-center">
              <a
                href="#plug-in"
                className="group inline-flex items-center gap-2 rounded-full border border-line-2 bg-white/[0.03] py-1 pr-3 pl-1 text-xs text-muted backdrop-blur transition hover:border-sky/40 hover:text-fg"
              >
                <span className="rounded-full bg-blue/15 px-2 py-0.5 font-mono text-[11px] text-blue">New</span>
                The add-on for figmcp
                <ArrowRight width={14} height={14} className="transition-transform group-hover:translate-x-0.5" />
              </a>
            </Reveal>
            <Reveal delay={60} className="mt-9 flex justify-center">
              <StackLogo height={52} className="text-fg" />
            </Reveal>
            <Reveal delay={100}>
              <h1 className="mt-8 text-[46px] leading-[1] font-semibold tracking-[-0.05em] text-balance sm:text-7xl lg:text-[92px]">
                <span className="text-gradient block">From Figma frame</span>
                <span className="text-sky-gradient block pb-2">to production.</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-pretty text-muted sm:text-xl">
                Add Stack to figmcp and your agent goes past the frontend: the backend, the infra, the deploy and the day after. One person, the whole
                product.
              </p>
            </Reveal>
            <Reveal delay={220} className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-4">
              <CopyCommand command={stack.install} large />
              <div className="flex flex-wrap items-center justify-center gap-3">
                <a
                  href="#plug-in"
                  data-track="click_get_started"
                  data-track-location="stack_hero"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_30px_-8px_#3b82f6] transition hover:bg-[#5b9bff]"
                >
                  Get started <ArrowRight width={16} height={16} />
                </a>
                <a
                  href={site.github}
                  target="_blank"
                  rel="noreferrer"
                  data-track="click_github"
                  data-track-location="stack_hero"
                  className="inline-flex items-center gap-2 rounded-xl border border-line-2 bg-white/[0.02] px-5 py-2.5 text-sm font-medium text-fg transition hover:bg-white/[0.06]"
                >
                  <GitHubIcon width={16} height={16} /> GitHub
                </a>
              </div>
              <p className="text-xs text-dim">Adds to figmcp on macOS and Windows</p>
            </Reveal>
          </div>

          <Reveal delay={280} className="mt-20 hidden justify-center xl:flex">
            <div className="[zoom:0.82] min-[1440px]:[zoom:0.92] min-[1560px]:[zoom:1]">
              <Timeline duration={RUN}>
                <HeroBoard />
              </Timeline>
            </div>
          </Reveal>
          <Reveal delay={280} className="mt-16 xl:hidden">
            <HeroBoardMobile />
          </Reveal>
        </div>
      </section>

      <section className="relative border-y border-line bg-bg-2/40 py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal as="p" className="text-center font-mono text-xs tracking-wider text-dim uppercase">
            Backends in the language you choose
          </Reveal>
          <Reveal delay={80} className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            {languages.map(([name, framework, icon, color]) => (
              <div key={name} className="group flex flex-col items-center gap-3 text-center">
                <span className="grid size-14 place-items-center rounded-2xl border border-line bg-white/[0.02] transition group-hover:border-line-2 group-hover:bg-white/[0.05]">
                  <BrandIcon icon={icon} color={color} size={28} />
                </span>
                <span>
                  <span className="block text-sm text-fg">{name}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-dim">{framework.split(" · ")[0]}</span>
                </span>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="relative py-28 sm:py-36">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHead
            eyebrow="Everything after the frontend"
            tone="coral"
            title="Your design already knows your backend."
            text="figmcp turns your frames into screens. Stack reads the same frames and builds everything behind them."
          />

          <div className="mt-16 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Bento
              className="lg:col-span-2"
              tone="coral"
              title="The design becomes the data model"
              text="Lists, forms, status tabs and search bars tell Stack what to store and serve. Every field comes with the frame it was found in."
            >
              <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                <div className="rounded-2xl border border-line bg-bg/70 p-3">
                  <div className="mb-2 flex gap-1.5">
                    {["Pending", "Confirmed", "Cancelled"].map((t, i) => (
                      <span key={t} className={`rounded-full px-2 py-0.5 text-[10.5px] ${i === 0 ? "bg-coral/15 text-coral ring-1 ring-coral/40" : "text-dim"}`}>
                        {t}
                      </span>
                    ))}
                  </div>
                  {["Studio Nine", "Cut & Co", "Fade Lab"].map((n, i) => (
                    <div
                      key={n}
                      className={`mt-1.5 flex items-center gap-2 rounded-lg px-2 py-1.5 ${i === 0 ? "border border-dashed border-coral/50 bg-coral/[0.05]" : "border border-line"}`}
                    >
                      <span className="size-5 rounded-full bg-gradient-to-br from-coral/50 to-sun/50" />
                      <span className="flex-1 text-[11.5px] text-fg">{n}</span>
                      <span className="font-mono text-[10px] text-dim">Oct {12 + i * 2}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-center text-coral">
                  <ArrowRight width={22} height={22} className="rotate-90 sm:rotate-0" />
                </div>
                <div className="rounded-2xl border border-line bg-[#0a0b10] p-4 font-mono text-[11.5px] leading-6">
                  <div className="text-sky">Booking</div>
                  {[
                    ["status", "enum", "high"],
                    ["starts_at", "timestamptz", "high"],
                    ["salon", "→ Salon", "medium"],
                    ["customer", "→ User", "high"],
                  ].map(([f, t, c]) => (
                    <div key={f} className="flex items-center gap-2 pl-3">
                      <span className="text-ice">{f}</span>
                      <span className="text-dim">{t}</span>
                      <span className={`ml-auto text-[9.5px] ${c === "high" ? "text-ok" : "text-warn"}`}>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Bento>

            <Bento delay={80} tone="sun" title="Four languages, one spec" text="Pick the one you or your next hire knows. Same folders, same commands, same checks.">
              <div className="grid grid-cols-2 gap-2.5">
                {languages.map(([n, l, icon, c]) => (
                  <div key={n} className="rounded-2xl border border-line bg-bg/70 p-3.5">
                    <BrandIcon icon={icon} color={c} size={22} />
                    <div className="mt-3 font-medium text-fg">{n}</div>
                    <div className="mt-0.5 truncate font-mono text-[10.5px] text-dim">{l}</div>
                  </div>
                ))}
              </div>
            </Bento>

            <Bento tone="blue" title="Done means passing" text="Stack boots the whole stack and tests the running API against the contract.">
              <div className="flex items-center gap-5">
                <div className="relative grid size-24 shrink-0 place-items-center">
                  <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#ffffff12" strokeWidth="8" />
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#4ade80" strokeWidth="8" strokeLinecap="round" />
                  </svg>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-fg">212</div>
                    <div className="font-mono text-[9.5px] text-dim">passed</div>
                  </div>
                </div>
                <ul className="min-w-0 space-y-1.5 font-mono text-[11.5px] text-muted">
                  {["contract tests", "access rules", "migrations ↕", "integration", "image scan"].map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <Check />
                      <span className="truncate">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Bento>

            <Bento
              delay={80}
              className="lg:col-span-2"
              tone="sun"
              title="Sample text out, real data in"
              text="Stack knows which frame each piece of text came from, so it swaps the design's samples for fields from a typed client."
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  { label: "Before", tag: null, a: '"Studio Nine"', b: '"Oct 12 · 14:30"', after: false },
                  { label: "After", tag: "useBookings()", a: "{b.salon.name}", b: "{b.startsAt}", after: true },
                ].map((c) => (
                  <div key={c.label} className={`rounded-2xl border bg-[#0a0b10] p-4 font-mono text-[12px] leading-6 ${c.after ? "border-sun/30" : "border-line"}`}>
                    <div className="mb-2 flex items-center justify-between text-[10px] tracking-wider text-dim uppercase">
                      {c.label}
                      {c.tag && <span className="tracking-normal text-sun normal-case">{c.tag}</span>}
                    </div>
                    <div className="text-muted">
                      &lt;<span className="text-sky">BookingCard</span>
                    </div>
                    {[
                      ["salon", c.a],
                      ["startsAt", c.b],
                    ].map(([k, v]) => (
                      <div key={k} className="pl-4 text-muted">
                        {k}=<span className={c.after ? "text-ice" : "text-[#a5e3a1] line-through decoration-coral/80"}>{v}</span>
                      </div>
                    ))}
                    <div className="text-muted">/&gt;</div>
                  </div>
                ))}
              </div>
            </Bento>

            <Bento tone="blue" title="Deploy with one confirm" text="Staging first, then production on your own server. You see the plan before anything changes.">
              <div className="rounded-2xl border border-line bg-bg/70 p-4">
                <div className="flex items-center gap-2 text-[11px]">
                  {["local", "staging", "prod"].map((e, i) => (
                    <span key={e} className="flex items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 font-mono ${i < 2 ? "border-ok/30 text-ok" : "border-blue/40 text-blue"}`}>{e}</span>
                      {i < 2 && <span className="text-dim">→</span>}
                    </span>
                  ))}
                </div>
                <div className="mt-3 space-y-1 font-mono text-[11px] text-dim">
                  <div>1 host · 2 images · 3 migrations</div>
                  <div>backup taken 2 min ago ✓</div>
                </div>
                <div className="mt-3 flex gap-2">
                  <span className="flex-1 rounded-lg border border-line-2 py-1.5 text-center text-xs text-muted">Show plan</span>
                  <span className="flex-1 rounded-lg bg-blue py-1.5 text-center text-xs font-medium text-white">Confirm</span>
                </div>
              </div>
            </Bento>

            <Bento delay={80} tone="coral" title="Runs while you sleep" text="Alerts, backups that are proven to restore, safe migrations and one-call rollback.">
              <div className="rounded-2xl border border-line bg-bg/70 p-4">
                <Uptime bars={30} height="h-9" />
                <div className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-[10.5px] text-muted">
                  {["uptime 99.98%", "p95 182 ms", "restore drill ✓", "rollback ready"].map((t) => (
                    <span key={t} className="rounded-md border border-line px-2 py-1">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </Bento>

            <Bento delay={160} tone="sun" title="The plumbing, done" text="Turn on what every product needs. Each module brings its endpoints, tables, tests and screens.">
              <div className="flex flex-wrap gap-2">
                {modules.map((m, i) => (
                  <span key={m} className="inline-flex items-center gap-2 rounded-full border border-line-2 bg-white/[0.03] px-3 py-1.5 text-[13px] text-fg">
                    <span className={`size-1.5 rounded-full ${DOTS[i % 3]}`} />
                    {m}
                  </span>
                ))}
              </div>
            </Bento>
          </div>
        </div>
      </section>

      <section className="relative border-y border-line bg-bg-2/40 py-20">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-10 px-4 sm:px-6 lg:grid-cols-4">
          {[
            ["12", "stages, brief to production"],
            ["4", "backend languages"],
            ["9", "business modules"],
            ["1", "spec the whole stack follows"],
          ].map(([n, l], i) => (
            <Reveal key={l} delay={i * 70} className="text-center">
              <div className="text-sky-gradient text-6xl font-semibold tracking-[-0.05em] sm:text-7xl">{n}</div>
              <div className="mt-2 text-sm text-muted">{l}</div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="relative py-28 sm:py-36">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHead eyebrow="The pipeline" tone="sun" title="Twelve stages. A check before every next one." text="Start from a brief, or jump in wherever your project already is." />
          <div className="mt-16 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {stages.map((s, si) => (
              <Reveal key={s.phase} delay={si * 90} className="relative overflow-hidden rounded-3xl border border-line bg-panel/50 p-6">
                <div className={`pointer-events-none absolute inset-x-0 top-0 h-px ${TONE[s.tone].line}`} />
                <div className="flex items-baseline justify-between">
                  <span className={`font-mono text-xs tracking-[0.2em] uppercase ${TONE[s.tone].text}`}>{s.phase}</span>
                  <span className="font-mono text-xs text-dim">
                    {String(si * 4 + 1).padStart(2, "0")}–{String(si * 4 + 4).padStart(2, "0")}
                  </span>
                </div>
                <ol className="mt-6 space-y-3">
                  {s.items.map((it, i) => (
                    <li key={it} className="flex items-center gap-4">
                      <span className={`grid size-8 shrink-0 place-items-center rounded-full border font-mono text-[11px] ${TONE[s.tone].border} ${TONE[s.tone].text}`}>
                        {String(si * 4 + i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-lg text-fg">{it}</span>
                      {(it === "Design in Figma" || it === "Frontend") && (
                        <span className="ml-auto rounded-full border border-coral/30 px-2 py-0.5 font-mono text-[10px] text-coral">figmcp</span>
                      )}
                    </li>
                  ))}
                </ol>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="plug-in" className="relative scroll-mt-16 overflow-hidden border-t border-line py-28 sm:py-36">
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-[560px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,#3b82f625,transparent)] blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
          <Reveal>
            <Eyebrow tone="blue">Get started</Eyebrow>
            <h2 className="text-gradient mt-4 text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-6xl">Not another tool. One more package.</h2>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
              Add Stack like a package. Its tools land on the server your agent already uses, and figmcp stays exactly the same without it.
            </p>
            <ol className="mt-9 max-w-xl space-y-5">
              {[
                ["Install figmcp", <CopyCommand key="f" command={site.install} wrap />],
                ["Add Stack", <CopyCommand key="s" command={stack.install} wrap />],
                [
                  "Restart your agent and ask",
                  <div key="a" className="rounded-2xl border border-line-2 bg-panel/80 px-4 py-2.5 font-mono text-[12.5px] text-ice sm:text-sm">
                    <span className="text-sky">&gt; </span>plan the backend for this app and deploy it to staging
                  </div>,
                ],
              ].map(([t, body], i) => (
                <li key={i} className="flex gap-4">
                  <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full font-mono text-xs font-semibold text-bg ${["bg-coral", "bg-sun", "bg-blue"][i]}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 text-sm font-medium text-fg">{t}</div>
                    {body}
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal delay={120}>
            <div className="rounded-3xl border border-line-2 bg-panel/60 p-5 backdrop-blur sm:p-7">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-bg/60 px-4 py-3.5">
                <span className="shrink-0 text-sm text-fg">Your coding agent</span>
                <span className="truncate font-mono text-[11px] text-dim">Claude Code · Cursor · any MCP client</span>
              </div>
              <div className="mx-auto h-8 w-px bg-gradient-to-b from-line-2 to-coral/60" />
              <div className="rounded-2xl border border-coral/30 bg-coral/[0.04] p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-fg">figma-local</span>
                  <span className="font-mono text-[11px] text-dim">one server</span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-bg/70 p-4">
                    <div className="text-sm font-medium text-fg">figmcp</div>
                    <div className="mt-1 text-xs text-muted">Design and frontend</div>
                  </div>
                  <div className="relative rounded-xl border border-dashed border-blue/50 bg-blue/[0.07] p-4">
                    <span className="absolute -top-2.5 right-3 rounded-full border border-blue/40 bg-bg px-2 py-0.5 font-mono text-[10px] text-blue">+ added</span>
                    <div className="flex items-center gap-2 text-sm font-medium text-fg">
                      <StackMark size={15} className="text-fg" /> Stack
                    </div>
                    <div className="mt-1 text-xs text-muted">Backend, infra, deploy, ops</div>
                  </div>
                </div>
              </div>
              <div className="mx-auto h-8 w-px bg-gradient-to-b from-coral/60 to-line-2" />
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-line bg-bg/60 px-4 py-3">
                  <div className="text-sm text-fg">Figma Desktop</div>
                  <div className="mt-0.5 text-xs text-muted">Read over localhost</div>
                </div>
                <div className="rounded-2xl border border-line bg-bg/60 px-4 py-3">
                  <div className="text-sm text-fg">Your repo</div>
                  <div className="mt-0.5 font-mono text-xs text-muted">.stack/ spec</div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative border-t border-line py-28 sm:py-36">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHead eyebrow="Why Stack" tone="coral" title="Your agent can write a backend." text="Stack makes sure it follows one spec, passes its tests, matches your frontend and runs safely." />
          <Reveal className="mt-16 overflow-x-auto rounded-3xl border border-line">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line bg-white/[0.02]">
                  <th className="px-6 py-5 text-left font-normal text-dim" />
                  {compareCols.map((c, i) => (
                    <th key={c} className={`px-4 py-5 text-center font-medium ${i === 0 ? "bg-blue/[0.07] text-fg" : "text-muted"}`}>
                      {i === 0 ? (
                        <span className="inline-flex items-center gap-2">
                          <StackMark size={16} className="text-fg" />
                          {c}
                        </span>
                      ) : (
                        c
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compareRows.map(([label, vals]) => (
                  <tr key={label} className="border-b border-line last:border-b-0">
                    <td className="px-6 py-4 text-fg">{label}</td>
                    {vals.map((v, i) => (
                      <td key={i} className={`px-4 py-4 text-center ${i === 0 ? "bg-blue/[0.07]" : ""}`}>
                        <Cell v={v} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </div>
      </section>

      <section id="faq" className="relative scroll-mt-16 border-t border-line py-28 sm:py-36">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHead eyebrow="FAQ" tone="blue" title="Questions, answered." />
          <div className="mx-auto mt-14 max-w-3xl divide-y divide-line border-y border-line">
            {faqs.map((f, i) => (
              <Reveal key={f.q} delay={i * 40}>
                <details className="group py-1 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-[17px] font-medium text-fg transition-colors hover:text-ice">
                    {f.q}
                    <span className="relative size-4 shrink-0 text-dim transition-transform duration-300 group-open:rotate-45">
                      <span className="absolute top-1/2 left-0 h-px w-4 -translate-y-1/2 bg-current" />
                      <span className="absolute top-0 left-1/2 h-4 w-px -translate-x-1/2 bg-current" />
                    </span>
                  </summary>
                  <div className="pr-10 pb-6 text-[15px] leading-relaxed text-muted">{f.a}</div>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-line py-28 sm:py-40">
        <div className="grid-bg pointer-events-none absolute inset-0 rotate-180" />
        <div className="animate-aurora pointer-events-none absolute bottom-[-260px] left-1/2 h-[520px] w-[1000px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,#3b82f655,transparent)] blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-200px] left-[12%] h-[420px] w-[520px] rounded-full bg-[radial-gradient(closest-side,#ff5a4e38,transparent)] blur-3xl" />
        <div className="pointer-events-none absolute right-[12%] bottom-[-200px] h-[420px] w-[520px] rounded-full bg-[radial-gradient(closest-side,#ffc93c30,transparent)] blur-3xl" />
        <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <StackMark size={72} className="animate-float mx-auto text-fg" />
          <h2 className="mt-9 text-5xl font-semibold tracking-[-0.05em] text-balance sm:text-7xl">
            <span className="text-gradient block">One person.</span>
            <span className="text-sky-gradient block pb-2">The whole product.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-lg text-muted">One command adds Stack to figmcp.</p>
          <div className="mx-auto mt-10 max-w-xl">
            <CopyCommand command={stack.install} large />
          </div>
          <div className="mt-6 flex justify-center gap-6 text-sm">
            <Link href="/docs/installation" className="text-muted hover:text-fg">
              Install figmcp first
            </Link>
            <a href={site.github} target="_blank" rel="noreferrer" className="text-muted hover:text-fg">
              GitHub
            </a>
          </div>
        </Reveal>
      </section>
    </main>
  );
}

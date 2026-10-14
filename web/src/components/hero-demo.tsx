"use client";

import { useEffect, useRef, useState } from "react";

type Step = { tool: string; file?: string; detail: string };
type Scene = { key: "read" | "write"; label: string; prompt: string; steps: Step[]; done: string };

const scenes: Scene[] = [
  {
    key: "read",
    label: "Design → Code",
    prompt: "implement the selected Figma frame",
    steps: [
      { tool: "get_design_context", detail: "Onboarding · 24 layers · 6 assets" },
      { tool: "download_assets", detail: "4 SVG icons → assets/svg, 2 images → assets/images" },
      { tool: "Write", file: "onboarding_screen.dart", detail: "142 lines" },
      { tool: "flutter analyze", detail: "No issues found" },
    ],
    done: "Screen matches the design.",
  },
  {
    key: "write",
    label: "Prompt → Design",
    prompt: "design a login screen for a 390x844 phone in Figma",
    steps: [
      { tool: "use_figma", detail: 'Frame "Login" 390×844 · auto layout' },
      { tool: "use_figma", detail: "Header, email and password fields, button" },
      { tool: "get_screenshot", detail: "Checked the result against the brief" },
      { tool: "use_figma", detail: "Tightened spacing, rounded the button" },
    ],
    done: "Login screen is ready in Figma.",
  },
];

const TYPE_MS = 34;
const STEP_MS = 1150;
const HOLD_MS = 3200;

export function HeroDemo() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [typed, setTyped] = useState(0);
  const [step, setStep] = useState(-1);
  const [auto, setAuto] = useState(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scene = scenes[sceneIdx];

  useEffect(() => {
    const clear = () => timers.current.forEach(clearTimeout);
    clear();
    timers.current = [];
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      at(0, () => {
        setTyped(scene.prompt.length);
        setStep(scene.steps.length);
      });
      return clear;
    }

    at(0, () => {
      setTyped(0);
      setStep(-1);
    });
    let t = 500;
    for (let i = 1; i <= scene.prompt.length; i++) at((t += TYPE_MS), () => setTyped(i));
    t += 450;
    for (let s = 0; s <= scene.steps.length; s++) {
      at(t, () => setStep(s));
      t += STEP_MS;
    }
    if (auto) at(t + HOLD_MS, () => setSceneIdx((i) => (i + 1) % scenes.length));
    return clear;
  }, [sceneIdx, auto, scene]);

  const finished = step >= scene.steps.length;

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[40px] bg-[radial-gradient(60%_60%_at_50%_30%,#0553b155,transparent_70%)] blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-line-2 bg-[#070a11]/90 shadow-[0_40px_120px_-20px_#000,0_0_0_1px_#ffffff08_inset] backdrop-blur">
        <div className="flex h-11 items-center gap-3 border-b border-line bg-white/[0.02] px-4">
          <div className="flex gap-1.5">
            <i className="size-3 rounded-full bg-white/10" />
            <i className="size-3 rounded-full bg-white/10" />
            <i className="size-3 rounded-full bg-white/10" />
          </div>
          <div role="tablist" className="mx-auto flex rounded-lg border border-line bg-black/30 p-0.5 text-xs">
            {scenes.map((s, i) => (
              <button
                key={s.key}
                role="tab"
                aria-selected={i === sceneIdx}
                onClick={() => {
                  setAuto(false);
                  setSceneIdx(i);
                }}
                className={`rounded-md px-2.5 py-1 font-medium transition sm:px-3 ${
                  i === sceneIdx ? "bg-white/10 text-fg" : "text-dim hover:text-muted"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="hidden items-center gap-2 font-mono text-[11px] text-dim sm:flex">
            <i className="animate-pulse-dot size-2 rounded-full bg-ok" />
            localhost:3947
          </div>
        </div>

        <div className="grid md:grid-cols-[1.08fr_1fr]">
          <Canvas scene={scene.key} step={step} />
          <Terminal scene={scene} typed={typed} step={step} finished={finished} />
        </div>
      </div>
    </div>
  );
}

function Terminal({ scene, typed, step, finished }: { scene: Scene; typed: number; step: number; finished: boolean }) {
  return (
    <div className="relative min-h-[360px] border-t border-line p-5 font-mono text-[12.5px] leading-relaxed sm:min-h-[420px] sm:p-6 sm:text-[13px] md:border-t-0 md:border-l">
      <div className="mb-5 flex items-center gap-2 text-[11px] tracking-wide text-dim uppercase">
        <span className="size-1.5 rounded-full bg-sky" /> coding agent
      </div>
      <div className="rounded-xl border border-line-2 bg-white/[0.02] px-4 py-3 text-fg">
        <span className="text-sky">&gt;</span> {scene.prompt.slice(0, typed)}
        {typed < scene.prompt.length && <span className="animate-caret ml-px inline-block h-4 w-[7px] translate-y-[3px] bg-sky" />}
      </div>
      <div className="mt-5 space-y-3.5">
        {scene.steps.map((s, i) =>
          i <= step ? (
            <div key={`${scene.key}-${i}`} className="animate-[fadeUp_.45s_ease-out_both]">
              <div className="flex items-center gap-2">
                {i < step ? (
                  <span className="text-sky">●</span>
                ) : (
                  <span className="inline-block size-3 animate-spin rounded-full border-[1.5px] border-sky/30 border-t-sky" />
                )}
                <span className="text-fg">{s.tool}</span>
                {s.file && <span className="text-warn">{s.file}</span>}
              </div>
              <div className="pl-5 text-muted">
                <span className="text-dim">⎿ </span>
                {s.detail}
              </div>
            </div>
          ) : null,
        )}
        {finished && (
          <div className="animate-[fadeUp_.45s_ease-out_both] flex items-center gap-2 pt-1 text-ok">
            <span>✓</span>
            <span>{scene.done}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Canvas({ scene, step }: { scene: Scene["key"]; step: number }) {
  const read = scene === "read";
  const show = (n: number) => read || step >= n;
  const layers = read
    ? ["Onboarding", "Hero", "Title", "Body", "Pager", "Get started"]
    : ["Login", "Header", "Email", "Password", "Sign in"];

  return (
    <div className="relative flex min-h-[360px] overflow-hidden bg-[#0a0d14] sm:min-h-[420px]">
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff14_1px,transparent_1px)] [background-size:18px_18px]" />

      <aside className="relative z-10 hidden w-40 shrink-0 border-r border-line bg-[#0b0f18]/90 p-3 text-[11px] lg:block">
        <div className="mb-3 font-medium tracking-wide text-dim uppercase">Layers</div>
        {layers.map((l, i) => (
          <div
            key={l}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-all duration-500 ${
              i === 0 ? "bg-sky/10 text-ice" : "text-muted"
            } ${show(i === 0 ? 0 : 1) ? "opacity-100" : "opacity-0"}`}
            style={{ paddingLeft: i === 0 ? 8 : 20 }}
          >
            <span className={`size-2.5 rounded-[3px] border ${i === 0 ? "border-sky" : "border-white/25"}`} />
            {l}
          </div>
        ))}
      </aside>

      <div className="relative z-10 flex flex-1 items-center justify-center p-6">
        <div className={`relative transition-transform duration-700 ${read && step >= 2 ? "sm:-translate-x-[100px]" : ""}`}>
          <div
            className={`absolute -top-6 left-0 font-mono text-[10.5px] transition-opacity duration-500 ${
              show(0) ? "text-sky opacity-100" : "opacity-0"
            }`}
          >
            {read ? "Onboarding" : "Login"} · 390×844
          </div>

          <div
            className={`relative h-[300px] w-[150px] overflow-hidden rounded-[22px] bg-white shadow-[0_30px_60px_-10px_#0008] transition-all duration-700 sm:h-[340px] sm:w-[170px] ${
              show(0) ? "scale-100 opacity-100" : "scale-95 opacity-0"
            }`}
          >
            {read ? <OnboardingScreen step={step} /> : <LoginScreen step={step} />}
            {read && step === 0 && (
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="h-full w-full animate-[scan_1.1s_linear_infinite] bg-gradient-to-b from-transparent via-sky/35 to-transparent" />
              </div>
            )}
          </div>

          {show(0) && (
            <div className="pointer-events-none absolute -inset-[3px] rounded-[25px] border-[1.5px] border-sky">
              {["-top-1 -left-1", "-top-1 -right-1", "-bottom-1 -left-1", "-bottom-1 -right-1"].map((p) => (
                <i key={p} className={`absolute size-2 border-[1.5px] border-sky bg-white ${p}`} />
              ))}
            </div>
          )}
        </div>
        {read && step >= 2 && (
          <div className="absolute top-1/2 right-5 w-[200px] -translate-y-1/2 animate-[fadeUp_.5s_ease-out_both] rounded-xl border border-line-2 bg-[#070a11]/95 p-3 font-mono text-[10px] leading-[1.6] shadow-2xl backdrop-blur max-sm:hidden">
            <div className="mb-1.5 text-warn">onboarding_screen.dart</div>
            <div>
              <span className="text-[#c792ea]">class</span> <span className="text-sky">OnboardingScreen</span>
            </div>
            <div className="pl-2 text-muted">
              <span className="text-[#c792ea]">extends</span> <span className="text-sky">StatelessWidget</span> {"{"}
            </div>
            <div className="pl-2">
              <span className="text-sky">Widget</span> <span className="text-[#82aaff]">build</span>(ctx) =&gt;
            </div>
            <div className="pl-4">
              <span className="text-sky">Scaffold</span>(body: <span className="text-sky">Column</span>(
            </div>
            <div className="pl-6 text-dim">SvgPicture.asset(…),</div>
            <div className="pl-6 text-dim">Text(&apos;Design to code&apos;),</div>
          </div>
        )}
      </div>
    </div>
  );
}

function OnboardingScreen({ step }: { step: number }) {
  const asset = step === 1;
  const box = (on: boolean) => (on ? "outline outline-[1.5px] outline-offset-2 outline-sky" : "");
  return (
    <div className="flex h-full flex-col p-3.5 sm:p-4">
      <div className="flex justify-between">
        <span className={`size-4 rounded-full bg-[#0a1f44]/10 ${box(asset)}`} />
        <span className="h-2 w-8 rounded bg-[#0a1f44]/10" />
      </div>
      <div className={`mt-4 h-[110px] rounded-2xl bg-gradient-to-br from-[#54c5f8] to-[#0553b1] sm:h-[128px] ${box(asset)}`}>
        <div className="flex h-full items-end gap-1.5 p-3">
          <span className={`size-6 rounded-lg bg-white/30 ${box(asset)}`} />
          <span className={`size-6 rounded-lg bg-white/20 ${box(asset)}`} />
        </div>
      </div>
      <div className="mt-4 h-3 w-4/5 rounded bg-[#0a1f44]" />
      <div className="mt-2.5 h-2 w-full rounded bg-[#dce6f2]" />
      <div className="mt-1.5 h-2 w-3/5 rounded bg-[#dce6f2]" />
      <div className="mt-3 flex gap-1">
        <span className="h-1.5 w-4 rounded-full bg-[#0553b1]" />
        <span className="size-1.5 rounded-full bg-[#dce6f2]" />
        <span className="size-1.5 rounded-full bg-[#dce6f2]" />
      </div>
      <div className="mt-auto h-9 rounded-xl bg-[#0553b1]" />
    </div>
  );
}

function LoginScreen({ step }: { step: number }) {
  const on = (n: number) => `transition-all duration-500 ${step >= n ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`;
  const tight = step >= 3;
  return (
    <div className={`flex h-full flex-col p-4 transition-all duration-500 ${tight ? "gap-2.5" : "gap-3.5"}`}>
      <div className={on(1)}>
        <span className="block size-7 rounded-xl bg-gradient-to-br from-[#54c5f8] to-[#0553b1]" />
        <div className="mt-4 h-3 w-3/4 rounded bg-[#0a1f44]" />
        <div className="mt-2 h-2 w-full rounded bg-[#dce6f2]" />
      </div>
      <div className={`${on(1)} mt-3 space-y-1.5`}>
        <div className="h-1.5 w-8 rounded bg-[#9fb0c6]" />
        <div className="h-8 rounded-lg border border-[#dce6f2]" />
      </div>
      <div className={`${on(1)} space-y-1.5`}>
        <div className="h-1.5 w-10 rounded bg-[#9fb0c6]" />
        <div className="h-8 rounded-lg border border-[#dce6f2]" />
      </div>
      <div className={`${on(1)} mt-auto h-9 bg-[#0553b1] transition-all duration-500 ${tight ? "rounded-xl" : "rounded-sm"}`} />
      <div className={`${on(1)} mx-auto h-1.5 w-16 rounded bg-[#dce6f2]`} />
    </div>
  );
}

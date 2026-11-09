import type { CSSProperties } from "react";
import { journeyActors, type JourneyStep } from "@/lib/projects";
import { DeviceFrame } from "./device-frame";
import { Reveal } from "./reveal";

export function Phone({ src, alt, className = "", style, eager }: { src: string; alt: string; className?: string; style?: CSSProperties; eager?: boolean }) {
  return (
    <DeviceFrame className={`drop-shadow-[0_30px_40px_rgba(0,0,0,0.6)] ${className}`} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} className="size-full object-cover object-top" />
    </DeviceFrame>
  );
}

export function Browser({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-line-2 bg-panel shadow-[0_30px_80px_-24px_rgba(0,0,0,0.9)] ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" className="w-full" />
    </div>
  );
}

export function HeroStack({ dashboard, phones, label }: { dashboard: string; phones: string[]; label: string }) {
  const placement = [
    { left: "0%", top: "30%", rotate: "-8deg", z: 1 },
    { left: "33%", top: "20%", rotate: "0deg", z: 3 },
    { left: "66%", top: "32%", rotate: "8deg", z: 2 },
  ];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[600px]">
      <div className="absolute top-0 right-0 w-[92%] -rotate-2 overflow-hidden rounded-xl border border-line-2 opacity-80 shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dashboard} alt={`${label} admin dashboard`} className="aspect-[16/10] w-full object-cover object-top" />
      </div>
      {phones.map((src, i) => (
        <Phone
          key={src}
          src={src}
          alt={`${label} app screen`}
          eager
          className="absolute w-[34%]"
          style={{ left: placement[i].left, top: placement[i].top, rotate: placement[i].rotate, zIndex: placement[i].z }}
        />
      ))}
    </div>
  );
}

export function Journey({ steps, label }: { steps: JourneyStep[]; label: string }) {
  return (
    <ol className="relative">
      <span aria-hidden className="absolute top-2 bottom-2 left-[15px] w-px bg-gradient-to-b from-line-2 via-line-2 to-transparent" />
      {steps.map((s, i) => {
        const actor = journeyActors[s.actor];
        return (
          <li key={s.title} className="relative pb-16 pl-12 last:pb-0 sm:pb-20">
            <span
              className="absolute top-0 left-0 grid size-[31px] place-items-center rounded-full border bg-bg font-mono text-xs text-fg"
              style={{ borderColor: actor.color }}
            >
              {i + 1}
            </span>
            <Reveal className="grid items-start gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14">
              <div className="pt-0.5">
                <div className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted">
                  <span className="size-1.5 rounded-full" style={{ background: actor.color }} />
                  {actor.label}
                </div>
                <h3 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-fg">{s.title}</h3>
                <p className="mt-3 leading-relaxed text-pretty text-muted">{s.text}</p>
              </div>
              {s.phones ? (
                <div className="flex justify-center gap-4 sm:gap-6 lg:justify-start">
                  {s.phones.map((src) => (
                    <Phone key={src} src={src} alt={`${label}: ${s.title}`} className="w-[46%] max-w-[230px]" />
                  ))}
                </div>
              ) : (
                s.screen && <Browser src={s.screen} alt={`${label}: ${s.title}`} />
              )}
            </Reveal>
          </li>
        );
      })}
    </ol>
  );
}

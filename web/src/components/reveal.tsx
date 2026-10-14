"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

const pending = new Set<HTMLElement>();
let frame = 0;

function check() {
  frame = 0;
  const limit = window.innerHeight * 0.92;
  for (const el of pending) {
    if (el.getBoundingClientRect().top < limit) {
      el.classList.add("is-in");
      pending.delete(el);
    }
  }
  if (!pending.size) {
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
  }
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(check);
}

function watch(el: HTMLElement) {
  if (!pending.size) {
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
  }
  pending.add(el);
  schedule();
  return () => {
    pending.delete(el);
  };
}

export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  as?: ElementType;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => (ref.current ? watch(ref.current) : undefined), []);
  return (
    <Tag ref={ref} className={`reveal ${className}`} style={{ "--delay": `${delay}ms` } as React.CSSProperties}>
      {children}
    </Tag>
  );
}

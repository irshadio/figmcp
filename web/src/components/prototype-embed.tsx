"use client";

import { useState } from "react";
import { DeviceFrame } from "./device-frame";
import { PlayIcon } from "./icons";

export function PrototypeEmbed({ src, poster, title }: { src: string; poster: string; title: string }) {
  const [live, setLive] = useState(false);

  return (
    <DeviceFrame className="mx-auto h-[min(860px,82vh)] drop-shadow-[0_40px_80px_rgba(31,111,235,0.35)]">
      {live ? (
        <iframe src={src} title={title} allowFullScreen className="size-full border-0" />
      ) : (
        <button
          type="button"
          onClick={() => setLive(true)}
          data-track="play_prototype"
          aria-label={`Play the ${title}`}
          className="group relative block size-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={poster} alt="" loading="lazy" className="size-full object-cover object-top opacity-75 transition group-hover:opacity-55" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="flex flex-col items-center gap-3">
              <span className="grid size-16 place-items-center rounded-full bg-white text-bg shadow-xl transition group-hover:scale-105">
                <PlayIcon width={24} height={24} fill="currentColor" className="translate-x-0.5" />
              </span>
              <span className="rounded-full bg-black/60 px-3 py-1 text-sm text-white backdrop-blur">Tap to play</span>
            </span>
          </span>
        </button>
      )}
    </DeviceFrame>
  );
}

import type { CSSProperties, ReactNode } from "react";

const DEVICE = { src: "/showcase/tekvo/device/iphone-16-pro-max.png", width: 1424, height: 2956 };
const SCREEN = { x: 52, y: 44, width: 1320, height: 2868, radius: 186 };

export function DeviceFrame({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`${/\babsolute\b/.test(className) ? "" : "relative "}${className}`} style={{ aspectRatio: `${DEVICE.width} / ${DEVICE.height}`, ...style }}>
      <div
        className="absolute overflow-hidden bg-black"
        style={{
          left: `${(SCREEN.x / DEVICE.width) * 100}%`,
          top: `${(SCREEN.y / DEVICE.height) * 100}%`,
          width: `${(SCREEN.width / DEVICE.width) * 100}%`,
          height: `${(SCREEN.height / DEVICE.height) * 100}%`,
          borderRadius: `${(SCREEN.radius / SCREEN.width) * 100}% / ${(SCREEN.radius / SCREEN.height) * 100}%`,
        }}
      >
        {children}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={DEVICE.src} alt="" aria-hidden className="pointer-events-none absolute inset-0 size-full select-none" />
    </div>
  );
}

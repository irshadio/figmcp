export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" className={className} aria-hidden>
      <defs>
        <linearGradient id="lm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0553B1" />
          <stop offset="1" stopColor="#0A1F44" />
        </linearGradient>
        <linearGradient id="lm-fg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B3E5FC" />
          <stop offset="1" stopColor="#54C5F8" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="28" fill="url(#lm-bg)" stroke="#2F6DC4" strokeWidth="3" />
      <g fill="none" stroke="url(#lm-fg)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 44 V30 H44" />
        <path d="M84 30 H98 V44" />
        <path d="M98 84 V98 H84" />
        <path d="M44 98 H30 V84" />
        <path d="M55 52 L43 64 L55 76" />
        <path d="M73 52 L85 64 L73 76" />
      </g>
    </svg>
  );
}

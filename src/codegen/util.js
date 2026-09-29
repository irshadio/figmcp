// Shared value formatting for code generation.

export function num(v) {
  return String(Math.round(v * 100) / 100);
}

export function px(v) {
  return `${num(v)}px`;
}

function channel(v) {
  return Math.round(v * 255).toString(16).padStart(2, '0');
}

/** '#rrggbb' or 'rgba(r,g,b,a)' for a Figma colour and extra opacity. */
export function css(color, opacity = 1) {
  const a = (color.a ?? 1) * opacity;
  if (a >= 0.999) return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
  const c = (v) => Math.round(v * 255);
  return `rgba(${c(color.r)},${c(color.g)},${c(color.b)},${num(a)})`;
}

export function hex(color, opacity = 1) {
  const a = (color.a ?? 1) * opacity;
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}${
    a >= 0.999 ? '' : channel(a)}`.toUpperCase();
}

export function visiblePaints(list) {
  return Array.isArray(list) ? list.filter((p) => p && p.visible !== false) : [];
}

/** CSS angle for a linear gradient from its transform matrix. */
function gradientAngle(transform) {
  if (!Array.isArray(transform)) return 180;
  const [[a], [b]] = transform;
  const deg = (Math.atan2(b, a) * 180) / Math.PI;
  return Math.round((deg + 90 + 360) % 360);
}

function stops(paint) {
  const opacity = paint.opacity ?? 1;
  return (paint.gradientStops || [])
    .map((s) => `${css(s.color, opacity)} ${num(s.position * 100)}%`)
    .join(',');
}

/** A CSS background layer for a paint, or null when it has none. */
export function paintCss(paint) {
  const opacity = paint.opacity ?? 1;
  switch (paint.type) {
    case 'SOLID':
      return css(paint.color, opacity);
    case 'GRADIENT_LINEAR':
      return `linear-gradient(${gradientAngle(paint.gradientTransform)}deg,${stops(paint)})`;
    case 'GRADIENT_RADIAL':
      return `radial-gradient(circle,${stops(paint)})`;
    case 'GRADIENT_ANGULAR':
      return `conic-gradient(${stops(paint)})`;
    case 'GRADIENT_DIAMOND':
      return `radial-gradient(${stops(paint)})`;
    default:
      return null;
  }
}

/** Tailwind arbitrary values cannot contain spaces. */
export function tw(value) {
  return String(value).replace(/\s+/g, '_');
}

export function pascal(name, fallback = 'Frame') {
  const words = String(name).replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ')
    .filter(Boolean);
  let out = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  if (!out) out = fallback;
  if (/^[0-9]/.test(out)) out = fallback + out;
  return out;
}

export function camel(name, fallback) {
  const p = pascal(name, fallback);
  return p[0].toLowerCase() + p.slice(1);
}

export function attr(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A CSS custom property name for a variable ('primary/900' -> 'primary\/900'). */
function varIdent(name) {
  return String(name).trim().replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9_-]/g, (c) => `\\${c}`);
}

/** 'var(--name,fallback)' when a variable is bound, else the fallback. */
export function withVar(name, fallback) {
  return name ? `var(--${varIdent(name)},${fallback})` : fallback;
}

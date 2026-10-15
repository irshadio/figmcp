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

/**
 * A CSS custom property name for a variable ('primary/900' -> 'primary-900'):
 * characters an identifier would have to escape become dashes, so classes
 * carry no backslashes.
 */
export function varIdent(name) {
  return String(name).trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'var';
}

/** 'var(--name,fallback)' when a variable is bound, else the fallback. */
export function withVar(name, fallback) {
  return name ? `var(--${varIdent(name)},${fallback})` : fallback;
}

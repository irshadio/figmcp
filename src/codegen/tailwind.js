// Tailwind details: theme utilities that equal an exact value, and the
// stylesheet declaring the design variables the code uses.

// The default spacing scale of Tailwind 3.4, which 4 also has (0.25rem
// steps, 4px at the default root size).
const SPACING = new Map([
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44,
  48, 52, 56, 60, 64, 72, 80, 96,
].map((step) => [step * 4, String(step)]));
const SPACING_PREFIXES = new Set([
  'p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'ps', 'pe', 'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'ms', 'me',
  'gap', 'gap-x', 'gap-y', 'w', 'h', 'inset', 'inset-x', 'inset-y', 'top', 'right', 'bottom', 'left',
]);
// Negative values exist for margins and positions only.
const NEGATIVE_PREFIXES = new Set(['m', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'ms', 'me',
  'inset', 'inset-x', 'inset-y', 'top', 'right', 'bottom', 'left']);
const WEIGHTS = {
  100: 'thin', 200: 'extralight', 300: 'light', 400: 'normal', 500: 'medium', 600: 'semibold',
  700: 'bold', 800: 'extrabold', 900: 'black',
};
const OPACITIES = new Set([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]);
const COLOR_PREFIXES = new Set(['bg', 'text', 'border', 'outline', 'decoration', 'fill', 'stroke']);
const NAMED_COLORS = { '#ffffff': 'white', '#000000': 'black', transparent: 'transparent' };
const Z = new Set([0, 10, 20, 30, 40, 50]);
// A radius this large draws a pill on any box a screen holds.
const PILL = 999;
// Radii whose names Tailwind 4 kept (sm, xs and the bare name moved).
const RADII = { 6: 'md', 8: 'lg', 12: 'xl', 16: '2xl', 24: '3xl' };

/**
 * The theme utility equal to an arbitrary-value class, or the class itself:
 * px-[16px] -> px-4, left-[0px] -> left-0, rounded-[999px] -> rounded-full,
 * font-[700] -> font-bold, bg-[#ffffff] -> bg-white. Only exact matches
 * valid in Tailwind 3.4 and 4 are used.
 */
export function snapClass(cls) {
  // Variants (placeholder:, max-[310px]:) stay; the utility after them snaps.
  let depth = 0;
  for (let i = cls.length - 1; i >= 0; i--) {
    if (cls[i] === ']') depth++;
    else if (cls[i] === '[') depth--;
    else if (cls[i] === ':' && depth === 0) return cls.slice(0, i + 1) + snapUtility(cls.slice(i + 1));
  }
  return snapUtility(cls);
}

function snapUtility(cls) {
  const m = /^(-?)([a-z]+(?:-[a-z]+)*)-\[([^\]]+)\]$/.exec(cls);
  if (!m) return cls;
  const [, neg, prefix, value] = m;
  if (neg) return cls;
  const length = /^(-?\d+(?:\.\d+)?)px$/.exec(value);
  if (length && SPACING_PREFIXES.has(prefix)) {
    const v = Number(length[1]);
    const step = SPACING.get(Math.abs(v));
    if (v === 1 && prefix !== 'm' && !prefix.startsWith('m') && !prefix.startsWith('inset')) return `${prefix}-px`;
    if (step === undefined) return cls;
    if (v < 0) return NEGATIVE_PREFIXES.has(prefix) ? `-${prefix}-${step}` : cls;
    return `${prefix}-${step}`;
  }
  if (length && /^rounded(-(t|r|b|l|tl|tr|br|bl|s|e|ss|se|es|ee))?$/.test(prefix)) {
    const v = Number(length[1]);
    if (v === 0) return `${prefix}-none`;
    if (v >= PILL) return `${prefix}-full`;
    return RADII[v] ? `${prefix}-${RADII[v]}` : cls;
  }
  if (prefix === 'font' && WEIGHTS[value]) return `font-${WEIGHTS[value]}`;
  if (prefix === 'opacity' && /^(0|1|0?\.\d+)$/.test(value)) {
    const pct = Math.round(Number(value) * 100);
    if (Math.abs(Number(value) * 100 - pct) < 1e-9 && OPACITIES.has(pct)) return `opacity-${pct}`;
    return cls;
  }
  if (COLOR_PREFIXES.has(prefix) && NAMED_COLORS[value.toLowerCase()]) return `${prefix}-${NAMED_COLORS[value.toLowerCase()]}`;
  if (prefix === 'z' && /^\d+$/.test(value) && Z.has(Number(value))) return `z-${value}`;
  if ((prefix === 'w' || prefix === 'h') && value === '100%') return `${prefix}-full`;
  return cls;
}

/** inset-0 for four zero edges, and the same for x and y pairs. */
export function mergeEdges(classes) {
  const has = (c) => classes.includes(c);
  let out = classes;
  if (['top-0', 'right-0', 'bottom-0', 'left-0'].every(has)) {
    out = out.filter((c) => !['top-0', 'right-0', 'bottom-0', 'left-0'].includes(c));
    out.splice(out.indexOf('absolute') + 1, 0, 'inset-0');
  }
  return out;
}

function unescapeIdent(ident) {
  return ident.replace(/\\(.)/g, '$1');
}

/** A theme key from a Figma variable name ('Brand/Primary 600' -> 'brand-primary-600'). */
export function themeKey(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'token';
}

/**
 * Every var(--name,fallback) in [code] with the class prefix it sits in:
 * [{ ident, name, value, kind }]; kind is color, radius, spacing, text,
 * leading, tracking, weight or number.
 */
export function usedVariables(code) {
  const found = new Map();
  const re = /var\(--((?:\\.|[A-Za-z0-9_-])+),/g;
  let m;
  while ((m = re.exec(code))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < code.length && depth; i++) {
      if (code[i] === '(') depth++;
      else if (code[i] === ')') depth--;
    }
    const value = code.slice(re.lastIndex, i - 1).replace(/_/g, ' ');
    const before = code.slice(Math.max(0, m.index - 40), m.index);
    const cls = /([a-z-]+)-\[(?:length:|color:)?$|\[([a-z-]+):[^[]*$/.exec(before);
    const prefix = cls ? (cls[1] || cls[2]) : '';
    const ident = m[1];
    if (found.has(ident)) continue;
    const kind = /^(#|rgba?\(|hsla?\()/.test(value) ? 'color'
      : /^rounded/.test(prefix) ? 'radius'
        : prefix === 'text' ? 'text'
          : prefix === 'leading' ? 'leading'
            : prefix === 'tracking' ? 'tracking'
              : prefix === 'font-weight' ? 'weight'
                : /px$/.test(value) ? 'spacing' : 'number';
    found.set(ident, { ident, name: unescapeIdent(ident), value, kind });
  }
  return [...found.values()];
}

const THEME_NAMESPACE = {
  color: 'color', radius: 'radius', spacing: 'spacing', text: 'text', leading: 'leading',
  tracking: 'tracking', weight: 'font-weight',
};

/**
 * The stylesheet for the design variables [code] uses: each declared on
 * :root with its value (and its Figma name from [names], ident -> name),
 * and for Tailwind 4 an @theme that turns them into utilities
 * (--color-brand-600 gives bg-brand-600). Empty when none is used.
 */
export function tokensCss(code, names = new Map()) {
  const vars = usedVariables(code).map((v) => ({ ...v, name: names.get(v.ident) || v.name }));
  if (!vars.length) return '';
  const root = vars.map((v) => `  --${v.ident}: ${v.value};${v.name !== v.ident ? ` /* ${v.name} */` : ''}`);
  const keys = new Set();
  const theme = [];
  for (const v of vars) {
    const ns = THEME_NAMESPACE[v.kind];
    if (!ns) continue;
    const key = `--${ns}-${themeKey(v.name)}`;
    if (keys.has(key)) continue;
    keys.add(key);
    theme.push(`  ${key}: var(--${v.ident});`);
  }
  return [
    '/* Design variables used by the component, with their values in Figma. */',
    ':root {', ...root, '}',
    ...(theme.length ? ['', '/* Tailwind 4: utilities named after the variables (bg-brand-600, rounded-card, ...). */',
      '@theme inline {', ...theme, '}'] : []),
    '',
  ].join('\n');
}

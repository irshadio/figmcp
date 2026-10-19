// Figma text styles as named class lists: the typography classes every use
// of a style shares are declared once (textStyles.captionStrong) and each
// element names the style, keeping its own colour, box and alignment.
import { camel } from './util.js';

// Typography classes: family, weight, style, size, line height, spacing,
// case, decoration and features. Colours and alignment stay on the element.
const TYPOGRAPHY = /^(font-|text-\[\d|text-\[length:|leading-|tracking-|italic$|not-italic$|uppercase$|lowercase$|capitalize$|underline$|line-through$|decoration-|\[font-)/;
const MIN_USES = 2;
const MIN_CLASSES = 2;

/** The className of a line: { start, end, tokens, literal } or null. */
function classNameOf(line) {
  const plain = /className="([^"]*)"/.exec(line);
  if (plain) return { start: plain.index, end: plain.index + plain[0].length, tokens: plain[1].split(' '), literal: false };
  const tpl = /className=\{`([^`]*)`\}/.exec(line);
  if (tpl) return { start: tpl.index, end: tpl.index + tpl[0].length, tokens: tpl[1].split(' '), literal: true };
  return null;
}

function styleOf(line) {
  const m = /data-text-style="([^"]+)"/.exec(line);
  return m ? m[1] : null;
}

/**
 * Rewrites [lines] so each Figma text style used at least twice is a
 * shared class list. Returns { lines, declaration } where the declaration
 * is the textStyles object's lines (empty when no style qualifies).
 */
export function applyTextStyles(lines) {
  const uses = new Map();
  for (const line of lines) {
    const style = styleOf(line);
    const cls = style && classNameOf(line);
    if (!cls) continue;
    if (!uses.has(style)) uses.set(style, []);
    uses.get(style).push(cls.tokens.filter((t) => TYPOGRAPHY.test(t)));
  }
  const keys = new Map();
  const taken = new Set();
  const declared = [];
  for (const [style, lists] of uses) {
    if (lists.length < MIN_USES) continue;
    const common = lists[0].filter((t) => lists.every((list) => list.includes(t)));
    // The list goes in a template literal, which would read escapes.
    if (common.length < MIN_CLASSES || common.some((t) => /[\\`$]/.test(t))) continue;
    const parts = style.split('/').map((p) => p.trim()).filter(Boolean);
    let key = camel(parts[parts.length - 1] || style, 'text');
    if (taken.has(key)) key = camel(parts.join(' '), 'text');
    for (let i = 2; taken.has(key); i++) key = `${camel(parts.join(' '), 'text')}${i}`;
    taken.add(key);
    keys.set(style, { key, common });
    declared.push(`  // ${style}`, `  ${key}: ${JSON.stringify(common.join(' '))},`);
  }
  if (!keys.size) return { lines, declaration: [] };
  const out = lines.map((line) => {
    const style = styleOf(line);
    const hit = style && keys.get(style);
    const cls = hit && classNameOf(line);
    if (!cls) return line;
    const rest = cls.tokens.filter((t) => !hit.common.includes(t));
    const value = `{\`\${textStyles.${hit.key}}${rest.length ? ` ${rest.join(' ')}` : ''}\`}`;
    return `${line.slice(0, cls.start)}className=${value}${line.slice(cls.end)}`;
  });
  return { lines: out, declaration: ['const textStyles = {', ...declared, '};'] };
}

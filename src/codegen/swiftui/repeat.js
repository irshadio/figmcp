// Repeated siblings: runs of layers built the same way become one view fed
// by data, and a run where one item is drawn differently is a selection.
import { drawnAsSvg, hasImageFill, visibleChildren } from '../nodes.js';
import { casedRuns, segmentsOf } from '../text.js';
import { print, raw } from './swift.js';

const GENERIC = /^(row|rows|grid|list|items?|content|container|frame|group|stack|wrapper|body|section|text|auto layout.*|frame \d+)$/i;
// Figma's default layer names and pasted file names, which say nothing of what a layer is.
const DEFAULT_NAME = new RegExp('^((frame|group|component|instance|rectangle|rect|vector|ellipse|polygon|star|line|union|subtract|' +
  'intersect|exclude|image|img|icon|ic|item|layer|shape|row|rows|column|grid|list|items|content|container|stack|wrapper|body|' +
  'section|text|auto layout|property|variant)([\\s_/-]*\\d+)*|[a-z]|\\d+|.*\\bimage\\b.*\\d{3,}.*)$', 'i');

/** Whether [name] says nothing of what its layer is ("Frame 2147232163", "Group 12", "image 2"). */
export function isGenericName(name) {
  const s = String(name || '').trim();
  return !s || DEFAULT_NAME.test(s) || GENERIC.test(s);
}

/** A key that equal layers share whatever their texts, images and colours. */
const shapeKeys = new WeakMap();

export function shapeKey(n) {
  if (!n || n.visible === false) return '';
  if (!shapeKeys.has(n)) shapeKeys.set(n, ownShapeKey(n));
  return shapeKeys.get(n);
}

function ownShapeKey(n) {
  const fixed = (axis) => {
    const sizing = axis === 'x' ? n.layoutSizingHorizontal : n.layoutSizingVertical;
    if (n.type === 'TEXT' || sizing === 'HUG' || sizing === 'FILL') return '';
    return Math.round(axis === 'x' ? n.width : n.height);
  };
  const own = [
    n.type, n.layoutMode || '', n.layoutWrap || '', n.itemSpacing || 0,
    n.paddingTop || 0, n.paddingRight || 0, n.paddingBottom || 0, n.paddingLeft || 0,
    n.layoutSizingHorizontal || '', n.layoutSizingVertical || '', fixed('x'), fixed('y'),
    n.cornerRadius ?? '', drawnAsSvg(n) ? 'svg' : '', n.render ? 'render' : '', hasImageFill(n) ? 'img' : '',
    n.type === 'TEXT' ? segmentsOf(n).length : '',
  ].join('|');
  return `${own}(${visibleChildren(n).map(shapeKey).join(',')})`;
}

/** Runs of 2 or more consecutive layers with the same shape: [{ start, items }]. */
export function runsOf(nodes) {
  const out = [];
  let i = 0;
  while (i < nodes.length) {
    const key = shapeKey(nodes[i]);
    let j = i + 1;
    while (j < nodes.length && shapeKey(nodes[j]) === key) j++;
    if (j - i >= 2 && visibleChildren(nodes[i]).length) out.push({ start: i, items: nodes.slice(i, j) });
    i = j;
  }
  return out;
}

function textOf(n) {
  return casedRuns(n).join('').replace(/\u2028/g, '\n');
}

function imageHash(n) {
  const p = (Array.isArray(n.fills) ? n.fills : []).find((f) => f && f.visible !== false && f.type === 'IMAGE');
  return p ? p.imageHash : null;
}

/**
 * What differs between the items, aligned layer by layer: [{ kind: 'text' |
 * 'image' | 'icon', name, nodes }] with one node per item.
 */
export function fieldsOf(items) {
  const out = [];
  const walk = (nodes) => {
    const t = nodes[0];
    if (t.type === 'TEXT') {
      if (segmentsOf(t).length === 1 && new Set(nodes.map(textOf)).size > 1) out.push({ kind: 'text', nodes });
      return;
    }
    if (drawnAsSvg(t)) {
      if (new Set(nodes.map((n) => n.svg)).size > 1) out.push({ kind: 'icon', nodes });
      return;
    }
    if (hasImageFill(t) && new Set(nodes.map(imageHash)).size > 1) out.push({ kind: 'image', nodes });
    const kids = nodes.map(visibleChildren);
    for (let i = 0; i < kids[0].length; i++) walk(kids.map((k) => k[i]));
  };
  walk(items);
  const used = new Set();
  const roles = { text: ['title', 'subtitle', 'detail', 'caption', 'note'], image: ['image'], icon: ['icon'] };
  for (const f of out) {
    const layer = f.nodes[0].name;
    const named = f.nodes.every((n) => n.name === layer) && !GENERIC.test(layer) &&
      !f.nodes.some((n) => n.type === 'TEXT' && textOf(n) === n.name) && /[A-Za-z]/.test(layer);
    let base = named ? layer : null;
    if (base && /^(icon|rectangle|image|ellipse|vector|title)$/i.test(base.split(/[/ ]/).pop())) base = null;
    const pick = () => {
      const list = roles[f.kind];
      return list.find((r) => !used.has(r)) || `${list[0]}${[...used].filter((u) => u.startsWith(list[0])).length + 1}`;
    };
    f.name = base;
    f.role = pick();
    used.add(f.role);
  }
  return out.map((f) => ({ ...f, values: f.kind === 'text' ? f.nodes.map(textOf) : null }));
}

/** A type name for the items: their shared layer name, else the nearest named ancestor, singular. */
export function baseName(items, ancestors, label = null) {
  const first = items[0].name;
  if (items.every((n) => n.name === first) && !isGenericName(first)) return first;
  const named = [...ancestors].reverse().find((a) => a && !isGenericName(a.name) && /[A-Za-z]/.test(a.name || ''));
  let word = named ? named.name : label || 'Item';
  // Items of a bar or a menu are its items, not bars.
  if (/(bar|menu|nav|navigation|toolbar)$/i.test(word)) word = `${word} item`;
  return word.replace(/[A-Za-z]+$/, singular);
}

// Words whose plural is themselves, or that end in s as singulars.
const UNCOUNTED = new Set(['news', 'series', 'species', 'status', 'bus', 'canvas', 'plus', 'gas', 'campus', 'bonus', 'virus',
  'focus', 'corpus', 'atlas', 'alias', 'analysis', 'basis', 'axis', 'crisis', 'thesis', 'chassis', 'lens', 'data', 'info',
  'analytics', 'statistics', 'physics', 'maths', 'economics', 'sms', 'gps', 'ios', 'faqs']);
// Plurals in -ies whose singular ends in -ie.
const IE_WORDS = new Set(['movies', 'cookies', 'selfies', 'calories', 'zombies', 'rookies', 'goalies', 'hoodies', 'smoothies',
  'pies', 'ties', 'lies', 'freebies', 'brownies', 'newbies', 'genies', 'aunties', 'veggies', 'techies', 'sweeties', 'boogies']);
// Plurals in -uses or -oes that drop -es.
const ES_WORDS = /^(statuses|buses|bonuses|campuses|viruses|focuses|heroes|potatoes|tomatoes|echoes|vetoes|torpedoes)$/i;

/** The singular of an English word ("Categories" -> "Category", "Movies" -> "Movie", "News" -> "News"). */
export function singular(word) {
  const w = word.toLowerCase();
  const keep = (s) => word.slice(0, s.length);
  if (UNCOUNTED.has(w) || /(ss|us|is)$/.test(w) || w.length < 3) return word;
  if (IE_WORDS.has(w)) return keep(w.slice(0, -1));
  if (ES_WORDS.test(w)) return keep(w.slice(0, -2));
  if (/[^aeiou]ies$/.test(w)) return `${keep(w.slice(0, -3))}${word[word.length - 3] === 'I' ? 'Y' : 'y'}`;
  if (/(ch|sh|x|zz|sses)es$/.test(w) || /sses$/.test(w)) return keep(w.slice(0, -2));
  if (/s$/.test(w) && !/'s$/.test(w)) return keep(w.slice(0, -1));
  return word;
}

/** The plural of an identifier ('chip' -> 'chips', 'search' -> 'searches'). */
export function plural(ident) {
  // A word that is its own plural ("news", "series") lists its items.
  const last = /[A-Z]?[a-z]+$/.exec(ident);
  if (last && /s$/.test(ident) && singular(last[0]) === last[0]) return `${ident}Items`;
  if (/(ch|sh|s|x)$/.test(ident)) return `${ident}es`;
  if (/[^aeiou]y$/.test(ident)) return `${ident.slice(0, -1)}ies`;
  return `${ident}s`;
}

// More ternaries than this in one item body slow the type checker down;
// the item is then drawn with if isSelected { ... } else { ... }.
const MAX_TERNARIES = 6;
const GRADIENTS = new Set(['LinearGradient', 'RadialGradient', 'AngularGradient', 'EllipticalGradient']);
// Calls whose string arguments are what the user reads: a differing label is data, not selection.
const LABELS = new Set(['Text', 'Label', 'TextField', 'SecureField', 'Link', 'Toggle', 'Picker']);

/**
 * The Swift type a value has, as far as a ternary needs: values of one
 * class can be the two sides of `isSelected ? a : b`. Null when unknown.
 * [tokenType] gives the type of a design token by its identifier.
 */
function classOf(v, tokenType) {
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'bool';
  if (!v || typeof v !== 'object') return null;
  if (v.kind === 'str') return 'string';
  if (v.kind === 'raw') {
    const code = v.code.trim();
    if (/^-?\d+(\.\d+)?$/.test(code) || /^iconSize[\d_]+$/.test(code)) return 'number';
    if (/^Color\(hex: 0x[0-9A-F]{6}(, opacity: [\d.]+)?\)$/.test(code)) return 'Color';
    const token = /^DesignTokens\.(\w+)(\.opacity\([\d.]+\))?$/.exec(code);
    if (token) return tokenType(token[1]) === 'Color' ? 'Color' : token[2] ? null : 'number';
    if (/^AppFonts\.\w+$/.test(code)) return 'Font';
    if (/^\.[a-zA-Z]\w*$/.test(code)) return 'member';
    return null;
  }
  if (v.kind === 'call') {
    if (GRADIENTS.has(v.name) && !v.view) return v.name;
    if ((v.name === '.custom' || v.name === '.system') && !v.view) return 'Font';
  }
  return null;
}

/**
 * The code of a selected item [on] and an unselected one [off] (expression
 * trees) as one tree: where only values of one type differ, the value
 * becomes `isSelected ? a : b`. Null when the items differ in structure
 * (another modifier, another view), in a label's text, or in more values
 * than one expression should hold.
 */
export function mergeTrees(on, off, { tokenType = () => null } = {}) {
  let left = MAX_TERNARIES;
  const ternary = (a, b) => {
    const x = print(a, 0);
    const y = print(b, 0);
    if (x.includes('\n') || y.includes('\n') || --left < 0) return null;
    return raw(`isSelected ? ${x} : ${y}`);
  };
  const same = (a, b) => a === b || (typeof a === 'object' && typeof b === 'object' && a && b && print(a, 0) === print(b, 0));
  const value = (a, b, owner) => {
    if (same(a, b)) return a;
    if (a && b && typeof a === 'object' && typeof b === 'object' && a.kind === 'call' && b.kind === 'call') {
      const merged = node(a, b);
      if (merged) return merged;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object' && a.kind === 'array' && b.kind === 'array') {
      if (a.items.length !== b.items.length) return null;
      const items = a.items.map((x, i) => value(x, b.items[i], owner));
      return items.every((x) => x !== null) ? { ...a, items } : null;
    }
    const type = classOf(a, tokenType);
    if (!type || type !== classOf(b, tokenType)) return null;
    if (type === 'string' && LABELS.has(owner)) return null;
    return ternary(a, b);
  };
  const args = (x, y, owner) => {
    if (x.length !== y.length || x.some(([label], i) => label !== y[i][0])) return null;
    const out = x.map(([label, v], i) => [label, value(v, y[i][1], owner)]);
    return out.every(([, v]) => v !== null) ? out : null;
  };
  const body = (x, y) => {
    if (!Array.isArray(x) || !Array.isArray(y)) return x === y || same(x, y) ? x : null;
    if (x.length !== y.length) return null;
    const out = x.map((item, i) => (same(item, y[i]) ? item : item && y[i] && item.kind === 'call' && y[i].kind === 'call' ? node(item, y[i]) : null));
    return out.every((item) => item !== null) ? out : null;
  };
  const node = (a, b) => {
    if (same(a, b)) return a;
    if (a.kind !== 'call' || b.kind !== 'call' || a.name !== b.name || a.params !== b.params || a.view !== b.view) return null;
    if (a.mods.length !== b.mods.length || (a.trailing || []).length !== (b.trailing || []).length) return null;
    const merged = { ...a, args: args(a.args, b.args, a.name), body: body(a.body, b.body) };
    if (!merged.args || (a.body && !merged.body)) return null;
    merged.trailing = (a.trailing || []).map((t, i) => (t.label === b.trailing[i].label ? { ...t, body: body(t.body, b.trailing[i].body) } : null));
    if (merged.trailing.some((t) => !t || !t.body)) return null;
    merged.mods = a.mods.map((m, i) => {
      const n = b.mods[i];
      if (m.name !== n.name || Boolean(m.body) !== Boolean(n.body)) return null;
      const margs = args(m.args, n.args, m.name);
      const mbody = m.body || n.body ? body(m.body, n.body) : null;
      return margs && (!m.body || mbody) ? { ...m, args: margs, body: mbody } : null;
    });
    return merged.mods.every(Boolean) ? merged : null;
  };
  return node(on, off);
}

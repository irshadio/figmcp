// Repeated siblings: runs of layers built the same way become one view fed
// by data, and a run where one item is drawn differently is a selection.
import { drawnAsSvg, hasImageFill, visibleChildren } from '../nodes.js';
import { casedRuns, segmentsOf } from '../text.js';

const GENERIC = /^(row|rows|grid|list|items?|content|container|frame|group|stack|wrapper|body|section|text|auto layout.*|frame \d+)$/i;

/** A key that equal layers share whatever their texts, images and colours. */
export function shapeKey(n) {
  if (!n || n.visible === false) return '';
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
export function baseName(items, ancestors) {
  const first = items[0].name;
  if (items.every((n) => n.name === first) && !GENERIC.test(first)) return first;
  const named = [...ancestors].reverse().find((a) => a && !GENERIC.test(a.name || '') && /[A-Za-z]/.test(a.name || ''));
  let word = named ? named.name : 'Item';
  // Items of a bar or a menu are its items, not bars.
  if (/(bar|menu|nav|navigation|toolbar)$/i.test(word)) word = `${word} item`;
  return word.replace(/(ch|sh|ss|x)es$/i, '$1').replace(/ies$/i, 'y').replace(/([^s])s$/i, '$1');
}

/** The plural of an identifier ('chip' -> 'chips', 'search' -> 'searches'). */
export function plural(ident) {
  if (/(ch|sh|s|x)$/.test(ident)) return `${ident}es`;
  if (/[^aeiou]y$/.test(ident)) return `${ident.slice(0, -1)}ies`;
  return `${ident}s`;
}

/**
 * Merges the code of a selected and an unselected item: a single body with
 * `isSelected ? a : b` where only values differ, else null.
 */
export function mergeVariants(on, off) {
  const a = on.split('\n');
  const b = off.split('\n');
  if (a.length !== b.length) return null;
  const out = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) {
      out.push(a[i]);
      continue;
    }
    let p = 0;
    while (p < a[i].length && a[i][p] === b[i][p]) p++;
    let s = 0;
    while (s < a[i].length - p && s < b[i].length - p && a[i][a[i].length - 1 - s] === b[i][b[i].length - 1 - s]) s++;
    // Widen to whole arguments: from after '(', ' ' or ',' to before ')' or ','.
    while (p > 0 && !/[( ,]/.test(a[i][p - 1])) p--;
    const balanced = (t) => [...t].reduce((d, c) => d + (c === '(' ? 1 : c === ')' ? -1 : 0), 0) === 0;
    const mid = (line) => line.slice(p, line.length - s);
    while (s > 0 && (!balanced(mid(a[i])) || !balanced(mid(b[i])) || !/[),]/.test(a[i][a[i].length - s]))) s--;
    const x = mid(a[i]);
    const y = mid(b[i]);
    if (!balanced(x) || !balanced(y) || !x.trim() || !y.trim()) return null;
    // A colour and a gradient are different types.
    if (/Gradient\(/.test(x) !== /Gradient\(/.test(y)) return null;
    out.push(`${a[i].slice(0, p)}isSelected ? ${x} : ${y}${a[i].slice(a[i].length - s)}`);
  }
  return out.join('\n');
}

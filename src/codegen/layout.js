// Position, size, auto-layout and grid classes.
import { num, px, tw, withVar } from './util.js';

const JUSTIFY = {
  MIN: 'justify-start', CENTER: 'justify-center', MAX: 'justify-end',
  SPACE_BETWEEN: 'justify-between',
};
const ITEMS = {
  MIN: 'items-start', CENTER: 'items-center', MAX: 'items-end',
  BASELINE: 'items-baseline',
};
// Children of these keep plain top-left positions: their box wraps them.
const WRAPPING_PARENTS = new Set(['GROUP', 'BOOLEAN_OPERATION']);

export function isAutoLayout(node) {
  return node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL';
}

export function isGrid(node) {
  return node.layoutMode === 'GRID';
}

function size(prefix, value, varName) {
  return `${prefix}-[${tw(withVar(varName, px(value)))}]`;
}

function minMax(node) {
  const vars = node.vars || {};
  const out = [];
  for (const [key, prefix] of [['minWidth', 'min-w'], ['maxWidth', 'max-w'],
    ['minHeight', 'min-h'], ['maxHeight', 'max-h']]) {
    if (typeof node[key] === 'number') out.push(size(prefix, node[key], vars[key]));
  }
  return out;
}

function sizing(node, axis) {
  const key = axis === 'x' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
  if (node[key]) return node[key];
  return undefined;
}

/**
 * Where a child sits in its parent.
 * [opts.fixedSize] gives hugging nodes their size too (an <img> has no
 * content size of its own); [opts.index] is the child's position among its
 * visible siblings.
 */
export function positionClasses(node, parent, opts = {}) {
  const vars = node.vars || {};
  const w = size('w', node.width, vars.width);
  const h = size('h', node.height, vars.height);
  if (!parent) return ['relative', w, h, ...minMax(node)];

  const text = node.type === 'TEXT';
  const hugsWidth = text && node.textAutoResize === 'WIDTH_AND_HEIGHT';
  const hugsHeight = text && (node.textAutoResize === 'WIDTH_AND_HEIGHT' ||
    node.textAutoResize === 'HEIGHT');
  const out = [];

  if ((isAutoLayout(parent) || isGrid(parent)) && node.layoutPositioning !== 'ABSOLUTE') {
    out.push('relative', 'shrink-0');
    const row = parent.layoutMode === 'HORIZONTAL';
    const main = row ? 'x' : 'y';
    let sizeW = sizing(node, 'x');
    let sizeH = sizing(node, 'y');
    // Exports without layoutSizing* carry the older grow / align fields.
    if (!sizeW) sizeW = (main === 'x' ? node.layoutGrow : node.layoutAlign === 'STRETCH') ? 'FILL' : 'FIXED';
    if (!sizeH) sizeH = (main === 'y' ? node.layoutGrow : node.layoutAlign === 'STRETCH') ? 'FILL' : 'FIXED';
    if (opts.fixedSize) {
      if (sizeW === 'HUG') sizeW = 'FIXED';
      if (sizeH === 'HUG') sizeH = 'FIXED';
    }
    if (isGrid(parent)) {
      if (typeof node.gridColumnAnchorIndex === 'number') out.push(`col-start-[${node.gridColumnAnchorIndex + 1}]`);
      if (typeof node.gridRowAnchorIndex === 'number') out.push(`row-start-[${node.gridRowAnchorIndex + 1}]`);
      if (node.gridColumnSpan > 1) out.push(`col-span-[${node.gridColumnSpan}]`);
      if (node.gridRowSpan > 1) out.push(`row-span-[${node.gridRowSpan}]`);
      if (sizeW === 'FILL') out.push('justify-self-stretch');
      else if (sizeW === 'FIXED' && !hugsWidth) out.push(w);
      if (sizeH === 'FILL') out.push('self-stretch');
      else if (sizeH === 'FIXED' && !hugsHeight) out.push(h);
    } else {
      if (sizeW === 'FILL') out.push(...(row ? ['flex-[1_0_0]', 'min-w-px'] : ['w-full']));
      else if (sizeW === 'FIXED' && !hugsWidth) out.push(w);
      if (sizeH === 'FILL') out.push(...(row ? ['self-stretch'] : ['flex-[1_0_0]', 'min-h-px']));
      else if (sizeH === 'FIXED' && !hugsHeight) out.push(h);
      if (parent.itemSpacing < 0 && opts.index > 0) {
        out.push(`${row ? 'ml' : 'mt'}-[${px(parent.itemSpacing)}]`);
      }
    }
    if (parent.itemReverseZIndex && typeof opts.index === 'number') {
      out.push(`z-[${(opts.count || 0) - opts.index}]`);
    }
    if (hugsWidth) out.push('whitespace-nowrap');
    out.push(...minMax(node));
    return out;
  }

  out.push('absolute');
  const x = node.x - parent.x;
  const y = node.y - parent.y;
  const pw = parent.width;
  const ph = parent.height;
  const cons = !WRAPPING_PARENTS.has(parent.type) && node.constraints
    ? node.constraints : { horizontal: 'MIN', vertical: 'MIN' };

  switch (cons.horizontal) {
    case 'MAX':
      out.push(`right-[${px(pw - x - node.width)}]`);
      if (!hugsWidth) out.push(w);
      break;
    case 'CENTER':
      // Offset from the centre without a transform: a translate would put the
      // layer on half pixels.
      out.push(`left-[calc(50%${sign(x - pw / 2)}px)]`);
      if (!hugsWidth) out.push(w);
      break;
    case 'STRETCH':
      out.push(`left-[${px(x)}]`, `right-[${px(pw - x - node.width)}]`);
      break;
    case 'SCALE':
      out.push(`left-[${num((x / pw) * 100)}%]`, `w-[${num((node.width / pw) * 100)}%]`);
      break;
    default:
      out.push(`left-[${px(x)}]`);
      if (!hugsWidth) out.push(w);
  }
  switch (cons.vertical) {
    case 'MAX':
      out.push(`bottom-[${px(ph - y - node.height)}]`);
      if (!hugsHeight) out.push(h);
      break;
    case 'CENTER':
      out.push(`top-[calc(50%${sign(y - ph / 2)}px)]`);
      if (!hugsHeight) out.push(h);
      break;
    case 'STRETCH':
      out.push(`top-[${px(y)}]`, `bottom-[${px(ph - y - node.height)}]`);
      break;
    case 'SCALE':
      out.push(`top-[${num((y / ph) * 100)}%]`, `h-[${num((node.height / ph) * 100)}%]`);
      break;
    default:
      out.push(`top-[${px(y)}]`);
      if (!hugsHeight) out.push(h);
  }
  if (hugsWidth) out.push('whitespace-nowrap');
  out.push(...minMax(node));
  return out;
}

function sign(v) {
  const n = num(v);
  return v < 0 ? n : `+${n}`;
}

function strokeSpace(node) {
  if (!node.strokesIncludedInLayout) return [0, 0, 0, 0];
  const visible = Array.isArray(node.strokes) && node.strokes.some((p) => p.visible !== false);
  if (!visible) return [0, 0, 0, 0];
  const w = typeof node.strokeWeight === 'number' ? node.strokeWeight : 0;
  return ['strokeLeftWeight', 'strokeRightWeight', 'strokeTopWeight', 'strokeBottomWeight']
    .map((k) => node[k] ?? w);
}

function padding(node) {
  const vars = node.vars || {};
  const extra = strokeSpace(node);
  const keys = ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'];
  const v = keys.map((k, i) => (node[k] || 0) + extra[i]);
  const name = (i) => (extra[i] ? null : vars[keys[i]]);
  const value = (i) => tw(withVar(name(i), px(v[i])));
  const out = [];
  const pair = (a, b, both, one1, one2) => {
    if (v[a] && v[a] === v[b] && name(a) === name(b)) out.push(`${both}-[${value(a)}]`);
    else {
      if (v[a]) out.push(`${one1}-[${value(a)}]`);
      if (v[b]) out.push(`${one2}-[${value(b)}]`);
    }
  };
  pair(0, 1, 'px', 'pl', 'pr');
  pair(2, 3, 'py', 'pt', 'pb');
  return out;
}

function track(t) {
  if (!t || typeof t !== 'object') return 'minmax(0,1fr)';
  if (t.type === 'FIXED') return px(t.value);
  if (t.type === 'HUG') return 'auto';
  return `minmax(0,${num(t.value || 1)}fr)`;
}

export function containerClasses(node) {
  const vars = node.vars || {};
  if (isGrid(node)) {
    const cols = Array.isArray(node.gridColumnSizes) ? node.gridColumnSizes.map(track).join('_')
      : `repeat(${node.gridColumnCount || 1},minmax(0,1fr))`;
    const rows = Array.isArray(node.gridRowSizes) ? node.gridRowSizes.map(track).join('_')
      : `repeat(${node.gridRowCount || 1},minmax(0,1fr))`;
    const out = ['grid', `grid-cols-[${cols}]`, `grid-rows-[${rows}]`];
    if (node.gridColumnGap) out.push(`gap-x-[${tw(withVar(vars.gridColumnGap, px(node.gridColumnGap)))}]`);
    if (node.gridRowGap) out.push(`gap-y-[${tw(withVar(vars.gridRowGap, px(node.gridRowGap)))}]`);
    return [...out, ...padding(node)];
  }
  if (!isAutoLayout(node)) return [];
  const out = ['flex'];
  if (node.layoutMode === 'VERTICAL') out.push('flex-col');
  if (node.layoutWrap === 'WRAP') {
    out.push('flex-wrap');
    if (node.counterAxisAlignContent === 'SPACE_BETWEEN') out.push('content-between');
    else out.push('content-start');
  }
  if (node.itemSpacing > 0 && node.primaryAxisAlignItems !== 'SPACE_BETWEEN') {
    out.push(`gap-[${tw(withVar(vars.itemSpacing, px(node.itemSpacing)))}]`);
  }
  if (node.layoutWrap === 'WRAP' && node.counterAxisSpacing) {
    const axis = node.layoutMode === 'VERTICAL' ? 'gap-x' : 'gap-y';
    out.push(`${axis}-[${tw(withVar(vars.counterAxisSpacing, px(node.counterAxisSpacing)))}]`);
  }
  out.push(JUSTIFY[node.primaryAxisAlignItems] || 'justify-start');
  out.push(ITEMS[node.counterAxisAlignItems] || 'items-start');
  return [...out, ...padding(node)];
}

export function radiusClasses(node) {
  if (node.type === 'ELLIPSE') return ['rounded-[50%]'];
  const vars = node.vars || {};
  const keys = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
  const corners = keys.map((k) => (typeof node[k] === 'number' ? node[k]
    : typeof node.cornerRadius === 'number' ? node.cornerRadius : 0));
  const names = keys.map((k) => vars[k]);
  if (corners.every((c) => c === corners[0]) && names.every((n) => n === names[0])) {
    return corners[0] ? [`rounded-[${tw(withVar(names[0], px(corners[0])))}]`] : [];
  }
  return ['tl', 'tr', 'br', 'bl']
    .map((k, i) => (corners[i] ? `rounded-${k}-[${tw(withVar(names[i], px(corners[i])))}]` : null))
    .filter(Boolean);
}

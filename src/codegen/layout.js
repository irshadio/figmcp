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
const GRID_JUSTIFY = { MIN: 'justify-self-start', CENTER: 'justify-self-center', MAX: 'justify-self-end' };
const GRID_ALIGN = { MIN: 'self-start', CENTER: 'self-center', MAX: 'self-end' };
// Children of these keep plain top-left positions: their box wraps them.
const WRAPPING_PARENTS = new Set(['GROUP', 'BOOLEAN_OPERATION']);

export function isAutoLayout(node) {
  return node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL';
}

export function isGrid(node) {
  return node.layoutMode === 'GRID';
}

/** Whether the parent's auto-layout or grid places [node]. */
export function inFlow(node, parent) {
  return Boolean(parent) && (isAutoLayout(parent) || isGrid(parent)) &&
    node.layoutPositioning !== 'ABSOLUTE';
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

/**
 * FILL, HUG or FIXED on an axis. Exports without layoutSizing* carry the
 * older grow / align fields.
 */
export function sizingOf(node, parent, axis) {
  const key = axis === 'x' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
  if (node[key]) return node[key];
  const main = parent && parent.layoutMode === 'HORIZONTAL' ? 'x' : 'y';
  return (main === axis ? node.layoutGrow : node.layoutAlign === 'STRETCH') ? 'FILL' : 'FIXED';
}

/**
 * A grid anchor, or null when the child is not anchored (-1). Older exports
 * dropped anchors at 0; a sibling with an anchor shows they were exported.
 */
export function gridAnchor(node, parent, key) {
  const v = node[key];
  if (typeof v === 'number') return v >= 0 ? v : null;
  const exported = (parent.children || []).some((c) =>
    ['gridRowAnchorIndex', 'gridColumnAnchorIndex'].some((k) => typeof c[k] === 'number' && c[k] >= 0));
  return exported ? 0 : null;
}

/**
 * Where a child sits in its parent.
 * [opts.fixedSize] gives hugging nodes their size too (an <img> has no
 * content size of its own); [opts.index] is the child's position among the
 * siblings the layout places, [opts.count] their number. On a phone screen,
 * [opts.stretch] stretches a positioned child across the width,
 * [opts.narrow] lets a fixed width shrink to the column and [opts.shrink]
 * lets a child of a row shrink when the row is too narrow. On a web page,
 * [opts.center] keeps a positioned child in the page's centred column,
 * [opts.pin] ('MIN' or 'MAX') keeps it on an edge, [opts.fill] makes a
 * child of a column fill it and [opts.indent] is a left margin.
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

  if (inFlow(node, parent)) {
    out.push('relative', opts.shrink ? 'min-w-0' : 'shrink-0');
    const row = parent.layoutMode === 'HORIZONTAL';
    let sizeW = opts.fill && !row ? 'FILL' : sizingOf(node, parent, 'x');
    let sizeH = sizingOf(node, parent, 'y');
    if (opts.fixedSize) {
      if (sizeW === 'HUG') sizeW = 'FIXED';
      if (sizeH === 'HUG') sizeH = 'FIXED';
    }
    if (isGrid(parent)) {
      const col = gridAnchor(node, parent, 'gridColumnAnchorIndex');
      const rowAt = gridAnchor(node, parent, 'gridRowAnchorIndex');
      if (col !== null) out.push(`col-start-[${col + 1}]`);
      if (rowAt !== null) out.push(`row-start-[${rowAt + 1}]`);
      if (node.gridColumnSpan > 1) out.push(`col-span-[${node.gridColumnSpan}]`);
      if (node.gridRowSpan > 1) out.push(`row-span-[${node.gridRowSpan}]`);
      if (sizeW === 'FILL') out.push('justify-self-stretch');
      else {
        if (GRID_JUSTIFY[node.gridChildHorizontalAlign]) out.push(GRID_JUSTIFY[node.gridChildHorizontalAlign]);
        if (sizeW === 'FIXED' && !hugsWidth) out.push(w);
      }
      if (sizeH === 'FILL') out.push('self-stretch');
      else {
        if (GRID_ALIGN[node.gridChildVerticalAlign]) out.push(GRID_ALIGN[node.gridChildVerticalAlign]);
        if (sizeH === 'FIXED' && !hugsHeight) out.push(h);
      }
    } else {
      if (sizeW === 'FILL') out.push(...(row ? ['flex-[1_0_0]', 'min-w-px'] : ['w-full']));
      else if (sizeW === 'FIXED' && !hugsWidth) out.push(...(opts.narrow && !row ? ['w-full', size('max-w', node.width, vars.width)] : [w]));
      if (sizeH === 'FILL') out.push(...(row ? ['self-stretch'] : ['flex-[1_0_0]', 'min-h-px']));
      else if (sizeH === 'FIXED' && !hugsHeight) out.push(h);
      if (parent.itemSpacing < 0 && opts.index > 0) {
        out.push(`${row ? 'ml' : 'mt'}-[${px(parent.itemSpacing)}]`);
      }
    }
    if (opts.indent) out.push(`ml-[${opts.indent}]`);
    const lift = baselineOffset(node, parent);
    if (lift) out.push(`mt-[${px(lift)}]`);
    if (parent.itemReverseZIndex && typeof opts.index === 'number') {
      out.push(`z-[${(opts.count || 0) - opts.index}]`);
    }
    // Figma rounds a hugging text box up to a whole pixel; the box keeps that
    // width and still grows with longer text.
    if (hugsWidth) out.push(`min-w-[${px(node.width)}]`);
    out.push(...minMax(node));
    return out;
  }

  out.push('absolute');
  const x = node.x - parent.x;
  const y = node.y - parent.y;
  const pw = parent.width;
  const ph = parent.height;
  let cons = !WRAPPING_PARENTS.has(parent.type) && node.constraints
    ? node.constraints : { horizontal: 'MIN', vertical: 'MIN' };
  if (opts.stretch) cons = { ...cons, horizontal: 'STRETCH' };
  else if (opts.center) cons = { ...cons, horizontal: 'CENTER' };
  else if (opts.pin) cons = { ...cons, horizontal: opts.pin };

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
  if (hugsWidth) out.push(`min-w-[${px(node.width)}]`);
  out.push(...minMax(node));
  return out;
}

function sign(v) {
  const n = num(v);
  return v < 0 ? n : `+${n}`;
}

/**
 * Whether a baseline-aligned row places its children at Figma's offsets: a
 * single line; a wrapping row keeps items-baseline, since a child on a later
 * line has that line in its offset.
 */
export function placesBaselines(node) {
  return node.layoutMode === 'HORIZONTAL' && node.counterAxisAlignItems === 'BASELINE' && node.layoutWrap !== 'WRAP';
}

/**
 * How far below the top of a baseline-aligned row Figma puts [node]: its
 * offset from the padding edge, or 0.
 */
export function baselineOffset(node, parent) {
  if (!parent || !placesBaselines(parent) || !inFlow(node, parent)) return 0;
  const top = parent.y + (parent.paddingTop || 0) + strokeSpace(parent)[2];
  const offset = Math.round((node.y - top) * 100) / 100;
  return offset > 0.01 ? offset : 0;
}

/** Room a border takes in a layout (left, right, top, bottom), when Figma counts strokes in it. */
export function strokeSpace(node) {
  if (!node.strokesIncludedInLayout) return [0, 0, 0, 0];
  const visible = Array.isArray(node.strokes) && node.strokes.some((p) => p && p.visible !== false);
  if (!visible) return [0, 0, 0, 0];
  const w = typeof node.strokeWeight === 'number' ? node.strokeWeight : 0;
  return ['strokeLeftWeight', 'strokeRightWeight', 'strokeTopWeight', 'strokeBottomWeight']
    .map((k) => (typeof node[k] === 'number' ? node[k] : w));
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

/**
 * The placement of a lone child of a space-between layout, from where it
 * is: Figma starts it, but files whose layout was not recomputed since
 * (imports, older versions) draw it centred or at the end.
 */
function loneChildJustify(node, row) {
  if (node.primaryAxisAlignItems !== 'SPACE_BETWEEN') return null;
  const flow = (node.children || []).filter((c) => c && c.visible !== false && !c.isMask && inFlow(c, node));
  if (flow.length !== 1) return null;
  const c = flow[0];
  const offset = row ? c.x - node.x : c.y - node.y;
  const size = row ? node.width : node.height;
  const length = row ? c.width : c.height;
  const before = (row ? node.paddingLeft : node.paddingTop) || 0;
  const after = (row ? node.paddingRight : node.paddingBottom) || 0;
  if (Math.abs(offset - before) < 0.5) return 'justify-start';
  if (Math.abs(offset - (before + (size - before - after - length) / 2)) < 0.5) return 'justify-center';
  if (Math.abs(offset - (size - after - length)) < 0.5) return 'justify-end';
  return null;
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
  const row = node.layoutMode !== 'VERTICAL';
  if (!row) out.push('flex-col');
  const between = node.primaryAxisAlignItems === 'SPACE_BETWEEN';
  const spacing = node.itemSpacing > 0 && !between ? withVar(vars.itemSpacing, px(node.itemSpacing)) : null;
  if (node.layoutWrap === 'WRAP') {
    out.push('flex-wrap', node.counterAxisAlignContent === 'SPACE_BETWEEN' ? 'content-between' : 'content-start');
    // Wrapped tracks have their own gap; exports drop it when it is 0.
    const cross = typeof node.counterAxisSpacing === 'number' ? node.counterAxisSpacing : 0;
    if (spacing) out.push(`${row ? 'gap-x' : 'gap-y'}-[${tw(spacing)}]`);
    out.push(`${row ? 'gap-y' : 'gap-x'}-[${tw(withVar(vars.counterAxisSpacing, px(cross)))}]`);
  } else if (spacing) {
    out.push(`gap-[${tw(spacing)}]`);
  }
  out.push(loneChildJustify(node, row) || JUSTIFY[node.primaryAxisAlignItems] || 'justify-start');
  // A row aligned on text baselines places its children where Figma has
  // them (baselineOffset), as browsers round font metrics differently.
  out.push(placesBaselines(node) ? 'items-start' : ITEMS[node.counterAxisAlignItems] || 'items-start');
  return [...out, ...padding(node)];
}

const RADIUS_KEYS = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];

/** Corner radii (top-left, top-right, bottom-right, bottom-left) with their variables. */
export function cornerRadii(node) {
  const vars = node.vars || {};
  return RADIUS_KEYS.map((k) => ({
    value: typeof node[k] === 'number' ? node[k]
      : typeof node.cornerRadius === 'number' ? node.cornerRadius : 0,
    name: vars[k] || null,
  }));
}

/** Rounded-corner classes; [grow] widens every rounded corner (outside strokes). */
export function radiusClasses(node, grow = 0) {
  if (node.type === 'ELLIPSE') return ['rounded-[50%]'];
  const corners = cornerRadii(node);
  const value = ({ value: v, name }) => {
    if (!grow || !v) return tw(withVar(name, px(v)));
    return name ? tw(`calc(${withVar(name, px(v))} + ${px(grow)})`) : px(v + grow);
  };
  const same = corners.every((c) => c.value === corners[0].value && c.name === corners[0].name);
  if (same) return corners[0].value ? [`rounded-[${value(corners[0])}]`] : [];
  return ['tl', 'tr', 'br', 'bl']
    .map((k, i) => (corners[i].value ? `rounded-${k}-[${value(corners[i])}]` : null))
    .filter(Boolean);
}

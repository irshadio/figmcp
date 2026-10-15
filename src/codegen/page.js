// Phone screens, shared by the code generators: which frames are screens,
// the shortest page their layers fit on, the layers pinned while scrolling
// and the sections that stretch with the screen.
import { isAutoLayout } from './layout.js';

// Taller than any phone: the design scrolls.
export const TALL_SCREEN = 1000;
// How much further than in the design two overlapping layers may slide over
// each other on a shorter screen, as a share of the smaller one's height.
const EXTRA_OVERLAP = 0.15;
const SCREEN_TYPES = new Set(['FRAME', 'COMPONENT', 'INSTANCE']);
const WRAPPING_PARENTS = new Set(['GROUP', 'BOOLEAN_OPERATION']);

/** A portrait frame of a phone's width, drawn as a screen. */
export function isPhoneScreen(node) {
  return Boolean(node) && SCREEN_TYPES.has(node.type) && node.width >= 300 && node.width <= 480 &&
    node.height >= node.width * 1.5;
}

/** Whether the screen's page scrolls: Figma says so, or it is taller than a phone. */
export function scrollsOnScreen(node) {
  return ['VERTICAL', 'BOTH'].includes(node.overflowDirection) || node.height > TALL_SCREEN;
}

/** Ids of the children Figma keeps in place when the frame scrolls (the last ones). */
export function pinnedChildren(node) {
  const all = node.children || [];
  const count = isAutoLayout(node) ? 0 : Math.max(0, Math.min(node.numberOfFixedChildren || 0, all.length));
  return new Set(all.slice(all.length - count).map((c) => c.id));
}

/**
 * The shortest page the screen's [children] fit on as their constraints
 * move them: layers that do not overlap in the design never do, and
 * layers that overlap (a sheet over a header) may slide over each other a
 * little further. A layer's top and bottom move up by k times the height
 * the page loses: 0 when pinned to the top, 1 to the bottom, 0.5 centred,
 * and in proportion when scaled.
 */
export function minPageHeight(node, children) {
  const Hd = node.height;
  const items = children.map((c) => {
    const mode = (!WRAPPING_PARENTS.has(node.type) && c.constraints && c.constraints.vertical) || 'MIN';
    const top = c.y - node.y;
    const bottom = top + c.height;
    const k = {
      MIN: [0, 0], MAX: [1, 1], CENTER: [0.5, 0.5], STRETCH: [0, 1],
      SCALE: [top / (Hd || 1), bottom / (Hd || 1)],
    }[mode] || [0, 0];
    return { top, bottom, left: c.x - node.x, right: c.x - node.x + c.width, kTop: k[0], kBottom: k[1] };
  }).filter((i) => i.bottom > 0 && i.top < Hd);
  let lost = Hd;
  for (const i of items) {
    if (i.kTop > 0) lost = Math.min(lost, Math.max(0, i.top) / i.kTop);
    if (i.kBottom < 1) lost = Math.min(lost, Math.max(0, Hd - i.bottom) / (1 - i.kBottom));
    if (i.kBottom > i.kTop) lost = Math.min(lost, (i.bottom - i.top) / (i.kBottom - i.kTop));
  }
  const contains = (a, b) => a.top <= b.top && a.bottom >= b.bottom && a.left <= b.left && a.right >= b.right;
  for (const a of items) {
    for (const b of items) {
      if (a === b || a.top > b.top || (a.top === b.top && a.bottom > b.bottom)) continue;
      if (a.right <= b.left || b.right <= a.left || contains(a, b) || contains(b, a)) continue;
      const closing = b.kTop - a.kBottom;
      if (closing <= 0) continue;
      const room = a.bottom <= b.top ? b.top - a.bottom
        : EXTRA_OVERLAP * Math.min(a.bottom - a.top, b.bottom - b.top);
      lost = Math.min(lost, room / closing);
    }
  }
  return Math.ceil((Hd - Math.max(0, lost)) * 100) / 100;
}

/**
 * Whether a child of a screen stretches with it: a section that spans the
 * width, or sits centred with equal margins, unless it is pinned to the
 * right, already stretches, or hugs its content.
 */
export function stretchesOnScreen(node, screen, hugs) {
  const cons = (!WRAPPING_PARENTS.has(screen.type) && node.constraints) || { horizontal: 'MIN' };
  if (cons.horizontal === 'MAX' || cons.horizontal === 'STRETCH' || hugs) return false;
  const x = node.x - screen.x;
  return node.width >= screen.width / 2 && Math.abs(x - (screen.width - x - node.width)) <= 2;
}

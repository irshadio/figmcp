// What layers are for, read from their structure: tab bars, segmented
// controls, chips, buttons, fields, carousels and grids. Layer names only
// break ties. The code generators turn each role into the platform's own
// pattern, and the response lists them for the agent.
import { inFlow, isAutoLayout } from './layout.js';
import { drawnAsSvg, visibleChildren } from './nodes.js';
import { shapeKey } from './swiftui/repeat.js';
import { segmentsOf } from './text.js';
import { visiblePaints } from './util.js';

const ICON_NAMES = /back|close|bell|notif|swap|edit|share|heart|like|fav|menu|search|filter|more|settings|cart|plus|add|minus|info|mic|camera|send/i;
const DISCLOSURE = /chevron|arrow|disclosure|caret/i;
const SWAP = /swap|exchange|reverse|switch/i;

function texts(n, out = []) {
  if (!n || n.visible === false) return out;
  if (n.type === 'TEXT') out.push(n);
  (n.children || []).forEach((c) => texts(c, out));
  return out;
}

function isIcon(n) {
  return n.type !== 'TEXT' && (drawnAsSvg(n) || Boolean(n.svg));
}

function hasIcon(n) {
  if (!n || n.visible === false) return false;
  if (isIcon(n)) return true;
  return (n.children || []).some(hasIcon);
}

function filled(n) {
  return visiblePaints(n.fills).length > 0;
}

function stroked(n) {
  return visiblePaints(n.strokes).length > 0;
}

function radius(n) {
  return typeof n.cornerRadius === 'number' ? n.cornerRadius : Math.max(0, n.topLeftRadius || 0);
}

function fontSize(t) {
  return segmentsOf(t)[0].fontSize || 0;
}

function sameShape(nodes) {
  return nodes.length >= 2 && nodes.every((n) => shapeKey(n) === shapeKey(nodes[0]));
}

/** The one item drawn with a fill the others lack, by index, or -1. */
function oddFilled(items) {
  const has = items.map((n) => {
    let found = false;
    const walk = (x) => {
      if (!x || x.visible === false) return;
      if (filled(x) && x.type !== 'TEXT' && !hasIconOnly(x)) found = true;
      (x.children || []).forEach(walk);
    };
    walk(n);
    return found;
  });
  const on = has.filter(Boolean).length;
  return on === 1 ? has.indexOf(true) : -1;
}

/** A vector layer (not a tile holding one). */
function hasIconOnly(n) {
  return isIcon(n) && !visibleChildren(n).length;
}

function textColors(n) {
  return texts(n).map((t) => JSON.stringify(visiblePaints(segmentsOf(t)[0].fills).map((p) => p.color))).join();
}

/** The item drawn differently from the others (fills, then text colours), by index, or -1. */
function oddItem(items) {
  const filledOdd = oddFilled(items);
  if (filledOdd >= 0) return filledOdd;
  const keys = items.map(textColors);
  const rest = (i) => keys.filter((_, j) => j !== i);
  return keys.findIndex((k, i) => rest(i).every((x) => x === rest(i)[0] && x !== k));
}

/**
 * Roles of the layers under [root]: Map id -> { role, id, name, ... }:
 *   tabBar { items, selected } with tab items; tabs { items, selected } (a
 *   row of icon + label choices) with tab items; segmented { items, selected }
 *   with segment items; chips { items, selected } with chip items;
 *   carousel { items } and grid { items, columns } with card items;
 *   sectionHeader { title, link } with a heading and a link; listRow
 *   (a row with a disclosure chevron); field; button { primary, label };
 *   iconButton { label }; swapFields { fields, button } (two fields of
 *   the same shape with a swap button between them).
 */
export function detectRoles(root, { screenWidth = root.width, screenHeight = root.height } = {}) {
  const roles = new Map();
  const ry = root.y || 0;
  const set = (n, role, extra = {}) => {
    if (!roles.has(n.id)) roles.set(n.id, { role, id: n.id, name: n.name, ...extra });
  };
  const innerWidth = (p) => p.width - (p.paddingLeft || 0) - (p.paddingRight || 0);
  const wide = (n) => n.width >= screenWidth * 0.6;
  const containers = [];
  const walk = (n, parent) => {
    if (!n || n.visible === false) return;
    const kids = visibleChildren(n);
    if (parent && kids.length >= 3) containers.push(n);
    const flow = isAutoLayout(n) ? kids.filter((c) => inFlow(c, n)) : kids;
    const row = n.layoutMode === 'HORIZONTAL';
    const allSame = sameShape(flow) && flow.length === kids.length;
    const labelled = (c) => texts(c).length === 1;
    const iconRow = allSame && row && flow.length >= 3 && flow.length <= 6 && flow.every((c) => hasIcon(c) && labelled(c));
    const atBottom = (n.y - ry) + n.height >= screenHeight - 40;
    if (iconRow && n.width >= screenWidth * 0.9 && flow.length <= 5 && (atBottom || /tab ?bar|bottom ?nav/i.test(n.name))) {
      set(n, 'tabBar', { items: flow.map((c) => c.id), selected: oddItem(flow) });
      flow.forEach((c) => set(c, 'tab'));
    } else if (iconRow && oddItem(flow) >= 0) {
      set(n, 'tabs', { items: flow.map((c) => c.id), selected: oddItem(flow) });
      flow.forEach((c) => set(c, 'tab'));
    } else if (allSame && row && flow.length >= 2 && flow.length <= 5 && filled(n) && radius(n) > 0 &&
        flow.every((c) => labelled(c) && !hasIcon(c)) && oddFilled(flow) >= 0) {
      set(n, 'segmented', { items: flow.map((c) => c.id), selected: oddFilled(flow) });
      flow.forEach((c) => set(c, 'segment'));
    } else if (sameShape(flow) && (row || n.layoutWrap === 'WRAP') && flow.every((c) => texts(c).length >= 1 &&
        texts(c).length <= 2 && c.height <= 44 && (radius(c) >= c.height / 2 - 1 || /chip|tag|pill/i.test(c.name))) &&
        (stroked(flow[0]) || filled(flow[0]))) {
      set(n, 'chips', { items: flow.map((c) => c.id), selected: oddItem(flow) });
      flow.forEach((c) => set(c, 'chip'));
    } else if (n.layoutWrap === 'WRAP' && sameShape(flow) && row) {
      const gap = n.itemSpacing || 0;
      const columns = Math.max(1, Math.floor((innerWidth(n) + gap) / (flow[0].width + gap)));
      set(n, 'grid', { items: flow.map((c) => c.id), columns });
      flow.forEach((c) => set(c, 'card'));
    } else if (row && parent && isAutoLayout(n) && flow.length >= 2 && n.width > innerWidth(parent) + 0.5) {
      set(n, 'carousel', { items: flow.map((c) => c.id) });
      flow.forEach((c) => set(c, 'card'));
    } else if (row && wide(n) && !filled(n) && !stroked(n) && flow.length >= 1 && flow.length <= 2 && texts(n).length >= 1 && parent) {
      const [a, b] = flow;
      const link = b && b.type === 'TEXT' && b.characters.length <= 14 ? b : null;
      const title = a.type === 'TEXT' ? a : texts(a)[0];
      const others = texts(n).filter((t) => t !== title && t !== link);
      if (title && (!b || link) && fontSize(title) >= 16 && others.every((t) => fontSize(t) < fontSize(title)) &&
          (!link || fontSize(title) > fontSize(link))) {
        set(n, 'sectionHeader', { title: title.id, link: link ? link.id : null });
        set(title, 'heading');
        if (link) set(link, 'link', { section: title.characters });
      }
    }
    if (!roles.has(n.id) && n.type !== 'TEXT' && parent) {
      const ts = texts(n);
      const small = n.width <= 52 && n.height <= 52;
      const last = flow[flow.length - 1];
      if (small && isIcon(n) && ICON_NAMES.test(n.name)) {
        set(n, 'iconButton', { label: n.name.split('/').pop().trim() });
      } else if (isAutoLayout(n) && ts.length === 1 && n.height >= 36 && n.height <= 64 && (filled(n) || stroked(n)) &&
          radius(n) > 0 && kids.every((c) => c.type === 'TEXT' || isIcon(c))) {
        set(n, 'button', { primary: filled(n), label: ts[0].characters });
      } else if (row && isAutoLayout(n) && flow.length >= 2 && ts.length >= 1 && last && isIcon(last) && DISCLOSURE.test(last.name)) {
        set(n, 'listRow');
      } else if (isAutoLayout(n) && hasIcon(n) && ts.length >= 2 && ts.length <= 3 && n.height <= 80 && kids.some(isIcon)) {
        const sizes = ts.map(fontSize);
        if (sizes[1] > sizes[0] || /from|to|date|departure|return|traveller|guest|field|input/i.test(n.name)) set(n, 'field');
      }
    }
    kids.forEach((c) => walk(c, n));
  };
  (root.children || []).forEach((c) => walk(c, root));
  // Two fields of one shape and a swap button: their values swap.
  for (const n of containers) {
    const kids = visibleChildren(n);
    const fields = kids.filter((c) => roles.get(c.id) && roles.get(c.id).role === 'field');
    const button = kids.find((c) => roles.get(c.id) && roles.get(c.id).role === 'iconButton' && SWAP.test(c.name));
    if (fields.length === 2 && button && sameShape(fields) && !roles.has(n.id)) {
      set(n, 'swapFields', { fields: fields.map((c) => c.id), button: button.id });
    }
  }
  return roles;
}

/** What each role becomes in SwiftUI, for the response. */
export const SWIFTUI_PATTERNS = {
  tabBar: 'custom tab bar: Buttons with a sliding matchedGeometryEffect indicator, .snappy animation, selection haptics and the isSelected trait',
  tabs: 'selectable row: Buttons with selection state, animated colours, selection haptics and the isSelected trait',
  segmented: 'segmented control: Buttons with a sliding matchedGeometryEffect thumb and selection haptics',
  chips: 'chip group: single-selection Buttons with animated selection',
  carousel: 'carousel: horizontal ScrollView + LazyHStack with view-aligned snapping and content margins',
  grid: 'grid: LazyVGrid with flexible columns',
  sectionHeader: 'section header: title with the header trait and a link Button',
  listRow: 'disclosure row: a Button with a press-scale style',
  swapFields: 'swap pair: two fields whose values are state, exchanged with an animation by the swap button',
  field: 'form field: a Button that opens its picker (destination, date, travellers)',
  button: 'button: Button with a press-scale style',
  iconButton: 'icon button: Button with an accessibility label',
};

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
// A role tag in a layer name, or [no-role] to keep a layer plain.
const TAG = /\s*\[([A-Za-z-]+)\]\s*/;
const FORCED = ['tabBar', 'tabs', 'segmented', 'chips', 'carousel', 'grid', 'listRow', 'field', 'button', 'iconButton', 'card'];
// Text inputs: by layer name, or a placeholder inviting typing.
const INPUT_NAMES = /field|input|text ?box|search ?bar|message|composer|email|password|phone/i;
const PLACEHOLDER = /^(search|type|enter|write|message|email|password|your )/i;
// What a text input holds: its content type, keyboard and whether it is secure.
const CONTENT_TYPES = [
  [/password|passcode|pin\b/i, { textContentType: '.password', secure: true }],
  [/e-?mail/i, { textContentType: '.emailAddress', keyboardType: '.emailAddress' }],
  [/phone|mobile/i, { textContentType: '.telephoneNumber', keyboardType: '.phonePad' }],
  [/\bname\b/i, { textContentType: '.name' }],
  [/search/i, { submitLabel: '.search' }],
  [/message|chat|comment/i, { submitLabel: '.send' }],
];
const CLOSE = /close|dismiss|cross|^x$/i;
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

/**
 * What the prototype does when [n] is tapped: { kind: 'navigate' | 'overlay'
 * | 'back' | 'close' | 'url', destination?, url? }, or null.
 */
export function tapOf(n) {
  for (const r of n.reactions || []) {
    if (!/^ON_(CLICK|PRESS)$/.test(r.trigger || '')) continue;
    if (r.action === 'BACK') return { kind: 'back' };
    if (r.action === 'CLOSE') return { kind: 'close' };
    if (r.action === 'URL' && r.url) return { kind: 'url', url: r.url };
    if (r.action === 'NODE' && r.destination && ['NAVIGATE', 'SWAP'].includes(r.navigation)) return { kind: 'navigate', destination: r.destination };
    if (r.action === 'NODE' && r.destination && r.navigation === 'OVERLAY') return { kind: 'overlay', destination: r.destination };
  }
  return null;
}

/** How many boxes with a fill [n] holds (frames and shapes, not glyphs or text). */
function boxes(n) {
  if (!n || n.visible === false) return 0;
  const own = ['FRAME', 'INSTANCE', 'COMPONENT', 'RECTANGLE', 'ELLIPSE'].includes(n.type) && filled(n) ? 1 : 0;
  return own + (n.children || []).reduce((t, c) => t + boxes(c), 0);
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
  const set = (n, role, extra = {}, confidence = null, evidence = null) => {
    if (!roles.has(n.id)) roles.set(n.id, { role, id: n.id, name: n.name, ...extra, ...(confidence ? { confidence, evidence } : {}) });
  };
  const suppressed = new Set();
  const innerWidth = (p) => p.width - (p.paddingLeft || 0) - (p.paddingRight || 0);
  const wide = (n) => n.width >= screenWidth * 0.6;
  const containers = [];
  // A role set in the layer's name: "Pay [button]", "Filters [chips]".
  const force = (n, tag, flow) => {
    const role = FORCED.find((r) => r.toLowerCase() === tag.toLowerCase());
    if (!role) return;
    const why = ['set by name', `"[${tag}]" in the layer name`];
    const label = n.name.replace(TAG, '').trim();
    const items = { tabBar: 'tab', tabs: 'tab', segmented: 'segment', chips: 'chip', carousel: 'card', grid: 'card' }[role];
    if (items) {
      const gap = n.itemSpacing || 0;
      const extra = { items: flow.map((c) => c.id) };
      if (role === 'grid') extra.columns = Math.max(1, Math.floor((innerWidth(n) + gap) / ((flow[0] || n).width + gap)));
      else if (role !== 'carousel') extra.selected = role === 'segmented' ? oddFilled(flow) : oddItem(flow);
      set(n, role, extra, ...why);
      flow.forEach((c) => set(c, items));
    } else if (role === 'button') set(n, role, { primary: filled(n), label: texts(n).length ? texts(n)[0].characters : label }, ...why);
    else if (role === 'iconButton') set(n, role, { label }, ...why);
    else set(n, role, {}, ...why);
  };
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
    const tag = TAG.exec(n.name || '');
    if (tag && tag[1].toLowerCase() === 'no-role') suppressed.add(n.id);
    else if (tag) force(n, tag[1], flow);
    const selectedName = (i) => (i >= 0 ? `"${texts(flow[i]).length ? texts(flow[i])[0].characters : flow[i].name}" drawn apart` : 'none drawn apart');
    if (iconRow && n.width >= screenWidth * 0.9 && flow.length <= 5 && (atBottom || /tab ?bar|bottom ?nav/i.test(n.name))) {
      const sel = oddItem(flow);
      // The system tab bar tells tabs apart by colour alone; an indicator behind the selected tab is the design's own.
      const indicator = sel >= 0 && boxes(flow[sel]) > boxes(flow[(sel + 1) % flow.length]);
      set(n, 'tabBar', {
        items: flow.map((c) => c.id), selected: sel,
        native: indicator
          ? { use: false, control: 'TabView with .tabItem', reason: 'the selected tab has its own indicator behind it, which the system tab bar cannot draw' }
          : { use: false, control: 'TabView with .tabItem', reason: 'tabs that differ by colour, as the system tab bar: make TabView the app\'s root and drop this bar' },
      }, atBottom && /tab ?bar|bottom ?nav/i.test(n.name) ? 'high' : 'medium',
      `${flow.length} equal icon + label items across the ${atBottom ? 'bottom' : 'screen'}, ${selectedName(sel)}`);
      flow.forEach((c) => set(c, 'tab'));
    } else if (iconRow && oddItem(flow) >= 0) {
      set(n, 'tabs', { items: flow.map((c) => c.id), selected: oddItem(flow) }, 'medium',
        `${flow.length} equal icon + label items, ${selectedName(oddItem(flow))}`);
      flow.forEach((c) => set(c, 'tab'));
    } else if (allSame && row && flow.length >= 2 && flow.length <= 5 && filled(n) && radius(n) > 0 &&
        flow.every((c) => labelled(c) && !hasIcon(c)) && oddFilled(flow) >= 0) {
      const sel = oddFilled(flow);
      const r = radius(n);
      const thumb = radius(flow[sel]);
      // The system control: a grey track with slightly rounded corners and a white thumb.
      const system = r <= 10 && thumb <= 9 && n.height <= 44;
      const shape = (x, k) => (k >= x.height / 2 - 1 ? 'pill' : `radius ${k}`);
      set(n, 'segmented', {
        items: flow.map((c) => c.id), selected: sel,
        native: system
          ? { use: true, control: 'Picker with .pickerStyle(.segmented)', reason: `a track of radius ${r} with a plain thumb, as the system control` }
          : { use: false, control: 'Picker with .pickerStyle(.segmented)', reason: `a ${shape(n, r)} track and ${shape(flow[sel], thumb)} thumb the system control does not draw` },
      }, 'high', `${flow.length} equal text items on a filled rounded track, ${selectedName(sel)}`);
      flow.forEach((c) => set(c, 'segment'));
    } else if (sameShape(flow) && (row || n.layoutWrap === 'WRAP') && flow.every((c) => texts(c).length >= 1 &&
        texts(c).length <= 2 && c.height <= 44 && (radius(c) >= c.height / 2 - 1 || /chip|tag|pill/i.test(c.name))) &&
        (stroked(flow[0]) || filled(flow[0]))) {
      set(n, 'chips', { items: flow.map((c) => c.id), selected: oddItem(flow) }, /chip|tag|pill/i.test(flow[0].name) ? 'high' : 'medium',
        `${flow.length} ${stroked(flow[0]) ? 'outlined' : 'filled'} pill items of one or two labels, ${selectedName(oddItem(flow))}`);
      flow.forEach((c) => set(c, 'chip'));
    } else if (n.layoutWrap === 'WRAP' && sameShape(flow) && row) {
      const gap = n.itemSpacing || 0;
      const columns = Math.max(1, Math.floor((innerWidth(n) + gap) / (flow[0].width + gap)));
      set(n, 'grid', { items: flow.map((c) => c.id), columns }, 'high', `a wrapping row of ${flow.length} equal items, ${columns} per line`);
      flow.forEach((c) => set(c, 'card'));
    } else if (row && parent && isAutoLayout(n) && flow.length >= 2 && n.width > innerWidth(parent) + 0.5) {
      set(n, 'carousel', { items: flow.map((c) => c.id) }, sameShape(flow) ? 'high' : 'medium',
        `a row of ${flow.length}${sameShape(flow) ? ' equal' : ''} items wider than its column`);
      flow.forEach((c) => set(c, 'card'));
    } else if (row && wide(n) && !filled(n) && !stroked(n) && flow.length >= 1 && flow.length <= 2 && texts(n).length >= 1 && parent) {
      const [a, b] = flow;
      const link = b && b.type === 'TEXT' && b.characters.length <= 14 ? b : null;
      const title = a.type === 'TEXT' ? a : texts(a)[0];
      const others = texts(n).filter((t) => t !== title && t !== link);
      if (title && (!b || link) && fontSize(title) >= 16 && others.every((t) => fontSize(t) < fontSize(title)) &&
          (!link || fontSize(title) > fontSize(link))) {
        set(n, 'sectionHeader', { title: title.id, link: link ? link.id : null }, link ? 'high' : 'medium',
          `a ${fontSize(title)}pt title${link ? ' and a short smaller link beside it' : ' over the section'}`);
        set(title, 'heading');
        if (link) set(link, 'link', { section: title.characters });
      }
    }
    if (!roles.has(n.id) && n.type !== 'TEXT' && parent) {
      const ts = texts(n);
      const small = n.width <= 52 && n.height <= 52;
      const last = flow[flow.length - 1];
      const pFlow = isAutoLayout(parent) ? visibleChildren(parent).filter((c) => inFlow(c, parent)) : [];
      const topBar = parent.layoutMode === 'HORIZONTAL' && wide(parent) && parent.height <= 72 && parent.y - ry <= 160;
      if (small && isIcon(n) && ICON_NAMES.test(n.name)) {
        set(n, 'iconButton', { label: n.name.split('/').pop().trim() }, 'high', `a ${Math.round(n.width)}pt icon named "${n.name}"`);
      } else if (small && isIcon(n) && topBar && (pFlow[0] === n || (pFlow[pFlow.length - 1] === n && CLOSE.test(n.name)))) {
        // The leading icon of a top bar goes back; a trailing cross closes.
        set(n, 'iconButton', { label: CLOSE.test(n.name) ? 'Close' : 'Back' }, 'medium',
          `a ${Math.round(n.width)}pt icon ${pFlow[0] === n ? 'leading' : 'trailing'} a top bar`);
      } else if (isAutoLayout(n) && ts.length === 1 && n.height >= 32 && n.height <= 64 && (filled(n) || stroked(n)) &&
          n.primaryAxisAlignItems !== 'CENTER' && (INPUT_NAMES.test(n.name) || PLACEHOLDER.test(ts[0].characters)) &&
          kids.every((c) => c.type === 'TEXT' || isIcon(c))) {
        const words = `${n.name} ${ts[0].characters}`;
        const content = CONTENT_TYPES.find(([re]) => re.test(words));
        set(n, 'textInput', { placeholder: ts[0].id, label: ts[0].characters, content: content ? content[1] : null }, 'medium',
          `a ${stroked(n) ? 'outlined' : 'filled'} box holding one placeholder "${ts[0].characters}"${INPUT_NAMES.test(n.name) ? `, named "${n.name}"` : ''}`);
      } else if (isAutoLayout(n) && ts.length === 1 && n.height >= 36 && n.height <= 64 && (filled(n) || stroked(n)) &&
          radius(n) > 0 && kids.every((c) => c.type === 'TEXT' || isIcon(c))) {
        set(n, 'button', { primary: filled(n), label: ts[0].characters }, 'high',
          `a ${filled(n) ? 'filled' : 'outlined'} rounded frame ${Math.round(n.height)}pt high with one label`);
      } else if (row && isAutoLayout(n) && flow.length >= 2 && ts.length >= 1 && last && isIcon(last) && DISCLOSURE.test(last.name)) {
        set(n, 'listRow', {}, 'medium', `a row ending in "${last.name}"`);
      } else if (isAutoLayout(n) && hasIcon(n) && ts.length >= 2 && ts.length <= 3 && n.height <= 80 && kids.some(isIcon)) {
        const sizes = ts.map(fontSize);
        const named = /from|to|date|departure|return|traveller|guest|field|input/i.test(n.name);
        if (sizes[1] > sizes[0] || named) {
          set(n, 'field', {}, sizes[1] > sizes[0] && named ? 'high' : 'medium',
            `an icon with a small label over a ${sizes[1] > sizes[0] ? 'larger ' : ''}value${named ? `, named "${n.name}"` : ''}`);
        }
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
      set(n, 'swapFields', { fields: fields.map((c) => c.id), button: button.id }, 'high',
        `two fields of one shape and a "${button.name}" button between them`);
    }
  }
  // Prototype taps: what a layer does when tapped, and a Button for a layer no rule found.
  const taps = (n, parent) => {
    if (!n || n.visible === false) return;
    const tap = tapOf(n);
    if (tap && parent && !suppressed.has(n.id)) {
      if (!roles.has(n.id)) {
        const ts = texts(n);
        const small = n.width <= 52 && n.height <= 52;
        if (small && isIcon(n)) {
          set(n, 'iconButton', { label: tap.kind === 'back' ? 'Back' : tap.kind === 'close' ? 'Close' : n.name.replace(TAG, '').trim() },
            'high', 'a prototype tap');
        } else set(n, 'button', { primary: filled(n), label: ts.length ? ts[0].characters : n.name }, 'high', 'a prototype tap');
      }
      roles.get(n.id).prototype = tap;
    }
    visibleChildren(n).forEach((c) => taps(c, n));
  };
  taps(root, null);
  for (const id of suppressed) {
    const r = roles.get(id);
    if (r && r.items) r.items.forEach((i) => roles.delete(i));
    roles.delete(id);
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
  textInput: 'text input: TextField bound to state, with its content type and keyboard (SecureField for a password)',
};

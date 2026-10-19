// Reference SwiftUI code for a node tree. Auto-layout frames become HStacks
// and VStacks, other frames ZStacks whose children are placed by their
// constraints; paints become shape fills, overlays and shadows. Values are
// the design's points.
import { linearTransform, rotationOf } from '../geometry.js';
import { inFlow, isAutoLayout, isGrid, sizingOf } from '../layout.js';
import { drawnAsSvg, hasImageFill, isTurned, straightLine, visibleChildren } from '../nodes.js';
import { sideWeights } from '../paint.js';
import { detectRoles, SWIFTUI_PATTERNS } from '../roles.js';
import { isPhoneScreen, TALL_SCREEN, WRAPPING_PARENTS } from '../screen.js';
import { systemUi } from '../system-ui.js';
import { fontWeight, segmentsOf } from '../text.js';
import { visiblePaints } from '../util.js';
import {
  blendMode, blurs, composite, effectsOf, gradient, HELPERS, isRectangle, sColor, shadowArgs, shapeOf, swiftBlur,
} from './paint.js';
import { calendarView, prepareCalendar } from './calendar.js';
import { indicatorOf, PRESSABLE_STYLE, withIndicator } from './patterns.js';
import { baseName, fieldsOf, isGenericName, mergeTrees, plural, runsOf } from './repeat.js';
import {
  array, call, KEYWORDS, mod, print, raw, sIdent, sNum, sString, str, sType, SWIFT_TYPE_NAMES, trailing, view,
} from './swift.js';
import { fontOf, isSystemFamily, textView } from './text.js';

const H_ALIGN = { MIN: 'leading', CENTER: '', MAX: 'trailing', SPACE_BETWEEN: 'leading' };
const V_ALIGN = { MIN: 'top', CENTER: '', MAX: 'bottom', SPACE_BETWEEN: 'top' };
const ROW_ALIGN = { MIN: '.top', MAX: '.bottom', BASELINE: '.firstTextBaseline' };
const COLUMN_ALIGN = { MIN: '.leading', MAX: '.trailing' };
const TEXT_X = { LEFT: 'leading', CENTER: '', RIGHT: 'trailing', JUSTIFIED: 'leading' };
const TEXT_Y = { TOP: 'top', CENTER: '', BOTTOM: 'bottom' };
const INFINITY = raw('.infinity');
// Layers with this many visible descendants become their own view property,
// which keeps each expression small for the Swift type checker.
const EXTRACT_SIZE = 10;
const EXTRACT_TYPES = new Set(['FRAME', 'GROUP', 'INSTANCE', 'COMPONENT', 'COMPONENT_SET', 'SECTION']);

const NAMED_COLORS = { white: 'FFFFFF', black: '000000' };
// Members the screen struct may declare apart from member(): its body, the
// action closure, environment values, and names closures use.
// A carousel of more items than this is lazy; a LazyHStack takes its height
// from the items it has drawn, not its tallest, so short rows are not.
const LAZY_AFTER = 10;
const RESERVED_MEMBERS = ['body', 'action', 'dismiss', 'openURL', 'dynamicTypeSize', 'reduceMotion', 'focusedField', 'index', 'item',
  'isSelected', 'namespace'];
// Names of the Dynamic Type metrics scaledMetric declares.
const METRIC_NAME = /^iconSize[\d_]+$/;
// Swift words that sIdent suffixes ("continue" -> "continueValue"); a section gets "Section" instead.
const RESERVED_IDENTS = new Set(['continueValue', 'defaultValue', 'returnValue', 'breakValue', 'caseValue', 'switchValue',
  'repeatValue', 'whileValue', 'doValue', 'ifValue', 'elseValue', 'forValue', 'inValue', 'isValue', 'asValue', 'tryValue']);
// Roles whose layer is a Button calling the screen's action, and roles whose
// items select on tap.
// Item runs, by the word their name ends in.
const CONTAINER_ROLES = { carousel: 'carousel', grid: 'grid', chips: 'chips', tabs: 'picker', segmented: 'picker', tabBar: 'tab bar' };
// Roles whose text is a label.
const CONTROLS = new Set(['tabBar', 'tabs', 'segmented', 'chips', 'button', 'iconButton']);
const TAPPABLE = new Set(['button', 'iconButton', 'field', 'link', 'listRow', 'option']);
const SELECTABLE = new Set(['tabBar', 'tabs', 'segmented', 'chips']);
const TAPPABLE_ITEMS = new Set(['card', 'field', 'button', 'listRow', 'iconButton', 'tab', 'option']);
const HELPER_CODE = { ...HELPERS, pressable: PRESSABLE_STYLE };

/** The one colour an SVG paints with, as a colour value through [color], or null. */
function svgTint(text, color) {
  const found = new Set();
  for (const m of text.matchAll(/\b(?:fill|stroke)="([^"]+)"/g)) {
    const v = m[1].toLowerCase();
    if (v === 'none' || v.startsWith('url(')) continue;
    const hex = NAMED_COLORS[v] || (/^#[0-9a-f]{6}$/.test(v) ? v.slice(1).toUpperCase() : null);
    if (!hex) return null;
    found.add(hex);
  }
  if (found.size !== 1 || /opacity="/.test(text)) return null;
  const hex = [...found][0];
  const byte = (i) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return color({ r: byte(0), g: byte(2), b: byte(4), a: 1 });
}

function clear() {
  return view('', [[null, raw('Color.clear')]]);
}

/** '.topLeading' and friends from a horizontal and a vertical part ('' is centre). */
function alignmentOf(h, v) {
  if (!h && !v) return '.center';
  if (!h) return `.${v}`;
  if (!v) return `.${h}`;
  return `.${v}${h[0].toUpperCase()}${h.slice(1)}`;
}

function isText(node) {
  return node.type === 'TEXT';
}

function hugsWidth(node) {
  return isText(node) && node.textAutoResize === 'WIDTH_AND_HEIGHT';
}

function hugsHeight(node) {
  return isText(node) && (node.textAutoResize === 'WIDTH_AND_HEIGHT' || node.textAutoResize === 'HEIGHT');
}

/** The node's own sizing on an axis (not relative to a parent). */
function ownSizing(node, axis) {
  const key = axis === 'x' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
  if (node[key]) return node[key];
  const primary = node.layoutMode === 'HORIZONTAL' ? 'x' : 'y';
  const mode = axis === primary ? node.primaryAxisSizingMode : node.counterAxisSizingMode;
  return mode === 'AUTO' ? 'HUG' : 'FIXED';
}

function round(v) {
  return Math.round(v * 100) / 100;
}

const visibleCounts = new WeakMap();

function countVisible(node) {
  if (!node || node.visible === false) return 0;
  if (!visibleCounts.has(node)) visibleCounts.set(node, 1 + (node.children || []).reduce((n, c) => n + countVisible(c), 0));
  return visibleCounts.get(node);
}

/** [v] with padding [top, right, bottom, left]. */
function padded(v, [top, right, bottom, left]) {
  if (![top, right, bottom, left].some((x) => x)) return v;
  if (top === right && right === bottom && bottom === left) return mod(v, 'padding', [[null, top]]);
  if (top === bottom && left === right) {
    let out = v;
    if (left) out = mod(out, 'padding', [[null, raw('.horizontal')], [null, left]]);
    if (top) out = mod(out, 'padding', [[null, raw('.vertical')], [null, top]]);
    return out;
  }
  const sides = [['top', top], ['leading', left], ['bottom', bottom], ['trailing', right]].filter(([, x]) => x);
  if (sides.length === 1) return mod(v, 'padding', [[null, raw(`.${sides[0][0]}`)], [null, sides[0][1]]]);
  return mod(v, 'padding', [[null, call('EdgeInsets', [['top', top], ['leading', left], ['bottom', bottom], ['trailing', right]])]]);
}

// A frame of this many small vector layers and nothing else is a pattern.
const PATTERN_SIZE = 12;
const SVG_OPEN = /^<svg\b[^>]*>/;

/** [svg] from its <svg> element on, without an XML declaration, doctype or comments before it. */
function svgBody(svg) {
  return String(svg).replace(/^\s*(<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->|\s)*/i, '');
}

// A frame of shapes alone with this many vector layers is an illustration (a map, a scene).
const ILLUSTRATION_SIZE = 40;
const CONTAINERS = new Set(['FRAME', 'GROUP', 'INSTANCE', 'COMPONENT']);

function hex6(c) {
  const b = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${b(c.r)}${b(c.g)}${b(c.b)}`;
}

/** [svg] placed at [b] (a box relative to the canvas). */
function placedSvg(svg, b) {
  const r = (v) => Math.round(v * 100) / 100;
  const body = svgBody(svg);
  const open = SVG_OPEN.exec(body)[0];
  return open.replace(/\s(width|height|x|y)="[^"]*"/g, '')
    .replace(/^<svg/, `<svg x="${r(b.x)}" y="${r(b.y)}" width="${r(b.width)}" height="${r(b.height)}"`) + body.slice(open.length);
}

/** A plain rectangle or ellipse with one solid fill and nothing else, as an SVG element at [x], [y]; else null. */
function shapeSvg(n, x, y) {
  const fills = visiblePaints(n.fills);
  if (!['RECTANGLE', 'ELLIPSE'].includes(n.type) || fills.length !== 1 || fills[0].type !== 'SOLID' ||
      visiblePaints(n.strokes).length || n.rotation || (n.effects || []).some((e) => e.visible !== false)) return null;
  const r = (v) => Math.round(v * 100) / 100;
  const p = fills[0];
  const alpha = (p.color.a ?? 1) * (p.opacity ?? 1) * (typeof n.opacity === 'number' ? n.opacity : 1);
  const fill = `fill="${hex6(p.color)}"${alpha < 1 ? ` fill-opacity="${r(alpha)}"` : ''}`;
  if (n.type === 'ELLIPSE') {
    return `<ellipse cx="${r(x + n.width / 2)}" cy="${r(y + n.height / 2)}" rx="${r(n.width / 2)}" ry="${r(n.height / 2)}" ${fill}/>`;
  }
  const radius = typeof n.cornerRadius === 'number' && n.cornerRadius > 0 ? ` rx="${r(Math.min(n.cornerRadius, n.width / 2, n.height / 2))}"` : '';
  return `<rect x="${r(x)}" y="${r(y)}" width="${r(n.width)}" height="${r(n.height)}"${radius} ${fill}/>`;
}

/**
 * [node] with each illustration in it (a frame of shapes alone, no text or
 * images, holding many vector layers: a map, a scene) drawn as one SVG of
 * the frame's size: one image instead of hundreds of views. Layers that
 * came without their SVG are listed in `illustrationGaps`.
 */
function withIllustrations(node) {
  if (!node || !node.children || node.svg || node.visible === false) return node;
  const leaves = [];
  let images = false;
  const walk = (n) => {
    if (n.visible === false) return;
    if (n.type === 'TEXT' || hasImageFill(n) || n.render) images = true;
    if (n.svg || !(n.children || []).length) leaves.push(n);
    else n.children.forEach(walk);
  };
  node.children.forEach(walk);
  const vectors = leaves.filter((n) => n.svg && SVG_OPEN.test(svgBody(n.svg))).length;
  if (!CONTAINERS.has(node.type) || images || vectors < ILLUSTRATION_SIZE) {
    const children = node.children.map(withIllustrations);
    return children.some((c, i) => c !== node.children[i]) ? { ...node, children } : node;
  }
  const r = (v) => Math.round(v * 100) / 100;
  const parts = [];
  const gaps = [];
  const own = visiblePaints(node.fills);
  if (own.length === 1 && own[0].type === 'SOLID') parts.push(shapeSvg({ ...node, type: 'RECTANGLE', children: [], opacity: 1, rotation: 0, effects: [] }, 0, 0));
  for (const n of leaves) {
    if (n.svg && SVG_OPEN.test(svgBody(n.svg))) {
      const b = n.svgBounds || n;
      parts.push(placedSvg(n.svg, { x: b.x - node.x, y: b.y - node.y, width: b.width, height: b.height }));
    } else {
      const shape = shapeSvg(n, n.x - node.x, n.y - node.y);
      if (shape) parts.push(shape);
      else gaps.push({ id: n.id, name: n.name });
    }
  }
  const svg = `<svg width="${r(node.width)}" height="${r(node.height)}" viewBox="0 0 ${r(node.width)} ${r(node.height)}" fill="none" ` +
    `xmlns="http://www.w3.org/2000/svg">\n${parts.filter(Boolean).join('\n')}\n</svg>`;
  return { ...node, children: [], fills: [], strokes: node.strokes, svg, svgBounds: { x: node.x, y: node.y, width: node.width, height: node.height },
    ...(gaps.length ? { illustrationGaps: gaps } : {}) };
}

/**
 * [node] with each decorative pattern in it (a frame of many small vector
 * layers, no text: a doodle wallpaper) drawn as one SVG, so it is one
 * image set instead of one per layer.
 */
/**
 * [node] with each group drawn as a tiny frame (a point or so, no fill, not
 * clipping) that its layers overflow sized to those layers: Figma draws
 * them in full, so their extent is the group's real box.
 */
function withContentBounds(node) {
  if (!node || !node.children) return node;
  let children = node.children.map(withContentBounds);
  if (children.every((c, i) => c === node.children[i])) children = node.children;
  const tiny = node.type === 'FRAME' && node.width <= 1.5 && node.height <= 1.5 && !node.clipsContent && !node.layoutMode &&
    !visiblePaints(node.fills).length && !visiblePaints(node.strokes).length;
  const shown = children.filter((c) => c.visible !== false);
  // Exported whole (an SVG, or a render that is already turned), its drawing's bounds are its box.
  const b = node.svg ? node.svgBounds : node.render ? node.renderBounds : null;
  if (tiny && !shown.length && b && b.width > 1.5) {
    return { ...node, x: b.x, y: b.y, width: b.width, height: b.height, rawWidth: b.width, rawHeight: b.height, rotation: 0, transform: undefined, contentBounds: true };
  }
  if (!tiny || !shown.length) return children === node.children ? node : { ...node, children };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of shown) {
    x0 = Math.min(x0, c.x);
    y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x + c.width);
    y1 = Math.max(y1, c.y + c.height);
  }
  return { ...node, children, x: x0, y: y0, width: x1 - x0, height: y1 - y0, contentBounds: true };
}

function withPatterns(node) {
  if (!node || !node.children) return node;
  const kids = node.children.filter((c) => c.visible !== false);
  const pattern = ['FRAME', 'GROUP'].includes(node.type) && kids.length >= PATTERN_SIZE && !visiblePaints(node.fills).length &&
    kids.every((c) => c.svg && !hasText(c) && c.width * c.height < node.width * node.height * 0.05 && SVG_OPEN.test(svgBody(c.svg)));
  if (!pattern) {
    const children = node.children.map(withPatterns);
    return children.some((c, i) => c !== node.children[i]) ? { ...node, children } : node;
  }
  const r = (v) => Math.round(v * 100) / 100;
  const parts = kids.map((c) => {
    const b = c.svgBounds || { x: c.x, y: c.y, width: c.width, height: c.height };
    const svg = svgBody(c.svg);
    const open = SVG_OPEN.exec(svg)[0];
    const attrs = open.replace(/\s(width|height|x|y)="[^"]*"/g, '').replace(/^<svg/, `<svg x="${r(b.x - node.x)}" y="${r(b.y - node.y)}" width="${r(b.width)}" height="${r(b.height)}"`);
    return attrs + svg.slice(open.length);
  });
  const svg = `<svg width="${r(node.width)}" height="${r(node.height)}" viewBox="0 0 ${r(node.width)} ${r(node.height)}" fill="none" ` +
    `xmlns="http://www.w3.org/2000/svg">\n${parts.join('\n')}\n</svg>`;
  return { ...node, children: [], svg, svgBounds: { x: node.x, y: node.y, width: node.width, height: node.height } };
}

function findText(node, accept = () => true) {
  if (!node || node.visible === false) return null;
  if (node.type === 'TEXT') return accept(node) ? node : null;
  for (const c of node.children || []) {
    const t = findText(c, accept);
    if (t) return t;
  }
  return null;
}

function hasText(node) {
  return node.visible !== false && (node.type === 'TEXT' || (node.children || []).some(hasText));
}

function holds(node, id) {
  return (node.children || []).some((c) => c.id === id || holds(c, id));
}

/**
 * [c], a layer of [screen], without the room of the phone's own UI drawn
 * inside it: a header holding the status bar starts below it, a layer
 * holding the home indicator ends above it. A column's padding is set so
 * its first and last remaining children keep their places.
 */
function withoutSystemUi(c, screen, chrome) {
  let out = c;
  const column = isAutoLayout(c) && c.layoutMode === 'VERTICAL';
  const remaining = (skip) => visibleChildren(c).filter((k) => inFlow(k, c) && k.id !== skip.id && !holds(k, skip.id));
  const status = chrome.find((s) => s.kind === 'status bar' && holds(c, s.id));
  if (status && c.y - screen.y <= status.box[1] + 1) {
    const cut = status.box[1] + status.box[3] - (c.y - screen.y);
    if (cut > 0 && cut < c.height) {
      out = { ...out, y: c.y + cut, height: c.height - cut };
      if (column) {
        const next = remaining(status)[0];
        out.paddingTop = next ? Math.max(0, next.y - out.y) : 0;
      }
    }
  }
  const home = chrome.find((s) => s.kind === 'home indicator' && holds(c, s.id));
  if (home) {
    const cut = c.y - screen.y + c.height - home.box[1];
    if (cut > 0 && cut < out.height) {
      out = { ...out, height: out.height - cut };
      const list = column ? remaining(home) : [];
      const prev = list[list.length - 1];
      if (prev && visibleChildren(c).some((k) => k.id === home.id)) out.paddingBottom = Math.max(0, out.y + out.height - (prev.y + prev.height));
    }
  }
  return out;
}

class SwiftUIWriter {
  constructor(assets, { connect = null, actions = null, probe = false, variableModes = null, exactLineHeights = true, fontFaces = null } = {}) {
    this.assets = assets;
    this.probe = Boolean(probe);
    this.variableModes = variableModes;
    this.exactLineHeights = exactLineHeights;
    this.faces = fontFaces;
    // In check mode: an item layer's id -> the first item's id, and
    // "index#first id" -> the layer, for the check to read item boxes back.
    this.probeAlias = new Map();
    this.probeIds = {};
    this.connect = connect;
    this.actions = actions || {};
    this.tapped = false;
    this.files = new Map();
    this.names = new Map();
    this.fonts = new Map();
    this.tokens = new Map();
    this.tokenIdents = new Set();
    this.textStyles = new Map();
    this.textStyleIdents = new Set();
    this.props = [];
    this.propNames = new Set(RESERVED_MEMBERS);
    this.warnings = [];
    this.rasterized = [];
    this.connected = new Map();
    this.helpers = new Set();
    this.screen = null;
    this.viewport = null;
    this.words = new Set();
    this.metrics = new Map();
    this.inputs = new Map();
    this.scrolls = false;
    // Layers left out (system UI, bars drawn apart), text and image
    // bindings of a repeated item, and what repeated items need.
    this.skip = new Set();
    this.bindings = new Map();
    this.ancestors = [];
    this.inComponent = false;
    this.components = [];
    this.models = [];
    this.states = [];
    this.lets = [];
    this.typeNames = new Set();
    this.memberNames = new Set();
    // Layer roles, the action enum's cases (name -> payload type), modifiers
    // a stack gets from its items, rows that scroll under their parent's
    // padding, and cells whose wide children stretch with them.
    this.roles = new Map();
    this.cases = new Map();
    this.containerMods = new Map();
    this.margins = new Map();
    this.stretchCells = new Set();
    // Rows drawn in a horizontal ScrollView, for the render check.
    this.scrollRows = new Set();
    this.swaps = new Map();
  }

  roleOf(node) {
    const r = node && this.roles.get(node.id);
    return r ? r.role : null;
  }

  /** A case of the screen's action enum, unique by name, with its payload type. */
  actionCase(label, payload = null) {
    // A keyword reads as itself: `case \`continue\`` and action(.continue).
    const plain = sIdent(label, 'tap');
    const keyword = /^(\w+)Value$/.exec(plain);
    const base = keyword && KEYWORDS.has(keyword[1]) ? keyword[1] : plain;
    let name = base;
    for (let i = 2; this.cases.has(name) && this.cases.get(name) !== payload; i++) name = `${base}${i}`;
    this.cases.set(name, payload);
    this.tapped = true;
    return name;
  }

  /**
   * [label] as a Button running [statements], with the press style and an
   * accessibility label. The whole label takes taps, not only what it draws.
   */
  button(label, statements, { style = 'pressable', accessibilityLabel = null } = {}) {
    if (style === 'pressable') this.helpers.add('pressable');
    const hit = mod(label, 'contentShape', [[null, call('Rectangle')]]);
    let b = trailing(view('Button', [], statements.map(raw)), 'label', [hit]);
    b = mod(b, 'buttonStyle', [[null, raw(`.${style}`)]]);
    if (accessibilityLabel) b = mod(b, 'accessibilityLabel', [[null, str(accessibilityLabel)]]);
    return b;
  }

  /** The action case a tappable layer fires, from its role and label. */
  actionName(node, role) {
    switch (role.role) {
      case 'button': case 'iconButton': case 'option': return role.label;
      case 'link': return `${node.characters} ${role.section || ''}`;
      default: return this.label(node);
    }
  }

  /** [core] made a Button or marked for accessibility by the layer's role. */
  interactive(node, core) {
    const role = this.roles.get(node.id);
    const kind = role ? role.role : null;
    if (kind === 'heading') return mod(core, 'accessibilityAddTraits', [[null, raw('.isHeader')]]);
    const field = kind === 'textInput' && this.focus && this.focus.find((f) => f.id === node.id);
    if (field) {
      // A tap anywhere on the box starts editing its field.
      return mod(mod(core, 'contentShape', [[null, call('Rectangle')]]), 'onTapGesture', [], [raw(`focusedField = .${field.name}`)]);
    }
    if (this.inComponent) return core;
    const given = this.actions[node.id];
    if (!given && !TAPPABLE.has(kind)) return core;
    const accessibilityLabel = kind === 'iconButton' ? role.label : null;
    const tap = role && role.prototype;
    if (tap && !given) {
      // The prototype says what the tap does.
      if (tap.kind === 'back' || tap.kind === 'close') {
        this.environment('dismiss', 'dismiss');
        return this.button(core, ['dismiss()'], { accessibilityLabel });
      }
      if (tap.kind === 'url') {
        this.environment('openURL', 'openURL');
        return this.button(core, [`if let url = URL(string: ${sString(tap.url)}) { openURL(url) }`], { accessibilityLabel });
      }
      const name = this.actionCase(`${tap.kind === 'overlay' ? 'show' : 'open'} ${tap.destination.name}`);
      return this.button(core, [`action(.${name})`], { accessibilityLabel });
    }
    const pair = this.swaps.get(node.id);
    if (pair && !given) return this.button(core, [`withAnimation(${this.motion('.snappy')}) { (${pair[0]}, ${pair[1]}) = (${pair[1]}, ${pair[0]}) }`], { accessibilityLabel });
    const name = this.actionCase(given || this.actionName(node, role));
    return this.button(core, [`action(.${name})`], { accessibilityLabel });
  }

  /**
   * Two fields whose values swap: a model of the texts that differ between
   * them (not their labels), a state per field bound to its texts, and the
   * swap button exchanging the two.
   */
  swapFields(node, role) {
    const ends = role.fields.map((id) => visibleChildren(node).find((c) => c.id === id));
    const values = fieldsOf(ends).filter((f) => f.kind === 'text' && !f.nodes.every((t, i) => t.characters === ends[i].name));
    if (!values.length || this.inComponent) return;
    const idents = new Set();
    const roles = ['title', 'subtitle', 'detail', 'caption', 'note'];
    values.forEach((f, i) => {
      if (!f.name) f.role = roles[i] || `text${i + 1}`;
    });
    for (const f of values) {
      let ident = sIdent(f.name || f.role, f.kind);
      for (let i = 2; idents.has(ident); i++) ident = `${sIdent(f.name || f.role, f.kind)}${i}`;
      idents.add(ident);
      f.ident = ident;
    }
    const model = this.typeName(`${node.name} end`);
    this.models.push([`struct ${model}: Hashable {`, ...values.map((f) => `  let ${f.ident}: String`), '}'].join('\n'));
    const names = ends.map((end, i) => {
      const name = this.member(end.name, i ? 'to' : 'from');
      const init = values.map((f) => `${f.ident}: ${dataValue(f, f.values[i])}`).join(', ');
      this.states.push(`  @State private var ${name} = ${model}(${init})`);
      for (const f of values) this.bindings.set(f.nodes[i].id, `${name}.${f.ident}`);
      return name;
    });
    this.swaps.set(role.button, names);
  }

  warn(node, message) {
    if (!this.warnings.some((w) => w.id === node.id && w.message === message)) {
      this.warnings.push({ id: node.id, name: node.name, message });
    }
  }

  // Values, tokens and assets.

  token(name, type, code) {
    if (this.tokens.has(name)) {
      const t = this.tokens.get(name);
      return t.code === code ? raw(`DesignTokens.${t.ident}`) : null;
    }
    let ident = sIdent(name, type === 'Color' ? 'color' : 'size');
    for (let i = 2; this.tokenIdents.has(ident); i++) ident = `${sIdent(name)}${i}`;
    this.tokenIdents.add(ident);
    this.tokens.set(name, { ident, type, code, name });
    return raw(`DesignTokens.${ident}`);
  }

  /** 'Color' or 'CGFloat': the type of the design token [ident]. */
  tokenType(ident) {
    for (const t of this.tokens.values()) if (t.ident === ident) return t.type;
    return null;
  }

  /**
   * The colour variable [name] as Color(light:dark:) when its collection has
   * a dark mode with another value, else null.
   */
  modeColor(name) {
    const modes = this.variableModes && this.variableModes[name];
    if (!modes) return null;
    const names = Object.keys(modes);
    const dark = names.find((m) => /dark/i.test(m));
    const light = names.find((m) => /light/i.test(m)) || names.find((m) => m !== dark);
    if (!dark || !light || sColor(modes[dark]) === sColor(modes[light])) return null;
    this.helpers.add('dynamicColor');
    return `Color(light: ${sColor(modes[light])}, dark: ${sColor(modes[dark])})`;
  }

  /** A number, or its design token when a variable is bound. */
  value(v, varName) {
    const n = round(v);
    return (varName && this.token(varName, 'CGFloat', sNum(n))) || n;
  }

  /** A Color, or its design token (with the paint's opacity) when a variable is bound. */
  color(color, opacity = 1, varName = null) {
    this.helpers.add('color');
    const literal = raw(sColor(color, opacity));
    if (!varName) return literal;
    const t = this.token(varName, 'Color', this.modeColor(varName) || sColor(color, 1));
    if (!t) return literal;
    const a = Math.round((color.a ?? 1) * opacity * 1000) / 1000;
    return a < 0.999 ? raw(`${t.code}.opacity(${sNum(a)})`) : t;
  }

  /** The asset catalog name for [source], unique per file. */
  asset(source, kind, name, ext) {
    if (this.files.has(source)) return this.files.get(source);
    const base = sIdent(name, kind === 'svg' ? 'icon' : 'image');
    let asset = base;
    // A name the project's catalog already gives another image is not reused.
    const taken = (n) => this.names.has(n) || Boolean(this.assets.taken && this.assets.taken(n, source));
    for (let i = 2; taken(asset); i++) asset = `${base}${i}`;
    this.files.set(source, asset);
    this.names.set(asset, { source, ext, vector: kind === 'svg' });
    return asset;
  }

  font(seg) {
    const family = seg.fontName && seg.fontName.family;
    if (!family || isSystemFamily(family)) return;
    if (!this.fonts.has(family)) this.fonts.set(family, new Set());
    const italic = /italic|oblique/i.test(seg.fontName.style || '');
    this.fonts.get(family).add(`${fontWeight(seg)}${italic ? ' italic' : ''}`);
  }

  /** AppFonts.<name> for a Figma text style with [font], or null when the name is taken by another font. */
  textStyle(name, font) {
    const code = print(font);
    if (this.textStyles.has(name)) {
      const t = this.textStyles.get(name);
      return t.code === code ? raw(`AppFonts.${t.ident}`) : null;
    }
    let ident = sIdent(name, 'style');
    for (let i = 2; this.textStyleIdents.has(ident); i++) ident = `${sIdent(name, 'style')}${i}`;
    this.textStyleIdents.add(ident);
    this.textStyles.set(name, { ident, code, name });
    return raw(`AppFonts.${ident}`);
  }

  /**
   * [v] framed to [size] ({ w, h }: a number, 'inf' or null), aligned by
   * [alignment]. A [clips] frame takes the room offered even when its
   * content is larger, as Figma's clipping frames keep their size.
   */
  frame(v, size, alignment = null, clips = false) {
    const args = [];
    const axis = (key, max, s) => {
      if (s === 'inf') {
        if (clips) args.push([`min${key[0].toUpperCase()}${key.slice(1)}`, 0]);
        args.push([max, INFINITY]);
      }
      else if (typeof s === 'number') args.push([key, round(s)]);
      else if (s && s.kind === 'raw') args.push([key, s]);
      else if (s && typeof s.min === 'number') args.push([`min${key[0].toUpperCase()}${key.slice(1)}`, round(s.min)]);
      else if (s && typeof s.max === 'number') args.push([max, round(s.max)]);
    };
    axis('width', 'maxWidth', size.w);
    axis('height', 'maxHeight', size.h);
    if (!args.length) return v;
    // A fixed and a flexible axis go in two frames: one frame takes either
    // sizes or bounds.
    const fixed = args.filter(([k]) => k === 'width' || k === 'height');
    const flexible = args.filter(([k]) => k.startsWith('max') || k.startsWith('min'));
    const align = alignment && alignment !== '.center' ? [['alignment', raw(alignment)]] : [];
    if (fixed.length && flexible.length) return mod(mod(v, 'frame', [...fixed, ...align]), 'frame', [...flexible, ...align]);
    return mod(v, 'frame', [...args, ...align]);
  }

  // Tree.

  /** The view for [node] in its parent's [ctx], or null when not drawn. */
  node(node, ctx) {
    if (!node || node.visible === false || node.isMask || this.skip.has(node.id)) return null;
    const mark = this.warnings.length;
    try {
      return this.place(node, ctx);
    } catch (e) {
      // One unreadable layer must not cost the whole frame: a box of its
      // size stands in for it.
      this.warnings.length = mark;
      const reason = String(e && e.message ? e.message : e);
      this.warnings.push({ id: node.id, name: node.name, message: `drawn as an empty box: ${reason}` });
      const size = { w: typeof node.width === 'number' ? node.width : null, h: typeof node.height === 'number' ? node.height : null };
      const box = this.frame(clear(), size);
      try {
        return this.wrapPlace(node, ctx, box);
      } catch {
        return box;
      }
    }
  }

  place(node, ctx) {
    if (node.error) throw new Error(`the plugin could not read this layer (${node.error})`);
    const fixed = Boolean(node.svg || node.render);
    const size = this.sizeFor(node, ctx, fixed);
    this.ancestors.push(node);
    let core;
    try {
      core = this.core(node, ctx, size);
    } finally {
      this.ancestors.pop();
    }
    // A frame placed freely that hugs its content keeps its own size: the
    // room its parent offers past it must not squeeze it.
    if (ctx.kind === 'stack' && isAutoLayout(node) && ownSizing(node, 'x') === 'HUG') {
      core = mod(core, 'fixedSize', [['horizontal', true], ['vertical', ownSizing(node, 'y') === 'HUG']]);
    } else if (ctx.kind === 'stack' && core && Array.isArray(core.mods) && this.stackPlacement(node, ctx.parent).v.mode !== 'stretch' &&
        core.mods.some((m) => m.name === 'frame' && m.args.some(([k]) => k === 'minHeight'))) {
      // A box of text that grows takes its own height, not all the room the stack offers it.
      core = mod(core, 'fixedSize', [['horizontal', false], ['vertical', true]]);
    }
    core = this.limits(node, size, core);
    core = this.interactive(node, core);
    // For the render check: each layer reports where it was laid out.
    if (this.probe) {
      // An item's layers are probed by the first item's ids and the item's
      // place, so every item draws the same code.
      const alias = this.probeAlias.get(node.id);
      if (!this.inComponent) core = mod(core, 'checkProbe', [[null, str(node.id)]]);
      else if (alias) core = mod(core, 'checkProbe', [[null, raw(`probe + ${sString(alias)}`)]]);
    }
    if (ctx.kind !== 'root' && !this.inComponent && EXTRACT_TYPES.has(node.type) && countVisible(node) >= EXTRACT_SIZE) core = this.extract(node, core);
    return this.wrapPlace(node, ctx, core);
  }

  /**
   * A switch: Toggle bound to a state (the screen's, or the item view's in
   * a row of items), drawn by the design's switch style.
   */
  toggle(node, role) {
    const paint = (n) => {
      const p = visiblePaints(n.fills)[0];
      if (!p || p.type !== 'SOLID') return null;
      const vars = n.vars || {};
      return this.color(p.color, p.opacity ?? 1, vars[`fill.${n.fills.indexOf(p)}`] || vars.fills);
    };
    const knob = visibleChildren(node)[0];
    const track = paint(node) || raw('Color.accentColor');
    const name = `${sIdent(role.label, 'switch')}On`;
    let state;
    if (this.inComponent) {
      state = 'isOn';
      // Item views keep a memberwise init the screen can call.
      if (!this.metrics.has(state)) this.metrics.set(state, `  @State var isOn = ${role.on}`);
    } else {
      state = this.member(name, 'isOn');
      this.states.push(`  @State private var ${state} = ${role.on}`);
    }
    this.helpers.add('designSwitch');
    const inset = round((node.height - knob.height) / 2);
    const style = call('DesignSwitchStyle', [
      ['on', role.on ? track : raw('Color.accentColor')], ['off', role.on ? raw('Color(.systemFill)') : track], ['knob', paint(knob) || raw('Color.white')],
      ['width', round(node.width)], ['height', round(node.height)], ['inset', inset],
    ]);
    return mod(mod(view('Toggle', [[null, call('String', [['localized', str(role.label)]])], ['isOn', raw(`$${state}`)]]), 'toggleStyle', [[null, style]]), 'labelsHidden');
  }

  /**
   * A track filled to [role].value: ProgressView with the design's bar
   * style. Its width is at most the design's, so a narrower row shrinks it.
   */
  progress(node, size, role) {
    const solid = (n) => {
      const p = visiblePaints(n.fills)[0];
      if (!p) return raw('Color.clear');
      const vars = n.vars || {};
      return this.color(p.color, p.opacity ?? 1, vars[`fill.${n.fills.indexOf(p)}`] || vars.fills);
    };
    const fill = visibleChildren(node)[0];
    const radius = (n) => (typeof n.cornerRadius === 'number' ? Math.min(n.cornerRadius, n.height / 2) : 0);
    if (Math.abs(radius(fill) - radius(node)) > 0.5) this.warn(node, 'the bar\'s fill is drawn with the track\'s corner radius');
    this.helpers.add('designBar');
    let v = mod(view('ProgressView', [['value', role.value]]), 'progressViewStyle', [[null, call('DesignBarStyle', [
      ['track', solid(node)], ['fill', solid(fill)], ['radius', round(radius(node))],
    ])]]);
    v = mod(v, 'frame', [['height', round(node.height)]]);
    return mod(v, 'frame', [['maxWidth', size.w === 'inf' ? INFINITY : round(node.width)]]);
  }

  /** [v] kept within the layer's min and max width and height, on axes its content or parent sizes. */
  limits(node, size, v) {
    const args = [];
    for (const [axis, key] of [['w', 'Width'], ['h', 'Height']]) {
      if (typeof size[axis] === 'number' || (size[axis] && size[axis].kind === 'raw')) continue;
      const min = node[`min${key}`];
      const max = node[`max${key}`];
      if (typeof min === 'number' && min > 0) args.push([`min${key}`, round(min)]);
      if (typeof max === 'number' && max > 0 && max < 1e6) args.push([`max${key}`, round(max)]);
    }
    return args.length ? mod(v, 'frame', args) : v;
  }

  /** A member name of the screen struct, unique. */
  member(label, fallback) {
    let base = sIdent(label, fallback);
    if (METRIC_NAME.test(base)) base = `${base}${fallback[0].toUpperCase()}${fallback.slice(1)}`;
    let name = base;
    for (let i = 2; this.propNames.has(name); i++) name = `${base}${i}`;
    this.propNames.add(name);
    return name;
  }

  /** A type name, unique in the file and clear of SwiftUI's own types. */
  typeName(label) {
    let base = sType(label, 'Item');
    if (this.takenType(base) || this.takenType(`${base}View`)) base = `${base}Item`;
    let name = base;
    for (let i = 2; this.typeNames.has(name) || this.typeNames.has(`${name}View`) || this.takenType(`${name}View`); i++) name = `${base}${i}`;
    this.typeNames.add(name);
    return name;
  }

  /**
   * Runs of layers drawn as one view over data. Items holding a text input
   * are left out: each field needs a state of its own.
   */
  runsOf(flow) {
    const input = (n) => this.inputs.has(n.id) || (n.children || []).some(input);
    // The ends of a swap are bound to their own states.
    const swapped = (n) => [...this.swaps.values()].length && this.roleOf(this.parents.get(n.id)) === 'swapFields';
    return runsOf(flow).filter((r) => !r.items.some((n) => input(n) || swapped(n)));
  }

  /**
   * A clear box of a frame's size for its layers to lie over: a fixed size
   * as it is, a filling one with the design's size as its ideal, so it keeps
   * that size where it is offered none (in a hugging stack) and fills otherwise.
   */
  layerBox(node, size) {
    const args = [];
    for (const [axis, key, design] of [['w', 'Width', node.width], ['h', 'Height', node.height]]) {
      const s = size[axis] ?? design;
      if (s === 'inf') args.push([`ideal${key}`, round(design)], [`max${key}`, INFINITY]);
      else if (s && typeof s.min === 'number') args.push([`min${key}`, round(s.min)], [`ideal${key}`, round(design)]);
      else if (s && typeof s.max === 'number') args.push([`ideal${key}`, round(design)], [`max${key}`, round(s.max)]);
      else args.push([key.toLowerCase(), typeof s === 'number' ? round(s) : s]);
    }
    const fixed = args.filter(([k]) => k === 'width' || k === 'height');
    const flexible = args.filter(([k]) => !fixed.includes(args.find((a) => a[0] === k)));
    let box = clear();
    if (fixed.length) box = mod(box, 'frame', fixed);
    if (flexible.length) box = mod(box, 'frame', flexible);
    return box;
  }

  /** [box] with [items] laid over it: one item as an overlay, several in a LayerStack of the box's size. */
  layers(box, items) {
    if (items.length === 1) return mod(box, 'overlay', [['alignment', raw('.topLeading')]], items);
    this.helpers.add('layerStack');
    return mod(box, 'overlay', [['alignment', raw('.topLeading')]], [view('LayerStack', [], items)]);
  }

  /**
   * The short heading text just above [node]: a text sibling before it, or
   * before one of its first few ancestors ("SERVICE DETAILS" above a list).
   */
  headingAbove(node) {
    let child = node;
    for (let depth = 0; child && depth < 4; depth++) {
      const parent = this.parents.get(child.id);
      if (!parent) break;
      const kids = visibleChildren(parent);
      for (let i = kids.indexOf(child) - 1; i >= 0; i--) {
        const t = findText(kids[i]);
        const text = t && String(t.characters || '').trim();
        if (text && /^[^\d\n]{3,30}$/.test(text) && text.split(/\s+/).length <= 4) return text;
        if (t) break;
      }
      if (parent === this.screenNode) break;
      child = parent;
    }
    return null;
  }

  /**
   * Whether the text being drawn lies in a box that cannot grow with it: a
   * frame of fixed width and height (not the screen, not a section of it)
   * that clips its content or has no auto layout.
   */
  boxed() {
    const own = this.ancestors.slice(0, -1).reverse();
    return own.some((a) => a !== this.screenNode && !(this.screen && a.id === this.screen.id) &&
      ownSizing(a, 'x') === 'FIXED' && ownSizing(a, 'y') === 'FIXED' && (a.clipsContent || !isAutoLayout(a)) &&
      a.width < (this.screenNode ? this.screenNode.width * 0.95 : Infinity));
  }

  /** Whether [node] is part of a logo or wordmark, whose text keeps its size at every text size. */
  brand(node) {
    return [...this.ancestors, node].some((n) => /\b(logo|logotype|wordmark|brand)\b/i.test(String(n.name || '')));
  }

  /** Whether a nested type named [name] would shadow a type the code uses. */
  takenType(name) {
    return SWIFT_TYPE_NAMES.has(name) || name === this.structName;
  }

  /** A length that scales with Dynamic Type, declared once per view struct; its name. */
  scaledMetric(value) {
    const name = `iconSize${sNum(round(value)).replace('.', '_')}`;
    if (!this.metrics.has(name)) {
      // Item views keep a memberwise init the screen can call.
      this.metrics.set(name, `  @ScaledMetric(relativeTo: .body) ${this.inComponent ? '' : 'private '}var ${name}: CGFloat = ${sNum(round(value))}`);
      if (!this.inComponent) this.states.push(this.metrics.get(name));
    }
    return name;
  }

  /**
   * A text field in place of [text], the placeholder of [input]: bound to a
   * state, in the placeholder's font, with the content type and keyboard
   * the input's name or placeholder imply.
   */
  textInput(node, input, text) {
    // Named after the field ("Email"), else its placeholder.
    // "Password field" is the password.
    const own = String(input.name || '').replace(/[\s_-]*(text[\s_-]*)?(field|input|box)$/i, '').trim();
    const named = own && !isGenericName(own) && !/^(text|search ?bar)$/i.test(own);
    const base = named ? own : input.label;
    const state = this.member(base, 'text');
    this.states.push(`  @State private var ${state} = ""`);
    const focus = this.focusCase(input, base);
    const content = input.content || {};
    const font = (text.mods || []).find((m) => m.name === 'font' || m.name === 'designFont');
    const color = (text.mods || []).find((m) => m.name === 'foregroundStyle');
    // The design's text is the placeholder, in its colour; typed text keeps the primary colour.
    const prompt = color ? mod(view('Text', [[null, str(input.label)]]), 'foregroundStyle', color.args) : null;
    let v = view(content.secure ? 'SecureField' : 'TextField', [[null, str(input.label)], ['text', raw(`$${state}`)], ['prompt', prompt]]);
    if (font) v = mod(v, font.name, font.args);
    if (content.textContentType) v = mod(v, 'textContentType', [[null, raw(content.textContentType)]]);
    if (content.keyboardType) v = mod(v, 'keyboardType', [[null, raw(content.keyboardType)]]);
    v = mod(v, 'focused', [[null, raw('$focusedField')], ['equals', raw(`.${focus.name}`)]]);
    v = mod(v, 'submitLabel', [[null, content.submitLabel ? raw(content.submitLabel) : focus.submitLabel]]);
    return mod(v, 'onSubmit', [], [focus.submit]);
  }

  /**
   * The focus case of a text input, in reading order: Return moves to the
   * next field and the last one ends editing. Its submit statement and
   * submit label are filled in once every field is known.
   */
  focusCase(input, label) {
    if (!this.focus) {
      this.focus = [];
      this.states.push('  @FocusState private var focusedField: Field?');
    }
    let name = sIdent(label, 'field');
    for (let i = 2; this.focus.some((f) => f.name === name); i++) name = `${sIdent(label, 'field')}${i}`;
    const entry = { id: input.id, name, submit: raw(''), submitLabel: raw('') };
    this.focus.push(entry);
    return { name, submit: entry.submit, submitLabel: entry.submitLabel };
  }

  /** The Field enum and each field's submit, once every text input is drawn. */
  finishFocus() {
    if (!this.focus) return null;
    // Declared after the fields' states.
    const line = '  @FocusState private var focusedField: Field?';
    this.states = [...this.states.filter((l) => l !== line), line];
    this.focus.forEach((f, i) => {
      const next = this.focus[i + 1];
      f.submit.code = next ? `focusedField = .${next.name}` : 'focusedField = nil';
      f.submitLabel.code = next ? '.next' : '.done';
    });
    return ['/// The screen\'s text fields, in the order Return moves through them.', 'enum Field: Hashable {',
      ...this.focus.map((f) => `  case ${f.name}`), '}'].join('\n');
  }

  /** [animation], or none when the person has asked for reduced motion. */
  motion(animation) {
    if (this.inComponent) return animation;
    return `${this.environment('accessibilityReduceMotion', 'reduceMotion')} ? nil : ${animation}`;
  }

  /** The environment's Dynamic Type size, declared once. */
  dynamicTypeSize() {
    return this.environment('dynamicTypeSize', 'dynamicTypeSize');
  }

  /** An environment value of the screen, declared once; its name. */
  environment(key, name) {
    const line = `  @Environment(\\.${key}) private var ${name}`;
    if (!this.states.includes(line)) this.states.push(line);
    return name;
  }

  /**
   * A layout property for a row that stacks at accessibility text sizes,
   * read from the environment's Dynamic Type size; its name.
   */
  adaptiveLayout(node, spacing, align) {
    this.dynamicTypeSize();
    const name = this.member(`${node.name} layout`, 'rowLayout');
    const gap = sNum(round(spacing));
    this.lets.push([
      '  /// Side by side, or stacked when the text is set to an accessibility size.',
      `  private var ${name}: AnyLayout {`,
      '    dynamicTypeSize.isAccessibilitySize',
      `      ? AnyLayout(VStackLayout(spacing: ${gap}))`,
      `      : AnyLayout(HStackLayout(${align ? `alignment: ${align}, ` : ''}spacing: ${gap}))`,
      '  }',
    ].join('\n'));
    return name;
  }

  /**
   * A name saying what [node] is: its own unless Figma's default, else its
   * role's label, its short text, or the nearest named ancestor's name
   * with [kind] ("icon", "image", "section").
   */
  label(node, kind = null, { text = true } = {}) {
    if (!isGenericName(node.name)) return node.name;
    const role = this.roles.get(node.id);
    if (role && role.label) return role.label;
    const short = (t) => String(t || '').trim().split(/\s+/).slice(0, 3).join(' ');
    if (isText(node)) return short(node.characters);
    // A run of items is named after its section, not after the text of one item.
    if (role && CONTAINER_ROLES[role.role]) {
      for (let p = this.parents.get(node.id); p; p = this.parents.get(p.id)) {
        if (!isGenericName(p.name)) return `${p.name} ${CONTAINER_ROLES[role.role]}`;
      }
      return CONTAINER_ROLES[role.role];
    }
    if (role && role.title) {
      const title = this.byId.get(role.title);
      if (title) return short(title.characters);
    }
    // A short text without digits names what holds it ("Service details"); one with digits is a value.
    const first = text && kind !== 'icon' && kind !== 'image' ? findText(node, (t) => /^[^\d]{2,24}$/.test(String(t.characters).trim())) : null;
    if (first) return short(first.characters);
    for (let p = this.parents.get(node.id); p; p = this.parents.get(p.id)) {
      if (!isGenericName(p.name)) return kind ? `${p.name} ${kind}` : p.name;
    }
    return kind || node.name;
  }

  /** A view property holding [v], referenced by name. */
  extract(node, v) {
    const own = this.label(node, 'section');
    // A name already given (to a section inside this one, or to data) gives
    // way to the next text of the section before a number is added.
    const free = (l) => !this.propNames.has(sIdent(l, 'section')) && !RESERVED_IDENTS.has(sIdent(l, 'section'));
    const texts = [];
    const walk = (n) => {
      if (!n || n.visible === false || texts.length >= 6) return;
      if (isText(n)) {
        // Only a short label reads as a name ("Raised by"), not a sentence or a value.
        const t = String(n.characters || '').trim();
        if (/^[A-Za-z][A-Za-z&\s-]{3,20}$/.test(t) && t.split(/\s+/).length <= 2) texts.push(t);
      } else (n.children || []).forEach(walk);
    };
    if (isGenericName(node.name)) walk(node);
    const label = [own, ...texts].find(free) || own;
    // A section shares its name with its items' data: it is that section.
    const taken = !free(label) && !/section$/i.test(label);
    const name = this.member(taken ? `${label} section` : label, 'section');
    this.props.push({ name, view: v, node });
    return view('', [[null, raw(name)]]);
  }

  /**
   * The node's size in [ctx]: { w, h } with w and h a number, 'inf' (fill
   * the parent on that axis) or null (its content sizes it).
   */
  sizeFor(node, ctx, fixed = false) {
    const W = node.width;
    const H = node.height;
    const hugW = hugsWidth(node);
    const hugH = hugsHeight(node);
    const content = (axis) => (isAutoLayout(node) && ownSizing(node, axis) === 'HUG') || (axis === 'x' ? hugW : hugH);
    if (ctx.kind === 'root') return { w: W, h: H };
    if (ctx.kind === 'bar') return { w: 'inf', h: !fixed && (hugH || content('y')) ? null : H };
    if (ctx.kind === 'cell') return { w: 'inf', h: !fixed && (hugH || content('y')) ? null : H };
    if (ctx.kind === 'flex') {
      const out = { w: null, h: null };
      const inner = ctx.parent.width - (ctx.parent.paddingLeft || 0) - (ctx.parent.paddingRight || 0);
      for (const axis of ['x', 'y']) {
        const key = axis === 'x' ? 'w' : 'h';
        let mode = sizingOf(node, ctx.parent, axis);
        if (mode === 'FILL' && axis === ctx.axis && ctx.hugMain) mode = 'FIXED';
        // A column's child as wide as the column fills it, unless the column
        // is only that wide because it hugs the child.
        if (mode === 'FIXED' && axis === 'x' && ctx.axis === 'y' && !hugW && W >= inner - 0.5 && ownSizing(ctx.parent, 'x') !== 'HUG') mode = 'FILL';
        if (mode === 'FILL') out[key] = 'inf';
        else if (fixed || !(mode === 'HUG' && content(axis))) {
          if (!(axis === 'x' ? hugW : hugH) || fixed) out[key] = axis === 'x' ? W : H;
        }
        // An item of a control with a label keeps at least its width, and widens for a longer label.
        if (axis === 'x' && typeof out.w === 'number' && !fixed && SELECTABLE.has(this.roleOf(ctx.parent)) && hasText(node)) out.w = { min: W };
        // Items that fill their row in the design share a narrower screen: at most their width.
        if (axis === 'x' && ctx.axis === 'x' && node.type !== 'TEXT' && sizingOf(node, ctx.parent, 'x') === 'FIXED' && this.shrinks(ctx.parent)) out.w = { max: W };
      }
      return out;
    }
    if (ctx.kind === 'stack') {
      const p = this.stackPlacement(node, ctx.parent);
      const own = (a, hug, S) => (a.mode === 'stretch' ? 'inf' : hug && !fixed ? null : S);
      return { w: own(p.h, hugW || content('x'), W), h: own(p.v, hugH || content('y'), H) };
    }
    if (ctx.kind === 'page') {
      const p = this.stackPlacement(node, ctx.parent);
      return {
        w: p.h.mode === 'stretch' ? 'inf' : (hugW || content('x')) && !fixed ? null : W,
        h: (hugH || content('y')) && !fixed ? null : H,
      };
    }
    return {
      w: !fixed && (hugW || content('x')) ? null : W,
      h: !fixed && (hugH || content('y')) ? null : H,
    };
  }

  wrapPlace(node, ctx, v) {
    if (ctx.kind === 'stack') return this.positioned(node, ctx.parent, v);
    if (ctx.kind === 'page') return this.pagePlace(node, ctx.parent, v);
    return v;
  }

  /** A section of a page column placed across the page by its constraints; the column places it down the page. */
  pagePlace(node, parent, v) {
    if (this.scaledGroup(node, parent)) return this.scaledPlace(node, parent, v, false);
    const p = this.stackPlacement(node, parent).h;
    // A section sized by its content keeps at least the design's height, and grows with its text.
    if (hugsHeight(node) || (isAutoLayout(node) && ownSizing(node, 'y') === 'HUG')) {
      v = mod(v, 'frame', [['minHeight', round(node.height)], ['alignment', raw('.top')]]);
    }
    const across = (alignment) => mod(v, 'frame', [['maxWidth', INFINITY], ['alignment', raw(alignment)]]);
    switch (p.mode) {
      case 'stretch': return padded(v, [0, round(p.end), 0, round(p.start)]);
      case 'max': v = padded(v, [0, round(p.end), 0, 0]); return across('.trailing');
      case 'center': {
        const out = mod(v, 'frame', [['maxWidth', INFINITY]]);
        return round(p.offset) ? mod(out, 'offset', [['x', round(p.offset)]]) : out;
      }
      default: v = padded(v, [0, 0, 0, round(p.offset)]); return across('.leading');
    }
  }

  /** Whether [node] is a large group drawn as a tiny frame (see withContentBounds) on a screen-wide [parent], kept whole and scaled to fit. */
  scaledGroup(node, parent) {
    return Boolean(node.contentBounds && !this.inComponent && this.screen && parent.width >= this.screen.width - 1 &&
      node.width >= parent.width * 0.6 && (node.width >= parent.width * 0.9 || Math.abs(node.x - parent.x + node.width / 2 - parent.width / 2) <= 2));
  }

  /**
   * Three or more like layers of [members] spread evenly across most of a
   * screen-wide [area] in one band (tiles of a game's menu), left to right;
   * else null.
   */
  spreadGroup(members, area) {
    if (!this.screen || area.width < this.screen.width - 1) return null;
    const like = (a, b) => Math.abs(a.width - b.width) <= 8 && Math.abs(a.y - b.y) <= 12 && Math.abs(a.height - b.height) <= 12;
    for (const first of members) {
      const group = members.filter((c) => !isText(c) && like(c, first)).sort((a, b) => a.x - b.x);
      if (group.length < 3) continue;
      const gaps = group.slice(1).map((c, i) => c.x - group[i].x - group[i].width);
      const extent = group[group.length - 1].x + group[group.length - 1].width - group[0].x;
      if (Math.max(...gaps) - Math.min(...gaps) <= 4 && Math.min(...gaps) >= -1 && extent >= area.width * 0.8) return group;
    }
    return null;
  }

  /** The [group] (from spreadGroup) as one row placed in [parent], drawn at its design width and scaled down on a narrower screen. */
  spreadRow(group, parent) {
    const x0 = Math.min(...group.map((c) => c.x));
    const y0 = Math.min(...group.map((c) => c.y));
    const x1 = Math.max(...group.map((c) => c.x + c.width));
    const y1 = Math.max(...group.map((c) => c.y + c.height));
    const row = { ...parent, x: x0, y: y0, width: x1 - x0, height: y1 - y0, layoutMode: undefined, children: group };
    const items = group.map((c) => this.node(c, { kind: 'stack', parent: row })).filter(Boolean);
    this.helpers.add('scalesToFit');
    if (items.length > 1) this.helpers.add('layerStack');
    const box = this.layers(this.layerBox(row, { w: row.width, h: row.height }), items);
    const v = mod(box, 'scalesToFit', [['width', round(row.width)], ['height', round(row.height)]]);
    return padded(v, [round(y0 - parent.y), round(parent.x + parent.width - x1), 0, round(x0 - parent.x)]);
  }

  /** The in-flow items of the row [row] and how much of its width they take in the design (0 to 1). */
  rowFill(row) {
    const flow = visibleChildren(row).filter((c) => inFlow(c, row));
    const [, right, , left] = this.paddingValues(row);
    const inner = row.width - left - right;
    const used = flow.reduce((t, c) => t + (c.width || 0), 0) + (row.itemSpacing > 0 ? row.itemSpacing * (flow.length - 1) : 0);
    return { flow, share: inner > 0 ? used / inner : 0 };
  }

  /**
   * Whether the fixed items of [row] (a few buttons, a tab bar's tabs) fill
   * its width as wide as the screen: on a narrower phone they shrink to
   * share it, never past their design width.
   */
  shrinks(row) {
    if (!this.screen || !row || row.layoutMode !== 'HORIZONTAL' || row.layoutWrap === 'WRAP' || scrollsItself(row)) return false;
    if (row.width < this.screen.width * 0.85 || row.width > this.screen.width + 0.5 || this.roleOf(row) === 'carousel') return false;
    const { flow, share } = this.rowFill(row);
    // Items running past the row scroll there instead.
    return (flow.length <= 3 || this.roleOf(row) === 'tabBar') && share >= 0.85 && share <= 1.01 &&
      flow.some((c) => c.type !== 'TEXT' && sizingOf(c, row, 'x') === 'FIXED');
  }

  /** Whether [row] holds four or more like fixed items (tiles) filling a screen-wide row: on a narrower phone they scroll. */
  scrollsWhenNarrow(row) {
    if (!this.screen || row.layoutMode !== 'HORIZONTAL' || row.layoutWrap === 'WRAP' || scrollsItself(row) || this.shrinks(row)) return false;
    if (row.width < this.screen.width * 0.85 || row.width > this.screen.width + 0.5 || this.roleOf(row) === 'carousel') return false;
    const { flow, share } = this.rowFill(row);
    return flow.length >= 4 && share >= 0.85 && share <= 1.01 && flow.every((c) => sizingOf(c, row, 'x') === 'FIXED' && Math.abs(c.width - flow[0].width) <= 0.5);
  }

  /** Whether [node] is one of three or more like layers spread evenly across a band of [parent] (tabs, tiles). */
  distributed(node, parent) {
    const band = visibleChildren(parent).filter((c) => c.y < node.y + node.height && c.y + c.height > node.y &&
      Math.abs(c.width - node.width) <= node.width * 0.2).sort((a, b) => a.x - b.x);
    if (band.length < 3) return false;
    const gaps = band.slice(1).map((c, i) => c.x - band[i].x - band[i].width);
    return Math.max(...gaps) - Math.min(...gaps) <= 4;
  }

  /**
   * How a ZStack child is placed from its constraints, per axis: 'min'
   * (offset from the start), 'max' (inset from the end), 'center' (offset
   * from the centre) or 'stretch' (inset from both ends).
   */
  stackPlacement(node, parent) {
    const x = node.x - parent.x;
    const y = node.y - parent.y;
    let cons = !WRAPPING_PARENTS.has(parent.type) && node.constraints
      ? node.constraints : { horizontal: 'MIN', vertical: 'MIN' };
    // On a phone screen, a section that spans the width or sits centred
    // with equal margins stretches with the screen.
    const screenWide = this.screen && parent.width >= this.screen.width - 1;
    // Most of the screen's width: such a frame follows the screen's width (or keeps its own, where this changes nothing).
    const wide = this.screen && parent.width >= this.screen.width * 0.8;
    const stretchy = parent === this.screen || this.stretchCells.has(parent.id) || screenWide;
    const group = node.contentBounds && wide && cons.horizontal === 'MIN';
    if (group && node.width >= parent.width * 0.9) {
      // A group across the screen (a top bar) follows its width.
      cons = { ...cons, horizontal: 'STRETCH' };
    } else if (group && Math.abs(x + node.width / 2 - parent.width / 2) <= 2) {
      cons = { ...cons, horizontal: 'CENTER' };
    } else if (group && node.width < parent.width / 2 && x + node.width / 2 > parent.width * 0.6 && !this.distributed(node, parent)) {
      cons = { ...cons, horizontal: 'MAX' };
    } else if (stretchy && cons.horizontal !== 'MAX' && cons.horizontal !== 'STRETCH' && !hugsWidth(node) &&
        node.width >= parent.width / 2 && Math.abs(x - (parent.width - x - node.width)) <= 2) {
      cons = { ...cons, horizontal: 'STRETCH' };
    } else if (wide && cons.horizontal === 'MIN' && node.width < parent.width / 3 && !this.distributed(node, parent)) {
      // Left at Figma's default, a small layer keeps to its side of a
      // screen-wide frame on other screens: actions on the right stay there.
      if (Math.abs(x + node.width / 2 - parent.width / 2) <= 1) cons = { ...cons, horizontal: 'CENTER' };
      else if (x >= parent.width / 2) cons = { ...cons, horizontal: 'MAX' };
    }
    const axis = (mode, pos, size, total) => {
      switch (mode) {
        case 'MAX': return { mode: 'max', end: total - pos - size };
        case 'STRETCH': return { mode: 'stretch', start: pos, end: total - pos - size };
        case 'CENTER': return { mode: 'center', offset: pos + size / 2 - total / 2 };
        default: return { mode: 'min', offset: pos };
      }
    };
    return { h: axis(cons.horizontal, x, node.width, parent.width), v: axis(cons.vertical, y, node.height, parent.height) };
  }

  /**
   * A scaled group (see scaledGroup) kept whole: laid out across the screen,
   * or at its size, and scaled down where it does not fit; [top] places it
   * down its parent too.
   */
  scaledPlace(node, parent, v, top) {
    const stretches = node.width >= parent.width * 0.9;
    this.helpers.add('scalesToFit');
    const x = node.x - parent.x;
    let out = mod(v, 'scalesToFit', [['width', round(node.width)], ['height', round(node.height)], ['stretches', stretches || null]]);
    out = padded(out, [top ? round(node.y - parent.y) : 0, round(parent.width - x - node.width), 0, round(x)]);
    return stretches ? out : mod(out, 'frame', [['maxWidth', INFINITY]]);
  }

  positioned(node, parent, v) {
    if (this.scaledGroup(node, parent)) return this.scaledPlace(node, parent, v, true);
    const p = this.stackPlacement(node, parent);
    const pad = [0, 0, 0, 0];
    if (p.h.mode === 'max') pad[1] = round(p.h.end);
    if (p.h.mode === 'stretch') [pad[3], pad[1]] = [round(p.h.start), round(p.h.end)];
    if (p.v.mode === 'max') pad[2] = round(p.v.end);
    if (p.v.mode === 'stretch') [pad[0], pad[2]] = [round(p.v.start), round(p.v.end)];
    let out = padded(v, pad);
    const spans = (a) => a.mode === 'max' || a.mode === 'center';
    if (spans(p.h) || spans(p.v)) {
      const h = { max: 'trailing', center: '' }[p.h.mode] ?? 'leading';
      const vv = { max: 'bottom', center: '' }[p.v.mode] ?? 'top';
      out = mod(out, 'frame', [
        ['maxWidth', spans(p.h) ? INFINITY : null], ['maxHeight', spans(p.v) ? INFINITY : null],
        ['alignment', raw(alignmentOf(h, vv))],
      ]);
    }
    const dx = p.h.offset !== undefined ? round(p.h.offset) : 0;
    const dy = p.v.offset !== undefined ? round(p.v.offset) : 0;
    // A layer placed from the start takes its room in the parent (padding),
    // one past the start gives it back (negative padding), as Figma counts
    // only the frame's own box; one placed from the centre is only moved.
    const room = (a, d) => a.mode === 'min' && d !== 0;
    if (room(p.h, dx) || room(p.v, dy)) out = padded(out, [room(p.v, dy) ? dy : 0, 0, 0, room(p.h, dx) ? dx : 0]);
    const mx = room(p.h, dx) ? 0 : dx;
    const my = room(p.v, dy) ? 0 : dy;
    if (mx || my) out = mod(out, 'offset', [['x', mx || null], ['y', my || null]]);
    return out;
  }

  /** The node's own view at [size]. */
  core(node, ctx, size) {
    const mapping = node.type === 'INSTANCE' && this.connect ? this.connect(node) : null;
    if (mapping) return this.component(node, size, mapping);
    const line = straightLine(node);
    if (isTurned(node) && !node.svg && !node.render && !line) return this.turned(node, size);
    if (isText(node)) return this.text(node, size, ctx);
    if (line) return this.line(node, size, line);
    if (drawnAsSvg(node)) return this.svg(node, size);
    if (node.render && this.assets.render) return this.render(node, size);
    const role = this.roles.get(node.id);
    if (role && role.role === 'progress') return this.progress(node, size, role);
    if (role && role.role === 'switch') return this.toggle(node, role);
    if (role && role.role === 'segmented' && role.native && role.native.use && !this.inComponent) {
      const flow = visibleChildren(node).filter((c) => inFlow(c, node));
      const picker = this.repeated(flow, { kind: 'flex', parent: node, axis: 'x', hugMain: false }, false);
      if (picker && print(picker, 0).startsWith('Picker')) return this.frame(picker, { w: size.w, h: null });
    }
    return this.box(node, size);
  }

  component(node, size, mapping) {
    this.connected.set(mapping.componentName, mapping);
    const args = [];
    for (const [key, prop] of Object.entries(node.componentProperties || {})) {
      if (!prop || prop.type === 'INSTANCE_SWAP') continue;
      const name = sIdent(String(key).replace(/#.*$/, ''), 'prop');
      args.push([name, prop.type === 'BOOLEAN' ? Boolean(prop.value) : str(String(prop.value ?? ''))]);
    }
    return this.frame(view(mapping.componentName, args), size);
  }

  turned(node, size) {
    const m = linearTransform(node);
    const deg = rotationOf(m);
    const flat = { ...node, rotation: 0, transform: null };
    const own = { w: node.rawWidth, h: node.rawHeight };
    let inner = isText(node) ? this.text(flat, own) : this.box(flat, own);
    if (deg !== null) {
      inner = mod(inner, 'rotationEffect', [[null, raw(`.degrees(${sNum(round(deg))})`)]]);
    } else if (Math.abs(m.b) < 1e-4 && Math.abs(m.c) < 1e-4 && Math.abs(Math.abs(m.a) - 1) < 1e-4 && Math.abs(Math.abs(m.d) - 1) < 1e-4) {
      inner = mod(inner, 'scaleEffect', [['x', m.a < 0 ? -1 : 1], ['y', m.d < 0 ? -1 : 1]]);
    } else {
      // Turned about the box's centre.
      const cx = node.rawWidth / 2;
      const cy = node.rawHeight / 2;
      const r4 = (v) => Math.round(v * 10000) / 10000;
      inner = mod(inner, 'transformEffect', [[null, call('CGAffineTransform', [
        ['a', r4(m.a)], ['b', r4(m.b)], ['c', r4(m.c)], ['d', r4(m.d)],
        ['tx', round(cx - (m.a * cx + m.c * cy))], ['ty', round(cy - (m.b * cx + m.d * cy))],
      ])]]);
    }
    // The bounding box holds the unturned box, turned about its centre.
    return this.frame(inner, { w: size.w ?? node.width, h: size.h ?? node.height });
  }

  textCtx(node) {
    return {
      value: (v, name) => this.value(v, name),
      color: (c, o, name) => this.color(c, o, name),
      font: (seg) => fontOf(seg, (v, name) => this.value(v, name), { fixed: this.brand(node), faces: this.faces }),
      faces: this.faces,
      fixed: this.brand(node),
      warn: (message) => this.warn(node, message),
      textStyle: (name, font) => this.textStyle(name, font),
      helper: (name) => this.helpers.add(name),
      exactLineHeights: this.exactLineHeights,
    };
  }

  /** [v] with [node]'s text stroke: Figma strokes outside the glyphs, or half outside when centred. */
  textStroke(node, v) {
    const paints = visiblePaints(node.strokes);
    if (!paints.length || typeof node.strokeWeight !== 'number' || node.strokeWeight <= 0) return v;
    const top = paints[paints.length - 1];
    const align = node.strokeAlign || 'OUTSIDE';
    if (top.type !== 'SOLID' || align === 'INSIDE') {
      this.warn(node, `a text stroke ${top.type !== 'SOLID' ? 'that is not a solid colour' : 'inside the glyphs'} is not drawn`);
      return v;
    }
    if (paints.length > 1) this.warn(node, 'only the top text stroke paint is drawn');
    if (align === 'CENTER') this.warn(node, 'a centred text stroke is drawn outside the glyphs, at half its weight');
    const vars = node.vars || {};
    const paint = this.color(top.color, top.opacity ?? 1, vars[`stroke.${node.strokes.indexOf(top)}`] || vars.strokes);
    this.helpers.add('textStroke');
    return mod(v, 'textStroke', [[null, paint], ['width', round(align === 'CENTER' ? node.strokeWeight / 2 : node.strokeWeight)]]);
  }

  text(node, size, ctx = {}) {
    const segs = segmentsOf(node);
    segs.forEach((seg) => this.font(seg));
    let v = textView(node, { ...this.textCtx(node), bind: this.bindings.get(node.id) || null }).view;
    const input = !this.inComponent && this.inputs.get(node.id);
    if (input) v = this.textInput(node, input, v);
    else v = this.textStroke(node, v);
    // A control's label stays on one line (a scale factor would let stacks
    // shrink it before its siblings); other text wraps and grows with Dynamic Type.
    const roles = this.ancestors.map((a) => this.roleOf(a));
    const parent = this.ancestors[this.ancestors.length - 2];
    // A single word never breaks.
    const word = !/\s/.test(String(node.characters || '').trim());
    const control = roles.some((r) => CONTROLS.has(r));
    // Items drawn from data share one view: a value is one word when every item's is.
    const single = this.bindings.has(node.id) ? this.words.has(node.id) : word;
    // A layer placed freely is never offered its room by its frame, and a
    // text hugging its width never wraps in Figma: it takes its own size.
    if (ctx.kind === 'stack' && hugsWidth(node)) v = mod(v, 'fixedSize');
    else if (size.w === null && size.h === null && single && !control) v = mod(v, 'lineLimit', [[null, 1]]);
    else if (size.w === null && control && !/\n/.test(node.characters || '')) {
      v = mod(v, 'lineLimit', [[null, 1]]);
    } else if (size.h === null) {
      v = mod(v, 'fixedSize', [['horizontal', false], ['vertical', true]]);
      // In a row, text takes its width before the other items.
      if (size.w === null && parent && parent.layoutMode === 'HORIZONTAL') v = mod(v, 'layoutPriority', [[null, 1]]);
    }
    if (node.leadingTrim === 'CAP_HEIGHT') {
      // Figma trims the box to the cap height: it ends at the last baseline
      // and starts at the capitals' top, the box's height above it.
      const x = { LEFT: 'leading', CENTER: 'center', RIGHT: 'trailing' }[node.textAlignHorizontal] || 'leading';
      v = this.frame(v, { w: size.w, h: round(node.height) }, `.${x}LastTextBaseline`);
      return this.effects(node, v);
    }
    // Text in a box the design fixes (a control's label, a caption on a
    // fixed card) grows no further than the largest standard text size, as
    // Apple advises for space-limited UI; elsewhere text follows every size.
    // A control's label stops earlier, as system tab bars do; a long press
    // shows it enlarged (accessibilityShowsLargeContentViewer).
    if (!this.brand(node) && (control || this.boxed())) {
      v = mod(v, 'dynamicTypeSize', [[null, raw(control ? '...DynamicTypeSize.xLarge' : '...DynamicTypeSize.xxxLarge')]]);
    }
    const fixedBox = node.textAutoResize === 'NONE' || node.textAutoResize === 'TRUNCATE';
    const align = alignmentOf(TEXT_X[node.textAlignHorizontal] ?? 'leading', fixedBox ? TEXT_Y[node.textAlignVertical] ?? 'top' : '');
    v = this.frame(v, size, align);
    return this.effects(node, v);
  }

  line(node, size, line) {
    const w = line.weight;
    const ext = line.cap === 'NONE' ? 0 : w / 2;
    const paint = line.paint.type === 'SOLID'
      ? this.color(line.paint.color, line.paint.opacity ?? 1, line.varName)
      : gradient(line.paint, line.horizontal ? node.width : w, line.horizontal ? w : node.height, (c, o) => this.color(c, o));
    const shape = view(line.cap === 'ROUND' ? 'Capsule' : 'Rectangle');
    const along = line.horizontal ? size.w : size.h;
    const length = along === 'inf' ? 'inf' : round((line.horizontal ? node.width : node.height) + 2 * ext);
    const bar = this.frame(mod(shape, 'fill', [[null, paint]]), line.horizontal ? { w: length, h: w } : { w, h: length });
    // A Figma line takes no room across: the bar overflows a box of zero thickness.
    const box = this.frame(bar, line.horizontal ? { w: along ?? node.width, h: 0 } : { w: 0, h: along ?? node.height });
    return this.effects(node, box);
  }

  /**
   * An exported image drawn at its render bounds, which can exceed the
   * layer's box. The export already holds the layer's opacity and effects.
   */
  picture(node, size, bounds, image) {
    const b = bounds;
    const exact = !b || (Math.abs(b.x - node.x) < 0.01 && Math.abs(b.y - node.y) < 0.01 &&
      Math.abs(b.width - node.width) < 0.01 && Math.abs(b.height - node.height) < 0.01);
    if (exact) return this.frame(image, size);
    let inner = this.frame(image, { w: b.width, h: b.height });
    const dx = round(b.x - node.x);
    const dy = round(b.y - node.y);
    if (dx || dy) inner = mod(inner, 'offset', [['x', dx || null], ['y', dy || null]]);
    return this.frame(inner, { w: size.w ?? node.width, h: size.h ?? node.height }, '.topLeading');
  }

  /**
   * The SVG to ship for a layer: { text, tile }. An icon on a tile (a frame
   * with one colour fill around vectors) ships without the tile, which is
   * drawn in code so its colour can change with state.
   */
  svgSource(node) {
    const own = visiblePaints(node.fills);
    if (!['FRAME', 'INSTANCE', 'COMPONENT'].includes(node.type) || own.length !== 1 || own[0].type !== 'SOLID' ||
        visiblePaints(node.strokes).length) return { text: node.svg, tile: false };
    const m = /^(<svg[^>]*>\s*)(<(?:path|rect)\b[^>]*\bfill="([^"]+)"[^>]*\/>\s*)/.exec(node.svg);
    const hex = sColor(own[0].color, 1).match(/0x([0-9A-F]{6})/)[1];
    const drawn = m && (NAMED_COLORS[m[3].toLowerCase()] || m[3].replace(/^#/, '').toUpperCase());
    if (!m || drawn !== hex) return { text: node.svg, tile: false };
    return { text: m[1] + node.svg.slice(m[0].length), tile: true };
  }

  /** The asset name of a layer's SVG. */
  svgAsset(node) {
    return this.asset(this.assets.svg(this.svgSource(node).text), 'svg', this.label(node, 'icon'), 'svg');
  }

  /** The one solid colour vector layers are painted with (fills and strokes), or null. */
  tint(nodes) {
    const found = [];
    const walk = (n) => {
      if (!n || n.visible === false) return;
      const vars = n.vars || {};
      visiblePaints(n.fills).forEach((p, i) => found.push({ p, v: vars[`fill.${i}`] || null }));
      if (typeof n.strokeWeight !== 'number' || n.strokeWeight > 0) {
        visiblePaints(n.strokes).forEach((p, i) => found.push({ p, v: vars[`stroke.${i}`] || vars.strokes || null }));
      }
      (n.children || []).forEach(walk);
    };
    nodes.forEach(walk);
    if (!found.length || found.some(({ p }) => p.type !== 'SOLID')) return null;
    if (new Set(found.map(({ p }) => sColor(p.color, p.opacity ?? 1))).size !== 1) return null;
    const { p, v } = found.find((f) => f.v) || found[0];
    return this.color(p.color, p.opacity ?? 1, v);
  }

  svg(node, size) {
    if (node.illustrationGaps) {
      this.warn(node, `drawn as one image; ${node.illustrationGaps.length} of its layers came without their SVG and are missing ` +
        '(run the plugin again to export the illustration whole)');
    }
    const bound = this.bindings.get(node.id);
    const { tile } = this.svgSource(node);
    const name = bound ? raw(bound) : str(this.svgAsset(node));
    // A one-colour icon is tinted in code, so its colour can change with state.
    const bare = ['FRAME', 'INSTANCE', 'COMPONENT', 'GROUP'].includes(node.type);
    const plain = bare && !visiblePaints(node.fills).length && !visiblePaints(node.strokes).length;
    const tint = tile || plain ? (this.tint(visibleChildren(node)) || svgTint(this.svgSource(node).text, (c) => this.color(c)))
      : bare ? null : this.tint([node]);
    let image = mod(view('Image', [[null, name]]), 'resizable');
    if (tint) image = mod(mod(image, 'renderingMode', [[null, raw('.template')]]), 'foregroundStyle', [[null, tint]]);
    image = mod(image, 'accessibilityHidden', [[null, true]]);
    const b = node.svgBounds;
    const exact = !b || (Math.abs(b.width - node.width) < 0.01 && Math.abs(b.height - node.height) < 0.01);
    if (!tile && tint && exact && typeof size.w === 'number' && size.w === size.h && size.w <= 32) {
      // A glyph grows with the text beside it.
      const metric = raw(this.scaledMetric(size.w));
      return this.picture(node, { w: metric, h: metric }, null, image);
    }
    if (!tile) return this.picture(node, size, node.svgBounds, image);
    const shape = shapeOf(node, (v, n) => this.value(v, n));
    const fill = this.fillItems(node)[0];
    const back = mod(view('', [[null, shape]]), 'fill', [[null, fill.paint]]);
    return this.effects(node, this.frame(view('ZStack', [], [back, image]), { w: size.w ?? node.width, h: size.h ?? node.height }));
  }

  render(node, size) {
    if (!this.rasterized.some((r) => r.id === node.id)) this.rasterized.push({ id: node.id, name: node.name, reason: node.rasterized });
    const name = this.asset(this.assets.render(node.render), 'image', this.label(node, 'image'), 'png');
    const image = mod(mod(view('Image', [[null, str(name)]]), 'resizable'), 'accessibilityHidden', [[null, true]]);
    return this.picture(node, size, node.renderBounds, image);
  }

  /** Visible fills bottom to top: { paint } or { image }, each with its blend; solids over solids merged. */
  fillItems(node) {
    const vars = node.vars || {};
    const paints = (Array.isArray(node.fills) ? node.fills : [])
      .map((p, i) => ({ p, i })).filter(({ p }) => p && p.visible !== false);
    const blendOf = (p) => {
      const mode = blendMode(p.blendMode);
      if (mode === null) this.warn(node, `the ${p.blendMode.toLowerCase()} blend of a fill is drawn normal`);
      return mode && mode !== 'normal' ? mode : null;
    };
    const merged = [];
    for (const item of paints) {
      const last = merged[merged.length - 1];
      if (item.p.type === 'SOLID' && last && last.p.type === 'SOLID' && !blendOf(item.p) && !blendOf(last.p)) {
        const c = composite({ color: last.p.color, opacity: last.p.opacity ?? 1 }, { color: item.p.color, opacity: item.p.opacity ?? 1 });
        merged[merged.length - 1] = { p: { type: 'SOLID', color: c.color, opacity: 1 }, i: -1 };
      } else merged.push(item);
    }
    return merged.map(({ p, i }) => {
      let item = null;
      if (p.type === 'SOLID') item = { paint: this.color(p.color, p.opacity ?? 1, i >= 0 ? vars[`fill.${i}`] : null) };
      else if (String(p.type).startsWith('GRADIENT')) {
        item = { paint: gradient(p, node.width, node.height, (c, o) => this.color(c, o), (m) => this.warn(node, m)) };
      } else if (p.type === 'IMAGE') item = { image: p };
      const blend = item && blendOf(p);
      return item && blend ? { ...item, blend } : item;
    }).filter(Boolean);
  }

  /** A fill as a layer of [shape]'s size: a filled shape, or a clipped image. */
  fillLayer(node, item, shape) {
    let layer;
    if (item.paint) layer = mod(view('', [[null, shape]]), 'fill', [[null, item.paint]]);
    else layer = this.imageLayer(node, item.image, shape);
    if (layer && item.blend) layer = mod(layer, 'blendMode', [[null, raw(`.${item.blend}`)]]);
    return layer;
  }

  imageLayer(node, paint, shape) {
    const source = this.assets.image(paint.imageHash);
    if (!source) {
      this.warn(node, 'an image fill has no image data');
      return null;
    }
    const bound = this.bindings.get(node.id);
    const name = bound ? raw(bound)
      : str(this.asset(source, 'image', this.label(node, 'image'), this.assets.imageExt ? this.assets.imageExt(paint.imageHash) : 'png'));
    const image = view('Image', [[null, name]]);
    const clip = (v) => (isRectangle(shape) ? mod(v, 'clipped') : mod(v, 'clipShape', [[null, shape]]));
    if (paint.rotation) this.warn(node, 'a rotated image fill is drawn unrotated');
    let layer;
    if (paint.scaleMode === 'CROP' && Array.isArray(paint.imageTransform)) {
      const [[a, b, tx], [c, d, ty]] = paint.imageTransform;
      if (Math.abs(b) > 1e-6 || Math.abs(c) > 1e-6) this.warn(node, 'a turned image crop is drawn unturned');
      const W = node.width;
      const H = node.height;
      let img = mod(mod(image, 'resizable'), 'frame', [['width', round(W / a)], ['height', round(H / d)]]);
      const ox = round((-tx / a) * W);
      const oy = round((-ty / d) * H);
      if (ox || oy) img = mod(img, 'offset', [['x', ox || null], ['y', oy || null]]);
      layer = clip(mod(clear(), 'overlay', [['alignment', raw('.topLeading')]], [img]));
    } else if (paint.scaleMode === 'TILE') {
      if (paint.scalingFactor && paint.scalingFactor !== 1) this.warn(node, 'a scaled image tile is drawn at its own size');
      layer = clip(mod(image, 'resizable', [['resizingMode', raw('.tile')]]));
    } else if (paint.scaleMode === 'FIT') {
      layer = mod(mod(image, 'resizable'), 'scaledToFit');
    } else {
      layer = clip(mod(clear(), 'overlay', [], [mod(mod(image, 'resizable'), 'scaledToFill')]));
    }
    if (paint.opacity !== undefined && paint.opacity < 1) layer = mod(layer, 'opacity', [[null, round(paint.opacity)]]);
    if (this.heroPhotos && this.heroPhotos.has(node.id) && !this.inComponent) {
      this.helpers.add('stretchy');
      layer = mod(layer, 'stretchesOnPull');
    }
    return mod(layer, 'accessibilityHidden', [[null, true]]);
  }

  /** The node's strokes as an overlay view, or null. */
  stroke(node, shape) {
    const paints = visiblePaints(node.strokes);
    if (!paints.length) return null;
    const sides = sideWeights(node);
    if (!sides.some((s) => s > 0)) return null;
    const vars = node.vars || {};
    const top = paints[paints.length - 1];
    const index = node.strokes.indexOf(top);
    let paint;
    if (top.type === 'SOLID') paint = this.color(top.color, top.opacity ?? 1, vars[`stroke.${index}`] || vars.strokes);
    else if (String(top.type).startsWith('GRADIENT')) {
      paint = gradient(top, node.width, node.height, (c, o) => this.color(c, o), (m) => this.warn(node, m));
    } else return null;
    if (paints.length > 1) this.warn(node, 'only the top stroke paint is drawn');
    const align = node.strokeAlign || 'INSIDE';
    if (!sides.every((s) => s === sides[0])) {
      // Sides of different weights: a bar along each side inside the box.
      if (!isRectangle(shape)) this.warn(node, 'strokes of different weights are drawn as straight bars');
      if (align !== 'INSIDE') this.warn(node, `${align.toLowerCase()} strokes of different weights are drawn inside`);
      const bar = (edge, weight, horizontal) => mod(this.frame(mod(view('Rectangle'), 'fill', [[null, paint]]),
        horizontal ? { w: 'inf', h: weight } : { w: weight, h: 'inf' }), 'frame', [
        [horizontal ? 'maxHeight' : 'maxWidth', INFINITY], ['alignment', raw(`.${edge}`)],
      ]);
      const bars = [];
      if (sides[0]) bars.push(bar('top', sides[0], true));
      if (sides[1]) bars.push(bar('trailing', sides[1], false));
      if (sides[2]) bars.push(bar('bottom', sides[2], true));
      if (sides[3]) bars.push(bar('leading', sides[3], false));
      return view('ZStack', [], bars);
    }
    const w = round(sides[0]);
    const dashes = Array.isArray(node.dashPattern) && node.dashPattern.length ? node.dashPattern.map(round) : null;
    const width = dashes
      ? ['style', call('StrokeStyle', [['lineWidth', w], ['dash', array(dashes)]])]
      : ['lineWidth', w];
    const base = view('', [[null, align === 'OUTSIDE' ? mod(shape, 'inset', [['by', -w]]) : shape]]);
    return mod(base, align === 'CENTER' ? 'stroke' : 'strokeBorder', [[null, paint], width]);
  }

  box(node, size, { content: given = null } = {}) {
    const shape = shapeOf(node, (v, name) => this.value(v, name));
    const fills = this.fillItems(node);
    const drops = effectsOf(node, 'DROP_SHADOW');
    const inners = effectsOf(node, 'INNER_SHADOW');
    const fx = blurs(node);
    const content = given || this.content(node);
    const layers = [];
    if (fx.background) {
      this.warn(node, 'the background blur is drawn as a material');
      layers.push(mod(view('', [[null, shape]]), 'fill', [[null, raw('.ultraThinMaterial')]]));
    }
    const fillLayers = fills.map((item, i) => {
      // Inner shadows lie on the top fill.
      if (i === fills.length - 1 && inners.length && item.paint) {
        const paint = inners.reduce((p, e) => mod(p, 'shadow', [[null, call('.inner', shadowArgs(e, (c) => this.color(c)))]]), item.paint);
        return this.fillLayer(node, { ...item, paint }, shape);
      }
      return this.fillLayer(node, item, shape);
    }).filter(Boolean);
    if (inners.length && !(fills.length && fills[fills.length - 1].paint)) this.warn(node, 'an inner shadow needs a colour fill on top and is not drawn');
    if (drops.some((e) => e.spread)) this.warn(node, 'the spread of a drop shadow is not drawn');
    if (inners.some((e) => e.spread)) this.warn(node, 'the spread of an inner shadow is not drawn');
    let shadowed = false;
    if (fillLayers.length && drops.length) {
      // Each shadow lies under its own copy of the bottom fill, so shadows
      // do not shadow each other.
      const base = fillLayers[0];
      const copies = drops.map((e) => mod(base, 'shadow', shadowArgs(e, (c) => this.color(c))));
      fillLayers.splice(0, 1, ...copies);
      shadowed = true;
    }
    layers.push(...fillLayers);
    const stroke = this.stroke(node, shape);
    let v;
    const leaf = !content.view;
    if (leaf) {
      v = layers.length === 1 ? layers[0] : layers.length ? view('ZStack', [], layers) : clear();
      v = this.frame(v, { w: size.w ?? node.width, h: size.h ?? node.height });
    } else {
      v = content.view;
      if (content.padding) v = padded(v, content.padding);
      // A box of text grows with it, unless layers pinned to its bottom or
      // centre would then stretch it to all the room it is offered.
      const placed = isAutoLayout(node) ? visibleChildren(node).filter((c) => !inFlow(c, node)) : visibleChildren(node);
      const grows = typeof size.h === 'number' && hasText(node) && placed.every((c) => this.stackPlacement(c, node).v.mode === 'min') &&
        this.fitsHeight(node);
      if (!isAutoLayout(node) && !grows && !content.padding && v.name === 'ZStack' && Array.isArray(v.body)) {
        // Children never size a frame without auto layout: its layers lie
        // over a box of its size, so a large or far one cannot stretch the
        // layers that fill.
        v = this.layers(this.layerBox(node, size), v.body);
      } else v = this.frame(v, grows ? { ...size, h: { min: size.h } } : size, content.align, node.clipsContent);
      if (node.clipsContent) {
        // Figma clips the children, not the frame's own fills and shadows.
        const topLeading = [['alignment', raw('.topLeading')]];
        if (content.underlay) v = mod(v, 'background', topLeading, [content.underlay]);
        if (content.overlay) v = mod(v, 'overlay', topLeading, [content.overlay]);
        v = isRectangle(shape) ? mod(v, 'clipped') : mod(v, 'clipShape', [[null, shape]]);
        // Several layers go in a ZStack: a background aligns its content as a
        // whole, and stacks the views inside it centred.
        if (layers.length) v = mod(v, 'background', [], layers.length > 1 ? [view('ZStack', topLeading, layers)] : layers);
      } else {
        if (content.underlay) layers.push(content.underlay);
        if (layers.length) {
          v = mod(v, 'background', [], layers.length > 1 ? [view('ZStack', [['alignment', raw('.topLeading')]], layers)] : layers);
        }
        if (content.overlay) v = mod(v, 'overlay', [['alignment', raw('.topLeading')]], [content.overlay]);
      }
    }
    if (stroke) v = mod(v, 'overlay', [], [stroke]);
    if (drops.length && !shadowed) {
      // Without a fill, the content casts the shadow.
      if (drops.length > 1) this.warn(node, 'drop shadows of a box without a fill shadow each other');
      for (const e of drops) v = mod(v, 'shadow', shadowArgs(e, (c) => this.color(c)));
    }
    return this.effects(node, v);
  }

  effects(node, v) {
    let out = v;
    const fx = blurs(node);
    if (fx.layer) out = mod(out, 'blur', [['radius', swiftBlur(fx.layer)]]);
    if (typeof node.opacity === 'number' && node.opacity < 1) {
      out = mod(out, 'opacity', [[null, this.value(node.opacity, node.vars && node.vars.opacity)]]);
    }
    const mode = blendMode(node.blendMode);
    if (mode === null) this.warn(node, `the ${node.blendMode.toLowerCase()} blend of the layer is drawn normal`);
    else if (mode !== 'normal') out = mod(out, 'blendMode', [[null, raw(`.${mode}`)]]);
    return out;
  }

  /**
   * A phone screen as an app screen: the design's status bar and home
   * indicator are left to the phone, a top bar and a bottom bar (tab bar,
   * action footer, input bar) stay put while the rest scrolls, and layers
   * Figma keeps fixed when scrolling float over it. Freely placed layers
   * become a column (see page).
   */
  screenRoot(node) {
    this.scrolls = ['VERTICAL', 'BOTH'].includes(node.overflowDirection) || node.height > TALL_SCREEN;
    const chrome = systemUi(node);
    chrome.forEach((c) => this.skip.add(c.id));
    const statusBottom = Math.max(0, ...chrome.filter((c) => c.kind === 'status bar').map((c) => c.box[1] + c.box[3]));
    const indicator = chrome.some((c) => c.kind === 'home indicator');
    const W = node.width;
    const H = node.height;
    // Where the app's own layers end: above a home indicator layer of its own.
    const floor = Math.min(H, ...chrome.filter((c) => c.kind === 'home indicator' && c.box[1] + c.box[3] >= H - 2).map((c) => c.box[1]));
    // A full-width image section from the screen's top edge (a hero photo)
    // runs on under the status bar: it keeps its room, and the page starts
    // at the top of the screen.
    const photo = (c) => hasImageFill(c) || visibleChildren(c).some((k) => hasImageFill(k) && k.width >= W * 0.95);
    let shown = (node.children || []).filter((c) => c.visible !== false && !this.skip.has(c.id));
    // A modal: a see-through layer over the whole screen (a scrim) and what
    // lies above it (a sheet, a dialog) cover the screen, its bars included.
    const scrimAt = shown.findIndex((c, i) => i > 0 && isScrim(c, W, H));
    const modal = scrimAt > 0 ? shown.slice(scrimAt) : [];
    if (modal.length) shown = shown.slice(0, scrimAt);
    const bleedHero = statusBottom > 0 ? shown.find((c) => c.width >= W * 0.95 && c.y - node.y <= 0.5 && c.height > statusBottom * 2 && photo(c) &&
      (!isAutoLayout(node) || shown.filter((k) => inFlow(k, node))[0] === c)) : null;
    const all = shown.map((c) => (c === bleedHero ? c : withoutSystemUi(c, node, chrome)));
    // The hero's photo stretches when the page is pulled down past its top.
    if (bleedHero) {
      this.heroPhotos = new Set([bleedHero, ...visibleChildren(bleedHero)].filter((c) => hasImageFill(c) && c.width >= W * 0.95).map((c) => c.id));
    }
    const rel = (c) => ({ top: c.y - node.y, bottom: c.y - node.y + c.height });
    const filled = (c) => visiblePaints(c.fills).length > 0;
    const wide = (c) => c.width >= W * 0.95;
    const flowRoot = isAutoLayout(node);
    const kids = flowRoot ? all.filter((c) => inFlow(c, node)) : all;
    // A bar: a full-width layer at the top under the status bar, or at the bottom.
    const atTop = (c) => wide(c) && c.height <= 140 && Math.abs(rel(c).top - statusBottom) <= 4 && (!flowRoot || c === kids[0]);
    // A header on a hero (no fill of its own) pins too, taking the hero's paint once the page scrolls.
    const topBar = kids.find((c) => atTop(c) && filled(c)) ||
      kids.find((c) => atTop(c) && /header|app ?bar|nav|top ?bar|toolbar/i.test(c.name) && visibleChildren(c).length);
    const hero = topBar && !filled(topBar)
      ? all.find((c) => c !== topBar && wide(c) && rel(c).top <= rel(topBar).top && rel(c).bottom >= rel(topBar).bottom && filled(c))
      : null;
    // In a column the last section, or an absolute bar anchored to the bottom.
    const anchored = (c) => !inFlow(c, node) && c.constraints && c.constraints.vertical === 'MAX';
    // A shade with layers drawn over it (tabs on a gradient) is their backdrop, not a bar above the page.
    const inside = (k, c) => k.x >= c.x - 1 && k.y >= c.y - 1 && k.x + k.width <= c.x + c.width + 1 && k.y + k.height <= c.y + c.height + 1;
    const backdrop = (c) => !visibleChildren(c).length && all.slice(all.indexOf(c) + 1).some((k) => inside(k, c));
    const bottoms = (flowRoot ? [...kids, ...all.filter(anchored)] : kids).filter((c) => c !== topBar && wide(c) && c.height <= 160 &&
      rel(c).bottom >= floor - 2 && (filled(c) || /tab ?bar|footer|bottom|nav|input ?bar|composer|toolbar/i.test(c.name)) &&
      (!flowRoot || c === kids[kids.length - 1] || anchored(c)) && !backdrop(c));
    const bottomBar = bottoms.sort((a, b) => rel(b).top - rel(a).top)[0] || null;
    // Figma fixes the topmost layers when scrolling; in a column only absolute ones can be.
    const fixedCount = Math.max(0, Math.min(node.numberOfFixedChildren || 0, (node.children || []).length));
    const fixed = new Set((node.children || []).slice((node.children || []).length - fixedCount)
      .filter((c) => !flowRoot || !inFlow(c, node)).map((c) => c.id));
    // Floating controls pinned to the bottom (a map toggle, a button) stay over the content.
    const loose = flowRoot ? all.filter((c) => !inFlow(c, node)) : all;
    const floating = loose.filter((c) => c !== bottomBar && c !== topBar && !wide(c) &&
      ((c.constraints && c.constraints.vertical === 'MAX') || fixed.has(c.id)) && rel(c).top > H / 2);
    const pinned = loose.filter((c) => fixed.has(c.id) && c !== topBar && c !== bottomBar && !floating.includes(c));
    const bleeds = Boolean(bleedHero) && !topBar;
    const top = topBar ? rel(topBar).bottom : bleeds ? 0 : statusBottom;
    // The phone keeps its own room for the home indicator under a bottom bar that runs to the screen's edge.
    const inset = indicator || (bottomBar && rel(bottomBar).bottom >= H - 2 && bottomBar.height > 70) ? 34 : 0;
    const bottom = bottomBar ? H - rel(bottomBar).top : H - floor + (floor < H ? 0 : inset);
    // Layers drawn apart from the page: skipped there, drawn here.
    const apart = (c, ctx) => {
      this.skip.delete(c.id);
      try {
        return this.node(c, ctx);
      } finally {
        this.skip.add(c.id);
      }
    };
    const bar = (c, cut) => {
      let v = apart(c, { kind: 'bar', parent: node });
      if (v && cut) v = mod(v, 'frame', [['height', round(c.height - cut)], ['alignment', raw('.top')]]);
      return v;
    };
    [topBar, bottomBar, ...floating, ...pinned].forEach((c) => c && this.skip.add(c.id));
    let page;
    if (flowRoot) {
      // The column without the status bar and the bars, as the content.
      const inner = { ...node, paddingTop: bleeds ? node.paddingTop || 0 : Math.max(0, (node.paddingTop || 0) - statusBottom), paddingBottom: 0 };
      page = this.box({ ...inner, fills: [], effects: [], strokes: [] }, { w: 'inf', h: null });
    } else {
      page = this.page(node, all.filter((c) => !this.skip.has(c.id)), top, H - bottom);
    }
    let header = topBar ? bar(topBar, 0) : null;
    const topPaint = topBar && filled(topBar) && this.fillItems(topBar).find((f) => f.paint);
    if (topPaint && topBar.y > (node.children || []).find((c) => c.id === topBar.id).y) {
      // A header drawn with the status bar runs on under it.
      header = mod(header, 'background', [], [mod(view('', [[null, mod(view('Rectangle'), 'fill', [[null, topPaint.paint]])]]),
        'ignoresSafeArea', [['edges', raw('.top')]])]);
    }
    if (topBar && !filled(topBar)) {
      // Like a pinned sliver app bar: clear over the hero, then filled once scrolled.
      const scrolled = this.member('scrolled', 'scrolled');
      this.states.push(`  @State private var ${scrolled} = false`);
      page = mod(page, 'onGeometryChange', [
        ['for', raw('Bool.self')], ['of', raw('{ $0.frame(in: .scrollView).minY < -4 }')], ['action', raw(`{ ${scrolled} = $0 }`)],
      ]);
      const paint = (hero && this.fillItems(hero).find((f) => f.paint)) || this.fillItems(node).find((f) => f.paint);
      if (paint) {
        header = mod(header, 'background', [], [mod(mod(view('', [[null, mod(view('Rectangle'), 'fill', [[null, paint.paint]])]]),
          'opacity', [[null, raw(`${scrolled} ? 1 : 0`)]]), 'ignoresSafeArea')]);
        header = mod(header, 'animation', [[null, raw('.easeOut(duration: 0.2)')], ['value', raw(scrolled)]]);
      }
    }
    // A screen of data stands in placeholders while the owner loads it.
    if (this.models.length) {
      this.loading = true;
      this.helpers.add('shimmer');
      page = mod(page, 'shimmer', [[null, raw('isLoading')]]);
    }
    let out = mod(view('ScrollView', [], [page]), 'scrollBounceBehavior', [[null, raw('.basedOnSize')]]);
    // Pulled down, a screen of data asks its owner to load it again.
    if (this.loading && this.scrolls) out = mod(out, 'refreshable', [], [raw('await refresh()')]);
    if (bleeds) out = mod(out, 'ignoresSafeArea', [['edges', raw('.top')]]);
    // The visible height, for a page whose bottom layers stay at the bottom.
    if (this.viewport) out = view('GeometryReader', [], [out], 'proxy');
    if (header) out = mod(out, 'safeAreaInset', [['edge', raw('.top')], ['spacing', 0]], [header]);
    if (bottomBar) {
      let footer = bar(bottomBar, rel(bottomBar).bottom >= H - 2 ? inset : 0);
      const screenPaint = this.fillItems(node).find((f) => f.paint);
      if (!filled(bottomBar) && screenPaint) {
        // A bar without a fill of its own takes the screen's, so the content scrolls under it unseen.
        footer = mod(footer, 'background', [], [mod(view('', [[null, mod(view('Rectangle'), 'fill', [[null, screenPaint.paint]])]]),
          'ignoresSafeArea', [['edges', raw('.bottom')]])]);
      }
      out = mod(out, 'safeAreaInset', [['edge', raw('.bottom')], ['spacing', 0]], [footer]);
    }
    const over = [...floating, ...pinned].map((c) => apart(c, { kind: 'stack', parent: { ...node, height: H - inset } })).filter(Boolean);
    if (over.length) out = mod(out, 'overlay', [['alignment', raw('.topLeading')]], [view('ZStack', [['alignment', raw('.topLeading')]], over)]);
    if (modal.length) {
      // Placed on the whole screen as in the design, over the bars and the phone's own room.
      const layers = modal.map((c) => withoutSystemUi(c, node, chrome)).map((c) => apart(c, { kind: 'stack', parent: node })).filter(Boolean);
      out = mod(out, 'overlay', [['alignment', raw('.topLeading')]], [mod(this.layers(clear(), layers), 'ignoresSafeArea')]);
    }
    this.skip = new Set(chrome.map((c) => c.id));
    const fill = this.fillItems(node).find((f) => f.paint);
    if (fill) out = mod(out, 'background', [[null, fill.paint]]);
    return out;
  }

  /**
   * The page of a screen whose layers are placed freely, between [top] and
   * [end] (from the screen's top), as a column: the sections down the page
   * follow each other with the design's gaps, so text that grows pushes
   * what is below it down. Leaf layers lying behind sections (a hero, a
   * glow) are the page's background, a small layer on a section is that
   * section's overlay, layers side by side or overlapping keep their places
   * in a ZStack, and on a screen that does not scroll, sections anchored to
   * the bottom stay at the bottom of a taller phone.
   */
  page(node, layers, top, end) {
    const area = { ...node, y: node.y + top, height: Math.max(1, end - top), fills: [], children: node.children };
    this.screen = area;
    const box = (c) => ({ top: c.y - area.y, bottom: c.y - area.y + c.height, left: c.x - node.x, right: c.x - node.x + c.width });
    const overlapsY = (a, b) => box(a).top < box(b).bottom - 0.5 && box(b).top < box(a).bottom - 0.5;
    const overlapsX = (a, b) => box(a).left < box(b).right - 0.5 && box(b).left < box(a).right - 0.5;
    const leaf = (c) => !isText(c) && !visibleChildren(c).length;
    const order = (c) => (node.children || []).findIndex((k) => k.id === c.id);
    const behind = (c) => layers.find((o) => o !== c && !leaf(o) && overlapsY(c, o) && overlapsX(c, o));
    const decor = layers.filter((c) => leaf(c) && (box(c).top < 0 || behind(c)));
    // Biggest first, so a layer's host is placed before it.
    const rest = layers.filter((c) => !decor.includes(c)).sort((a, b) => b.width * b.height - a.width * a.height);
    const floats = new Map();
    const sections = [];
    for (const c of rest) {
      const host = sections.find((o) => box(o).top <= box(c).top + 0.5 && box(o).bottom >= box(c).bottom - 0.5 && overlapsX(c, o) &&
        o.width * o.height > 2 * c.width * c.height);
      if (host) floats.set(host.id, [...(floats.get(host.id) || []), c]);
      else sections.push(c);
    }
    sections.sort((a, b) => box(a).top - box(b).top || order(a) - order(b));
    // Sections that overlap more than a little share a band.
    const bands = [];
    const bandTop = (b) => Math.min(...b.map((c) => box(c).top));
    const bandBottom = (b) => Math.max(...b.map((c) => box(c).bottom));
    for (const c of sections) {
      const last = bands[bands.length - 1];
      if (last && bandBottom(last) - box(c).top > Math.min(16, 0.25 * Math.min(c.height, ...last.map((x) => x.height)))) last.push(c);
      else bands.push([c]);
    }
    const drawBand = (band) => {
      if (band.length === 1) {
        const [c] = band;
        let v = this.node(c, { kind: 'page', parent: area });
        const over = (floats.get(c.id) || []).sort((a, b) => order(a) - order(b))
          .map((f) => this.node(f, { kind: 'stack', parent: { ...area, y: c.y, height: c.height } })).filter(Boolean);
        if (v && over.length) v = mod(v, 'overlay', [['alignment', raw('.topLeading')]], [view('ZStack', [['alignment', raw('.topLeading')]], over)]);
        return v;
      }
      const parent = { ...area, y: area.y + bandTop(band), height: bandBottom(band) - bandTop(band) };
      const members = [...band, ...band.flatMap((c) => floats.get(c.id) || [])].sort((a, b) => order(a) - order(b));
      const spread = this.spreadGroup(members, area);
      const items = [];
      for (const c of members) {
        if (spread && spread.includes(c)) {
          if (c === members.find((m) => spread.includes(m))) items.push(this.spreadRow(spread, parent));
          continue;
        }
        const v = this.node(c, { kind: 'stack', parent });
        if (v) items.push(v);
      }
      // The band takes the screen's width: a layer past it does not widen the page.
      return mod(view('ZStack', [['alignment', raw('.topLeading')]], items), 'frame', [
        ['minWidth', 0], ['maxWidth', INFINITY], ['minHeight', round(parent.height)], ['alignment', raw('.topLeading')],
      ]);
    };
    // On a screen that does not scroll, the last sections anchored to the bottom stay there.
    let split = bands.length;
    if (!this.scrolls) {
      while (split > 0 && bands[split - 1].every((c) => c.constraints && c.constraints.vertical === 'MAX' && box(c).top > area.height / 2)) split--;
    }
    const gaps = bands.map((b, i) => round(i ? bandTop(b) - bandBottom(bands[i - 1]) : bandTop(b)));
    const between = gaps.slice(1).filter((g, i) => i + 1 !== split);
    const count = (g) => between.filter((x) => x === g).length;
    const common = between.length ? between.reduce((a, b) => (count(b) > count(a) || (count(b) === count(a) && b < a) ? b : a)) : 0;
    const spacing = Math.max(0, between.some((g) => g < common) ? Math.min(...between) : common);
    const items = [];
    // Later rows draw over earlier ones; where Figma stacks a lower section
    // over a higher one (a badge over a logo), rows take Figma's order.
    const tops = bands.map((b) => Math.max(...[...b, ...b.flatMap((c) => floats.get(c.id) || [])].map(order)));
    const reordered = tops.some((t, i) => i && t < tops[i - 1]);
    const ranks = [...tops].sort((a, b) => a - b);
    const stickies = new Set();
    bands.forEach((band, i) => {
      let v = drawBand(band);
      if (!v) return;
      if (reordered) v = mod(v, 'zIndex', [[null, ranks.indexOf(tops[i])]]);
      let gap = i ? gaps[i] - spacing : gaps[i];
      if (i === split) {
        this.viewport = 'proxy.size.height';
        // The column's spacing lies on both sides of the spacer.
        const room = gaps[i] - (i ? 2 : 1) * spacing;
        items.push(view('Spacer', [['minLength', Math.max(0, room)]]));
        gap = Math.min(0, room);
      }
      if (gap) v = mod(v, 'padding', [[null, raw('.top')], [null, gap]]);
      // A section Figma keeps stuck to the top while the page scrolls.
      if (this.scrolls && band.length === 1 && band[0].scrollBehavior === 'STICKY_SCROLLS') {
        const paint = !visiblePaints(band[0].fills).length && this.fillItems(node).find((f) => f.paint);
        if (paint) v = mod(v, 'background', [], [mod(view('Rectangle'), 'fill', [[null, paint.paint]])]);
        stickies.add(items.length);
      }
      items.push(v);
    });
    const last = bands.length ? round(area.height - bandBottom(bands[bands.length - 1])) : 0;
    let page;
    if (stickies.size) {
      // Pinned section headers: each sticky section heads what follows it.
      const out = [];
      let section = null;
      items.forEach((v, i) => {
        if (stickies.has(i)) {
          section = { header: v, body: [] };
          out.push(section);
        } else if (section) section.body.push(v);
        else out.push(v);
      });
      const rows = out.map((x) => (x.header ? trailing(view('Section', [], x.body), 'header', [x.header]) : x));
      page = view('LazyVStack', [['alignment', raw('.leading')], ['spacing', spacing], ['pinnedViews', raw('[.sectionHeaders]')]], rows);
    } else page = view('VStack', [['alignment', raw('.leading')], ['spacing', spacing]], items);
    if (last > 0) page = mod(page, 'padding', [[null, raw('.bottom')], [null, last]]);
    page = this.viewport
      ? mod(page, 'frame', [['maxWidth', INFINITY], ['minHeight', raw(this.viewport)], ['alignment', raw('.topLeading')]])
      : mod(page, 'frame', [['maxWidth', INFINITY], ['alignment', raw('.topLeading')]]);
    // Decor before the sections it lies on is drawn behind them, the rest over them.
    const ctx = { kind: 'stack', parent: area };
    const drawDecor = (c) => {
      // A background that runs to the top edge runs on under the status bar.
      // Only flat colour stretches; an image or gradient would change its crop or its stops.
      const flat = !visibleChildren(c).length && visiblePaints(c.fills).length && visiblePaints(c.fills).every((f) => f.type === 'SOLID');
      if (flat && c.y - node.y <= 0 && c.width >= node.width * 0.95) return this.node({ ...c, y: c.y - 200, height: c.height + 200 }, ctx);
      return this.node(c, ctx);
    };
    const under = decor.filter((c) => !behind(c) || order(c) < order(behind(c))).map(drawDecor).filter(Boolean);
    const above = decor.filter((c) => behind(c) && order(c) > order(behind(c))).map(drawDecor).filter(Boolean);
    // Decor lies over a clear box of the page's size, so a layer reaching
    // past the page's edge does not widen what fills it.
    const layer = (items) => this.layers(clear(), items);
    if (under.length) page = mod(page, 'background', [['alignment', raw('.topLeading')]], [layer(under)]);
    if (above.length) page = mod(page, 'overlay', [['alignment', raw('.topLeading')]], [mod(layer(above), 'allowsHitTesting', [[null, false]])]);
    return page;
  }

  /** The children's layout: { view, padding, align, overlay } for the box to frame. */
  content(node) {
    const children = visibleChildren(node);
    if (isAutoLayout(node)) return this.flex(node, children);
    if (!children.length) return { view: null, padding: null, align: null, overlay: null };
    if (isGrid(node)) this.warn(node, 'a grid is rebuilt with absolute positions');
    const items = children.map((c) => this.node(c, { kind: 'stack', parent: node })).filter(Boolean);
    return {
      view: view('ZStack', [['alignment', raw('.topLeading')]], items), padding: null, align: '.topLeading', overlay: null,
    };
  }

  /**
   * Whether [node]'s content fits its design height: a box whose content
   * already overflows it in the design keeps its height, as Figma does.
   */
  fitsHeight(node) {
    const kids = visibleChildren(node);
    if (!isAutoLayout(node)) return kids.every((c) => c.y + c.height <= node.y + node.height + 0.5);
    const flow = kids.filter((c) => inFlow(c, node));
    const [top, , bottom] = this.paddingValues(node);
    const content = node.layoutMode === 'VERTICAL'
      ? flow.reduce((t, c) => t + c.height, 0) + (node.primaryAxisAlignItems === 'SPACE_BETWEEN' ? 0 : (node.itemSpacing || 0) * Math.max(0, flow.length - 1))
      : Math.max(0, ...flow.map((c) => c.height));
    return top + content + bottom <= node.height + 0.5;
  }

  /** Padding (top, right, bottom, left), with the strokes when they are part of the layout. */
  paddingValues(node) {
    const extra = node.strokesIncludedInLayout && visiblePaints(node.strokes).length
      ? ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight']
        .map((k) => (typeof node[k] === 'number' ? node[k] : typeof node.strokeWeight === 'number' ? node.strokeWeight : 0))
      : [0, 0, 0, 0];
    return ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map((k, i) => round((node[k] || 0) + extra[i]));
  }

  /**
   * Content larger than a fixed frame overflows it in Figma; a SwiftUI
   * stack would grow its frame instead, so the content is laid over a
   * clear box of the frame's size, which keeps Figma's alignment.
   */
  overflow(node, flow, v, { row, hugMain, hugCross, crossFill, spacing, between, align }) {
    if (!flow.length) return v;
    const axis = row ? 'x' : 'y';
    const cross = row ? 'y' : 'x';
    const [top, right, bottom, left] = this.paddingValues(node);
    const size = (c, a) => (a === 'x' ? c.width : c.height) || 0;
    const availMain = row ? node.width - left - right : node.height - top - bottom;
    const availCross = row ? node.height - top - bottom : node.width - left - right;
    const mainFill = flow.some((c) => sizingOf(c, node, axis) === 'FILL');
    const mainTotal = flow.reduce((t, c) => t + size(c, axis), 0) + (between ? 0 : spacing * (flow.length - 1));
    const crossMax = Math.max(...flow.map((c) => size(c, cross)));
    // A frame of fixed size does not grow with what overflows it.
    const parent = this.ancestors[this.ancestors.length - 2];
    const grows = (a) => ownSizing(node, a) !== 'FIXED' || !parent || Boolean(this.screen && parent.id === this.screen.id);
    const overMain = !hugMain && !mainFill && grows(axis) && mainTotal > availMain + 0.5;
    const overCross = !hugCross && !crossFill.some(Boolean) && grows(cross) && crossMax > availCross + 0.5;
    if (!overMain && !overCross) return v;
    // On an axis the frame hugs, the box keeps the design's size.
    const inner = { x: round(node.width - left - right), y: round(node.height - top - bottom) };
    const hugged = (a) => (a === axis ? hugMain : hugCross);
    const box = this.frame(clear(), { w: hugged('x') ? inner.x : null, h: hugged('y') ? inner.y : null });
    return mod(box, 'overlay', align && align !== '.center' ? [['alignment', raw(align)]] : [], [v]);
  }

  /**
   * A run of layers built the same way as a ForEach over data: a model
   * struct with what differs between them, a view struct drawn from the
   * first, and when one item is drawn differently, a selection state. By
   * the run's role the items are Buttons that select (with a sliding
   * indicator for a tab bar or segmented control) or fire an action.
   * Null when the items differ in more than values.
   */
  repeated(items, ctx, spread) {
    const parent = ctx.parent;
    const kind = this.roleOf(parent);
    const fields = fieldsOf(items);
    const idents = new Set();
    for (const f of fields) {
      let id = sIdent(f.name || f.role, f.kind);
      for (let i = 2; idents.has(id); i++) id = `${sIdent(f.name || f.role, f.kind)}${i}`;
      idents.add(id);
      f.ident = id;
    }
    // Items showing the screen's state (the selected date) are drawn one by one, bound to it.
    if (fields.some((f) => f.nodes.some((n) => this.bindings.has(n.id)))) return null;
    const role = this.roles.get(parent.id);
    const cell = kind === 'grid';
    const render = (n) => {
      const index = items.indexOf(n);
      const saved = { actions: this.actions, inComponent: this.inComponent };
      for (const f of fields) {
        this.bindings.set(f.nodes[index].id, `item.${f.ident}`);
        if (f.values && f.values.every((x) => !/\s/.test(String(x).trim()))) this.words.add(f.nodes[index].id);
      }
      this.actions = {};
      this.inComponent = true;
      if (cell) this.stretchCells.add(n.id);
      try {
        return this.node(n, cell ? { kind: 'cell', parent } : ctx);
      } finally {
        Object.assign(this, saved);
        for (const f of fields) this.bindings.delete(f.nodes[index].id);
      }
    };
    if (this.probe && !this.inComponent) {
      items.forEach((item, i) => {
        const pair = (a, b) => {
          if (!a || !b || a.visible === false) return;
          this.probeAlias.set(a.id, b.id);
          this.probeIds[`${i}#${b.id}`] = a.id;
          const ka = visibleChildren(a);
          const kb = visibleChildren(b);
          ka.forEach((c, j) => pair(c, kb[j]));
        };
        pair(item, items[0]);
      });
    }
    const screenMetrics = this.metrics;
    this.metrics = new Map();
    const trees = items.map(render);
    const itemMetrics = [...this.metrics.values()];
    this.metrics = screenMetrics;
    const codes = trees.map((t) => (t ? print(t, 2) : ''));
    const kinds = [...new Set(codes)];
    let body;
    let selected = -1;
    let indicator = null;
    if (kinds.length === 1) body = codes[0];
    else if (kinds.length === 2) {
      // Only a control's items select; other items drawn two ways are drawn one by one.
      if (!SELECTABLE.has(kind)) return null;
      const counts = kinds.map((k) => codes.filter((c) => c === k).length);
      const given = role && typeof role.selected === 'number' && role.selected >= 0 && role.selected < items.length ? role.selected : -1;
      const odd = given >= 0 ? kinds.indexOf(codes[given]) : counts[0] === 1 ? 0 : counts[1] === 1 ? 1 : -1;
      if (odd < 0 || counts[odd] !== 1) return null;
      selected = codes.indexOf(kinds[odd]);
      const on = trees[selected];
      const off = trees[codes.indexOf(kinds[1 - odd])];
      const options = { tokenType: (ident) => this.tokenType(ident) };
      const split = kind === 'tabBar' || kind === 'segmented' ? indicatorOf(on, off, options) : null;
      const merged = split ? mergeTrees(split.on, split.off, options) : mergeTrees(on, off, options);
      if (split && merged) indicator = split.indicator;
      if (merged) body = print(merged, 2);
      else {
        const indent = (code) => code.split('\n').map((l, i) => (i ? `  ${l}` : l)).join('\n');
        body = `if isSelected {\n      ${indent(kinds[odd])}\n    } else {\n      ${indent(kinds[1 - odd])}\n    }`;
      }
    } else return null;
    // Values, with the asset name of each image.
    for (const f of fields) {
      if (f.kind === 'icon') f.values = f.nodes.map((n) => this.svgAsset(n));
      if (f.kind === 'image') {
        f.values = f.nodes.map((n) => {
          const p = n.fills.find((x) => x && x.visible !== false && x.type === 'IMAGE');
          const source = this.assets.image(p.imageHash);
          return source ? this.asset(source, 'image', this.label(n, 'image'), this.assets.imageExt ? this.assets.imageExt(p.imageHash) : 'png') : '';
        });
      }
    }
    // Named after a named layer below the screen, else the heading above the
    // run, else what the items hold, and only last after the screen.
    const label = baseName(items, this.ancestors.filter((a) => a !== this.screenNode),
      this.headingAbove(parent) || contentName(fields) || this.label(parent, 'item', { text: false }));
    const model = fields.length ? this.typeName(label) : null;
    const title = fields.find((f) => f.kind === 'text');
    if (kind === 'segmented' && role.native && role.native.use && model && title && selected >= 0) {
      // Drawn like the system control: the system control.
      this.models.push([`struct ${model}: Hashable {`, ...fields.map((f) => `  let ${f.ident}: String`), '}'].join('\n'));
      const data = this.member(plural(sIdent(label, 'item')), 'items');
      const rows = items.map((n, i) => `    ${model}(${fields.map((f) => `${f.ident}: ${dataValue(f, f.values[i])}`).join(', ')}),`);
      this.lets.push([`  private let ${data}: [${model}] = [`, ...rows, '  ]'].join('\n'));
      const state = this.member(`selected ${label}`, 'selected');
      this.states.push(`  @State private var ${state} = ${selected}`);
      const option = mod(view('Text', [[null, raw(`item.${title.ident}`)]]), 'tag', [[null, raw('index')]]);
      const picker = view('Picker', [[null, str(label)], ['selection', raw(`$${state}`)]], [
        view('ForEach', [[null, raw(`Array(${data}.enumerated())`)], ['id', raw('\\.offset')]], [option], 'index, item'),
      ]);
      return mod(mod(picker, 'pickerStyle', [[null, raw('.segmented')]]), 'labelsHidden');
    }
    const viewName = model ? `${model}View` : `${this.typeName(label)}View`;
    this.typeNames.add(viewName);
    let namespace = null;
    if (indicator) {
      namespace = this.member(`${label} indicator`, 'indicator');
      this.states.push(`  @Namespace private var ${namespace}`);
      body = withIndicator(body, indicator, 'namespace');
    }
    const props = [
      ...itemMetrics,
      model ? `  let item: ${model}` : null,
      selected >= 0 ? '  var isSelected = false' : null,
      indicator ? '  var namespace: Namespace.ID' : null,
      this.probe ? '  var probe = ""' : null,
    ].filter(Boolean);
    this.components.push([`struct ${viewName}: View {`, ...props, '', '  var body: some View {', `    ${body}`, '  }', '}'].join('\n'));
    let data = null;
    if (model) {
      this.models.push([`struct ${model}: Hashable {`, ...fields.map((f) => `  let ${f.ident}: String`), '}'].join('\n'));
      data = this.member(plural(sIdent(label, 'item')), 'items');
      const rows = items.map((n, i) => `    ${model}(${fields.map((f) => `${f.ident}: ${dataValue(f, f.values[i])}`).join(', ')}),`);
      this.lets.push([`  private let ${data}: [${model}] = [`, ...rows, '  ]'].join('\n'));
    }
    let state = null;
    if (selected >= 0) {
      state = this.member(`selected ${label}`, 'selected');
      this.states.push(`  @State private var ${state} = ${selected}`);
    }
    // Tabs and cards tell the owner; segments and chips only select.
    const tappable = SELECTABLE.has(kind) || TAPPABLE_ITEMS.has(this.roleOf(items[0])) || items.some((n) => this.actions[n.id]);
    const fires = tappable && kind !== 'segmented' && kind !== 'chips';
    const statements = [];
    if (state) statements.push(`withAnimation(${this.motion('.snappy')}) { ${state} = index }`);
    if (fires) statements.push(`action(.${this.actionCase(label, model || 'Int')}(${model ? 'item' : 'index'}))`);
    if (state && SELECTABLE.has(kind)) {
      this.containerMods.set(parent.id, [['sensoryFeedback', [[null, raw('.selection')], ['trigger', raw(state)]]]]);
    }
    let item = view(viewName, [
      model ? ['item', raw('item')] : null,
      state ? ['isSelected', raw(`index == ${state}`)] : null,
      namespace ? ['namespace', raw(namespace)] : null,
      this.probe ? ['probe', raw('"\\(index)#"')] : null,
    ].filter(Boolean));
    if (statements.length) {
      item = this.button(item, statements, { style: SELECTABLE.has(kind) ? 'plain' : 'pressable' });
      if (state) item = mod(item, 'accessibilityAddTraits', [[null, raw(`index == ${state} ? .isSelected : []`)]]);
      // At accessibility text sizes a long press shows the item enlarged, as in the system tab bar.
      if (SELECTABLE.has(kind)) item = mod(item, 'accessibilityShowsLargeContentViewer');
    }
    // Items sharing a narrower screen take the room before the Spacers between them.
    if (parent.layoutMode === 'HORIZONTAL' && items.every((n) => n.type !== 'TEXT' && sizingOf(n, parent, 'x') === 'FIXED') && this.shrinks(parent)) {
      item = mod(item, 'layoutPriority', [[null, 1]]);
    }
    // Equal rows would share an identity: they are told apart by their place.
    const unique = !model || new Set(items.map((n, i) => fields.map((f) => f.values[i]).join('\u0000'))).size === items.length;
    const indexed = state || spread || (fires && !model) || !unique || this.probe;
    const body_ = [...(spread ? [raw('if index > 0 { Spacer(minLength: 0) }')] : []), item];
    if (!model) return view('ForEach', [[null, raw(`0..<${items.length}`)], ['id', raw('\\.self')]], body_, indexed ? 'index' : '_');
    if (indexed) return view('ForEach', [[null, raw(`Array(${data}.enumerated())`)], ['id', raw('\\.offset')]], body_, 'index, item');
    return view('ForEach', [[null, raw(data)], ['id', raw('\\.self')]], body_, 'item');
  }

  /**
   * A row of chips wider than its box scrolls sideways under its parent's
   * side padding, to the parent's edges, instead of overflowing. Null when
   * the chips fit.
   */
  chipScroller(node, flow, v) {
    if (node.layoutMode !== 'HORIZONTAL' || ownSizing(node, 'x') === 'HUG') return null;
    const [, right, , left] = this.paddingValues(node);
    const total = flow.reduce((t, c) => t + (c.width || 0), 0) + (node.itemSpacing || 0) * (flow.length - 1);
    if (total <= node.width - left - right + 0.5) return null;
    const parent = this.ancestors[this.ancestors.length - 2];
    const bleed = parent && isAutoLayout(parent) ? Math.min(parent.paddingLeft || 0, parent.paddingRight || 0) : 0;
    this.scrollRows.add(node.id);
    let out = view('ScrollView', [[null, raw('.horizontal')]], [v]);
    if (bleed) {
      out = mod(out, 'contentMargins', [[null, raw('.horizontal')], [null, round(bleed)], ['for', raw('.scrollContent')]]);
      out = mod(out, 'padding', [[null, raw('.horizontal')], [null, -round(bleed)]]);
    }
    return mod(out, 'scrollIndicators', [[null, raw('.hidden')]]);
  }

  flex(node, children) {
    const row = node.layoutMode === 'HORIZONTAL';
    const axis = row ? 'x' : 'y';
    const cross = row ? 'y' : 'x';
    const vars = node.vars || {};
    const flow = children.filter((c) => inFlow(c, node));
    const absolute = children.filter((c) => !inFlow(c, node));
    const hugMain = ownSizing(node, axis) === 'HUG';
    const hugCross = ownSizing(node, cross) === 'HUG';
    const crossFill = flow.map((c) => sizingOf(c, node, cross) === 'FILL');
    const between = node.primaryAxisAlignItems === 'SPACE_BETWEEN';
    const spacing = node.itemSpacing || 0;
    const ctx = { kind: 'flex', parent: node, axis, hugMain };
    const role = this.roles.get(node.id);
    const kind = role ? role.role : null;
    if (kind === 'swapFields') this.swapFields(node, role);
    let v;
    let padding = this.paddingValues(node);
    if (node.layoutWrap === 'WRAP') {
      const wctx = { kind: 'wrap', parent: node };
      const runs = this.inComponent ? [] : this.runsOf(flow);
      const items = [];
      for (let i = 0; i < flow.length; i++) {
        const run = runs.find((r) => r.start === i);
        const group = run && this.repeated(run.items, wctx, false);
        if (group) {
          items.push(group);
          i += run.items.length - 1;
        } else items.push(this.node(flow[i], wctx));
      }
      if (!row) this.warn(node, 'a vertical wrap is drawn as rows');
      if (node.primaryAxisAlignItems && node.primaryAxisAlignItems !== 'MIN') this.warn(node, 'wrapped rows are drawn start aligned');
      const gap = spacing > 0 && !between ? this.value(spacing, vars.itemSpacing) : null;
      const lineGap = node.counterAxisSpacing ? this.value(node.counterAxisSpacing, vars.counterAxisSpacing) : null;
      if (kind === 'grid' && runs.length === 1 && runs[0].items.length === flow.length && items.length === 1) {
        // Equal cards in columns that share the width.
        // Cards of a fixed width keep it; cards that fill share the width.
        const w = runs[0].items[0];
        // Fixed cards that do not fill the row keep their width; cards that
        // fill it share the width, so a wider phone widens them.
        const [, padR, , padL] = this.paddingValues(node);
        const filling = role.columns * w.width + (role.columns - 1) * (node.itemSpacing || 0) >= node.width - padL - padR - 1;
        const fixedCards = !filling && sizingOf(w, node, 'x') === 'FIXED' && runs[0].items.every((c) => Math.abs(c.width - w.width) < 0.5);
        const column = call('GridItem', [[null, raw('.flexible()')], ['spacing', gap]]);
        // One column when the text is set to an accessibility size.
        const count = role.columns > 1 && !this.inComponent ? raw(`${this.dynamicTypeSize()}.isAccessibilitySize ? 1 : ${role.columns}`) : role.columns;
        const columns = call('Array', [['repeating', column], ['count', count]]);
        v = view('LazyVGrid', [['columns', columns], ['spacing', lineGap]], items);
        // Fixed cards keep their width, up to the room a narrower phone leaves them.
        if (fixedCards) v = mod(v, 'frame', [['maxWidth', round(role.columns * w.width + (role.columns - 1) * (node.itemSpacing || 0))]]);
      } else {
        this.helpers.add('flow');
        v = view('FlowLayout', [['spacing', gap], ['lineSpacing', lineGap]], items.filter(Boolean));
      }
    } else {
      const [top, right, bottom, left] = this.paddingValues(node);
      const availCross = row ? node.height - top - bottom : node.width - left - right;
      const crossAt = { CENTER: '', MAX: row ? 'bottom' : 'trailing' }[node.counterAxisAlignItems] ?? (row ? 'top' : 'leading');
      const spread = between && !hugMain && flow.length > 1;
      const flexibleRow = row && (spread || flow.some((c) => sizingOf(c, node, 'x') === 'FILL' ||
        (/^spacer$/i.test(c.name) && !visibleChildren(c).length)));
      const one = (c) => {
        // An empty layer named Spacer in a stack that does not hug: the room between items.
        if (!hugMain && /^spacer$/i.test(c.name) && !visibleChildren(c).length && !visiblePaints(c.fills).length) {
          return view('Spacer', [['minLength', 0]]);
        }
        let item = this.node(c, ctx);
        // Shrinking items take the room before the Spacers between them.
        if (item && row && c.type !== 'TEXT' && sizingOf(c, node, 'x') === 'FIXED' && this.shrinks(node)) item = mod(item, 'layoutPriority', [[null, 1]]);
        // Beside a Spacer or a filling item, content with text takes its width first.
        if (item && row && flexibleRow && c.type !== 'TEXT' && sizingOf(c, node, 'x') === 'HUG' && hasText(c)) item = mod(item, 'layoutPriority', [[null, 1]]);
        const extent = (row ? c.height : c.width) || 0;
        if (!item) return item;
        const fills = hugCross || sizingOf(c, node, cross) === 'FILL';
        // A row reaching past its column's own edge scrolls sideways (one
        // only overflowing the padding is drawn overflowing, as in Figma); a
        // carousel snaps to its cards.
        if (!row && c.layoutMode === 'HORIZONTAL' && !scrollsItself(c) && (this.margins.has(c.id) || (!fills && extent > node.width + 0.5))) {
          this.scrollRows.add(c.id);
          let scroller = view('ScrollView', [[null, raw('.horizontal')]], [item]);
          // Drawn scrolled to its end (its start off the leading edge, its end
          // at the trailing one), as a right-to-left row rests: it opens there.
          const inner = node.x + (this.paddingValues(node)[3] || 0);
          const end = node.x + node.width - (this.paddingValues(node)[1] || 0);
          if (c.x < inner - 1 && Math.abs(c.x + c.width - (end + (this.paddingValues(c)[1] || 0))) <= 2 + (this.paddingValues(c)[1] || 0)) {
            scroller = mod(scroller, 'defaultScrollAnchor', [[null, raw('.trailing')]]);
          }
          if (this.margins.has(c.id)) {
            scroller = mod(scroller, 'contentMargins', [[null, raw('.horizontal')], [null, this.margins.get(c.id)], ['for', raw('.scrollContent')]]);
            scroller = mod(scroller, 'scrollTargetBehavior', [[null, raw('.viewAligned')]]);
          }
          // As tall as its row: a scroll view would take all the height it is offered (a pinned bar offers the screen).
          scroller = mod(mod(scroller, 'scrollIndicators', [[null, raw('.hidden')]]), 'fixedSize', [['horizontal', false], ['vertical', true]]);
          // A scroll view would report its content's width to the layout: it is as wide as the column.
          // As wide as the column: a horizontal scroll view takes the width it
          // is offered (containerRelativeFrame here loops with the stack's layout).
          if (fills || (this.screen && node.width >= this.screen.width * 0.95)) return mod(scroller, 'frame', [['maxWidth', INFINITY]]);
          return mod(scroller, 'frame', [['width', round(availCross)]]);
        }
        if (fills || extent <= availCross + 0.5) return item;
        // A frame of fixed size does not grow with what overflows it, unless
        // the screen stretches it.
        const parent = this.ancestors[this.ancestors.length - 2];
        if (ownSizing(node, cross) === 'FIXED' && parent && !(this.screen && parent.id === this.screen.id)) return item;
        // Another child larger than the stack across overflows it, as in
        // Figma, instead of widening the stack.
        const box = this.frame(clear(), row ? { w: round(c.width), h: null } : { w: null, h: round(c.height) });
        return mod(box, 'overlay', crossAt ? [['alignment', raw(`.${crossAt}`)]] : [], [item]);
      };
      let items = [];
      const runs = this.inComponent ? [] : this.runsOf(flow);
      const calendar = kind === 'calendar' && !this.inComponent ? role : null;
      for (let i = 0; i < flow.length; i++) {
        if (calendar && flow[i].id === calendar.header) {
          const ends = flow.findIndex((c) => c.id === calendar.ends);
          const cal = ends > i ? calendarView(this, node, calendar, ctx) : null;
          if (cal) {
            items.push(cal);
            i = ends;
            continue;
          }
        }
        const run = runs.find((r) => r.start === i);
        const group = run && this.repeated(run.items, ctx, spread);
        if (group) {
          if (spread && items.length) items.push(view('Spacer', [['minLength', 0]]));
          items.push(group);
          i += run.items.length - 1;
          continue;
        }
        const item = one(flow[i]);
        if (!item) continue;
        if (spread && items.length) items.push(view('Spacer', [['minLength', 0]]));
        items.push(item);
      }
      if (spacing < 0 && node.itemReverseZIndex) this.warn(node, 'the first child is drawn under the next ones, not above');
      const align = (row ? ROW_ALIGN : COLUMN_ALIGN)[node.counterAxisAlignItems];
      const carousel = kind === 'carousel' && !spread;
      // Items side by side that each fill and hold text stack at accessibility text sizes.
      if (row && !kind && !spread && !this.inComponent && flow.length >= 2 && flow.length <= 3 &&
          flow.every((c) => sizingOf(c, node, 'x') === 'FILL' && hasText(c))) {
        v = view(this.adaptiveLayout(node, spacing, align), [], items);
      } else v = view(carousel && flow.length > LAZY_AFTER ? 'LazyHStack' : row ? 'HStack' : 'VStack', [
        ['alignment', align ? raw(align) : null],
        ['spacing', spread ? 0 : this.value(spacing, vars.itemSpacing)],
      ], items);
      if (carousel) {
        // The scroll view gets the side padding as content margins, so the
        // cards snap to the margin and scroll edge to edge.
        v = mod(v, 'scrollTargetLayout');
        this.margins.set(node.id, left);
        padding = [top, 0, bottom, 0];
      }
      // Children that fill a hugging cross axis take the size of the largest child.
      if (hugCross && crossFill.some(Boolean)) v = mod(v, 'fixedSize', [['horizontal', !row], ['vertical', row]]);
      // Tiles that fill the row in the design scroll on a phone too narrow for them.
      if (row && !carousel && !this.inComponent && this.scrollsWhenNarrow(node)) {
        this.scrollRows.add(node.id);
        const scroller = mod(view('ScrollView', [[null, raw('.horizontal')]], [v]), 'scrollIndicators', [[null, raw('.hidden')]]);
        v = view('ViewThatFits', [['in', raw('.horizontal')]], [v, scroller]);
      }
    }
    for (const [name, args] of this.containerMods.get(node.id) || []) v = mod(v, name, args);
    const scrolled = scrollsItself(node) && !this.margins.has(node.id) && !this.inComponent;
    if (scrolled) {
      // Figma scrolls this row sideways: its items keep their widths and the
      // row scrolls, its padding inside the scrolled content.
      this.scrollRows.add(node.id);
      v = mod(view('ScrollView', [[null, raw('.horizontal')]], [padded(v, padding)]), 'scrollIndicators', [[null, raw('.hidden')]]);
      v = mod(v, 'fixedSize', [['horizontal', false], ['vertical', true]]);
      padding = [0, 0, 0, 0];
    }
    const main = node.primaryAxisAlignItems || 'MIN';
    const counter = node.counterAxisAlignItems === 'BASELINE' ? 'MIN' : node.counterAxisAlignItems || 'MIN';
    const align = row ? alignmentOf(H_ALIGN[main] ?? 'leading', V_ALIGN[counter] ?? 'top')
      : alignmentOf(H_ALIGN[counter] ?? 'leading', V_ALIGN[main] ?? 'top');
    const scroller = !scrolled && node.layoutWrap !== 'WRAP' && (kind === 'chips' || kind === 'tabs') ? this.chipScroller(node, flow, v) : null;
    if (scroller) v = scroller;
    else if (!scrolled && node.layoutWrap !== 'WRAP') v = this.overflow(node, flow, v, { row, hugMain, hugCross, crossFill, spacing, between, align });
    // Absolute layers before the first stacked one are drawn behind it.
    const first = children.findIndex((c) => inFlow(c, node));
    const layer = (list) => {
      const items = list.map((c) => this.node(c, { kind: 'stack', parent: node })).filter(Boolean);
      return items.length ? view('ZStack', [['alignment', raw('.topLeading')]], items) : null;
    };
    return {
      view: v, padding, align,
      underlay: layer(absolute.filter((c) => first >= 0 && children.indexOf(c) < first)),
      overlay: layer(absolute.filter((c) => first < 0 || children.indexOf(c) > first)),
    };
  }
}

/**
 * A value of the data: text people read is a localized string (Xcode puts
 * it in the String Catalog), asset names and figures are plain literals.
 */
function dataValue(field, value) {
  return field.kind === 'text' && /\p{L}/u.test(String(value)) ? `String(localized: ${sString(value)})` : sString(value);
}

/** Whether [c] is a scrim: a plain see-through layer over (nearly) the whole [w] x [h] screen. */
function isScrim(c, w, h) {
  if (visibleChildren(c).length || c.width < w * 0.95 || c.height < h * 0.9 || hasImageFill(c)) return false;
  const fills = visiblePaints(c.fills);
  if (fills.length !== 1 || fills[0].type !== 'SOLID') return false;
  const alpha = (fills[0].color.a ?? 1) * (fills[0].opacity ?? 1) * (typeof c.opacity === 'number' ? c.opacity : 1);
  return alpha > 0.05 && alpha < 0.9;
}

/** Whether Figma scrolls [node], a row, sideways. */
function scrollsItself(node) {
  return node.layoutMode === 'HORIZONTAL' && node.layoutWrap !== 'WRAP' && ['HORIZONTAL', 'BOTH'].includes(node.overflowDirection);
}

/** A name for items by what they hold: single digits are digits, numbers numbers; else null. */
function contentName(fields) {
  const values = fields.filter((f) => f.kind === 'text').flatMap((f) => f.values);
  if (!values.length) return null;
  if (values.every((v) => /^\d$/.test(String(v).trim()))) return 'Digit';
  if (values.every((v) => /^[\d.,]+$/.test(String(v).trim()))) return 'Number';
  return null;
}

function printProperty(p) {
  return [`  private var ${p.name}: some View {`, `    ${print(p.view, 2)}`, '  }'].join('\n');
}

/**
 * Reference SwiftUI code for [root]. Returns { code, shared, structName,
 * screen, scrolls, assets, fonts, tokens, connected, rasterized, warnings,
 * structure }:
 *   code is the screen's file; shared is DesignSystem.swift, what every
 *   screen shares (Color(hex:), the button style, DesignTokens, AppFonts),
 *   or null when the screen needs none of it;
 *   assets maps each asset catalog name used in the code to { source, ext,
 *   vector };
 *   fonts maps each family to the weights used ("600", "400 italic").
 *
 * [assets] turns embedded data into sources (file paths or URLs):
 *   { svg(text), image(hash), imageExt?(hash), render?({ base64 }) }.
 * [connect] returns a mapping ({ componentName, source, label }) for an
 * instance, or null. [screen] draws the root as a phone screen (it fills
 * the screen and tall frames scroll); by default portrait frames of a
 * phone's width are screens. [preview] adds a #Preview (default true).
 * Layers with a role (buttons, fields, tabs, cards) are Buttons that call
 * the view's `action` closure with a case of its action enum; [actions]
 * names the case for given node ids instead.
 *
 * The result also lists `structure`: the roles found, each with the SwiftUI
 * pattern the code uses for it.
 */
export function toSwiftUI(root, assets, options = {}) {
  const rootNode = withPatterns(withIllustrations(withContentBounds({ ...root, x: root.x ?? 0, y: root.y ?? 0 })));
  const screen = options.screen ?? isPhoneScreen(rootNode);
  let structName = options.structName || sType(root.name, 'Design');
  if (SWIFT_TYPE_NAMES.has(structName)) structName = `${structName}Screen`;
  const roles = detectRoles(rootNode);
  const start = () => {
    const w = new SwiftUIWriter(assets, options);
    w.structName = structName;
    w.typeNames.add(structName);
    w.roles = roles;
    for (const r of roles.values()) if (r.role === 'textInput') w.inputs.set(r.placeholder, r);
    w.parents = new Map();
    w.byId = new Map();
    w.screenNode = rootNode;
    const index = (n) => {
      w.byId.set(n.id, n);
      for (const c of n.children || []) {
        w.parents.set(c.id, n);
        index(c);
      }
    };
    index(rootNode);
    for (const r of roles.values()) {
      if (r.role === 'calendar' && !prepareCalendar(w, r)) delete r.names;
    }
    return w;
  };
  let writer = start();
  let tree = null;
  if (screen) {
    writer.screen = rootNode;
    try {
      tree = writer.screenRoot(rootNode);
    } catch (e) {
      // Drawn again from scratch at its design size, so nothing of the failed screen layout is left.
      writer = start();
      writer.warnings.push({ id: root.id, name: root.name, message: `drawn at its design size: ${e.message}` });
    }
  }
  tree = tree || writer.node(rootNode, { kind: 'root' }) || view('EmptyView');
  const turnedIn = (rootNode.children || []).find((c) => c.visible !== false && isTurned(c) && c.width * c.height > rootNode.width * rootNode.height * 0.5);
  if (isTurned(rootNode) || turnedIn) {
    writer.warnings.push({ id: root.id, name: root.name, message: 'the frame is a turned mockup of a screen (a presentation, not an app ' +
      'screen); the code draws its layers upright: generate the screen it shows instead' });
  }
  // What only this screen uses lives in its namespace, so screens of one module do not clash.
  const fields = writer.finishFocus();
  const nested = [
    ...(writer.tapped ? [actionEnum(writer.cases)] : []),
    ...(fields ? [fields] : []),
    ...writer.components,
    ...writer.models,
  ];
  const lines = [
    'import SwiftUI',
    '',
    ...[...writer.connected.values()].map((m) => `// ${m.componentName}: ${m.source}${m.label ? ` (${m.label})` : ''}`),
    ...(writer.connected.size ? [''] : []),
    `struct ${structName}: View {`,
    // In check mode the owner the screen asks is the check, which records each case.
    ...(writer.tapped ? [options.probe ? '  var action: (Action) -> Void = { checkAction("\\($0)") }' : '  var action: (Action) -> Void = { _ in }'] : []),
    ...(writer.loading ? ['  /// Placeholders stand in for the content while its data loads.', '  var isLoading = false'] : []),
    ...(writer.loading && writer.scrolls ? ['  /// Loads the data again when the page is pulled down.', '  var refresh: () async -> Void = {}'] : []),
    ...writer.states,
    ...(writer.tapped || writer.states.length ? [''] : []),
    '  var body: some View {',
    `    ${print(tree, 2)}`,
    '  }',
    ...writer.props.flatMap((p) => ['', printProperty(p)]),
    ...writer.lets.flatMap((l) => ['', l]),
    '}',
  ];
  if (nested.length) {
    const indent = (block) => block.split('\n').map((l) => (l ? `  ${l}` : l)).join('\n');
    lines.push('', `extension ${structName} {`, nested.map(indent).join('\n\n'), '}');
  }
  if (options.preview !== false) lines.push('', '#Preview {', `  ${structName}()`, '}');
  const shared = ['import SwiftUI'];
  if (writer.textStyles.size) {
    shared.push('', '/// The design\'s text styles, scaling with Dynamic Type.', 'enum AppFonts {');
    for (const t of writer.textStyles.values()) {
      shared.push(`  static let ${t.ident}: Font = ${t.code} // ${t.name}`);
    }
    shared.push('}');
  }
  if (writer.tokens.size) {
    shared.push('', '/// The design variables used, by their Figma names.', 'enum DesignTokens {');
    for (const t of writer.tokens.values()) {
      shared.push(t.type === 'Color'
        ? `  static let ${t.ident} = ${t.code} // ${t.name}`
        : `  static let ${t.ident}: CGFloat = ${t.code} // ${t.name}`);
    }
    shared.push('}');
  }
  for (const name of ['color', 'dynamicColor', 'designFont', 'designLineHeight', 'layerStack', 'flow', 'pressable', 'textStroke', 'designBar', 'shimmer', 'stretchy', 'designSwitch', 'scalesToFit']) {
    if (writer.helpers.has(name)) shared.push('', HELPER_CODE[name]);
  }
  const assetsMap = {};
  for (const [name, info] of writer.names) assetsMap[name] = info;
  const fonts = {};
  for (const [family, weights] of writer.fonts) fonts[family] = [...weights].sort();
  return {
    code: `${lines.join('\n')}\n`,
    shared: shared.length > 1 ? `${shared.join('\n')}\n` : null,
    structName,
    screen: Boolean(writer.screen),
    scrolls: Boolean(writer.screen && writer.scrolls),
    assets: assetsMap,
    fonts,
    tokens: [...writer.tokens.values()].map((t) => ({ name: t.name, swift: `DesignTokens.${t.ident}`, value: t.code })),
    connected: [...writer.connected.values()],
    rasterized: writer.rasterized,
    warnings: writer.warnings,
    structure: structureOf(writer.roles, rootNode),
    ...(options.probe ? { probeIds: writer.probeIds, scrollRows: [...writer.scrollRows] } : {}),
  };
}

/** The screen's action enum: what tapping its controls asks the owner to do. */
function actionEnum(cases) {
  const lines = ['/// What the screen asks its owner to do.', 'enum Action: Hashable {'];
  for (const [name, payload] of cases) lines.push(`  case ${KEYWORDS.has(name) ? `\`${name}\`` : name}${payload ? `(${payload})` : ''}`);
  lines.push('}');
  return lines.join('\n');
}

/** The roles with a SwiftUI pattern, for the response: [{ id, name, role, pattern, items?, selected? }]. */
function structureOf(roles, root) {
  const byId = new Map();
  const index = (n) => {
    byId.set(n.id, n);
    (n.children || []).forEach(index);
  };
  index(root);
  const nameOf = (id) => {
    const found = byId.get(id);
    if (!found) return id;
    // An item reads as its label ("Regular"), not its layer name ("Chip").
    const label = findText(found);
    return label ? String(label.characters).trim() : found.name;
  };
  const out = [];
  for (const r of roles.values()) {
    const pattern = SWIFTUI_PATTERNS[r.role];
    if (!pattern) continue;
    const native = r.native && r.native.use;
    const entry = { id: r.id, name: r.name, role: r.role, pattern: native ? `system control: ${r.native.control}` : pattern };
    if (r.confidence) Object.assign(entry, { confidence: r.confidence, evidence: r.evidence });
    if (r.native) entry.native = r.native;
    if (r.prototype) entry.prototype = r.prototype;
    if (r.items) entry.items = r.items.length;
    if (typeof r.selected === 'number' && r.selected >= 0) entry.selected = nameOf(r.items[r.selected]);
    if (r.label) entry.label = r.label;
    if (r.role === 'sectionHeader') entry.link = r.link ? nameOf(r.link) : null;
    out.push(entry);
  }
  return out;
}

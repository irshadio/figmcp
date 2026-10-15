// Reference SwiftUI code for a node tree. Auto-layout frames become HStacks
// and VStacks, other frames ZStacks whose children are placed by their
// constraints; paints become shape fills, overlays and shadows. Values are
// the design's points.
import { linearTransform, rotationOf } from '../geometry.js';
import { inFlow, isAutoLayout, isGrid, sizingOf } from '../layout.js';
import { drawnAsSvg, hasImageFill, isTurned, straightLine, visibleChildren } from '../nodes.js';
import { sideWeights } from '../paint.js';
import { detectRoles, SWIFTUI_PATTERNS } from '../roles.js';
import { isPhoneScreen, minPageHeight, TALL_SCREEN, WRAPPING_PARENTS } from '../screen.js';
import { systemUi } from '../system-ui.js';
import { autoLineRatios, fontWeight, segmentsOf } from '../text.js';
import { visiblePaints } from '../util.js';
import {
  blendMode, blurs, composite, effectsOf, gradient, HELPERS, isRectangle, sColor, shadowArgs, shapeOf, swiftBlur,
} from './paint.js';
import { indicatorOf, PRESSABLE_STYLE, withIndicator } from './patterns.js';
import { baseName, fieldsOf, mergeVariants, plural, runsOf } from './repeat.js';
import { array, call, mod, print, raw, sIdent, sNum, sString, str, sType, trailing, view } from './swift.js';
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
const SWIFTUI_TYPES = new Set([
  'Button', 'Text', 'Image', 'Label', 'Toggle', 'Map', 'Section', 'List', 'Group', 'Tab', 'Color', 'Font', 'Shape',
  'Path', 'Grid', 'Menu', 'Link', 'Picker', 'Form', 'Divider', 'Spacer', 'Circle', 'Capsule', 'Rectangle', 'Ellipse',
  'Gradient', 'Angle', 'Animation', 'Edge', 'Alignment', 'Axis', 'Content', 'View', 'Item', 'Date', 'Data', 'Set',
  'Array', 'String', 'Int', 'Double', 'Error', 'Result', 'State', 'Binding', 'Environment', 'Stepper', 'Slider',
  'Gauge', 'Table', 'Layout', 'Material', 'Badge', 'Chart',
]);

const NAMED_COLORS = { white: 'FFFFFF', black: '000000' };
// Roles whose layer is a Button calling the screen's action, and roles whose
// items select on tap.
const TAPPABLE = new Set(['button', 'iconButton', 'field', 'link', 'listRow']);
const SELECTABLE = new Set(['tabBar', 'tabs', 'segmented', 'chips']);
const TAPPABLE_ITEMS = new Set(['card', 'field', 'button', 'listRow', 'iconButton', 'tab']);
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

function countVisible(node) {
  if (!node || node.visible === false) return 0;
  return 1 + (node.children || []).reduce((n, c) => n + countVisible(c), 0);
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

class SwiftUIWriter {
  constructor(assets, { connect = null, actions = null } = {}) {
    this.assets = assets;
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
    this.propNames = new Set(['body']);
    this.warnings = [];
    this.rasterized = [];
    this.connected = new Map();
    this.helpers = new Set();
    this.ratios = null;
    this.screen = null;
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
    this.swaps = new Map();
  }

  roleOf(node) {
    const r = node && this.roles.get(node.id);
    return r ? r.role : null;
  }

  /** A case of the screen's action enum, unique by name, with its payload type. */
  actionCase(label, payload = null) {
    const base = sIdent(label, 'tap');
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
      case 'button': case 'iconButton': return role.label;
      case 'link': return `${node.characters} ${role.section || ''}`;
      default: return node.name;
    }
  }

  /** [core] made a Button or marked for accessibility by the layer's role. */
  interactive(node, core) {
    const role = this.roles.get(node.id);
    const kind = role ? role.role : null;
    if (kind === 'heading') return mod(core, 'accessibilityAddTraits', [[null, raw('.isHeader')]]);
    if (this.inComponent) return core;
    const given = this.actions[node.id];
    if (!given && !TAPPABLE.has(kind)) return core;
    const accessibilityLabel = kind === 'iconButton' ? role.label : null;
    const pair = this.swaps.get(node.id);
    if (pair && !given) return this.button(core, [`withAnimation(.snappy) { (${pair[0]}, ${pair[1]}) = (${pair[1]}, ${pair[0]}) }`], { accessibilityLabel });
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
      const init = values.map((f) => `${f.ident}: ${sString(f.values[i])}`).join(', ');
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
    const t = this.token(varName, 'Color', sColor(color, 1));
    if (!t) return literal;
    const a = Math.round((color.a ?? 1) * opacity * 1000) / 1000;
    return a < 0.999 ? raw(`${t.code}.opacity(${sNum(a)})`) : t;
  }

  /** The asset catalog name for [source], unique per file. */
  asset(source, kind, name, ext) {
    if (this.files.has(source)) return this.files.get(source);
    const base = sIdent(name, kind === 'svg' ? 'icon' : 'image');
    let asset = base;
    for (let i = 2; this.names.has(asset); i++) asset = `${base}${i}`;
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

  /** [v] framed to [size] ({ w, h }: a number, 'inf' or null), aligned by [alignment]. */
  frame(v, size, alignment = null) {
    const args = [];
    const axis = (key, max, s) => {
      if (s === 'inf') args.push([max, INFINITY]);
      else if (typeof s === 'number') args.push([key, round(s)]);
    };
    axis('width', 'maxWidth', size.w);
    axis('height', 'maxHeight', size.h);
    if (!args.length) return v;
    // A fixed and a flexible axis go in two frames: one frame takes either
    // sizes or bounds.
    const fixed = args.filter(([k]) => k === 'width' || k === 'height');
    const flexible = args.filter(([k]) => k.startsWith('max'));
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
    core = this.interactive(node, core);
    if (ctx.kind !== 'root' && !this.inComponent && EXTRACT_TYPES.has(node.type) && countVisible(node) >= EXTRACT_SIZE) core = this.extract(node, core);
    return this.wrapPlace(node, ctx, core);
  }

  /** A member name of the screen struct, unique. */
  member(label, fallback) {
    let name = sIdent(label, fallback);
    for (let i = 2; this.propNames.has(name); i++) name = `${sIdent(label, fallback)}${i}`;
    this.propNames.add(name);
    return name;
  }

  /** A type name, unique in the file and clear of SwiftUI's own types. */
  typeName(label) {
    let base = sType(label, 'Item');
    if (SWIFTUI_TYPES.has(base) || base === this.structName) base = `${base}Item`;
    let name = base;
    for (let i = 2; this.typeNames.has(name) || this.typeNames.has(`${name}View`); i++) name = `${base}${i}`;
    this.typeNames.add(name);
    return name;
  }

  /** A view property holding [v], referenced by name. */
  extract(node, v) {
    const name = this.member(node.name, 'section');
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
        // A column's child as wide as the column fills it.
        if (mode === 'FIXED' && axis === 'x' && ctx.axis === 'y' && !hugW && W >= inner - 0.5) mode = 'FILL';
        if (mode === 'FILL') out[key] = 'inf';
        else if (fixed || !(mode === 'HUG' && content(axis))) {
          if (!(axis === 'x' ? hugW : hugH) || fixed) out[key] = axis === 'x' ? W : H;
        }
      }
      return out;
    }
    if (ctx.kind === 'stack') {
      const p = this.stackPlacement(node, ctx.parent);
      const own = (a, hug, S) => (a.mode === 'stretch' ? 'inf' : hug && !fixed ? null : S);
      return { w: own(p.h, hugW || content('x'), W), h: own(p.v, hugH || content('y'), H) };
    }
    return {
      w: !fixed && (hugW || content('x')) ? null : W,
      h: !fixed && (hugH || content('y')) ? null : H,
    };
  }

  wrapPlace(node, ctx, v) {
    if (ctx.kind === 'stack') return this.positioned(node, ctx.parent, v);
    return v;
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
    const stretchy = parent === this.screen || this.stretchCells.has(parent.id);
    if (stretchy && cons.horizontal !== 'MAX' && cons.horizontal !== 'STRETCH' && !hugsWidth(node) &&
        node.width >= parent.width / 2 && Math.abs(x - (parent.width - x - node.width)) <= 2) {
      cons = { ...cons, horizontal: 'STRETCH' };
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

  positioned(node, parent, v) {
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
    if (dx || dy) out = mod(out, 'offset', [['x', dx || null], ['y', dy || null]]);
    return out;
  }

  /** The node's own view at [size]. */
  core(node, ctx, size) {
    const mapping = node.type === 'INSTANCE' && this.connect ? this.connect(node) : null;
    if (mapping) return this.component(node, size, mapping);
    const line = straightLine(node);
    if (isTurned(node) && !node.svg && !node.render && !line) return this.turned(node, size);
    if (isText(node)) return this.text(node, size);
    if (line) return this.line(node, size, line);
    if (drawnAsSvg(node)) return this.svg(node, size);
    if (node.render && this.assets.render) return this.render(node, size);
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
      ratios: this.ratios,
      value: (v, name) => this.value(v, name),
      color: (c, o, name) => this.color(c, o, name),
      font: (seg) => fontOf(seg, (v, name) => this.value(v, name)),
      warn: (message) => this.warn(node, message),
      textStyle: (name, font) => this.textStyle(name, font),
    };
  }

  text(node, size) {
    const segs = segmentsOf(node);
    segs.forEach((seg) => this.font(seg));
    if (visiblePaints(node.strokes).length && typeof node.strokeWeight === 'number' && node.strokeWeight > 0) {
      this.warn(node, 'a text stroke is not drawn');
    }
    if (node.leadingTrim === 'CAP_HEIGHT') this.warn(node, 'the cap height trim is drawn as a centred line box');
    let v = textView(node, { ...this.textCtx(node), bind: this.bindings.get(node.id) || null }).view;
    if (size.w === null && size.h === null) v = mod(v, 'fixedSize');
    else if (size.h === null) v = mod(v, 'fixedSize', [['horizontal', false], ['vertical', true]]);
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
    return this.asset(this.assets.svg(this.svgSource(node).text), 'svg', node.name, 'svg');
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
    if (!tile) return this.picture(node, size, node.svgBounds, image);
    const shape = shapeOf(node, (v, n) => this.value(v, n));
    const fill = this.fillItems(node)[0];
    const back = mod(view('', [[null, shape]]), 'fill', [[null, fill.paint]]);
    return this.effects(node, this.frame(view('ZStack', [], [back, image]), { w: size.w ?? node.width, h: size.h ?? node.height }));
  }

  render(node, size) {
    this.rasterized.push({ id: node.id, name: node.name, reason: node.rasterized });
    const name = this.asset(this.assets.render(node.render), 'image', node.name, 'png');
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
      : str(this.asset(source, 'image', node.name, this.assets.imageExt ? this.assets.imageExt(paint.imageHash) : 'png'));
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
      v = this.frame(v, size, content.align);
      if (content.underlay) layers.push(content.underlay);
      if (layers.length) v = mod(v, 'background', layers.length > 1 || content.underlay ? [['alignment', raw('.topLeading')]] : [], layers);
      if (content.overlay) v = mod(v, 'overlay', [['alignment', raw('.topLeading')]], [content.overlay]);
    }
    if (node.clipsContent && !leaf) v = isRectangle(shape) ? mod(v, 'clipped') : mod(v, 'clipShape', [[null, shape]]);
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
   * action footer) stay put while the rest scrolls, and layers Figma keeps
   * fixed when scrolling float over it. On a screen shorter than the
   * design, the page keeps the shortest height its layers fit.
   */
  screenRoot(node) {
    this.scrolls = ['VERTICAL', 'BOTH'].includes(node.overflowDirection) || node.height > TALL_SCREEN;
    const chrome = systemUi(node);
    chrome.forEach((c) => this.skip.add(c.id));
    const statusBottom = Math.max(0, ...chrome.filter((c) => c.kind === 'status bar').map((c) => c.box[1] + c.box[3]));
    const indicator = chrome.some((c) => c.kind === 'home indicator');
    const all = (node.children || []).filter((c) => c.visible !== false && !this.skip.has(c.id));
    const W = node.width;
    const H = node.height;
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
    const bottoms = kids.filter((c) => c !== topBar && wide(c) && c.height <= 160 && rel(c).bottom >= H - 2 &&
      (filled(c) || /tab ?bar|footer|bottom|nav/i.test(c.name)) && (!flowRoot || c === kids[kids.length - 1]));
    const bottomBar = bottoms.sort((a, b) => rel(b).top - rel(a).top)[0] || null;
    const fixedCount = flowRoot ? 0 : Math.max(0, Math.min(node.numberOfFixedChildren || 0, (node.children || []).length));
    const fixed = new Set((node.children || []).slice((node.children || []).length - fixedCount).map((c) => c.id));
    // Floating controls pinned to the bottom (a map toggle, a button) stay over the content.
    const floating = flowRoot ? [] : all.filter((c) => c !== bottomBar && c !== topBar && !wide(c) &&
      ((c.constraints && c.constraints.vertical === 'MAX') || fixed.has(c.id)) && rel(c).top > H / 2);
    const pinned = all.filter((c) => fixed.has(c.id) && c !== topBar && c !== bottomBar && !floating.includes(c));
    const top = topBar ? rel(topBar).bottom : statusBottom;
    // The phone keeps its own room for the home indicator under the bottom bar.
    const inset = indicator || (bottomBar && rel(bottomBar).bottom >= H - 2 && bottomBar.height > 70) ? 34 : 0;
    const bottom = bottomBar ? H - rel(bottomBar).top : inset;
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
      const inner = { ...node, paddingTop: Math.max(0, (node.paddingTop || 0) - statusBottom), paddingBottom: 0 };
      page = this.box({ ...inner, fills: [], effects: [], strokes: [] }, { w: 'inf', h: null });
    } else {
      // Positions are kept relative to the content area between the bars.
      const area = { ...node, y: node.y + top, height: Math.max(1, H - top - bottom), fills: [], children: node.children };
      this.screen = area;
      const content = all.filter((c) => !this.skip.has(c.id));
      const ctx = { kind: 'stack', parent: area };
      const items = content.map((c) => {
        // A background that runs to the top edge runs on under the status bar.
        if (rel(c).top <= 0 && wide(c) && !visibleChildren(c).length) {
          return this.node({ ...c, y: c.y - 200, height: c.height + 200 }, ctx);
        }
        return this.node(c, ctx);
      }).filter(Boolean);
      const minH = minPageHeight(area, content.map((c) => ({ ...c, y: c.y })));
      // Layers are laid over a page of the screen's width, so none can widen it.
      page = mod(mod(clear(), 'frame', [['maxWidth', INFINITY], ['minHeight', round(minH)]]), 'overlay', [['alignment', raw('.topLeading')]],
        [view('ZStack', [['alignment', raw('.topLeading')]], items)]);
    }
    let header = topBar ? bar(topBar, 0) : null;
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
    let out = mod(view('ScrollView', [], [page]), 'scrollBounceBehavior', [[null, raw('.basedOnSize')]]);
    if (header) out = mod(out, 'safeAreaInset', [['edge', raw('.top')], ['spacing', 0]], [header]);
    if (bottomBar) out = mod(out, 'safeAreaInset', [['edge', raw('.bottom')], ['spacing', 0]], [bar(bottomBar, inset)]);
    const over = [...floating, ...pinned].map((c) => apart(c, { kind: 'stack', parent: { ...node, height: H - inset } })).filter(Boolean);
    this.skip = new Set(chrome.map((c) => c.id));
    if (over.length) out = mod(out, 'overlay', [['alignment', raw('.topLeading')]], [view('ZStack', [['alignment', raw('.topLeading')]], over)]);
    const fill = this.fillItems(node).find((f) => f.paint);
    if (fill) out = mod(out, 'background', [[null, fill.paint]]);
    return out;
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
    const cell = kind === 'grid';
    const render = (n) => {
      const index = items.indexOf(n);
      const saved = { actions: this.actions, inComponent: this.inComponent };
      for (const f of fields) this.bindings.set(f.nodes[index].id, `item.${f.ident}`);
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
    const trees = items.map(render);
    const codes = trees.map((t) => (t ? print(t, 2) : ''));
    const kinds = [...new Set(codes)];
    let body;
    let selected = -1;
    let indicator = null;
    if (kinds.length === 1) body = codes[0];
    else if (kinds.length === 2) {
      const counts = kinds.map((k) => codes.filter((c) => c === k).length);
      const odd = counts[0] === 1 ? 0 : counts[1] === 1 ? 1 : -1;
      if (odd < 0) return null;
      selected = codes.indexOf(kinds[odd]);
      const split = kind === 'tabBar' || kind === 'segmented'
        ? indicatorOf(trees[selected], trees[codes.indexOf(kinds[1 - odd])]) : null;
      if (split) {
        indicator = split.indicator;
        body = mergeVariants(print(split.on, 2), print(split.off, 2));
      } else body = mergeVariants(kinds[odd], kinds[1 - odd]);
      if (!body) {
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
          return source ? this.asset(source, 'image', n.name, this.assets.imageExt ? this.assets.imageExt(p.imageHash) : 'png') : '';
        });
      }
    }
    const label = baseName(items, this.ancestors);
    const model = fields.length ? this.typeName(label) : null;
    const viewName = model ? `${model}View` : `${this.typeName(label)}View`;
    this.typeNames.add(viewName);
    let namespace = null;
    if (indicator) {
      namespace = this.member(`${label} indicator`, 'indicator');
      this.states.push(`  @Namespace private var ${namespace}`);
      body = withIndicator(body, indicator, 'namespace');
    }
    const props = [
      model ? `  let item: ${model}` : null,
      selected >= 0 ? '  var isSelected = false' : null,
      indicator ? '  var namespace: Namespace.ID' : null,
    ].filter(Boolean);
    this.components.push([`struct ${viewName}: View {`, ...props, '', '  var body: some View {', `    ${body}`, '  }', '}'].join('\n'));
    let data = null;
    if (model) {
      this.models.push([`struct ${model}: Hashable {`, ...fields.map((f) => `  let ${f.ident}: String`), '}'].join('\n'));
      data = this.member(plural(sIdent(label, 'item')), 'items');
      const rows = items.map((n, i) => `    ${model}(${fields.map((f) => `${f.ident}: ${sString(f.values[i])}`).join(', ')}),`);
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
    if (state) statements.push(`withAnimation(.snappy) { ${state} = index }`);
    if (fires) statements.push(`action(.${this.actionCase(label, model || 'Int')}(${model ? 'item' : 'index'}))`);
    if (state && SELECTABLE.has(kind)) {
      this.containerMods.set(parent.id, [['sensoryFeedback', [[null, raw('.selection')], ['trigger', raw(state)]]]]);
    }
    let item = view(viewName, [
      model ? ['item', raw('item')] : null,
      state ? ['isSelected', raw(`index == ${state}`)] : null,
      namespace ? ['namespace', raw(namespace)] : null,
    ].filter(Boolean));
    if (statements.length) {
      item = this.button(item, statements, { style: SELECTABLE.has(kind) ? 'plain' : 'pressable' });
      if (state) item = mod(item, 'accessibilityAddTraits', [[null, raw(`index == ${state} ? .isSelected : []`)]]);
    }
    const indexed = state || spread || (fires && !model);
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
      const runs = this.inComponent ? [] : runsOf(flow);
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
        const column = call('GridItem', [[null, raw('.flexible()')], ['spacing', gap]]);
        const columns = call('Array', [['repeating', column], ['count', role.columns]]);
        v = view('LazyVGrid', [['columns', columns], ['spacing', lineGap]], items);
      } else {
        this.helpers.add('flow');
        v = view('FlowLayout', [['spacing', gap], ['lineSpacing', lineGap]], items.filter(Boolean));
      }
    } else {
      const [top, right, bottom, left] = this.paddingValues(node);
      const availCross = row ? node.height - top - bottom : node.width - left - right;
      const crossAt = { CENTER: '', MAX: row ? 'bottom' : 'trailing' }[node.counterAxisAlignItems] ?? (row ? 'top' : 'leading');
      const spread = between && !hugMain && flow.length > 1;
      const one = (c) => {
        const item = this.node(c, ctx);
        const extent = (row ? c.height : c.width) || 0;
        if (!item || hugCross || sizingOf(c, node, cross) === 'FILL' || extent <= availCross + 0.5) return item;
        // A frame of fixed size does not grow with what overflows it, unless
        // the screen stretches it.
        const parent = this.ancestors[this.ancestors.length - 2];
        if (ownSizing(node, cross) === 'FIXED' && parent && !(this.screen && parent.id === this.screen.id)) return item;
        // A row wider than its column scrolls sideways; a carousel snaps to its cards.
        if (!row && c.layoutMode === 'HORIZONTAL') {
          let scroller = view('ScrollView', [[null, raw('.horizontal')]], [item]);
          if (this.margins.has(c.id)) {
            scroller = mod(scroller, 'contentMargins', [[null, raw('.horizontal')], [null, this.margins.get(c.id)], ['for', raw('.scrollContent')]]);
            scroller = mod(scroller, 'scrollTargetBehavior', [[null, raw('.viewAligned')]]);
          }
          scroller = mod(mod(scroller, 'scrollIndicators', [[null, raw('.hidden')]]), 'frame', [['height', round(c.height)]]);
          // A scroll view would report its content's width to the layout: it is as wide as the column.
          return this.screen && node.width >= this.screen.width * 0.95
            ? mod(scroller, 'containerRelativeFrame', [[null, raw('.horizontal')]])
            : mod(scroller, 'frame', [['width', round(availCross)]]);
        }
        // Another child larger than the stack across overflows it, as in
        // Figma, instead of widening the stack.
        const box = this.frame(clear(), row ? { w: round(c.width), h: null } : { w: null, h: round(c.height) });
        return mod(box, 'overlay', crossAt ? [['alignment', raw(`.${crossAt}`)]] : [], [item]);
      };
      let items = [];
      const runs = this.inComponent ? [] : runsOf(flow);
      for (let i = 0; i < flow.length; i++) {
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
      v = view(carousel ? 'LazyHStack' : row ? 'HStack' : 'VStack', [
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
    }
    for (const [name, args] of this.containerMods.get(node.id) || []) v = mod(v, name, args);
    const main = node.primaryAxisAlignItems || 'MIN';
    const counter = node.counterAxisAlignItems === 'BASELINE' ? 'MIN' : node.counterAxisAlignItems || 'MIN';
    const align = row ? alignmentOf(H_ALIGN[main] ?? 'leading', V_ALIGN[counter] ?? 'top')
      : alignmentOf(H_ALIGN[counter] ?? 'leading', V_ALIGN[main] ?? 'top');
    const scroller = node.layoutWrap !== 'WRAP' && (kind === 'chips' || kind === 'tabs') ? this.chipScroller(node, flow, v) : null;
    if (scroller) v = scroller;
    else if (node.layoutWrap !== 'WRAP') v = this.overflow(node, flow, v, { row, hugMain, hugCross, crossFill, spacing, between, align });
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
  const writer = new SwiftUIWriter(assets, options);
  writer.ratios = autoLineRatios(root);
  const rootNode = { ...root, x: root.x ?? 0, y: root.y ?? 0 };
  const screen = options.screen ?? isPhoneScreen(rootNode);
  const structName = options.structName || sType(root.name, 'Design');
  writer.structName = structName;
  writer.typeNames.add(structName);
  writer.roles = detectRoles(rootNode);
  let tree = null;
  if (screen) {
    writer.screen = rootNode;
    try {
      tree = writer.screenRoot(rootNode);
    } catch (e) {
      writer.warnings.push({ id: root.id, name: root.name, message: `drawn at its design size: ${e.message}` });
      writer.screen = null;
      Object.assign(writer, {
        props: [], skip: new Set(), components: [], models: [], states: [], lets: [], propNames: new Set(['body']),
        cases: new Map(), containerMods: new Map(), margins: new Map(), tapped: false,
      });
    }
  }
  tree = tree || writer.node(rootNode, { kind: 'root' }) || view('EmptyView');
  const lines = [
    'import SwiftUI',
    '',
    ...[...writer.connected.values()].map((m) => `// ${m.componentName}: ${m.source}${m.label ? ` (${m.label})` : ''}`),
    ...(writer.connected.size ? [''] : []),
    `struct ${structName}: View {`,
    ...(writer.tapped ? [`  var action: (${structName}Action) -> Void = { _ in }`] : []),
    ...writer.states,
    ...(writer.tapped || writer.states.length ? [''] : []),
    '  var body: some View {',
    `    ${print(tree, 2)}`,
    '  }',
    ...writer.props.flatMap((p) => ['', printProperty(p)]),
    ...writer.lets.flatMap((l) => ['', l]),
    '}',
    ...(writer.tapped ? ['', ...actionEnum(structName, writer.cases)] : []),
    ...writer.components.flatMap((c) => ['', c]),
    ...writer.models.flatMap((m) => ['', m]),
  ];
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
  for (const name of ['color', 'flow', 'pressable']) {
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
  };
}

/** The screen's action enum: what tapping its controls asks the owner to do. */
function actionEnum(structName, cases) {
  const lines = ['/// What the screen asks its owner to do.', `enum ${structName}Action: Hashable {`];
  for (const [name, payload] of cases) lines.push(`  case ${name}${payload ? `(${payload})` : ''}`);
  lines.push('}');
  return lines;
}

/** The roles with a SwiftUI pattern, for the response: [{ id, name, role, pattern, items?, selected? }]. */
function structureOf(roles, root) {
  const nameOf = (id) => {
    let found = null;
    const walk = (n) => {
      if (found || !n) return;
      if (n.id === id) found = n;
      else (n.children || []).forEach(walk);
    };
    walk(root);
    return found ? found.name : id;
  };
  const out = [];
  for (const r of roles.values()) {
    const pattern = SWIFTUI_PATTERNS[r.role];
    if (!pattern) continue;
    const entry = { id: r.id, name: r.name, role: r.role, pattern };
    if (r.items) entry.items = r.items.length;
    if (typeof r.selected === 'number' && r.selected >= 0) entry.selected = nameOf(r.items[r.selected]);
    if (r.label) entry.label = r.label;
    if (r.role === 'sectionHeader') entry.link = r.link ? nameOf(r.link) : null;
    out.push(entry);
  }
  return out;
}

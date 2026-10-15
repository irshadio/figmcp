// Reference SwiftUI code for a node tree. Auto-layout frames become HStacks
// and VStacks, other frames ZStacks whose children are placed by their
// constraints; paints become shape fills, overlays and shadows. Values are
// the design's points.
import { linearTransform, rotationOf } from '../geometry.js';
import { inFlow, isAutoLayout, isGrid, sizingOf } from '../layout.js';
import { drawnAsSvg, isTurned, straightLine, visibleChildren } from '../nodes.js';
import { sideWeights } from '../paint.js';
import { isPhoneScreen, minPageHeight, TALL_SCREEN, WRAPPING_PARENTS } from '../screen.js';
import { autoLineRatios, fontWeight, segmentsOf } from '../text.js';
import { visiblePaints } from '../util.js';
import {
  blendMode, blurs, composite, effectsOf, gradient, HELPERS, isRectangle, sColor, shadowArgs, shapeOf, swiftBlur,
} from './paint.js';
import { array, call, mod, print, raw, sIdent, sNum, str, sType, view } from './swift.js';
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
  constructor(assets, { connect = null } = {}) {
    this.assets = assets;
    this.connect = connect;
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
    if (!node || node.visible === false || node.isMask) return null;
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
    let core = this.core(node, ctx, size);
    if (ctx.kind !== 'root' && EXTRACT_TYPES.has(node.type) && countVisible(node) >= EXTRACT_SIZE) core = this.extract(node, core);
    return this.wrapPlace(node, ctx, core);
  }

  /** A view property holding [v], referenced by name. */
  extract(node, v) {
    let name = sIdent(node.name, 'section');
    for (let i = 2; this.propNames.has(name); i++) name = `${sIdent(node.name, 'section')}${i}`;
    this.propNames.add(name);
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
    if (ctx.kind === 'flex') {
      const out = { w: null, h: null };
      for (const axis of ['x', 'y']) {
        const key = axis === 'x' ? 'w' : 'h';
        let mode = sizingOf(node, ctx.parent, axis);
        if (mode === 'FILL' && axis === ctx.axis && ctx.hugMain) mode = 'FIXED';
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
    if (parent === this.screen && cons.horizontal !== 'MAX' && cons.horizontal !== 'STRETCH' && !hugsWidth(node) &&
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
    let v = textView(node, this.textCtx(node)).view;
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

  svg(node, size) {
    const name = this.asset(this.assets.svg(node.svg), 'svg', node.name, 'svg');
    return this.picture(node, size, node.svgBounds, mod(view('Image', [[null, str(name)]]), 'resizable'));
  }

  render(node, size) {
    this.rasterized.push({ id: node.id, name: node.name, reason: node.rasterized });
    const name = this.asset(this.assets.render(node.render), 'image', node.name, 'png');
    return this.picture(node, size, node.renderBounds, mod(view('Image', [[null, str(name)]]), 'resizable'));
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
    const name = this.asset(source, 'image', node.name, this.assets.imageExt ? this.assets.imageExt(paint.imageHash) : 'png');
    const image = view('Image', [[null, str(name)]]);
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
    return layer;
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
   * A phone screen: the root fills the screen instead of keeping the
   * design's size. The page is as tall as the screen, and on a screen too
   * short for the layers it keeps the shortest height they fit and scrolls;
   * the layers Figma keeps fixed when scrolling stay on top. Positions are
   * the design's, so at the design size the result is the same.
   */
  screenRoot(node) {
    this.scrolls = ['VERTICAL', 'BOTH'].includes(node.overflowDirection) || node.height > TALL_SCREEN;
    const all = node.children || [];
    const fixedCount = isAutoLayout(node) ? 0 : Math.max(0, Math.min(node.numberOfFixedChildren || 0, all.length));
    const fixed = new Set(all.slice(all.length - fixedCount).map((c) => c.id));
    const children = visibleChildren(node);
    const H = isAutoLayout(node) ? round(node.height) : minPageHeight(node, children.filter((c) => !fixed.has(c.id)));
    const page = (v) => {
      // The page is as wide as the screen whatever its layers' extent.
      const wide = mod(v, 'containerRelativeFrame', [[null, raw('.horizontal')], ['alignment', raw('.topLeading')]]);
      const sized = mod(wide, 'containerRelativeFrame', [[null, raw('.vertical')], ['alignment', raw('.topLeading')]],
        raw(`length, _ in max(length, ${sNum(H)})`));
      return mod(view('ScrollView', [], [sized]), 'scrollBounceBehavior', [[null, raw('.basedOnSize')]]);
    };
    let out;
    if (isAutoLayout(node)) {
      out = page(this.box(node, { w: 'inf', h: 'inf' }));
    } else {
      const ctx = { kind: 'stack', parent: node };
      const moving = children.filter((c) => !fixed.has(c.id)).map((c) => this.node(c, ctx)).filter(Boolean);
      const pinned = children.filter((c) => fixed.has(c.id)).map((c) => this.node(c, ctx)).filter(Boolean);
      const stack = mod(view('ZStack', [['alignment', raw('.topLeading')]], moving), 'frame', [
        ['maxWidth', INFINITY], ['maxHeight', INFINITY], ['alignment', raw('.topLeading')],
      ]);
      out = this.box(node, { w: null, h: null }, {
        content: {
          view: page(stack), padding: null, align: null,
          overlay: pinned.length ? view('ZStack', [['alignment', raw('.topLeading')]], pinned) : null,
        },
      });
    }
    return mod(out, 'ignoresSafeArea');
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
    const overMain = !hugMain && !mainFill && mainTotal > availMain + 0.5;
    const overCross = !hugCross && !crossFill.some(Boolean) && crossMax > availCross + 0.5;
    if (!overMain && !overCross) return v;
    // On an axis the frame hugs, the box keeps the design's size.
    const inner = { x: round(node.width - left - right), y: round(node.height - top - bottom) };
    const hugged = (a) => (a === axis ? hugMain : hugCross);
    const box = this.frame(clear(), { w: hugged('x') ? inner.x : null, h: hugged('y') ? inner.y : null });
    return mod(box, 'overlay', align && align !== '.center' ? [['alignment', raw(align)]] : [], [v]);
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
    let v;
    if (node.layoutWrap === 'WRAP') {
      const items = flow.map((c) => this.node(c, { kind: 'wrap', parent: node })).filter(Boolean);
      if (!row) this.warn(node, 'a vertical wrap is drawn as rows');
      if (node.primaryAxisAlignItems && node.primaryAxisAlignItems !== 'MIN') this.warn(node, 'wrapped rows are drawn start aligned');
      this.helpers.add('flow');
      v = view('FlowLayout', [
        ['spacing', spacing > 0 && !between ? this.value(spacing, vars.itemSpacing) : null],
        ['lineSpacing', node.counterAxisSpacing ? this.value(node.counterAxisSpacing, vars.counterAxisSpacing) : null],
      ], items);
    } else {
      let items = flow.map((c) => this.node(c, ctx)).filter(Boolean);
      const spread = between && !hugMain && items.length > 1;
      if (spread) items = items.flatMap((item, i) => (i ? [view('Spacer', [['minLength', 0]]), item] : [item]));
      if (spacing < 0 && node.itemReverseZIndex) this.warn(node, 'the first child is drawn under the next ones, not above');
      const align = (row ? ROW_ALIGN : COLUMN_ALIGN)[node.counterAxisAlignItems];
      v = view(row ? 'HStack' : 'VStack', [
        ['alignment', align ? raw(align) : null],
        ['spacing', spread ? 0 : this.value(spacing, vars.itemSpacing)],
      ], items);
      // Children that fill a hugging cross axis take the size of the largest child.
      if (hugCross && crossFill.some(Boolean)) v = mod(v, 'fixedSize', [['horizontal', !row], ['vertical', row]]);
    }
    const main = node.primaryAxisAlignItems || 'MIN';
    const counter = node.counterAxisAlignItems === 'BASELINE' ? 'MIN' : node.counterAxisAlignItems || 'MIN';
    const align = row ? alignmentOf(H_ALIGN[main] ?? 'leading', V_ALIGN[counter] ?? 'top')
      : alignmentOf(H_ALIGN[counter] ?? 'leading', V_ALIGN[main] ?? 'top');
    if (node.layoutWrap !== 'WRAP') v = this.overflow(node, flow, v, { row, hugMain, hugCross, crossFill, spacing, between, align });
    // Absolute layers before the first stacked one are drawn behind it.
    const first = children.findIndex((c) => inFlow(c, node));
    const layer = (list) => {
      const items = list.map((c) => this.node(c, { kind: 'stack', parent: node })).filter(Boolean);
      return items.length ? view('ZStack', [['alignment', raw('.topLeading')]], items) : null;
    };
    return {
      view: v, padding: this.paddingValues(node), align,
      underlay: layer(absolute.filter((c) => first >= 0 && children.indexOf(c) < first)),
      overlay: layer(absolute.filter((c) => first < 0 || children.indexOf(c) > first)),
    };
  }
}

function printProperty(p) {
  return [`  private var ${p.name}: some View {`, `    ${print(p.view, 2)}`, '  }'].join('\n');
}

/**
 * Reference SwiftUI code for [root]. Returns { code, structName, screen,
 * scrolls, assets, fonts, tokens, connected, rasterized, warnings }:
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
 */
export function toSwiftUI(root, assets, options = {}) {
  const writer = new SwiftUIWriter(assets, options);
  writer.ratios = autoLineRatios(root);
  const rootNode = { ...root, x: root.x ?? 0, y: root.y ?? 0 };
  const screen = options.screen ?? isPhoneScreen(rootNode);
  let tree = null;
  if (screen) {
    writer.screen = rootNode;
    try {
      tree = writer.screenRoot(rootNode);
    } catch (e) {
      writer.warnings.push({ id: root.id, name: root.name, message: `drawn at its design size: ${e.message}` });
      writer.screen = null;
      writer.props = [];
    }
  }
  tree = tree || writer.node(rootNode, { kind: 'root' }) || view('EmptyView');
  const structName = options.structName || sType(root.name, 'Design');
  const lines = [
    'import SwiftUI',
    '',
    ...[...writer.connected.values()].map((m) => `// ${m.componentName}: ${m.source}${m.label ? ` (${m.label})` : ''}`),
    ...(writer.connected.size ? [''] : []),
    `struct ${structName}: View {`,
    '  var body: some View {',
    `    ${print(tree, 2)}`,
    '  }',
    ...writer.props.flatMap((p) => ['', printProperty(p)]),
    '}',
  ];
  if (options.preview !== false) lines.push('', '#Preview {', `  ${structName}()`, '}');
  if (writer.textStyles.size) {
    lines.push('', 'enum AppFonts {');
    for (const t of writer.textStyles.values()) {
      lines.push(`  static let ${t.ident}: Font = ${t.code} // ${t.name}`);
    }
    lines.push('}');
  }
  if (writer.tokens.size) {
    lines.push('', 'enum DesignTokens {');
    for (const t of writer.tokens.values()) {
      lines.push(t.type === 'Color'
        ? `  static let ${t.ident} = ${t.code} // ${t.name}`
        : `  static let ${t.ident}: CGFloat = ${t.code} // ${t.name}`);
    }
    lines.push('}');
  }
  for (const name of ['color', 'flow']) {
    if (writer.helpers.has(name)) lines.push('', HELPERS[name]);
  }
  const assetsMap = {};
  for (const [name, info] of writer.names) assetsMap[name] = info;
  const fonts = {};
  for (const [family, weights] of writer.fonts) fonts[family] = [...weights].sort();
  return {
    code: `${lines.join('\n')}\n`,
    structName,
    screen: Boolean(writer.screen),
    scrolls: Boolean(writer.screen && writer.scrolls),
    assets: assetsMap,
    fonts,
    tokens: [...writer.tokens.values()].map((t) => ({ name: t.name, swift: `DesignTokens.${t.ident}`, value: t.code })),
    connected: [...writer.connected.values()],
    rasterized: writer.rasterized,
    warnings: writer.warnings,
  };
}

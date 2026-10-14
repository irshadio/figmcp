// Reference Flutter code for a node tree. Auto-layout frames become Rows,
// Columns and Wraps, other frames Stacks of Positioned children placed by
// their constraints; paints become decorations. Values are the design's
// logical pixels.
import { linearTransform, rotationOf } from '../geometry.js';
import { inFlow, isAutoLayout, isGrid, sizingOf } from '../layout.js';
import { drawnAsSvg, isTurned, straightLine, visibleChildren } from '../nodes.js';
import { autoLineRatios, segmentsOf } from '../text.js';
import { visiblePaints } from '../util.js';
import {
  call, dColor, dFileName, dIdent, dNum, dType, lambda, list, method, print, raw, str,
} from './dart.js';
import {
  alignment, blendMode, blurSigma, blurs, border, borderRadius, boxShadows, composite, gradient, HELPERS,
} from './paint.js';
import { screenUtil } from './scale.js';
import { fontWeight, runGradient, textWidget } from './text.js';

const WRAPPING_PARENTS = new Set(['GROUP', 'BOOLEAN_OPERATION']);
const MAIN_ALIGN = { CENTER: 'center', MAX: 'end', SPACE_BETWEEN: 'spaceBetween' };
const CROSS_ALIGN = { MIN: 'start', CENTER: 'center', MAX: 'end', BASELINE: 'baseline' };
const WRAP_ALIGN = { MIN: 'start', CENTER: 'center', MAX: 'end', SPACE_BETWEEN: 'spaceBetween' };
const TEXT_ALIGN_X = { CENTER: 0, RIGHT: 1 };
const TEXT_ALIGN_Y = { CENTER: 0, BOTTOM: 1 };
const INFINITY = raw('double.infinity');
// Taller than any phone: the design scrolls.
const TALL_SCREEN = 1000;
// How much further than in the design two overlapping layers may slide over
// each other on a shorter screen, as a share of the smaller one's height.
const EXTRA_OVERLAP = 0.15;
const SCREEN_TYPES = new Set(['FRAME', 'COMPONENT', 'INSTANCE']);

/** A portrait frame of a phone's width, drawn as a screen. */
export function isPhoneScreen(node) {
  return Boolean(node) && SCREEN_TYPES.has(node.type) && node.width >= 300 && node.width <= 480 &&
    node.height >= node.width * 1.5;
}

function isText(node) {
  return node.type === 'TEXT';
}

function hasText(node) {
  if (!node || node.visible === false) return false;
  return isText(node) || (node.children || []).some(hasText);
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

function dim(v) {
  if (v === 'inf') return INFINITY;
  return typeof v === 'number' ? Math.round(v * 100) / 100 : null;
}

function edgeInsets([top, right, bottom, left]) {
  if (![top, right, bottom, left].some((v) => v)) return null;
  if (top === right && right === bottom && bottom === left) return call('EdgeInsets.all', {}, { positional: [top] });
  if (top === bottom && left === right) {
    return call('EdgeInsets.symmetric', { horizontal: left || null, vertical: top || null });
  }
  return call('EdgeInsets.fromLTRB', {}, { positional: [left, top, right, bottom] });
}

class FlutterWriter {
  constructor(assets, { connect = null, keys = false, assetDirs = {}, screenUtil = false } = {}) {
    this.assets = assets;
    this.screenUtil = screenUtil;
    this.connect = connect;
    this.keys = keys;
    this.dirs = { svg: assetDirs.svg || 'assets/figma', image: assetDirs.image || 'assets/figma' };
    this.files = new Map();
    this.paths = new Map();
    this.fonts = new Map();
    this.tokens = new Map();
    this.tokenIdents = new Set();
    this.warnings = [];
    this.rasterized = [];
    this.connected = new Map();
    this.imports = new Set(['package:flutter/material.dart']);
    this.helpers = new Set();
    this.ratios = null;
    this.screen = null;
    this.scrolls = false;
  }

  /** Dart code for a length in design pixels: scaled by flutter_screenutil when it is on. */
  length(v, unit) {
    return this.screenUtil ? `${dNum(v)}.${unit}` : dNum(v);
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
    let ident = dIdent(name, type === 'Color' ? 'color' : 'size');
    for (let i = 2; this.tokenIdents.has(ident); i++) ident = `${dIdent(name)}${i}`;
    this.tokenIdents.add(ident);
    this.tokens.set(name, { ident, type, code, name });
    return raw(`DesignTokens.${ident}`);
  }

  /** A number, or its design token when a variable is bound. */
  value(v, varName) {
    const n = Math.round(v * 100) / 100;
    return (varName && this.token(varName, 'double', dNum(n))) || n;
  }

  /** A Color, or its design token (with the paint's opacity) when a variable is bound. */
  color(color, opacity = 1, varName = null) {
    const literal = raw(dColor(color, opacity));
    if (!varName) return literal;
    const t = this.token(varName, 'Color', dColor(color, 1));
    if (!t) return literal;
    return opacity < 1 ? raw(`${t.code}.withValues(alpha: ${dNum((color.a ?? 1) * opacity)})`, false) : t;
  }

  asset(source, kind, name, ext) {
    if (this.files.has(source)) return this.files.get(source);
    const dir = kind === 'svg' ? this.dirs.svg : this.dirs.image;
    const base = dFileName(name, kind === 'svg' ? 'icon' : 'image');
    let path = `${dir}/${base}.${ext}`;
    for (let i = 2; this.paths.has(path); i++) path = `${dir}/${base}_${i}.${ext}`;
    this.files.set(source, path);
    this.paths.set(path, source);
    return path;
  }

  font(seg) {
    const family = seg.fontName && seg.fontName.family;
    if (!family) return;
    if (!this.fonts.has(family)) this.fonts.set(family, new Set());
    const italic = /italic|oblique/i.test(seg.fontName.style || '');
    this.fonts.get(family).add(`${fontWeight(seg)}${italic ? ' italic' : ''}`);
  }

  keyed(node, args) {
    return this.keys ? { key: call('ValueKey', {}, { positional: [str(node.id)] }), ...args } : args;
  }

  // Tree.

  /** The widget for [node] in its parent's [ctx], or null when not drawn. */
  node(node, ctx) {
    if (!node || node.visible === false || node.isMask) return null;
    const mark = { warnings: this.warnings.length };
    let widget;
    try {
      widget = this.place(node, ctx);
    } catch (e) {
      // One unreadable layer must not cost the whole frame: a box of its
      // size stands in for it.
      this.warnings.length = mark.warnings;
      const reason = String(e && e.message ? e.message : e);
      this.warnings.push({ id: node.id, name: node.name, message: `drawn as an empty box: ${reason}` });
      const box = (size) => call('SizedBox', this.keyed(node, { width: dim(size.w), height: dim(size.h) }));
      try {
        const size = this.sizeFor(node, ctx, true);
        widget = this.wrapPlace(node, ctx, box(size), size);
      } catch {
        widget = box({ w: typeof node.width === 'number' ? node.width : null, h: typeof node.height === 'number' ? node.height : null });
      }
    }
    return widget;
  }

  place(node, ctx) {
    if (node.error) throw new Error(`the plugin could not read this layer (${node.error})`);
    const fixed = Boolean(node.svg || node.render);
    const size = this.sizeFor(node, ctx, fixed);
    return this.wrapPlace(node, ctx, this.core(node, ctx, size), size);
  }

  /**
   * The node's size in [ctx]: { w, h, expand } with w and h a number, 'inf'
   * (fill the parent's bounded axis) or null (its content, or the parent,
   * sizes it).
   */
  sizeFor(node, ctx, fixed = false) {
    const W = node.width;
    const H = node.height;
    const hugW = hugsWidth(node);
    const hugH = hugsHeight(node);
    const content = (axis) => (isAutoLayout(node) && ownSizing(node, axis) === 'HUG') || (axis === 'x' ? hugW : hugH);
    if (ctx.kind === 'root') return { w: W, h: H };
    if (ctx.kind === 'flex') {
      const out = { w: null, h: null, expand: false };
      for (const axis of ['x', 'y']) {
        const key = axis === 'x' ? 'w' : 'h';
        let mode = sizingOf(node, ctx.parent, axis);
        if (mode === 'FILL' && axis === ctx.axis && ctx.hugMain) mode = 'FIXED';
        if (mode === 'FILL') {
          if (axis === ctx.axis) out.expand = true;
          else if (!ctx.stretch) out[key] = 'inf';
        } else if (fixed || !(mode === 'HUG' && content(axis))) {
          if (!(axis === 'x' ? hugW : hugH) || fixed) out[key] = axis === 'x' ? W : H;
        }
      }
      return out;
    }
    if (ctx.kind === 'stack') {
      const place = this.stackPlacement(node, ctx.parent);
      return {
        w: place.ownWidth ? W : null,
        h: place.ownHeight ? H : null,
      };
    }
    // Wrap children and free boxes keep their design size unless they hug.
    return {
      w: !fixed && (hugW || content('x')) ? null : W,
      h: !fixed && (hugH || content('y')) ? null : H,
    };
  }

  wrapPlace(node, ctx, widget, size) {
    if (ctx.kind === 'flex' && size.expand) return call('Expanded', { child: widget });
    if (ctx.kind === 'stack') return this.positioned(node, ctx.parent, widget);
    return widget;
  }

  /**
   * How a Stack child is placed from its constraints: Positioned arguments,
   * and for centred or scaled axes the alignment inside a full-size slot.
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
    const axis = (mode, pos, size, total, hug) => {
      switch (mode) {
        case 'MAX': return { args: { end: total - pos - size, size: hug ? null : size } };
        case 'STRETCH': return { args: { start: pos, end: total - pos - size }, fill: true };
        case 'CENTER': return { args: { start: 0, end: 0 }, center: pos + size / 2 - total / 2, own: !hug };
        case 'SCALE': return {
          args: { start: 0, end: 0 },
          scale: size / (total || 1),
          align: total - size ? (2 * pos) / (total - size) - 1 : 0,
        };
        default: return { args: { start: pos, size: hug ? null : size } };
      }
    };
    // Hugging text and hugging auto-layout frames keep their content size.
    const hugX = hugsWidth(node) || (isAutoLayout(node) && ownSizing(node, 'x') === 'HUG');
    const hugY = hugsHeight(node) || (isAutoLayout(node) && ownSizing(node, 'y') === 'HUG');
    const h = axis(cons.horizontal, x, node.width, parent.width, hugX);
    const v = axis(cons.vertical, y, node.height, parent.height, hugY);
    const special = (a) => a.center !== undefined || a.scale !== undefined;
    const slot = special(h) || special(v);
    return {
      h, v, slot,
      // Inside a slot the node sizes itself on axes the slot does not size.
      ownWidth: slot ? (h.scale === undefined && !hugX && !h.fill) : false,
      ownHeight: slot ? (v.scale === undefined && !hugY && !v.fill) : false,
    };
  }

  positioned(node, parent, widget) {
    const p = this.stackPlacement(node, parent);
    const r = (v) => (v === undefined || v === null ? null : Math.round(v * 100) / 100);
    const args = {
      left: r(p.h.args.start), top: r(p.v.args.start), right: r(p.h.args.end), bottom: r(p.v.args.end),
    };
    if (!p.slot) {
      args.width = r(p.h.args.size);
      args.height = r(p.v.args.size);
      return call('Positioned', { ...args, child: widget });
    }
    // A centred or scaled axis: the slot spans the parent on that axis and
    // the node is aligned in it. Other axes keep their offset.
    let child = widget;
    const dx = p.h.center || 0;
    const dy = p.v.center || 0;
    if (Math.abs(dx) > 0.005 || Math.abs(dy) > 0.005) {
      child = call('Transform.translate', {
        offset: call('Offset', {}, { positional: [Math.round(dx * 100) / 100, Math.round(dy * 100) / 100] }), child,
      }, { constable: false });
    }
    if (p.h.scale !== undefined || p.v.scale !== undefined) {
      child = call('FractionallySizedBox', {
        widthFactor: p.h.scale !== undefined ? Math.round(p.h.scale * 10000) / 10000 : null,
        heightFactor: p.v.scale !== undefined ? Math.round(p.v.scale * 10000) / 10000 : null,
        child,
      });
    }
    const ax = p.h.scale !== undefined ? p.h.align : p.h.center !== undefined ? 0 : p.h.args.end !== undefined && p.h.args.start === undefined ? 1 : -1;
    const ay = p.v.scale !== undefined ? p.v.align : p.v.center !== undefined ? 0 : p.v.args.end !== undefined && p.v.args.start === undefined ? 1 : -1;
    const at = ax === 0 && ay === 0 ? call('Center', { child })
      : call('Align', { alignment: alignment((ax + 1) / 2, (ay + 1) / 2), child });
    if ([args.left, args.top, args.right, args.bottom].every((v) => v === 0)) return call('Positioned.fill', { child: at });
    return call('Positioned', { ...args, child: at });
  }

  /** The node's own widget at [size]. */
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
    const args = {};
    for (const [key, prop] of Object.entries(node.componentProperties || {})) {
      if (!prop || prop.type === 'INSTANCE_SWAP') continue;
      const name = dIdent(String(key).replace(/#.*$/, ''), 'prop');
      args[name] = prop.type === 'BOOLEAN' ? Boolean(prop.value) : str(String(prop.value ?? ''));
    }
    const widget = call(mapping.componentName, args, { constable: false });
    return this.sized(node, size, widget);
  }

  sized(node, size, child) {
    const width = dim(size.w);
    const height = dim(size.h);
    if (width === null && height === null) {
      return this.keys ? call('KeyedSubtree', { key: this.keyed(node, {}).key, child }) : child;
    }
    return call('SizedBox', this.keyed(node, { width, height, child }));
  }

  turned(node, size) {
    const m = linearTransform(node);
    const deg = rotationOf(m);
    const flat = { ...node, rotation: 0, transform: null };
    const own = { w: node.rawWidth, h: node.rawHeight };
    const inner = isText(node) ? this.text(flat, own, { keyed: false }) : this.box(flat, own, { keyed: false });
    let child;
    if (deg !== null) {
      child = call('Transform.rotate', { angle: Math.round(((deg * Math.PI) / 180) * 10000) / 10000, child: inner }, { constable: false });
    } else if (Math.abs(m.b) < 1e-4 && Math.abs(m.c) < 1e-4 && Math.abs(Math.abs(m.a) - 1) < 1e-4 && Math.abs(Math.abs(m.d) - 1) < 1e-4) {
      child = call('Transform.flip', { flipX: m.a < 0 || null, flipY: m.d < 0 || null, child: inner }, { constable: false });
    } else {
      const matrix = [m.a, m.b, 0, 0, m.c, m.d, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1].map((v) => Math.round(v * 10000) / 10000);
      child = call('Transform', {
        alignment: raw('Alignment.center'),
        transform: call('Matrix4', {}, { positional: matrix, constable: false }),
        child: inner,
      }, { constable: false });
    }
    // The bounding box holds the unturned box, turned about its centre.
    const box = call('OverflowBox', {
      minWidth: node.rawWidth, maxWidth: node.rawWidth, minHeight: node.rawHeight, maxHeight: node.rawHeight, child,
    });
    return call('SizedBox', this.keyed(node, { width: dim(size.w ?? node.width), height: dim(size.h ?? node.height), child: box }));
  }

  textCtx(node) {
    return {
      ratios: this.ratios,
      value: (v, name) => this.value(v, name),
      color: (c, o, name) => this.color(c, o, name),
      warn: (message) => this.warn(node, message),
    };
  }

  text(node, size, { keyed = true } = {}) {
    const segs = segmentsOf(node);
    segs.forEach((seg) => this.font(seg));
    if (visiblePaints(node.strokes).length && typeof node.strokeWeight === 'number' && node.strokeWeight > 0) {
      this.warn(node, 'a text stroke is not drawn');
    }
    const shared = runGradient(segs[0]);
    const masked = Boolean(shared) && segs.every((s) => JSON.stringify(runGradient(s)) === JSON.stringify(shared));
    let { widget } = textWidget(node, { ...this.textCtx(node), masked });
    if (masked) {
      const shader = gradient(shared, node.width || 1, node.height || 1, (c, o) => this.color(c, o), (m) => this.warn(node, m));
      widget = call('ShaderMask', {
        blendMode: raw('BlendMode.srcIn'),
        shaderCallback: lambda(['bounds'], method(shader, 'createShader', [raw('bounds', false)])),
        child: widget,
      }, { constable: false });
    }
    const ax = TEXT_ALIGN_X[node.textAlignHorizontal] ?? -1;
    if (node.leadingTrim === 'CAP_HEIGHT') {
      // The box runs from the cap height of the first line to the baseline
      // of the last: place the first baseline from the top of the box. The
      // line count comes from the box (a cap height is about 0.7 em).
      const seg = segs[0] || {};
      const lh = seg.lineHeight && seg.lineHeight.unit === 'PIXELS' ? seg.lineHeight.value
        : seg.lineHeight && seg.lineHeight.unit === 'PERCENT' ? (seg.fontSize * seg.lineHeight.value) / 100
          : (seg.fontSize || 0) * 1.2;
      const breaks = (typeof node.characters === 'string' ? node.characters : '').split(/\n|\u2028/).length;
      const lines = Math.max(1, breaks, lh ? Math.round((node.height - 0.7 * (seg.fontSize || 0)) / lh) + 1 : 1);
      const first = node.height - (lines - 1) * lh;
      // The box keeps Figma's size; the text overflows it above the cap
      // height and below the baseline.
      const hugW = hugsWidth(node);
      widget = call('SizedBox', {
        width: hugW ? Math.round(node.width * 100) / 100 : null,
        height: Math.round(node.height * 100) / 100,
        child: call('OverflowBox', {
          alignment: alignment((ax + 1) / 2, 0),
          ...(hugW ? { minWidth: 0, maxWidth: INFINITY } : {}),
          minHeight: 0,
          maxHeight: INFINITY,
          child: call('Baseline', {
            baseline: Math.round(first * 100) / 100,
            baselineType: raw('TextBaseline.alphabetic'),
            child: widget,
          }),
        }),
      });
    } else if ((node.textAutoResize === 'NONE' || node.textAutoResize === 'TRUNCATE') && TEXT_ALIGN_Y[node.textAlignVertical] !== undefined) {
      widget = call('Align', { alignment: alignment((ax + 1) / 2, (TEXT_ALIGN_Y[node.textAlignVertical] + 1) / 2), child: widget });
    }
    const box = keyed ? this.sized(node, size, widget)
      : call('SizedBox', { width: dim(size.w), height: dim(size.h), child: widget });
    return this.effects(node, box, blurs(node));
  }

  line(node, size, line) {
    const w = line.weight;
    const ext = line.cap === 'NONE' ? 0 : w / 2;
    const paint = line.paint.type === 'SOLID'
      ? { color: this.color(line.paint.color, line.paint.opacity ?? 1, line.varName) }
      : { gradient: gradient(line.paint, line.horizontal ? node.width : w, line.horizontal ? w : node.height, (c, o) => this.color(c, o)) };
    const bar = line.cap === 'ROUND' || paint.gradient
      ? call('DecoratedBox', {
        decoration: call('BoxDecoration', {
          ...paint,
          borderRadius: line.cap === 'ROUND' ? call('BorderRadius.circular', {}, { positional: [w / 2], constable: false }) : null,
        }),
      })
      : call('ColoredBox', { color: paint.color });
    const along = line.horizontal ? size.w : size.h;
    const across = line.horizontal
      ? { minHeight: w, maxHeight: w, ...(ext ? { minWidth: (node.width || 0) + 2 * ext, maxWidth: (node.width || 0) + 2 * ext } : {}) }
      : { minWidth: w, maxWidth: w, ...(ext ? { minHeight: (node.height || 0) + 2 * ext, maxHeight: (node.height || 0) + 2 * ext } : {}) };
    const box = call('SizedBox', this.keyed(node, {
      width: line.horizontal ? dim(along) : 0,
      height: line.horizontal ? 0 : dim(along),
      child: call('OverflowBox', { ...across, child: bar }),
    }));
    return this.effects(node, box, blurs(node));
  }

  /** An image or SVG drawn at its render bounds, which can exceed the layer's box. */
  picture(node, size, bounds, image) {
    const b = bounds;
    const exact = !b || (Math.abs(b.x - node.x) < 0.01 && Math.abs(b.y - node.y) < 0.01 &&
      Math.abs(b.width - node.width) < 0.01 && Math.abs(b.height - node.height) < 0.01);
    if (exact) return this.sized(node, size, image);
    const r = (v) => Math.round(v * 100) / 100;
    return call('SizedBox', this.keyed(node, {
      width: dim(size.w),
      height: dim(size.h),
      child: call('Stack', {
        clipBehavior: raw('Clip.none'),
        children: list([call('Positioned', {
          left: r(b.x - node.x),
          top: r(b.y - node.y),
          right: r(node.x + node.width - b.x - b.width),
          bottom: r(node.y + node.height - b.y - b.height),
          child: image,
        })]),
      }),
    }));
  }

  svg(node, size) {
    const path = this.asset(this.assets.svg(node.svg), 'svg', node.name, 'svg');
    this.imports.add('package:flutter_svg/flutter_svg.dart');
    const picture = call('SvgPicture.asset', { fit: raw('BoxFit.fill') }, { positional: [str(path)], constable: false });
    return this.picture(node, size, node.svgBounds, picture);
  }

  render(node, size) {
    this.rasterized.push({ id: node.id, name: node.name, reason: node.rasterized });
    const path = this.asset(this.assets.render(node.render), 'image', node.name, 'png');
    const image = call('Image.asset', { fit: raw('BoxFit.fill') }, { positional: [str(path)], constable: false });
    return this.picture(node, size, node.renderBounds, image);
  }

  /** Fill layers: { base, image, layers } for a BoxDecoration and extra layers under the content. */
  fills(node) {
    const vars = node.vars || {};
    const paints = (Array.isArray(node.fills) ? node.fills : [])
      .map((p, i) => ({ p, i })).filter(({ p }) => p && p.visible !== false);
    const blendOf = (p) => {
      const mode = blendMode(p.blendMode);
      if (mode === null) this.warn(node, `the ${p.blendMode.toLowerCase()} blend of a fill is drawn normal`);
      return mode && mode !== 'normal' ? mode : null;
    };
    // Solid paints over solid paints composite to one colour.
    const merged = [];
    for (const item of paints) {
      const last = merged[merged.length - 1];
      if (item.p.type === 'SOLID' && last && last.p.type === 'SOLID' && !blendOf(item.p) && !blendOf(last.p)) {
        const c = composite({ color: last.p.color, opacity: last.p.opacity ?? 1 }, { color: item.p.color, opacity: item.p.opacity ?? 1 });
        merged[merged.length - 1] = { p: { type: 'SOLID', color: c.color, opacity: 1 }, i: -1 };
      } else merged.push(item);
    }
    const paintOf = ({ p, i }) => {
      if (p.type === 'SOLID') return { color: this.color(p.color, p.opacity ?? 1, i >= 0 ? vars[`fill.${i}`] : null) };
      if (String(p.type).startsWith('GRADIENT')) {
        return { gradient: gradient(p, node.width, node.height, (c, o) => this.color(c, o), (m) => this.warn(node, m)) };
      }
      if (p.type === 'IMAGE') return { image: p };
      return null;
    };
    const items = merged.map((m) => {
      const item = paintOf(m);
      const blend = blendOf(m.p);
      return item && blend ? { ...item, blend } : item;
    }).filter(Boolean);
    const out = { base: null, image: null, layers: [] };
    items.forEach((item, k) => {
      if (k === 0 && !item.image && !item.blend) out.base = item;
      else if (k === items.length - 1 && item.image && item.image.scaleMode !== 'CROP' && !out.image && !item.blend) out.image = item.image;
      else out.layers.push(item);
    });
    return out;
  }

  decorationImage(node, paint) {
    const source = this.assets.image(paint.imageHash);
    if (!source) {
      this.warn(node, 'an image fill has no image data');
      return null;
    }
    const path = this.asset(source, 'image', node.name, this.assets.imageExt ? this.assets.imageExt(paint.imageHash) : 'png');
    const args = { image: call('AssetImage', {}, { positional: [str(path)] }) };
    if (paint.scaleMode === 'TILE') {
      const s = paint.scalingFactor || 1;
      Object.assign(args, {
        repeat: raw('ImageRepeat.repeat'), fit: raw('BoxFit.none'), alignment: raw('Alignment.topLeft'),
        scale: s !== 1 ? Math.round((1 / s) * 10000) / 10000 : null,
      });
    } else {
      args.fit = raw(paint.scaleMode === 'FIT' ? 'BoxFit.contain' : 'BoxFit.cover');
    }
    if (paint.opacity !== undefined && paint.opacity < 1) args.opacity = Math.round(paint.opacity * 100) / 100;
    if (paint.rotation) this.warn(node, 'a rotated image fill is drawn unrotated');
    return call('DecorationImage', args);
  }

  /** A fill drawn as its own layer, blended with the fills under it. */
  fillLayer(node, item, radius) {
    const { blend, ...paint } = item;
    const layer = this.plainFillLayer(node, paint, radius);
    return layer && blend ? this.blend(blend, layer) : layer;
  }

  /** [child] blended with what is painted under it by the Flutter BlendMode [mode]. */
  blend(mode, child) {
    this.helpers.add('blend');
    this.imports.add('package:flutter/rendering.dart');
    return call('_Blend', { mode: raw(`BlendMode.${mode}`), child });
  }

  /** A fill drawn as its own layer: a decorated box, or a cropped image. */
  plainFillLayer(node, item, radius) {
    if (item.image && item.image.scaleMode === 'CROP' && Array.isArray(item.image.imageTransform)) {
      const [[a, b, tx], [c, d, ty]] = item.image.imageTransform;
      if (Math.abs(b) > 1e-6 || Math.abs(c) > 1e-6) this.warn(node, 'a turned image crop is drawn unturned');
      const source = this.assets.image(item.image.imageHash);
      if (!source) {
        this.warn(node, 'an image fill has no image data');
        return null;
      }
      const path = this.asset(source, 'image', node.name, this.assets.imageExt ? this.assets.imageExt(item.image.imageHash) : 'png');
      const W = node.width;
      const H = node.height;
      const r = (v) => Math.round(v * 100) / 100;
      const opacity = item.image.opacity !== undefined && item.image.opacity < 1
        ? call('AlwaysStoppedAnimation', {}, { positional: [r(item.image.opacity)] }) : null;
      const image = call('Positioned', {
        left: r((-tx / a) * W), top: r((-ty / d) * H), width: r(W / a), height: r(H / d),
        child: call('Image.asset', { fit: raw('BoxFit.fill'), opacity }, { positional: [str(path)], constable: false }),
      });
      const stack = call('Stack', { clipBehavior: raw('Clip.hardEdge'), children: list([image]) });
      return radius ? call('ClipRRect', { borderRadius: radius, child: stack }) : call('ClipRect', { child: stack });
    }
    const deco = item.image ? { image: this.decorationImage(node, item.image) } : item;
    if (item.image && !deco.image) return null;
    return call('DecoratedBox', { decoration: call('BoxDecoration', { ...deco, borderRadius: radius, shape: this.circle(node) }) });
  }

  circle(node) {
    return node.type === 'ELLIPSE' && Math.abs(node.width - node.height) < 0.01 ? raw('BoxShape.circle') : null;
  }

  shapeRadius(node) {
    if (node.type === 'ELLIPSE' && Math.abs(node.width - node.height) >= 0.01) {
      return call('BorderRadius.all', {}, {
        positional: [call('Radius.elliptical', {}, { positional: [node.width / 2, node.height / 2] })],
      });
    }
    return borderRadius(node, (v, name) => this.value(v, name));
  }

  box(node, size, { keyed = true, content: given = null } = {}) {
    const radius = this.shapeRadius(node);
    const shape = this.circle(node);
    const fills = this.fills(node);
    const shadows = boxShadows(node, (c) => this.color(c));
    const inner = boxShadows(node, (c) => this.color(c), 'INNER_SHADOW');
    const hasPaint = Boolean(fills.base || fills.image || fills.layers.length);
    if (shadows.length && !hasPaint && visibleChildren(node).length) {
      this.warn(node, 'the drop shadow follows the box, not its content');
    }
    let decoration = fills.base || fills.image || shadows.length || (radius && node.clipsContent)
      ? call('BoxDecoration', {
        ...(fills.base || {}),
        image: fills.image ? this.decorationImage(node, fills.image) : null,
        borderRadius: radius,
        shape,
        boxShadow: shadows.length ? list(shadows) : null,
      })
      : null;
    const stroke = border(node, (c, o, name) => this.color(c, o, name), (m) => this.warn(node, m));
    const foreground = stroke ? call('BoxDecoration', { border: stroke, borderRadius: radius, shape }) : null;
    const content = given || this.content(node);
    let child = content.widget;
    const layers = fills.layers.map((item) => this.fillLayer(node, item, radius)).filter(Boolean);
    if (inner.length) {
      // Inner shadows lie on the fills, under the content.
      this.helpers.add('innerShadow');
      const innerArgs = {
        shadows: list(inner), borderRadius: (!shape && radius) || raw('null'), shape: shape || raw('BoxShape.rectangle'),
      };
      if (layers.length) {
        layers.push(call('DecoratedBox', { decoration: call('_InnerShadowDecoration', { decoration: raw('null'), ...innerArgs }) }));
      } else {
        decoration = call('_InnerShadowDecoration', { decoration: decoration || raw('null'), ...innerArgs });
      }
    }
    let padding = content.padding;
    if (layers.length) {
      // Fill layers cover the whole box; only the content is padded.
      const inside = padding ? call('Padding', { padding, child: child || call('SizedBox', {}) }) : child;
      padding = null;
      child = call('Stack', {
        fit: raw('StackFit.passthrough'),
        clipBehavior: raw('Clip.none'),
        children: list([...layers.map((l) => call('Positioned.fill', { child: l })), inside]),
      });
    }
    const clip = node.clipsContent ? (radius || shape ? raw('Clip.antiAlias') : raw('Clip.hardEdge')) : null;
    const args = {
      width: dim(size.w),
      height: dim(size.h),
      padding,
      decoration: decoration || (clip ? call('BoxDecoration', {}) : null),
      foregroundDecoration: foreground,
      clipBehavior: clip,
      child,
    };
    let widget;
    if (args.decoration || args.foregroundDecoration || args.clipBehavior) {
      widget = call('Container', keyed ? this.keyed(node, args) : args, { constable: false });
    } else if (args.padding) {
      const padded = call('Padding', { padding: args.padding, child: child || call('SizedBox', {}) });
      widget = args.width !== null || args.height !== null
        ? call('SizedBox', keyed ? this.keyed(node, { width: args.width, height: args.height, child: padded }) : { width: args.width, height: args.height, child: padded })
        : (keyed ? this.sized(node, size, padded) : padded);
    } else {
      widget = keyed ? this.sized(node, size, child || call('SizedBox', {}))
        : call('SizedBox', { width: args.width, height: args.height, child });
    }
    return this.effects(node, widget, blurs(node), radius);
  }

  effects(node, widget, fx, radius = null) {
    let out = widget;
    if (fx.background) {
      this.imports.add('dart:ui');
      const filter = call('ui.ImageFilter.blur', { sigmaX: blurSigma(fx.background), sigmaY: blurSigma(fx.background) }, { constable: false });
      out = call('BackdropFilter', { filter, child: out });
      out = radius ? call('ClipRRect', { borderRadius: radius, child: out }) : call('ClipRect', { child: out });
    }
    if (fx.layer) {
      this.imports.add('dart:ui');
      const filter = call('ui.ImageFilter.blur', {
        sigmaX: blurSigma(fx.layer), sigmaY: blurSigma(fx.layer), tileMode: raw('TileMode.decal'),
      }, { constable: false });
      out = call('ImageFiltered', { imageFilter: filter, child: out });
    }
    if (typeof node.opacity === 'number' && node.opacity < 1) {
      out = call('Opacity', { opacity: this.value(node.opacity, node.vars && node.vars.opacity), child: out });
    }
    const mode = blendMode(node.blendMode);
    if (mode === null) this.warn(node, `the ${node.blendMode.toLowerCase()} blend of the layer is drawn normal`);
    else if (mode !== 'normal') out = this.blend(mode, out);
    return out;
  }

  /**
   * The shortest page the screen's [children] fit on as their constraints
   * move them: each layer stays on the page, layers apart in the design never
   * run into each other, and layers that overlap in the design slide only a
   * little further. A layer's top and bottom move up by k times the height
   * the page loses: 0 when pinned to the top, 1 to the bottom, 0.5 centred,
   * and in proportion when scaled.
   */
  minPageHeight(node, children) {
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
    const H = isAutoLayout(node) ? Math.round(node.height * 100) / 100
      : this.minPageHeight(node, children.filter((c) => !fixed.has(c.id)));
    const page = (child) => call('LayoutBuilder', {
      builder: lambda(['context', 'constraints'], call('SingleChildScrollView', {
        child: call('SizedBox', {
          height: raw(`constraints.hasBoundedHeight && constraints.maxHeight > ${this.length(H, 'h')} ? constraints.maxHeight : ${this.length(H, 'h')}`, false),
          child,
        }),
      })),
    });
    // An auto-layout root fills the page with its own box.
    if (isAutoLayout(node)) return page(this.box(node, { w: 'inf', h: 'inf' }));
    const ctx = { kind: 'stack', parent: node };
    const moving = children.filter((c) => !fixed.has(c.id)).map((c) => this.node(c, ctx)).filter(Boolean);
    const pinned = children.filter((c) => fixed.has(c.id)).map((c) => this.node(c, ctx)).filter(Boolean);
    let widget = page(call('Stack', { clipBehavior: raw('Clip.none'), children: list(moving) }));
    if (pinned.length) widget = call('Stack', { children: list([call('Positioned.fill', { child: widget }), ...pinned]) });
    return this.box(node, { w: null, h: null }, { content: { widget, padding: null } });
  }

  /** The children's layout: { widget, padding } (padding for the box to apply). */
  content(node) {
    const children = visibleChildren(node);
    if (isAutoLayout(node)) return this.flex(node, children);
    if (!children.length) return { widget: null, padding: null };
    if (isGrid(node)) this.warn(node, 'a grid is rebuilt with absolute positions');
    const items = children.map((c) => this.node(c, { kind: 'stack', parent: node })).filter(Boolean);
    return {
      widget: call('Stack', {
        clipBehavior: node.clipsContent ? null : raw('Clip.none'),
        children: list(items),
      }),
      padding: null,
    };
  }

  /** Padding (top, right, bottom, left), with the strokes when they are part of the layout. */
  paddingValues(node) {
    const extra = node.strokesIncludedInLayout && visiblePaints(node.strokes).length
      ? ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight']
        .map((k) => (typeof node[k] === 'number' ? node[k] : typeof node.strokeWeight === 'number' ? node.strokeWeight : 0))
      : [0, 0, 0, 0];
    return ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']
      .map((k, i) => Math.round(((node[k] || 0) + extra[i]) * 100) / 100);
  }

  padding(node) {
    return edgeInsets(this.paddingValues(node));
  }

  /**
   * Content larger than a fixed frame overflows it in Figma, without any
   * error; Flutter reports an overflowing Row or Column, so the layout gets
   * room on that axis and keeps Figma's alignment.
   */
  overflow(node, flow, widget, { row, hugMain, hugCross, crossFill, spacing, between }) {
    if (!flow.length) return widget;
    const axis = row ? 'x' : 'y';
    const cross = row ? 'y' : 'x';
    const [top, right, bottom, left] = this.paddingValues(node);
    const size = (c, a) => (a === 'x' ? c.width : c.height) || 0;
    const availMain = (row ? node.width - left - right : node.height - top - bottom);
    const availCross = (row ? node.height - top - bottom : node.width - left - right);
    const mainFill = flow.some((c) => sizingOf(c, node, axis) === 'FILL');
    const mainTotal = flow.reduce((t, c) => t + size(c, axis), 0) + (between ? 0 : spacing * (flow.length - 1));
    const crossMax = Math.max(...flow.map((c) => size(c, cross)));
    const overMain = !hugMain && !mainFill && mainTotal > availMain + 0.5;
    const overCross = !hugCross && !crossFill.some(Boolean) && crossMax > availCross + 0.5;
    if (!overMain && !overCross) return widget;
    const mainAt = { CENTER: 0, MAX: 1 }[node.primaryAxisAlignItems] ?? -1;
    const crossAt = { CENTER: 0, MAX: 1 }[node.counterAxisAlignItems] ?? -1;
    const [ax, ay] = row ? [mainAt, crossAt] : [crossAt, mainAt];
    const open = (a) => (a === 'x' ? { minWidth: 0, maxWidth: INFINITY } : { minHeight: 0, maxHeight: INFINITY });
    const box = call('OverflowBox', {
      alignment: alignment((ax + 1) / 2, (ay + 1) / 2),
      ...(overMain ? open(axis) : {}),
      ...(overCross ? open(cross) : {}),
      child: widget,
    });
    // An OverflowBox takes all the room it is given: on an axis the frame
    // hugs, it takes the content's size instead.
    const hugged = hugMain ? axis : hugCross ? cross : null;
    if (!hugged) return box;
    return call(hugged === 'x' ? 'IntrinsicWidth' : 'IntrinsicHeight', { child: box });
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
    const stretch = flow.length > 0 && crossFill.every(Boolean);
    const between = node.primaryAxisAlignItems === 'SPACE_BETWEEN';
    const spacing = node.itemSpacing || 0;
    const ctx = { kind: 'flex', parent: node, axis, stretch, hugMain };
    let items;
    let widget;
    if (node.layoutWrap === 'WRAP') {
      items = flow.map((c) => this.node(c, { kind: 'wrap', parent: node })).filter(Boolean);
      widget = call('Wrap', {
        direction: row ? null : raw('Axis.vertical'),
        spacing: spacing > 0 && !between ? this.value(spacing, vars.itemSpacing) : null,
        runSpacing: node.counterAxisSpacing ? this.value(node.counterAxisSpacing, vars.counterAxisSpacing) : null,
        alignment: WRAP_ALIGN[node.primaryAxisAlignItems] && node.primaryAxisAlignItems !== 'MIN'
          ? raw(`WrapAlignment.${WRAP_ALIGN[node.primaryAxisAlignItems]}`) : null,
        crossAxisAlignment: node.counterAxisAlignItems === 'CENTER' ? raw('WrapCrossAlignment.center')
          : node.counterAxisAlignItems === 'MAX' ? raw('WrapCrossAlignment.end') : null,
        runAlignment: node.counterAxisAlignContent === 'SPACE_BETWEEN' ? raw('WrapAlignment.spaceBetween') : null,
        children: list(items),
      });
    } else {
      // On a screen, fixed-width children with text may shrink when the
      // screen is narrower than the design; with room they keep their width,
      // so the design size is unchanged.
      const [top, right, bottom, left] = this.paddingValues(node);
      const avail = row ? node.width - left - right : node.height - top - bottom;
      const total = flow.reduce((t, c) => t + ((row ? c.width : c.height) || 0), 0) + (between ? 0 : spacing * (flow.length - 1));
      // A child that fills the row already takes up the change; a flexible
      // child next to it would split the room with it.
      const fills = flow.some((c) => sizingOf(c, node, 'x') === 'FILL');
      const shrinkable = this.screen && row && !hugMain && !fills && spacing >= 0 && total <= avail + 0.5
        ? flow.filter((c) => sizingOf(c, node, 'x') === 'FIXED' && !hugsWidth(c) && hasText(c)) : [];
      items = flow.map((c, i) => {
        let w = this.node(c, ctx);
        if (w && shrinkable.includes(c)) {
          w = call('Flexible', { flex: shrinkable.length > 1 ? Math.max(1, Math.round(c.width * 10)) : null, child: w });
        }
        if (!w || spacing >= 0 || i === flow.length - 1) return w;
        // Negative spacing: the child keeps a slot shortened by the overlap
        // and draws past it, under the next child.
        const r = (v) => Math.max(0, Math.round(v * 100) / 100);
        const extent = (row ? c.width : c.height) + spacing;
        return call('SizedBox', {
          width: r(row ? extent : c.width),
          height: r(row ? c.height : extent),
          child: call('OverflowBox', {
            alignment: raw(row ? 'Alignment.centerLeft' : 'Alignment.topCenter'),
            ...(row ? { maxWidth: INFINITY } : { maxHeight: INFINITY }),
            child: w,
          }),
        });
      }).filter(Boolean);
      if (spacing < 0 && node.itemReverseZIndex) this.warn(node, 'the first child is drawn under the next ones, not above');
      const align = CROSS_ALIGN[node.counterAxisAlignItems] || 'start';
      widget = call(row ? 'Row' : 'Column', {
        mainAxisSize: hugMain ? raw('MainAxisSize.min') : null,
        mainAxisAlignment: MAIN_ALIGN[node.primaryAxisAlignItems] ? raw(`MainAxisAlignment.${MAIN_ALIGN[node.primaryAxisAlignItems]}`) : null,
        crossAxisAlignment: stretch ? raw('CrossAxisAlignment.stretch')
          : align === 'center' ? null : raw(`CrossAxisAlignment.${align}`),
        textBaseline: align === 'baseline' && !stretch ? raw('TextBaseline.alphabetic') : null,
        spacing: spacing > 0 && !between ? this.value(spacing, vars.itemSpacing) : null,
        children: list(items),
      });
      // Children that fill a hugging cross axis take the size of the
      // largest child.
      if (hugCross && crossFill.some(Boolean)) widget = call(row ? 'IntrinsicHeight' : 'IntrinsicWidth', { child: widget });
      widget = this.overflow(node, flow, widget, { row, hugMain, hugCross, crossFill, spacing, between });
    }
    const padding = this.padding(node);
    if (!absolute.length) return { widget, padding };
    const abs = absolute.map((c) => this.node(c, { kind: 'stack', parent: node })).filter(Boolean);
    return {
      widget: call('Stack', {
        fit: raw('StackFit.passthrough'),
        clipBehavior: node.clipsContent ? null : raw('Clip.none'),
        children: list([padding ? call('Padding', { padding, child: widget }) : widget, ...abs]),
      }),
      padding: null,
    };
  }
}

/**
 * Reference Flutter code for [root]. Returns { code, className, screen,
 * scrolls, assets, fonts, tokens, connected, rasterized, warnings, imports }:
 *   assets maps each asset path used in the code to its source;
 *   fonts maps each family to the weights used ("600", "400 italic").
 *
 * [assets] turns embedded data into sources (file paths or URLs):
 *   { svg(text), image(hash), imageExt?(hash), render?({ base64 }) }.
 * [connect] returns a mapping ({ componentName, source, label }) for an
 * instance, or null. [keys] adds a ValueKey with the node id to every
 * layer's widget (used to measure the result). [assetDirs] sets the folders
 * of the asset paths: { svg, image }. [screen] draws the root as a phone
 * screen (it fills the screen and tall frames scroll); by default portrait
 * frames of a phone's width are screens. [screenUtil] writes lengths with
 * flutter_screenutil's .w, .h, .r and .sp.
 */
export function toFlutter(root, assets, options = {}) {
  const writer = new FlutterWriter(assets, options);
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
    }
  }
  tree = tree || writer.node(rootNode, { kind: 'root' }) || call('SizedBox', {});
  if (options.screenUtil) {
    tree = screenUtil(tree);
    writer.imports.add('package:flutter_screenutil/flutter_screenutil.dart');
  }
  const className = options.className || dType(root.name, 'Design');
  const body = print(tree, 2);
  // dart: imports first, then packages, each sorted by URI.
  const imports = [...writer.imports].sort((a, b) => {
    const da = a.startsWith('dart:');
    if (da !== b.startsWith('dart:')) return da ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const importLines = imports.map((i) => (i === 'dart:ui' ? `import 'dart:ui' as ui;` : `import '${i}';`));
  const lines = [
    ...importLines,
    '',
    ...[...writer.connected.values()].map((m) => `// ${m.componentName}: ${m.source}${m.label ? ` (${m.label})` : ''}`),
    ...(writer.connected.size ? [''] : []),
    `class ${className} extends StatelessWidget {`,
    `  const ${className}({super.key});`,
    '',
    '  @override',
    '  Widget build(BuildContext context) {',
    `    return ${body};`,
    '  }',
    '}',
  ];
  for (const name of ['innerShadow', 'blend']) {
    if (writer.helpers.has(name)) lines.push('', HELPERS[name]);
  }
  if (writer.tokens.size) {
    lines.push('', 'abstract final class DesignTokens {');
    for (const t of writer.tokens.values()) {
      lines.push(`  static const ${t.type} ${t.ident} = ${t.code}; // ${t.name}`);
    }
    lines.push('}');
  }
  const assetsMap = {};
  for (const [path, source] of writer.paths) assetsMap[path] = source;
  const fonts = {};
  for (const [family, weights] of writer.fonts) fonts[family] = [...weights].sort();
  return {
    code: `${lines.join('\n')}\n`,
    className,
    screen: Boolean(writer.screen),
    scrolls: Boolean(writer.screen && writer.scrolls),
    assets: assetsMap,
    fonts,
    tokens: [...writer.tokens.values()].map((t) => ({ name: t.name, dart: `DesignTokens.${t.ident}`, value: t.code })),
    connected: [...writer.connected.values()],
    rasterized: writer.rasterized,
    warnings: writer.warnings,
    imports,
  };
}


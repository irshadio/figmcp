// Fills, strokes, radii, shadows and blurs as Flutter paint objects.
import { gradientHandles } from '../geometry.js';
import { sideWeights } from '../paint.js';
import { call, dNum, list, raw } from './dart.js';

const NAMED_ALIGNMENTS = {
  '-1,-1': 'topLeft', '0,-1': 'topCenter', '1,-1': 'topRight',
  '-1,0': 'centerLeft', '0,0': 'center', '1,0': 'centerRight',
  '-1,1': 'bottomLeft', '0,1': 'bottomCenter', '1,1': 'bottomRight',
};
const STROKE_ALIGN = {
  INSIDE: 'BorderSide.strokeAlignInside', CENTER: 'BorderSide.strokeAlignCenter',
  OUTSIDE: 'BorderSide.strokeAlignOutside',
};

/**
 * Flutter's blurRadius for a Figma blur radius. Figma blurs like CSS (a
 * Gaussian with sigma = radius / 2); Flutter turns blurRadius into
 * sigma = blurRadius * 0.57735 + 0.5.
 */
export function flutterBlur(radius) {
  const sigma = (radius || 0) / 2;
  return sigma > 0.5 ? (sigma - 0.5) / 0.57735 : 0;
}

/** Sigma for ImageFilter.blur from a Figma layer or background blur radius. */
export function blurSigma(radius) {
  return (radius || 0) / 2;
}

/** An Alignment for a point of the unit square (0..1 on both axes). */
export function alignment(x, y) {
  const ax = Math.round((x * 2 - 1) * 1000) / 1000;
  const ay = Math.round((y * 2 - 1) * 1000) / 1000;
  const named = NAMED_ALIGNMENTS[`${dNum(ax)},${dNum(ay)}`];
  return named ? raw(`Alignment.${named}`) : call('Alignment', {}, { positional: [ax, ay] });
}

function stops(paint, color) {
  const opacity = paint.opacity ?? 1;
  const list_ = paint.gradientStops || [];
  return {
    colors: list(list_.map((s) => color(s.color, opacity))),
    stops: list(list_.map((s) => Math.round(s.position * 1000) / 1000)),
  };
}

/**
 * A Gradient for a Figma gradient paint in a [w] x [h] box. Linear
 * gradients run between the handles; radial ones are circles (an elliptical
 * one is reported through [warn]); diamonds become radial.
 */
export function gradient(paint, w, h, color, warn = () => {}) {
  const g = gradientHandles(paint);
  const { colors, stops: positions } = stops(paint, color);
  if (paint.type === 'GRADIENT_LINEAR') {
    return call('LinearGradient', {
      begin: alignment(...g.start), end: alignment(...g.end), colors, stops: positions,
    });
  }
  const [cx, cy] = g.center;
  const dx = (g.rx[0] - cx) * w;
  const dy = (g.rx[1] - cy) * h;
  if (paint.type === 'GRADIENT_ANGULAR') {
    const angle = Math.atan2(dy, dx);
    return call('SweepGradient', {
      center: alignment(cx, cy), colors, stops: positions,
      transform: Math.abs(angle) > 1e-3 ? call('GradientRotation', {}, { positional: [Math.round(angle * 10000) / 10000] }) : null,
    });
  }
  const rx = Math.hypot(dx, dy);
  const ry = Math.hypot((g.ry[0] - cx) * w, (g.ry[1] - cy) * h);
  if (paint.type === 'GRADIENT_DIAMOND') warn('a diamond gradient is drawn as a radial gradient');
  else if (Math.abs(rx - ry) > Math.max(1, 0.02 * Math.max(rx, ry))) warn('an elliptical radial gradient is drawn as a circle');
  const shortest = Math.min(w, h) || 1;
  return call('RadialGradient', {
    center: alignment(cx, cy), radius: Math.round(((rx + ry) / 2 / shortest) * 1000) / 1000, colors, stops: positions,
  });
}

/** The node's corner radii as a BorderRadius, or null. */
export function borderRadius(node, value) {
  if (node.type === 'ELLIPSE') return null;
  const keys = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
  const vars = node.vars || {};
  const corners = keys.map((k) => ({
    v: typeof node[k] === 'number' ? node[k] : typeof node.cornerRadius === 'number' ? node.cornerRadius : 0,
    name: vars[k] || null,
  }));
  if (!corners.some((c) => c.v > 0)) return null;
  // A radius larger than half the shorter side is drawn as a pill in Figma.
  const cap = Math.min(node.width || Infinity, node.height || Infinity) / 2;
  const r = (c) => (c.v > cap ? Math.round(cap * 100) / 100 : value(c.v, c.name, 'double'));
  if (corners.every((c) => c.v === corners[0].v && c.name === corners[0].name)) {
    return call('BorderRadius.circular', {}, { positional: [r(corners[0])], constable: false });
  }
  const named = {};
  ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].forEach((k, i) => {
    if (corners[i].v > 0) named[k] = call('Radius.circular', {}, { positional: [r(corners[i])] });
  });
  return call('BorderRadius.only', named);
}

/**
 * The node's strokes as a Border for a foreground decoration, or null.
 * Only solid paints are drawn; others are reported through [warn].
 */
export function border(node, color, warn = () => {}) {
  const paints = (Array.isArray(node.strokes) ? node.strokes : []).filter((p) => p && p.visible !== false);
  if (!paints.length) return null;
  const sides = sideWeights(node);
  if (!sides.some((s) => s > 0)) return null;
  const vars = node.vars || {};
  const top = paints[paints.length - 1];
  const index = node.strokes.indexOf(top);
  let paintColor;
  if (top.type === 'SOLID') paintColor = color(top.color, top.opacity ?? 1, vars[`stroke.${index}`] || vars.strokes);
  else if (String(top.type).startsWith('GRADIENT') && top.gradientStops && top.gradientStops.length) {
    warn('a gradient stroke is drawn in its first colour');
    paintColor = color(top.gradientStops[0].color, top.opacity ?? 1);
  } else return null;
  if (paints.length > 1) warn('only the top stroke paint is drawn');
  if (Array.isArray(node.dashPattern) && node.dashPattern.length) warn('a dashed stroke is drawn solid');
  const align = STROKE_ALIGN[node.strokeAlign] || STROKE_ALIGN.INSIDE;
  const side = (w) => call('BorderSide', {
    color: paintColor, width: w,
    strokeAlign: align === STROKE_ALIGN.INSIDE ? null : raw(align),
  });
  if (sides.every((s) => s === sides[0])) {
    return call('Border.fromBorderSide', {}, { positional: [side(sides[0])] });
  }
  const named = {};
  ['top', 'right', 'bottom', 'left'].forEach((k, i) => {
    if (sides[i] > 0) named[k] = side(sides[i]);
  });
  return call('Border', named);
}

/** BoxShadows for the node's drop shadows (inner shadows are reported through [warn]). */
export function boxShadows(node, color, warn = () => {}) {
  const effects = (Array.isArray(node.effects) ? node.effects : []).filter((e) => e && e.visible !== false);
  if (effects.some((e) => e.type === 'INNER_SHADOW')) warn('inner shadows are not drawn');
  return effects.filter((e) => e.type === 'DROP_SHADOW').map((e) => call('BoxShadow', {
    color: color(e.color || { r: 0, g: 0, b: 0, a: 0.25 }),
    offset: call('Offset', {}, { positional: [e.offset?.x ?? 0, e.offset?.y ?? 0] }),
    blurRadius: Math.round(flutterBlur(e.radius) * 100) / 100 || null,
    spreadRadius: e.spread || null,
  }));
}

/** Text shadows for a text node's drop shadows. */
export function textShadows(node, color) {
  const effects = (Array.isArray(node.effects) ? node.effects : []).filter((e) => e && e.visible !== false);
  return effects.filter((e) => e.type === 'DROP_SHADOW').map((e) => call('Shadow', {
    color: color(e.color || { r: 0, g: 0, b: 0, a: 0.25 }),
    offset: call('Offset', {}, { positional: [e.offset?.x ?? 0, e.offset?.y ?? 0] }),
    blurRadius: Math.round(flutterBlur(e.radius) * 100) / 100 || null,
  }));
}

/** { layer, background } blur radii of the node, 0 when none. */
export function blurs(node) {
  const effects = (Array.isArray(node.effects) ? node.effects : []).filter((e) => e && e.visible !== false);
  const find = (type) => effects.filter((e) => e.type === type).reduce((m, e) => Math.max(m, e.radius || 0), 0);
  return { layer: find('LAYER_BLUR'), background: find('BACKGROUND_BLUR') };
}

/** Composites solid [top] over solid [bottom] (both { color, opacity }). */
export function composite(bottom, top) {
  const ta = (top.color.a ?? 1) * (top.opacity ?? 1);
  const ba = (bottom.color.a ?? 1) * (bottom.opacity ?? 1);
  const a = ta + ba * (1 - ta);
  if (a <= 0) return { color: { r: 0, g: 0, b: 0, a: 0 }, opacity: 1 };
  const mix = (k) => (top.color[k] * ta + bottom.color[k] * ba * (1 - ta)) / a;
  return { color: { r: mix('r'), g: mix('g'), b: mix('b'), a }, opacity: 1 };
}

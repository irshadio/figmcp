// Fills, strokes, shapes, shadows and blend modes as SwiftUI values.
import { gradientHandles } from '../geometry.js';
import { array, call, raw, sNum } from './swift.js';

const NAMED_POINTS = {
  '0,0': 'topLeading', '0.5,0': 'top', '1,0': 'topTrailing',
  '0,0.5': 'leading', '0.5,0.5': 'center', '1,0.5': 'trailing',
  '0,1': 'bottomLeading', '0.5,1': 'bottom', '1,1': 'bottomTrailing',
};

// Figma blend modes SwiftUI draws the same way.
const BLEND_MODES = {
  DARKEN: 'darken', MULTIPLY: 'multiply', COLOR_BURN: 'colorBurn', LINEAR_BURN: 'plusDarker',
  LIGHTEN: 'lighten', SCREEN: 'screen', COLOR_DODGE: 'colorDodge', LINEAR_DODGE: 'plusLighter',
  PLUS_LIGHTER: 'plusLighter', PLUS_DARKER: 'plusDarker', OVERLAY: 'overlay', SOFT_LIGHT: 'softLight',
  HARD_LIGHT: 'hardLight', DIFFERENCE: 'difference', EXCLUSION: 'exclusion', HUE: 'hue',
  SATURATION: 'saturation', COLOR: 'color', LUMINOSITY: 'luminosity',
};

/** 'normal' for no blend, the SwiftUI BlendMode name, or null when SwiftUI has none. */
export function blendMode(mode) {
  if (!mode || mode === 'NORMAL' || mode === 'PASS_THROUGH') return 'normal';
  return BLEND_MODES[mode] || null;
}

function hexByte(v) {
  return Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0').toUpperCase();
}

/** 'Color(hex: 0xRRGGBB)' for a Figma colour and extra opacity, with the alpha as opacity. */
export function sColor(color, opacity = 1) {
  const a = Math.round((color.a ?? 1) * opacity * 1000) / 1000;
  const hex = `0x${hexByte(color.r)}${hexByte(color.g)}${hexByte(color.b)}`;
  return a >= 0.999 ? `Color(hex: ${hex})` : `Color(hex: ${hex}, opacity: ${sNum(a)})`;
}

/** A UnitPoint for a point of the unit square. */
export function unitPoint(x, y) {
  const r = (v) => Math.round(v * 1000) / 1000;
  const named = NAMED_POINTS[`${sNum(r(x))},${sNum(r(y))}`];
  return named ? raw(`.${named}`) : call('UnitPoint', [['x', r(x)], ['y', r(y)]]);
}

function stops(paint, color) {
  const opacity = paint.opacity ?? 1;
  return call('Gradient', [['stops', array((paint.gradientStops || []).map((s) => call('.init', [
    ['color', color(s.color, opacity)], ['location', Math.round(s.position * 1000) / 1000],
  ])))]]);
}

/**
 * A gradient for a Figma gradient paint in a [w] x [h] box. Linear
 * gradients run between the handles; radial ones are circles (an elliptical
 * one is reported through [warn]); diamonds become radial.
 */
export function gradient(paint, w, h, color, warn = () => {}) {
  const g = gradientHandles(paint);
  const gradient_ = stops(paint, color);
  if (paint.type === 'GRADIENT_LINEAR') {
    return call('LinearGradient', [['gradient', gradient_], ['startPoint', unitPoint(...g.start)], ['endPoint', unitPoint(...g.end)]]);
  }
  const [cx, cy] = g.center;
  const dx = (g.rx[0] - cx) * w;
  const dy = (g.rx[1] - cy) * h;
  if (paint.type === 'GRADIENT_ANGULAR') {
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return call('AngularGradient', [
      ['gradient', gradient_], ['center', unitPoint(cx, cy)],
      ['angle', Math.abs(angle) > 0.01 ? raw(`.degrees(${sNum(Math.round(angle * 100) / 100)})`) : null],
    ]);
  }
  const rx = Math.hypot(dx, dy);
  const ry = Math.hypot((g.ry[0] - cx) * w, (g.ry[1] - cy) * h);
  if (paint.type === 'GRADIENT_DIAMOND') warn('a diamond gradient is drawn as a radial gradient');
  else if (Math.abs(rx - ry) > Math.max(1, 0.02 * Math.max(rx, ry))) warn('an elliptical radial gradient is drawn as a circle');
  return call('RadialGradient', [
    ['gradient', gradient_], ['center', unitPoint(cx, cy)], ['startRadius', 0],
    ['endRadius', Math.round(((rx + ry) / 2) * 100) / 100],
  ]);
}

/**
 * The node's outline as a shape: Rectangle, RoundedRectangle,
 * UnevenRoundedRectangle, Circle or Ellipse. [value] turns a radius and its
 * variable into a value.
 */
export function shapeOf(node, value) {
  if (node.type === 'ELLIPSE') {
    return Math.abs(node.width - node.height) < 0.01 ? call('Circle') : call('Ellipse');
  }
  const keys = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
  const vars = node.vars || {};
  const corners = keys.map((k) => ({
    v: typeof node[k] === 'number' ? node[k] : typeof node.cornerRadius === 'number' ? node.cornerRadius : 0,
    name: vars[k] || null,
  }));
  if (!corners.some((c) => c.v > 0)) return call('Rectangle');
  // A radius larger than half the shorter side is drawn as a pill in Figma.
  const cap = Math.min(node.width || Infinity, node.height || Infinity) / 2;
  const r = (c) => (c.v > cap ? Math.round(cap * 100) / 100 : value(c.v, c.name));
  const style = node.cornerSmoothing > 0 ? [['style', raw('.continuous')]] : [];
  if (corners.every((c) => c.v === corners[0].v && c.name === corners[0].name)) {
    return call('RoundedRectangle', [['cornerRadius', r(corners[0])], ...style]);
  }
  const [tl, tr, br, bl] = corners;
  const arg = (label, c) => [label, c.v > 0 ? r(c) : null];
  return call('UnevenRoundedRectangle', [
    arg('topLeadingRadius', tl), arg('bottomLeadingRadius', bl), arg('bottomTrailingRadius', br),
    arg('topTrailingRadius', tr), ...style,
  ]);
}

/** Whether [shape] is a plain Rectangle. */
export function isRectangle(shape) {
  return shape.name === 'Rectangle';
}

/**
 * SwiftUI's blur radius for a Figma blur radius. Figma blurs like CSS (a
 * Gaussian with sigma = radius / 2), and so does SwiftUI.
 */
export function swiftBlur(radius) {
  return Math.round(((radius || 0) / 2) * 100) / 100;
}

/** The node's visible effects of [type]. */
export function effectsOf(node, type) {
  return (Array.isArray(node.effects) ? node.effects : []).filter((e) => e && e.visible !== false && e.type === type);
}

/** { layer, background } blur radii of the node, 0 when none. */
export function blurs(node) {
  const find = (type) => effectsOf(node, type).reduce((m, e) => Math.max(m, e.radius || 0), 0);
  return { layer: find('LAYER_BLUR'), background: find('BACKGROUND_BLUR') };
}

/** Shadow arguments (color, radius, x, y) of a drop or inner shadow effect. */
export function shadowArgs(e, color) {
  return [
    ['color', color(e.color || { r: 0, g: 0, b: 0, a: 0.25 })],
    ['radius', swiftBlur(e.radius)],
    ['x', e.offset?.x ? Math.round(e.offset.x * 100) / 100 : null],
    ['y', e.offset?.y ? Math.round(e.offset.y * 100) / 100 : null],
  ];
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

// Helpers added to the code when it uses them.
export const HELPERS = {
  color: `extension Color {
  /// A colour from a 0xRRGGBB value.
  init(hex: UInt32, opacity: Double = 1) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255,
      opacity: opacity
    )
  }
}`,
  flow: `/// Lays out its subviews in rows, wrapping to a new row when one is full.
struct FlowLayout: Layout {
  var spacing: CGFloat = 0
  var lineSpacing: CGFloat = 0

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let rows = rows(proposal.width ?? .infinity, subviews)
    let width = rows.map { $0.width }.max() ?? 0
    let height = rows.reduce(0) { $0 + $1.height } + lineSpacing * CGFloat(max(rows.count - 1, 0))
    return CGSize(width: width, height: height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var y = bounds.minY
    for row in rows(bounds.width, subviews) {
      var x = bounds.minX
      for index in row.items {
        let size = subviews[index].sizeThatFits(.unspecified)
        subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
        x += size.width + spacing
      }
      y += row.height + lineSpacing
    }
  }

  private func rows(_ maxWidth: CGFloat, _ subviews: Subviews) -> [(items: [Int], width: CGFloat, height: CGFloat)] {
    var rows: [(items: [Int], width: CGFloat, height: CGFloat)] = []
    for (index, subview) in subviews.enumerated() {
      let size = subview.sizeThatFits(.unspecified)
      if let last = rows.last, last.width + spacing + size.width <= maxWidth {
        rows[rows.count - 1].items.append(index)
        rows[rows.count - 1].width += spacing + size.width
        rows[rows.count - 1].height = max(last.height, size.height)
      } else {
        rows.append(([index], size.width, size.height))
      }
    }
    return rows
  }
}`,
};

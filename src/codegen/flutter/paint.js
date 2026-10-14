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

/** BoxShadows for the node's shadows of [type] (DROP_SHADOW or INNER_SHADOW). */
export function boxShadows(node, color, type = 'DROP_SHADOW') {
  const effects = (Array.isArray(node.effects) ? node.effects : []).filter((e) => e && e.visible !== false);
  return effects.filter((e) => e.type === type).map((e) => call('BoxShadow', {
    color: color(e.color || { r: 0, g: 0, b: 0, a: 0.25 }),
    offset: call('Offset', {}, { positional: [e.offset?.x ?? 0, e.offset?.y ?? 0] }),
    blurRadius: Math.round(flutterBlur(e.radius) * 100) / 100 || null,
    spreadRadius: e.spread || null,
  }));
}

// Figma blend modes Flutter draws the same way; LINEAR_BURN has no match.
const BLEND_MODES = {
  DARKEN: 'darken', MULTIPLY: 'multiply', COLOR_BURN: 'colorBurn', LIGHTEN: 'lighten',
  SCREEN: 'screen', COLOR_DODGE: 'colorDodge', LINEAR_DODGE: 'plus', PLUS_LIGHTER: 'plus',
  OVERLAY: 'overlay', SOFT_LIGHT: 'softLight', HARD_LIGHT: 'hardLight', DIFFERENCE: 'difference',
  EXCLUSION: 'exclusion', HUE: 'hue', SATURATION: 'saturation', COLOR: 'color', LUMINOSITY: 'luminosity',
};

/** 'normal' for no blend, the Flutter BlendMode name, or null when Flutter has none. */
export function blendMode(mode) {
  if (!mode || mode === 'NORMAL' || mode === 'PASS_THROUGH') return 'normal';
  return BLEND_MODES[mode] || null;
}

// Helper classes added to the code when it uses them.
export const HELPERS = {
  innerShadow: `/// Paints [decoration], then inner shadows inside the box's shape.
class _InnerShadowDecoration extends Decoration {
  const _InnerShadowDecoration({
    required this.decoration,
    required this.shadows,
    required this.borderRadius,
    required this.shape,
  });

  final BoxDecoration? decoration;
  final List<BoxShadow> shadows;
  final BorderRadius? borderRadius;
  final BoxShape shape;

  @override
  EdgeInsetsGeometry get padding => decoration?.padding ?? EdgeInsets.zero;

  Path _outline(Rect rect, [double inset = 0]) {
    final inner = rect.deflate(inset);
    if (shape == BoxShape.circle) {
      return Path()..addOval(Rect.fromCircle(center: inner.center, radius: inner.shortestSide / 2));
    }
    return Path()..addRRect((borderRadius ?? BorderRadius.zero).toRRect(rect).deflate(inset));
  }

  @override
  Path getClipPath(Rect rect, TextDirection textDirection) => _outline(rect);

  @override
  BoxPainter createBoxPainter([VoidCallback? onChanged]) => _InnerShadowPainter(this, onChanged);
}

class _InnerShadowPainter extends BoxPainter {
  _InnerShadowPainter(this.owner, VoidCallback? onChanged)
      : base = owner.decoration?.createBoxPainter(onChanged),
        super(onChanged);

  final _InnerShadowDecoration owner;
  final BoxPainter? base;

  @override
  void paint(Canvas canvas, Offset offset, ImageConfiguration configuration) {
    base?.paint(canvas, offset, configuration);
    final rect = offset & configuration.size!;
    canvas.save();
    canvas.clipPath(owner._outline(rect));
    for (final shadow in owner.shadows) {
      final hole = owner._outline(rect.shift(shadow.offset), shadow.spreadRadius);
      final reach = shadow.blurRadius * 2 + shadow.spreadRadius.abs() + shadow.offset.distance + 1;
      final path = Path()
        ..fillType = PathFillType.evenOdd
        ..addRect(rect.inflate(reach))
        ..addPath(hole, Offset.zero);
      final paint = Paint()..color = shadow.color;
      if (shadow.blurRadius > 0) paint.maskFilter = MaskFilter.blur(BlurStyle.normal, shadow.blurSigma);
      canvas.drawPath(path, paint);
    }
    canvas.restore();
  }

  @override
  void dispose() {
    base?.dispose();
    super.dispose();
  }
}`,
  blend: `/// Blends [child] with what is painted under it.
class _Blend extends SingleChildRenderObjectWidget {
  const _Blend({required this.mode, super.child});

  final BlendMode mode;

  @override
  RenderObject createRenderObject(BuildContext context) => _RenderBlend(mode);

  @override
  void updateRenderObject(BuildContext context, _RenderBlend renderObject) {
    renderObject.mode = mode;
  }
}

class _RenderBlend extends RenderProxyBox {
  _RenderBlend(this._mode);

  BlendMode _mode;

  set mode(BlendMode value) {
    if (value == _mode) return;
    _mode = value;
    markNeedsPaint();
  }

  @override
  void paint(PaintingContext context, Offset offset) {
    final child = this.child;
    if (child == null) return;
    // A composited child paints into its own layer, which the blend cannot reach.
    if (child.needsCompositing) {
      super.paint(context, offset);
      return;
    }
    context.canvas.saveLayer(offset & size, Paint()..blendMode = _mode);
    super.paint(context, offset);
    context.canvas.restore();
  }
}`,
};

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

// Fills, strokes, effects and blend modes as Tailwind classes, inline styles
// and stacked layers.
import { css, num, px, tw, visiblePaints, withVar } from './util.js';

const BLEND = {
  MULTIPLY: 'multiply', SCREEN: 'screen', OVERLAY: 'overlay',
  DARKEN: 'darken', LIGHTEN: 'lighten', COLOR_DODGE: 'color-dodge',
  COLOR_BURN: 'color-burn', HARD_LIGHT: 'hard-light',
  SOFT_LIGHT: 'soft-light', DIFFERENCE: 'difference',
  EXCLUSION: 'exclusion', HUE: 'hue', SATURATION: 'saturation',
  COLOR: 'color', LUMINOSITY: 'luminosity',
};

function invert([[a, b, c], [d, e, f]]) {
  const det = a * e - b * d || 1;
  const ia = e / det;
  const ib = -b / det;
  const id = -d / det;
  const ie = a / det;
  return [[ia, ib, -(ia * c + ib * f)], [id, ie, -(id * c + ie * f)]];
}

function apply([[a, b, c], [d, e, f]], x, y) {
  return [a * x + b * y + c, d * x + e * y + f];
}

function stopList(paint, map = (p) => p) {
  const opacity = paint.opacity ?? 1;
  return (paint.gradientStops || [])
    .map((s) => `${css(s.color, opacity)} ${num(map(s.position) * 100)}%`)
    .join(',');
}

/**
 * CSS for a gradient paint in a [w] x [h] box. The transform maps node space
 * to gradient space, so its inverse gives the handles in node space; linear
 * stops are re-projected onto the CSS gradient line.
 */
export function gradientCss(paint, w = 100, h = 100) {
  const t = Array.isArray(paint.gradientTransform)
    ? invert(paint.gradientTransform) : [[1, 0, 0], [0, 1, 0]];
  if (paint.type === 'GRADIENT_LINEAR') {
    const [sx, sy] = apply(t, 0, 0.5);
    const [ex, ey] = apply(t, 1, 0.5);
    const dx = (ex - sx) * w;
    const dy = (ey - sy) * h;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const angle = ((Math.atan2(ux, -uy) * 180) / Math.PI + 360) % 360;
    const rad = (angle * Math.PI) / 180;
    const line = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)) || 1;
    const along = (x, y) => (((x - 0.5) * w * ux + (y - 0.5) * h * uy) / line) + 0.5;
    const t0 = along(sx, sy);
    const t1 = along(ex, ey);
    return `linear-gradient(${num(angle)}deg,${stopList(paint, (p) => t0 + p * (t1 - t0))})`;
  }
  const [cx, cy] = apply(t, 0.5, 0.5);
  const [rx1, ry1] = apply(t, 1, 0.5);
  const [rx2, ry2] = apply(t, 0.5, 1);
  const at = `${num(cx * 100)}%_${num(cy * 100)}%`;
  if (paint.type === 'GRADIENT_ANGULAR') {
    const angle = ((Math.atan2((rx1 - cx) * w, -(ry1 - cy) * h) * 180) / Math.PI + 360) % 360;
    return `conic-gradient(from ${num(angle)}deg at ${at.replace('_', ' ')},${stopList(paint)})`;
  }
  const rx = Math.hypot((rx1 - cx) * w, (ry1 - cy) * h);
  const ry = Math.hypot((rx2 - cx) * w, (ry2 - cy) * h);
  return `radial-gradient(${px(rx)} ${px(ry)} at ${at.replace('_', ' ')},${stopList(paint)})`;
}

/** CSS colour or gradient for a non-image paint, with its bound variable. */
export function paintValue(paint, w, h, varName) {
  if (paint.type === 'SOLID') return withVar(varName, css(paint.color, paint.opacity ?? 1));
  if (paint.type.startsWith('GRADIENT')) return gradientCss(paint, w, h);
  return null;
}

/**
 * Fill layers bottom to top: { kind: 'color', value } or
 * { kind: 'image', paint }.
 */
export function fillLayers(node) {
  const vars = node.vars || {};
  const list = Array.isArray(node.fills) ? node.fills : [];
  const out = [];
  list.forEach((p, i) => {
    if (!p || p.visible === false) return;
    if (p.type === 'IMAGE') out.push({ kind: 'image', paint: p });
    else {
      const value = paintValue(p, node.width, node.height, vars[`fill.${i}`]);
      if (value) out.push({ kind: 'color', value, blend: p.blendMode });
    }
  });
  return out;
}

/** Background classes/style when the fills need no stacked layers. */
export function backgroundClasses(layers, style) {
  const colors = layers.filter((l) => l.kind === 'color');
  if (colors.length === 1) return [`bg-[${tw(colors[0].value)}]`];
  if (colors.length > 1) {
    // Figma lists paints bottom to top; CSS lists backgrounds top first.
    style.background = colors.slice().reverse()
      .map((l) => (l.value.includes('gradient') ? l.value : `linear-gradient(${l.value},${l.value})`))
      .join(', ');
  }
  return [];
}

/** Placement of an image fill inside its box (Figma scale modes). */
export function imagePlacement(paint, size) {
  const opacity = paint.opacity !== undefined && paint.opacity < 1
    ? [`opacity-[${num(paint.opacity)}]`] : [];
  if (paint.scaleMode === 'CROP' && Array.isArray(paint.imageTransform)) {
    const [[a, , tx], [, d, ty]] = paint.imageTransform;
    return {
      classes: ['absolute', 'max-w-none', `w-[${num(100 / a)}%]`, `h-[${num(100 / d)}%]`,
        `left-[${num((-tx / a) * 100)}%]`, `top-[${num((-ty / d) * 100)}%]`, ...opacity],
      clip: true,
    };
  }
  if (paint.scaleMode === 'TILE' && size) {
    const s = paint.scalingFactor || 1;
    return {
      tile: { backgroundSize: `${num(size.width * s)}px ${num(size.height * s)}px` },
      classes: ['absolute', 'inset-0', 'bg-repeat', 'bg-left-top', ...opacity],
    };
  }
  const fit = paint.scaleMode === 'FIT' ? 'object-contain' : 'object-cover';
  return {
    classes: ['absolute', 'inset-0', 'max-w-none', fit, 'size-full', ...opacity],
  };
}

export function blendClass(mode) {
  return BLEND[mode] ? `mix-blend-${BLEND[mode]}` : null;
}

function sideWeights(node) {
  const w = typeof node.strokeWeight === 'number' ? node.strokeWeight : 1;
  const mixed = node.strokeWeight === 'mixed';
  return ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight',
    'strokeLeftWeight'].map((k) => node[k] ?? (mixed ? 0 : w));
}

/**
 * Stroke overlays drawn above the content, one per visible paint, so strokes
 * never change the layout (as in Figma). Each is { classes, style }.
 */
export function strokeOverlays(node, radius) {
  if (node.type === 'TEXT') return [];
  const vars = node.vars || {};
  const sides = sideWeights(node);
  const uniform = sides.every((s) => s === sides[0]);
  const w = Math.max(...sides);
  const outset = node.strokeAlign === 'OUTSIDE' ? w : node.strokeAlign === 'CENTER' ? w / 2 : 0;
  const inset = outset ? `inset-[-${px(outset)}]` : 'inset-0';
  const dashed = Array.isArray(node.dashPattern) && node.dashPattern.length ? 'border-dashed' : 'border-solid';
  const out = [];
  (Array.isArray(node.strokes) ? node.strokes : []).forEach((p, i) => {
    if (!p || p.visible === false || !sides.some(Boolean)) return;
    const classes = ['absolute', inset, 'pointer-events-none', ...radius];
    if (p.type === 'SOLID') {
      if (uniform) classes.push(sides[0] === 1 ? 'border' : `border-[${px(sides[0])}]`);
      else ['t', 'r', 'b', 'l'].forEach((k, j) => sides[j] && classes.push(`border-${k}-[${px(sides[j])}]`));
      const color = withVar(vars[`stroke.${i}`] || vars.strokes, css(p.color, p.opacity ?? 1));
      classes.push(`border-[${tw(color)}]`, dashed);
      out.push({ classes, style: {} });
    } else if (p.type.startsWith('GRADIENT')) {
      // A gradient ring: the gradient fills the box and a mask keeps only the
      // border area, so the radius is honoured.
      const pad = uniform ? px(sides[0]) : sides.map(px).join(' ');
      out.push({
        classes,
        style: {
          padding: pad,
          background: gradientCss(p, node.width + 2 * outset, node.height + 2 * outset),
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        },
      });
    }
  });
  return out;
}

function shadow(e) {
  const inset = e.type === 'INNER_SHADOW' ? 'inset ' : '';
  return `${inset}${px(e.offset?.x ?? 0)} ${px(e.offset?.y ?? 0)} ${
    px(e.radius ?? 0)} ${px(e.spread ?? 0)} ${css(e.color || { r: 0, g: 0, b: 0, a: 0.25 })}`;
}

/**
 * Effects. A drop shadow on a box without fills follows its content in
 * Figma, so it becomes a CSS drop-shadow filter there.
 */
export function effectClasses(node, hasFill) {
  const effects = (Array.isArray(node.effects) ? node.effects : [])
    .filter((e) => e.visible !== false);
  const out = [];
  const drops = effects.filter((e) => e.type === 'DROP_SHADOW');
  const inner = effects.filter((e) => e.type === 'INNER_SHADOW');
  const followsContent = !hasFill && (node.children || []).length > 0;
  const boxShadows = [...(followsContent ? [] : drops), ...inner];
  if (boxShadows.length) out.push(`shadow-[${tw(boxShadows.map(shadow).join(','))}]`);
  if (followsContent && drops.length) {
    out.push(...drops.map((e) => `drop-shadow-[${tw(`${px(e.offset?.x ?? 0)} ${px(e.offset?.y ?? 0)} ${
      px(e.radius ?? 0)} ${css(e.color || { r: 0, g: 0, b: 0, a: 0.25 })}`)}]`));
  }
  for (const e of effects) {
    if (e.type === 'LAYER_BLUR') out.push(`blur-[${px((e.radius || 0) / 2)}]`);
    if (e.type === 'BACKGROUND_BLUR') out.push(`backdrop-blur-[${px((e.radius || 0) / 2)}]`);
  }
  return out;
}

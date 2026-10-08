// Fills, strokes, effects and blend modes as Tailwind classes, inline styles
// and stacked layers.
import { gradientHandles } from './geometry.js';
import { css, num, px, tw, withVar } from './util.js';

const BLEND = {
  MULTIPLY: 'multiply', SCREEN: 'screen', OVERLAY: 'overlay',
  DARKEN: 'darken', LIGHTEN: 'lighten', COLOR_DODGE: 'color-dodge',
  COLOR_BURN: 'color-burn', HARD_LIGHT: 'hard-light',
  SOFT_LIGHT: 'soft-light', DIFFERENCE: 'difference',
  EXCLUSION: 'exclusion', HUE: 'hue', SATURATION: 'saturation',
  COLOR: 'color', LUMINOSITY: 'luminosity',
};
const BLACK_25 = { r: 0, g: 0, b: 0, a: 0.25 };

function stopList(paint, map = (p) => p) {
  const opacity = paint.opacity ?? 1;
  return (paint.gradientStops || [])
    .map((s) => `${css(s.color, opacity)} ${num(map(s.position) * 100)}%`)
    .join(',');
}

/**
 * CSS for a gradient paint in a [w] x [h] box; linear stops are re-projected
 * onto the CSS gradient line, which runs through the box centre.
 */
export function gradientCss(paint, w = 100, h = 100) {
  const g = gradientHandles(paint);
  if (paint.type === 'GRADIENT_LINEAR') {
    const [sx, sy] = g.start;
    const [ex, ey] = g.end;
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
  const [cx, cy] = g.center;
  const [rx1, ry1] = g.rx;
  const [rx2, ry2] = g.ry;
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
  if (String(paint.type).startsWith('GRADIENT')) return gradientCss(paint, w, h);
  return null;
}

export function blendClass(mode) {
  return BLEND[mode] ? `mix-blend-${BLEND[mode]}` : null;
}

/**
 * Fill layers bottom to top: { kind: 'color', value, blend } or
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

/** Whether the fills need their own layers (images, blended paints). */
export function needsFillLayers(layers) {
  return layers.some((l) => l.kind === 'image' || blendClass(l.blend));
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

function imageFilter(paint) {
  const f = paint.filters || {};
  const parts = [];
  if (f.exposure) parts.push(`brightness(${num(1 + f.exposure)})`);
  if (f.contrast) parts.push(`contrast(${num(1 + f.contrast)})`);
  if (f.saturation) parts.push(`saturate(${num(1 + f.saturation)})`);
  return parts.length ? [`[filter:${parts.join('_')}]`] : [];
}

/** Placement of an image fill inside its [box] (Figma scale modes). */
export function imagePlacement(paint, size, box = {}) {
  const extra = [
    ...(paint.opacity !== undefined && paint.opacity < 1 ? [`opacity-[${num(paint.opacity)}]`] : []),
    ...imageFilter(paint),
    blendClass(paint.blendMode),
  ].filter(Boolean);
  if (paint.scaleMode === 'CROP' && Array.isArray(paint.imageTransform)) {
    const [[a, b, tx], [c, d, ty]] = paint.imageTransform;
    if ((Math.abs(b) > 1e-6 || Math.abs(c) > 1e-6) && box.width && box.height) {
      // A turned crop: map the image's unit square back onto the layer.
      const det = a * d - b * c || 1;
      const ia = d / det;
      const ib = -b / det;
      const ic = -c / det;
      const id = a / det;
      const e = -(ia * tx + ib * ty) * box.width;
      const f = -(ic * tx + id * ty) * box.height;
      const m = [ia, ic * (box.height / box.width), ib * (box.width / box.height), id, e, f].map(num);
      return {
        classes: ['absolute', 'left-0', 'top-0', 'max-w-none', 'size-full', 'origin-top-left',
          `[transform:matrix(${m.join(',')})]`, ...extra],
        clip: true,
      };
    }
    return {
      classes: ['absolute', 'max-w-none', `w-[${num(100 / a)}%]`, `h-[${num(100 / d)}%]`,
        `left-[${num((-tx / a) * 100)}%]`, `top-[${num((-ty / d) * 100)}%]`, ...extra],
      clip: true,
    };
  }
  if (paint.scaleMode === 'TILE' && size) {
    const s = paint.scalingFactor || 1;
    return {
      tile: { backgroundSize: `${num(size.width * s)}px ${num(size.height * s)}px` },
      classes: ['absolute', 'inset-0', 'bg-repeat', 'bg-left-top', ...extra],
    };
  }
  const fit = paint.scaleMode === 'FIT' ? 'object-contain' : 'object-cover';
  const turn = (((paint.rotation || 0) % 360) + 360) % 360;
  if ((turn === 90 || turn === 270) && box.width && box.height) {
    // The image turns inside the box, so its own box swaps width and height.
    return {
      classes: ['absolute', 'max-w-none', fit, `w-[${px(box.height)}]`, `h-[${px(box.width)}]`,
        `left-[${px((box.width - box.height) / 2)}]`, `top-[${px((box.height - box.width) / 2)}]`,
        `rotate-[${turn}deg]`, ...extra],
      clip: true,
    };
  }
  return {
    classes: ['absolute', 'inset-0', 'max-w-none', fit, 'size-full', ...(turn ? [`rotate-[${turn}deg]`] : []), ...extra],
  };
}

/**
 * Stroke weights (top, right, bottom, left). Exports drop a weight of 0, so
 * a missing weight is 0.
 */
export function sideWeights(node) {
  const uniform = typeof node.strokeWeight === 'number' ? node.strokeWeight : 0;
  return ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight']
    .map((k) => (typeof node[k] === 'number' ? node[k] : uniform));
}

function outsets(node, sides) {
  const f = node.strokeAlign === 'OUTSIDE' ? 1 : node.strokeAlign === 'CENTER' ? 0.5 : 0;
  return sides.map((s) => s * f);
}

function insetClasses(out) {
  if (out.every((o) => o === out[0])) return [out[0] ? `inset-[${px(-out[0])}]` : 'inset-0'];
  return ['top', 'right', 'bottom', 'left'].map((k, i) => (out[i] ? `${k}-[${px(-out[i])}]` : `${k}-0`));
}

/**
 * Strokes drawn above the content, as in Figma, so they never change the
 * layout. Returns { overlays: [{ classes, style }], classes } where
 * [classes] go on the node itself: on a clipping node an outside stroke is an
 * outline, which the clip does not cut. [radius] builds corner classes,
 * widened by the given outset.
 */
export function strokeLayers(node, { clip = false, radius = () => [] } = {}) {
  const result = { overlays: [], classes: [] };
  if (node.type === 'TEXT') return result;
  const vars = node.vars || {};
  const sides = sideWeights(node);
  if (!sides.some((s) => s > 0)) return result;
  const uniform = sides.every((s) => s === sides[0]);
  const dashed = Array.isArray(node.dashPattern) && node.dashPattern.length ? 'border-dashed' : 'border-solid';
  const paints = Array.isArray(node.strokes) ? node.strokes : [];
  paints.forEach((p, i) => {
    if (!p || p.visible === false) return;
    const color = p.type === 'SOLID'
      ? withVar(vars[`stroke.${i}`] || vars.strokes, css(p.color, p.opacity ?? 1)) : null;
    let drawn = sides;
    let out = outsets(node, sides);
    if (clip && color && uniform && out[0] > 0 && !result.classes.length) {
      // The part outside the box: an outline follows the radius and is not
      // clipped. A centred stroke keeps its inner half as an overlay.
      result.classes.push('outline', `outline-[${px(out[0])}]`, `outline-[${tw(color)}]`,
        dashed === 'border-dashed' ? 'outline-dashed' : null);
      result.classes = result.classes.filter(Boolean);
      if (node.strokeAlign !== 'CENTER') return;
      drawn = sides.map((s) => s / 2);
      out = [0, 0, 0, 0];
    }
    const grow = Math.max(...out);
    const classes = ['absolute', ...insetClasses(out), 'pointer-events-none', ...radius(uniform ? grow : 0)];
    if (color) {
      if (uniform) classes.push(drawn[0] === 1 ? 'border' : `border-[${px(drawn[0])}]`);
      else ['t', 'r', 'b', 'l'].forEach((k, j) => drawn[j] && classes.push(`border-${k}-[${px(drawn[j])}]`));
      classes.push(`border-[${tw(color)}]`, dashed);
      result.overlays.push({ classes, style: {} });
    } else if (String(p.type).startsWith('GRADIENT')) {
      // A gradient ring: the gradient fills the box and a mask keeps only the
      // border area, so the radius is honoured.
      const pad = uniform ? px(drawn[0]) : [drawn[0], drawn[1], drawn[2], drawn[3]].map(px).join(' ');
      result.overlays.push({
        classes,
        style: {
          padding: pad,
          background: gradientCss(p, node.width + out[1] + out[3], node.height + out[0] + out[2]),
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        },
      });
    }
  });
  return result;
}

function shadowCss(e, { spread = true, blur = 1 } = {}) {
  const inset = e.type === 'INNER_SHADOW' ? 'inset ' : '';
  const parts = [px(e.offset?.x ?? 0), px(e.offset?.y ?? 0), px((e.radius ?? 0) * blur)];
  if (spread) parts.push(px(e.spread ?? 0));
  return `${inset}${parts.join(' ')} ${css(e.color || BLACK_25)}`;
}

/**
 * Effect classes: { classes, inner } where [inner] is the inner-shadow class
 * for an overlay layer when the fills are stacked layers (an inset shadow on
 * the box would be drawn under them). A drop shadow on a box without fills
 * follows its content in Figma, so it becomes a CSS drop-shadow filter
 * there; on text it follows the glyphs.
 */
export function effectClasses(node, { hasFill = false, stacked = false } = {}) {
  const effects = (Array.isArray(node.effects) ? node.effects : [])
    .filter((e) => e && e.visible !== false);
  const classes = [];
  let inner = null;
  const drops = effects.filter((e) => e.type === 'DROP_SHADOW');
  const inset = effects.filter((e) => e.type === 'INNER_SHADOW');
  if (node.type === 'TEXT') {
    if (drops.length) {
      classes.push(`[text-shadow:${tw(drops.map((e) => shadowCss(e, { spread: false })).join(','))}]`);
    }
  } else {
    const followsContent = !hasFill && (node.children || []).length > 0;
    const insetCss = inset.map((e) => shadowCss(e));
    if (stacked && insetCss.length) inner = `shadow-[${tw(insetCss.join(','))}]`;
    const boxShadows = [...(followsContent ? [] : drops.map((e) => shadowCss(e))), ...(inner ? [] : insetCss)];
    if (boxShadows.length) classes.push(`shadow-[${tw(boxShadows.join(','))}]`);
    if (followsContent && drops.length) {
      // drop-shadow() takes a standard deviation: half of Figma's radius.
      classes.push(...drops.map((e) => `drop-shadow-[${tw(shadowCss(e, { spread: false, blur: 0.5 }))}]`));
    }
  }
  for (const e of effects) {
    if (e.type === 'LAYER_BLUR') classes.push(`blur-[${px((e.radius || 0) / 2)}]`);
    if (e.type === 'BACKGROUND_BLUR') classes.push(`backdrop-blur-[${px((e.radius || 0) / 2)}]`);
  }
  return { classes, inner };
}

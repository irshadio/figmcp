// Transform math shared by the code generators.

export function invert([[a, b, c], [d, e, f]]) {
  const det = a * e - b * d || 1;
  const ia = e / det;
  const ib = -b / det;
  const id = -d / det;
  const ie = a / det;
  return [[ia, ib, -(ia * c + ib * f)], [id, ie, -(id * c + ie * f)]];
}

export function apply([[a, b, c], [d, e, f]], x, y) {
  return [a * x + b * y + c, d * x + e * y + f];
}

/**
 * A gradient's handles in the layer's unit square: the transform maps layer
 * space to gradient space, so its inverse places the handles. Linear
 * gradients run from [start] to [end]; radial, angular and diamond ones are
 * centred on [center], with [rx] and [ry] the ends of their two radii.
 */
export function gradientHandles(paint) {
  const t = Array.isArray(paint.gradientTransform)
    ? invert(paint.gradientTransform) : [[1, 0, 0], [0, 1, 0]];
  return {
    start: apply(t, 0, 0.5),
    end: apply(t, 1, 0.5),
    center: apply(t, 0.5, 0.5),
    rx: apply(t, 1, 0.5),
    ry: apply(t, 0.5, 1),
  };
}

/**
 * The 2x2 transform of a turned layer as { a, b, c, d } (CSS matrix order:
 * x' = a x + c y, y' = b x + d y), from the exported transform or, in older
 * exports, the rotation in degrees (counter-clockwise in Figma).
 */
export function linearTransform(node) {
  if (Array.isArray(node.transform)) {
    const [[a, c], [b, d]] = node.transform;
    return { a, b, c, d };
  }
  if (Math.abs(node.rotation || 0) > 0.01) {
    const r = (-node.rotation * Math.PI) / 180;
    return { a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r) };
  }
  return null;
}

/** Degrees clockwise when [m] is a plain rotation, else null (mirrored, skewed or scaled). */
export function rotationOf(m) {
  if (!m) return null;
  const det = m.a * m.d - m.b * m.c;
  const unit = Math.abs(m.a * m.a + m.b * m.b - 1) < 1e-3 && Math.abs(m.c * m.c + m.d * m.d - 1) < 1e-3;
  if (det <= 0 || !unit) return null;
  return (Math.atan2(m.b, m.a) * 180) / Math.PI;
}

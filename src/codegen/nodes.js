// How a layer is drawn, shared by the code generators.
import { linearTransform } from './geometry.js';
import { visiblePaints } from './util.js';

const VECTOR_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'POLYGON']);
const LINE_CAPS = new Set(['NONE', 'ROUND', 'SQUARE']);

export function visibleChildren(node) {
  return (node.children || []).filter((c) => c && c.visible !== false && !c.isMask);
}

export function hasImageFill(node) {
  return (Array.isArray(node.fills) ? node.fills : []).some((p) => p && p.visible !== false && p.type === 'IMAGE');
}

/** Whether the layer ships as its exported SVG. */
export function drawnAsSvg(node) {
  if (!node.svg || hasImageFill(node)) return false;
  return VECTOR_TYPES.has(node.type) || node.type === 'ELLIPSE' || node.type === 'RECTANGLE' ||
    (node.children || []).length === 0 || ['GROUP', 'FRAME', 'INSTANCE', 'COMPONENT'].includes(node.type);
}

/** A rotated, mirrored or skewed layer with its unturned size. */
export function isTurned(node) {
  return typeof node.rawWidth === 'number' && Boolean(linearTransform(node));
}

/**
 * A straight line with one solid or gradient stroke and plain caps, drawn
 * as a bar: { weight, cap, paint, varName, horizontal }. A Figma line takes
 * no room in a layout, so the bar overflows a box of the line's (zero)
 * thickness.
 */
export function straightLine(node) {
  if (node.type !== 'LINE' || !(node.width < 0.01 || node.height < 0.01)) return null;
  const paints = visiblePaints(node.strokes);
  const weight = typeof node.strokeWeight === 'number' ? node.strokeWeight : 0;
  const cap = node.strokeCap || 'NONE';
  if (paints.length !== 1 || !weight || !LINE_CAPS.has(cap)) return null;
  if (Array.isArray(node.dashPattern) && node.dashPattern.length) return null;
  const paint = paints[0];
  if (paint.type !== 'SOLID' && !String(paint.type).startsWith('GRADIENT')) return null;
  const vars = node.vars || {};
  return {
    weight, cap, paint, varName: vars[`stroke.${node.strokes.indexOf(paint)}`] || vars.strokes || null,
    horizontal: node.height < 0.01,
  };
}

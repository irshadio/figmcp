// Shared by the render checks: loading a design, the boxes Figma draws, and
// comparing two renders.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { Bridge } from '../src/bridge.js';
import { findSnapshotNode } from '../src/store.js';

export const BOX_TOLERANCE = 0.5;
export const TEXT_TOLERANCE = 1;
const PIXEL_THRESHOLD = 48;

/**
 * { tree, images, render } from a design export JSON ([opts.export]), a
 * saved snapshot ([opts.snapshot]: a node id), or live through the running
 * MCP server ([opts.target]: a node id or 'selection').
 */
export async function loadDesign(opts) {
  if (opts.export) {
    const data = JSON.parse(fs.readFileSync(opts.export, 'utf8'));
    const frame = data.frames[0];
    return { tree: frame.tree, images: data.images || {}, render: Buffer.from(frame.previewPng2x, 'base64') };
  }
  if (opts.snapshot) {
    const hit = findSnapshotNode(opts.snapshot.replace(/-/g, ':'), { preview: true });
    if (!hit || hit.node !== hit.frame.tree) throw new Error(`No saved snapshot has the frame ${opts.snapshot} with a preview`);
    return { tree: hit.frame.tree, images: hit.data.images || {}, render: Buffer.from(hit.frame.previewPng2x, 'base64') };
  }
  const bridge = new Bridge({ port: Number(process.env.FIGMA_LOCAL_MCP_PORT || 3947) });
  await bridge.start();
  try {
    let id = opts.target;
    if (!id || id === 'selection') {
      const info = await bridge.call('info', {}, 10000);
      if (!info.selection.length) throw new Error('Nothing is selected in Figma');
      id = info.selection[0].id;
    }
    id = id.replace(/-/g, ':');
    const node = await bridge.call('node', { id, svg: true, images: true }, 180000);
    const shot = await bridge.call('export', { id, format: 'PNG', scale: 2, absoluteBounds: true }, 180000);
    return { tree: node.tree, images: node.images || {}, render: Buffer.from(shot.base64, 'base64') };
  } finally {
    bridge.close();
  }
}

/** Font families used by the visible text of [n]. */
export function families(n, out = new Set()) {
  if (!n || n.visible === false) return out;
  for (const s of n.segments || []) if (s.fontName && s.fontName.family) out.add(s.fontName.family);
  (n.children || []).forEach((c) => families(c, out));
  return out;
}

/** Every node the code draws, with its box relative to the root. */
export function expectedBoxes(tree, { skip = () => false } = {}) {
  const out = [];
  // A layer wholly outside a clipping root never shows.
  const outside = (n) => tree.clipsContent && n !== tree && (n.x + n.width <= tree.x || n.x >= tree.x + tree.width ||
    n.y + n.height <= tree.y || n.y >= tree.y + tree.height);
  const walk = (n, depth) => {
    if (!n || n.visible === false || n.isMask || skip(n) || (depth === 1 && outside(n))) return;
    out.push({ id: n.id, name: n.name, type: n.type, x: n.x - tree.x, y: n.y - tree.y, width: n.width, height: n.height, depth,
      text: n.type === 'TEXT', families: [...families(n)] });
    if (n.svg || n.render) return;
    (n.children || []).forEach((c) => walk(c, depth + 1));
  };
  walk(tree, 0);
  return out;
}

// Figma rounds the width of hugging text up to a whole pixel and measures
// text with its own engine; a renderer lays the text out at its measured
// width. A box that differs only horizontally, by less than this, owes the
// difference to that when hugging text is inside it or in the auto-layout
// flow that places it.
const ROUNDING = 1.5;

function hasHuggingText(node) {
  if (!node || node.visible === false) return false;
  if (node.type === 'TEXT' && node.textAutoResize === 'WIDTH_AND_HEIGHT') return true;
  return (node.children || []).some(hasHuggingText);
}

function isAutoLayout(node) {
  return node && (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL');
}

/** id -> whether hugging text can move or resize that layer. */
function textSensitive(tree) {
  const out = new Map();
  const walk = (node, flowHasText) => {
    if (!node) return;
    out.set(node.id, flowHasText || hasHuggingText(node));
    const own = isAutoLayout(node) && hasHuggingText(node);
    // Absolute children are placed by their constraints, not by the flow.
    (node.children || []).forEach((c) => walk(c, own && c.layoutPositioning !== 'ABSOLUTE' ? true
      : isAutoLayout(node) && c.layoutPositioning !== 'ABSOLUTE' ? flowHasText : false));
  };
  walk(tree, false);
  return out;
}

/**
 * Compares measured boxes ({ id: {x, y, width, height} }) with the design:
 * { mismatches, roundingMismatches, fontMismatches, missing, unbundled }.
 * Text in a font that was not available is reported apart, as its size
 * cannot match; so are sub-pixel differences from Figma rounding hugging
 * text ([tree] is the design, to tell whether it has hugging text).
 */
export function compareBoxes(boxes, rects, bundled, tree = null) {
  const mismatches = [];
  const roundingMismatches = [];
  const fontMismatches = [];
  const missing = [];
  const unbundled = new Set();
  const sensitive = tree ? textSensitive(tree) : new Map();
  for (const box of boxes) {
    const got = rects[box.id];
    if (!got) {
      missing.push({ id: box.id, name: box.name, type: box.type });
      continue;
    }
    const missingFonts = box.families.filter((f) => !bundled.has(f));
    missingFonts.forEach((f) => unbundled.add(f));
    const tol = box.text ? TEXT_TOLERANCE : BOX_TOLERANCE;
    // A scroller is compared by its box or by its scroll width, whichever the design has.
    const width = typeof got.scrollWidth === 'number' && Math.abs(got.scrollWidth - box.width) < Math.abs(got.width - box.width)
      ? got.scrollWidth : got.width;
    const d = ['x', 'y', 'width', 'height'].map((k) => Math.round(((k === 'width' ? width : got[k]) - box[k]) * 100) / 100);
    if (got.grows && d[2] > 0) d[2] = 0;
    if (d.some((v) => Math.abs(v) > tol)) {
      const rounding = sensitive.get(box.id) && Math.abs(d[0]) <= ROUNDING && Math.abs(d[2]) <= ROUNDING &&
        Math.abs(d[1]) <= tol && Math.abs(d[3]) <= tol;
      (missingFonts.length ? fontMismatches : rounding ? roundingMismatches : mismatches).push({
        id: box.id, name: box.name, type: box.type,
        expected: [box.x, box.y, box.width, box.height].map((v) => Math.round(v * 100) / 100),
        actual: [got.x, got.y, width, got.height].map((v) => Math.round(v * 100) / 100),
        delta: d, ...(missingFonts.length ? { cause: `text in ${missingFonts.join(', ')}, which is not bundled` } : {}),
      });
    }
  }
  return { mismatches, roundingMismatches, fontMismatches, missing, unbundled: [...unbundled] };
}

/**
 * Pixel difference of two PNGs over white, ignoring the [masks] regions
 * ({ x, y, width, height } in the images' pixels).
 */
export function pixelDiff(a, b, masks = []) {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  const w = Math.min(pa.width, pb.width);
  const h = Math.min(pa.height, pb.height);
  const diff = new PNG({ width: w, height: h });
  const masked = (x, y) => masks.some((m) => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height);
  let bad = 0;
  let counted = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * pa.width + x) * 4;
      const j = (y * pb.width + x) * 4;
      const o = (y * w + x) * 4;
      // Compare over white, as both renders are shown on white.
      const over = (d, k) => Math.round((d[k] * d[k + 3] + 255 * (255 - d[k + 3])) / 255);
      const grey = over(pa.data, i);
      if (masked(x, y)) {
        diff.data.set([grey, grey, 255, 40], o);
        continue;
      }
      counted++;
      let delta = 0;
      for (let c = 0; c < 3; c++) delta = Math.max(delta, Math.abs(over(pa.data, i + c) - over(pb.data, j + c)));
      if (delta > PIXEL_THRESHOLD) {
        bad++;
        diff.data.set([255, 0, 0, 255], o);
      } else {
        diff.data.set([grey, grey, grey, 70], o);
      }
    }
  }
  return {
    sizes: { design: [pa.width, pa.height], rendered: [pb.width, pb.height] },
    differingPixels: bad,
    differingPercent: counted ? Math.round((bad / counted) * 10000) / 100 : 0,
    image: PNG.sync.write(diff),
  };
}

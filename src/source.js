// Design data from the live plugin when it is connected, otherwise from the
// newest saved snapshot that holds the node.
import { PluginUnavailable } from './bridge.js';
import { hex, visiblePaints } from './codegen/util.js';
import { cropPng, fitPng, pngSize } from './png.js';
import { findSnapshotNode, knownImages, rememberImages, savedImages, saveSnapshot } from './store.js';

export class NotFound extends Error {}

/** Hashes of the image fills under [node]. */
function imageHashes(node, out = new Set()) {
  for (const p of [...(Array.isArray(node.fills) ? node.fills : []), ...(Array.isArray(node.strokes) ? node.strokes : [])]) {
    if (p && p.type === 'IMAGE' && p.imageHash) out.add(p.imageHash);
  }
  (node.children || []).forEach((c) => imageHashes(c, out));
  return out;
}

/** '1-2' -> '1:2', 'I1-2;3-4' -> 'I1:2;3:4'. */
export function normalizeId(id) {
  return String(id).trim().replace(/-/g, ':');
}

export class DesignSource {
  constructor(bridge) {
    this.bridge = bridge;
  }

  /** Calls the plugin; null when the plugin is not reachable. */
  async live(method, params, timeout) {
    try {
      return await this.bridge.call(method, params, timeout);
    } catch (e) {
      if (e instanceof PluginUnavailable) return null;
      throw e;
    }
  }

  async info() {
    return this.live('info', {}, 10000);
  }

  /** The requested id, or the current selection when none is given. */
  async resolveId(nodeId) {
    if (nodeId) return { id: normalizeId(nodeId), info: null };
    const info = await this.info();
    if (!info) {
      throw new NotFound('No nodeId given and the Figma plugin is not ' +
        'connected, so there is no selection to use.');
    }
    if (!info.selection.length) {
      throw new NotFound('No nodeId given and nothing is selected in Figma. ' +
        'Select a frame or pass a nodeId.');
    }
    return { id: info.selection[0].id, info };
  }

  snapshot(id, options) {
    const hit = findSnapshotNode(id, options);
    if (!hit || !hit.node) {
      throw new NotFound(`Node ${id} is not available: the Figma plugin is ` +
        'not connected and no saved snapshot contains it.');
    }
    return hit;
  }

  /**
   * { tree, images: {hash: base64}, source, exportedAt, truncated, failures }.
   * A live read stops after [maxNodes] layers (truncated: true).
   */
  async node(id, { images = false, svg = true, maxDepth, maxNodes, maxVisible } = {}) {
    const result = await this.live('node', {
      id, svg, images, maxDepth, maxNodes, maxVisible, ...(images ? { knownImages: knownImages() } : {}),
    }, 180000);
    if (result && images) {
      // The plugin leaves out images the server saved before.
      try {
        rememberImages(result.images || {});
      } catch { /* the bytes are still in the result */ }
      const missing = (result.imageHashes || []).filter((h) => !(result.images || {})[h]);
      result.images = { ...savedImages(missing), ...(result.images || {}) };
    }
    const extra = result ? {
      ...(result.truncated ? { truncated: true } : {}),
      ...(result.failures && result.failures.length ? { failures: result.failures } : {}),
    } : {};
    if (result && (!svg || maxDepth !== undefined || result.truncated)) {
      return { tree: result.tree, images: result.images || {}, source: 'live', ...extra };
    }
    if (result) {
      // Cached after the response; image bytes are already saved as assets.
      const cached = {
        exportedAt: new Date().toISOString(),
        fileName: result.fileName,
        page: result.page ? result.page.name : null,
        frames: [{ id: result.tree.id, name: result.tree.name, previewPng2x: null, tree: result.tree }],
        images: images ? {} : result.images || {},
      };
      setImmediate(() => {
        try {
          saveSnapshot(cached, { live: true });
        } catch { /* caching is best effort */ }
      });
      return { tree: result.tree, images: result.images || {}, source: 'live', ...extra };
    }
    const hit = this.snapshot(id);
    return {
      tree: rebase(hit.node),
      images: { ...savedImages(imageHashes(hit.node)), ...(hit.data.images || {}) },
      source: 'snapshot',
      exportedAt: hit.exportedAt,
      snapshot: hit.snapshot,
    };
  }

  /** Outline tree (ids, names, boxes) to any depth. */
  async outline(id) {
    const result = await this.live('pageMeta', { id });
    if (result) return { tree: result.tree, source: 'live' };
    const hit = this.snapshot(id);
    return { tree: hit.node, source: 'snapshot', exportedAt: hit.exportedAt };
  }

  /** PNG buffer with its rendered and natural sizes. */
  async screenshot(id, { maxDimension = 1024, contentsOnly } = {}) {
    const result = await this.live('export', {
      id, format: 'PNG', maxDimension, contentsOnly,
    });
    if (result) {
      const png = Buffer.from(result.base64, 'base64');
      return {
        png, ...pngSize(png), originalWidth: result.width,
        originalHeight: result.height, source: 'live',
      };
    }
    this.snapshot(id);
    const hit = findSnapshotNode(id, { preview: true });
    if (!hit) {
      throw new NotFound(`No saved snapshot of ${id} has a preview image. ` +
        'Connect the plugin, or save the frame with "Save selection as snapshot".');
    }
    let png = Buffer.from(hit.frame.previewPng2x, 'base64');
    const frame = hit.frame.tree;
    const size = pngSize(png);
    const exact = Math.abs(size.width - frame.width * 2) < 1.5 &&
      Math.abs(size.height - frame.height * 2) < 1.5;
    let note = null;
    if (hit.node !== frame) {
      if (exact) {
        png = cropPng(png, hit.node.x * 2, hit.node.y * 2,
          hit.node.width * 2, hit.node.height * 2) || png;
      } else {
        note = 'The frame preview includes overflow, so the whole frame is returned.';
      }
    }
    png = fitPng(png, maxDimension);
    return {
      png, ...pngSize(png), originalWidth: hit.node.width,
      originalHeight: hit.node.height, source: 'snapshot',
      exportedAt: hit.exportedAt, note,
    };
  }

  /**
   * A full design export of [id] (frames with trees, SVGs, renders, a 2x
   * preview and image fills), in the snapshot format.
   */
  async exportData(id) {
    const result = await this.live('snapshot', { ids: [id] }, 180000);
    if (result) {
      try {
        saveSnapshot(result);
      } catch { /* caching is best effort */ }
      return { data: result, source: 'live' };
    }
    const hit = this.snapshot(id);
    let preview = null;
    try {
      preview = (await this.screenshot(id, { maxDimension: 65536 })).png.toString('base64');
    } catch { /* no preview saved */ }
    return {
      data: {
        exportedAt: hit.exportedAt,
        fileName: hit.data.fileName || null,
        page: hit.data.page || null,
        frames: [{ id: hit.node.id, name: hit.node.name, previewPng2x: preview, tree: rebase(hit.node) }],
        images: hit.data.images || {},
      },
      source: 'snapshot',
      exportedAt: hit.exportedAt,
    };
  }

  async variables(id) {
    const result = await this.live('variables', { id });
    if (result) return { defs: result.defs, source: 'live', truncated: result.truncated };
    const hit = this.snapshot(id);
    return { defs: rawValues(hit.node), source: 'snapshot', exportedAt: hit.exportedAt };
  }

  async export(id, { format = 'png', scale = 1 } = {}) {
    const result = await this.live('export', { id, format: format.toUpperCase(), scale });
    if (result) {
      return result.text !== undefined
        ? { data: Buffer.from(result.text), format: 'svg', source: 'live' }
        : { data: Buffer.from(result.base64, 'base64'), format: result.format, source: 'live' };
    }
    const shot = await this.screenshot(id, { maxDimension: 65536 });
    return { data: shot.png, format: 'png', source: 'snapshot', note: 'Rendered at 2x from the saved preview.' };
  }
}

/** Positions relative to [root] so a sub-node renders like a frame. */
function rebase(root) {
  const dx = root.x || 0;
  const dy = root.y || 0;
  const move = (n) => ({
    ...n,
    ...(n.x !== undefined ? { x: n.x - dx, y: n.y - dy } : {}),
    ...(n.children ? { children: n.children.map(move) } : {}),
  });
  return move(root);
}

function lineHeight(lh) {
  if (!lh || lh.unit === 'AUTO') return 'normal';
  return lh.unit === 'PERCENT' ? `${lh.value}%` : String(lh.value);
}

/** Without the plugin, style names are unknown: list the raw values used. */
function rawValues(root) {
  const defs = {};
  const walk = (n) => {
    if (n.visible === false) return;
    for (const p of [...visiblePaints(n.fills), ...visiblePaints(n.strokes)]) {
      if (p.type === 'SOLID') defs[`color ${hex(p.color, p.opacity ?? 1)}`] = hex(p.color, p.opacity ?? 1);
    }
    for (const s of n.segments || []) {
      const f = s.fontName || {};
      if (!f.family) continue;
      defs[`font ${f.family} ${f.style} ${s.fontSize}`] =
        `Font(family: "${f.family}", style: ${f.style}, size: ${s.fontSize}, ` +
        `weight: ${s.fontWeight}, lineHeight: ${lineHeight(s.lineHeight)}, ` +
        `letterSpacing: ${s.letterSpacing ? s.letterSpacing.value : 0})`;
      for (const p of visiblePaints(s.fills)) {
        if (p.type === 'SOLID') defs[`color ${hex(p.color, p.opacity ?? 1)}`] = hex(p.color, p.opacity ?? 1);
      }
    }
    (n.children || []).forEach(walk);
  };
  walk(root);
  return defs;
}

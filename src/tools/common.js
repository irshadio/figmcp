// Response helpers shared by the tool modules.
import path from 'node:path';
import { z } from 'zod';
import { NotFound } from '../source.js';
import { imageSize } from '../png.js';
import { ASSETS, imageExt, saveAsset } from '../store.js';

// Node ids: '1:2', '1-2', and instance sublayers 'I1:2;3:4'.
const NODE_ID = /^\s*I?\d+[:-]\d+(;I?\d+[:-]\d+)*\s*$/;

export const nodeIdSchema = z.string().min(1).regex(NODE_ID,
  'Not a Figma node id: use the form "123:456" (or "123-456" from a URL; "I1:2;3:4" for layers in an instance).')
  .describe(
    'The ID of the node, eg. "123:456" or "123-456" (instance ids like ' +
    '"I1:2;3:4" work too). Omit it to use the current selection in Figma.');
export const fileKeySchema = z.string().optional().describe(
  'The key of the Figma file. Accepted for compatibility; the file open in ' +
  'Figma Desktop is always used.');

export function text(value) {
  return { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) };
}

export function image(buffer) {
  return { type: 'image', data: buffer.toString('base64'), mimeType: 'image/png' };
}

export function sourceNote(result) {
  if (result.source !== 'snapshot') return null;
  return text(`Note: the Figma plugin is not connected, so this comes from a snapshot saved ${
    result.exportedAt || 'earlier'}. It may be out of date.`);
}

export function selectionBlock(info) {
  if (!info || !info.selection.length) return null;
  return text('Currently selected nodes:\n' +
    info.selection.map((n) => `- ${n.id} "${n.name}" (${n.type})`).join('\n'));
}

export function guard(fn) {
  return async (args) => {
    try {
      return { content: (await fn(args)).filter(Boolean) };
    } catch (e) {
      const message = e instanceof NotFound ? e.message : `Error: ${e.message}`;
      return { content: [text(message)], isError: true };
    }
  };
}

export function assetEntry(bridge, name) {
  return { url: bridge.assetUrl(name), path: path.join(ASSETS, name) };
}

/** Saves embedded design data as assets and returns their file paths. */
export function fileResolver(images) {
  const bytes = (hash) => (images[hash] ? Buffer.from(images[hash], 'base64') : null);
  return {
    svg: (svg) => path.join(ASSETS, saveAsset(svg, 'svg')),
    image: (hash) => {
      const b = bytes(hash);
      return b ? path.join(ASSETS, saveAsset(b, imageExt(b))) : null;
    },
    imageExt: (hash) => {
      const b = bytes(hash);
      return b ? imageExt(b) : 'png';
    },
    imageSize: (hash) => {
      const b = bytes(hash);
      return b ? imageSize(b) : null;
    },
    render: (render) => path.join(ASSETS, saveAsset(Buffer.from(render.base64, 'base64'), 'png')),
  };
}

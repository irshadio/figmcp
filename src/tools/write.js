// Design write tool: runs a script against the Figma plugin API in the open
// file, so designs can be created and edited.
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { fileKeySchema, guard, nodeIdSchema, text } from './common.js';

const DEFAULT_TIMEOUT = 60000;
const MAX_IMAGE = 20 * 1024 * 1024;

// Runs in the plugin with `figma` and `params` in scope.
const PLACE = String.raw`
const p = params;
const at = async (id, what) => {
  const node = await figma.getNodeByIdAsync(id);
  if (!node) throw new Error('No node ' + id + ' (' + what + ')');
  return node;
};
const parent = p.parentId ? await at(p.parentId, 'parentId') : figma.currentPage;
if (!('appendChild' in parent)) throw new Error(p.parentId + ' cannot hold layers');
const show = async (node) => {
  let page = node;
  while (page && page.type !== 'PAGE') page = page.parent;
  if (page && page !== figma.currentPage) await figma.setCurrentPageAsync(page);
  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
};
let node;
let size = null;
if (p.svg !== undefined) {
  node = figma.createNodeFromSvg(p.svg);
} else {
  const img = figma.createImage(figma.base64Decode(p.data));
  size = await img.getSizeAsync();
  const paint = { type: 'IMAGE', imageHash: img.hash, scaleMode: p.scaleMode };
  if (p.nodeId) {
    node = await at(p.nodeId, 'nodeId');
    if (!('fills' in node)) throw new Error(node.type + ' ' + node.id + ' has no fills');
    node.fills = p.keepFills && Array.isArray(node.fills) ? node.fills.concat([paint]) : [paint];
    await show(node);
    return { node, image: { hash: img.hash, width: size.width, height: size.height } };
  }
  node = figma.createRectangle();
  node.fills = [paint];
}
const natural = size || { width: node.width, height: node.height };
let w = p.width;
let h = p.height;
if (w && !h) h = w * natural.height / natural.width;
if (h && !w) w = h * natural.width / natural.height;
w = w || natural.width;
h = h || natural.height;
if (node.type === 'RECTANGLE') node.resize(w, h);
else node.rescale(w / node.width);
node.name = p.name;
parent.appendChild(node);
if (p.x !== undefined || p.y !== undefined) {
  node.x = p.x || 0;
  node.y = p.y || 0;
} else if (parent.type === 'PAGE') {
  const others = parent.children.filter((n) => n !== node);
  node.x = others.length ? Math.max(...others.map((n) => n.x + n.width)) + 100 : 0;
  node.y = others.length ? Math.min(...others.map((n) => n.y)) : 0;
}
await show(node);
return { node, ...(size ? { image: { width: size.width, height: size.height } } : {}) };
`;

export function registerWriteTools(server, bridge) {
  server.registerTool('use_figma', {
    description:
      'Create or edit designs in the file open in Figma Desktop by running ' +
      'JavaScript against the Figma plugin API. `code` is the body of an ' +
      'async function with `figma` in scope: use await, and `return` a value ' +
      '(nodes come back as {id, name, type, x, y, width, height}); ' +
      'console.log output is returned too. The whole run is one undo step. ' +
      'If the script throws, the changes it made before the error stay.\n\n' +
      'Rules of the plugin API here:\n' +
      '- The file uses dynamic page loading: use figma.getNodeByIdAsync, ' +
      'figma.setCurrentPageAsync, await page.loadAsync() before reading another ' +
      'page, getMainComponentAsync, and the *Async style/variable getters.\n' +
      '- Load every font before setting text or text properties: await ' +
      'figma.loadFontAsync({ family: "Inter", style: "Regular" }). Check ' +
      'figma.listAvailableFontsAsync() when unsure a font exists.\n' +
      '- Colours are 0-1 RGB: fills = [{ type: "SOLID", color: { r: 1, g: 0.4, b: 0 } }]. ' +
      'Paint arrays are immutable: assign a new array.\n' +
      '- Prefer auto layout: layoutMode, itemSpacing, padding*, ' +
      'primaryAxisAlignItems, counterAxisAlignItems; set ' +
      'layoutSizingHorizontal/Vertical ("FILL", "HUG", "FIXED") only after the ' +
      'node is appended to an auto-layout parent.\n' +
      '- New nodes land on the current page: place top-level frames clear of ' +
      'existing ones, and append children with parent.appendChild(node).\n' +
      '- Reuse what the file has: local components (figma.root.findAll is slow; ' +
      'search the current page or use figma.getLocalPaintStylesAsync, ' +
      'figma.variables.getLocalVariablesAsync), and set bound variables with ' +
      'figma.variables.setBoundVariableForPaint.\n' +
      '- Images from the web: const img = await figma.createImageAsync(url), ' +
      'then fills = [{ type: "IMAGE", imageHash: img.hash, scaleMode: "FILL" }]. ' +
      'fetch(url) works too (e.g. an SVG for figma.createNodeFromSvg).\n' +
      '- figma.currentPage.selection = [node] and ' +
      'figma.viewport.scrollAndZoomIntoView([node]) show the result.\n\n' +
      'Build a screen in a few calls (structure, then sections), return the ' +
      'ids, and check each step with get_screenshot.',
    inputSchema: {
      code: z.string().min(1).describe('Body of an async function run with `figma` in scope.'),
      fileKey: fileKeySchema,
      timeoutMs: z.number().int().positive().max(600000).optional()
        .describe(`How long to wait for the script, in ms (default ${DEFAULT_TIMEOUT}).`),
    },
  }, guard(async ({ code, timeoutMs = DEFAULT_TIMEOUT }) => {
    const { result, logs } = await bridge.call('run', { code }, timeoutMs);
    return [
      text({ result }),
      logs.length && text(`Logs:\n${logs.join('\n')}`),
    ];
  }));

  server.registerTool('place_image', {
    description:
      'Put an image file from this computer into the file open in Figma ' +
      'Desktop: a PNG, JPG or GIF becomes a rectangle with the image fill ' +
      '(or the fill of the layer `nodeId`), and an SVG becomes editable ' +
      'vector layers. Use it for the project\'s own assets (logos, icons, ' +
      'photos) while designing; use_figma with figma.createImageAsync(url) ' +
      'takes images from the web. The new layer goes into `parentId` (default: ' +
      'the current page, right of its content), sized by `width`/`height` ' +
      '(one keeps the aspect ratio; default: the image\'s own size). Images ' +
      'larger than 4096 px on a side are scaled down by Figma.',
    inputSchema: {
      path: z.string().min(1).describe('Path of the image file (absolute, or relative to the project).'),
      nodeId: nodeIdSchema.optional().describe('Set the image as the fill of this layer instead of making a new one (not for SVG).'),
      parentId: nodeIdSchema.optional().describe('Frame or group to put the new layer in.'),
      name: z.string().optional().describe('Layer name (default: the file name).'),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      scaleMode: z.enum(['FILL', 'FIT', 'CROP', 'TILE']).optional().describe('How the image fills the layer (default FILL).'),
      keepFills: z.boolean().optional().describe('With nodeId: add the image above the existing fills instead of replacing them.'),
      fileKey: fileKeySchema,
    },
  }, guard(async ({ path: file, nodeId, parentId, name, x, y, width, height, scaleMode = 'FILL', keepFills = false }) => {
    const full = path.resolve(file);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new Error(`${file} does not exist.`);
    if (fs.statSync(full).size > MAX_IMAGE) throw new Error(`${file} is larger than ${MAX_IMAGE / 1024 / 1024} MB.`);
    const bytes = fs.readFileSync(full);
    const isSvg = /\.svg$/i.test(full) || /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(bytes.subarray(0, 512).toString('utf8'));
    const params = { nodeId, parentId, name: name || path.basename(full).replace(/\.[^.]+$/, ''), x, y, width, height, scaleMode, keepFills };
    if (isSvg) {
      if (nodeId) throw new Error('An SVG cannot be a fill: leave out nodeId, or use parentId to put it in a layer.');
      params.svg = bytes.toString('utf8');
    } else {
      const kind = imageKind(bytes);
      if (!kind) throw new Error(`${file} is not a PNG, JPG, GIF or SVG file.`);
      params.data = bytes.toString('base64');
    }
    const code = `const params = ${JSON.stringify(params)};\n${PLACE}`;
    const { result } = await bridge.call('run', { code }, 120000);
    return [text(result)];
  }));
}

function imageKind(bytes) {
  if (bytes[0] === 0x89 && bytes.subarray(1, 4).toString() === 'PNG') return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes.subarray(0, 3).toString() === 'GIF') return 'gif';
  return null;
}

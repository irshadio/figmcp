// Design write tool: runs a script against the Figma plugin API in the open
// file, so designs can be created and edited.
import { z } from 'zod';
import { fileKeySchema, guard, text } from './common.js';

const DEFAULT_TIMEOUT = 60000;

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
}

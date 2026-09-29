// Design read tools: design context, metadata, screenshots, variables and
// assets.
import path from 'node:path';
import { z } from 'zod';
import { listMappings, lookup } from '../connect.js';
import { toMetadataXml } from '../codegen/metadata.js';
import { countNodes, toReactTailwind } from '../codegen/react.js';
import { ASSETS, imageExt, saveAsset, snapshotSummary } from '../store.js';
import {
  assetEntry, fileKeySchema, guard, image, nodeIdSchema, resolver, selectionBlock,
  sourceNote, text,
} from './common.js';

const CODE_NODE_LIMIT = 800;
const ASSET_CAP = 20;

const GUIDANCE =
  'IMPORTANT: the code above is reference React + Tailwind generated from the ' +
  'design. Convert it to the target project\'s framework, components, tokens ' +
  'and conventions instead of copying it. Every value is exact: sizes, ' +
  'spacing, radii, colours and fonts. var(--name,value) marks a design ' +
  'variable: use the project token of that name, with that value. Each ' +
  'element carries data-node-id; call get_design_context on a child id for ' +
  'detail. data-component / data-variant name the component and its variant; ' +
  'data-interactions list prototype actions; data-rasterized marks a layer ' +
  'shipped as an image (a mask or a rotated group). Compare the result with ' +
  'the screenshot.';

export function registerDesignTools(server, bridge, source) {
  server.registerTool('get_design_context', {
    description:
      'Get design context for a Figma node — the primary tool for design-to-code ' +
      'workflows. Returns reference React + Tailwind code (design variables as ' +
      'var(--name,value), mapped components as their code component), the asset ' +
      'URLs it uses, a screenshot and the variables in the node. The code must ' +
      'be adapted to the target project. Use the nodeId parameter to specify a ' +
      'node id; from a URL like https://figma.com/design/:fileKey/:fileName?node-id=1-2 ' +
      'the node id is 1:2. With no nodeId the current selection in Figma is used. ' +
      'Large nodes return metadata instead of code unless forceCode is set.',
    inputSchema: {
      nodeId: nodeIdSchema.optional(),
      fileKey: fileKeySchema,
      clientLanguages: z.string().optional().describe('Comma separated languages of the client (logging only).'),
      clientFrameworks: z.string().optional().describe('Comma separated frameworks of the client (logging only).'),
      excludeScreenshot: z.boolean().optional().describe('Leave the screenshot out of the response.'),
      forceCode: z.boolean().optional().describe('Always return code, even for very large nodes.'),
      disableCodeConnect: z.boolean().optional().describe('Draw mapped components from their layers instead of naming the code component.'),
      skillNames: z.string().optional().describe('Accepted for compatibility (logging only).'),
    },
  }, guard(async ({ nodeId, excludeScreenshot, forceCode, disableCodeConnect }) => {
    const { id } = await source.resolveId(nodeId);
    const node = await source.node(id, { images: true });
    const count = countNodes(node.tree);
    if (count > CODE_NODE_LIMIT && !forceCode) {
      return [
        text(`The node has ${count} layers, too many for code in one response. ` +
          'Here is its metadata instead; call get_design_context on the child ' +
          'node ids you need, or pass forceCode: true.'),
        text(toMetadataXml(node.tree)),
        sourceNote(node),
      ];
    }
    const mappings = disableCodeConnect ? [] : listMappings();
    const connect = mappings.length ? (n) => lookup(n, mappings) : null;
    const result = toReactTailwind(node.tree, resolver(bridge, node.images), { connect });
    const out = [text(result.code)];
    if (Object.keys(result.assets).length) {
      const map = {};
      for (const [name, url] of Object.entries(result.assets)) {
        map[name] = { url, path: path.join(ASSETS, url.split('/').pop()) };
      }
      out.push(text('Assets used in the code (served by the local MCP server; ' +
        `the same files are on disk at each path):\n${JSON.stringify(map, null, 2)}`));
    }
    if (result.connected.length) {
      out.push(text('Mapped components used (Code Connect). Their exact look is in ' +
        'the design: call get_design_context with disableCodeConnect: true on the ' +
        `instance id when the component's defaults may differ:\n${JSON.stringify(result.connected, null, 2)}`));
    }
    try {
      const vars = await source.variables(id);
      if (vars.source === 'live' && Object.keys(vars.defs).length) {
        out.push(text(`These variables and styles are used in the design:\n${JSON.stringify(vars.defs, null, 2)}`));
      }
    } catch { /* variables are optional context */ }
    out.push(text(GUIDANCE));
    if (!excludeScreenshot) {
      try {
        const shot = await source.screenshot(id, { maxDimension: 1024 });
        out.push(image(shot.png));
      } catch { /* a node too large to render still gets its code */ }
    }
    out.push(sourceNote(node));
    return out;
  }));

  server.registerTool('get_metadata', {
    description:
      'IMPORTANT: Always prefer to use get_design_context. Get metadata for a ' +
      'node or page in XML format: node IDs, layer types, names, positions and ' +
      'sizes, useful for an overview of the structure. nodeId can be a page ' +
      'id (e.g. 0:1). When nodeId is omitted, returns the pages of the ' +
      'document (and saved snapshots) instead. When something is selected in ' +
      'Figma, the response starts with a "Currently selected nodes:" block.',
    inputSchema: { nodeId: nodeIdSchema.optional(), fileKey: fileKeySchema },
  }, guard(async ({ nodeId }) => {
    const info = await source.info();
    if (!nodeId) {
      const snapshots = snapshotSummary();
      return [
        selectionBlock(info),
        info ? text(`Pages in "${info.fileName}":\n${info.pages.map((p) => `- ${p.id} "${p.name}"`).join('\n')}`)
          : text('The Figma plugin is not connected, so pages cannot be listed.'),
        snapshots.length && text(`Saved snapshots (readable without the plugin):\n${JSON.stringify(snapshots, null, 2)}`),
      ];
    }
    const { id } = await source.resolveId(nodeId);
    const outline = await source.outline(id);
    return [selectionBlock(info), text(toMetadataXml(outline.tree)), sourceNote(outline)];
  }));

  server.registerTool('get_screenshot', {
    description:
      'Generate a screenshot for a given node or the currently selected node ' +
      'in Figma. maxDimension (default 1024) caps the longer edge of the PNG ' +
      '(up to 2x the node size). The response gives a local URL and file path ' +
      'plus width/height and original_width/original_height. Set ' +
      'enableBase64Response to also get the image inline.',
    inputSchema: {
      nodeId: nodeIdSchema.optional(),
      fileKey: fileKeySchema,
      maxDimension: z.number().int().positive().max(65536).optional()
        .describe('Longest edge of the PNG in pixels (default 1024).'),
      contentsOnly: z.boolean().optional()
        .describe('Render the node in isolation, without overlapping content.'),
      enableBase64Response: z.boolean().optional()
        .describe('Also include the PNG inline as base64.'),
    },
  }, guard(async ({ nodeId, maxDimension = 1024, contentsOnly, enableBase64Response }) => {
    const { id } = await source.resolveId(nodeId);
    const shot = await source.screenshot(id, { maxDimension, contentsOnly });
    const entry = assetEntry(bridge, saveAsset(shot.png, 'png'));
    return [
      text({
        nodeId: id,
        url: entry.url,
        path: entry.path,
        width: shot.width,
        height: shot.height,
        original_width: shot.originalWidth,
        original_height: shot.originalHeight,
        ...(shot.note ? { note: shot.note } : {}),
      }),
      text(`Download: curl -sS -o screenshot.png '${entry.url}' (or read the file at ${entry.path}).`),
      enableBase64Response && image(shot.png),
      sourceNote(shot),
    ];
  }));

  server.registerTool('get_variable_defs', {
    description:
      "Get variable definitions for a given node id. E.g. {'icon/default/secondary': #949494}. " +
      'Variables and styles are reusable values applied to colours, fonts, ' +
      'sizes and spacings. Values resolve for the node\'s own mode.',
    inputSchema: { nodeId: nodeIdSchema.optional(), fileKey: fileKeySchema },
  }, guard(async ({ nodeId }) => {
    const { id } = await source.resolveId(nodeId);
    const vars = await source.variables(id);
    return [
      text(vars.defs),
      vars.truncated && text('Note: the node is very large; only the first 5000 layers were scanned.'),
      vars.source === 'snapshot' && text('Note: without the plugin, variable and style names are unknown; these are the raw values used in the saved snapshot.'),
    ];
  }));

  server.registerTool('download_assets', {
    description:
      'Download assets for a single node: an exported render (`export`), the ' +
      'original images used as fills (`rawImages`, up to 20) and SVGs of the ' +
      'vector layers (`svgAssets`, up to 20). defaultFormat and defaultScale ' +
      'set the export format (png, jpg, svg, pdf) and scale (default png at 1).',
    inputSchema: {
      nodeId: nodeIdSchema.optional(),
      fileKey: fileKeySchema,
      defaultFormat: z.enum(['png', 'jpg', 'svg', 'pdf']).optional(),
      defaultScale: z.number().min(0.01).max(4).optional(),
    },
  }, guard(async ({ nodeId, defaultFormat = 'png', defaultScale = 1 }) => {
    const { id } = await source.resolveId(nodeId);
    const exported = await source.export(id, { format: defaultFormat, scale: defaultScale });
    const node = await source.node(id, { images: true });
    const rawImages = Object.entries(node.images).slice(0, ASSET_CAP).map(([hash, b64]) => {
      const bytes = Buffer.from(b64, 'base64');
      const format = imageExt(bytes);
      return { imageHash: hash, format, ...assetEntry(bridge, saveAsset(bytes, format)) };
    });
    const svgAssets = [];
    const renders = [];
    const walk = (n) => {
      if (svgAssets.length >= ASSET_CAP || n.visible === false) return;
      if (n.svg) {
        svgAssets.push({ nodeId: n.id, name: n.name, format: 'svg', ...assetEntry(bridge, saveAsset(n.svg, 'svg')) });
        return;
      }
      if (n.render && renders.length < ASSET_CAP) {
        renders.push({ nodeId: n.id, name: n.name, format: 'png', scale: 2, reason: n.rasterized,
          ...assetEntry(bridge, saveAsset(Buffer.from(n.render.base64, 'base64'), 'png')) });
        return;
      }
      (n.children || []).forEach(walk);
    };
    walk(node.tree);
    const exportName = saveAsset(exported.data, exported.format);
    return [
      text({
        export: { format: exported.format, ...assetEntry(bridge, exportName), ...(exported.note ? { note: exported.note } : {}) },
        rawImages,
        svgAssets,
        ...(renders.length ? { renderedLayers: renders } : {}),
      }),
      sourceNote(node),
    ];
  }));
}

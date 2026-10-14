// Design read tools: design context, metadata, screenshots, variables and
// assets.
import path from 'node:path';
import { z } from 'zod';
import { listMappings, lookup } from '../connect.js';
import { toFlutter } from '../codegen/flutter/index.js';
import { toMetadataXml } from '../codegen/metadata.js';
import { countNodes, toReactTailwind } from '../codegen/react.js';
import { systemUi } from '../codegen/system-ui.js';
import { detectFramework, flutterAssetDirs, FRAMEWORKS, usesScreenUtil } from '../project.js';
import { ASSETS, imageExt, saveAsset, snapshotSummary } from '../store.js';
import {
  assetEntry, fileKeySchema, fileResolver, guard, image, nodeIdSchema, resolver, selectionBlock,
  sourceNote, text,
} from './common.js';

const CODE_NODE_LIMIT = 800;
// A read stops here, so a huge page cannot hold the plugin for minutes.
const READ_NODE_LIMIT = 2500;
const FORCED_NODE_LIMIT = 30000;
const ASSET_CAP = 20;

const FLUTTER_GUIDANCE =
  'IMPORTANT: the code above is reference Flutter code generated from the ' +
  'design. Adapt it to the project (its widgets, theme, text styles, ' +
  'navigation and state) instead of pasting it. Every value is exact, in ' +
  'logical pixels at the design size: sizes, spacing, radii, colours, fonts ' +
  'and line heights (height with TextLeadingDistribution.even reproduces ' +
  'Figma\'s line boxes). DesignTokens holds each design variable used, with ' +
  'its Figma name: use the project\'s token of that name. AppTextStyles holds ' +
  'each Figma text style used: map it to the app\'s text theme. Auto-layout frames ' +
  'are Rows, Columns and Wraps; other frames are Stacks whose Positioned ' +
  'children follow the Figma constraints. A phone-sized frame is drawn as a ' +
  'screen: it fills the screen, keeps the shortest height its layers fit ' +
  'on a shorter screen and scrolls, and keeps the layers Figma fixes when ' +
  'scrolling on top; sections that span the width stretch and fixed-width ' +
  'text columns may shrink. Other fixed sizes stay as designed, so check ' +
  'narrow phones. Copy the listed ' +
  'assets into the project (SvgPicture needs flutter_svg; spacing on Row and ' +
  'Column needs Flutter 3.27 or later) and declare the fonts. Layers listed ' +
  'as system UI belong to the phone, not the app: leave them out and keep ' +
  'their room with SafeArea. Compare the result with the screenshot.';

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/** The Flutter response blocks after the code: assets, fonts, system UI, notes. */
function flutterDetails(result, tree) {
  const out = [];
  const entries = Object.entries(result.assets);
  if (entries.length) {
    const dirs = [...new Set(entries.map(([asset]) => path.posix.dirname(asset)))];
    const copy = [`mkdir -p ${dirs.map(shellQuote).join(' ')}`,
      ...entries.map(([asset, file]) => `cp ${shellQuote(file)} ${shellQuote(asset)}`)].join('\n');
    out.push(text('Assets used in the code (asset path -> file on disk). Copy them into the ' +
      `project root and declare the folders under flutter: assets: in pubspec.yaml:\n${JSON.stringify(result.assets, null, 2)}\n\n${copy}`));
  }
  const fonts = Object.entries(result.fonts);
  if (fonts.length) {
    out.push(text(`Fonts used (declare each family and weight under flutter: fonts: in pubspec.yaml):\n${
      fonts.map(([family, weights]) => `- ${family}: ${weights.join(', ')}`).join('\n')}`));
  }
  if (result.screen) {
    out.push(text(`${result.className} is drawn as a phone screen: it fills the screen` +
      `${result.scrolls ? ' and scrolls (the design is taller than a phone)' : ', and scrolls on a phone too short for its layers'}.`));
  }
  const chrome = systemUi(tree);
  if (chrome.length) {
    out.push(text(`System UI in the design (drawn by the phone, not the app):\n${
      chrome.map((c) => `- ${c.id} "${c.name}": ${c.kind}, ${c.box[2]}x${c.box[3]} at (${c.box[0]}, ${c.box[1]})`).join('\n')}`));
  }
  if (result.connected.length) {
    out.push(text('Mapped components used (Code Connect). Their exact look is in the design: call ' +
      'get_design_context with disableCodeConnect: true on the instance id when the ' +
      `component's defaults may differ:\n${JSON.stringify(result.connected, null, 2)}`));
  }
  if (result.rasterized.length) {
    out.push(text(`Layers shipped as 2x images (masks, rotated groups):\n${JSON.stringify(result.rasterized, null, 2)}`));
  }
  if (result.warnings.length) {
    out.push(text(`Approximations (the design has more than this code draws):\n${
      result.warnings.map((w) => `- ${w.id} "${w.name}": ${w.message}`).join('\n')}`));
  }
  return out;
}

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
      'workflows. Returns reference code (Flutter widgets for Flutter projects, ' +
      'React + Tailwind otherwise), the assets it uses, a screenshot and the ' +
      'variables in the node. The code must be adapted to the target project. ' +
      'Use the nodeId parameter to specify a node id; from a URL like ' +
      'https://figma.com/design/:fileKey/:fileName?node-id=1-2 the node id is 1:2. ' +
      'With no nodeId the current selection in Figma is used. Large nodes return ' +
      'metadata instead of code unless forceCode is set.',
    inputSchema: {
      nodeId: nodeIdSchema.optional(),
      fileKey: fileKeySchema,
      framework: z.enum(FRAMEWORKS).optional().describe(
        'Code to generate: flutter or react. Default: from clientFrameworks / clientLanguages, ' +
        'else FIGMA_LOCAL_MCP_FRAMEWORK, else flutter when the project has a pubspec.yaml, else react.'),
      clientLanguages: z.string().optional().describe('Comma separated languages of the client, e.g. "dart" (picks the framework).'),
      clientFrameworks: z.string().optional().describe('Comma separated frameworks of the client, e.g. "flutter" (picks the framework).'),
      screen: z.boolean().optional().describe(
        'Flutter: draw the node as a phone screen that fills the screen and scrolls when tall (default: portrait frames 300-480 wide).'),
      assetsDir: z.string().optional().describe(
        'Flutter: folder of the asset paths in the code (default: the svg/png/images folders of the project\'s pubspec.yaml, else assets/figma).'),
      screenUtil: z.boolean().optional().describe(
        'Flutter: write lengths with flutter_screenutil (.w, .h, .r, .sp) so the layout scales from the design size ' +
        '(default: when the project\'s pubspec.yaml depends on flutter_screenutil).'),
      excludeScreenshot: z.boolean().optional().describe('Leave the screenshot out of the response.'),
      forceCode: z.boolean().optional().describe('Always return code, even for very large nodes.'),
      disableCodeConnect: z.boolean().optional().describe('Draw mapped components from their layers instead of naming the code component.'),
      skillNames: z.string().optional().describe('Accepted for compatibility (logging only).'),
    },
  }, guard(async (args) => {
    const { nodeId, excludeScreenshot, forceCode, disableCodeConnect, assetsDir, screen } = args;
    const scaled = args.screenUtil ?? usesScreenUtil();
    const { id } = await source.resolveId(nodeId);
    // Variables and the screenshot are read while the layers are.
    const varsRead = source.variables(id).catch(() => null);
    const shotRead = excludeScreenshot ? null : source.screenshot(id, { maxDimension: 1024 }).catch(() => null);
    const node = await source.node(id, {
      images: true,
      maxNodes: forceCode ? FORCED_NODE_LIMIT : READ_NODE_LIMIT,
      ...(forceCode ? {} : { maxVisible: CODE_NODE_LIMIT + 1 }),
    });
    const count = countNodes(node.tree);
    if (node.truncated || (count > CODE_NODE_LIMIT && !forceCode)) {
      const outline = node.truncated ? (await source.outline(id)).tree : node.tree;
      return [
        text(`The node has ${node.truncated ? 'more than ' : ''}${node.truncated ? countNodes(outline) : count} layers, ` +
          'too many for code in one response. Here is its metadata instead; call ' +
          'get_design_context on the child node ids you need, or pass forceCode: true.'),
        text(toMetadataXml(outline)),
        sourceNote(node),
      ];
    }
    const framework = detectFramework(args);
    const mappings = disableCodeConnect ? [] : listMappings();
    const connect = mappings.length ? (n) => lookup(n, mappings) : null;
    let out;
    try {
      if (framework === 'flutter') {
        const dirs = assetsDir ? { svg: assetsDir.replace(/\/+$/, ''), image: assetsDir.replace(/\/+$/, '') } : flutterAssetDirs();
        const result = toFlutter(node.tree, fileResolver(node.images), { connect, assetDirs: dirs, screen, screenUtil: scaled });
        out = [text(result.code), ...flutterDetails(result, node.tree)];
        if (scaled) {
          out.push(text(`Lengths use flutter_screenutil: .w and .h scale from a ${node.tree.width}x${node.tree.height} ` +
            'design, .r takes the smaller scale and .sp scales text. Keep the app\'s ScreenUtilInit designSize; ' +
            'when it differs from this frame, the frame\'s numbers still scale against it.'));
        }
      } else {
        const result = toReactTailwind(node.tree, resolver(bridge, node.images), { connect });
        out = [text(result.code)];
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
        if (result.warnings.length) {
          out.push(text(`Layers drawn as placeholders:\n${result.warnings.map((w) => `- ${w.id} "${w.name}": ${w.error}`).join('\n')}`));
        }
      }
    } catch (e) {
      // The generators isolate each layer; this is a last resort so a read
      // still gives the structure.
      out = [
        text(`Code generation failed (${e.message}). Here is the node's metadata instead.`),
        text(toMetadataXml(node.tree)),
      ];
    }
    if (node.failures && node.failures.length) {
      out.push(text(`The plugin could not read some layers; they are left out:\n${
        node.failures.map((f) => `- ${f.id} "${f.name}": ${f.error}`).join('\n')}`));
    }
    const vars = await varsRead;
    if (vars && vars.source === 'live' && Object.keys(vars.defs).length) {
      out.push(text(`These variables and styles are used in the design:\n${JSON.stringify(vars.defs, null, 2)}`));
    }
    out.push(text(framework === 'flutter' ? FLUTTER_GUIDANCE : GUIDANCE));
    // A node too large to render still gets its code.
    const shot = shotRead && await shotRead;
    if (shot) out.push(image(shot.png));
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
    const [exported, node] = await Promise.all([
      source.export(id, { format: defaultFormat, scale: defaultScale }),
      source.node(id, { images: true }),
    ]);
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

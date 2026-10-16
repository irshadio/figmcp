// Design read tools: design context, metadata, screenshots, variables and
// assets.
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { listMappings, lookup } from '../connect.js';
import { toFlutter } from '../codegen/flutter/index.js';
import { boundedMetadataXml } from '../codegen/metadata.js';
import { countNodes, toReactTailwind } from '../codegen/react.js';
import { mergeDesignSystem } from '../codegen/swiftui/design-system.js';
import { toSwiftUI } from '../codegen/swiftui/index.js';
import { systemUi } from '../codegen/system-ui.js';
import { projectFontFaces } from '../fonts.js';
import {
  assetCatalog, designSystemFile, detectFramework, flutterAssetDirs, FRAMEWORKS, isSwiftPackage, usesScreenUtil,
} from '../project.js';
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
// Responses stay within what clients take in one tool result (about 25k
// tokens); longer code is asked for part by part.
const CODE_CHARS = 60000;
// All text blocks of a response together.
const RESPONSE_CHARS = 90000;
const DESIGN_SYSTEM_CHARS = 8000;
const METADATA_CHARS = 60000;
const SCREENSHOT_MAX = 4096;

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

const SWIFTUI_GUIDANCE =
  'IMPORTANT: the code above is reference SwiftUI, written the way a production screen is built: adapt it to the ' +
  'project (its design system, models, navigation and state) and keep what it does. Values are exact, in points: ' +
  'fonts are named by PostScript face and scale with Dynamic Type; .designLineHeight sets Figma\'s line boxes. ' +
  'DesignTokens holds the design variables by their Figma names: use the project\'s tokens, and give colours a dark ' +
  'appearance. The Structure block says what each part is and the pattern the code uses (press-style Buttons, a ' +
  'sliding selection indicator, haptics, LazyVGrid, snapping carousels, pinned bars, header traits, accessibility ' +
  'labels, a focus chain through text fields, Reduce Motion), with each role\'s confidence and evidence; a layer ' +
  'name tag such as "Pay [button]" or "[no-role]" sets or clears a role. Selection is @State set to the design; ' +
  'the screen asks its owner to act through its nested Action enum (types only it uses are nested too): move that ' +
  'state to a view model, wire each case to real navigation and replace the literal data with the model\'s. A ' +
  'phone-sized frame fills the screen and scrolls, with pinned bars in safeAreaInset and system UI left to the ' +
  'phone; sections follow each other in a VStack, so growing text pushes the rest down, and rows and grids ' +
  'stack at accessibility sizes. Fixed sizes stay as designed: check narrow phones. Merge DesignSystem.swift into ' +
  'the target once (later screens return the project\'s file with what it lacks added). Keep the #Preview, check the result with verify_code or against the screenshot.';

// Blocks a response can lose first when it is too long, most expendable first.
const EXPENDABLE = [
  [/^These variables and styles are used in the design:/, 'The variables used are in DesignTokens in the code; call get_variable_defs for all of them.'],
  [/^Approximations \(the design has more than this code draws\):/, null],
  [/^Structure \(/, null],
  [/^The plugin could not read some layers/, null],
];

/**
 * [blocks] cut to [max] characters of text: the most expendable blocks are
 * shortened first (to their first lines, or a pointer), never the code,
 * assets or the design system.
 */
export function withinBudget(blocks, max) {
  const size = () => blocks.reduce((n, b) => n + (b && b.type === 'text' ? b.text.length : 0), 0);
  for (const [pattern, pointer] of EXPENDABLE) {
    if (size() <= max) break;
    const i = blocks.findIndex((b) => b && b.type === 'text' && pattern.test(b.text));
    if (i < 0) continue;
    const over = size() - max;
    const t = blocks[i].text;
    blocks[i] = text(pointer || (t.length - over > 400
      ? `${t.slice(0, t.length - over - 120).replace(/\n[^\n]*$/, '')}\n… cut to fit the response (${t.split('\n').length} lines in all).`
      : `${t.split('\n')[0]} (left out to fit the response)`));
  }
  return blocks;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

const WEIGHT_NAMES = {
  100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium',
  600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black',
};

/** The usual file name of a font: Family-Style.ttf ("600 italic" -> Rubik-SemiBoldItalic.ttf). */
function fontFileName(family, weight) {
  const [w, italic] = String(weight).split(' ');
  const style = `${WEIGHT_NAMES[w] || w}${italic ? 'Italic' : ''}`.replace(/^RegularItalic$/, 'Italic');
  return `${family.replace(/\s+/g, '')}-${style}.ttf`;
}

/** The response blocks every generator shares: screen note, system UI, Code Connect, rasterized layers, approximations. */
function sharedDetails(result, tree) {
  const out = [];
  if (result.screen) {
    out.push(text(`${result.className || result.structName} is drawn as a phone screen: it fills the screen` +
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

/** The Flutter response blocks after the code: assets, fonts, then the shared notes. */
function flutterDetails(result, tree) {
  const out = [];
  const entries = Object.entries(result.assets);
  if (entries.length) {
    const dirs = [...new Set(entries.map(([asset]) => path.posix.dirname(asset)))];
    const copy = [`mkdir -p ${dirs.map(shellQuote).join(' ')}`,
      ...entries.map(([asset, file]) => `cp ${shellQuote(file)} ${shellQuote(asset)}`)].join('\n');
    const clashes = entries.filter(([asset, file]) => differs(path.resolve(asset), file)).map(([asset]) => asset);
    out.push(text('Assets used in the code: each line copies a file on disk to the asset path the code uses. Run it in the ' +
      `project root and declare the folders under flutter: assets: in pubspec.yaml:\n\n${copy}` +
      (clashes.length ? `\n\nThe project already has other files at ${clashes.join(', ')}: rename these assets in the code ` +
        'and the commands instead of overwriting them.' : '')));
  }
  const fonts = Object.entries(result.fonts);
  if (fonts.length) {
    out.push(text(`Fonts used (declare each family and weight under flutter: fonts: in pubspec.yaml):\n${
      fonts.map(([family, weights]) => `- ${family}: ${weights.join(', ')}`).join('\n')}`));
  }
  return [...out, ...sharedDetails(result, tree)];
}

/** Whether [file] exists with other bytes than [source]. */
function differs(file, source) {
  try {
    return fs.statSync(file).isFile() && !fs.readFileSync(file).equals(fs.readFileSync(source));
  } catch {
    return false;
  }
}

/** Whether the image set [name] of [catalog] (under the project) holds another image than [source]. */
export function catalogTaken(catalog, name, source) {
  const set = path.resolve(catalog, `${name}.imageset`);
  let files;
  try {
    files = fs.readdirSync(set).filter((f) => f !== 'Contents.json');
  } catch {
    return false;
  }
  return files.length > 0 && files.every((f) => differs(path.join(set, f), source));
}

/** A shell script adding the [entries] ([name, { source, ext, vector }]) to [catalog] as image sets, each path once. */
function imageSetScript(catalog, entries) {
  const lines = [
    'add() { # name, file, ext, vector',
    '  s="$C/$1.imageset"; mkdir -p "$s" && cp "$2" "$s/$1.$3" &&',
    '  printf \'{"images":[{"filename":"%s","idiom":"universal"}],"info":{"author":"xcode","version":1}%s}\' "$1.$3" \\',
    '    "$([ "$4" = 1 ] && echo \',"properties":{"preserves-vector-representation":true}\')" > "$s/Contents.json"',
    '}',
    `C=${shellQuote(catalog)}`,
    ...entries.map(([name, info]) => `add ${shellQuote(name)} ${shellQuote(info.source)} ${info.ext} ${info.vector ? 1 : 0}`),
  ];
  return lines.join('\n');
}

/** The SwiftUI response blocks after the code: asset catalog, fonts, structure, then the shared notes. */
function swiftuiDetails(result, tree, catalog, pkg = false) {
  const out = [];
  const entries = Object.entries(result.assets);
  if (entries.length) {
    out.push(text(`Assets used in the code, by asset catalog name (Image("name")). This script adds each as an image set of ${catalog} ` +
      '(SVGs keep their vector data; one-colour icons are tinted in code); names the catalog already gives other images were ' +
      `avoided:\n\n${imageSetScript(catalog, entries)}` +
      (pkg ? '\n\nIn a Swift package, put the catalog under the target\'s resources and load images with Image("name", bundle: .module).' : '')));
  }
  const fonts = Object.entries(result.fonts);
  if (fonts.length) {
    const files = fonts.flatMap(([family, weights]) => weights.map((w) => `<string>${fontFileName(family, w)}</string>`));
    out.push(text('Fonts used. The code names each face by its PostScript name (Family-Style, e.g. Inter-SemiBold): add the ' +
      'files of these faces to the target' + (pkg
        ? ' and register them at launch with CTFontManagerRegisterFontsForURL (a package has no Info.plist)'
        : ` and list them under UIAppFonts in Info.plist, e.g. <key>UIAppFonts</key><array>${files.join('')}</array>`) +
      `; check each face's PostScript name in Font Book if a face does not load:\n${
      fonts.map(([family, weights]) => `- ${family}: ${weights.join(', ')}`).join('\n')}`));
  }
  if (result.shared) {
    const file = designSystemFile();
    const merged = file ? mergeDesignSystem(fs.readFileSync(file, 'utf8'), result.shared) : null;
    if (!merged) {
      out.push(text('Shared design system (DesignSystem.swift) the screen needs: Color(hex:), the button style, DesignTokens, ' +
        'AppFonts and the line height modifier. Add it to the target once. The next block is the file.'));
      out.push(text(result.shared));
    } else if (!merged.added.length) {
      out.push(text(`The project's ${file} already declares everything this screen uses from the design system.` +
        (merged.conflicts.length ? ` It differs from the design in: ${merged.conflicts.join('; ')}.` : '')));
    } else {
      const conflicts = merged.conflicts.length ? ` Kept as the project has them (they differ from the design): ${merged.conflicts.join('; ')}.` : '';
      // A large file is not repeated in every response: the additions are.
      if (merged.text.length <= DESIGN_SYSTEM_CHARS) {
        out.push(text(`The project's ${file} lacks ${merged.added.join(', ')}. The next block is that file with them added; ` +
          `the rest of it is unchanged, so write it over the file.${conflicts}`));
        out.push(text(merged.text));
      } else {
        out.push(text(`The project's ${file} lacks ${merged.added.join(', ')}. Add the next block to it: members go into the ` +
          `enum each comment names, other declarations at the end of the file.${conflicts}`));
        out.push(text(merged.patch));
      }
    }
  }
  out.push(text('The code needs iOS 17 or later (scrollTargetBehavior, contentMargins, containerRelativeFrame, sensoryFeedback, ' +
    'onGeometryChange): set the deployment target to 17.0 or higher.'));
  if (result.structure.length) {
    out.push(text(`Structure (what each part is, how sure the detection is and why, and the SwiftUI pattern the code uses for it; ` +
      `a layer name tag such as "[button]" or "[no-role]" sets or clears a role):\n${result.structure.map((r) => {
      const facts = [r.role, r.items ? `${r.items} items` : null, r.selected ? `"${r.selected}" selected` : null,
        r.label ? `"${r.label}"` : null, r.link ? `link "${r.link}"` : null].filter(Boolean).join(', ');
      const sure = r.confidence ? ` [${r.confidence}: ${r.evidence}]` : '';
      const native = r.native ? `; ${r.native.use ? 'uses' : 'not'} ${r.native.control}: ${r.native.reason}` : '';
      const tap = r.prototype ? `; prototype: ${{
        navigate: () => `navigates to "${r.prototype.destination.name}" (push it in a NavigationStack)`,
        overlay: () => `opens "${r.prototype.destination.name}" over the screen (a .sheet)`,
        back: () => 'goes back (dismiss)',
        close: () => 'closes the overlay (dismiss)',
        url: () => `opens ${r.prototype.url} (openURL)`,
      }[r.prototype.kind]()}` : '';
      return `- ${r.id} "${r.name}": ${facts}${sure} -> ${r.pattern}${native}${tap}`;
    }).join('\n')}`));
  }
  return [...out, ...sharedDetails(result, tree)];
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
    title: 'Get Design Context',
    annotations: { readOnlyHint: true, openWorldHint: false },
    description:
      'Get design context for a Figma node — the primary tool for design-to-code ' +
      'workflows. Returns reference code (Flutter widgets for Flutter projects, ' +
      'SwiftUI views for Swift packages and Xcode projects, React + Tailwind ' +
      'otherwise), the assets it uses, a screenshot and the variables in the ' +
      'node. SwiftUI code comes with a Structure block naming what each part ' +
      'is (tab bar, segmented control, chips, carousel, grid, buttons, fields) ' +
      'and the pattern used for it. The code must be adapted to the target project. ' +
      'Use the nodeId parameter to specify a node id; from a URL like ' +
      'https://figma.com/design/:fileKey/:fileName?node-id=1-2 the node id is 1:2. ' +
      'With no nodeId the current selection in Figma is used. Large nodes return ' +
      'metadata instead of code unless forceCode is set.',
    inputSchema: {
      nodeId: nodeIdSchema.optional(),
      fileKey: fileKeySchema,
      framework: z.enum(FRAMEWORKS).optional().describe(
        'Code to generate: flutter, swiftui or react. Default: from clientFrameworks / clientLanguages, ' +
        'else FIGMA_LOCAL_MCP_FRAMEWORK, else flutter when the project has a pubspec.yaml, swiftui when it has a ' +
        'Package.swift, .xcodeproj or .xcworkspace, else react.'),
      clientLanguages: z.string().optional().describe('Comma separated languages of the client, e.g. "dart" or "swift" (picks the framework).'),
      clientFrameworks: z.string().optional().describe('Comma separated frameworks of the client, e.g. "flutter" or "swiftui" (picks the framework).'),
      screen: z.boolean().optional().describe(
        'Flutter and SwiftUI: draw the node as a phone screen that fills the screen and scrolls when tall (default: portrait frames 300-480 wide).'),
      assetsDir: z.string().optional().describe(
        'Flutter: folder of the asset paths in the code (default: the svg/png/images folders of the project\'s pubspec.yaml, else assets/figma). ' +
        'SwiftUI: the asset catalog to add image sets to (default: the project\'s *.xcassets, else Assets.xcassets).'),
      screenUtil: z.boolean().optional().describe(
        'Flutter: write lengths with flutter_screenutil (.w, .h, .r, .sp) so the layout scales from the design size ' +
        '(default: when the project\'s pubspec.yaml depends on flutter_screenutil).'),
      exactLineHeights: z.boolean().optional().describe(
        'SwiftUI: set Figma\'s default line heights too, which Figma rounds to whole points, so text matches the design to ' +
        'the pixel (default: true). false leaves default-height text at the face\'s own line height (within half a point per ' +
        'line) and the code shorter.'),
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
      const meta = boundedMetadataXml(outline, METADATA_CHARS);
      return [
        text(`The node has ${node.truncated ? 'more than ' : ''}${node.truncated ? countNodes(outline) : count} layers, ` +
          'too many for code in one response. Here is its metadata instead; call ' +
          'get_design_context on the child node ids you need, or pass forceCode: true.' +
          (meta.depth !== Infinity ? ` The outline goes ${meta.depth} levels deep; call get_metadata on a child for more.` : '')),
        text(meta.xml),
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
      } else if (framework === 'swiftui') {
        const catalog = assetsDir ? assetsDir.replace(/\/+$/, '') : assetCatalog();
        const files = { ...fileResolver(node.images), taken: (name, file) => catalogTaken(catalog, name, file) };
        const result = toSwiftUI(node.tree, files, {
          connect, screen, variableModes: node.variableModes, exactLineHeights: args.exactLineHeights ?? true, fontFaces: projectFontFaces(),
        });
        out = [text(result.code), ...swiftuiDetails(result, node.tree, catalog, isSwiftPackage())];
      } else {
        const result = toReactTailwind(node.tree, resolver(bridge, node.images), { connect });
        out = [text(result.code)];
        if (Object.keys(result.assets).length) {
          out.push(text('Assets used in the code, served by the local MCP server; each file is also on disk in ' +
            `${ASSETS} under the last part of its URL:\n${JSON.stringify(result.assets, null, 2)}`));
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
        text(boundedMetadataXml(node.tree, METADATA_CHARS).xml),
      ];
    }
    if (out[0].text.length > CODE_CHARS && !forceCode) {
      // Code this long would be cut off by the client: the parts are asked for one by one.
      const meta = boundedMetadataXml(node.tree, METADATA_CHARS);
      return [
        text(`The code for this node is ${out[0].text.length} characters, more than one response holds. Call ` +
          'get_design_context on the sections you need (their ids are below), or pass forceCode: true for all of it.'),
        text(meta.xml),
        sourceNote(node),
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
    out.push(text({ flutter: FLUTTER_GUIDANCE, swiftui: SWIFTUI_GUIDANCE }[framework] || GUIDANCE));
    out = withinBudget(out, RESPONSE_CHARS);
    // A node too large to render still gets its code.
    const shot = shotRead && await shotRead;
    if (shot) out.push(image(shot.png));
    out.push(sourceNote(node));
    return out;
  }));

  server.registerTool('get_metadata', {
    title: 'Get Metadata',
    annotations: { readOnlyHint: true, openWorldHint: false },
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
    const meta = boundedMetadataXml(outline.tree, METADATA_CHARS);
    return [
      selectionBlock(info), text(meta.xml),
      meta.depth !== Infinity && text(`The outline is cut ${meta.depth} levels deep to fit one response: call get_metadata on a child for its layers.`),
      sourceNote(outline),
    ];
  }));

  server.registerTool('get_screenshot', {
    title: 'Get Screenshot',
    annotations: { readOnlyHint: true, openWorldHint: false },
    description:
      'Generate a screenshot for a given node or the currently selected node ' +
      'in Figma. maxDimension (default 1024) caps the longer edge of the PNG ' +
      '(up to 2x the node size). The response gives a local URL and file path ' +
      'plus width/height and original_width/original_height. Set ' +
      'enableBase64Response to also get the image inline.',
    inputSchema: {
      nodeId: nodeIdSchema.optional(),
      fileKey: fileKeySchema,
      maxDimension: z.number().int().positive().max(SCREENSHOT_MAX).optional()
        .describe(`Longest edge of the PNG in pixels (default 1024, at most ${SCREENSHOT_MAX}).`),
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
    title: 'Get Variable Definitions',
    annotations: { readOnlyHint: true, openWorldHint: false },
    description:
      "Get variable definitions for a given node id. E.g. {'icon/default/secondary': #949494}. " +
      'Variables and styles are reusable values applied to colours, fonts, ' +
      'sizes and spacings. Values resolve for the node\'s own mode. Read-only; ' +
      'with no nodeId it uses the selection. Use it for design tokens, and ' +
      'get_design_context for the layout. Without the plugin, a saved snapshot ' +
      'gives the raw values only, without names.',
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
    title: 'Download Assets',
    annotations: { readOnlyHint: true, openWorldHint: false },
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

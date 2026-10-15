// Render checks: draw Flutter code with `flutter test`, or React + Tailwind in
// headless Chrome, and compare it with Figma's own render of the node.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { detectFramework, tailwindVersion } from '../project.js';
import { DATA_DIR } from '../store.js';
import { fileKeySchema, guard, image, nodeIdSchema, text } from './common.js';

const CHECK = fileURLToPath(new URL('../../tools/flutter-check.js', import.meta.url));
// What flutter-check writes into a project for a run, and removes after.
const PROJECT_FILES = ['test/figmcp_check_test.dart', '.dart_tool/figmcp_check.json'];
const TIMEOUT = 600000;

/** The flutter tool: [explicit], FLUTTER, PATH, or a usual install folder. */
export function flutterTool(explicit) {
  const candidates = [explicit, process.env.FLUTTER];
  const found = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['flutter'], { encoding: 'utf8' });
  if (found.status === 0) candidates.push(found.stdout.split(/\r?\n/)[0].trim());
  const home = os.homedir();
  candidates.push(...['flutter', 'development/flutter', 'sdk/flutter', 'fvm/default', 'Documents/sdk/current']
    .map((d) => path.join(home, d, 'bin', process.platform === 'win32' ? 'flutter.bat' : 'flutter')));
  return candidates.find((c) => c && fs.existsSync(c)) || null;
}

/** The folder holding [marker] (pubspec.yaml, package.json) above [file], or null. */
function projectOf(file, marker = 'pubspec.yaml') {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, marker))) return dir;
    if (path.dirname(dir) === dir) return null;
  }
}

const IMAGE_FILE = /\.(svg|png|jpe?g|webp|gif|avif)$/i;

/**
 * Files a component's images load from: URLs into the project's public
 * folder ('/figma/logo.svg') and images it imports ('./logo.svg').
 */
function componentAssets(code, file, project) {
  const out = {};
  for (const m of code.matchAll(/["'`](\/[^"'`\s]+)["'`]/g)) {
    if (!IMAGE_FILE.test(m[1])) continue;
    for (const dir of ['public', 'static']) {
      const hit = path.join(project, dir, m[1]);
      if (fs.existsSync(hit)) out[m[1]] = hit;
    }
  }
  for (const m of code.matchAll(/^import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/gm)) {
    if (!IMAGE_FILE.test(m[2])) continue;
    const hit = m[2].startsWith('.') ? path.resolve(path.dirname(file), m[2]) : path.join(project, m[2].replace(/^@\//, 'src/'));
    if (fs.existsSync(hit)) out[m[1]] = hit;
  }
  return out;
}

/** A stylesheet for the browser build: Tailwind's own imports and directives dropped. */
function pageCss(file) {
  return fs.readFileSync(file, 'utf8')
    .replace(/^\s*@import\s+["']tailwindcss[^"']*["'][^;]*;\s*$/gm, '')
    .replace(/^\s*@tailwind\s+\w+;\s*$/gm, '')
    .replace(/^\s*@(plugin|source|config)\s[^;]*;\s*$/gm, '');
}

let reactCheck = null;
async function runReactCheck(opts) {
  if (!reactCheck) ({ reactCheck } = await import('../../tools/visual-check.js'));
  return reactCheck(opts);
}

function runCheck(args, project = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHECK, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => child.kill(), TIMEOUT);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (project) for (const f of PROJECT_FILES) fs.rmSync(path.join(project, f), { force: true });
      if (code === 0) {
        try {
          resolve(JSON.parse(out));
          return;
        } catch { /* reported below */ }
      }
      reject(new Error((err || out || `the check exited with ${code}`).replace(/\n\s+at .*$/gm, '').trim().slice(-6000)));
    });
  });
}

// Runs share the scratch Flutter project, so they go one at a time.
let queue = Promise.resolve();
function oneAtATime(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

const brief = (list, n = 15) => (list.length > n ? [...list.slice(0, n), `… ${list.length - n} more`] : list);

export function registerVerifyTools(server, bridge, source) {
  server.registerTool('verify_code', {
    title: 'Verify Code',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      'Check Flutter or React + Tailwind code against the design: renders it ' +
      'at 2x (Flutter with `flutter test`, React in headless Chrome with ' +
      'Tailwind) and compares the render with Figma\'s own 2x render of the ' +
      'node. Returns analyzer or runtime errors (overflows, missing assets, ' +
      'broken images), the share of differing pixels and a diff image (the ' +
      'design in grey, differing pixels in red).\n\n' +
      'React: without `file` it checks the code get_design_context generates ' +
      'and compares every layer\'s box too. With `file` (a .jsx or .tsx under ' +
      'a folder with package.json) it renders that file\'s default export: it ' +
      'must be self-contained apart from React and image imports; images load ' +
      'from the project\'s public folder. Pass `css` for the stylesheet with ' +
      'its tokens. React and Tailwind load from a CDN and the fonts from the ' +
      'system or Google Fonts. Needs Chrome and the puppeteer-core package.\n\n' +
      'Flutter: ' +
      'With `file`, it checks that widget inside its own Flutter project: the ' +
      'project\'s packages and assets, inside a MaterialApp, scaled by ' +
      'flutter_screenutil to the frame size when the project uses it. The ' +
      'widget needs a constructor without arguments. Without `file`, it checks ' +
      'the reference code get_design_context generates and also compares every ' +
      'layer\'s box. Use it after implementing a frame, and fix what it reports. ' +
      'Text in fonts it cannot find is drawn in a fallback font, and emoji ' +
      'have no colour font in the test, so text after them shifts. A run takes ' +
      'from 20 seconds to a few minutes.',
    inputSchema: {
      nodeId: nodeIdSchema.optional(),
      fileKey: fileKeySchema,
      framework: z.enum(['flutter', 'react']).optional().describe(
        'flutter or react (default: from the file, else as get_design_context picks: the client, then the project).'),
      clientLanguages: z.string().optional().describe('Comma separated languages of the client, e.g. "dart" (picks the framework).'),
      clientFrameworks: z.string().optional().describe('Comma separated frameworks of the client, e.g. "flutter" (picks the framework).'),
      file: z.string().optional().describe(
        'Flutter: the .dart file with the widget, under the project\'s lib/. React: the .jsx/.tsx component file. ' +
        'Absolute, or relative to the project.'),
      widget: z.string().optional().describe('Flutter: the widget class in `file` (default: its first widget class).'),
      css: z.string().optional().describe('React: a CSS file to load with the component, e.g. its global stylesheet with the design tokens.'),
      tailwind: z.union([z.literal(3), z.literal(4)]).optional().describe(
        'React: the Tailwind major version (default: the project\'s, else 4).'),
      viewport: z.string().regex(/^\d+(\.\d+)?x\d+(\.\d+)?$/).optional().describe(
        'Lay the code out on a screen of this size, e.g. "360x780", and report runtime errors ' +
        '(overflows) and layers pushed off screen instead of comparing.'),
      fonts: z.array(z.string()).optional().describe('Folders with font files (default: the project\'s assets/fonts and the system fonts).'),
      flutter: z.string().optional().describe('Path of the flutter tool, when it is not on PATH.'),
    },
  }, guard(async (input) => {
    // Flutter-only inputs pick Flutter; then the file's language, then the client and the project.
    const framework = input.framework || (input.flutter || input.widget ? 'flutter'
      : input.file ? (/\.(jsx|tsx|js|ts)$/i.test(input.file) ? 'react' : 'flutter')
        : detectFramework(input));
    if (framework === 'react') return verifyReact(source, input);
    const { nodeId, file, widget, viewport, fonts = [], flutter } = input;
    const tool = flutterTool(flutter);
    if (!tool) throw new Error('The flutter tool was not found: pass `flutter` with its path, or set FLUTTER.');
    if (viewport && viewport.split('x').some((v) => Number(v) < 1 || Number(v) > 10000)) {
      throw new Error('Each side of `viewport` must be between 1 and 10000.');
    }
    const { id } = await source.resolveId(nodeId);
    const exported = await source.exportData(id);
    if (!exported.data.frames[0].previewPng2x) throw new Error(`There is no render of ${id} to compare with.`);
    const slug = id.replace(/[^0-9A-Za-z]+/g, '_');
    const dir = path.join(DATA_DIR, 'verify');
    fs.mkdirSync(dir, { recursive: true });
    const exportFile = path.join(dir, `${slug}_${process.pid}_${Date.now()}.json`);
    fs.writeFileSync(exportFile, JSON.stringify(exported.data));
    const args = [id, '--export', exportFile, '--flutter', tool, '--fetch-fonts',
      '--out', path.join(dir, `${slug}${file ? '_project' : ''}${viewport ? `_${viewport}` : ''}`)];
    for (const f of fonts) args.push('--fonts', f);
    if (viewport) args.push('--viewport', viewport);
    if (file) {
      const absolute = path.resolve(file);
      const project = fs.existsSync(absolute) ? projectOf(absolute) : projectOf(path.join(process.cwd(), 'lib', 'x'));
      if (!project) throw new Error(`No pubspec.yaml above ${file}.`);
      const inProject = fs.existsSync(absolute) ? absolute : path.resolve(project, file);
      if (!fs.existsSync(inProject)) throw new Error(`${file} does not exist.`);
      args.push('--project', project, '--file', path.relative(project, inProject));
      if (widget) args.push('--class', widget);
    }
    let report;
    try {
      report = await oneAtATime(() => runCheck(args, args.includes('--project') ? args[args.indexOf('--project') + 1] : null));
    } finally {
      fs.rmSync(exportFile, { force: true });
    }
    const summary = {
      node: report.node,
      ...(exported.source === 'snapshot' ? { source: `snapshot saved ${exported.exportedAt || 'earlier'}` } : {}),
      analyzer: { errors: report.analyzer.errors, warnings: report.analyzer.warnings },
      runtimeErrors: report.runtimeErrors,
      renderedSize: report.renderedSize,
    };
    if (report.viewport) {
      Object.assign(summary, { viewport: report.viewport, offscreenLayers: brief(report.offscreenLayers), files: report.files });
      return [
        text(summary),
        text(`Rendered at ${report.viewport.width}x${report.viewport.height}:`),
        image(fs.readFileSync(report.files.rendered)),
      ];
    }
    Object.assign(summary, {
      pixels: report.pixels,
      ...(report.checkedBoxes ? {
        checkedLayers: report.checkedBoxes,
        layoutMismatches: brief(report.geometryMismatches),
        textRoundingMismatches: report.textRoundingMismatches.length,
        missingLayers: brief(report.missingElements),
      } : {}),
      fontsNotFound: report.fontsNotBundled,
      ...(report.generatorWarnings && report.generatorWarnings.length ? { generatorWarnings: brief(report.generatorWarnings) } : {}),
      files: report.files,
    });
    return [
      text(summary),
      text('Diff (the design in grey, differing pixels in red):'),
      image(fs.readFileSync(report.files.diff)),
    ];
  }));
}

async function verifyReact(source, { nodeId, file, viewport, fonts = [], css, tailwind }) {
  const size = viewport ? viewport.split('x').map(Number) : null;
  if (size && size.some((v) => v < 1 || v > 10000)) throw new Error('Each side of `viewport` must be between 1 and 10000.');
  const { id } = await source.resolveId(nodeId);
  const exported = await source.exportData(id);
  const frame = exported.data.frames[0];
  if (!frame.previewPng2x && !size) throw new Error(`There is no render of ${id} to compare with.`);
  const design = {
    tree: frame.tree, images: exported.data.images || {},
    render: frame.previewPng2x ? Buffer.from(frame.previewPng2x, 'base64') : null,
  };
  let code = null;
  let assets = null;
  let project = null;
  if (file) {
    const absolute = path.resolve(file);
    project = projectOf(fs.existsSync(absolute) ? absolute : path.join(process.cwd(), 'x'), 'package.json');
    const inProject = fs.existsSync(absolute) ? absolute : project && path.resolve(project, file);
    if (!inProject || !fs.existsSync(inProject)) throw new Error(`${file} does not exist.`);
    project = projectOf(inProject, 'package.json') || path.dirname(inProject);
    code = fs.readFileSync(inProject, 'utf8');
    assets = componentAssets(code, inProject, project);
  }
  const slug = id.replace(/[^0-9A-Za-z]+/g, '_');
  const out = path.join(DATA_DIR, 'verify', `${slug}_react${file ? '_project' : ''}${viewport ? `_${viewport}` : ''}`);
  const report = await oneAtATime(() => runReactCheck({
    design, out, code, assets, viewport: size,
    css: css ? pageCss(path.resolve(project || process.cwd(), css)) : '',
    fonts: [...fonts, ...(project ? [path.join(project, 'public'), path.join(project, 'src', 'fonts'), path.join(project, 'assets', 'fonts')] : [])],
    fetchFonts: true,
    tailwind: tailwind || tailwindVersion(project || process.cwd()) || 4,
  }));
  const summary = {
    node: report.node,
    ...(exported.source === 'snapshot' ? { source: `snapshot saved ${exported.exportedAt || 'earlier'}` } : {}),
    tailwind: report.tailwind,
    runtimeErrors: report.runtimeErrors,
    brokenImages: report.brokenImages,
    renderedSize: report.renderedSize,
  };
  if (report.viewport) {
    Object.assign(summary, {
      viewport: report.viewport, pageSize: report.pageSize, horizontalOverflow: report.horizontalOverflow,
      offscreenLayers: brief(report.offscreenLayers), files: report.files,
    });
    return [
      text(summary),
      text(`Rendered at ${report.viewport.width}x${report.viewport.height}:`),
      image(fs.readFileSync(report.files.rendered)),
    ];
  }
  Object.assign(summary, {
    pixels: report.pixels,
    ...(report.checkedBoxes ? {
      checkedLayers: report.checkedBoxes,
      layoutMismatches: brief(report.geometryMismatches),
      textRoundingMismatches: report.textRoundingMismatches.length,
      missingLayers: brief(report.missingElements),
    } : {}),
    fontsNotFound: report.fontsNotBundled,
    ...(report.generatorWarnings && report.generatorWarnings.length ? { generatorWarnings: brief(report.generatorWarnings) } : {}),
    files: report.files,
  });
  return [
    text(summary),
    text('Diff (the design in grey, differing pixels in red):'),
    image(fs.readFileSync(report.files.diff)),
  ];
}

// Render checks: draw Flutter code with `flutter test`, SwiftUI code in the
// iOS simulator, or React + Tailwind in headless Chrome, and compare it with
// Figma's own render of the node.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { coverage, HANDOFF } from '../coverage.js';
import { fitPng } from '../png.js';
import { detectFramework, tailwindVersion } from '../project.js';
import { DATA_DIR } from '../store.js';
import { fileKeySchema, guard, image, nodeIdSchema, text } from './common.js';

const CHECK = fileURLToPath(new URL('../../tools/flutter-check.js', import.meta.url));
const SWIFTUI_CHECK = fileURLToPath(new URL('../../tools/swiftui-check.js', import.meta.url));
const NO_XCODE = 3;
// What flutter-check writes into a project for a run, and removes after.
const PROJECT_FILES = ['test/figmcp_check_test.dart', '.dart_tool/figmcp_check.json'];
const TIMEOUT = 600000;
// The longest edge of a diff image in a response.
const DIFF_MAX = 1600;

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

/** The folder above [file] that [isRoot] accepts, or null. */
function projectOf(file, isRoot) {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    if (isRoot(dir)) return dir;
    if (path.dirname(dir) === dir) return null;
  }
}

const hasPubspec = (dir) => fs.existsSync(path.join(dir, 'pubspec.yaml'));
const isSwiftRoot = (dir) => fs.existsSync(path.join(dir, 'Package.swift')) ||
  fs.readdirSync(dir).some((f) => /\.(xcodeproj|xcworkspace)$/.test(f));
const hasPackageJson = (dir) => fs.existsSync(path.join(dir, 'package.json'));

/** Whether Xcode's iOS simulator SDK is installed. */
function hasXcode() {
  return spawnSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' }).status === 0;
}

const IMAGE_FILE = /\.(svg|png|jpe?g|webp|gif|avif)$/i;

/**
 * Files a component's images load from: URLs into the project's public
 * folder ('/figma/logo.svg') and images it imports ('./logo.svg').
 */
function componentAssets(code, file, project) {
  const out = {};
  for (const m of code.matchAll(/["'`]([^"'`\s:]+)["'`]/g)) {
    if (!IMAGE_FILE.test(m[1])) continue;
    // A root path is served from the public folder; a relative one sits by the file.
    const hits = m[1].startsWith('/') ? ['public', 'static'].map((dir) => path.join(project, dir, m[1]))
      : [path.resolve(path.dirname(file), m[1])];
    const hit = hits.find((h) => fs.existsSync(h));
    if (hit) out[m[1]] = hit;
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

function runCheck(args, project = null, script = CHECK) {
  return new Promise((resolve, reject) => {
    // Its own process group, so a timeout also stops the tools it runs.
    const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let out = '';
    let err = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, TIMEOUT);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`The check did not finish within ${TIMEOUT / 60000} minutes and was stopped.`));
        return;
      }
      if (project && script === CHECK) for (const f of PROJECT_FILES) fs.rmSync(path.join(project, f), { force: true });
      if (code === 0) {
        try {
          resolve(JSON.parse(out));
          return;
        } catch { /* reported below */ }
      }
      if (code === NO_XCODE && script === SWIFTUI_CHECK) {
        reject(new Error('Xcode with the iOS simulator SDK is needed to check SwiftUI code, and was not found.'));
        return;
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

/** The folder above [file] (or [start]) with a Swift package or an Xcode project, or null. */
function swiftProjectOf(file) {
  return projectOf(file, isSwiftRoot);
}

/**
 * [file] as an absolute path: as given when it exists, else relative to the
 * project the server runs in.
 */
function resolveFile(file, isRoot) {
  const absolute = path.resolve(file);
  if (path.isAbsolute(file) || fs.existsSync(absolute)) return absolute;
  const project = projectOf(path.join(process.cwd(), 'x'), isRoot);
  return project ? path.resolve(project, file) : absolute;
}

/** Writes [exported] for the check script and runs [task] with its path, removing it after. */
async function withExport(id, exported, task) {
  const dir = path.join(DATA_DIR, 'verify');
  fs.mkdirSync(dir, { recursive: true });
  const exportFile = path.join(dir, `${id.replace(/[^0-9A-Za-z]+/g, '_')}_${process.pid}_${Date.now()}.json`);
  fs.writeFileSync(exportFile, JSON.stringify(exported.data));
  try {
    return await task(exportFile, dir);
  } finally {
    fs.rmSync(exportFile, { force: true });
  }
}

const FAILED_AT = {
  compile: 'The code did not compile, so nothing was rendered.',
  assets: 'The asset catalog did not compile (actool), so nothing was rendered.',
  sign: 'The check app could not be signed, so nothing was rendered.',
};

/**
 * The framework to check: from the file's extension, then a flutter path,
 * then as get_design_context picks (the client, then the project).
 */
function frameworkOf(input) {
  const { file, flutter } = input;
  if (file && /\.swift$/i.test(file)) return 'swiftui';
  if (file && /\.dart$/i.test(file)) return 'flutter';
  if (file && /\.(jsx|tsx|js|ts)$/i.test(file)) return 'react';
  if (file && /\.html?$/i.test(file)) return 'html';
  if (flutter) return 'flutter';
  return detectFramework(input);
}

/** Folders under [root] holding font files, a few levels deep. */
function projectFontDirs(root) {
  const out = new Set();
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isFile() && /\.(ttf|otf)$/i.test(e.name)) out.add(dir);
      else if (e.isDirectory() && depth < 5 && !e.name.startsWith('.') && !SKIPPED.has(e.name)) walk(path.join(dir, e.name), depth + 1);
    }
  };
  walk(root, 1);
  return [...out];
}

const SKIPPED = new Set(['node_modules', 'Pods', 'DerivedData', 'build', '.build', 'Carthage']);

/** The SwiftUI check: compiles, renders in the simulator and compares pixels. */
async function verifySwiftUI({ id, exported, file, view, fonts, device, interact, dynamicType }) {
  if (!hasXcode()) throw new Error('Xcode with the iOS simulator SDK is needed to check SwiftUI code, and was not found.');
  const args = [];
  if (file) {
    const absolute = resolveFile(file, isSwiftRoot);
    if (!fs.existsSync(absolute)) throw new Error(`${file} does not exist.`);
    if (!/\.swift$/.test(absolute)) throw new Error(`${file} is not a .swift file.`);
    const project = swiftProjectOf(absolute) || path.dirname(absolute);
    args.push('--project', project, '--file', path.relative(project, absolute));
    if (view) args.push('--view', view);
  }
  // The project's own font files first: they are the versions the app ships
  // (a newer download can be spaced differently).
  for (const f of [...fonts, ...projectFontDirs(process.cwd())]) args.push('--fonts', f);
  if (device) args.push('--device', device);
  if (interact && !file) args.push('--interact');
  if (dynamicType) args.push('--dynamic-type', dynamicType);
  const slug = id.replace(/[^0-9A-Za-z]+/g, '_');
  const report = await withExport(id, exported, (exportFile, dir) => oneAtATime(() => runCheck([
    id, '--export', exportFile, '--fetch-fonts', '--out', path.join(dir, `${slug}_swiftui${file ? '_project' : ''}`), ...args,
  ], null, SWIFTUI_CHECK)));
  const summary = {
    node: report.node,
    view: report.view,
    ...(exported.source === 'snapshot' ? { source: `snapshot saved ${exported.exportedAt || 'earlier'}` } : {}),
    compiler: { errors: brief(report.compiler.errors, 30), warnings: brief(report.compiler.warnings, 15) },
    fontsNotFound: report.fontsNotBundled,
    ...(report.generatorWarnings.length ? { generatorWarnings: brief(report.generatorWarnings) } : {}),
    files: report.files,
  };
  const tree = exported.data.frames[0].tree;
  if (report.failedAt === 'render') {
    return [text({ ...summary, device: report.device }), text(`The code compiled, but rendering failed: ${report.renderError}`)];
  }
  if (!report.pixels) return [text(summary), text(FAILED_AT[report.failedAt] || FAILED_AT.compile)];
  Object.assign(summary, {
    device: report.device, renderedSize: report.renderedSize, pixels: report.pixels,
    ...(report.checkedBoxes ? {
      checkedLayers: report.checkedBoxes,
      layoutMismatches: brief(report.layoutMismatches),
      textRoundingMismatches: report.textRoundingMismatches.length,
      ...(report.fontMismatches.length ? { fontMismatches: report.fontMismatches.length } : {}),
    } : {}),
    systemUiLeftOut: report.systemUiLeftOut,
    ...(report.dynamicType ? { dynamicType: report.dynamicType } : {}),
    ...(report.interactions ? { interactions: { ...report.interactions, each: brief(report.interactions.each.map((t) =>
      `${t.label || '(no label)'}: ${t.hung ? 'hung' : [t.redrew ? 'redrew' : null, t.action ? `asked the owner ${t.action}` : null].filter(Boolean).join(', ') || 'no visible effect'}`), 40) } } : {}),
    coverage: coverage(tree, {
      framework: 'swiftui', pixels: report.pixels, checkedLayers: report.checkedBoxes, dynamicType: report.dynamicType,
      interactions: report.interactions, project: Boolean(file),
    }),
  });
  return [
    text(summary),
    text('Diff (the design in grey, differing pixels in red, system UI left out in blue):'),
    image(fitPng(fs.readFileSync(report.files.diff), DIFF_MAX)),
    text(HANDOFF),
  ];
}

export function registerVerifyTools(server, bridge, source) {
  server.registerTool('verify_code', {
    title: 'Verify Code',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      'Check Flutter, SwiftUI or React + Tailwind code against the design and compare the render ' +
      'with Figma\'s own 2x render of the node: Flutter code is analyzed and ' +
      'rendered with `flutter test`; SwiftUI code is compiled and rendered in ' +
      'the booted iOS simulator (Xcode needed); React and HTML render in headless Chrome with Tailwind. ' +
      'Returns compiler or analyzer ' +
      'errors, runtime errors (Flutter: overflows, missing assets; React: broken images), the share ' +
      'of differing pixels and a diff image (the design in grey, differing ' +
      'pixels in red). The framework comes from `framework`, else from the file\'s language, else from the ' +
      'client and the project like get_design_context.\n\n' +
      'React and HTML: without `file` it checks the code get_design_context generates ' +
      'and compares every layer\'s box too. With `file` (a .jsx or .tsx under ' +
      'a folder with package.json, or an .html page) it renders that file\'s default export or page: it ' +
      'must be self-contained apart from React and image imports; images load ' +
      'from the project\'s public folder. Pass `css` for the stylesheet with ' +
      'its tokens. React and Tailwind load from a CDN and the fonts from the ' +
      'system or Google Fonts. Needs Chrome and the puppeteer-core package.\n\n' +
      'Flutter and SwiftUI: with `file`, it checks that widget or view inside its own project: a ' +
      'Flutter widget with the project\'s packages and assets, inside a ' +
      'MaterialApp, scaled by flutter_screenutil to the frame size when the ' +
      'project uses it; a SwiftUI view compiled with the project\'s ' +
      'DesignSystem.swift and asset catalogs, so it must build without the ' +
      'rest of the project. The ' +
      'widget or view needs an init without arguments. Without `file`, it ' +
      'checks the reference code get_design_context generates and compares ' +
      'every layer\'s box with the design. Use it after implementing a ' +
      'frame, and fix what it reports. Text in fonts it cannot find is drawn ' +
      'in a fallback font, and emoji have no colour font in the Flutter test, ' +
      'so text after them shifts. The design\'s status bar and home indicator ' +
      'belong to the phone and are left out of the SwiftUI comparison. A run ' +
      'takes from 20 seconds to a few minutes.\n\n' +
      'Every result has a coverage block: what the run checked, and for each interactive element (from its role and ' +
      'the states its Figma component defines) the states, keyboard and screen-reader behaviour it did not check, ' +
      'plus screen-wide items (dark mode, other widths and text sizes, right-to-left). React and HTML runs also ' +
      'press Tab through the page: the Tab order, missing focus indicators, controls Enter or Space does not ' +
      'activate, missing accessible names and clickable elements the keyboard cannot reach. Hand the not-checked ' +
      'list back with the implementation.',
    inputSchema: {
      nodeId: nodeIdSchema.optional(),
      fileKey: fileKeySchema,
      framework: z.enum(['flutter', 'swiftui', 'react', 'html']).optional().describe(
        'What to check (default: from the file\'s extension, else as get_design_context picks: the client, then the project).'),
      clientLanguages: z.string().optional().describe('Comma separated languages of the client, e.g. "dart" or "swift" (picks the framework).'),
      clientFrameworks: z.string().optional().describe('Comma separated frameworks of the client, e.g. "flutter" or "swiftui" (picks the framework).'),
      file: z.string().optional().describe(
        'Flutter: the .dart file with the widget, under the project\'s lib/. SwiftUI: the .swift file with the view. ' +
        'React: the .jsx/.tsx component file. HTML: the .html page. Absolute, or relative to the project.'),
      widget: z.string().optional().describe('The widget class or SwiftUI view struct in `file` (default: its first one).'),
      css: z.string().optional().describe('React: a CSS file to load with the component, e.g. its global stylesheet with the design tokens.'),
      tailwind: z.union([z.literal(3), z.literal(4)]).optional().describe(
        'React: the Tailwind major version (default: the project\'s, else 4).'),
      viewport: z.string().regex(/^\d+(\.\d+)?x\d+(\.\d+)?$/).optional().describe(
        'Flutter: lay the code out on a screen of this size, e.g. "360x780", and report runtime errors ' +
        '(overflows) and layers pushed off screen instead of comparing.'),
      fonts: z.array(z.string()).optional().describe('Folders with font files (default: the project\'s assets/fonts and the system fonts).'),
      flutter: z.string().optional().describe('Flutter: path of the flutter tool, when it is not on PATH.'),
      interact: z.boolean().optional().describe(
        'SwiftUI, generated code: after rendering, tap every button of the screen and report what each did (redrew the ' +
        'screen, asked its owner through the Action enum, did nothing visible, or hung).'),
      dynamicType: z.enum(['xSmall', 'small', 'medium', 'large', 'xLarge', 'xxLarge', 'xxxLarge', 'accessibility1', 'accessibility2',
        'accessibility3', 'accessibility4', 'accessibility5']).optional().describe(
        'SwiftUI: render at this text size to check the layout under Dynamic Type (default large; the pixel comparison ' +
        'stays with the design at the default size).'),
      device: z.string().optional().describe('SwiftUI: the simulator to render in, by udid or name (default: a booted iPhone 17 Pro, another booted iPhone, ' +
        'else an iPhone Pro it boots). Renders are 2x and light mode on any device.'),
    },
  }, guard(async (input) => {
    const { nodeId, file, widget, viewport, fonts = [], flutter, device, interact, dynamicType } = input;
    const framework = input.framework || frameworkOf(input);
    if (framework === 'react' || framework === 'html') return verifyReact(source, { ...input, html: framework === 'html' });
    if (framework === 'swiftui') {
      const { id } = await source.resolveId(nodeId);
      const exported = await source.exportData(id);
      if (!exported.data.frames[0].previewPng2x) throw new Error(`There is no render of ${id} to compare with.`);
      return verifySwiftUI({ id, exported, file, view: widget, fonts, device, interact, dynamicType });
    }
    const tool = flutterTool(flutter);
    if (!tool) throw new Error('The flutter tool was not found: pass `flutter` with its path, or set FLUTTER.');
    if (viewport && viewport.split('x').some((v) => Number(v) < 1 || Number(v) > 10000)) {
      throw new Error('Each side of `viewport` must be between 1 and 10000.');
    }
    const args = [];
    if (file) {
      const absolute = resolveFile(file, hasPubspec);
      const project = projectOf(fs.existsSync(absolute) ? absolute : path.join(process.cwd(), 'lib', 'x'), hasPubspec);
      if (!project) throw new Error(`No pubspec.yaml above ${file}.`);
      const inProject = fs.existsSync(absolute) ? absolute : path.resolve(project, file);
      if (!fs.existsSync(inProject)) throw new Error(`${file} does not exist.`);
      args.push('--project', project, '--file', path.relative(project, inProject));
      if (widget) args.push('--class', widget);
    }
    for (const f of fonts) args.push('--fonts', f);
    if (viewport) args.push('--viewport', viewport);
    const { id } = await source.resolveId(nodeId);
    const exported = await source.exportData(id);
    if (!exported.data.frames[0].previewPng2x) throw new Error(`There is no render of ${id} to compare with.`);
    const slug = id.replace(/[^0-9A-Za-z]+/g, '_');
    const project = args.includes('--project') ? args[args.indexOf('--project') + 1] : null;
    const report = await withExport(id, exported, (exportFile, dir) => oneAtATime(() => runCheck([
      id, '--export', exportFile, '--flutter', tool, '--fetch-fonts',
      '--out', path.join(dir, `${slug}${file ? '_project' : ''}${viewport ? `_${viewport}` : ''}`), ...args,
    ], project)));
    const summary = {
      node: report.node,
      ...(exported.source === 'snapshot' ? { source: `snapshot saved ${exported.exportedAt || 'earlier'}` } : {}),
      analyzer: { errors: report.analyzer.errors, warnings: report.analyzer.warnings },
      runtimeErrors: report.runtimeErrors,
      renderedSize: report.renderedSize,
    };
    const tree = exported.data.frames[0].tree;
    if (report.viewport) {
      Object.assign(summary, {
        viewport: report.viewport, offscreenLayers: brief(report.offscreenLayers), files: report.files,
        coverage: coverage(tree, { framework: 'flutter', viewport: report.viewport, project: Boolean(file) }),
      });
      return [
        text(summary),
        text(`Rendered at ${report.viewport.width}x${report.viewport.height}:`),
        image(fitPng(fs.readFileSync(report.files.rendered), DIFF_MAX)),
        text(HANDOFF),
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
      coverage: coverage(tree, { framework: 'flutter', pixels: report.pixels, checkedLayers: report.checkedBoxes, project: Boolean(file) }),
    });
    return [
      text(summary),
      text('Diff (the design in grey, differing pixels in red):'),
      image(fitPng(fs.readFileSync(report.files.diff), DIFF_MAX)),
      text(HANDOFF),
    ];
  }));
}

/** The keyboard findings worth acting on: problems first, then the Tab order. */
function keyboardSummary(k) {
  if (!k) return {};
  if (k.error) return { keyboard: { error: k.error } };
  const label = (e) => `${e.name || '(no name)'} <${e.tag}${e.role ? ` role=${e.role}` : ''}>`;
  const pick = (f) => brief(k.elements.filter(f).map(label), 10);
  const problems = {
    notReachable: pick((e) => e.tabIndex < 0 && !e.disabled),
    noFocusIndicator: pick((e) => e.tabIndex >= 0 && e.focusVisible === false),
    notActivatedByKeyboard: pick((e) => e.activates === false),
    noAccessibleName: pick((e) => !e.name),
  };
  return {
    keyboard: {
      tabOrder: brief(k.tabOrder, 30),
      ...Object.fromEntries(Object.entries(problems).filter(([, v]) => v.length)),
    },
  };
}

async function verifyReact(source, { nodeId, file, viewport, fonts = [], css, tailwind, html = false }) {
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
    project = projectOf(fs.existsSync(absolute) ? absolute : path.join(process.cwd(), 'x'), hasPackageJson);
    const inProject = fs.existsSync(absolute) ? absolute : path.resolve(project || process.cwd(), file);
    if (!fs.existsSync(inProject)) throw new Error(`${file} does not exist.`);
    project = projectOf(inProject, hasPackageJson) || path.dirname(inProject);
    code = fs.readFileSync(inProject, 'utf8');
    assets = componentAssets(code, inProject, project);
  }
  const slug = id.replace(/[^0-9A-Za-z]+/g, '_');
  const out = path.join(DATA_DIR, 'verify', `${slug}_${html ? 'html' : 'react'}${file ? '_project' : ''}${viewport ? `_${viewport}` : ''}`);
  const report = await oneAtATime(() => runReactCheck({
    design, out, code, assets, viewport: size, html,
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
      ...keyboardSummary(report.keyboard),
      coverage: coverage(frame.tree, { framework: html ? 'html' : 'react', viewport: report.viewport, keyboard: report.keyboard, project: Boolean(file) }),
    });
    return [
      text(summary),
      text(`Rendered at ${report.viewport.width}x${report.viewport.height}:`),
      image(fs.readFileSync(report.files.rendered)),
      text(HANDOFF),
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
    ...keyboardSummary(report.keyboard),
    coverage: coverage(frame.tree, {
      framework: html ? 'html' : 'react', pixels: report.pixels, checkedLayers: report.checkedBoxes, keyboard: report.keyboard, project: Boolean(file),
    }),
  });
  return [
    text(summary),
    text('Diff (the design in grey, differing pixels in red):'),
    image(fs.readFileSync(report.files.diff)),
    text(HANDOFF),
  ];
}

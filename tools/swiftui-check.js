#!/usr/bin/env node
// Checks SwiftUI code against the design: compiles it for the iOS
// simulator, renders it in a booted simulator at the design size (2x,
// sRGB) and compares the render with Figma's own 2x render (pixels).
//
// Usage: node tools/swiftui-check.js <nodeId|selection> [--snapshot <frame id>]
//          [--export <design export.json>] [--fonts <dir>]... [--fetch-fonts]
//          [--out <dir>] [--device <udid or name>]
//          [--code <View.swift> [--assets <assets.json>]]
//          [--project <dir> --file <View.swift> [--view <Struct>]]
// Reads live through the running MCP server (the plugin must be connected),
// a saved snapshot with --snapshot, or a design export JSON with --export.
// By default it checks the reference code get_design_context generates.
// With --code it checks the given code instead, with its asset map
// { "name": "/path/on/disk" } (asset catalog names as the code uses them)
// and the shared DesignSystem.swift the response gave (--shared).
// With --project it checks a view of a Swift project: that file is compiled
// on its own with the project's asset catalogs, so it must build without
// the rest of the project. The view needs an init without arguments.
// The design's status bar and home indicator are drawn by the phone: the
// render keeps their room and the comparison leaves them out.
// Fonts are found in the --fonts folders, the system font folders and the
// data folder; --fetch-fonts downloads missing Google Fonts families.
// Without Xcode (xcrun and the iOS simulator SDK) the check exits with 3.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { toSwiftUI } from '../src/codegen/swiftui/index.js';
import { systemUi } from '../src/codegen/system-ui.js';
import { DATA_DIR, imageExt } from '../src/store.js';
import { families, loadDesign, pixelDiff } from './compare.js';
import { familyFiles, fetchGoogleFont, FONT_CACHE, fontFiles, SYSTEM_FONTS } from './flutter-check.js';

const CHECK_DIR = path.join(DATA_DIR, 'swiftui-check');
const BUNDLE_ID = 'dev.figmcp.swiftui-check';
const EXECUTABLE = 'SwiftUICheck';
const TARGET = `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-ios17.0-simulator`;
const RENDER_TIMEOUT = 90000;
const SKIPPED_DIRS = new Set(['node_modules', '.build', '.git', 'Pods', 'DerivedData', 'build', 'Carthage']);
export const NO_XCODE = 3;

function args(argv) {
  const out = { fonts: [], target: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fonts') out.fonts.push(argv[++i]);
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--export') out.export = argv[++i];
    else if (a === '--snapshot') out.snapshot = argv[++i];
    else if (a === '--fetch-fonts') out.fetchFonts = true;
    else if (a === '--code') out.code = argv[++i];
    else if (a === '--assets') out.assets = argv[++i];
    else if (a === '--shared') out.shared = argv[++i];
    else if (a === '--project') out.project = argv[++i];
    else if (a === '--file') out.file = argv[++i];
    else if (a === '--view') out.view = argv[++i];
    else if (a === '--device') out.device = argv[++i];
    else out.target = a;
  }
  return out;
}

function run(cmd, cmdArgs, opts = {}) {
  return spawnSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
}

/** The iOS simulator SDK path, or null without Xcode. */
export function simulatorSdk() {
  const r = run('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path']);
  return r.status === 0 ? r.stdout.trim() : null;
}

/** The booted iPhone simulator's udid, booting an available one when none is. */
function bootedDevice(wanted) {
  const list = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', '-j']).stdout).devices;
  const all = Object.entries(list).flatMap(([runtime, devices]) => devices.map((d) => ({ ...d, runtime })));
  const matches = (d) => !wanted || d.udid === wanted || d.name === wanted;
  const booted = all.find((d) => d.state === 'Booted' && matches(d) && (wanted || /iPhone/.test(d.name)));
  if (booted) return booted.udid;
  const candidates = all.filter((d) => d.isAvailable && matches(d) && (wanted || /^iPhone/.test(d.name)))
    .sort((a, b) => b.runtime.localeCompare(a.runtime, undefined, { numeric: true }) || b.name.localeCompare(a.name, undefined, { numeric: true }));
  if (!candidates.length) throw new Error(`No ${wanted ? `simulator "${wanted}"` : 'iPhone simulator'} is available: run \`xcrun simctl list devices\`.`);
  const device = candidates[0];
  const boot = run('xcrun', ['simctl', 'boot', device.udid]);
  if (boot.status !== 0 && !/current state: Booted/.test(boot.stderr)) throw new Error(`Could not boot ${device.name}: ${boot.stderr.trim()}`);
  run('xcrun', ['simctl', 'bootstatus', device.udid, '-b']);
  return device.udid;
}

/** The first `struct X: View` of [code]. */
function viewName(code) {
  const m = /struct\s+(\w+)\s*:\s*(?:\w+\s*,\s*)*View\b/.exec(code);
  return m ? m[1] : null;
}

/** Every *.xcassets under [dir], a few levels deep. */
function assetCatalogs(dir) {
  const out = [];
  const walk = (d, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || SKIPPED_DIRS.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.name.endsWith('.xcassets')) out.push(full);
      else if (depth < 3) walk(full, depth + 1);
    }
  };
  walk(dir, 1);
  return out;
}

/** Writes an asset catalog with an image set per asset: { name: { source, ext, vector } }. */
function writeCatalog(dir, assets) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Contents.json'), '{"info":{"author":"xcode","version":1}}');
  for (const [name, a] of Object.entries(assets)) {
    const set = path.join(dir, `${name}.imageset`);
    fs.mkdirSync(set, { recursive: true });
    const file = `${name}.${a.ext}`;
    fs.copyFileSync(a.source, path.join(set, file));
    fs.writeFileSync(path.join(set, 'Contents.json'), JSON.stringify({
      images: [{ filename: file, idiom: 'universal' }], info: { author: 'xcode', version: 1 },
      ...(a.vector ? { properties: { 'preserves-vector-representation': true } } : {}),
    }));
  }
}

/** The harness app's launcher: -out <png> -w <w> -h <h> [-top <pt>] [-bottom <pt>] renders the view at 2x and exits. */
function renderSource(view) {
  return `import SwiftUI
import UIKit

@main
struct CheckApp: App {
  init() {
    DispatchQueue.main.async { Render.run() }
  }

  var body: some Scene {
    WindowGroup { ${view}() }
  }
}

@MainActor enum Render {
  static var window: UIWindow?

  static func run() {
    let d = UserDefaults.standard
    guard let out = d.string(forKey: "out") else { return }
    let size = CGSize(width: d.double(forKey: "w"), height: d.double(forKey: "h"))
    // The phone's own room above and below the screen.
    let root = ${view}()
      .safeAreaInset(edge: .top, spacing: 0) { Color.clear.frame(height: d.double(forKey: "top")) }
      .safeAreaInset(edge: .bottom, spacing: 0) { Color.clear.frame(height: d.double(forKey: "bottom")) }
    let host = UIHostingController(rootView: root)
    host.safeAreaRegions = []
    let window = UIWindow(frame: CGRect(origin: CGPoint(x: 10000, y: 0), size: size))
    host.view.frame = window.bounds
    window.rootViewController = host
    window.isHidden = false
    host.view.layoutIfNeeded()
    self.window = window
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
      host.view.layoutIfNeeded()
      let format = UIGraphicsImageRendererFormat()
      format.scale = 2
      format.preferredRange = .standard
      let image = UIGraphicsImageRenderer(size: size, format: format).image { host.view.layer.render(in: $0.cgContext) }
      try? image.pngData()?.write(to: URL(fileURLWithPath: out))
      exit(0)
    }
  }
}
`;
}

/** Compiler diagnostics of [text]: [{ file, line, message }] of the given severity. */
function diagnostics(text, severity) {
  const out = [];
  for (const m of text.matchAll(/^(.*?):(\d+):\d+: (error|warning): (.*)$/gm)) {
    if (m[3] === severity) out.push({ file: path.basename(m[1]), line: Number(m[2]), message: m[4] });
  }
  return out;
}

/**
 * Builds the harness app in [build] from [code] (a file named after the
 * view), [catalogs] and [fontFilesList], for [sdk]. Returns { app, errors,
 * warnings }.
 */
function buildApp(build, { view, code, shared, catalogs, fontFilesList, sdk }) {
  fs.rmSync(build, { recursive: true, force: true });
  const src = path.join(build, 'src');
  const app = path.join(build, `${EXECUTABLE}.app`);
  fs.mkdirSync(src, { recursive: true });
  fs.mkdirSync(app, { recursive: true });
  // Previews need Xcode's macro plugin, which swiftc alone lacks.
  fs.writeFileSync(path.join(src, `${view}.swift`), code.replace(/\n#Preview\b[^\n]*\{[\s\S]*?\n\}\n/g, '\n'));
  if (shared) fs.writeFileSync(path.join(src, 'DesignSystem.swift'), shared);
  fs.writeFileSync(path.join(src, 'CheckApp.swift'), renderSource(view));
  const sources = fs.readdirSync(src).map((f) => path.join(src, f));
  const sw = run('xcrun', ['--sdk', 'iphonesimulator', 'swiftc', '-target', TARGET, '-sdk', sdk, '-parse-as-library', '-Onone',
    '-o', path.join(app, EXECUTABLE), ...sources]);
  const log = `${sw.stdout}\n${sw.stderr}`;
  fs.writeFileSync(path.join(build, 'swiftc.log'), log);
  const errors = diagnostics(log, 'error');
  const warnings = diagnostics(log, 'warning');
  if (sw.status !== 0) {
    if (!errors.length) errors.push({ file: `${view}.swift`, line: 0, message: log.trim().slice(-2000) || `swiftc exited with ${sw.status}` });
    return { app, errors, warnings };
  }
  if (catalogs.length) {
    const partial = path.join(build, 'assets.plist');
    const ac = run('xcrun', ['actool', ...catalogs, '--compile', app, '--platform', 'iphonesimulator', '--minimum-deployment-target', '17.0',
      '--target-device', 'iphone', '--output-partial-info-plist', partial]);
    if (ac.status !== 0) errors.push({ file: 'assets', line: 0, message: `actool failed: ${(ac.stderr || ac.stdout).trim().slice(-2000)}` });
  }
  for (const f of fontFilesList) fs.copyFileSync(f, path.join(app, path.basename(f)));
  const plist = (k, v) => `<key>${k}</key>${v}`;
  fs.writeFileSync(path.join(app, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
${plist('CFBundleIdentifier', `<string>${BUNDLE_ID}</string>`)}
${plist('CFBundleExecutable', `<string>${EXECUTABLE}</string>`)}
${plist('CFBundleName', `<string>${EXECUTABLE}</string>`)}
${plist('CFBundlePackageType', '<string>APPL</string>')}
${plist('CFBundleShortVersionString', '<string>1.0</string>')}
${plist('CFBundleVersion', '<string>1</string>')}
${plist('MinimumOSVersion', '<string>17.0</string>')}
${plist('UIDeviceFamily', '<array><integer>1</integer></array>')}
${plist('UILaunchScreen', '<dict/>')}
${plist('UIAppFonts', `<array>${fontFilesList.map((f) => `<string>${path.basename(f)}</string>`).join('')}</array>`)}
</dict></plist>
`);
  const sign = run('codesign', ['--force', '--sign', '-', app]);
  if (sign.status !== 0) errors.push({ file: 'app', line: 0, message: `codesign failed: ${sign.stderr.trim()}` });
  return { app, errors, warnings };
}

/** Renders [view] of the installed [app] on [device] into [out]. */
function render(device, app, out, { w, h, top, bottom }) {
  fs.rmSync(out, { force: true });
  run('xcrun', ['simctl', 'terminate', device, BUNDLE_ID]);
  const install = run('xcrun', ['simctl', 'install', device, app]);
  if (install.status !== 0) throw new Error(`Could not install the check app: ${install.stderr.trim()}`);
  const launch = run('xcrun', ['simctl', 'launch', device, BUNDLE_ID, '-out', out, '-w', String(w), '-h', String(h), '-top', String(top), '-bottom', String(bottom)]);
  if (launch.status !== 0) throw new Error(`Could not launch the check app: ${launch.stderr.trim()}`);
  const until = Date.now() + RENDER_TIMEOUT;
  while (!fs.existsSync(out) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  run('xcrun', ['simctl', 'terminate', device, BUNDLE_ID]);
  if (!fs.existsSync(out)) throw new Error('The simulator did not render the view in time.');
}

/** The font files of [familyList] among [dirs]; [missing] gets the families without files. */
async function bundleFonts(familyList, dirs, fetchFonts, missing) {
  const found = [];
  let files = fontFiles([...dirs, ...SYSTEM_FONTS, FONT_CACHE]);
  for (const family of familyList) {
    if (/^(\.?SF Pro|SF Compact|San Francisco|System)/i.test(family)) continue;
    let hits = familyFiles(family, files);
    if (!hits.length && fetchFonts) {
      try {
        await fetchGoogleFont(family);
      } catch { /* reported as missing */ }
      files = fontFiles([...dirs, ...SYSTEM_FONTS, FONT_CACHE]);
      hits = familyFiles(family, files);
    }
    if (hits.length) found.push(...hits);
    else missing.push(family);
  }
  return [...new Set(found)];
}

async function main() {
  const opts = args(process.argv.slice(2));
  const sdk = simulatorSdk();
  if (!sdk) {
    process.stderr.write('Xcode with the iOS simulator SDK was not found (xcrun --sdk iphonesimulator --show-sdk-path failed).\n');
    process.exit(NO_XCODE);
  }
  const design = await loadDesign(opts);
  const tree = design.tree;
  const slug = String(tree.id).replace(/[^0-9A-Za-z]+/g, '_');
  const out = path.resolve(opts.out || path.join(CHECK_DIR, slug));
  fs.mkdirSync(out, { recursive: true });
  let code;
  let shared = null;
  let view;
  let catalogs = [];
  let generated = null;
  let fontFamilies;
  if (opts.project) {
    const project = path.resolve(opts.project);
    const file = path.resolve(project, opts.file);
    code = fs.readFileSync(file, 'utf8');
    view = opts.view || viewName(code);
    catalogs = assetCatalogs(project);
    fontFamilies = [...families(tree)];
  } else if (opts.code) {
    code = fs.readFileSync(opts.code, 'utf8');
    shared = opts.shared ? fs.readFileSync(opts.shared, 'utf8') : null;
    view = opts.view || viewName(code);
    const given = opts.assets ? JSON.parse(fs.readFileSync(opts.assets, 'utf8')) : {};
    const assets = Object.fromEntries(Object.entries(given).map(([name, a]) => {
      const source = typeof a === 'string' ? a : a.source || a.file;
      const ext = (typeof a === 'object' && a.ext) || path.extname(source).slice(1);
      return [name, { source, ext, vector: typeof a === 'object' && 'vector' in a ? a.vector : ext === 'svg' }];
    }));
    writeCatalog(path.join(out, 'Assets.xcassets'), assets);
    catalogs = [path.join(out, 'Assets.xcassets')];
    fontFamilies = [...families(tree)];
  } else {
    // The generated code, with its assets saved beside it.
    const files = path.join(out, 'assets');
    fs.mkdirSync(files, { recursive: true });
    const saved = new Map();
    const save = (key, ext, bytes) => {
      if (!saved.has(key)) {
        const file = path.join(files, `a${saved.size}.${ext}`);
        fs.writeFileSync(file, bytes);
        saved.set(key, file);
      }
      return saved.get(key);
    };
    const image = (hash) => (design.images[hash] ? Buffer.from(design.images[hash], 'base64') : null);
    generated = toSwiftUI(tree, {
      svg: (text) => save(`svg:${text}`, 'svg', Buffer.from(text)),
      image: (hash) => (image(hash) ? save(`img:${hash}`, imageExt(image(hash)), image(hash)) : null),
      imageExt: (hash) => (image(hash) ? imageExt(image(hash)) : 'png'),
      render: (r) => save(`r:${r.base64}`, 'png', Buffer.from(r.base64, 'base64')),
    }, { preview: false });
    code = generated.code;
    shared = generated.shared;
    view = generated.structName;
    fs.writeFileSync(path.join(out, `${view}.swift`), code);
    if (shared) fs.writeFileSync(path.join(out, 'DesignSystem.swift'), shared);
    writeCatalog(path.join(out, 'Assets.xcassets'), generated.assets);
    catalogs = [path.join(out, 'Assets.xcassets')];
    fontFamilies = Object.keys(generated.fonts);
  }
  if (!view) throw new Error('No `struct X: View` was found in the code; pass --view.');
  const fontsNotBundled = [];
  const fontFilesList = await bundleFonts(fontFamilies, opts.fonts, opts.fetchFonts, fontsNotBundled);
  const build = path.join(out, 'build');
  const built = buildApp(build, { view, code, shared, catalogs, fontFilesList, sdk });
  const report = {
    node: { id: tree.id, name: tree.name, width: tree.width, height: tree.height },
    view,
    compiler: { errors: built.errors, warnings: built.warnings },
    fontsNotBundled,
    generatorWarnings: generated ? generated.warnings : [],
    files: { out, code: path.join(out, `${view}.swift`), design: path.join(out, 'design.png'), harness: build },
  };
  fs.writeFileSync(path.join(out, 'design.png'), design.render);
  if (!built.errors.length) {
    const chrome = systemUi(tree);
    const top = Math.max(0, ...chrome.filter((c) => c.kind === 'status bar').map((c) => c.box[1] + c.box[3]));
    const bottom = chrome.some((c) => c.kind === 'home indicator') ? 34 : 0;
    const device = bootedDevice(opts.device);
    const rendered = path.join(out, 'rendered.png');
    render(device, built.app, rendered, { w: tree.width, h: tree.height, top, bottom });
    const masks = chrome.map((c) => ({ x: c.box[0] * 2, y: c.box[1] * 2, width: c.box[2] * 2, height: c.box[3] * 2 }));
    const pixels = pixelDiff(design.render, fs.readFileSync(rendered), masks);
    fs.writeFileSync(path.join(out, 'diff.png'), pixels.image);
    Object.assign(report, {
      device,
      renderedSize: pixels.sizes.rendered,
      systemUiLeftOut: chrome.map((c) => `${c.id} "${c.name}" (${c.kind})`),
      pixels: { ...pixels.sizes, differingPixels: pixels.differingPixels, differingPercent: pixels.differingPercent },
    });
    report.files.rendered = rendered;
    report.files.diff = path.join(out, 'diff.png');
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write(`${e.stack || e}\n`);
    process.exit(1);
  });
}

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
// with the project's DesignSystem.swift and asset catalogs, so it must build
// without the rest of the project. The view needs an init without arguments.
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
// One app per run, so runs side by side do not stop each other's.
const BUNDLE_ID = `dev.figmcp.swiftui-check.p${process.pid}`;
const EXECUTABLE = 'SwiftUICheck';
const PREFERRED_DEVICE = 'iPhone 17 Pro';
const TARGET = `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-ios17.0-simulator`;
const RENDER_TIMEOUT = 120000;
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
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--')) throw new Error(`Unknown option ${a}.\n${USAGE}`);
    else out.target = a;
  }
  return out;
}

// No tool call may hang the check.
const STEP_TIMEOUT = 300000;

function run(cmd, cmdArgs, opts = {}) {
  return spawnSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: STEP_TIMEOUT, killSignal: 'SIGKILL', ...opts });
}

/** The iOS simulator SDK path, or null without Xcode. */
export function simulatorSdk() {
  const r = run('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path']);
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * The simulator to render in: [wanted] (udid or name), else the booted
 * iPhone 17 Pro, another booted Pro, any booted iPhone, and last a Pro
 * booted for the check. Renders are drawn at 2x whatever the device.
 */
function bootedDevice(wanted) {
  const list = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', '-j']).stdout).devices;
  const all = Object.entries(list).flatMap(([runtime, devices]) => devices.map((d) => ({ ...d, runtime })))
    .filter((d) => d.isAvailable !== false && /SimRuntime\.iOS/.test(d.runtime));
  const newest = (a, b) => b.runtime.localeCompare(a.runtime, undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true });
  const pick = (list) => {
    const iphones = list.filter((d) => /^iPhone/.test(d.name)).sort(newest);
    return iphones.find((d) => d.name === PREFERRED_DEVICE) || iphones.find((d) => / Pro$/.test(d.name)) || iphones[0] || null;
  };
  const matches = (d) => d.udid === wanted || d.name === wanted;
  const booted = all.filter((d) => d.state === 'Booted');
  const found = wanted ? booted.find(matches) : pick(booted);
  if (found) return found.udid;
  const device = wanted ? all.filter(matches).sort(newest)[0] : pick(all);
  if (!device) throw new Error(`No ${wanted ? `simulator "${wanted}"` : 'iPhone simulator'} is available: run \`xcrun simctl list devices\`.`);
  const boot = run('xcrun', ['simctl', 'boot', device.udid]);
  if (boot.status !== 0 && !/current state: Booted/.test(boot.stderr)) throw new Error(`Could not boot ${device.name}: ${boot.stderr.trim()}`);
  run('xcrun', ['simctl', 'bootstatus', device.udid, '-b']);
  return device.udid;
}

/**
 * The view to render in [code]: the View named after [file], else the
 * first View no other View of the file draws, else the first View.
 */
export function viewName(code, file = null) {
  const names = [...code.matchAll(/struct\s+(\w+)\s*:\s*(?:[\w.]+\s*,\s*)*View\b/g)].map((m) => m[1]);
  if (!names.length) return null;
  const own = file && path.basename(file, path.extname(file));
  if (own && names.includes(own)) return own;
  const drawn = (n) => new RegExp(`\\b${n}\\s*\\(`).test(code.replace(new RegExp(`struct\\s+${n}\\b`, 'g'), ''));
  return names.find((n) => !drawn(n)) || names[0];
}

/**
 * What a project view is built with: the asset catalogs, design system
 * files (DesignSystem*.swift) and font files of the view's own target, the
 * nearest folder above [file] (up to [dir]) holding a catalog or a design
 * system; widget and test targets elsewhere in the project are left out.
 */
export function projectFiles(dir, file) {
  const scan = (root) => {
    const found = { catalogs: [], systems: [], fonts: [] };
    const walk = (d, depth) => {
      let entries;
      try {
        entries = fs.readdirSync(d, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name));
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isFile() && /^DesignSystem.*\.swift$/.test(e.name) && full !== file) found.systems.push(full);
        if (e.isFile() && /\.(ttf|otf)$/i.test(e.name)) found.fonts.push(d);
        if (!e.isDirectory() || SKIPPED_DIRS.has(e.name)) continue;
        if (e.name.endsWith('.xcassets')) found.catalogs.push(full);
        else if (depth < 5) walk(full, depth + 1);
      }
    };
    walk(root, 1);
    return found;
  };
  const top = path.resolve(dir);
  for (let d = path.dirname(path.resolve(file)); d.startsWith(top); d = path.dirname(d)) {
    const found = scan(d);
    if (found.catalogs.length || found.systems.length || d === top) {
      // Fonts may sit beside the target folder (a shared Resources folder).
      return { ...found, fonts: [...new Set([...found.fonts, ...scan(top).fonts])] };
    }
    if (path.dirname(d) === d) break;
  }
  return scan(top);
}

/** Writes an asset catalog with an image set per asset: { name: { source, ext, vector } }. */
function writeCatalog(dir, assets) {
  // A catalog left from an earlier run would hide a missing asset.
  fs.rmSync(dir, { recursive: true, force: true });
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

// Harness type names, kept clear of the names a checked view may use.
const HARNESS_APP = 'FigmcpCheckHarnessApp';
const HARNESS_RENDER = 'FigmcpCheckHarnessRender';
const HARNESS_FILE = 'FigmcpCheckHarness.swift';

/**
 * The harness app's launcher: -out <png> -w <w> -h <h> [-top <pt>]
 * [-bottom <pt>] renders the view at 2x in light mode and exits; a failed
 * write exits with 2.
 */
function renderSource(view) {
  return `import SwiftUI
import UIKit

@main
struct ${HARNESS_APP}: App {
  init() {
    DispatchQueue.main.async { ${HARNESS_RENDER}.run() }
  }

  var body: some Scene {
    WindowGroup { Color.white }
  }
}

@MainActor enum ${HARNESS_RENDER} {
  static var window: UIWindow?

  static func run() {
    let d = UserDefaults.standard
    guard let out = d.string(forKey: "out") else { return }
    guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { run() }
      return
    }
    let size = CGSize(width: d.double(forKey: "w"), height: d.double(forKey: "h"))
    // The phone's own room above and below the screen, at the design's text
    // size, scale and appearance, whatever the simulator's settings.
    let root = ${view}()
      .safeAreaInset(edge: .top, spacing: 0) { Color.clear.frame(height: d.double(forKey: "top")) }
      .safeAreaInset(edge: .bottom, spacing: 0) { Color.clear.frame(height: d.double(forKey: "bottom")) }
      .dynamicTypeSize(.large)
      .environment(\\.colorScheme, .light)
      .environment(\\.displayScale, 2)
    let host = UIHostingController(rootView: root)
    host.safeAreaRegions = []
    host.overrideUserInterfaceStyle = .light
    let window = UIWindow(windowScene: scene)
    window.frame = CGRect(origin: .zero, size: size)
    window.overrideUserInterfaceStyle = .light
    window.windowLevel = .alert + 1
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
      // Drawn from the render server, so materials and blurs are captured too.
      let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
        _ = host.view.drawHierarchy(in: CGRect(origin: .zero, size: size), afterScreenUpdates: true)
      }
      guard let data = image.pngData() else {
        FileHandle.standardError.write(Data("figmcp-check: the render could not be encoded as PNG\\n".utf8))
        exit(2)
      }
      do {
        try data.write(to: URL(fileURLWithPath: out), options: .atomic)
      } catch {
        FileHandle.standardError.write(Data("figmcp-check: \\(error.localizedDescription)\\n".utf8))
        exit(2)
      }
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
  const systems = Array.isArray(shared) ? shared : shared ? [{ name: 'DesignSystem.swift', text: shared }] : [];
  fs.rmSync(build, { recursive: true, force: true });
  const src = path.join(build, 'src');
  const app = path.join(build, `${EXECUTABLE}.app`);
  fs.mkdirSync(src, { recursive: true });
  fs.mkdirSync(app, { recursive: true });
  // Previews need Xcode's macro plugin, which swiftc alone lacks.
  fs.writeFileSync(path.join(src, `${view}.swift`), code.replace(/\n#Preview\b[^\n]*\{[\s\S]*?\n\}\n/g, '\n'));
  systems.forEach((f, i) => fs.writeFileSync(path.join(src, i ? `${i}_${f.name}` : f.name), f.text));
  fs.writeFileSync(path.join(src, HARNESS_FILE), renderSource(view));
  const sources = fs.readdirSync(src).map((f) => path.join(src, f));
  const sw = run('xcrun', ['--sdk', 'iphonesimulator', 'swiftc', '-target', TARGET, '-sdk', sdk, '-parse-as-library', '-Onone',
    '-o', path.join(app, EXECUTABLE), ...sources]);
  const log = `${sw.stdout}\n${sw.stderr}`;
  fs.writeFileSync(path.join(build, 'swiftc.log'), log);
  const errors = diagnostics(log, 'error');
  const warnings = diagnostics(log, 'warning');
  if (sw.status !== 0) {
    if (!errors.length) {
      // Errors without a source line come from the linker or the toolchain, not from a line of the view.
      const linker = /\bld: |Undefined symbols|linker command failed/.test(log);
      errors.push({ file: linker ? 'linker' : 'swiftc', line: 0, message: log.trim().slice(-2000) || `swiftc exited with ${sw.status}` });
    }
    return { app, errors, warnings, stage: 'compile' };
  }
  if (catalogs.length) {
    const partial = path.join(build, 'assets.plist');
    const ac = run('xcrun', ['actool', ...catalogs, '--compile', app, '--platform', 'iphonesimulator', '--minimum-deployment-target', '17.0',
      '--target-device', 'iphone', '--output-partial-info-plist', partial]);
    if (ac.status !== 0) {
      errors.push({ file: 'assets', line: 0, message: `actool failed: ${(ac.stderr || ac.stdout).trim().slice(-2000)}` });
      return { app, errors, warnings, stage: 'assets' };
    }
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
${plist('UIAppFonts', `<array>${fontFilesList.map((f) => `<string>${xml(path.basename(f))}</string>`).join('')}</array>`)}
</dict></plist>
`);
  const sign = run('codesign', ['--force', '--sign', '-', app]);
  if (sign.status !== 0) {
    errors.push({ file: 'app', line: 0, message: `codesign failed: ${sign.stderr.trim()}` });
    return { app, errors, warnings, stage: 'sign' };
  }
  return { app, errors, warnings, stage: null };
}

function xml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The newest crash report of the check app since [since], in a few lines, or null. */
function crashReport(since) {
  const dir = path.join(process.env.HOME || '', 'Library', 'Logs', 'DiagnosticReports');
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.startsWith(EXECUTABLE)).map((f) => path.join(dir, f))
      .filter((f) => fs.statSync(f).mtimeMs >= since).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  } catch {
    return null;
  }
  if (!files.length) return null;
  const text = fs.readFileSync(files[0], 'utf8');
  const facts = [];
  for (const key of ['exception', 'termination', 'asi', 'crashed']) {
    const m = new RegExp(`"${key}"\\s*:\\s*(\\{[^{}]*\\}|"[^"]*")`).exec(text);
    if (m) facts.push(`${key}: ${m[1].replace(/\s+/g, ' ')}`);
  }
  return `${facts.join('; ').slice(0, 1500) || 'see the report'} (${files[0]})`;
}

/** Renders [view] of the installed [app] on [device] into [out]. */
function render(device, app, out, { w, h, top, bottom }) {
  fs.rmSync(out, { force: true });
  run('xcrun', ['simctl', 'terminate', device, BUNDLE_ID]);
  const install = run('xcrun', ['simctl', 'install', device, app]);
  if (install.status !== 0) throw new Error(`Could not install the check app: ${install.stderr.trim()}`);
  const started = Date.now();
  try {
    // With --console the launch waits for the app to exit, so a crash is seen at once.
    const launch = run('xcrun', ['simctl', 'launch', '--console', '--terminate-running-process', device, BUNDLE_ID,
      '-out', out, '-w', String(w), '-h', String(h), '-top', String(top), '-bottom', String(bottom)], { timeout: RENDER_TIMEOUT });
    if (fs.existsSync(out) && launch.status === 0) return;
    const log = `${launch.stdout || ''}\n${launch.stderr || ''}`.split('\n')
      .filter((l) => l.trim() && !/^dev\.figmcp\.swiftui-check/.test(l)).slice(-12).join('\n').trim();
    if (launch.error && launch.error.code === 'ETIMEDOUT') {
      throw new Error(`The simulator did not render the view within ${RENDER_TIMEOUT / 1000} s.${log ? `\n${log}` : ''}`);
    }
    const crash = crashReport(started - 1000);
    throw new Error(`The view crashed while rendering${launch.status ? ` (exit ${launch.status})` : ''}.${log ? `\n${log}` : ''}${crash ? `\nCrash report: ${crash}` : ''}`);
  } finally {
    run('xcrun', ['simctl', 'terminate', device, BUNDLE_ID]);
    run('xcrun', ['simctl', 'uninstall', device, BUNDLE_ID]);
  }
}

/** Removes check apps that runs no longer alive left installed on [device]. */
function removeStaleApps(device) {
  const list = run('xcrun', ['simctl', 'listapps', device]);
  for (const m of new Set((list.stdout || '').match(/dev\.figmcp\.swiftui-check\.p\d+/g) || [])) {
    const pid = Number(m.split('.p').pop());
    if (pid !== process.pid && !alive(pid)) run('xcrun', ['simctl', 'uninstall', device, m]);
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
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

const USAGE = `Usage: node tools/swiftui-check.js <nodeId|selection> [--snapshot <frame id>]
         [--export <design export.json>] [--fonts <dir>]... [--fetch-fonts]
         [--out <dir>] [--device <udid or name>]
         [--code <View.swift> [--shared <DesignSystem.swift>] [--assets <assets.json>] [--view <Struct>]]
         [--project <dir> --file <View.swift> [--view <Struct>]]
`;

/**
 * Runs [task] holding the lock of [dir], so two checks of one node (two
 * servers, or the CLI beside a server) do not build into the same folder.
 * A lock whose process has died is taken over.
 */
async function withLock(dir, task) {
  const lock = path.join(dir, '.lock');
  const until = Date.now() + 15 * 60000;
  for (;;) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const owner = Number(fs.readFileSync(lock, 'utf8')) || 0;
      if (!owner || !alive(owner)) {
        fs.rmSync(lock, { force: true });
        continue;
      }
      if (Date.now() > until) throw new Error(`Another check (process ${owner}) has held ${dir} for 15 minutes.`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  try {
    return await task();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

async function main() {
  const opts = args(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (!opts.target && !opts.export && !opts.snapshot) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  if (opts.target && opts.target !== 'selection' && !/^I?\d+[:-]\d+([;:-]\d+)*$/.test(opts.target)) {
    process.stderr.write(`"${opts.target}" is not a node id (like 12:34) or "selection".\n${USAGE}`);
    process.exit(2);
  }
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
  const report = await withLock(out, () => check(opts, design, out, sdk));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

/** Builds, renders and compares in [out]; the report. */
async function check(opts, design, out, sdk) {
  const tree = design.tree;
  let code;
  let codeFile;
  let shared = null;
  let view;
  let catalogs = [];
  let generated = null;
  let fontFamilies;
  if (opts.project) {
    const project = path.resolve(opts.project);
    const file = path.resolve(project, opts.file);
    code = fs.readFileSync(file, 'utf8');
    codeFile = file;
    view = opts.view || viewName(code, file);
    // The shared design system the generated screens use is compiled with the view.
    const found = projectFiles(project, file);
    catalogs = found.catalogs;
    shared = found.systems.map((f) => ({ name: path.basename(f), text: fs.readFileSync(f, 'utf8') }));
    opts.fonts.push(...found.fonts);
    fontFamilies = [...families(tree)];
  } else if (opts.code) {
    code = fs.readFileSync(opts.code, 'utf8');
    codeFile = path.resolve(opts.code);
    shared = opts.shared ? fs.readFileSync(opts.shared, 'utf8') : null;
    view = opts.view || viewName(code, opts.code);
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
    codeFile = path.join(out, `${view}.swift`);
    fs.writeFileSync(codeFile, code);
    if (shared) fs.writeFileSync(path.join(out, 'DesignSystem.swift'), shared);
    writeCatalog(path.join(out, 'Assets.xcassets'), generated.assets);
    catalogs = [path.join(out, 'Assets.xcassets')];
    fontFamilies = Object.keys(generated.fonts);
  }
  // Builds from runs before the lock existed.
  fs.rmSync(path.join(out, 'build'), { recursive: true, force: true });
  if (!view) throw new Error('No `struct X: View` was found in the code; pass --view.');
  const fontsNotBundled = [];
  const fontFilesList = await bundleFonts(fontFamilies, opts.fonts, opts.fetchFonts, fontsNotBundled);
  const build = path.join(out, 'build');
  const built = buildApp(build, { view, code, shared, catalogs, fontFilesList, sdk });
  const report = {
    node: { id: tree.id, name: tree.name, width: tree.width, height: tree.height },
    view,
    compiler: { errors: built.errors, warnings: built.warnings },
    ...(built.stage ? { failedAt: built.stage } : {}),
    fontsNotBundled,
    generatorWarnings: generated ? generated.warnings : [],
    files: { out, code: codeFile, design: path.join(out, 'design.png'), harness: build },
  };
  fs.writeFileSync(path.join(out, 'design.png'), design.render);
  for (const f of ['rendered.png', 'diff.png']) fs.rmSync(path.join(out, f), { force: true });
  if (!built.errors.length) {
    const chrome = systemUi(tree);
    const top = Math.max(0, ...chrome.filter((c) => c.kind === 'status bar').map((c) => c.box[1] + c.box[3]));
    const bottom = chrome.some((c) => c.kind === 'home indicator') ? 34 : 0;
    const device = bootedDevice(opts.device);
    removeStaleApps(device);
    const rendered = path.join(out, 'rendered.png');
    try {
      render(device, built.app, rendered, { w: tree.width, h: tree.height, top, bottom });
    } catch (e) {
      Object.assign(report, { device, failedAt: 'render', renderError: e.message });
      fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
      return report;
    }
    const masks = chrome.map((c) => ({ x: c.box[0] * 2, y: c.box[1] * 2, width: c.box[2] * 2, height: c.box[3] * 2 }));
    const pixels = pixelDiff(design.render, fs.readFileSync(rendered), masks);
    fs.writeFileSync(path.join(out, 'diff.png'), pixels.image);
    Object.assign(report, {
      device,
      renderedSize: pixels.sizes.rendered,
      systemUiLeftOut: chrome.map((c) => `${c.id} "${c.name}" (${c.kind})`),
      pixels: {
        ...pixels.sizes, differingPixels: pixels.differingPixels, differingPercent: pixels.differingPercent,
        ...(pixels.sizeMismatch ? { sizeMismatch: pixels.sizeMismatch } : {}),
      },
    });
    report.files.rendered = rendered;
    report.files.diff = path.join(out, 'diff.png');
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write(`${e.stack || e}\n`);
    process.exit(1);
  });
}

#!/usr/bin/env node
// Checks the generated Flutter code against the design: analyzes it, renders
// it with `flutter test` in a scratch project at 2x, then compares every
// layer's box with the node's box in Figma (geometry) and the rendering with
// Figma's own 2x render (pixels).
//
// Usage: node tools/flutter-check.js <nodeId|selection> [--snapshot <frame id>]
//          [--export <design export.json>] [--fonts <dir>]... [--fetch-fonts]
//          [--out <dir>] [--flutter <path>] [--viewport <width>x<height>]
//          [--code <design.dart> [--assets <assets.json>]]
//          [--project <flutter project> --file <lib/…dart> --class <Widget>]
// Reads live through the running MCP server (the plugin must be connected),
// a saved snapshot with --snapshot, or a design export JSON with --export.
// With --viewport the design is laid out on a screen of that size instead:
// there is nothing to compare with, so it reports runtime errors and layers
// pushed off the screen's sides. With --code it checks the given code (for
// example what get_design_context returned, with its asset map
// { "assets/…": "/path/on/disk" }) instead of generating it; that code has
// no layer keys, so only pixels, runtime errors and the analyzer are checked.
// With --project it checks a widget of a Flutter project as the project
// builds it (its packages, assets and flutter_screenutil scaling, inside a
// MaterialApp): a test file is written into the project's test folder for
// the run and removed after; like --code, only pixels, runtime errors and
// the analyzer are checked.
// Fonts are found in the --fonts folders and the system font folders;
// --fetch-fonts downloads missing Google Fonts families into the data folder.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { toFlutter } from '../src/codegen/flutter/index.js';
import { DATA_DIR, imageExt } from '../src/store.js';
import { compareBoxes, expectedBoxes, families, loadDesign, pixelDiff } from './compare.js';
import { FONT_CACHE, SYSTEM_FONTS, familyFiles, fetchGoogleFont, fontFiles } from './fonts.js';

const HARNESS_DIR = path.join(DATA_DIR, 'flutter-check');
let HARNESS = HARNESS_DIR;
const ASSET_DIR = 'assets/check';
// Windows runs flutter.bat, which needs a shell.
const SHELL = process.platform === 'win32';
// Below the 10 minutes verify_code waits, so the run cleans up first.
const TEST_TIMEOUT = 540000;

function args(argv) {
  const out = { fonts: [], target: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fonts') out.fonts.push(argv[++i]);
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--export') out.export = argv[++i];
    else if (a === '--snapshot') out.snapshot = argv[++i];
    else if (a === '--flutter') out.flutter = argv[++i];
    else if (a === '--fetch-fonts') out.fetchFonts = true;
    else if (a === '--code') out.code = argv[++i];
    else if (a === '--assets') out.assets = argv[++i];
    else if (a === '--project') out.project = argv[++i];
    else if (a === '--file') out.file = argv[++i];
    else if (a === '--class') out.className = argv[++i];
    else if (a === '--viewport') {
      const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(argv[++i] || '');
      if (!m) throw new Error('--viewport takes <width>x<height>, e.g. 360x780');
      out.viewport = [Number(m[1]), Number(m[2])];
    }
    else out.target = a;
  }
  return out;
}

/** The flutter tool: [explicit], or the one on PATH; null when there is none. */
export function findFlutter(explicit) {
  if (explicit) return explicit;
  const found = spawnSync(SHELL ? 'where' : 'which', ['flutter'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0].trim();
  return found || null;
}

function flutterBin(opts) {
  const found = findFlutter(opts.flutter);
  if (!found) throw new Error('flutter is not on PATH; pass --flutter <path to the flutter tool>');
  return found;
}

function writeIfChanged(file, text) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return true;
}

/**
 * The scratch Flutter project, with its packages resolved (offline when
 * possible); [dir] overrides its folder.
 */
export function harness(flutter, dir = HARNESS_DIR, assetDirs = [ASSET_DIR]) {
  HARNESS = dir;
  const pubspec = `name: figma_check
publish_to: none
environment:
  sdk: ^3.7.0
dependencies:
  flutter:
    sdk: flutter
  flutter_svg: ^2.0.0
dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^6.0.0
flutter:
  assets:
${assetDirs.map((d) => `    - ${d}/`).join('\n')}
`;
  for (const dir of ['lib', 'test', ...assetDirs]) fs.mkdirSync(path.join(HARNESS, dir), { recursive: true });
  const changed = writeIfChanged(path.join(HARNESS, 'pubspec.yaml'), pubspec);
  writeIfChanged(path.join(HARNESS, 'analysis_options.yaml'), 'include: package:flutter_lints/flutter.yaml\n');
  if (changed || !fs.existsSync(path.join(HARNESS, '.dart_tool', 'package_config.json'))) {
    const offline = spawnSync(flutter, ['pub', 'get', '--offline'], { cwd: HARNESS, encoding: 'utf8', shell: SHELL });
    if (offline.status !== 0) {
      const online = spawnSync(flutter, ['pub', 'get'], { cwd: HARNESS, encoding: 'utf8', shell: SHELL });
      if (online.status !== 0) throw new Error(`flutter pub get failed:\n${online.stderr || online.stdout}`);
    }
  }
}

const TEST = `// Written by tools/flutter-check.js.
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

__IMPORTS__
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('render the design', (tester) async {
    final config = jsonDecode(File('__CONFIG__').readAsStringSync()) as Map<String, dynamic>;
    final errors = <String>[];
    final previous = FlutterError.onError;
    FlutterError.onError = (details) {
      // Name the widget Flutter blames: its line in lib/design.dart.
      final where = RegExp(r'__FILE_RE__:(\\d+):\\d+').firstMatch(details.toString());
      final line = where == null ? '' : ' (__FILE__ line \${where.group(1)})';
      errors.add(details.exceptionAsString().split('\\n').first + line);
    };
    addTearDown(tester.view.reset);
    try {
      final fonts = (config['fonts'] as Map).cast<String, dynamic>();
      for (final family in fonts.keys) {
        final loader = FontLoader(family);
        for (final file in (fonts[family] as List).cast<String>()) {
          loader.addFont(Future.value(ByteData.sublistView(File(file).readAsBytesSync())));
        }
        await loader.load();
      }
      final width = (config['width'] as num).toDouble();
      final height = (config['height'] as num).toDouble();
      final padding = (config['padding'] as List).cast<num>();
      tester.view.devicePixelRatio = 2;
      tester.view.physicalSize = Size(width * 2, height * 2);
      final boundary = GlobalKey();
      await tester.pumpWidget(
        MediaQuery(
          data: MediaQueryData(
            size: Size(width, height),
            devicePixelRatio: 2,
            padding: EdgeInsets.only(top: padding[0].toDouble(), bottom: padding[1].toDouble()),
          ),
          child: Directionality(
            textDirection: TextDirection.ltr,
            child: DefaultTextStyle(
              style: const TextStyle(color: Color(0xFF000000)),
              child: Align(
                alignment: Alignment.topLeft,
                child: RepaintBoundary(key: boundary, child: __WIDGET__),
              ),
            ),
          ),
        ),
      );
      await tester.runAsync(() async {
        final context = boundary.currentContext!;
        for (final asset in (config['images'] as List).cast<String>()) {
          await precacheImage(AssetImage(asset), context);
        }
        for (final asset in (config['svgs'] as List).cast<String>()) {
          await SvgAssetLoader(asset).loadBytes(null);
        }
      });
      for (var i = 0; i < 6; i++) {
        await tester.pump();
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
      }
      final thrown = tester.takeException();
      if (thrown != null) errors.add(thrown.toString());
      final origin = tester.getTopLeft(find.byKey(boundary));
      final rects = <String, List<double>>{};
      for (final id in (config['ids'] as List).cast<String>()) {
        final finder = find.byKey(ValueKey(id));
        if (finder.evaluate().isEmpty) continue;
        final r = tester.getRect(finder.first);
        if (![r.left, r.top, r.width, r.height].every((v) => v.isFinite)) {
          errors.add('The layer $id has no finite box: $r');
          continue;
        }
        rects[id] = [r.left - origin.dx, r.top - origin.dy, r.width, r.height];
      }
      final render = tester.renderObject<RenderRepaintBoundary>(find.byKey(boundary));
      final png = await tester.runAsync(() async {
        final image = await render.toImage(pixelRatio: 2);
        final data = await image.toByteData(format: ui.ImageByteFormat.png);
        return data!.buffer.asUint8List();
      });
      final out = config['out'] as String;
      File('$out/rendered.png').writeAsBytesSync(png!);
      final size = tester.getSize(find.byKey(boundary));
      File('$out/result.json').writeAsStringSync(jsonEncode({
        'rects': rects,
        'errors': errors,
        'size': [size.width, size.height],
      }));
    } finally {
      FlutterError.onError = previous;
    }
  });
}
`;

/** Analyzer issues of [file] in [dir] (default: the scratch project's lib/design.dart): [{ severity, message, line, code }]. */
export function analyze(flutter, file = 'lib/design.dart', dir = HARNESS) {
  const run = spawnSync(flutter, ['analyze', '--no-pub', file], { cwd: dir, encoding: 'utf8', shell: SHELL });
  const issues = [];
  const at = file.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const pattern = new RegExp(`^\\s*(error|warning|info)\\s+•\\s+(.+?)\\s+•\\s+${at}:(\\d+):(\\d+)\\s+•\\s+(\\S+)`);
  for (const line of `${run.stdout}\n${run.stderr}`.split('\n')) {
    const m = pattern.exec(line);
    if (m) issues.push({ severity: m[1], message: m[2], line: Number(m[3]), code: m[5] });
  }
  return issues;
}

const PROJECT_TEST = 'test/figmcp_check_test.dart';

function testSource({ imports, config, file, widget }) {
  const fileRe = file.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const values = { __IMPORTS__: imports, __CONFIG__: config, __FILE_RE__: fileRe, __FILE__: file, __WIDGET__: widget };
  return TEST.replace(/__(?:IMPORTS|CONFIG|FILE_RE|FILE|WIDGET)__/g, (key) => values[key]);
}

/**
 * The widget [opts.className] of [opts.file] in the Flutter project
 * [opts.project]: { dir, file, code, className, assets, imports, widget }.
 */
function projectRun(opts, tree) {
  const dir = path.resolve(opts.project);
  const pubspec = fs.readFileSync(path.join(dir, 'pubspec.yaml'), 'utf8');
  const name = (/^name:\s*([A-Za-z0-9_]+)/m.exec(pubspec) || [])[1];
  if (!name) throw new Error(`${dir}/pubspec.yaml has no name`);
  if (!opts.file) throw new Error('--project needs --file <lib/…dart>');
  const file = path.relative(dir, path.resolve(dir, opts.file)).split(path.sep).join('/');
  if (!file.startsWith('lib/') || !file.endsWith('.dart')) throw new Error('--file must be a .dart file under lib/');
  const code = fs.readFileSync(path.join(dir, file), 'utf8');
  const className = opts.className || (/class (\w+) extends (?:StatelessWidget|StatefulWidget|ConsumerWidget|HookWidget)/.exec(code) || [])[1];
  if (!className) throw new Error(`${file} has no widget class; pass --class`);
  if (!new RegExp(`class ${className}\\b`).test(code)) throw new Error(`${file} has no class ${className}`);
  const assets = [...new Set([...code.matchAll(/['"](assets\/[^'"$]+\.(?:png|jpe?g|webp|gif|svg))['"]/gi)].map((m) => m[1]))]
    .filter((a) => fs.existsSync(path.join(dir, a)));
  const screenUtil = /^\s+flutter_screenutil:/m.test(pubspec);
  if (!/^\s+flutter_test:/m.test(pubspec)) throw new Error(`${dir}/pubspec.yaml has no flutter_test dev dependency, which flutter test needs`);
  if (!/^\s+flutter_svg:/m.test(pubspec)) throw new Error(`${dir}/pubspec.yaml does not depend on flutter_svg, which the check needs`);
  const imports = [
    "import 'package:flutter/material.dart';",
    `import 'package:${name}/${file.slice('lib/'.length)}';`,
    ...(screenUtil ? ["import 'package:flutter_screenutil/flutter_screenutil.dart';"] : []),
  ].join('\n');
  const widget = () => {
    const app = `MaterialApp(debugShowCheckedModeBanner: false, home: Material(type: MaterialType.transparency, child: ${className}()))`;
    return screenUtil
      ? `ScreenUtilInit(designSize: const Size(${tree.width}, ${tree.height}), minTextAdapt: true, builder: (context, child) => ${app})`
      : app;
  };
  return { dir, file, code, className, assets, imports, widget };
}

async function main() {
  const opts = args(process.argv.slice(2));
  const flutter = flutterBin(opts);
  const design = await loadDesign(opts);
  const tree = design.tree;
  const suffix = opts.viewport ? `_${opts.viewport.join('x')}` : '';
  const out = path.resolve(opts.out || path.join('flutter-check-out', `${tree.id.replace(/[^0-9A-Za-z]+/g, '_')}${suffix}`));
  fs.mkdirSync(out, { recursive: true });

  // The code to check (with a key per layer when generated here) and its
  // assets: { asset path: bytes }.
  let project = null;
  let code;
  let plainCode;
  let className;
  let generated = null;
  const assetFiles = {};
  let run = null;
  if (opts.project) {
    project = projectRun(opts, tree);
    code = project.code;
    className = project.className;
  } else if (opts.code) {
    code = fs.readFileSync(opts.code, 'utf8');
    plainCode = code;
    className = (/class (\w+) extends StatelessWidget/.exec(code) || [])[1];
    if (!className) throw new Error(`${opts.code} has no StatelessWidget class`);
    const mapping = opts.assets ? JSON.parse(fs.readFileSync(opts.assets, 'utf8')) : {};
    for (const [asset, file] of Object.entries(mapping)) assetFiles[asset] = fs.readFileSync(file);
  } else {
    const bytes = new Map();
    let n = 0;
    const source = (data) => {
      const id = `s${n++}`;
      bytes.set(id, data);
      return id;
    };
    const sources = new Map();
    const once = (key, make) => {
      if (!sources.has(key)) sources.set(key, make());
      return sources.get(key);
    };
    const image = (hash) => (design.images[hash] ? Buffer.from(design.images[hash], 'base64') : null);
    const assets = {
      svg: (text) => once(`svg:${text}`, () => source(Buffer.from(text))),
      image: (hash) => (image(hash) ? once(`img:${hash}`, () => source(image(hash))) : null),
      imageExt: (hash) => (image(hash) ? imageExt(image(hash)) : 'png'),
      render: (r) => once(`render:${r.base64}`, () => source(Buffer.from(r.base64, 'base64'))),
    };
    generated = toFlutter(tree, assets, { keys: true, assetDirs: { svg: ASSET_DIR, image: ASSET_DIR } });
    plainCode = toFlutter(tree, { ...assets }, { assetDirs: { svg: ASSET_DIR, image: ASSET_DIR } }).code;
    code = generated.code;
    className = generated.className;
    for (const [asset, id] of Object.entries(generated.assets)) assetFiles[asset] = bytes.get(id);
  }

  let issues;
  if (project) {
    if (!fs.existsSync(path.join(project.dir, '.dart_tool', 'package_config.json'))) {
      const got = spawnSync(flutter, ['pub', 'get'], { cwd: project.dir, encoding: 'utf8', shell: SHELL });
      if (got.status !== 0) throw new Error(`flutter pub get failed in ${project.dir}:\n${got.stderr || got.stdout}`);
    }
    issues = analyze(flutter, project.file, project.dir);
    fs.writeFileSync(path.join(out, 'design.dart'), code);
  } else {
    const assetDirs = [...new Set([ASSET_DIR, ...Object.keys(assetFiles).map((a) => path.posix.dirname(a))])];
    harness(flutter, HARNESS_DIR, assetDirs);
    for (const dir of assetDirs) {
      fs.rmSync(path.join(HARNESS, dir), { recursive: true, force: true });
      fs.mkdirSync(path.join(HARNESS, dir), { recursive: true });
    }
    for (const [asset, data] of Object.entries(assetFiles)) fs.writeFileSync(path.join(HARNESS, asset), data);
    fs.writeFileSync(path.join(HARNESS, 'lib', 'design.dart'), plainCode);
    issues = analyze(flutter);
    fs.writeFileSync(path.join(out, 'design.dart'), plainCode);
    fs.writeFileSync(path.join(HARNESS, 'lib', 'design.dart'), code);
  }

  // Fonts: the given folders, the system folders, and the download cache.
  const used = [...families(tree)];
  if (opts.fetchFonts) {
    for (const family of used) {
      if (!familyFiles(family, fontFiles([...opts.fonts, ...(opts.project ? [path.join(path.resolve(opts.project), 'assets', 'fonts')] : []),
        ...SYSTEM_FONTS, FONT_CACHE])).length) {
        try {
          await fetchGoogleFont(family);
        } catch (e) {
          process.stderr.write(`could not download ${family}: ${e.message}\n`);
        }
      }
    }
  }
  const fontDirs = [...opts.fonts, ...(project ? [path.join(project.dir, 'assets', 'fonts')] : [])];
  const files = fontFiles([...fontDirs, ...SYSTEM_FONTS, FONT_CACHE]);
  const fonts = {};
  for (const family of used) {
    const hit = familyFiles(family, files);
    if (hit.length) fonts[family] = hit;
  }

  const boxes = expectedBoxes(tree);
  const [width, height] = opts.viewport || [tree.width, tree.height];
  const assetList = project ? project.assets : Object.keys(assetFiles);
  const config = JSON.stringify({
    width, height, padding: [0, 0],
    fonts, ids: generated ? boxes.map((b) => b.id) : [], out,
    images: assetList.filter((a) => !a.endsWith('.svg')),
    svgs: assetList.filter((a) => a.endsWith('.svg')),
  });
  for (const stale of ['result.json', 'report.json', 'rendered.png', 'diff.png']) fs.rmSync(path.join(out, stale), { force: true });
  if (project) {
    const testFile = path.join(project.dir, PROJECT_TEST);
    const configFile = path.join(project.dir, '.dart_tool', 'figmcp_check.json');
    fs.writeFileSync(configFile, config);
    fs.writeFileSync(testFile, testSource({
      imports: project.imports, config: configFile, file: project.file, widget: project.widget(width, height),
    }));
    try {
      run = spawnSync(flutter, ['test', '--no-pub', PROJECT_TEST], { cwd: project.dir, encoding: 'utf8', timeout: TEST_TIMEOUT, shell: SHELL });
    } finally {
      fs.rmSync(testFile, { force: true });
      fs.rmSync(configFile, { force: true });
    }
  } else {
    fs.writeFileSync(path.join(HARNESS, 'check_config.json'), config);
    writeIfChanged(path.join(HARNESS, 'test', 'render_test.dart'), testSource({
      imports: "import 'package:figma_check/design.dart';", config: 'check_config.json',
      file: 'lib/design.dart', widget: `const ${className}()`,
    }));
    run = spawnSync(flutter, ['test', '--no-pub', 'test/render_test.dart'], { cwd: HARNESS, encoding: 'utf8', timeout: TEST_TIMEOUT, shell: SHELL });
  }
  if (!fs.existsSync(path.join(out, 'result.json'))) {
    const errors = issues.filter((i) => i.severity === 'error');
    const listed = errors.length ? `Analyzer errors:\n${errors.map((i) => `- line ${i.line}: ${i.message} (${i.code})`).join('\n')}\n\n` : '';
    throw new Error(`flutter test did not render the design:\n${listed}${(run.stdout || '').slice(-6000)}\n${run.stderr || ''}`);
  }
  const measured = JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8'));
  const rects = {};
  for (const [id, [x, y, w, h]] of Object.entries(measured.rects)) rects[id] = { x, y, width: w, height: h };
  if (opts.viewport) {
    const byId = new Map(boxes.map((b) => [b.id, b]));
    const parents = new Map();
    const index = (n, parent) => {
      parents.set(n.id, { node: n, parent });
      (n.children || []).forEach((c) => index(c, n));
    };
    index(tree, null);
    const outside = (r) => r.x < -0.5 || r.x + r.width > width + 0.5;
    // A layer cut by a clipping ancestor that is itself on screen is not
    // seen past the screen's sides.
    const clipped = (id) => {
      for (let p = parents.get(id)?.parent; p; p = parents.get(p.id)?.parent) {
        if (p.clipsContent && rects[p.id] && !outside(rects[p.id])) return true;
      }
      return false;
    };
    const offscreen = Object.entries(rects)
      .filter(([id, r]) => outside(r) && !clipped(id))
      .map(([id, r]) => ({ id, name: byId.get(id)?.name, box: [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 100) / 100) }));
    const report = {
      node: { id: tree.id, name: tree.name, width: tree.width, height: tree.height },
      viewport: { width, height },
      screen: generated ? generated.screen : null,
      analyzer: { errors: issues.filter((i) => i.severity === 'error'), warnings: issues.filter((i) => i.severity === 'warning') },
      runtimeErrors: measured.errors,
      renderedSize: measured.size,
      offscreenLayers: offscreen,
      files: { out, code: path.join(out, 'design.dart'), rendered: path.join(out, 'rendered.png'), harness: HARNESS },
    };
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  const cmp = generated ? compareBoxes(boxes, rects, new Set(Object.keys(fonts)), tree)
    : { mismatches: [], roundingMismatches: [], fontMismatches: [], missing: [], unbundled: [] };
  const rendered = fs.readFileSync(path.join(out, 'rendered.png'));
  fs.writeFileSync(path.join(out, 'design.png'), design.render);
  const pixels = pixelDiff(design.render, rendered);
  fs.writeFileSync(path.join(out, 'diff.png'), pixels.image);
  const report = {
    node: { id: tree.id, name: tree.name, width: tree.width, height: tree.height },
    analyzer: {
      errors: issues.filter((i) => i.severity === 'error'),
      warnings: issues.filter((i) => i.severity === 'warning'),
      infos: issues.filter((i) => i.severity === 'info'),
    },
    runtimeErrors: measured.errors,
    renderedSize: measured.size,
    checkedBoxes: generated ? boxes.length : 0,
    geometryMismatches: cmp.mismatches,
    textRoundingMismatches: cmp.roundingMismatches,
    mismatchesFromUnbundledFonts: cmp.fontMismatches,
    missingElements: cmp.missing,
    fontsNotBundled: cmp.unbundled,
    fonts,
    ...(generated ? {} : { geometry: 'not measured: the given code has no layer keys' }),
    generatorWarnings: generated ? generated.warnings : [],
    rasterized: generated ? generated.rasterized : [],
    pixels: { ...pixels.sizes, differingPixels: pixels.differingPixels, differingPercent: pixels.differingPercent },
    files: {
      out, code: path.join(out, 'design.dart'), design: path.join(out, 'design.png'),
      rendered: path.join(out, 'rendered.png'), diff: path.join(out, 'diff.png'), harness: HARNESS,
    },
  };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

/** Writes [code] as lib/design.dart of the scratch project in [dir] and analyzes it. */
export function analyzeCode(flutter, code, dir = HARNESS_DIR) {
  harness(flutter, dir);
  fs.writeFileSync(path.join(dir, 'lib', 'design.dart'), code);
  return analyze(flutter);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write(`${e.stack || e}\n`);
    process.exit(1);
  });
}

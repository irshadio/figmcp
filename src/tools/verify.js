// Render check: draws Flutter code with `flutter test` and compares it with
// Figma's own render of the node.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { DATA_DIR } from '../store.js';
import { fileKeySchema, guard, image, nodeIdSchema, text } from './common.js';

const CHECK = new URL('../../tools/flutter-check.js', import.meta.url).pathname;
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

/** The folder holding the pubspec.yaml above [file], or null. */
function projectOf(file) {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pubspec.yaml'))) return dir;
    if (path.dirname(dir) === dir) return null;
  }
}

function runCheck(args) {
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

const brief = (list, n = 15) => (list.length > n ? [...list.slice(0, n), `… ${list.length - n} more`] : list);

export function registerVerifyTools(server, bridge, source) {
  server.registerTool('verify_code', {
    description:
      'Check Flutter code against the design: analyzes it, renders it with ' +
      '`flutter test` at 2x, and compares the render with Figma\'s own 2x ' +
      'render of the node. Returns analyzer errors, runtime errors (overflows, ' +
      'missing assets), the share of differing pixels and a diff image (the ' +
      'design in grey, differing pixels in red).\n\n' +
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
      file: z.string().optional().describe('The .dart file with the widget, under the project\'s lib/ (absolute, or relative to the project).'),
      widget: z.string().optional().describe('The widget class in `file` (default: its first widget class).'),
      viewport: z.string().regex(/^\d+(\.\d+)?x\d+(\.\d+)?$/).optional().describe(
        'Lay the generated code out on a screen of this size, e.g. "360x780", and report runtime errors ' +
        'and layers pushed off screen instead of comparing (only without `file`).'),
      fonts: z.array(z.string()).optional().describe('Folders with font files (default: the project\'s assets/fonts and the system fonts).'),
      flutter: z.string().optional().describe('Path of the flutter tool, when it is not on PATH.'),
    },
  }, guard(async ({ nodeId, file, widget, viewport, fonts = [], flutter }) => {
    const tool = flutterTool(flutter);
    if (!tool) throw new Error('The flutter tool was not found: pass `flutter` with its path, or set FLUTTER.');
    if (file && viewport) throw new Error('`viewport` checks the generated code; leave out `file` to use it.');
    const { id } = await source.resolveId(nodeId);
    const exported = await source.exportData(id);
    if (!exported.data.frames[0].previewPng2x) throw new Error(`There is no render of ${id} to compare with.`);
    const slug = id.replace(/[^0-9A-Za-z]+/g, '_');
    const dir = path.join(DATA_DIR, 'verify');
    fs.mkdirSync(dir, { recursive: true });
    const exportFile = path.join(dir, `${slug}.json`);
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
    const report = await runCheck(args);
    const summary = {
      node: report.node,
      ...(exported.source === 'snapshot' ? { source: `snapshot saved ${exported.exportedAt || 'earlier'}` } : {}),
      analyzer: { errors: report.analyzer.errors, warnings: report.analyzer.warnings },
      runtimeErrors: report.runtimeErrors,
      renderedSize: report.renderedSize,
    };
    if (report.viewport) {
      Object.assign(summary, { viewport: report.viewport, offscreenLayers: brief(report.offscreenLayers) });
      return [text(summary)];
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

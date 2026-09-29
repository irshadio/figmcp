#!/usr/bin/env node
// Checks the generated code against the design: renders it in headless
// Chrome with the given font files, then compares every element's box with
// the node's box in Figma (geometry) and the rendering with Figma's own 2x
// render (pixels).
//
// Usage: node tools/visual-check.js <nodeId|selection> --fonts <dir> [--fonts <dir>]
//          [--out <dir>] [--export <design export.json>] [--chrome <path>]
// Reads live through the running MCP server (the plugin must be connected),
// or from a design export JSON with --export.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import puppeteer from 'puppeteer-core';
import { Bridge } from '../src/bridge.js';
import { toReactTailwind } from '../src/codegen/react.js';
import { imageExt } from '../src/store.js';
import { imageSize } from '../src/png.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCRIPTS = [
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7.26.4/babel.min.js',
  'https://cdn.tailwindcss.com/3.4.17',
];
const WEIGHTS = {
  Thin: 100, ExtraLight: 200, Light: 300, Regular: 400, Medium: 500,
  SemiBold: 600, Bold: 700, ExtraBold: 800, Black: 900,
};
const BOX_TOLERANCE = 0.5;
const TEXT_TOLERANCE = 1;
const PIXEL_THRESHOLD = 48;

function args(argv) {
  const out = { fonts: [], target: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fonts') out.fonts.push(argv[++i]);
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--export') out.export = argv[++i];
    else if (a === '--chrome') out.chrome = argv[++i];
    else out.target = a;
  }
  return out;
}

function fontFaces(dirs) {
  const faces = [];
  const families = new Set();
  for (const dir of dirs) {
    for (const file of fs.readdirSync(dir, { recursive: true })) {
      const m = /([^/]+?)-([A-Za-z]+)\.(ttf|otf|woff2?)$/.exec(file);
      if (!m) continue;
      const [, family, style] = m;
      families.add(family);
      const url = pathToFileURL(path.join(dir, file)).href;
      const spaced = style.replace(/([a-z])([A-Z])/g, '$1 $2');
      for (const alias of new Set([`${family}:${style}`, `${family}:${spaced}`])) {
        faces.push(`@font-face{font-family:"${alias}";src:url("${url}");font-weight:100 900;}`);
      }
      faces.push(`@font-face{font-family:"${family}";src:url("${url}");font-weight:${WEIGHTS[style] || 400};}`);
    }
  }
  return { css: faces.join('\n'), families };
}

async function loadDesign(opts) {
  if (opts.export) {
    const data = JSON.parse(fs.readFileSync(opts.export, 'utf8'));
    const frame = data.frames[0];
    return { tree: frame.tree, images: data.images || {}, render: Buffer.from(frame.previewPng2x, 'base64') };
  }
  const bridge = new Bridge({ port: Number(process.env.FIGMA_LOCAL_MCP_PORT || 3947) });
  await bridge.start();
  try {
    let id = opts.target;
    if (!id || id === 'selection') {
      const info = await bridge.call('info', {}, 10000);
      if (!info.selection.length) throw new Error('Nothing is selected in Figma');
      id = info.selection[0].id;
    }
    id = id.replace(/-/g, ':');
    const node = await bridge.call('node', { id, svg: true, images: true }, 180000);
    const shot = await bridge.call('export', { id, format: 'PNG', scale: 2, absoluteBounds: true }, 180000);
    return { tree: node.tree, images: node.images || {}, render: Buffer.from(shot.base64, 'base64') };
  } finally {
    bridge.close();
  }
}

function writeAssets(dir, images) {
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  const save = (buffer, ext) => {
    const file = path.join(dir, `a${n++}.${ext}`);
    fs.writeFileSync(file, buffer);
    return pathToFileURL(file).href;
  };
  const bytes = (hash) => (images[hash] ? Buffer.from(images[hash], 'base64') : null);
  return {
    svg: (svg) => save(Buffer.from(svg), 'svg'),
    image: (hash) => {
      const b = bytes(hash);
      return b ? save(b, imageExt(b)) : null;
    },
    imageSize: (hash) => {
      const b = bytes(hash);
      return b ? imageSize(b) : null;
    },
    render: (r) => save(Buffer.from(r.base64, 'base64'), 'png'),
  };
}

function page(code, fontsCss, width, height) {
  const body = code.replace(/^export default function (\w+)/m, 'function Design');
  return `<!doctype html><html><head><meta charset="utf-8">
<style>${fontsCss}\nhtml,body{margin:0;padding:0;background:transparent}#root{width:${width}px;height:${height}px}</style>
${SCRIPTS.map((s) => `<script src="${s}"></script>`).join('\n')}
</head><body><div id="root"></div>
<script>
window.__error = null;
try {
  const src = ${JSON.stringify(body)} + '\\nReactDOM.createRoot(document.getElementById("root")).render(React.createElement(Design));';
  new Function(Babel.transform(src, { presets: ['react'] }).code)();
} catch (e) { window.__error = String(e && e.stack || e); }
</script></body></html>`;
}

function families(n, out = new Set()) {
  if (n.visible === false) return out;
  for (const s of n.segments || []) if (s.fontName && s.fontName.family) out.add(s.fontName.family);
  (n.children || []).forEach((c) => families(c, out));
  return out;
}

/** Every node the code draws, with its box relative to the root. */
function expectedBoxes(tree) {
  const out = [];
  const walk = (n, depth) => {
    if (n.visible === false || n.isMask) return;
    out.push({ id: n.id, name: n.name, type: n.type, x: n.x - tree.x, y: n.y - tree.y, width: n.width, height: n.height, depth,
      text: n.type === 'TEXT', families: [...families(n)] });
    if (n.svg || n.render) return;
    (n.children || []).forEach((c) => walk(c, depth + 1));
  };
  walk(tree, 0);
  return out;
}

function pixelDiff(a, b) {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  const w = Math.min(pa.width, pb.width);
  const h = Math.min(pa.height, pb.height);
  const diff = new PNG({ width: w, height: h });
  let bad = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * pa.width + x) * 4;
      const j = (y * pb.width + x) * 4;
      const o = (y * w + x) * 4;
      // Compare over white, as both renders are shown on white.
      const over = (d, k) => Math.round((d[k] * d[k + 3] + 255 * (255 - d[k + 3])) / 255);
      let delta = 0;
      for (let c = 0; c < 3; c++) delta = Math.max(delta, Math.abs(over(pa.data, i + c) - over(pb.data, j + c)));
      const grey = over(pa.data, i);
      if (delta > PIXEL_THRESHOLD) {
        bad++;
        diff.data.set([255, 0, 0, 255], o);
      } else {
        diff.data.set([grey, grey, grey, 70], o);
      }
    }
  }
  return {
    sizes: { design: [pa.width, pa.height], rendered: [pb.width, pb.height] },
    differingPixels: bad,
    differingPercent: Math.round((bad / (w * h)) * 10000) / 100,
    image: PNG.sync.write(diff),
  };
}

async function main() {
  const opts = args(process.argv.slice(2));
  if (!opts.fonts.length) throw new Error('Pass --fonts <dir> with the app\'s font files');
  const design = await loadDesign(opts);
  const out = path.resolve(opts.out || path.join('visual-check-out', design.tree.id.replace(/[^0-9A-Za-z]+/g, '_')));
  fs.mkdirSync(out, { recursive: true });
  const { code, rasterized } = toReactTailwind(design.tree, writeAssets(path.join(out, 'assets'), design.images));
  fs.writeFileSync(path.join(out, 'design.jsx'), code);
  const fonts = fontFaces(opts.fonts);
  const width = design.tree.width;
  const height = design.tree.height;
  const htmlFile = path.join(out, 'index.html');
  fs.writeFileSync(htmlFile, page(code, fonts.css, width, height));
  fs.writeFileSync(path.join(out, 'design.png'), design.render);

  const browser = await puppeteer.launch({
    executablePath: opts.chrome || CHROME, headless: true,
    args: ['--allow-file-access-from-files', '--font-render-hinting=none'],
  });
  let report;
  try {
    const tab = await browser.newPage();
    await tab.setViewport({ width: Math.ceil(width), height: Math.ceil(height), deviceScaleFactor: 2 });
    await tab.goto(pathToFileURL(htmlFile).href, { waitUntil: 'networkidle0', timeout: 60000 });
    await tab.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
      await new Promise((r) => setTimeout(r, 300));
    });
    const error = await tab.evaluate(() => window.__error);
    if (error) throw new Error(`The generated code failed to render: ${error}`);
    const rects = await tab.evaluate(() => {
      const root = document.querySelector('#root > *').getBoundingClientRect();
      const out = {};
      for (const el of document.querySelectorAll('[data-node-id]')) {
        const r = el.getBoundingClientRect();
        out[el.getAttribute('data-node-id')] = { x: r.left - root.left, y: r.top - root.top, width: r.width, height: r.height };
      }
      return out;
    });
    const rootEl = await tab.$('#root > *');
    const rendered = await rootEl.screenshot({ omitBackground: true });
    fs.writeFileSync(path.join(out, 'rendered.png'), rendered);

    const mismatches = [];
    const fontMismatches = [];
    const missing = [];
    const unbundled = new Set();
    for (const box of expectedBoxes(design.tree)) {
      const got = rects[box.id];
      if (!got) {
        missing.push({ id: box.id, name: box.name, type: box.type });
        continue;
      }
      const missingFonts = box.families.filter((f) => !fonts.families.has(f));
      missingFonts.forEach((f) => unbundled.add(f));
      const tol = box.text ? TEXT_TOLERANCE : BOX_TOLERANCE;
      const d = ['x', 'y', 'width', 'height'].map((k) => Math.round((got[k] - box[k]) * 100) / 100);
      if (d.some((v) => Math.abs(v) > tol)) {
        (missingFonts.length ? fontMismatches : mismatches).push({
          id: box.id, name: box.name, type: box.type,
          expected: [box.x, box.y, box.width, box.height].map((v) => Math.round(v * 100) / 100),
          actual: [got.x, got.y, got.width, got.height].map((v) => Math.round(v * 100) / 100),
          delta: d, ...(missingFonts.length ? { cause: `text in ${missingFonts.join(', ')}, which is not bundled` } : {}),
        });
      }
    }
    const pixels = pixelDiff(design.render, rendered);
    fs.writeFileSync(path.join(out, 'diff.png'), pixels.image);
    report = {
      node: { id: design.tree.id, name: design.tree.name, width, height },
      checkedBoxes: expectedBoxes(design.tree).length,
      geometryMismatches: mismatches,
      mismatchesFromUnbundledFonts: fontMismatches,
      missingElements: missing,
      fontsNotBundled: [...unbundled],
      rasterized,
      pixels: { ...pixels.sizes, differingPixels: pixels.differingPixels, differingPercent: pixels.differingPercent },
      files: { out, page: htmlFile, code: path.join(out, 'design.jsx'), design: path.join(out, 'design.png'),
        rendered: path.join(out, 'rendered.png'), diff: path.join(out, 'diff.png') },
    };
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((e) => {
  process.stderr.write(`${e.stack || e}\n`);
  process.exit(1);
});

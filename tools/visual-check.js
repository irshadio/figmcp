#!/usr/bin/env node
// Checks the generated code against the design: renders it in headless
// Chrome with the given font files, then compares every element's box with
// the node's box in Figma (geometry) and the rendering with Figma's own 2x
// render (pixels).
//
// Usage: node tools/visual-check.js <nodeId|selection> --fonts <dir> [--fonts <dir>]
//          [--out <dir>] [--export <design export.json>] [--snapshot <frame id>]
//          [--chrome <path>]
// Reads live through the running MCP server (the plugin must be connected),
// from a design export JSON with --export, or a saved snapshot with
// --snapshot.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { toReactTailwind } from '../src/codegen/react.js';
import { imageExt } from '../src/store.js';
import { imageSize } from '../src/png.js';
import { compareBoxes, expectedBoxes, loadDesign, pixelDiff } from './compare.js';

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

function args(argv) {
  const out = { fonts: [], target: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fonts') out.fonts.push(argv[++i]);
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--export') out.export = argv[++i];
    else if (a === '--snapshot') out.snapshot = argv[++i];
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

    const boxes = expectedBoxes(design.tree);
    const cmp = compareBoxes(boxes, rects, fonts.families, design.tree);
    const pixels = pixelDiff(design.render, rendered);
    fs.writeFileSync(path.join(out, 'diff.png'), pixels.image);
    report = {
      node: { id: design.tree.id, name: design.tree.name, width, height },
      checkedBoxes: boxes.length,
      geometryMismatches: cmp.mismatches,
      textRoundingMismatches: cmp.roundingMismatches,
      mismatchesFromUnbundledFonts: cmp.fontMismatches,
      missingElements: cmp.missing,
      fontsNotBundled: cmp.unbundled,
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

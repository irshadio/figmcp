#!/usr/bin/env node
// Checks React + Tailwind code against the design: renders it in headless
// Chrome with the design's fonts, then compares every element's box with the
// node's box in Figma (geometry) and the rendering with Figma's own 2x render
// (pixels).
//
// Usage: node tools/visual-check.js <nodeId|selection> [--fonts <dir>]...
//          [--fetch-fonts] [--tailwind 3|4] [--out <dir>] [--chrome <path>]
//          [--export <design export.json>] [--snapshot <frame id>]
//          [--code <component.jsx|tsx> [--assets <assets.json>]]
//          [--viewport <width>x<height>] [--html]
// Reads live through the running MCP server (the plugin must be connected),
// from a design export JSON with --export, or a saved snapshot with
// --snapshot. With --code it renders that component (its default export)
// instead of generating one; --assets maps the image constants or URLs it
// uses to files ({ "imgLogo": "/path/logo.svg" } or { "<url>": "<path>" }).
// With --viewport the page is laid out at that size and nothing is compared.
// With --html it checks HTML + Tailwind instead (generated, or the page or
// fragment given with --code).
// React and Tailwind load from a CDN, so the check needs a network.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { toHtmlTailwind } from '../src/codegen/html.js';
import { toReactTailwind } from '../src/codegen/react.js';
import { imageExt } from '../src/store.js';
import { imageSize } from '../src/png.js';
import { compareBoxes, expectedBoxes, families, loadDesign, pixelDiff } from './compare.js';
import { faceOf, resolveFonts } from './fonts.js';

const CHROMES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const REACT = [
  'https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js',
  'https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/@babel/standalone@7.26.4/babel.min.js',
];
const TAILWIND = {
  3: 'https://cdn.tailwindcss.com/3.4.17',
  4: 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.11/dist/index.global.js',
};
// Chrome draws at most 16384 device pixels in one capture; taller pages are
// captured in strips and joined.
const STRIP = 4000;
const FONT_EXTS = /\.(ttf|otf|woff2?)$/i;
const FONT_FORMATS = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' };

function args(argv) {
  const out = { fonts: [], target: null, tailwind: 4 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fonts') out.fonts.push(argv[++i]);
    else if (a === '--fetch-fonts') out.fetchFonts = true;
    else if (a === '--tailwind') out.tailwind = Number(argv[++i]);
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--export') out.export = argv[++i];
    else if (a === '--snapshot') out.snapshot = argv[++i];
    else if (a === '--chrome') out.chrome = argv[++i];
    else if (a === '--code') out.code = argv[++i];
    else if (a === '--assets') out.assets = argv[++i];
    else if (a === '--html') out.html = true;
    else if (a === '--viewport') {
      const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(argv[++i] || '');
      if (!m) throw new Error('--viewport takes <width>x<height>, e.g. 390x844');
      out.viewport = [Number(m[1]), Number(m[2])];
    } else out.target = a;
  }
  if (!TAILWIND[out.tailwind]) throw new Error('--tailwind takes 3 or 4');
  return out;
}

export function findChrome(explicit) {
  return [explicit, ...CHROMES].find((c) => c && fs.existsSync(c)) || null;
}

/** @font-face rules for the resolved { family: [files] }, by weight and style. */
export function fontFaceCss(fonts) {
  const rules = [];
  for (const [family, files] of Object.entries(fonts)) {
    for (const file of files) {
      const { weight, italic } = faceOf(family, file);
      const ext = path.extname(file).slice(1).toLowerCase();
      rules.push(`@font-face{font-family:${JSON.stringify(family)};src:url(${JSON.stringify(pathToFileURL(file).href)}) format("${FONT_FORMATS[ext] || 'truetype'}");` +
        `font-weight:${weight};font-style:${italic ? 'italic' : 'normal'};font-display:block;}`);
    }
  }
  return rules.join('\n');
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

/**
 * Module code as a script: imports dropped (React comes from the page,
 * images from [assets]: constant or URL -> file), the default export named
 * Design, and a stylesheet the code exports as `css` applied.
 */
export function pageScript(code, assets = {}) {
  const urls = Object.entries(assets);
  let body = code;
  for (const [key, file] of urls) {
    const href = /^[a-z]+:/i.test(file) ? file : pathToFileURL(path.resolve(file)).href;
    if (/^[A-Za-z_$][\w$]*$/.test(key)) {
      // An imported image: `import imgLogo from './logo.svg'`.
      body = body.replace(new RegExp(`^import\\s+${key}\\s+from\\s+['"][^'"]+['"];?\\s*$`, 'm'), `const ${key} = ${JSON.stringify(href)};`);
    } else body = body.split(key).join(href);
  }
  // React comes from the page: its imports become reads of the global.
  body = body.replace(/^import\s+(?:type\s+)?([^;]*?)\s+from\s+['"]react['"];?\s*$/gm, (m, what) => {
    if (/^type\s/.test(m.slice(7))) return '';
    const parts = [];
    const named = /\{([^}]*)\}/.exec(what);
    const head = what.replace(/\{[^}]*\}/, '').replace(/,\s*$/, '').trim();
    const star = /^\*\s+as\s+(\w+)$/.exec(head);
    if (star && star[1] !== 'React') parts.push(`const ${star[1]} = React;`);
    else if (head && !star && head !== 'React') parts.push(`const ${head} = React;`);
    if (named) {
      const names = named[1].split(',').map((n) => n.trim()).filter((n) => n && !/^type\s/.test(n))
        .map((n) => n.replace(/\s+as\s+/, ': '));
      if (names.length) parts.push(`const { ${names.join(', ')} } = React;`);
    }
    return parts.join('\n');
  });
  body = body
    .replace(/^import\s[^;]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s+default\s+function\s*(\w*)\s*\(/m, 'function Design(')
    .replace(/^export\s+default\s+(\(|async\s*\()/m, 'const Design = $1')
    .replace(/^export\s+default\s+(\w+);?\s*$/m, 'const Design = $1;')
    .replace(/^export\s+(const|function|let)\s/gm, '$1 ');
  return body;
}

function page({ script, markup = null, fontsCss, css = '', width, height, tailwind }) {
  const tw = tailwind === 4
    ? `<style type="text/tailwindcss">${css}</style>`
    : `<style>${css}</style>`;
  if (markup !== null) {
    return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${fontsCss}\nhtml,body{margin:0;padding:0;background:transparent}#root{width:${width}px;min-height:${height}px}</style>
<script src="${TAILWIND[tailwind]}"></script>
${tw}
</head><body><div id="root">${markup}</div></body></html>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${fontsCss}\nhtml,body{margin:0;padding:0;background:transparent}#root{width:${width}px;min-height:${height}px}</style>
${REACT.map((s) => `<script src="${s}"></script>`).join('\n')}
<script src="${TAILWIND[tailwind]}"></script>
${tw}
</head><body><div id="root"></div>
<script>
window.__error = null;
window.addEventListener('error', (e) => { window.__error = window.__error || String(e.error && e.error.stack || e.message); });
try {
  const src = ${JSON.stringify(script)} + '\\nReactDOM.createRoot(document.getElementById("root")).render(React.createElement(Design));';
  new Function('React', Babel.transform(src, { presets: ['react', 'typescript'], filename: 'design.tsx', compact: true }).code)(React);
} catch (e) { window.__error = String(e && e.stack || e); }
</script></body></html>`;
}

function stitch(strips, width) {
  const pngs = strips.map((b) => PNG.sync.read(b));
  const height = pngs.reduce((s, p) => s + p.height, 0);
  const out = new PNG({ width, height });
  let y = 0;
  for (const p of pngs) {
    for (let row = 0; row < p.height; row++) {
      const from = row * p.width * 4;
      p.data.copy(out.data, (y + row) * width * 4, from, from + Math.min(p.width, width) * 4);
    }
    y += p.height;
  }
  return PNG.sync.write(out);
}

/** A capture of the element at [rect] (CSS pixels), in strips when tall. */
async function capture(tab, rect) {
  const strips = [];
  for (let y = 0; y < rect.height; y += STRIP) {
    strips.push(await tab.screenshot({
      clip: { x: rect.x, y: rect.y + y, width: rect.width, height: Math.min(STRIP, rect.height - y) },
      captureBeyondViewport: true, omitBackground: true,
    }));
  }
  return strips.length === 1 ? strips[0] : stitch(strips, PNG.sync.read(strips[0]).width);
}

/**
 * An HTML fragment or page as the markup to render: the body of a full
 * page, with asset paths ([assets]: path or URL -> file) made file URLs.
 */
export function pageMarkup(html, assets = {}) {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  let markup = body ? body[1] : html;
  for (const [key, file] of Object.entries(assets)) {
    const href = /^[a-z]+:/i.test(file) ? file : pathToFileURL(path.resolve(file)).href;
    markup = markup.split(`"${key}"`).join(`"${href}"`);
  }
  return markup.replace(/<script[\s\S]*?<\/script>/gi, '');
}

/**
 * Renders [code] (or the code generated from [design]) and compares it with
 * the design: React, or HTML with [html]. Returns the report; files go to
 * [out].
 */
export async function reactCheck({
  design, out, fonts: fontDirs = [], fetchFonts = false, tailwind = 4, chrome, code = null, assets = null, css = '',
  viewport = null, html = false,
}) {
  const puppeteer = await import('puppeteer-core').catch(() => {
    throw new Error('The React check needs puppeteer-core: run `npm install puppeteer-core` next to figma-local-mcp.');
  });
  const executablePath = findChrome(chrome);
  if (!executablePath) throw new Error('Chrome was not found: pass its path with --chrome or set CHROME.');
  fs.mkdirSync(out, { recursive: true });
  for (const stale of ['rendered.png', 'diff.png', 'report.json']) fs.rmSync(path.join(out, stale), { force: true });
  const tree = design.tree;
  if (!viewport && !design.render) throw new Error('The design has no render to compare with: pass a viewport to lay the code out instead.');
  let generated = null;
  if (!code) {
    const files = writeAssets(path.join(out, 'assets'), design.images);
    generated = html ? toHtmlTailwind(tree, files) : toReactTailwind(tree, files);
    code = generated.code;
    css = generated.css || '';
  }
  const codeFile = path.join(out, html ? 'design.html' : 'design.jsx');
  fs.writeFileSync(codeFile, code);
  if (css) fs.writeFileSync(path.join(out, 'design.css'), css);
  const used = [...families(tree)];
  const fonts = await resolveFonts(used, fontDirs, { fetch: fetchFonts, exts: FONT_EXTS });
  const [width, height] = viewport || [tree.width, tree.height];
  const htmlFile = path.join(out, 'index.html');
  fs.writeFileSync(htmlFile, page({
    ...(html ? { markup: pageMarkup(code, assets || {}) } : { script: pageScript(code, assets || {}) }),
    fontsCss: fontFaceCss(fonts), css, width, height, tailwind,
  }));
  if (design.render) fs.writeFileSync(path.join(out, 'design.png'), design.render);

  const browser = await puppeteer.default.launch({
    executablePath, headless: true,
    args: ['--allow-file-access-from-files', '--font-render-hinting=none', '--hide-scrollbars'],
  });
  let report;
  try {
    const tab = await browser.newPage();
    const consoleErrors = [];
    tab.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    tab.on('pageerror', (e) => consoleErrors.push(String(e.message || e)));
    await tab.setViewport({ width: Math.ceil(width), height: Math.ceil(height), deviceScaleFactor: 2 });
    await tab.goto(pathToFileURL(htmlFile).href, { waitUntil: 'networkidle0', timeout: 120000 });
    await tab.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
      await new Promise((r) => setTimeout(r, 500));
    });
    const error = await tab.evaluate(() => window.__error);
    if (error) throw new Error(`The code failed to render: ${error}`);
    const state = await tab.evaluate(() => {
      const el = document.querySelector('#root > *');
      if (!el) return null;
      const root = el.getBoundingClientRect();
      const boxes = {};
      for (const node of document.querySelectorAll('[data-node-id]')) {
        const r = node.getBoundingClientRect();
        // A sideways scroller shows part of its row: it has a box and a scroll width.
        const scroller = getComputedStyle(node).overflowX === 'auto' && node.scrollWidth > node.clientWidth;
        boxes[node.getAttribute('data-node-id')] = {
          x: r.left - root.left, y: r.top - root.top, width: r.width, height: r.height,
          ...(scroller ? { scrollWidth: node.scrollWidth } : {}),
          // A text field drawn from a placeholder may take its row's free room.
          ...(node.tagName === 'INPUT' && parseFloat(getComputedStyle(node).flexGrow) > 0 ? { grows: true } : {}),
        };
      }
      // What of each layer shows: its box cut by the ancestors that clip or scroll.
      const shown = {};
      for (const node of document.querySelectorAll('[data-node-id]')) {
        let r = node.getBoundingClientRect();
        let box = { left: r.left, right: r.right };
        for (let p = node.parentElement; p && box.right > box.left; p = p.parentElement) {
          if (getComputedStyle(p).overflowX === 'visible') continue;
          r = p.getBoundingClientRect();
          box = { left: Math.max(box.left, r.left), right: Math.min(box.right, r.right) };
        }
        shown[node.getAttribute('data-node-id')] = box.right > box.left ? box : null;
      }
      const broken = [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src'));
      const fontsMissing = [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family);
      return {
        root: { x: root.left + window.scrollX, y: root.top + window.scrollY, width: root.width, height: root.height },
        page: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
        boxes, shown, broken, fontsMissing,
      };
    });
    if (!state) throw new Error('The component rendered nothing.');
    const unbundled = used.filter((f) => !fonts[f]);
    const base = {
      node: { id: tree.id, name: tree.name, width: tree.width, height: tree.height },
      tailwind,
      renderedSize: [Math.round(state.root.width * 100) / 100, Math.round(state.root.height * 100) / 100],
      runtimeErrors: [...new Set(consoleErrors)].slice(0, 20),
      brokenImages: state.broken,
      fontsNotBundled: unbundled,
    };
    if (viewport) {
      const rendered = await capture(tab, { x: 0, y: 0, width, height: Math.min(state.page.height, 30000) });
      fs.writeFileSync(path.join(out, 'rendered.png'), rendered);
      // Layers that show past the screen's sides (not those clipped or scrolled away).
      const offscreen = Object.entries(state.boxes)
        .filter(([id]) => state.shown[id] && (state.shown[id].right > width + 0.5 || state.shown[id].left < -0.5))
        .map(([id, b]) => ({ id, box: [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 100) / 100) }));
      report = {
        ...base, viewport: { width, height }, pageSize: [state.page.width, state.page.height],
        horizontalOverflow: state.page.width > width + 0.5, offscreenLayers: offscreen,
        files: { out, page: htmlFile, code: codeFile, rendered: path.join(out, 'rendered.png') },
      };
    } else {
      const rendered = await capture(tab, {
        x: state.root.x, y: state.root.y, width: Math.ceil(tree.width), height: Math.ceil(tree.height),
      });
      fs.writeFileSync(path.join(out, 'rendered.png'), rendered);
      const boxes = expectedBoxes(tree);
      const cmp = compareBoxes(boxes, state.boxes, new Set(Object.keys(fonts)), tree);
      const pixels = pixelDiff(design.render, rendered);
      fs.writeFileSync(path.join(out, 'diff.png'), pixels.image);
      report = {
        ...base,
        ...(generated ? {
          checkedBoxes: boxes.length,
          geometryMismatches: cmp.mismatches,
          textRoundingMismatches: cmp.roundingMismatches,
          mismatchesFromUnbundledFonts: cmp.fontMismatches,
          missingElements: cmp.missing,
          rasterized: generated.rasterized,
          generatorWarnings: generated.warnings,
        } : {}),
        pixels: { ...pixels.sizes, differingPixels: pixels.differingPixels, differingPercent: pixels.differingPercent },
        files: {
          out, page: htmlFile, code: codeFile, design: path.join(out, 'design.png'),
          rendered: path.join(out, 'rendered.png'), diff: path.join(out, 'diff.png'),
        },
      };
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  const opts = args(process.argv.slice(2));
  const design = await loadDesign(opts);
  const out = path.resolve(opts.out || path.join('visual-check-out', design.tree.id.replace(/[^0-9A-Za-z]+/g, '_')));
  const code = opts.code ? fs.readFileSync(opts.code, 'utf8') : null;
  const assets = opts.assets ? JSON.parse(fs.readFileSync(opts.assets, 'utf8')) : null;
  const report = await reactCheck({ ...opts, design, out, code, assets });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write(`${e.stack || e}\n`);
    process.exit(1);
  });
}

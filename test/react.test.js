// React + Tailwind output: fonts, text metrics, layout details measured
// against Figma renders, semantics, theme classes, tokens and phone screens.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { toReactTailwind } from '../src/codegen/react.js';
import { isGenericName } from '../src/codegen/semantics.js';
import { snapClass, tokensCss, usedVariables } from '../src/codegen/tailwind.js';
import { toHtmlTailwind } from '../src/codegen/html.js';
import { detectFramework, reactAssetDir, tailwindVersion } from '../src/project.js';
import { pageScript } from '../tools/visual-check.js';
import { faceOf } from '../tools/fonts.js';

const assets = {
  svg: () => '/disk/a1b2.svg',
  image: (hash) => (hash === 'missing' ? null : `/disk/${hash}.png`),
  imageSize: () => ({ width: 10, height: 10 }),
  render: () => '/disk/r.png',
};
const black = { r: 0, g: 0, b: 0, a: 1 };
const solid = (color = black, extra = {}) => ({ type: 'SOLID', visible: true, color, ...extra });

function frame(children, extra = {}) {
  return { id: '1:1', name: 'Root', type: 'FRAME', x: 0, y: 0, width: 200, height: 100, children, ...extra };
}

function text(characters, extra = {}, seg = {}) {
  return {
    id: '2:1', name: 'T', type: 'TEXT', x: 0, y: 0, width: 100, height: 20, characters,
    textAutoResize: 'WIDTH_AND_HEIGHT',
    segments: [{ characters, fontSize: 16, fontName: { family: 'Inter', style: 'Regular' },
      lineHeight: { unit: 'PIXELS', value: 20 }, fills: [solid()], ...seg }],
    ...extra,
  };
}

function box(id, extra = {}) {
  return { id, name: id, type: 'FRAME', x: 0, y: 0, width: 20, height: 20, ...extra };
}

const gen = (root, opts) => toReactTailwind(root, assets, opts);
const code = (root, opts) => gen(root, opts).code;

test('fonts: the family as web fonts load it, quote-safe, with the weight of its style', () => {
  const out = gen(frame([text('Hi', {}, { fontName: { family: 'Plus Jakarta Sans', style: 'SemiBold Italic' } })]));
  assert.match(out.code, /font-\['Plus_Jakarta_Sans',sans-serif\] font-semibold italic/);
  assert.doesNotMatch(out.code, /SemiBold'/, 'the style is not part of the family');
  assert.deepEqual(out.fonts, { 'Plus Jakarta Sans': ['600 italic'] });
  assert.match(code(frame([text('Hi', {}, { fontName: { family: "Ruth's Hand", style: 'Regular' } })])), /font-\['Ruth\\'s_Hand',sans-serif\]/);
  assert.match(code(frame([text('Hi', {}, { fontName: { family: 'My_Font', style: 'Bold' } })])), /font-\['My\\_Font',sans-serif\] font-bold/);
  assert.match(code(frame([text('Hi', {}, { fontName: { family: 'SF Pro', style: 'Semibold' }, fontWeight: 590 })])), /font-\[590\]/);
});

test('hugging text leaves out the spaces that end its lines, as Figma measures it', () => {
  const out = code(frame([text('QAR ', {}, { textDecoration: 'STRIKETHROUGH' })]));
  assert.match(out, />\n\s+QAR\n/);
  assert.match(out, /whitespace-nowrap/);
  // Spaces inside the line, and in a wrapping box, stay.
  assert.match(code(frame([text('a  b ', { textAutoResize: 'HEIGHT' })])), /\{"a {2}b "\}/);
});

test('a lone child of a space-between layout stays where the file draws it', () => {
  const row = (childX) => code(frame([box('3:1', { x: childX, width: 60 })], {
    layoutMode: 'HORIZONTAL', primaryAxisAlignItems: 'SPACE_BETWEEN', paddingLeft: 10, paddingRight: 10,
  }));
  assert.match(row(10), /justify-start/);
  assert.match(row(70), /justify-center/, 'files whose layout was not recomputed centre it');
  assert.match(row(130), /justify-end/);
});

test('a hugging layout whose children are all hidden keeps its size', () => {
  const out = code(frame([box('3:1', {
    layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG', width: 28.89, height: 28.89,
    children: [box('3:2', { visible: false })],
  })], { layoutMode: 'VERTICAL' }));
  assert.match(out, /w-\[28.89px\] h-\[28.89px\][^"]*" data-name="3:1"/);
});

test('superscript runs are drawn smaller and raised without growing the line', () => {
  const seg = (characters, extra = {}) => ({ characters, fontSize: 16, fontName: { family: 'Inter', style: 'Bold' },
    lineHeight: { unit: 'PIXELS', value: 20 }, fills: [solid()], ...extra });
  const out = code(frame([{ ...text('40,0000'), segments: [seg('40,00'), seg('00', { openTypeFeatures: { SUPS: true } })] }]));
  assert.match(out, /<p className="[^"]*text-\[16px\] leading-\[20px\]/, 'the line box comes from the regular run');
  assert.match(out, /<span className="text-\[10.4px\] leading-\[0\] relative top-\[-5.6px\]">00<\/span>/);
  const liga = code(frame([text('ffi', {}, { openTypeFeatures: { LIGA: false, TNUM: true } })]));
  assert.match(liga, /\[font-feature-settings:'liga'_0,'tnum'_1\]/);
});

test('dashed lines repeat Figma\'s dash pattern', () => {
  const line = { id: '4:1', name: 'Line 1', type: 'LINE', x: 0, y: 10, width: 100, height: 0, strokeWeight: 1,
    strokes: [solid({ r: 0.5, g: 0.5, b: 0.5, a: 1 })], dashPattern: [1, 5] };
  const out = gen(frame([line]));
  assert.match(out.code, /bg-\[repeating-linear-gradient\(90deg,#808080_0px_1px,transparent_1px_6px\)\]/);
  assert.deepEqual(out.warnings, []);
});

test('the component is named after the root, never after a mapped component or a default name', () => {
  assert.match(code(frame([], { name: '01 Home' })), /export default function Home\(\)/);
  assert.match(code(frame([], { name: 'Frame 2085664401' })), /export default function Design\(\)/);
  const card = { ...box('5:1'), type: 'INSTANCE', name: 'Card', componentSetKey: 'k' };
  const out = code(frame([card], { name: 'Card' }), {
    connect: (n) => (n.componentSetKey === 'k' ? { componentName: 'Card', source: 'src/Card.tsx' } : null),
  });
  assert.match(out, /export default function CardScreen\(\)/);
  assert.match(out, /<Card \/>/);
});

test('what the code draws differently is listed', () => {
  const warn = (node) => gen(frame([node])).warnings.map((w) => w.message);
  assert.deepEqual(warn(box('6:1', { fills: [{ type: 'GRADIENT_DIAMOND', visible: true, gradientStops: [] }] })),
    ['a diamond gradient is drawn as a radial gradient']);
  assert.deepEqual(warn(box('6:2', { effects: [{ type: 'NOISE', visible: true }] })), ['the noise effect is not drawn']);
  assert.deepEqual(warn(box('6:3', { strokeWeight: 2, strokes: [{ type: 'IMAGE', visible: true }] })), ['an image stroke is not drawn']);
  assert.deepEqual(warn(box('6:4', { fills: [{ type: 'IMAGE', visible: true, imageHash: 'missing' }] })), ['an image fill has no image data']);
  assert.deepEqual(warn(text('Go', {}, { hyperlink: { type: 'NODE', value: '9:9' } })), ['a link to another layer is plain text: wire the navigation']);
  assert.deepEqual(warn(box('6:5', { blendMode: 'LINEAR_BURN' })), ['the linear burn blend of the layer is drawn normal']);
});

test('taps, layer names and text styles give buttons, links, landmarks and headings', () => {
  const tap = (action) => ({ trigger: 'ON_CLICK', action, ...(action === 'URL' ? { url: 'https://example.com' } : { navigation: 'NAVIGATE' }) });
  const out = code(frame([
    box('7:1', { name: 'Card', reactions: [tap('NODE')], children: [text('Open', { id: '7:2' })] }),
    box('7:3', { name: 'Docs', reactions: [tap('URL')] }),
    box('7:4', { name: 'Close icon button', children: [{ ...box('7:5'), type: 'VECTOR', svg: '<svg/>' }] }),
    box('7:6', { name: 'Bottom Nav' }),
    box('7:7', { name: 'Footer' }),
    text('Title', { id: '7:8' }, { textStyle: 'Heading/H1' }),
    box('7:9', { name: 'Primary Button', children: [box('7:10', { name: 'Inner button' })] }),
  ]));
  assert.match(out, /<button className="[^"]*block[^"]*text-start cursor-pointer" data-name="Card" data-node-id="7:1"[^>]* type="button">/);
  assert.match(out, /<a className="[^"]*" data-name="Docs" data-node-id="7:3"[^>]* href="https:\/\/example.com">\n\s+<\/a>/);
  assert.match(out, /data-name="Close icon button" data-node-id="7:4" type="button" aria-label="Close icon button">/);
  assert.match(out, /<nav [^>]*data-name="Bottom Nav"/);
  assert.match(out, /<footer [^>]*data-name="Footer"/);
  assert.match(out, /<h1 [^>]*data-text-style="Heading\/H1">/);
  assert.match(out, /<div [^>]*data-name="Inner button"/, 'no button inside a button');
});

test('content images say what they show; decoration and default names stay silent', () => {
  const img = (name) => box('8:1', { name, width: 80, height: 60, fills: [{ type: 'IMAGE', visible: true, imageHash: 'h', scaleMode: 'FILL' }] });
  assert.match(code(frame([img('Singapore skyline')])), /<img alt="Singapore skyline"/);
  for (const name of ['Rectangle 12', '81Y8+2cuWEL 1', 'IMG_2041', 'Photo', 'image 7747']) {
    assert.match(code(frame([img(name)])), /<div aria-hidden="true"[^>]*>\n\s+<img alt=""|<img alt=""/, name);
  }
  assert.equal(isGenericName('Arrow'), false, 'a kind word still names a constant');
  assert.equal(isGenericName('Arrow', true), true);
});

test('theme classes replace arbitrary values only where they are equal in Tailwind 3.4 and 4', () => {
  const cases = {
    'px-[16px]': 'px-4', 'left-[0px]': 'left-0', 'w-[1px]': 'w-px', 'ml-[-8px]': '-ml-2', 'gap-[10px]': 'gap-2.5',
    'w-[390px]': 'w-[390px]', 'p-[13px]': 'p-[13px]', 'max-w-[16px]': 'max-w-[16px]', 'pl-[-4px]': 'pl-[-4px]',
    'rounded-[999px]': 'rounded-full', 'rounded-[8px]': 'rounded-lg', 'rounded-[4px]': 'rounded-[4px]', 'rounded-tl-[12px]': 'rounded-tl-xl',
    'font-[700]': 'font-bold', 'font-[590]': 'font-[590]', 'opacity-[0.5]': 'opacity-50', 'opacity-[0.42]': 'opacity-[0.42]',
    'bg-[#ffffff]': 'bg-white', 'text-[#000000]': 'text-black', 'bg-[#fffffe]': 'bg-[#fffffe]',
    'z-[10]': 'z-10', 'z-[3]': 'z-[3]', 'text-[14px]': 'text-[14px]', 'p-[var(--s,16px)]': 'p-[var(--s,16px)]',
  };
  for (const [from, to] of Object.entries(cases)) assert.equal(snapClass(from), to, from);
  assert.match(code(frame([box('9:1', { x: 0, y: 0, constraints: { horizontal: 'STRETCH', vertical: 'STRETCH' }, width: 200, height: 100 })])),
    /className="absolute inset-0"/);
});

test('design variables are declared, with Tailwind 4 theme names', () => {
  const out = gen(frame([box('10:1', {
    fills: [solid({ r: 0.24, g: 0.23, b: 0.85, a: 1 })], cornerRadius: 12, paddingLeft: 16, layoutMode: 'HORIZONTAL',
    vars: { 'fill.0': 'Brand/600', topLeftRadius: 'radius/card', topRightRadius: 'radius/card', bottomLeftRadius: 'radius/card',
      bottomRightRadius: 'radius/card', paddingLeft: 'space/md' },
  })]));
  assert.match(out.code, /bg-\[var\(--Brand-600,#3d3bd9\)\]/);
  for (const line of ['--Brand-600: #3d3bd9; /* Brand/600 */', '--radius-card: 12px; /* radius/card */', '--space-md: 16px; /* space/md */',
    '--color-brand-600: var(--Brand-600);', '--radius-radius-card: var(--radius-card);', '--spacing-space-md: var(--space-md);']) {
    assert.ok(out.css.includes(`  ${line}\n`), line);
  }
  assert.ok(out.css.indexOf(':root {') < out.css.indexOf('@theme inline {'));
  assert.equal(gen(frame([])).css, '');
  assert.deepEqual(usedVariables('shadow-[0px_2px_var(--s-1,rgba(0,0,0,0.25))]').map((v) => [v.name, v.value, v.kind]), [['s-1', 'rgba(0,0,0,0.25)', 'color']]);
  assert.equal(tokensCss('text-[length:var(--size,14px)]').includes('--text-size: var(--size);'), true);
});

test('phone frames are screens: they fill the viewport, stretch their sections and pin fixed layers', () => {
  const phone = {
    id: '11:1', name: 'Home', type: 'FRAME', x: 0, y: 0, width: 390, height: 844, numberOfFixedChildren: 1,
    children: [
      box('11:2', { name: 'Hero', width: 358, x: 16, y: 100, height: 200, constraints: { horizontal: 'MIN', vertical: 'MIN' } }),
      box('11:3', { name: 'Badge', width: 40, x: 300, y: 320, constraints: { horizontal: 'MIN', vertical: 'MIN' } }),
      {
        ...box('11:4', { name: 'List', width: 390, x: 0, y: 340, height: 300, layoutMode: 'VERTICAL', paddingLeft: 16, paddingRight: 16 }),
        children: [
          box('11:5', { name: 'Row', width: 340, height: 40, layoutSizingHorizontal: 'FIXED', layoutMode: 'HORIZONTAL', children: [
            { ...text('Long label', { id: '11:6', textAutoResize: 'HEIGHT', width: 200 }), layoutSizingHorizontal: 'FIXED' },
            box('11:7', { width: 40, layoutSizingHorizontal: 'FIXED' }),
          ] }),
        ],
      },
      box('11:8', { name: 'Tab Bar', width: 390, x: 0, y: 760, height: 84, constraints: { horizontal: 'STRETCH', vertical: 'MAX' } }),
    ],
  };
  const out = gen(phone);
  assert.equal(out.screen, true);
  assert.equal(out.scrolls, false);
  assert.match(out.code, /className="relative w-full max-w-\[480px\] mx-auto min-h-\[max\(100dvh,\d+(\.\d+)?px\)\] antialiased" data-name="Home"/);
  assert.match(out.code, /absolute left-4 right-4 top-\[100px\] h-\[200px\]" data-name="Hero"/, 'a centred section stretches');
  assert.match(out.code, /absolute left-\[300px\] w-10 top-80 h-5" data-name="Badge"/);
  assert.match(out.code, /relative shrink-0 w-full max-w-\[340px\] h-10[^"]*" data-name="Row"/, 'a fixed width may shrink to the column');
  assert.match(out.code, /relative min-w-0 w-\[200px\][^"]*" data-name="T"/, 'text in a row that fits may shrink');
  assert.match(out.code, /<div className="fixed inset-x-0 top-0 z-10 mx-auto w-full max-w-\[480px\] h-dvh pointer-events-none \[&>\*\]:pointer-events-auto">\n\s+<nav className="absolute left-0 right-0 bottom-0 h-\[84px\]"/);
  // Rows wider than their room scroll sideways on a phone.
  const card = (id) => box(id, { width: 150, height: 80, layoutSizingHorizontal: 'FIXED' });
  const rows = gen({ ...phone, numberOfFixedChildren: 0, children: [{
    ...box('11:9', { name: 'Offers', width: 390, height: 200, layoutMode: 'VERTICAL' }),
    children: [
      { ...box('11:10', { name: 'Cards', width: 470, height: 80, layoutMode: 'HORIZONTAL', itemSpacing: 10, layoutSizingHorizontal: 'HUG' }), children: [card('11:11'), card('11:12'), card('11:13')] },
      { ...box('11:14', { name: 'Chips', width: 300, height: 40, layoutMode: 'HORIZONTAL', itemSpacing: 10, layoutSizingHorizontal: 'FILL' }), children: [card('11:15'), card('11:16')] },
      { ...box('11:17', { name: 'Wide chips', x: 40, width: 300, height: 40, layoutMode: 'HORIZONTAL', itemSpacing: 10, layoutSizingHorizontal: 'FILL' }), children: [card('11:18'), card('11:19'), card('11:20')] },
    ],
  }] });
  assert.match(rows.code, /max-w-full overflow-x-auto overflow-y-hidden \[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden" data-name="Cards"/);
  // Content that overflows its row but ends inside the screen shows as designed, and scrolls only where it would be cut.
  assert.match(rows.code, / max-\[310px\]:overflow-x-auto max-\[310px\]:overflow-y-hidden \[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden" data-name="Chips"/);
  assert.match(rows.code, /[^:]overflow-x-auto overflow-y-hidden \[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden" data-name="Wide chips"/);
  assert.equal(rows.warnings.length, 3);
  assert.doesNotMatch(code({ ...phone, width: 1440, height: 1024, children: phone.children.slice(2, 3) }), /overflow-x-auto/, 'only phones scroll rows');
  // screen: false turns the mode off; desktop frames are web pages.
  assert.match(code({ ...phone, width: 1440, height: 1024 }), /className="relative w-full min-w-\[1440px\] h-\[1024px\] antialiased"/);
  assert.match(code(phone, { screen: false }), /className="relative w-\[390px\] h-\[844px\] antialiased"/);
});

test('assets are named after their layers in the asset folder', () => {
  const icon = (id, name) => ({ ...box(id, { name }), type: 'VECTOR', svg: `<svg id="${id}"/>` });
  const files = { ...assets, svg: (svg) => `/disk/${svg.length}${svg.includes('12:3') ? 'b' : 'a'}.svg` };
  const out = toReactTailwind(frame([icon('12:1', 'Arrow Right'), icon('12:2', 'Arrow Right'), icon('12:3', 'Vector 7'),
    box('12:4', { name: 'Hero photo', fills: [{ type: 'IMAGE', visible: true, imageHash: 'h1', scaleMode: 'FILL' }] })]), files, { assetDir: 'public/figma' });
  assert.match(out.code, /const imgArrowRight = "\/figma\/arrow-right.svg";/);
  assert.match(out.code, /const imgVector = "\/figma\/vector.svg";/);
  assert.match(out.code, /const imgHeroPhoto = "\/figma\/hero-photo.png";/);
  assert.deepEqual(Object.keys(out.files).sort(), ['public/figma/arrow-right.svg', 'public/figma/hero-photo.png', 'public/figma/vector.svg']);
  assert.deepEqual(out.files['public/figma/arrow-right.svg'], { url: '/figma/arrow-right.svg', source: '/disk/16a.svg' });
});

test('the project tells the Tailwind version, the public folder and a static site', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figmcp-react-'));
  const pkg = (deps) => fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ devDependencies: deps }));
  assert.equal(tailwindVersion(dir), null);
  pkg({ tailwindcss: '^3.4.17' });
  assert.equal(tailwindVersion(dir), 3);
  pkg({ tailwindcss: '^4.1.0', '@tailwindcss/vite': '^4.1.0' });
  assert.equal(tailwindVersion(dir), 4);
  assert.equal(reactAssetDir(dir), 'public/figma');
  pkg({ '@sveltejs/kit': '^2.0.0' });
  assert.equal(reactAssetDir(dir), 'static/figma');
  assert.equal(detectFramework({}, dir), 'react');
  assert.equal(detectFramework({ clientFrameworks: 'html' }, dir), 'html');
  assert.equal(detectFramework({ clientFrameworks: 'html,react' }, dir), 'react');
  fs.rmSync(path.join(dir, 'package.json'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html>');
  assert.equal(detectFramework({}, dir), 'html', 'a static site');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the render check runs module code and finds font weights in file names', () => {
  const script = pageScript([
    "import React from 'react';",
    "import logo from './logo.svg';",
    "export const x = 1;",
    'export default function Card() { return <img src={logo} />; }',
  ].join('\n'), { logo: '/tmp/logo.svg' });
  assert.match(script, /const logo = "file:\/\/\/tmp\/logo.svg";/);
  const hooks = pageScript([
    "import React, { useState, useEffect as useFx, type FC } from 'react';",
    "import type { ReactNode } from 'react';",
    'export default () => { const [n] = useState(0); useFx(() => {}); return <p>{n}</p>; };',
  ].join('\n'));
  assert.match(hooks, /^const \{ useState, useEffect: useFx \} = React;$/m);
  assert.doesNotMatch(hooks, /ReactNode|FC/);
  assert.match(hooks, /^const Design = \(\) =>/m);
  assert.match(script, /^function Design\(\)/m);
  assert.doesNotMatch(script, /^import /m);
  assert.deepEqual(faceOf('Plus Jakarta Sans', '/f/PlusJakartaSans-SemiBoldItalic.ttf'), { weight: '600', italic: true });
  assert.deepEqual(faceOf('Inter', '/f/Inter-Regular.ttf'), { weight: '400', italic: false });
  assert.deepEqual(faceOf('Onest', '/f/Onest-VariableFont_wght.ttf'), { weight: '100 900', italic: false });
  assert.deepEqual(faceOf('Inter', '/f/Inter-ExtraLight.ttf'), { weight: '200', italic: false });
});

test('text fields become inputs; button labels and headings do not', () => {
  const row = (name, characters, extra = {}) => ({
    ...box('13:1', { name, width: 300, height: 44, layoutMode: 'HORIZONTAL', ...extra }),
    children: [box('13:2', { name: 'Icon', width: 20, height: 20 }), { ...text(characters, { id: '13:3', width: 120 }), layoutSizingHorizontal: 'HUG' }],
  });
  const named = code(frame([row('Message Field', 'Message')]));
  assert.match(named, /<input className="relative flex-1 min-w-0 font-\['Inter',sans-serif\] font-normal text-\[16px\] leading-\[20px\] placeholder:text-black bg-transparent border-0 p-0 outline-none" data-name="T" data-node-id="13:3" type="text" placeholder="Message" \/>/);
  assert.match(code(frame([row('Frame 12', 'What are you looking for?')])), /<input [^>]*type="text" placeholder="What are you looking for\?"/);
  assert.match(code(frame([row('Frame 12', 'Search hotels')])), /\[appearance:none\][^>]*type="search" placeholder="Search hotels"/);
  for (const [name, characters] of [['Frame 12', 'Add to Cart'], ['Card', 'Need help?'], ['Primary button', 'Search flights']]) {
    assert.doesNotMatch(code(frame([row(name, characters)])), /<input/, characters);
  }
  // A trailing sibling keeps its place: the field keeps the text's width.
  const mid = row('Search bar', 'Search');
  mid.children.push(box('13:4', { name: 'Mic', width: 20, height: 20 }));
  assert.match(code(frame([mid])), /<input className="relative shrink-0 w-\[120px\]/);
  // Two texts are a form row, not a field.
  const two = row('Input', 'Email');
  two.children.push(text('Required', { id: '13:5' }));
  assert.doesNotMatch(code(frame([two])), /<input/);
});

test('names read by people lose Figma\'s paste and duplicate suffixes, and generated names are dropped', async () => {
  const { readableName } = await import('../src/codegen/semantics.js');
  const cases = {
    'Phone 1': 'Phone', 'Gimbel copy 1': 'Gimbel', 'Card copy': 'Card', 'iPhone 15': 'iPhone 15', 'Galaxy S23 1': 'Galaxy S23',
    'Screen (Replace Here)': 'Screen', 'MQE23ref_VW_34FR+watch-49-titanium-ultra_VW_34FR-removebg (1) 1': '', 'Image 2': '',
  };
  for (const [name, want] of Object.entries(cases)) assert.equal(readableName({ name }), want, name);
});

test('corpus findings: rounded text heights, rows over padding, picture roots', () => {
  // Scaled frames have fractional line heights; Figma rounds the hugging box up.
  const scaled = code(frame([text('Kochi', { height: 19 }, { lineHeight: { unit: 'PIXELS', value: 18.05 } })]));
  assert.match(scaled, /leading-\[18.05px\][^"]*min-h-\[19px\]/);
  assert.doesNotMatch(code(frame([text('Kochi')])), /min-h-/, 'whole-pixel line heights need nothing');
  // A row wider than its padded column but inside the screen stays as designed there.
  const cabin = {
    id: '14:1', name: 'Seats', type: 'FRAME', x: 0, y: 0, width: 390, height: 844, children: [{
      ...box('14:2', { name: 'Cabin', x: 45, width: 300, height: 400, layoutMode: 'VERTICAL', paddingLeft: 28, paddingRight: 28, counterAxisAlignItems: 'CENTER' }),
      children: [{ ...box('14:3', { name: 'Row', x: 63, width: 264, height: 34, layoutMode: 'HORIZONTAL', itemSpacing: 6, layoutSizingHorizontal: 'HUG' }),
        children: [box('14:4', { width: 129 }), box('14:5', { width: 129 })] }],
    }],
  };
  assert.match(code(cabin), /max-\[327px\]:max-w-full max-\[327px\]:overflow-x-auto[^"]*" data-name="Row"/);
  // A root shipped as one image is a picture, not a screen.
  const picture = { id: '15:1', name: 'Preview', type: 'FRAME', x: 0, y: 0, width: 390, height: 722, render: { base64: 'x' }, rasterized: 'rotation', children: [] };
  assert.match(code(picture), /className="relative w-\[390px\] h-\[722px\] antialiased"/);
});

test('three or more siblings that differ only in content become data and a .map()', () => {
  const tab = (id, label, width, active = false) => ({
    ...box(id, { name: label, width: 66, height: 60, layoutMode: 'VERTICAL', itemSpacing: 6, counterAxisAlignItems: 'CENTER' }),
    children: [{ ...box(`${id}a`, { name: 'Icon', width: 24, height: 24 }), type: 'VECTOR', svg: `<svg id="${id}"/>` },
      text(label, { id: `${id}b`, name: label, width }, active ? { fills: [solid({ r: 1, g: 0, b: 0, a: 1 })] } : {})],
  });
  const row = (kids) => frame(kids, { name: 'Tab bar', width: 360, height: 60, layoutMode: 'HORIZONTAL', primaryAxisAlignItems: 'SPACE_BETWEEN' });
  let n = 0;
  const files = { ...assets, svg: () => `/disk/${n++}.svg` };
  const out = toReactTailwind(row([tab('20:1', 'Home', 34, true), tab('20:2', 'Trips', 29), tab('20:3', 'Offers', 37), tab('20:4', 'Account', 52)]), files).code;
  assert.match(out, /^const tabBarItems = \[\n {2}\{ name: "Trips", id: "20:2", id2: "20:2a", image: imgIcon2, minW: "min-w-\[29px\]", id3: "20:2b" \},/m);
  assert.match(out, /\{tabBarItems\.map\(\(item\) => \(\n\s+<div key=\{item\.id\} className="[^"]*" data-name=\{item\.name\} data-node-id=\{item\.id\}>/);
  assert.match(out, /<p className=\{`relative shrink-0 \$\{item\.minW\} whitespace-nowrap[^`]*`\} data-name=\{item\.name\} data-node-id=\{item\.id3\}>\n\s+\{item\.name\}/);
  assert.match(out, /data-name="Home" data-node-id="20:1"/, 'the active tab differs in style and stays as it is');
  // Two alike are not a run; repeats: false writes every item.
  assert.doesNotMatch(code(row([tab('20:2', 'Trips', 29), tab('20:3', 'Offers', 37)])), /\.map\(/);
  assert.doesNotMatch(toReactTailwind(row([tab('20:2', 'Trips', 29), tab('20:3', 'Offers', 37), tab('20:4', 'Account', 52)]), files, { repeats: false }).code, /\.map\(/);
});

test('Figma text styles used more than once are named class lists', () => {
  const styled = (id, characters, color) => text(characters, { id, name: characters },
    { fontName: { family: 'Rubik', style: 'Medium' }, textStyle: 'App/Caption Strong', fills: [solid(color)] });
  const out = code(frame([styled('16:1', 'One', black), styled('16:2', 'Two', { r: 1, g: 0, b: 0, a: 1 }),
    text('Solo', { id: '16:3' }, { textStyle: 'App/Body' })], { layoutMode: 'VERTICAL' }));
  assert.match(out, /^const textStyles = \{\n {2}\/\/ App\/Caption Strong\n {2}captionStrong: "font-\['Rubik',sans-serif\] font-medium text-\[16px\] leading-\[20px\]",\n\};/m);
  assert.match(out, /<p className=\{`\$\{textStyles\.captionStrong\} relative shrink-0 min-w-\[100px\] whitespace-nowrap text-black`\}/);
  assert.match(out, /text-\[#ff0000\]`\}/, 'each keeps its own colour');
  assert.doesNotMatch(out, /textStyles\.body/, 'a style used once stays inline');
  assert.doesNotMatch(code(frame([styled('16:1', 'One', black), styled('16:2', 'Two', black)]), { textStyles: false }), /textStyles/);
});

test('HTML + Tailwind is the same markup as a static page', () => {
  const data = JSON.parse(fs.readFileSync(new URL('./fixtures/sample-export.json', import.meta.url)));
  const files = { svg: () => '/disk/a.svg', image: () => '/disk/p.png' };
  const out = toHtmlTailwind(data.frames[0].tree, files, { assetDir: 'assets/figma' });
  assert.match(out.code, /^<!-- SampleScreen -->\n<div class="relative w-\[200px\] h-\[120px\] antialiased flex flex-col gap-2[^"]*" data-name="Sample Screen" data-node-id="10:1">/);
  assert.match(out.code, /<p class="[^"]*" data-name="Title" data-node-id="10:2">Hello \{you\}<\/p>/, 'text sits inline, unescaped braces');
  assert.match(out.code, /<img alt="" class="block max-w-none size-full" src="assets\/figma\/arrow.svg">/);
  assert.match(out.code, /<div aria-hidden="true" class="[^"]*"><\/div>/, 'no self-closing divs');
  assert.doesNotMatch(out.code, /className|\{img|\.map\(|textStyles/);
  assert.deepEqual(out.files['assets/figma/photo.png'], { url: 'assets/figma/photo.png', source: '/disk/p.png' });
  // Line breaks, entities and styles.
  const lines = toHtmlTailwind(frame([text('A & B\nC <d>', { textAutoResize: 'HEIGHT' }),
    box('17:1', { strokeWeight: 2, strokes: [{ type: 'GRADIENT_LINEAR', visible: true, gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [{ position: 0, color: black }, { position: 1, color: black }] }] })]), assets).code;
  assert.match(lines, />A &amp; B\nC &lt;d&gt;<\/p>/);
  assert.match(lines, /style="padding: 2px; background: linear-gradient\(90deg,#000000 0%,#000000 100%\); -webkit-mask: [^"]+; -webkit-mask-composite: xor; mask-composite: exclude"/);
});

test('desktop frames are web pages: full-width sections stretch, the rest stays in a centred column', () => {
  const page = {
    id: '18:1', name: 'Landing', type: 'FRAME', x: 0, y: 0, width: 1440, height: 900, clipsContent: true,
    children: [
      { ...box('18:2', { name: 'Hero', x: 0, y: 0, width: 1440, height: 400, type: 'GROUP' }), children: [
        { ...box('18:3', { name: 'Backdrop', x: 0, y: 0, width: 1440, height: 400 }), type: 'VECTOR', svg: '<svg width="1440"/>' },
        text('Headline', { id: '18:4', x: 120, y: 80 }),
      ] },
      { ...box('18:5', { name: 'Nav', x: 0, y: 400, width: 1440, height: 60, layoutMode: 'HORIZONTAL', paddingLeft: 120, paddingRight: 120 }), children: [] },
      box('18:6', { name: 'Card', x: 120, y: 500, width: 300, height: 200, constraints: { horizontal: 'SCALE', vertical: 'MIN' } }),
      box('18:7', { name: 'Off canvas', x: -200, y: 100, width: 50, height: 50 }),
    ],
  };
  let svg = '';
  const out = toReactTailwind(page, { ...assets, svg: (s) => { svg = s; return '/disk/a.svg'; } });
  assert.equal(out.page, true);
  assert.match(out.code, /className="relative w-full min-w-\[1440px\] h-\[900px\] antialiased overflow-clip" data-name="Landing"/);
  assert.match(out.code, /className="absolute left-0 right-0 top-0 h-\[400px\]" data-name="Hero"/);
  assert.match(out.code, /className="absolute left-0 right-0 top-0 h-\[400px\]" data-name="Backdrop"/, 'a layer spanning a stretched section stretches');
  assert.match(svg, /^<svg preserveAspectRatio="none" width="1440"\/>/, 'and its vector fills the box');
  assert.match(out.code, /left-\[calc\(50%-600px\)\] top-20[^"]*" data-name="T"/, 'the rest keeps its place in the centred column');
  assert.match(out.code, /pl-\[max\(120px,calc\(50%-600px\)\)\] pr-\[max\(120px,calc\(50%-600px\)\)\][^"]*" data-name="Nav"/);
  assert.match(out.code, /left-\[calc\(50%-600px\)\] w-\[300px\][^"]*" data-name="Card"/, 'scale constraints join the column too');
  assert.doesNotMatch(out.code, /Off canvas/, 'a layer outside a clipping page never shows');
  assert.match(code(page, { page: false }), /className="relative w-\[1440px\] h-\[900px\] antialiased overflow-clip"/);
});

test('apps keep their layout fluid; colliding variable names and failed runs are handled', () => {
  const shell = {
    id: '19:1', name: 'Dashboard', type: 'FRAME', x: 0, y: 0, width: 1440, height: 900, children: [
      { ...box('19:2', { name: 'Top bar', x: 0, y: 0, width: 1440, height: 64 }), children: [text('Acme', { id: '19:3', x: 24, y: 20 })] },
      box('19:4', { name: 'Sidebar', x: 0, y: 64, width: 240, height: 836 }),
      { ...box('19:5', { name: 'Main', x: 240, y: 64, width: 1200, height: 836 }), children: [box('19:6', { name: 'Card', x: 272, y: 96, width: 360, height: 200 })] },
    ],
  };
  const app = code(shell);
  assert.match(app, /className="absolute left-6 top-5[^"]*" data-name="T"/, 'an app bar keeps its title on the left');
  assert.match(app, /className="absolute left-0 w-60 top-16[^"]*" data-name="Sidebar"/);
  assert.match(app, /className="absolute left-60 right-0 top-16[^"]*" data-name="Main"/, 'the main area fills the rest');

  const out = gen(frame([box('19:7', { fills: [solid()], vars: { 'fill.0': 'ink/500' } }), box('19:8', { fills: [solid()], vars: { 'fill.0': 'ink-500' } })]));
  assert.match(out.code, /var\(--ink-500,#000000\)/);
  assert.match(out.code, /var\(--ink-500-2,#000000\)/);
  assert.match(out.css, /--ink-500: #000000;/);
  assert.match(out.css, /--ink-500-2: #000000; \/\* ink\/500 \*\//);

  const tab = (id) => ({ ...box(id, { name: 'Tab' }), children: [text('Go', { id: `${id}t` })] });
  const broken = { ...box('19:9', { name: 'Broken', layoutMode: 'HORIZONTAL' }), children: [tab('19:10'), tab('19:11'), tab('19:12'), { id: '19:13', type: 'FRAME', error: 'boom' }] };
  // A failed sibling is a placeholder; the run beside it stays, declared once and used.
  const failed = gen(frame([broken])).code;
  assert.equal((failed.match(/^const brokenItems = \[/gm) || []).length, 1);
  assert.match(failed, /\{brokenItems\.map\(/);
  assert.match(failed, /data-error="the plugin could not read this layer \(boom\)"/);
});

test('corpus findings, second round: font axes, empty texts, baseline rows, hugging columns', () => {
  const axes = code(frame([text('Get paid', {}, { fontName: { family: 'Bricolage Grotesque', style: 'Bold', variationSettings: { opsz: 14, wdth: 100, wght: 700 } } })]));
  assert.doesNotMatch(axes, /font-variation/, 'optical size follows the font size, as Figma draws it');
  assert.match(code(frame([text('Narrow', {}, { fontName: { family: 'Roboto Flex', style: 'Bold', variationSettings: { opsz: 14, wdth: 80, wght: 700 } } })])),
    /\[font-variation-settings:'wdth'_80\]/);
  assert.doesNotMatch(code(frame([text('Hi', {}, { fontName: { family: 'Inter', style: 'Bold', variationSettings: { wght: 700 } } })])), /font-variation/);

  assert.match(code(frame([text('', { height: 16 })])), /h-4[^"]*" data-name="T"/, 'an empty text keeps its line');
  const wrapped = text('A long title that wraps', { textAutoResize: 'HEIGHT', height: 60 }, { lineHeight: { unit: 'PIXELS', value: 30 } });
  assert.match(code(frame([wrapped], { layoutMode: 'VERTICAL' })), /min-h-\[60px\]/, 'wrapped text in a layout keeps the height Figma gives it');
  assert.doesNotMatch(code(frame([wrapped])), /min-h-/, 'a positioned text moves nothing');

  const priceRow = frame([text('AED 3,899', { id: '20:2', y: 0, height: 28 }), { ...box('20:3', { name: 'Save', y: 8, height: 20 }) }],
    { layoutMode: 'HORIZONTAL', counterAxisAlignItems: 'BASELINE', height: 28 });
  const baseline = code(priceRow);
  assert.match(baseline, /className="[^"]*flex justify-start items-start[^"]*" data-name="Root"/);
  assert.match(baseline, /mt-2[^"]*" data-name="Save"/, 'each child sits where Figma has it');
  assert.match(baseline, /data-name="Root" data-node-id="1:1" data-align="baseline"/, 'the design\'s alignment is named');
  const wrapRow = code({ ...priceRow, layoutWrap: 'WRAP', children: [...priceRow.children, { ...box('20:4', { name: 'Tag', y: 36, height: 20 }) }] });
  assert.match(wrapRow, /items-baseline/, 'a wrapping row keeps baseline alignment');
  assert.doesNotMatch(wrapRow, /mt-|data-align/);
  assert.deepEqual(gen(frame([text('Get paid', {}, { fontName: { family: 'Bricolage Grotesque', style: 'Bold', variationSettings: { opsz: 14, wdth: 100, wght: 700 } } })])).fontAxes,
    { 'Bricolage Grotesque': ['opsz auto'] });

  const phone = (column) => ({ id: '21:1', name: 'Screen', type: 'FRAME', x: 0, y: 0, width: 390, height: 844, children: [{
    ...box('21:2', { name: 'Week', layoutMode: 'HORIZONTAL', width: 134, height: 42, x: 100, y: 100, layoutSizingHorizontal: 'HUG' }),
    children: [{ ...box('21:3', { name: 'Day', layoutMode: 'VERTICAL', width: 22, height: 42, x: 100, y: 100, ...column }), children: [box('21:4', { name: 'Dot', x: 100, y: 100, width: 22, height: 22, layoutSizingHorizontal: 'FIXED' })] }],
  }] });
  assert.match(code(phone({ layoutSizingHorizontal: 'HUG' })), /relative shrink-0 w-\[22px\] h-\[22px\]" data-name="Dot"/, 'no w-full in a column that hugs its children');
  assert.match(code(phone({ layoutSizingHorizontal: 'FIXED' })), /w-full max-w-\[22px\][^"]*" data-name="Dot"/);
  assert.match(code(phone({ layoutSizingHorizontal: 'FIXED', strokeWeight: 1, strokes: [solid()], strokesIncludedInLayout: true })),
    /w-\[22px\][^"]*" data-name="Dot"/, 'a border in the layout leaves less room');

  const stale = gen(frame([box('22:1', { fills: [solid()], vars: { 'fill.0': 'bg/page' } }),
    box('22:2', { fills: [solid({ r: 0.96, g: 0.96, b: 0.96, a: 1 })], vars: { 'fill.0': 'bg/page' } }),
    box('22:3', { fills: [solid({ r: 0.96, g: 0.96, b: 0.96, a: 1 })], vars: { 'fill.0': 'bg/page' } })]));
  assert.match(stale.css, /--bg-page: #f5f5f5; \/\* bg\/page \*\/\n  --bg-page-2: #000000; \/\* bg\/page; another value/, 'each value has a CSS name');
  assert.match(stale.css, /--color-bg-page: var\(--bg-page\);/, 'the utility takes the value most of the frame uses');
  assert.match(stale.code, /bg-\[var\(--bg-page-2,#000000\)\][^"]*" data-name="22:1"|var\(--bg-page-2,#000000\)/);
});

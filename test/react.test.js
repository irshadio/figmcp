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
import { isReactNative, reactAssetDir, tailwindVersion } from '../src/project.js';
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
  assert.match(out.code, /bg-\[var\(--Brand\\\/600,#3d3bd9\)\]/);
  for (const line of ['--Brand\\/600: #3d3bd9;', '--radius\\/card: 12px;', '--space\\/md: 16px;',
    '--color-brand-600: var(--Brand\\/600);', '--radius-radius-card: var(--radius\\/card);', '--spacing-space-md: var(--space\\/md);']) {
    assert.ok(out.css.includes(`  ${line}\n`), line);
  }
  assert.ok(out.css.indexOf(':root {') < out.css.indexOf('@theme inline {'));
  assert.equal(gen(frame([])).css, '');
  assert.deepEqual(usedVariables('shadow-[0px_2px_var(--s\\/1,rgba(0,0,0,0.25))]').map((v) => [v.name, v.value, v.kind]), [['s/1', 'rgba(0,0,0,0.25)', 'color']]);
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
  assert.match(out.code, /className="relative w-full max-w-\[480px\] mx-auto min-h-\[max\(100dvh,\d+(\.\d+)?px\)\]" data-name="Home"/);
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
    ],
  }] });
  assert.match(rows.code, /max-w-full overflow-x-auto overflow-y-hidden \[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden" data-name="Cards"/);
  assert.match(rows.code, /[^-]overflow-x-auto overflow-y-hidden \[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden" data-name="Chips"/);
  assert.equal(rows.warnings.length, 2);
  assert.doesNotMatch(code({ ...phone, width: 1440, height: 1024, children: phone.children.slice(2, 3) }), /overflow-x-auto/, 'only phones scroll rows');
  // Desktop frames keep their size; screen: false turns the mode off.
  assert.match(code({ ...phone, width: 1440, height: 1024 }), /className="relative w-\[1440px\] h-\[1024px\]"/);
  assert.match(code(phone, { screen: false }), /className="relative w-\[390px\] h-\[844px\]"/);
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

test('the project tells the Tailwind version, the public folder and React Native', () => {
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
  assert.equal(isReactNative({}, dir), false);
  assert.equal(isReactNative({ clientFrameworks: 'react-native' }, dir), true);
  pkg({ expo: '^52.0.0' });
  assert.equal(isReactNative({}, dir), true);
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

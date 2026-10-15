// Generated SwiftUI must compile: designs that once produced code the Swift
// compiler rejects, type checked with swiftc when Xcode is installed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { toSwiftUI } from '../src/codegen/swiftui/index.js';
import { SWIFT_TYPE_NAMES } from '../src/codegen/swiftui/swift.js';

const assets = { svg: () => '/tmp/icon.svg', image: (h) => `/tmp/${h}.png`, imageExt: () => 'png', render: () => '/tmp/r.png' };
const ink = { r: 0.43, g: 0.44, b: 0.57, a: 1 };
const brand = { r: 0.24, g: 0.23, b: 0.85, a: 1 };
const white = { r: 1, g: 1, b: 1, a: 1 };
const solid = (color, opacity) => ({ type: 'SOLID', visible: true, color, ...(opacity !== undefined ? { opacity } : {}) });
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill="#6E7191" d="M2 2h16v16H2z"/></svg>';
let nextId = 100;
const id = () => `1:${nextId++}`;

function text(characters, { size = 13, x = 0, y = 0, w = 60, color = ink, ...rest } = {}) {
  return {
    id: id(), name: characters, type: 'TEXT', x, y, width: w, height: Math.round(size * 1.4), characters,
    textAutoResize: 'WIDTH_AND_HEIGHT', layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG',
    segments: [{ characters, fontSize: size, fontName: { family: 'Inter', style: 'Regular' }, fontWeight: 400,
      lineHeight: { unit: 'PIXELS', value: Math.round(size * 1.4) }, fills: [solid(color)] }],
    ...rest,
  };
}

function frame(name, { x = 0, y = 0, w, h, mode = null, children = [], ...rest }) {
  return { id: id(), name, type: 'FRAME', x, y, width: w, height: h, layoutMode: mode, children,
    primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'CENTER', ...rest };
}

function column(name, children, { w = 360, h = 400, ...rest } = {}) {
  return frame(name, { w, h, mode: 'VERTICAL', itemSpacing: 12, layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', children, ...rest });
}

function button(label, { name = 'Button', y = 0 } = {}) {
  return { ...frame(name, { y, w: 326, h: 52, mode: 'HORIZONTAL', paddingLeft: 24, paddingRight: 24, primaryAxisAlignItems: 'CENTER',
    cornerRadius: 14, fills: [solid(brand)], layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED',
    children: [text(label, { size: 16, w: 110, color: white })] }), type: 'INSTANCE' };
}

function chip(label, x, selected, style = 'stroke') {
  const on = style === 'stroke' ? { fills: [solid(brand)], strokes: [] } : { fills: [solid(brand)], strokes: [] };
  const off = style === 'stroke' ? { fills: [], strokes: [solid(ink)] } : { fills: [solid(brand, 0.4)], strokes: [] };
  return { ...frame(label, { x, w: 80, h: 36, mode: 'HORIZONTAL', paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
    layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG', cornerRadius: 999, strokeWeight: 1, ...(selected ? on : off),
    children: [text(label, { x: x + 12, y: 8, color: selected ? white : ink })] }), type: 'INSTANCE', name: 'Chip' };
}

function chips(name, labels, selected, style) {
  return frame(name, { w: 326, h: 36, mode: 'HORIZONTAL', itemSpacing: 6, layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG',
    children: labels.map((l, i) => chip(l, i * 86, i === selected, style)) });
}

function field(name, placeholder, y = 0) {
  return frame(name, { y, w: 340, h: 48, mode: 'HORIZONTAL', paddingLeft: 12, paddingRight: 12, cornerRadius: 8,
    strokes: [solid(ink)], strokeWeight: 1, layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED',
    children: [text(placeholder, { y: y + 14 })] });
}

const xcrun = spawnSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' });
const sdk = xcrun.status === 0 ? xcrun.stdout.trim() : null;
const skip = sdk ? false : 'xcrun is not available';

/** One DesignSystem.swift for [results]: each shared block once, as a project merges them. */
function mergedShared(results) {
  const blocks = [];
  for (const r of results) {
    for (const block of (r.shared || '').split(/\n\n(?=\S)/)) {
      const b = block.trim();
      if (b && b !== 'import SwiftUI' && !blocks.includes(b)) blocks.push(b);
    }
  }
  return blocks.length ? `import SwiftUI\n\n${blocks.join('\n\n')}\n` : null;
}

/** Type checks [results] together, as files of one module; the compiler's errors. */
function typecheck(results) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figmcp-typecheck-'));
  try {
    const files = results.map((r, i) => {
      const file = path.join(dir, `${r.structName}${i}.swift`);
      // Previews need Xcode's macro plugin, which swiftc alone lacks.
      fs.writeFileSync(file, r.code.replace(/\n#Preview \{[\s\S]*?\n\}\n/, '\n'));
      return file;
    });
    const shared = mergedShared(results);
    if (shared) {
      files.push(path.join(dir, 'DesignSystem.swift'));
      fs.writeFileSync(files[files.length - 1], shared);
    }
    const r = spawnSync('xcrun', ['--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-target', 'arm64-apple-ios17.0-simulator',
      '-sdk', sdk, '-parse-as-library', ...files], { encoding: 'utf8', timeout: 180000 });
    return r.status === 0 ? '' : (r.stderr || r.error?.message || 'swiftc failed').split('\n').filter((l) => /error:/.test(l)).join('\n') || r.stderr;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const generate = (root, options = {}) => toSwiftUI(root, assets, { preview: false, screen: false, ...options });

test('a selected chip drawn with another modifier compiles as two branches', { skip }, () => {
  const r = generate(column('Filters', [chips('Fares', ['Regular', 'Student', 'Senior'], 0)], { h: 100 }));
  assert.match(r.code, /if isSelected \{/);
  assert.doesNotMatch(r.code, /isSelected \? \.background|isSelected \? \.fill/);
  assert.equal(typecheck([r]), '');
});

test('values of one type merge into a ternary; the given item is the selected one', { skip }, () => {
  const r = generate(column('Filters', [chips('Fares', ['Regular', 'Student', 'Senior'], 2, 'fill')], { h: 100 }));
  assert.match(r.code, /\.fill\(isSelected \? Color\(hex: 0x3D3BD9\) : Color\(hex: 0x3D3BD9, opacity: 0\.4\)\)/);
  assert.match(r.code, /@State private var selectedChip = 2/);
  assert.equal(typecheck([r]), '');
});

test('two items drawn two ways without a control role are drawn one by one', { skip }, () => {
  const plan = (title, price, highlighted) => frame('Plan', { w: 160, h: 80, mode: 'VERTICAL', layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED',
    fills: [solid(highlighted ? brand : white)], children: [text(title), text(price)] });
  const r = generate(column('Plans', [frame('Options', { w: 330, h: 80, mode: 'HORIZONTAL', itemSpacing: 10,
    layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG', children: [plan('Basic', '$9 a month', false), plan('Pro', '$90 a year', true)] })]));
  assert.doesNotMatch(r.code, /isSelected/);
  assert.match(r.code, /Text\("\$9 a month"\)/);
  assert.match(r.code, /Text\("\$90 a year"\)/);
  assert.equal(typecheck([r]), '');
});

test('a screen named like a SwiftUI type is renamed', { skip }, () => {
  for (const name of ['Text', 'Color', 'Button', 'Image', 'Self', 'Type', 'View', 'Action']) {
    const r = generate(frame(name, { w: 200, h: 100, fills: [solid(white)], children: [text('Hi', { x: 1, y: 1 })] }));
    assert.ok(!SWIFT_TYPE_NAMES.has(r.structName), `${name} -> ${r.structName}`);
    assert.equal(typecheck([r]), '', name);
  }
});

test('runs named like SwiftUI or generated types compile', { skip }, () => {
  const r = generate(column('Home', [
    field('Text field', 'Enter name', 0), field('Text field', 'Enter email', 60),
    button('Pay', { name: 'Home action' }), button('Send', { name: 'Home action' }),
    frame('Scroll view', { w: 300, h: 40, mode: 'HORIZONTAL', layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG',
      children: [frame('Flow layout', { w: 100, h: 40, mode: 'HORIZONTAL', children: [text('A')] }), frame('Flow layout', { w: 100, h: 40, mode: 'HORIZONTAL', children: [text('B')] })] }),
  ], { h: 600 }));
  // The screen and its own Action enum aside, no declared type takes a name the code uses.
  for (const m of r.code.matchAll(/^\s*(struct|enum) (\w+)/gm)) {
    if (m[2] !== r.structName && `${m[1]} ${m[2]}` !== 'enum Action') assert.ok(!SWIFT_TYPE_NAMES.has(m[2]), `declares ${m[2]}`);
  }
  assert.equal(typecheck([r]), '');
});

test('two screens with runs of the same name compile in one module', { skip }, () => {
  const a = generate(column('Home', [chips('Fares', ['Regular', 'Student', 'Senior'], 0)], { h: 100 }));
  const b = generate(column('Search', [chips('Fares', ['Adult', 'Child', 'Infant'], 1)], { h: 100 }));
  assert.equal(typecheck([a, b]), '');
});

test('sections named like the screen\'s own members compile', { skip }, () => {
  const section = (name) => frame(name, { w: 360, h: 300, mode: 'VERTICAL', layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG',
    children: Array.from({ length: 10 }, (_, i) => text(`Line ${'abcdefghij'[i]} unique ${i}`, { y: i * 20 })) });
  for (const name of ['Action', 'Dismiss', 'Open URL', 'Dynamic type size', 'Icon size 20', 'Body']) {
    const r = generate(column('Screen', [section(name), button('Go')], { h: 500 }), { actions: {} });
    assert.equal(typecheck([r]), '', name);
  }
});

test('text of many styled runs type checks in reasonable time', { skip }, () => {
  const segs = Array.from({ length: 14 }, (_, i) => ({ characters: `run ${i} `, fontSize: 13,
    fontName: { family: 'Inter', style: i % 2 ? 'Bold' : 'Regular' }, fontWeight: i % 2 ? 700 : 400,
    fills: [solid({ r: i % 2 ? 0.2 : 0, g: 0, b: 0, a: 1 })], ...(i % 3 === 0 ? { textDecoration: 'UNDERLINE' } : {}) }));
  const body = { ...text(segs.map((s) => s.characters).join(''), { w: 300 }), textAutoResize: 'HEIGHT', layoutSizingHorizontal: 'FIXED', segments: segs };
  const r = generate(column('Card', [body], { w: 300, h: 80 }));
  assert.doesNotMatch(r.code, /\) \+ Text\(/);
  assert.equal(typecheck([r]), '');
});

test('a screen that falls back to its design size keeps no screen-only names', { skip }, () => {
  const icon = { id: id(), name: 'Star', type: 'FRAME', x: 20, y: 200, width: 20, height: 20, svg: ICON, fills: [], children: [] };
  const header = frame('Header', { y: 0, w: 390, h: 60, mode: 'HORIZONTAL', layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED',
    fills: [{ type: 'SOLID', visible: true }], children: [text('Title', { y: 20 })] });
  const r = toSwiftUI(frame('Home', { w: 390, h: 844, fills: [solid(white)], children: [header, icon, text('Body', { y: 300 })] }), assets, { preview: false });
  assert.equal(typecheck([r]), '');
});

test('a pattern of SVGs with an XML header does not stop the generation', { skip }, () => {
  const vec = (i) => ({ id: id(), name: 'Vector', type: 'VECTOR', x: (i % 4) * 30, y: Math.floor(i / 4) * 30, width: 10, height: 10,
    svg: '<?xml version="1.0"?>\n<svg width="10" height="10"><path d="M0 0h10v10z" fill="#000000"/></svg>' });
  const r = generate(frame('Wallpaper', { w: 400, h: 400, children: Array.from({ length: 12 }, (_, i) => vec(i)) }));
  assert.equal(typecheck([r]), '');
});

test('items with equal values keep their own identity', { skip }, () => {
  const row = (t, y) => frame('Option', { y, w: 340, h: 40, mode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', children: [text(t, { y })] });
  const r = generate(column('Sizes', [row('Small', 0), row('Large', 40), row('Small', 80)]));
  assert.doesNotMatch(r.code, /ForEach\(\w+, id: \\\.self\)/);
  assert.equal(typecheck([r]), '');
});

test('text inputs in a run each stay a text field', { skip }, () => {
  const r = generate(column('Form', [field('Text field', 'Enter name', 0), field('Text field', 'Enter email', 60), field('Text field', 'Enter phone', 120)]));
  assert.equal((r.code.match(/TextField\(/g) || []).length, 3);
  assert.equal(typecheck([r]), '');
});

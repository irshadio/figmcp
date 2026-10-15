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
  // The screen and its own Action and Field enums aside, no declared type takes a name the code uses.
  for (const m of r.code.matchAll(/^\s*(struct|enum) (\w+)/gm)) {
    if (m[2] !== r.structName && !['enum Action', 'enum Field'].includes(`${m[1]} ${m[2]}`)) assert.ok(!SWIFT_TYPE_NAMES.has(m[2]), `declares ${m[2]}`);
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

test('text names its face by PostScript name and sets explicit line heights on the device', { skip }, () => {
  const tight = { ...text('Welcome to the app', { size: 32, w: 200 }), textAutoResize: 'HEIGHT', layoutSizingHorizontal: 'FIXED' };
  tight.segments = [{ ...tight.segments[0], fontName: { family: 'Onest', style: 'Semi Bold' }, lineHeight: { unit: 'PIXELS', value: 34 } }];
  const auto = text('Caption');
  auto.segments = [{ ...auto.segments[0], lineHeight: { unit: 'AUTO' } }];
  const r = generate(column('Card', [tight, auto], { h: 120 }));
  assert.match(r.code, /\.custom\("Onest-SemiBold", size: 32, relativeTo: \.largeTitle\)/);
  assert.doesNotMatch(r.code, /\.weight\(/);
  assert.match(r.code, /\.designLineHeight\(34, font: "Onest-SemiBold", size: 32, relativeTo: \.largeTitle\)/);
  assert.equal((r.code.match(/designLineHeight/g) || []).length, 1);
  assert.match(r.shared, /struct DesignLineHeight: ViewModifier/);
  assert.equal(typecheck([r]), '');
});

test('min and max sizes bound layers sized by their content or parent', { skip }, () => {
  const bubble = frame('Bubble', { w: 200, h: 40, mode: 'VERTICAL', layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG', maxWidth: 280, minWidth: 80,
    children: [text('Hello there')] });
  const r = generate(column('Chat', [bubble]));
  assert.match(r.code, /\.frame\(minWidth: 80, maxWidth: 280\)/);
  assert.equal(typecheck([r]), '');
});

test('a fixed child of a hugging column keeps its width', () => {
  const body = { ...text('Hi Rahul, welcome to support! How can we help?', { w: 270 }), textAutoResize: 'HEIGHT', layoutSizingHorizontal: 'FIXED' };
  const bubble = frame('Bubble', { w: 287, h: 60, mode: 'VERTICAL', paddingLeft: 9, paddingRight: 8, layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG',
    children: [body] });
  const r = generate(column('Chat', [bubble]));
  assert.match(r.code, /\.frame\(width: 270(, alignment: \.leading)?\)/);
  assert.doesNotMatch(r.code, /maxWidth: \.infinity, alignment: \.leading/);
});

test('a clipping frame keeps its shadow; layers placed from the start take their room', { skip }, () => {
  const shadow = { type: 'DROP_SHADOW', visible: true, color: { r: 0, g: 0, b: 0, a: 0.2 }, offset: { x: 0, y: 4 }, radius: 12, spread: 0 };
  const card = frame('Card', { w: 200, h: 100, fills: [solid(white)], cornerRadius: 12, clipsContent: true, effects: [shadow],
    children: [text('Hello', { x: 10, y: 10 })] });
  const r = generate(column('Cards', [card], { h: 200 }));
  const body = r.code.slice(r.code.indexOf('Text("Hello")'));
  assert.ok(body.indexOf('.clipShape(') < body.indexOf('.shadow('), 'clipped before the shadowed fill');
  assert.match(r.code, /\.padding\(\.leading, 10\)\n\s*\.padding\(\.top, 10\)|\.padding\(EdgeInsets\(top: 10, leading: 10/);
  assert.equal(typecheck([r]), '');
});

test('a carousel in a fixed column still scrolls with its insets', { skip }, () => {
  const card = (t, x) => frame(t, { x, y: 30, w: 280, h: 120, cornerRadius: 20, fills: [solid(ink)], layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED',
    children: [text(t, { x: x + 16, y: 46 })] });
  const offers = frame('Offers', { w: 390, h: 154, mode: 'VERTICAL', itemSpacing: 10, layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG', counterAxisAlignItems: 'MIN',
    children: [text('Offers for you', { size: 18 }), frame('Row', { y: 30, w: 604, h: 120, mode: 'HORIZONTAL', itemSpacing: 12, paddingLeft: 16, paddingRight: 16,
      layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG', children: [card('Gulf', 16), card('Asia', 308)] })] });
  const r = generate(column('Deals', [offers], { w: 390, h: 300 }));
  assert.match(r.code, /ScrollView\(\.horizontal\)/);
  assert.match(r.code, /\.contentMargins\(\.horizontal, 16, for: \.scrollContent\)/);
  assert.equal(typecheck([r]), '');
});

test('a floating button on an auto-layout screen stays pinned', { skip }, () => {
  const fab = { ...frame('Add', { x: 310, y: 760, w: 56, h: 56, cornerRadius: 28, fills: [solid(ink)] }), layoutPositioning: 'ABSOLUTE',
    constraints: { horizontal: 'MAX', vertical: 'MAX' } };
  const root = frame('Inbox', { w: 390, h: 844, mode: 'VERTICAL', itemSpacing: 12, paddingTop: 60, paddingLeft: 16, paddingRight: 16, fills: [solid(white)],
    layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', children: [text('Message one', { x: 16, y: 60, w: 200 }), text('Message two', { x: 16, y: 90, w: 200 }), fab] });
  const r = toSwiftUI(root, assets, { preview: false });
  const scroll = r.code.indexOf('ScrollView {');
  const end = r.code.indexOf('.scrollBounceBehavior');
  const pinned = r.code.indexOf('.overlay(alignment: .topLeading)', end);
  assert.ok(scroll >= 0 && pinned > end, 'drawn over the scroll view, not in it');
  assert.equal(typecheck([r]), '');
});

test('a later screen\'s design system merges into the project\'s file', { skip }, async () => {
  const { mergeDesignSystem } = await import('../src/codegen/swiftui/design-system.js');
  const token = (name, value) => frame(name, { w: 100, h: 40, fills: [solid(value)], vars: { 'fill.0': name }, children: [text('Hi')] });
  const a = generate(column('Home', [token('brand/primary', brand), button('Go')], { h: 200 }));
  const b = generate(column('Search', [token('brand/primary', ink), token('ink/strong', ink), chips('Fares', ['A', 'B', 'C'], 0)], { h: 200 }));
  const project = `${a.shared}\n// The team's own additions.\nlet spacingUnit: CGFloat = 4\n`;
  const merged = mergeDesignSystem(project, b.shared);
  assert.ok(merged.text.startsWith(project.trimEnd().split('\n')[0]));
  assert.match(merged.text, /The team's own additions/);
  assert.ok(merged.added.includes('DesignTokens.inkStrong'), merged.added.join());
  assert.match(merged.conflicts.join(), /DesignTokens\.brandPrimary is Color\(hex: 0x3D3BD9\) in the project/);
  assert.equal(mergeDesignSystem(merged.text, b.shared).added.length, 0);
  assert.equal(typecheck([a, b].map((r) => ({ ...r, shared: null })).concat([{ structName: 'DesignSystem', code: merged.text, shared: null }])), '');
});

test('a box whose text already overflows it in the design keeps its height', () => {
  const link = { ...frame('Button', { w: 50, h: 15, mode: 'HORIZONTAL', primaryAxisAlignItems: 'CENTER', layoutSizingHorizontal: 'HUG',
    layoutSizingVertical: 'FIXED', children: [{ ...text('Resend', { size: 14 }), height: 24 }] }), type: 'INSTANCE' };
  const r = generate(column('Card', [link], { h: 100 }));
  const at = r.code.indexOf('Text("Resend")');
  assert.match(r.code.slice(at), /\.frame\(height: 15\)/);
  assert.doesNotMatch(r.code.slice(at), /minHeight: 15/);
});

test('a logo\'s text keeps its size at every text size', { skip }, () => {
  const logo = frame('Logo', { w: 118, h: 30, mode: 'HORIZONTAL', layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED',
    children: [{ ...text('tripora', { size: 24 }), segments: [{ ...text('tripora', { size: 24 }).segments[0], lineHeight: { unit: 'PIXELS', value: 28 } }] }] });
  const r = generate(column('Header', [logo, text('Hi Arjun')], { h: 100 }));
  assert.match(r.code, /\.custom\("Inter-Regular", fixedSize: 24\)/);
  assert.match(r.code, /\.designLineHeight\(28, font: "Inter-Regular", size: 24, relativeTo: nil\)/);
  assert.match(r.code, /\.custom\("Inter-Regular", size: 13, relativeTo: \.footnote\)/);
  assert.equal(typecheck([r]), '');
});

test('additions to a design system come as a patch naming their enums', async () => {
  const { mergeDesignSystem } = await import('../src/codegen/swiftui/design-system.js');
  const project = 'import SwiftUI\n\nenum DesignTokens {\n  static let brand = Color(hex: 0x111111) // brand\n}\n';
  const screen = 'import SwiftUI\n\n/// The design variables used, by their Figma names.\nenum DesignTokens {\n  static let brand = Color(hex: 0x111111) // brand\n  static let ink = Color(hex: 0x222222) // ink\n}\n';
  const m = mergeDesignSystem(project, screen);
  assert.deepEqual(m.added, ['DesignTokens.ink']);
  assert.equal(m.patch, '// Add to enum DesignTokens:\n  static let ink = Color(hex: 0x222222) // ink');
});

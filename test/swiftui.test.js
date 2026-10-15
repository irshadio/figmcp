import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { detectRoles } from '../src/codegen/roles.js';
import { toSwiftUI } from '../src/codegen/swiftui/index.js';
import { isGenericName } from '../src/codegen/swiftui/repeat.js';
import { assetCatalog, detectFramework } from '../src/project.js';

const CHECK = new URL('../tools/swiftui-check.js', import.meta.url);
const EXPORT = new URL('./fixtures/sample-export.json', import.meta.url);

const assets = {
  svg: () => '/tmp/icon.svg',
  image: (hash) => `/tmp/${hash}.png`,
  imageExt: () => 'png',
  render: () => '/tmp/render.png',
};
const ink = { r: 0.43, g: 0.44, b: 0.57, a: 1 };
const brand = { r: 0.24, g: 0.23, b: 0.85, a: 1 };
const white = { r: 1, g: 1, b: 1, a: 1 };
const solid = (color) => ({ type: 'SOLID', visible: true, color });
// An icon's SVG; on a tile (a filled frame) Figma draws the tile's rect first.
const SVG = (hex, tile = null) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">${
  tile ? `<rect width="20" height="20" rx="10" fill="${tile}"/>` : ''}<path fill="${hex}" d="M2 2h16v16H2z"/></svg>`;
let nextId = 100;
const id = () => `1:${nextId++}`;

function text(characters, { size = 13, color = ink, x = 0, y = 0, w = 60 } = {}) {
  return {
    id: id(), name: characters, type: 'TEXT', x, y, width: w, height: Math.round(size * 1.4), characters,
    textAutoResize: 'WIDTH_AND_HEIGHT', layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG',
    segments: [{ characters, fontSize: size, fontName: { family: 'Rubik', style: 'Regular' }, fontWeight: 400,
      lineHeight: { unit: 'PIXELS', value: Math.round(size * 1.4) }, fills: [solid(color)] }],
  };
}

function icon(name, w, h, { hex = '#6E7191', fills = [], tile = null, x = 0, y = 0 } = {}) {
  return { id: id(), name, type: 'FRAME', x, y, width: w, height: h, svg: SVG(hex, tile), fills, cornerRadius: 999,
    layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', children: [] };
}

function frame(name, { x = 0, y = 0, w, h, mode = null, children = [], ...rest }) {
  return {
    id: id(), name, type: 'FRAME', x, y, width: w, height: h, layoutMode: mode, children,
    primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'CENTER', ...rest,
  };
}

/** A phone screen with a tab bar, a segmented control, chips, a carousel, a grid and standalone controls. */
function screen() {
  const segment = (label, x, selected) => frame(label, {
    x, y: 204, w: 103, h: 32, mode: 'HORIZONTAL', paddingLeft: 10, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
    layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', cornerRadius: 16,
    fills: selected ? [solid(white)] : [], children: [text(label, { x: x + 10, y: 211, color: selected ? brand : ink })],
  });
  const chip = (label, x, selected) => ({
    ...frame(label, {
      x, y: 260, w: 80, h: 36, mode: 'HORIZONTAL', paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
      layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG', cornerRadius: 999,
      fills: [solid(selected ? { r: 0.95, g: 0.94, b: 1, a: 1 } : white)], strokes: [solid(selected ? brand : ink)], strokeWeight: 1,
      children: [text(label, { x: x + 12, y: 268, color: selected ? brand : ink })],
    }),
    type: 'INSTANCE', name: 'Chip',
  });
  const card = (title, x, y, w, h) => frame(title, {
    x, y, w, h, cornerRadius: 20, clipsContent: true, layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED',
    fills: [{ type: 'IMAGE', visible: true, scaleMode: 'FILL', imageHash: `h${title}` }],
    children: [text(title, { x: x + 16, y: y + 16, size: 16, color: white })],
  });
  const field = (label, value, iconName, y) => frame(label, {
    x: 33, y, w: 324, h: 62, mode: 'HORIZONTAL', itemSpacing: 12, paddingLeft: 14, paddingRight: 14, paddingTop: 11, paddingBottom: 11,
    layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
    children: [
      icon(iconName, 20, 20, { x: 47, y: y + 21 }),
      frame('Text', { x: 79, y: y + 11, w: 264, h: 40, mode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
        counterAxisAlignItems: 'MIN', children: [text(label, { x: 79, y: y + 11 }), text(value, { x: 79, y: y + 29, size: 16 })] }),
    ],
  });
  const tab = (label, x, selected) => frame(label, {
    x, y: 1120, w: 80, h: 50, mode: 'VERTICAL', itemSpacing: 4, layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG',
    children: [
      icon('Icon', 44, 28, { x: x + 18, y: 1120, hex: selected ? '#3D3BD9' : '#6E7191',
        fills: selected ? [solid({ r: 0.95, g: 0.94, b: 1, a: 1 })] : [], tile: selected ? '#F2F0FF' : null }),
      text(label, { x: x + 20, y: 1152, color: selected ? brand : ink }),
    ],
  });
  return frame('01 Home', {
    w: 390, h: 1200, fills: [solid({ r: 0.96, g: 0.96, b: 0.98, a: 1 })],
    children: [
      frame('Header', {
        y: 0, w: 390, h: 50, mode: 'HORIZONTAL', paddingLeft: 20, paddingRight: 20, itemSpacing: 10, fills: [solid(brand)],
        layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG',
        children: [text('tripora', { x: 20, y: 14, size: 20, color: white, w: 100 }), icon('Bell', 38, 38, { x: 332, y: 6, hex: '#FFFFFF' })],
      }),
      frame('Trip type', {
        x: 32, y: 200, w: 326, h: 40, mode: 'HORIZONTAL', itemSpacing: 4, paddingLeft: 4, paddingRight: 4, paddingTop: 4, paddingBottom: 4,
        cornerRadius: 999, fills: [solid({ r: 0.93, g: 0.93, b: 0.96, a: 1 })], layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG',
        children: [segment('One way', 36, true), segment('Round trip', 143, false), segment('Multi-city', 250, false)],
      }),
      frame('Fares', {
        x: 32, y: 260, w: 326, h: 36, mode: 'HORIZONTAL', itemSpacing: 6, layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG',
        children: [chip('Regular', 32, true), chip('Student', 118, false), chip('Senior', 204, false)],
      }),
      frame('Route', {
        x: 32, y: 320, w: 326, h: 127, mode: 'VERTICAL', strokes: [solid(ink)], strokeWeight: 1, cornerRadius: 14,
        layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG', counterAxisAlignItems: 'MIN',
        children: [
          field('From', 'Kochi', 'Icon/plane', 321),
          { ...frame('Rectangle', { x: 33, y: 383, w: 324, h: 1, fills: [solid(ink)], layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED' }), type: 'RECTANGLE' },
          field('To', 'Dubai', 'Icon/pin', 384),
          { ...icon('Swap', 38, 38, { x: 304, y: 366 }), layoutPositioning: 'ABSOLUTE', constraints: { horizontal: 'MAX', vertical: 'CENTER' } },
        ],
      }),
      {
        ...frame('Button', {
          x: 32, y: 400, w: 326, h: 52, mode: 'HORIZONTAL', paddingLeft: 24, paddingRight: 24, paddingTop: 15, paddingBottom: 15,
          primaryAxisAlignItems: 'CENTER', cornerRadius: 14, fills: [solid(brand)], layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED',
          children: [text('Search flights', { x: 140, y: 415, size: 16, color: white, w: 110 })],
        }),
        type: 'INSTANCE',
      },
      frame('Offers', {
        y: 480, w: 390, h: 154, mode: 'VERTICAL', itemSpacing: 10, layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG', counterAxisAlignItems: 'MIN',
        children: [
          frame('Head', {
            y: 480, w: 390, h: 24, mode: 'HORIZONTAL', paddingLeft: 20, paddingRight: 20, itemSpacing: 8,
            layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
            children: [
              { ...text('Offers for you', { x: 20, y: 480, size: 18, w: 290 }), layoutSizingHorizontal: 'FILL', textAutoResize: 'HEIGHT' },
              text('View all', { x: 318, y: 484, color: brand }),
            ],
          }),
          frame('Row', {
            y: 514, w: 604, h: 120, mode: 'HORIZONTAL', itemSpacing: 12, paddingLeft: 16, paddingRight: 16,
            layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG',
            children: [card('Gulf flights', 16, 514, 280, 120), card('Bali hotels', 308, 514, 280, 120)],
          }),
        ],
      }),
      frame('Grid', {
        y: 660, w: 390, h: 410, mode: 'HORIZONTAL', layoutWrap: 'WRAP', itemSpacing: 10, counterAxisSpacing: 10, paddingLeft: 16, paddingRight: 16,
        layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG',
        children: [card('Dubai', 16, 660, 174, 200), card('Singapore', 200, 660, 174, 200), card('Bali', 16, 870, 174, 200), card('Bangkok', 200, 870, 174, 200)],
      }),
      frame('Coins banner', {
        x: 16, y: 1090, w: 358, h: 20, mode: 'HORIZONTAL', itemSpacing: 12, layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG',
        children: [text('1,240 coins', { x: 16, y: 1090, size: 15, w: 300 }), icon('Icon/chevronRight', 18, 18, { x: 356, y: 1091 })],
      }),
      frame('Tab bar', {
        y: 1109, w: 390, h: 91, mode: 'HORIZONTAL', paddingLeft: 12, paddingRight: 12, paddingTop: 11, paddingBottom: 30,
        primaryAxisAlignItems: 'SPACE_BETWEEN', fills: [solid(white)], layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG',
        children: [tab('Home', 12, true), tab('Trips', 107, false), tab('Offers', 203, false), tab('Account', 298, false)],
      }),
    ],
  });
}

const byName = (roles, name) => [...roles.values()].find((r) => r.name === name);

test('detectRoles names the parts of a screen', () => {
  const roles = detectRoles(screen());
  const role = (name) => byName(roles, name) && byName(roles, name).role;
  assert.equal(role('Tab bar'), 'tabBar');
  assert.equal(byName(roles, 'Tab bar').selected, 0);
  assert.equal(role('Home'), 'tab');
  assert.equal(role('Trip type'), 'segmented');
  assert.equal(role('Round trip'), 'segment');
  assert.equal(role('Fares'), 'chips');
  assert.equal(byName(roles, 'Fares').selected, 0);
  assert.equal(role('Row'), 'carousel');
  assert.equal(role('Gulf flights'), 'card');
  assert.equal(role('Grid'), 'grid');
  assert.equal(byName(roles, 'Grid').columns, 2);
  assert.equal(role('Head'), 'sectionHeader');
  assert.equal(role('Offers for you'), 'heading');
  assert.equal(role('View all'), 'link');
  assert.equal(byName(roles, 'View all').section, 'Offers for you');
  assert.equal(role('Button'), 'button');
  assert.equal(byName(roles, 'Button').label, 'Search flights');
  assert.equal(role('Bell'), 'iconButton');
  assert.equal(role('From'), 'field');
  assert.equal(role('To'), 'field');
  assert.equal(role('Swap'), 'iconButton');
  assert.equal(role('Route'), 'swapFields');
  assert.equal(byName(roles, 'Route').button, byName(roles, 'Swap').id);
  assert.equal(role('Coins banner'), 'listRow');
  assert.equal(role('Header'), undefined);
});

test('toSwiftUI builds the roles as production patterns', () => {
  const { code, structure, screen: isScreen } = toSwiftUI(screen(), assets);
  assert.ok(isScreen);
  // Data, models and selection state.
  // Types only this screen uses are nested in it.
  assert.match(code, /\nextension Home \{\n/);
  assert.match(code, /\n  struct TabBarItem: Hashable \{\n    let icon: String\n    let title: String\n  \}/);
  assert.match(code, /private let tabBarItems: \[TabBarItem\] = \[/);
  assert.match(code, /@State private var selectedTabBarItem = 0/);
  assert.match(code, /@State private var selectedTripType = 0/);
  assert.match(code, /@State private var selectedChip = 0/);
  // Sliding indicators for the tab bar and the segmented control.
  assert.match(code, /@Namespace private var tabBarItemIndicator/);
  assert.match(code, /@Namespace private var tripTypeIndicator/);
  assert.equal((code.match(/\.matchedGeometryEffect\(id: "selection", in: namespace\)/g) || []).length, 2);
  assert.match(code, /withAnimation\(reduceMotion \? nil : \.snappy\) \{ selectedTabBarItem = index \}/);
  assert.match(code, /@Environment\(\\\.accessibilityReduceMotion\) private var reduceMotion/);
  assert.match(code, /\.sensoryFeedback\(\.selection, trigger: selectedTabBarItem\)/);
  assert.match(code, /\.accessibilityAddTraits\(index == selectedTripType \? \.isSelected : \[\]\)/);
  assert.doesNotMatch(code, /onTapGesture/);
  // Buttons with a typed action.
  assert.match(code, /var action: \(Action\) -> Void = \{ _ in \}/);
  assert.match(code, /\n  enum Action: Hashable \{/);
  assert.match(code, /case tabBarItem\(TabBarItem\)/);
  assert.match(code, /case searchFlights\n/);
  assert.match(code, /case bell\n/);
  assert.match(code, /case from\n/);
  assert.match(code, /case viewAllOffersForYou\n/);
  assert.match(code, /case coinsBanner\n/);
  assert.match(code, /case offer\(Offer\)/);
  assert.match(code, /Button \{\n\s+action\(\.searchFlights\)\n\s+\} label: \{/);
  assert.match(code, /\.buttonStyle\(\.pressable\)/);
  assert.match(code, /\.accessibilityLabel\("Bell"\)/);
  // The route's ends swap as state.
  assert.match(code, /struct RouteEnd: Hashable \{\n    let title: String\n  \}/);
  assert.match(code, /@State private var from = RouteEnd\(title: "Kochi"\)/);
  assert.match(code, /@State private var to = RouteEnd\(title: "Dubai"\)/);
  assert.match(code, /Text\(from\.title\)/);
  assert.match(code, /withAnimation\(reduceMotion \? nil : \.snappy\) \{ \(from, to\) = \(to, from\) \}/);
  assert.doesNotMatch(code, /case swap\n/);
  assert.doesNotMatch(code, /struct PressableButtonStyle|enum DesignTokens|enum AppFonts|extension Color/);
  // Carousel, grid, header, fonts and decorative images.
  assert.match(code, /LazyHStack\(spacing: 12\)/);
  assert.match(code, /\.scrollTargetLayout\(\)/);
  assert.match(code, /\.contentMargins\(\.horizontal, 16, for: \.scrollContent\)/);
  assert.match(code, /\.scrollTargetBehavior\(\.viewAligned\)/);
  // Two columns, one at accessibility text sizes.
  assert.match(code.replace(/\s+/g, ' '),
    /LazyVGrid\( columns: Array\( repeating: GridItem\(\.flexible\(\), spacing: 10\), count: dynamicTypeSize\.isAccessibilitySize \? 1 : 2 \), spacing: 10 \)/);
  assert.match(code, /@Environment\(\\\.dynamicTypeSize\) private var dynamicTypeSize/);
  assert.doesNotMatch(code, /FlowLayout/);
  assert.match(code, /Text\("Offers for you"\)[\s\S]*?\.accessibilityAddTraits\(\.isHeader\)/);
  assert.match(code, /\.custom\("Rubik-Regular", size: 13, relativeTo: \.footnote\)/);
  assert.match(code, /\.accessibilityHidden\(true\)/);
  assert.match(code, /\.safeAreaInset\(edge: \.bottom, spacing: 0\)/);
  // The structure lists what each part is.
  const tabBar = structure.find((r) => r.role === 'tabBar');
  assert.deepEqual({ items: tabBar.items, selected: tabBar.selected }, { items: 4, selected: 'Home' });
  assert.ok(structure.find((r) => r.role === 'grid').pattern.includes('LazyVGrid'));
  assert.equal(structure.find((r) => r.role === 'button').label, 'Search flights');
});

/** An onboarding screen: a header drawn with the status bar, a hero image, a title and a sheet anchored to the bottom. */
function onboarding() {
  const status = frame('Navigation', {
    y: 0, w: 393, h: 64, mode: 'HORIZONTAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED',
    children: [text('9:41', { x: 30, y: 20, size: 17 })],
  });
  const row = frame('Top bar', {
    y: 64, w: 393, h: 56, mode: 'HORIZONTAL', paddingLeft: 16, paddingRight: 16, primaryAxisAlignItems: 'SPACE_BETWEEN',
    layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED', fills: [solid(white)],
    children: [icon('Component 6', 38, 38, { x: 16, y: 73 }), text('Skip', { x: 340, y: 82 })],
  });
  return frame('Onboarding', {
    w: 393, h: 852, fills: [solid(white)],
    children: [
      { ...frame('Hero', { x: 10, y: 105, w: 376, h: 460, fills: [{ type: 'IMAGE', visible: true, scaleMode: 'FILL', imageHash: 'hero' }] }),
        type: 'RECTANGLE', constraints: { horizontal: 'CENTER', vertical: 'CENTER' } },
      frame('Header', {
        y: 0, w: 393, h: 120, mode: 'VERTICAL', layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG', fills: [solid(white)],
        children: [status, row],
      }),
      { ...frame('Sheet', {
        y: 539, w: 393, h: 313, mode: 'VERTICAL', itemSpacing: 24, paddingTop: 18, paddingBottom: 34, paddingLeft: 16, paddingRight: 16,
        layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG', counterAxisAlignItems: 'CENTER',
        children: [
          { ...text('Welcome to the app', { x: 16, y: 557, size: 32, w: 361 }), layoutSizingHorizontal: 'FILL', textAutoResize: 'HEIGHT' },
          text('Organised wherever you are.', { x: 100, y: 626, size: 14, w: 190 }),
        ],
      }), constraints: { horizontal: 'STRETCH', vertical: 'MAX' } },
    ],
  });
}

test('toSwiftUI leaves the status bar to the phone and pins the header drawn with it', () => {
  const { code } = toSwiftUI(onboarding(), assets);
  assert.doesNotMatch(code, /9:41/);
  assert.doesNotMatch(code, /\.offset\(y: -64\)/);
  const header = code.slice(code.indexOf('.safeAreaInset(edge: .top'));
  assert.match(header, /^\.safeAreaInset\(edge: \.top, spacing: 0\) \{\n\s+VStack/);
  // Its fill runs on under the status bar.
  assert.match(header, /\.ignoresSafeArea\(edges: \.top\)/);
  // The leading icon of the top bar is a back button.
  assert.match(header, /Button \{\n\s+action\(\.back\)\n\s+\} label: \{[\s\S]*?\.accessibilityLabel\("Back"\)/);
  const o = onboarding();
  const back = detectRoles(o).get(o.children[1].children[1].children[0].id);
  assert.deepEqual([back.role, back.label], ['iconButton', 'Back']);
});

test('toSwiftUI lays a freely placed screen out as a column that reflows', () => {
  const { code } = toSwiftUI(onboarding(), assets);
  // The hero lies behind the page; the sheet stays at the bottom of a taller phone.
  assert.match(code, /GeometryReader \{ proxy in\n\s+ScrollView \{\n\s+VStack\(alignment: \.leading, spacing: 0\) \{\n\s+Spacer\(minLength: 419\)/);
  assert.match(code, /\.frame\(maxWidth: \.infinity, minHeight: proxy\.size\.height, alignment: \.topLeading\)\n\s+\.background\(alignment: \.topLeading\)/);
  // Text wraps and grows instead of keeping one line.
  assert.match(code, /Text\("Organised wherever you are\."\)[\s\S]*?\.fixedSize\(horizontal: false, vertical: true\)/);
  assert.doesNotMatch(code, /Text\("Organised wherever you are\."\)(\n\s+\.[^\n]+)*\n\s+\.fixedSize\(\)/);
  // A single word never breaks.
  assert.match(code, /Text\("Skip"\)(\n\s+\.[^\n]+)*\n\s+\.lineLimit\(1\)/);

  const home = toSwiftUI(screen(), assets).code;
  const body = home.slice(home.indexOf('var body'), home.indexOf('.safeAreaInset'));
  assert.match(body, /ScrollView \{\n\s+VStack\(alignment: \.leading, spacing: \d+\) \{/);
  assert.doesNotMatch(body, /\.offset\(y: \d/);
  assert.match(body, /\.padding\(\.top, \d+\)/);
  // Section heights grow from the design's.
  assert.match(body, /\.frame\(minHeight: \d+, alignment: \.top\)/);
  // Glyphs beside text grow with it.
  assert.match(home, /@ScaledMetric\(relativeTo: \.body\) private var iconSize20: CGFloat = 20/);
  assert.match(home, /\.frame\(width: iconSize20, height: iconSize20\)/);
  // Tab bar items show the large content viewer; control labels keep one line.
  assert.match(home, /\.accessibilityShowsLargeContentViewer\(\)/);
  assert.match(home, /Text\(item\.title\)[\s\S]*?\.lineLimit\(1\)/);
});

test('toSwiftUI names layers Figma left unnamed from their role, text or section', () => {
  assert.ok(isGenericName('Frame 2147232163') && isGenericName('Component 6') && isGenericName('image 2') && isGenericName('d'));
  assert.ok(isGenericName('ChatGPT Image Sep 22, 2026, 02_07_02 PM 1'));
  assert.ok(!isGenericName('Coins banner') && !isGenericName('Icon/plane') && !isGenericName('Tab bar'));
  const { code, assets: named } = toSwiftUI(onboarding(), assets);
  // The back button's glyph and the hero picture.
  assert.ok('back' in named, Object.keys(named).join());
  assert.ok('hero' in named, Object.keys(named).join());
  assert.doesNotMatch(code, /component6|frame\d{5,}|ItemItem/);
});

test('toSwiftUI draws a pattern of many small vectors as one image', () => {
  const doodles = Array.from({ length: 14 }, (_, i) => ({ ...icon('d', 20, 20, { x: (i % 7) * 50, y: 300 + Math.floor(i / 7) * 50 }), svgBounds: { x: (i % 7) * 50, y: 300 + Math.floor(i / 7) * 50, width: 20, height: 20 } }));
  const root = onboarding();
  root.children.push({ ...frame('Wallpaper', { x: 0, y: 300, w: 393, h: 100, children: doodles }), layoutPositioning: 'ABSOLUTE' });
  const saved = [];
  const { assets: named } = toSwiftUI(root, { ...assets, svg: (t) => { saved.push(t); return `/tmp/s${saved.length}.svg`; } });
  assert.ok('wallpaper' in named, Object.keys(named).join());
  assert.equal(Object.keys(named).filter((n) => /^d\d*$/.test(n)).length, 0);
  const pattern = saved.find((t) => (t.match(/<svg/g) || []).length === 15);
  assert.match(pattern, /^<svg width="393" height="100" viewBox="0 0 393 100"/);
  assert.match(pattern, /<svg x="50" y="0" width="20" height="20"/);
});

test('detectRoles gives each role its confidence and evidence, and layer name tags set or clear roles', () => {
  const root = screen();
  const roles = detectRoles(root);
  const tabBar = byName(roles, 'Tab bar');
  assert.equal(tabBar.confidence, 'high');
  assert.match(tabBar.evidence, /4 equal icon \+ label items across the bottom, "Home" drawn apart/);
  // The selected tab's tile is the design's own indicator: the bar stays custom.
  assert.equal(tabBar.native.use, false);
  assert.match(tabBar.native.reason, /indicator/);
  assert.match(byName(roles, 'Trip type').native.reason, /pill track/);

  const header = root.children[0];
  header.children[0].name = 'tripora [no-role]';
  header.name = 'Header [button]';
  root.children.find((c) => c.name === 'Fares').name = 'Fares [no-role]';
  const tagged = detectRoles(root);
  assert.deepEqual([byName(tagged, 'Header [button]').role, byName(tagged, 'Header [button]').confidence], ['button', 'set by name']);
  assert.equal(byName(tagged, 'Fares [no-role]'), undefined);
  assert.equal([...tagged.values()].filter((r) => r.role === 'chip').length, 0);
  // Tags stay out of the code's names.
  assert.doesNotMatch(toSwiftUI(root, assets).code, /noRole|Button\]|headerButton\b/i);
});

test('toSwiftUI uses the system segmented control when the design draws one', () => {
  const root = screen();
  const track = root.children.find((c) => c.name === 'Trip type');
  track.cornerRadius = 8;
  track.children.forEach((c) => { c.cornerRadius = 7; });
  const { code, structure } = toSwiftUI(root, assets);
  assert.match(code, /Picker\("Trip type", selection: \$selectedTripType\) \{\n\s+ForEach\(Array\(tripTypes\.enumerated\(\)\), id: \\\.offset\) \{ index, item in\n\s+Text\(item\.title\)\n\s+\.tag\(index\)/);
  assert.match(code, /\.pickerStyle\(\.segmented\)\n\s+\.labelsHidden\(\)/);
  assert.doesNotMatch(code, /struct TripTypeView/);
  const entry = structure.find((r) => r.role === 'segmented');
  assert.equal(entry.pattern, 'system control: Picker with .pickerStyle(.segmented)');
});

test('toSwiftUI follows prototype taps: back dismisses, navigation names the destination', () => {
  const root = onboarding();
  const row = root.children[1].children[1];
  row.children[0].reactions = [{ trigger: 'ON_CLICK', action: 'BACK' }];
  row.children[1].reactions = [{ trigger: 'ON_HOVER', action: 'NODE', navigation: 'CHANGE_TO', destination: null },
    { trigger: 'ON_CLICK', action: 'NODE', navigation: 'NAVIGATE', destination: { id: '9:9', name: 'Home' } }];
  const { code, structure } = toSwiftUI(root, assets);
  assert.match(code, /@Environment\(\\\.dismiss\) private var dismiss/);
  assert.match(code, /Button \{\n\s+dismiss\(\)\n\s+\} label:/);
  // The Skip text becomes a Button whose case names where it goes.
  assert.match(code, /Button \{\n\s+action\(\.openHome\)\n\s+\} label: \{\n\s+Text\("Skip"\)/);
  assert.match(code, /case openHome/);
  const skip = structure.find((r) => r.prototype && r.prototype.kind === 'navigate');
  assert.deepEqual([skip.role, skip.prototype.destination.name, skip.evidence], ['button', 'Home', 'a prototype tap']);
});

test('toSwiftUI draws text inputs as fields bound to state, with their content type', () => {
  const input = (name, placeholder, y) => frame(name, {
    x: 16, y, w: 300, h: 48, mode: 'HORIZONTAL', paddingLeft: 12, itemSpacing: 12, cornerRadius: 24, fills: [solid(white)],
    layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED',
    children: [icon('emoji', 22, 22, { x: 28, y: y + 13 }), { ...text(placeholder, { x: 62, y: y + 15, size: 16 }), layoutSizingHorizontal: 'FILL' }],
  });
  const root = frame('Sign in', {
    w: 390, h: 844, fills: [solid(white)],
    children: [input('Email', 'Email address', 120), input('Password field', 'Password', 190), input('Message Field', 'Message', 260)],
  });
  const { code } = toSwiftUI(root, assets);
  // State named after the field; Return moves through the fields; a tap on the box focuses its field.
  assert.match(code, /@State private var email = ""\n  @State private var password = ""\n  @State private var message = ""\n  @FocusState private var focusedField: Field\?/);
  assert.match(code, /TextField\(\n\s+"Email address",\n\s+text: \$email,\n\s+prompt: Text\("Email address"\)/);
  assert.match(code, /\.focused\(\$focusedField, equals: \.email\)\n\s+\.submitLabel\(\.next\)\n\s+\.onSubmit \{\n\s+focusedField = \.password\n/);
  assert.match(code, /\.onSubmit \{\n\s+focusedField = nil\n/);
  assert.match(code, /enum Field: Hashable \{\n    case email\n    case password\n    case message\n  \}/);
  assert.match(code, /\.onTapGesture \{\n\s+focusedField = \.email\n/);
  assert.match(code, /\.textContentType\(\.emailAddress\)\n\s+\.keyboardType\(\.emailAddress\)/);
  assert.match(code, /SecureField\(\n\s+"Password"/);
  assert.match(code, /\.textContentType\(\.password\)/);
  assert.match(code, /\.submitLabel\(\.send\)/);
});

test('toSwiftUI gives a pinned bar without a fill the screen background', () => {
  const root = frame('Chat', {
    w: 390, h: 844, fills: [solid({ r: 0.94, g: 0.91, b: 0.87, a: 1 })],
    children: [
      { ...text('Hello', { x: 16, y: 100, size: 16 }) },
      frame('Input Bar', { y: 786, w: 390, h: 58, mode: 'HORIZONTAL', paddingLeft: 6, layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED',
        children: [text('Message', { x: 20, y: 802, size: 16 })] }),
    ],
  });
  const { code } = toSwiftUI(root, assets);
  assert.match(code, /\.safeAreaInset\(edge: \.bottom, spacing: 0\) \{[\s\S]*?\.background \{\n\s+Rectangle\(\)\n\s+\.fill\(Color\(hex: 0xF0E8DE\)\)\n\s+\.ignoresSafeArea\(edges: \.bottom\)/);
});

test('toSwiftUI puts what screens share in DesignSystem.swift', () => {
  const { shared } = toSwiftUI(screen(), assets);
  assert.match(shared, /^import SwiftUI\n/);
  assert.match(shared, /struct PressableButtonStyle: ButtonStyle/);
  assert.match(shared, /extension Color \{/);
  assert.doesNotMatch(shared, /FlowLayout/);
});

test('toSwiftUI takes action names for given layers', () => {
  const root = screen();
  const bell = root.children[0].children[1];
  const { code } = toSwiftUI(root, assets, { actions: { [bell.id]: 'open alerts' } });
  assert.match(code, /action\(\.openAlerts\)/);
  assert.match(code, /case openAlerts\n/);
});

test('detectFramework picks swiftui from the client and the project', () => {
  assert.equal(detectFramework({ clientLanguages: 'swift' }, os.tmpdir()), 'swiftui');
  assert.equal(detectFramework({ clientFrameworks: 'SwiftUI' }, os.tmpdir()), 'swiftui');
  assert.equal(detectFramework({ clientFrameworks: 'flutter', clientLanguages: 'swift' }, os.tmpdir()), 'flutter');
  assert.equal(detectFramework({ clientFrameworks: 'react-native', clientLanguages: 'ios, typescript' }, os.tmpdir()), 'react');
  assert.equal(detectFramework({ clientFrameworks: 'expo', clientLanguages: 'swift' }, os.tmpdir()), 'react');
  assert.equal(detectFramework({ clientLanguages: 'objective-c' }, os.tmpdir()), 'swiftui');
  assert.equal(detectFramework({ framework: 'swiftui' }, os.tmpdir()), 'swiftui');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figmcp-swift-'));
  try {
    fs.mkdirSync(path.join(dir, 'App.xcodeproj'));
    assert.equal(detectFramework({}, dir), 'swiftui');
    fs.writeFileSync(path.join(dir, 'pubspec.yaml'), 'name: app\n');
    assert.equal(detectFramework({}, dir), 'flutter');
    fs.rmSync(path.join(dir, 'pubspec.yaml'));
    assert.equal(assetCatalog(dir), 'Assets.xcassets');
    fs.mkdirSync(path.join(dir, 'App', 'Resources', 'Media.xcassets'), { recursive: true });
    assert.equal(assetCatalog(dir), 'App/Resources/Media.xcassets');
    fs.mkdirSync(path.join(dir, 'App', 'Assets.xcassets'));
    assert.equal(assetCatalog(dir), 'App/Assets.xcassets');
    // Preview and widget catalogs are not the app's.
    fs.mkdirSync(path.join(dir, 'App', 'Preview Content', 'Preview Assets.xcassets'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'AWidget', 'Assets.xcassets'), { recursive: true });
    assert.equal(assetCatalog(dir), 'App/Assets.xcassets');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detectFramework finds nested and generated Xcode projects, and lets the project decide between languages', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figmcp-detect-'));
  try {
    fs.mkdirSync(path.join(dir, 'ios', 'App.xcodeproj'), { recursive: true });
    assert.equal(detectFramework({}, dir), 'swiftui');
    assert.equal(detectFramework({ clientLanguages: 'javascript, swift' }, dir), 'swiftui');
    // A React Native app keeps an ios/ folder of its own.
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    assert.equal(detectFramework({}, dir), 'react');
    assert.equal(detectFramework({ clientLanguages: 'javascript, swift' }, dir), 'react');
    assert.equal(detectFramework({ clientFrameworks: 'ionic', clientLanguages: 'ios' }, dir), 'react');
    const gen = fs.mkdtempSync(path.join(os.tmpdir(), 'figmcp-xcodegen-'));
    fs.writeFileSync(path.join(gen, 'project.yml'), 'name: App\ntargets:\n  App:\n    type: application\n');
    assert.equal(detectFramework({}, gen), 'swiftui');
    fs.rmSync(gen, { recursive: true, force: true });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a metadata outline too long for one response is cut by depth', async () => {
  const { boundedMetadataXml, toMetadataXml } = await import('../src/codegen/metadata.js');
  const leaf = (i) => ({ id: `3:${i}`, name: 'Label', type: 'TEXT', x: 0, y: 0, width: 1, height: 1 });
  const root = { id: '1:1', name: 'Page', type: 'FRAME', x: 0, y: 0, width: 1, height: 1,
    children: Array.from({ length: 60 }, (_, i) => ({ id: `2:${i}`, name: 'Row', type: 'FRAME', x: 0, y: 0, width: 1, height: 1,
      children: Array.from({ length: 30 }, (_, j) => leaf(i * 30 + j)) })) };
  const whole = toMetadataXml(root);
  const cut = boundedMetadataXml(root, 10000);
  assert.ok(whole.length > 10000);
  assert.ok(cut.xml.length <= 10000);
  assert.equal(cut.depth, 2);
  assert.match(cut.xml, /<frame id="2:0" name="Row" x="0" y="0" width="1" height="1" child-count="30" \/>/);
  assert.equal(boundedMetadataXml(root, Infinity).depth, Infinity);
});

const xcrun = spawnSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' });
const sdk = xcrun.status === 0 ? xcrun.stdout.trim() : null;

test('the generated SwiftUI type checks', { skip: sdk ? false : 'xcrun is not available' }, () => {
  const { code, shared } = toSwiftUI(screen(), assets, { preview: false });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figmcp-swiftc-'));
  try {
    const file = path.join(dir, 'Home.swift');
    const system = path.join(dir, 'DesignSystem.swift');
    fs.writeFileSync(file, code);
    fs.writeFileSync(system, shared);
    const r = spawnSync('xcrun', ['--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-target', 'arm64-apple-ios17.0-simulator',
      '-sdk', sdk, '-parse-as-library', file, system], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /warning:/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('swiftui-check exits with 3 without xcrun', () => {
  const r = spawnSync(process.execPath, [CHECK.pathname, '1:1', '--export', EXPORT.pathname], {
    encoding: 'utf8', env: { ...process.env, PATH: path.join(os.tmpdir(), 'no-such-bin') },
  });
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /Xcode/);
});

const booted = sdk && JSON.parse(spawnSync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], { encoding: 'utf8' }).stdout).devices;
const iphone = booted && Object.values(booted).flat().find((d) => d.state === 'Booted' && /iPhone/.test(d.name));

test('swiftui-check renders the generated code in the simulator', { skip: iphone ? false : 'no booted iPhone simulator' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figmcp-swiftui-check-'));
  try {
    const r = spawnSync(process.execPath, [CHECK.pathname, '1:1', '--export', EXPORT.pathname, '--out', dir, '--device', iphone.udid],
      { encoding: 'utf8', timeout: 300000 });
    assert.equal(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.deepEqual(report.compiler.errors, []);
    assert.equal(report.renderedSize[0], report.node.width * 2);
    assert.ok(report.pixels.differingPercent < 100);
    assert.ok(fs.existsSync(report.files.diff));
    assert.ok(fs.existsSync(report.files.rendered));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('swiftui-check compiles a project view with its DesignSystem.swift', { skip: iphone ? false : 'no booted iPhone simulator' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figmcp-swiftui-project-'));
  try {
    const { code, shared } = toSwiftUI(screen(), assets);
    fs.mkdirSync(path.join(dir, 'App.xcodeproj'));
    fs.mkdirSync(path.join(dir, 'App', 'Screens'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'App', 'Screens', 'Home.swift'), code);
    fs.writeFileSync(path.join(dir, 'App', 'DesignSystem.swift'), shared);
    const r = spawnSync(process.execPath, [CHECK.pathname, '1:1', '--export', EXPORT.pathname, '--out', path.join(dir, 'out'),
      '--device', iphone.udid, '--project', dir, '--file', 'App/Screens/Home.swift'], { encoding: 'utf8', timeout: 300000 });
    assert.equal(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.deepEqual(report.compiler.errors, []);
    assert.equal(report.view, 'Home');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** An export of a red frame with a blue box, and Figma's 2x render of it drawn by hand. */
function boxesExport(dir) {
  const { PNG } = createRequire(import.meta.url)('pngjs');
  const [W, H] = [200, 120];
  const png = new PNG({ width: W * 2, height: H * 2 });
  for (let y = 0; y < H * 2; y++) {
    for (let x = 0; x < W * 2; x++) {
      const inside = x >= 100 && x < 300 && y >= 60 && y < 180;
      png.data.set(inside ? [0, 0, 255, 255] : [255, 0, 0, 255], (y * W * 2 + x) * 4);
    }
  }
  const tree = {
    id: '5:1', name: 'Boxes', type: 'FRAME', x: 0, y: 0, width: W, height: H, fills: [solid({ r: 1, g: 0, b: 0, a: 1 })],
    children: [{ id: '5:2', name: 'Box', type: 'RECTANGLE', x: 50, y: 30, width: 100, height: 60, fills: [solid({ r: 0, g: 0, b: 1, a: 1 })] }],
  };
  const file = path.join(dir, 'boxes.json');
  fs.writeFileSync(file, JSON.stringify({ frames: [{ id: '5:1', name: 'Boxes', previewPng2x: PNG.sync.write(png).toString('base64'), tree }], images: {} }));
  return file;
}

test('swiftui-check renders a plain design pixel for pixel', { skip: iphone ? false : 'no booted iPhone simulator' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figmcp-swiftui-boxes-'));
  try {
    const r = spawnSync(process.execPath, [CHECK.pathname, '5:1', '--export', boxesExport(dir), '--out', path.join(dir, 'out'), '--device', iphone.udid],
      { encoding: 'utf8', timeout: 300000 });
    assert.equal(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.deepEqual(report.compiler.errors, []);
    assert.ok(report.pixels.differingPercent < 0.5, JSON.stringify(report.pixels));
    assert.equal(report.pixels.sizeMismatch, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('swiftui-check reports a view that crashes, in light mode, with materials drawn', { skip: iphone ? false : 'no booted iPhone simulator' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figmcp-swiftui-crash-'));
  try {
    const exportFile = boxesExport(dir);
    const view = (name, body) => {
      const file = path.join(dir, `${name}.swift`);
      fs.writeFileSync(file, `import SwiftUI\n\nstruct ${name}: View {\n  var body: some View {\n    ${body}\n  }\n}\n`);
      const r = spawnSync(process.execPath, [CHECK.pathname, '5:1', '--export', exportFile, '--out', path.join(dir, name), '--device', iphone.udid,
        '--code', file], { encoding: 'utf8', timeout: 300000 });
      assert.equal(r.status, 0, r.stderr);
      return JSON.parse(r.stdout);
    };
    const crash = view('Crash', 'let a: [Int] = []\n    return Text("\\(a[1])")');
    assert.equal(crash.failedAt, 'render');
    assert.match(crash.renderError, /Index out of range/);
    const { PNG } = createRequire(import.meta.url)('pngjs');
    const pixel = (report, x, y) => {
      const png = PNG.sync.read(fs.readFileSync(report.files.rendered));
      return [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3)];
    };
    const light = view('Light', 'Color(uiColor: .systemBackground)');
    assert.deepEqual(pixel(light, 200, 120), [255, 255, 255]);
    const frosted = view('Frosted', 'ZStack { Color.red; Rectangle().fill(.ultraThinMaterial) }');
    assert.notDeepEqual(pixel(frosted, 200, 120), [255, 0, 0]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('swiftui-check prints its usage and rejects what is not a node id', () => {
  const help = spawnSync(process.execPath, [CHECK.pathname, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^Usage:/);
  const bad = spawnSync(process.execPath, [CHECK.pathname, 'home'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /not a node id/);
});

test('names are singular, Unicode letters are kept and accents dropped', async () => {
  const { singular } = await import('../src/codegen/swiftui/repeat.js');
  const { sIdent } = await import('../src/codegen/swiftui/swift.js');
  const cases = { Status: 'Status', News: 'News', Movies: 'Movie', Series: 'Series', Bus: 'Bus', Categories: 'Category', Searches: 'Search',
    Addresses: 'Address', Courses: 'Course', Cities: 'City', Chips: 'Chip', Settings: 'Settings' };
  for (const [plural, one] of Object.entries(cases)) assert.equal(singular(plural), one, plural);
  assert.equal(sIdent('Größe'), 'große');
  assert.equal(sIdent('价格'), '价格');
  assert.equal(sIdent('café price'), 'cafePrice');
});

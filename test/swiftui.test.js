import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { detectRoles } from '../src/codegen/roles.js';
import { toSwiftUI } from '../src/codegen/swiftui/index.js';
import { assetCatalog, detectFramework } from '../src/project.js';

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
      frame('From', {
        x: 32, y: 320, w: 324, h: 62, mode: 'HORIZONTAL', itemSpacing: 12, paddingLeft: 14, paddingRight: 14, paddingTop: 11, paddingBottom: 11,
        strokes: [solid(ink)], strokeWeight: 1, cornerRadius: 14, layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG',
        children: [
          icon('Icon/plane', 20, 20, { x: 46, y: 341 }),
          frame('Text', { x: 78, y: 331, w: 264, h: 40, mode: 'VERTICAL', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG',
            counterAxisAlignItems: 'MIN', children: [text('From', { x: 78, y: 331 }), text('Kochi', { x: 78, y: 349, size: 16 })] }),
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
  assert.equal(role('Coins banner'), 'listRow');
  assert.equal(role('Header'), undefined);
});

test('toSwiftUI builds the roles as production patterns', () => {
  const { code, structure, screen: isScreen } = toSwiftUI(screen(), assets);
  assert.ok(isScreen);
  // Data, models and selection state.
  assert.match(code, /struct TabBarItem: Hashable \{\n  let icon: String\n  let title: String\n\}/);
  assert.match(code, /private let tabBarItems: \[TabBarItem\] = \[/);
  assert.match(code, /@State private var selectedTabBarItem = 0/);
  assert.match(code, /@State private var selectedTripType = 0/);
  assert.match(code, /@State private var selectedChip = 0/);
  // Sliding indicators for the tab bar and the segmented control.
  assert.match(code, /@Namespace private var tabBarItemIndicator/);
  assert.match(code, /@Namespace private var tripTypeIndicator/);
  assert.equal((code.match(/\.matchedGeometryEffect\(id: "selection", in: namespace\)/g) || []).length, 2);
  assert.match(code, /withAnimation\(\.snappy\) \{ selectedTabBarItem = index \}/);
  assert.match(code, /\.sensoryFeedback\(\.selection, trigger: selectedTabBarItem\)/);
  assert.match(code, /\.accessibilityAddTraits\(index == selectedTripType \? \.isSelected : \[\]\)/);
  assert.doesNotMatch(code, /onTapGesture/);
  // Buttons with a typed action.
  assert.match(code, /var action: \(HomeAction\) -> Void = \{ _ in \}/);
  assert.match(code, /enum HomeAction: Hashable \{/);
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
  assert.match(code, /struct PressableButtonStyle: ButtonStyle/);
  // Carousel, grid, header, fonts and decorative images.
  assert.match(code, /LazyHStack\(spacing: 12\)/);
  assert.match(code, /\.scrollTargetLayout\(\)/);
  assert.match(code, /\.contentMargins\(\.horizontal, 16, for: \.scrollContent\)/);
  assert.match(code, /\.scrollTargetBehavior\(\.viewAligned\)/);
  assert.match(code, /LazyVGrid\(columns: Array\(repeating: GridItem\(\.flexible\(\), spacing: 10\), count: 2\), spacing: 10\)/);
  assert.doesNotMatch(code, /FlowLayout/);
  assert.match(code, /Text\("Offers for you"\)[\s\S]*?\.accessibilityAddTraits\(\.isHeader\)/);
  assert.match(code, /\.custom\("Rubik", size: 13, relativeTo: \.footnote\)/);
  assert.match(code, /\.accessibilityHidden\(true\)/);
  assert.match(code, /\.safeAreaInset\(edge: \.bottom, spacing: 0\)/);
  // The structure lists what each part is.
  const tabBar = structure.find((r) => r.role === 'tabBar');
  assert.deepEqual({ items: tabBar.items, selected: tabBar.selected }, { items: 4, selected: 'Home' });
  assert.ok(structure.find((r) => r.role === 'grid').pattern.includes('LazyVGrid'));
  assert.equal(structure.find((r) => r.role === 'button').label, 'Search flights');
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
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const xcrun = spawnSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' });
const sdk = xcrun.status === 0 ? xcrun.stdout.trim() : null;

test('the generated SwiftUI type checks', { skip: sdk ? false : 'xcrun is not available' }, () => {
  const { code } = toSwiftUI(screen(), assets, { preview: false });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figmcp-swiftc-'));
  try {
    const file = path.join(dir, 'Home.swift');
    fs.writeFileSync(file, code);
    const r = spawnSync('xcrun', ['--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-target', 'arm64-apple-ios17.0-simulator',
      '-sdk', sdk, '-parse-as-library', file], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /warning:/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { gradientCss } from '../src/codegen/paint.js';
import { toReactTailwind } from '../src/codegen/react.js';

const assets = {
  svg: () => 'U.svg',
  image: () => 'U.png',
  imageSize: () => ({ width: 10, height: 20 }),
  render: () => 'R.png',
};
const black = { r: 0, g: 0, b: 0, a: 1 };
const solid = (color = black, extra = {}) => ({ type: 'SOLID', visible: true, color, ...extra });

function frame(children, extra = {}) {
  return { id: '1:1', name: 'Root', type: 'FRAME', x: 0, y: 0, width: 200, height: 100, children, ...extra };
}

function code(root, opts) {
  return toReactTailwind(root, assets, opts).code;
}

test('bound variables become var() with the exact value as fallback', () => {
  const out = code(frame([{
    id: '1:2', name: 'Card', type: 'FRAME', x: 0, y: 0, width: 100, height: 50,
    layoutMode: 'HORIZONTAL', itemSpacing: 16, paddingLeft: 8, paddingRight: 8,
    cornerRadius: 12, fills: [solid({ r: 0.035, g: 0.071, b: 0.176, a: 1 })],
    vars: { itemSpacing: 'padding-16', paddingLeft: 'padding-8', paddingRight: 'padding-8',
      topLeftRadius: 'r/12', topRightRadius: 'r/12', bottomLeftRadius: 'r/12',
      bottomRightRadius: 'r/12', 'fill.0': 'primary/900' },
    children: [{
      id: '1:3', name: 'T', type: 'TEXT', x: 8, y: 0, width: 20, height: 20, characters: 'Hi',
      textAutoResize: 'WIDTH_AND_HEIGHT',
      segments: [{ characters: 'Hi', fontSize: 14, fills: [solid()],
        vars: { 'fill.0': 'black/900', fontSize: 'body/size' }, textStyle: 'Body/Medium' }],
    }],
  }]));
  assert.match(out, /gap-\[var\(--padding-16,16px\)\]/);
  assert.match(out, /px-\[var\(--padding-8,8px\)\]/);
  assert.match(out, /rounded-\[var\(--r\\\/12,12px\)\]/);
  assert.match(out, /bg-\[var\(--primary\\\/900,#09122d\)\]/);
  assert.match(out, /text-\[var\(--black\\\/900,#000000\)\]/);
  assert.match(out, /text-\[length:var\(--body\\\/size,14px\)\]/);
  assert.match(out, /data-text-style="Body\/Medium"/);
});

test('constraints anchor absolute children like Figma', () => {
  const kid = (id, constraints) => ({ id, name: id, type: 'FRAME', x: 150, y: 70, width: 40, height: 20, constraints });
  const out = code(frame([
    kid('1:2', { horizontal: 'MAX', vertical: 'MAX' }),
    kid('1:3', { horizontal: 'CENTER', vertical: 'CENTER' }),
    kid('1:4', { horizontal: 'STRETCH', vertical: 'MIN' }),
    kid('1:5', { horizontal: 'SCALE', vertical: 'SCALE' }),
  ]));
  assert.match(out, /absolute right-\[10px\] w-\[40px\] bottom-\[10px\] h-\[20px\]/);
  assert.match(out, /left-\[calc\(50%\+50px\)\] w-\[40px\] top-\[calc\(50%\+20px\)\] h-\[20px\]/);
  assert.doesNotMatch(out, /translate/);
  assert.match(out, /left-\[150px\] right-\[10px\] top-\[70px\] h-\[20px\]/);
  assert.match(out, /left-\[75%\] w-\[20%\] top-\[70%\] h-\[20%\]/);
});

test('min/max sizes, negative spacing and reversed stacking', () => {
  const out = code(frame([
    { id: '1:2', name: 'A', type: 'FRAME', x: 0, y: 0, width: 20, height: 20, layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', minWidth: 10, maxWidth: 30 },
    { id: '1:3', name: 'B', type: 'FRAME', x: 12, y: 0, width: 20, height: 20, layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED' },
  ], { layoutMode: 'HORIZONTAL', itemSpacing: -8, itemReverseZIndex: true }));
  assert.match(out, /min-w-\[10px\] max-w-\[30px\]/);
  assert.match(out, /ml-\[-8px\]/);
  assert.doesNotMatch(out, /gap-\[-8px\]/);
  assert.match(out, /z-\[2\]/);
});

test('grid layout with fixed and flexible tracks', () => {
  const out = code(frame([
    { id: '1:2', name: 'Cell', type: 'FRAME', x: 0, y: 0, width: 50, height: 50, gridColumnAnchorIndex: 1, gridRowAnchorIndex: 0, layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED' },
  ], { layoutMode: 'GRID', gridColumnSizes: [{ type: 'FIXED', value: 50 }, { type: 'FLEX', value: 1 }], gridRowCount: 2, gridColumnGap: 8, gridRowGap: 4 }));
  assert.match(out, /grid grid-cols-\[50px_minmax\(0,1fr\)\] grid-rows-\[repeat\(2,minmax\(0,1fr\)\)\] gap-x-\[8px\] gap-y-\[4px\]/);
  assert.match(out, /col-start-\[2\] row-start-\[1\] justify-self-stretch h-\[50px\]/);
});

test('rotated leaves turn inside their bounding box; rotated groups use the render', () => {
  const out = code(frame([
    { id: '1:2', name: 'Bar', type: 'RECTANGLE', x: 10, y: 10, width: 20, height: 40, rotation: 90, rawWidth: 40, rawHeight: 20, fills: [solid()] },
    { id: '1:3', name: 'Tilted', type: 'GROUP', x: 50, y: 10, width: 30, height: 30, rotation: 15, rawWidth: 25, rawHeight: 25, render: { base64: 'x' }, rasterized: 'rotation', children: [] },
  ]));
  assert.match(out, /absolute left-\[10px\] w-\[20px\] top-\[10px\] h-\[40px\] flex items-center justify-center">\n\s+<div className="relative flex-none w-\[40px\] h-\[20px\] rotate-\[-90deg\]/);
  assert.match(out, /data-rasterized="rotation"/);
  assert.match(out, /src=\{imgTilted\}/);
});

test('image scale modes: crop, tile and layered fills in Figma order', () => {
  const out = code(frame([
    { id: '1:2', name: 'Crop', type: 'RECTANGLE', x: 0, y: 0, width: 100, height: 50,
      fills: [{ type: 'IMAGE', visible: true, scaleMode: 'CROP', imageHash: 'h', imageTransform: [[0.5, 0, 0.25], [0, 0.5, 0.1]] },
        solid(black, { opacity: 0.5 })] },
    { id: '1:3', name: 'Tile', type: 'RECTANGLE', x: 0, y: 50, width: 100, height: 50,
      fills: [{ type: 'IMAGE', visible: true, scaleMode: 'TILE', imageHash: 'h', scalingFactor: 0.5 }] },
  ]));
  assert.match(out, /absolute max-w-none w-\[200%\] h-\[200%\] left-\[-50%\] top-\[-20%\]/);
  const crop = out.indexOf('w-[200%]');
  const overlay = out.indexOf('bg-[rgba(0,0,0,0.5)]');
  assert.ok(crop > 0 && overlay > crop, 'the colour fill above the image is drawn after it');
  assert.match(out, /backgroundSize: "5px 10px"/);
});

test('gradient strokes, shadows on content and blend modes', () => {
  const grad = { type: 'GRADIENT_LINEAR', visible: true, gradientTransform: [[1, 0, 0], [0, 1, 0]],
    gradientStops: [{ position: 0, color: black }, { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } }] };
  const out = code(frame([
    { id: '1:2', name: 'Ring', type: 'FRAME', x: 0, y: 0, width: 50, height: 50, cornerRadius: 25, strokeWeight: 2, strokeAlign: 'INSIDE', strokes: [grad], fills: [solid()] },
    { id: '1:3', name: 'Group', type: 'FRAME', x: 60, y: 0, width: 50, height: 50, blendMode: 'MULTIPLY',
      effects: [{ type: 'DROP_SHADOW', visible: true, offset: { x: 0, y: 2 }, radius: 4, color: { r: 0, g: 0, b: 0, a: 0.5 } }],
      children: [{ id: '1:4', name: 'Dot', type: 'FRAME', x: 60, y: 0, width: 10, height: 10, fills: [solid()] }] },
  ]));
  assert.match(out, /WebkitMask: "linear-gradient\(#000 0 0\) content-box, linear-gradient\(#000 0 0\)"/);
  assert.match(out, /padding: "2px"/);
  assert.match(out, /mix-blend-multiply/);
  assert.match(out, /drop-shadow-\[0px_2px_2px_rgba\(0,0,0,0.5\)\]/, 'drop-shadow() blurs by a standard deviation: half the radius');
  assert.doesNotMatch(out, / shadow-\[0px_2px/);
});

test('linear gradient angle and stops follow the handles', () => {
  // Handles from the left edge to the right edge: 90deg, stops unchanged.
  const css = gradientCss({ type: 'GRADIENT_LINEAR', gradientTransform: [[1, 0, 0], [0, 1, 0]],
    gradientStops: [{ position: 0, color: black }, { position: 1, color: black }] }, 100, 50);
  assert.equal(css, 'linear-gradient(90deg,#000000 0%,#000000 100%)');
  // Top to bottom.
  const down = gradientCss({ type: 'GRADIENT_LINEAR', gradientTransform: [[0, 1, 0], [-1, 0, 1]],
    gradientStops: [{ position: 0, color: black }, { position: 1, color: black }] }, 100, 50);
  assert.equal(down, 'linear-gradient(180deg,#000000 0%,#000000 100%)');
});

test('text: max lines, truncation, paragraph spacing and links', () => {
  const seg = { fontSize: 14, lineHeight: { unit: 'PIXELS', value: 20 }, fills: [solid()] };
  const out = code(frame([
    { id: '1:2', name: 'Clamp', type: 'TEXT', x: 0, y: 0, width: 100, height: 40, characters: 'A long line', maxLines: 2, textAutoResize: 'HEIGHT', segments: [{ ...seg, characters: 'A long line' }] },
    { id: '1:3', name: 'Paras', type: 'TEXT', x: 0, y: 50, width: 100, height: 40, characters: 'One\nTwo', paragraphSpacing: 6, textAutoResize: 'HEIGHT', segments: [{ ...seg, characters: 'One\nTwo' }] },
    { id: '1:4', name: 'Link', type: 'TEXT', x: 0, y: 90, width: 60, height: 20, characters: 'Terms', textAutoResize: 'WIDTH_AND_HEIGHT', segments: [{ ...seg, characters: 'Terms', hyperlink: { type: 'URL', value: 'https://example.com' } }] },
  ]));
  assert.match(out, /line-clamp-\[2\]/);
  assert.match(out, /<p className="mb-\[6px\]">One<\/p>\n\s+<p>Two<\/p>/);
  assert.match(out, /<a href="https:\/\/example.com">Terms<\/a>/);
});

test('auto line height of a single hugging line uses the box height', () => {
  const out = code(frame([{ id: '1:2', name: 'T', type: 'TEXT', x: 0, y: 0, width: 30, height: 17, characters: 'Hi',
    textAutoResize: 'WIDTH_AND_HEIGHT', segments: [{ characters: 'Hi', fontSize: 14, lineHeight: { unit: 'AUTO' } }] }]));
  assert.match(out, /leading-\[17px\]/);
});

test('mapped components are emitted as the mapped widget with their props', () => {
  const button = {
    id: '1:2', name: 'Button', type: 'INSTANCE', x: 0, y: 0, width: 100, height: 40,
    componentSet: 'Button', mainComponent: 'State=Default', componentSetKey: 'k1',
    componentProperties: { 'State': { type: 'VARIANT', value: 'Default' }, 'Show icon#1:2': { type: 'BOOLEAN', value: false } },
    reactions: [{ trigger: 'ON_CLICK', action: 'NODE', navigation: 'NAVIGATE', destination: { id: '9:9', name: 'Next' } }],
    children: [{ id: 'I1:2;1:1', name: 'Label', type: 'TEXT', x: 10, y: 10, width: 50, height: 20, characters: 'Continue' }],
  };
  const res = toReactTailwind(frame([button]), assets, {
    connect: (n) => (n.componentSetKey === 'k1' ? { componentName: 'AppPrimaryButton', source: 'lib/app_primary_button.dart', label: 'Flutter' } : null),
  });
  assert.match(res.code, /^\/\/ AppPrimaryButton: lib\/app_primary_button.dart \(Flutter\)/);
  assert.match(res.code, /<AppPrimaryButton className="absolute left-\[0px\] w-\[100px\] top-\[0px\] h-\[40px\]" data-name="Button" data-node-id="1:2" data-component="Button" data-variant="State=Default; Show icon=false" data-interactions="ON_CLICK NODE NAVIGATE Next \(9:9\)" state="Default" showIcon=\{false\} text="Continue" \/>/);
  assert.equal(res.connected.length, 1);
  const off = code(frame([button]));
  assert.doesNotMatch(off, /AppPrimaryButton/);
});

test('names with quotes stay valid JSX', () => {
  const out = code(frame([{ id: '1:2', name: 'Say "hi"', type: 'FRAME', x: 0, y: 0, width: 10, height: 10 }]));
  assert.match(out, /data-name=\{"Say \\"hi\\""\}/);
});

test('runs share their common styles on the paragraph', () => {
  const run = (characters, color) => ({ characters, fontSize: 14, fontName: { family: 'Inter', style: 'Semi Bold' },
    lineHeight: { unit: 'PIXELS', value: 22 }, fills: [solid(color)] });
  const out = code(frame([{ id: '1:2', name: 'T', type: 'TEXT', x: 0, y: 0, width: 128, height: 22, characters: 'Ton x1',
    textAutoResize: 'WIDTH_AND_HEIGHT', segments: [run('Ton ', black), run('x1', { r: 1, g: 0, b: 0, a: 1 })] }]));
  assert.match(out, /<p className="[^"]*font-\['Inter:Semi_Bold',sans-serif\] text-\[14px\] leading-\[22px\]/);
  assert.match(out, /<span className="text-\[#000000\]">\{"Ton "\}<\/span><span className="text-\[#ff0000\]">x1<\/span>/);
});

test('an SVG larger than its layer keeps its own size and offset', () => {
  const out = code(frame([{ id: '1:2', name: 'Ring', type: 'ELLIPSE', x: 10, y: 10, width: 20, height: 20,
    svg: '<svg/>', svgBounds: { x: 9, y: 9, width: 22, height: 22 } }]));
  assert.match(out, /<img alt="" className="absolute max-w-none left-\[-1px\] top-\[-1px\] w-\[22px\] h-\[22px\]"/);
});

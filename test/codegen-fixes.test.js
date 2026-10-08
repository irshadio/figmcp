// Regression tests for the conversion issues in UI_CONVERSION_REPORT.md.
import assert from 'node:assert/strict';
import test from 'node:test';
import { toReactTailwind } from '../src/codegen/react.js';

const assets = {
  svg: () => 'U.svg',
  image: () => 'U.png',
  imageSize: () => ({ width: 10, height: 20 }),
  render: () => 'R.png',
};
const black = { r: 0, g: 0, b: 0, a: 1 };
const red = { r: 1, g: 0, b: 0, a: 1 };
const solid = (color = black, extra = {}) => ({ type: 'SOLID', visible: true, color, ...extra });
const shadow = (type, extra = {}) => ({ type, visible: true, radius: 8, offset: { x: 0, y: 4 }, spread: 0,
  color: { r: 0, g: 0, b: 0, a: 0.5 }, ...extra });

function frame(children, extra = {}) {
  return { id: '1:1', name: 'Root', type: 'FRAME', x: 0, y: 0, width: 200, height: 100, children, ...extra };
}

function text(characters, extra = {}, seg = {}) {
  return {
    id: '2:1', name: 'T', type: 'TEXT', x: 0, y: 0, width: 100, height: 60, characters,
    textAutoResize: 'WIDTH_AND_HEIGHT',
    segments: [{ characters, fontSize: 16, fontName: { family: 'Inter', style: 'Regular' },
      lineHeight: { unit: 'PIXELS', value: 20 }, fills: [solid()], ...seg }],
    ...extra,
  };
}

function code(root, opts) {
  return toReactTailwind(root, assets, opts).code;
}

test('A1: opacity 0 hides the layer', () => {
  assert.match(code(frame([{ id: '1:2', name: 'Ghost', type: 'FRAME', x: 0, y: 0, width: 10, height: 10, opacity: 0, fills: [solid()] }])),
    /opacity-\[0\]/);
});

test('A2: a wrapping row keeps its own vertical gap, 0 when not given', () => {
  const row = (extra) => code(frame([], { layoutMode: 'HORIZONTAL', layoutWrap: 'WRAP', itemSpacing: 8, ...extra }));
  const zero = row({ counterAxisSpacing: 0 });
  assert.match(zero, /gap-x-\[8px\]/);
  assert.match(zero, /gap-y-\[0px\]/);
  assert.doesNotMatch(zero, / gap-\[/);
  assert.match(row({}), /gap-y-\[0px\]/, 'older exports dropped a 0 gap');
  assert.match(row({ counterAxisSpacing: 12 }), /gap-y-\[12px\]/);
});

test('A3: grid anchors at 0 are placed; negative anchors are ignored', () => {
  const cell = (id, extra) => ({ id, name: id, type: 'FRAME', x: 0, y: 0, width: 50, height: 20, ...extra });
  const grid = { layoutMode: 'GRID', gridColumnCount: 2, gridRowCount: 2 };
  const out = code(frame([cell('5:1', { gridColumnAnchorIndex: 1 }), cell('5:2', { gridColumnAnchorIndex: 0, gridRowAnchorIndex: 0 })], grid));
  assert.match(out, /col-start-\[1\] row-start-\[1\][^"]*" data-name="5:2"/);
  // Older exports dropped anchor 0: a sibling with an anchor shows anchors were exported.
  const old = code(frame([cell('5:1', { gridColumnAnchorIndex: 1 }), cell('5:2', {})], grid));
  assert.match(old, /col-start-\[1\] row-start-\[1\][^"]*" data-name="5:2"/);
  assert.match(old, /col-start-\[2\] row-start-\[1\]/);
  assert.doesNotMatch(code(frame([cell('5:1', { gridColumnAnchorIndex: -1, gridRowAnchorIndex: -1 })], grid)), /col-start/);
});

test('A4: a stroke with weight 0 draws nothing', () => {
  const out = code(frame([], { strokes: [solid(red)], strokeWeight: 0 }));
  assert.doesNotMatch(out, /border/);
  assert.doesNotMatch(code(frame([], { strokes: [solid(red)] })), /border/, 'older exports dropped a 0 weight');
});

test('B1: empty paragraphs are one blank line; a trailing one is kept', () => {
  const out = code(frame([text('A\n\nB')]));
  assert.doesNotMatch(out, /<br/);
  assert.match(out, /A\{"\\n"\}\n\s*\{"\\n"\}\n\s*B/);
  const trailing = code(frame([text('A\n')]));
  assert.match(trailing, /A\{"\\n"\}\n\s*\{"\\n"\}/);
});

test('B2: paragraph spacing is not counted as line height', () => {
  const t = text('A\nB', { height: 58, paragraphSpacing: 20 }, { lineHeight: { unit: 'AUTO' } });
  const out = code(frame([t]));
  assert.match(out, /leading-\[19px\]/);
  assert.match(out, /mb-\[20px\]/);
});

test('B3: a drop shadow on text follows the glyphs', () => {
  const out = code(frame([text('Hi', { effects: [shadow('DROP_SHADOW')] })]));
  assert.match(out, /\[text-shadow:0px_4px_8px_rgba\(0,0,0,0\.5\)\]/);
  assert.doesNotMatch(out, / shadow-\[/);
});

test('B4: soft line breaks (U+2028) break the line', () => {
  const out = code(frame([text('A\u2028B')]));
  assert.match(out, /A\{"\\n"\}B|A\{"\\n"\}\n\s*B/);
  assert.match(out, /whitespace-pre/);
});

test('B5: cap-height trim uses text-box instead of the trimmed box height', () => {
  const t = text('Go', { height: 8, leadingTrim: 'CAP_HEIGHT' }, { fontSize: 12, lineHeight: { unit: 'AUTO' } });
  const out = code(frame([t]));
  assert.match(out, /\[text-box:trim-both_cap_alphabetic\]/);
  assert.doesNotMatch(out, /leading-\[8px\]/);
});

test('B6: list paragraphs keep their bullets and numbers', () => {
  const t = text('One\nTwo', { textAutoResize: 'HEIGHT' }, { listOptions: { type: 'UNORDERED' }, indentation: 1 });
  const out = code(frame([t]));
  assert.match(out, /<ul className="[^"]*list-disc/);
  assert.match(out, /<li>One<\/li>/);
  const ordered = code(frame([text('One\nTwo', { textAutoResize: 'HEIGHT' }, { listOptions: { type: 'ORDERED' }, indentation: 1 })]));
  assert.match(ordered, /<ol className="[^"]*list-decimal/);
});

test('B8: spaces are preserved and hugging multi-line text never wraps', () => {
  const spaced = code(frame([text('A  B')]));
  assert.match(spaced, /whitespace-pre/);
  const hug = code(frame([text('A\nB')]));
  assert.match(hug, /whitespace-pre /);
  assert.doesNotMatch(hug, /whitespace-nowrap/);
  assert.doesNotMatch(hug, /whitespace-pre-wrap/);
});

test('B9: text strokes and the topmost fill are drawn', () => {
  const t = text('Hi', { strokes: [solid(red)], strokeWeight: 2, strokeAlign: 'OUTSIDE' },
    { fills: [solid(black), solid(red)] });
  const out = code(frame([t]));
  assert.match(out, /text-\[#ff0000\]/);
  assert.match(out, /\[-webkit-text-stroke:4px_#ff0000\]/);
  assert.match(out, /\[paint-order:stroke_fill\]/);
});

test('C1: outside strokes stay visible on clipping frames, with a matching radius', () => {
  const out = code(frame([{ id: '1:2', name: 'Card', type: 'FRAME', x: 10, y: 10, width: 50, height: 50, clipsContent: true,
    cornerRadius: 8, strokeWeight: 4, strokeAlign: 'OUTSIDE', strokes: [solid(red)], children: [] }]));
  assert.match(out, /outline-\[4px\]/);
  assert.match(out, /outline-\[#ff0000\]/);
  const open = code(frame([{ id: '1:2', name: 'Card', type: 'FRAME', x: 10, y: 10, width: 50, height: 50,
    cornerRadius: 8, strokeWeight: 4, strokeAlign: 'OUTSIDE', strokes: [solid(red)] }]));
  assert.match(open, /inset-\[-4px\][^"]*rounded-\[12px\]/);
});

test('C2: drop-shadow filters use half the radius (a standard deviation)', () => {
  const out = code(frame([{ id: '1:2', name: 'G', type: 'FRAME', x: 0, y: 0, width: 50, height: 50,
    effects: [shadow('DROP_SHADOW', { radius: 16 })],
    children: [{ id: '1:3', name: 'Dot', type: 'FRAME', x: 0, y: 0, width: 10, height: 10, fills: [solid()] }] }]));
  assert.match(out, /drop-shadow-\[0px_4px_8px_rgba\(0,0,0,0\.5\)\]/);
});

test('C3: inner shadows stay above image fills', () => {
  const out = code(frame([], { fills: [{ type: 'IMAGE', visible: true, scaleMode: 'FILL', imageHash: 'h' }],
    effects: [shadow('INNER_SHADOW')] }));
  const img = out.indexOf('<img');
  const inner = out.indexOf('shadow-[inset');
  assert.ok(img > 0 && inner > img, 'the inner shadow is drawn after the image');
});

test('C4: fill blend modes are kept', () => {
  const out = code(frame([], { fills: [solid(red, { blendMode: 'MULTIPLY' })] }));
  assert.match(out, /mix-blend-multiply/);
});

test('C7: per-side outside strokes are offset per side', () => {
  const out = code(frame([], { strokeWeight: 'mixed', strokeTopWeight: 2, strokeBottomWeight: 0, strokeLeftWeight: 0,
    strokeRightWeight: 0, strokeAlign: 'OUTSIDE', strokes: [solid(red)] }));
  assert.match(out, /top-\[-2px\] right-0 bottom-0 left-0/);
  assert.match(out, /border-t-\[2px\]/);
});

test('D1: negative spacing skips absolute siblings', () => {
  const out = code(frame([
    { id: '3:1', name: 'Badge', type: 'FRAME', x: 0, y: 0, width: 10, height: 10, layoutPositioning: 'ABSOLUTE' },
    { id: '3:2', name: 'A', type: 'FRAME', x: 0, y: 0, width: 20, height: 20 },
    { id: '3:3', name: 'B', type: 'FRAME', x: 12, y: 0, width: 20, height: 20 },
  ], { layoutMode: 'HORIZONTAL', itemSpacing: -8 }));
  assert.doesNotMatch(out, /ml-\[-8px\][^\n]*data-name="A"/);
  assert.match(out, /ml-\[-8px\][^\n]*data-name="B"/);
});

test('D3: mirrored layers keep their mirror', () => {
  const out = code(frame([{ id: '1:2', name: 'Photo', type: 'RECTANGLE', x: 10, y: 10, width: 40, height: 20,
    transform: [[-1, 0], [0, 1]], rawWidth: 40, rawHeight: 20, fills: [solid()] }]));
  assert.match(out, /\[transform:matrix\(-1,0,0,1,0,0\)\]/);
});

test('D5: a straight line becomes a box that follows its layout', () => {
  const line = { id: '1:2', name: 'Divider', type: 'LINE', x: 0, y: 20, width: 200, height: 0, svg: '<svg/>',
    strokes: [solid(red)], strokeWeight: 1, strokeAlign: 'CENTER', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FIXED' };
  const out = code(frame([line], { layoutMode: 'VERTICAL' }));
  assert.match(out, /relative shrink-0 w-full h-\[0px\]/, 'a line takes no height in the layout, as in Figma');
  assert.match(out, /absolute left-0 right-0 top-\[-0\.5px\] h-\[1px\] bg-\[#ff0000\]/);
  assert.doesNotMatch(out, /<img/);
});

test('malformed layers render as placeholders instead of failing the frame', () => {
  const res = toReactTailwind(frame([
    { id: '9:1', name: 'Broken', type: 'FRAME', x: 0, y: 0, width: 10, height: 10, fills: [{ type: 'SOLID', visible: true }] },
    { id: '9:2', name: 'Bad text', type: 'TEXT', x: 0, y: 0, width: 10, height: 10, segments: 'mixed', characters: 5 },
    { id: '9:3', name: 'Errored', type: 'FRAME', error: 'Error: boom' },
    { id: '9:4', name: 'Fine', type: 'FRAME', x: 0, y: 0, width: 10, height: 10 },
  ]), assets);
  assert.match(res.code, /data-name="Fine"/);
  assert.match(res.code, /data-name="Errored"/);
  assert.ok(res.warnings.some((w) => w.id === '9:3'));
});

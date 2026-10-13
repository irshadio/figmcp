import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlugin, makeNode, MIXED } from './fake-figma.js';

const solid = { type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 }, opacity: 1, blendMode: 'NORMAL' };

function find(tree, id) {
  if (tree.id === id) return tree;
  for (const c of tree.children || []) {
    const hit = find(c, id);
    if (hit) return hit;
  }
  return null;
}

test('zero values survive serialisation; defaults and non-grid anchors are dropped', async () => {
  const root = makeNode({
    id: '1:1', type: 'FRAME', box: [0, 0, 200, 100], layoutMode: 'HORIZONTAL', layoutWrap: 'WRAP',
    itemSpacing: 8, counterAxisSpacing: 0, opacity: 1, fills: [solid], strokes: [],
    children: [
      { id: '1:2', type: 'FRAME', box: [0, 0, 10, 10], opacity: 0, fills: [solid], strokes: [solid],
        strokeWeight: 0, gridRowAnchorIndex: -1, gridColumnAnchorIndex: -1, gridRowSpan: 1 },
      { id: '1:3', type: 'FRAME', box: [20, 0, 10, 10], layoutMode: 'GRID', gridRowCount: 2, gridColumnCount: 2,
        gridRowAnchorIndex: -1,
        children: [{ id: '1:4', type: 'FRAME', box: [20, 0, 5, 5], gridRowAnchorIndex: 0, gridColumnAnchorIndex: 0,
          gridRowSpan: 1, gridColumnSpan: 1 }] },
    ],
  });
  const { request } = loadPlugin(root);
  const { tree } = await request('node', { id: '1:1' });
  assert.equal(tree.counterAxisSpacing, 0);
  assert.equal('opacity' in tree, false, 'opacity 1 is the default');
  const hidden = find(tree, '1:2');
  assert.equal(hidden.opacity, 0);
  assert.equal(hidden.strokeWeight, 0);
  assert.equal('gridRowAnchorIndex' in hidden, false, 'not a grid child');
  const cell = find(tree, '1:4');
  assert.equal(cell.gridRowAnchorIndex, 0);
  assert.equal(cell.gridColumnAnchorIndex, 0);
  assert.equal(find(tree, '1:3').gridRowCount, 2);
});

test('a hung export times out without holding the read', async () => {
  const root = makeNode({
    id: '1:1', type: 'FRAME', box: [0, 0, 300, 300],
    children: [
      { id: '1:2', type: 'VECTOR', box: [0, 0, 10, 10], exportAsync: () => new Promise(() => {}) },
      { id: '1:3', type: 'VECTOR', box: [10, 0, 10, 10] },
    ],
  });
  const { request } = loadPlugin(root);
  const started = Date.now();
  const result = await request('node', { id: '1:1', exportTimeout: 50 });
  assert.ok(Date.now() - started < 2000);
  assert.equal(find(result.tree, '1:2').svg, undefined);
  assert.equal(find(result.tree, '1:3').svg, '<svg id="1:3"/>');
  assert.equal(result.failures[0].id, '1:2');
});

test('only groups with a real vector are icons', async () => {
  const dot = (id, x) => ({ id, type: 'ELLIPSE', box: [x, 0, 6, 6], fills: [solid] });
  const root = makeNode({
    id: '1:1', type: 'FRAME', box: [0, 0, 300, 40],
    children: [
      { id: '1:2', type: 'FRAME', box: [0, 0, 30, 6], children: [dot('1:3', 0), dot('1:4', 10), dot('1:5', 20)] },
      { id: '1:6', type: 'FRAME', box: [40, 0, 24, 24], children: [{ id: '1:7', type: 'VECTOR', box: [42, 2, 20, 20] }] },
    ],
  });
  const { request } = loadPlugin(root);
  const { tree } = await request('node', { id: '1:1' });
  assert.equal(find(tree, '1:2').svg, undefined, 'dots stay boxes');
  assert.equal(find(tree, '1:3').type, 'ELLIPSE');
  assert.match(find(tree, '1:6').svg, /<svg/);
  assert.equal(find(tree, '1:6').children, undefined, 'an icon stops at its SVG');
});

test('mirrored layers carry their transform and raw size', async () => {
  const root = makeNode({
    id: '1:1', type: 'FRAME', box: [0, 0, 100, 100],
    children: [{ id: '1:2', type: 'RECTANGLE', box: [10, 10, 40, 20], relativeTransform: [[-1, 0, 50], [0, 1, 10]],
      fills: [{ type: 'IMAGE', visible: true, scaleMode: 'FILL', imageHash: 'h' }] }],
  });
  const { request } = loadPlugin(root);
  const { tree } = await request('node', { id: '1:1' });
  const rect = find(tree, '1:2');
  assert.deepEqual(rect.transform, [[-1, 0], [0, 1]]);
  assert.equal(rect.rawWidth, 40);
});

test('text keeps its styling when newer segment fields are not supported', async () => {
  const seg = { characters: 'Hi', start: 0, end: 2, fontSize: 14, fontName: { family: 'Inter', style: 'Regular' } };
  const root = makeNode({
    id: '1:1', type: 'TEXT', box: [0, 0, 20, 17], characters: 'Hi', textAutoResize: 'WIDTH_AND_HEIGHT',
    getStyledTextSegments: (fields) => {
      if (fields.includes('listOptions')) throw new Error('Invalid field listOptions');
      return [seg];
    },
  });
  const { request } = loadPlugin(root);
  const { tree } = await request('node', { id: '1:1' });
  assert.equal(tree.segments[0].fontSize, 14);
  assert.equal(tree.segmentsError, undefined);
});

test('a read stops at maxNodes and says it was truncated', async () => {
  const kids = Array.from({ length: 5 }, (_, i) => ({ id: `2:${i}`, type: 'FRAME', box: [0, 0, 5, 5],
    children: [{ id: `3:${i}`, type: 'FRAME', box: [0, 0, 1, 1] }] }));
  const root = makeNode({ id: '1:1', type: 'FRAME', box: [0, 0, 50, 50], children: kids });
  const { request } = loadPlugin(root);
  const result = await request('node', { id: '1:1', maxNodes: 3 });
  assert.equal(result.truncated, true);
});

test('mixed stroke weights keep per-side zeros', async () => {
  const root = makeNode({
    id: '1:1', type: 'FRAME', box: [0, 0, 50, 50], strokes: [solid], strokeWeight: MIXED,
    strokeTopWeight: 0, strokeBottomWeight: 1, strokeLeftWeight: 0, strokeRightWeight: 0,
  });
  const { request } = loadPlugin(root);
  const { tree } = await request('node', { id: '1:1' });
  assert.equal(tree.strokeWeight, 'mixed');
  assert.equal(tree.strokeTopWeight, 0);
  assert.equal(tree.strokeBottomWeight, 1);
});

test('run executes a script, summarises nodes and commits one undo step', async () => {
  const { request, figma } = loadPlugin(makeNode({ id: '1:1', type: 'FRAME' }));
  const out = await request('run', {
    code: 'const f = figma.createFrame(); f.name = "Card"; console.log("made", { w: f.width });' +
      'return { frame: f, list: [1, figma.mixed], fn() {} };',
  });
  assert.equal(out.result.frame.name, 'Card');
  assert.equal(out.result.frame.type, 'FRAME');
  assert.equal(out.result.frame.width, 100);
  assert.equal('parent' in out.result.frame, false);
  assert.deepEqual(out.result.list, [1, 'mixed']);
  assert.equal('fn' in out.result, false);
  assert.deepEqual(out.logs, ['made {"w":100}']);
  assert.equal(figma.undoSteps, 1);
});

test('run reports syntax errors, thrown errors with logs, and Dev Mode', async () => {
  const { request, figma } = loadPlugin(makeNode({ id: '1:1', type: 'FRAME' }));
  await assert.rejects(request('run', { code: 'return (' }), /Script does not parse/);
  await assert.rejects(request('run', { code: 'console.log("step 1"); throw new Error("bad")' }),
    /bad\nLogs before the error:\nstep 1/);
  assert.equal(figma.undoSteps, 1);
  const dev = loadPlugin(makeNode({ id: '1:1', type: 'FRAME' }), { editorType: 'dev' });
  await assert.rejects(dev.request('run', { code: 'return 1' }), /Design mode/);
});

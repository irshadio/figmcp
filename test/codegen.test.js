import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { toMetadataXml } from '../src/codegen/metadata.js';
import { countNodes, toReactTailwind } from '../src/codegen/react.js';

const data = JSON.parse(fs.readFileSync(new URL('./fixtures/sample-export.json', import.meta.url)));
const tree = data.frames[0].tree;
const assets = {
  svg: () => 'http://localhost:1/assets/icon.svg',
  image: (hash) => (hash === 'abc123' ? 'http://localhost:1/assets/photo.png' : null),
};

test('generates a component with flex layout and exact values', () => {
  const { code, assets: map } = toReactTailwind(tree, assets);
  assert.match(code, /export default function SampleScreen\(\)/);
  assert.match(code, /className="relative w-\[200px\] h-\[120px\] flex flex-col gap-2 justify-start items-start px-4 py-3 bg-white overflow-clip"/);
  assert.match(code, /font-\['Inter',sans-serif\] font-semibold text-\[18px\] leading-\[24px\]/);
  assert.match(code, /\{"Hello \{you\}"\}/, 'braces are escaped for JSX');
  assert.match(code, /<button className="relative shrink-0 w-full h-10 flex gap-1.5 justify-center items-center px-3 bg-\[#0d99ff\] rounded-lg shadow-\[0px_4px_8px_0px_rgba\(0,0,0,0.25\)\] text-start cursor-pointer"[^>]* type="button">/);
  assert.match(code, /aria-hidden="true" className="absolute inset-0 pointer-events-none rounded-lg border border-\[rgba\(17,17,17,0.5\)\] border-solid"/);
  assert.match(code, /absolute left-\[150px\] w-10 top-\[90px\] h-5 rounded-\[4px\]/);
  assert.match(code, /data-component="Button\/Primary"/);
  assert.match(code, /data-node-id="I10:3;1:1"/);
  assert.doesNotMatch(code, /Hidden/);
  assert.deepEqual(Object.keys(map).sort(), ['imgArrow', 'imgPhoto']);
});

test('metadata xml uses parent-relative positions and marks hidden nodes', () => {
  const xml = toMetadataXml(tree);
  assert.match(xml, /^<frame id="10:1" name="Sample Screen" x="0" y="0" width="200" height="120">/);
  assert.match(xml, /<frame id="I10:3;1:1" name="Arrow" x="24" y="12" width="16" height="16" \/>/);
  assert.match(xml, /<rounded-rectangle id="10:4"/);
  assert.match(xml, /hidden="true"/);
});

test('counts visible nodes', () => {
  assert.equal(countNodes(tree), 6);
});

test('hugging icons keep their size', () => {
  const icon = {
    id: '1:2', name: 'Icon', type: 'FRAME', x: 4, y: 4, width: 20, height: 20,
    layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG', svg: '<svg/>',
  };
  const root = {
    id: '1:1', name: 'Row', type: 'FRAME', x: 0, y: 0, width: 28, height: 28,
    layoutMode: 'HORIZONTAL', children: [icon],
  };
  const { code } = toReactTailwind(root, assets);
  assert.match(code, /className="relative shrink-0 w-5 h-5" data-name="Icon"/);
});

test('gradient text is clipped to the glyphs', () => {
  const text = {
    id: '2:2', name: 'Label', type: 'TEXT', x: 0, y: 0, width: 60, height: 20,
    characters: 'Go', textAutoResize: 'WIDTH_AND_HEIGHT',
    segments: [{
      characters: 'Go', fontSize: 16,
      fills: [{
        type: 'GRADIENT_LINEAR', visible: true,
        gradientTransform: [[1, 0, 0], [0, 1, 0]],
        gradientStops: [
          { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
          { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
        ],
      }],
    }],
  };
  const root = { id: '2:1', name: 'Box', type: 'FRAME', x: 0, y: 0, width: 60, height: 20, children: [text] };
  const { code } = toReactTailwind(root, assets);
  assert.match(code, /bg-\[linear-gradient\(90deg,#ff0000_0%,#0000ff_100%\)\] bg-clip-text text-transparent/);
});

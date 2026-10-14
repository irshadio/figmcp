import assert from 'node:assert/strict';
import test from 'node:test';
import { searchScript } from '../src/tools/system.js';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function stubFigma() {
  const variant = (name) => ({ id: `1:${name}`, name, type: 'COMPONENT', width: 80, height: 40 });
  const set = { id: '1:1', name: 'Button', type: 'COMPONENT_SET', width: 200, height: 40, key: 'k1', description: 'Primary actions',
    componentPropertyDefinitions: {
      Size: { type: 'VARIANT', variantOptions: ['S', 'L'], defaultValue: 'S' },
      'Label#3:4': { type: 'TEXT', defaultValue: 'OK' },
    } };
  set.children = [variant('Size=S'), variant('Size=L')];
  set.children.forEach((c) => { c.parent = set; });
  const card = { id: '1:9', name: 'Card', type: 'COMPONENT', width: 300, height: 120, componentPropertyDefinitions: {}, parent: {} };
  const libMain = { name: 'Icon/Search', type: 'COMPONENT', key: 'lib1', remote: true, parent: {} };
  const inst = { id: '5:1', type: 'INSTANCE', getMainComponentAsync: async () => libMain };
  const page = {
    name: 'Page 1',
    findAllWithCriteria: ({ types }) => (types.includes('INSTANCE') ? [inst] : [set, ...set.children, card]),
  };
  const red = { r: 1, g: 0, b: 0 };
  return {
    currentPage: page,
    root: { children: [page] },
    getLocalPaintStylesAsync: async () => [{ id: 'S:1', name: 'brand/red', key: 'p1', paints: [{ type: 'SOLID', color: red, opacity: 1 }] }],
    getLocalTextStylesAsync: async () => [{ id: 'S:2', name: 'heading/h1', key: 't1', fontName: { family: 'Inter', style: 'Bold' }, fontSize: 32, lineHeight: { unit: 'AUTO' } }],
    getLocalEffectStylesAsync: async () => [],
    variables: {
      getLocalVariableCollectionsAsync: async () => [{ id: 'C1', name: 'Tokens', defaultModeId: 'm1', modes: [{ modeId: 'm1', name: 'Light' }] }],
      getLocalVariablesAsync: async () => [
        { id: 'V1', name: 'color/red', resolvedType: 'COLOR', variableCollectionId: 'C1', valuesByMode: { m1: { ...red, a: 1 } } },
        { id: 'V2', name: 'color/danger', resolvedType: 'COLOR', variableCollectionId: 'C1', valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'V1' } } },
      ],
    },
  };
}

async function search(params) {
  const run = new AsyncFunction('figma', searchScript({ query: '', kinds: ['components', 'styles', 'variables'], allPages: false, limit: 50, ...params }));
  return JSON.parse(await run(stubFigma()));
}

test('search_design_system lists components with properties, styles and variables', async () => {
  const all = await search({});
  assert.deepEqual(all.components.map((c) => c.name), ['Button', 'Card']);
  assert.deepEqual(all.components[0].properties, {
    Size: { type: 'VARIANT', options: ['S', 'L'], default: 'S' },
    Label: { type: 'TEXT', default: 'OK' },
  });
  assert.equal(all.components[0].variants, 2);
  assert.deepEqual(all.libraryComponents, [{ name: 'Icon/Search', type: 'COMPONENT', key: 'lib1', exampleInstance: '5:1', page: 'Page 1' }]);
  assert.deepEqual(all.styles.map((s) => s.value), ['#FF0000', 'Inter Bold 32/auto']);
  assert.deepEqual(all.variables.map((v) => v.value), ['#FF0000', { alias: 'color/red' }]);
});

test('search_design_system matches every query word and caps results', async () => {
  const hit = await search({ query: 'primary button' });
  assert.deepEqual(hit.components.map((c) => c.name), ['Button']);
  assert.deepEqual(hit.styles, []);
  const capped = await search({ kinds: ['components'], limit: 1 });
  assert.equal(capped.components.length, 1);
  assert.deepEqual(capped.truncated, ['components']);
  assert.equal(capped.styles, undefined);
  const bounded = await search({ kinds: ['components'], maxInstances: 0 });
  assert.equal(bounded.instancesNotScanned, true);
  assert.deepEqual(bounded.libraryComponents, []);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { coverage, designStates, HANDOFF } from '../src/coverage.js';
import { findChrome, keyboardProbe } from '../tools/visual-check.js';

const solid = (r, g, b) => [{ type: 'SOLID', visible: true, color: { r, g, b }, opacity: 1 }];
const label = (id, characters) => ({
  id, type: 'TEXT', name: characters, visible: true, x: 16, y: 14, width: 80, height: 20, characters,
  segments: [{ characters, fontSize: 16, fontName: { family: 'Inter', style: 'Medium' }, fills: solid(1, 1, 1) }],
});
const tap = [{ trigger: 'ON_CLICK', action: 'NODE', navigation: 'NAVIGATE', destination: { id: '9:9', name: 'Next' } }];

function screen(button) {
  return {
    id: '1:1', type: 'FRAME', name: 'Checkout', visible: true, x: 0, y: 0, width: 393, height: 852, fills: solid(1, 1, 1),
    children: [{
      id: '1:2', type: 'INSTANCE', name: 'Pay', visible: true, x: 24, y: 760, width: 345, height: 52, cornerRadius: 12,
      fills: solid(0.02, 0.33, 0.69), reactions: tap, children: [label('1:3', 'Pay now')], ...button,
    }],
  };
}

test('the states a component defines come from its variant options, booleans and prototype changes', () => {
  const states = designStates({
    componentProperties: {
      State: { type: 'VARIANT', value: 'Default', variantOptions: ['Default', 'Hover', 'Pressed', 'Disabled'] },
      'Loading#12:0': { type: 'BOOLEAN', value: false },
      Size: { type: 'VARIANT', value: 'Large', variantOptions: ['Large', 'Small'] },
    },
  });
  assert.equal(states.current, 'default');
  assert.equal(states.complete, true);
  assert.deepEqual([...states.defined.keys()].sort(), ['default', 'disabled', 'hover', 'loading', 'pressed']);
  assert.equal(states.defined.get('disabled'), 'State=Disabled');
  assert.equal(states.defined.get('loading'), 'Loading property');

  const proto = designStates({ reactions: [{ trigger: 'ON_HOVER', action: 'NODE', navigation: 'CHANGE_TO', destination: { id: '2:2' } }] });
  assert.equal(proto.defined.get('hover'), 'prototype hover');
});

test('a button that matches the design still lists its unchecked states, keyboard and screen-reader behaviour', () => {
  const tree = screen({ componentProperties: { State: { type: 'VARIANT', value: 'Default', variantOptions: ['Default', 'Disabled'] } } });
  const cov = coverage(tree, { framework: 'react', pixels: { differingPercent: 0.4 }, checkedLayers: 3 });
  assert.match(cov.checked[0], /default state at 393x852, light mode: 0\.4% of pixels differ/);
  assert.equal(cov.notChecked.length, 1);
  const pay = cov.notChecked[0];
  assert.match(pay.element, /^Pay now \(button, 1:2\)$/);
  assert.ok(pay.notChecked.includes('disabled state (in the design as State=Disabled; not rendered)'));
  assert.ok(pay.notChecked.includes('loading state (not in the design)'));
  assert.ok(pay.notChecked.includes('hover state (not in the design)'));
  assert.ok(pay.notChecked.some((s) => /accessible name/.test(s)));
  assert.ok(!pay.notChecked.some((s) => /^default state/.test(s)), 'the rendered state is not listed');
  assert.deepEqual(cov.screen.slice(0, 2), ['dark mode', 'widths other than 393']);
  assert.equal(cov.note, undefined);
});

test('an export without variant options says the design states may be incomplete', () => {
  const cov = coverage(screen({ componentProperties: { State: { type: 'VARIANT', value: 'Default' } } }), { framework: 'flutter' });
  assert.match(cov.note, /latest plugin/);
  assert.ok(cov.notChecked[0].notChecked.includes('disabled state (not in the design as far as the export shows)'));
  assert.ok(cov.notChecked[0].notChecked.some((s) => /TalkBack and VoiceOver label/.test(s)));
});

test('SwiftUI taps and Dynamic Type move items to checked', () => {
  const cov = coverage(screen({}), {
    framework: 'swiftui', pixels: { differingPercent: 1 }, dynamicType: 'accessibility3',
    interactions: { each: [{ label: 'Pay now', redrew: false, action: '.pay' }] },
  });
  assert.ok(cov.checked.includes('layout at Dynamic Type accessibility3'));
  assert.ok(cov.checked.includes('tapped 1 button'));
  assert.deepEqual(cov.notChecked[0].checked, ['tap: asked the owner .pay']);
  assert.ok(cov.notChecked[0].notChecked.some((s) => /VoiceOver label and button trait/.test(s)));
  assert.ok(!cov.screen.includes('other Dynamic Type sizes'));
});

test('keyboard findings mark what Tab, Enter and Space reached', () => {
  const keyboard = {
    tabOrder: ['Pay now'],
    elements: [
      { tag: 'button', node: '1:2', name: 'Pay now', tabIndex: 0, focusVisible: false, activates: true },
      { tag: 'div', name: 'Promo', clickableOnly: true, tabIndex: -1 },
    ],
  };
  const cov = coverage(screen({}), { framework: 'react', pixels: { differingPercent: 0 }, keyboard });
  const pay = cov.notChecked[0];
  assert.ok(pay.checked.includes('reached with Tab (stop 1)'));
  assert.ok(pay.checked.includes('Enter/Space activates it'));
  assert.ok(pay.checked.includes('accessible name "Pay now"'));
  assert.ok(pay.notChecked.includes('no visible focus indicator'));
  assert.ok(!pay.notChecked.some((s) => /accessible name read/.test(s)));
  assert.deepEqual(cov.notChecked[1], { element: 'Promo (clickable div)', notChecked: ['not reachable with Tab or operable by keyboard'] });
  assert.match(HANDOFF, /Not verified/);
});

const chrome = findChrome();
const puppeteer = await import('puppeteer-core').catch(() => null);

test('the keyboard probe finds the Tab order, focus indicators, activation and names in Chrome',
  { skip: chrome && puppeteer ? false : 'needs Chrome and puppeteer-core' }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figmcp-keys-'));
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, `<!doctype html><html><body><div id="root">
      <button data-node-id="1:2">Pay now</button>
      <button data-node-id="1:4" style="outline:none"><svg width="10" height="10"></svg></button>
      <div data-node-id="1:5" onclick="void 0" style="width:40px;height:20px">Promo</div>
      <div data-node-id="1:6" role="button" tabindex="0">Fake</div>
      <a href="#next" data-node-id="1:7">Details</a>
      <input placeholder="Email" data-node-id="1:8">
    </div></body></html>`);
    const browser = await puppeteer.default.launch({ executablePath: chrome, headless: true });
    try {
      const tab = await browser.newPage();
      await tab.goto(pathToFileURL(file).href);
      const k = await keyboardProbe(tab);
      const by = (node) => k.elements.find((e) => e.node === node);
      assert.deepEqual(k.tabOrder, ['Pay now', 'button', 'Fake', 'Details', 'Email']);
      assert.equal(by('1:2').focusVisible, true);
      assert.equal(by('1:2').activates, true);
      assert.equal(by('1:4').name, '');
      assert.equal(by('1:4').focusVisible, false);
      assert.equal(by('1:5').clickableOnly, true);
      assert.equal(by('1:5').tabIndex, -1);
      assert.equal(by('1:6').activates, false, 'a div with role=button needs its own key handling');
      assert.equal(by('1:7').activates, true);
      assert.equal(by('1:8').activates, undefined);
    } finally {
      await browser.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

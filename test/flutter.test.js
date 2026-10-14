import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { toFlutter } from '../src/codegen/flutter/index.js';
import { analyzeCode, findFlutter } from '../tools/flutter-check.js';

const data = JSON.parse(fs.readFileSync(new URL('./fixtures/sample-export.json', import.meta.url)));
const assets = {
  svg: () => '/tmp/icon.svg',
  image: (hash) => (hash === 'missing' ? null : `/tmp/${hash}.png`),
  imageExt: () => 'png',
  render: () => '/tmp/render.png',
};
const black = { r: 0, g: 0, b: 0, a: 1 };
const solid = (color = black, extra = {}) => ({ type: 'SOLID', visible: true, color, ...extra });

function frame(children, extra = {}) {
  return { id: '1:1', name: 'Root', type: 'FRAME', x: 0, y: 0, width: 200, height: 100, children, ...extra };
}

function text(characters, extra = {}, seg = {}) {
  return {
    id: '2:1', name: 'T', type: 'TEXT', x: 0, y: 0, width: 100, height: 20, characters,
    textAutoResize: 'WIDTH_AND_HEIGHT',
    segments: [{ characters, fontSize: 16, fontName: { family: 'Inter', style: 'Medium' }, fontWeight: 500,
      lineHeight: { unit: 'PIXELS', value: 20 }, fills: [solid()], ...seg }],
    ...extra,
  };
}

function dart(root, opts) {
  return toFlutter(root, assets, opts);
}

// A tree using most of what the generator draws, for the analyzer test.
function kitchenSink() {
  return frame([
    { id: '3:1', name: 'Card', type: 'FRAME', x: 10, y: 10, width: 150, height: 60, layoutMode: 'VERTICAL', itemSpacing: 8,
      paddingLeft: 12, paddingRight: 12, paddingTop: 10, paddingBottom: 10, cornerRadius: 12, clipsContent: true,
      primaryAxisSizingMode: 'FIXED', counterAxisSizingMode: 'FIXED',
      fills: [solid({ r: 1, g: 1, b: 1, a: 1 })], strokes: [solid()], strokeWeight: 1, strokeAlign: 'OUTSIDE',
      effects: [{ type: 'DROP_SHADOW', visible: true, radius: 8, offset: { x: 0, y: 2 }, color: { r: 0, g: 0, b: 0, a: 0.2 } },
        { type: 'BACKGROUND_BLUR', visible: true, radius: 10 }],
      vars: { itemSpacing: 'spacing/8', 'fill.0': 'surface/white' },
      children: [
        text('Title $1 \'x\'', { id: '3:2', x: 22, y: 20, layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', textAutoResize: 'HEIGHT' }),
        { id: '3:3', name: 'Row', type: 'FRAME', x: 22, y: 48, width: 126, height: 12, layoutMode: 'HORIZONTAL', itemSpacing: -4,
          layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', counterAxisAlignItems: 'CENTER',
          children: [
            { id: '3:4', name: 'Dot', type: 'ELLIPSE', x: 22, y: 48, width: 12, height: 12, fills: [solid()] },
            { id: '3:5', name: 'Dot 2', type: 'ELLIPSE', x: 30, y: 48, width: 12, height: 12, fills: [solid()] },
          ] },
      ] },
    { id: '4:1', name: 'Icon', type: 'VECTOR', x: 170, y: 10, width: 16, height: 16, svg: '<svg/>', constraints: { horizontal: 'MAX', vertical: 'MIN' } },
    { id: '4:2', name: 'Photo', type: 'RECTANGLE', x: 0, y: 80, width: 40, height: 20, cornerRadius: 4, opacity: 0.5,
      fills: [{ type: 'IMAGE', visible: true, scaleMode: 'CROP', imageHash: 'h', imageTransform: [[0.5, 0, 0.25], [0, 0.5, 0.1]] }],
      constraints: { horizontal: 'SCALE', vertical: 'MAX' } },
    { id: '4:3', name: 'Badge', type: 'FRAME', x: 80, y: 80, width: 40, height: 20, constraints: { horizontal: 'CENTER', vertical: 'CENTER' },
      fills: [{ type: 'GRADIENT_LINEAR', visible: true, gradientTransform: [[1, 0, 0], [0, 1, 0]],
        gradientStops: [{ position: 0, color: black }, { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } }] }] },
    { id: '4:4', name: 'Divider', type: 'LINE', x: 0, y: 75, width: 200, height: 0, strokes: [solid()], strokeWeight: 1,
      constraints: { horizontal: 'STRETCH', vertical: 'MIN' } },
    text('Gradient', { id: '4:5', x: 120, y: 30, segments: [{ characters: 'Gradient', fontSize: 14, fontName: { family: 'Onest', style: 'Bold' },
      fills: [{ type: 'GRADIENT_LINEAR', visible: true, gradientTransform: [[1, 0, 0], [0, 1, 0]],
        gradientStops: [{ position: 0, color: black }, { position: 1, color: { r: 1, g: 0, b: 0, a: 1 } }] }] }] }),
    text('Go', { id: '4:6', x: 150, y: 50, height: 8, leadingTrim: 'CAP_HEIGHT' }, { lineHeight: { unit: 'AUTO' } }),
    { id: '4:7', name: 'Tilted', type: 'RECTANGLE', x: 150, y: 60, width: 20, height: 40, rawWidth: 40, rawHeight: 20,
      transform: [[0, 1], [-1, 0]], fills: [solid()] },
    { id: '4:8', name: 'Mirror', type: 'RECTANGLE', x: 175, y: 60, width: 20, height: 20, rawWidth: 20, rawHeight: 20,
      transform: [[-1, 0], [0, 1]], fills: [solid()] },
    { id: '4:9', name: 'Pressed', type: 'RECTANGLE', x: 0, y: 0, width: 30, height: 30, cornerRadius: 6, blendMode: 'MULTIPLY',
      fills: [solid(), solid({ r: 1, g: 0, b: 0, a: 1 }, { blendMode: 'SCREEN' })],
      effects: [{ type: 'INNER_SHADOW', visible: true, radius: 4, spread: 1, offset: { x: 0, y: 2 }, color: { r: 0, g: 0, b: 0, a: 0.3 } }] },
  ], { fills: [solid({ r: 0.95, g: 0.95, b: 0.95, a: 1 })] });
}

test('a frame becomes a widget with exact layout, paints and assets', () => {
  const res = dart(data.frames[0].tree);
  assert.match(res.code, /^import 'package:flutter\/material.dart';/m);
  assert.match(res.code, /class SampleScreen extends StatelessWidget \{\n {2}const SampleScreen\(\{super.key\}\);/);
  assert.match(res.code, /Column\(\n\s+mainAxisSize: MainAxisSize.min,|Column\(/);
  assert.match(res.code, /spacing: 8,/);
  assert.match(res.code, /padding: const EdgeInsets.symmetric\(horizontal: 16, vertical: 12\)/);
  assert.match(res.code, /'Hello \{you\}'/);
  assert.match(res.code, /fontFamily: 'Inter',\s+fontSize: 18,\s+fontWeight: FontWeight.w600,\s+height: 1.3333,\s+leadingDistribution: TextLeadingDistribution.even/);
  assert.match(res.code, /BoxShadow\(\s+color: Color\(0x40000000\),\s+offset: Offset\(0, 4\),\s+blurRadius: 6.06,/);
  assert.match(res.code, /foregroundDecoration: BoxDecoration\(\s+border: const Border.fromBorderSide\(\s+BorderSide\(color: Color\(0x80111111\), width: 1\),/);
  assert.match(res.code, /Positioned\(\s+left: 150,\s+top: 90,\s+width: 40,\s+height: 20,/);
  assert.match(res.code, /AssetImage\('assets\/figma\/photo.png'\)/);
  assert.doesNotMatch(res.code, /Hidden/);
  assert.deepEqual(res.assets, { 'assets/figma/arrow.svg': '/tmp/icon.svg', 'assets/figma/photo.png': '/tmp/abc123.png' });
  assert.deepEqual(res.fonts, { Inter: ['500', '600'] });
  assert.deepEqual(res.warnings, []);
});

test('keys only add keys', () => {
  const tree = kitchenSink();
  const plain = dart(tree).code;
  const keyed = dart(tree, { keys: true }).code;
  assert.match(keyed, /key: ValueKey\('3:2'\)/);
  const strip = (c) => c.replace(/const /g, '').replace(/key: ValueKey\('[^']*'\),?/g, '')
    .replace(/KeyedSubtree\(\s*child:/g, '(').replace(/[\s,()]/g, '');
  assert.equal(strip(keyed).length > 0, true);
  // Every keyed layer is either the same widget with a key, or wrapped in a KeyedSubtree.
  assert.equal(strip(plain), strip(keyed));
});

test('constraints place Stack children', () => {
  const kid = (id, constraints, extra = {}) => ({ id, name: id, type: 'FRAME', x: 150, y: 70, width: 40, height: 20, constraints, fills: [solid()], ...extra });
  const out = dart(frame([
    kid('1:2', { horizontal: 'MAX', vertical: 'MAX' }),
    kid('1:3', { horizontal: 'CENTER', vertical: 'CENTER' }),
    kid('1:4', { horizontal: 'STRETCH', vertical: 'MIN' }),
    kid('1:5', { horizontal: 'SCALE', vertical: 'SCALE' }),
  ])).code;
  assert.match(out, /Positioned\(\s+right: 10,\s+bottom: 10,\s+width: 40,\s+height: 20,/);
  assert.match(out, /Positioned.fill\(\s+child: Center\(\s+child: Transform.translate\(\s+offset: const Offset\(70, 30\),/);
  assert.match(out, /Positioned\(\s+left: 150,\s+top: 70,\s+right: 10,\s+height: 20,/);
  assert.match(out, /FractionallySizedBox\(\s+widthFactor: 0.2,\s+heightFactor: 0.2,/);
  // Scaled: aligned where it sits in the parent's free space (150 of 160, 70 of 80).
  assert.match(out, /Align\(\s+alignment: (const )?Alignment\(0.875, 0.75\)/);
});

test('auto-layout sizing: fill, hug, stretch and intrinsic sizes', () => {
  const child = (id, h, v, extra = {}) => ({ id, name: id, type: 'FRAME', x: 0, y: 0, width: 50, height: 20,
    layoutSizingHorizontal: h, layoutSizingVertical: v, fills: [solid()], ...extra });
  const column = dart(frame([child('1:2', 'FILL', 'FIXED'), child('1:3', 'FILL', 'FILL')],
    { layoutMode: 'VERTICAL', primaryAxisSizingMode: 'FIXED', counterAxisSizingMode: 'FIXED' })).code;
  assert.match(column, /crossAxisAlignment: CrossAxisAlignment.stretch/);
  assert.match(column, /Expanded\(/);
  const mixed = dart(frame([child('1:2', 'FILL', 'FIXED'), child('1:3', 'FIXED', 'FIXED')],
    { layoutMode: 'VERTICAL', layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'FIXED' })).code;
  assert.match(mixed, /IntrinsicWidth\(/);
  assert.match(mixed, /width: double.infinity/);
  assert.match(mixed, /crossAxisAlignment: CrossAxisAlignment.start/);
});

test('content larger than a fixed frame overflows it without an error', () => {
  const out = dart(frame([
    { id: '1:2', name: 'Card', type: 'FRAME', x: 0, y: 0, width: 100, height: 30, layoutMode: 'HORIZONTAL',
      primaryAxisSizingMode: 'AUTO', counterAxisSizingMode: 'FIXED', counterAxisAlignItems: 'CENTER',
      children: [text('Resend', { id: '1:3', height: 40 })] },
  ])).code;
  assert.match(out, /IntrinsicWidth\(\s+child: OverflowBox\(\s+alignment: Alignment.centerLeft,\s+minHeight: 0,\s+maxHeight: double.infinity,/);
});

test('text: runs, trim, paragraphs, case, spacing and truncation', () => {
  const runs = dart(frame([{ ...text('Ton x1'), segments: [
    { characters: 'Ton ', fontSize: 14, fontName: { family: 'Inter', style: 'Semi Bold' }, fontWeight: 600, fills: [solid()] },
    { characters: 'x1', fontSize: 14, fontName: { family: 'Inter', style: 'Semi Bold' }, fontWeight: 600, fills: [solid({ r: 1, g: 0, b: 0, a: 1 })] },
  ] }])).code;
  assert.match(runs, /Text.rich\(\s+TextSpan\(\s+children: \[\s+TextSpan\(\s+text: 'Ton ',\s+style: TextStyle\(color: Color\(0xFF000000\)\)/);
  assert.match(runs, /style: TextStyle\(\s+fontFamily: 'Inter',\s+fontSize: 14,\s+fontWeight: FontWeight.w600,/);

  const trim = dart(frame([text('Go', { height: 8, leadingTrim: 'CAP_HEIGHT' }, { lineHeight: { unit: 'AUTO' } })])).code;
  assert.match(trim, /Baseline\(\s+baseline: 8,\s+baselineType: TextBaseline.alphabetic,/);

  const paras = dart(frame([text('One\nTwo', { textAutoResize: 'HEIGHT', paragraphSpacing: 6 })])).code;
  assert.match(paras, /spacing: 6,\s+children: \[\s+Text\(\s+'One'/);

  const upper = dart(frame([text('hello world', {}, { textCase: 'UPPER', letterSpacing: { unit: 'PERCENT', value: 2 } })])).code;
  assert.match(upper, /'HELLO WORLD'/);
  assert.match(upper, /letterSpacing: 0.32/);
  assert.match(upper, /softWrap: false/);

  // Zero spacing is written out, so a theme's spacing is not inherited.
  assert.match(dart(frame([text('Plain')])).code, /letterSpacing: 0,/);

  const soft = dart(frame([text('A B')])).code;
  assert.match(soft, /'A\\nB'/);

  const clamp = dart(frame([text('A long line', { textAutoResize: 'HEIGHT', maxLines: 2, textTruncation: 'ENDING' })])).code;
  assert.match(clamp, /maxLines: 2,\s+overflow: TextOverflow.ellipsis/);
});

test('variables become DesignTokens', () => {
  const res = dart(frame([], { fills: [solid({ r: 0.035, g: 0.071, b: 0.176, a: 1 })], vars: { 'fill.0': 'primary/900' },
    layoutMode: 'HORIZONTAL', itemSpacing: 16, primaryAxisSizingMode: 'FIXED', counterAxisSizingMode: 'FIXED' }));
  assert.match(res.code, /color: DesignTokens.primary900/);
  assert.match(res.code, /abstract final class DesignTokens \{\n {2}static const Color primary900 = Color\(0xFF09122D\); \/\/ primary\/900/);
  assert.deepEqual(res.tokens, [{ name: 'primary/900', dart: 'DesignTokens.primary900', value: 'Color(0xFF09122D)' }]);
});

test('unreadable layers are drawn as empty boxes and reported', () => {
  const res = dart(frame([
    { id: '9:1', name: 'Broken', type: 'FRAME', x: 0, y: 0, width: 10, height: 10, fills: [{ type: 'SOLID', visible: true }] },
    { id: '9:2', name: 'Errored', type: 'FRAME', error: 'Error: boom' },
    { id: '9:3', name: 'Fine', type: 'FRAME', x: 0, y: 0, width: 10, height: 10, fills: [solid()] },
    { id: '9:4', name: 'No image', type: 'RECTANGLE', x: 0, y: 0, width: 10, height: 10,
      fills: [{ type: 'IMAGE', visible: true, scaleMode: 'FILL', imageHash: 'missing' }] },
  ]));
  assert.match(res.code, /Color\(0xFF000000\)/);
  assert.deepEqual(res.warnings.map((w) => w.id).sort(), ['9:1', '9:2', '9:4']);
  assert.match(res.warnings.find((w) => w.id === '9:2').message, /drawn as an empty box/);
});

test('the generated code passes the Flutter analyzer', { timeout: 240000 }, (t) => {
  const flutter = findFlutter(process.env.FLUTTER);
  if (!flutter) {
    t.skip('flutter is not installed');
    return;
  }
  const dir = path.join(os.tmpdir(), 'figma-local-flutter-analyze');
  const screen = { ...kitchenSink(), width: 393, height: 1400, numberOfFixedChildren: 1 };
  const codes = [dart(data.frames[0].tree).code, dart(kitchenSink(), { keys: true }).code, dart(kitchenSink()).code,
    dart(screen).code, dart(screen, { keys: true }).code];
  for (const code of codes) {
    const issues = analyzeCode(flutter, code, dir);
    assert.deepEqual(issues, [], `analyzer issues:\n${JSON.stringify(issues, null, 2)}\n${code}`);
  }
});

test('a phone screen fills the screen, scrolls when tall and keeps fixed layers on top', () => {
  const header = { id: '5:9', name: 'Header', type: 'FRAME', x: 0, y: 0, width: 393, height: 60, fills: [solid()] };
  const body = { id: '5:2', name: 'Body', type: 'FRAME', x: 16, y: 80, width: 361, height: 1800, fills: [solid()] };
  const badge = { id: '5:3', name: 'Badge', type: 'FRAME', x: 300, y: 90, width: 40, height: 20, fills: [solid()] };
  const tall = dart({ id: '5:1', name: 'Tall', type: 'FRAME', x: 0, y: 0, width: 393, height: 2000,
    numberOfFixedChildren: 1, children: [body, badge, header] });
  assert.equal(tall.screen, true);
  assert.equal(tall.scrolls, true);
  // The page is as tall as the screen, and never shorter than the layers need
  // (the body, pinned to the top, ends at 1880).
  assert.match(tall.code, /Positioned.fill\(\s+child: LayoutBuilder\(\s+builder: \(context, constraints\) => SingleChildScrollView\(\s+child: SizedBox\(\s+height: constraints.hasBoundedHeight && constraints.maxHeight > 1880 \? constraints.maxHeight : 1880,/);
  // Equal margins: the body stretches with the screen; the badge keeps its offset.
  assert.match(tall.code, /Positioned\(\s+left: 16,\s+top: 80,\s+right: 16,\s+height: 1800,/);
  assert.match(tall.code, /Positioned\(\s+left: 300,\s+top: 90,\s+width: 40,\s+height: 20,/);
  // The fixed header is outside the scroll view, after it.
  const scroll = tall.code.indexOf('SingleChildScrollView');
  const fixed = tall.code.lastIndexOf('left: 0,\n');
  assert.ok(fixed > scroll && tall.code.indexOf("'5:9'") === -1);
  assert.doesNotMatch(tall.code, /width: 393/);

  const short = dart({ id: '5:1', name: 'Short', type: 'FRAME', x: 0, y: 0, width: 393, height: 852, children: [header] });
  assert.equal(short.scrolls, false);
  assert.match(short.code, /maxHeight > 60 \? constraints.maxHeight : 60/);
  // A centred picture 40 above a sheet pinned to the bottom closes in at
  // half the rate the page shrinks: they meet when it loses 80.
  const picture = { id: '7:2', name: 'Picture', type: 'FRAME', x: 0, y: 200, width: 393, height: 300,
    constraints: { horizontal: 'MIN', vertical: 'CENTER' }, fills: [solid()] };
  const sheet = { id: '7:3', name: 'Sheet', type: 'FRAME', x: 0, y: 540, width: 393, height: 312,
    constraints: { horizontal: 'MIN', vertical: 'MAX' }, fills: [solid()] };
  const meeting = dart({ id: '7:1', name: 'Meet', type: 'FRAME', x: 0, y: 0, width: 393, height: 852, children: [picture, sheet] });
  assert.match(meeting.code, /maxHeight > 772 \? constraints.maxHeight : 772/, 'a shorter phone scrolls instead of overlapping');
  assert.equal(dart({ ...frame([]), width: 393, height: 200 }).screen, false, 'a card is not a screen');
  assert.equal(dart({ id: '5:1', name: 'S', type: 'FRAME', x: 0, y: 0, width: 393, height: 852, children: [header] }, { screen: false }).screen, false);
});

test('on a screen, fixed-width text columns may shrink; rows with a filling child do not change', () => {
  const col = (id, x, w) => ({ id, name: id, type: 'FRAME', x, y: 0, width: w, height: 20, layoutMode: 'VERTICAL',
    layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG', children: [text('Label', { id: `${id}t`, textAutoResize: 'HEIGHT', width: w })] });
  const row = (children) => ({ id: '6:1', name: 'Row', type: 'FRAME', x: 0, y: 100, width: 393, height: 20, layoutMode: 'HORIZONTAL',
    primaryAxisAlignItems: 'SPACE_BETWEEN', primaryAxisSizingMode: 'FIXED', counterAxisSizingMode: 'AUTO', children });
  const screen = (r) => dart({ id: '6:0', name: 'Screen', type: 'FRAME', x: 0, y: 0, width: 393, height: 852, children: [r] }).code;
  const two = screen(row([col('6:2', 0, 240), col('6:3', 250, 100)]));
  assert.match(two, /Flexible\(\s+flex: 2400,/);
  assert.match(two, /Flexible\(\s+flex: 1000,/);
  const withFill = screen(row([col('6:2', 0, 240), { ...col('6:3', 250, 100), layoutSizingHorizontal: 'FILL' }]));
  assert.doesNotMatch(withFill, /Flexible\(/);
  assert.match(withFill, /Expanded\(/);
});

test('inner shadows lie on the fills and blend modes blend', () => {
  const inner = { type: 'INNER_SHADOW', visible: true, radius: 8, spread: 2, offset: { x: 0, y: 4 }, color: { r: 0, g: 0, b: 0, a: 0.25 } };
  const card = dart(frame([], { cornerRadius: 12, fills: [solid()], effects: [inner] }));
  assert.match(card.code, /decoration: _InnerShadowDecoration\(\s+decoration: BoxDecoration\(\s+color: Color\(0xFF000000\),\s+borderRadius: BorderRadius.circular\(12\),\s+\),\s+shadows: const \[\s+BoxShadow\([\s\S]*?spreadRadius: 2,\s+\),\s+\],\s+borderRadius: BorderRadius.circular\(12\),\s+shape: BoxShape.rectangle,/);
  assert.match(card.code, /class _InnerShadowDecoration extends Decoration/);
  assert.doesNotMatch(card.code, /class _Blend/);
  assert.deepEqual(card.warnings, []);

  const circle = dart(frame([{ id: '2:1', name: 'Dot', type: 'ELLIPSE', x: 0, y: 0, width: 40, height: 40, fills: [solid()], effects: [inner] }]));
  assert.match(circle.code, /_InnerShadowDecoration\([\s\S]*shape: BoxShape.circle/);

  // Over an image fill the shadow is its own layer above the image.
  const photo = dart(frame([], { fills: [solid(), { type: 'IMAGE', visible: true, scaleMode: 'CROP', imageHash: 'h', imageTransform: [[1, 0, 0], [0, 1, 0]] }], effects: [inner] }));
  assert.match(photo.code, /Image.asset[\s\S]*DecoratedBox\(\s+decoration: _InnerShadowDecoration\(/);

  // Fill layers cover the padding; only the content is padded.
  const padded = dart(frame([text('Hi', { x: 16, y: 16 })], {
    layoutMode: 'VERTICAL', paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 16,
    primaryAxisSizingMode: 'FIXED', counterAxisSizingMode: 'FIXED',
    fills: [solid(), { type: 'IMAGE', visible: true, scaleMode: 'CROP', imageHash: 'h', imageTransform: [[1, 0, 0], [0, 1, 0]] }], effects: [inner],
  })).code;
  assert.match(padded, /Positioned.fill\([\s\S]*Positioned.fill\([\s\S]*_InnerShadowDecoration[\s\S]*Padding\(\s+padding: EdgeInsets.all\(16\),/);
  assert.doesNotMatch(padded, /Container\([^]*?padding: EdgeInsets.all\(16\),\s+decoration:/);

  const fill = dart(frame([], { fills: [solid(), solid({ r: 1, g: 0, b: 0, a: 1 }, { blendMode: 'MULTIPLY' })] }));
  assert.match(fill.code, /_Blend\(\s+mode: BlendMode.multiply,\s+child: DecoratedBox\(/);
  assert.match(fill.code, /import 'package:flutter\/rendering.dart';/);
  assert.deepEqual(fill.warnings, []);

  const layer = dart(frame([{ id: '2:1', name: 'Glow', type: 'RECTANGLE', x: 0, y: 0, width: 40, height: 40, fills: [solid()], blendMode: 'SCREEN' }]));
  assert.match(layer.code, /_Blend\(\s+mode: BlendMode.screen,/);

  const burn = dart(frame([{ id: '2:1', name: 'Burn', type: 'RECTANGLE', x: 0, y: 0, width: 40, height: 40, fills: [solid()], blendMode: 'LINEAR_BURN' }]));
  assert.match(JSON.stringify(burn.warnings), /linear_burn blend of the layer is drawn normal/);
});

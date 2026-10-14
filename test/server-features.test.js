import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';
import { flutterTool } from '../src/tools/verify.js';
import { FIXTURE, fakePlugin, nextPort, pairing, startClient, texts, tmpDir } from './helpers.js';

test('the plugin must present the pairing code', async () => {
  const port = nextPort();
  const dir = tmpDir();
  const { client } = await startClient(dir, port);
  await new Promise((r) => setTimeout(r, 300));
  const closeCode = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?code=WRONG-CODE`);
    ws.on('close', (code) => resolve(code));
    ws.on('error', () => {});
  });
  assert.equal(closeCode, 4401);
  const who = JSON.parse(texts(await client.callTool({ name: 'whoami', arguments: {} })));
  assert.equal(who.plugin.startsWith('not connected'), true);
  assert.match(who.pairingCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(who.pairingCode, pairing(dir));

  const plugin = fakePlugin(port, { code: pairing(dir).toLowerCase().replace('-', '') });
  assert.equal(await plugin.ready(), true, 'the code is accepted without case or dash');
  plugin.stop();
});

test('code connect maps a component set and names it in the design context', async () => {
  const port = nextPort();
  const dir = tmpDir();
  const { client } = await startClient(dir, port);
  const plugin = fakePlugin(port, { code: pairing(dir) });
  await plugin.ready();

  const before = await client.callTool({ name: 'get_code_connect_map', arguments: { nodeId: '10:1' } });
  assert.match(texts(before), /"component": "Button\/Primary"/);

  const added = await client.callTool({ name: 'add_code_connect_map', arguments: {
    nodeId: '10:3', componentName: 'AppPrimaryButton', source: 'lib/widgets/app_primary_button.dart', label: 'Flutter',
  } });
  const saved = JSON.parse(texts(added));
  assert.equal(saved.saved.key, 'name:Button/Primary');
  assert.equal(fs.readFileSync(path.join(dir, '.figma-local', '.gitignore'), 'utf8'), '*\n');

  const ctx = texts(await client.callTool({ name: 'get_design_context', arguments: { nodeId: '10:1', excludeScreenshot: true } }));
  assert.match(ctx, /^\/\/ AppPrimaryButton: lib\/widgets\/app_primary_button.dart \(Flutter\)/);
  assert.match(ctx, /<AppPrimaryButton className="relative shrink-0 w-full h-\[40px\]"/);
  const raw = texts(await client.callTool({ name: 'get_design_context', arguments: { nodeId: '10:1', excludeScreenshot: true, disableCodeConnect: true } }));
  assert.doesNotMatch(raw, /<AppPrimaryButton/);

  const map = JSON.parse(texts(await client.callTool({ name: 'get_code_connect_map', arguments: { nodeId: '10:1' } })).split('\n\n')[0]);
  assert.equal(map['10:3'].codeConnectName, 'AppPrimaryButton');

  const removed = JSON.parse(texts(await client.callTool({ name: 'remove_code_connect_map', arguments: { nodeId: '10:3' } })));
  assert.equal(removed.removed, 1);
  plugin.stop();
});

test('save_design_export writes a full export with code connect annotations', async () => {
  const port = nextPort();
  const dir = tmpDir();
  const { client } = await startClient(dir, port);
  const plugin = fakePlugin(port, { code: pairing(dir) });
  await plugin.ready();
  await client.callTool({ name: 'add_code_connect_map', arguments: {
    nodeId: '10:3', componentName: 'AppPrimaryButton', source: 'lib/app_primary_button.dart',
  } });
  const target = path.join(dir, 'out', 'screen.json');
  const res = JSON.parse(texts(await client.callTool({ name: 'save_design_export', arguments: { path: target } })));
  assert.equal(res.path, target);
  const written = JSON.parse(fs.readFileSync(target, 'utf8'));
  assert.equal(written.frames[0].tree.id, '10:1');
  assert.equal(written.frames[0].tree.children[1].codeConnect.componentName, 'AppPrimaryButton');
  assert.ok(written.frames[0].previewPng2x);
  const bad = await client.callTool({ name: 'save_design_export', arguments: { path: 'relative.json' } });
  assert.equal(bad.isError, true);
  // A previous export may be replaced; any other JSON file may not.
  const again = await client.callTool({ name: 'save_design_export', arguments: { path: target } });
  assert.equal(again.isError, undefined, texts(again));
  const config = path.join(dir, 'package.json');
  fs.writeFileSync(config, '{"name":"app"}');
  const clobber = await client.callTool({ name: 'save_design_export', arguments: { path: config } });
  assert.match(texts(clobber), /is not a design export/);
  assert.equal(fs.readFileSync(config, 'utf8'), '{"name":"app"}');
  plugin.stop();
});

test('Flutter projects get Flutter code with their asset folders', async () => {
  const port = nextPort();
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'pubspec.yaml'), 'name: app\nflutter:\n  assets:\n    - assets/svg/\n    - assets/png/\n');
  const { client } = await startClient(dir, port);
  const plugin = fakePlugin(port, { code: pairing(dir) });
  await plugin.ready();
  const ctx = texts(await client.callTool({ name: 'get_design_context', arguments: { nodeId: '10:1', excludeScreenshot: true } }));
  assert.match(ctx, /class SampleScreen extends StatelessWidget/);
  assert.match(ctx, /SvgPicture.asset\(\s*'assets\/svg\/arrow.svg'/);
  assert.match(ctx, /AssetImage\('assets\/png\/photo.png'\)/);
  assert.match(ctx, /mkdir -p 'assets\/svg' 'assets\/png'/);
  assert.match(ctx, /cp '[^']+\.svg' 'assets\/svg\/arrow.svg'/);
  assert.match(ctx, /- Inter: 500, 600/);
  assert.match(ctx, /reference Flutter code/);
  assert.doesNotMatch(ctx, /http:\/\/localhost/, 'no server URLs in Dart code');

  assert.doesNotMatch(ctx, /flutter_screenutil/);

  const react = texts(await client.callTool({ name: 'get_design_context', arguments: { nodeId: '10:1', excludeScreenshot: true, framework: 'react' } }));
  assert.match(react, /export default function SampleScreen\(\)/);

  // A project using flutter_screenutil gets scaled lengths, unless it asks not to.
  fs.writeFileSync(path.join(dir, 'pubspec.yaml'), 'name: app\ndependencies:\n  flutter_screenutil: ^5.9.3\nflutter:\n  assets:\n    - assets/svg/\n');
  const scaled = texts(await client.callTool({ name: 'get_design_context', arguments: { nodeId: '10:1', excludeScreenshot: true } }));
  assert.match(scaled, /import 'package:flutter_screenutil\/flutter_screenutil.dart';/);
  assert.match(scaled, /\d\.w,/);
  assert.match(scaled, /Lengths use flutter_screenutil/);
  const plain = texts(await client.callTool({ name: 'get_design_context', arguments: { nodeId: '10:1', excludeScreenshot: true, screenUtil: false } }));
  assert.doesNotMatch(plain, /flutter_screenutil/);
  plugin.stop();
});

test('the client can ask for Flutter, and bad node ids are refused', async () => {
  const port = nextPort();
  const dir = tmpDir();
  const { client } = await startClient(dir, port);
  const plugin = fakePlugin(port, { code: pairing(dir) });
  await plugin.ready();
  const ctx = texts(await client.callTool({ name: 'get_design_context', arguments: {
    nodeId: '10-1', clientFrameworks: 'flutter', clientLanguages: 'dart', excludeScreenshot: true, assetsDir: 'assets/design/',
  } }));
  assert.match(ctx, /class SampleScreen extends StatelessWidget/);
  assert.match(ctx, /'assets\/design\/photo.png'/);
  const bad = await client.callTool({ name: 'get_design_context', arguments: { nodeId: 'not-an-id' } });
  assert.equal(bad.isError, true);
  assert.match(texts(bad), /Not a Figma node id/);
  plugin.stop();
});

test('a read the plugin cut short answers with metadata, not code', async () => {
  const port = nextPort();
  const dir = tmpDir();
  const { client } = await startClient(dir, port);
  const plugin = fakePlugin(port, { code: pairing(dir), truncated: true });
  await plugin.ready();
  const ctx = texts(await client.callTool({ name: 'get_design_context', arguments: { nodeId: '10:1', excludeScreenshot: true } }));
  assert.match(ctx, /too many for code in one response/);
  assert.match(ctx, /<frame id="10:1" name="Sample Screen"/);
  assert.doesNotMatch(ctx, /export default function|extends StatelessWidget/);
  plugin.stop();
});

test('verify_code renders the generated Flutter code and compares it with the design', { timeout: 600000 }, async (t) => {
  const flutter = flutterTool(process.env.FLUTTER);
  if (!flutter) {
    t.skip('flutter is not installed');
    return;
  }
  const { client, transport } = await startClient(tmpDir(), nextPort());
  await client.callTool({ name: 'import_design_export', arguments: { path: FIXTURE } });
  const missing = await client.callTool({ name: 'verify_code', arguments: { nodeId: '10:1', file: 'lib/none.dart', flutter } });
  assert.equal(missing.isError, true);
  assert.match(texts(missing), /pubspec\.yaml/);
  const result = await client.callTool({ name: 'verify_code', arguments: { nodeId: '10:1', flutter } });
  assert.notEqual(result.isError, true, texts(result));
  const report = JSON.parse(result.content[0].text);
  assert.deepEqual(report.analyzer.errors, []);
  assert.deepEqual(report.runtimeErrors, []);
  assert.ok(report.checkedLayers > 0);
  assert.equal(typeof report.pixels.differingPercent, 'number');
  assert.ok(result.content.some((c) => c.type === 'image'), 'includes the diff');
  await transport.close();
});

test('place_image sends a local image to the plugin and refuses other files', async () => {
  const port = nextPort();
  const dir = tmpDir();
  const { client, transport } = await startClient(dir, port);
  const plugin = fakePlugin(port, { code: pairing(dir) });
  assert.equal(await plugin.ready(), true);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(path.join(dir, 'dot.png'), png);
  fs.writeFileSync(path.join(dir, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'hello');

  const placed = await client.callTool({ name: 'place_image', arguments: { path: 'dot.png', width: 10 } });
  assert.equal(placed.isError, undefined, texts(placed));
  assert.ok(plugin.calls.includes('run'));
  const svg = await client.callTool({ name: 'place_image', arguments: { path: 'icon.svg' } });
  assert.equal(svg.isError, undefined, texts(svg));

  const fill = await client.callTool({ name: 'place_image', arguments: { path: 'icon.svg', nodeId: '1:2' } });
  assert.match(texts(fill), /SVG cannot be a fill/);
  const other = await client.callTool({ name: 'place_image', arguments: { path: 'notes.txt' } });
  assert.match(texts(other), /not a PNG, JPG, GIF or SVG/);
  const missing = await client.callTool({ name: 'place_image', arguments: { path: 'nope.png' } });
  assert.match(texts(missing), /does not exist/);
  plugin.stop();
  await transport.close();
});

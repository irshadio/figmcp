import assert from 'node:assert/strict';
import fs from 'node:fs';
import WebSocket from 'ws';
import test from 'node:test';
import { FIXTURE, fakePlugin, nextPort, pairing, startClient, texts, tmpDir } from './helpers.js';

test('lists the tools of the Figma MCP', async () => {
  const { client, transport } = await startClient(tmpDir(), nextPort());
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['add_code_connect_map', 'download_assets', 'get_code_connect_map',
    'get_design_context', 'get_metadata', 'get_screenshot', 'get_variable_defs',
    'import_design_export', 'place_image', 'remove_code_connect_map', 'save_design_export', 'search_design_system', 'use_figma', 'verify_code', 'whoami']);
  await transport.close();
});

test('reads imported snapshots without the plugin', async () => {
  const dir = tmpDir();
  const { client, transport } = await startClient(dir, nextPort());
  const imported = await client.callTool({ name: 'import_design_export', arguments: { path: FIXTURE } });
  assert.match(texts(imported), /Sample_Screen_10_1\.json/);

  const meta = await client.callTool({ name: 'get_metadata', arguments: { nodeId: '10-3' } });
  assert.match(texts(meta), /<instance id="10:3" name="Button" x="16" y="44" width="168" height="40">/);
  assert.match(texts(meta), /snapshot saved 2026-01-01/);

  const ctx = await client.callTool({ name: 'get_design_context', arguments: { nodeId: '10:1', fileKey: 'abc' } });
  assert.match(texts(ctx), /export default function SampleScreen/);
  assert.match(texts(ctx), /"imgPhoto": \{\s+"url": "http:\/\/localhost:\d+\/assets\/[a-f0-9]{64}\.png"/);
  assert.ok(ctx.content.some((c) => c.type === 'image'), 'includes a screenshot');

  const shot = await client.callTool({ name: 'get_screenshot', arguments: { nodeId: '10:3', enableBase64Response: true } });
  const info = JSON.parse(shot.content[0].text);
  assert.equal(info.width, 336);
  assert.equal(info.height, 80);
  assert.equal(info.original_width, 168);
  assert.ok(fs.existsSync(info.path));
  const served = await fetch(info.url);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');

  const vars = await client.callTool({ name: 'get_variable_defs', arguments: { nodeId: '10:1' } });
  assert.match(texts(vars), /"font Inter Semi Bold 18"/);

  const missing = await client.callTool({ name: 'get_metadata', arguments: { nodeId: '99:9' } });
  assert.equal(missing.isError, true);
  await transport.close();
});

test('reads live from the plugin and uses the selection', async () => {
  const port = nextPort();
  const dir = tmpDir();
  const { client, transport } = await startClient(dir, port);
  const plugin = fakePlugin(port, { code: pairing(dir) });
  assert.equal(await plugin.ready(), true);

  const ctx = await client.callTool({ name: 'get_design_context', arguments: {} });
  const out = texts(ctx);
  assert.match(out, /data-node-id="10:1"/);
  assert.match(out, /"color\/primary": "#0D99FF"/);
  assert.doesNotMatch(out, /snapshot/);

  const meta = await client.callTool({ name: 'get_metadata', arguments: {} });
  assert.match(texts(meta), /Currently selected nodes:\n- 10:1 "Sample Screen" \(FRAME\)/);
  assert.match(texts(meta), /- 0:1 "Page 1"/);

  const who = JSON.parse(texts(await client.callTool({ name: 'whoami', arguments: {} })));
  assert.equal(who.plugin, 'connected');
  plugin.stop();
  await transport.close();
});

test('a live read does not hide the saved preview from offline screenshots', async () => {
  const port = nextPort();
  const dir = tmpDir();
  const { client, transport } = await startClient(dir, port);
  await client.callTool({ name: 'import_design_export', arguments: { path: FIXTURE } });
  const plugin = fakePlugin(port, { code: pairing(dir) });
  await plugin.ready();
  await client.callTool({ name: 'get_design_context', arguments: { nodeId: '10:1', excludeScreenshot: true } });
  plugin.stop();
  await new Promise((r) => setTimeout(r, 300));
  const shot = await client.callTool({ name: 'get_screenshot', arguments: { nodeId: '10:3' } });
  const info = JSON.parse(shot.content[0].text);
  assert.equal(info.width, 336);
  assert.equal(info.height, 80);
  assert.match(texts(shot), /snapshot saved 2026-01-01/);
  await transport.close();
});

test('refuses WebSocket connections from web pages and unsigned rpc', async () => {
  const port = nextPort();
  const { transport } = await startClient(tmpDir(), port);
  await new Promise((r) => setTimeout(r, 300));
  const refused = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'https://example.com' });
    ws.on('open', () => resolve(false));
    ws.on('error', () => resolve(true));
  });
  assert.equal(refused, true);
  const rpc = await fetch(`http://127.0.0.1:${port}/rpc`, { method: 'POST', body: '{"method":"info"}' });
  assert.equal(rpc.status, 403);
  await transport.close();
});

test('a second instance proxies, then takes over when the owner exits', async () => {
  const port = nextPort();
  const dir = tmpDir();
  const a = await startClient(dir, port);
  await new Promise((r) => setTimeout(r, 300));
  const b = await startClient(dir, port);
  const plugin = fakePlugin(port, { code: pairing(dir) });
  await plugin.ready();

  const viaProxy = await b.client.callTool({ name: 'get_metadata', arguments: { nodeId: '10:2' } });
  assert.match(texts(viaProxy), /<text id="10:2"/);

  await a.transport.close();
  await new Promise((r) => setTimeout(r, 300));
  const afterTakeover = await b.client.callTool({ name: 'get_metadata', arguments: { nodeId: '10:4' } });
  assert.match(texts(afterTakeover), /<rounded-rectangle id="10:4"/);
  assert.doesNotMatch(texts(afterTakeover), /snapshot/);
  const who = JSON.parse(texts(await b.client.callTool({ name: 'whoami', arguments: {} })));
  assert.match(who.role, /serving on port/);
  plugin.stop();
  await b.transport.close();
});

test('use_figma runs a script in the plugin and reports its errors', async () => {
  const port = nextPort();
  const dir = tmpDir();
  const { client, transport } = await startClient(dir, port);
  const offline = await client.callTool({ name: 'use_figma', arguments: { code: 'return 1' } });
  assert.equal(offline.isError, true);
  assert.match(texts(offline), /plugin is not connected/);

  const plugin = fakePlugin(port, { code: pairing(dir) });
  assert.equal(await plugin.ready(), true);
  const ok = await client.callTool({ name: 'use_figma', arguments: { code: 'return figma.createFrame()' } });
  assert.equal(ok.isError, undefined);
  assert.equal(JSON.parse(ok.content[0].text).result.id, '20:1');
  assert.match(texts(ok), /Logs:\nmade it/);

  const failed = await client.callTool({ name: 'use_figma', arguments: { code: 'throw 1' } });
  assert.equal(failed.isError, true);
  assert.match(texts(failed), /Error: boom/);
  plugin.stop();
  await transport.close();
});

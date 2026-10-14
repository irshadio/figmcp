import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-local-bridge-'));
process.env.FIGMA_LOCAL_MCP_DIR = dir;
const { Bridge } = await import('../src/bridge.js');
const { pairingCode, secret } = await import('../src/store.js');

let port = 38900 + Math.floor(Math.random() * 400);

async function bridge() {
  const b = new Bridge({ port: port++ });
  await b.start();
  return b;
}

function get(b, pathname, host) {
  return new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port: b.port, path: pathname, headers: { host } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
  });
}

test('requests that do not name this machine are refused', async () => {
  const b = await bridge();
  assert.equal(await get(b, '/health', `localhost:${b.port}`), 200);
  assert.equal(await get(b, '/health', `127.0.0.1:${b.port}`), 200);
  assert.equal(await get(b, '/health', `evil.example:${b.port}`), 400);
  b.close();
});

test('a malformed request or WebSocket frame does not end the server', async () => {
  const b = await bridge();
  const reply = await new Promise((resolve) => {
    const s = net.connect(b.port, '127.0.0.1', () => s.write('GET http://[ HTTP/1.1\r\nHost: localhost\r\n\r\n'));
    s.on('data', (d) => {
      resolve(d.toString().split('\r\n')[0]);
      s.destroy();
    });
  });
  assert.match(reply, /400/);
  const ws = new WebSocket(`ws://127.0.0.1:${b.port}/?code=WRONG`);
  ws.on('error', () => {});
  await new Promise((r) => ws.on('open', r));
  ws._socket.write(Buffer.from([0x8f, 0x80, 0, 0, 0, 0]));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await get(b, '/health', 'localhost'), 200);
  b.close();
});

test('an empty secret or pairing file is replaced, never trusted', async () => {
  fs.writeFileSync(path.join(dir, 'secret'), '');
  fs.writeFileSync(path.join(dir, 'pairing'), '\n');
  assert.match(secret(), /^[a-f0-9]{64}$/);
  assert.match(pairingCode(), /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(secret(), fs.readFileSync(path.join(dir, 'secret'), 'utf8'));
});

test('only the newest cached plugin reads are kept', async () => {
  const { saveSnapshot, snapshotSummary } = await import('../src/store.js');
  const frame = (i) => ({ frames: [{ id: `1:${i}`, name: `F${i}`, tree: { id: `1:${i}`, name: `F${i}`, type: 'FRAME' } }], images: {} });
  saveSnapshot(frame(999));
  for (let i = 0; i < 25; i++) saveSnapshot(frame(i), { live: true });
  const names = snapshotSummary().map((s) => s.snapshot);
  assert.equal(names.filter((n) => n.startsWith('live_')).length, 20);
  assert.ok(names.includes('F999_1_999.json'), 'saved frames are kept');
});

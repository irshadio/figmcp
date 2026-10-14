// Helpers for the end-to-end tests: a real server over stdio and a
// stand-in plugin.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import WebSocket from 'ws';

export const FIXTURE = new URL('./fixtures/sample-export.json', import.meta.url).pathname;
export const data = JSON.parse(fs.readFileSync(FIXTURE));
const BIN = new URL('../bin/figma-local-mcp.js', import.meta.url).pathname;
const open = [];
after(() => Promise.all(open.map((t) => t.close())));
let portCounter = 39470 + Math.floor(Math.random() * 400);
export function nextPort() {
  return portCounter++;
}

function env(dir, port) {
  return { ...process.env, FIGMA_LOCAL_MCP_DIR: dir, FIGMA_LOCAL_MCP_PORT: String(port) };
}

export async function startClient(dir, port) {
  const transport = new StdioClientTransport({
    command: process.execPath, args: [BIN], env: env(dir, port), stderr: 'pipe', cwd: dir,
  });
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(transport);
  open.push(transport);
  return { client, transport, pid: transport.pid };
}

export function texts(result) {
  return result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

export function findNode(tree, id) {
  if (tree.id === id) return tree;
  for (const c of tree.children || []) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return null;
}

export function pairing(dir) {
  return fs.readFileSync(path.join(dir, 'pairing'), 'utf8').trim();
}

/** A stand-in for the plugin UI: answers requests from fixture data. */
export function fakePlugin(port, { origin, code, truncated = false } = {}) {
  let ws;
  let stopped = false;
  const calls = [];
  const requests = [];
  const connect = () => new Promise((resolve) => {
    ws = new WebSocket(`ws://127.0.0.1:${port}/?code=${encodeURIComponent(code || '')}`, origin ? { origin } : {});
    ws.on('open', () => resolve(true));
    ws.on('error', () => resolve(false));
    ws.on('close', () => {
      if (!stopped) setTimeout(connect, 200);
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.type !== 'request') return;
      calls.push(msg.method);
      requests.push(msg);
      const p = msg.params;
      const reply = (result) => ws.send(JSON.stringify({ type: 'response', id: msg.id, result }));
      const tree = data.frames[0].tree;
      switch (msg.method) {
        case 'info':
          return reply({
            fileName: 'Sample', fileKey: null, user: { name: 'Tester' },
            currentPage: { id: '0:1', name: 'Page 1' }, pages: [{ id: '0:1', name: 'Page 1' }],
            selection: [{ id: '10:1', name: 'Sample Screen', type: 'FRAME' }],
          });
        case 'node':
        case 'pageMeta': {
          // Like the plugin: images the server already has are left out.
          const known = new Set(p.knownImages || []);
          const images = Object.fromEntries(Object.entries(data.images).filter(([h]) => !known.has(h)));
          return reply({ fileName: 'Sample', page: { id: '0:1', name: 'Page 1' }, tree: findNode(tree, p.id), images,
            imageHashes: Object.keys(data.images), ...(truncated && msg.method === 'node' ? { truncated: true } : {}) });
        }
        case 'export':
          return reply({ format: 'png', base64: data.frames[0].previewPng2x, width: 200, height: 120, scale: 2 });
        case 'snapshot':
          return reply({ ...data, frames: [{ ...data.frames[0], tree: findNode(tree, p.ids[0]) }] });
        case 'run':
          if (p.code.trim().startsWith('throw')) {
            return ws.send(JSON.stringify({ type: 'response', id: msg.id, error: 'boom' }));
          }
          return reply({ result: { id: '20:1', name: 'Card', type: 'FRAME' }, logs: ['made it'] });
        case 'variables':
          return reply({ defs: { 'color/primary': '#0D99FF' }, truncated: false });
        default:
          return ws.send(JSON.stringify({ type: 'response', id: msg.id, error: 'unknown' }));
      }
    });
  });
  return {
    calls,
    requests,
    ready: connect,
    stop() { stopped = true; ws.close(); },
  };
}

export function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'figma-local-'));
}


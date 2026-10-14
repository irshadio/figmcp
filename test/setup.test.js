import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { nextPort, startClient, tmpDir } from './helpers.js';

const BIN = new URL('../bin/figma-local-mcp.js', import.meta.url).pathname;
const PLUGIN = new URL('../plugin/', import.meta.url).pathname;

// Only node on the PATH: no claude to register with, no folder to open.
function runSetup(dir) {
  const result = spawnSync(process.execPath, [BIN, 'setup'], {
    encoding: 'utf8',
    env: { ...process.env, FIGMA_LOCAL_MCP_DIR: dir, PATH: path.dirname(process.execPath) },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('setup copies the plugin, prints the pairing code and the client config', () => {
  const dir = tmpDir();
  const out = runSetup(dir);
  for (const file of fs.readdirSync(PLUGIN)) {
    assert.deepEqual(fs.readFileSync(path.join(dir, 'plugin', file)), fs.readFileSync(path.join(PLUGIN, file)), file);
  }
  assert.ok(out.includes(path.join(dir, 'plugin', 'manifest.json')));
  assert.ok(out.includes(fs.readFileSync(path.join(dir, 'pairing'), 'utf8').trim()));
  assert.match(out, /Claude Code was not found/);
  const config = JSON.parse(out.slice(out.indexOf('{'), out.indexOf('\n   }\n') + 5));
  assert.deepEqual(config.mcpServers['figma-local'], { command: process.execPath, args: [BIN] });
});

test('setup restores a changed plugin file and keeps the pairing code', () => {
  const dir = tmpDir();
  runSetup(dir);
  const code = fs.readFileSync(path.join(dir, 'pairing'), 'utf8');
  fs.writeFileSync(path.join(dir, 'plugin', 'code.js'), 'stale');
  runSetup(dir);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'plugin', 'code.js')), fs.readFileSync(path.join(PLUGIN, 'code.js')));
  assert.equal(fs.readFileSync(path.join(dir, 'pairing'), 'utf8'), code);
});

test('the server refreshes the plugin files when it starts', async () => {
  const dir = tmpDir();
  const { transport } = await startClient(dir, nextPort());
  assert.deepEqual(fs.readFileSync(path.join(dir, 'plugin', 'ui.html')), fs.readFileSync(path.join(PLUGIN, 'ui.html')));
  await transport.close();
});

test('arguments with spaces are quoted for the Windows shell', async () => {
  const { shellArg } = await import('../src/setup.js');
  assert.equal(shellArg('C:\\Program Files\\nodejs\\node.exe'), '"C:\\Program Files\\nodejs\\node.exe"');
  assert.equal(shellArg('--scope'), '--scope');
  assert.equal(shellArg('a"b c'), '"a""b c"');
});

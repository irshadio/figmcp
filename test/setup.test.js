import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { tmpDir } from './helpers.js';

const BIN = new URL('../bin/figma-local-mcp.js', import.meta.url).pathname;

// Only node on the PATH, so there is no claude to register with.
function runSetup(dir) {
  const result = spawnSync(process.execPath, [BIN, 'setup'], {
    encoding: 'utf8',
    env: { ...process.env, FIGMA_LOCAL_MCP_DIR: dir, PATH: path.dirname(process.execPath) },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('setup prints the plugin link, the pairing code and the client config', () => {
  const dir = tmpDir();
  const out = runSetup(dir);
  assert.match(out, /figma\.com\/community\/plugin\/1690019868157511479/);
  assert.ok(out.includes(fs.readFileSync(path.join(dir, 'pairing'), 'utf8').trim()));
  assert.match(out, /Claude Code was not found/);
  const config = JSON.parse(out.slice(out.indexOf('{'), out.indexOf('\n   }\n') + 5));
  assert.deepEqual(config.mcpServers['figma-local'], { command: process.execPath, args: [BIN] });
});

test('setup keeps the pairing code across runs', () => {
  const dir = tmpDir();
  runSetup(dir);
  const code = fs.readFileSync(path.join(dir, 'pairing'), 'utf8');
  runSetup(dir);
  assert.equal(fs.readFileSync(path.join(dir, 'pairing'), 'utf8'), code);
});

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, pairingCode } from './store.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const PLUGIN_SRC = path.join(ROOT, 'plugin');
export const PLUGIN_DIR = path.join(DATA_DIR, 'plugin');
const APP_DIR = path.join(DATA_DIR, 'app');
const WIN = process.platform === 'win32';

// Figma keeps the manifest path it was imported from, so the plugin lives at a
// fixed path outside the package and is refreshed whenever the package changes.
export function syncPlugin() {
  fs.mkdirSync(PLUGIN_DIR, { recursive: true });
  for (const file of fs.readdirSync(PLUGIN_SRC)) {
    const from = path.join(PLUGIN_SRC, file);
    const to = path.join(PLUGIN_DIR, file);
    const data = fs.readFileSync(from);
    if (!fs.existsSync(to) || !data.equals(fs.readFileSync(to))) fs.writeFileSync(to, data);
  }
  return path.join(PLUGIN_DIR, 'manifest.json');
}

function run(cmd, args) {
  return spawnSync(cmd, args, { stdio: 'ignore', shell: WIN });
}

// npx resolves the package on every start, which takes tens of seconds; MCP
// clients start the server directly from a copy that outlives the npx cache.
function installedBin() {
  const own = path.join(ROOT, 'bin', 'figma-local-mcp.js');
  if (!ROOT.split(path.sep).includes('_npx')) return own;
  const install = run('npm', ['install', '--prefix', APP_DIR, '--omit=dev', '--no-audit', '--no-fund',
    `${PKG.name}@${PKG.version}`]);
  if (install.status !== 0) throw new Error(`npm install into ${APP_DIR} failed`);
  return path.join(APP_DIR, 'node_modules', ...PKG.name.split('/'), 'bin', 'figma-local-mcp.js');
}

function registerClaudeCode(server) {
  if (run(WIN ? 'where' : 'which', ['claude']).status !== 0) return false;
  run('claude', ['mcp', 'remove', 'figma-local', '--scope', 'user']);
  return run('claude', ['mcp', 'add', 'figma-local', '--scope', 'user', '--', server.command, ...server.args]).status === 0;
}

export function setup(out = (s) => process.stdout.write(`${s}\n`)) {
  const manifest = syncPlugin();
  const code = pairingCode();
  const server = { command: process.execPath, args: [installedBin()] };
  const claude = registerClaudeCode(server);
  if (process.platform === 'darwin') run('open', [PLUGIN_DIR]);
  else if (WIN) run('explorer', [PLUGIN_DIR]);

  const config = JSON.stringify({ mcpServers: { 'figma-local': server } }, null, 2);
  out(`
Local Design MCP ${PKG.version} is set up.

1. MCP server
   ${claude ? 'Registered with Claude Code. Restart Claude Code to load it.' : 'Claude Code was not found.'}
   For other clients (Cursor, Claude Desktop, ...), add this to their MCP config:
${config.replace(/^/gm, '   ')}

2. Figma plugin (once)
   In Figma Desktop: Plugins > Development > Import plugin from manifest...
   and choose:
   ${manifest}

3. Connect
   Open a design, run Plugins > Development > Local Design MCP and enter
   the pairing code:  ${code}
   The dot turns green once your AI tool is running.

Then select a frame and ask your AI tool: "implement the selected Figma frame".
`);
}

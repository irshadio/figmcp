import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Bridge } from './bridge.js';
import { createServer } from './server.js';
import { importFile } from './store.js';

// stdout carries the protocol; everything else goes to stderr.
const log = (msg) => process.stderr.write(`[figma-local] ${msg}\n`);

export async function main(argv = process.argv.slice(2)) {
  if (argv[0] === 'import') {
    for (const file of argv.slice(1)) log(`saved ${importFile(file)}`);
    return;
  }
  const port = Number(process.env.FIGMA_LOCAL_MCP_PORT || 3947);
  const bridge = new Bridge({ port, log });
  await bridge.start();
  if (!bridge.owner) log(`port ${port} is served by another instance; requests go through it`);
  const server = createServer(bridge);
  await server.connect(new StdioServerTransport());
  const stop = () => {
    bridge.close();
    process.exit(0);
  };
  process.stdin.on('close', stop);
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

#!/usr/bin/env node
import { main } from '../src/index.js';

main().catch((e) => {
  process.stderr.write(`[figma-local] ${e.stack || e}\n`);
  process.exit(1);
});

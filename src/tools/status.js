// Connection status, snapshots and design exports.
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { connectFile, listMappings, lookup } from '../connect.js';
import { DATA_DIR, importFile, snapshotSummary } from '../store.js';
import { fileKeySchema, guard, nodeIdSchema, text } from './common.js';

function annotate(tree, mappings) {
  const rasterized = [];
  const walk = (n) => {
    if (n.type === 'INSTANCE') {
      const hit = lookup(n, mappings);
      if (hit) n.codeConnect = { componentName: hit.componentName, source: hit.source, ...(hit.label ? { label: hit.label } : {}) };
    }
    if (n.render) rasterized.push({ id: n.id, name: n.name, reason: n.rasterized });
    (n.children || []).forEach(walk);
  };
  walk(tree);
  return rasterized;
}

/** Whether [file] holds a design export, which a new export may replace. */
function isExport(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Boolean(data && Array.isArray(data.frames) && data.frames.every((f) => f && f.tree));
  } catch {
    return false;
  }
}

export function registerStatusTools(server, bridge, source) {
  server.registerTool('whoami', {
    description:
      'Status of the local Figma connection: whether the plugin is connected, ' +
      'the pairing code it needs, the open file, page and selection, the ' +
      'project and its Code Connect file, and the saved snapshots. Use it ' +
      'when a read fails.',
    inputSchema: {},
  }, guard(async () => {
    const info = await source.info();
    return [text({
      plugin: info ? 'connected' : 'not connected (run Plugins > Development > figmcp in Figma Desktop)',
      pairingCode: bridge.pairing,
      role: bridge.owner ? `serving on port ${bridge.port}` : `using the server on port ${bridge.port}`,
      user: info ? info.user : null,
      file: info ? info.fileName : null,
      currentPage: info ? info.currentPage : null,
      selection: info ? info.selection : [],
      ...(bridge.lastRefusedOrigin ? {
        refusedOrigin: `${bridge.lastRefusedOrigin} (set FIGMA_LOCAL_MCP_ALLOW_ORIGINS to accept it if this is the plugin)`,
      } : {}),
      project: process.cwd(),
      codeConnect: { file: connectFile(), mappings: listMappings().length },
      dataDir: DATA_DIR,
      snapshots: snapshotSummary().map((s) => ({ snapshot: s.snapshot, exportedAt: s.exportedAt, frames: s.frames })),
    })];
  }));

  server.registerTool('import_design_export', {
    description:
      'Save a design export JSON (frames with node trees, as the plugin ' +
      'produces) as a snapshot, so its nodes can be read without the plugin. ' +
      'Use it for an export made earlier with save_design_export or the plugin. ' +
      'Copies the file into the local snapshot store, replacing an earlier ' +
      'snapshot of the same frames; the source file and the Figma file are not ' +
      'changed. Fails if the JSON is not a design export.',
    inputSchema: { path: z.string().min(1).describe('Absolute path of the export JSON file.') },
  }, guard(async ({ path: file }) => {
    const name = importFile(file);
    const saved = snapshotSummary().find((s) => s.snapshot === name);
    return [text({ snapshot: name, frames: saved ? saved.frames : [] })];
  }));

  server.registerTool('save_design_export', {
    description:
      'Write a full design export of a node (default: the selection) to a JSON ' +
      'file: the node tree with every layout, paint, text, variable, style, ' +
      'component and interaction detail, icon SVGs, renders of masked or ' +
      'rotated groups, image fills and a 2x preview. Mapped components carry ' +
      'their code component. Use it to hand a frame to a build script.',
    inputSchema: {
      nodeId: nodeIdSchema.optional(),
      fileKey: fileKeySchema,
      path: z.string().optional().describe('Absolute .json path to write (default: the data folder).'),
    },
  }, guard(async ({ nodeId, path: target }) => {
    const { id } = await source.resolveId(nodeId);
    const result = await source.exportData(id);
    const mappings = listMappings();
    const rasterized = result.data.frames.flatMap((f) => annotate(f.tree, mappings));
    const frame = result.data.frames[0];
    const file = target || path.join(DATA_DIR, 'exports',
      `${String(frame.name).replace(/[^A-Za-z0-9]+/g, '_')}_${frame.id.replace(/[^0-9]+/g, '_')}.json`);
    if (!path.isAbsolute(file) || !file.endsWith('.json')) throw new Error('path must be an absolute .json path');
    if (fs.existsSync(file) && !isExport(file)) {
      throw new Error(`${file} exists and is not a design export; choose another path.`);
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(result.data));
    return [text({
      path: file,
      frames: result.data.frames.map((f) => ({ id: f.id, name: f.name })),
      source: result.source,
      ...(result.exportedAt ? { exportedAt: result.exportedAt } : {}),
      ...(rasterized.length ? { rasterized } : {}),
    })];
  }));
}

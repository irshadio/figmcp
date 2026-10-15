// Code Connect: map design components to the project's code components.
import { z } from 'zod';
import { addMapping, connectFile, listMappings, lookup, removeMapping } from '../connect.js';
import { fileKeySchema, guard, nodeIdSchema, sourceNote, text } from './common.js';

function instances(tree) {
  const out = [];
  const walk = (n) => {
    if (n.visible === false) return;
    if (n.type === 'INSTANCE') out.push(n);
    (n.children || []).forEach(walk);
  };
  walk(tree);
  return out;
}

export function registerConnectTools(server, bridge, source) {
  server.registerTool('get_code_connect_map', {
    description:
      'Get the mapping from the component instances in a node to code ' +
      'components: { nodeId: { codeConnectName, codeConnectSrc, label } }, plus ' +
      'the components that are not mapped yet. Mappings live in the project ' +
      '(.figma-local/code-connect.json under the working directory).',
    inputSchema: { nodeId: nodeIdSchema.optional(), fileKey: fileKeySchema },
  }, guard(async ({ nodeId }) => {
    const { id } = await source.resolveId(nodeId);
    const node = await source.node(id, { svg: false });
    const mappings = listMappings();
    const mapped = {};
    const unmapped = new Map();
    for (const inst of instances(node.tree)) {
      const hit = lookup(inst, mappings);
      if (hit) {
        mapped[inst.id] = {
          codeConnectName: hit.componentName, codeConnectSrc: hit.source,
          ...(hit.label ? { label: hit.label } : {}), component: hit.component,
        };
      } else {
        const name = inst.componentSet || inst.mainComponent || inst.name;
        const entry = unmapped.get(name) || { component: name, instances: 0, exampleNodeId: inst.id };
        entry.instances++;
        unmapped.set(name, entry);
      }
    }
    return [
      text(mapped),
      unmapped.size && text(`Components without a mapping (map one with add_code_connect_map on its exampleNodeId):\n${
        JSON.stringify([...unmapped.values()], null, 2)}`),
      sourceNote(node),
    ];
  }));

  server.registerTool('add_code_connect_map', {
    description:
      'Map a design component to a code component, so get_design_context names ' +
      'the code component for every instance of it. Pass an instance, component ' +
      'or component set id; a component in a set maps the whole set.',
    inputSchema: {
      nodeId: nodeIdSchema,
      fileKey: fileKeySchema,
      componentName: z.string().min(1).describe('Code component name, e.g. AppPrimaryButton.'),
      source: z.string().min(1).describe('Path of the code component in the project.'),
      label: z.string().optional().describe('Framework, e.g. Flutter or React.'),
    },
  }, guard(async ({ nodeId, componentName, source: src, label }) => {
    const { id } = await source.resolveId(nodeId);
    const node = await source.node(id, { svg: false, maxDepth: 0 });
    const entry = addMapping(node.tree, { componentName, source: src, label });
    return [text({ saved: entry, file: connectFile() })];
  }));

  server.registerTool('remove_code_connect_map', {
    description:
      'Remove the code component mapping saved by add_code_connect_map, so ' +
      'get_design_context stops naming that code component. Pass an instance, ' +
      'component or component set id. Only the local mapping file changes, ' +
      'never the design; returns how many mappings were removed (0 when none ' +
      'existed). Add it again with add_code_connect_map to undo.',
    inputSchema: { nodeId: nodeIdSchema, fileKey: fileKeySchema },
  }, guard(async ({ nodeId }) => {
    const { id } = await source.resolveId(nodeId);
    const node = await source.node(id, { svg: false, maxDepth: 0 });
    return [text({ removed: removeMapping(node.tree), file: connectFile() })];
  }));
}

// Component-to-code mappings for the current project, in a JSON file under
// the directory the server was started in (the agent's project).
import fs from 'node:fs';
import path from 'node:path';

export function connectFile() {
  return process.env.FIGMA_LOCAL_MCP_CODE_CONNECT ||
    path.join(process.cwd(), '.figma-local', 'code-connect.json');
}

function read() {
  try {
    const data = JSON.parse(fs.readFileSync(connectFile(), 'utf8'));
    return Array.isArray(data.mappings) ? data : { mappings: [] };
  } catch {
    return { mappings: [] };
  }
}

function write(data) {
  const file = connectFile();
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  // The mappings are local tooling: keep them out of the project's git
  // unless the owner decides otherwise.
  const ignore = path.join(dir, '.gitignore');
  if (!process.env.FIGMA_LOCAL_MCP_CODE_CONNECT && !fs.existsSync(ignore)) {
    fs.writeFileSync(ignore, '*\n');
  }
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

/** Keys that identify a component, most stable first. */
export function componentKeys(node) {
  return [
    node.componentSetKey && `set:${node.componentSetKey}`,
    node.componentKey && `component:${node.componentKey}`,
    (node.componentSet || node.mainComponent) && `name:${node.componentSet || node.mainComponent}`,
  ].filter(Boolean);
}

export function listMappings() {
  return read().mappings;
}

/** The mapping for an instance or component node, or null. */
export function lookup(node, mappings = listMappings()) {
  for (const key of componentKeys(node)) {
    const hit = mappings.find((m) => m.key === key);
    if (hit) return hit;
  }
  return null;
}

/** Maps the node's component (the whole set when it has one). */
export function addMapping(node, { componentName, source, label }) {
  const [key] = componentKeys(node);
  if (!key) throw new Error(`${node.id} is not a component or an instance of one`);
  const data = read();
  const entry = {
    key,
    component: node.componentSet || node.mainComponent || node.name,
    componentName,
    source,
    ...(label ? { label } : {}),
  };
  data.mappings = data.mappings.filter((m) => m.key !== key).concat(entry);
  write(data);
  return entry;
}

export function removeMapping(node) {
  const keys = componentKeys(node);
  const data = read();
  const before = data.mappings.length;
  data.mappings = data.mappings.filter((m) => !keys.includes(m.key));
  write(data);
  return before - data.mappings.length;
}

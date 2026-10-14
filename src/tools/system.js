// Design system search: the components, styles and variables of the open
// file, found by a script run in the plugin.
import { z } from 'zod';
import { fileKeySchema, guard, text } from './common.js';

const KINDS = ['components', 'styles', 'variables'];

// Runs in the plugin with `figma` and `params` in scope; returns JSON text.
const SEARCH = String.raw`
const words = String(params.query || '').toLowerCase().split(/\s+/).filter(Boolean);
const matches = (...texts) => {
  const hay = texts.filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
};
const limit = params.limit;
const hex = (c, a) => {
  const h = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  const alpha = a === undefined ? (c.a === undefined ? 1 : c.a) : a;
  return ('#' + h(c.r) + h(c.g) + h(c.b) + (alpha < 1 ? h(alpha) : '')).toUpperCase();
};
const out = { truncated: [] };
const cap = (list, kind) => {
  if (list.length > limit) out.truncated.push(kind);
  return list.slice(0, limit);
};

if (params.kinds.includes('components')) {
  const pages = params.allPages ? figma.root.children : [figma.currentPage];
  const found = [];
  const remote = new Map();
  const started = Date.now();
  for (const page of pages) {
    if (Date.now() - started > params.budgetMs) {
      out.pagesSkipped = (out.pagesSkipped || 0) + 1;
      continue;
    }
    if (page !== figma.currentPage) await page.loadAsync();
    for (const node of page.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] })) {
      if (node.type === 'COMPONENT' && node.parent && node.parent.type === 'COMPONENT_SET') continue;
      if (!matches(node.name, node.description)) continue;
      const entry = { id: node.id, name: node.name, type: node.type, page: page.name,
        size: [Math.round(node.width), Math.round(node.height)] };
      if (node.description) entry.description = node.description;
      if (node.key) entry.key = node.key;
      try {
        const defs = node.componentPropertyDefinitions;
        const props = {};
        for (const [name, d] of Object.entries(defs)) {
          props[name.replace(/#\d+:\d+$/, '')] = d.type === 'VARIANT'
            ? { type: 'VARIANT', options: d.variantOptions, default: d.defaultValue }
            : { type: d.type, default: d.defaultValue };
        }
        if (Object.keys(props).length) entry.properties = props;
      } catch (e) { /* a variant with broken properties */ }
      if (node.type === 'COMPONENT_SET') entry.variants = node.children.length;
      found.push(entry);
    }
    // Library components the page already uses, through their instances.
    for (const inst of page.findAllWithCriteria({ types: ['INSTANCE'] })) {
      if (remote.size >= limit * 4) break;
      let main;
      try { main = await inst.getMainComponentAsync(); } catch (e) { continue; }
      if (!main || !main.remote) continue;
      const set = main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : null;
      const top = set || main;
      if (remote.has(top.key) || !matches(top.name, top.description, main.name)) continue;
      remote.set(top.key, { name: top.name, type: top.type, key: top.key, exampleInstance: inst.id, page: page.name });
    }
  }
  out.components = cap(found, 'components');
  out.libraryComponents = cap([...remote.values()], 'libraryComponents');
}

if (params.kinds.includes('styles')) {
  const styles = [];
  for (const s of await figma.getLocalPaintStylesAsync()) {
    if (!matches(s.name, s.description)) continue;
    const p = s.paints[0];
    styles.push({ id: s.id, name: s.name, type: 'PAINT', key: s.key,
      value: !p ? null : p.type === 'SOLID' ? hex(p.color, p.opacity) : p.type.toLowerCase() });
  }
  for (const s of await figma.getLocalTextStylesAsync()) {
    if (!matches(s.name, s.description)) continue;
    const lh = s.lineHeight.unit === 'AUTO' ? 'auto' : s.lineHeight.value + (s.lineHeight.unit === 'PIXELS' ? 'px' : '%');
    styles.push({ id: s.id, name: s.name, type: 'TEXT', key: s.key,
      value: s.fontName.family + ' ' + s.fontName.style + ' ' + s.fontSize + '/' + lh });
  }
  for (const s of await figma.getLocalEffectStylesAsync()) {
    if (!matches(s.name, s.description)) continue;
    styles.push({ id: s.id, name: s.name, type: 'EFFECT', key: s.key,
      value: s.effects.map((e) => e.type.toLowerCase()).join(', ') });
  }
  out.styles = cap(styles, 'styles');
}

if (params.kinds.includes('variables')) {
  const collections = new Map();
  for (const c of await figma.variables.getLocalVariableCollectionsAsync()) collections.set(c.id, c);
  const all = await figma.variables.getLocalVariablesAsync();
  const names = new Map(all.map((v) => [v.id, v.name]));
  const vars = [];
  for (const v of all) {
    const c = collections.get(v.variableCollectionId);
    if (!matches(v.name, c && c.name, v.description)) continue;
    const mode = c ? c.defaultModeId : Object.keys(v.valuesByMode)[0];
    const raw = v.valuesByMode[mode];
    let value = raw;
    if (raw && typeof raw === 'object' && raw.type === 'VARIABLE_ALIAS') value = { alias: names.get(raw.id) || raw.id };
    else if (v.resolvedType === 'COLOR' && raw) value = hex(raw);
    const entry = { id: v.id, name: v.name, type: v.resolvedType, collection: c ? c.name : null, value };
    if (c && c.modes.length > 1) entry.modes = c.modes.map((m) => m.name);
    if (v.codeSyntax && Object.keys(v.codeSyntax).length) entry.codeSyntax = v.codeSyntax;
    vars.push(entry);
  }
  out.variables = cap(vars, 'variables');
}
if (!out.truncated.length) delete out.truncated;
return JSON.stringify(out);
`;

/** The plugin script for a search with [params]. */
export function searchScript(params) {
  return `const params = ${JSON.stringify({ budgetMs: 60000, ...params })};\n${SEARCH}`;
}

export function registerSystemTools(server, bridge) {
  server.registerTool('search_design_system', {
    description:
      'Search the design system of the file open in Figma Desktop: local ' +
      'components and component sets (with their properties and variant ' +
      'options), library components the file already uses (with an instance ' +
      'to copy), and local paint, text and effect styles and variables (with ' +
      'their default-mode values). Every word of `query` must appear in the ' +
      'name or description; leave it empty to list everything. Call it before ' +
      'designing with use_figma, and reuse what it finds: ' +
      'figma.getNodeByIdAsync(id) then component.createInstance(), ' +
      'instance.clone() for a library component, figma.getStyleByIdAsync and ' +
      'figma.variables.getVariableByIdAsync. Libraries the file does not use ' +
      'yet are not visible to the plugin. Needs the plugin and Design mode.',
    inputSchema: {
      query: z.string().optional().describe('Words to look for, e.g. "button primary".'),
      kinds: z.array(z.enum(KINDS)).optional().describe(`What to search (default: all of ${KINDS.join(', ')}).`),
      allPages: z.boolean().optional().describe('Search components on every page, not just the current one (slower on large files).'),
      limit: z.number().int().positive().max(500).optional().describe('Most results per kind (default 50).'),
      fileKey: fileKeySchema,
    },
  }, guard(async ({ query = '', kinds = KINDS, allPages = false, limit = 50 }) => {
    const code = searchScript({ query, kinds, allPages, limit });
    const { result } = await bridge.call('run', { code }, 120000);
    return [text(JSON.parse(result))];
  }));
}

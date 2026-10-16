// Runs plugin/code.js against a stand-in for the Figma plugin API, so the
// serialisation can be tested without Figma.
import fs from 'node:fs';
import vm from 'node:vm';

const CODE = fs.readFileSync(new URL('../plugin/code.js', import.meta.url), 'utf8');
const MIXED = Symbol('mixed');

/**
 * A node from a plain description: { type, name, box: [x, y, w, h],
 * children, ...props }. Methods (exportAsync, getStyledTextSegments, ...)
 * can be overridden in the description.
 */
export function makeNode(desc, parent = null, ids = { n: 1 }) {
  const { box = [0, 0, 10, 10], children, ...props } = desc;
  const [x, y, w, h] = box;
  const node = {
    id: desc.id || `1:${ids.n++}`,
    name: desc.name || desc.type,
    visible: true,
    parent,
    absoluteBoundingBox: { x, y, width: w, height: h },
    absoluteRenderBounds: { x, y, width: w, height: h },
    width: w,
    height: h,
    relativeTransform: [[1, 0, x], [0, 1, y]],
    exportAsync: async (settings) => (settings && settings.format === 'SVG_STRING'
      ? `<svg id="${node.id}"/>` : new Uint8Array([1, 2, 3])),
    ...props,
  };
  if (children) node.children = children.map((c) => makeNode(c, node, ids));
  return node;
}

/** Loads the plugin with [root] as the document; returns { request, posted }. */
export function loadPlugin(root, { images = {}, editorType = 'figma', variables = {} } = {}) {
  const byId = new Map();
  const index = (n) => {
    byId.set(n.id, n);
    (n.children || []).forEach(index);
  };
  index(root);
  const posted = [];
  const waiters = new Map();
  const page = { id: '0:1', name: 'Page 1', type: 'PAGE', selection: [], children: [root] };
  root.parent = root.parent || page;
  const figma = {
    mixed: MIXED,
    editorType,
    undoSteps: 0,
    commitUndo() { figma.undoSteps++; },
    createFrame() {
      const frame = makeNode({ type: 'FRAME', box: [0, 0, 100, 100] }, page, { n: byId.size + 1 });
      byId.set(frame.id, frame);
      page.children.push(frame);
      return frame;
    },
    showUI() {},
    on() {},
    root: { name: 'Test file', children: [page] },
    currentPage: page,
    currentUser: { name: 'Tester' },
    fileKey: null,
    clientStorage: { getAsync: async () => '', setAsync: async () => {} },
    ui: {
      postMessage(raw) {
        const msg = JSON.parse(JSON.stringify(raw));
        posted.push(msg);
        if (msg.type === 'response' && waiters.has(msg.id)) {
          waiters.get(msg.id)(msg);
          waiters.delete(msg.id);
        }
      },
      onmessage: null,
    },
    getNodeByIdAsync: async (id) => byId.get(id) || null,
    getStyleByIdAsync: async () => null,
    getImageByHash: (hash) => (images[hash] ? { getBytesAsync: images[hash] } : null),
    base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
    variables: { getVariableByIdAsync: async (id) => variables[id] || null },
  };
  const context = vm.createContext({
    figma, __html__: '', console, setTimeout, clearTimeout, Promise, Date, JSON, Math, Map, Set, Array, Symbol,
  });
  vm.runInContext(CODE, context);
  let next = 1;
  return {
    figma,
    posted,
    request(method, params = {}) {
      const id = next++;
      return new Promise((resolve, reject) => {
        waiters.set(id, (msg) => (msg.error ? reject(new Error(msg.error)) : resolve(msg.result)));
        figma.ui.onmessage({ type: 'request', id, method, params });
      });
    },
  };
}

export { MIXED };

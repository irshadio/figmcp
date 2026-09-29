// Sparse XML outline of a node tree: ids, layer types, names, positions
// (relative to the parent) and sizes.
import { attr, num } from './util.js';

function tag(node) {
  const type = String(node.type || 'node').toLowerCase().replace(/_/g, '-');
  if (type === 'rectangle' && (node.cornerRadius || node.topLeftRadius)) {
    return 'rounded-rectangle';
  }
  return type;
}

export function toMetadataXml(root) {
  const lines = [];
  const walk = (node, parent, depth) => {
    const pad = '  '.repeat(depth);
    const attrs = [`id="${attr(node.id)}"`, `name="${attr(node.name)}"`];
    if (node.x !== undefined) {
      const x = parent && parent.x !== undefined ? node.x - parent.x : node.x;
      const y = parent && parent.y !== undefined ? node.y - parent.y : node.y;
      attrs.push(`x="${num(x)}"`, `y="${num(y)}"`,
        `width="${num(node.width)}"`, `height="${num(node.height)}"`);
    }
    if (node.visible === false) attrs.push('hidden="true"');
    if (node.childCount) attrs.push(`child-count="${node.childCount}"`);
    const children = node.children || [];
    const name = tag(node);
    if (children.length === 0) {
      lines.push(`${pad}<${name} ${attrs.join(' ')} />`);
      return;
    }
    lines.push(`${pad}<${name} ${attrs.join(' ')}>`);
    for (const child of children) walk(child, node, depth + 1);
    lines.push(`${pad}</${name}>`);
  };
  walk(root, null, 0);
  return lines.join('\n');
}

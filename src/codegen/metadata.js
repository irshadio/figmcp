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
  return outline(root, Infinity);
}

/**
 * The outline of [root] in at most [maxChars]: deep layers are left out
 * until it fits, a cut layer giving its child count. { xml, depth }, with
 * the depth the outline reaches (Infinity when whole).
 */
export function boundedMetadataXml(root, maxChars) {
  let xml = outline(root, Infinity);
  let depth = Infinity;
  if (xml.length > maxChars) {
    for (depth = maxDepthOf(root) - 1; depth > 1; depth--) {
      xml = outline(root, depth);
      if (xml.length <= maxChars) break;
    }
    if (xml.length > maxChars) xml = `${xml.slice(0, maxChars).replace(/\n[^\n]*$/, '')}\n<!-- cut: too many layers even one level deep -->`;
  }
  return { xml, depth };
}

function maxDepthOf(node) {
  return 1 + Math.max(0, ...(node.children || []).map(maxDepthOf));
}

function outline(root, maxDepth) {
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
    const cut = depth + 1 >= maxDepth && (node.children || []).length;
    if (node.childCount || cut) attrs.push(`child-count="${node.childCount || node.children.length}"`);
    const children = cut ? [] : node.children || [];
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

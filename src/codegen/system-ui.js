// Layers of a phone mock-up that the operating system draws, not the app:
// the status bar and the home indicator.

const CLOCK = /^\s*\d{1,2}:\d{2}\s*$/;
const MAX_DEPTH = 3;

function hasClock(node) {
  if (!node || node.visible === false) return false;
  if (node.type === 'TEXT') return CLOCK.test(String(node.characters || ''));
  return (node.children || []).some(hasClock);
}

/**
 * [{ id, name, kind, box: [x, y, width, height] }] for the status bars and
 * home indicators of a phone-sized [root] (positions relative to it).
 */
export function systemUi(root) {
  const out = [];
  if (!root || !(root.width >= 300 && root.width <= 480) || !Array.isArray(root.children)) return out;
  const rx = root.x || 0;
  const ry = root.y || 0;
  const walk = (n, depth) => {
    if (!n || n.visible === false || typeof n.y !== 'number') return;
    const name = String(n.name || '');
    const top = n.y - ry;
    const bottom = ry + root.height - (n.y + n.height);
    const box = [n.x - rx, top, n.width, n.height].map((v) => Math.round(v * 100) / 100);
    const bar = n.type !== 'TEXT' && top <= 4 && n.height <= 70 && n.width >= root.width * 0.8 && hasClock(n);
    if (/status ?bar/i.test(name) || bar) {
      out.push({ id: n.id, name: n.name, kind: 'status bar', box });
      return;
    }
    if (/home ?indicator/i.test(name) && bottom <= 40) {
      out.push({ id: n.id, name: n.name, kind: 'home indicator', box });
      return;
    }
    if (depth < MAX_DEPTH) (n.children || []).forEach((c) => walk(c, depth + 1));
  };
  root.children.forEach((c) => walk(c, 1));
  return out;
}

// Reference React + Tailwind code for a node tree. Positions in the tree are
// relative to the root; auto-layout frames become flex boxes, grids become
// CSS grids and everything else is placed by its constraints.
import { linearTransform, rotationOf } from './geometry.js';
import { containerClasses, inFlow, positionClasses, radiusClasses } from './layout.js';
import { drawnAsSvg, isTurned, straightLine, visibleChildren } from './nodes.js';
import {
  backgroundClasses, blendClass, effectClasses, fillLayers, imagePlacement,
  needsFillLayers, paintValue, strokeLayers,
} from './paint.js';
import {
  autoLineRatios, fontClasses, jsxText, paragraphs, segmentsOf, textBlockClasses, verticalAlign,
} from './text.js';
import { camel, num, pascal, px, tw, withVar } from './util.js';

function propName(key) {
  return camel(String(key).replace(/#.*$/, ''), 'prop');
}

function variantText(node) {
  const props = node.componentProperties || {};
  return Object.entries(props)
    .filter(([, v]) => v && v.type !== 'INSTANCE_SWAP')
    .map(([k, v]) => `${k.replace(/#.*$/, '')}=${v && v.value !== undefined ? v.value : ''}`)
    .join('; ');
}

function interactions(node) {
  return (node.reactions || []).map((r) => {
    const target = r.destination ? `${r.destination.name || ''} (${r.destination.id})` : r.url || '';
    return [r.trigger, r.action, r.navigation, target, r.transition].filter(Boolean).join(' ');
  }).join('; ');
}

function texts(node) {
  const out = [];
  const walk = (n) => {
    if (n.visible === false) return;
    if (n.type === 'TEXT' && n.characters) out.push(n.characters);
    (n.children || []).forEach(walk);
  };
  (node.children || []).forEach(walk);
  return out;
}

// JSX string attributes do not process escapes: a value with a quote or a
// backslash goes in an expression container.
function jsxAttr(value) {
  const v = String(value);
  return /["\\{}]/.test(v) ? `{${JSON.stringify(v)}}` : `"${v}"`;
}

function styleProp(style) {
  return ` style={${JSON.stringify(style).replace(/"(\w+)":/g, '$1: ')}}`;
}

function transformClass(node) {
  const m = linearTransform(node);
  const deg = rotationOf(m);
  if (deg !== null) return `rotate-[${num(deg)}deg]`;
  return `[transform:matrix(${[m.a, m.b, m.c, m.d, 0, 0].map(num).join(',')})]`;
}

class Writer {
  constructor(assets, connect, ratios) {
    this.assets = assets;
    this.connect = connect;
    this.ratios = ratios;
    this.lines = [];
    this.consts = new Map();
    this.names = new Set();
    this.connected = new Map();
    this.rasterized = [];
    this.warnings = [];
  }

  pad(depth) {
    return '  '.repeat(depth);
  }

  assetConst(url, name, fallback) {
    if (this.consts.has(url)) return this.consts.get(url);
    const base = `img${pascal(name, fallback)}`;
    let id = base;
    for (let i = 2; this.names.has(id); i++) id = `${base}${i}`;
    this.names.add(id);
    this.consts.set(url, id);
    return id;
  }

  attrs(node, extra = {}) {
    if (!node) return '';
    const out = [`data-name=${jsxAttr(node.name)}`, `data-node-id="${node.id}"`];
    if (node.type === 'INSTANCE') {
      const component = node.componentSet || node.mainComponent;
      if (component) out.push(`data-component=${jsxAttr(component)}`);
      const variant = variantText(node);
      if (variant) out.push(`data-variant=${jsxAttr(variant)}`);
    }
    let textStyle = node.styles && node.styles.text;
    if (!textStyle && node.type === 'TEXT' && segmentsOf(node).length === 1) {
      textStyle = segmentsOf(node)[0].textStyle;
    }
    if (textStyle) out.push(`data-text-style=${jsxAttr(textStyle)}`);
    if (node.reactions && node.reactions.length) {
      out.push(`data-interactions=${jsxAttr(interactions(node))}`);
    }
    for (const [k, v] of Object.entries(extra)) out.push(`${k}=${jsxAttr(v)}`);
    return ` ${out.join(' ')}`;
  }

  open(depth, tag, classes, node, style, selfClose = false, extra = {}) {
    const cls = classes.filter(Boolean).join(' ');
    let attrs = cls ? ` className="${cls}"` : '';
    if (style && Object.keys(style).length) attrs += styleProp(style);
    attrs += this.attrs(node, extra);
    this.lines.push(`${this.pad(depth)}<${tag}${attrs}${selfClose ? ' />' : '>'}`);
  }

  close(depth, tag) {
    this.lines.push(`${this.pad(depth)}</${tag}>`);
  }

  boxClasses(node, style, withFills) {
    const out = [];
    const layers = withFills ? fillLayers(node) : [];
    const stacked = needsFillLayers(layers);
    if (!stacked) out.push(...backgroundClasses(layers, style));
    out.push(...radiusClasses(node));
    if (typeof node.opacity === 'number' && node.opacity < 1) {
      out.push(`opacity-[${tw(withVar(node.vars && node.vars.opacity, num(node.opacity)))}]`);
    }
    if (node.clipsContent) out.push('overflow-clip');
    out.push(blendClass(node.blendMode));
    const effects = effectClasses(node, { hasFill: layers.length > 0, stacked });
    out.push(...effects.classes);
    return { classes: out.filter(Boolean), layers: stacked ? layers : [], inner: effects.inner };
  }

  fillLayer(depth, node, layer) {
    const radius = 'rounded-[inherit]';
    if (layer.kind === 'color') {
      const blend = blendClass(layer.blend);
      this.lines.push(`${this.pad(depth)}<div aria-hidden="true" className="absolute inset-0 pointer-events-none ${radius} bg-[${tw(layer.value)}]${blend ? ` ${blend}` : ''}" />`);
      return;
    }
    const url = this.assets.image(layer.paint.imageHash);
    if (!url) return;
    const id = this.assetConst(url, node.name, 'Image');
    const size = this.assets.imageSize ? this.assets.imageSize(layer.paint.imageHash) : null;
    const place = imagePlacement(layer.paint, size, { width: node.width, height: node.height });
    if (place.tile) {
      this.lines.push(`${this.pad(depth)}<div aria-hidden="true" className="${place.classes.join(' ')} pointer-events-none ${radius}" style={{ backgroundImage: \`url(\${${id}})\`, backgroundSize: ${JSON.stringify(place.tile.backgroundSize)} }} />`);
      return;
    }
    if (place.clip) {
      this.lines.push(`${this.pad(depth)}<div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none ${radius}">`);
      this.lines.push(`${this.pad(depth + 1)}<img alt="" className="${place.classes.join(' ')}" src={${id}} />`);
      this.lines.push(`${this.pad(depth)}</div>`);
      return;
    }
    this.lines.push(`${this.pad(depth)}<img alt="" className="${place.classes.join(' ')} pointer-events-none ${radius}" src={${id}} />`);
  }

  text(node, pos, depth) {
    const paras = paragraphs(node);
    const segs = segmentsOf(node);
    const single = segs.length === 1;
    // Styles every run shares go on the paragraph: its own line box (the
    // strut) must carry the runs' line height, font and size.
    const perRun = segs.map((seg) => fontClasses(seg, node, this.ratios));
    const shared = perRun[0].filter((c) => perRun.every((classes) => classes.includes(c)));
    const block = [...textBlockClasses(node), ...this.boxClasses(node, {}, false).classes];
    const valign = verticalAlign(node);
    const spacing = node.paragraphSpacing || 0;
    const characters = segs.map((s) => s.characters || '').join('');
    const multi = paras.length > 1 || paras.some((p) => p.pieces.some((x) => x.br));
    const spaced = /\s{2}|^\s|\s$|\t/.test(characters.replace(/[\n\u2028]/g, 'x'));
    const hug = node.textAutoResize === 'WIDTH_AND_HEIGHT';
    // A hugging text never wraps; line breaks and runs of spaces are kept.
    let ws = null;
    if (!block.includes('truncate')) {
      if (hug) ws = multi || spaced ? 'whitespace-pre' : 'whitespace-nowrap';
      else if (multi || spaced) ws = 'whitespace-pre-wrap';
    }
    const run = (piece) => {
      if (piece.br) return '{"\\n"}';
      const cls = single ? '' : fontClasses(piece.seg, node, this.ratios).filter((c) => !shared.includes(c)).join(' ');
      let inner = jsxText(piece.text);
      if (piece.seg.hyperlink && piece.seg.hyperlink.type === 'URL') {
        inner = `<a href=${jsxAttr(piece.seg.hyperlink.value)}>${inner}</a>`;
      }
      return cls ? `<span className="${cls}">${inner}</span>` : inner;
    };
    const content = (p) => (p.pieces.length ? p.pieces.map(run).join('') : '<br aria-hidden="true" />');
    const gap = (i) => (spacing && i < paras.length - 1 ? ` className="mb-[${px(spacing)}]"` : '');

    if (paras.some((p) => p.list)) {
      this.open(depth, 'div', [...pos, ws, ...shared, ...block], node);
      for (let i = 0; i < paras.length;) {
        const list = paras[i].list;
        if (!list) {
          this.lines.push(`${this.pad(depth + 1)}<p${gap(i)}>${content(paras[i])}</p>`);
          i++;
          continue;
        }
        const tag = list === 'ORDERED' ? 'ol' : 'ul';
        const indent = num(1.5 * (paras[i].indentation || 1));
        this.lines.push(`${this.pad(depth + 1)}<${tag} className="${list === 'ORDERED' ? 'list-decimal' : 'list-disc'} list-outside ps-[${indent}em]">`);
        for (; i < paras.length && paras[i].list === list; i++) {
          this.lines.push(`${this.pad(depth + 2)}<li${gap(i)}>${content(paras[i])}</li>`);
        }
        this.lines.push(`${this.pad(depth + 1)}</${tag}>`);
      }
      this.close(depth, 'div');
      return;
    }
    if (valign || (spacing && paras.length > 1)) {
      this.open(depth, 'div', [...pos, 'flex', 'flex-col', valign || 'justify-start', ws, ...shared, ...block], node);
      paras.forEach((p, i) => this.lines.push(`${this.pad(depth + 1)}<p${gap(i)}>${content(p)}</p>`));
      this.close(depth, 'div');
      return;
    }
    // One paragraph box: paragraphs are joined by newlines. A trailing
    // newline would not make a line of its own, so an empty last paragraph
    // gets one more.
    this.open(depth, 'p', [...pos, ws, ...shared, ...block], node);
    const n = paras.length;
    paras.forEach((p, i) => {
      const body = p.pieces.map(run).join('');
      const end = i < n - 1 || (!p.pieces.length && n > 1) ? '{"\\n"}' : '';
      if (body || end) this.lines.push(`${this.pad(depth + 1)}${body}${end}`);
    });
    this.close(depth, 'p');
  }

  component(node, pos, depth, mapping) {
    const name = mapping.componentName;
    this.connected.set(name, mapping);
    const props = [];
    const textProps = [];
    for (const [key, prop] of Object.entries(node.componentProperties || {})) {
      if (!prop || prop.type === 'INSTANCE_SWAP') continue;
      if (prop.type === 'TEXT') textProps.push(prop.value);
      const value = prop.type === 'BOOLEAN' ? `{${Boolean(prop.value)}}` : jsxAttr(prop.value);
      props.push(`${propName(key)}=${value}`);
    }
    const inner = texts(node).filter((t) => !textProps.includes(t));
    if (inner.length === 1) props.push(`text=${jsxAttr(inner[0])}`);
    else if (inner.length > 1) props.push(`texts={${JSON.stringify(inner)}}`);
    const cls = pos.filter(Boolean).join(' ');
    this.lines.push(`${this.pad(depth)}<${name} className="${cls}"${this.attrs(node)}${props.length ? ` ${props.join(' ')}` : ''} />`);
  }

  image(depth, node, pos, url, fallback, extra, bounds) {
    const id = this.assetConst(url, node.name, fallback);
    this.open(depth, 'div', pos, node, null, false, extra);
    const dx = bounds ? bounds.x - node.x : 0;
    const dy = bounds ? bounds.y - node.y : 0;
    const exact = !bounds || (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 &&
      Math.abs(bounds.width - node.width) < 0.01 && Math.abs(bounds.height - node.height) < 0.01);
    // An image drawn beyond the layer's box (outside strokes, shadows) keeps
    // its own size and offset.
    const cls = exact ? 'block max-w-none size-full'
      : `absolute max-w-none left-[${px(dx)}] top-[${px(dy)}] w-[${px(bounds.width)}] h-[${px(bounds.height)}]`;
    this.lines.push(`${this.pad(depth + 1)}<img alt="" className="${cls}" src={${id}} />`);
    this.close(depth, 'div');
  }

  line(depth, node, pos, line) {
    const w = line.weight;
    const value = paintValue(line.paint, line.horizontal ? node.width : w, line.horizontal ? w : node.height, line.varName);
    const ext = line.cap === 'NONE' ? 0 : w / 2;
    const edge = (side) => (ext ? `${side}-[${px(-ext)}]` : `${side}-0`);
    const bar = ['absolute',
      ...(line.horizontal ? [edge('left'), edge('right'), `top-[${px(-w / 2)}]`, `h-[${px(w)}]`]
        : [edge('top'), edge('bottom'), `left-[${px(-w / 2)}]`, `w-[${px(w)}]`]),
      `bg-[${tw(value)}]`, line.cap === 'ROUND' ? 'rounded-full' : null].filter(Boolean);
    const opacity = typeof node.opacity === 'number' && node.opacity < 1 ? `opacity-[${num(node.opacity)}]` : null;
    this.open(depth, 'div', [...pos, opacity], node);
    this.lines.push(`${this.pad(depth + 1)}<div aria-hidden="true" className="${bar.join(' ')}" />`);
    this.close(depth, 'div');
  }

  node(node, parent, depth, opts = {}) {
    if (!node || node.visible === false || node.isMask) return;
    const lines = this.lines.length;
    const consts = this.consts.size;
    try {
      this.draw(node, parent, depth, opts);
    } catch (e) {
      // One unreadable layer must not cost the whole frame: drop what it
      // wrote and leave a box of its size in its place.
      this.lines.length = lines;
      for (const [url, id] of [...this.consts].slice(consts)) {
        this.consts.delete(url);
        this.names.delete(id);
      }
      const reason = String(e && e.message ? e.message : e);
      this.warnings.push({ id: node.id, name: node.name, error: reason });
      let pos = [];
      try {
        if (typeof node.width === 'number') pos = opts.inner || positionClasses(node, parent, { ...opts, fixedSize: true });
      } catch { /* no geometry to keep */ }
      this.open(depth, 'div', pos, node, null, true, { 'data-error': reason });
    }
  }

  draw(node, parent, depth, opts) {
    if (node.error) throw new Error(`the plugin could not read this layer (${node.error})`);
    const line = straightLine(node);
    if (isTurned(node) && !node.svg && !node.render && !opts.inner && !line) {
      // The bounding box holds a box of the unturned size, turned in place.
      const pos = positionClasses(node, parent, { ...opts, fixedSize: true });
      this.lines.push(`${this.pad(depth)}<div className="${[...pos, 'flex', 'items-center', 'justify-center'].join(' ')}">`);
      this.node(node, parent, depth + 1, {
        ...opts,
        inner: ['relative', 'flex-none', `w-[${px(node.rawWidth)}]`, `h-[${px(node.rawHeight)}]`, transformClass(node)],
      });
      this.close(depth, 'div');
      return;
    }
    const pos = opts.inner || positionClasses(node, parent, {
      ...opts, fixedSize: Boolean(node.svg || node.render),
    });

    const mapping = node.type === 'INSTANCE' && this.connect ? this.connect(node) : null;
    if (mapping) {
      this.component(node, pos, depth, mapping);
      return;
    }
    if (node.type === 'TEXT') {
      this.text(node, pos, depth);
      return;
    }
    if (line) {
      this.line(depth, node, pos, line);
      return;
    }
    if (drawnAsSvg(node)) {
      // The SVG already carries the node's own paints, effects and opacity.
      this.image(depth, node, pos, this.assets.svg(node.svg), 'Vector', {}, node.svgBounds);
      return;
    }
    if (node.render && this.assets.render) {
      this.rasterized.push({ id: node.id, name: node.name, reason: node.rasterized });
      this.image(depth, node, pos, this.assets.render(node.render), 'Render',
        { 'data-rasterized': node.rasterized || 'render' }, node.renderBounds);
      return;
    }

    const style = {};
    const box = this.boxClasses(node, style, true);
    const strokes = strokeLayers(node, { clip: Boolean(node.clipsContent), radius: (grow) => radiusClasses(node, grow) });
    const classes = [...pos, ...containerClasses(node), ...box.classes, ...strokes.classes];
    const children = visibleChildren(node);
    if (!children.length && !box.layers.length && !box.inner && !strokes.overlays.length) {
      this.open(depth, 'div', classes, node, style, true);
      return;
    }
    this.open(depth, 'div', classes, node, style);
    for (const layer of box.layers) this.fillLayer(depth + 1, node, layer);
    if (box.inner) {
      this.lines.push(`${this.pad(depth + 1)}<div aria-hidden="true" className="absolute inset-0 pointer-events-none rounded-[inherit] ${box.inner}" />`);
    }
    const flowCount = children.filter((c) => inFlow(c, node)).length;
    let flow = 0;
    children.forEach((child) => {
      const index = inFlow(child, node) ? flow++ : undefined;
      this.node(child, node, depth + 1, { index, count: flowCount });
    });
    for (const s of strokes.overlays) {
      const st = Object.keys(s.style).length ? styleProp(s.style) : '';
      this.lines.push(`${this.pad(depth + 1)}<div aria-hidden="true" className="${s.classes.join(' ')}"${st} />`);
    }
    this.close(depth, 'div');
  }
}

/**
 * Returns { code, assets, connected, rasterized, warnings }: assets maps
 * each constant used in the code to its URL; connected lists the mapped
 * components used; warnings lists the layers drawn as placeholders.
 *
 * [assets] resolves embedded data to URLs:
 *   { svg(text), image(hash), imageSize?(hash), render?({ base64 }) }.
 * [connect] returns a mapping ({ componentName, source, label }) for an
 * instance, or null.
 */
export function toReactTailwind(root, assets, { connect = null } = {}) {
  const writer = new Writer(assets, connect, autoLineRatios(root));
  writer.node({ ...root, x: root.x ?? 0, y: root.y ?? 0 }, null, 2);
  const header = [...writer.connected.values()].map((m) =>
    `// ${m.componentName}: ${m.source}${m.label ? ` (${m.label})` : ''}`);
  const consts = [...writer.consts].map(([url, id]) => `const ${id} = "${url}";`);
  const code = [
    ...header,
    ...(header.length ? [''] : []),
    ...consts,
    ...(consts.length ? [''] : []),
    `export default function ${pascal(root.name)}() {`,
    '  return (',
    ...writer.lines,
    '  );',
    '}',
  ].join('\n');
  const map = {};
  for (const [url, id] of writer.consts) map[id] = url;
  return {
    code,
    assets: map,
    connected: [...writer.connected.values()],
    rasterized: writer.rasterized,
    warnings: writer.warnings,
  };
}

export function countNodes(tree) {
  let n = 0;
  const walk = (node) => {
    if (!node || node.visible === false) return;
    n++;
    (node.children || []).forEach(walk);
  };
  walk(tree);
  return n;
}

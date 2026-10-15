// Reference React + Tailwind code for a node tree. Positions in the tree are
// relative to the root; auto-layout frames become flex boxes, grids become
// CSS grids and everything else is placed by its constraints.
import { linearTransform, rotationOf } from './geometry.js';
import {
  containerClasses, inFlow, isAutoLayout, isGrid, positionClasses, radiusClasses, sizingOf,
} from './layout.js';
import { drawnAsSvg, hasImageFill, isTurned, straightLine, visibleChildren } from './nodes.js';
import {
  isPhoneScreen, minPageHeight, pinnedChildren, scrollsOnScreen, stretchesOnScreen,
} from './page.js';
import {
  backgroundClasses, blendClass, effectClasses, fillLayers, imagePlacement,
  needsFillLayers, paintValue, strokeLayers,
} from './paint.js';
import {
  altText, containerElement, fieldPlaceholder, headingTag, isGenericName, readableName,
} from './semantics.js';
import { collapseRuns } from './runs.js';
import { mergeEdges, snapClass, tokensCss } from './tailwind.js';
import {
  autoLineRatios, cssWeight, fontClasses, jsxText, paragraphs, scriptOf, segmentsOf, textBlockClasses,
  verticalAlign,
} from './text.js';
import { camel, num, pascal, px, tw, varIdent, withVar } from './util.js';

const CSS_BLENDS = new Set(['NORMAL', 'PASS_THROUGH', 'MULTIPLY', 'SCREEN', 'OVERLAY', 'DARKEN', 'LIGHTEN',
  'COLOR_DODGE', 'COLOR_BURN', 'HARD_LIGHT', 'SOFT_LIGHT', 'DIFFERENCE', 'EXCLUSION', 'HUE', 'SATURATION',
  'COLOR', 'LUMINOSITY']);
const DROPPED_EFFECTS = { NOISE: 'noise', TEXTURE: 'texture', GLASS: 'glass' };
// A phone screen fills phones up to this width and is centred on wider screens.
const PHONE_MAX = 480;
// Hides a scroller's scrollbar, as on phones, without stopping the scroll.
const NO_SCROLLBAR = ['[scrollbar-width:none]', '[&::-webkit-scrollbar]:hidden'];
// Names a component may not take: the React and DOM globals the code uses.
const RESERVED = new Set(['React', 'Fragment', 'Image', 'Text', 'Option', 'Audio', 'Element', 'Node', 'Map', 'Set']);

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

/** Paragraphs without the spaces that end each of their lines. */
function trimLineEnds(paras) {
  return paras.map((p) => {
    const pieces = [];
    for (let i = p.pieces.length - 1, end = true; i >= 0; i--) {
      const piece = p.pieces[i];
      if (piece.br) {
        end = true;
        pieces.unshift(piece);
        continue;
      }
      const text = end ? piece.text.replace(/[ \t]+$/, '') : piece.text;
      end = end && !text;
      if (text) pieces.unshift({ ...piece, text });
    }
    return { ...p, pieces };
  });
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

/** Final class list: exact theme utilities where they exist, no empty entries. */
function classList(classes) {
  return mergeEdges(classes.filter(Boolean).map(snapClass)).join(' ');
}

/** A file name from a layer name ('Arrow Right' -> 'arrow-right'). */
function fileStem(name, fallback) {
  const stem = isGenericName(name) ? '' : String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return stem || fallback;
}

function extOf(url) {
  const m = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(String(url));
  return m ? m[1].toLowerCase() : 'png';
}

/** What the design has that the code leaves out or draws differently. */
function approximations(node) {
  const out = [];
  const paints = (list) => (Array.isArray(list) ? list.filter((p) => p && p.visible !== false) : []);
  for (const p of paints(node.fills)) {
    if (p.type === 'GRADIENT_DIAMOND') out.push('a diamond gradient is drawn as a radial gradient');
    if (p.type === 'VIDEO') out.push('a video fill is not drawn');
    if (p.blendMode && !CSS_BLENDS.has(p.blendMode)) out.push(`the ${p.blendMode.toLowerCase().replace(/_/g, ' ')} blend of a fill is drawn normal`);
  }
  const strokes = paints(node.strokes);
  if (node.type === 'TEXT') {
    if (strokes.some((p) => p.type !== 'SOLID')) out.push('a text stroke that is not a solid colour is not drawn');
    for (const seg of segmentsOf(node)) {
      if (paints(seg.fills).some((p) => p.type === 'IMAGE' || p.type === 'VIDEO')) out.push('an image text fill is not drawn');
      if (seg.hyperlink && seg.hyperlink.type === 'NODE') out.push('a link to another layer is plain text: wire the navigation');
    }
  } else if (strokes.length) {
    if (strokes.some((p) => p.type === 'IMAGE' || p.type === 'VIDEO')) out.push('an image stroke is not drawn');
    if (strokes.some((p) => p.type === 'GRADIENT_DIAMOND')) out.push('a diamond gradient stroke is drawn as a radial gradient');
    if (Array.isArray(node.dashPattern) && node.dashPattern.length && !dashedLine(node)) {
      out.push('a dashed stroke uses the browser\'s dash lengths');
    }
  }
  for (const e of Array.isArray(node.effects) ? node.effects : []) {
    if (!e || e.visible === false) continue;
    if (DROPPED_EFFECTS[e.type]) out.push(`the ${DROPPED_EFFECTS[e.type]} effect is not drawn`);
    if ((e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') && e.blurType === 'PROGRESSIVE') {
      out.push('a progressive blur is drawn as a uniform blur');
    }
    const fills = paints(node.fills);
    if (e.type === 'DROP_SHADOW' && e.spread && node.type !== 'TEXT' && !fills.length && (node.children || []).length) {
      out.push('the drop shadow of a box without fills follows its content and loses its spread');
    }
  }
  if (node.blendMode && !CSS_BLENDS.has(node.blendMode)) out.push(`the ${node.blendMode.toLowerCase().replace(/_/g, ' ')} blend of the layer is drawn normal`);
  return out;
}

class Writer {
  constructor(assets, { connect = null, ratios = null, screen = null, assetDir = null } = {}) {
    this.assets = assets;
    this.connect = connect;
    this.ratios = ratios;
    this.screen = screen;
    this.assetDir = assetDir ? assetDir.replace(/^\/+|\/+$/g, '') : null;
    this.lines = [];
    this.consts = new Map();
    this.names = new Set();
    this.files = new Map();
    this.fileNames = new Set();
    this.connected = new Map();
    this.rasterized = [];
    this.warnings = [];
    this.placeholders = [];
    this.fonts = new Map();
    this.textStyles = new Map();
    this.inputs = new Map();
    this.arrays = [];
    this.runs = false;
    this.stack = [];
  }

  pad(depth) {
    return '  '.repeat(depth);
  }

  warn(node, message) {
    if (!this.warnings.some((w) => w.id === node.id && w.message === message)) {
      this.warnings.push({ id: node.id, name: node.name, message });
    }
  }

  /** The tags open above the current element. */
  inside() {
    return new Set(this.stack);
  }


  /**
   * The constant holding an asset's URL. With an asset folder, the file is
   * named after the layer and the URL points into the folder.
   */
  assetConst(source, name, fallback) {
    if (this.consts.has(source)) return this.consts.get(source);
    const base = `img${pascal(isGenericName(name) ? fallback : name, fallback)}`;
    let id = base;
    for (let i = 2; this.names.has(id); i++) id = `${base}${i}`;
    this.names.add(id);
    let url = source;
    if (this.assetDir) {
      const stem = fileStem(name, fallback.toLowerCase());
      const ext = extOf(source);
      let file = `${stem}.${ext}`;
      for (let i = 2; this.fileNames.has(file); i++) file = `${stem}-${i}.${ext}`;
      this.fileNames.add(file);
      const projectPath = `${this.assetDir}/${file}`;
      url = `/${projectPath.replace(/^(public|static)\//, '')}`;
      this.files.set(projectPath, { url, source });
    }
    this.consts.set(source, { id, url });
    return this.consts.get(source);
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
    const textStyle = this.textStyleOf(node);
    if (textStyle) out.push(`data-text-style=${jsxAttr(textStyle)}`);
    if (node.reactions && node.reactions.length) {
      out.push(`data-interactions=${jsxAttr(interactions(node))}`);
    }
    for (const [k, v] of Object.entries(extra)) out.push(`${k}=${jsxAttr(v)}`);
    return ` ${out.join(' ')}`;
  }

  textStyleOf(node) {
    const style = node.styles && node.styles.text;
    if (style) return style;
    if (node.type === 'TEXT' && segmentsOf(node).length === 1) return segmentsOf(node)[0].textStyle || null;
    return null;
  }

  open(depth, tag, classes, node, style, selfClose = false, extra = {}) {
    const cls = classList(classes);
    let attrs = cls ? ` className="${cls}"` : '';
    if (style && Object.keys(style).length) attrs += styleProp(style);
    attrs += this.attrs(node, extra);
    this.lines.push(`${this.pad(depth)}<${tag}${attrs}${selfClose ? ' />' : '>'}`);
    if (!selfClose) this.stack.push(tag);
  }

  close(depth, tag) {
    this.stack.pop();
    this.lines.push(`${this.pad(depth)}</${tag}>`);
  }

  /** A line with no node of its own (fill layers, overlays). */
  raw(depth, html) {
    this.lines.push(`${this.pad(depth)}${html}`);
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

  fillLayer(depth, node, layer, content) {
    const radius = 'rounded-[inherit]';
    if (layer.kind === 'color') {
      const blend = blendClass(layer.blend);
      this.raw(depth, `<div aria-hidden="true" className="${classList(['absolute', 'inset-0', 'pointer-events-none', radius, `bg-[${tw(layer.value)}]`, blend])}" />`);
      return;
    }
    const source = this.assets.image(layer.paint.imageHash);
    if (!source) {
      this.warn(node, 'an image fill has no image data');
      return;
    }
    const { id } = this.assetConst(source, node.name, 'Image');
    const size = this.assets.imageSize ? this.assets.imageSize(layer.paint.imageHash) : null;
    const place = imagePlacement(layer.paint, size, { width: node.width, height: node.height });
    // A layer that is only a picture is content and says what it shows.
    const alt = content ? altText(node) : '';
    const hidden = alt ? '' : ' aria-hidden="true"';
    if (place.tile) {
      this.raw(depth, `<div${content && alt ? ` role="img" aria-label=${jsxAttr(alt)}` : ' aria-hidden="true"'} className="${classList([...place.classes, 'pointer-events-none', radius])}" style={{ backgroundImage: \`url(\${${id}})\`, backgroundSize: ${JSON.stringify(place.tile.backgroundSize)} }} />`);
      return;
    }
    if (place.clip) {
      this.raw(depth, `<div${hidden} className="${classList(['absolute', 'inset-0', 'overflow-hidden', 'pointer-events-none', radius])}">`);
      this.raw(depth + 1, `<img alt=${jsxAttr(alt)} className="${classList(place.classes)}" src={${id}} />`);
      this.raw(depth, '</div>');
      return;
    }
    this.raw(depth, `<img alt=${jsxAttr(alt)} className="${classList([...place.classes, 'pointer-events-none', radius])}" src={${id}} />`);
  }

  font(seg) {
    const family = seg.fontName && seg.fontName.family;
    if (!family) return;
    const italic = /italic|oblique/i.test(seg.fontName.style || '');
    const key = `${cssWeight(seg)}${italic ? ' italic' : ''}`;
    if (!this.fonts.has(family)) this.fonts.set(family, new Set());
    this.fonts.get(family).add(key);
  }

  text(node, pos, depth) {
    const hug = node.textAutoResize === 'WIDTH_AND_HEIGHT';
    // Figma leaves spaces at the end of a line out of a hugging box's width.
    const paras = hug ? trimLineEnds(paragraphs(node)) : paragraphs(node);
    const segs = segmentsOf(node);
    segs.forEach((seg) => this.font(seg));
    const single = segs.length === 1;
    // Styles every run shares go on the paragraph: its own line box (the
    // strut) must carry the runs' line height, font and size. Raised and
    // lowered runs set their own size; the line box comes from the others.
    const regular = segs.filter((seg) => !scriptOf(seg));
    const perRun = (regular.length ? regular : segs).map((seg) => fontClasses(seg, node, this.ratios));
    const shared = perRun[0].filter((c) => perRun.every((classes) => classes.includes(c)));
    const block = [...textBlockClasses(node), ...this.boxClasses(node, {}, false).classes, roundedHeight(node, paras)];
    const valign = verticalAlign(node);
    const spacing = node.paragraphSpacing || 0;
    const characters = paras.map((p) => p.pieces.map((x) => (x.br ? '\u2028' : x.text)).join('')).join('\n');
    const multi = paras.length > 1 || paras.some((p) => p.pieces.some((x) => x.br));
    const spaced = /\s{2}|^\s|\s$|\t/.test(characters.replace(/[\n\u2028]/g, 'x'));
    const style = this.textStyleOf(node);
    if (style && !this.textStyles.has(style)) this.textStyles.set(style, shared.filter((c) => !/^text-\[#|^text-\[rgba|^text-\[var/.test(c)));
    // A hugging text never wraps; line breaks and runs of spaces are kept.
    let ws = null;
    if (!block.includes('truncate')) {
      if (hug) ws = multi || spaced ? 'whitespace-pre' : 'whitespace-nowrap';
      else if (multi || spaced) ws = 'whitespace-pre-wrap';
    }
    const run = (piece) => {
      if (piece.br) return '{"\\n"}';
      const cls = single ? '' : classList(fontClasses(piece.seg, node, this.ratios).filter((c) => !shared.includes(c)));
      let inner = jsxText(piece.text);
      if (piece.seg.hyperlink && piece.seg.hyperlink.type === 'URL') {
        inner = `<a href=${jsxAttr(piece.seg.hyperlink.value)}>${inner}</a>`;
      }
      return cls ? `<span className="${cls}">${inner}</span>` : inner;
    };
    const content = (p) => (p.pieces.length ? p.pieces.map(run).join('') : '<br aria-hidden="true" />');
    const gap = (i) => (spacing && i < paras.length - 1 ? ` className="${classList([`mb-[${px(spacing)}]`])}"` : '');

    if (paras.some((p) => p.list)) {
      this.open(depth, 'div', [...pos, ws, ...shared, ...block], node);
      for (let i = 0; i < paras.length;) {
        const list = paras[i].list;
        if (!list) {
          this.raw(depth + 1, `<p${gap(i)}>${content(paras[i])}</p>`);
          i++;
          continue;
        }
        const tag = list === 'ORDERED' ? 'ol' : 'ul';
        const indent = num(1.5 * (paras[i].indentation || 1));
        this.raw(depth + 1, `<${tag} className="${list === 'ORDERED' ? 'list-decimal' : 'list-disc'} list-outside ps-[${indent}em]">`);
        for (; i < paras.length && paras[i].list === list; i++) {
          this.raw(depth + 2, `<li${gap(i)}>${content(paras[i])}</li>`);
        }
        this.raw(depth + 1, `</${tag}>`);
      }
      this.close(depth, 'div');
      return;
    }
    const heading = this.inside().has('button') || this.inside().has('a') ? null : headingTag(style);
    if (valign || (spacing && paras.length > 1)) {
      this.open(depth, heading || 'div', [...pos, 'flex', 'flex-col', valign || 'justify-start', ws, ...shared, ...block], node);
      paras.forEach((p, i) => this.raw(depth + 1, `<${heading ? 'span' : 'p'}${gap(i)}${heading ? ' className="block"' : ''}>${content(p)}</${heading ? 'span' : 'p'}>`));
      this.close(depth, heading || 'div');
      return;
    }
    // One paragraph box: paragraphs are joined by newlines. A trailing
    // newline would not make a line of its own, so an empty last paragraph
    // gets one more.
    const tag = heading || 'p';
    this.open(depth, tag, [...pos, ws, ...shared, ...block], node);
    const n = paras.length;
    paras.forEach((p, i) => {
      const body = p.pieces.map(run).join('');
      const end = i < n - 1 || (!p.pieces.length && n > 1) ? '{"\\n"}' : '';
      if (body || end) this.raw(depth + 1, `${body}${end}`);
    });
    this.close(depth, tag);
  }

  /**
   * The placeholder of a text field as an <input>: the text's font and
   * box, its colour as the placeholder's. In a row it takes the free room
   * when that moves nothing else (last in the row, or a space-between row).
   * False when the text cannot be one (several styles, gradient text).
   */
  input(node, parent, pos, depth) {
    const field = this.inputs.get(node.id);
    const segs = segmentsOf(node);
    if (segs.length !== 1 || !parent) return false;
    const font = fontClasses(segs[0], node, this.ratios);
    if (font.includes('bg-clip-text')) return false;
    this.font(segs[0]);
    const colour = (c) => /^text-\[(#|rgba?\(|var\()/.test(c);
    const flow = visibleChildren(parent).filter((c) => inFlow(c, parent));
    const row = inFlow(node, parent) && parent.layoutMode === 'HORIZONTAL';
    const grow = row && (flow[flow.length - 1] === node || parent.primaryAxisAlignItems === 'SPACE_BETWEEN' ||
      sizingOf(node, parent, 'x') === 'FILL');
    let box = pos;
    if (grow) box = [...pos.filter((c) => !/^(w-|min-w-|flex-\[|shrink-0$|max-w-)/.test(c)), 'flex-1', 'min-w-0'];
    else box = pos.map((c) => (/^min-w-\[/.test(c) && node.textAutoResize === 'WIDTH_AND_HEIGHT' ? c.slice(4) : c));
    const classes = [...box, ...font.map((c) => (colour(c) ? `placeholder:${c}` : c)),
      ...textBlockClasses(node).filter((c) => !/^(truncate|line-clamp|overflow-hidden|text-ellipsis)/.test(c)),
      'bg-transparent', 'border-0', 'p-0', 'outline-none', field.type === 'search' ? '[appearance:none]' : null];
    const characters = String(node.characters || '').trim();
    const attrs = { type: field.type, placeholder: characters };
    if (field.label !== characters) attrs['aria-label'] = field.label;
    this.open(depth, 'input', classes, node, null, true, attrs);
    return true;
  }

  /**
   * A mapped component: its layout stays on a wrapper, so the component
   * gets only the variant props it has in Figma; its texts are a hint.
   */
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
    this.open(depth, 'div', pos, node);
    if (inner.length) {
      const hint = inner.map((t) => JSON.stringify(t)).join(', ').replace(/\*\//g, '*\\/');
      this.raw(depth + 1, `{/* ${name} texts in the design: ${hint} */}`);
    }
    this.raw(depth + 1, `<${name}${props.length ? ` ${props.join(' ')}` : ''} />`);
    this.close(depth, 'div');
  }

  image(depth, node, pos, source, fallback, extra, bounds, alt = '') {
    const { id } = this.assetConst(source, node.name, fallback);
    this.open(depth, 'div', pos, node, null, false, extra);
    const dx = bounds ? bounds.x - node.x : 0;
    const dy = bounds ? bounds.y - node.y : 0;
    const exact = !bounds || (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 &&
      Math.abs(bounds.width - node.width) < 0.01 && Math.abs(bounds.height - node.height) < 0.01);
    // An image drawn beyond the layer's box (outside strokes, shadows) keeps
    // its own size and offset.
    const cls = exact ? ['block', 'max-w-none', 'size-full']
      : ['absolute', 'max-w-none', `left-[${px(dx)}]`, `top-[${px(dy)}]`, `w-[${px(bounds.width)}]`, `h-[${px(bounds.height)}]`];
    this.raw(depth + 1, `<img alt=${jsxAttr(alt)} className="${classList(cls)}" src={${id}} />`);
    this.close(depth, 'div');
  }

  line(depth, node, pos, line) {
    const w = line.weight;
    let value = paintValue(line.paint, line.horizontal ? node.width : w, line.horizontal ? w : node.height, line.varName);
    if (line.dashes && line.paint.type === 'SOLID') {
      // Figma's dash pattern, repeated along the line from its start.
      let at = 0;
      const stops = [];
      line.dashes.forEach((d, i) => {
        const color = i % 2 ? 'transparent' : value;
        stops.push(`${color} ${px(at)} ${px(at + d)}`);
        at += d;
      });
      value = `repeating-linear-gradient(${line.horizontal ? '90deg' : '180deg'},${stops.join(',')})`;
    }
    const ext = line.cap === 'NONE' ? 0 : w / 2;
    const edge = (side) => (ext ? `${side}-[${px(-ext)}]` : `${side}-0`);
    const bar = ['absolute',
      ...(line.horizontal ? [edge('left'), edge('right'), `top-[${px(-w / 2)}]`, `h-[${px(w)}]`]
        : [edge('top'), edge('bottom'), `left-[${px(-w / 2)}]`, `w-[${px(w)}]`]),
      `bg-[${tw(value)}]`, line.cap === 'ROUND' ? 'rounded-full' : null];
    const opacity = typeof node.opacity === 'number' && node.opacity < 1 ? `opacity-[${num(node.opacity)}]` : null;
    this.open(depth, 'div', [...pos, opacity], node);
    this.raw(depth + 1, `<div aria-hidden="true" className="${classList(bar)}" />`);
    this.close(depth, 'div');
  }

  node(node, parent, depth, opts = {}) {
    if (!node || node.visible === false || node.isMask) return;
    const lines = this.lines.length;
    const consts = this.consts.size;
    const files = this.files.size;
    const open = this.stack.length;
    try {
      this.draw(node, parent, depth, opts);
    } catch (e) {
      // One unreadable layer must not cost the whole frame: drop what it
      // wrote and leave a box of its size in its place.
      this.lines.length = lines;
      this.stack.length = open;
      for (const [source, { id }] of [...this.consts].slice(consts)) {
        this.consts.delete(source);
        this.names.delete(id);
      }
      for (const file of [...this.files.keys()].slice(files)) {
        this.files.delete(file);
        this.fileNames.delete(file.split('/').pop());
      }
      const reason = String(e && e.message ? e.message : e);
      this.placeholders.push({ id: node.id, name: node.name, error: reason });
      let pos = [];
      try {
        if (typeof node.width === 'number') pos = opts.inner || positionClasses(node, parent, { ...opts, fixedSize: true });
      } catch { /* no geometry to keep */ }
      this.open(depth, 'div', pos, node, null, true, { 'data-error': reason });
    }
  }

  /** Repeated children from line [starts[0]] on become data and a .map(). */
  collapse(node, starts, depth) {
    const chunks = starts.map((start, i) => this.lines.slice(start, i + 1 < starts.length ? starts[i + 1] : this.lines.length));
    const base = camel(readableName(node) || 'items', 'items');
    const nameFor = () => {
      let name = /s$/.test(base) ? base : `${base}Items`;
      for (let i = 2; this.names.has(name); i++) name = `${/s$/.test(base) ? base : `${base}Items`}${i}`;
      this.names.add(name);
      return name;
    };
    const out = collapseRuns(chunks, depth * 2, nameFor);
    if (!out.arrays.length) return;
    this.lines.splice(starts[0], this.lines.length - starts[0], ...out.lines);
    this.arrays.push(...out.arrays);
  }

  /** Screen-mode placement options for a child of [parent]. */
  screenOpts(node, parent, siblings, scroller = false) {
    if (!this.screen || !parent) return {};
    const out = {};
    if (parent === this.screen && !inFlow(node, parent)) {
      out.stretch = stretchesOnScreen(node, parent, node.type === 'TEXT' && node.textAutoResize === 'WIDTH_AND_HEIGHT');
    }
    if (!inFlow(node, parent) || node.svg || node.render || hasImageFill(node) || node.type === 'TEXT' && node.textAutoResize === 'WIDTH_AND_HEIGHT') return out;
    if (parent.layoutMode === 'VERTICAL') {
      // A fixed width narrower than the column may shrink with the screen.
      const room = parent.width - (parent.paddingLeft || 0) - (parent.paddingRight || 0);
      out.narrow = sizingOf(node, parent, 'x') === 'FIXED' && node.width <= room + 0.01;
    } else if (parent.layoutMode === 'HORIZONTAL' && (parent.itemSpacing || 0) >= 0 && !scroller) {
      // Fixed-width columns of text in a row that fits may shrink when the
      // screen is narrower than the design; with room they keep their width.
      const room = parent.width - (parent.paddingLeft || 0) - (parent.paddingRight || 0);
      const between = parent.primaryAxisAlignItems === 'SPACE_BETWEEN';
      const total = siblings.reduce((t, c) => t + c.width, 0) + (between ? 0 : (parent.itemSpacing || 0) * (siblings.length - 1));
      const fills = siblings.some((c) => sizingOf(c, parent, 'x') === 'FILL');
      out.shrink = !fills && total <= room + 0.5 && sizingOf(node, parent, 'x') === 'FIXED' && hasText(node);
    }
    return out;
  }

  draw(node, parent, depth, opts) {
    if (node.error) throw new Error(`the plugin could not read this layer (${node.error})`);
    for (const message of approximations(node)) this.warn(node, message);
    const line = dashedLine(node) || straightLine(node);
    if (isTurned(node) && !node.svg && !node.render && !opts.inner && !line) {
      // The bounding box holds a box of the unturned size, turned in place.
      const pos = positionClasses(node, parent, { ...opts, fixedSize: true });
      this.raw(depth, `<div className="${classList([...pos, 'flex', 'items-center', 'justify-center'])}">`);
      this.node(node, parent, depth + 1, {
        ...opts,
        inner: ['relative', 'flex-none', `w-[${px(node.rawWidth)}]`, `h-[${px(node.rawHeight)}]`, transformClass(node)],
      });
      this.raw(depth, '</div>');
      return;
    }
    // A hugging layout whose children are all hidden keeps the size Figma
    // left it at; an empty CSS box would collapse.
    const empty = (isAutoLayout(node) || isGrid(node)) && !visibleChildren(node).some((c) => inFlow(c, node));
    const pos = opts.inner || (parent ? positionClasses(node, parent, {
      ...opts, fixedSize: Boolean(node.svg || node.render) || empty,
    }) : this.rootClasses(node));

    const mapping = node.type === 'INSTANCE' && this.connect ? this.connect(node) : null;
    if (mapping) {
      this.component(node, pos, depth, mapping);
      return;
    }
    if (node.type === 'TEXT') {
      if (!this.inputs.has(node.id) || !this.input(node, parent, pos, depth)) this.text(node, pos, depth);
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
        { 'data-rasterized': node.rasterized || 'render' }, node.renderBounds, readableName(node));
      return;
    }

    const style = {};
    const box = this.boxClasses(node, style, true);
    const strokes = strokeLayers(node, { clip: Boolean(node.clipsContent), radius: (grow) => radiusClasses(node, grow) });
    let classes = [...pos, ...containerClasses(node), ...box.classes, ...strokes.classes];
    const scroll = this.screen && parent ? scrollsSideways(node, parent, this.screen) : null;
    if (scroll) {
      // On a phone a row wider than its room scrolls sideways instead of
      // being cut off; its scroll starts where the design shows it.
      const when = scroll.below ? `max-[${px(scroll.below)}]:` : '';
      if (!when) classes = classes.filter((c) => c !== 'overflow-clip');
      classes.push(...(scroll.beyond ? [`${when}max-w-full`] : []), `${when}overflow-x-auto`, `${when}overflow-y-hidden`, ...NO_SCROLLBAR);
      this.warn(node, scroll.below
        ? `the row scrolls sideways on screens narrower than ${num(scroll.below)}px, where its content would be cut off`
        : 'the row scrolls sideways on a phone: its content is wider than its room');
    }
    const children = visibleChildren(node);
    const element = parent ? containerElement(node, this.inside()) : null;
    const tag = element ? element.tag : 'div';
    if (element && (tag === 'button' || tag === 'a')) {
      // Buttons centre their text and links are inline: keep the layer's own layout.
      if (!classes.some((c) => c === 'flex' || c === 'grid')) classes.push('block');
      classes.push('text-start', 'cursor-pointer');
    }
    const extra = element ? element.attrs : {};
    const field = tag === 'div' ? fieldPlaceholder(node, this.inside()) : null;
    if (field) this.inputs.set(field.id, field);
    if (!children.length && !box.layers.length && !box.inner && !strokes.overlays.length) {
      this.open(depth, tag, classes, node, style, tag === 'div', extra);
      if (tag !== 'div') this.close(depth, tag);
      return;
    }
    this.open(depth, tag, classes, node, style, false, extra);
    const content = !children.length && box.layers.length === 1 && box.layers[0].kind === 'image';
    for (const layer of box.layers) this.fillLayer(depth + 1, node, layer, content);
    if (box.inner) {
      this.raw(depth + 1, `<div aria-hidden="true" className="${classList(['absolute', 'inset-0', 'pointer-events-none', 'rounded-[inherit]', box.inner])}" />`);
    }
    const pinned = parent ? new Set() : this.pinned;
    const flowChildren = children.filter((c) => inFlow(c, node));
    let flow = 0;
    const starts = [];
    children.filter((c) => !pinned.has(c.id)).forEach((child) => {
      const index = inFlow(child, node) ? flow++ : undefined;
      starts.push(this.lines.length);
      this.node(child, node, depth + 1, { index, count: flowChildren.length, ...this.screenOpts(child, node, flowChildren, Boolean(scroll)) });
    });
    if (this.runs && starts.length >= 3) this.collapse(node, starts, depth + 1);
    if (pinned.size) {
      // Layers Figma keeps in place while the page scrolls: a box over the
      // screen holds them where the design has them.
      this.raw(depth + 1, `<div className="${classList(['fixed', 'inset-x-0', 'top-0', 'z-10', 'mx-auto', 'w-full', `max-w-[${px(PHONE_MAX)}]`, 'h-dvh', 'pointer-events-none', '[&>*]:pointer-events-auto'])}">`);
      this.stack.push('div');
      for (const child of children.filter((c) => pinned.has(c.id))) {
        this.node(child, node, depth + 2, { ...this.screenOpts(child, node, flowChildren) });
      }
      this.stack.pop();
      this.raw(depth + 1, '</div>');
    }
    for (const s of strokes.overlays) {
      const st = Object.keys(s.style).length ? styleProp(s.style) : '';
      this.raw(depth + 1, `<div aria-hidden="true" className="${classList(s.classes)}"${st} />`);
    }
    this.close(depth, tag);
  }

  /** The root's box: the design's size, or on a phone screen the screen's. */
  rootClasses(node) {
    if (!this.screen) return positionClasses(node, null);
    // The page fills the screen, and on a screen too short for its layers
    // keeps the shortest height they fit and scrolls.
    const H = isAutoLayout(node) ? node.height
      : minPageHeight(node, visibleChildren(node).filter((c) => !this.pinned.has(c.id)));
    return ['relative', 'w-full', `max-w-[${px(PHONE_MAX)}]`, 'mx-auto', `min-h-[max(100dvh,${px(H)})]`];
  }
}

/** A straight line with a solid dashed stroke and plain ends: straightLine plus its dashes. */
function dashedLine(node) {
  const dashes = Array.isArray(node.dashPattern) ? node.dashPattern.filter((d) => d >= 0) : [];
  if (node.type !== 'LINE' || !dashes.length || dashes.every((d) => !d) || (node.strokeCap || 'NONE') !== 'NONE') return null;
  const line = straightLine({ ...node, dashPattern: [] });
  if (!line || line.paint.type !== 'SOLID') return null;
  return { ...line, dashes: dashes.length % 2 ? [...dashes, ...dashes] : dashes };
}

/**
 * Whether a row of a phone screen scrolls sideways: { beyond, below }.
 * [beyond] when the row runs past its column (it is then held to the
 * column's width), else its content overflows its own box. A row that ends
 * inside the screen shows as in the design and scrolls only on screens
 * narrower than where it ends ([below], in px); otherwise [below] is null
 * and it always scrolls. Null when the row fits.
 */
function scrollsSideways(node, parent, screen) {
  if (node.layoutMode !== 'HORIZONTAL' || node.layoutWrap === 'WRAP') return null;
  const flow = visibleChildren(node).filter((c) => inFlow(c, node));
  if (flow.length < 2) return null;
  const between = node.primaryAxisAlignItems === 'SPACE_BETWEEN';
  const items = flow.reduce((t, c) => t + c.width, 0) + (between ? 0 : (node.itemSpacing || 0) * (flow.length - 1));
  const content = items + (node.paddingLeft || 0) + (node.paddingRight || 0);
  if (content > node.width + 1) {
    const end = node.x - screen.x + (node.paddingLeft || 0) + items;
    return { beyond: false, below: end <= screen.width ? Math.ceil(end) : null };
  }
  const right = parent.x + parent.width - (isAutoLayout(parent) ? parent.paddingRight || 0 : 0);
  if (inFlow(node, parent) && parent.layoutMode === 'VERTICAL' && node.x + node.width > right + 1) {
    const end = node.x - screen.x + node.width;
    return { beyond: true, below: end <= screen.width ? Math.ceil(end) : null };
  }
  return null;
}

/**
 * Figma rounds a hugging text box's height up to a whole pixel, as it does
 * its width: with fractional line heights (scaled frames) the box is taller
 * than its lines. A min-height keeps that box.
 */
function roundedHeight(node, paras) {
  if (node.textAutoResize !== 'WIDTH_AND_HEIGHT' && node.textAutoResize !== 'HEIGHT') return null;
  const segs = segmentsOf(node);
  const lh = segs[0].lineHeight;
  if (!lh || lh.unit !== 'PIXELS' || !lh.value || !segs.every((s) => s.lineHeight && s.lineHeight.unit === 'PIXELS' && s.lineHeight.value === lh.value)) return null;
  const spacing = (node.paragraphSpacing || 0) * Math.max(0, paras.length - 1);
  const lines = node.textAutoResize === 'WIDTH_AND_HEIGHT'
    ? paras.reduce((n, p) => n + 1 + p.pieces.filter((x) => x.br).length, 0)
    : Math.max(1, Math.round((node.height - spacing) / lh.value));
  const extra = node.height - (lines * lh.value + spacing);
  return extra > 0.01 && extra < 1 ? `min-h-[${px(node.height)}]` : null;
}

/** The design variables bound in [tree]: CSS identifier -> Figma name. */
function variableNames(tree) {
  const out = new Map();
  const add = (vars) => vars && typeof vars === 'object' &&
    Object.values(vars).forEach((name) => typeof name === 'string' && out.set(varIdent(name), name));
  const walk = (n) => {
    if (!n || typeof n !== 'object' || n.visible === false) return;
    add(n.vars);
    if (Array.isArray(n.segments)) n.segments.forEach((s) => s && add(s.vars));
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(tree);
  return out;
}

function hasText(node) {
  if (!node || node.visible === false) return false;
  return node.type === 'TEXT' || (node.children || []).some(hasText);
}

/** A component name for the root that no mapped component or global takes. */
function componentNameFor(root, taken) {
  const words = String(root.name || '').replace(/^[\s\d._-]+/, '');
  let name = isGenericName(root.name) || !words ? 'Design' : pascal(words, 'Design');
  if (taken.has(name) || RESERVED.has(name)) name = `${name}Screen`;
  for (let i = 2; taken.has(name); i++) name = `${name}${i}`;
  return name;
}

/**
 * Returns { code, css, componentName, assets, files, fonts, textStyles,
 * screen, scrolls, connected, rasterized, warnings, placeholders }:
 * [assets] maps each image constant to its URL; with [assetDir] the files
 * are named after their layers and [files] maps each project path
 * ('public/figma/logo.svg') to { url, source }; [css] declares the design
 * variables the code uses; [fonts] maps each family to its weights;
 * [warnings] lists what the design has that the code draws differently;
 * [placeholders] lists the layers drawn as empty boxes.
 *
 * [assets] resolves embedded data to URLs or files:
 *   { svg(text), image(hash), imageSize?(hash), render?({ base64 }) }.
 * [connect] returns a mapping ({ componentName, source, label }) for an
 * instance, or null. [screen] draws a phone-sized frame as a screen that
 * fills the viewport (default: portrait frames 300-480 wide). [repeats]
 * writes runs of repeated siblings as a data array and a .map().
 */
export function toReactTailwind(root, assets, { connect = null, screen, assetDir = null, repeats = true } = {}) {
  const tree = { ...root, x: root.x ?? 0, y: root.y ?? 0 };
  // A root shipped as one image is a picture, not a screen to lay out.
  const asScreen = screen ?? (isPhoneScreen(tree) && !tree.render && !drawnAsSvg(tree));
  const writer = new Writer(assets, { connect, ratios: autoLineRatios(tree), screen: asScreen ? tree : null, assetDir });
  writer.pinned = asScreen ? pinnedChildren(tree) : new Set();
  writer.runs = repeats;
  writer.node(tree, null, 2);
  const header = [...writer.connected.values()].map((m) =>
    `// ${m.componentName}: ${m.source}${m.label ? ` (${m.label})` : ''}`);
  const consts = [...writer.consts.values()].map(({ id, url }) => `const ${id} = ${JSON.stringify(url)};`);
  for (const data of writer.arrays) consts.push(...(consts.length ? [''] : []), ...data);
  const componentName = componentNameFor(tree, new Set(writer.connected.keys()));
  const code = [
    ...header,
    ...(header.length ? [''] : []),
    ...consts,
    ...(consts.length ? [''] : []),
    `export default function ${componentName}() {`,
    '  return (',
    ...writer.lines,
    '  );',
    '}',
  ].join('\n');
  const map = {};
  for (const { id, url } of writer.consts.values()) map[id] = url;
  const fonts = {};
  for (const [family, weights] of writer.fonts) {
    fonts[family] = [...weights].sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.length - b.length);
  }
  return {
    code,
    css: tokensCss(code, variableNames(tree)),
    componentName,
    assets: map,
    files: Object.fromEntries(writer.files),
    fonts,
    textStyles: [...writer.textStyles].map(([name, classes]) => ({ name, classes: classList(classes) })),
    screen: asScreen,
    scrolls: Boolean(asScreen && scrollsOnScreen(tree)),
    connected: [...writer.connected.values()],
    rasterized: writer.rasterized,
    warnings: writer.warnings,
    placeholders: writer.placeholders,
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

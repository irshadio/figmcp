// Answers requests from the local MCP server (relayed by ui.html) with data
// read from the open file. Read-only: nothing here changes the document.

figma.showUI(__html__, { width: 300, height: 236, themeColors: true });

const VECTORS = new Set([
  'VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'POLYGON',
]);
const SHAPES = new Set([
  'VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'ELLIPSE', 'POLYGON',
  'RECTANGLE',
]);
const ICON_MAX = 256;
const EXPORT_TIMEOUT = 20000;
const PROPS = [
  'opacity', 'blendMode', 'rotation', 'clipsContent', 'isMask',
  'strokeWeight', 'strokeAlign', 'strokeCap', 'strokeJoin', 'dashPattern',
  'strokeTopWeight', 'strokeBottomWeight', 'strokeLeftWeight',
  'strokeRightWeight', 'strokesIncludedInLayout',
  'cornerRadius', 'topLeftRadius', 'topRightRadius', 'bottomLeftRadius',
  'bottomRightRadius', 'cornerSmoothing',
  'layoutMode', 'layoutWrap', 'itemSpacing', 'counterAxisSpacing',
  'counterAxisAlignContent', 'itemReverseZIndex',
  'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
  'primaryAxisAlignItems', 'counterAxisAlignItems',
  'primaryAxisSizingMode', 'counterAxisSizingMode',
  'layoutSizingHorizontal', 'layoutSizingVertical', 'layoutAlign',
  'layoutGrow', 'layoutPositioning', 'constraints',
  'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'overflowDirection', 'numberOfFixedChildren',
  'maxLines', 'textTruncation', 'paragraphSpacing', 'paragraphIndent',
  'listSpacing', 'leadingTrim', 'arcData',
];
const GRID_PROPS = [
  'gridRowCount', 'gridColumnCount', 'gridRowGap', 'gridColumnGap',
  'gridRowSizes', 'gridColumnSizes',
];
const GRID_CHILD_PROPS = [
  'gridRowAnchorIndex', 'gridColumnAnchorIndex', 'gridRowSpan',
  'gridColumnSpan', 'gridChildHorizontalAlign', 'gridChildVerticalAlign',
];
// Values equal to Figma's defaults carry nothing; every other value is kept,
// zeros included (opacity 0, a 0 wrap gap, grid anchor 0, stroke weight 0).
const DEFAULTS = {
  opacity: 1, blendMode: 'PASS_THROUGH', rotation: 0, clipsContent: false,
  isMask: false, strokesIncludedInLayout: false, cornerSmoothing: 0,
  layoutMode: 'NONE', layoutWrap: 'NO_WRAP', itemReverseZIndex: false,
  counterAxisAlignContent: 'AUTO', layoutAlign: 'INHERIT', layoutGrow: 0,
  layoutPositioning: 'AUTO', overflowDirection: 'NONE',
  numberOfFixedChildren: 0, textTruncation: 'DISABLED', leadingTrim: 'NONE',
  paragraphSpacing: 0, paragraphIndent: 0, listSpacing: 0,
};
const SEGMENT_FIELDS = [
  'fontName', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
  'textCase', 'textDecoration', 'fills', 'hyperlink', 'boundVariables',
  'textStyleId',
];
const SEGMENT_EXTRA_FIELDS = [
  'listOptions', 'indentation', 'textDecorationStyle',
  'textDecorationOffset', 'textDecorationThickness', 'textDecorationColor',
];

function clean(value) {
  if (value === figma.mixed) return 'mixed';
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

// Rejects when [promise] takes longer than [ms], so one stuck export cannot
// hold a whole read.
function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      reject(new Error('Timed out after ' + ms + ' ms'));
    }, ms);
    promise.then(function (v) {
      clearTimeout(timer);
      resolve(v);
    }, function (e) {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function safe(read) {
  try {
    return read();
  } catch (e) {
    return null;
  }
}

// Adds the time spent in [fn] to ctx.timings[label] (ms) when profiling.
async function timed(ctx, label, fn) {
  if (!ctx.timings) return fn();
  const start = Date.now();
  try {
    return await fn();
  } finally {
    ctx.timings[label] = (ctx.timings[label] || 0) + Date.now() - start;
  }
}

function newContext(options) {
  return {
    timings: options.profile ? {} : null,
    slow: [],
    pending: [],
    imageHashes: new Set(),
    svg: options.svg !== false,
    meta: options.meta === true,
    maxDepth: options.maxDepth,
    maxNodes: typeof options.maxNodes === 'number' ? options.maxNodes : Infinity,
    exportTimeout: options.exportTimeout || EXPORT_TIMEOUT,
    count: 0,
    truncated: false,
    failures: [],
    variables: new Map(),
    styles: new Map(),
    nodeNames: new Map(),
  };
}

async function variableName(ctx, alias) {
  if (!alias || alias.type !== 'VARIABLE_ALIAS') return null;
  if (ctx.variables.has(alias.id)) return ctx.variables.get(alias.id);
  let name = null;
  try {
    const variable = await figma.variables.getVariableByIdAsync(alias.id);
    name = variable ? variable.name : null;
  } catch (e) { /* remote or deleted variable */ }
  ctx.variables.set(alias.id, name);
  return name;
}

async function styleName(ctx, id) {
  if (!id || typeof id !== 'string') return null;
  if (ctx.styles.has(id)) return ctx.styles.get(id);
  let name = null;
  try {
    const style = await figma.getStyleByIdAsync(id);
    name = style ? style.name : null;
  } catch (e) { /* remote style not available */ }
  ctx.styles.set(id, name);
  return name;
}

async function nodeName(ctx, id) {
  if (!id) return null;
  if (ctx.nodeNames.has(id)) return ctx.nodeNames.get(id);
  let name = null;
  try {
    const n = await figma.getNodeByIdAsync(id);
    name = n ? n.name : null;
  } catch (e) { /* not loaded */ }
  ctx.nodeNames.set(id, name);
  return name;
}

function paints(list, ctx) {
  if (list === figma.mixed) return 'mixed';
  if (!list) return undefined;
  return list.map(function (p) {
    if (p.type === 'IMAGE' && p.imageHash) ctx.imageHashes.add(p.imageHash);
    return clean(p);
  });
}

// Variable names bound to a node's properties and paints, by property:
// { itemSpacing: 'spacing/16', 'fill.0': 'primary/900', ... }.
async function boundNames(ctx, node, bound) {
  const out = {};
  if (bound) {
    for (const key of Object.keys(bound)) {
      const value = bound[key];
      if (Array.isArray(value) || !value || value.type !== 'VARIABLE_ALIAS') {
        continue;
      }
      const name = await variableName(ctx, value);
      if (name) out[key] = name;
    }
  }
  for (const pair of [['fills', 'fill'], ['strokes', 'stroke']]) {
    const list = node[pair[0]];
    if (!Array.isArray(list)) continue;
    for (let i = 0; i < list.length; i++) {
      const b = list[i].boundVariables;
      const name = b ? await variableName(ctx, b.color) : null;
      if (name) out[pair[1] + '.' + i] = name;
    }
  }
  return out;
}

function onlyShapes(node) {
  if (SHAPES.has(node.type)) return !hasImageFill(node);
  if (node.type === 'TEXT') return false;
  if (!('children' in node)) return false;
  return node.children.length > 0 && node.children.every(onlyShapes);
}

function hasVector(node) {
  if (node.visible === false) return false;
  if (needsSvg(node)) return true;
  return 'children' in node && node.children.some(hasVector);
}

function hasImageFill(node) {
  return Array.isArray(node.fills) &&
    node.fills.some(function (p) { return p.type === 'IMAGE'; });
}

// Small groups of shapes with at least one real vector (an icon). Groups of
// plain rectangles and ellipses (dots, bars, toggles) stay boxes, so they
// keep their variables and resize with the layout.
function isIcon(node) {
  if (!('children' in node) || node.children.length === 0) return false;
  if (node.width > ICON_MAX || node.height > ICON_MAX) return false;
  return onlyShapes(node) && hasVector(node);
}

function nonSolidStroke(node) {
  return Array.isArray(node.strokes) && node.strokes.some(function (p) {
    return p.visible !== false && p.type !== 'SOLID';
  });
}

// Shapes that CSS cannot draw exactly: vectors, arcs and rings, and
// rectangles or ellipses with dashed or gradient strokes.
function needsSvg(node) {
  if (VECTORS.has(node.type)) return true;
  if (node.type === 'ELLIPSE' && node.arcData) {
    const a = node.arcData;
    const sweep = Math.abs(a.endingAngle - a.startingAngle);
    if (a.innerRadius > 0 || Math.abs(sweep - 2 * Math.PI) > 1e-3) return true;
  }
  if (node.type === 'RECTANGLE' || node.type === 'ELLIPSE') {
    const dashed = Array.isArray(node.dashPattern) && node.dashPattern.length > 0;
    const stroked = Array.isArray(node.strokes) && node.strokes.some(function (p) {
      return p.visible !== false;
    });
    if (nonSolidStroke(node) || (dashed && stroked)) return true;
  }
  return false;
}

function hasMaskChild(node) {
  return 'children' in node && node.children.some(function (c) { return c.isMask; });
}

function isRotated(node) {
  return 'rotation' in node && Math.abs(node.rotation) > 0.01;
}

// The 2x2 part of the node's transform, when it rotates, skews or mirrors
// the layer: [[a, c], [b, d]] maps the layer's own axes to its parent's.
function linearTransform(node) {
  const t = safe(function () { return node.relativeTransform; });
  if (!t) return null;
  const m = [[t[0][0], t[0][1]], [t[1][0], t[1][1]]];
  const identity = Math.abs(m[0][0] - 1) < 1e-4 && Math.abs(m[1][1] - 1) < 1e-4 &&
    Math.abs(m[0][1]) < 1e-4 && Math.abs(m[1][0]) < 1e-4;
  return identity ? null : m.map(function (row) { return row.map(round4); });
}

function isMirrored(transform) {
  return !!transform && transform[0][0] * transform[1][1] - transform[0][1] * transform[1][0] < 0;
}

function originOf(node) {
  const box = 'absoluteBoundingBox' in node ? node.absoluteBoundingBox : null;
  return box ? { x: box.x, y: box.y } : { x: 0, y: 0 };
}

function renderBoundsOf(node, origin) {
  const rb = 'absoluteRenderBounds' in node ? node.absoluteRenderBounds : null;
  if (!rb) return null;
  return {
    x: round(rb.x - origin.x), y: round(rb.y - origin.y),
    width: round(rb.width), height: round(rb.height),
  };
}

// A 2x render of the layer with its shadows and blurs (the render bounds).
async function renderPng(node) {
  const bytes = await node.exportAsync({
    format: 'PNG', constraint: { type: 'SCALE', value: 2 },
  });
  return { format: 'png', scale: 2, base64: figma.base64Encode(bytes) };
}

// Older Figma versions reject fields they do not know, which would drop all
// text styling; retry with the base fields.
function styledSegments(node) {
  try {
    return node.getStyledTextSegments(SEGMENT_FIELDS.concat(SEGMENT_EXTRA_FIELDS));
  } catch (e) {
    return node.getStyledTextSegments(SEGMENT_FIELDS);
  }
}

async function textDetails(ctx, node, out) {
  out.characters = node.characters;
  out.textAlignHorizontal = node.textAlignHorizontal;
  out.textAlignVertical = node.textAlignVertical;
  out.textAutoResize = node.textAutoResize;
  try {
    const segments = styledSegments(node);
    out.segments = [];
    for (const raw of segments) {
      const seg = clean(raw);
      const vars = await boundNames(ctx, raw, raw.boundVariables);
      if (Object.keys(vars).length) seg.vars = vars;
      const style = await styleName(ctx, raw.textStyleId);
      if (style) seg.textStyle = style;
      delete seg.boundVariables;
      delete seg.textStyleId;
      if (!seg.hyperlink) delete seg.hyperlink;
      if (seg.listOptions && seg.listOptions.type === 'NONE') delete seg.listOptions;
      if (!seg.indentation) delete seg.indentation;
      out.segments.push(seg);
    }
  } catch (e) {
    out.segmentsError = String(e);
  }
}

async function componentDetails(node, out) {
  try {
    const main = await node.getMainComponentAsync();
    if (main) {
      out.mainComponent = main.name;
      out.componentKey = main.key;
      if (main.parent && main.parent.type === 'COMPONENT_SET') {
        out.componentSet = main.parent.name;
        out.componentSetKey = main.parent.key;
      }
    }
  } catch (e) { /* library component not loaded */ }
  try {
    if (node.componentProperties) {
      out.componentProperties = clean(node.componentProperties);
    }
  } catch (e) { /* unreadable properties */ }
}

async function reactions(ctx, node) {
  if (!('reactions' in node) || !node.reactions || !node.reactions.length) {
    return null;
  }
  const out = [];
  for (const r of node.reactions) {
    const actions = r.actions || (r.action ? [r.action] : []);
    for (const a of actions) {
      if (!a) continue;
      const item = { trigger: r.trigger ? r.trigger.type : null, action: a.type };
      if (a.type === 'NODE') {
        item.navigation = a.navigation;
        item.destination = a.destinationId
          ? { id: a.destinationId, name: await nodeName(ctx, a.destinationId) }
          : null;
        if (a.transition) {
          item.transition = a.transition.type + (a.transition.duration
            ? ' ' + Math.round(a.transition.duration * 1000) + 'ms' : '') +
            (a.transition.easing ? ' ' + a.transition.easing.type : '');
        }
      } else if (a.type === 'URL') {
        item.url = a.url;
      }
      out.push(item);
    }
  }
  return out.length ? out : null;
}

function copyProps(node, out, keys) {
  for (const key of keys) {
    if (!(key in node)) continue;
    const v = safe(function () { return clean(node[key]); });
    if (v === undefined || v === null || v === DEFAULTS[key]) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[key] = v;
  }
}

// Starts an export and records its result on [out] when it settles; a
// failure or timeout only drops that asset.
function track(ctx, node, promise, onDone, onFail) {
  const start = Date.now();
  ctx.pending.push(withTimeout(promise, ctx.exportTimeout).then(function (value) {
    onDone(value);
    if (ctx.timings && Date.now() - start > 200) {
      ctx.slow.push({ id: node.id, name: node.name, type: node.type, ms: Date.now() - start });
    }
  }, function (e) {
    onFail();
    ctx.failures.push({ id: node.id, name: node.name, error: String(e && e.message ? e.message : e) });
  }));
}

async function serialize(node, origin, ctx, depth) {
  ctx.count++;
  const out = { id: node.id, name: node.name, type: node.type };
  if ('visible' in node) out.visible = node.visible;
  const box = 'absoluteBoundingBox' in node ? node.absoluteBoundingBox : null;
  if (box) {
    out.x = round(box.x - origin.x);
    out.y = round(box.y - origin.y);
    out.width = round(box.width);
    out.height = round(box.height);
  }

  if (!ctx.meta) {
    copyProps(node, out, PROPS);
    if (node.layoutMode === 'GRID') copyProps(node, out, GRID_PROPS);
    if (node.parent && node.parent.layoutMode === 'GRID') copyProps(node, out, GRID_CHILD_PROPS);
    const transform = linearTransform(node);
    if (transform) {
      out.transform = transform;
      out.rawWidth = round(node.width);
      out.rawHeight = round(node.height);
    }
    try {
      if ('fills' in node) out.fills = paints(node.fills, ctx);
      if ('strokes' in node) out.strokes = paints(node.strokes, ctx);
      if ('effects' in node && node.effects.length) {
        out.effects = clean(node.effects);
      }
    } catch (e) {
      out.paintError = String(e);
    }
    const vars = await timed(ctx, 'variables', function () {
      return boundNames(ctx, node, 'boundVariables' in node ? node.boundVariables : null);
    });
    if (Object.keys(vars).length) out.vars = vars;
    const styles = {};
    for (const pair of [['fillStyleId', 'fill'], ['strokeStyleId', 'stroke'],
      ['effectStyleId', 'effect'], ['textStyleId', 'text']]) {
      if (!(pair[0] in node)) continue;
      const name = await timed(ctx, 'styles', function () {
        return styleName(ctx, node[pair[0]]);
      });
      if (name) styles[pair[1]] = name;
    }
    if (Object.keys(styles).length) out.styles = styles;

    if (node.type === 'TEXT') {
      await timed(ctx, 'text', function () { return textDetails(ctx, node, out); });
    }
    if (node.type === 'INSTANCE') {
      await timed(ctx, 'components', function () { return componentDetails(node, out); });
    }
    if (node.type === 'COMPONENT_SET') {
      out.componentSet = node.name;
      out.componentSetKey = node.key;
    }
    if (node.type === 'COMPONENT') {
      out.componentKey = node.key;
      if (node.parent && node.parent.type === 'COMPONENT_SET') {
        out.componentSet = node.parent.name;
        out.componentSetKey = node.parent.key;
      }
    }
    const interactions = await timed(ctx, 'reactions', function () {
      return reactions(ctx, node);
    });
    if (interactions) out.reactions = interactions;

    const visible = node.visible !== false && !ctx.hidden;
    const vectorLike = isIcon(node) || needsSvg(node);
    const imageFilled = hasImageFill(node);
    const exportsSvg = ctx.svg && visible && vectorLike && !imageFilled;
    if (exportsSvg) {
      // The SVG canvas is the render bounds (strokes and effects included),
      // which can be larger than the layer's box. Exports wait for Figma to
      // draw; started together they share the wait (see settle()).
      const bounds = box ? renderBoundsOf(node, origin) : null;
      if (bounds) out.svgBounds = bounds;
      track(ctx, node, node.exportAsync({ format: 'SVG_STRING' }), function (svg) {
        out.svg = svg;
      }, function () { delete out.svgBounds; });
      if (isIcon(node)) return out;
    }
    // Masked groups, rotated or mirrored containers and image-filled vectors
    // cannot be rebuilt exactly from boxes: ship their render and stop.
    const container = 'children' in node && node.children.length > 0;
    const turnedContainer = container && (isRotated(node) || isMirrored(transform));
    const reason = hasMaskChild(node) ? 'mask'
      : turnedContainer ? 'rotation'
        : VECTORS.has(node.type) && imageFilled ? 'image-vector' : null;
    if (ctx.svg && visible && !exportsSvg && reason) {
      out.rasterized = reason;
      const bounds = box ? renderBoundsOf(node, origin) : null;
      if (bounds) out.renderBounds = bounds;
      track(ctx, node, renderPng(node), function (render) {
        out.render = render;
      }, function () {
        delete out.rasterized;
        delete out.renderBounds;
      });
      return out;
    }
  }

  if ('children' in node) {
    if ((ctx.maxDepth !== undefined && depth >= ctx.maxDepth) || ctx.count >= ctx.maxNodes) {
      if (ctx.count >= ctx.maxNodes && node.children.length) ctx.truncated = true;
      out.childCount = node.children.length;
      return out;
    }
    out.children = [];
    const wasHidden = ctx.hidden;
    if (node.visible === false) ctx.hidden = true;
    for (const child of node.children) {
      try {
        out.children.push(await serialize(child, origin, ctx, depth + 1));
      } catch (e) {
        const failed = {
          id: child.id, name: child.name, type: child.type, error: String(e),
        };
        const b = safe(function () { return child.absoluteBoundingBox; });
        if (b) {
          failed.x = round(b.x - origin.x);
          failed.y = round(b.y - origin.y);
          failed.width = round(b.width);
          failed.height = round(b.height);
        }
        ctx.failures.push({ id: child.id, name: child.name, error: String(e) });
        out.children.push(failed);
      }
    }
    ctx.hidden = wasHidden;
  }
  return out;
}

// Waits for the exports serialize() started.
async function settle(ctx) {
  const start = Date.now();
  await Promise.all(ctx.pending);
  if (ctx.timings) ctx.timings.exports = Date.now() - start;
}

async function findNode(id) {
  const node = await figma.getNodeByIdAsync(id);
  if (!node) throw new Error('Node not found in the open file: ' + id);
  if (node.type === 'PAGE') await node.loadAsync();
  return node;
}

function pageOf(node) {
  let n = node;
  while (n && n.type !== 'PAGE') n = n.parent;
  return n ? { id: n.id, name: n.name } : null;
}

async function imageBytes(hashes) {
  const images = {};
  for (const hash of hashes) {
    try {
      const image = figma.getImageByHash(hash);
      if (image) {
        images[hash] = figma.base64Encode(await withTimeout(image.getBytesAsync(), EXPORT_TIMEOUT));
      }
    } catch (e) { /* an unreadable image only loses that fill */ }
  }
  return images;
}

function info() {
  const page = figma.currentPage;
  const user = safe(function () { return figma.currentUser; });
  return {
    fileName: figma.root.name,
    fileKey: safe(function () { return figma.fileKey; }) || null,
    user: user ? { name: user.name } : null,
    currentPage: { id: page.id, name: page.name },
    pages: figma.root.children.map(function (p) {
      return { id: p.id, name: p.name };
    }),
    selection: page.selection.map(function (n) {
      return { id: n.id, name: n.name, type: n.type };
    }),
  };
}

async function node(params) {
  const target = await findNode(params.id);
  const ctx = newContext(params);
  const tree = await serialize(target, originOf(target), ctx, 0);
  await settle(ctx);
  const result = {
    fileName: figma.root.name,
    page: pageOf(target),
    tree: tree,
    imageHashes: Array.from(ctx.imageHashes),
  };
  if (ctx.truncated) result.truncated = true;
  if (ctx.failures.length) result.failures = ctx.failures;
  if (params.images) {
    result.images = await timed(ctx, 'images', function () { return imageBytes(ctx.imageHashes); });
  }
  if (ctx.timings) {
    result.timings = ctx.timings;
    result.slow = ctx.slow;
  }
  return result;
}

async function exportNode(params) {
  const target = await findNode(params.id);
  if (!('exportAsync' in target)) throw new Error('Node cannot be exported');
  const format = (params.format || 'PNG').toUpperCase();
  const box = target.absoluteBoundingBox;
  if (format === 'SVG') {
    const svg = await target.exportAsync({ format: 'SVG_STRING' });
    return { format: 'svg', text: svg, width: box && box.width,
      height: box && box.height };
  }
  let scale = params.scale || 1;
  if (params.maxDimension && box) {
    const longest = Math.max(box.width, box.height) || 1;
    scale = Math.min(params.maxScale || 2, params.maxDimension / longest);
  }
  const settings = { format: format };
  if (format !== 'PDF') {
    settings.constraint = { type: 'SCALE', value: scale };
    if (params.contentsOnly !== undefined) {
      settings.contentsOnly = params.contentsOnly;
    }
    if (params.absoluteBounds) settings.useAbsoluteBounds = true;
  }
  const bytes = await target.exportAsync(settings);
  return {
    format: format.toLowerCase(),
    base64: figma.base64Encode(bytes),
    scale: scale,
    width: box && box.width,
    height: box && box.height,
  };
}

function hex(color, opacity) {
  const c = function (v) {
    return ('0' + Math.round(v * 255).toString(16)).slice(-2).toUpperCase();
  };
  const a = (color.a === undefined ? 1 : color.a) *
    (opacity === undefined ? 1 : opacity);
  return '#' + c(color.r) + c(color.g) + c(color.b) + (a < 0.999 ? c(a) : '');
}

function lineHeight(lh) {
  if (!lh || lh.unit === 'AUTO') return 'normal';
  return lh.unit === 'PERCENT' ? round(lh.value) + '%' : String(round(lh.value));
}

function letterSpacing(ls) {
  if (!ls) return '0';
  return ls.unit === 'PERCENT' ? round(ls.value) + '%' : String(round(ls.value));
}

function stopsText(paint) {
  return (paint.gradientStops || []).map(function (s) {
    return hex(s.color, paint.opacity) + ' ' + round(s.position * 100) + '%';
  }).join(', ');
}

function styleValue(style) {
  if (style.type === 'PAINT') {
    const p = style.paints[0];
    if (!p) return 'none';
    if (p.type === 'SOLID') return hex(p.color, p.opacity);
    if (p.type.indexOf('GRADIENT') === 0) return p.type + '(' + stopsText(p) + ')';
    return p.type;
  }
  if (style.type === 'TEXT') {
    return 'Font(family: "' + style.fontName.family + '", style: ' +
      style.fontName.style + ', size: ' + style.fontSize + ', lineHeight: ' +
      lineHeight(style.lineHeight) + ', letterSpacing: ' +
      letterSpacing(style.letterSpacing) + ')';
  }
  if (style.type === 'EFFECT') {
    return style.effects.map(function (e) {
      if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
        return 'Effect(type: ' + e.type + ', color: ' + hex(e.color) +
          ', offset: (' + e.offset.x + ', ' + e.offset.y + '), radius: ' +
          e.radius + ', spread: ' + (e.spread || 0) + ')';
      }
      return 'Effect(type: ' + e.type + ', radius: ' + e.radius + ')';
    }).join(', ');
  }
  if (style.type === 'GRID') return style.layoutGrids.length + ' grid(s)';
  return style.type;
}

function variableValue(resolved) {
  const v = resolved.value;
  if (resolved.resolvedType === 'COLOR') return hex(v);
  if (typeof v === 'number') return round(v);
  return v;
}

function aliasIds(bound) {
  const ids = [];
  const visit = function (v) {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach(visit);
    if (v.type === 'VARIABLE_ALIAS') return ids.push(v.id);
    if (typeof v === 'object') Object.keys(v).forEach(function (k) { visit(v[k]); });
  };
  visit(bound);
  return ids;
}

async function variables(params) {
  const root = await findNode(params.id);
  const defs = {};
  const seenStyles = new Set();
  const seenVars = new Set();
  const stack = [root];
  let count = 0;
  while (stack.length && count < 5000) {
    const n = stack.pop();
    count++;
    const ids = aliasIds('boundVariables' in n ? n.boundVariables : null);
    for (const paintKey of ['fills', 'strokes']) {
      if (paintKey in n && Array.isArray(n[paintKey])) {
        n[paintKey].forEach(function (p) {
          aliasIds(p.boundVariables).forEach(function (id) { ids.push(id); });
        });
      }
    }
    const styleIds = [];
    if (n.type === 'TEXT') {
      (safe(function () {
        return n.getStyledTextSegments(['boundVariables', 'textStyleId', 'fills']);
      }) || []).forEach(function (s) {
        aliasIds(s.boundVariables).forEach(function (id) { ids.push(id); });
        (s.fills || []).forEach(function (p) {
          aliasIds(p.boundVariables).forEach(function (id) { ids.push(id); });
        });
        if (s.textStyleId) styleIds.push(s.textStyleId);
      });
    }
    for (const id of ids) {
      if (seenVars.has(id)) continue;
      seenVars.add(id);
      try {
        const variable = await figma.variables.getVariableByIdAsync(id);
        if (variable) defs[variable.name] = variableValue(variable.resolveForConsumer(n));
      } catch (e) { /* remote or deleted variable */ }
    }
    for (const key of ['fillStyleId', 'strokeStyleId', 'effectStyleId',
      'textStyleId', 'gridStyleId']) {
      if (key in n && typeof n[key] === 'string' && n[key]) styleIds.push(n[key]);
    }
    for (const id of styleIds) {
      if (seenStyles.has(id)) continue;
      seenStyles.add(id);
      try {
        const style = await figma.getStyleByIdAsync(id);
        if (style) defs[style.name] = styleValue(style);
      } catch (e) { /* remote style not available */ }
    }
    if ('children' in n) {
      for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
    }
  }
  return { defs: defs, truncated: stack.length > 0 };
}

async function pageMeta(params) {
  const target = await findNode(params.id);
  const ctx = newContext({ meta: true, maxDepth: params.maxDepth });
  return { tree: await serialize(target, { x: 0, y: 0 }, ctx, 0) };
}

async function snapshot(params) {
  const nodes = [];
  if (params && params.ids && params.ids.length) {
    for (const id of params.ids) nodes.push(await findNode(id));
  } else {
    figma.currentPage.selection.forEach(function (n) { nodes.push(n); });
  }
  if (nodes.length === 0) throw new Error('Select one or more frames first');
  const frames = [];
  const ctx = newContext({ svg: true });
  for (const n of nodes) {
    const tree = await serialize(n, originOf(n), ctx, 0);
    await settle(ctx);
    let preview = null;
    try {
      preview = figma.base64Encode(await n.exportAsync({
        format: 'PNG', constraint: { type: 'SCALE', value: 2 },
        useAbsoluteBounds: true,
      }));
    } catch (e) { /* too large to render */ }
    frames.push({ id: n.id, name: n.name, previewPng2x: preview, tree: tree });
  }
  return {
    exportedAt: new Date().toISOString(),
    fileName: figma.root.name,
    page: figma.currentPage.name,
    frames: frames,
    images: await imageBytes(ctx.imageHashes),
  };
}

const HANDLERS = {
  info: async function () { return info(); },
  node: node,
  pageMeta: pageMeta,
  export: exportNode,
  images: async function (params) { return { images: await imageBytes(params.hashes || []) }; },
  variables: variables,
  snapshot: snapshot,
};

figma.on('selectionchange', function () {
  figma.ui.postMessage({ type: 'selection', info: info() });
});
figma.on('currentpagechange', function () {
  figma.ui.postMessage({ type: 'selection', info: info() });
});

figma.clientStorage.getAsync('pairingCode').then(function (code) {
  figma.ui.postMessage({ type: 'pairing', code: code || '' });
});

figma.ui.onmessage = function (msg) {
  if (msg.type === 'request') {
    const handler = HANDLERS[msg.method];
    const run = handler
      ? handler(msg.params || {})
      : Promise.reject(new Error('Unknown method: ' + msg.method));
    run.then(function (result) {
      figma.ui.postMessage({ type: 'response', id: msg.id, result: result });
    }, function (e) {
      figma.ui.postMessage({ type: 'response', id: msg.id,
        error: String(e && e.message ? e.message : e) });
    });
  }
  if (msg.type === 'snapshot') {
    snapshot({}).then(function (data) {
      figma.ui.postMessage({ type: 'snapshot', data: data });
    }, function (e) {
      figma.ui.postMessage({ type: 'status', text: String(e.message || e) });
    });
  }
  if (msg.type === 'savePairing') {
    figma.clientStorage.setAsync('pairingCode', msg.code || '');
  }
  if (msg.type === 'hello') {
    figma.ui.postMessage({ type: 'selection', info: info() });
  }
};

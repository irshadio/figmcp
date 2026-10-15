// What a layer means on a web page: its HTML element, accessible names and
// alt text, from its prototype interactions, names and text styles.

// Names Figma gives new layers ("Frame 2085664401", "Rectangle 12").
const TYPE_NAMES = /^(frame|group|rectangle|ellipse|vector|line|polygon|star|union|subtract|intersect|intersection|exclude|mask group|component|instance|slice|section|boolean|auto layout)( (\d+|copy))*$/i;
// Words that name a kind of layer, not what it shows: generic when numbered
// ("Image 12"), and too vague for alt text even alone.
const KIND_NAMES = /^(image|img|photo|picture|pic|icon|arrow|shape|path|layer|text|container|div|bg|background|graphic|mask|copy|placeholder|thumbnail)( (\d+|copy))*$/i;
const NUMBERED = / \d+$/;
// File-like or generated names ("81Y8+2cuWEL 1", "IMG_2041", "image 7747",
// "Generated Image Sep 22, 2026, 12_30_14 PM 1").
const GENERATED_NAMES = [
  /^(?=[^ ]*\d)(?=[^ ]*[A-Za-z])[A-Za-z0-9+_=-]{6,}( \d+)?$/,
  /^(img|dsc|pxl|screenshot|screen shot|photo|image|unsplash|pexels)[\s_-]/i,
  // A capture or export time in the name.
  /\b\d{1,2}[_.:]\d{2}[_.:]\d{2}( ?[AP]M)?\b/i,
  /\.(png|jpe?g|webp|gif|svg|avif|heic)( \d+)?$/i,
  // A run of 20 characters without a space, or a background-removal export.
  /[^\s]{20,}/,
  /removebg|remove-bg|-nobg\b/i,
];
const BUTTON_NAMES = /(^|[\s/_-])(button|btn|cta)([\s/_-]|$)/i;
const NAV_NAMES = /(^|[\s/_-])(nav|navbar|navigation|tab ?bar|bottom ?nav|menu ?bar|breadcrumbs?)([\s/_-]|$)/i;
const HEADER_NAMES = /(^|[\s/_-])(header|top ?bar|app ?bar|masthead)([\s/_-]|$)/i;
const FOOTER_NAMES = /(^|[\s/_-])footer([\s/_-]|$)/i;
const HEADING_LEVEL = /(^|[\s/_-])h([1-6])([\s/_-]|$)/i;
const HEADING_STYLES = /(^|[\s/_-])(heading|headline|title|display)([\s/_-]|$)/i;
const FIELD_NAMES = /(^|[\s/_-])(input|text ?field|textfield|text ?box|text ?area|textarea|search ?(bar|field|box|input)|message ?(field|input|box|bar)|composer)([\s/_-]|$)/i;
// What a placeholder says: an invitation to type, or a question to answer.
const PLACEHOLDER_START = /^(search|type|enter|write|find|ask)\b/i;
const PLACEHOLDER_QUESTION = /^(what|where|who|how|which|when)\b.*\?\s*$/i;
const CONTAINERS = new Set(['FRAME', 'INSTANCE', 'COMPONENT', 'GROUP']);
const CLICKS = new Set(['ON_CLICK', 'ON_PRESS', 'ON_MOUSE_DOWN', 'ON_MOUSE_UP']);

/**
 * Whether [name] is a Figma default or generated name, which says nothing
 * to a reader. [strict] also counts bare kind words ("Photo", "Icon"),
 * which name a constant well enough but describe nothing.
 */
export function isGenericName(name, strict = false) {
  const n = String(name || '').trim();
  if (!n || n.length < 2) return true;
  if (TYPE_NAMES.test(n) || GENERATED_NAMES.some((re) => re.test(n))) return true;
  return KIND_NAMES.test(n) && (strict || NUMBERED.test(n));
}

/**
 * A name for people: the layer's name without the suffixes Figma adds to
 * pasted and duplicated layers ("Phone 1", "Card copy 2") and notes in
 * brackets, when it says what the layer is; else ''.
 */
export function readableName(node) {
  if (!node || isGenericName(node.name, true)) return '';
  const name = String(node.name).replace(/\s*\([^)]*\)/g, ' ').replace(/(\s+copy(\s+\d+)?|\s+1)+\s*$/i, '')
    .trim().replace(/\s+/g, ' ');
  return name && !isGenericName(name, true) ? name : '';
}

/** The URL a click on [node] opens, if any. */
function clickUrl(node) {
  const hit = (node.reactions || []).find((r) => CLICKS.has(r.trigger) && r.action === 'URL' && r.url);
  return hit ? hit.url : null;
}

function clicks(node) {
  return (node.reactions || []).some((r) => CLICKS.has(r.trigger));
}

function componentName(node) {
  return String(node.componentSet || node.mainComponent || '');
}

/** Every visible text of [node], in order. */
export function textsOf(node, out = []) {
  if (!node || node.visible === false) return out;
  if (node.type === 'TEXT') {
    const t = typeof node.characters === 'string' ? node.characters.trim() : '';
    if (t) out.push(t);
  }
  (node.children || []).forEach((c) => textsOf(c, out));
  return out;
}

/**
 * The element a container is drawn as: { tag, attrs } for a link, button or
 * landmark, or null for a plain div. [inside] is the set of tags already
 * open above it (no button or link nests in another).
 */
export function containerElement(node, inside) {
  if (!CONTAINERS.has(node.type)) return null;
  const interactive = inside.has('a') || inside.has('button');
  const url = clickUrl(node);
  if (url && !interactive) return { tag: 'a', attrs: { href: url } };
  const named = BUTTON_NAMES.test(node.name || '') || BUTTON_NAMES.test(componentName(node));
  if (!interactive && (clicks(node) || named)) {
    const attrs = { type: 'button' };
    // A button without text needs a name of its own.
    if (!textsOf(node).length) {
      const label = readableName(node) || (componentName(node) && !isGenericName(componentName(node), true) ? componentName(node) : '');
      if (label) attrs['aria-label'] = label.replace(/[=,].*$/, '').replace(/[-_]+/g, ' ').trim();
    }
    return { tag: 'button', attrs };
  }
  if (interactive) return null;
  const name = `${node.name || ''} ${componentName(node)}`;
  if (FOOTER_NAMES.test(name) && !inside.has('footer')) return { tag: 'footer', attrs: {} };
  if (NAV_NAMES.test(name) && !inside.has('nav')) return { tag: 'nav', attrs: {} };
  if (HEADER_NAMES.test(name) && !inside.has('header') && !inside.has('footer')) return { tag: 'header', attrs: {} };
  return null;
}

/**
 * The placeholder text of a text field, when [node] is one: a box named
 * like an input with one line of text, or a row much wider than its one
 * left-aligned line that reads like a placeholder. Returns
 * { id, type, label } for the text, or null.
 */
export function fieldPlaceholder(node, inside) {
  if (!CONTAINERS.has(node.type) || ['a', 'button', 'label'].some((t) => inside.has(t))) return null;
  const all = [];
  const walk = (n) => {
    if (!n || n.visible === false) return;
    if (n.type === 'TEXT') all.push(n);
    else if (n !== node && FIELD_NAMES.test(`${n.name || ''} ${componentName(n)}`)) all.push(null, null);
    (n.children || []).forEach(walk);
  };
  (node.children || []).forEach(walk);
  if (all.length !== 1 || !all[0]) return null;
  const text = all[0];
  const characters = String(text.characters || '').trim();
  if (!characters || /[\n\u2028]/.test(characters) || characters.length > 80) return null;
  const named = FIELD_NAMES.test(`${node.name || ''} ${componentName(node)}`);
  const looks = (PLACEHOLDER_START.test(characters) || PLACEHOLDER_QUESTION.test(characters)) &&
    (!text.textAlignHorizontal || text.textAlignHorizontal === 'LEFT') &&
    node.height >= 24 && node.height <= 72 && node.width >= text.width * 1.5;
  if (!named && !looks) return null;
  const label = readableName(node) && !FIELD_NAMES.test(readableName(node)) ? readableName(node) : characters;
  return { id: text.id, type: /search/i.test(`${node.name} ${characters}`) ? 'search' : 'text', label };
}

/** h1-h6 for a text whose Figma text style names a heading, else null. */
export function headingTag(styleName) {
  const name = String(styleName || '');
  const level = HEADING_LEVEL.exec(name);
  if (level) return `h${level[2]}`;
  return HEADING_STYLES.test(name) ? 'h2' : null;
}

/** Alt text for a content image: the layer's name unless it is a default one. */
export function altText(node) {
  return readableName(node);
}

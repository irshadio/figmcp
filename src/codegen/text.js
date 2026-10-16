// Text nodes: font classes per styled run, paragraphs, truncation and links.
import { gradientCss } from './paint.js';
import { css, num, px, tw, visiblePaints, withVar } from './util.js';

const TEXT_ALIGN = {
  CENTER: 'text-center', RIGHT: 'text-right', JUSTIFIED: 'text-justify',
};
const CASE = {
  UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize',
  SMALL_CAPS: '[font-variant:small-caps]', SMALL_CAPS_FORCED: '[font-variant:all-small-caps]',
};
const DECORATION = { UNDERLINE: 'underline', STRIKETHROUGH: 'line-through' };
const DECORATION_STYLE = { WAVY: 'decoration-wavy', DOTTED: 'decoration-dotted', DASHED: 'decoration-dashed' };
const STYLE_WEIGHTS = [
  [/thin|hairline/i, 100], [/extra ?light|ultra ?light/i, 200], [/light/i, 300], [/medium/i, 500],
  [/semi ?bold|demi ?bold/i, 600], [/extra ?bold|ultra ?bold/i, 800], [/bold/i, 700],
  [/black|heavy/i, 900],
];
// A line break inside a paragraph (Shift+Enter in Figma).
export const SOFT_BREAK = '\u2028';
const LINE_BREAKS = /\n|\u2028/;

export function segmentsOf(node) {
  if (Array.isArray(node.segments) && node.segments.length) return node.segments;
  return [{ characters: typeof node.characters === 'string' ? node.characters : '' }];
}

function charactersOf(node) {
  return typeof node.characters === 'string' ? node.characters
    : segmentsOf(node).map((s) => s.characters || '').join('');
}

export function lineCount(node) {
  return Math.max(1, charactersOf(node).split(LINE_BREAKS).length);
}

function paragraphCount(node) {
  return Math.max(1, charactersOf(node).split('\n').length);
}

/** The visible paint drawn on top (Figma lists paints bottom to top). */
export function topPaint(paints) {
  const list = visiblePaints(paints);
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (p.type === 'SOLID' || String(p.type).startsWith('GRADIENT')) return p;
  }
  return null;
}

/**
 * Line height over font size for AUTO line heights, per font, measured from
 * the single-line hugging texts of the tree (Figma sizes AUTO lines by the
 * font's metrics, which vary from font to font).
 */
export function autoLineRatios(tree) {
  const found = new Map();
  const walk = (n) => {
    if (!n || n.visible === false) return;
    if (n.type === 'TEXT' && n.textAutoResize === 'WIDTH_AND_HEIGHT' && n.leadingTrim !== 'CAP_HEIGHT' &&
        lineCount(n) === 1 && Array.isArray(n.segments) && n.segments.length === 1) {
      const s = n.segments[0];
      if (s.lineHeight && s.lineHeight.unit === 'AUTO' && s.fontSize > 0 && n.height > 0 && s.fontName) {
        const key = `${s.fontName.family}:${s.fontName.style}`;
        if (!found.has(key)) found.set(key, n.height / s.fontSize);
      }
    }
    (n.children || []).forEach(walk);
  };
  walk(tree);
  return found;
}

/**
 * The rendered line height in px of a text whose box hugs its lines, taken
 * from Figma's own box: Figma rounds percent line heights to whole pixels
 * and sizes AUTO lines by the font's metrics, which CSS does not reproduce.
 * Paragraph spacing is not part of the lines. Null when the box does not
 * tell (fixed boxes, mixed line heights, cap-height trim).
 */
export function boxLineHeight(node, ratios = null) {
  if (!node || (node.textAutoResize !== 'HEIGHT' && node.textAutoResize !== 'WIDTH_AND_HEIGHT')) return null;
  if (node.leadingTrim === 'CAP_HEIGHT') return null;
  const segs = segmentsOf(node);
  const first = JSON.stringify(segs[0].lineHeight);
  if (!segs.every((s) => JSON.stringify(s.lineHeight) === first && s.fontSize === segs[0].fontSize)) return null;
  const lh = segs[0].lineHeight;
  const size = segs[0].fontSize;
  if (!lh || lh.unit === 'PIXELS' || typeof size !== 'number' || !node.height) return null;
  const content = node.height - (node.paragraphSpacing || 0) * (paragraphCount(node) - 1);
  if (content <= 0) return null;
  const font = segs[0].fontName ? `${segs[0].fontName.family}:${segs[0].fontName.style}` : null;
  const auto = (ratios && font && ratios.get(font)) || 1.2;
  const nominal = lh.unit === 'PERCENT' ? (size * lh.value) / 100 : size * auto;
  const lines = node.textAutoResize === 'WIDTH_AND_HEIGHT'
    ? lineCount(node) : Math.max(1, Math.round(content / nominal));
  if (lines > 6 && lh.unit === 'AUTO' && !(ratios && font && ratios.has(font))) return null;
  return content / lines;
}

function leading(seg, node, vars, ratios) {
  const lh = seg.lineHeight;
  if (lh && lh.unit === 'PIXELS') return `leading-[${tw(withVar(vars.lineHeight, px(lh.value)))}]`;
  const fromBox = boxLineHeight(node, ratios);
  if (fromBox) return `leading-[${px(fromBox)}]`;
  if (lh && lh.unit === 'PERCENT') return `leading-[${num(lh.value / 100)}]`;
  return lh ? 'leading-[normal]' : null;
}

// Superscript and subscript as fonts without such glyphs draw them: smaller
// and moved, by the usual OS/2 proportions.
const SCRIPT_SCALE = 0.65;
const SCRIPT_SHIFT = { SUPS: -0.35, SUBS: 0.14 };

function features(seg) {
  const all = seg.openTypeFeatures && typeof seg.openTypeFeatures === 'object' ? seg.openTypeFeatures : {};
  return Object.entries(all).filter(([tag, on]) => /^[A-Za-z0-9]{4}$/.test(tag) && typeof on === 'boolean');
}

/** 'SUPS' or 'SUBS' when the run is raised or lowered. */
export function scriptOf(seg) {
  const on = features(seg).filter(([, v]) => v).map(([tag]) => tag.toUpperCase());
  return on.includes('SUPS') ? 'SUPS' : on.includes('SUBS') ? 'SUBS' : null;
}

/**
 * The variation axes Figma set on a run's font other than its weight, which
 * font-weight carries: a browser would pick optical size and the rest by
 * itself and draw other letterforms. A width of 100 and no slant are left
 * out, being every font's default.
 */
function variationClasses(seg) {
  const axes = seg.fontName && seg.fontName.variationSettings;
  if (!axes || typeof axes !== 'object') return [];
  const list = Object.entries(axes).filter(([tag, v]) => /^[A-Za-z0-9]{4}$/.test(tag) && typeof v === 'number' &&
    tag !== 'wght' && tag !== 'ital' && !(tag === 'wdth' && v === 100) && !(tag === 'slnt' && v === 0));
  if (!list.length) return [];
  return [`[font-variation-settings:${list.map(([tag, v]) => `'${tag}'_${num(v)}`).join(',')}]`];
}

/** OpenType features turned on or off on a run ({ LIGA: false, TNUM: true }). */
function featureClasses(seg) {
  const list = features(seg).filter(([tag]) => !SCRIPT_SHIFT[tag.toUpperCase()]);
  if (!list.length) return [];
  return [`[font-feature-settings:${list.map(([tag, on]) => `'${tag.toLowerCase()}'_${on ? 1 : 0}`).join(',')}]`];
}

function decorationClasses(seg) {
  const out = [];
  if (!DECORATION[seg.textDecoration]) return out;
  out.push(DECORATION[seg.textDecoration]);
  if (DECORATION_STYLE[seg.textDecorationStyle]) out.push(DECORATION_STYLE[seg.textDecorationStyle]);
  const thick = seg.textDecorationThickness;
  if (thick && thick.unit === 'PIXELS') out.push(`decoration-[${px(thick.value)}]`);
  const offset = seg.textDecorationOffset;
  if (offset && offset.unit === 'PIXELS') out.push(`underline-offset-[${px(offset.value)}]`);
  const color = seg.textDecorationColor && seg.textDecorationColor.value;
  if (color && typeof color === 'object' && color.type === 'SOLID') {
    out.push(`decoration-[${tw(css(color.color, color.opacity ?? 1))}]`);
  }
  return out;
}

/** The weight a font style name stands for ('SemiBold Italic' -> 600). */
export function styleWeight(style) {
  const hit = STYLE_WEIGHTS.find(([re]) => re.test(style || ''));
  return hit ? hit[1] : 400;
}

/** The CSS weight of a run: the exported weight, else the style's. */
export function cssWeight(seg) {
  if (typeof seg.fontWeight === 'number' && seg.fontWeight > 0) return seg.fontWeight;
  return styleWeight(seg.fontName && seg.fontName.style);
}

/**
 * A font-family class for [family]: the family's own name, which web fonts
 * are loaded under. Tailwind reads underscores as spaces, so real ones are
 * escaped, as are quotes (a double quote as a CSS escape: the class sits in
 * a double-quoted attribute).
 */
export function familyClass(family) {
  const name = String(family).replace(/\\/g, '\\\\').replace(/_/g, '\\_').replace(/'/g, "\\'")
    .replace(/"/g, '\\000022').trim().replace(/\s+/g, '_');
  return `font-['${name}',sans-serif]`;
}

export function fontClasses(seg, node, ratios = null) {
  const vars = seg.vars || {};
  const out = [];
  const font = seg.fontName || {};
  if (font.family) out.push(familyClass(font.family));
  const weight = cssWeight(seg);
  if (vars.fontWeight) out.push(`[font-weight:${tw(withVar(vars.fontWeight, weight))}]`);
  else if (font.family || seg.fontWeight) out.push(`font-[${weight}]`);
  if (font.style && /italic/i.test(font.style)) out.push('italic');
  out.push(...variationClasses(seg));
  const script = scriptOf(seg);
  if (typeof seg.fontSize === 'number' && script) {
    // No line height of its own, so the smaller run leaves the line box as is.
    out.push(`text-[${px(seg.fontSize * SCRIPT_SCALE)}]`, 'leading-[0]', 'relative', `top-[${px(seg.fontSize * SCRIPT_SHIFT[script])}]`);
  } else if (typeof seg.fontSize === 'number') {
    out.push(vars.fontSize ? `text-[length:${tw(withVar(vars.fontSize, px(seg.fontSize)))}]`
      : `text-[${px(seg.fontSize)}]`);
  }
  const lead = script ? null : leading(seg, node, vars, ratios);
  if (lead) out.push(lead);
  const ls = seg.letterSpacing;
  if (ls && ls.value) {
    const value = ls.unit === 'PIXELS' ? px(ls.value) : `${num(ls.value / 100)}em`;
    out.push(`tracking-[${tw(withVar(vars.letterSpacing, value))}]`);
  }
  if (CASE[seg.textCase]) out.push(CASE[seg.textCase]);
  out.push(...featureClasses(seg));
  out.push(...decorationClasses(seg));
  const paint = topPaint(seg.fills);
  if (paint && paint.type !== 'SOLID') {
    out.push(`bg-[${tw(gradientCss(paint, node ? node.width : 100, node ? node.height : 100))}]`,
      'bg-clip-text', 'text-transparent');
  } else if (paint) {
    const index = seg.fills.indexOf(paint);
    out.push(`text-[${tw(withVar(vars[`fill.${index}`], css(paint.color, paint.opacity ?? 1)))}]`);
  }
  return out;
}

export function jsxText(text) {
  if (/[{}<>&"'`\\]|^\s|\s$|\n|\s{2}/.test(text)) return `{${JSON.stringify(text)}}`;
  return text;
}

function strokeClasses(node) {
  const paint = topPaint(node.strokes);
  const w = typeof node.strokeWeight === 'number' ? node.strokeWeight : 0;
  if (!paint || paint.type !== 'SOLID' || !w) return [];
  const color = withVar((node.vars || {})['stroke.0'], css(paint.color, paint.opacity ?? 1));
  // The CSS stroke is centred on the outline; an outside stroke is twice as
  // wide, drawn under the fill.
  if (node.strokeAlign === 'OUTSIDE') {
    return [`[-webkit-text-stroke:${tw(`${px(w * 2)} ${color}`)}]`, '[paint-order:stroke_fill]'];
  }
  return [`[-webkit-text-stroke:${tw(`${px(w)} ${color}`)}]`];
}

/** Classes on the text element itself (not per run). */
export function textBlockClasses(node) {
  const out = [];
  if (TEXT_ALIGN[node.textAlignHorizontal]) out.push(TEXT_ALIGN[node.textAlignHorizontal]);
  if (node.maxLines) out.push(`line-clamp-[${node.maxLines}]`);
  else if (node.textTruncation === 'ENDING') {
    out.push(lineCount(node) === 1 && node.textAutoResize !== 'HEIGHT'
      ? 'truncate' : 'overflow-hidden text-ellipsis');
  }
  if (node.paragraphIndent) out.push(`indent-[${px(node.paragraphIndent)}]`);
  if (node.leadingTrim === 'CAP_HEIGHT') out.push('[text-box:trim-both_cap_alphabetic]');
  out.push(...strokeClasses(node));
  return out;
}

/**
 * Paragraphs of styled pieces: [{ pieces: [{ seg, text } | { seg, br }],
 * list, indentation }]. Runs are split at paragraph breaks so each
 * paragraph can carry its own spacing; soft breaks become { br: true }.
 */
export function paragraphs(node) {
  const out = [{ pieces: [], list: null, indentation: 0 }];
  for (const seg of segmentsOf(node)) {
    const text = typeof seg.characters === 'string' ? seg.characters : '';
    text.split('\n').forEach((part, i) => {
      if (i > 0) out.push({ pieces: [], list: null, indentation: 0 });
      const para = out[out.length - 1];
      if (!para.pieces.length && seg.listOptions && seg.listOptions.type !== 'NONE') {
        para.list = seg.listOptions.type;
        para.indentation = seg.indentation || 1;
      }
      part.split(SOFT_BREAK).forEach((piece, j) => {
        if (j > 0) para.pieces.push({ seg, br: true });
        if (piece) para.pieces.push({ seg, text: piece });
      });
    });
  }
  return out;
}

export function verticalAlign(node) {
  if (node.textAutoResize !== 'NONE' && node.textAutoResize !== 'TRUNCATE') return null;
  if (node.textAlignVertical === 'CENTER') return 'justify-center';
  if (node.textAlignVertical === 'BOTTOM') return 'justify-end';
  return null;
}

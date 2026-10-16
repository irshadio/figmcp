// Text nodes as Text views: a font face, colour and tracking per styled
// run, and Figma's line height, set against the face's own on the device.
import { boxLineHeight, casedRuns, fontWeight, paragraphs, segmentsOf, SOFT_BREAK, topPaint } from '../text.js';
import { effectsOf, gradient, shadowArgs } from './paint.js';
import { textStyleFor } from './patterns.js';
import { call, mod, print, raw, str, view } from './swift.js';

const WEIGHTS = {
  100: 'ultraLight', 200: 'thin', 300: 'light', 400: 'regular', 500: 'medium',
  600: 'semibold', 700: 'bold', 800: 'heavy', 900: 'black',
};
const ALIGN = { CENTER: '.center', RIGHT: '.trailing' };
const SYSTEM_FAMILY = /^(\.?SF Pro( (Text|Display|Rounded))?|SF Compact.*|\.?SF UI.*|San Francisco|System)$/i;
// What a string literal would read as Markdown or a link.
const MARKDOWN = /[*_~`[\]\\]|\S@\S|:\/\/|www\./;

/** Whether the family is Apple's system font. */
export function isSystemFamily(family) {
  return SYSTEM_FAMILY.test(String(family || ''));
}

/**
 * The PostScript name of a font face by the usual naming ("Inter" "Semi
 * Bold Italic" -> "Inter-SemiBoldItalic"): iOS finds a custom face by it,
 * while a family name alone may pick any face of the family.
 */
export function postScriptName(fontName) {
  const family = String(fontName.family || '').replace(/[^A-Za-z0-9]+/g, '');
  let style = String(fontName.style || 'Regular').replace(/[^A-Za-z0-9]+/g, '');
  if (/^RegularItalic$/i.test(style)) style = 'Italic';
  return `${family}-${style || 'Regular'}`;
}

/**
 * The Font of a run: .custom(face, size:, relativeTo:) scales with Dynamic
 * Type from the nearest text style, its face giving weight and italic;
 * a logo's .custom(face, fixedSize:) and .system(size:weight:) keep their size.
 */
export function fontOf(seg, value, { fixed = false } = {}) {
  const family = seg.fontName && seg.fontName.family;
  const size = typeof seg.fontSize === 'number' ? seg.fontSize : 17;
  const vars = seg.vars || {};
  const sizeValue = value(size, vars.fontSize);
  if (family && !isSystemFamily(family)) {
    // A logo keeps its size; other text scales with its text style.
    return fixed
      ? call('.custom', [[null, str(postScriptName(seg.fontName))], ['fixedSize', sizeValue]])
      : call('.custom', [[null, str(postScriptName(seg.fontName))], ['size', sizeValue], ['relativeTo', raw(textStyleFor(size))]]);
  }
  const font = call('.system', [['size', sizeValue], ['weight', raw(`.${WEIGHTS[fontWeight(seg)]}`)]]);
  return /italic|oblique/i.test((seg.fontName && seg.fontName.style) || '') ? mod(font, 'italic') : font;
}

/**
 * The line height of a run in points, or null for Figma's default: the
 * face's own, which iOS lays out the same.
 */
function lineHeightOf(seg, node, exact = false) {
  const lh = seg.lineHeight;
  const size = seg.fontSize;
  // With exact line heights, Figma's default line box (the face's own,
  // rounded to whole points) is set too, as its box shows it.
  if (typeof size !== 'number' || !lh || lh.unit === 'AUTO') return exact && node.leadingTrim !== 'CAP_HEIGHT' ? boxLineHeight(node) : null;
  if (lh.unit === 'PIXELS') return lh.value;
  // Figma rounds percent line heights to whole pixels; its box tells.
  return boxLineHeight(node) || (size * lh.value) / 100;
}

/**
 * Text modifiers of a run as [name, args] pairs, by what they set. [ctx]
 * gives value(v, varName), color(color, opacity, varName), font(seg) and
 * warn(message).
 */
function runStyle(seg, node, ctx) {
  const vars = seg.vars || {};
  const out = {};
  out.font = ['font', [[null, ctx.font(seg)]]];
  const paint = topPaint(seg.fills);
  if (paint && paint.type === 'SOLID') {
    out.color = ['foregroundStyle', [[null, ctx.color(paint.color, paint.opacity ?? 1, vars[`fill.${seg.fills.indexOf(paint)}`])]]];
  } else if (paint) {
    out.color = ['foregroundStyle', [[null, gradient(paint, node.width || 100, node.height || 100, ctx.color, ctx.warn)]]];
  }
  const ls = seg.letterSpacing;
  if (ls && ls.value) {
    const px = ls.unit === 'PIXELS' ? ls.value : (ls.value / 100) * (seg.fontSize || 0);
    out.tracking = ['tracking', [[null, ctx.value(Math.round(px * 100) / 100, vars.letterSpacing)]]];
  }
  if (seg.textDecoration === 'UNDERLINE' || seg.textDecoration === 'STRIKETHROUGH') {
    const args = [[null, true]];
    const pattern = { DOTTED: '.dot', DASHED: '.dash' }[seg.textDecorationStyle];
    if (pattern) args.push(['pattern', raw(pattern)]);
    if (seg.textDecorationStyle === 'WAVY') ctx.warn('a wavy text decoration is drawn solid');
    const dc = seg.textDecorationColor && seg.textDecorationColor.value;
    if (dc && typeof dc === 'object' && dc.type === 'SOLID') args.push(['color', ctx.color(dc.color, dc.opacity ?? 1)]);
    out.decoration = [seg.textDecoration === 'UNDERLINE' ? 'underline' : 'strikethrough', args];
  }
  if (seg.textCase === 'SMALL_CAPS' || seg.textCase === 'SMALL_CAPS_FORCED') {
    out.font = ['font', [[null, mod(ctx.font(seg), seg.textCase === 'SMALL_CAPS' ? 'lowercaseSmallCaps' : 'smallCaps')]]];
  }
  return out;
}

function same(a, b) {
  return a[0] === b[0] && print(call('x', a[1])) === print(call('x', b[1]));
}

function applied(target, style) {
  return Object.values(style).reduce((t, [name, args]) => mod(t, name, args), target);
}

/** A Text literal: plain, or verbatim when the string would read as Markdown. */
function literal(text) {
  return MARKDOWN.test(text) ? call('Text', [['verbatim', str(text)]]) : call('Text', [[null, str(text)]]);
}

/**
 * The text of [node] as a view, without its frame: a Text, styled runs
 * interpolated into one Text, or a VStack of them when paragraphs are
 * spaced or listed. Returns
 * { view, lineHeight } with the line height the text keeps.
 */
export function textView(node, ctx) {
  const segs = segmentsOf(node);
  const cased = casedRuns(node);
  const styles = segs.map((seg) => runStyle(seg, node, ctx));
  const keys = Object.keys(styles[0]).filter((k) => styles.every((s) => k in s && same(s[k], styles[0][k])));
  const shared = Object.fromEntries(keys.map((k) => [k, styles[0][k]]));
  // One Figma text style for the whole text: its font is a named font.
  // A half-point size scaled by .custom(_:size:relativeTo:) is rounded to
  // whole points; the whole text's face goes through designFont instead.
  const seg0 = segs[0];
  const half = shared.font && !ctx.fixed && seg0.fontName && !isSystemFamily(seg0.fontName.family) &&
    typeof seg0.fontSize === 'number' && !Number.isInteger(seg0.fontSize) && segs.every((s) => s.fontSize === seg0.fontSize) &&
    !(seg0.textCase === 'SMALL_CAPS' || seg0.textCase === 'SMALL_CAPS_FORCED');
  if (half) {
    if (ctx.helper) ctx.helper('designFont');
    shared.font = ['designFont', [[null, str(postScriptName(seg0.fontName))], ['size', ctx.value(seg0.fontSize, (seg0.vars || {}).fontSize)],
      ['relativeTo', raw(textStyleFor(seg0.fontSize))]]];
  } else if (shared.font && segs[0].textStyle && segs.every((s) => s.textStyle === segs[0].textStyle) && ctx.textStyle) {
    const ref = ctx.textStyle(segs[0].textStyle, shared.font[1][0][1]);
    if (ref) shared.font = ['font', [[null, ref]]];
  }
  const own = styles.map((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !keys.includes(k))));
  const lines = (text) => text.split(SOFT_BREAK).join('\n');

  const indexed = segs.map((s, i) => ({ ...s, characters: cased[i], index: i }));
  const paras = paragraphs({ ...node, segments: indexed });
  const spacing = node.paragraphSpacing || 0;
  const listed = paras.some((p) => p.list);

  const build = (pieces, prefix = '') => {
    const runs = [];
    for (const piece of pieces) {
      const text = piece.br ? '\n' : lines(piece.text);
      const last = runs[runs.length - 1];
      if (last && last.index === piece.seg.index) last.text += text;
      else runs.push({ index: piece.seg.index, text });
    }
    if (prefix) {
      if (runs.length) runs[0].text = prefix + runs[0].text;
      else runs.push({ index: 0, text: prefix });
    }
    // An empty paragraph keeps a line's height, as in Figma.
    if (!runs.length || runs.every((r) => r.text === '')) runs.splice(0, runs.length, { index: runs.length ? runs[0].index : 0, text: ' ' });
    if (ctx.bind) return applied(view('', [[null, applied(call('Text', [[null, raw(ctx.bind)]]), own[0])]]), shared);
    if (runs.length === 1) return applied(view('', [[null, applied(literal(runs[0].text), own[runs[0].index])]]), shared);
    // Runs are interpolated into one Text: a chain of Text + Text slows the
    // type checker down with each run, and iOS 26 deprecates it.
    const joined = runs.map((r) => `\\(${print(applied(literal(r.text), own[r.index]))})`).join('');
    return applied(view('', [[null, raw(`Text("${joined}")`)]]), shared);
  };

  const seg = segs[0];
  const lh = lineHeightOf(seg, node, ctx.exactLineHeights);
  let out;
  // Text drawn from data is one value, whatever paragraphs the first item has.
  if (!ctx.bind && (listed || (spacing && paras.length > 1))) {
    let n = 0;
    const children = paras.map((p) => {
      n = p.list === 'ORDERED' ? n + 1 : 0;
      const prefix = p.list === 'ORDERED' ? `${n}. ` : p.list ? '• ' : '';
      return build(p.pieces, prefix);
    });
    const align = { CENTER: '.center', RIGHT: '.trailing' }[node.textAlignHorizontal] || '.leading';
    out = view('VStack', [['alignment', raw(align)], ['spacing', spacing]], children);
  } else {
    const pieces = [];
    paras.forEach((p, i) => {
      if (i) pieces.push({ seg: pieces.length ? pieces[pieces.length - 1].seg : indexed[0], br: true });
      pieces.push(...p.pieces);
    });
    out = build(pieces);
  }
  if (ALIGN[node.textAlignHorizontal]) out = mod(out, 'multilineTextAlignment', [[null, raw(ALIGN[node.textAlignHorizontal])]]);
  if (node.textAlignHorizontal === 'JUSTIFIED') ctx.warn('justified text is drawn left aligned');
  const truncate = node.textTruncation === 'ENDING';
  const hug = node.textAutoResize === 'WIDTH_AND_HEIGHT';
  const maxLines = node.maxLines || (truncate && hug ? 1 : null);
  if (maxLines) out = mod(out, 'lineLimit', [[null, maxLines]]);
  if (lh) {
    // Figma centres the glyphs in each line box; the helper sets the room
    // against the face's own line height, read on the device.
    if (ctx.helper) ctx.helper('designLineHeight');
    const family = seg.fontName && seg.fontName.family;
    const custom = family && !isSystemFamily(family);
    out = mod(out, 'designLineHeight', [
      [null, Math.round(lh * 100) / 100],
      ['font', custom ? str(postScriptName(seg.fontName)) : raw('nil')],
      ['size', seg.fontSize || 17],
      ['relativeTo', custom && !ctx.fixed ? raw(textStyleFor(seg.fontSize || 17)) : raw('nil')],
    ]);
  }
  for (const e of effectsOf(node, 'DROP_SHADOW')) out = mod(out, 'shadow', shadowArgs(e, ctx.color));
  return { view: out, lineHeight: lh };
}

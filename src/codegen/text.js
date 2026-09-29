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

function segmentsOf(node) {
  return Array.isArray(node.segments) && node.segments.length
    ? node.segments : [{ characters: node.characters || '' }];
}

function lineCount(node) {
  return Math.max(1, (node.characters || '').split('\n').length);
}

/**
 * The rendered line height in px of a text whose box hugs its lines, taken
 * from Figma's own box: Figma rounds percent line heights to whole pixels
 * and sizes AUTO lines by the font's metrics, which CSS does not reproduce.
 * Null when the box does not tell (fixed boxes, mixed line heights).
 */
export function boxLineHeight(node) {
  if (!node || (node.textAutoResize !== 'HEIGHT' && node.textAutoResize !== 'WIDTH_AND_HEIGHT')) return null;
  const segs = segmentsOf(node);
  const first = JSON.stringify(segs[0].lineHeight);
  if (!segs.every((s) => JSON.stringify(s.lineHeight) === first && s.fontSize === segs[0].fontSize)) return null;
  const lh = segs[0].lineHeight;
  const size = segs[0].fontSize;
  if (!lh || lh.unit === 'PIXELS' || typeof size !== 'number' || !node.height) return null;
  const nominal = lh.unit === 'PERCENT' ? (size * lh.value) / 100 : size * 1.2;
  const lines = node.textAutoResize === 'WIDTH_AND_HEIGHT'
    ? lineCount(node) : Math.max(1, Math.round(node.height / nominal));
  if (lines > 6 && lh.unit === 'AUTO') return null;
  return node.height / lines;
}

function leading(seg, node, vars) {
  const lh = seg.lineHeight;
  if (lh && lh.unit === 'PIXELS') return `leading-[${tw(withVar(vars.lineHeight, px(lh.value)))}]`;
  const fromBox = boxLineHeight(node);
  if (fromBox) return `leading-[${px(fromBox)}]`;
  if (lh && lh.unit === 'PERCENT') return `leading-[${num(lh.value / 100)}]`;
  return lh ? 'leading-[normal]' : null;
}

export function fontClasses(seg, node) {
  const vars = seg.vars || {};
  const out = [];
  const font = seg.fontName || {};
  if (font.family) out.push(`font-['${tw(`${font.family}:${font.style || 'Regular'}`)}',sans-serif]`);
  if (seg.fontWeight) out.push(`font-[${tw(withVar(vars.fontWeight, seg.fontWeight))}]`);
  if (font.style && /italic/i.test(font.style)) out.push('italic');
  if (typeof seg.fontSize === 'number') {
    out.push(vars.fontSize ? `text-[length:${tw(withVar(vars.fontSize, px(seg.fontSize)))}]`
      : `text-[${px(seg.fontSize)}]`);
  }
  const lead = leading(seg, node, vars);
  if (lead) out.push(lead);
  const ls = seg.letterSpacing;
  if (ls && ls.value) {
    const value = ls.unit === 'PIXELS' ? px(ls.value) : `${num(ls.value / 100)}em`;
    out.push(`tracking-[${tw(withVar(vars.letterSpacing, value))}]`);
  }
  if (CASE[seg.textCase]) out.push(CASE[seg.textCase]);
  if (DECORATION[seg.textDecoration]) out.push(DECORATION[seg.textDecoration]);
  const fills = visiblePaints(seg.fills);
  const gradient = fills.find((p) => p.type.startsWith('GRADIENT'));
  const solidIndex = (seg.fills || []).findIndex((p) => p && p.visible !== false && p.type === 'SOLID');
  if (gradient) {
    out.push(`bg-[${tw(gradientCss(gradient, node ? node.width : 100, node ? node.height : 100))}]`,
      'bg-clip-text', 'text-transparent');
  } else if (solidIndex >= 0) {
    const p = seg.fills[solidIndex];
    out.push(`text-[${tw(withVar(vars[`fill.${solidIndex}`], css(p.color, p.opacity ?? 1)))}]`);
  }
  return out;
}

export function jsxText(text) {
  if (/[{}<>&"'`\\]|^\s|\s$|\n|\s{2}/.test(text)) return `{${JSON.stringify(text)}}`;
  return text;
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
  return out;
}

/**
 * Paragraphs of styled pieces: [[{ seg, text }]]. Runs are split at line
 * breaks so each paragraph can carry its own spacing.
 */
export function paragraphs(node) {
  const out = [[]];
  for (const seg of segmentsOf(node)) {
    const text = seg.characters ?? '';
    text.split('\n').forEach((part, i) => {
      if (i > 0) out.push([]);
      if (part) out[out.length - 1].push({ seg, text: part });
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

export { segmentsOf };

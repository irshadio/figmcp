// Text nodes as Text and Text.rich widgets.
import { boxLineHeight, paragraphs, segmentsOf, SOFT_BREAK, topPaint } from '../text.js';
import { call, list, print, raw, str } from './dart.js';

/** The gradient of a run's top fill, or null. */
export function runGradient(seg) {
  const paint = topPaint(seg.fills);
  return paint && paint.type !== 'SOLID' ? paint : null;
}
import { gradient, textShadows } from './paint.js';

const ALIGN = { CENTER: 'TextAlign.center', RIGHT: 'TextAlign.right', JUSTIFIED: 'TextAlign.justify' };
const DECORATION = { UNDERLINE: 'TextDecoration.underline', STRIKETHROUGH: 'TextDecoration.lineThrough' };
const DECORATION_STYLE = {
  WAVY: 'TextDecorationStyle.wavy', DOTTED: 'TextDecorationStyle.dotted', DASHED: 'TextDecorationStyle.dashed',
};
const STYLE_WEIGHTS = [
  [/thin|hairline/i, 100], [/extra ?light|ultra ?light/i, 200], [/light/i, 300], [/medium/i, 500],
  [/semi ?bold|demi ?bold/i, 600], [/extra ?bold|ultra ?bold/i, 800], [/bold/i, 700],
  [/black|heavy/i, 900],
];

/** Font weight 100..900 of a text run. */
export function fontWeight(seg) {
  if (typeof seg.fontWeight === 'number') return Math.min(900, Math.max(100, Math.round(seg.fontWeight / 100) * 100));
  const style = (seg.fontName && seg.fontName.style) || '';
  const hit = STYLE_WEIGHTS.find(([re]) => re.test(style));
  return hit ? hit[1] : 400;
}

function titleCase(text) {
  return text.replace(/(^|[\s\-–—/(])(\p{L})/gu, (m, before, letter) => before + letter.toUpperCase());
}

/** The characters of every run with its text case applied, as Figma draws them. */
export function casedRuns(node) {
  const segs = segmentsOf(node);
  const full = segs.map((s) => (typeof s.characters === 'string' ? s.characters : '')).join('');
  let at = 0;
  return segs.map((seg) => {
    const own = typeof seg.characters === 'string' ? seg.characters : '';
    const start = at;
    at += own.length;
    switch (seg.textCase) {
      case 'UPPER': return own.toUpperCase();
      case 'LOWER': return own.toLowerCase();
      case 'TITLE': return titleCase(full).slice(start, start + own.length);
      default: return own;
    }
  });
}

/**
 * TextStyle arguments of a run. [ctx] gives value(v, varName, type),
 * color(color, opacity, varName) and ratios (AUTO line heights by font).
 */
function styleArgs(seg, node, ctx) {
  const vars = seg.vars || {};
  const args = {};
  const font = seg.fontName || {};
  if (font.family) args.fontFamily = str(font.family);
  const size = typeof seg.fontSize === 'number' ? seg.fontSize : null;
  if (size) args.fontSize = ctx.value(size, vars.fontSize, 'double');
  args.fontWeight = raw(`FontWeight.w${fontWeight(seg)}`);
  if (/italic|oblique/i.test(font.style || '')) args.fontStyle = raw('FontStyle.italic');
  const lh = seg.lineHeight;
  let height = null;
  if (size && lh && lh.unit === 'PIXELS') height = lh.value / size;
  else if (size && lh && lh.unit === 'PERCENT') height = lh.value / 100;
  const fromBox = boxLineHeight(node, ctx.ratios);
  if (size && fromBox && (!lh || lh.unit !== 'PIXELS')) height = fromBox / size;
  if (height) {
    args.height = Math.round(height * 10000) / 10000;
    // Figma centres glyphs in the line box; Flutter's default spreads the
    // extra space by the font's ascent and descent.
    args.leadingDistribution = raw('TextLeadingDistribution.even');
  }
  const ls = seg.letterSpacing;
  if (ls && ls.value) {
    const px = ls.unit === 'PIXELS' ? ls.value : (ls.value / 100) * (size || 0);
    args.letterSpacing = ctx.value(Math.round(px * 100) / 100, vars.letterSpacing, 'double');
  } else {
    // Theme text styles (inside a Scaffold) carry their own spacing.
    args.letterSpacing = 0;
  }
  const paint = topPaint(seg.fills);
  if (paint && paint.type === 'SOLID') {
    args.color = ctx.color(paint.color, paint.opacity ?? 1, vars[`fill.${seg.fills.indexOf(paint)}`]);
  } else if (paint && !ctx.masked) {
    // A gradient on part of the text: that run paints with the shader.
    const shader = gradient(paint, node.width || 100, node.height || 100, ctx.color, ctx.warn);
    args.foreground = raw(`Paint()..shader = ${print(shader, 4).replace(/\n/g, ' ').replace(/\s+/g, ' ')}.createShader(const Rect.fromLTWH(0, 0, ${node.width || 100}, ${node.height || 100}))`, false);
  }
  if (DECORATION[seg.textDecoration]) {
    args.decoration = raw(DECORATION[seg.textDecoration]);
    if (DECORATION_STYLE[seg.textDecorationStyle]) args.decorationStyle = raw(DECORATION_STYLE[seg.textDecorationStyle]);
    const dc = seg.textDecorationColor && seg.textDecorationColor.value;
    if (dc && typeof dc === 'object' && dc.type === 'SOLID') args.decorationColor = ctx.color(dc.color, dc.opacity ?? 1);
  }
  if (seg.textCase === 'SMALL_CAPS' || seg.textCase === 'SMALL_CAPS_FORCED') {
    const features = [call('FontFeature.enable', {}, { positional: [str('smcp')] })];
    if (seg.textCase === 'SMALL_CAPS_FORCED') features.push(call('FontFeature.enable', {}, { positional: [str('c2sc')] }));
    args.fontFeatures = list(features);
  }
  const shadows = textShadows(node, ctx.color);
  if (shadows.length) args.shadows = list(shadows);
  return args;
}

function sameValue(a, b) {
  return print(a) === print(b);
}

/**
 * The text of [node] as a widget, without its box: Text or Text.rich for
 * one paragraph block, a Column of them when paragraphs are spaced or
 * listed. Returns { widget, align } where align is the text alignment.
 */
export function textWidget(node, ctx) {
  const segs = segmentsOf(node);
  const cased = casedRuns(node);
  const styles = segs.map((seg) => styleArgs(seg, node, ctx));
  const keys = Object.keys(styles[0]).filter((k) => styles.every((s) => k in s && sameValue(s[k], styles[0][k])));
  const shared = Object.fromEntries(keys.map((k) => [k, styles[0][k]]));
  const own = styles.map((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !keys.includes(k))));
  const align = ALIGN[node.textAlignHorizontal] ? raw(ALIGN[node.textAlignHorizontal]) : null;
  const hug = node.textAutoResize === 'WIDTH_AND_HEIGHT';
  const lines = (text) => text.split(SOFT_BREAK).join('\n');

  // Runs with their cased characters, split into paragraphs.
  const indexed = segs.map((s, i) => ({ ...s, characters: cased[i], index: i }));
  const paras = paragraphs({ ...node, segments: indexed });
  const spacing = node.paragraphSpacing || 0;
  const listed = paras.some((p) => p.list);
  const truncate = node.textTruncation === 'ENDING';
  const maxLines = node.maxLines || (truncate && hug ? 1 : null);
  const common = {
    textAlign: align,
    softWrap: hug ? false : null,
    maxLines,
    overflow: truncate ? raw('TextOverflow.ellipsis') : null,
  };
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
    if (runs.length <= 1 && segs.length === 1) {
      const style = Object.keys(shared).length ? call('TextStyle', shared) : null;
      return call('Text', { style, ...common }, { positional: [str(runs.length ? runs[0].text : '')] });
    }
    const spans = runs.map((r) => call('TextSpan', {
      text: str(r.text),
      style: Object.keys(own[r.index]).length ? call('TextStyle', own[r.index]) : null,
    }));
    return call('Text.rich', {
      style: Object.keys(shared).length ? call('TextStyle', shared) : null, ...common,
    }, { positional: [call('TextSpan', { children: list(spans) })] });
  };

  if (listed || (spacing && paras.length > 1)) {
    let n = 0;
    const children = paras.map((p) => {
      n = p.list === 'ORDERED' ? n + 1 : 0;
      const prefix = p.list === 'ORDERED' ? `${n}. ` : p.list ? '• ' : '';
      return build(p.pieces, prefix);
    });
    const cross = node.textAlignHorizontal === 'CENTER' ? 'center' : node.textAlignHorizontal === 'RIGHT' ? 'end' : 'start';
    return {
      widget: call('Column', {
        mainAxisSize: raw('MainAxisSize.min'),
        crossAxisAlignment: hug ? raw(`CrossAxisAlignment.${cross}`) : raw('CrossAxisAlignment.stretch'),
        spacing: spacing || null,
        children: list(children),
      }),
      align,
    };
  }
  // One block: paragraph breaks end the run before them.
  const pieces = [];
  paras.forEach((p, i) => {
    if (i) pieces.push({ seg: pieces.length ? pieces[pieces.length - 1].seg : indexed[0], br: true });
    pieces.push(...p.pieces);
  });
  return { widget: build(pieces), align };
}

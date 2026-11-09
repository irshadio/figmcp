// SwiftUI patterns the layer roles become: the press-scale button style,
// the sliding selection indicator of a tab bar or segmented control, and the
// text style a font size scales with.
import { mergeTrees } from './repeat.js';
import { mod, print, raw } from './swift.js';

const SHAPES = new Set(['Rectangle', 'RoundedRectangle', 'Capsule', 'Circle', 'Ellipse', 'UnevenRoundedRectangle']);
const PLACEHOLDER = '__SELECTION_INDICATOR__';
// Apple's text styles by their default size, nearest wins.
const TEXT_STYLES = [
  [11, 'caption2'], [12, 'caption'], [13, 'footnote'], [15, 'subheadline'], [16, 'callout'],
  [17, 'body'], [20, 'title3'], [22, 'title2'], [28, 'title'], [34, 'largeTitle'],
];

export const PRESSABLE_STYLE = `/// Scales the label down a little while it is pressed (only dims it when
/// the person has asked for reduced motion).
struct PressableButtonStyle: ButtonStyle {
  @Environment(\\.accessibilityReduceMotion) private var reduceMotion

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
      .opacity(configuration.isPressed ? 0.9 : 1)
      .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
  }
}

extension ButtonStyle where Self == PressableButtonStyle {
  static var pressable: PressableButtonStyle { PressableButtonStyle() }
}`;

/** The text style a run of [size] points scales with under Dynamic Type. */
export function textStyleFor(size) {
  let best = TEXT_STYLES[0];
  for (const s of TEXT_STYLES) if (Math.abs(s[0] - size) < Math.abs(best[0] - size)) best = s;
  return `.${best[1]}`;
}

/** The call a wrapped value prints as, else the call itself. */
function unwrap(e) {
  const inner = e && e.kind === 'call' && e.name === '' && e.args.length === 1 ? e.args[0][1] : null;
  return inner && inner.kind === 'call' ? { ...inner, mods: [...inner.mods, ...e.mods], view: inner.view || e.view } : e;
}

/** A filled shape with no content: what a selection draws behind an item. */
function isShapeFill(e) {
  const c = unwrap(e);
  return Boolean(c) && c.kind === 'call' && SHAPES.has(c.name) && !c.body && c.mods.some((m) => m.name === 'fill');
}

function mergeable(a, b, options) {
  return mergeTrees(a, b, options) !== null;
}

/** [e] with the indicator's place marked as a background at mod index [at]. */
function marked(e, at = e.mods.length) {
  const m = { name: 'background', args: [], body: [raw(PLACEHOLDER)] };
  return { ...e, mods: [...e.mods.slice(0, at), m, ...e.mods.slice(at)] };
}

/**
 * The shape the selected item [on] draws behind itself that the unselected
 * [off] lacks: { indicator, on, off } with both items marked where it goes,
 * and otherwise differing in values only. Null when the items differ in
 * more than that.
 */
export function indicatorOf(on, off, options = {}) {
  if (!on || !off || on.kind !== 'call' || off.kind !== 'call') return null;
  const a = unwrap(on);
  const b = unwrap(off);
  // A background the selected item has.
  for (let i = 0; i < a.mods.length; i++) {
    const m = a.mods[i];
    if (m.name !== 'background' || !m.body || m.body.length !== 1 || !isShapeFill(m.body[0])) continue;
    const stripped = { ...a, mods: a.mods.filter((_, j) => j !== i) };
    if (mergeable(stripped, b, options)) return { indicator: unwrap(m.body[0]), on: marked(stripped, i), off: marked(b, i) };
  }
  // A shape under the content of a ZStack the unselected item draws bare.
  if (a.name === 'ZStack' && Array.isArray(a.body) && a.body.length === 2 && isShapeFill(a.body[0])) {
    const inner = unwrap(a.body[1]);
    if (inner && inner.kind === 'call') {
      const flat = { ...inner, mods: [...inner.mods, ...a.mods] };
      if (mergeable(flat, b, options)) return { indicator: unwrap(a.body[0]), on: marked(flat), off: marked(b) };
    }
  }
  // The same place deeper in both trees.
  if (Array.isArray(a.body) && Array.isArray(b.body) && a.body.length === b.body.length) {
    for (let i = 0; i < a.body.length; i++) {
      const r = indicatorOf(a.body[i], b.body[i], options);
      if (!r) continue;
      const withAt = (e, item) => ({ ...e, body: e.body.map((x, j) => (j === i ? item : x)) });
      const onTree = withAt(a, r.on);
      const offTree = withAt(b, r.off);
      if (mergeable(onTree, offTree, options)) return { indicator: r.indicator, on: onTree, off: offTree };
    }
  }
  return null;
}

/** The merged item body with the indicator drawn when selected, sliding between items. */
export function withIndicator(merged, indicator, namespace) {
  const shape = mod(indicator, 'matchedGeometryEffect', [['id', raw('"selection"')], ['in', raw(namespace)]]);
  return merged.split('\n').map((line) => {
    if (!line.includes(PLACEHOLDER)) return line;
    const indent = line.slice(0, line.indexOf(PLACEHOLDER));
    const level = indent.length / 2;
    return [`${indent}if isSelected {`, `${indent}  ${print(shape, level + 1)}`, `${indent}}`].join('\n');
  }).join('\n');
}

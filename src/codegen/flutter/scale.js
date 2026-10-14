// flutter_screenutil output: design pixels become .w (horizontal), .h
// (vertical), .r (radii and even insets) and .sp (font sizes), so the
// layout scales from the design size to the device.
import { dNum, raw } from './dart.js';

// Named arguments that are horizontal or vertical lengths in layout widgets.
const AXIS = {
  width: 'w', minWidth: 'w', maxWidth: 'w', left: 'w', right: 'w', start: 'w', end: 'w',
  height: 'h', minHeight: 'h', maxHeight: 'h', top: 'h', bottom: 'h',
};

// Calls whose arguments are not layout lengths: stroke widths, shadow
// blurs, text line heights (a ratio) and letter spacing.
const OWN_RULES = {
  TextStyle: { fontSize: 'sp' },
  StrutStyle: { fontSize: 'sp' },
  BorderSide: {},
  'Border.all': {},
  BoxShadow: {},
  Shadow: {},
  'EdgeInsets.symmetric': { horizontal: 'w', vertical: 'h' },
};

const POSITIONAL = {
  'EdgeInsets.all': ['r'],
  'EdgeInsets.fromLTRB': ['w', 'h', 'w', 'h'],
  'BorderRadius.circular': ['r'],
  'Radius.circular': ['r'],
  'Radius.elliptical': ['w', 'h'],
};

const TOKEN = /^DesignTokens\.\w+$/;

function scaled(v, unit) {
  if (typeof v === 'number') return v === 0 ? v : raw(`${dNum(v)}.${unit}`, false);
  if (v && v.kind === 'raw' && TOKEN.test(v.code)) return raw(`${v.code}.${unit}`, false);
  return v;
}

function spacingUnits(e) {
  if (e.name === 'Row') return { spacing: 'w' };
  if (e.name === 'Column') return { spacing: 'h' };
  if (e.name === 'Wrap') {
    const direction = e.named.find(([k]) => k === 'direction');
    const vertical = direction && direction[1] && direction[1].code === 'Axis.vertical';
    return vertical ? { spacing: 'h', runSpacing: 'w' } : { spacing: 'w', runSpacing: 'h' };
  }
  return {};
}

function unitFor(e, key, parent) {
  if (OWN_RULES[e.name]) return OWN_RULES[e.name][key] || null;
  const spacing = spacingUnits(e)[key];
  if (spacing) return spacing;
  if (e.name === 'Offset') return null;
  return AXIS[key] || null;
}

/** [tree] with its design lengths scaled by flutter_screenutil. */
export function screenUtil(e, parent = null) {
  if (!e || typeof e !== 'object') return e;
  switch (e.kind) {
    case 'call': {
      const units = POSITIONAL[e.name]
        || (e.name === 'Offset' && parent && parent.name === 'Transform.translate' ? ['w', 'h'] : null);
      return {
        ...e,
        positional: e.positional.map((v, i) => (units && units[i] ? scaled(v, units[i]) : screenUtil(v, e))),
        named: e.named.map(([k, v]) => {
          const unit = unitFor(e, k, parent);
          return [k, unit ? scaled(screenUtil(v, e), unit) : screenUtil(v, e)];
        }),
      };
    }
    case 'list':
      return { ...e, items: e.items.map((v) => screenUtil(v, parent)) };
    case 'method':
      return { ...e, target: screenUtil(e.target, parent), positional: e.positional.map((v) => screenUtil(v, parent)) };
    case 'lambda':
      return { ...e, body: screenUtil(e.body, parent) };
    default:
      return e;
  }
}

// Swift source: literals, identifiers, and an expression tree of calls with
// trailing view builders and modifier chains, printed in Xcode's style.

const RESERVED = new Set([
  'associatedtype', 'class', 'deinit', 'enum', 'extension', 'fileprivate', 'func', 'import', 'init',
  'inout', 'internal', 'let', 'open', 'operator', 'private', 'precedencegroup', 'protocol', 'public',
  'rethrows', 'static', 'struct', 'subscript', 'typealias', 'var', 'break', 'case', 'catch', 'continue',
  'default', 'defer', 'do', 'else', 'fallthrough', 'for', 'guard', 'if', 'in', 'repeat', 'return',
  'throw', 'switch', 'where', 'while', 'Any', 'as', 'await', 'false', 'is', 'nil', 'self', 'Self',
  'super', 'throws', 'true', 'try', 'some', 'any', 'body', 'view', 'content',
]);
const WIDTH = 100;

/** Swift keywords: a member may take one written in backticks, and a reference after a dot needs none. */
export const KEYWORDS = new Set([...RESERVED].filter((w) => !['body', 'view', 'content', 'Self', 'Any', 'some', 'any'].includes(w)));

/**
 * Type names a generated type must not take: Swift, Foundation and SwiftUI
 * types the code uses or a project commonly does, and the generator's own
 * helpers. A nested type of that name would shadow them in the screen.
 */
export const SWIFT_TYPE_NAMES = new Set([
  // Swift and Foundation.
  'Any', 'AnyObject', 'Self', 'Type', 'Protocol', 'Never', 'Void', 'Optional', 'Array', 'Dictionary', 'Set', 'String',
  'Substring', 'Character', 'Int', 'UInt', 'UInt32', 'Int32', 'Double', 'Float', 'Bool', 'Error', 'Result', 'Range',
  'ClosedRange', 'Sequence', 'Collection', 'Hashable', 'Equatable', 'Identifiable', 'Codable', 'Decodable', 'Encodable',
  'Comparable', 'Sendable', 'Data', 'Date', 'URL', 'UUID', 'Locale', 'Measurement', 'Decimal', 'Task', 'MainActor',
  'CGFloat', 'CGPoint', 'CGSize', 'CGRect', 'CGAffineTransform', 'AttributedString', 'LocalizedStringKey', 'Bundle',
  'Notification', 'Timer', 'Calendar', 'TimeZone', 'Formatter', 'NumberFormatter', 'DateFormatter', 'Mirror',
  // SwiftUI views and values.
  'App', 'Scene', 'View', 'ViewModifier', 'ViewBuilder', 'Body', 'Content', 'EmptyView', 'AnyView', 'TupleView', 'Group',
  'Text', 'Image', 'Label', 'Button', 'ButtonStyle', 'PrimitiveButtonStyle', 'Link', 'Toggle', 'Picker', 'Slider',
  'Stepper', 'DatePicker', 'ColorPicker', 'Menu', 'TextField', 'SecureField', 'TextEditor', 'Form', 'Section', 'List',
  'ForEach', 'ScrollView', 'ScrollViewReader', 'ScrollViewProxy', 'GeometryReader', 'GeometryProxy', 'NavigationStack',
  'NavigationLink', 'NavigationView', 'NavigationSplitView', 'NavigationPath', 'TabView', 'Tab', 'HStack', 'VStack',
  'ZStack', 'LazyHStack', 'LazyVStack', 'LazyHGrid', 'LazyVGrid', 'Grid', 'GridRow', 'GridItem', 'Spacer', 'Divider',
  'Layout', 'AnyLayout', 'HStackLayout', 'VStackLayout', 'ZStackLayout', 'Color', 'Font', 'Gradient', 'LinearGradient',
  'RadialGradient', 'AngularGradient', 'EllipticalGradient', 'Shape', 'ShapeStyle', 'AnyShape', 'Path', 'Rectangle',
  'RoundedRectangle', 'UnevenRoundedRectangle', 'Capsule', 'Circle', 'Ellipse', 'Material', 'Angle', 'Animation',
  'Transaction', 'Transition', 'AnyTransition', 'Edge', 'EdgeInsets', 'Alignment', 'HorizontalAlignment',
  'VerticalAlignment', 'Axis', 'UnitPoint', 'StrokeStyle', 'BlendMode', 'ContentMode', 'ColorScheme',
  'DynamicTypeSize', 'State', 'Binding', 'Bindable', 'Environment', 'EnvironmentValues', 'EnvironmentObject',
  'ObservedObject', 'StateObject', 'Observable', 'ObservableObject', 'Published', 'Namespace', 'ScaledMetric',
  'FocusState', 'AppStorage', 'SceneStorage', 'Gauge', 'ProgressView', 'Map', 'Chart', 'Table', 'Badge',
  'ContentUnavailableView', 'ShareLink', 'PhotosPicker', 'Canvas', 'TimelineView', 'Item', 'Action', 'Model', 'ID',
  'Preview', 'PreviewProvider', 'SubmitLabel', 'UIKeyboardType', 'UITextContentType', 'SensoryFeedback',
  // The generator's own helpers.
  'FlowLayout', 'PressableButtonStyle', 'DesignTokens', 'AppFonts', 'DesignLineHeight', 'DesignFont', 'LayerStack', 'UIFont', 'Field', 'FocusState',
]);

/** A Swift number literal, rounded to 4 decimals (ratios need them; points come rounded). */
export function sNum(v) {
  const n = Math.round(v * 10000) / 10000;
  return Object.is(n, -0) ? '0' : String(n);
}

/** A double-quoted Swift string literal. */
export function sString(value) {
  const body = String(value).replace(/[\\"\n\r\t\u2028\u2029]|[\u0000-\u001f]/g, (c) => {
    switch (c) {
      case '\\': return '\\\\';
      case '"': return '\\"';
      case '\n': return '\\n';
      case '\r': return '\\r';
      case '\t': return '\\t';
      default: return `\\u{${c.charCodeAt(0).toString(16)}}`;
    }
  });
  return `"${body}"`;
}

function words(name) {
  // A role tag in a layer name ("Pay [button]") is not part of the name;
  // accents are dropped ("Größe" -> "Große") and other letters kept, as Swift allows.
  return String(name).replace(/\[[A-Za-z-]+\]/g, ' ').normalize('NFKD').replace(/\p{M}+/gu, '')
    .replace(/([\p{Ll}0-9])(\p{Lu})/gu, '$1 $2').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    .split(' ').filter(Boolean);
}

/** lowerCamelCase identifier that is valid Swift ('primary/900' -> 'primary900'). */
export function sIdent(name, fallback = 'value') {
  const w = words(name);
  let out = w.map((x, i) => (i ? x[0].toUpperCase() + x.slice(1) : x[0].toLowerCase() + x.slice(1))).join('');
  if (!out) out = fallback;
  if (/^[0-9]/.test(out)) out = `${fallback}${out[0].toUpperCase()}${out.slice(1)}`;
  if (RESERVED.has(out)) out = `${out}Value`;
  return out;
}

/** UpperCamelCase type name. */
export function sType(name, fallback = 'Design') {
  // Leading numbers ('01 Home') are ordering, not part of the name.
  const all = words(name);
  const named = all.findIndex((x) => !/^[0-9]+$/.test(x));
  const w = named > 0 ? all.slice(named) : all;
  let out = w.map((x) => x[0].toUpperCase() + x.slice(1)).join('');
  if (!out) out = fallback;
  if (/^[0-9]/.test(out)) out = `${fallback}${out}`;
  return out;
}

// Expression tree. A value is a number, boolean, null, or one of:
//   { kind: 'call', name, args: [[label, value]], body, trailing, mods, view }
//       name(args) { body } label: { ... } .mod(args)... ; body is a list of
//       views or null, trailing further labelled closures [{ label, body }],
//       mods are { name, args, body } chained after it, each on its own
//       line when [view] is set.
//   { kind: 'array', items }
//   { kind: 'str', value }
//   { kind: 'raw', code }

function argList(args) {
  if (Array.isArray(args)) return args.filter(([, v]) => v !== undefined && v !== null);
  return Object.entries(args).filter(([, v]) => v !== undefined && v !== null);
}

/** A call: positional arguments under the label null, labelled ones by name. */
export function call(name, args = [], { body = null, view = false, params = null } = {}) {
  return { kind: 'call', name, args: argList(args), body, trailing: [], mods: [], view, params };
}

/** A view: its modifiers go on their own lines. [params] names the closure's parameters. */
export function view(name, args = [], body = null, params = null) {
  return call(name, args, { body, view: true, params });
}

/** [target] with the modifier .name(args) { body } appended. */
export function mod(target, name, args = [], body = null) {
  if (!target) return target;
  const t = typeof target === 'object' && target.kind === 'call' ? target : view('', [[null, target]]);
  return { ...t, mods: [...t.mods, { name, args: argList(args), body }] };
}

/** [target] with a further trailing closure `label: { body }` after its body. */
export function trailing(target, label, body) {
  return { ...target, trailing: [...target.trailing, { label, body }] };
}

export function array(items) {
  return { kind: 'array', items: items.filter((v) => v !== undefined && v !== null) };
}

export function str(value) {
  return { kind: 'str', value };
}

export function raw(code) {
  return { kind: 'raw', code };
}

function pad(n) {
  return '  '.repeat(n);
}

function printArgs(args, indent) {
  const parts = args.map(([label, v]) => `${label ? `${label}: ` : ''}${print(v, indent + 1)}`);
  const flat = parts.join(', ');
  if (!parts.some((p) => p.includes('\n')) && flat.length + pad(indent).length <= WIDTH) return flat;
  return `\n${parts.map((p) => `${pad(indent + 1)}${p}`).join(',\n')}\n${pad(indent)}`;
}

function printBody(body, indent, params = null) {
  if (!Array.isArray(body)) return `{ ${print(body, indent)} }`;
  if (!body.length) return '{}';
  const open = params ? `{ ${params} in` : '{';
  return `${open}\n${body.map((b) => `${pad(indent + 1)}${print(b, indent + 1)}`).join('\n')}\n${pad(indent)}}`;
}

function printCall(e, indent) {
  // A wrapped value (a view expression that is not a call) prints as itself.
  let out = e.name === '' && e.args.length === 1 && e.args[0][0] === null
    ? print(e.args[0][1], indent)
    : `${e.name}${e.args.length || !e.body ? `(${printArgs(e.args, indent)})` : ''}`;
  if (e.body) out += `${e.args.length || e.name ? ' ' : ''}${printBody(e.body, indent, e.params)}`;
  for (const t of e.trailing || []) out += ` ${t.label}: ${printBody(t.body, indent)}`;
  // Modifiers line up with a closing brace or parenthesis on its own line, else indent one level.
  const at = e.view && (out.endsWith('}') || (out.endsWith(')') && out.includes('\n'))) ? indent : indent + 1;
  for (const m of e.mods) {
    const level = e.view ? at : indent;
    const args = m.args.length || !m.body ? `(${printArgs(m.args, level)})` : '';
    const body = m.body ? ` ${printBody(m.body, level)}` : '';
    const one = `.${m.name}${args}${body}`;
    out += e.view ? `\n${pad(at)}${one}` : one;
  }
  return out;
}

/** Prints [e] at [indent]. */
export function print(e, indent = 0) {
  if (e === null) return 'nil';
  if (typeof e === 'number') return sNum(e);
  if (typeof e === 'boolean') return String(e);
  switch (e.kind) {
    case 'str': return sString(e.value);
    case 'raw': return e.code;
    case 'array': {
      const items = e.items.map((item) => print(item, indent + 1));
      const flat = `[${items.join(', ')}]`;
      if (!items.some((i) => i.includes('\n')) && pad(indent).length + flat.length <= WIDTH) return flat;
      return `[\n${items.map((i) => `${pad(indent + 1)}${i},`).join('\n')}\n${pad(indent)}]`;
    }
    case 'call': return printCall(e, indent);
    default:
      throw new Error(`Unknown Swift expression: ${JSON.stringify(e).slice(0, 80)}`);
  }
}

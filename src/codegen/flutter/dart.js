// Dart source: literals, identifiers, and an expression tree printed in
// dart format style, with `const` where every argument allows it.

const RESERVED = new Set([
  'abstract', 'as', 'assert', 'async', 'await', 'base', 'break', 'case', 'catch', 'class', 'const',
  'continue', 'covariant', 'default', 'deferred', 'do', 'dynamic', 'else', 'enum', 'export',
  'extends', 'extension', 'external', 'factory', 'false', 'final', 'finally', 'for', 'Function',
  'get', 'hide', 'if', 'implements', 'import', 'in', 'interface', 'is', 'late', 'library', 'mixin',
  'new', 'null', 'of', 'on', 'operator', 'part', 'required', 'rethrow', 'return', 'sealed', 'set',
  'show', 'static', 'super', 'switch', 'sync', 'this', 'throw', 'true', 'try', 'type', 'typedef',
  'var', 'void', 'when', 'while', 'with', 'yield',
]);
const WIDTH = 80;

/** A Dart number literal, rounded to 4 decimals (ratios need them; pixels come rounded). */
export function dNum(v) {
  const n = Math.round(v * 10000) / 10000;
  return Object.is(n, -0) ? '0' : String(n);
}

function byte(v) {
  return Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
}

/** 'Color(0xAARRGGBB)' for a Figma colour and extra opacity. */
export function dColor(color, opacity = 1) {
  const a = (color.a ?? 1) * opacity;
  return `Color(0x${[byte(a), byte(color.r), byte(color.g), byte(color.b)].join('').toUpperCase()})`;
}

/** A single-quoted Dart string literal. */
export function dString(value) {
  const body = String(value).replace(/[\\'$\n\r\t\u2028\u2029]|[\u0000-\u001f]/g, (c) => {
    switch (c) {
      case '\\': return '\\\\';
      case '\'': return '\\\'';
      case '$': return '\\$';
      case '\n': return '\\n';
      case '\r': return '\\r';
      case '\t': return '\\t';
      default: return `\\u{${c.charCodeAt(0).toString(16)}}`;
    }
  });
  return `'${body}'`;
}

function words(name) {
  return String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[^A-Za-z0-9]+/g, ' ').trim()
    .split(' ').filter(Boolean);
}

/** lowerCamelCase identifier that is valid Dart ('primary/900' -> 'primary900'). */
export function dIdent(name, fallback = 'value') {
  const w = words(name);
  let out = w.map((x, i) => (i ? x[0].toUpperCase() + x.slice(1) : x[0].toLowerCase() + x.slice(1))).join('');
  if (!out) out = fallback;
  if (/^[0-9]/.test(out)) out = `${fallback}${out[0].toUpperCase()}${out.slice(1)}`;
  if (RESERVED.has(out)) out = `${out}Value`;
  return out;
}

/** UpperCamelCase type name. */
export function dType(name, fallback = 'Design') {
  const w = words(name);
  let out = w.map((x) => x[0].toUpperCase() + x.slice(1)).join('');
  if (!out) out = fallback;
  if (/^[0-9]/.test(out)) out = `${fallback}${out}`;
  return out;
}

/** snake_case file name part ('nav-arrow Down' -> 'nav_arrow_down'). */
export function dFileName(name, fallback = 'asset') {
  const out = words(name).map((x) => x.toLowerCase()).join('_').slice(0, 48).replace(/_+$/, '');
  return out && !/^[0-9]/.test(out) ? out : `${fallback}${out ? `_${out}` : ''}`;
}

// Expression tree. A value is a number, boolean, null, or one of:
//   { kind: 'call', name, positional, named: [[key, value]], constable }
//   { kind: 'method', target, name, positional }   target.name(positional)
//   { kind: 'lambda', params, body }               (params) => body
//   { kind: 'list', items }
//   { kind: 'str', value }
//   { kind: 'raw', code, constant }

export function call(name, named = {}, { positional = [], constable = true } = {}) {
  const pairs = Object.entries(named).filter(([, v]) => v !== undefined && v !== null);
  return { kind: 'call', name, positional: positional.filter((v) => v !== undefined), named: pairs, constable };
}

export function method(target, name, positional = []) {
  return { kind: 'method', target, name, positional };
}

export function lambda(params, body) {
  return { kind: 'lambda', params, body };
}

export function list(items) {
  return { kind: 'list', items: items.filter((v) => v !== undefined && v !== null) };
}

export function str(value) {
  return { kind: 'str', value };
}

export function raw(code, constant = true) {
  return { kind: 'raw', code, constant };
}

export function isConst(e) {
  if (e === null || typeof e === 'number' || typeof e === 'boolean') return true;
  switch (e.kind) {
    case 'str': return true;
    case 'raw': return e.constant;
    case 'list': return e.items.every(isConst);
    case 'call': return e.constable && e.positional.every(isConst) && e.named.every(([, v]) => isConst(v));
    case 'method':
    case 'lambda':
    default: return false;
  }
}

function pad(n) {
  return '  '.repeat(n);
}

/** Prints [e] at [indent]; [inConst] when an enclosing expression is const. */
export function print(e, indent = 0, inConst = false) {
  if (e === null) return 'null';
  if (typeof e === 'number') return dNum(e);
  if (typeof e === 'boolean') return String(e);
  switch (e.kind) {
    case 'str': return dString(e.value);
    case 'raw': return e.code;
    case 'list': {
      const constant = isConst(e) && e.items.length > 0;
      const prefix = constant && !inConst ? 'const ' : '';
      const items = e.items.map((item) => print(item, indent + 1, inConst || constant));
      const flat = `${prefix}[${items.join(', ')}]`;
      if (!items.some((i) => i.includes('\n')) && pad(indent).length + flat.length <= WIDTH && items.length <= 4) return flat;
      return `${prefix}[\n${items.map((i) => `${pad(indent + 1)}${i},`).join('\n')}\n${pad(indent)}]`;
    }
    case 'method': {
      const target = print(e.target, indent, inConst);
      const args = e.positional.map((p) => print(p, indent + 1, inConst));
      return `${target}.${e.name}(${args.join(', ')})`;
    }
    case 'lambda':
      return `(${e.params.join(', ')}) => ${print(e.body, indent, false)}`;
    case 'call': {
      const constant = isConst(e);
      const prefix = constant && !inConst ? 'const ' : '';
      const inner = inConst || constant;
      const args = [
        ...e.positional.map((p) => print(p, indent + 1, inner)),
        ...e.named.map(([k, v]) => `${k}: ${print(v, indent + 1, inner)}`),
      ];
      const flat = `${prefix}${e.name}(${args.join(', ')})`;
      if (!args.some((a) => a.includes('\n')) && pad(indent).length + flat.length <= WIDTH) return flat;
      return `${prefix}${e.name}(\n${args.map((a) => `${pad(indent + 1)}${a},`).join('\n')}\n${pad(indent)})`;
    }
    default:
      throw new Error(`Unknown Dart expression: ${JSON.stringify(e).slice(0, 80)}`);
  }
}

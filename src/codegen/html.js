// Reference HTML + Tailwind: the React markup as a static page fragment.
// Every element, class and attribute is the same, so it draws the same.
import { toReactTailwind } from './react.js';
import { tokenize } from './runs.js';

const VOID = new Set(['img', 'input', 'br', 'hr', 'source', 'meta', 'link']);
const ATTR_NAMES = { className: 'class', htmlFor: 'for' };

/** Text for HTML content: only what would start markup is escaped. */
function escapeText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * An attribute value for a double-quoted HTML attribute. An ampersand is
 * escaped only where it could start a character reference, so classes
 * like [&>*]:pointer-events-auto stay as written for Tailwind's scanner.
 */
function escapeAttr(s) {
  return String(s).replace(/&(?=[A-Za-z0-9#])/g, '&amp;').replace(/"/g, '&quot;');
}

/** JSX children text ("raw", {"json"}) as the string it renders. */
function jsxString(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '{') {
      const end = text.indexOf('}', i);
      const inner = text.slice(i + 1, end);
      // Expressions here are JSON strings: find the closing brace after it.
      if (inner.startsWith('"')) {
        let j = i + 1;
        for (j++; j < text.length && text[j] !== '"'; j++) if (text[j] === '\\') j++;
        out += JSON.parse(text.slice(i + 1, j + 1));
        i = j + 2;
        continue;
      }
    }
    out += text[i++];
  }
  return out;
}

/** A style={{ ... }} object as a CSS declaration list. */
function styleString(value, urls) {
  const body = value.slice(2, -2);
  const out = [];
  for (const m of body.matchAll(/(\w+):\s*("(?:[^"\\]|\\.)*"|`[^`]*`)/g)) {
    const prop = m[1].replace(/^Webkit/, '-webkit-').replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^-webkit--/, '-webkit-');
    const v = m[2].startsWith('"') ? JSON.parse(m[2]) : m[2].slice(1, -1).replace(/\$\{(\w+)\}/g, (s, id) => urls.get(id) || id);
    out.push(`${prop}: ${v}`);
  }
  return out.join('; ');
}

function attrHtml(name, value, urls) {
  if (name === 'key') return '';
  const html = ATTR_NAMES[name] || name;
  if (name === 'style') return ` style="${escapeAttr(styleString(value, urls))}"`;
  if (value.startsWith('"')) return ` ${html}="${escapeAttr(value.slice(1, -1))}"`;
  const inner = value.slice(1, -1);
  if (inner === 'true') return ` ${html}`;
  if (inner === 'false') return '';
  if (inner.startsWith('"')) return ` ${html}="${escapeAttr(JSON.parse(inner))}"`;
  if (urls.has(inner)) return ` ${html}="${escapeAttr(urls.get(inner))}"`;
  throw new Error(`no HTML for the attribute ${name}=${value}`);
}

function lineHtml(line, urls) {
  const { indent, tokens } = tokenize(line);
  const body = tokens.map((k) => {
    if (k.text !== undefined) {
      if (/^\{\/\*.*\*\/\}$/.test(k.text.trim())) return `<!-- ${k.text.trim().slice(3, -3).trim().replace(/--/g, '- -')} -->`;
      return escapeText(jsxString(k.text));
    }
    const { tag, attrs, close, self } = k.tag;
    if (close) return `</${tag}>`;
    const a = attrs.map((x) => attrHtml(x.name, x.value, urls)).join('');
    if (self) return VOID.has(tag) ? `<${tag}${a}>` : `<${tag}${a}></${tag}>`;
    return `<${tag}${a}>`;
  }).join('');
  return `${' '.repeat(indent)}${body}`;
}

const TEXT_TAGS = /^<(p|h[1-6])[\s>]/;

/**
 * HTML lines for JSX [lines]. A paragraph's content goes on its opening
 * line: JSX drops the line breaks and indentation around text, HTML keeps
 * them, and preserved white space would show them.
 */
function inlineText(lines, urls) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.length - line.trimStart().length;
    const body = line.trimStart();
    const tag = TEXT_TAGS.exec(body);
    if (tag && !body.endsWith('/>') && !body.includes(`</${tag[1]}>`)) {
      const close = `${' '.repeat(indent)}</${tag[1]}>`;
      const end = lines.indexOf(close, i + 1);
      if (end > i) {
        // Only the source indentation goes; decoded text keeps its spaces and breaks.
        const content = lines.slice(i + 1, end).map((l) => lineHtml(l.trimStart(), urls)).join('');
        out.push(`${lineHtml(line, urls)}${content}</${tag[1]}>`);
        i = end;
        continue;
      }
    }
    out.push(lineHtml(line, urls));
  }
  return out;
}

/**
 * Returns what toReactTailwind does, with [code] as an HTML fragment (the
 * root element and everything in it) and the asset URLs written in place.
 * Assets resolve relative to the page ('assets/figma/logo.svg') with
 * [assetDir]. Code Connect is not used: HTML has no components.
 */
export function toHtmlTailwind(root, assets, { screen, assetDir = null } = {}) {
  const result = toReactTailwind(root, assets, { screen, assetDir, repeats: false, textStyles: false });
  const urls = new Map();
  const files = {};
  for (const [id, url] of Object.entries(result.assets)) {
    const relative = assetDir ? url.replace(/^\//, '') : url;
    urls.set(id, relative);
  }
  for (const [file, entry] of Object.entries(result.files)) {
    files[file] = { ...entry, url: entry.url.replace(/^\//, '') };
  }
  const lines = result.code.split('\n');
  const start = lines.indexOf('  return (') + 1;
  const end = lines.lastIndexOf('  );');
  const markup = inlineText(lines.slice(start, end).map((l) => l.slice(4)), urls);
  return {
    ...result,
    code: [`<!-- ${result.componentName} -->`, ...markup].join('\n'),
    assets: Object.fromEntries(urls),
    files,
  };
}

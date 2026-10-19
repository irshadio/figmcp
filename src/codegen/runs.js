// Runs of repeated siblings (cards, list rows, chips): three or more
// neighbours whose markup differs only in content become a data array and
// one .map() template. The markup the template renders is the same, so the
// page looks the same.

// Attributes that may differ from item to item; anything else, classes
// included, must be equal.
const CONTENT_ATTRS = new Set(['data-name', 'data-node-id', 'data-variant', 'data-interactions', 'data-text-style',
  'src', 'alt', 'href', 'placeholder', 'aria-label']);
const FIELD_NAMES = {
  'data-node-id': 'id', 'data-name': 'name', 'data-variant': 'variant', 'data-interactions': 'interactions',
  'data-text-style': 'textStyle', src: 'image', alt: 'alt', href: 'href', placeholder: 'placeholder', 'aria-label': 'label',
};
const MIN_RUN = 3;
// Classes that follow an item's content (a text's width), so they may differ.
const CONTENT_SIZE = /^(min-w|max-w|w|min-h|h)-\[[\d.]+px\]$/;

/** The value of a JSX attribute or expression starting at [i]: its end index. */
function valueEnd(s, i) {
  if (s[i] === '"') return s.indexOf('"', i + 1) + 1;
  if (s[i] !== '{') return -1;
  let depth = 0;
  let quote = null;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (quote) {
      if (c === '\\') j++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return j + 1;
  }
  return -1;
}

/** A tag at [i]: { tag, attrs: [{ name, value }], close, self, end }, or null. */
function parseTag(s, i) {
  const m = /^<(\/?)([A-Za-z][\w.]*)/.exec(s.slice(i));
  if (!m) return null;
  let j = i + m[0].length;
  const attrs = [];
  for (;;) {
    while (s[j] === ' ') j++;
    if (s.startsWith('/>', j)) return { tag: m[2], attrs, close: false, self: true, end: j + 2 };
    if (s[j] === '>') return { tag: m[2], attrs, close: Boolean(m[1]), self: false, end: j + 1 };
    const name = /^[A-Za-z_][-\w:.]*/.exec(s.slice(j));
    if (!name || s[j + name[0].length] !== '=') return null;
    const start = j + name[0].length + 1;
    const end = valueEnd(s, start);
    if (end < 0) return null;
    attrs.push({ name: name[0], value: s.slice(start, end) });
    j = end;
  }
}

/** A line as tokens: { tag } elements and { text } runs between them. */
export function tokenize(line) {
  const body = line.trimStart();
  const tokens = [];
  let text = '';
  for (let i = 0; i < body.length;) {
    if (body[i] === '<') {
      const tag = parseTag(body, i);
      if (tag) {
        if (text) tokens.push({ text });
        text = '';
        tokens.push({ tag });
        i = tag.end;
        continue;
      }
    }
    if (body[i] === '{') {
      const end = valueEnd(body, i);
      if (end > 0) {
        text += body.slice(i, end);
        i = end;
        continue;
      }
    }
    text += body[i++];
  }
  if (text) tokens.push({ text });
  return { indent: line.length - body.length, tokens };
}

/** JSX children text as the string it renders: raw text and {"..."} pieces. */
function decodeText(text) {
  let out = '';
  for (let i = 0; i < text.length;) {
    if (text[i] === '{') {
      const end = valueEnd(text, i);
      const inner = text.slice(i + 1, end - 1);
      if (!/^"/.test(inner)) return null;
      out += JSON.parse(inner);
      i = end;
    } else out += text[i++];
  }
  return out;
}

/** An attribute value as data: a string, or an expression (an image constant). */
function decodeAttr(value) {
  if (value.startsWith('"')) return { string: value.slice(1, -1) };
  const inner = value.slice(1, -1);
  if (/^"/.test(inner)) return { string: JSON.parse(inner) };
  if (/^[A-Za-z_$][\w$]*$/.test(inner)) return { expr: inner };
  return null;
}

/**
 * The content slots of [chunks] (each a child's lines) when they share one
 * template: [{ line, token, attr?, kind }], or null.
 */
function slotsOf(chunks) {
  const parsed = chunks.map((lines) => lines.map(tokenize));
  const first = parsed[0];
  if (parsed.some((p) => p.length !== first.length)) return null;
  const slots = [];
  for (let l = 0; l < first.length; l++) {
    const lines = parsed.map((p) => p[l]);
    if (lines.some((x) => x.indent !== lines[0].indent || x.tokens.length !== lines[0].tokens.length)) return null;
    for (let t = 0; t < lines[0].tokens.length; t++) {
      const tokens = lines.map((x) => x.tokens[t]);
      const head = tokens[0];
      if (head.text !== undefined) {
        if (tokens.some((k) => k.text === undefined)) return null;
        if (tokens.every((k) => k.text === head.text)) continue;
        if (tokens.some((k) => decodeText(k.text) === null)) return null;
        slots.push({ line: l, token: t, kind: 'text', values: tokens.map((k) => ({ string: decodeText(k.text) })) });
        continue;
      }
      if (tokens.some((k) => !k.tag || k.tag.tag !== head.tag.tag || k.tag.close !== head.tag.close ||
        k.tag.self !== head.tag.self || k.tag.attrs.length !== head.tag.attrs.length)) return null;
      for (let a = 0; a < head.tag.attrs.length; a++) {
        const attrs = tokens.map((k) => k.tag.attrs[a]);
        if (attrs.some((x) => x.name !== attrs[0].name)) return null;
        if (attrs.every((x) => x.value === attrs[0].value)) continue;
        if (attrs[0].name === 'className') {
          const lists = attrs.map((x) => (x.value.startsWith('"') ? x.value.slice(1, -1).split(' ') : null));
          if (lists.some((c) => !c || c.length !== lists[0].length)) return null;
          for (let c = 0; c < lists[0].length; c++) {
            const col = lists.map((list) => list[c]);
            if (col.every((x) => x === col[0])) continue;
            if (!col.every((x) => CONTENT_SIZE.test(x)) || col.some((x) => x.split('-[')[0] !== col[0].split('-[')[0])) return null;
            // These classes go in a template literal, which would read escapes.
            if (lists[0].some((x) => /[\\`$]/.test(x))) return null;
            slots.push({ line: l, token: t, attr: a, cls: c, kind: col[0].split('-[')[0], values: col.map((x) => ({ string: x })) });
          }
          continue;
        }
        if (!CONTENT_ATTRS.has(attrs[0].name)) return null;
        const values = attrs.map((x) => decodeAttr(x.value));
        if (values.some((v) => !v)) return null;
        slots.push({ line: l, token: t, attr: a, kind: attrs[0].name, values });
      }
    }
  }
  return { parsed, slots };
}

function render(tokens) {
  return tokens.map((k) => {
    if (k.text !== undefined) return k.text;
    const { tag, attrs, close, self } = k.tag;
    if (close) return `</${tag}>`;
    return `<${tag}${attrs.map((a) => ` ${a.name}=${a.value}`).join('')}${self ? ' />' : '>'}`;
  }).join('');
}

/**
 * Lines with the run [chunks] written as [name].map(...) at [indent], and
 * the data array: { lines, data } where data is the declaration's lines.
 */
function template(chunks, name, indent) {
  const { parsed, slots } = slotsOf(chunks);
  const first = parsed[0];
  const used = new Map();
  const field = (kind) => {
    const base = kind === 'text' ? 'text' : FIELD_NAMES[kind] || kind.replace(/-(\w)/g, (m, c) => c.toUpperCase());
    const n = (used.get(base) || 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}${n}`;
  };
  // A slot holding the same values as an earlier one (a layer named after
  // its text) reads that field instead of adding its own.
  const same = (a, b) => a.values.every((v, i) => v.string === b.values[i].string && v.expr === b.values[i].expr);
  const fields = [];
  for (const slot of slots) {
    const twin = fields.find((f) => same(f, slot));
    fields.push({ ...slot, field: twin ? twin.field : field(slot.kind), twin: Boolean(twin) });
  }
  const idSlot = fields.find((f) => f.kind === 'data-node-id' && f.line === 0);
  const pad = ' '.repeat(indent);
  const lines = first.map((line, l) => {
    const tokens = line.tokens.map((k, t) => {
      const here = fields.filter((f) => f.line === l && f.token === t);
      if (!here.length) return k;
      if (k.text !== undefined) return { text: `{item.${here[0].field}}` };
      const attrs = k.tag.attrs.map((a, i) => {
        const classes = here.filter((x) => x.attr === i && x.cls !== undefined);
        if (classes.length) {
          // The classes that follow the content come from the item.
          const list = a.value.slice(1, -1).split(' ').map((c, n) => {
            const f = classes.find((x) => x.cls === n);
            return f ? `\${item.${f.field}}` : c;
          });
          return { name: a.name, value: `{\`${list.join(' ')}\`}` };
        }
        const f = here.find((x) => x.attr === i);
        return f ? { name: a.name, value: `{item.${f.field}}` } : a;
      });
      return { tag: { ...k.tag, attrs } };
    });
    // The item's root element is keyed by its node id.
    if (l === 0) tokens[0] = { tag: { ...tokens[0].tag, attrs: [{ name: 'key', value: `{item.${idSlot.field}}` }, ...tokens[0].tag.attrs] } };
    return `${pad}  ${' '.repeat(Math.max(0, line.indent - indent))}${render(tokens)}`;
  });
  const literal = (v) => (v.expr !== undefined ? v.expr : JSON.stringify(v.string));
  const data = [
    `const ${name} = [`,
    ...chunks.map((c, i) => `  { ${fields.filter((f) => !f.twin).map((f) => `${f.field}: ${literal(f.values[i])}`).join(', ')} },`),
    '];',
  ];
  return {
    lines: [`${pad}{${name}.map((item) => (`, ...lines, `${pad}))}`],
    data,
  };
}

/**
 * Rewrites [chunks] (consecutive children's lines, at [indent] spaces):
 * every run of at least three that share a template becomes a .map().
 * [nameFor] gives the array a name. Returns { lines, arrays }.
 */
export function collapseRuns(chunks, indent, nameFor) {
  const lines = [];
  const arrays = [];
  for (let i = 0; i < chunks.length;) {
    let j = i + 1;
    while (j < chunks.length && slotsOf(chunks.slice(i, j + 1))) j++;
    const run = chunks.slice(i, j);
    if (run.length >= MIN_RUN && slotsOf(run).slots.some((s) => s.kind === 'data-node-id')) {
      const out = template(run, nameFor(), indent);
      lines.push(...out.lines);
      arrays.push(out.data);
      i = j;
    } else {
      lines.push(...chunks[i]);
      i++;
    }
  }
  return { lines, arrays };
}

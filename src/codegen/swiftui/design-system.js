// Merging a screen's DesignSystem.swift into the one a project already has:
// the project's text is kept as it is, and only what it lacks is added.

// Enums of design values, one member per line.
const VALUE_ENUMS = ['AppFonts', 'DesignTokens'];

/** Top-level blocks of a generated DesignSystem.swift (after `import SwiftUI`), with their doc comments. */
function blocks(text) {
  return text.replace(/^import SwiftUI\s*/, '').split(/\n\n(?=(?:\/\/\/|struct|enum|extension|final|class)\b)/)
    .map((b) => b.trim()).filter(Boolean);
}

/**
 * What a block declares: an enum, struct or class name, or for an
 * extension `extension Type.member` with its first member's name.
 */
function declared(block) {
  const code = block.split('\n').filter((l) => !l.trim().startsWith('///')).join('\n');
  const type = /^(?:struct|enum|final class|class)\s+(\w+)/m.exec(code);
  if (type) return type[1];
  const ext = /^extension\s+(\w+)/m.exec(code);
  const member = /\b(?:init\((\w+):|func\s+(\w+)|(?:static\s+)?(?:var|let)\s+(\w+))/.exec(code);
  return ext ? `extension ${ext[1]}.${member ? member[1] || member[2] || member[3] : ''}` : code.split('\n')[0];
}

/** Whether [existing] already declares what [name] (from declared()) names. */
function has(existing, name) {
  if (!name.startsWith('extension ')) return new RegExp(`\\b(struct|enum|class|typealias)\\s+${name}\\b`).test(existing);
  const [type, member] = name.slice('extension '.length).split('.');
  return new RegExp(`extension\\s+${type}\\b[^{]*\\{[\\s\\S]*?\\b(init\\(${member}:|func\\s+${member}\\b|(var|let)\\s+${member}\\b)`).test(existing);
}

/** The `static let name ... = value` members of the enum [name] in [text]: Map name -> { line, value }. */
function members(text, name) {
  const out = new Map();
  const start = new RegExp(`(?:^|\\n)\\s*(?:public\\s+)?enum\\s+${name}\\b[^{]*\\{`).exec(text);
  if (!start) return out;
  let depth = 1;
  let i = start.index + start[0].length;
  const begin = i;
  for (; i < text.length && depth; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
  }
  for (const line of text.slice(begin, i - 1).split('\n')) {
    const m = /static\s+(?:let|var)\s+(\w+)(?:\s*:\s*[\w.]+)?\s*=\s*(.*?)(\s*\/\/.*)?$/.exec(line.trim());
    if (m) out.set(m[1], { line: line.replace(/^\s+/, '  '), value: m[2].trim() });
  }
  return out;
}

/** [text] with [lines] added at the end of the enum [name]. */
function addToEnum(text, name, lines) {
  const start = new RegExp(`(?:^|\\n)\\s*(?:public\\s+)?enum\\s+${name}\\b[^{]*\\{`).exec(text);
  let depth = 1;
  let i = start.index + start[0].length;
  for (; i < text.length && depth; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
  }
  const close = i - 1;
  const before = text.slice(0, close).replace(/\s*$/, '\n');
  return `${before}${lines.join('\n')}\n${text.slice(close)}`;
}

/**
 * [existing] (the project's DesignSystem.swift) with what [generated] (a
 * screen's) declares and it lacks: { text, added, conflicts }. Tokens and
 * fonts go into the project's enums; helpers it lacks are appended. A value
 * the project names differently is left as it is and listed in conflicts.
 */
export function mergeDesignSystem(existing, generated) {
  let text = existing.endsWith('\n') ? existing : `${existing}\n`;
  const added = [];
  const conflicts = [];
  for (const block of blocks(generated)) {
    const name = declared(block);
    if (VALUE_ENUMS.includes(name)) {
      const ours = members(block, name);
      if (!new RegExp(`enum\\s+${name}\\b`).test(text)) {
        text = `${text}\n${block}\n`;
        added.push(...[...ours.keys()].map((k) => `${name}.${k}`));
        continue;
      }
      const theirs = members(text, name);
      const missing = [];
      for (const [key, m] of ours) {
        if (!theirs.has(key)) {
          missing.push(m.line);
          added.push(`${name}.${key}`);
        } else if (theirs.get(key).value !== m.value) {
          conflicts.push(`${name}.${key} is ${theirs.get(key).value} in the project and ${m.value} in this screen`);
        }
      }
      if (missing.length) text = addToEnum(text, name, missing);
    } else if (!has(text, name)) {
      text = `${text}\n${block}\n`;
      added.push(name.replace(/^extension (\w+)\.(\w+)$/, '$1.$2'));
    }
  }
  return { text, added, conflicts };
}

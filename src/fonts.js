// Names read from font files (TrueType and OpenType), so generated code can
// name a face as the platform registers it.
import fs from 'node:fs';
import path from 'node:path';
import { faceKey } from './codegen/swiftui/text.js';
import { DATA_DIR } from './store.js';

const FAMILY = 1;
const SUBFAMILY = 2;
const POSTSCRIPT = 6;
const TYPOGRAPHIC_FAMILY = 16;
const TYPOGRAPHIC_SUBFAMILY = 17;

/** The name records of the sfnt in [buf] at [offset]: Map id -> string (Windows English first, then Mac Roman). */
function nameRecords(buf, offset) {
  const tables = buf.readUInt16BE(offset + 4);
  let table = -1;
  for (let i = 0; i < tables; i++) {
    const rec = offset + 12 + i * 16;
    if (buf.toString('latin1', rec, rec + 4) === 'name') table = buf.readUInt32BE(rec + 8);
  }
  if (table < 0) return new Map();
  const count = buf.readUInt16BE(table + 2);
  const strings = table + buf.readUInt16BE(table + 4);
  const out = new Map();
  const rank = new Map();
  for (let i = 0; i < count; i++) {
    const r = table + 6 + i * 12;
    const platform = buf.readUInt16BE(r);
    const language = buf.readUInt16BE(r + 4);
    const id = buf.readUInt16BE(r + 6);
    const length = buf.readUInt16BE(r + 8);
    const start = strings + buf.readUInt16BE(r + 10);
    let value;
    let score;
    if (platform === 3 && (language & 0x3ff) === 0x09) {
      const bytes = Buffer.from(buf.subarray(start, start + length));
      value = bytes.swap16().toString('utf16le');
      score = 2;
    } else if (platform === 1 && language === 0) {
      value = buf.toString('latin1', start, start + length);
      score = 1;
    } else continue;
    if ((rank.get(id) || 0) < score) {
      out.set(id, value);
      rank.set(id, score);
    }
  }
  return out;
}

/** The faces in the font file [file]: [{ family, style, postScript }], empty when it cannot be read. */
export function fontFaces(file) {
  try {
    const buf = fs.readFileSync(file);
    const tag = buf.toString('latin1', 0, 4);
    const offsets = tag === 'ttcf'
      ? Array.from({ length: buf.readUInt32BE(8) }, (_, i) => buf.readUInt32BE(12 + i * 4))
      : [0];
    return offsets.map((o) => {
      const n = nameRecords(buf, o);
      return {
        family: n.get(TYPOGRAPHIC_FAMILY) || n.get(FAMILY),
        style: n.get(TYPOGRAPHIC_SUBFAMILY) || n.get(SUBFAMILY),
        legacyFamily: n.get(FAMILY),
        legacyStyle: n.get(SUBFAMILY),
        postScript: n.get(POSTSCRIPT),
      };
    }).filter((f) => f.family && f.postScript);
  } catch {
    return [];
  }
}

/**
 * faceKey(family, style) -> PostScript name, for the font [files]. Earlier
 * files win, so a project's own fonts come first.
 */
export function fontFaceMap(files) {
  const map = new Map();
  for (const file of files) {
    for (const f of fontFaces(file)) {
      for (const key of [faceKey(f.family, f.style), faceKey(f.legacyFamily, f.legacyStyle)]) {
        if (!map.has(key)) map.set(key, f.postScript);
      }
    }
  }
  return map;
}

const SKIPPED_DIRS = new Set(['node_modules', '.git', 'build', 'DerivedData', 'Pods', '.build', '.swiftpm', 'Carthage']);

/** The .ttf, .otf and .ttc files under [dir], [limit] at most, skipping build and dependency folders. */
export function fontFilesUnder(dir, limit = 400) {
  const out = [];
  let dirs = 0;
  const walk = (d, depth) => {
    if (depth > 8 || out.length >= limit || ++dirs > 5000) return;
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= limit) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!SKIPPED_DIRS.has(e.name) && !e.name.startsWith('.')) walk(p, depth + 1);
      } else if (/\.(ttf|otf|ttc)$/i.test(e.name)) out.push(p);
    }
  };
  walk(dir, 0);
  return out;
}

let cached = null;

/**
 * The face map of the project in the working directory and of the fonts
 * downloaded for checks, read again after a minute.
 */
export function projectFontFaces() {
  const cwd = process.cwd();
  if (cached && cached.cwd === cwd && Date.now() - cached.at < 60000) return cached.map;
  const map = fontFaceMap([...fontFilesUnder(cwd), ...fontFilesUnder(path.join(DATA_DIR, 'fonts'))]);
  cached = { cwd, at: Date.now(), map };
  return map;
}

// Font files for the render checks: found by family in font folders, or
// downloaded from Google Fonts into the data folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DATA_DIR } from '../src/store.js';

export const FONT_CACHE = path.join(DATA_DIR, 'fonts');
export const SYSTEM_FONTS = [
  path.join(os.homedir(), 'Library/Fonts'), '/Library/Fonts', '/System/Library/Fonts',
  path.join(os.homedir(), '.fonts'), path.join(os.homedir(), '.local/share/fonts'), '/usr/share/fonts',
  path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'),
];
export const STYLE_NAMES = {
  100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium',
  600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black',
};
const STYLE_TAIL = /^(display|text)?(thin|hairline|extralight|ultralight|light|regular|book|normal|medium|semibold|demibold|bold|extrabold|ultrabold|black|heavy)?(italic|oblique)?(\d{3})?(i)?$/;
const WEIGHTS = [
  [/thin|hairline/, 100], [/extralight|ultralight/, 200], [/semibold|demibold/, 600],
  [/extrabold|ultrabold/, 800], [/light/, 300], [/medium/, 500], [/bold/, 700],
  [/black|heavy/, 900],
];

function norm(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Every .ttf / .otf under [dirs]: [{ file, stem }] with the name normalised. */
export function fontFiles(dirs, exts = /\.(ttf|otf)$/i) {
  const out = [];
  for (const dir of dirs) {
    if (!dir || !fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir, { recursive: true })) {
      if (exts.test(file)) out.push({ file: path.join(dir, file), stem: norm(path.basename(file).replace(exts, '')) });
    }
  }
  return out;
}

/**
 * Font files of [family]: file names made of the family and a style
 * (Inter-SemiBold.ttf, SF-Pro-Display-Medium.otf, Onest-600.ttf). Static
 * files win over variable ones, which some renderers draw at one weight.
 */
export function familyFiles(family, files) {
  const key = norm(family);
  const hits = files.filter((f) => f.stem.startsWith(key) && STYLE_TAIL.test(f.stem.slice(key.length)));
  const statics = hits.filter((f) => f.stem.slice(key.length) !== '' && !/variable|vf|wght/.test(f.stem));
  const chosen = statics.length ? statics : hits;
  const seen = new Set();
  return chosen.filter((f) => !seen.has(f.stem) && seen.add(f.stem)).map((f) => f.file);
}

/**
 * { weight, italic } of a font file of [family] from its name; a variable
 * file covers every weight ('100 900').
 */
export function faceOf(family, file) {
  const tail = norm(path.basename(file).replace(/\.[a-z0-9]+$/i, '')).slice(norm(family).length);
  const italic = /italic|oblique/.test(tail) || /\d{3}i$/.test(tail);
  if (/variable|vf|wght/.test(tail)) return { weight: '100 900', italic };
  const numeric = /(\d{3})/.exec(tail);
  if (numeric) return { weight: numeric[1], italic };
  const named = WEIGHTS.find(([re]) => re.test(tail.replace(/italic|oblique/, '')));
  return { weight: String(named ? named[1] : 400), italic };
}

export async function fetchGoogleFont(family) {
  const dir = path.join(FONT_CACHE, family.replace(/[^A-Za-z0-9]+/g, '_'));
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) return;
  const weights = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  const query = `family=${encodeURIComponent(family)}:ital,wght@${[0, 1].flatMap((i) => weights.map((w) => `${i},${w}`)).join(';')}`;
  let res = await fetch(`https://fonts.googleapis.com/css2?${query}`, { signal: AbortSignal.timeout(20000) });
  // Families without every weight or italics reject the full axis list.
  if (!res.ok) res = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) return;
  const css = await res.text();
  const faces = [...css.matchAll(/font-style:\s*(\w+);\s*font-weight:\s*(\d+);[^}]*?url\(([^)]+\.ttf)\)/g)];
  if (!faces.length) return;
  fs.mkdirSync(dir, { recursive: true });
  for (const [, style, weight, url] of faces) {
    // Family-Style names, as font folders use (Onest-SemiBold.ttf).
    const name = style === 'italic' ? (weight === '400' ? 'Italic' : `${STYLE_NAMES[weight]}Italic`) : STYLE_NAMES[weight];
    const file = path.join(dir, `${family.replace(/\s+/g, '')}-${name || weight}.ttf`);
    const bytes = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(30000) })).arrayBuffer());
    fs.writeFileSync(file, bytes);
  }
}

let axesCache = null;

/** Google Fonts' axes of [family] ([{ tag, min, max }]), or null. */
async function googleAxes(family) {
  if (!axesCache) {
    const file = path.join(FONT_CACHE, 'google-axes.json');
    try {
      axesCache = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      const res = await fetch('https://fonts.google.com/metadata/fonts', { signal: AbortSignal.timeout(30000) });
      if (!res.ok) return null;
      const text = await res.text();
      const list = JSON.parse(text.slice(text.indexOf('{'))).familyMetadataList || [];
      axesCache = Object.fromEntries(list.filter((f) => f.axes && f.axes.length).map((f) => [f.family, f.axes]));
      fs.mkdirSync(FONT_CACHE, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(axesCache));
    }
  }
  return axesCache[family] || null;
}

/** Whether the font file [bytes] has variation axes (an fvar table). */
export function hasAxes(bytes) {
  if (bytes.length < 12) return false;
  const tables = bytes.readUInt16BE(4);
  for (let i = 0; i < tables && 12 + i * 16 + 4 <= bytes.length; i++) {
    if (bytes.toString('latin1', 12 + i * 16, 12 + i * 16 + 4) === 'fvar') return true;
  }
  return false;
}

/** hasAxes for a font file, reading only its table directory. */
function fileHasAxes(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(12 + 64 * 16);
    return hasAxes(head.subarray(0, fs.readSync(fd, head, 0, head.length, 0)));
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Downloads the variable font of [family] (all its axes) from the Google
 * Fonts repository. The CSS API sends one static instance per axis value to
 * clients it does not know, which would draw every weight and width alike.
 */
export async function fetchVariableFont(family) {
  const dir = path.join(FONT_CACHE, `${family.replace(/[^A-Za-z0-9]+/g, '_')}_variable`);
  const file = path.join(dir, `${family.replace(/\s+/g, '')}-Variable.ttf`);
  if (fs.existsSync(file) && fileHasAxes(file)) return;
  const axes = await googleAxes(family);
  if (!axes) return;
  const tags = axes.map((a) => a.tag).sort((a, b) => (a < b ? -1 : 1)).join(',');
  const name = `${family.replace(/\s+/g, '')}%5B${tags}%5D.ttf`;
  const folder = family.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const licence of ['ofl', 'apache', 'ufl']) {
    const res = await fetch(`https://raw.githubusercontent.com/google/fonts/main/${licence}/${folder}/${name}`, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) continue;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!hasAxes(bytes)) return;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, bytes);
    return;
  }
}

/** The variable font files of [family] among [files]. */
function variableFiles(family, files) {
  const key = norm(family);
  return files.filter((f) => f.stem.startsWith(key) && /variable|vf|wght/.test(f.stem.slice(key.length)))
    .map((f) => f.file).filter(fileHasAxes);
}

/**
 * { family: [files] } for the [used] families, from [dirs], the system font
 * folders and the download cache; [fetch] downloads missing Google Fonts.
 * Families in [variable] (their design sets axes such as optical size) use
 * a variable font, which honours those axes.
 */
export async function resolveFonts(used, dirs, { fetch: download = false, exts, variable = new Set() } = {}) {
  const all = () => fontFiles([...dirs, ...SYSTEM_FONTS, FONT_CACHE], exts);
  let files = all();
  if (download) {
    let fetched = false;
    for (const family of used) {
      if (familyFiles(family, files).length) continue;
      try {
        await fetchGoogleFont(family);
        fetched = true;
      } catch (e) {
        process.stderr.write(`could not download ${family}: ${e.message}\n`);
      }
    }
    if (fetched) files = all();
  }
  if (download) {
    let fetched = false;
    for (const family of used) {
      if (!variable.has(family) || variableFiles(family, files).length) continue;
      try {
        await fetchVariableFont(family);
        fetched = true;
      } catch (e) {
        process.stderr.write(`could not download the variable ${family}: ${e.message}\n`);
      }
    }
    if (fetched) files = all();
  }
  const out = {};
  for (const family of used) {
    const vf = variable.has(family) ? variableFiles(family, files) : [];
    const hit = vf.length ? vf : familyFiles(family, files);
    if (hit.length) out[family] = hit;
  }
  return out;
}

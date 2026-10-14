// On-disk state shared by every server instance: the proxy secret, saved
// snapshots (frames sent by the plugin or imported from export JSON), and
// assets served over HTTP.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DATA_DIR = process.env.FIGMA_LOCAL_MCP_DIR ||
  path.join(os.homedir(), '.figma-local-mcp');
const SNAPSHOTS = path.join(DATA_DIR, 'snapshots');
export const ASSETS = path.join(DATA_DIR, 'assets');

const ASSET_NAME = /^[a-f0-9]{64}\.(svg|png|jpg|jpeg|gif|webp|pdf)$/;

function ensureDirs() {
  for (const dir of [DATA_DIR, SNAPSHOTS, ASSETS]) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * The value stored in [file], created with [make] the first time. The file
 * appears complete or not at all, so a reader never sees it half written;
 * a value [valid] rejects (an empty file) is replaced.
 */
function storedValue(file, make, valid) {
  ensureDirs();
  for (let attempt = 0; attempt < 5; attempt++) {
    let value = null;
    try {
      value = fs.readFileSync(file, 'utf8').trim();
    } catch { /* not created yet */ }
    if (value !== null && valid(value)) return value;
    const fresh = make();
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tmp, fresh, { mode: 0o600 });
    try {
      if (value === null) fs.linkSync(tmp, file);
      else fs.renameSync(tmp, file);
    } catch {
      // Another instance created it first.
    } finally {
      fs.rmSync(tmp, { force: true });
    }
    // Read back what is on disk, so every instance returns the same value.
  }
  const last = fs.readFileSync(file, 'utf8').trim();
  if (valid(last)) return last;
  throw new Error(`Could not create ${file}`);
}

export function secret() {
  return storedValue(path.join(DATA_DIR, 'secret'),
    () => crypto.randomBytes(32).toString('hex'), (v) => /^[a-f0-9]{64}$/.test(v));
}

const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** The code the plugin must present, e.g. 'K7QM-2XDP' (created once). */
export function pairingCode() {
  return storedValue(path.join(DATA_DIR, 'pairing'), () => {
    const bytes = crypto.randomBytes(8);
    const chars = [...bytes].map((b) => PAIRING_ALPHABET[b % PAIRING_ALPHABET.length]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  }, (v) => /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(v));
}

export function assetPath(name) {
  return ASSET_NAME.test(name) ? path.join(ASSETS, name) : null;
}

/** Saves bytes (or text) under a content hash; returns the file name. */
export function saveAsset(data, ext) {
  ensureDirs();
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const name = crypto.createHash('sha256').update(buffer).digest('hex') +
    '.' + ext;
  const file = path.join(ASSETS, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, buffer);
  return name;
}

export function imageExt(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpg';
  if (buffer.slice(0, 3).toString() === 'GIF') return 'gif';
  if (buffer.slice(8, 12).toString() === 'WEBP') return 'webp';
  return 'png';
}

function snapshotName(data, prefix) {
  const first = data.frames[0];
  const base = data.frames.length === 1
    ? first.name + '_' + first.id
    : 'frames_' + data.frames.map((f) => f.id).join('_');
  return prefix + base.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 120) + '.json';
}

export function validSnapshot(data) {
  return data && Array.isArray(data.frames) && data.frames.length > 0 &&
    data.frames.every((f) => f && f.tree && typeof f.tree.id === 'string');
}

/**
 * Stores a snapshot; the newest copy of a node wins on lookup. [live] marks a
 * cached plugin read, kept apart so it never replaces a saved frame.
 */
export function saveSnapshot(data, { live = false } = {}) {
  if (!validSnapshot(data)) throw new Error('Not a design export: no frames');
  ensureDirs();
  const name = snapshotName(data, live ? 'live_' : '');
  const tmp = path.join(SNAPSHOTS, '.' + name + '.' + process.pid);
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, path.join(SNAPSHOTS, name));
  return name;
}

export function importFile(file) {
  return saveSnapshot(JSON.parse(fs.readFileSync(file, 'utf8')));
}

// id -> [{ name, frameIndex }] for every node in every snapshot, newest first.
let index = null;
let indexStamp = '';
const loaded = new Map();

function stamp(files) {
  return files.map((f) => f.name + ':' + f.mtime).join('|');
}

function listSnapshots() {
  ensureDirs();
  return fs.readdirSync(SNAPSHOTS)
    .filter((n) => n.endsWith('.json') && !n.startsWith('.'))
    .map((name) => ({
      name,
      mtime: fs.statSync(path.join(SNAPSHOTS, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
}

function load(name) {
  const file = path.join(SNAPSHOTS, name);
  const mtime = fs.statSync(file).mtimeMs;
  const cached = loaded.get(name);
  if (cached && cached.mtime === mtime) return cached.data;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  loaded.set(name, { mtime, data });
  return data;
}

function refresh() {
  const files = listSnapshots();
  const next = stamp(files);
  if (index && next === indexStamp) return;
  index = new Map();
  for (const { name } of files) {
    const data = tryLoad(name);
    if (!validSnapshot(data)) continue;
    data.frames.forEach((frame, frameIndex) => {
      const walk = (n) => {
        if (!index.has(n.id)) index.set(n.id, []);
        index.get(n.id).push({ name, frameIndex });
        (n.children || []).forEach(walk);
      };
      walk(frame.tree);
    });
  }
  indexStamp = next;
}

function findIn(tree, id) {
  if (tree.id === id) return tree;
  for (const child of tree.children || []) {
    const hit = findIn(child, id);
    if (hit) return hit;
  }
  return null;
}

/**
 * The newest snapshot holding [id] (with a frame preview when [preview]):
 * the node, its frame, the whole export (for images and the preview) and
 * when it was saved.
 */
// A snapshot that was removed or damaged since it was indexed reads as null.
function tryLoad(name) {
  try {
    return load(name);
  } catch {
    return null;
  }
}

export function findSnapshotNode(id, { preview = false } = {}) {
  refresh();
  const hits = (index.get(id) || []).filter((h) => {
    const data = tryLoad(h.name);
    return data && data.frames[h.frameIndex] && (!preview || data.frames[h.frameIndex].previewPng2x);
  });
  const hit = hits[0];
  if (!hit) return null;
  const data = load(hit.name);
  const frame = data.frames[hit.frameIndex];
  return {
    node: findIn(frame.tree, id),
    frame,
    data,
    snapshot: hit.name,
    exportedAt: data.exportedAt || null,
  };
}

export function snapshotSummary() {
  refresh();
  return listSnapshots().flatMap(({ name }) => {
    const data = tryLoad(name);
    if (!validSnapshot(data)) return [];
    return [{
      snapshot: name,
      exportedAt: data.exportedAt || null,
      fileName: data.fileName || null,
      page: data.page || null,
      frames: data.frames.map((f) => ({ id: f.id, name: f.name })),
    }];
  });
}

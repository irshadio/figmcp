import { PNG } from 'pngjs';

export function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Crops a PNG to the rectangle, clamped to the image. */
export function cropPng(buffer, x, y, width, height) {
  const src = PNG.sync.read(buffer);
  const left = Math.max(0, Math.round(x));
  const top = Math.max(0, Math.round(y));
  const w = Math.min(src.width - left, Math.round(width));
  const h = Math.min(src.height - top, Math.round(height));
  if (w <= 0 || h <= 0) return null;
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(src, out, left, top, w, h, 0, 0);
  return PNG.sync.write(out);
}

/** Box-filter downscale so the longer edge is at most [max] pixels. */
export function fitPng(buffer, max) {
  const src = PNG.sync.read(buffer);
  const factor = Math.max(src.width, src.height) / max;
  if (factor <= 1) return buffer;
  const w = Math.max(1, Math.round(src.width / factor));
  const h = Math.max(1, Math.round(src.height / factor));
  const out = new PNG({ width: w, height: h });
  for (let oy = 0; oy < h; oy++) {
    const y0 = Math.floor(oy * factor);
    const y1 = Math.min(src.height, Math.max(y0 + 1, Math.floor((oy + 1) * factor)));
    for (let ox = 0; ox < w; ox++) {
      const x0 = Math.floor(ox * factor);
      const x1 = Math.min(src.width, Math.max(x0 + 1, Math.floor((ox + 1) * factor)));
      const sum = [0, 0, 0, 0];
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * src.width + sx) * 4;
          for (let c = 0; c < 4; c++) sum[c] += src.data[i + c];
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const o = (oy * w + ox) * 4;
      for (let c = 0; c < 4; c++) out.data[o + c] = Math.round(sum[c] / n);
    }
  }
  return PNG.sync.write(out);
}

/** Natural size of a PNG, JPEG, GIF or WebP image, or null. */
export function imageSize(b) {
  if (b.length < 30) return null;
  if (b[0] === 0x89 && b[1] === 0x50) return pngSize(b);
  if (b.toString('ascii', 0, 3) === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      const sof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (sof) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

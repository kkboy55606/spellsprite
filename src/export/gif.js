// GIF89a encoder: one global palette, 1-bit transparency, LZW, looping.
// Frames are RGBA arrays of w x h; `scale` enlarges by whole numbers.

// Median cut down to n colours. colors: Map(packedRGB -> count).
function medianCut(colors, n) {
  const all = [...colors.entries()].map(([c, k]) => [(c >> 16) & 255, (c >> 8) & 255, c & 255, k]);
  let boxes = [all];
  while (boxes.length < n) {
    let bi = -1, best = -1, bch = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255, hi = 0, total = 0;
        for (const c of b) { if (c[ch] < lo) lo = c[ch]; if (c[ch] > hi) hi = c[ch]; total += c[3]; }
        const score = (hi - lo) * Math.sqrt(total);
        if (score > best) { best = score; bi = i; bch = ch; }
      }
    });
    if (bi < 0 || best <= 0) break;
    const b = boxes[bi].sort((p, q) => p[bch] - q[bch]);
    const half = b.reduce((s, c) => s + c[3], 0) / 2;
    let acc = 0, cut = 1;
    for (let i = 0; i < b.length - 1; i++) { acc += b[i][3]; if (acc >= half) { cut = i + 1; break; } }
    boxes.splice(bi, 1, b.slice(0, cut), b.slice(cut));
  }
  return boxes.map((b) => {
    let r = 0, g = 0, bl = 0, t = 0;
    for (const c of b) { r += c[0] * c[3]; g += c[1] * c[3]; bl += c[2] * c[3]; t += c[3]; }
    return [Math.round(r / t), Math.round(g / t), Math.round(bl / t)];
  });
}

export function lzwEncode(indices, minCode) {
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1, table = new Map();
  const out = [];
  let cur = 0, bits = 0;
  const emit = (code) => {
    cur |= code << bits; bits += size;
    while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = prefix * 256 + k, hit = table.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next === 4096) { emit(clear); table = new Map(); size = minCode + 1; next = eoi + 1; }
    else { if (next >= 1 << size) size++; table.set(key, next++); }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) out.push(cur & 255);
  return out;
}

export function encodeGIF(frames, w, h, { fps = 12, scale = 1, loop = true } = {}) {
  const W = w * scale, H = h * scale;
  const counts = new Map();
  let transparent = false;
  for (const f of frames) for (let i = 0; i < f.length; i += 4) {
    if (f[i + 3] < 128) { transparent = true; continue; }
    const c = (f[i] << 16) | (f[i + 1] << 8) | f[i + 2];
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  const room = transparent ? 255 : 256;
  const palette = counts.size <= room ? [...counts.keys()].map((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]) : medianCut(counts, room);
  const offset = transparent ? 1 : 0;
  const exact = new Map(palette.map((p, i) => [(p[0] << 16) | (p[1] << 8) | p[2], i + offset]));
  const lookup = (c) => {
    let v = exact.get(c);
    if (v !== undefined) return v;
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    let best = 0, bd = Infinity;
    palette.forEach((p, i) => { const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2; if (d < bd) { bd = d; best = i; } });
    v = best + offset;
    exact.set(c, v);
    return v;
  };
  let bitsN = 1;
  while (1 << bitsN < palette.length + offset) bitsN++;
  const tableSize = 1 << bitsN;
  const minCode = Math.max(2, bitsN);

  const bytes = [];
  const u16 = (v) => bytes.push(v & 255, (v >> 8) & 255);
  const str = (s) => { for (const ch of s) bytes.push(ch.charCodeAt(0)); };
  str('GIF89a'); u16(W); u16(H);
  bytes.push(0x80 | 0x70 | (bitsN - 1), 0, 0);
  for (let i = 0; i < tableSize; i++) {
    const p = i < offset ? [0, 0, 0] : palette[i - offset] || [0, 0, 0];
    bytes.push(p[0], p[1], p[2]);
  }
  if (loop) { bytes.push(0x21, 0xff, 0x0b); str('NETSCAPE2.0'); bytes.push(0x03, 0x01, 0, 0, 0); }
  const idx = new Uint8Array(W * H);
  frames.forEach((f, n) => {
    const delay = Math.round(((n + 1) * 100) / fps) - Math.round((n * 100) / fps);
    bytes.push(0x21, 0xf9, 0x04, (transparent ? 2 << 2 : 1 << 2) | (transparent ? 1 : 0));
    u16(Math.max(2, delay)); bytes.push(0, 0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = (Math.floor(y / scale) * w + Math.floor(x / scale)) * 4;
      idx[y * W + x] = f[s + 3] < 128 ? 0 : lookup((f[s] << 16) | (f[s + 1] << 8) | f[s + 2]);
    }
    bytes.push(0x2c); u16(0); u16(0); u16(W); u16(H); bytes.push(0);
    bytes.push(minCode);
    const data = lzwEncode(idx, minCode);
    for (let i = 0; i < data.length; i += 255) {
      const n2 = Math.min(255, data.length - i);
      bytes.push(n2);
      for (let k = 0; k < n2; k++) bytes.push(data[i + k]);
    }
    bytes.push(0);
  });
  bytes.push(0x3b);
  return new Uint8Array(bytes);
}

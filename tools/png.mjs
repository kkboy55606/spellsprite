// Minimal PNG writer for Node tools and tests (RGBA, 8-bit).
import zlib from 'node:zlib';

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Lay frames out on a dark grid, scaled by an integer, for eyeballing.
// rows: [{ label, frames: [Uint8ClampedArray], w, h }], picking `cols` sampled frames each.
export function contactSheet(rows, cols = 8, scale = 2, cell = 0) {
  const cw = cell || Math.max(...rows.map((r) => r.w)), ch = cell || Math.max(...rows.map((r) => r.h));
  const W = cols * (cw * scale + 2) + 2, H = rows.length * (ch * scale + 2) + 2;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { out[i * 4] = 18; out[i * 4 + 1] = 16; out[i * 4 + 2] = 26; out[i * 4 + 3] = 255; }
  rows.forEach((row, ri) => {
    const n = row.frames.length;
    for (let c = 0; c < cols; c++) {
      const f = row.frames[Math.min(n - 1, Math.round((c / Math.max(1, cols - 1)) * (n - 1)))];
      const ox = 2 + c * (cw * scale + 2) + Math.floor((cw - row.w) * scale / 2), oy = 2 + ri * (ch * scale + 2) + Math.floor((ch - row.h) * scale / 2);
      for (let y = 0; y < row.h * scale; y++) for (let x = 0; x < row.w * scale; x++) {
        const sx = Math.floor(x / scale), sy = Math.floor(y / scale), s = (sy * row.w + sx) * 4;
        const X = ox + x, Y = oy + y;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const d = (Y * W + X) * 4;
        if (f[s + 3]) { out[d] = f[s]; out[d + 1] = f[s + 1]; out[d + 2] = f[s + 2]; }
        else if (((sx >> 2) + (sy >> 2)) & 1) { out[d] = 26; out[d + 1] = 24; out[d + 2] = 36; }
      }
    }
  });
  return encodePNG(W, H, out);
}

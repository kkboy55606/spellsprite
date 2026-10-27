// Built-in stage art, drawn by code: a twilight valley, a wizard caster and a
// pudding slime target. Returns plain RGBA so it also runs in Node.

import { makeRng } from '../core/rng.js';
import { hexToRgb } from '../core/color.js';

export const STAGE_W = 384, STAGE_H = 216, FLOOR_Y = 184;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function canvas(w, h) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const set = (x, y, c) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
  };
  return { w, h, rgba, set };
}

function fromMap(rows, legend) {
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  const c = canvas(w, h);
  const pal = Object.fromEntries(Object.entries(legend).map(([k, v]) => [k, hexToRgb(v)]));
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) c.set(x, y, pal[ch]); }));
  return c;
}

const WIZARD = [
  '.........k..........',
  '........khk.........',
  '.......khhk.....kk..',
  '......khhhk....kcck.',
  '......khhhhk..kcCck.',
  '.....khhhhhk..kcCck.',
  '.....kHhhhhhk..kcck.',
  '....kHHhhhhhk...kk..',
  '...kggggggggggk.kNk.',
  '..kkkkssssskkkk.kNk.',
  '.....ksssesk....kNk.',
  '.....kSssssk....kNk.',
  '.....kwwwwwk....kNk.',
  '....kRwwwWwrk...kNk.',
  '...kRRrwWWrrrk.ksNk.',
  '...kRRrrrrrrLkkssnk.',
  '...kRRrrrrrLLsskknk.',
  '...kRRbbbbbbbkk.knk.',
  '...kRRrrrrrLLk..knk.',
  '..kRRRrrrrrLLLk.knk.',
  '..kRRRrrrrrrLLk.knk.',
  '..kRRRrrrrrrLLk.knk.',
  '.kRRRRrrrrrrrLLkknk.',
  '.kRRRRrrrrrrrLLkknk.',
  '.kRRRRrrrrrrrrLk.nk.',
  '.kkRRRRrrrrrrLLkknk.',
  '..kkkkkkkkkkkkkk.nk.',
  '....kffk..kffk..knk.',
  '....kffk..kffk...k..',
  '....kkkk..kkkk......',
];
const WIZARD_PAL = {
  k: '#1a1426', H: '#3b2a6b', h: '#5a43a0', g: '#e8b54a', s: '#f1c59a', S: '#c98c6a', e: '#1a1426',
  w: '#e8e4f0', W: '#b8b0c8', R: '#24346e', r: '#3a56a8', L: '#5a7fd0', b: '#8a5a2a', n: '#7a4a26', N: '#a8703c',
  c: '#8ff4ff', C: '#2fa8d0', f: '#2a1e24',
};

const SLIME = [
  '..........kkkkkk..........',
  '.......kkkCCCCCCkkk.......',
  '.....kkCCCCCwwCCCCCkk.....',
  '....kCCCCCCCCwCCCCCCCk....',
  '...kcCCCCCCCCCCCCCCCcck...',
  '...kccccCCcccCCccccccck...',
  '..kpccpcccppcccpccpcccpk..',
  '..kpppppcpppppcppppcpppk..',
  '.kpppppppppppppppppppppPk.',
  '.kppekppekppppppppppppPPk.',
  '.kppekppekpppppppppppppPk.',
  '.kpppppppppppppppppppppPk.',
  'kppppmmmpppppppppppppPPPPk',
  'kpppppppppppppppppppppPPPk',
  'kPpppppppppppppppppppPPPqk',
  'kPPppppppppppppppppPPPPqqk',
  'kqPPPPpppppppppppPPPPPqqqk',
  '.kqqPPPPPPPPPPPPPPPPPqqqk.',
  '..kkqqqqqqqqqqqqqqqqqqkk..',
  '....kkkkkkkkkkkkkkkkkk....',
];
const SLIME_PAL = { k: '#3a2318', c: '#b86b2c', C: '#e09a48', p: '#f6dfa0', P: '#d9b26c', q: '#b98a4c', w: '#fffaf0', e: '#2a1810', m: '#7a3a2a' };

export function wizard() {
  const c = fromMap(WIZARD, WIZARD_PAL);
  return { ...c, tip: [17, 5] };
}
export function slime() { return fromMap(SLIME, SLIME_PAL); }

// Twilight valley: banded sky, stars, a crescent moon, three ridges, pines and grass.
export function scene(seed = 7) {
  const W = STAGE_W, H = STAGE_H;
  const c = canvas(W, H);
  const rng = makeRng(seed);
  const sky = ['#141632', '#1c1f45', '#2a2858', '#3d2f68', '#5a3a74', '#7d4677', '#a85a72', '#d07a6a'].map(hexToRgb);
  const horizon = 150;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = Math.min(0.999, (y / horizon) ** 1.25) * (sky.length - 1);
    const i = Math.floor(t), f = t - i;
    c.set(x, y, sky[Math.min(sky.length - 1, i + (f > BAYER[(y & 3) * 4 + (x & 3)] ? 1 : 0))]);
  }
  for (let i = 0; i < 70; i++) {
    const x = rng.int(0, W - 1), y = rng.int(0, 95), col = hexToRgb(rng() < 0.3 ? '#c8d0ff' : '#ffffff');
    c.set(x, y, col);
    if (rng() < 0.12) { const d = hexToRgb('#8a90c8'); c.set(x + 1, y, d); c.set(x - 1, y, d); c.set(x, y + 1, d); c.set(x, y - 1, d); }
  }
  const moon = hexToRgb('#f4e7c6'), moonShade = hexToRgb('#d8c49a');
  for (let y = -15; y <= 15; y++) for (let x = -15; x <= 15; x++) {
    const d = Math.hypot(x, y), d2 = Math.hypot(x - 7, y - 4);
    if (d <= 14 && d2 > 12) c.set(306 + x, 42 + y, d > 11 ? moonShade : moon);
  }
  const ridge = (base, amp, col, f1, f2, ph) => {
    const rgb = hexToRgb(col);
    for (let x = 0; x < W; x++) {
      const top = base - amp * (0.55 * Math.sin(x * f1 + ph) + 0.3 * Math.sin(x * f2 + ph * 2.3) + 0.15 * Math.sin(x * f2 * 2.7 + ph));
      for (let y = Math.floor(top); y < H; y++) c.set(x, y, rgb);
    }
  };
  ridge(122, 26, '#3b2d5e', 0.019, 0.047, 1.2);
  ridge(142, 18, '#2b2448', 0.027, 0.071, 3.1);
  ridge(160, 9, '#1f1b38', 0.041, 0.11, 0.4);
  const pine = hexToRgb('#17142b');
  for (let i = 0; i < 26; i++) {
    const x = rng.int(0, W), h = rng.int(14, 30), base = 168 - rng.int(0, 8);
    for (let y = 0; y < h; y++) {
      const half = Math.floor(((y % 6) + 2) * (y / h) * 0.9) + 1;
      for (let dx = -half; dx <= half; dx++) c.set(x + dx, base - h + y, pine);
    }
    c.set(x, base, pine); c.set(x, base + 1, pine);
  }
  const grass = ['#2a4a35', '#3e6b48', '#5a8f55'].map(hexToRgb), dirt = ['#2c2027', '#3a2a2f', '#4a3436', '#5c423f'].map(hexToRgb);
  for (let x = 0; x < W; x++) {
    const top = 170 + Math.round(Math.sin(x * 0.09) * 1.5 + Math.sin(x * 0.31) * 0.8);
    for (let y = top; y < H; y++) {
      const d = y - top;
      let col;
      if (d < 2) col = grass[2];
      else if (d < 5) col = grass[1];
      else if (d < 8) col = (x + y) % 3 ? grass[0] : dirt[1];
      else col = dirt[Math.min(3, Math.floor(((y - 178) / 38) * 3 + BAYER[(y & 3) * 4 + (x & 3)]))] || dirt[0];
      c.set(x, y, col);
    }
    if (rng() < 0.35) c.set(x, top - 1, grass[2]);
    if (rng() < 0.08) { c.set(x, top - 2, grass[1]); c.set(x, top - 1, grass[1]); }
  }
  const path = hexToRgb('#6a4e48');
  for (let i = 0; i < 160; i++) {
    const x = rng.int(20, W - 20), y = rng.int(182, H - 4);
    c.set(x, y, path); if (rng() < 0.5) c.set(x + 1, y, path);
  }
  return c;
}

// Auto background removal for uploads with no transparency: flood fill from the
// borders, removing pixels close to the colour found there.
export function keyOutBackground(rgba, w, h, tol = 28) {
  let hasAlpha = false;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 250) { hasAlpha = true; break; }
  if (hasAlpha) return false;
  const ref = [rgba[0], rgba[1], rgba[2]];
  const close = (i) => Math.abs(rgba[i] - ref[0]) + Math.abs(rgba[i + 1] - ref[1]) + Math.abs(rgba[i + 2] - ref[2]) <= tol * 3;
  const seen = new Uint8Array(w * h), stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    if (!close(p * 4)) continue;
    rgba[p * 4 + 3] = 0;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  return true;
}

// Rightmost opaque pixel in the upper part of a sprite: where beams start.
export function findTip(rgba, w, h) {
  for (let x = w - 1; x >= 0; x--) for (let y = 0; y < Math.ceil(h * 0.7); y++) if (rgba[(y * w + x) * 4 + 3] > 0) return [x, y];
  return [w - 1, Math.floor(h / 3)];
}

// Crop to opaque content.
export function cropOpaque(rgba, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return { rgba, w, h };
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(rgba.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1 + 1) * 4), y * cw * 4);
  return { rgba: out, w: cw, h: ch };
}

// Shrink by a whole factor with nearest sampling (keeps pixel art crisp).
export function shrink(rgba, w, h, k) {
  if (k <= 1) return { rgba, w, h };
  const W = Math.floor(w / k), H = Math.floor(h / k), out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = ((y * k + (k >> 1)) * w + x * k + (k >> 1)) * 4, d = (y * W + x) * 4;
    out[d] = rgba[s]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s + 2]; out[d + 3] = rgba[s + 3] > 127 ? 255 : 0;
  }
  return { rgba: out, w: W, h: H };
}

// Pixel FX Studio engine. A recipe goes in, RGBA frames come out.
// Each layer paints a heat field on its own surface; the heat is cut into hard
// colour bands from the layer's ramp and composited. The finished frame then
// gets clean-up, outline and palette-lock passes. No DOM: runs in the page, in
// a worker and in Node.

import { makeRng, hashInt } from './rng.js';
import { noise3, fbm3 } from './noise.js';
import { clamp, DEG } from './ease.js';
import { resolveRamp, resolvePalette, makeNearest, packRGBA, hexToRgb } from './color.js';
import { KINDS, COMMON_PARAMS, VOID } from './kinds.js';

export const FORMAT = 'pfx/1';
export const KIND_LIST = Object.keys(KINDS);

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

export const RECIPE_DEFAULTS = {
  format: FORMAT, name: '未命名特效', w: 64, h: 64, frames: 16, fps: 12, loop: false, seed: 1,
  colors: { main: 'fire', alt: 'ember', smoke: 'smoke', spark: 'white' },
  hue: 0, sat: 1, outline: 'none', outlineColor: null, dither: 0, palette: null, cleanup: true,
  pivot: [0.5, 0.5], place: 'target', depth: 'front', shake: 0, impact: null,
};

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function layerDefaults(kind) {
  const out = {};
  for (const p of COMMON_PARAMS) out[p.k] = p.def;
  for (const p of KINDS[kind]?.params || []) out[p.k] = p.def;
  Object.assign(out, KINDS[kind]?.base || {});
  return out;
}

// Fill in defaults and clamp the recipe. Unknown fields are kept, so notes survive.
export function normalize(recipe = {}) {
  const r = { ...RECIPE_DEFAULTS, ...recipe };
  r.colors = { ...RECIPE_DEFAULTS.colors, ...(recipe.colors || {}) };
  r.w = Math.round(clamp(num(r.w, 64), 8, 512));
  r.h = Math.round(clamp(num(r.h, 64), 8, 512));
  r.frames = Math.round(clamp(num(r.frames, 16), 1, 120));
  r.fps = clamp(num(r.fps, 12), 1, 60);
  r.loop = !!r.loop;
  r.seed = Math.round(num(r.seed, 1));
  r.hue = num(r.hue, 0);
  r.sat = clamp(num(r.sat, 1), 0, 2);
  r.dither = clamp(num(r.dither, 0), 0, 1);
  r.pivot = Array.isArray(r.pivot) && r.pivot.length === 2 ? r.pivot.map((v) => clamp(num(v, 0.5))) : [0.5, 0.5];
  r.layers = (Array.isArray(recipe.layers) ? recipe.layers : [])
    .filter((L) => L && KINDS[L.kind])
    .map((L) => ({ ...layerDefaults(L.kind), ...L }));
  return r;
}

export function frameTime(R, f) {
  if (R.loop) return f / R.frames;
  return R.frames > 1 ? f / (R.frames - 1) : 0;
}

// One drawing surface per layer. Local coordinates are in "units": 1 unit is
// half the shorter canvas side; y grows downward.
class Surface {
  constructor(W, H) {
    this.W = W; this.H = H; this.unit = Math.min(W, H) / 2;
    this.heat = new Float32Array(W * H);
    this.voids = new Uint8Array(W * H);
  }
  begin(L, seed) {
    this.heat.fill(0); this.voids.fill(0);
    this.L = L; this.seed = seed;
    const a = (L.angle || 0) * DEG;
    this.ca = Math.cos(a); this.sa = Math.sin(a); this.sq = L.squash || 1;
    this.setAnchor(L.x || 0, L.y || 0);
  }
  setAnchor(x, y) { this.ax = this.W / 2 + x * this.unit; this.ay = this.H / 2 + y * this.unit; }
  toPx(lx, ly) {
    return [this.ax + (lx * this.ca - ly * this.sa) * this.unit, this.ay + (lx * this.sa + ly * this.ca) * this.unit * this.sq];
  }
  // Per-pixel shading. fn(lx, ly, d) returns heat, or VOID for a darkest-colour pixel.
  shade(fn, R = 2) {
    const { W, H, unit, ax, ay, ca, sa, sq, heat, voids } = this;
    const x0 = Math.max(0, Math.floor(ax - R * unit)), x1 = Math.min(W - 1, Math.ceil(ax + R * unit));
    const y0 = Math.max(0, Math.floor(ay - R * unit * sq)), y1 = Math.min(H - 1, Math.ceil(ay + R * unit * sq));
    for (let py = y0; py <= y1; py++) {
      const dy = (py + 0.5 - ay) / (unit * sq);
      for (let px = x0; px <= x1; px++) {
        const dx = (px + 0.5 - ax) / unit;
        const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
        const h = fn(lx, ly, Math.sqrt(lx * lx + ly * ly));
        const i = py * W + px;
        if (h <= VOID) voids[i] = 1;
        else if (h > heat[i]) heat[i] = h;
      }
    }
  }
  plot(px, py, h) {
    px = Math.floor(px); py = Math.floor(py);
    if (px < 0 || py < 0 || px >= this.W || py >= this.H) return;
    const i = py * this.W + px;
    if (h <= VOID) this.voids[i] = 1;
    else if (h > this.heat[i]) this.heat[i] = h;
  }
  // Filled square brush of `size` pixels centred on a pixel position.
  brush(px, py, h, size = 1) {
    if (size <= 1) { this.plot(px, py, h); return; }
    const o = Math.floor((size - 1) / 2);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (size > 2 && (x === 0 || x === size - 1) && (y === 0 || y === size - 1)) continue;
      this.plot(px - o + x, py - o + y, h);
    }
  }
  linePx(x0, y0, x1, y1, h0, h1 = h0, size = 1) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.brush(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, h0 + (h1 - h0) * t, typeof size === 'function' ? size(t) : size);
    }
  }
  line(lx0, ly0, lx1, ly1, h0, h1 = h0, size = 1) {
    const [a, b] = this.toPx(lx0, ly0), [c, d] = this.toPx(lx1, ly1);
    this.linePx(a, b, c, d, h0, h1, size);
  }
  dot(lx, ly, h, size = 1) { const [px, py] = this.toPx(lx, ly); this.brush(px, py, h, size); }
  noise(x, y, z = 0, px = 0, py = 0, pz = 0) { return 0.5 + 0.5 * noise3(x, y, z, this.seed, px, py, pz); }
  fbm(x, y, z = 0, oct = 3, px = 0, py = 0, pz = 0) { return fbm3(x, y, z, this.seed, oct, px, py, pz); }
}

function resolveColor(spec, R) {
  if (typeof spec === 'string' && spec.startsWith('@')) spec = R.colors[spec.slice(1)] ?? 'fire';
  return resolveRamp(spec, R.hue, R.sat);
}

// Everything a render needs that does not change between frames.
export function prepare(recipe) {
  const R = normalize(recipe);
  const layers = R.layers.map((L, li) => {
    const ramp = resolveColor(L.color, R);
    const seed = hashInt((R.seed * 7919) ^ (li * 104729) ^ ((L.seed | 0) * 15485863));
    const kind = KINDS[L.kind];
    const st = kind.setup ? kind.setup(L, R, makeRng(seed)) : null;
    return { L, kind, ramp, packed: ramp.map((c) => packRGBA(c)), seed, st };
  });
  const palette = resolvePalette(R.palette);
  return {
    R, layers,
    surface: new Surface(R.w, R.h),
    nearest: palette ? makeNearest(palette) : null,
    outlinePacked: R.outlineColor ? packRGBA(hexToRgb(R.outlineColor)) : 0,
  };
}

export function renderFrame(P, f) {
  const { R, layers, surface: S } = P;
  const W = R.w, H = R.h, N = W * H;
  const t = frameTime(R, f);
  const color = new Uint32Array(N);
  const owner = new Int16Array(N).fill(-1);

  layers.forEach((Ly, li) => {
    const { L, kind } = Ly;
    if (L.hidden) return;
    let lt = t;
    if (!R.loop) {
      const from = num(L.from, 0), to = num(L.to, 1);
      if (t < from - 1e-6 || t > to + 1e-6) return;
      lt = to > from ? (t - from) / (to - from) : 0;
    }
    S.begin(L, Ly.seed);
    S.t = t; S.lt = lt; S.loop = R.loop; S.frame = f; S.frames = R.frames; S.R = R;
    kind.draw(S, L, Ly.st);
    quantize(S, Ly, li, color, owner, R);
  });

  if (R.cleanup) cleanup(color, owner, layers, W, H);
  if (R.outline && R.outline !== 'none') outline(color, owner, layers, W, H, R.outline, P.outlinePacked);
  if (P.nearest) lockPalette(color, P);
  return new Uint8ClampedArray(color.buffer);
}

function quantize(S, Ly, li, color, owner, R) {
  const { L, packed } = Ly;
  const n = packed.length;
  const { heat, voids, W, H } = S;
  const gain = num(L.gain, 1), cut = clamp(num(L.cut, 0.1), 0.01, 0.95), gamma = num(L.gamma, 1);
  const dither = L.dither == null ? R.dither : clamp(L.dither);
  if (gain !== 1) for (let i = 0; i < heat.length; i++) heat[i] *= gain;
  const glow = Math.round(clamp(num(L.glow, 0), 0, 4));
  if (glow) addGlow(heat, W, H, cut, n, glow);
  const under = L.blend === 'under';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let idx;
    if (voids[i]) idx = 0;
    else {
      const h = heat[i];
      if (h <= 0) continue;
      const b = BAYER[(y & 3) * 4 + (x & 3)];
      if (h + b * dither * 0.16 < cut) continue;
      let v = clamp((h - cut) / (1 - cut));
      if (gamma !== 1) v = v ** gamma;
      idx = Math.floor(v * n + b * dither);
      idx = idx < 0 ? 0 : idx >= n ? n - 1 : idx;
    }
    if (under && color[i]) continue;
    color[i] = packed[idx];
    owner[i] = li;
  }
}

// Stepped halo: rings around the shape take the lowest bands.
function addGlow(heat, W, H, cut, n, glow) {
  let mask = new Uint8Array(W * H);
  for (let i = 0; i < mask.length; i++) mask[i] = heat[i] >= cut ? 1 : 0;
  for (let k = 1; k <= glow; k++) {
    const next = mask.slice();
    const band = Math.min(n - 1, glow - k);
    const h = cut + ((band + 0.5) / n) * (1 - cut);
    const diag = k % 2 === 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (mask[i]) continue;
      const hit = (x > 0 && mask[i - 1]) || (x < W - 1 && mask[i + 1]) || (y > 0 && mask[i - W]) || (y < H - 1 && mask[i + W]) ||
        (diag && ((x > 0 && y > 0 && mask[i - W - 1]) || (x < W - 1 && y > 0 && mask[i - W + 1]) || (x > 0 && y < H - 1 && mask[i + W - 1]) || (x < W - 1 && y < H - 1 && mask[i + W + 1])));
      if (hit) { next[i] = 1; if (heat[i] < h) heat[i] = h; }
    }
    mask = next;
  }
}

// Remove lone pixels and fill one-pixel holes, on solid layers only.
function cleanup(color, owner, layers, W, H) {
  const solid = (i) => owner[i] >= 0 && layers[owner[i]].kind.solid !== false;
  const kill = [], fill = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (color[i]) {
      if (!solid(i)) continue;
      let nb = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < W && Y < H && color[Y * W + X]) nb++;
      }
      if (nb === 0) kill.push(i);
    } else if (x > 0 && y > 0 && x < W - 1 && y < H - 1) {
      const ns = [i - 1, i + 1, i - W, i + W];
      if (ns.every((j) => color[j] && solid(j))) fill.push([i, ns]);
    }
  }
  for (const i of kill) { color[i] = 0; owner[i] = -1; }
  for (const [i, ns] of fill) {
    const counts = new Map();
    for (const j of ns) counts.set(color[j], (counts.get(color[j]) || 0) + 1);
    let best = color[ns[0]], bc = 0;
    for (const [c, k] of counts) if (k > bc) { bc = k; best = c; }
    color[i] = best; owner[i] = owner[ns.find((j) => color[j] === best)];
  }
}

function outline(color, owner, layers, W, H, mode, fixed) {
  const src = color.slice(), own = owner.slice();
  const darkest = (li) => fixed || layers[li].packed[0];
  const N4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const N8 = [...N4, [-1, -1], [1, -1], [-1, 1], [1, 1]];
  const nbs = mode === 'outer8' ? N8 : N4;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (mode === 'inner') {
      if (!src[i]) continue;
      const edge = N4.some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X < 0 || Y < 0 || X >= W || Y >= H || !src[Y * W + X]; });
      if (edge) color[i] = darkest(own[i]);
    } else {
      if (src[i]) continue;
      for (const [dx, dy] of nbs) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const j = Y * W + X;
        if (src[j]) { color[i] = darkest(own[j]); owner[i] = own[j]; break; }
      }
    }
  }
}

function lockPalette(color, P) {
  const cache = P.lockCache || (P.lockCache = new Map());
  for (let i = 0; i < color.length; i++) {
    const c = color[i];
    if (!c) continue;
    let m = cache.get(c);
    if (m === undefined) {
      m = packRGBA(P.nearest([c & 255, (c >>> 8) & 255, (c >>> 16) & 255]));
      cache.set(c, m);
    }
    color[i] = m;
  }
}

// The frame with the largest jump in covered pixels in the first 60% of a
// one-shot. Games use it for hit-stop, flashes and screen shake.
export function findImpact(R, frames) {
  if (R.loop) return null;
  if (R.impact != null) return Math.round(clamp(R.impact) * (frames.length - 1));
  const cover = frames.map((fr) => { let c = 0; for (let i = 3; i < fr.length; i += 4) if (fr[i]) c++; return c; });
  let best = 0, bd = -Infinity;
  const lim = Math.max(1, Math.floor(frames.length * 0.6));
  for (let f = 0; f <= lim && f < frames.length; f++) {
    const d = cover[f] - (f ? cover[f - 1] : 0);
    if (d > bd) { bd = d; best = f; }
  }
  return best;
}

export function render(recipe) {
  const P = prepare(recipe);
  const { R } = P;
  const frames = [];
  for (let f = 0; f < R.frames; f++) frames.push(renderFrame(P, f));
  return { name: R.name, w: R.w, h: R.h, fps: R.fps, loop: R.loop, frames, impact: findImpact(R, frames), pivot: R.pivot, place: R.place, depth: R.depth, shake: R.shake };
}

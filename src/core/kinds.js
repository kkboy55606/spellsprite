// Layer kinds. Each kind paints heat on a Surface (see engine.js):
//   draw(S, L, st)  S = surface with time (t, lt, loop, frame), L = layer params,
//                   st = what setup() returned (random choices made once per render)
// Heat around 1 picks the brightest ramp colour, heat near `cut` the darkest.
// `solid: false` kinds (particles, lines, text) are skipped by the clean-up pass.

import { makeRng } from './rng.js';
import { TAU, DEG, clamp, lerp, smooth, fract, ease, angDiff, EASES } from './ease.js';
import { layoutText } from './font.js';

// Noise time: loops run over whole periods so the last frame meets the first.
const tz = (S, rate = 1) => {
  if (S.loop) { const p = Math.max(1, Math.round(rate)) * 2; return [S.t * p, p]; }
  return [S.lt * rate, 0];
};
const ph = (S) => (S.loop ? S.t : S.lt);
const cyc = (S, v) => (S.loop ? Math.round(v) : v);
const rng2 = (r, [a, b]) => lerp(a, b, r());
const asPair = (v) => (Array.isArray(v) ? v : [v, v]);

const EASE_OPTS = Object.keys(EASES);

// Heat value that paints the ramp's darkest colour (void cores, black holes).
export const VOID = -1000;

export const COMMON_PARAMS = [
  { k: 'color', label: '色帶', def: '@main', type: 'color' },
  { k: 'from', label: '開始', def: 0, min: 0, max: 1, step: 0.01 },
  { k: 'to', label: '結束', def: 1, min: 0, max: 1, step: 0.01 },
  { k: 'x', label: 'X 位置', def: 0, min: -1.5, max: 1.5, step: 0.01 },
  { k: 'y', label: 'Y 位置', def: 0, min: -1.5, max: 1.5, step: 0.01 },
  { k: 'angle', label: '角度', def: 0, min: -180, max: 180, step: 1 },
  { k: 'squash', label: '壓扁', def: 1, min: 0.15, max: 2, step: 0.01 },
  { k: 'gain', label: '熱度', def: 1, min: 0.2, max: 1.6, step: 0.01 },
  { k: 'cut', label: '透明門檻', def: 0.1, min: 0.02, max: 0.6, step: 0.01 },
  { k: 'glow', label: '光暈', def: 0, min: 0, max: 3, step: 1 },
  { k: 'blend', label: '疊加', def: 'over', options: ['over', 'under'] },
];

// ---------- helpers ----------

// Distance to the border of a pointy-top hex cell (circumradius 1); 0 on the edge.
function hexEdge(x, y) {
  const q = (Math.sqrt(3) / 3) * x - y / 3, r = (2 / 3) * y;
  let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
  const dx = Math.abs(rx - q), dy = Math.abs(ry + q + r), dz = Math.abs(rz - r);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dz > dy) rz = -rx - ry;
  const px = Math.abs(x - Math.sqrt(3) * (rx + rz / 2)), py = Math.abs(y - 1.5 * rz);
  return Math.sqrt(3) / 2 - Math.max(px, px * 0.5 + py * (Math.sqrt(3) / 2));
}

// Midpoint-displacement lightning between two points, with side branches.
function zigzag(rng, a, b, depth, jag, branch, out, level = 0) {
  let pts = [a, b];
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
      const off = (rng() - 0.5) * 2 * jag * len * 0.5;
      const m = [(x0 + x1) / 2 + nx * off, (y0 + y1) / 2 + ny * off];
      next.push(m, pts[i + 1]);
      if (level < 2 && d >= 1 && rng() < branch * 0.5) {
        const ang = Math.atan2(y1 - y0, x1 - x0) + rng.sign() * (0.35 + rng() * 0.5);
        const bl = len * (0.8 + rng() * 1.2);
        zigzag(rng, m, [m[0] + Math.cos(ang) * bl, m[1] + Math.sin(ang) * bl], Math.max(1, depth - d - 1), jag, branch, out, level + 1);
      }
    }
    pts = next;
  }
  out.push({ pts, level });
  return out;
}

// Particle shapes, stamped in pixels. (cx, cy) pixel centre, (vx, vy) direction.
function stamp(S, shape, cx, cy, s, h, vx, vy, p, t) {
  const P = (x, y, k = 1) => S.plot(cx + x, cy + y, h * k);
  const vl = Math.hypot(vx, vy) || 1, ux = vx / vl, uy = vy / vl;
  switch (shape) {
    case 'square': for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) P(x - (s >> 1), y - (s >> 1)); break;
    case 'circle': {
      const r = s / 2;
      for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) if (x * x + y * y <= r * r + 0.3) P(x, y, 1 - 0.25 * Math.hypot(x, y) / (r || 1));
      break;
    }
    case 'plus': P(0, 0, 1.1); for (let k = 1; k <= s; k++) { P(k, 0, 0.8); P(-k, 0, 0.8); P(0, k, 0.8); P(0, -k, 0.8); } break;
    case 'cross': P(0, 0, 1.1); for (let k = 1; k <= s; k++) { P(k, k, 0.8); P(-k, k, 0.8); P(k, -k, 0.8); P(-k, -k, 0.8); } break;
    case 'star': {
      P(0, 0, 1.2);
      for (let k = 1; k <= s + 1; k++) { const f = 1 - k / (s + 2); P(k, 0, f); P(-k, 0, f); P(0, k, f); P(0, -k, f); }
      if (s > 1) for (let k = 1; k < s; k++) { const f = 0.6 - k * 0.1; P(k, k, f); P(-k, k, f); P(k, -k, f); P(-k, -k, f); }
      break;
    }
    case 'diamond': for (let y = -s; y <= s; y++) for (let x = -s; x <= s; x++) if (Math.abs(x) + Math.abs(y) <= s) P(x, y, 1 - 0.3 * (Math.abs(x) + Math.abs(y)) / (s || 1)); break;
    case 'ring': case 'bubble': {
      const r = Math.max(1, s);
      for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
        const d = Math.hypot(x, y);
        if (Math.abs(d - r) < 0.55) P(x, y, 0.85);
      }
      if (shape === 'bubble') P(-Math.round(r * 0.5), -Math.round(r * 0.5), 1.25);
      break;
    }
    case 'streak': {
      const len = Math.max(2, Math.round(s * 2 + vl * S.unit * 0.06));
      for (let k = 0; k < len; k++) { const f = 1 - k / len; S.plot(cx - ux * k, cy - uy * k, h * (0.55 + 0.6 * f)); }
      break;
    }
    case 'drop': {
      P(0, 0, 1.1); if (s > 1) { P(1, 0); P(0, 1); P(1, 1); }
      for (let k = 1; k <= s + 1; k++) S.plot(cx - ux * k, cy - uy * k, h * (0.8 - k * 0.12));
      break;
    }
    case 'shard': {
      const len = s + 2;
      for (let k = -len; k <= len; k++) { const f = 1 - Math.abs(k) / (len + 1); S.plot(cx + ux * k, cy + uy * k, h * (0.6 + 0.6 * f)); }
      break;
    }
    case 'leaf': case 'petal': {
      const a = p.u * TAU + t * TAU * (p.v < 0.5 ? 2 : -2);
      const lx = Math.round(Math.cos(a)), ly = Math.round(Math.sin(a));
      P(0, 0, 1); P(lx, ly, 0.75);
      if (shape === 'petal' || s > 1) { P(-lx, -ly, 0.6); P(lx + (ly ? 1 : 0), ly + (lx ? 1 : 0), 0.5); }
      break;
    }
    case 'chevron': for (let k = 0; k <= s + 1; k++) { P(-k, k, 1 - k * 0.15); P(k, k, 1 - k * 0.15); } break;
    case 'coin': {
      // Spinning ellipse with a darker rim, so coins read as coins on dark backgrounds.
      const wv = Math.max(0, Math.round(Math.abs(Math.cos(TAU * (t * 2 + p.u))) * s));
      const inside = (x, y) => (x / (wv + 0.5)) ** 2 + (y / (s + 0.5)) ** 2 <= 1;
      for (let y = -s; y <= s; y++) for (let x = -wv; x <= wv; x++) {
        if (!inside(x, y)) continue;
        const rim = wv > 0 && (!inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1));
        P(x, y, rim ? 0.5 : x <= 0 && y < 0 ? 1.2 : 0.85);
      }
      break;
    }
    case 'chunk': {
      const n = Math.max(2, s + 1), miss = Math.floor(p.w * 4);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const corner = (x === 0 || x === n - 1) && (y === 0 || y === n - 1);
        if (corner && ((x ? 1 : 0) + (y ? 2 : 0)) === miss) continue;
        P(x - (n >> 1), y - (n >> 1), y === 0 ? 1.05 : 0.8);
      }
      break;
    }
    case 'heart': {
      const rows = ['.#.#.', '#####', '#####', '.###.', '..#..'];
      rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') P(x - 2, y - 2, y < 2 ? 1.15 : 0.85); }));
      break;
    }
    default: S.brush(cx, cy, h, s);
  }
}

// ---------- kinds ----------

export const KINDS = {
  flash: {
    label: '閃光', solid: true,
    params: [{ k: 'r', label: '半徑', def: 0.55, min: 0.05, max: 1.5, step: 0.01 }, { k: 'dur', label: '持續', def: 0.12, min: 0.02, max: 0.5, step: 0.01 }],
    draw(S, L) {
      const f = S.loop ? S.t : S.t - (L.from || 0);
      if (f > L.dur) return;
      const k = f / L.dur, rr = L.r * (1 - 0.35 * k);
      S.shade((x, y, d) => (d < rr ? 1.3 - 0.6 * (d / rr) ** 4 - 0.35 * k : 0), rr + 0.05);
    },
  },

  blast: {
    label: '火球爆發', solid: true,
    params: [
      { k: 'r0', label: '起始半徑', def: 0.08, min: 0, max: 1, step: 0.01 }, { k: 'r1', label: '最終半徑', def: 0.8, min: 0.05, max: 1.5, step: 0.01 },
      { k: 'grow', label: '膨脹時間', def: 0.45, min: 0.05, max: 1, step: 0.01 }, { k: 'rough', label: '粗糙', def: 0.55, min: 0, max: 1.5, step: 0.01 },
      { k: 'freq', label: '紋理密度', def: 2.4, min: 0.5, max: 8, step: 0.1 }, { k: 'evolve', label: '翻滾', def: 1.5, min: 0, max: 5, step: 0.1 },
      { k: 'cool', label: '冷卻', def: 0.6, min: 0, max: 1, step: 0.01 }, { k: 'erode', label: '碎裂', def: 1, min: 0, max: 2, step: 0.01 },
      { k: 'erodeStart', label: '碎裂開始', def: 0.3, min: 0, max: 1, step: 0.01 }, { k: 'wobble', label: '輪廓起伏', def: 0.3, min: 0, max: 1, step: 0.01 },
      { k: 'hollow', label: '中空', def: 0, min: 0, max: 1, step: 0.01 }, { k: 'ease', label: '緩動', def: 'outCubic', options: EASE_OPTS },
    ],
    draw(S, L) {
      const lt = ph(S), g = ease(L.ease, lt / L.grow), r = lerp(L.r0, L.r1, g);
      const [z, pz] = tz(S, L.evolve);
      const er = lt > L.erodeStart ? (lt - L.erodeStart) / (1 - L.erodeStart) : 0;
      const coolK = 1 - L.cool * smooth(0.1, 1, lt), core = (1 - g) * 0.35;
      S.shade((x, y, d) => {
        const a = Math.atan2(y, x);
        const rr = r * (1 + L.wobble * (S.noise(Math.cos(a) * 1.6 + 7, Math.sin(a) * 1.6, z * 0.5, 0, 0, pz * 0.5) - 0.5) * 1.6);
        if (d > rr || rr <= 0) return 0;
        const q = d / rr;
        const n = S.fbm(x * L.freq, y * L.freq, z, 3, 0, 0, pz);
        let h = ((1 - q * q) * 1.15 + L.rough * (n - 0.5) * 1.3 + core * (1 - q)) * coolK;
        if (L.hollow) h -= L.hollow * smooth(0.75, 0, q) * 1.2;
        if (er > 0) {
          const n2 = S.fbm(x * L.freq * 2.2 + 31, y * L.freq * 2.2, z, 2, 0, 0, pz);
          h -= er * L.erode * (0.15 + 1.3 * n2) + er * er * 0.5 * L.erode;
        }
        return h;
      }, L.r1 * (1 + L.wobble) + 0.05);
    },
  },

  ring: {
    label: '衝擊環', solid: true,
    params: [
      { k: 'r0', label: '起始半徑', def: 0.1, min: 0, max: 1.5, step: 0.01 }, { k: 'r1', label: '最終半徑', def: 0.95, min: 0, max: 1.5, step: 0.01 },
      { k: 'th', label: '厚度', def: 0.2, min: 0.01, max: 0.8, step: 0.01 }, { k: 'thEnd', label: '最終厚度', def: 0.03, min: 0.01, max: 0.8, step: 0.01 },
      { k: 'breakup', label: '斷裂', def: 0.7, min: 0, max: 1.5, step: 0.01 }, { k: 'freq', label: '斷裂密度', def: 3, min: 0.5, max: 10, step: 0.1 },
      { k: 'fade', label: '淡出', def: 0.35, min: 0, max: 1, step: 0.01 }, { k: 'inner', label: '內部填充', def: 0, min: 0, max: 1, step: 0.01 },
      { k: 'ease', label: '緩動', def: 'outQuart', options: EASE_OPTS },
    ],
    draw(S, L) {
      const lt = ph(S), g = ease(L.ease, lt), r = lerp(L.r0, L.r1, g);
      const th = Math.max(lerp(L.th, L.thEnd, lt), 1.2 / S.unit);
      const [z, pz] = tz(S, 2);
      const fade = 1 - smooth(1 - L.fade, 1, lt) * 0.85, brk = L.breakup * smooth(0.2, 1, lt);
      S.shade((x, y, d) => {
        const e = d - r, w = e > 0 ? th * 0.55 : th;
        const fill = L.inner && d < r ? L.inner * 0.5 * (d / (r || 1)) * fade : 0;
        let h = 1 - Math.abs(e) / w;
        if (h <= 0) return fill;
        h *= (1.15 - 0.35 * lt) * fade;
        if (brk > 0) { const a = Math.atan2(y, x); h -= brk * 1.1 * S.noise(Math.cos(a) * L.freq + 11, Math.sin(a) * L.freq, z, 0, 0, pz); }
        return Math.max(h, fill);
      }, Math.max(L.r0, L.r1) + L.th + 0.05);
    },
  },

  flame: {
    label: '火焰', solid: true,
    params: [
      { k: 'w', label: '寬度', def: 0.42, min: 0.05, max: 1.5, step: 0.01 }, { k: 'hgt', label: '高度', def: 1.2, min: 0.1, max: 2.5, step: 0.01 },
      { k: 'taper', label: '收尖', def: 1.1, min: 0.2, max: 3, step: 0.05 }, { k: 'freq', label: '紋理密度', def: 2.6, min: 0.5, max: 8, step: 0.1 },
      { k: 'rough', label: '火舌', def: 0.75, min: 0, max: 1.5, step: 0.01 }, { k: 'speed', label: '上竄速度', def: 1, min: 0, max: 4, step: 1 },
      { k: 'flick', label: '搖曳', def: 0.35, min: 0, max: 1.5, step: 0.01 }, { k: 'hollow', label: '中空（光環）', def: 0, min: 0, max: 1, step: 0.01 },
    ],
    draw(S, L) {
      const P = 8, p = ph(S), sp = Math.max(S.loop ? 1 : 0, cyc(S, L.speed));
      const scroll = p * sp * P;
      const [z, pz] = tz(S, 1);
      const env = S.loop ? 1 : smooth(0, 0.12, S.lt) * (1 - smooth(0.7, 1, S.lt));
      S.shade((x, y) => {
        const v = -y / L.hgt;
        if (v < -0.2 || v > 1.15) return 0;
        const vv = Math.max(0, v);
        const wv = L.w * Math.max(0, 1 - vv) ** L.taper * (v < 0 ? Math.sqrt(Math.max(0, 1 + v * 5)) : 1) + 0.02;
        const xs = x - L.flick * L.w * 0.5 * Math.sin(TAU * p * Math.max(1, sp) + vv * 4) * vv;
        const hx = Math.abs(xs) / wv;
        const n = S.fbm(x * L.freq, y * L.freq + scroll, z, 3, 0, P, pz);
        let h = (1 - hx * hx) * (1.05 - vv * 0.9) + (n - 0.5) * L.rough * 1.4 - vv * 0.15 + Math.max(0, 1 - hx) * (1 - vv) * 0.25;
        if (L.hollow) h -= L.hollow * smooth(0.85, 0.3, hx) * (1.6 - vv * 0.6);
        return h * env;
      }, Math.max(L.w * 1.6, L.hgt * 1.25));
    },
  },

  beam: {
    label: '光束', solid: true,
    params: [
      { k: 'len', label: '長度', def: 1.8, min: 0.1, max: 4, step: 0.01 }, { k: 'th', label: '粗細', def: 0.16, min: 0.02, max: 0.6, step: 0.01 },
      { k: 'cap', label: '發射光', def: 0.26, min: 0, max: 0.8, step: 0.01 }, { k: 'wob', label: '波動', def: 0.5, min: 0, max: 1.5, step: 0.01 },
      { k: 'speed', label: '流速', def: 2, min: 0, max: 6, step: 1 }, { k: 'grow', label: '伸展時間', def: 0.15, min: 0.01, max: 1, step: 0.01 },
      { k: 'fadeOut', label: '收束', def: 0.25, min: 0, max: 1, step: 0.01 },
    ],
    draw(S, L) {
      const p = ph(S), sp = cyc(S, L.speed), Px = 6;
      const ext = S.loop ? 1 : ease('outCubic', S.lt / L.grow);
      const thin = S.loop ? 1 : 1 - smooth(1 - L.fadeOut, 1, S.lt);
      const len = L.len * ext, pulse = 1 + 0.08 * Math.sin(TAU * p * Math.max(1, sp) * 2);
      if (thin <= 0) return;
      S.shade((x, y, d) => {
        let h = 0;
        if (x >= 0 && x <= len) {
          const n = S.noise(x * 3 - p * sp * Px, y * 3, 0, Px, 0, 0);
          const hw = L.th * thin * pulse * (1 + L.wob * (n - 0.5) * 0.9) * (1 - 0.25 * x / Math.max(len, 0.01));
          const q = Math.abs(y) / hw;
          if (q < 1) h = (1 - q * q) * 1.12 + (n - 0.5) * 0.3;
        }
        if (len > 0) { const tr = L.th * thin * 0.9, dt = Math.hypot(x - len, y); if (dt < tr) h = Math.max(h, 1 - dt / tr); }
        const cr = L.cap * thin * pulse;
        if (d < cr) h = Math.max(h, (1 - d / cr) * 1.3);
        return h;
      }, L.len + L.cap + 0.1);
    },
  },

  slash: {
    label: '斬擊弧', solid: true,
    params: [
      { k: 'r', label: '半徑', def: 0.72, min: 0.1, max: 1.5, step: 0.01 }, { k: 'th', label: '厚度', def: 0.2, min: 0.02, max: 0.8, step: 0.01 },
      { k: 'a0', label: '起始角', def: -160, min: -360, max: 360, step: 1 }, { k: 'a1', label: '結束角', def: 40, min: -360, max: 360, step: 1 },
      { k: 'sweep', label: '揮動時間', def: 0.3, min: 0.02, max: 1, step: 0.01 }, { k: 'trail', label: '拖尾', def: 0.9, min: 0.1, max: 1, step: 0.01 },
      { k: 'erode', label: '消散', def: 0.6, min: 0, max: 2, step: 0.01 },
    ],
    draw(S, L) {
      const span = (L.a1 - L.a0) * DEG, dir = Math.sign(span) || 1, as = Math.abs(span) || 0.01, a0 = L.a0 * DEG;
      const lt = ph(S), head = ease('outCubic', lt / L.sweep), after = smooth(L.sweep, 1, lt);
      const [z, pz] = tz(S, 2);
      S.shade((x, y, d) => {
        let rel = ((Math.atan2(y, x) - a0) * dir) % TAU;
        if (rel < 0) rel += TAU;
        if (rel > as) return 0;
        const s = rel / as;
        if (s > head) return 0;
        const age = (head - s) / L.trail;
        if (age > 1) return 0;
        const tk = L.th * Math.sin(Math.PI * Math.min(1, s * 0.9 + 0.1)) ** 0.6 * (1 - age) ** 0.5;
        const p = (L.r - d) / Math.max(tk, 1 / S.unit);
        if (p < 0 || p > 1) return 0;
        let h = (1.25 - p * 0.75) * (1 - 0.55 * age) + (age < 0.06 ? 0.2 : 0);
        if (after > 0) h = h * (1 - after * 0.4) - after * (0.35 + L.erode * S.noise(x * 5, y * 5, z, 0, 0, pz) * 1.2);
        return h;
      }, L.r + 0.05);
    },
  },

  orb: {
    label: '能量球', solid: true,
    params: [
      { k: 'r', label: '半徑', def: 0.32, min: 0.05, max: 1.2, step: 0.01 }, { k: 'pulse', label: '脈動', def: 0.08, min: 0, max: 0.4, step: 0.01 },
      { k: 'pulseRate', label: '脈動頻率', def: 2, min: 0, max: 6, step: 1 }, { k: 'spin', label: '旋轉', def: 1, min: -4, max: 4, step: 1 },
      { k: 'freq', label: '紋理密度', def: 2.8, min: 0.5, max: 8, step: 0.1 }, { k: 'rim', label: '外緣亮度', def: 0.35, min: 0, max: 1, step: 0.01 },
    ],
    draw(S, L) {
      const p = ph(S), rr = L.r * (1 + L.pulse * Math.sin(TAU * p * cyc(S, L.pulseRate)));
      const env = S.loop ? 1 : smooth(0, 0.15, S.lt) * (1 - smooth(0.8, 1, S.lt));
      const rot = TAU * p * cyc(S, L.spin);
      const [z, pz] = tz(S, 1);
      S.shade((x, y, d) => {
        const q = d / rr;
        if (q > 1.05) return 0;
        const a = Math.atan2(y, x) - rot + (1 - q) * 2.2;
        const n = S.fbm(Math.cos(a) * q * L.freq + 5, Math.sin(a) * q * L.freq, z, 2, 0, 0, pz);
        let h = 0.55 + 0.6 * (1 - q * q) + (n - 0.5) * 0.9 + L.rim * smooth(0.72, 0.95, q) * 0.8;
        if (q > 0.95) h *= clamp((1.05 - q) / 0.1);
        return h * env;
      }, L.r * (1 + L.pulse) * 1.1);
    },
  },

  comet: {
    label: '彗星彈', solid: true,
    params: [
      { k: 'r', label: '彈頭半徑', def: 0.2, min: 0.03, max: 0.8, step: 0.01 }, { k: 'len', label: '尾長', def: 1.1, min: 0.1, max: 3, step: 0.01 },
      { k: 'speed', label: '流速', def: 2, min: 0, max: 6, step: 1 }, { k: 'rough', label: '粗糙', def: 0.6, min: 0, max: 1.5, step: 0.01 },
      { k: 'until', label: '飛行時間', def: 0.45, min: 0.05, max: 1, step: 0.01 },
    ],
    draw(S, L) {
      const p = ph(S), sp = cyc(S, L.speed), Px = 6;
      if (Array.isArray(L.fromXY) && !S.loop) {
        if (S.lt > L.until) return;
        const k = ease('inQuad', S.lt / L.until);
        S.setAnchor(lerp(L.fromXY[0], L.x, k), lerp(L.fromXY[1], L.y, k));
        const a = Math.atan2(L.y - L.fromXY[1], L.x - L.fromXY[0]);
        S.ca = Math.cos(a); S.sa = Math.sin(a);
      }
      S.shade((x, y, d) => {
        let h = d < L.r ? 1.25 - 0.5 * (d / L.r) ** 2 : 0;
        if (x < 0.05 && x > -L.len) {
          const u = Math.max(0, -x / L.len);
          const n = S.fbm(x * 3 + p * sp * Px, y * 3.5, 0, 2, Px, 0, 0);
          const hw = L.r * (1 - u) ** 0.7 * (1 + (n - 0.5) * L.rough);
          const q = Math.abs(y) / Math.max(hw, 0.001);
          if (q < 1) h = Math.max(h, (1 - q) * (1.05 - u * 0.9) + (n - 0.5) * L.rough * 0.6);
        }
        return h;
      }, L.len + L.r);
    },
  },

  vortex: {
    label: '漩渦', solid: true,
    params: [
      { k: 'r', label: '半徑', def: 0.85, min: 0.1, max: 1.5, step: 0.01 }, { k: 'rIn', label: '核心半徑', def: 0.18, min: 0, max: 0.8, step: 0.01 },
      { k: 'arms', label: '旋臂', def: 3, min: 1, max: 8, step: 1 }, { k: 'twist', label: '扭轉', def: 2.2, min: 0, max: 6, step: 0.1 },
      { k: 'spin', label: '轉速', def: 1, min: 0, max: 4, step: 1 }, { k: 'dir', label: '方向', def: 1, min: -1, max: 1, step: 2 },
      { k: 'core', label: '核心', def: 'bright', options: ['bright', 'dark'] },
    ],
    draw(S, L) {
      const p = ph(S), rot = TAU * p * cyc(S, L.spin) * L.dir;
      const env = S.loop ? 1 : smooth(0, 0.2, S.lt) * (1 - smooth(0.8, 1, S.lt));
      const rs = S.loop ? 1 : ease('outBack', S.lt / 0.25) * (1 - smooth(0.85, 1, S.lt) * 0.6);
      const [z, pz] = tz(S, 1);
      const rr = L.r * rs, ri = L.rIn / L.r;
      S.shade((x, y, d) => {
        const q = d / rr;
        if (q > 1 || rr <= 0) return 0;
        if (q < ri) {
          if (L.core === 'dark') return q > ri - 0.07 ? 1.15 * env : VOID;
          return 1.2 * env;
        }
        const phase = L.arms * (Math.atan2(y, x) - rot) + L.dir * L.twist * 4 * q;
        const arm = 0.5 + 0.5 * Math.cos(phase);
        const n = S.noise(x * 4, y * 4, z, 0, 0, pz);
        let h = (0.25 + 0.95 * arm ** 1.6) * (0.35 + 0.75 * (1 - q) ** 0.5) + (n - 0.5) * 0.35 + smooth(ri + 0.15, ri, q) * 0.5;
        h *= 1 - smooth(0.8, 1, q);
        return h * env;
      }, L.r * 1.3);
    },
  },

  pillar: {
    label: '光柱', solid: true,
    params: [
      { k: 'w', label: '寬度', def: 0.28, min: 0.03, max: 1, step: 0.01 }, { k: 'hgt', label: '高度', def: 1.8, min: 0.2, max: 3, step: 0.01 },
      { k: 'speed', label: '上湧速度', def: 2, min: 0, max: 6, step: 1 }, { k: 'rough', label: '粗糙', def: 0.5, min: 0, max: 1.5, step: 0.01 },
      { k: 'grow', label: '升起時間', def: 0.18, min: 0.01, max: 1, step: 0.01 }, { k: 'base', label: '底部光', def: 0.35, min: 0, max: 1, step: 0.01 },
    ],
    draw(S, L) {
      const p = ph(S), sp = cyc(S, L.speed), P = 8;
      const g = S.loop ? 1 : ease('outCubic', S.lt / L.grow);
      const fadeW = S.loop ? 1 : 1 - smooth(0.65, 1, S.lt);
      const hgt = L.hgt * g, w = L.w * (0.35 + 0.65 * fadeW);
      if (fadeW <= 0) return;
      S.shade((x, y) => {
        let h = 0;
        const v = -y / Math.max(hgt, 0.01);
        if (v >= -0.05 && v <= 1) {
          const n = S.fbm(x * 3, y * 2.5 + p * sp * P, 0, 2, 0, P, 0);
          const hx = Math.abs(x) / (w * (1 - 0.2 * Math.max(0, v)) * (1 + (n - 0.5) * L.rough * 0.8));
          if (hx < 1.2) h = (1 - hx * hx) * (1.15 - 0.3 * v) + (n - 0.5) * L.rough;
          if (v > 0.85) h *= (1 - v) / 0.15;
        }
        if (L.base) {
          const bd = Math.hypot(x / (w * 1.6 + L.base * 0.6), y / (w * 0.5 + 0.05));
          if (bd < 1) h = Math.max(h, (1 - bd) * 1.0 * fadeW);
        }
        return h;
      }, L.hgt * 1.05 + L.w + 0.1);
    },
  },

  rays: {
    label: '放射光芒', solid: true,
    params: [
      { k: 'count', label: '數量', def: 10, min: 1, max: 32, step: 1 }, { k: 'r', label: '長度', def: 0.9, min: 0.1, max: 1.6, step: 0.01 },
      { k: 'width', label: '寬度', def: 0.2, min: 0.02, max: 0.8, step: 0.01 }, { k: 'jitter', label: '凌亂', def: 0.45, min: 0, max: 1, step: 0.01 },
      { k: 'inner', label: '內空', def: 0.08, min: 0, max: 0.8, step: 0.01 }, { k: 'spin', label: '旋轉', def: 0, min: -3, max: 3, step: 1 },
      { k: 'twinkle', label: '閃爍', def: 1, min: 0, max: 4, step: 1 }, { k: 'grow', label: '伸出時間', def: 0.3, min: 0.02, max: 1, step: 0.01 },
    ],
    setup(L, R, rng) {
      const n = Math.max(1, Math.round(L.count)), base = rng() * TAU;
      return Array.from({ length: n }, (_, i) => ({ a: base + ((i + (rng() - 0.5) * L.jitter) / n) * TAU, len: 0.55 + 0.45 * rng(), ph: rng() }));
    },
    draw(S, L, rays) {
      const p = ph(S), g = S.loop ? 1 : ease('outExpo', S.lt / L.grow);
      const fade = S.loop ? 1 : 1 - smooth(0.5, 1, S.lt);
      const rot = TAU * p * cyc(S, L.spin), tw = cyc(S, L.twinkle), px1 = 0.6 / S.unit;
      S.shade((x, y, d) => {
        if (d < L.inner) return 0;
        const a = Math.atan2(y, x) - rot;
        let h = 0;
        for (const ray of rays) {
          const len = L.r * ray.len * g;
          if (d > len) continue;
          const da = Math.abs(angDiff(a, ray.a));
          if (da > 1.2) continue;
          const perp = d * Math.sin(da), hw = L.width * 0.5 * (1 - d / len) + px1;
          if (perp > hw) continue;
          const b = tw ? 0.75 + 0.25 * Math.sin(TAU * (p * tw + ray.ph)) : 1;
          h = Math.max(h, (1 - perp / hw) * (1.15 - 0.6 * d / len) * b * fade);
        }
        return h;
      }, L.r + 0.05);
    },
  },

  sigil: {
    label: '魔法陣', solid: false,
    params: [
      { k: 'r', label: '半徑', def: 0.8, min: 0.1, max: 1.5, step: 0.01 }, { k: 'inner', label: '內環比例', def: 0.82, min: 0, max: 0.98, step: 0.01 },
      { k: 'core', label: '核心環比例', def: 0.45, min: 0, max: 0.95, step: 0.01 }, { k: 'star', label: '星芒角數', def: 5, min: 0, max: 12, step: 1 },
      { k: 'step', label: '星形跨度', def: 2, min: 1, max: 5, step: 1 }, { k: 'ticks', label: '刻度', def: 24, min: 0, max: 64, step: 1 },
      { k: 'runes', label: '符文', def: 8, min: 0, max: 24, step: 1 }, { k: 'draw', label: '繪製時間', def: 0.35, min: 0.02, max: 1, step: 0.01 },
      { k: 'spin', label: '旋轉', def: 1, min: -3, max: 3, step: 1 }, { k: 'fill', label: '內部光', def: 0, min: 0, max: 1, step: 0.01 },
    ],
    setup(L, R, rng) {
      const runes = Array.from({ length: Math.round(L.runes) }, () => {
        const segs = [], k = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < k; i++) segs.push([rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1].map((v) => Math.round(v * 2) / 2));
        return segs;
      });
      return { runes };
    },
    draw(S, L, st) {
      const p = ph(S), prog = S.loop ? 1 : ease('outCubic', S.lt / L.draw);
      const rot = TAU * (S.loop ? fract(p * cyc(S, L.spin)) : p * L.spin * 0.35);
      const fade = S.loop ? 1 : 1 - smooth(0.8, 1, S.lt);
      if (fade <= 0) return;
      const hL = fade * (0.92 + 0.08 * Math.sin(TAU * p * (S.loop ? 2 : 3)));
      const shown = (ang) => ((ang % TAU) + TAU) % TAU <= prog * TAU + 1e-6;
      const circle = (rad, h) => {
        const steps = Math.max(24, Math.ceil(TAU * rad * S.unit * 1.5));
        let prev = null;
        for (let i = 0; i <= steps; i++) {
          const ang = (i / steps) * TAU;
          if (!shown(ang)) { prev = null; continue; }
          const pt = [Math.cos(ang + rot) * rad, Math.sin(ang + rot) * rad];
          if (prev) S.line(prev[0], prev[1], pt[0], pt[1], h);
          prev = pt;
        }
      };
      const R0 = L.r, R1 = L.r * (L.inner || 1);
      circle(R0, hL);
      if (L.inner) circle(R1, hL * 0.85);
      if (L.core) circle(L.r * L.core, hL * 0.8);
      const n = Math.round(L.star);
      if (n >= 3) {
        const step = clamp(Math.round(L.step), 1, n - 1);
        const v = (i) => { const a = -Math.PI / 2 - rot * 0.6 + (TAU * i) / n; return [Math.cos(a) * R1, Math.sin(a) * R1]; };
        for (let i = 0; i < n; i++) {
          if (i / n > prog + 1e-6) continue;
          const [x0, y0] = v(i), [x1, y1] = v(i + step);
          S.line(x0, y0, x1, y1, hL * 0.95);
        }
      }
      const ticks = Math.round(L.ticks);
      for (let k = 0; k < ticks; k++) {
        const ang = (TAU * k) / ticks;
        if (!shown(ang)) continue;
        const c = Math.cos(ang + rot), s = Math.sin(ang + rot), r0 = R0 * 0.94, r1 = k % 4 === 0 ? R0 * 0.86 : R0 * 0.9;
        S.line(c * r0, s * r0, c * r1, s * r1, hL * 0.7);
      }
      if (L.inner && st.runes.length) {
        const rm = (R0 + R1) / 2, sz = (R0 - R1) * 0.28;
        st.runes.forEach((segs, i) => {
          const ang = (TAU * (i + 0.5)) / st.runes.length;
          if (!shown(ang)) return;
          const a = ang + rot, cx = Math.cos(a) * rm, cy = Math.sin(a) * rm, ca = Math.cos(a + Math.PI / 2), sa = Math.sin(a + Math.PI / 2);
          for (const [x0, y0, x1, y1] of segs) {
            S.line(cx + (x0 * ca - y0 * sa) * sz, cy + (x0 * sa + y0 * ca) * sz, cx + (x1 * ca - y1 * sa) * sz, cy + (x1 * sa + y1 * ca) * sz, hL * 0.8);
          }
        });
      }
      if (L.fill) S.shade((x, y, d) => (d < R0 ? L.fill * 0.45 * fade * (0.6 + 0.4 * d / R0) * prog : 0), R0);
    },
  },

  smoke: {
    label: '煙霧', solid: true,
    params: [
      { k: 'count', label: '團數', def: 7, min: 1, max: 30, step: 1 }, { k: 'spread', label: '散布', def: 0.4, min: 0, max: 1.5, step: 0.01 },
      { k: 'flat', label: '扁平', def: 0.6, min: 0.1, max: 1, step: 0.01 }, { k: 'rise', label: '上升', def: 0.5, min: -1, max: 2, step: 0.01 },
      { k: 'r0', label: '起始大小', def: 0.12, min: 0.02, max: 0.8, step: 0.01 }, { k: 'r1', label: '最終大小', def: 0.3, min: 0.02, max: 1, step: 0.01 },
      { k: 'life', label: '壽命', def: [0.55, 1], min: 0.05, max: 1, step: 0.01 }, { k: 'emit', label: '噴出時段', def: 0.25, min: 0, max: 1, step: 0.01 },
      { k: 'dir', label: '噴向', def: -90, min: -180, max: 180, step: 1 }, { k: 'cone', label: '噴角', def: 0, min: 0, max: 360, step: 1 },
      { k: 'speed', label: '噴速', def: [0, 0], min: 0, max: 3, step: 0.01 }, { k: 'drift', label: '飄移', def: 0.3, min: 0, max: 1.5, step: 0.01 },
      { k: 'dissolve', label: '溶解', def: 1, min: 0, max: 2, step: 0.01 }, { k: 'decay', label: '變淡', def: 0.5, min: 0, max: 1, step: 0.01 },
      { k: 'freq', label: '紋理密度', def: 3.2, min: 0.5, max: 8, step: 0.1 },
    ],
    setup(L, R, rng) {
      const n = Math.max(1, Math.round(L.count)), life = asPair(L.life), speed = asPair(L.speed);
      return Array.from({ length: n }, (_, i) => {
        const ang = (L.dir + (rng() - 0.5) * L.cone) * DEG;
        return { x: (rng() * 2 - 1) * L.spread, y: (rng() * 2 - 1) * L.spread * L.flat, life: rng2(rng, life), birth: rng() * L.emit, ph: (i + rng() * 0.6) / n, sp: rng2(rng, speed), ca: Math.cos(ang), sa: Math.sin(ang), rs: 0.75 + 0.5 * rng(), dx: rng() * 2 - 1 };
      });
    },
    draw(S, L, puffs) {
      const [z, pz] = tz(S, 1);
      const items = [];
      for (const p of puffs) {
        const age = S.loop ? fract(S.t - p.ph) / p.life : (S.lt - p.birth) / p.life;
        if (age < 0 || age > 1) continue;
        const e = ease('outCubic', age);
        items.push([p.x + p.ca * p.sp * e + p.dx * L.drift * e * 0.5, p.y - L.rise * e + p.sa * p.sp * e, lerp(L.r0, L.r1, e) * p.rs, age]);
      }
      if (!items.length) return;
      const sp = asPair(L.speed);
      S.shade((x, y) => {
        let h = 0, n = -1;
        for (const [cx, cy, rad, age] of items) {
          const d = Math.hypot(x - cx, y - cy);
          if (d > rad * 1.3) continue;
          if (n < 0) n = S.fbm(x * L.freq, y * L.freq, z, 2, 0, 0, pz);
          const v = (1 - d / rad) * 1.4 * (1 - L.decay * age) + (n - 0.5) * 0.8 - L.dissolve * age * age * 0.9 * (0.4 + n);
          if (v > h) h = v;
        }
        return h;
      }, L.spread + Math.abs(L.rise) + L.r1 * 1.5 + Math.max(...sp) + L.drift + 0.2);
    },
  },

  particles: {
    label: '粒子', solid: false,
    params: [
      { k: 'mode', label: '模式', def: 'burst', options: ['burst', 'spray', 'rise', 'fall', 'ambient', 'orbit', 'implode'] },
      { k: 'shape', label: '形狀', def: 'dot', options: ['dot', 'square', 'circle', 'plus', 'cross', 'star', 'diamond', 'ring', 'bubble', 'streak', 'drop', 'shard', 'leaf', 'petal', 'chevron', 'coin', 'chunk', 'heart'] },
      { k: 'count', label: '數量', def: 16, min: 1, max: 200, step: 1 }, { k: 'speed', label: '速度', def: [0.8, 1.6], min: 0, max: 5, step: 0.01 },
      { k: 'life', label: '壽命', def: [0.5, 1], min: 0.05, max: 1, step: 0.01 }, { k: 'emit', label: '噴出時段', def: 0, min: 0, max: 1, step: 0.01 },
      { k: 'dir', label: '方向', def: 0, min: -180, max: 180, step: 1 }, { k: 'spread', label: '擴散角', def: 360, min: 0, max: 360, step: 1 },
      { k: 'area', label: '出生範圍', def: 0.05, min: 0, max: 1.5, step: 0.01 }, { k: 'areaX', label: '範圍寬', def: 1, min: 0, max: 4, step: 0.01 },
      { k: 'areaY', label: '範圍高', def: 1, min: 0, max: 4, step: 0.01 }, { k: 'gravity', label: '重力', def: 0, min: -4, max: 6, step: 0.01 },
      { k: 'drag', label: '阻力', def: 1.5, min: 0, max: 8, step: 0.01 }, { k: 'ground', label: '地面高度', def: 9, min: -1.5, max: 9, step: 0.01 },
      { k: 'size', label: '大小', def: [1, 1], min: 1, max: 6, step: 1 }, { k: 'heat', label: '亮度變化', def: [1, 0.35], min: 0, max: 1.4, step: 0.01 },
      { k: 'twinkle', label: '閃爍', def: 0, min: 0, max: 6, step: 1 }, { k: 'wiggle', label: '擺動', def: 0, min: 0, max: 0.5, step: 0.01 },
      { k: 'orbitR', label: '環繞半徑', def: 0.5, min: 0, max: 1.5, step: 0.01 }, { k: 'turns', label: '環繞圈數', def: 1, min: -4, max: 4, step: 1 },
      { k: 'implodeR', label: '聚集半徑', def: 0.9, min: 0.1, max: 1.8, step: 0.01 }, { k: 'swirl', label: '漩轉', def: 0, min: -6, max: 6, step: 0.1 },
      { k: 'fadeIn', label: '淡入', def: 0, min: 0, max: 0.8, step: 0.01 }, { k: 'driftX', label: '橫向風', def: 0, min: -2, max: 2, step: 0.01 },
      { k: 'spanX', label: '橫向範圍', def: 1, min: 0, max: 1.5, step: 0.01 }, { k: 'spanY', label: '縱向範圍', def: 1, min: 0, max: 1.5, step: 0.01 },
    ],
    setup(L, R, rng) {
      const n = Math.max(1, Math.round(L.count)), speed = asPair(L.speed), life = asPair(L.life);
      return Array.from({ length: n }, (_, i) => {
        const rr = Math.sqrt(rng()) * L.area, ra = rng() * TAU;
        return { ang: (L.dir + (rng() - 0.5) * L.spread) * DEG, sp: rng2(rng, speed), life: rng2(rng, life), birth: rng() * L.emit, ph: (i + rng() * 0.8) / n, ox: Math.cos(ra) * rr * L.areaX, oy: Math.sin(ra) * rr * L.areaY, u: rng(), v: rng(), w: rng() };
      });
    },
    draw(S, L, parts) {
      const halfW = S.W / 2 / S.unit, halfH = S.H / 2 / S.unit;
      const size = asPair(L.size), heat = asPair(L.heat), k = L.drag, g = L.gravity;
      const tw = cyc(S, L.twinkle), p0 = ph(S);
      for (const p of parts) {
        let age, x, y, vx = 0, vy = 0;
        const mode = L.mode;
        if (mode === 'fall' || mode === 'ambient') {
          const passes = Math.max(1, Math.round(p.sp));
          age = S.loop ? fract(S.t * (mode === 'fall' ? passes : 1) + p.ph) : (S.lt - p.birth) / p.life;
          if (!S.loop && mode === 'fall') age = fract(S.lt * passes + p.ph);
        } else age = S.loop ? fract(S.t - p.ph) / p.life : (S.lt - p.birth) / p.life;
        if (age < 0 || age > 1) continue;
        const tau = age * p.life;
        switch (mode) {
          case 'fall': {
            x = (p.u * 2 - 1) * halfW * L.spanX + L.driftX * (age - 0.5) * 0.5 - S.ax / S.unit + halfW;
            y = lerp(-halfH - 0.15, halfH + 0.15, age) - S.ay / S.unit + halfH;
            vx = L.driftX * 0.5; vy = 2;
            x += Math.sin(TAU * (age * 2 + p.w)) * L.wiggle;
            break;
          }
          case 'ambient': {
            x = (p.u * 2 - 1) * halfW * L.spanX - S.ax / S.unit + halfW + Math.sin(TAU * (age + p.w)) * L.wiggle;
            y = (p.v * 2 - 1) * halfH * L.spanY - S.ay / S.unit + halfH - age * p.sp * 0.3;
            vx = 0; vy = -1;
            break;
          }
          case 'orbit': {
            const a = p.u * TAU + TAU * cyc(S, L.turns) * p0 * (S.loop ? 1 : 1);
            const r = L.orbitR * (0.8 + 0.4 * p.v);
            x = Math.cos(a) * r + p.ox; y = Math.sin(a) * r + p.oy;
            vx = -Math.sin(a) * Math.sign(L.turns || 1); vy = Math.cos(a) * Math.sign(L.turns || 1);
            break;
          }
          case 'implode': {
            const e = ease('inQuad', age), r0 = L.implodeR * (0.7 + 0.3 * p.v), a = p.u * TAU + L.swirl * e;
            const r = r0 * (1 - e);
            x = Math.cos(a) * r; y = Math.sin(a) * r;
            vx = -Math.cos(a); vy = -Math.sin(a);
            break;
          }
          case 'rise': {
            x = p.ox + Math.sin(TAU * (tau * 1.5 + p.w)) * L.wiggle + L.driftX * tau;
            y = p.oy - p.sp * tau + 0.5 * g * tau * tau;
            vx = 0; vy = -1;
            break;
          }
          default: {
            const cvx = Math.cos(p.ang) * p.sp, cvy = Math.sin(p.ang) * p.sp;
            const ek = Math.exp(-k * tau), E = k > 0 ? (1 - ek) / k : tau;
            x = p.ox + cvx * E + L.driftX * tau;
            y = p.oy + cvy * E + (k > 0 ? (g * (tau - E)) / k : 0.5 * g * tau * tau);
            vx = cvx * ek; vy = cvy * ek + (k > 0 ? (g * (1 - ek)) / k : g * tau);
            if (L.wiggle) x += Math.sin(TAU * (tau * 2 + p.w)) * L.wiggle;
          }
        }
        if (y > L.ground) { y = L.ground; vy = 0; }
        let h = lerp(heat[0], heat[1], age);
        if (L.fadeIn) h *= smooth(0, L.fadeIn, age);
        if (mode === 'ambient') h *= Math.sin(Math.PI * age) ** 0.5;
        if (tw) h *= 0.6 + 0.4 * Math.sin(TAU * (p0 * tw + p.w));
        if (h <= 0) continue;
        const s = Math.max(1, Math.round(lerp(size[0], size[1], age)));
        const [px, py] = S.toPx(x, y);
        const dvx = vx * S.ca - vy * S.sa, dvy = (vx * S.sa + vy * S.ca) * S.sq;
        stamp(S, L.shape, Math.floor(px), Math.floor(py), s, h, dvx, dvy, p, p0);
      }
    },
  },

  bolt: {
    label: '閃電', solid: false,
    params: [
      { k: 'mode', label: '模式', def: 'radial', options: ['radial', 'strike', 'line'] },
      { k: 'count', label: '數量', def: 4, min: 1, max: 12, step: 1 }, { k: 'len', label: '長度', def: 0.9, min: 0.1, max: 2, step: 0.01 },
      { k: 'jag', label: '曲折', def: 0.35, min: 0, max: 1, step: 0.01 }, { k: 'depth', label: '細分', def: 5, min: 1, max: 7, step: 1 },
      { k: 'branch', label: '分岔', def: 0.3, min: 0, max: 1, step: 0.01 }, { k: 'thick', label: '粗細(像素)', def: 1, min: 1, max: 3, step: 1 },
      { k: 'flicker', label: '閃斷', def: 0, min: 0, max: 0.8, step: 0.01 }, { k: 'fadeStart', label: '淡出開始', def: 0.5, min: 0, max: 1, step: 0.01 },
      { k: 'hold', label: '每幾幀重生', def: 2, min: 1, max: 8, step: 1 }, { k: 'dir', label: '方向', def: 0, min: -180, max: 180, step: 1 },
      { k: 'spread', label: '擴散角', def: 360, min: 0, max: 360, step: 1 }, { k: 'x1', label: '終點 X', def: 0.8, min: -2, max: 2, step: 0.01 },
      { k: 'y1', label: '終點 Y', def: 0, min: -2, max: 2, step: 0.01 },
    ],
    draw(S, L) {
      const group = Math.floor(S.frame / Math.max(1, Math.round(L.hold)));
      const rng = makeRng(S.seed + group * 7919);
      let fade = 1;
      if (!S.loop && S.lt > L.fadeStart) fade = 1 - (S.lt - L.fadeStart) / (1 - L.fadeStart + 1e-6);
      if (L.flicker && rng() < L.flicker) fade *= 0.45;
      if (fade <= 0) return;
      const out = [];
      const n = Math.max(1, Math.round(L.count)), depth = Math.round(L.depth);
      for (let i = 0; i < n; i++) {
        let a, b;
        if (L.mode === 'strike') {
          const top = -S.ay / (S.unit * S.sq) - 0.05;
          a = [(rng() - 0.5) * 0.5, top]; b = [0, 0];
        } else if (L.mode === 'line') {
          a = [0, 0]; b = [L.x1 + (rng() - 0.5) * 0.08 * i, L.y1 + (rng() - 0.5) * 0.08 * i];
        } else {
          const ang = (L.spread >= 360 ? ((i + rng() * 0.7) / n) * TAU : (L.dir + (rng() - 0.5) * L.spread) * DEG);
          const len = L.len * (0.6 + 0.4 * rng());
          a = [0, 0]; b = [Math.cos(ang) * len, Math.sin(ang) * len];
        }
        zigzag(rng, a, b, depth, L.jag, L.branch, out);
      }
      for (const { pts, level } of out) {
        const h = (level ? 0.85 : 1.15) * fade, th = level ? 1 : Math.round(L.thick);
        for (let i = 0; i < pts.length - 1; i++) {
          const f = level ? 1 - i / pts.length : 1;
          S.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], h * (0.6 + 0.4 * f), h * (0.6 + 0.4 * f), th);
        }
      }
    },
  },

  cracks: {
    label: '地裂', solid: false, base: { squash: 0.4 },
    params: [
      { k: 'count', label: '裂縫數', def: 6, min: 1, max: 16, step: 1 }, { k: 'len', label: '長度', def: 0.9, min: 0.1, max: 2, step: 0.01 },
      { k: 'jag', label: '曲折', def: 0.5, min: 0, max: 1.5, step: 0.01 }, { k: 'branch', label: '分岔', def: 0.3, min: 0, max: 1, step: 0.01 },
      { k: 'grow', label: '裂開時間', def: 0.2, min: 0.02, max: 1, step: 0.01 }, { k: 'fadeStart', label: '淡出開始', def: 0.55, min: 0, max: 1, step: 0.01 },
    ],
    setup(L, R, rng) {
      const lines = [];
      const n = Math.max(1, Math.round(L.count));
      const walk = (x, y, a, len, depth) => {
        const steps = 7, pts = [[x, y]];
        for (let s = 0; s < steps; s++) {
          a += (rng() - 0.5) * L.jag;
          x += Math.cos(a) * len / steps; y += Math.sin(a) * len / steps;
          pts.push([x, y]);
          if (depth < 1 && s > 1 && rng() < L.branch * 0.35) walk(x, y, a + rng.sign() * (0.5 + rng() * 0.5), len * 0.45, depth + 1);
        }
        lines.push({ pts, depth });
      };
      for (let i = 0; i < n; i++) walk(0, 0, ((i + rng() * 0.6) / n) * TAU, L.len * (0.6 + 0.4 * rng()), 0);
      return lines;
    },
    draw(S, L, lines) {
      const prog = S.loop ? 1 : ease('outCubic', S.lt / L.grow);
      const fade = S.loop ? 1 : 1 - smooth(L.fadeStart, 1, S.lt);
      if (fade <= 0) return;
      for (const { pts, depth } of lines) {
        const segs = pts.length - 1, show = prog * segs * (depth ? 0.8 : 1);
        for (let i = 0; i < segs && i < show; i++) {
          const k = Math.min(1, show - i), [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
          const h = (0.95 - (i / segs) * 0.45) * fade * (depth ? 0.8 : 1);
          S.line(x0, y0, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, h, h, !depth && i < 2 ? 2 : 1);
        }
      }
    },
  },

  spikes: {
    label: '尖刺', solid: true,
    params: [
      { k: 'count', label: '數量', def: 5, min: 1, max: 16, step: 1 }, { k: 'spread', label: '散布', def: 0.75, min: 0, max: 1.5, step: 0.01 },
      { k: 'hgt', label: '高度', def: [0.55, 1], min: 0.05, max: 2, step: 0.01 }, { k: 'width', label: '寬度', def: [0.1, 0.17], min: 0.02, max: 0.6, step: 0.01 },
      { k: 'lean', label: '歪斜', def: 12, min: 0, max: 60, step: 1 }, { k: 'fan', label: '外張', def: 14, min: 0, max: 60, step: 1 },
      { k: 'grow', label: '竄出時間', def: 0.22, min: 0.02, max: 1, step: 0.01 }, { k: 'hold', label: '碎裂開始', def: 0.55, min: 0.05, max: 1, step: 0.01 },
    ],
    setup(L, R, rng) {
      const n = Math.max(1, Math.round(L.count)), hg = asPair(L.hgt), wd = asPair(L.width);
      return Array.from({ length: n }, (_, i) => {
        const xi = n === 1 ? 0 : lerp(-L.spread, L.spread, i / (n - 1)) + (rng() - 0.5) * 0.1;
        const rel = L.spread ? Math.abs(xi) / L.spread : 0;
        return { x: xi, h: rng2(rng, hg) * (1 - 0.35 * rel), w: rng2(rng, wd), a: ((rng() - 0.5) * L.lean + L.fan * (L.spread ? xi / L.spread : 0)) * DEG, delay: rel * 0.08 };
      });
    },
    draw(S, L, spikes) {
      const lt = ph(S), brk = S.loop ? 0 : smooth(L.hold, 1, lt);
      const tris = spikes.map((s) => {
        const g = S.loop ? 1 : Math.max(0, ease('outBack', (lt - s.delay) / L.grow));
        const H = s.h * g * (1 - 0.3 * brk);
        return { bl: [s.x - s.w / 2, 0], br: [s.x + s.w / 2, 0], tip: [s.x + Math.sin(s.a) * H, -Math.cos(s.a) * H], H };
      }).filter((t) => t.H > 0.01);
      if (!tris.length) return;
      const cross = (ax, ay, bx, by, px, py) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      S.shade((x, y) => {
        let h = 0;
        for (const { bl, br, tip } of tris) {
          const c1 = cross(bl[0], bl[1], br[0], br[1], x, y), c2 = cross(br[0], br[1], tip[0], tip[1], x, y), c3 = cross(tip[0], tip[1], bl[0], bl[1], x, y);
          if (!((c1 <= 0 && c2 <= 0 && c3 <= 0) || (c1 >= 0 && c2 >= 0 && c3 >= 0))) continue;
          const mx = (bl[0] + br[0]) / 2;
          const side = cross(mx, 0, tip[0], tip[1], x, y);
          const up = Math.min(1, -y / Math.max(0.01, -tip[1]));
          let v = (side < 0 ? 1.05 : 0.62) + up * 0.15;
          if (brk > 0) v -= brk * (0.3 + 1.2 * S.noise(x * 7, y * 7, 0));
          h = Math.max(h, v);
        }
        return h;
      }, L.spread + Math.max(...asPair(L.hgt)) + Math.max(...asPair(L.width)) + 0.2);
    },
  },

  star: {
    label: '衝擊星', solid: true,
    params: [
      { k: 'points', label: '角數', def: 8, min: 3, max: 16, step: 1 }, { k: 'r', label: '半徑', def: 0.75, min: 0.1, max: 1.5, step: 0.01 },
      { k: 'inner', label: '內徑', def: 0.22, min: 0.02, max: 0.8, step: 0.01 }, { k: 'sharp', label: '尖銳', def: 1.6, min: 0.3, max: 4, step: 0.1 },
      { k: 'jitter', label: '凌亂', def: 0.45, min: 0, max: 1, step: 0.01 }, { k: 'pop', label: '彈出時間', def: 0.22, min: 0.02, max: 1, step: 0.01 },
      { k: 'hollow', label: '中空', def: 0.9, min: 0, max: 1, step: 0.01 },
    ],
    setup(L, R, rng) {
      const n = Math.round(L.points), base = rng() * TAU;
      return { n, pts: Array.from({ length: n }, (_, i) => ({ a: base + ((i + (rng() - 0.5) * L.jitter) / n) * TAU, len: 0.6 + 0.4 * rng() })) };
    },
    draw(S, L, st) {
      const lt = ph(S), g = S.loop ? 1 : ease('outBack', lt / L.pop), shrink = S.loop ? 1 : 1 - smooth(0.6, 1, lt) * 0.5;
      const hol = S.loop ? 0 : L.hollow * smooth(L.pop * 0.6, 1, lt), w = Math.PI / st.n, ri = L.inner * L.r;
      S.shade((x, y, d) => {
        const a = Math.atan2(y, x);
        let rb = ri;
        for (const sp of st.pts) {
          const da = Math.abs(angDiff(a, sp.a));
          if (da < w) rb = Math.max(rb, ri + (L.r * sp.len - ri) * (1 - da / w) ** L.sharp);
        }
        rb *= g * shrink;
        if (d > rb || rb <= 0) return 0;
        const q = d / rb;
        if (q < hol) return 0;
        return 1.25 - 0.55 * q - (S.loop ? 0 : 0.3 * smooth(0.5, 1, lt));
      }, L.r * 1.4);
    },
  },

  streaks: {
    label: '爪痕 / 速度線', solid: false, base: { angle: 55 },
    params: [
      { k: 'mode', label: '模式', def: 'claw', options: ['claw', 'speed', 'flow'] },
      { k: 'count', label: '條數', def: 3, min: 1, max: 24, step: 1 }, { k: 'len', label: '長度', def: 1.4, min: 0.1, max: 3, step: 0.01 },
      { k: 'gap', label: '間距', def: 0.22, min: 0.02, max: 0.8, step: 0.01 }, { k: 'curve', label: '彎曲', def: 0.18, min: -1, max: 1, step: 0.01 },
      { k: 'th', label: '粗細(像素)', def: 2, min: 1, max: 6, step: 1 }, { k: 'stagger', label: '錯開', def: 0.04, min: 0, max: 0.3, step: 0.01 },
      { k: 'spanY', label: '縱向範圍', def: 0.8, min: 0, max: 1.5, step: 0.01 }, { k: 'speed', label: '速度', def: 1, min: 0, max: 6, step: 1 },
      { k: 'r', label: '半徑(風)', def: 0.6, min: 0.1, max: 1.5, step: 0.01 }, { k: 'turns', label: '圈數(風)', def: 1, min: -4, max: 4, step: 1 },
    ],
    setup(L, R, rng) {
      return Array.from({ length: Math.max(1, Math.round(L.count)) }, () => ({ u: rng(), v: rng(), w: rng() }));
    },
    draw(S, L, lines) {
      const p = ph(S), n = lines.length;
      if (L.mode === 'claw') {
        const fade = S.loop ? 1 : 1 - smooth(0.45, 1, S.lt);
        if (fade <= 0) return;
        lines.forEach((ln, i) => {
          const o = (i - (n - 1) / 2) * L.gap;
          const k = S.loop ? 1 : ease('outCubic', (S.lt - i * L.stagger) / 0.22);
          if (k <= 0) return;
          const steps = Math.ceil(L.len * S.unit * 1.5);
          for (let j = 0; j <= steps * k; j++) {
            const s = j / steps, x = (s - 0.5) * L.len, y = o - L.curve * 4 * s * (1 - s) * L.len * 0.5;
            const th = Math.max(1, Math.round(L.th * Math.sin(Math.PI * s) ** 0.5 * (0.4 + 0.6 * fade)));
            const head = k < 1 && s > k - 0.12 ? 0.2 : 0;
            S.dot(x, y, (1.05 + head) * (0.55 + 0.45 * fade), th);
          }
        });
      } else if (L.mode === 'speed') {
        const halfW = S.W / 2 / S.unit + 0.2, halfH = S.H / 2 / S.unit;
        const sp = Math.max(1, cyc(S, L.speed));
        for (const ln of lines) {
          const y = (ln.u * 2 - 1) * halfH * L.spanY, len = L.len * (0.3 + 0.7 * ln.v);
          const x = lerp(halfW + len, -halfW - len, fract(p * sp + ln.w));
          S.line(x, y, x + len, y, 1.05, 0.35, 1);
        }
      } else {
        lines.forEach((ln, i) => {
          const r = L.r * (0.6 + 0.6 * ln.u), a0 = ln.v * TAU + TAU * cyc(S, L.turns) * p, arc = 1.2;
          const steps = Math.ceil(r * arc * S.unit * 1.5);
          for (let j = 0; j < steps; j++) {
            const s = j / steps, a = a0 - s * arc * Math.sign(L.turns || 1);
            S.dot(Math.cos(a) * r, Math.sin(a) * r, 1.05 - s * 0.75);
          }
        });
      }
    },
  },

  shield: {
    label: '護盾', solid: true,
    params: [
      { k: 'r', label: '半徑', def: 0.8, min: 0.1, max: 1.5, step: 0.01 }, { k: 'th', label: '外緣厚度', def: 0.07, min: 0.01, max: 0.4, step: 0.01 },
      { k: 'hex', label: '六角格', def: 0.4, min: 0, max: 1, step: 0.01 }, { k: 'cell', label: '格子大小', def: 0.17, min: 0.05, max: 0.5, step: 0.01 },
      { k: 'fill', label: '內部填充', def: 0.16, min: 0, max: 0.8, step: 0.01 }, { k: 'shimmer', label: '流光', def: 1, min: 0, max: 4, step: 1 },
      { k: 'pop', label: '展開時間', def: 0.2, min: 0.02, max: 1, step: 0.01 },
    ],
    draw(S, L) {
      const p = ph(S), g = S.loop ? 1 : ease('outBack', S.lt / L.pop), fade = S.loop ? 1 : 1 - smooth(0.8, 1, S.lt);
      const rr = L.r * g, hiA = -2.2 + TAU * p * cyc(S, L.shimmer), th = Math.max(L.th, 1.2 / S.unit);
      if (rr <= 0) return;
      S.shade((x, y, d) => {
        if (d > rr + th) return 0;
        const q = d / rr;
        let h = Math.max(0, 1 - Math.abs(d - rr) / th) * 1.1;
        if (d < rr) {
          h = Math.max(h, L.fill + 0.35 * q ** 4);
          if (L.hex && hexEdge(x / L.cell, y / L.cell) < 0.13) h = Math.max(h, L.hex * (0.5 + 0.5 * q));
          const hl = Math.max(0, Math.cos(angDiff(Math.atan2(y, x), hiA))) ** 6 * smooth(0.55, 0.95, q);
          h = Math.max(h, hl * 1.15);
        }
        return h * fade;
      }, L.r + L.th + 0.1);
    },
  },

  text: {
    label: '像素文字', solid: false,
    params: [
      { k: 'text', label: '文字', def: 'CRIT!' }, { k: 'scale', label: '倍率', def: 1, min: 1, max: 4, step: 1 },
      { k: 'rise', label: '上飄', def: 0.35, min: -1, max: 1.5, step: 0.01 }, { k: 'pop', label: '彈出', def: true },
      { k: 'fadeStart', label: '淡出開始', def: 0.7, min: 0, max: 1, step: 0.01 },
    ],
    draw(S, L) {
      const lt = ph(S);
      const sc = Math.max(1, Math.round(L.scale)) + (L.pop && !S.loop && lt < 0.1 ? 1 : 0);
      if (!S.loop && lt > L.fadeStart && lt > 0.9 && S.frame % 2) return;
      const { cells, w, h } = layoutText(L.text, sc);
      const [px, py] = S.toPx(0, -L.rise * (S.loop ? 0.5 + 0.5 * Math.sin(TAU * S.t) : ease('outCubic', lt)));
      const x0 = Math.round(px - w / 2), y0 = Math.round(py - h / 2);
      const dim = !S.loop && lt > L.fadeStart ? 0.75 : 1;
      const edge = (L.cut ?? 0.1) + 0.01;
      for (const [cx, cy] of cells) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) S.plot(x0 + cx + dx, y0 + cy + dy, edge);
      for (const [cx, cy, row] of cells) S.plot(x0 + cx, y0 + cy, (1.2 - 0.45 * row) * dim);
    },
  },

  tornado: {
    label: '龍捲風', solid: true,
    params: [
      { k: 'w0', label: '底寬', def: 0.12, min: 0.02, max: 1, step: 0.01 }, { k: 'w1', label: '頂寬', def: 0.6, min: 0.05, max: 1.5, step: 0.01 },
      { k: 'hgt', label: '高度', def: 1.8, min: 0.2, max: 3, step: 0.01 }, { k: 'twist', label: '纏繞', def: 3, min: 0, max: 8, step: 0.1 },
      { k: 'spin', label: '轉速', def: 2, min: 0, max: 6, step: 1 }, { k: 'sway', label: '擺動', def: 0.08, min: 0, max: 0.5, step: 0.01 },
      { k: 'rough', label: '粗糙', def: 0.5, min: 0, max: 1.5, step: 0.01 }, { k: 'dust', label: '底部塵', def: 0.4, min: 0, max: 1, step: 0.01 },
    ],
    draw(S, L) {
      const p = ph(S), sp = cyc(S, L.spin);
      const env = S.loop ? 1 : smooth(0, 0.15, S.lt) * (1 - smooth(0.8, 1, S.lt));
      const g = S.loop ? 1 : ease('outCubic', S.lt / 0.25);
      const [z, pz] = tz(S, 1);
      S.shade((x, y) => {
        let h = 0;
        const v = -y / L.hgt;
        if (v >= 0 && v <= g) {
          const cx = L.sway * Math.sin(v * 4 + TAU * p) * (0.3 + v);
          const u = (x - cx) / lerp(L.w0, L.w1, v ** 1.2);
          if (Math.abs(u) < 1) {
            const th = Math.asin(u);
            const band = 0.5 + 0.5 * Math.cos(th * 3 + v * L.twist * TAU - TAU * p * sp);
            const n = S.noise(x * 5, y * 5, z, 0, 0, pz);
            h = (0.35 + 0.75 * band) * Math.cos(th) ** 0.4 * (1.05 - 0.25 * v) + (n - 0.5) * L.rough;
            if (v > g - 0.08) h *= Math.max(0, (g - v) / 0.08);
          }
        }
        if (L.dust) {
          const bd = Math.hypot(x / (L.w1 * 0.9), (y + 0.02) / 0.12);
          if (bd < 1) h = Math.max(h, (1 - bd) * L.dust * 1.2 + (S.noise(x * 6, y * 6 + 3, z, 0, 0, pz) - 0.5) * 0.5);
        }
        return h * env;
      }, L.hgt + L.w1 + 0.2);
    },
  },
};

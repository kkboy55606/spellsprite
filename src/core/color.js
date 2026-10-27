// Colour: hex <-> rgb, OKLab / OKLCH, hue-shifted ramps, named ramps and
// retro palettes for the palette lock.

import { clamp } from './ease.js';

export function hexToRgb(hex) {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
// Packed as 0xAABBGGRR so a Uint32Array view writes straight into RGBA bytes (little endian).
export const packRGBA = ([r, g, b], a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;

const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklab([r, g, b]) {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

// OKLCH to sRGB, lowering chroma until the colour fits the gamut.
export function oklch(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  for (let c = C; c >= 0; c -= 0.005) {
    const lin = oklabToLinear([L, c * Math.cos(h), c * Math.sin(h)]);
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005)) return lin.map((v) => Math.round(clamp(toSrgb(clamp(v)), 0, 255)));
  }
  return oklabToLinear([L, 0, 0]).map((v) => Math.round(clamp(toSrgb(clamp(v)), 0, 255)));
}

export function toOklch(rgb) {
  const [L, a, b] = rgbToOklab(rgb);
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

// Move hue h toward target by k (0..1) along the shorter arc.
function hueToward(h, target, k) {
  let d = ((target - h + 540) % 360) - 180;
  return (h + d * k + 360) % 360;
}

// A dark-to-light ramp from one hue: shadows lean blue-violet, highlights warm.
export function rampFromHue(hue, n = 7, sat = 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    const L = 0.2 + 0.77 * s ** 0.95;
    const C = sat * 0.19 * Math.sin(Math.PI * Math.min(1, 0.1 + s * 0.98)) ** 0.7;
    const h = s < 0.5 ? hueToward(hue, 275, (0.5 - s) * 0.5) : hueToward(hue, 90, (s - 0.5) * 0.45);
    out.push(oklch(L, C, h));
  }
  return out;
}

// Rotate a ramp's hue and scale its chroma in OKLCH.
export function shiftRamp(rgbs, deg = 0, sat = 1) {
  if (!deg && sat === 1) return rgbs;
  return rgbs.map((c) => {
    const [L, C, h] = toOklch(c);
    return oklch(L, C * sat, (h + deg + 360) % 360);
  });
}

// Named ramps, darkest first. Hand-picked for this project.
const RAMP_HEX = {
  fire: '2a0f1e 6b1a1f b5301d e8651a f9a12e fdd65b fff6c4',
  lava: '1f0a14 4d0f1a 8f1d18 d1401a f27b20 ffc04a fff0a8',
  ember: '2b1210 5e2216 9c3a1a d6641f f39c3a ffd27a',
  ice: '101a3a 1e3a6e 2f6aa8 4ea3d8 86d3ef c4f0fb f4ffff',
  frost: '1c2440 34507a 5b86b0 8fb9d6 c6e2ef f2fbff',
  electric: '140f3a 2c2a7a 3f5bd0 4fa3ff 8fe0ff d8fbff ffffff',
  thunder: '1a1036 3d2a7d 6a4fd1 a088ff d0c4ff f6f1ff',
  poison: '10200f 1f4a1a 3a7d22 6fb52c a8e04a dcf98a',
  holy: '3a2a12 7a5a1e c0922e eac35a f8e58c fff8d2 ffffff',
  shadow: '0b0712 1d1230 35204f 543078 7a49a6 a77fd4 d6c2f2',
  void: '07040b 160b24 2d1040 4c1466 7a1f8f b13aa8 e77cc9',
  arcane: '1a0d33 3b1a6e 6a2fb0 9b54e0 c58af5 ecc8ff',
  nature: '0f2214 1d4424 2f6e2e 4f9b34 86c443 c3e670 f0fbb4',
  water: '0b1838 123d6b 1c66a0 2c95cc 5cc4e6 a5e8f5 eafcff',
  blood: '1a0509 450a13 7d1220 b51c29 e0403a f57b62',
  earth: '1e140e 3d2a1b 63452a 8c6539 b38c52 d6b77c',
  smoke: '1c1a24 34313f 4f4b5a 6d6878 908a99 b5afbb',
  dust: '2b2420 4d4136 75634f 9c8869 c2ad88 e0d0ae',
  ash: '141214 2a2629 46403f 6a625c 948a7f',
  wind: '1b2b3a 2f4c5e 4e7a8a 7aaab0 b0d8d4 e6fbf5',
  plasma: '0d1030 1a2a6e 1f5ab8 22a0e8 3fe0f0 a8fff5 ffffff',
  energy: '1f0b33 4a1373 8a1fa8 d02fc0 ff5fb5 ffa8d8 fff0f8',
  gold: '2e1a08 5e3a0e 9a6414 d09a1c f2cc3f fdf08a fffbe0',
  solar: '3a1206 7a2a0a c45210 f08a1c fcc23a fff07a ffffff',
  steel: '1a1d26 333a4a 556075 7f8ca3 b1bccd e3e9f2',
  spirit: '0a1f24 13403f 1d6e62 2fa38a 5fd6b0 a8f5d8 ecfff6',
  rose: '2a0a1c 5c1238 9a1f55 d63a7a f26fa1 fbb0cc fff0f6',
  white: '5a5f78 8a90a8 b8bfd2 e2e7f0 ffffff',
  rainbow: '3a2a8a d43a3a f08a2a f6d23a 5ccf4a 3aa8e0 c8f0ff',
};
export const RAMPS = Object.fromEntries(Object.entries(RAMP_HEX).map(([k, v]) => [k, v.split(' ').map(hexToRgb)]));

export const RAMP_LABELS = {
  fire: '火焰', lava: '熔岩', ember: '餘燼', ice: '寒冰', frost: '霜', electric: '電光', thunder: '雷霆',
  poison: '劇毒', holy: '聖光', shadow: '暗影', void: '虛空', arcane: '奧術', nature: '自然', water: '水',
  blood: '血', earth: '大地', smoke: '煙', dust: '塵', ash: '灰燼', wind: '風', plasma: '電漿', energy: '能量',
  gold: '黃金', solar: '烈日', steel: '鋼鐵', spirit: '靈魂', rose: '玫瑰', white: '白光', rainbow: '彩虹',
};

const PALETTE_HEX = {
  pico8: '000000 1d2b53 7e2553 008751 ab5236 5f574f c2c3c7 fff1e8 ff004d ffa300 ffec27 00e436 29adff 83769c ff77a8 ffccaa',
  sweetie16: '1a1c2c 5d275d b13e53 ef7d57 ffcd75 a7f070 38b764 257179 29366f 3b5dc9 41a6f6 73eff7 f4f4f4 94b0c2 566c86 333c57',
  endesga32: 'be4a2f d77643 ead4aa e4a672 b86f50 733e39 3e2731 a22633 e43b44 f77622 feae34 fee761 63c74d 3e8948 265c42 193c3e 124e89 0099db 2ce8f5 ffffff c0cbdc 8b9bb4 5a6988 3a4466 262b44 181425 ff0044 68386c b55088 f6757a e8b796 c28569',
  gameboy: '0f380f 306230 8bac0f 9bbc0f',
  onebit: '000000 ffffff',
};
export const PALETTES = Object.fromEntries(Object.entries(PALETTE_HEX).map(([k, v]) => [k, v.split(' ').map(hexToRgb)]));
export const PALETTE_LABELS = { pico8: 'PICO-8', sweetie16: 'Sweetie 16', endesga32: 'Endesga 32', gameboy: 'Game Boy', onebit: '1-bit 黑白' };

// A ramp spec is a ramp name, "hue:<deg>", or a list of hex colours (dark to light).
export function resolveRamp(spec, hue = 0, sat = 1) {
  let base;
  if (Array.isArray(spec) && spec.length) base = spec.map(hexToRgb);
  else if (typeof spec === 'string' && spec.startsWith('hue:')) base = rampFromHue(Number(spec.slice(4)) || 0, 7, 1);
  else base = RAMPS[spec] || RAMPS.fire;
  return shiftRamp(base, hue, sat);
}

export function resolvePalette(spec) {
  if (!spec) return null;
  if (Array.isArray(spec)) return spec.length ? spec.map(hexToRgb) : null;
  return PALETTES[spec] || null;
}

// Nearest palette colour by OKLab distance. Returns an [r, g, b].
export function makeNearest(palette) {
  const labs = palette.map(rgbToOklab);
  return (rgb) => {
    const [L, a, b] = rgbToOklab(rgb);
    let best = 0, bd = Infinity;
    for (let i = 0; i < labs.length; i++) {
      const d = (labs[i][0] - L) ** 2 + (labs[i][1] - a) ** 2 + (labs[i][2] - b) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return palette[best];
  };
}

export const darken = ([r, g, b], k = 0.6) => [r * k, g * k, b * k].map(Math.round);

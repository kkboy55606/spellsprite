// 3D gradient noise with optional integer periods on each axis.
// Periods make noise tile, which is how loops close seamlessly: time (or a
// scroll offset) runs over a whole number of periods across the loop.

import { hashInt } from './rng.js';

const GX = new Float32Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, -1, 0, 0]);
const GY = new Float32Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, 1, -1, -1]);
const GZ = new Float32Array([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 0, 1, -1]);

const wrap = (i, p) => (p > 0 ? ((i % p) + p) % p : i);
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function corner(ix, iy, iz, seed, x, y, z) {
  const h = hashInt(Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(iz, 0x1b873593) ^ Math.imul(seed, 0x9e3779b1)) & 15;
  return GX[h] * x + GY[h] * y + GZ[h] * z;
}

// Signed noise, roughly in [-1, 1].
export function noise3(x, y, z, seed = 0, px = 0, py = 0, pz = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const fx = x - x0, fy = y - y0, fz = z - z0;
  const xa = wrap(x0, px), xb = wrap(x0 + 1, px);
  const ya = wrap(y0, py), yb = wrap(y0 + 1, py);
  const za = wrap(z0, pz), zb = wrap(z0 + 1, pz);
  const u = fade(fx), v = fade(fy), w = fade(fz);
  const n000 = corner(xa, ya, za, seed, fx, fy, fz);
  const n100 = corner(xb, ya, za, seed, fx - 1, fy, fz);
  const n010 = corner(xa, yb, za, seed, fx, fy - 1, fz);
  const n110 = corner(xb, yb, za, seed, fx - 1, fy - 1, fz);
  const n001 = corner(xa, ya, zb, seed, fx, fy, fz - 1);
  const n101 = corner(xb, ya, zb, seed, fx - 1, fy, fz - 1);
  const n011 = corner(xa, yb, zb, seed, fx, fy - 1, fz - 1);
  const n111 = corner(xb, yb, zb, seed, fx - 1, fy - 1, fz - 1);
  const x00 = n000 + u * (n100 - n000), x10 = n010 + u * (n110 - n010);
  const x01 = n001 + u * (n101 - n001), x11 = n011 + u * (n111 - n011);
  const y0v = x00 + v * (x10 - x00), y1v = x01 + v * (x11 - x01);
  return y0v + w * (y1v - y0v);
}

// Fractal noise mapped to roughly [0, 1]. Each octave doubles frequency and
// period, so periodic inputs stay periodic.
export function fbm3(x, y, z, seed = 0, oct = 3, px = 0, py = 0, pz = 0) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < oct; o++) {
    sum += amp * noise3(x * f, y * f, z * f, seed + o * 131, px * f, py * f, pz * f);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  const v = 0.5 + 0.62 * (sum / norm);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

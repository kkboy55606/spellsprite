import test from 'node:test';
import assert from 'node:assert/strict';
import { keyOutBackground, cropOpaque, shrink, findTip, wizard, slime, scene, STAGE_W, STAGE_H } from '../src/app/sprites.js';

// A w x h image filled with `bg`, with an opaque `fg` rectangle.
function img(w, h, bg, fg, [x0, y0, x1, y1], alpha = 255) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inside = x >= x0 && x < x1 && y >= y0 && y < y1, c = inside ? fg : bg, i = (y * w + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = inside ? 255 : alpha;
  }
  return d;
}
const opaque = (d) => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; };

test('auto background removal clears a flat backdrop and keeps the sprite', () => {
  const d = img(20, 20, [0, 200, 0], [200, 30, 30], [5, 5, 15, 15]);
  assert.equal(keyOutBackground(d, 20, 20), true);
  assert.equal(opaque(d), 100);
});

test('auto background removal leaves images that already have transparency', () => {
  const d = img(10, 10, [0, 0, 0], [255, 255, 255], [2, 2, 8, 8], 0);
  assert.equal(keyOutBackground(d, 10, 10), false);
  assert.equal(opaque(d), 36);
});

test('background removal only floods from the border (inner pixels of the same colour stay)', () => {
  const d = img(12, 12, [10, 10, 10], [240, 240, 240], [2, 2, 10, 10]);
  const i = (6 * 12 + 6) * 4; d[i] = 10; d[i + 1] = 10; d[i + 2] = 10;
  keyOutBackground(d, 12, 12);
  assert.equal(d[i + 3], 255);
});

test('crop trims to opaque content', () => {
  const d = img(30, 20, [0, 0, 0], [9, 9, 9], [4, 3, 14, 18], 0);
  const c = cropOpaque(d, 30, 20);
  assert.deepEqual([c.w, c.h], [10, 15]);
  assert.equal(opaque(c.rgba), 150);
});

test('shrink by a whole factor keeps hard pixels', () => {
  const d = img(8, 8, [0, 0, 0], [255, 0, 0], [0, 0, 4, 8], 0);
  const s = shrink(d, 8, 8, 2);
  assert.deepEqual([s.w, s.h], [4, 4]);
  for (let i = 3; i < s.rgba.length; i += 4) assert.ok(s.rgba[i] === 0 || s.rgba[i] === 255);
  assert.equal(opaque(s.rgba), 8);
});

test('staff tip is the rightmost opaque pixel in the upper part', () => {
  const d = img(10, 20, [0, 0, 0], [1, 1, 1], [2, 2, 5, 19], 0);
  d[(3 * 10 + 8) * 4 + 3] = 255;
  assert.deepEqual(findTip(d, 10, 20), [8, 3]);
});

test('built-in art has the expected sizes and the wizard tip is on the crystal', () => {
  const w = wizard();
  assert.deepEqual([w.w, w.h], [20, 30]);
  assert.ok(w.rgba[(w.tip[1] * w.w + w.tip[0]) * 4 + 3] > 0);
  assert.deepEqual([slime().w, slime().h], [26, 20]);
  const s = scene();
  assert.deepEqual([s.w, s.h], [STAGE_W, STAGE_H]);
  assert.equal(opaque(s.rgba), STAGE_W * STAGE_H);
});

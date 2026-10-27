import test from 'node:test';
import assert from 'node:assert/strict';
import { render, prepare, renderFrame, normalize, KIND_LIST, layerDefaults } from '../src/core/engine.js';
import { PALETTES, packRGBA, RAMPS } from '../src/core/color.js';
import { noise3 } from '../src/core/noise.js';

const opaque = (f) => { let c = 0; for (let i = 3; i < f.length; i += 4) if (f[i]) c++; return c; };
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const LOOPERS = ['flame', 'orb', 'vortex', 'tornado', 'shield', 'beam', 'comet', 'pillar', 'rays', 'sigil', 'smoke', 'particles', 'streaks', 'text'];

test('same recipe and seed give identical frames', () => {
  const r = { w: 48, h: 48, frames: 8, seed: 5, layers: [{ kind: 'blast' }, { kind: 'particles', count: 20 }] };
  const a = render(r), b = render(r);
  a.frames.forEach((f, i) => assert.ok(same(f, b.frames[i]), `frame ${i} differs`));
});

test('a different seed changes the frames', () => {
  const r = { w: 48, h: 48, frames: 8, layers: [{ kind: 'blast' }] };
  const a = render({ ...r, seed: 1 }), b = render({ ...r, seed: 2 });
  assert.ok(a.frames.some((f, i) => !same(f, b.frames[i])));
});

test('every layer kind paints pixels with its defaults', () => {
  for (const kind of KIND_LIST) {
    const extra = { flame: { y: 0.5 }, pillar: { y: 0.8 }, tornado: { y: 0.8 }, spikes: { y: 0.6 }, beam: { x: -0.8 } }[kind] || {};
    const res = render({ w: 64, h: 64, frames: 12, seed: 3, layers: [{ kind, ...extra }] });
    const total = res.frames.reduce((s, f) => s + opaque(f), 0);
    assert.ok(total > 0, `${kind} painted nothing`);
  }
});

test('loops close: the frame at t=1 equals the first frame', () => {
  const extra = { flame: { y: 0.5 }, pillar: { y: 0.8 }, tornado: { y: 0.8 }, beam: { x: -0.8 }, particles: { mode: 'orbit' } };
  for (const kind of LOOPERS) {
    const P = prepare({ w: 48, h: 48, frames: 10, loop: true, seed: 2, layers: [{ kind, ...(extra[kind] || {}) }] });
    assert.ok(same(renderFrame(P, 0), renderFrame(P, 10)), `${kind} loop pops`);
  }
});

test('periodic noise tiles on its period', () => {
  for (const [x, y] of [[0.3, 1.7], [2.2, 0.4]]) {
    assert.ok(Math.abs(noise3(x, y, 0.5, 9, 0, 0, 4) - noise3(x, y, 4.5, 9, 0, 0, 4)) < 1e-9);
    assert.ok(Math.abs(noise3(x, y, 0.5, 9, 0, 8, 0) - noise3(x, y + 8, 0.5, 9, 0, 8, 0)) < 1e-9);
  }
});

test('negative heat stays transparent (regression: flames filled their whole box)', () => {
  const res = render({ w: 64, h: 64, frames: 6, loop: true, layers: [{ kind: 'flame', y: 0.5 }] });
  for (const f of res.frames) assert.ok(opaque(f) < 64 * 64 * 0.4, 'flame covers too much of the canvas');
  const late = render({ w: 64, h: 64, frames: 16, layers: [{ kind: 'blast' }] }).frames[15];
  assert.ok(opaque(late) < 64 * 64 * 0.1, 'blast leaves a dark blob at the end');
});

test('a dark vortex core paints the darkest ramp colour', () => {
  const res = render({ w: 64, h: 64, frames: 4, loop: true, colors: { main: 'void' }, layers: [{ kind: 'vortex', core: 'dark', rIn: 0.3 }] });
  const f = res.frames[0], i = (32 * 64 + 32) * 4;
  assert.deepEqual([f[i], f[i + 1], f[i + 2], f[i + 3]], [...RAMPS.void[0], 255]);
});

test('palette lock leaves only palette colours', () => {
  const res = render({ w: 48, h: 48, frames: 6, palette: 'pico8', layers: [{ kind: 'blast' }, { kind: 'ring' }] });
  const allowed = new Set(PALETTES.pico8.map((c) => packRGBA(c)));
  for (const f of res.frames) {
    const u = new Uint32Array(f.buffer);
    for (const c of u) if (c) assert.ok(allowed.has(c), 'colour outside palette');
  }
});

test('outer outline adds pixels around shapes', () => {
  const base = { w: 48, h: 48, frames: 4, layers: [{ kind: 'orb' }], loop: true };
  const a = render(base).frames[1], b = render({ ...base, outline: 'outer' }).frames[1];
  assert.ok(opaque(b) > opaque(a));
});

test('normalize clamps sizes and drops unknown layer kinds', () => {
  const r = normalize({ w: 4000, h: 2, frames: 999, layers: [{ kind: 'nope' }, { kind: 'ring' }] });
  assert.equal(r.w, 512); assert.equal(r.h, 8); assert.equal(r.frames, 120);
  assert.equal(r.layers.length, 1);
  assert.equal(r.layers[0].r1, layerDefaults('ring').r1);
});

test('impact frame: inside the effect for one-shots, null for loops', () => {
  const one = render({ w: 48, h: 48, frames: 16, layers: [{ kind: 'blast' }] });
  assert.ok(one.impact >= 0 && one.impact < 16);
  assert.equal(render({ w: 32, h: 32, frames: 8, loop: true, layers: [{ kind: 'orb' }] }).impact, null);
});

test('hidden layers are skipped', () => {
  const res = render({ w: 32, h: 32, frames: 3, layers: [{ kind: 'flash', hidden: true }] });
  assert.equal(opaque(res.frames[0]), 0);
});

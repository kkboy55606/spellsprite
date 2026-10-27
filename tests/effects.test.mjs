// Readability floors for effects that were tuned by eye. If a later change
// makes one of them weak again, these fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../src/core/engine.js';
import { LIBRARY, recipeFor } from '../src/core/library.js';
import { metrics } from '../tools/fx-metrics.mjs';
import { interpret } from '../src/core/interpret.js';

const lib = (id) => render(recipeFor(LIBRARY.find((e) => e.id === id)));
const lum = (f, i) => 0.2126 * f[i] + 0.7152 * f[i + 1] + 0.0722 * f[i + 2];

test('flame hollow really empties the middle (regression: auras were filled blobs)', () => {
  const share = (hollow) => {
    const res = render({ w: 64, h: 64, frames: 8, loop: true, seed: 4, layers: [{ kind: 'flame', y: 0.8, w: 0.7, hgt: 1.5, hollow, gain: 1.5 }] });
    let hit = 0, all = 0;
    for (const f of res.frames) for (let y = 40; y < 56; y++) for (let x = 28; x < 36; x++) { all++; if (f[(y * 64 + x) * 4 + 3]) hit++; }
    return hit / all;
  };
  assert.ok(share(0) > 0.8, 'solid flame should fill its middle');
  assert.ok(share(1) < 0.15, `hollow flame middle still ${share(1).toFixed(2)} filled`);
});

test('coins have a darker rim than their face', () => {
  const res = render({ w: 24, h: 24, frames: 1, colors: { main: 'gold' }, layers: [{ kind: 'particles', mode: 'burst', count: 1, speed: [0, 0], shape: 'coin', size: [4, 4], heat: [1, 1], area: 0 }] });
  const f = res.frames[0], row = 12;
  let left = -1;
  for (let x = 0; x < 24; x++) if (f[(row * 24 + x) * 4 + 3]) { left = x; break; }
  assert.ok(left >= 0, 'coin not drawn');
  assert.ok(lum(f, (row * 24 + left) * 4) < lum(f, (row * 24 + 12) * 4), 'rim is not darker than the face');
});

test('shadow aura: hollow shape that reaches its light colours', () => {
  const m = metrics(lib('shadow-aura'));
  assert.ok(m.bright >= 0.03, `bright share ${m.bright}`);
  assert.ok(m.lum >= 0.17, `mean brightness ${m.lum}`);
});

test('dragon breath is one joined stream, not scattered puffs', () => {
  const m = metrics(lib('dragon-breath'));
  assert.ok(m.blobs <= 4, `${m.blobs} separate blobs`);
  assert.ok(m.cover >= 0.2, `cover ${m.cover}`);
});

test('splash and slash are big enough to read', () => {
  assert.ok(metrics(lib('torrent-splash')).cover >= 0.09);
  assert.ok(metrics(lib('steel-slash')).cover >= 0.12);
});

test('heals are light and glowing, not dark tubes', () => {
  for (const id of ['verdant-heal', 'heart-heal']) {
    const m = metrics(lib(id));
    assert.ok(m.lum >= 0.45 && m.bright >= 0.3, `${id}: ${JSON.stringify(m)}`);
  }
});

test('sparkle and blessing are big enough to read', () => {
  for (const id of ['glitter', 'blessing']) assert.ok(metrics(lib(id)).cover >= 0.15, id);
});

test('speed lines and wind arcs are level (regression: they inherited the 55 degree claw angle)', () => {
  for (const p of ['dash', 'gust']) {
    for (const L of interpret(p, 1).recipe.layers.filter((l) => l.kind === 'streaks')) assert.equal(L.angle, 0, `${p}: streaks angle ${L.angle}`);
  }
  const res = lib('gale-dash'), f = res.frames[3];
  let runs = 0;
  for (let y = 0; y < res.h; y++) {
    let run = 0;
    for (let x = 0; x <= res.w; x++) {
      if (x < res.w && f[(y * res.w + x) * 4 + 3]) run++;
      else { if (run >= 4) runs++; run = 0; }
    }
  }
  assert.ok(runs >= 8, `only ${runs} horizontal runs`);
});

test('fireflies are glowing blobs, not single pixels', () => {
  const res = lib('fireflies'), m = metrics(res);
  assert.ok((m.cover * res.w * res.h) / m.blobs >= 4, `about ${((m.cover * res.w * res.h) / m.blobs).toFixed(1)} px per mote`);
});

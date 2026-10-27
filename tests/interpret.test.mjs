import test from 'node:test';
import assert from 'node:assert/strict';
import { interpret, parse, FORM_LIST, FORMS } from '../src/core/interpret.js';
import { render, KIND_LIST } from '../src/core/engine.js';
import { LIBRARY, GROUPS, recipeFor } from '../src/core/library.js';

const opaque = (f) => { let c = 0; for (let i = 3; i < f.length; i += 4) if (f[i]) c++; return c; };
const labels = (r) => r.chips.map((c) => c.label);

test('Chinese and English black hole prompts read the same', () => {
  for (const p of ['紫色黑洞漩渦', 'purple black hole vortex']) {
    const r = interpret(p, 1);
    assert.equal(r.form, 'blackhole');
    assert.equal(r.element, 'void');
    assert.ok(labels(r).includes('紫色'));
    assert.equal(r.recipe.colors.main, 'hue:310');
    assert.ok(r.recipe.layers.some((L) => L.kind === 'vortex' && L.core === 'dark'));
  }
});

test('火焰 is the fire element, not the flame form (regression)', () => {
  const r = interpret('巨大火焰爆炸', 1);
  assert.equal(r.form, 'explosion');
  assert.equal(r.element, 'fire');
  assert.equal(r.recipe.w, 96);
  assert.equal(interpret('火焰龍捲風', 1).form, 'tornado');
});

test('words with no form or element do not match', () => {
  assert.equal(interpret('hello world').matched, false);
  assert.deepEqual(interpret('hello world').chips, []);
});

test('unknown words shift the seed but stay stable', () => {
  const a = interpret('fire explosion', 4).recipe.seed;
  const b = interpret('fire explosion banana', 4).recipe.seed;
  assert.notEqual(a, b);
  assert.equal(b, interpret('fire explosion banana', 4).recipe.seed);
});

test('stop words are removed as whole words only (regression)', () => {
  assert.equal(parse('falling sakura petals with a glow').unknown, 'falling glow');
});

test('"then" plays a second form after the first', () => {
  const r = interpret('sword slash then explosion', 1);
  assert.ok(labels(r).includes('接著爆炸'));
  const blast = r.recipe.layers.find((L) => L.kind === 'blast');
  assert.ok(blast.from >= 0.45);
  assert.ok(r.recipe.layers.find((L) => L.kind === 'slash').to <= 0.55);
});

test('direction words mirror facing effects', () => {
  const r = interpret('向左的血色爪擊', 1);
  assert.equal(r.form, 'claw');
  assert.equal(r.element, 'blood');
  assert.equal(r.recipe.layers.find((L) => L.kind === 'streaks').angle, 125);
});

test('numbers become damage text', () => {
  const r = interpret('critical hit 999', 1);
  assert.equal(r.form, 'damage');
  assert.equal(r.recipe.layers.find((L) => L.kind === 'text').text, '999!');
});

test('modifiers: loop, palette, outline, speed', () => {
  const r = interpret('slow fire explosion loop pico8 outlined', 1).recipe;
  assert.equal(r.loop, true); assert.equal(r.palette, 'pico8'); assert.equal(r.outline, 'outer');
  assert.ok(interpret('slow fire explosion', 1).recipe.frames > interpret('fire explosion', 1).recipe.frames);
});

test('every form builds layers the engine knows and renders pixels', () => {
  for (const id of FORM_LIST) {
    const word = FORMS[id].words[0];
    const { recipe } = interpret(word, 2);
    for (const L of recipe.layers) assert.ok(KIND_LIST.includes(L.kind), `${id}: unknown kind ${L.kind}`);
    const res = render(recipe);
    assert.ok(res.frames.some((f) => opaque(f) > 0), `${id} renders nothing`);
  }
});

test('library: unique ids, known groups, every prompt is understood and renders', () => {
  const ids = new Set(LIBRARY.map((e) => e.id));
  assert.equal(ids.size, LIBRARY.length);
  const groups = new Set(GROUPS.map((g) => g.id));
  for (const e of LIBRARY) {
    assert.ok(groups.has(e.group), e.id);
    assert.ok(interpret(e.prompt, e.seed).matched, `${e.id} prompt not understood`);
    const res = render(recipeFor(e));
    assert.ok(res.frames.some((f) => opaque(f) > 0), `${e.id} renders nothing`);
  }
});

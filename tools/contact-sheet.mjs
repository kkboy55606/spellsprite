#!/usr/bin/env node
// Render effects onto one grid PNG for judging by eye.
//   node tools/contact-sheet.mjs kinds          every layer kind alone, default settings
//   node tools/contact-sheet.mjs library [a-b]  library effects (optionally a slice)
//   node tools/contact-sheet.mjs prompt "..."   one prompt
import fs from 'node:fs';
import path from 'node:path';
import { render, KIND_LIST } from '../src/core/engine.js';
import { contactSheet } from './png.mjs';

const [mode = 'kinds', arg] = process.argv.slice(2);
const outDir = path.resolve('out');
fs.mkdirSync(outDir, { recursive: true });

const KIND_COLORS = { flash: 'white', blast: 'fire', ring: 'ice', flame: 'fire', beam: 'plasma', slash: 'steel', orb: 'arcane', comet: 'fire', vortex: 'void', pillar: 'holy', rays: 'gold', sigil: 'arcane', smoke: 'smoke', particles: 'fire', bolt: 'electric', cracks: 'lava', spikes: 'ice', star: 'gold', streaks: 'blood', shield: 'water', text: 'gold', tornado: 'wind' };
const KIND_EXTRA = {
  flame: { y: 0.55 }, pillar: { y: 0.8 }, tornado: { y: 0.8 }, spikes: { y: 0.6 }, cracks: { y: 0.3 },
  beam: { x: -0.85 }, comet: { x: 0.4, }, particles: { count: 24 }, bolt: { count: 4 },
};
const LOOPING = new Set(['flame', 'orb', 'vortex', 'tornado', 'shield']);

let rows = [];
if (mode === 'kinds') {
  rows = KIND_LIST.map((kind) => {
    const r = render({ name: kind, w: 64, h: 64, frames: 16, seed: 3, loop: LOOPING.has(kind), colors: { main: KIND_COLORS[kind] || 'fire' }, layers: [{ kind, ...(KIND_EXTRA[kind] || {}) }] });
    return { label: kind, ...r };
  });
} else if (mode === 'library') {
  const { LIBRARY, recipeFor } = await import('../src/core/library.js');
  const [a, b] = (arg || `0-${LIBRARY.length}`).split('-').map(Number);
  rows = LIBRARY.slice(a, b).map((e) => ({ label: e.id, ...render(recipeFor(e)) }));
} else if (mode === 'prompt') {
  const { interpret } = await import('../src/core/interpret.js');
  const { recipe, chips } = interpret(arg);
  console.log(chips.map((c) => c.label).join(' · '), recipe.layers.map((l) => l.kind).join(','));
  rows = [{ label: arg, ...render(recipe) }];
}
const file = path.join(outDir, `sheet-${mode}.png`);
fs.writeFileSync(file, contactSheet(rows, 8, mode === 'prompt' ? 4 : 2));
console.log(rows.map((r, i) => `${i}: ${r.label} (${r.w}x${r.h}, ${r.frames.length}f${r.loop ? ', loop' : ''})`).join('\n'));
console.log('wrote ' + file);

#!/usr/bin/env node
// Render the built-in stage art (scene + caster + target) to out/stage.png at 2x.
import fs from 'node:fs';
import { scene, wizard, slime, STAGE_W, STAGE_H, FLOOR_Y } from '../src/app/sprites.js';
import { encodePNG } from './png.mjs';
import { scaleRGBA } from '../src/export/formats.js';

const s = scene(), wz = wizard(), sl = slime();
const put = (spr, cx) => {
  const ox = Math.round(cx - spr.w / 2), oy = FLOOR_Y - spr.h;
  for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) {
    const a = (y * spr.w + x) * 4;
    if (!spr.rgba[a + 3]) continue;
    const b = ((oy + y) * STAGE_W + ox + x) * 4;
    s.rgba.set(spr.rgba.subarray(a, a + 4), b);
  }
};
put(wz, 96); put(sl, 290);
fs.mkdirSync('out', { recursive: true });
fs.writeFileSync('out/stage.png', encodePNG(STAGE_W * 2, STAGE_H * 2, scaleRGBA(s.rgba, STAGE_W, STAGE_H, 2)));
console.log('wrote out/stage.png', 'wizard', wz.w + 'x' + wz.h, 'slime', sl.w + 'x' + sl.h);

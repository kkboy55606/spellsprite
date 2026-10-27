#!/usr/bin/env node
// Print readability numbers for library effects: peak coverage, mean
// brightness of painted pixels, share of bright pixels, and how many separate
// blobs the fullest frame breaks into.
//   node tools/fx-metrics.mjs [id ...]
import { render } from '../src/core/engine.js';
import { LIBRARY, recipeFor } from '../src/core/library.js';

export function metrics(res) {
  const { w, h, frames } = res;
  let maxCov = 0, lum = 0, n = 0, bright = 0, peak = 0;
  frames.forEach((f, k) => {
    let c = 0;
    for (let i = 0; i < f.length; i += 4) {
      if (!f[i + 3]) continue;
      c++; n++;
      const l = (0.2126 * f[i] + 0.7152 * f[i + 1] + 0.0722 * f[i + 2]) / 255;
      lum += l; if (l > 0.6) bright++;
    }
    if (c > maxCov) { maxCov = c; peak = k; }
  });
  // 8-connected blobs on the fullest frame
  const f = frames[peak], seen = new Uint8Array(w * h);
  let blobs = 0;
  for (let p = 0; p < w * h; p++) {
    if (seen[p] || !f[p * 4 + 3]) continue;
    blobs++;
    const st = [p]; seen[p] = 1;
    while (st.length) {
      const q = st.pop(), x = q % w, y = (q / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, r = Y * w + X;
        if (X < 0 || Y < 0 || X >= w || Y >= h || seen[r] || !f[r * 4 + 3]) continue;
        seen[r] = 1; st.push(r);
      }
    }
  }
  return { cover: +(maxCov / (w * h)).toFixed(3), lum: +(n ? lum / n : 0).toFixed(3), bright: +(n ? bright / n : 0).toFixed(3), blobs };
}

if (process.argv[1]?.endsWith('fx-metrics.mjs')) {
  const ids = process.argv.slice(2);
  for (const e of LIBRARY.filter((x) => !ids.length || ids.includes(x.id))) console.log(e.id.padEnd(16), JSON.stringify(metrics(render(recipeFor(e)))));
}

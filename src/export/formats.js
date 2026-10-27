// Sheet layout, TexturePacker/Aseprite-style atlas JSON, Godot 4 SpriteFrames
// and the README that goes into the game-ready ZIP.

export const stemOf = (name) => String(name || 'effect').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'effect';

// One row while it fits in 4096 px, then a near-square grid.
export function sheetLayout(n, w, h) {
  const cols = n * w <= 4096 ? n : Math.max(1, Math.ceil(Math.sqrt((n * h) / w)));
  return { cols, rows: Math.ceil(n / cols), w, h };
}

export function scaleRGBA(src, w, h, s) {
  if (s === 1) return src;
  const out = new Uint8ClampedArray(w * s * h * s * 4);
  for (let y = 0; y < h * s; y++) for (let x = 0; x < w * s; x++) {
    const a = ((Math.floor(y / s) * w) + Math.floor(x / s)) * 4, b = (y * w * s + x) * 4;
    out[b] = src[a]; out[b + 1] = src[a + 1]; out[b + 2] = src[a + 2]; out[b + 3] = src[a + 3];
  }
  return out;
}

export function buildSheet(frames, w, h, scale = 1) {
  const L = sheetLayout(frames.length, w, h);
  const SW = L.cols * w * scale, SH = L.rows * h * scale;
  const out = new Uint8ClampedArray(SW * SH * 4);
  frames.forEach((f, i) => {
    const big = scaleRGBA(f, w, h, scale);
    const ox = (i % L.cols) * w * scale, oy = Math.floor(i / L.cols) * h * scale;
    for (let y = 0; y < h * scale; y++) out.set(big.subarray(y * w * scale * 4, (y + 1) * w * scale * 4), ((oy + y) * SW + ox) * 4);
  });
  return { width: SW, height: SH, rgba: out, layout: L };
}

const rect = (L, i, s) => ({ x: (i % L.cols) * L.w * s, y: Math.floor(i / L.cols) * L.h * s, w: L.w * s, h: L.h * s });

export function atlasJSON(stem, L, n, { fps, loop, impact, pivot, scale = 1 }) {
  const frames = {};
  for (let i = 0; i < n; i++) {
    const r = rect(L, i, scale);
    frames[`${stem}_${String(i).padStart(2, '0')}.png`] = {
      frame: r, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h }, sourceSize: { w: r.w, h: r.h },
      pivot: { x: pivot[0], y: pivot[1] }, duration: Math.round(1000 / fps),
    };
  }
  return JSON.stringify({
    frames,
    meta: {
      app: 'Pixel FX Studio', version: '1', image: `${stem}.png`, format: 'RGBA8888',
      size: { w: L.cols * L.w * scale, h: L.rows * L.h * scale }, scale: String(scale),
      frameTags: [{ name: stem, from: 0, to: n - 1, direction: 'forward' }],
      fps, loop, impactFrame: impact, pivot,
    },
  }, null, 2);
}

export function godotTres(stem, L, n, { fps, loop, scale = 1 }) {
  const lines = [`[gd_resource type="SpriteFrames" load_steps=${n + 2} format=3]`, '', `[ext_resource type="Texture2D" path="res://${stem}.png" id="1_sheet"]`, ''];
  for (let i = 0; i < n; i++) {
    const r = rect(L, i, scale);
    lines.push(`[sub_resource type="AtlasTexture" id="AtlasTexture_${i}"]`, 'atlas = ExtResource("1_sheet")', `region = Rect2(${r.x}, ${r.y}, ${r.w}, ${r.h})`, '');
  }
  lines.push('[resource]', 'animations = [{', '"frames": [' + Array.from({ length: n }, (_, i) => `{\n"duration": 1.0,\n"texture": SubResource("AtlasTexture_${i}")\n}`).join(', ') + '],',
    `"loop": ${loop ? 'true' : 'false'},`, `"name": &"${stem}",`, `"speed": ${Number(fps).toFixed(1)}`, '}]', '');
  return lines.join('\n');
}

export function readme(stem, { name, w, h, n, fps, loop, impact, pivot }) {
  return `${name} — Pixel FX Studio

${n} 幀 · ${w}x${h} px · ${fps} fps · ${loop ? '循環' : '單次'}${impact != null ? ` · 命中幀 ${impact}` : ''}
錨點 (pivot)：${pivot[0]}, ${pivot[1]}（0–1，相對畫布）

檔案
  ${stem}.png            精靈圖（一列，超過 4096 px 換成網格）
  ${stem}.json           atlas（TexturePacker JSON Hash，含 Aseprite frameTags）
  ${stem}.tres           Godot 4 SpriteFrames（貼圖路徑 res://${stem}.png，放別處要改路徑）
  ${stem}@1x.gif / @4x.gif
  frames/                單張影格
  ${stem}.recipe.json    配方，可在 Pixel FX Studio 用「貼上配方」載回

Godot 4：把 png 與 tres 放進專案，AnimatedSprite2D 的 Sprite Frames 指到 tres，
  Texture Filter 設成 Nearest。
Unity：Sprite Mode = Multiple，Filter Mode = Point，Compression = None，
  依 ${w}x${h} 切格。
放大請用整數倍並關閉平滑，才不會糊掉像素。
`;
}

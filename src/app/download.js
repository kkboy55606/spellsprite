// Download sheet. Loaded the first time it opens; everything is encoded here
// in the browser.

import { encodeGIF } from '../export/gif.js';
import { makeZip } from '../export/zip.js';
import { encodeVideo } from '../export/mp4.js';
import { buildSheet, scaleRGBA, atlasJSON, godotTres, readme } from '../export/formats.js';
import { layoutText } from '../core/font.js';

const $ = (id) => document.getElementById(id);

function pngBlob(rgba, w, h) {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}
const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());

function paintFill(g, W, H, bgFill) {
  if (!bgFill) return;
  if (bgFill.checker) {
    for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) { g.fillStyle = ((x + y) / 4) % 2 ? '#1a1824' : '#2a2838'; g.fillRect(x, y, 4, 4); }
  } else { g.fillStyle = bgFill.fill; g.fillRect(0, 0, W, H); }
}

// One full stage loop (effect plus the pause after it) at native resolution.
function stageFrames(res, stage, bgFill) {
  const T = stage.timing(res, 0);
  const n = T.span + T.gap;
  const c = Object.assign(document.createElement('canvas'), { width: stage.W, height: stage.H });
  const g = c.getContext('2d', { willReadFrequently: true });
  const out = [];
  for (let i = 0; i < n; i++) {
    g.clearRect(0, 0, c.width, c.height);
    paintFill(g, c.width, c.height, bgFill);
    stage.draw(g, res, i, { noBg: !!bgFill });
    out.push(g.getImageData(0, 0, c.width, c.height).data);
  }
  return out;
}

function credit(ctx, W, H) {
  const s = Math.max(2, Math.round(H / 270));
  const { cells, w, h } = layoutText('MADE WITH SPELLSPRITE', s);
  const x0 = W - w - s * 8, y0 = H - h - s * 6;
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = '#062a24';
  for (const [x, y] of cells) ctx.fillRect(x0 + x + s, y0 + y + s, 1, 1);
  ctx.fillStyle = '#9ff7e6';
  for (const [x, y] of cells) ctx.fillRect(x0 + x, y0 + y, 1, 1);
  ctx.globalAlpha = 1;
}

export function openDownload({ res, recipe, stage, stem, saveBlob, toast, bgFill }) {
  const { w, h, fps, loop, impact, pivot } = res;
  const n = res.frames.length;
  const meta = { fps, loop, impact, pivot };
  $('dl-name').textContent = `${recipe.name} · ${w}×${h} · ${n} 幀`;
  const body = $('dl-body');
  body.innerHTML = `
    <div class="dl-grid">
      <div class="dl-item"><b>精靈圖 PNG</b><p>所有幀排成一列（超過 4096 px 換網格）。</p>
        <div class="row"><select id="dl-sheet-s"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select><button type="button" class="accent" id="dl-sheet">下載 PNG</button></div></div>
      <div class="dl-item"><b>GIF（透明背景）</b><p>只有特效本身，可放進貼文或文件。</p>
        <div class="row"><select id="dl-gif-s"><option value="1">1×</option><option value="2">2×</option><option value="4" selected>4×</option><option value="8">8×</option></select><button type="button" class="accent" id="dl-gif">下載 GIF</button></div></div>
      <div class="dl-item"><b>GIF（舞台預覽）</b><p>含場景、角色與命中反應。</p>
        <div class="row"><select id="dl-sgif-s"><option value="1">1×</option><option value="2" selected>2×</option><option value="3">3×</option></select><button type="button" class="accent" id="dl-sgif">下載 GIF</button></div></div>
      <div class="dl-item"><b>單張影格 ZIP</b><p>每一幀一張 PNG。</p>
        <div class="row"><select id="dl-frames-s"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select><button type="button" class="accent" id="dl-frames">下載 ZIP</button></div></div>
      <div class="dl-item"><b>引擎用檔案</b><p>atlas JSON（TexturePacker / Aseprite 格式）、Godot 4 SpriteFrames、配方 JSON。對應 1× 精靈圖。</p>
        <div class="row"><button type="button" id="dl-atlas">atlas .json</button><button type="button" id="dl-tres">Godot .tres</button><button type="button" id="dl-recipe">配方 .json</button></div></div>
      <div class="dl-item"><b>遊戲用整包 ZIP</b><p>精靈圖、單張影格、1× 與 4× GIF、atlas、Godot 資源、配方與說明。</p>
        <div class="row"><button type="button" class="accent" id="dl-pack">下載整包</button></div></div>
      <div class="dl-item full"><b>MP4 影片（貼文用）</b><p>30 fps H.264；瀏覽器不支援 WebCodecs 時改存 WebM。整數倍放大，像素不糊。</p>
        <div class="row">
          <select id="dl-v-size"><option value="1920x1080">1920×1080（橫）</option><option value="1080x1080">1080×1080（方）</option><option value="1080x1920">1080×1920（直）</option></select>
          <select id="dl-v-what"><option value="stage">舞台</option><option value="effect">僅特效</option></select>
          <select id="dl-v-sec"><option value="4">4 秒</option><option value="6" selected>6 秒</option><option value="10">10 秒</option></select>
          <label class="check"><input type="checkbox" id="dl-v-credit" checked>角落標註</label>
          <button type="button" class="accent" id="dl-video">輸出影片</button>
        </div>
        <progress id="dl-v-prog" value="0" max="1" hidden></progress></div>
    </div>`;

  const busy = async (btn, fn) => {
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = '處理中…';
    try { await fn(); } catch (e) { console.error(e); toast(`失敗：${e.message}`); }
    btn.disabled = false; btn.textContent = label;
  };
  const sel = (id) => Number($(id).value);

  $('dl-sheet').onclick = (e) => busy(e.target, async () => {
    const s = sel('dl-sheet-s'), sh = buildSheet(res.frames, w, h, s);
    saveBlob(await pngBlob(sh.rgba, sh.width, sh.height), `${stem}${s > 1 ? `@${s}x` : ''}.png`);
  });
  $('dl-gif').onclick = (e) => busy(e.target, async () => {
    const s = sel('dl-gif-s');
    saveBlob(new Blob([encodeGIF(res.frames, w, h, { fps, scale: s })], { type: 'image/gif' }), `${stem}@${s}x.gif`);
  });
  $('dl-sgif').onclick = (e) => busy(e.target, async () => {
    const s = sel('dl-sgif-s'), frames = stageFrames(res, stage, bgFill);
    saveBlob(new Blob([encodeGIF(frames, stage.W, stage.H, { fps, scale: s })], { type: 'image/gif' }), `${stem}-stage@${s}x.gif`);
  });
  $('dl-frames').onclick = (e) => busy(e.target, async () => {
    const s = sel('dl-frames-s');
    const files = [];
    for (let i = 0; i < n; i++) files.push({ name: `${stem}_${String(i).padStart(2, '0')}.png`, data: await bytes(await pngBlob(scaleRGBA(res.frames[i], w, h, s), w * s, h * s)) });
    saveBlob(new Blob([makeZip(files)], { type: 'application/zip' }), `${stem}-frames.zip`);
  });
  const sheet1 = () => buildSheet(res.frames, w, h, 1);
  $('dl-atlas').onclick = () => saveBlob(new Blob([atlasJSON(stem, sheet1().layout, n, meta)], { type: 'application/json' }), `${stem}.json`);
  $('dl-tres').onclick = () => saveBlob(new Blob([godotTres(stem, sheet1().layout, n, meta)], { type: 'text/plain' }), `${stem}.tres`);
  $('dl-recipe').onclick = () => saveBlob(new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' }), `${stem}.recipe.json`);
  $('dl-pack').onclick = (e) => busy(e.target, async () => {
    const sh = sheet1();
    const files = [
      { name: `${stem}/${stem}.png`, data: await bytes(await pngBlob(sh.rgba, sh.width, sh.height)) },
      { name: `${stem}/${stem}.json`, data: atlasJSON(stem, sh.layout, n, meta) },
      { name: `${stem}/${stem}.tres`, data: godotTres(stem, sh.layout, n, meta) },
      { name: `${stem}/${stem}@1x.gif`, data: encodeGIF(res.frames, w, h, { fps, scale: 1 }) },
      { name: `${stem}/${stem}@4x.gif`, data: encodeGIF(res.frames, w, h, { fps, scale: 4 }) },
      { name: `${stem}/${stem}.recipe.json`, data: JSON.stringify(recipe, null, 2) },
      { name: `${stem}/README.txt`, data: readme(stem, { name: recipe.name, w, h, n, fps, loop, impact, pivot }) },
    ];
    for (let i = 0; i < n; i++) files.push({ name: `${stem}/frames/${stem}_${String(i).padStart(2, '0')}.png`, data: await bytes(await pngBlob(res.frames[i], w, h)) });
    saveBlob(new Blob([makeZip(files)], { type: 'application/zip' }), `${stem}.zip`);
    toast(`整包 ${files.length} 個檔案`);
  });

  $('dl-video').onclick = (e) => busy(e.target, async () => {
    const [W, H] = $('dl-v-size').value.split('x').map(Number);
    const what = $('dl-v-what').value, secs = sel('dl-v-sec'), withCredit = $('dl-v-credit').checked;
    const T = stage.timing(res, 0);
    const cycle = (T.span + T.gap) / fps;
    const count = Math.ceil(Math.max(secs, cycle) * 30);
    const sc = Object.assign(document.createElement('canvas'), { width: stage.W, height: stage.H });
    const sg = sc.getContext('2d');
    // Stage layout: whole-number scale; narrow formats crop around the two characters.
    let rx = 0, rw = stage.W, s = Math.max(1, Math.floor(Math.min(W / stage.W, H / stage.H)));
    if (W / H < (stage.W / stage.H) * 0.8) {
      const c = stage.rect('caster'), t = stage.rect('target');
      rx = Math.max(0, c.x - 40); rw = Math.min(stage.W, t.x + t.w + 40) - rx;
      s = Math.max(1, Math.floor(Math.min(W / rw, H / stage.H)));
      const need = Math.min(stage.W, Math.ceil(W / s));
      if (need > rw) { rx = Math.max(0, Math.min(stage.W - need, Math.round(rx - (need - rw) / 2))); rw = need; }
    }
    const es = Math.max(1, Math.floor((Math.min(W, H) * 0.7) / Math.max(w, h)));
    const prog = $('dl-v-prog');
    prog.hidden = false; prog.value = 0;
    const out = await encodeVideo({
      width: W, height: H, fps: 30, count,
      onProgress: (p) => { prog.value = p; },
      draw: (ctx, i) => {
        const tick = Math.floor((i / 30) * fps);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = bgFill?.fill || '#0d0c14';
        ctx.fillRect(0, 0, W, H);
        if (what === 'stage') {
          sg.clearRect(0, 0, sc.width, sc.height);
          paintFill(sg, sc.width, sc.height, bgFill);
          stage.draw(sg, res, tick, { noBg: !!bgFill });
          ctx.drawImage(sc, rx, 0, rw, stage.H, Math.round((W - rw * s) / 2), Math.round((H - stage.H * s) / 2), rw * s, stage.H * s);
        } else {
          const gap = res.loop ? 0 : Math.round(fps * 0.45), cyc = tick % (n + gap);
          if (cyc < n) {
            ctx.save(); ctx.translate(Math.round((W - w * es) / 2), Math.round((H - h * es) / 2)); ctx.scale(es, es);
            res.drawFrame(ctx, cyc, 0, 0);
            ctx.restore();
          }
        }
        if (withCredit) credit(ctx, W, H);
      },
    });
    prog.hidden = true;
    saveBlob(out.blob, `${stem}-${W}x${H}.${out.ext}`);
    toast(out.ext === 'mp4' ? `已輸出 MP4（${out.codec}）` : '此瀏覽器不支援 WebCodecs，已改存 WebM');
  });

  $('dlg-download').showModal();
}

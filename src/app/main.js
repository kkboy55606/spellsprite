// Pixel FX Studio: page wiring. State lives here; rendering happens in workers
// (render-client.js); the stage composes effects onto the scene (stage.js).

import { Renderer } from './render-client.js';
import { Stage, toSprite } from './stage.js';
import { createInspector } from './inspector.js';
import { keyOutBackground, cropOpaque, shrink } from './sprites.js';
import { interpret, EXAMPLE_PROMPTS, SUGGESTED_WORDS } from '../core/interpret.js';
import { LIBRARY, GROUPS, recipeFor } from '../core/library.js';
import { FORMAT } from '../core/engine.js';
import { layoutText } from '../core/font.js';
import { stemOf } from '../export/formats.js';

const $ = (id) => document.getElementById(id);
const ICON = {
  play: '<svg viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z"/></svg>',
  pause: '<svg viewBox="0 0 16 16"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z"/></svg>',
  dice: '<svg viewBox="0 0 16 16"><path d="M3 1.5h10A1.5 1.5 0 0 1 14.5 3v10a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 13V3A1.5 1.5 0 0 1 3 1.5zm1.5 2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm7 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zM8 6.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm-3.5 3.3a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm7 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/></svg>',
};
const BGS = [
  { id: 'scene', label: '場景', css: 'linear-gradient(#2a2858,#a85a72 70%,#3e6b48 70%)' },
  { id: 'dark', label: '深色', css: '#0d0c14', fill: '#0d0c14' },
  { id: 'checker', label: '棋盤格', css: 'repeating-conic-gradient(#2a2838 0 25%,#1a1824 0 50%) 0 0/8px 8px', checker: true },
  { id: 'light', label: '淺色', css: '#c9cbd8', fill: '#c9cbd8' },
];

const renderer = new Renderer();
const stage = new Stage();
const state = {
  prompt: '', seed: 11, source: 'library', libraryId: null,
  recipe: null, layersEdited: false, sticky: {}, scale: 1, chips: [], matched: true,
  result: null, view: 'stage', bg: 'scene', playing: true, speed: 1, tick: 0,
  group: 'all', search: '', varBase: 0,
};

const toast = (msg) => { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1800); };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const dpr = () => window.devicePixelRatio || 1;

// ---------- recipes ----------
function withSticky(r) { return { ...r, ...state.sticky }; }
function scaledSize(r = state.recipe, s = state.scale) { return [Math.max(8, Math.round((r.w * s) / 2) * 2), Math.max(8, Math.round((r.h * s) / 2) * 2)]; }
function finalRecipe(r = state.recipe, s = state.scale) { const [w, h] = scaledSize(r, s); return { ...r, w, h }; }
function variantRecipe(seed) {
  if (state.source === 'json' || state.layersEdited) return { ...state.recipe, seed };
  if (state.source === 'library') { const e = LIBRARY.find((x) => x.id === state.libraryId); if (e) return withSticky(recipeFor({ ...e, seed })); }
  return withSticky(interpret(state.prompt, seed).recipe);
}

function loadPrompt(text, seed = state.seed, { quiet = false } = {}) {
  const r = interpret(text, seed);
  state.prompt = text;
  if (!r.matched) { state.matched = false; renderReadAs(); return false; }
  Object.assign(state, { seed, source: 'prompt', libraryId: null, recipe: withSticky(r.recipe), layersEdited: false, chips: r.chips, matched: true });
  inspector.resetOpen();
  if (!quiet) markLibrary();
  refresh({ rebuild: true });
  return true;
}
function loadLibrary(entry) {
  const r = interpret(entry.prompt, entry.seed);
  Object.assign(state, { prompt: entry.prompt, seed: entry.seed, source: 'library', libraryId: entry.id, recipe: withSticky(recipeFor(entry)), layersEdited: false, chips: r.chips, matched: true });
  $('prompt').value = entry.prompt;
  inspector.resetOpen();
  markLibrary();
  refresh({ rebuild: true });
}
function loadJSON(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.layers) || !obj.layers.length) throw new Error('配方需要至少一個圖層（layers 陣列）');
  const recipe = { format: FORMAT, ...obj, colors: { main: 'fire', alt: 'ember', smoke: 'smoke', spark: 'white', ...(obj.colors || {}) } };
  Object.assign(state, { source: 'json', libraryId: null, recipe, layersEdited: true, seed: Number(obj.seed) || 1, chips: [], matched: true, prompt: obj.prompt || '' });
  $('prompt').value = state.prompt;
  inspector.resetOpen();
  markLibrary();
  refresh({ rebuild: true });
}

const app = {
  get recipe() { return state.recipe; },
  get seed() { return state.seed; },
  get scale() { return state.scale; },
  scaledSize: () => scaledSize(),
  patch(fn, { sticky, layers, rebuild } = {}) {
    const r = structuredClone(state.recipe);
    fn(r);
    state.recipe = r;
    if (sticky) state.sticky[sticky] = r[sticky];
    if (layers) state.layersEdited = true;
    refresh({ rebuild });
  },
  setSeed(n) {
    state.seed = n;
    if (state.source === 'json' || state.layersEdited) app.patch((r) => { r.seed = n; }, { rebuild: true });
    else if (state.source === 'library') { const e = LIBRARY.find((x) => x.id === state.libraryId); state.recipe = withSticky(recipeFor({ ...e, seed: n })); refresh({ rebuild: true }); }
    else loadPrompt(state.prompt, n, { quiet: true });
  },
  setScale(s) { state.scale = s; refresh({ rebuild: true }); },
  copyJSON: async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(finalRecipe(), null, 2)); toast('已複製配方 JSON'); }
    catch { openPaste(JSON.stringify(finalRecipe(), null, 2)); }
  },
  openPaste: () => openPaste(''),
  saveJSON: () => saveBlob(new Blob([JSON.stringify(finalRecipe(), null, 2)], { type: 'application/json' }), `${stemFor()}.recipe.json`),
  loadJSON: () => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
    inp.onchange = async () => { try { loadJSON(JSON.parse(await inp.files[0].text())); toast('已載入配方'); } catch (e) { toast(`讀不到配方：${e.message}`); } };
    inp.click();
  },
};
const inspector = createInspector($('inspector'), app);

export function stemFor(r = state.recipe) { return stemOf(r.libraryId || r.nameEn || r.name); }
export function saveBlob(blob, name) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- rendering ----------
let reqId = 0;
const scheduleVariants = debounce(renderVariants, 350);
function refresh({ rebuild = false } = {}) {
  const id = ++reqId;
  const r = finalRecipe();
  renderer.render(r, { urgent: true, tag: 'main' }).then((res) => { if (id === reqId) setResult(res); }).catch(() => {});
  if (rebuild) inspector.render();
  else $('inspector').querySelector('.sec:nth-child(4) h4 span:last-child')?.replaceChildren(scaledSize().join('×'));
  renderReadAs();
  writeHash();
  scheduleVariants();
}

function setResult(res) {
  const sameShape = state.result && state.result.frames.length === res.frames.length;
  state.result = res;
  const R = state.recipe;
  $('fx-name').textContent = R.name || '未命名特效';
  $('fx-meta').textContent = `${res.w}×${res.h} · ${res.frames.length} 幀 · ${res.fps} fps · ${res.loop ? '循環' : '單次'}${res.impact != null ? ` · 命中第 ${res.impact + 1} 幀` : ''}`;
  buildStrip(res, sameShape);
  sizeView();
}

// ---------- read-as line ----------
function renderReadAs() {
  const el = $('readas');
  if (!state.matched) {
    el.replaceChildren(document.createTextNode('沒認出特效字，畫面保留上一個。試試加入：'), ...SUGGESTED_WORDS.map((w) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'word ghost', textContent: w });
      b.onclick = () => { $('prompt').value = `${$('prompt').value} ${w}`.trim(); loadPrompt($('prompt').value); };
      return b;
    }));
    return;
  }
  if (state.source === 'json') { el.textContent = state.layersEdited ? '自訂配方（由 JSON 或手動編輯而來）' : ''; return; }
  el.replaceChildren(document.createTextNode('解讀為'), ...state.chips.map((c) => Object.assign(document.createElement('span'), { className: `chip ${c.kind}`, textContent: c.label })),
    ...(state.layersEdited ? [Object.assign(document.createElement('span'), { className: 'muted', textContent: '· 已手動調整圖層' })] : []));
}

// ---------- library ----------
const tiles = new Set();
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const t = e.target._tile;
    if (!t) continue;
    t.visible = e.isIntersecting;
    if (t.visible && !t.res && !t.loading) {
      t.loading = true;
      renderer.render(t.recipe()).then((res) => { t.res = res; t.last = -1; }).catch(() => { t.loading = false; });
    }
  }
}, { rootMargin: '120px' });

function makeTile(canvas, recipe) {
  const t = { canvas, recipe, res: null, visible: false, last: -1 };
  canvas._tile = t;
  tiles.add(t);
  io.observe(canvas);
  return t;
}
function dropTile(t) { io.unobserve(t.canvas); tiles.delete(t); }

function buildGroups() {
  const nav = $('lib-groups');
  nav.replaceChildren(...GROUPS.map((g) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: g.label });
    b.setAttribute('aria-pressed', String(state.group === g.id));
    b.onclick = () => { state.group = g.id; buildGroups(); buildLibrary(); };
    return b;
  }));
}
function buildLibrary() {
  const grid = $('lib-grid');
  for (const t of [...tiles]) if (t.lib) dropTile(t);
  const q = state.search.trim().toLowerCase();
  const list = LIBRARY.filter((e) => (state.group === 'all' || e.group === state.group) && (!q || `${e.name} ${e.prompt} ${e.id}`.toLowerCase().includes(q)));
  grid.replaceChildren(...list.map((e) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tile'; b.title = `${e.name}｜${e.prompt}`; b.dataset.id = e.id;
    const c = Object.assign(document.createElement('canvas'), { width: 96, height: 96 });
    b.append(c, Object.assign(document.createElement('span'), { textContent: e.name }));
    b.onclick = () => loadLibrary(e);
    makeTile(c, () => recipeFor(e)).lib = true;
    return b;
  }));
  if (!list.length) grid.replaceChildren(Object.assign(document.createElement('p'), { className: 'muted', textContent: '找不到符合的特效。', style: 'grid-column:1/-1;padding:8px' }));
  markLibrary();
}
function markLibrary() {
  for (const b of $('lib-grid').querySelectorAll('.tile')) b.setAttribute('aria-current', String(b.dataset.id === state.libraryId));
}

// ---------- variations ----------
function renderVariants() {
  const box = $('vars');
  for (const t of [...tiles]) if (t.variant) dropTile(t);
  const seeds = Array.from({ length: 6 }, (_, i) => (state.seed + state.varBase + i + 1) % 1000000);
  box.replaceChildren(...seeds.map((s) => {
    const b = document.createElement('button');
    b.type = 'button'; b.title = `種子 ${s}`;
    const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
    b.append(c);
    b.onclick = () => app.setSeed(s);
    const r = finalRecipe(variantRecipe(s), 1);
    makeTile(c, () => r).variant = true;
    return b;
  }));
}

// Draw a frame of `res` centred in a canvas at the largest crisp scale.
function drawFit(g, res, i, W, H, fill = '#0f0e17') {
  g.imageSmoothingEnabled = false;
  g.fillStyle = fill; g.fillRect(0, 0, W, H);
  let s = Math.min(W / res.w, H / res.h);
  if (s >= 1) s = Math.floor(s);
  const w = res.w * s, h = res.h * s;
  g.save(); g.translate(Math.round((W - w) / 2), Math.round((H - h) / 2)); g.scale(s, s);
  res.drawFrame(g, i, 0, 0);
  g.restore();
}

function animateTiles(now) {
  for (const t of tiles) {
    if (!t.visible || !t.res) continue;
    const f = Math.floor((now / 1000) * t.res.fps) % (t.res.frames.length + (t.res.loop ? 0 : 4));
    if (f === t.last) continue;
    t.last = f;
    const g = t.canvas.getContext('2d');
    if (f >= t.res.frames.length) { g.fillStyle = '#0f0e17'; g.fillRect(0, 0, t.canvas.width, t.canvas.height); continue; }
    drawFit(g, t.res, f, t.canvas.width, t.canvas.height);
  }
}

// ---------- the view ----------
const view = $('view');
const vctx = view.getContext('2d');
let stageCanvas = document.createElement('canvas');
let viewScale = 1;
const checker = (() => {
  const c = Object.assign(document.createElement('canvas'), { width: 8, height: 8 });
  const g = c.getContext('2d');
  g.fillStyle = '#1a1824'; g.fillRect(0, 0, 8, 8); g.fillStyle = '#2a2838'; g.fillRect(0, 0, 4, 4); g.fillRect(4, 4, 4, 4);
  return c;
})();

function sizeView() {
  const wrap = $('stage-wrap');
  const res = state.result;
  const [W, H] = state.view === 'stage' ? [stage.W, stage.H] : res ? [res.w, res.h] : [64, 64];
  const k = dpr();
  const availW = (wrap.clientWidth - 16) * k, availH = (wrap.clientHeight - 16) * k;
  let s = Math.max(1, Math.floor(Math.min(availW / W, availH / H)));
  if (state.view === 'effect') s = Math.max(1, Math.min(s, Math.floor(Math.min(availW, availH) / Math.max(W, H))));
  viewScale = s;
  if (view.width !== W * s || view.height !== H * s) { view.width = W * s; view.height = H * s; }
  // Whole-number scales stay crisp; on narrow screens where 1x would leave the
  // view tiny, stretch to fit instead.
  let cssW = (W * s) / k, cssH = (H * s) / k;
  const fit = Math.min((wrap.clientWidth - 16) / W, (wrap.clientHeight - 16) / H);
  if (cssW < (wrap.clientWidth - 16) * 0.6 && W * fit > cssW) { cssW = W * fit; cssH = H * fit; }
  view.style.width = `${cssW}px`; view.style.height = `${cssH}px`;
  if (stageCanvas.width !== stage.W || stageCanvas.height !== stage.H) { stageCanvas.width = stage.W; stageCanvas.height = stage.H; }
  $('stage-hint').style.display = state.view === 'stage' ? '' : 'none';
}
new ResizeObserver(() => sizeView()).observe($('stage-wrap'));

function paintBg(g, W, H) {
  const bg = BGS.find((b) => b.id === state.bg);
  if (bg.checker) { g.fillStyle = g.createPattern(checker, 'repeat'); g.fillRect(0, 0, W, H); }
  else { g.fillStyle = bg.fill || '#0d0c14'; g.fillRect(0, 0, W, H); }
}

let shownFrame = -1;
function drawView() {
  const res = state.result;
  if (!res) return;
  let frame;
  if (state.view === 'stage') {
    const g = stageCanvas.getContext('2d');
    const sceneBg = state.bg === 'scene';
    if (!sceneBg) paintBg(g, stage.W, stage.H);
    const T = stage.draw(g, res, state.tick, { noBg: !sceneBg });
    frame = T.active ? T.frame : -1;
    vctx.imageSmoothingEnabled = false;
    vctx.drawImage(stageCanvas, 0, 0, view.width, view.height);
  } else {
    const N = res.frames.length, gap = res.loop ? 0 : Math.round(res.fps * 0.45);
    const cyc = state.tick % (N + gap);
    frame = cyc < N ? cyc : -1;
    vctx.imageSmoothingEnabled = false;
    vctx.save(); vctx.scale(viewScale, viewScale);
    paintBg(vctx, res.w, res.h);
    if (frame >= 0) res.drawFrame(vctx, frame, 0, 0);
    vctx.restore();
  }
  if (frame !== shownFrame) {
    shownFrame = frame;
    $('frame-no').textContent = frame >= 0 ? `${String(frame + 1).padStart(2, '0')}/${String(res.frames.length).padStart(2, '0')}` : `--/${String(res.frames.length).padStart(2, '0')}`;
    const strip = $('strip').children;
    for (let i = 0; i < strip.length; i++) strip[i].classList.toggle('on', i === frame);
    if (frame >= 0) strip[frame]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function buildStrip(res, keep) {
  const strip = $('strip');
  if (!keep) strip.replaceChildren(...res.frames.map((_, i) => {
    const c = Object.assign(document.createElement('canvas'), { width: 60, height: 60, title: `第 ${i + 1} 幀` });
    c.onclick = () => { setPlaying(false); seekFrame(i); };
    return c;
  }));
  [...strip.children].forEach((c, i) => { drawFit(c.getContext('2d'), res, i, 60, 60, '#0b0a12'); c.classList.toggle('impact', i === res.impact); });
  shownFrame = -2;
}
function seekFrame(i) {
  const res = state.result;
  if (!res) return;
  if (state.view === 'stage') {
    const T = stage.timing(res, 0);
    state.tick = res.place === 'travel' ? Math.min(i, T.span - 1) : i;
  } else state.tick = i;
}
function setPlaying(on) {
  state.playing = on;
  $('btn-play').innerHTML = on ? ICON.pause : ICON.play;
}

let last = performance.now(), acc = 0;
function frameLoop(now) {
  const res = state.result;
  if (res && state.playing) {
    acc += ((now - last) / 1000) * res.fps * state.speed;
    if (acc > 8) acc = 1;
    const n = Math.floor(acc);
    if (n) { state.tick += n; acc -= n; }
  }
  last = now;
  drawView();
  animateTiles(now);
  requestAnimationFrame(frameLoop);
}

// ---------- stage dragging ----------
let drag = null;
const toStage = (e) => { const r = view.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * stage.W, ((e.clientY - r.top) / r.height) * stage.H]; };
view.addEventListener('pointerdown', (e) => {
  if (state.view !== 'stage') return;
  const [x, y] = toStage(e), who = stage.hitTest(x, y);
  if (!who) return;
  drag = { who, dx: x - stage.pos[who][0], dy: y - stage.pos[who][1] };
  view.setPointerCapture(e.pointerId);
});
view.addEventListener('pointermove', (e) => {
  if (state.view === 'stage' && !drag) { const [x, y] = toStage(e); view.style.cursor = stage.hitTest(x, y) ? 'grab' : ''; }
  if (!drag) return;
  const [x, y] = toStage(e);
  stage.pos[drag.who] = [Math.round(Math.max(0, Math.min(stage.W, x - drag.dx))), Math.round(Math.max(8, Math.min(stage.H, y - drag.dy)))];
});
view.addEventListener('pointerup', () => { drag = null; });

// ---------- uploads ----------
async function readImage(file) {
  const bmp = await createImageBitmap(file);
  const c = Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
  const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0);
  return { rgba: g.getImageData(0, 0, bmp.width, bmp.height).data, w: bmp.width, h: bmp.height };
}
async function uploadSprite(file, who) {
  let { rgba, w, h } = await readImage(file);
  const keyed = keyOutBackground(rgba, w, h);
  ({ rgba, w, h } = cropOpaque(rgba, w, h));
  if (h > 128) ({ rgba, w, h } = shrink(rgba, w, h, Math.ceil(h / 96)));
  const spr = toSprite({ rgba, w, h });
  if (who === 'caster') stage.setCaster(spr); else stage.setTarget(spr);
  toast(`已換上${who === 'caster' ? '施法者' : '目標'}（${w}×${h}${keyed ? '，已自動去背' : ''}）`);
}
async function uploadBg(file) {
  let { rgba, w, h } = await readImage(file);
  if (w > 640) ({ rgba, w, h } = shrink(rgba, w, h, Math.ceil(w / 384)));
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  stage.setBackground(c);
  state.bg = 'scene'; buildBgSwatches();
  sizeView();
  toast(`已換上背景（${w}×${h}）`);
}

// ---------- share link ----------
async function packRecipe(r) {
  const bytes = new TextEncoder().encode(JSON.stringify(r));
  const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buf = new Uint8Array(await new Response(cs).arrayBuffer());
  let s = ''; for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function unpackRecipe(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(ds).text());
}
const writeHash = debounce(async () => {
  const p = new URLSearchParams();
  if (state.source === 'json' || state.layersEdited) {
    try { p.set('r', await packRecipe(state.recipe)); } catch { return; }
  } else if (state.source === 'library') p.set('fx', state.libraryId);
  else p.set('p', state.prompt);
  if (!(state.source === 'json' || state.layersEdited)) p.set('s', String(state.seed));
  if (Object.keys(state.sticky).length) p.set('st', JSON.stringify(state.sticky));
  if (state.scale !== 1) p.set('sc', String(state.scale));
  history.replaceState(null, '', `#${p.toString()}`);
}, 300);

async function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  try { if (p.get('st')) state.sticky = JSON.parse(p.get('st')); } catch { /* ignore a broken style field */ }
  if (p.get('sc')) state.scale = Number(p.get('sc')) || 1;
  const seed = p.get('s') != null ? Number(p.get('s')) : null;
  if (p.get('r')) { try { loadJSON(await unpackRecipe(p.get('r'))); return; } catch { toast('網址裡的配方讀不出來，改載入預設特效'); } }
  if (p.get('fx')) { const e = LIBRARY.find((x) => x.id === p.get('fx')); if (e) { loadLibrary(seed != null ? { ...e, seed } : e); return; } }
  if (p.get('p')) { $('prompt').value = p.get('p'); if (loadPrompt(p.get('p'), seed ?? 1)) return; }
  loadLibrary(LIBRARY.find((x) => x.id === 'star-abyss'));
}

// ---------- dialogs ----------
function openPaste(text) {
  $('paste-text').value = text;
  $('paste-err').textContent = '';
  $('dlg-paste').showModal();
}
$('paste-ok').addEventListener('click', (e) => {
  try { loadJSON(JSON.parse($('paste-text').value)); toast('已載入配方'); }
  catch (err) { e.preventDefault(); $('paste-err').textContent = `無法載入：${err.message}`; }
});
$('btn-stage-setup').onclick = () => $('dlg-stage').showModal();
$('up-caster').onchange = (e) => e.target.files[0] && uploadSprite(e.target.files[0], 'caster').catch((err) => toast(err.message));
$('up-target').onchange = (e) => e.target.files[0] && uploadSprite(e.target.files[0], 'target').catch((err) => toast(err.message));
$('up-bg').onchange = (e) => e.target.files[0] && uploadBg(e.target.files[0]).catch((err) => toast(err.message));
for (const b of document.querySelectorAll('[data-reset]')) b.onclick = () => {
  const k = b.dataset.reset;
  if (k === 'caster') stage.setCaster(null); else if (k === 'target') stage.setTarget(null); else { stage.setBackground(null); sizeView(); }
  toast('已還原');
};
$('btn-help').onclick = () => $('dlg-help').showModal();
const openDownload = async () => {
  if (!state.result) return;
  const m = await import('./download.js');
  m.openDownload({ res: state.result, recipe: finalRecipe(), stage, stem: stemFor(), saveBlob, toast, bgFill: state.bg === 'scene' ? null : BGS.find((b) => b.id === state.bg) });
};
$('btn-download').onclick = openDownload;
$('btn-share').onclick = async () => {
  writeHash();
  await new Promise((r) => setTimeout(r, 350));
  try { await navigator.clipboard.writeText(location.href); toast('已複製分享連結'); } catch { toast('請從網址列複製連結'); }
};

// ---------- controls ----------
const promptInput = $('prompt');
const typed = debounce(() => { if (promptInput.value.trim()) loadPrompt(promptInput.value.trim()); }, 300);
promptInput.addEventListener('input', typed);
promptInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); loadPrompt(promptInput.value.trim()); } });
$('btn-go').onclick = () => loadPrompt(promptInput.value.trim());
$('btn-dice').innerHTML = ICON.dice;
$('btn-dice').onclick = () => {
  const p = EXAMPLE_PROMPTS[Math.floor(Math.random() * EXAMPLE_PROMPTS.length)];
  promptInput.value = p;
  loadPrompt(p, Math.floor(Math.random() * 9999));
};
$('btn-play').onclick = () => setPlaying(!state.playing);
$('btn-remix').onclick = () => { state.varBase += 6 + Math.floor(Math.random() * 50); renderVariants(); };
$('lib-search').placeholder = `搜尋 ${LIBRARY.length} 個特效`;
$('lib-search').addEventListener('input', debounce((e) => { state.search = e.target.value; buildLibrary(); }, 120));

function segInit(id, key, attr, onpick) {
  const el = $(id);
  const mark = () => el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(String(state[key]) === b.dataset[attr])));
  el.querySelectorAll('button').forEach((b) => { b.onclick = () => { onpick(b.dataset[attr]); mark(); }; });
  mark();
}
segInit('view-seg', 'view', 'v', (v) => { state.view = v; sizeView(); shownFrame = -2; });
segInit('speed-seg', 'speed', 's', (v) => { state.speed = Number(v); });
function buildBgSwatches() {
  $('bg-swatches').replaceChildren(...BGS.map((b) => {
    const el = Object.assign(document.createElement('button'), { type: 'button', title: b.label });
    el.setAttribute('aria-label', `背景：${b.label}`);
    el.style.background = b.css;
    el.setAttribute('aria-pressed', String(state.bg === b.id));
    el.onclick = () => { state.bg = b.id; buildBgSwatches(); };
    return el;
  }));
}
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, dialog')) return;
  if (e.key === ' ') { e.preventDefault(); setPlaying(!state.playing); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    setPlaying(false);
    const T = state.view === 'stage' ? stage.timing(state.result, state.tick) : { frame: state.tick % state.result.frames.length };
    const n = state.result.frames.length;
    seekFrame(((Math.max(0, T.frame) + (e.key === 'ArrowRight' ? 1 : -1)) % n + n) % n);
  }
});

function drawLogo() {
  const c = $('logo');
  const { cells, w, h } = layoutText('PIXEL FX STUDIO', 2);
  c.width = w + 4; c.height = h + 4;
  const g = c.getContext('2d');
  const grad = ['#eafffa', '#9ff7e6', '#35e0c2', '#1fb39b', '#14806f'];
  g.fillStyle = '#062a24';
  for (const [x, y] of cells) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) g.fillRect(x + 2 + dx, y + 2 + dy, 1, 1);
  for (const [x, y] of cells) { g.fillStyle = grad[Math.min(4, Math.floor((y / h) * 5))]; g.fillRect(x + 2, y + 2, 1, 1); }
  c.style.height = `${(h + 4) * 1.5}px`;
}

drawLogo();
setPlaying(true);
buildGroups();
buildLibrary();
buildBgSwatches();
$('engine-note').textContent = renderer.fallback ? '渲染：主執行緒' : `渲染：${renderer.idle.length} 個背景執行緒`;
readHash();
requestAnimationFrame(frameLoop);

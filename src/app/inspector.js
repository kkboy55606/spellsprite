// Right-hand inspector. Builds its controls from the recipe and the layer
// kinds' parameter lists; every change goes through app.patch().

import { KINDS, COMMON_PARAMS } from '../core/kinds.js';
import { KIND_LIST, layerDefaults } from '../core/engine.js';
import { RAMPS, RAMP_LABELS, PALETTE_LABELS, resolveRamp, rgbToHex } from '../core/color.js';

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
};

const SLOTS = [['main', '主色'], ['alt', '輔色'], ['spark', '火花'], ['smoke', '煙']];
const OUTLINES = [['none', '無'], ['outer', '外框'], ['outer8', '外框 8 向'], ['inner', '內框']];
const SCALES = [[0.5, '½'], [0.75, '¾'], [1, '1×'], [1.5, '1.5×'], [2, '2×']];
const fmt = (v, step) => (step >= 1 ? String(Math.round(v)) : Number(v).toFixed(step >= 0.1 ? 1 : 2));

function rampSwatch(spec, R, cls = 'ramp') {
  let cols;
  try { cols = resolveRamp(typeof spec === 'string' && spec.startsWith('@') ? R.colors[spec.slice(1)] : spec, R.hue, R.sat); } catch { cols = RAMPS.fire; }
  return h('span', { class: cls }, cols.map((c) => h('i', { style: `background:${rgbToHex(c)}` })));
}

export function createInspector(root, app) {
  let slot = 'main';
  const open = new Set();

  function slider(label, value, { min, max, step }, oninput) {
    const val = h('span', { class: 'val' }, fmt(value, step));
    const input = h('input', { type: 'range', min, max, step, value, oninput: (e) => { const v = Number(e.target.value); val.textContent = fmt(v, step); oninput(v); } });
    return h('div', { class: 'field' }, h('label', {}, h('span', {}, label), val), input);
  }
  const check = (label, checked, onchange) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked) }), label);
  const seg = (items, cur, onpick) => h('div', { class: 'seg' }, items.map(([v, label]) => h('button', { type: 'button', 'aria-pressed': String(v === cur), onclick: () => onpick(v) }, label)));
  const section = (title, extra, ...body) => h('div', { class: 'sec' }, h('h4', {}, h('span', {}, title), extra ? h('span', {}, extra) : null), ...body);

  function paramControl(L, i, p) {
    const d = layerDefaults(L.kind);
    const cur = L[p.k] ?? d[p.k];
    const set = (v, rebuild = false) => app.patch((r) => { r.layers[i][p.k] = v; }, { layers: true, rebuild });
    if (p.type === 'color') {
      const opts = [['@main', '主色'], ['@alt', '輔色'], ['@spark', '火花'], ['@smoke', '煙'], ...Object.keys(RAMPS).map((k) => [k, RAMP_LABELS[k] || k])];
      return h('div', { class: 'field' }, h('div', { class: 'lab' }, p.label),
        h('select', { onchange: (e) => set(e.target.value, true) }, opts.map(([v, l]) => h('option', { value: v, selected: v === cur }, l))));
    }
    if (p.options) {
      return h('div', { class: 'field' }, h('div', { class: 'lab' }, p.label),
        h('select', { onchange: (e) => set(e.target.value, true) }, p.options.map((v) => h('option', { value: v, selected: v === cur }, v))));
    }
    if (typeof p.def === 'boolean') return check(p.label, !!cur, (v) => set(v));
    if (typeof p.def === 'string') {
      return h('div', { class: 'field' }, h('div', { class: 'lab' }, p.label), h('input', { type: 'text', value: cur, oninput: (e) => set(e.target.value) }));
    }
    if (Array.isArray(p.def)) {
      const pair = Array.isArray(cur) ? [...cur] : [cur, cur];
      return h('div', { class: 'field' }, h('div', { class: 'lab' }, h('span', {}, p.label), h('span', { class: 'val' }, `${fmt(pair[0], p.step)} – ${fmt(pair[1], p.step)}`)),
        h('div', { class: 'pair' },
          [0, 1].map((j) => h('input', { type: 'range', min: p.min, max: p.max, step: p.step, value: pair[j], oninput: (e) => {
            pair[j] = Number(e.target.value);
            e.target.parentNode.previousSibling.lastChild.textContent = `${fmt(pair[0], p.step)} – ${fmt(pair[1], p.step)}`;
            set([...pair]);
          } }))));
    }
    return slider(p.label, cur, p, (v) => set(v));
  }

  function layerRow(L, i, R) {
    const kind = KINDS[L.kind];
    const hint = L.mode || L.shape || L.text || '';
    const isOpen = open.has(i);
    const body = isOpen ? h('div', { class: 'layer-body' },
      [...COMMON_PARAMS, ...kind.params].map((p) => paramControl(L, i, p)),
      h('div', { class: 'row end' },
        h('button', { type: 'button', class: 'ghost small', onclick: () => app.patch((r) => { r.layers.splice(i + 1, 0, structuredClone(r.layers[i])); }, { layers: true, rebuild: true }) }, '複製圖層'),
        h('button', { type: 'button', class: 'ghost small', onclick: () => { open.delete(i); app.patch((r) => { r.layers.splice(i, 1); }, { layers: true, rebuild: true }); } }, '刪除'))) : null;
    return h('div', { class: `layer${L.hidden ? ' off' : ''}` },
      h('div', { class: 'layer-head' },
        h('button', { type: 'button', title: L.hidden ? '顯示' : '隱藏', 'aria-label': L.hidden ? '顯示圖層' : '隱藏圖層', onclick: () => app.patch((r) => { r.layers[i].hidden = !r.layers[i].hidden; }, { layers: true, rebuild: true }) }, L.hidden ? '○' : '●'),
        rampSwatch(L.color || '@main', R, 'mini-ramp'),
        h('span', { class: 'nm', onclick: () => { isOpen ? open.delete(i) : open.add(i); render(); } }, kind.label, h('small', {}, hint)),
        h('button', { type: 'button', title: '上移', disabled: i === 0, onclick: () => app.patch((r) => { [r.layers[i - 1], r.layers[i]] = [r.layers[i], r.layers[i - 1]]; }, { layers: true, rebuild: true }) }, '↑'),
        h('button', { type: 'button', title: '下移', disabled: i === R.layers.length - 1, onclick: () => app.patch((r) => { [r.layers[i + 1], r.layers[i]] = [r.layers[i], r.layers[i + 1]]; }, { layers: true, rebuild: true }) }, '↓'),
        h('button', { type: 'button', title: isOpen ? '收合' : '展開', onclick: () => { isOpen ? open.delete(i) : open.add(i); render(); } }, isOpen ? '▾' : '▸')),
      body);
  }

  function render() {
    const R = app.recipe;
    if (!R) return;
    const scrollTop = root.scrollTop;
    const scaled = app.scaledSize();
    let addKind = 'particles';
    root.replaceChildren(
      section('顏色', null,
        h('div', { class: 'slot-row' }, SLOTS.map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(slot === k), onclick: () => { slot = k; render(); } }, l))),
        h('div', { class: 'ramps' }, Object.keys(RAMPS).map((name) => {
          const b = h('button', { type: 'button', class: 'ramp', title: RAMP_LABELS[name] || name, 'aria-pressed': String(R.colors[slot] === name), onclick: () => app.patch((r) => { r.colors[slot] = name; }, { rebuild: true }) });
          b.append(...rampSwatch(name, { ...R, hue: 0, sat: 1 }).childNodes);
          return b;
        })),
        slider('色相偏移', R.hue, { min: -180, max: 180, step: 1 }, (v) => app.patch((r) => { r.hue = v; }, { sticky: 'hue' })),
        h('div', { class: 'field' }, h('div', { class: 'lab' }, '鎖定色盤'),
          h('select', { onchange: (e) => app.patch((r) => { r.palette = e.target.value || null; }, { sticky: 'palette' }) },
            h('option', { value: '' }, '不鎖定（自由配色）'),
            Object.entries(PALETTE_LABELS).map(([k, l]) => h('option', { value: k, selected: R.palette === k }, l))))),
      section('風格', null,
        h('div', { class: 'field' }, h('div', { class: 'lab' }, '描邊'), seg(OUTLINES, R.outline || 'none', (v) => app.patch((r) => { r.outline = v; }, { sticky: 'outline', rebuild: true }))),
        slider('抖色', R.dither, { min: 0, max: 1, step: 0.05 }, (v) => app.patch((r) => { r.dither = v; }, { sticky: 'dither' })),
        check('清除雜點', R.cleanup !== false, (v) => app.patch((r) => { r.cleanup = v; }, { sticky: 'cleanup' }))),
      section('動態', null,
        slider('幀數', R.frames, { min: 4, max: 48, step: 1 }, (v) => app.patch((r) => { r.frames = v; })),
        slider('速度 (fps)', R.fps, { min: 4, max: 30, step: 1 }, (v) => app.patch((r) => { r.fps = v; })),
        check('無縫循環', !!R.loop, (v) => app.patch((r) => { r.loop = v; }, { rebuild: true })),
        h('div', { class: 'row' }, h('span', { class: 'muted', style: 'font-size:12.5px' }, '種子'),
          h('input', { type: 'number', value: app.seed, min: 0, max: 999999, onchange: (e) => app.setSeed(Number(e.target.value) || 0) }),
          h('button', { type: 'button', class: 'ghost small', onclick: () => app.setSeed(Math.floor(Math.random() * 99999)) }, '隨機'))),
      section('畫布', `${scaled[0]}×${scaled[1]}`,
        seg(SCALES, app.scale, (v) => app.setScale(v)),
        h('p', { class: 'muted', style: 'font-size:12px;margin:8px 0 0' }, '像素越多、細節越多，形狀不變。')),
      section('圖層', String(R.layers.length),
        R.layers.map((L, i) => layerRow(L, i, R)),
        h('div', { class: 'add-row' },
          h('select', { onchange: (e) => { addKind = e.target.value; } }, KIND_LIST.map((k) => h('option', { value: k, selected: k === addKind }, `${KINDS[k].label}（${k}）`))),
          h('button', { type: 'button', class: 'ghost small', onclick: () => { open.add(R.layers.length); app.patch((r) => { r.layers.push({ kind: addKind, color: '@main' }); }, { layers: true, rebuild: true }); } }, '新增'))),
      section('配方', null,
        h('p', { class: 'muted', style: 'font-size:12px;margin:0 0 8px' }, '每個特效都是一份小小的 JSON 配方，可以複製保存、貼上載回。'),
        h('div', { class: 'row', style: 'flex-wrap:wrap' },
          h('button', { type: 'button', onclick: app.copyJSON }, '複製 JSON'),
          h('button', { type: 'button', onclick: app.openPaste }, '貼上 JSON'),
          h('button', { type: 'button', class: 'ghost', onclick: app.saveJSON }, '存成檔案'),
          h('button', { type: 'button', class: 'ghost', onclick: app.loadJSON }, '開啟檔案'))),
    );
    root.scrollTop = scrollTop;
  }

  return { render, resetOpen: () => open.clear() };
}

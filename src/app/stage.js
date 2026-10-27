// The stage: a scene, a caster and a target at native resolution. Effects are
// placed by their `place` and pivot, and one-shots hitting the target trigger
// a two-frame white flash, knockback and (for heavy effects) screen shake,
// timed to the impact frame.

import { scene, wizard, slime, findTip, STAGE_W, STAGE_H, FLOOR_Y } from './sprites.js';

export function toSprite({ rgba, w, h, tip }) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  const white = document.createElement('canvas');
  white.width = w; white.height = h;
  const wd = new Uint8ClampedArray(rgba);
  for (let i = 0; i < wd.length; i += 4) if (wd[i + 3]) { wd[i] = 255; wd[i + 1] = 255; wd[i + 2] = 255; wd[i + 3] = 255; }
  white.getContext('2d').putImageData(new ImageData(wd, w, h), 0, 0);
  return { canvas: c, white, w, h, tip: tip || findTip(rgba, w, h) };
}

const HIT_PLACES = new Set(['target', 'target-ground', 'travel']);
const SHAKE = [[2, -1], [-2, 1], [1, -1], [-1, 0]];

export class Stage {
  constructor() {
    const s = scene();
    this.defaultBg = toSprite({ ...s, tip: [0, 0] }).canvas;
    this.defaultCaster = toSprite(wizard());
    this.defaultTarget = toSprite({ ...slime(), tip: [0, 0] });
    this.reset();
  }
  reset() {
    this.bg = this.defaultBg;
    this.caster = this.defaultCaster;
    this.target = this.defaultTarget;
    this.layout();
  }
  get W() { return this.bg.width; }
  get H() { return this.bg.height; }
  layout() {
    const k = this.H / STAGE_H;
    this.pos = { caster: [Math.round(this.W * 0.25), Math.round(FLOOR_Y * k)], target: [Math.round(this.W * 0.755), Math.round(FLOOR_Y * k)] };
  }
  setBackground(canvas) { this.bg = canvas || this.defaultBg; this.layout(); }
  setCaster(spr) { this.caster = spr || this.defaultCaster; }
  setTarget(spr) { this.target = spr || this.defaultTarget; }
  hasCustom() { return this.bg !== this.defaultBg || this.caster !== this.defaultCaster || this.target !== this.defaultTarget; }

  rect(who) {
    const s = this[who], [x, y] = this.pos[who];
    return { x: Math.round(x - s.w / 2), y: y - s.h, w: s.w, h: s.h };
  }
  hitTest(px, py) {
    for (const who of ['target', 'caster']) {
      const r = this.rect(who);
      if (px >= r.x - 3 && px < r.x + r.w + 3 && py >= r.y - 3 && py < r.y + r.h + 3) return who;
    }
    return null;
  }

  anchor(place, progress = 0) {
    const c = this.rect('caster'), t = this.rect('target');
    const staff = [c.x + this.caster.tip[0] + 1, c.y + this.caster.tip[1]];
    const tc = [t.x + t.w / 2, t.y + t.h / 2];
    switch (place) {
      case 'target-ground': return [this.pos.target[0], this.pos.target[1]];
      case 'caster': return [c.x + c.w / 2, c.y + c.h / 2];
      case 'caster-ground': return [this.pos.caster[0], this.pos.caster[1]];
      case 'staff': return staff;
      case 'travel': return [staff[0] + (tc[0] - staff[0]) * progress, staff[1] + (tc[1] - staff[1]) * progress];
      case 'center': return [this.W / 2, this.H / 2];
      default: return tc;
    }
  }

  // How a tick (counted in effect frames) maps onto the stage loop.
  timing(res, tick) {
    const N = res.frames.length, travel = res.place === 'travel';
    const span = travel ? Math.max(N, Math.round(res.fps * 0.6)) : N;
    const gap = res.loop && !travel ? 0 : Math.round(res.fps * 0.45);
    const cyc = ((tick % (span + gap)) + (span + gap)) % (span + gap);
    const hitAt = travel ? span - 1 : res.impact;
    return { N, span, gap, cyc, active: cyc < span, frame: travel ? cyc % N : cyc, progress: span > 1 ? Math.min(1, cyc / (span - 1)) : 1, since: hitAt == null ? -1 : cyc - hitAt };
  }

  draw(g, res, tick, { noBg = false } = {}) {
    const T = this.timing(res, tick);
    const hits = HIT_PLACES.has(res.place) && (!res.loop || res.place === 'travel');
    const since = hits ? T.since : -1;
    g.save();
    g.imageSmoothingEnabled = false;
    if (res.shake && since >= 0 && since < SHAKE.length) {
      const k = Math.min(2, res.shake);
      g.translate(SHAKE[since][0] * k, SHAKE[since][1] * k);
    }
    if (!noBg) g.drawImage(this.bg, 0, 0);
    const [ax, ay] = this.anchor(res.place, T.progress);
    const ex = Math.round(ax - res.pivot[0] * res.w), ey = Math.round(ay - res.pivot[1] * res.h);
    const fx = () => {
      if (!T.active) return;
      if (res.place === 'screen') {
        for (let y = 0; y < this.H; y += res.h) for (let x = 0; x < this.W; x += res.w) res.drawFrame(g, T.frame, x, y);
      } else res.drawFrame(g, T.frame, ex, ey);
    };
    if (res.depth === 'back') fx();
    const c = this.rect('caster');
    g.drawImage(this.caster.canvas, c.x, c.y);
    const t = this.rect('target');
    const knock = since >= 0 && since < 8 ? Math.round(3 * (1 - since / 8)) : 0;
    g.drawImage(since >= 0 && since < 2 ? this.target.white : this.target.canvas, t.x + knock, t.y);
    if (res.depth !== 'back') fx();
    g.restore();
    return T;
  }
}

export { STAGE_W, STAGE_H };

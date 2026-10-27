// Renders recipes in a small pool of module workers, with a main-thread
// fallback. Results are cached by recipe, and each result carries a sprite
// canvas so frames can be drawn at any integer scale.

import { render as renderHere } from '../core/engine.js';
import { sheetLayout } from '../export/formats.js';

const CACHE_MAX = 140;

function withSprites(res) {
  const L = sheetLayout(res.frames.length, res.w, res.h);
  const c = document.createElement('canvas');
  c.width = L.cols * res.w; c.height = L.rows * res.h;
  const ctx = c.getContext('2d');
  res.frames.forEach((f, i) => ctx.putImageData(new ImageData(f, res.w, res.h), (i % L.cols) * res.w, Math.floor(i / L.cols) * res.h));
  res.sheet = c;
  res.drawFrame = (g, i, dx, dy, s = 1) => {
    const k = ((i % res.frames.length) + res.frames.length) % res.frames.length;
    g.drawImage(c, (k % L.cols) * res.w, Math.floor(k / L.cols) * res.h, res.w, res.h, dx, dy, res.w * s, res.h * s);
  };
  return res;
}

export class Renderer {
  constructor(n = Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 4) - 1))) {
    this.cache = new Map();
    this.inflight = new Map();
    this.queue = [];
    this.idle = [];
    this.jobs = new Map();
    this.seq = 0;
    this.fallback = false;
    try {
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => this.done(w, e.data);
        w.onerror = (e) => { e.preventDefault?.(); this.fail(w); };
        this.idle.push(w);
      }
    } catch {
      this.fallback = true;
    }
  }

  key(recipe) { return JSON.stringify(recipe); }

  // `tag`: a newer request with the same tag drops older ones still waiting
  // in the queue (slider drags would otherwise pile up renders).
  render(recipe, { urgent = false, tag = null } = {}) {
    const key = this.key(recipe);
    if (tag) this.queue = this.queue.filter((q) => {
      if (q.tag !== tag || q.key === key) return true;
      this.inflight.delete(q.key);
      q.reject(new Error('stale'));
      return false;
    });
    if (this.cache.has(key)) {
      const v = this.cache.get(key);
      this.cache.delete(key); this.cache.set(key, v);
      return Promise.resolve(v);
    }
    if (this.inflight.has(key)) {
      if (urgent) { const j = this.queue.findIndex((q) => q.key === key); if (j > 0) this.queue.unshift(...this.queue.splice(j, 1)); }
      return this.inflight.get(key);
    }
    const p = new Promise((resolve, reject) => {
      const job = { key, recipe, resolve, reject, tag };
      if (urgent) this.queue.unshift(job); else this.queue.push(job);
    });
    this.inflight.set(key, p);
    this.pump();
    return p;
  }

  pump() {
    if (this.fallback) {
      if (this.busyHere) return;
      const job = this.queue.shift();
      if (!job) return;
      this.busyHere = true;
      setTimeout(() => {
        try { this.finish(job, renderHere(job.recipe)); } catch (err) { this.inflight.delete(job.key); job.reject(err); }
        this.busyHere = false;
        this.pump();
      }, 0);
      return;
    }
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop(), job = this.queue.shift();
      const id = ++this.seq;
      this.jobs.set(id, { job, w });
      w.busy = id;
      w.postMessage({ id, recipe: job.recipe });
    }
  }

  finish(job, res) {
    const out = withSprites(res);
    this.inflight.delete(job.key);
    this.cache.set(job.key, out);
    while (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value);
    job.resolve(out);
  }

  done(w, msg) {
    const entry = this.jobs.get(msg.id);
    this.jobs.delete(msg.id);
    w.busy = 0;
    this.idle.push(w);
    if (entry) {
      if (msg.error) { this.inflight.delete(entry.job.key); entry.job.reject(new Error(msg.error)); }
      else this.finish(entry.job, { ...msg.res, frames: msg.res.frames.map((b) => new Uint8ClampedArray(b)) });
    }
    this.pump();
  }

  // A worker that cannot start (old browser, file://) sends everything to the main thread.
  fail(w) {
    const pending = [...this.jobs.values()].map((e) => e.job);
    this.jobs.clear();
    this.idle = [];
    this.fallback = true;
    this.queue.unshift(...pending);
    this.pump();
  }
}

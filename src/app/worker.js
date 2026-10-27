// Render worker: recipe in, frames out (as transferable buffers).
import { render } from '../core/engine.js';

self.onmessage = (e) => {
  const { id, recipe } = e.data;
  try {
    const res = render(recipe);
    const buffers = res.frames.map((f) => f.buffer);
    self.postMessage({ id, res: { ...res, frames: buffers } }, buffers);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};

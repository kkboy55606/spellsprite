// Easing curves and small math helpers shared by the engine.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const fract = (x) => x - Math.floor(x);

export const EASES = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  inCubic: (t) => t * t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outCubic: (t) => 1 - (1 - t) ** 3,
  outQuart: (t) => 1 - (1 - t) ** 4,
  outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutSine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  outBack: (t) => 1 + 2.6 * (t - 1) ** 3 + 1.6 * (t - 1) ** 2,
};
export const ease = (name, t) => (EASES[name] || EASES.outCubic)(clamp(t));

// Angle difference wrapped to [-PI, PI].
export const angDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

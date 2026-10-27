// A 3x5 pixel font for damage numbers, CRIT!, LEVEL UP and the logo.

const G = {
  '0': '### #.# #.# #.# ###', '1': '.#. ##. .#. .#. ###', '2': '### ..# ### #.. ###', '3': '### ..# .## ..# ###',
  '4': '#.# #.# ### ..# ..#', '5': '### #.. ### ..# ###', '6': '### #.. ### #.# ###', '7': '### ..# ..# .#. .#.',
  '8': '### #.# ### #.# ###', '9': '### #.# ### ..# ###',
  A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '.## #.. #.. #.. .##', D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###', F: '### #.. ##. #.. #..', G: '.## #.. #.# #.# .##', H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###', J: '..# ..# ..# #.# .#.', K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#', N: '##. #.# #.# #.# #.#', O: '.#. #.# #.# #.# .#.', P: '##. #.# ##. #.. #..',
  Q: '.#. #.# #.# ##. .##', R: '##. #.# ##. #.# #.#', S: '.## #.. .#. ..# ##.', T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###', V: '#.# #.# #.# #.# .#.', W: '#.# #.# ### ### #.#', X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.', Z: '### ..# .#. #.. ###',
  '!': '.#. .#. .#. ... .#.', '?': '##. ..# .#. ... .#.', '+': '... .#. ### .#. ...', '-': '... ... ### ... ...',
  '.': '... ... ... ... .#.', '%': '#.# ..# .#. #.. #.#', ':': '... .#. ... .#. ...', '/': '..# ..# .#. #.. #..',
  ' ': '... ... ... ... ...',
};
export const GLYPHS = Object.fromEntries(Object.entries(G).map(([k, v]) => [k, v.split(' ').map((row) => [...row].map((c) => c === '#'))]));
export const GLYPH_W = 3, GLYPH_H = 5;

// Lay out text as a list of [x, y] pixel cells (top-left origin) plus its size.
export function layoutText(text, scale = 1) {
  const cells = [];
  const chars = [...String(text).toUpperCase()].filter((c) => GLYPHS[c]);
  chars.forEach((c, i) => {
    const g = GLYPHS[c];
    for (let y = 0; y < GLYPH_H; y++) for (let x = 0; x < GLYPH_W; x++) {
      if (!g[y][x]) continue;
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) cells.push([(i * (GLYPH_W + 1) + x) * scale + sx, (y * scale) + sy, y / (GLYPH_H - 1)]);
    }
  });
  const w = Math.max(0, chars.length * (GLYPH_W + 1) - 1) * scale;
  return { cells, w, h: GLYPH_H * scale };
}

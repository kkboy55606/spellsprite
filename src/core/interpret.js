// Words to recipe. Rule-based, bilingual (Traditional Chinese and English).
// A prompt is scanned for a form (explosion, slash, portal...), an element
// (fire, ice, lightning...) and modifiers (size, speed, density, colour,
// direction, loop, outline, palette). Forms build layered recipes, elements
// colour them and add accent layers. Unknown words still shift the seed, so
// every prompt gives its own stable result.

import { hashStr, makeRng } from './rng.js';
import { FORMAT } from './engine.js';

// ---------- elements ----------
const E = (label, en, colors, accent, form, zh, enw, names) => ({ label, en, colors, accent, form, zh, words: enw, names });
export const ELEMENTS = {
  fire: E('火', 'Fire', { main: 'fire', alt: 'ember', smoke: 'smoke', spark: 'fire' }, 'embers', 'explosion',
    ['火焰', '烈焰', '燃燒', '火', '炎', '焰', '灼熱'], ['fire', 'flame', 'flames', 'fiery', 'burn', 'burning', 'blaze', 'inferno', 'ember', 'embers', 'pyro', 'hellfire', 'heat', 'hot', 'ignite', 'scorch'],
    { zh: ['烈焰', '灼炎', '赤焰', '業火'], en: ['Blazing', 'Scorched', 'Crimson', 'Ember'] }),
  lava: E('熔岩', 'Lava', { main: 'lava', alt: 'fire', smoke: 'ash', spark: 'lava' }, 'embers', 'pillar',
    ['熔岩', '岩漿', '火山', '熔漿'], ['lava', 'magma', 'molten', 'volcano', 'volcanic'],
    { zh: ['熔岩', '岩漿', '熔火'], en: ['Molten', 'Magma', 'Volcanic'] }),
  ice: E('冰', 'Ice', { main: 'ice', alt: 'frost', smoke: 'frost', spark: 'frost' }, 'shards', 'spikes',
    ['寒冰', '冰霜', '冰凍', '極寒', '冰', '霜', '凍', '寒'], ['ice', 'icy', 'frost', 'frosty', 'freeze', 'freezing', 'frozen', 'cold', 'glacier', 'glacial', 'cryo', 'chill', 'winter'],
    { zh: ['寒冰', '霜華', '冰晶', '凜冬'], en: ['Frozen', 'Glacial', 'Rime', 'Winter'] }),
  lightning: E('雷', 'Lightning', { main: 'electric', alt: 'thunder', smoke: 'smoke', spark: 'electric' }, 'arcs', 'strike',
    ['閃電', '雷電', '雷霆', '電擊', '雷', '電'], ['lightning', 'thunder', 'electric', 'electricity', 'shock', 'zap', 'volt', 'spark', 'sparks', 'storm', 'static', 'tesla', 'thunderbolt'],
    { zh: ['雷霆', '電光', '奔雷', '天雷'], en: ['Storm', 'Volt', 'Thunder', 'Static'] }),
  poison: E('毒', 'Poison', { main: 'poison', alt: 'poison', smoke: 'poison', spark: 'poison' }, 'bubbles', 'cloud',
    ['劇毒', '毒液', '瘟疫', '腐蝕', '毒', '酸'], ['poison', 'poisonous', 'toxic', 'venom', 'acid', 'plague', 'blight', 'sludge', 'slime', 'corrosive', 'miasma'],
    { zh: ['劇毒', '腐蝕', '瘴氣', '蝕骨'], en: ['Toxic', 'Venom', 'Blight', 'Miasma'] }),
  holy: E('聖光', 'Holy', { main: 'holy', alt: 'gold', smoke: 'white', spark: 'holy' }, 'motes', 'pillar',
    ['神聖', '聖光', '光明', '天使', '天堂', '聖', '光'], ['holy', 'light', 'divine', 'radiant', 'angel', 'angelic', 'heaven', 'heavenly', 'sacred', 'celestial', 'paladin'],
    { zh: ['神聖', '聖輝', '天光', '黎明'], en: ['Radiant', 'Sacred', 'Dawn', 'Seraph'] }),
  shadow: E('暗影', 'Shadow', { main: 'shadow', alt: 'void', smoke: 'shadow', spark: 'shadow' }, 'wisps', 'aura',
    ['黑暗', '暗影', '惡魔', '詛咒', '暗', '影', '邪', '黑'], ['dark', 'darkness', 'shadow', 'shadows', 'evil', 'demon', 'demonic', 'curse', 'cursed', 'necro', 'necrotic', 'doom', 'black'],
    { zh: ['暗影', '幽影', '夜蝕', '咒怨'], en: ['Shadow', 'Umbral', 'Nightfall', 'Cursed'] }),
  void: E('虛空', 'Void', { main: 'void', alt: 'shadow', smoke: 'shadow', spark: 'void' }, 'wisps', 'blackhole',
    ['虛空', '深淵', '宇宙', '星雲', '銀河'], ['void', 'abyss', 'abyssal', 'cosmic', 'galaxy', 'space', 'nebula', 'astral'],
    { zh: ['虛空', '星淵', '幽冥', '無垠'], en: ['Void', 'Hollow', 'Starless', 'Null'] }),
  arcane: E('奧術', 'Arcane', { main: 'arcane', alt: 'energy', smoke: 'arcane', spark: 'arcane' }, 'runes', 'circle',
    ['奧術', '魔法', '法術', '魔力', '神秘', '秘術', '魔'], ['arcane', 'magic', 'magical', 'mystic', 'mana', 'spell', 'sorcery', 'wizard', 'witch'],
    { zh: ['奧術', '秘法', '星咒', '幻月'], en: ['Arcane', 'Mystic', 'Runic', 'Astral'] }),
  nature: E('自然', 'Nature', { main: 'nature', alt: 'nature', smoke: 'dust', spark: 'nature' }, 'leaves', 'heal',
    ['自然', '樹葉', '植物', '森林', '生命', '葉', '藤', '花', '草'], ['nature', 'leaf', 'leaves', 'plant', 'vine', 'vines', 'forest', 'druid', 'life', 'bloom', 'grass'],
    { zh: ['翠綠', '森羅', '新芽', '生命'], en: ['Verdant', 'Sylvan', 'Bloom', 'Wild'] }),
  water: E('水', 'Water', { main: 'water', alt: 'ice', smoke: 'frost', spark: 'water' }, 'droplets', 'splash',
    ['泡泡', '水流', '海浪', '水', '海', '浪', '潮'], ['water', 'aqua', 'wave', 'waves', 'ocean', 'sea', 'tidal', 'tide', 'hydro', 'bubble', 'bubbles', 'liquid'],
    { zh: ['潮汐', '碧波', '激流', '深海'], en: ['Tidal', 'Aqua', 'Torrent', 'Deep'] }),
  blood: E('血', 'Blood', { main: 'blood', alt: 'blood', smoke: 'blood', spark: 'blood' }, 'droplets', 'slash',
    ['鮮血', '血液', '吸血', '血'], ['blood', 'bloody', 'crimson', 'gore', 'vampire', 'vampiric', 'bleed'],
    { zh: ['鮮血', '血月', '猩紅', '嗜血'], en: ['Crimson', 'Sanguine', 'Bloodmoon', 'Feral'] }),
  earth: E('大地', 'Earth', { main: 'earth', alt: 'dust', smoke: 'dust', spark: 'earth' }, 'debris', 'slam',
    ['大地', '岩石', '土', '岩', '石', '泥'], ['earth', 'rock', 'rocks', 'stone', 'dirt', 'mud', 'boulder', 'terra'],
    { zh: ['大地', '磐石', '崩岩', '裂土'], en: ['Stone', 'Granite', 'Terra', 'Quaking'] }),
  wind: E('風', 'Wind', { main: 'wind', alt: 'frost', smoke: 'wind', spark: 'wind' }, 'gusts', 'tornado',
    ['疾風', '氣流', '風'], ['wind', 'air', 'gust', 'breeze', 'aero', 'windy'],
    { zh: ['疾風', '蒼風', '狂嵐', '颯'], en: ['Gale', 'Zephyr', 'Squall', 'Sky'] }),
  steel: E('鋼鐵', 'Steel', { main: 'steel', alt: 'white', smoke: 'smoke', spark: 'white' }, 'sparks', 'slash',
    ['金屬', '鋼', '鐵', '銀'], ['steel', 'metal', 'iron', 'silver', 'chrome'],
    { zh: ['鋼鐵', '銀刃', '寒鋒', '鐵血'], en: ['Steel', 'Iron', 'Silver', 'Razor'] }),
  gold: E('黃金', 'Gold', { main: 'gold', alt: 'holy', smoke: 'dust', spark: 'gold' }, 'glints', 'loot',
    ['黃金', '寶物', '金'], ['gold', 'golden', 'treasure', 'money', 'rich'],
    { zh: ['黃金', '鎏金', '金耀', '財寶'], en: ['Golden', 'Gilded', 'Lucky', 'Royal'] }),
  plasma: E('能量', 'Plasma', { main: 'plasma', alt: 'electric', smoke: 'smoke', spark: 'plasma' }, 'sparks', 'beam',
    ['電漿', '能量', '離子', '霓虹', '科技'], ['plasma', 'energy', 'ion', 'cyber', 'tech', 'neon', 'laser', 'photon'],
    { zh: ['電漿', '離子', '光子', '霓虹'], en: ['Plasma', 'Ion', 'Photon', 'Neon'] }),
  spirit: E('靈魂', 'Spirit', { main: 'spirit', alt: 'spirit', smoke: 'spirit', spark: 'spirit' }, 'wisps', 'aura',
    ['靈魂', '幽靈', '鬼火', '靈', '魂', '鬼'], ['spirit', 'ghost', 'ghostly', 'soul', 'spectral', 'phantom', 'ethereal', 'wisp'],
    { zh: ['幽魂', '靈火', '冥燈', '幻靈'], en: ['Spectral', 'Phantom', 'Soul', 'Wisp'] }),
  rose: E('愛心', 'Love', { main: 'rose', alt: 'energy', smoke: 'rose', spark: 'rose' }, 'hearts', 'heal',
    ['愛心', '可愛', '魅惑', '愛', '心', '戀'], ['love', 'heart', 'hearts', 'romance', 'cute', 'kawaii', 'charm'],
    { zh: ['戀心', '甜蜜', '櫻粉', '心動'], en: ['Sweet', 'Lovely', 'Charm', 'Blossom'] }),
};

// ---------- accents (added by elements) ----------
const ACCENTS = {
  embers: (c, f) => [{ kind: 'particles', color: '@spark', mode: 'rise', count: c.k(10), x: f[0], y: f[1] + 0.2, area: 0.45, areaX: 1.2, areaY: 0.4, speed: [0.5, 1], life: [0.4, 0.9], wiggle: 0.06, shape: 'dot', heat: [1.05, 0.4], emit: c.loop ? 0 : 0.6, from: c.loop ? 0 : 0.1 }],
  shards: (c, f) => [{ kind: 'particles', color: '@alt', mode: 'burst', count: c.k(8), x: f[0], y: f[1], speed: [1, 1.9], gravity: 1.2, drag: 1, shape: 'shard', size: [1, 1], heat: [1.05, 0.6], from: c.loop ? 0 : 0.05 }],
  arcs: (c, f) => [{ kind: 'bolt', color: '@spark', mode: 'radial', count: 2, len: 0.55, depth: 4, hold: 2, flicker: 0.35, x: f[0], y: f[1], to: c.loop ? 1 : 0.75, fadeStart: 0.3 }],
  bubbles: (c, f) => [{ kind: 'particles', color: '@spark', mode: 'rise', count: c.k(7), x: f[0], y: f[1] + 0.2, area: 0.5, areaX: 1.2, areaY: 0.5, speed: [0.4, 0.8], life: [0.5, 0.9], shape: 'bubble', size: [1, 2], wiggle: 0.08, heat: [0.95, 0.6], emit: c.loop ? 0 : 0.6, from: c.loop ? 0 : 0.1 }],
  motes: (c, f) => [{ kind: 'particles', color: '@spark', mode: 'rise', count: c.k(7), x: f[0], y: f[1] + 0.2, area: 0.5, areaX: 1.3, areaY: 0.5, speed: [0.4, 0.8], life: [0.45, 0.9], shape: 'star', size: [2, 1], twinkle: 2, heat: [1.1, 0.6], emit: c.loop ? 0 : 0.6, from: c.loop ? 0 : 0.1 }],
  wisps: (c, f) => [{ kind: 'particles', color: '@alt', mode: 'rise', count: c.k(8), x: f[0], y: f[1] + 0.1, area: 0.5, areaX: 1.3, areaY: 0.5, speed: [0.5, 0.9], life: [0.4, 0.8], shape: 'circle', size: [2, 1], wiggle: 0.1, heat: [0.95, 0.45], emit: c.loop ? 0 : 0.6, from: c.loop ? 0 : 0.1 }],
  runes: (c, f) => [{ kind: 'particles', color: '@spark', mode: 'orbit', count: c.k(6), x: f[0], y: f[1], orbitR: 0.85, turns: 1, squash: 0.5, shape: 'star', size: [1, 1], twinkle: 2, heat: [1.05, 1.05] }],
  leaves: (c, f) => [{ kind: 'particles', color: '@spark', mode: 'burst', count: c.k(7), x: f[0], y: f[1], speed: [0.7, 1.3], gravity: 1.2, drag: 1.6, life: [0.6, 1], shape: 'leaf', size: [2, 2], heat: [1, 0.6], from: c.loop ? 0 : 0.08 }],
  droplets: (c, f) => [{ kind: 'particles', color: '@spark', mode: 'burst', count: c.k(9), x: f[0], y: f[1], dir: -90, spread: 200, speed: [1.1, 2], gravity: 3, drag: 0.6, life: [0.4, 0.8], shape: 'drop', size: [1, 1], heat: [1.05, 0.6], from: c.loop ? 0 : 0.05 }],
  debris: (c, f) => [{ kind: 'particles', color: '@alt', mode: 'burst', count: c.k(8), x: f[0], y: f[1], dir: -90, spread: 170, speed: [1.2, 2.2], gravity: 3.5, drag: 0.6, life: [0.5, 0.9], shape: 'chunk', size: [2, 1], heat: [0.95, 0.6], from: c.loop ? 0 : 0.05 }],
  gusts: (c, f) => [{ kind: 'streaks', color: '@spark', mode: 'flow', count: 3, r: 0.7, squash: 0.55, turns: 1, x: f[0], y: f[1], gain: 0.85 }],
  sparks: (c, f) => [{ kind: 'particles', color: '@spark', mode: 'burst', count: c.k(9), x: f[0], y: f[1], speed: [1.5, 2.6], drag: 2.6, life: [0.3, 0.6], shape: 'streak', heat: [1.1, 0.5], from: c.loop ? 0 : 0.02 }],
  glints: (c, f) => [{ kind: 'particles', color: '@spark', mode: 'burst', count: c.k(5), x: f[0], y: f[1], speed: [0.4, 0.9], drag: 1.2, life: [0.5, 1], shape: 'star', size: [2, 1], twinkle: 3, heat: [1.15, 0.7], from: c.loop ? 0 : 0.2 }],
  hearts: (c, f) => [{ kind: 'particles', color: '@spark', mode: 'rise', count: c.k(4), x: f[0], y: f[1] + 0.2, area: 0.5, areaX: 1.2, areaY: 0.4, speed: [0.5, 0.8], life: [0.5, 0.9], shape: 'heart', wiggle: 0.06, heat: [1.05, 0.7], emit: c.loop ? 0 : 0.5, from: c.loop ? 0 : 0.15 }],
};

// ---------- forms ----------
// size: canvas at size 1; place: where the stage puts it; focus: where accents go (units).
const F = (o) => o;
export const FORMS = {
  explosion: F({ label: '爆炸', en: 'Explosion', el: 'fire', size: [64, 64], frames: 18, fps: 15, place: 'target', shake: 1, focus: [0, 0],
    zh: ['爆炸', '爆破', '爆裂', '炸彈', '炸裂', '轟炸'], words: ['explosion', 'explode', 'exploding', 'blast', 'boom', 'kaboom', 'detonate', 'detonation', 'bomb', 'grenade'],
    build: (c) => [
      { kind: 'smoke', color: '@smoke', from: 0.2, count: c.k(7), spread: 0.36, rise: 0.4, r0: 0.16, r1: 0.42, life: [0.5, 0.8], emit: 0.18, gain: 0.62, y: 0.05 },
      { kind: 'blast', color: '@main', r1: 0.78, grow: 0.4, rough: 0.6, erodeStart: 0.32 },
      { kind: 'ring', color: '@alt', r1: 0.95, th: 0.16, breakup: 0.8, gain: 0.8, to: 0.7 },
      { kind: 'particles', color: '@spark', mode: 'burst', count: c.k(16), speed: [1.6, 2.8], drag: 2.6, shape: 'streak', heat: [1.1, 0.4], life: [0.35, 0.7] },
      { kind: 'flash', color: '@main', r: 0.45, dur: 0.1 },
    ] }),
  nova: F({ label: '新星衝擊', en: 'Nova', el: 'arcane', size: [64, 64], frames: 16, fps: 15, place: 'target', shake: 1, focus: [0, 0],
    zh: ['新星', '衝擊波', '震波', '脈衝', '爆發'], words: ['nova', 'shockwave', 'pulse', 'burst', 'supernova', 'radial'],
    build: (c) => [
      { kind: 'rays', color: '@main', count: 12, r: 0.9, to: 0.6, gain: 0.75 },
      { kind: 'ring', color: '@main', r0: 0.1, r1: 0.96, th: 0.22, breakup: 0.6 },
      { kind: 'particles', color: '@spark', mode: 'burst', count: c.k(16), speed: [2, 3.2], drag: 2.4, shape: 'streak', size: [2, 1] },
      { kind: 'flash', color: '@main', r: 0.4, dur: 0.1 },
    ] }),
  slash: F({ label: '斬擊', en: 'Slash', el: 'steel', size: [64, 64], frames: 12, fps: 18, place: 'target', facing: true, focus: [0.5, 0.4],
    zh: ['斬擊', '劍氣', '刀光', '揮砍', '斬', '劈', '砍', '劍', '刀'], words: ['slash', 'slice', 'cut', 'sword', 'blade', 'swing', 'cleave', 'katana', 'saber'],
    build: (c) => [
      { kind: 'slash', color: '@main', r: 0.76, th: 0.32, a0: -160, a1: 40, sweep: 0.32, gain: 1.1, glow: 1 },
      { kind: 'slash', color: '@spark', r: 0.58, th: 0.12, a0: -150, a1: 30, from: 0.04, sweep: 0.3, gain: 1.2 },
      { kind: 'particles', color: '@spark', mode: 'burst', count: c.k(8), x: 0.55, y: 0.45, dir: 130, spread: 70, speed: [1, 2], drag: 2, shape: 'streak', life: [0.3, 0.6], from: 0.2 },
    ] }),
  hit: F({ label: '打擊火花', en: 'Hit Spark', el: 'gold', size: [48, 48], frames: 10, fps: 18, place: 'target', focus: [0, 0],
    zh: ['打擊', '命中', '受擊', '擊中', '拳'], words: ['hit', 'impact', 'punch', 'kick', 'smack', 'struck', 'whack', 'bonk'],
    build: (c) => [
      { kind: 'star', color: '@main', points: 7, r: 0.8, inner: 0.2, pop: 0.2 },
      { kind: 'ring', color: '@alt', r0: 0.15, r1: 0.9, th: 0.14, to: 0.7, gain: 0.85 },
      { kind: 'particles', color: '@spark', mode: 'burst', count: c.k(10), speed: [1.8, 3], drag: 3, shape: 'streak', life: [0.3, 0.6] },
      { kind: 'flash', color: '@main', r: 0.5, dur: 0.12 },
    ] }),
  claw: F({ label: '爪擊', en: 'Claw', el: 'blood', size: [64, 64], frames: 12, fps: 18, place: 'target', facing: true, focus: [0, 0],
    zh: ['爪痕', '爪擊', '抓痕', '爪', '抓'], words: ['claw', 'claws', 'scratch', 'maul', 'rend', 'swipe'],
    build: (c) => [
      { kind: 'streaks', color: '@main', mode: 'claw', count: 3, angle: 55, len: 1.5, gap: 0.24, curve: 0.2, th: 2 },
      { kind: 'particles', color: '@spark', mode: 'burst', count: c.k(8), dir: 55, spread: 60, speed: [1, 2], drag: 2, shape: 'streak', from: 0.15, life: [0.3, 0.6] },
      { kind: 'flash', color: '@main', r: 0.3, dur: 0.08, gain: 0.85 },
    ] }),
  beam: F({ label: '光束', en: 'Beam', el: 'plasma', size: [128, 48], frames: 12, fps: 15, loop: true, place: 'staff', pivot: [0.04, 0.5], facing: true, focus: [0, 0],
    zh: ['光束', '雷射', '激光', '光炮', '射線', '光線'], words: ['beam', 'laser', 'ray', 'kamehameha', 'cannon', 'lazer'],
    build: (c) => [
      { kind: 'beam', color: '@main', x: -2.45, len: 5.3, th: 0.34, cap: 0.48, wob: 0.5, speed: 2, glow: 1 },
      { kind: 'particles', color: '@spark', mode: 'spray', x: -2.3, dir: 0, spread: 10, speed: [3.5, 5.5], drag: 0, count: c.k(12), shape: 'streak', life: [0.3, 0.7], area: 0.15, areaY: 1.4 },
      { kind: 'orb', color: '@spark', x: -2.45, r: 0.42, pulse: 0.1, pulseRate: 2, gain: 0.95 },
    ] }),
  projectile: F({ label: '飛彈', en: 'Bolt', el: 'fire', size: [48, 32], frames: 8, fps: 15, loop: true, place: 'travel', facing: true, focus: [0.4, 0],
    zh: ['飛彈', '射擊', '子彈', '彈'], words: ['projectile', 'missile', 'shot', 'bullet', 'bolt', 'dart', 'arrow'],
    build: (c) => [
      { kind: 'particles', color: '@spark', mode: 'spray', x: 0.3, dir: 180, spread: 30, speed: [1.5, 2.5], drag: 0, count: c.k(10), area: 0.15, shape: 'dot', life: [0.3, 0.6], heat: [1, 0.3] },
      { kind: 'comet', color: '@main', x: 0.45, r: 0.3, len: 1.4, speed: 2 },
    ] }),
  orb: F({ label: '能量球', en: 'Orb', el: 'arcane', size: [48, 48], frames: 12, fps: 12, loop: true, place: 'target', focus: [0, 0],
    zh: ['能量球', '光球', '球體', '球'], words: ['orb', 'sphere', 'ball', 'globe'],
    build: (c) => [
      { kind: 'orb', color: '@main', r: 0.5, pulse: 0.08, pulseRate: 1, spin: 1, glow: 1 },
      { kind: 'particles', color: '@spark', mode: 'orbit', count: c.k(8), orbitR: 0.78, turns: 1, squash: 0.45, shape: 'dot', heat: [1.05, 1.05] },
    ] }),
  vortex: F({ label: '漩渦', en: 'Vortex', el: 'arcane', size: [64, 64], frames: 16, fps: 12, loop: true, place: 'target', focus: [0, 0],
    zh: ['漩渦', '螺旋', '渦流', '渦'], words: ['vortex', 'swirl', 'whirlpool', 'spiral', 'maelstrom'],
    build: (c) => [
      { kind: 'vortex', color: '@main', r: 0.9, rIn: 0.16, arms: 3, twist: 2, spin: 1, core: c.dark ? 'dark' : 'bright' },
      { kind: 'particles', color: '@spark', mode: 'implode', count: c.k(14), implodeR: 1, swirl: 2.5, life: [0.5, 0.9], shape: 'dot' },
    ] }),
  blackhole: F({ label: '黑洞', en: 'Black Hole', el: 'void', size: [64, 64], frames: 16, fps: 12, loop: true, place: 'target', focus: [0, 0],
    zh: ['黑洞', '奇點'], words: ['black hole', 'blackhole', 'singularity', 'event horizon'],
    build: (c) => [
      { kind: 'vortex', color: '@main', r: 0.94, rIn: 0.24, arms: 2, twist: 2.6, spin: 1, core: 'dark' },
      { kind: 'particles', color: '@spark', mode: 'implode', count: c.k(16), implodeR: 1.05, swirl: 3, life: [0.6, 1], heat: [1, 0.5], shape: 'dot' },
    ] }),
  portal: F({ label: '傳送門', en: 'Portal', el: 'arcane', size: [48, 80], frames: 16, fps: 12, loop: true, place: 'target-ground', pivot: [0.5, 0.92], focus: [0, 0],
    zh: ['傳送門', '次元門', '裂隙', '時空門'], words: ['portal', 'gate', 'gateway', 'rift', 'wormhole'],
    build: (c) => [
      { kind: 'vortex', color: '@main', r: 0.85, rIn: 0.2, arms: 4, twist: 1.6, spin: 1, squash: 1.55, core: c.dark ? 'dark' : 'bright' },
      { kind: 'particles', color: '@spark', mode: 'orbit', count: c.k(10), orbitR: 0.92, turns: 1, squash: 1.55, shape: 'dot', heat: [1.05, 1.05] },
    ] }),
  aura: F({ label: '氣場', en: 'Aura', el: 'fire', size: [64, 64], frames: 12, fps: 12, loop: true, place: 'caster-ground', pivot: [0.5, 0.9], depth: 'back', focus: [0, 0.1],
    zh: ['氣場', '鬥氣', '覺醒', '霸氣', '光環', '氣息'], words: ['aura', 'power up', 'powerup', 'rage', 'awaken', 'super saiyan', 'ki'],
    build: (c) => [
      { kind: 'flame', color: '@main', y: 0.8, w: 0.72, hgt: 1.6, hollow: 0.9, rough: 0.85, speed: 2, gain: 1.8 },
      { kind: 'flame', color: '@alt', y: 0.82, w: 0.6, hgt: 1.15, hollow: 1, rough: 0.7, speed: 2, gain: 1.3, seed: 5, blend: 'under' },
      { kind: 'particles', color: '@spark', mode: 'rise', count: c.k(10), y: 0.7, area: 0.5, areaX: 1.2, areaY: 0.3, speed: [0.8, 1.4], life: [0.4, 0.8], shape: 'dot', wiggle: 0.05 },
    ] }),
  flame: F({ label: '火苗', en: 'Flame', el: 'fire', size: [48, 64], frames: 12, fps: 12, loop: true, place: 'target-ground', pivot: [0.5, 0.88], focus: [0, 0.2],
    zh: ['篝火', '營火', '火堆', '燭火'], words: ['campfire', 'bonfire', 'torch', 'candle', 'burner'],
    build: (c) => [
      { kind: 'flame', color: '@main', y: 0.7, w: 0.5, hgt: 1.4, speed: 2 },
      { kind: 'flame', color: '@alt', y: 0.72, w: 0.3, hgt: 0.9, speed: 2, seed: 3, gain: 1.1 },
    ] }),
  shield: F({ label: '護盾', en: 'Shield', el: 'water', size: [64, 64], frames: 16, fps: 12, loop: true, place: 'caster', focus: [0, 0],
    zh: ['護盾', '屏障', '結界', '防護', '盾'], words: ['shield', 'barrier', 'ward', 'protect', 'protection', 'force field', 'forcefield'],
    build: (c) => [
      { kind: 'shield', color: '@main', r: 0.88, hex: 0.45, fill: 0.14, shimmer: 1 },
      { kind: 'particles', color: '@spark', mode: 'orbit', count: c.k(4), orbitR: 0.92, turns: 1, shape: 'star', size: [1, 1], twinkle: 2, heat: [1.1, 1.1] },
    ] }),
  heal: F({ label: '治癒', en: 'Heal', el: 'nature', size: [64, 64], frames: 20, fps: 15, place: 'caster-ground', pivot: [0.5, 0.84], focus: [0, 0.3],
    zh: ['治癒', '治療', '回復', '補血', '恢復', '療癒'], words: ['heal', 'healing', 'cure', 'regen', 'regenerate', 'restore', 'recovery', 'mend'],
    build: (c) => [
      { kind: 'ring', color: '@main', y: 0.68, squash: 0.3, r0: 0.2, r1: 0.9, th: 0.14, breakup: 0.4, gain: 0.85 },
      { kind: 'pillar', color: '@alt', y: 0.68, w: 0.42, hgt: 1.6, gain: 0.55, grow: 0.25, base: 0.3 },
      { kind: 'particles', color: '@spark', mode: 'rise', y: 0.5, area: 0.5, areaX: 1.2, areaY: 0.4, count: c.k(10), speed: [0.7, 1.2], life: [0.4, 0.8], emit: 0.5, shape: 'plus', heat: [1.05, 0.6], from: 0.1 },
    ] }),
  levelup: F({ label: '升級', en: 'Level Up', el: 'gold', size: [64, 80], frames: 24, fps: 15, place: 'caster-ground', pivot: [0.5, 0.86], focus: [0, 0.2],
    zh: ['升級', '等級提升', '進化'], words: ['level up', 'levelup', 'lvl up', 'rank up', 'evolve'],
    build: (c) => [
      { kind: 'ring', color: '@main', y: 0.75, squash: 0.3, r1: 0.95, th: 0.16 },
      { kind: 'pillar', color: '@main', y: 0.75, w: 0.36, hgt: 2, gain: 0.8, grow: 0.2 },
      { kind: 'particles', color: '@spark', mode: 'rise', y: 0.6, area: 0.5, areaX: 1.1, areaY: 0.4, count: c.k(8), speed: [1, 1.6], life: [0.4, 0.8], emit: 0.5, shape: 'chevron', heat: [1.1, 0.5], from: 0.1 },
      { kind: 'text', color: '@spark', text: 'LEVEL UP', y: -0.85, rise: 0.2, from: 0.15 },
    ] }),
  buff: F({ label: '增益', en: 'Buff', el: 'holy', size: [48, 64], frames: 18, fps: 15, place: 'caster-ground', pivot: [0.5, 0.88], focus: [0, 0.2],
    zh: ['增益', '強化', '加持', '祝福', '加速', '鼓舞'], words: ['buff', 'boost', 'enhance', 'empower', 'blessing', 'bless', 'haste', 'inspire'],
    build: (c) => [
      { kind: 'ring', color: '@main', y: 0.9, squash: 0.3, r1: 0.85, th: 0.16 },
      { kind: 'particles', color: '@main', mode: 'rise', y: 0.7, area: 0.5, areaX: 1, areaY: 0.5, count: c.k(6), speed: [1, 1.6], life: [0.4, 0.8], emit: 0.45, shape: 'chevron', heat: [1.1, 0.5] },
      { kind: 'particles', color: '@spark', mode: 'rise', y: 0.5, area: 0.6, areaX: 1, areaY: 0.8, count: c.k(4), speed: [0.4, 0.8], life: [0.4, 0.8], emit: 0.5, shape: 'star', size: [2, 1], twinkle: 2, from: 0.1 },
    ] }),
  pillar: F({ label: '光柱', en: 'Pillar', el: 'holy', size: [48, 96], frames: 18, fps: 15, place: 'target-ground', pivot: [0.5, 0.925], focus: [0, 0.8],
    zh: ['光柱', '天柱', '火柱', '噴泉', '柱'], words: ['pillar', 'column', 'geyser', 'beacon', 'skybeam', 'judgement', 'judgment', 'eruption', 'erupt'],
    build: (c) => [
      { kind: 'ring', color: '@main', y: 1.7, squash: 0.3, r0: 0.1, r1: 0.9, th: 0.15, to: 0.6 },
      { kind: 'pillar', color: '@main', y: 1.7, w: 0.45, hgt: 3.6, grow: 0.15, speed: 3 },
      { kind: 'particles', color: '@spark', mode: 'rise', y: 1.6, area: 0.3, areaX: 1.6, areaY: 0.2, count: c.k(10), speed: [1.5, 2.5], life: [0.4, 0.8], emit: 0.6, shape: 'streak' },
      { kind: 'flash', color: '@main', y: 1.4, r: 0.5, dur: 0.08 },
    ] }),
  strike: F({ label: '落雷', en: 'Strike', el: 'lightning', size: [64, 96], frames: 14, fps: 15, place: 'target-ground', pivot: [0.5, 0.917], shake: 1, focus: [0, 1.1],
    zh: ['落雷', '雷擊', '天罰', '天雷', '雷劈'], words: ['strike', 'smite', 'lightning strike', 'thunderstrike', 'thunder strike', 'from the sky'],
    build: (c) => [
      { kind: 'smoke', color: '@smoke', y: 1.25, from: 0.25, count: c.k(5), spread: 0.4, flat: 0.3, rise: 0.3, r0: 0.1, r1: 0.25, gain: 0.6 },
      { kind: 'bolt', color: '@main', mode: 'strike', y: 1.2, count: 2, depth: 6, jag: 0.4, branch: 0.4, thick: 2, hold: 2, fadeStart: 0.45, to: 0.7, glow: 1 },
      { kind: 'blast', color: '@alt', y: 1.2, squash: 0.6, r0: 0.05, r1: 0.45, grow: 0.3, from: 0.05, gain: 0.9 },
      { kind: 'ring', color: '@main', y: 1.25, squash: 0.3, r1: 0.9, th: 0.14, from: 0.05 },
      { kind: 'particles', color: '@spark', mode: 'burst', y: 1.2, dir: -90, spread: 160, speed: [1.5, 2.5], gravity: 3, drag: 1, count: c.k(10), shape: 'streak', from: 0.05 },
      { kind: 'flash', color: '@main', y: 1.1, r: 0.6, dur: 0.1 },
    ] }),
  slam: F({ label: '震地', en: 'Slam', el: 'earth', size: [96, 48], frames: 18, fps: 15, place: 'target-ground', pivot: [0.5, 0.8], shake: 2, focus: [0, 0.45],
    zh: ['震地', '地震', '重擊', '踐踏', '砸地', '撼地', '地裂'], words: ['slam', 'ground slam', 'quake', 'earthquake', 'stomp', 'smash', 'crush', 'shatter'],
    build: (c) => [
      { kind: 'smoke', color: '@smoke', y: 0.55, from: 0.1, count: c.k(8), spread: 1.4, flat: 0.15, rise: 0.25, r0: 0.12, r1: 0.3, gain: 0.6 },
      { kind: 'cracks', color: '@alt', y: 0.6, count: 7, len: 1.6, squash: 0.3 },
      { kind: 'ring', color: '@main', y: 0.6, squash: 0.3, r0: 0.1, r1: 1.9, th: 0.2 },
      { kind: 'ring', color: '@main', y: 0.6, squash: 0.3, r0: 0.05, r1: 1.3, th: 0.12, from: 0.08, gain: 0.8 },
      { kind: 'particles', color: '@alt', mode: 'burst', y: 0.5, dir: -90, spread: 120, speed: [1.5, 2.6], gravity: 4, drag: 0.6, ground: 0.62, count: c.k(12), shape: 'chunk', size: [2, 1] },
    ] }),
  spikes: F({ label: '尖刺', en: 'Spikes', el: 'ice', size: [80, 64], frames: 18, fps: 15, place: 'target-ground', pivot: [0.5, 0.875], focus: [0, 0.5],
    zh: ['冰刺', '地刺', '突刺', '荊棘', '水晶', '尖刺', '刺'], words: ['spikes', 'spike', 'crystals', 'crystal', 'thorns', 'icicles', 'shards', 'stalagmite'],
    build: (c) => [
      { kind: 'smoke', color: '@smoke', y: 0.75, from: 0.1, count: c.k(6), spread: 0.9, flat: 0.2, rise: 0.3, gain: 0.55 },
      { kind: 'spikes', color: '@main', y: 0.78, count: 5, spread: 0.8, hgt: [0.8, 1.5], width: [0.18, 0.3] },
      { kind: 'particles', color: '@alt', mode: 'burst', y: 0.6, dir: -90, spread: 140, speed: [1.2, 2.2], gravity: 3, drag: 0.8, count: c.k(10), shape: 'shard', from: 0.15 },
    ] }),
  tornado: F({ label: '龍捲風', en: 'Tornado', el: 'wind', size: [64, 96], frames: 12, fps: 15, loop: true, place: 'target-ground', pivot: [0.5, 0.95], focus: [0, 0.6],
    zh: ['龍捲風', '龍捲', '旋風', '颶風'], words: ['tornado', 'cyclone', 'twister', 'whirlwind', 'hurricane'],
    build: (c) => [
      { kind: 'tornado', color: '@main', y: 1.35, hgt: 2.6, w0: 0.12, w1: 0.75, twist: 3, spin: 2 },
      { kind: 'particles', color: '@spark', mode: 'orbit', y: 0.6, squash: 0.35, orbitR: 0.8, turns: 2, count: c.k(10), shape: 'dot', heat: [1.05, 1.05] },
    ] }),
  circle: F({ label: '魔法陣', en: 'Magic Circle', el: 'arcane', size: [80, 48], frames: 16, fps: 12, loop: true, place: 'caster-ground', pivot: [0.5, 0.5], depth: 'back', focus: [0, -0.2],
    zh: ['魔法陣', '法陣', '召喚陣', '符文', '陣'], words: ['magic circle', 'summoning circle', 'sigil', 'rune', 'runes', 'pentagram', 'glyph', 'circle'],
    build: (c) => [
      { kind: 'sigil', color: '@main', r: 1.5, squash: 0.42, spin: 1, star: 5, runes: 10, ticks: 24 },
      { kind: 'particles', color: '@spark', mode: 'rise', count: c.k(8), area: 1, areaX: 1.4, areaY: 0.3, speed: [0.4, 0.8], life: [0.4, 0.9], shape: 'dot' },
    ] }),
  summon: F({ label: '召喚', en: 'Summon', el: 'arcane', size: [80, 80], frames: 24, fps: 15, place: 'target-ground', pivot: [0.5, 0.8], focus: [0, 0.2],
    zh: ['召喚', '降臨', '顯現'], words: ['summon', 'summoning', 'conjure', 'manifest'],
    build: (c) => [
      { kind: 'sigil', color: '@main', y: 0.6, r: 1.2, squash: 0.4, draw: 0.3 },
      { kind: 'pillar', color: '@alt', y: 0.6, w: 0.5, hgt: 2.2, from: 0.35, grow: 0.15, gain: 0.9 },
      { kind: 'particles', color: '@spark', mode: 'rise', y: 0.5, count: c.k(12), area: 1, areaX: 1.2, areaY: 0.3, from: 0.3, emit: 0.5, speed: [0.8, 1.4], shape: 'dot' },
      { kind: 'flash', color: '@main', y: 0.2, r: 0.6, from: 0.35, dur: 0.08 },
    ] }),
  teleport: F({ label: '瞬移', en: 'Teleport', el: 'plasma', size: [48, 80], frames: 16, fps: 15, place: 'caster-ground', pivot: [0.5, 0.935], focus: [0, 0.6],
    zh: ['瞬移', '傳送', '閃現', '消失'], words: ['teleport', 'blink', 'warp', 'vanish', 'phase'],
    build: (c) => [
      { kind: 'pillar', color: '@main', y: 1.45, w: 0.3, hgt: 3, grow: 0.12, speed: 3, gain: 0.9 },
      { kind: 'ring', color: '@main', y: 1.45, squash: 0.3, r1: 0.9 },
      { kind: 'particles', color: '@spark', mode: 'rise', y: 1, count: c.k(12), area: 0.4, areaX: 1, areaY: 1.5, shape: 'square', speed: [1.5, 2.5], emit: 0.4 },
      { kind: 'flash', color: '@main', y: 0.6, r: 0.6, dur: 0.1 },
    ] }),
  cloud: F({ label: '毒雲', en: 'Cloud', el: 'poison', size: [80, 64], frames: 16, fps: 12, loop: true, place: 'target', focus: [0, 0.1],
    zh: ['毒氣', '毒霧', '煙霧', '霧', '雲', '煙', '瘴'], words: ['cloud', 'gas', 'fog', 'smog', 'mist', 'smoke', 'fumes', 'haze'],
    build: (c) => [
      { kind: 'smoke', color: '@main', count: c.k(9), spread: 0.8, flat: 0.5, rise: 0.15, r0: 0.25, r1: 0.45, life: [0.7, 1], drift: 0.3, dissolve: 0.6, decay: 0.3, gain: 0.85 },
    ] }),
  breath: F({ label: '吐息', en: 'Breath', el: 'fire', size: [96, 48], frames: 12, fps: 15, loop: true, place: 'staff', pivot: [0.08, 0.5], facing: true, focus: [0.4, 0],
    zh: ['吐息', '噴射', '噴火', '火焰噴射', '噴'], words: ['breath', 'flamethrower', 'spray', 'cone', 'jet', 'stream'],
    build: (c) => [
      { kind: 'smoke', color: '@main', x: -1.7, count: c.k(24), spread: 0.04, flat: 1, rise: 0.05, r0: 0.12, r1: 0.55, life: [0.85, 1], dir: 0, cone: 22, speed: [2.2, 2.8], drift: 0.05, dissolve: 0.6, decay: 0.55, gain: 1 },
      { kind: 'particles', color: '@spark', mode: 'spray', x: -1.7, dir: 0, spread: 30, speed: [3, 4.5], drag: 0.5, count: c.k(14), shape: 'dot', life: [0.4, 0.8] },
    ] }),
  dash: F({ label: '衝刺', en: 'Dash', el: 'wind', size: [64, 48], frames: 8, fps: 15, loop: true, place: 'caster', depth: 'back', facing: true, focus: [0, 0],
    zh: ['衝刺', '疾速', '突進', '速度線', '疾走'], words: ['dash', 'speed', 'rush', 'sprint', 'zoom', 'speed lines'],
    build: (c) => [
      { kind: 'streaks', color: '@main', mode: 'speed', count: c.k(9), len: 0.9, spanY: 0.8, speed: 1 },
      { kind: 'particles', color: '@spark', mode: 'spray', x: 0.8, dir: 180, spread: 20, speed: [2.5, 3.5], drag: 0, count: c.k(6), shape: 'streak', area: 0.6, areaX: 0.2, life: [0.3, 0.6] },
    ] }),
  gust: F({ label: '疾風', en: 'Gust', el: 'wind', size: [64, 64], frames: 16, fps: 12, loop: true, place: 'target', focus: [0, 0],
    zh: ['陣風', '風刃', '颶'], words: ['gust', 'breeze', 'wind blade', 'air slash', 'swoosh'],
    build: (c) => [
      { kind: 'streaks', color: '@main', mode: 'flow', count: c.k(5), r: 0.75, squash: 0.6, turns: 1 },
      { kind: 'particles', color: '@spark', mode: 'orbit', count: c.k(5), orbitR: 0.7, squash: 0.6, turns: 1, shape: 'dot', heat: [1, 1] },
    ] }),
  weather: F({ label: '天氣', en: 'Weather', el: 'water', size: [128, 96], frames: 24, fps: 12, loop: true, place: 'screen', noAccent: true, focus: [0, 0],
    title: { water: ['驟雨', 'Rainfall'], ice: ['飄雪', 'Snowfall'], nature: ['落葉', 'Falling Leaves'], rose: ['櫻吹雪', 'Petal Storm'], fire: ['飛灰', 'Ashfall'], lava: ['飛灰', 'Ashfall'] },
    zh: ['下雨', '雨', '下雪', '雪', '暴風雪', '落葉', '櫻花', '花瓣', '天氣'], words: ['rain', 'raining', 'snow', 'snowing', 'snowfall', 'blizzard', 'falling leaves', 'petals', 'sakura', 'weather', 'downpour'],
    build: (c) => {
      const look = { water: { shape: 'streak', speed: [2, 3], size: [1, 1], wiggle: 0 }, ice: { shape: 'dot', speed: [1, 1], size: [1, 2], wiggle: 0.05 },
        nature: { shape: 'leaf', speed: [1, 1], size: [2, 2], wiggle: 0.12 }, rose: { shape: 'petal', speed: [1, 1], size: [2, 2], wiggle: 0.12 },
        fire: { shape: 'dot', speed: [1, 1], size: [1, 1], wiggle: 0.08 }, lava: { shape: 'dot', speed: [1, 1], size: [1, 1], wiggle: 0.08 } }[c.elId] || { shape: 'dot', speed: [1, 1], size: [1, 1], wiggle: 0.06 };
      return [{ kind: 'particles', color: '@main', mode: 'fall', count: c.k(look.shape === 'streak' ? 40 : 46), spanX: 1.1, driftX: look.shape === 'streak' ? -0.4 : 0.3, heat: [0.95, 0.95], ...look }];
    } }),
  sparkle: F({ label: '閃耀', en: 'Sparkle', el: 'gold', size: [48, 48], frames: 16, fps: 12, loop: true, place: 'target', focus: [0, 0],
    zh: ['閃耀', '亮晶晶', '星光', '閃亮', '光點'], words: ['sparkle', 'sparkles', 'shine', 'shiny', 'twinkle', 'glitter', 'glint', 'stars'],
    build: (c) => [
      { kind: 'rays', color: '@main', count: 4, r: 0.6, width: 0.14, jitter: 0.1, twinkle: 2, gain: 0.8, inner: 0 },
      { kind: 'particles', color: '@spark', mode: 'ambient', count: c.k(8), spanX: 0.9, spanY: 0.9, shape: 'star', size: [1, 2], twinkle: 2, speed: [0.3, 0.6], heat: [1.1, 1.1] },
    ] }),
  motes: F({ label: '漂浮光塵', en: 'Motes', el: 'spirit', size: [128, 96], frames: 24, fps: 12, loop: true, place: 'screen', noAccent: true, focus: [0, 0],
    title: { nature: ['螢火', 'Fireflies'] },
    zh: ['螢火蟲', '光塵', '漂浮', '浮游', '粉塵'], words: ['ambient', 'motes', 'fireflies', 'firefly', 'floating', 'dust motes', 'particles'],
    build: (c) => [
      { kind: 'particles', color: '@main', mode: 'ambient', count: c.k(24), shape: 'dot', size: [1, 1], wiggle: 0.1, speed: [0.5, 1], heat: [1.05, 1.05] },
    ] }),
  damage: F({ label: '傷害數字', en: 'Damage', el: 'gold', size: [48, 32], frames: 16, fps: 15, place: 'target', pivot: [0.5, 0.6], noAccent: true, focus: [0, 0],
    zh: ['傷害', '暴擊', '爆擊', '會心', '數字'], words: ['damage', 'crit', 'critical', 'dmg', 'number', 'numbers'],
    build: (c) => [
      { kind: 'star', color: '@alt', r: 0.55, y: -0.1, gain: 0.8, to: 0.5 },
      { kind: 'text', color: '@main', text: c.text || 'CRIT!', rise: 0.5 },
      { kind: 'particles', color: '@spark', mode: 'burst', count: c.k(6), shape: 'star', speed: [1, 1.6], to: 0.6 },
    ] }),
  loot: F({ label: '掉寶', en: 'Loot', el: 'gold', size: [48, 48], frames: 18, fps: 15, place: 'target-ground', pivot: [0.5, 0.85], focus: [0, 0],
    zh: ['金幣', '掉寶', '拾取', '寶箱', '錢幣'], words: ['coin', 'coins', 'loot', 'pickup', 'reward', 'jackpot'],
    build: (c) => [
      { kind: 'particles', color: '@main', mode: 'burst', y: 0.4, dir: -90, spread: 80, speed: [1.6, 2.4], gravity: 4.5, drag: 0.3, ground: 0.62, count: c.k(6), shape: 'coin', size: [3, 3], heat: [1, 1], life: [0.9, 1] },
      { kind: 'flash', color: '@spark', y: 0.4, r: 0.35, dur: 0.1 },
    ] }),
  dissolve: F({ label: '消散', en: 'Dissolve', el: 'spirit', size: [48, 48], frames: 16, fps: 15, place: 'target', focus: [0, 0],
    zh: ['消散', '死亡', '化為灰燼', '灰飛煙滅', '噗'], words: ['dissolve', 'disintegrate', 'death', 'die', 'poof', 'fade away', 'despawn'],
    build: (c) => [
      { kind: 'smoke', color: '@smoke', count: c.k(8), spread: 0.45, flat: 0.8, rise: 0.5, r0: 0.15, r1: 0.35, emit: 0.2 },
      { kind: 'particles', color: '@main', mode: 'rise', count: c.k(14), area: 0.5, areaX: 0.8, areaY: 1.2, speed: [0.6, 1.2], life: [0.5, 1], emit: 0.4, shape: 'square' },
      { kind: 'flash', color: '@main', r: 0.5, dur: 0.1 },
    ] }),
  meteor: F({ label: '隕石', en: 'Meteor', el: 'fire', size: [96, 96], frames: 22, fps: 15, place: 'target', pivot: [0.5, 0.65], shake: 2, impact: 0.4, focus: [0, 0.3],
    zh: ['隕石', '流星', '彗星', '天降'], words: ['meteor', 'meteorite', 'comet', 'asteroid', 'starfall'],
    build: (c) => [
      { kind: 'smoke', color: '@smoke', y: 0.35, from: 0.45, count: c.k(8), spread: 0.5, flat: 0.4, rise: 0.35, r0: 0.15, r1: 0.35, gain: 0.6 },
      { kind: 'comet', color: '@main', fromXY: [1.3, -1.3], x: 0, y: 0.3, r: 0.14, len: 0.9, until: 0.4 },
      { kind: 'blast', color: '@main', y: 0.3, from: 0.38, r1: 0.6, grow: 0.35 },
      { kind: 'ring', color: '@alt', y: 0.4, squash: 0.35, from: 0.38, r1: 0.95 },
      { kind: 'particles', color: '@alt', mode: 'burst', y: 0.3, from: 0.38, dir: -90, spread: 160, speed: [1.5, 2.6], gravity: 3, count: c.k(12), shape: 'chunk', size: [2, 1] },
      { kind: 'flash', color: '@main', y: 0.3, from: 0.38, r: 0.55, dur: 0.08 },
    ] }),
  charge: F({ label: '蓄力', en: 'Charge', el: 'plasma', size: [64, 64], frames: 20, fps: 15, place: 'caster', impact: 0.85, focus: [0, 0],
    zh: ['蓄力', '集氣', '聚氣', '蓄能', '充能'], words: ['charge', 'charging', 'gather', 'channel', 'channeling', 'charge up'],
    build: (c) => [
      { kind: 'particles', color: '@spark', mode: 'implode', count: c.k(18), implodeR: 1, swirl: 1.5, life: [0.4, 0.8], emit: 0.55, shape: 'streak' },
      { kind: 'ring', color: '@main', r0: 0.95, r1: 0.1, ease: 'inQuad', th: 0.08, thEnd: 0.12, breakup: 0.3, to: 0.6, gain: 0.8, fade: 0 },
      { kind: 'orb', color: '@main', r: 0.32, from: 0.3 },
      { kind: 'flash', color: '@main', r: 0.5, from: 0.85, dur: 0.1 },
    ] }),
  splash: F({ label: '水花', en: 'Splash', el: 'water', size: [64, 64], frames: 16, fps: 15, place: 'target-ground', pivot: [0.5, 0.8], focus: [0, 0.4],
    zh: ['水花', '濺', '浪花', '飛濺'], words: ['splash', 'splatter', 'splosh', 'droplets'],
    build: (c) => [
      { kind: 'ring', color: '@alt', y: 0.6, squash: 0.3, r1: 0.95, th: 0.18, breakup: 0.5 },
      { kind: 'spikes', color: '@main', y: 0.62, count: 7, spread: 0.42, hgt: [0.45, 0.85], width: [0.07, 0.12], fan: 38, lean: 10, grow: 0.14, hold: 0.32 },
      { kind: 'particles', color: '@main', mode: 'burst', y: 0.5, dir: -90, spread: 80, speed: [1.6, 2.6], gravity: 4, drag: 0.4, count: c.k(16), shape: 'drop', size: [2, 1] },
      { kind: 'particles', color: '@spark', mode: 'burst', y: 0.55, dir: -90, spread: 150, speed: [0.8, 1.4], gravity: 3, count: c.k(8), shape: 'dot' },
    ] }),
};
export const FORM_LIST = Object.keys(FORMS);

// Phrases that imply both a form and an element.
const COMBOS = [
  { words: ['fireball', 'firebolt', 'fire ball'], zh: ['火球', '火彈'], form: 'projectile', el: 'fire' },
  { words: ['iceball', 'snowball', 'ice bolt', 'frostbolt'], zh: ['冰球', '冰彈', '雪球'], form: 'projectile', el: 'ice' },
  { words: ['black hole'], zh: ['黑洞'], form: 'blackhole', el: 'void' },
  { words: ['snow', 'snowing', 'snowfall', 'blizzard'], zh: ['下雪', '雪', '暴風雪'], form: 'weather', el: 'ice' },
  { words: ['rain', 'raining', 'downpour'], zh: ['下雨', '雨'], form: 'weather', el: 'water' },
  { words: ['falling leaves', 'autumn leaves'], zh: ['落葉'], form: 'weather', el: 'nature' },
  { words: ['sakura', 'petals', 'cherry blossom'], zh: ['櫻花', '花瓣'], form: 'weather', el: 'rose' },
  { words: ['fireflies', 'firefly'], zh: ['螢火蟲'], form: 'motes', el: 'nature' },
  { words: ['volcano', 'eruption'], zh: ['火山', '火山爆發'], form: 'pillar', el: 'lava' },
  { words: ['lightning strike', 'thunderstrike', 'thunderbolt'], zh: ['落雷', '雷擊', '雷劈'], form: 'strike', el: 'lightning' },
  { words: ['campfire', 'bonfire'], zh: ['篝火', '營火'], form: 'flame', el: 'fire' },
  { words: ['flamethrower'], zh: ['噴火', '火焰噴射'], form: 'breath', el: 'fire' },
  { words: ['fire pillar', 'flame pillar'], zh: ['火柱'], form: 'pillar', el: 'fire' },
  { words: ['ice spikes', 'icicles'], zh: ['冰刺', '冰柱'], form: 'spikes', el: 'ice' },
];

// ---------- modifiers ----------
const COLOR_WORDS = [
  { hue: 25, label: '紅色', words: ['red', 'scarlet', 'ruby'], zh: ['紅色', '紅'] },
  { hue: 55, label: '橙色', words: ['orange', 'amber'], zh: ['橙色', '橘色', '橙', '橘'] },
  { hue: 95, label: '黃色', words: ['yellow'], zh: ['黃色', '黃'] },
  { hue: 130, label: '黃綠', words: ['lime', 'chartreuse'], zh: ['黃綠', '萊姆'] },
  { hue: 150, label: '綠色', words: ['green', 'emerald', 'jade'], zh: ['綠色', '翠綠', '綠'] },
  { hue: 190, label: '青色', words: ['teal', 'turquoise', 'aqua green'], zh: ['青色', '青綠', '青'] },
  { hue: 220, label: '天藍', words: ['cyan', 'sky blue', 'azure'], zh: ['天藍', '水藍', '湛藍'] },
  { hue: 260, label: '藍色', words: ['blue', 'sapphire', 'cobalt'], zh: ['藍色', '藍'] },
  { hue: 285, label: '靛色', words: ['indigo'], zh: ['靛色', '靛'] },
  { hue: 310, label: '紫色', words: ['purple', 'violet', 'amethyst', 'lavender'], zh: ['紫色', '紫羅蘭', '紫'] },
  { hue: 340, label: '洋紅', words: ['magenta', 'fuchsia'], zh: ['洋紅', '桃紅'] },
  { hue: 355, label: '粉紅', words: ['pink', 'rose pink'], zh: ['粉紅', '粉色', '粉'] },
];
const MODS = [
  { set: { size: 0.6 }, label: '迷你', words: ['tiny', 'mini', 'micro'], zh: ['迷你', '極小', '微小'] },
  { set: { size: 0.75 }, label: '小', words: ['small', 'little'], zh: ['小型', '小'] },
  { set: { size: 1.25 }, label: '大', words: ['big', 'large', 'strong'], zh: ['大型', '強力', '大'] },
  { set: { size: 1.5 }, label: '巨大', words: ['huge', 'giant', 'massive', 'enormous', 'epic', 'mega', 'ultimate'], zh: ['巨大', '超大', '巨型', '史詩', '終極', '究極'] },
  { set: { speed: 0.75 }, label: '慢', words: ['slow', 'slowly', 'lazy', 'gentle'], zh: ['緩慢', '慢速', '慢', '輕柔'] },
  { set: { speed: 1.35 }, label: '快', words: ['fast', 'quick', 'rapid', 'swift'], zh: ['快速', '迅速', '急速', '快'] },
  { set: { density: 1.6 }, label: '密集', words: ['dense', 'many', 'lots', 'heavy', 'intense', 'thick'], zh: ['密集', '大量', '濃密', '猛烈'] },
  { set: { density: 0.6 }, label: '稀疏', words: ['sparse', 'few', 'faint', 'subtle'], zh: ['稀疏', '少量', '淡淡'] },
  { set: { loop: true }, label: '循環', words: ['loop', 'looping', 'idle', 'continuous', 'constant'], zh: ['循環', '持續', '待機', '常駐'] },
  { set: { loop: false }, label: '單次', words: ['once', 'one-shot', 'oneshot', 'single'], zh: ['單次', '一次'] },
  { set: { outline: 'outer' }, label: '描邊', words: ['outline', 'outlined', 'bordered'], zh: ['描邊', '外框', '輪廓'] },
  { set: { dither: 0.5 }, label: '抖色', words: ['dither', 'dithered', 'dithering'], zh: ['抖色', '網點'] },
  { set: { palette: 'pico8' }, label: 'PICO-8', words: ['pico8', 'pico-8', 'pico 8'], zh: [] },
  { set: { palette: 'gameboy' }, label: 'Game Boy', words: ['gameboy', 'game boy', 'gb'], zh: ['掌機'] },
  { set: { palette: 'onebit' }, label: '1-bit', words: ['1-bit', '1bit', 'monochrome', 'mono'], zh: ['黑白', '單色'] },
  { set: { palette: 'sweetie16' }, label: 'Sweetie 16', words: ['sweetie', 'sweetie16'], zh: [] },
  { set: { palette: 'endesga32' }, label: 'Endesga 32', words: ['endesga', 'endesga32'], zh: [] },
  { set: { dir: 'left' }, label: '向左', words: ['left', 'leftward', 'to the left'], zh: ['向左', '往左', '朝左'] },
  { set: { dir: 'right' }, label: '向右', words: ['right', 'rightward', 'to the right'], zh: ['向右', '往右', '朝右'] },
  { set: { white: true }, label: '白色', words: ['white', 'pale'], zh: ['白色', '純白', '白'] },
  { set: { dark: true }, label: '暗核', words: ['dark core', 'black core', 'hollow core'], zh: ['暗核', '黑核'] },
  { set: {}, label: '地面', words: ['ground', 'floor', 'from the ground', 'on the ground'], zh: ['從地面', '地面', '地上'] },
  { set: { then: true }, label: '接著', words: ['then', 'followed by', 'and then', 'into'], zh: ['接著', '然後', '之後', '再'] },
];

// ---------- the scanner ----------
const isCJK = (s) => /[㐀-鿿]/.test(s);
let DICT = null;
function dict() {
  if (DICT) return DICT;
  const out = [];
  const add = (text, entry) => out.push({ text: text.toLowerCase(), cjk: isCJK(text), ...entry });
  for (const [id, f] of Object.entries(FORMS)) { add(f.label, { type: 'form', id }); f.zh.forEach((w) => add(w, { type: 'form', id })); f.words.forEach((w) => add(w, { type: 'form', id })); }
  for (const [id, e] of Object.entries(ELEMENTS)) { e.zh.forEach((w) => add(w, { type: 'element', id })); e.words.forEach((w) => add(w, { type: 'element', id })); }
  COMBOS.forEach((c, i) => { c.zh.forEach((w) => add(w, { type: 'combo', id: i })); c.words.forEach((w) => add(w, { type: 'combo', id: i })); });
  COLOR_WORDS.forEach((c, i) => { c.zh.forEach((w) => add(w, { type: 'color', id: i })); c.words.forEach((w) => add(w, { type: 'color', id: i })); });
  MODS.forEach((m, i) => { m.zh.forEach((w) => add(w, { type: 'mod', id: i })); m.words.forEach((w) => add(w, { type: 'mod', id: i })); });
  // Longest phrases win; combos beat plain words of the same length.
  const rank = { combo: 0, form: 1, element: 2, color: 3, mod: 4 };
  out.sort((a, b) => b.text.length - a.text.length || rank[a.type] - rank[b.type]);
  DICT = out;
  return out;
}

const word = (c) => /[a-z0-9]/.test(c || '');
const STOP = /\b(the|a|an|of|with|and|in|on|at|to|from)\b|[的之色從在與和]/g;

// Find dictionary entries in the prompt, longest first, without overlaps.
export function parse(prompt) {
  const text = String(prompt || '').toLowerCase();
  const used = new Uint8Array(text.length);
  const hits = [];
  for (const d of dict()) {
    let from = 0;
    while (true) {
      const i = text.indexOf(d.text, from);
      if (i < 0) break;
      from = i + 1;
      let end = i + d.text.length;
      if (!d.cjk) {
        if (word(text[i - 1])) continue;
        const rest = text.slice(end);
        const suf = /^(es|s|ing|ed)?/.exec(rest)[0];
        if (word(text[end + suf.length])) continue;
        end += suf.length;
      }
      let free = true;
      for (let k = i; k < end; k++) if (used[k]) { free = false; break; }
      if (!free) continue;
      used.fill(1, i, end);
      hits.push({ ...d, at: i, end });
    }
  }
  hits.sort((a, b) => a.at - b.at);
  let unknown = '';
  for (let i = 0; i < text.length; i++) unknown += used[i] ? ' ' : text[i];
  unknown = unknown.replace(/[^a-z0-9㐀-鿿]+/g, ' ').replace(STOP, ' ').replace(/\s+/g, ' ').trim();
  const digits = /\d+/.exec(text);
  return { hits, unknown, number: digits ? digits[0] : null };
}

// Mirror an effect left-right.
function mirror(layers) {
  return layers.map((L) => {
    const M = { ...L, x: -(L.x || 0) };
    if (L.kind === 'slash') { M.a0 = 180 - (L.a0 ?? -160); M.a1 = 180 - (L.a1 ?? 40); }
    else if (L.kind === 'beam' || L.kind === 'comet') M.angle = 180 - (L.angle || 0);
    else if (L.kind === 'streaks') M.angle = 180 - (L.angle ?? 55);
    if (L.kind === 'particles' || L.kind === 'smoke') { M.dir = 180 - (L.dir || 0); if (L.driftX) M.driftX = -L.driftX; }
    if (L.fromXY) M.fromXY = [-L.fromXY[0], L.fromXY[1]];
    return M;
  });
}

const snap8 = (v) => Math.max(16, Math.round(v / 8) * 8);

export function interpret(prompt, seed) {
  const { hits, unknown, number } = parse(prompt);
  const forms = [], explicit = [], implied = [], modChips = [];
  const m = { size: 1, speed: 1, density: 1, loop: null, outline: null, dither: null, palette: null, dir: null, white: false, dark: false, hue: null };
  let thenAt = -1, colorChip = null;
  for (const h of hits) {
    if (h.type === 'form') { if (!forms.includes(h.id)) forms.push(h.id); }
    else if (h.type === 'element') { if (!explicit.includes(h.id)) explicit.push(h.id); }
    else if (h.type === 'combo') {
      const c = COMBOS[h.id];
      if (!forms.includes(c.form)) forms.push(c.form);
      if (!implied.includes(c.el)) implied.push(c.el);
    } else if (h.type === 'color') { m.hue = COLOR_WORDS[h.id].hue; colorChip = COLOR_WORDS[h.id].label; }
    else if (h.type === 'mod') {
      const mod = MODS[h.id];
      if (mod.set.then) { if (forms.length) thenAt = forms.length; continue; }
      Object.assign(m, mod.set);
      modChips.push(mod.label);
    }
  }
  // Explicit element words beat ones implied by combos.
  const matched = forms.length > 0 || explicit.length > 0;
  const formId = forms[0] || (explicit[0] && ELEMENTS[explicit[0]].form) || 'explosion';
  const form = FORMS[formId];
  const elId = explicit[0] || implied[0] || form.el;
  const el = ELEMENTS[elId];
  const second = thenAt > 0 && forms[thenAt] ? FORMS[forms[thenAt]] : null;
  const chips = [];
  if (matched) {
    chips.push({ kind: 'form', label: form.label });
    if (second) chips.push({ kind: 'form', label: `接著${second.label}` });
    chips.push({ kind: 'element', label: el.label });
    if (colorChip) chips.push({ kind: 'color', label: colorChip });
    modChips.forEach((label) => chips.push({ kind: 'mod', label }));
  }
  if (m.dark || (m.hue == null && /black|黑/.test(String(prompt).toLowerCase()) && (formId === 'vortex' || formId === 'portal'))) m.dark = true;

  const baseSeed = Number.isFinite(seed) ? Math.round(seed) : 1 + (hashStr(String(prompt)) % 9999);
  const recipeSeed = unknown ? (baseSeed + (hashStr(unknown) % 100000)) % 1000000 : baseSeed;
  const rng = makeRng(recipeSeed);
  const loopable = !!form.loop;
  const loop = m.loop == null ? loopable : m.loop;
  const ctx = (f) => ({
    el, elId, loop: m.loop == null ? !!f.loop : m.loop, dark: m.dark, text: number ? number + (/crit|暴擊|爆擊|會心/.test(prompt) ? '!' : '') : null,
    k: (n) => Math.max(1, Math.round(n * m.density)), rng,
  });
  const c = ctx(form);
  let layers = form.build(c);
  if (!form.noAccent && el.accent && ACCENTS[el.accent]) layers = layers.concat(ACCENTS[el.accent](c, form.focus || [0, 0]));
  let [w, h] = form.size, frames = form.frames;

  // "A then B": squeeze A into the first part, play B after it.
  if (second && !loop) {
    const c2 = ctx(second);
    const remap = (L, a, b) => ({ ...L, from: a + (L.from || 0) * (b - a), to: a + (L.to ?? 1) * (b - a) });
    const L2 = second.build(c2);
    layers = layers.map((L) => remap(L, 0, 0.55)).concat(L2.map((L) => remap(L, 0.45, 1)));
    w = Math.max(w, second.size[0]); h = Math.max(h, second.size[1]);
    frames = Math.round((frames + second.frames) * 0.8);
  }
  if (m.dir === 'left' && form.facing) layers = mirror(layers);

  const colors = { ...el.colors };
  if (m.white) { colors.main = 'white'; colors.spark = 'white'; }
  if (m.hue != null) { colors.main = `hue:${m.hue}`; colors.alt = `hue:${(m.hue + 20) % 360}`; colors.spark = `hue:${(m.hue + 10) % 360}`; }

  let fps = form.fps;
  if (loop) fps = Math.round(Math.min(30, Math.max(6, fps * m.speed)));
  else frames = Math.max(6, Math.round(frames / m.speed));
  if (loop && !form.loop) frames = Math.max(frames, 12);

  const names = el.names;
  const pick = (arr) => arr[recipeSeed % arr.length];
  const title = form.title?.[elId];
  const recipe = {
    format: FORMAT,
    name: title ? title[0] : `${pick(names.zh)}${form.label}`,
    nameEn: title ? title[1] : `${pick(names.en)} ${form.en}`,
    w: snap8(w * m.size), h: snap8(h * m.size), frames, fps, loop, seed: recipeSeed,
    colors, hue: 0, sat: 1,
    outline: m.outline || 'none', dither: m.dither ?? 0, palette: m.palette, cleanup: true,
    pivot: form.pivot || [0.5, 0.5], place: form.place, depth: form.depth || 'front', shake: form.shake || 0,
    impact: form.impact ?? null,
    prompt: String(prompt || ''), form: formId, element: elId,
    layers,
  };
  if (m.dir === 'left' && form.facing) recipe.pivot = [1 - recipe.pivot[0], recipe.pivot[1]];
  return { recipe, chips, matched, form: formId, element: elId, unknown };
}

export const SUGGESTED_WORDS = ['爆炸', '斬擊', '光束', '傳送門', '治癒', '龍捲風', '火', '冰', '雷'];
export const EXAMPLE_PROMPTS = [
  '紫色黑洞漩渦', '巨大火焰爆炸', '藍色雷電落雷', '冰刺從地面竄出', '神聖治癒', '暗影氣場', '毒雲', '金色升級',
  'huge purple lightning nova', 'fire tornado', 'blue energy beam', 'sword slash then explosion', 'falling sakura petals', 'critical hit 999',
  '綠色魔法陣', '隕石墜落', '奧術護盾', '向左的血色爪擊', '下雪', '電漿蓄力',
];

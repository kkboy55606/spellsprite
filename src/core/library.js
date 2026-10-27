// The curated library. Each entry is a prompt plus a seed (and an optional
// patch), so library effects stay editable like anything typed by hand.

import { interpret } from './interpret.js';

export const GROUPS = [
  { id: 'all', label: '全部' }, { id: 'combat', label: '戰鬥' }, { id: 'magic', label: '魔法' },
  { id: 'element', label: '元素' }, { id: 'feedback', label: '回饋' }, { id: 'ambient', label: '環境' },
];

const L = (id, group, name, prompt, seed, patch) => ({ id, group, name, prompt, seed, patch });
export const LIBRARY = [
  L('ember-blast', 'combat', '餘燼爆破', '巨大火焰爆炸', 7),
  L('thunder-nova', 'combat', '雷鳴新星', '藍色雷電新星', 3),
  L('steel-slash', 'combat', '寒鋒斬', '鋼鐵斬擊', 2),
  L('blood-claw', 'combat', '血爪', '血色爪擊', 5),
  L('hit-spark', 'combat', '會心火花', '打擊火花', 4),
  L('meteor', 'combat', '隕星墜落', '隕石', 9),
  L('ground-slam', 'combat', '崩岩震地', '大地震地', 6),
  L('frost-spikes', 'combat', '霜晶突刺', '冰刺', 3),
  L('sky-strike', 'combat', '天雷落', '落雷', 8),
  L('fireball', 'combat', '火球術', '火球', 2),
  L('ion-cannon', 'combat', '離子炮', '電漿光束', 4),
  L('gale-dash', 'combat', '疾風衝刺', '衝刺', 1),

  L('star-abyss', 'magic', '星淵黑洞', '紫色黑洞漩渦', 11),
  L('arcane-gate', 'magic', '奧術之門', '奧術傳送門', 3),
  L('rune-circle', 'magic', '星咒法陣', '魔法陣', 5),
  L('holy-summon', 'magic', '降臨召喚', '神聖召喚', 2),
  L('ion-blink', 'magic', '離子瞬移', '瞬移', 4),
  L('plasma-charge', 'magic', '蓄能', '電漿蓄力', 6),
  L('arcane-orb', 'magic', '秘法光球', '奧術能量球', 3),
  L('shadow-aura', 'magic', '幽影氣場', '暗影氣場', 2),
  L('tide-shield', 'magic', '碧波護盾', '水護盾', 1),

  L('fire-tornado', 'element', '烈焰龍捲', '火焰龍捲風', 3),
  L('whirlwind', 'element', '蒼風旋風', '旋風', 5),
  L('miasma', 'element', '瘴氣毒雲', '毒雲', 2),
  L('eruption', 'element', '熔岩噴發', '火山', 4),
  L('dawn-pillar', 'element', '天光之柱', '聖光光柱', 3),
  L('campfire', 'element', '篝火', '篝火', 1),
  L('dragon-breath', 'element', '灼炎吐息', '噴火', 2),
  L('torrent-splash', 'element', '激流水花', '水花', 3),
  L('ghost-flame', 'element', '冥燈鬼火', '鬼火火苗', 2),

  L('verdant-heal', 'feedback', '森羅治癒', '治癒', 2),
  L('golden-levelup', 'feedback', '金耀升級', '升級', 1),
  L('blessing', 'feedback', '聖輝加持', '增益', 3),
  L('crit-999', 'feedback', '暴擊 999', '暴擊 999', 1),
  L('coin-burst', 'feedback', '金幣噴發', '金幣', 2),
  L('poof', 'feedback', '灰飛煙滅', '消散', 3),
  L('glitter', 'feedback', '亮晶晶', '閃耀', 4),
  L('heart-heal', 'feedback', '心動回復', '愛心治癒', 2),

  L('first-snow', 'ambient', '初雪', '下雪', 1),
  L('shower', 'ambient', '驟雨', '下雨', 2),
  L('sakura', 'ambient', '櫻吹雪', '櫻花', 3),
  L('fireflies', 'ambient', '夏夜螢火', '螢火蟲', 1),
  L('autumn', 'ambient', '秋日落葉', '落葉', 2),
  L('breeze', 'ambient', '陣風', '陣風', 3),
];

export function recipeFor(entry) {
  const { recipe } = interpret(entry.prompt, entry.seed);
  return { ...recipe, ...(entry.patch || {}), name: entry.name, libraryId: entry.id };
}

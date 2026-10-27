#!/usr/bin/env node
// Regenerate the layer-kind tables in docs/recipe.md from src/core/kinds.js.
import fs from 'node:fs';
import { KINDS, COMMON_PARAMS } from '../src/core/kinds.js';
import { RAMPS, PALETTES } from '../src/core/color.js';

const show = (p) => (p.options ? p.options.join(' / ') : JSON.stringify(p.def));
const row = (p) => `| \`${p.k}\` | ${p.label} | ${show(p)} | ${p.min != null ? `${p.min} – ${p.max}` : ''} |`;
const head = '| 欄位 | 說明 | 預設 | 範圍 |\n| --- | --- | --- | --- |';

let out = `<!-- 由 tools/gen-recipe-doc.mjs 產生，請勿手改此段 -->\n\n## 每個圖層都有的欄位\n\n${head}\n${COMMON_PARAMS.map(row).join('\n')}\n| \`hidden\` | 隱藏 | false | |\n| \`seed\` | 圖層亂數偏移 | 0 | |\n| \`gamma\` | 熱度曲線 | 1 | |\n| \`dither\` | 圖層抖色（預設跟配方） | null | 0 – 1 |\n\n## 圖層種類（${Object.keys(KINDS).length} 種）\n`;
for (const [k, kind] of Object.entries(KINDS)) {
  out += `\n### \`${k}\` ${kind.label}${kind.solid === false ? '（不經清除雜點）' : ''}\n\n${head}\n${kind.params.map(row).join('\n')}\n`;
  if (kind.base) out += `\n預設覆寫：\`${JSON.stringify(kind.base)}\`\n`;
}
out += `\n## 具名色帶\n\n${Object.keys(RAMPS).map((r) => `\`${r}\``).join('、')}，或 \`"hue:<角度>"\`，或由暗到亮的十六進位色陣列。\n\n## 色盤鎖定\n\n${Object.keys(PALETTES).map((r) => `\`${r}\``).join('、')}，或十六進位色陣列。\n`;

const file = 'docs/recipe.md';
const doc = fs.readFileSync(file, 'utf8');
const marker = '<!-- GENERATED -->';
fs.writeFileSync(file, doc.split(marker)[0] + marker + '\n' + out);
console.log('updated ' + file);

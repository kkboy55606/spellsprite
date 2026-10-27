# Spellsprite — 專案規則

## 凍結契約

- **配方格式 `pfx/1`**（`docs/recipe.md`）：只能 additive。新欄位要有預設值、可以新增圖層種類，
  不得改名、刪除或改變既有欄位與參數的意義（舊的分享連結 `#r=`、存檔的 `.recipe.json` 會壞）。
- **分享連結參數**：`p`（描述）、`s`（種子）、`fx`（特效庫 id）、`r`（deflate-raw + base64url 的配方）、`st`（風格覆寫 JSON）、`sc`（解析度倍率）。只能新增。
- **特效庫 id**（`src/core/library.js`）被分享連結引用，不要改名或刪除。

## 程式慣例

- `src/core/` 不能碰 DOM（要能在 worker 和 Node 執行）。
- 一切隨機都走 `src/core/rng.js` 的種子亂數；同配方同種子必須產生完全相同的影格（有測試）。
- 循環特效的週期量（轉速、流速、圈數、閃爍）在循環時必須取整數，旋轉角用 `fract` 包住，避免接縫跳一格（有測試）。
- 改了圖層參數表後跑 `node tools/gen-recipe-doc.mjs` 更新文件。
- 改了特效外觀，用 `node tools/contact-sheet.mjs` 產生接觸表目測再交付。

## 驗收

- `npm test` 全綠；每個修復附回歸測試。
- 介面改動要在瀏覽器實際看過（`npm start` → http://localhost:5178）。

# Pixel FX Studio

自製的瀏覽器像素特效工坊。輸入一句描述（中文或英文）或從特效庫挑一個，調整顏色、風格、動態與每個圖層，
在舞台上看它打在角色身上的樣子，再下載成精靈圖、GIF、MP4、atlas JSON 或 Godot 4 資源。

引擎、文字解讀器、特效庫、場景與角色、GIF / ZIP / MP4 編碼器都是這個專案自己寫的，沒有任何相依套件。

## 啟動

```bash
npm start
```

然後開 http://localhost:5178 。需要 Node 18 以上；不用安裝任何套件。
（module worker 需要 http://，直接雙擊 index.html 會退回主執行緒渲染。）

## 測試與工具

```bash
npm test
```

- `node tools/contact-sheet.mjs kinds` — 把 22 種圖層各自渲染成一張接觸表（`out/sheet-kinds.png`），用眼睛檢查
- `node tools/contact-sheet.mjs library 0-22` — 渲染特效庫的一段（也可以寫 id：`library shadow-aura,coin-burst`）
- `node tools/fx-metrics.mjs [id ...]` — 量特效的覆蓋率、亮度、亮色比例與分離團塊數，調外觀時用來比較前後
- `node tools/contact-sheet.mjs prompt "紫色黑洞漩渦"` — 看一句描述會變成什麼
- `node tools/stage-preview.mjs` — 預覽內建場景與角色
- `node tools/gen-recipe-doc.mjs` — 改了圖層參數後重新產生 `docs/recipe.md` 的表格

## 架構

| 位置 | 內容 |
| --- | --- |
| `src/core/` | 引擎（無 DOM，可在頁面、worker、Node 執行）：噪聲、色彩、22 種圖層、文字解讀、特效庫 |
| `src/export/` | GIF（LZW）、ZIP、MP4 muxer（WebCodecs H.264）、atlas / Godot / README |
| `src/app/` | 網頁介面：worker 渲染池、舞台、檢查面板、下載面板 |
| `docs/recipe.md` | 配方格式 `pfx/1`（凍結契約） |
| `tests/` | `node --test` 單元與回歸測試 |

## 原理（一句話）

每個圖層在自己的畫布上寫「熱度」，熱度被切成 4–7 個硬色階（暗部偏藍紫、亮部偏暖），所以看起來是手繪像素而不是模糊光暈；
疊完圖層後再做清雜點、描邊、色盤鎖定。循環特效的所有週期量都跑整數圈，所以最後一幀接得回第一幀。

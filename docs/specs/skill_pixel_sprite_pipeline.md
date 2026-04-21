# Skill: Pixel Art Sprite Sheet Pipeline

## 目標 (Objective)
自動化生成 2D 像素風精靈圖 (Sprite Sheet)，供網頁前端 CSS `steps()` 動畫使用。
最終輸出：**單列、透明背景、每 Frame 等距 + 底部對齊** 的 PNG。

---

## Pipeline 架構

```
ref.png  →  [1. Leonardo API 生成]  →  raw_gen.png
         →  [2. 去背 (rembg)]       →  no_bg.png
         →  [3. 雜訊過濾]           →  denoised.png
         →  [4. 影格切割 + 底部對齊] →  frames/frame_N.png
         →  [5. 描邊]              →  frames/frame_N_stroked.png
         →  [6. 色彩量化]           →  frames/frame_N_quantized.png
         →  [7. 水平拼接]           →  final_sprite.png
```

---

## 各步驟規格

### 步驟 1：Leonardo.ai API
- 以 `ref.png` 為 Character Reference / Image Guidance
- Prompt 需包含：`pixel art sprite sheet, N-frame animation, solid [green/color] background, 8-bit retro, flat lighting, full body`
- 推薦使用 `controlnet` 或 image-to-image 搭配**網格佔位圖**作為 Layout Reference
  - 原因：強迫 AI 把角色畫在固定位置，減少後處理切割難度

### 步驟 2：去背 (Background Removal)
- 工具：`rembg`（AI 去背，非純色鍵控也能處理）
- 備用：如果背景是純色，可以 OpenCV + HSV threshold 取代，速度更快

### 步驟 3：雜訊過濾（新增）
- 去背後可能存在碎片、陰影雜訊等小連通區塊
- 操作：掃描 Alpha channel，**移除像素面積小於閾值（預設 50px²）的連通區塊**
- 工具：`cv2.connectedComponentsWithStats`

### 步驟 4：影格切割 + **底部對齊**（關鍵改進）
- 找到所有 Alpha > 0 的連通集，過濾出 N 個主體（依 X 座標排序，由左至右）
- 建立 `FRAME_SIZE x FRAME_SIZE` 透明畫布
- **對齊規則**：
  - **水平：置中 (Center)**
  - **垂直：底部貼腳 (Bottom Aligned)**，貼齊 `y = FRAME_SIZE - PADDING_BOTTOM`
  - ❌ 不做垂直置中（會造成角色在動畫時上下抖動）

### 步驟 5：描邊（新增）
- 對每一個 Frame 的角色邊緣，自動加上 1~2px 的白色外框
- 做法：Dilate alpha channel → 僅在原 Alpha=0 但 dilated Alpha>0 的位置填白色
- 效果：角色在深色背景上更突出，視覺統一感更強

### 步驟 6：色彩量化（新增）
- 將每個 Frame 的顏色數量強制壓縮至 N 色（預設 32 色）
- 工具：`PIL.Image.quantize(colors=32).convert('RGBA')`
- 效果：去掉 AI 生成的平滑中間色，強化正統像素風格，並大幅減少檔案大小

### 步驟 7：水平拼接輸出
- 將 N 個 Frame 由左至右合併成 `(N * FRAME_SIZE) x FRAME_SIZE` 的長條圖
- 輸出：`final_sprite.png`

---

## 常數 / CLI 參數

| 參數 | 說明 | 預設值 |
|---|---|---|
| `--ref` | 角色參考圖路徑 | `ref.png` |
| `--output` | 最終輸出路徑 | `final_sprite.png` |
| `--frames` | 期望切出的影格數 | `6` |
| `--frame-size` | 每個 Frame 的像素大小 | `128` |
| `--padding-bottom` | 底部貼腳時的留白 | `8` |
| `--stroke-width` | 描邊寬度（0=不描邊） | `1` |
| `--quantize-colors` | 量化色數（0=不量化） | `32` |
| `--noise-min-px` | 雜訊過濾最小面積 | `50` |
| `--prompt` | Leonardo API Prompt | (見腳本常數) |
| `--api-key` | Leonardo API Key | (環境變數 `LEONARDO_API_KEY`) |

---

## 已知限制 / 注意事項

1. **Leonardo API 的不穩定性**：AI 生成並非每次都能正確畫出等距網格，建議 `--frames` 設為期望數量後程式會自動警告若切出數量不符。
2. **rembg 首次執行**：會自動下載模型約 170MB，請預留時間。
3. **色彩量化 + Alpha**：PIL 的 `quantize()` 在 RGBA 圖上操作需特別處理，腳本内已封裝成 `quantize_rgba()` 安全函式。
4. **網頁 CSS 使用**：最終 Sprite Sheet 搭配：
   ```css
   animation: dribble steps(N) infinite;
   background-position: 0 0;
   width: FRAME_SIZEpx;
   height: FRAME_SIZEpx;
   background-size: (N * FRAME_SIZE)px FRAME_SIZEpx;
   ```

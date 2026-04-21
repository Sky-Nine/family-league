# 角色設定集 (Concept Art Gallery)

《Family B-Ball League》像素風角色立繪，所有圖檔均為 AI 生成，風格統一為 8-bit Retro Pixel Art。

---

## 👨‍👧‍👦 玩家主角 (Protagonists)

### P1 大寶 (11歲，小五)
- **外觀特徵**：極短黑色平頭 (buzz-cut)，五官較分明，偏瘦體型，眼神銳利自信
- **球衣**：Golden State Warriors 藍黃配色，背號 #1
- **Prompt 關鍵詞**：`confident 11-year-old Taiwanese boy, very short buzz-cut black hair, lean athletic build, alert sharp eyes, Warriors jersey number 1`

![大寶 P1](/Users/sky/.gemini/antigravity/brain/ce61f1e1-adfa-4897-bdf6-66021b4d0344/p1_pixel_warrior_1775989485142.png)

### P2 二寶 Leonard (8歲，小二)
- **外觀特徵**：短黑直髮微齊瀏海 (bowl cut)，圓臉肉嘟嘟，小鼻子，表情溫暖但認真
- **球衣**：Golden State Warriors 藍黃配色，背號 #2
- **Prompt 關鍵詞**：`cute 8-year-old Taiwanese boy, short straight black hair neat bowl cut, round chubby cheeks, small nose, Warriors jersey number 2`

![二寶 P2 Leonard](/Users/sky/.gemini/antigravity/brain/ce61f1e1-adfa-4897-bdf6-66021b4d0344/leonard_p2_pixel_1775989471410.png)

---

## 👾 基礎怪獸 (Basic Monsters)

### 灰塵怪客 (Dust Monster)
- **概念**：象徵打掃任務的對手，灰色塵球體，戴紅色運動頭帶
- **Prompt 關鍵詞**：`cute mischievous monster made of gray dust and dirt blobs, tiny red basketball sweatband`

![灰塵怪客](/Users/sky/.gemini/antigravity/brain/ce61f1e1-adfa-4897-bdf6-66021b4d0344/dust_monster_1775988777386.png)

### 史萊姆控衛 (Slime Baller)
- **概念**：RPG 經典史萊姆，綠色半透明，正在運球
- **Prompt 關鍵詞**：`cute green translucent slime monster energetically dribbling a bright orange basketball`

![史萊姆控衛](/Users/sky/.gemini/antigravity/brain/ce61f1e1-adfa-4897-bdf6-66021b4d0344/slime_baller_1775988790044.png)

---

## 🎨 生成管線備忘

所有精靈圖使用的共通風格後綴：
```
8-bit retro video game asset, character design, isolated on a solid white background, flat lighting, crisp pixel edges.
```

### 如何保持同角色不同動作的造型一致？
1. 先確認一張「定稿」的角色原畫
2. 後續生成不同動作時，將定稿圖作為 **參考圖 (Reference Image)** 一起餵入
3. 在 Midjourney 使用 `--cref [URL] --cw 100`；在 Nano Banana 直接上傳參考圖即可

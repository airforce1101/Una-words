好，下面是我幫你整理的 **《DATA_UPDATE.md｜最小但完整・正式修訂版》**。
原則是：

* ✅ **不改你的設計哲學**
* ✅ **只補「會踩雷的地方」**
* ✅ **讓未來的你／家長照著做也不會把 app 弄壞**
* ✅ 篇幅控制在「一次看完、不囉嗦」

你可以 **整份直接覆蓋原本的 `DATA_UPDATE.md`**。

---

````md
# 🗂 Una Words — 資料更新與維護說明（正式版）

本文件說明如何 **不動程式碼（app.js）**，  
只透過修改 JSON 來完成以下工作：

- 每週小考範圍設定
- 新增 / 封存單字
- 設定期中考或複習範圍（跨週）

---

## 0️⃣ 絕對原則（先看這裡）

- ❌ **不要修改 app.js**
- ❌ **不要刪除舊單字**
- ✅ **所有資料異動只發生在 JSON**
- ✅ **只要 library.json 或 packs.json 有動，一定要更新 meta.json**

---

## 1️⃣ 單字總庫：`library.json`

### 📌 命名規則（非常重要）

- **key = 單字唯一 ID**
- 格式：`YYYYMMDD-流水號`
- 例：`20251228-001`

### 範例
```json
{
  "20251228-001": {
    "s": "apple",
    "m": "蘋果",
    "ipa": "/ˈæpəl/",
    "archived": false
  }
}
````

### 欄位說明

| 欄位       | 說明                |
| -------- | ----------------- |
| s        | 英文拼字              |
| m        | 中文意思              |
| ipa      | 音標（可留空字串 `""`）    |
| archived | `true` = 不再出現在新考卷 |

### ⚠️ 規則

* ❗ **不要刪舊單字**
* ❗ 舊單字停用 → 設 `archived: true`

---

## 2️⃣ 考卷與範圍：`packs.json`

### 🔑 結構鐵則（非常重要）

* **`packs.json` 最外層必須是 Array**
* 即使只有一個 pack，也要寫成：

  ```json
  [ { ... } ]
  ```
* app.js 會使用：`packs.find(...)`、`packs.map(...)`

---

### 2.1 每週小考（最常改）

```json
[
 {"id":"week_2025_W52","title":"第 52 週小考","content":["20251228-001","20251228-002"]}
]
```

#### 欄位說明

* `id`：系統用（建議 `week_YYYY_WXX`）
* `title`：顯示給小朋友看
* `content`：單字 ID 清單（必須存在於 library.json）

---

### 2.2 期中考 / 複習範圍（使用 include）

```json
[
 {"id":"week_2025_W52","title":"第 52 週小考","content":["20251228-001","20251228-002"]},
 {"id":"midterm_2025_1","title":"期中考（第52～1週）","include":["week_2025_W52","week_2026_W01"]}
]
```

### ⚠️ 規則

* ✅ `include` 會自動展開所有週的 `content`
* ❌ **不要同時使用 `content` + `include`**
* ❌ `include` 指向的 pack id 一定要存在

---

### ✨ 推薦格式（方便貼上與維護）

* **一個 pack 寫成一行**
* 多個 pack 並列在 Array 中

```json
[
 {"id":"week_2025_W52","title":"第 52 週小考","content":["20251228-001","20251228-002"]},
 {"id":"week_2026_W01","title":"第 1 週小考","content":["20260104-001"]}
]
```

---

## 3️⃣ 資料版本：`meta.json`

### 📌 規則

* **只要 library.json 或 packs.json 有任何變動**
* **一定要更新 dataVersion**

```json
{
  "dataVersion": 2025122801,
  "updatedAt": "2025-12-28"
}
```

* `dataVersion`：只要「變大」即可（建議用日期）
* App 每次開啟會自動檢查版本

---

## 4️⃣ 每週最懶更新流程（標準 SOP）

1. 新增單字 → `library.json`
2. 新增一個 week pack → `packs.json`
3. 更新 `meta.json`（版本號 + 日期）
4. GitHub Commit & Push
5. iPad 重新整理

✅ 不用動 app.js
✅ 不影響既有成績
✅ 不會出現 `packs.find is not a function`

---

## 5️⃣ 常見錯誤檢查清單（發版前 10 秒）

* [ ] `packs.json` 最外層是 Array（`[]`）
* [ ] `packs.content` 的 ID 都存在於 `library.json`
* [ ] 沒有刪除任何舊單字
* [ ] `archived=true` 的單字不會被考到
* [ ] `meta.json` 的 `dataVersion` 有變大

```

---

## ✅ 最後一句話總結（給未來的你）
> **資料可以一行寫，但結構不能變**  
> **Array 不動，pack 壓成一行**

如果你願意，下一步我可以幫你做：
- 🔒 一份「給家長用的超精簡版（5 條規則）」
- 🧪 一個「JSON 發版前自我檢查模板」
- 📦 幫你設計「整學期 packs 編排策略」

你一句話指路，我就接著幫你補齊。
```

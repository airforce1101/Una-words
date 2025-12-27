
# 📕 DATA_UPDATE.md

（資料維護與更新流程）

````md
# 🗂 Una Words — 資料更新與維護說明

本文件說明如何「**不動程式碼**」，只透過修改 JSON 來更新：
- 每週小考範圍
- 新增 / 封存單字
- 設定期中考或複習範圍

---

## 1️⃣ 單字總庫：library.json

### 📌 命名規則（非常重要）

- **key = 單字唯一 ID**
- 格式建議：`YYYYMMDD-流水號`

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

| 欄位       | 說明              |
| -------- | --------------- |
| s        | 英文拼字            |
| m        | 中文意思            |
| ipa      | 音標（顯示用）         |
| archived | true = 不再出現在新考卷 |

❗**不要刪除舊單字，只用 archived**

---

## 2️⃣ 考卷與範圍：packs.json

### 2.1 每週小考（最常改）

```json
{
  "id": "week_2025_W52",
  "title": "第 52 週小考",
  "content": [
    "20251228-001",
    "20251228-002"
  ]
}
```

* `id`：系統用（可用週次）
* `title`：給小朋友看
* `content`：單字 ID 清單

---

### 2.2 期中考 / 複習範圍（用 include）

```json
{
  "id": "midterm_2025_1",
  "title": "期中考（第52～1週）",
  "include": [
    "week_2025_W52",
    "week_2026_W01"
  ]
}
```

📌 include 會自動展開所有週的 content
📌 不要同時寫 content + include（擇一）

---

## 3️⃣ 資料版本：meta.json

### 📌 規則

**只要 library 或 packs 有任何變動，就一定要改版本號**

```json
{
  "dataVersion": 2025122801,
  "updatedAt": "2025-12-28"
}
```

* `dataVersion`：只要變大即可（建議用日期）
* App 每次開啟會自動檢查

---

## 4️⃣ 每週最懶更新流程（推薦）

1. 新增單字 → library.json
2. 新增一個 week pack → packs.json
3. meta.json 版本號 +1
4. GitHub Commit & Push
5. iPad 重新整理

✅ 不用動 app.js
✅ 不影響既有成績



## 常見錯誤檢查

* packs.content 的 ID **一定要存在於 library.json**
* 大小寫、空白都算錯
* archived=true 的單字不會被抽到


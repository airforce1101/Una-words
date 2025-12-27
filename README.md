# Una-words

## 🎯 使用情境

- 裝置：iPad（Safari → 加入主畫面）
- 使用者：小學生（橫向使用）
- 單次使用時間：1～3 分鐘
- 家長陪伴使用為主，也可自行測驗

---

## 🧱 系統架構總覽
Una-words/
├── index.html # 入口（PWA）
├── app.js # 核心邏輯（UI + Flow）
├── styles.css # 視覺樣式（粉紫色、可愛風）
├── data/
│ ├── library.json # 單字總庫（SSOT）
│ ├── packs.json # 考卷 / 週次 / 複習範圍
│ └── meta.json # 資料版本控制
└── docs/
└── DATA_UPDATE.md


---

## 🧠 核心設計理念

### 1️⃣ 單字與考卷分離（Single Source of Truth）
- **library.json**  
  → 單字本體（英文、中文、音標）
- **packs.json**  
  → 僅定義「範圍」，不重複單字內容

👉 單字永遠只改一個地方，考卷只是引用 ID。

---

### 2️⃣ 以「週」為單位的學校導向設計
- 每週小考 = 一個 pack
- 期中考 = include 多個週 pack
- 錯題複習 = 可再組一個 pack

---

### 3️⃣ 使用者流程（User Flow）
開啟 App
↓
首頁
├─ 練習模式（打字＋提示）
└─ 測驗模式（打字＋計分）
↓
完成 → 星星獎勵 → 自動存檔


---

## ✏️ 功能模式說明

### 🟢 練習模式（Practice）

- 顯示中文 + 遮罩 `_ _ _ _`
- A/B 隨機提示（首字母 / 中間字母）
- 最多 2 次提示
- 不給壓力、答對才前進

---

### 🔴 測驗模式（Quiz）

- 介面與練習一致（打字）
- 無提示
- 起始 100 分，錯一次 -10 分
- **90 分以上及格**
- 過關才給星星

---

## 💾 資料儲存策略

- 使用者進度（分數、星星）：
  - 儲存在 iPad LocalStorage
- 單字與考卷資料：
  - 從 GitHub Pages 靜態 JSON 載入
- 啟動時自動檢查 `meta.json.dataVersion`

---

## 🚀 部署方式

- 平台：GitHub Pages（免費）
- iPad 使用方式：
  1. Safari 開啟網址
  2. 加入主畫面
  3. 當作 App 使用（全螢幕）

---

## 📌 備註

- STT / TTS 發音目前暫緩優化（Safari 行為不一致）
- 架構已預留 IPA / 發音播放欄位


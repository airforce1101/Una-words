// =======================
// Una Words - V0.2 (Data Load + Session)
// =======================

const APP = document.getElementById("app");

// ---- Config ----
const DATA = {
  meta: "./data/meta.json",
  library: "./data/library.json",
  packs: "./data/packs.json",
};

// ---- Local Storage Keys ----
const LS_KEY = "una_words_progress_v1";

// ---- In-memory runtime ----
let meta = null;
let library = null; // object: { id: {spelling, meaning,...}, ... }
let packs = null;   // array
let progress = null;

// session
let session = {
  packId: null,
  ids: [],
  idx: 0,
};

// ---------------------------
// Utilities
// ---------------------------
function nowISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeAnswer(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function pickN(arr, n) {
  const copy = [...arr];
  // Fisher–Yates shuffle
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// ---------------------------
// Progress (Local Storage)
// ---------------------------
function loadProgress() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) {
    return {
      dataVersionSeen: 0,
      selectedPackId: "week_1",
      stars: 0,
      byId: {}
    };
  }
  try {
    return JSON.parse(raw);
  } catch {
    // 若被寫壞：重置
    return {
      dataVersionSeen: 0,
      selectedPackId: "week_1",
      stars: 0,
      byId: {}
    };
  }
}

function saveProgress() {
  localStorage.setItem(LS_KEY, JSON.stringify(progress));
}

function ensureWordProgress(wordId) {
  if (!progress.byId[wordId]) {
    progress.byId[wordId] = { score: 0, wrongCount: 0, hintCount: 0 };
  }
  return progress.byId[wordId];
}

// ---------------------------
// Data Fetch
// ---------------------------
async function fetchJSON(url) {
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Fetch failed ${url}: ${resp.status}`);
  return await resp.json();
}

async function boot() {
  // 1) load local progress first
  progress = loadProgress();

  // 2) always check meta on open
  meta = await fetchJSON(DATA.meta);

  const needsUpdate = (meta.dataVersion ?? 0) > (progress.dataVersionSeen ?? 0);

  if (needsUpdate || !library || !packs) {
    library = await fetchJSON(DATA.library);
    packs = await fetchJSON(DATA.packs);

    // merge policy (MVP):
    // - keep progress
    // - initialize new ids
    // - archived stays in progress but won't be served later
    for (const id of Object.keys(library)) {
      ensureWordProgress(id);
    }

    progress.dataVersionSeen = meta.dataVersion ?? progress.dataVersionSeen;
    saveProgress();
  }

  // 3) render home
  renderHome();
}

// ---------------------------
// Session Logic (MVP)
// ---------------------------
function expandPackContent(packId) {
  const pack = packs.find(p => p.id === packId);
  if (!pack) return [];

  let ids = [];
  if (Array.isArray(pack.content)) ids.push(...pack.content);

  // support include (optional)
  if (Array.isArray(pack.include)) {
    for (const incId of pack.include) {
      const inc = packs.find(p => p.id === incId);
      if (inc?.content) ids.push(...inc.content);
    }
  }

  // de-dup
  ids = [...new Set(ids)];

  // filter archived or missing
  return ids.filter(id => library[id] && library[id].archived !== true);
}

function buildSession5() {
  const packId = progress.selectedPackId;
  const allIds = expandPackContent(packId);

  // ranking: prefer low score / never seen (score=0)
  const ranked = allIds
    .map(id => ({ id, p: ensureWordProgress(id) }))
    .sort((a, b) => {
      // lower score first; tie-break by higher wrongCount/hintCount
      if (a.p.score !== b.p.score) return a.p.score - b.p.score;
      if (a.p.wrongCount !== b.p.wrongCount) return b.p.wrongCount - a.p.wrongCount;
      return b.p.hintCount - a.p.hintCount;
    })
    .map(x => x.id);

  const chosen = pickN(ranked, 5);

  session = { packId, ids: chosen, idx: 0 };
}

// ---------------------------
// UI Rendering
// ---------------------------
function renderHome() {
  const packOptions = packs
    .map(p => `<option value="${p.id}" ${p.id === progress.selectedPackId ? "selected" : ""}>${p.title}</option>`)
    .join("");

  APP.innerHTML = `
    <div class="wrap">
      <div class="card">
        <h1>Una Words</h1>
        <p class="sub">今天想怎麼開始？</p>

        <div class="row" style="margin: 8px 0 10px;">
          <button class="big" id="btnPractice">先練習</button>
          <button class="big" id="btnQuiz">直接測驗</button>
        </div>

        <details>
          <summary>家長設定（選擇考卷範圍）</summary>
          <div style="margin-top:10px;">
            <label class="sub">目前範圍：</label>
            <select id="packSelect" style="font-size:18px;padding:10px;border-radius:12px;">
              ${packOptions}
            </select>
            <button id="btnSavePack" style="margin-left:8px;font-size:18px;padding:10px 14px;border-radius:12px;">
              儲存
            </button>
          </div>
          <p class="small">資料版本：${meta?.dataVersion ?? "?"}｜上次更新：${meta?.updatedAt ?? "?"}</p>
        </details>

        <p class="small">星星：${progress.stars} ⭐</p>
      </div>
    </div>
  `;

  document.getElementById("btnPractice").onclick = () => {
  buildSession5();
  renderPractice();
  };
  document.getElementById("btnQuiz").onclick = () => {
    buildSession5();
    renderQuizStub();
  };

  document.getElementById("btnSavePack").onclick = () => {
    const val = document.getElementById("packSelect").value;
    progress.selectedPackId = val;
    saveProgress();
    renderHome();
  };
}

function renderPracticeStub() {
  const currentId = session.ids[session.idx];
  const word = library[currentId];

  APP.innerHTML = `
    <div class="wrap">
      <div class="card">
        <h2>練習模式（V0.2 骨架）</h2>
        <p class="sub">Session：${session.packId}｜第 ${session.idx + 1} / ${session.ids.length} 題</p>

        <hr/>

        <p class="sub">中文：<strong>${word.meaning}</strong></p>
        <p class="small">（下一步才加入：發音 / A/B 提示 / 輸入框 / 答對自動下一題）</p>

        <div class="row" style="margin-top:12px;">
          <button class="big" id="next">下一題</button>
          <button class="big" id="home">回首頁</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("next").onclick = () => {
    session.idx++;
    if (session.idx >= session.ids.length) {
      progress.stars += 1;
      saveProgress();
      renderReward();
    } else {
      renderPracticeStub();
    }
  };
  document.getElementById("home").onclick = () => renderHome();
}

function renderQuizStub() {
  const currentId = session.ids[session.idx];
  const word = library[currentId];

  APP.innerHTML = `
    <div class="wrap">
      <div class="card">
        <h2>測驗模式（V0.2 骨架）</h2>
        <p class="sub">Session：${session.packId}｜第 ${session.idx + 1} / ${session.ids.length} 題</p>

        <hr/>

        <p class="sub">題目：<strong>${word.meaning}</strong></p>
        <p class="small">（下一步才加入：選擇題選項 / 判斷對錯 / 自動下一題）</p>

        <div class="row" style="margin-top:12px;">
          <button class="big" id="next">下一題</button>
          <button class="big" id="home">回首頁</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("next").onclick = () => {
    session.idx++;
    if (session.idx >= session.ids.length) {
      progress.stars += 1;
      saveProgress();
      renderReward();
    } else {
      renderQuizStub();
    }
  };
  document.getElementById("home").onclick = () => renderHome();
}

function renderReward() {
  APP.innerHTML = `
    <div class="wrap">
      <div class="card" style="text-align:center;">
        <h2>完成啦！🏆</h2>
        <p class="sub">你拿到 1 顆星星！</p>
        <p class="sub">目前總星星：<strong>${progress.stars} ⭐</strong></p>
        <div class="row" style="margin-top:12px;">
          <button class="big" id="home">回首頁</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("home").onclick = () => renderHome();
}

// start
boot().catch(err => {
  APP.innerHTML = `<div class="wrap"><div class="card"><h2>發生錯誤</h2><pre>${String(err)}</pre></div></div>`;
});


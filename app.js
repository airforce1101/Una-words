// =======================
// Una Words - v0.6.0 (Score Quiz)
// - Practice: Typing + Mask + Hints (No scoring pressure)
// - Quiz: Typing + Mask + No Hints + Scoring (Starts at 100, -10 per error, >90 to pass)
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
let library = null;
let packs = null;
let progress = null;

// session
let session = { packId: null, ids: [], idx: 0, mode: "practice" };

// practice per-session state
let practiceState = { hintPlan: {} };

// quiz per-session state
let quizState = { currentScore: 100 };

// ---------------------------
// Utilities
// ---------------------------
function normalizeAnswer(s) {
  return String(s ?? "").trim().toLowerCase();
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickN(arr, n) {
  const copy = [...arr];
  shuffleInPlace(copy);
  return copy.slice(0, n);
}

// ---------------------------
// Progress (Local Storage)
// ---------------------------
function loadProgress() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) {
    return { dataVersionSeen: 0, selectedPackId: "week_1", stars: 0, byId: {} };
  }
  try {
    const obj = JSON.parse(raw);
    if (!obj.byId) obj.byId = {};
    return obj;
  } catch {
    return { dataVersionSeen: 0, selectedPackId: "week_1", stars: 0, byId: {} };
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
  progress = loadProgress();

  meta = await fetchJSON(DATA.meta);
  const needsUpdate = (meta.dataVersion ?? 0) > (progress.dataVersionSeen ?? 0);

  library = await fetchJSON(DATA.library);
  packs = await fetchJSON(DATA.packs);

  for (const id of Object.keys(library)) ensureWordProgress(id);

  if (needsUpdate) {
    progress.dataVersionSeen = meta.dataVersion ?? progress.dataVersionSeen;
    saveProgress();
  }

  if (!packs.find(p => p.id === progress.selectedPackId) && packs[0]) {
    progress.selectedPackId = packs[0].id;
    saveProgress();
  }

  renderHome();
}

// ---------------------------
// Pack + Session Logic
// ---------------------------
function expandPackContent(packId) {
  const pack = packs.find(p => p.id === packId);
  if (!pack) return [];

  let ids = [];
  if (Array.isArray(pack.content)) ids.push(...pack.content);

  if (Array.isArray(pack.include)) {
    for (const incId of pack.include) {
      const inc = packs.find(p => p.id === incId);
      if (inc?.content) ids.push(...inc.content);
    }
  }

  ids = [...new Set(ids)];
  return ids.filter(id => library[id] && library[id].archived !== true);
}

function buildSession5(mode) {
  const packId = progress.selectedPackId;
  const allIds = expandPackContent(packId);

  // 練習模式：優先選分數低的
  const ranked = allIds
    .map(id => ({ id, p: ensureWordProgress(id) }))
    .sort((a, b) => {
      if (a.p.score !== b.p.score) return a.p.score - b.p.score;
      return b.p.wrongCount - a.p.wrongCount;
    })
    .map(x => x.id);

  const chosen = pickN(ranked, Math.min(5, ranked.length));
  
  session = { packId, ids: chosen, idx: 0, mode };
  
  // Reset states
  practiceState = { hintPlan: {} };
  quizState = { currentScore: 100 }; // 測驗分數從 100 開始
}

// ---------------------------
// UI: Home
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
          <button class="big" id="btnPractice">📝 先練習</button>
          <button class="big" id="btnQuiz">💯 考試測驗</button>
        </div>

        <details>
          <summary>🔧 家長設定</summary>
          <div style="margin-top:10px;">
            <label class="sub" style="text-align:left;">目前範圍：</label>
            <select id="packSelect">${packOptions}</select>
            <div class="row" style="margin-top:10px;">
              <button class="big" id="btnSavePack">儲存</button>
            </div>
          </div>
          <p class="small">資料版本：${meta?.dataVersion ?? "?"}</p>
        </details>

        <p class="small">目前星星：<strong>${progress.stars}</strong> ⭐</p>
      </div>
    </div>
  `;

  document.getElementById("btnPractice").onclick = () => {
    buildSession5("practice");
    renderPractice();
  };

  document.getElementById("btnQuiz").onclick = () => {
    buildSession5("quiz");
    renderQuiz(); // 改用新的測驗介面
  };

  document.getElementById("btnSavePack").onclick = () => {
    const val = document.getElementById("packSelect").value;
    progress.selectedPackId = val;
    saveProgress();
    renderHome();
  };
}

// ---------------------------
// Shared Helper: Mask Logic
// ---------------------------
function buildInitialMask(spelling) {
  const n = spelling.length;
  const mask = Array(n).fill("_");
  const revealed = new Set();
  return { mask, revealed };
}

function getHintPlan(wordId, spelling) {
  if (practiceState.hintPlan[wordId]) return practiceState.hintPlan[wordId];
  const type = Math.random() < 0.5 ? "A" : "B";
  const { mask, revealed } = buildInitialMask(spelling);
  practiceState.hintPlan[wordId] = { type, mask, revealed, hintUsed: 0 };
  return practiceState.hintPlan[wordId];
}

function revealOneMore(plan, spelling) {
  for (let i = 0; i < spelling.length; i++) {
    if (!plan.revealed.has(i)) {
      plan.revealed.add(i);
      plan.mask[i] = spelling[i];
      return true;
    }
  }
  return false;
}

// ---------------------------
// Mode 1: Practice (練習模式)
// - 有提示、不計分、輕鬆練
// ---------------------------
function renderPractice() {
  const currentId = session.ids[session.idx];
  const w = library[currentId];
  const target = normalizeAnswer(w.s ?? w.spelling ?? "");
  const meaning = w.m ?? w.meaning ?? "";

  const p = ensureWordProgress(currentId);
  const plan = getHintPlan(currentId, target);

  APP.innerHTML = `
    <div class="wrap">
      <div class="card">
        <h2>練習模式</h2>
        <p class="sub">第 ${session.idx + 1} / ${session.ids.length} 題</p>
        <hr/>
        <p class="sub">中文：<strong>${meaning}</strong></p>

        <div style="margin: 10px 0 6px;">
          <div class="sub">提示：</div>
          <strong class="word-mask">${plan.mask.join(" ")}</strong>
        </div>

        <div style="margin-top: 10px;">
          <input id="ans" type="text" placeholder="輸入英文..." autocomplete="off">
        </div>

        <div class="row" style="margin-top:12px;">
          <button class="big" id="btnConfirm">確認 ✅</button>
          <button class="big" id="btnHint">提示 💡</button>
          <button class="big" id="btnHome">回首頁 🏠</button>
        </div>

        <p id="feedback"></p>
        <p class="small">提示次數：${plan.hintUsed}/2</p>
      </div>
    </div>
  `;

  const input = document.getElementById("ans");
  const feedback = document.getElementById("feedback");

  input.focus();

  // 確認按鈕
  function check() {
    const user = normalizeAnswer(input.value);
    if (!user) {
      feedback.textContent = "請輸入答案 🤔";
      return;
    }
    if (user === target) {
      feedback.innerHTML = `太棒了！<span class="star-pop">⭐</span>`;
      feedback.classList.add("success");
      p.score = Math.min(100, (p.score ?? 0) + 10);
      saveProgress();
      setTimeout(() => {
        session.idx++;
        if (session.idx >= session.ids.length) {
          progress.stars++;
          saveProgress();
          renderReward("完成練習！🏆", "你得到 1 顆星星！");
        } else {
          renderPractice();
        }
      }, 400);
    } else {
      feedback.textContent = "差一點，再試試看 💪";
      p.wrongCount = (p.wrongCount ?? 0) + 1;
      saveProgress();
    }
  }

  // 提示按鈕
  document.getElementById("btnHint").onclick = () => {
    if (plan.hintUsed >= 2) {
      feedback.textContent = "提示用完囉！";
      return;
    }
    plan.hintUsed++;
    if (plan.hintUsed === 1 && plan.revealed.size === 0) {
        // Hint 1: Show 1 letter
        const idx = plan.type === "A" ? 0 : Math.floor(target.length / 2);
        plan.revealed.add(idx);
        plan.mask[idx] = target[idx];
    } else {
        revealOneMore(plan, target);
    }
    p.score = Math.max(0, (p.score ?? 0) - 5);
    saveProgress();
    renderPractice();
  };

  document.getElementById("btnConfirm").onclick = check;
  document.getElementById("btnHome").onclick = renderHome;
  input.addEventListener("keydown", (e) => { if(e.key==="Enter") check(); });
}

// ---------------------------
// Mode 2: Quiz (測驗模式)
// - 介面跟練習一樣 (打字)
// - 差異：沒有提示按鈕、計分系統 (錯一次扣10分)
// ---------------------------
function renderQuiz() {
  const currentId = session.ids[session.idx];
  const w = library[currentId];
  const target = normalizeAnswer(w.s ?? w.spelling ?? "");
  const meaning = w.m ?? w.meaning ?? "";
  
  // 建立一個全空的遮罩給使用者看長度 (但不給提示)
  const mask = Array(target.length).fill("_").join(" ");

  APP.innerHTML = `
    <div class="wrap">
      <div class="card">
        <h2>測驗考試</h2>
        <p class="sub">第 ${session.idx + 1} / ${session.ids.length} 題</p>
        <p class="small" style="color:var(--pink)">目前分數：${quizState.currentScore}</p>
        <hr/>
        
        <p class="sub">中文：<strong>${meaning}</strong></p>

        <div style="margin: 10px 0 6px;">
          <div class="sub">長度提示：</div>
          <strong class="word-mask">${mask}</strong>
        </div>

        <div style="margin-top: 10px;">
          <input id="ans" type="text" placeholder="考試中..." autocomplete="off">
        </div>

        <div class="row" style="margin-top:12px;">
          <button class="big" id="btnConfirm">確認交卷 ✅</button>
          <button class="big" id="btnHome">放棄 🏠</button>
        </div>

        <p id="feedback" style="min-height:24px;"></p>
        <p class="small">及格標準：90分 (只能錯1次)</p>
      </div>
    </div>
  `;

  const input = document.getElementById("ans");
  const feedback = document.getElementById("feedback");

  setTimeout(() => input.focus(), 50);

  function check() {
    const user = normalizeAnswer(input.value);
    if (!user) {
      feedback.textContent = "請作答 🤔";
      return;
    }

    if (user === target) {
      // 答對
      feedback.innerHTML = `正確！💯`;
      feedback.classList.add("success");
      
      setTimeout(() => {
        session.idx++;
        if (session.idx >= session.ids.length) {
          finishQuiz();
        } else {
          renderQuiz();
        }
      }, 400);
    } else {
      // 答錯
      quizState.currentScore = Math.max(0, quizState.currentScore - 10); // 扣10分
      feedback.textContent = "答錯囉！扣 10 分 😱 再試一次";
      feedback.style.color = "#ef4444";
      input.value = "";
      input.focus();
      
      // 更新畫面上分數顯示 (簡易重繪分數，不重繪整個DOM以免input失焦)
      const scoreDisplay = document.querySelector(".small[style*='var(--pink)']");
      if(scoreDisplay) scoreDisplay.textContent = `目前分數：${quizState.currentScore}`;
    }
  }

  document.getElementById("btnConfirm").onclick = check;
  document.getElementById("btnHome").onclick = renderHome;
  input.addEventListener("keydown", (e) => { if(e.key==="Enter") check(); });
}

function finishQuiz() {
  const score = quizState.currentScore;
  const isPass = score >= 90;

  if (isPass) {
    progress.stars++;
    saveProgress();
  }

  APP.innerHTML = `
    <div class="wrap">
      <div class="card" style="text-align:center;">
        <h2>${isPass ? "恭喜過關！🎉" : "不及格 😢"}</h2>
        <h1 style="font-size:60px; margin:20px 0;">${score}分</h1>
        
        <p class="sub">${isPass ? "太厲害了！拿到 1 顆星星 ⭐" : "要 90 分才及格喔，再試一次吧！"}</p>
        
        <div class="row" style="margin-top:20px;">
          <button class="big" id="home">回首頁 🏠</button>
          <button class="big" id="retry">再考一次 📝</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("home").onclick = renderHome;
  document.getElementById("retry").onclick = () => {
    buildSession5("quiz");
    renderQuiz();
  };
}

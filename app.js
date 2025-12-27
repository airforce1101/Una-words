// =======================
// Una Words - V0.4.1
// Fix: iPad auto-submit/auto-advance bug
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
let session = { packId: null, ids: [], idx: 0 };

// practice per-session state
let practiceState = { hintPlan: {} };

// ---------------------------
// Utilities
// ---------------------------
function normalizeAnswer(s) {
  return String(s ?? "").trim().toLowerCase();
}

function pickN(arr, n) {
  const copy = [...arr];
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
    return { dataVersionSeen: 0, selectedPackId: "week_1", stars: 0, byId: {} };
  }
  try {
    return JSON.parse(raw);
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

  // Always check meta on open
  meta = await fetchJSON(DATA.meta);
  const needsUpdate = (meta.dataVersion ?? 0) > (progress.dataVersionSeen ?? 0);

  if (needsUpdate || !library || !packs) {
    library = await fetchJSON(DATA.library);
    packs = await fetchJSON(DATA.packs);

    // merge: keep local stars/progress; init new ids
    for (const id of Object.keys(library)) ensureWordProgress(id);

    progress.dataVersionSeen = meta.dataVersion ?? progress.dataVersionSeen;
    saveProgress();
  }

  // If selected pack doesn't exist (e.g. changed), fallback to first pack
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

  // support include (optional)
  if (Array.isArray(pack.include)) {
    for (const incId of pack.include) {
      const inc = packs.find(p => p.id === incId);
      if (inc?.content) ids.push(...inc.content);
    }
  }

  ids = [...new Set(ids)];
  return ids.filter(id => library[id] && library[id].archived !== true);
}

function buildSession5() {
  const packId = progress.selectedPackId;
  const allIds = expandPackContent(packId);

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
  practiceState = { hintPlan: {} }; // reset per session
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
          <p class="small">資料版本：${meta?.dataVersion ?? "?"}｜更新日：${meta?.updatedAt ?? "?"}</p>
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

// ---------------------------
// Practice Mode (B) - Input + Masked Hint
// Fixes in v0.4.1:
// - Remove 'change' submit (iPad blur can trigger)
// - Force clear input value on each render
// - Randomize input 'name' to reduce Safari autofill
// - Add explicit Submit button
// ---------------------------
function buildInitialMask(spelling) {
  const n = spelling.length;
  const mask = Array(n).fill("_");
  const revealed = new Set();
  return { mask, revealed };
}

function getHintPlan(wordId, spelling) {
  if (practiceState.hintPlan[wordId]) return practiceState.hintPlan[wordId];

  const type = Math.random() < 0.5 ? "A" : "B"; // A: first letter, B: middle letter
  const { mask, revealed } = buildInitialMask(spelling);

  practiceState.hintPlan[wordId] = { type, mask, revealed, hintUsed: 0 };
  return practiceState.hintPlan[wordId];
}

function formatMask(maskArr) {
  return maskArr.join(" ");
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

function renderPractice() {
  const currentId = session.ids[session.idx];
  const word = library[currentId];
  const target = normalizeAnswer(word.spelling);

  const p = ensureWordProgress(currentId);
  const plan = getHintPlan(currentId, target);

  APP.innerHTML = `
    <div class="wrap">
      <div class="card">
        <h2>練習模式</h2>
        <p class="sub">第 ${session.idx + 1} / ${session.ids.length} 題</p>

        <hr/>

        <p class="sub">中文：<strong>${word.meaning}</strong></p>

        <div style="margin: 10px 0 6px;">
          <div class="sub">提示：</div>
          <div style="font-size:26px; letter-spacing:1px; margin-top:6px;">
            <strong>${formatMask(plan.mask)}</strong>
          </div>
          <p class="small">（答對會自動下一題🙂）</p>
        </div>

        <div style="margin-top: 10px;">
          <label class="sub" for="ans">請輸入英文：</label>
          <input
            id="ans"
            type="text"
            inputmode="latin"
            autocomplete="off"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            style="width:100%; font-size:24px; padding:14px; border-radius:14px; border:2px solid #333; margin-top:8px;"
            placeholder="在這裡打字…"
          />
        </div>

        <div class="row" style="margin-top:12px;">
          <button class="big" id="btnSubmit">送出</button>
          <button class="big" id="btnHint">提示一下</button>
          <button class="big" id="btnHome">回首頁</button>
        </div>

        <p id="feedback" class="sub" style="margin-top:12px; min-height:28px;"></p>
        <p class="small">提示次數：${plan.hintUsed}/2</p>
      </div>
    </div>
  `;

  const input = document.getElementById("ans");
  const feedback = document.getElementById("feedback");

  // v0.4.1 anti-autofill/anti-auto-submit
  input.value = "";
  input.setAttribute("name", "ans_" + Date.now());

  setTimeout(() => input.focus(), 50);

  function advanceOrReward() {
    session.idx++;
    if (session.idx >= session.ids.length) {
      progress.stars += 1;
      saveProgress();
      renderReward();
    } else {
      renderPractice();
    }
  }

  function checkAndAdvance() {
    const user = normalizeAnswer(input.value);
    if (!user) {
      feedback.textContent = "先打一點點也可以🙂";
      input.focus();
      return;
    }

    if (user === target) {
      feedback.textContent = "太棒了！✅";
      p.score = Math.min(100, (p.score ?? 0) + 10);
      saveProgress();
      setTimeout(advanceOrReward, 800);
    } else {
      feedback.textContent = "差一點～再試一次🙂";
      p.wrongCount = (p.wrongCount ?? 0) + 1;
      saveProgress();
      // keep input for editing
      input.focus();
    }
  }

  // Enter to submit (works on desktop & iPad)
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      checkAndAdvance();
    }
  });

  // IMPORTANT: do NOT use change/blur/input auto-submit (iPad can misfire)

  document.getElementById("btnSubmit").onclick = () => checkAndAdvance();

  document.getElementById("btnHint").onclick = () => {
    if (plan.hintUsed >= 2) {
      feedback.textContent = "已經提示過囉～先試試看🙂";
      input.focus();
      return;
    }

    plan.hintUsed += 1;
    p.hintCount = (p.hintCount ?? 0) + 1;

    // First hint: reveal by A/B (first letter or middle letter)
    if (plan.hintUsed === 1 && plan.revealed.size === 0) {
      if (plan.type === "A" && target.length > 0) {
        plan.revealed.add(0);
        plan.mask[0] = target[0];
      } else if (target.length > 0) {
        const mid = Math.floor(target.length / 2);
        plan.revealed.add(mid);
        plan.mask[mid] = target[mid];
      }
    } else {
      // Second hint: reveal one more (left-to-right)
      revealOneMore(plan, target);
    }

    // Optional hidden penalty (no UI display)
    p.score = Math.max(0, (p.score ?? 0) - 5);

    saveProgress();
    renderPractice();
  };

  document.getElementById("btnHome").onclick = () => renderHome();
}

// ---------------------------
// Quiz Mode (C) - Stub for now
// ---------------------------
function renderQuizStub() {
  const currentId = session.ids[session.idx];
  const word = library[currentId];

  APP.innerHTML = `
    <div class="wrap">
      <div class="card">
        <h2>測驗模式（暫時骨架）</h2>
        <p class="sub">第 ${session.idx + 1} / ${session.ids.length} 題</p>

        <hr/>

        <p class="sub">題目：<strong>${word.meaning}</strong></p>
        <p class="small">下一步會做：選擇題（無震動、答對自動下一題）</p>

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

// ---------------------------
// Reward
// ---------------------------
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

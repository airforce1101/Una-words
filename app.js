// =======================
// Una Words - v0.5.0 (Kid Pink + Confirm)
// - Practice: typing + mask, confirm-only advance, max 2 hints, A/B hint style
// - Quiz: 4-choice, confirm-only grade, no vibration, positive zh-TW
// - Data: meta/library/packs from /data, progress in LocalStorage
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
let library = null; // object: { id: {s, m, archived, ...}, ... }
let packs = null;   // array
let progress = null;

// session
let session = { packId: null, ids: [], idx: 0, mode: "practice" };

// practice per-session state
let practiceState = { hintPlan: {} };

// quiz per-session state
let quizState = { selected: null, choices: [], locked: false };

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

  // Always check meta on open
  meta = await fetchJSON(DATA.meta);
  const needsUpdate = (meta.dataVersion ?? 0) > (progress.dataVersionSeen ?? 0);

  library = await fetchJSON(DATA.library);
  packs = await fetchJSON(DATA.packs);

  // merge: keep local stars/progress; init new ids
  for (const id of Object.keys(library)) ensureWordProgress(id);

  if (needsUpdate) {
    progress.dataVersionSeen = meta.dataVersion ?? progress.dataVersionSeen;
    saveProgress();
  }

  // If selected pack doesn't exist, fallback
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

function buildSession5(mode) {
  const packId = progress.selectedPackId;
  const allIds = expandPackContent(packId);

  // rank: lower score first, then more mistakes
  const ranked = allIds
    .map(id => ({ id, p: ensureWordProgress(id) }))
    .sort((a, b) => {
      if (a.p.score !== b.p.score) return a.p.score - b.p.score;
      if (a.p.wrongCount !== b.p.wrongCount) return b.p.wrongCount - a.p.wrongCount;
      return b.p.hintCount - a.p.hintCount;
    })
    .map(x => x.id);

  const chosen = pickN(ranked, Math.min(5, ranked.length));
  session = { packId, ids: chosen, idx: 0, mode };
  practiceState = { hintPlan: {} };
  quizState = { selected: null, choices: [], locked: false };
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
          <button class="big" id="btnPractice">🖤 先練習</button>
          <button class="big" id="btnQuiz">✨ 直接測驗</button>
        </div>

        <details>
          <summary>🔧 家長設定（選擇考卷範圍）</summary>
          <div style="margin-top:10px;">
            <label class="sub" style="text-align:left;">目前範圍：</label>
            <select id="packSelect">${packOptions}</select>
            <div class="row" style="margin-top:10px;">
              <button class="big" id="btnSavePack">儲存</button>
            </div>
          </div>
          <p class="small">資料版本：${meta?.dataVersion ?? "?"}｜更新日：${meta?.updatedAt ?? "?"}</p>
        </details>

        <p class="small">星星：<strong>${progress.stars}</strong> ⭐</p>
        <p class="small">版本：v0.5.0</p>
      </div>
    </div>
  `;

  document.getElementById("btnPractice").onclick = () => {
    buildSession5("practice");
    renderPractice();
  };

  document.getElementById("btnQuiz").onclick = () => {
    buildSession5("quiz");
    renderQuiz();
  };

  document.getElementById("btnSavePack").onclick = () => {
    const val = document.getElementById("packSelect").value;
    progress.selectedPackId = val;
    saveProgress();
    renderHome();
  };
}

// ---------------------------
// Practice Mode (Typing + Confirm Only)
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
  const w = library[currentId];
  // support both schemas: {s,m} or {spelling,meaning}
  const spellingRaw = w.s ?? w.spelling ?? "";
  const meaning = w.m ?? w.meaning ?? "";
  const target = normalizeAnswer(spellingRaw);

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
          <div style="margin-top:6px;">
            <strong class="word-mask">${formatMask(plan.mask)}</strong>
          </div>
          <p class="small">（輸入後按「確認」🙂）</p>
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
            placeholder="在這裡打字…"
          />
        </div>

        <div class="row" style="margin-top:12px;">
          <button class="big" id="btnConfirm">✅ 確認</button>
          <button class="big" id="btnHint">💡 提示一下</button>
          <button class="big" id="btnHome">🏠 回首頁</button>
        </div>

        <p id="feedback"></p>
        <p class="small">提示次數：${plan.hintUsed}/2</p>
      </div>
    </div>
  `;

  const input = document.getElementById("ans");
  const feedback = document.getElementById("feedback");

  // anti-autofill (Safari)
  input.value = "";
  input.setAttribute("name", "ans_" + Date.now());
  setTimeout(() => input.focus(), 50);

  function starFx() {
    feedback.innerHTML = `太棒了！<span class="star-pop">⭐</span>`;
    feedback.classList.add("success");
  }

  function goNextOrReward() {
    session.idx++;
    if (session.idx >= session.ids.length) {
      progress.stars += 1;
      saveProgress();
      renderReward("完成啦！🏆", "你拿到 1 顆星星！");
    } else {
      renderPractice();
    }
  }

  function checkOnlyAdvanceIfCorrect() {
    const user = normalizeAnswer(input.value);

    if (!user) {
      feedback.textContent = "先打一點點也可以🙂";
      input.focus();
      return;
    }

    if (user === target) {
      // update progress
      p.score = Math.min(100, (p.score ?? 0) + 10);
      saveProgress();

      // feedback + star
      starFx();

      // advance AFTER feedback (short delay is ok, but not auto-triggered)
      setTimeout(() => goNextOrReward(), 250);
    } else {
      feedback.textContent = "差一點～再試一次🙂";
      p.wrongCount = (p.wrongCount ?? 0) + 1;
      saveProgress();
      input.focus();
    }
  }

  document.getElementById("btnConfirm").onclick = () => checkOnlyAdvanceIfCorrect();

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      checkOnlyAdvanceIfCorrect();
    }
  });

  document.getElementById("btnHint").onclick = () => {
    if (plan.hintUsed >= 2) {
      feedback.textContent = "已經提示過囉～先試試看🙂";
      input.focus();
      return;
    }

    plan.hintUsed += 1;
    p.hintCount = (p.hintCount ?? 0) + 1;

    // First hint: reveal A/B
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
      revealOneMore(plan, target);
    }

    // small hidden penalty
    p.score = Math.max(0, (p.score ?? 0) - 5);

    saveProgress();
    renderPractice();
  };

  document.getElementById("btnHome").onclick = () => renderHome();
}

// ---------------------------
// Quiz Mode (4-choice + Confirm Only)
// ---------------------------
function buildQuizChoices(correctId) {
  const correct = library[correctId];
  const correctSpelling = correct.s ?? correct.spelling ?? "";
  const correctAns = normalizeAnswer(correctSpelling);

  // distractors from current pack first
  const pool = expandPackContent(progress.selectedPackId)
    .filter(id => id !== correctId)
    .map(id => normalizeAnswer(library[id].s ?? library[id].spelling ?? ""))
    .filter(x => x && x !== correctAns);

  // fallback to whole library
  if (pool.length < 3) {
    const all = Object.keys(library)
      .filter(id => id !== correctId && library[id]?.archived !== true)
      .map(id => normalizeAnswer(library[id].s ?? library[id].spelling ?? ""))
      .filter(x => x && x !== correctAns);
    pool.push(...all);
  }

  const distract = pickN([...new Set(pool)], 3);
  const choices = shuffleInPlace([correctAns, ...distract]);

  return choices;
}

function renderQuiz() {
  const currentId = session.ids[session.idx];
  const w = library[currentId];
  const meaning = w.m ?? w.meaning ?? "";
  const correctSpelling = normalizeAnswer(w.s ?? w.spelling ?? "");
  const p = ensureWordProgress(currentId);

  quizState.selected = null;
  quizState.locked = false;
  quizState.choices = buildQuizChoices(currentId);

  APP.innerHTML = `
    <div class="wrap">
      <div class="card">
        <h2>測驗模式</h2>
        <p class="sub">第 ${session.idx + 1} / ${session.ids.length} 題</p>
        <hr/>

        <p class="sub">題目：<strong>${meaning}</strong></p>
        <p class="small">選一個答案，按「確認」🙂</p>

        <div class="option-grid" id="grid">
          ${quizState.choices.map((c, i) => `
            <button class="option-btn" data-idx="${i}">${c}</button>
          `).join("")}
        </div>

        <div class="row" style="margin-top:12px;">
          <button class="big" id="btnConfirm">✅ 確認</button>
          <button class="big" id="btnHome">🏠 回首頁</button>
        </div>

        <p id="feedback"></p>
        <p class="small">（測驗不會震動，也不會罵人🙂）</p>
      </div>
    </div>
  `;

  const feedback = document.getElementById("feedback");
  const grid = document.getElementById("grid");
  const buttons = [...grid.querySelectorAll(".option-btn")];

  function starFx() {
    feedback.innerHTML = `太棒了！<span class="star-pop">⭐</span>`;
    feedback.classList.add("success");
  }

  function goNextOrReward() {
    session.idx++;
    if (session.idx >= session.ids.length) {
      progress.stars += 1;
      saveProgress();
      renderReward("太厲害了！🎉", "你完成了這次測驗！");
    } else {
      renderQuiz();
    }
  }

  function setSelected(idx) {
    if (quizState.locked) return;
    quizState.selected = idx;
    buttons.forEach((b, i) => {
      b.classList.toggle("selected", i === idx);
    });
  }

  buttons.forEach((btn) => {
    btn.onclick = () => setSelected(Number(btn.dataset.idx));
  });

  document.getElementById("btnConfirm").onclick = () => {
    if (quizState.locked) return;

    if (quizState.selected === null) {
      feedback.textContent = "先選一個答案🙂";
      return;
    }

    quizState.locked = true;

    const chosen = quizState.choices[quizState.selected];
    const isCorrect = normalizeAnswer(chosen) === correctSpelling;

    if (isCorrect) {
      // progress
      p.score = Math.min(100, (p.score ?? 0) + 15);
      saveProgress();

      // UI mark
      buttons[quizState.selected].classList.add("correct");
      starFx();

      setTimeout(() => goNextOrReward(), 300);
    } else {
      // progress
      p.wrongCount = (p.wrongCount ?? 0) + 1;
      p.score = Math.max(0, (p.score ?? 0) - 5);
      saveProgress();

      buttons[quizState.selected].classList.add("wrong");
      feedback.textContent = "差一點～再想想🙂（可以回去重新選）";

      // allow retry: unlock after short delay, keep same question
      setTimeout(() => {
        quizState.locked = false;
        // keep selection but allow change
      }, 250);
    }
  };

  document.getElementById("btnHome").onclick = () => renderHome();
}

// ---------------------------
// Reward Screen
// ---------------------------
function renderReward(title, msg) {
  APP.innerHTML = `
    <div class="wrap">
      <div class="card" style="text-align:center;">
        <h2>${title}</h2>
        <p class="sub">${msg}</p>
        <p class="sub">目前總星星：<strong>${progress.stars} ⭐</strong></p>
        <div class="row" style="margin-top:12px;">
          <button class="big" id="home">🏠 回首頁</button>
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


// =======================
// Una Words - v0.6.2 (IPA + TTS in Practice)
// - Practice: Typing + Mask + Hints (max 2) + IPA display + Speak button (TTS)
// - Quiz: Typing + Mask + Scoring (start 100, -10 per wrong), >=90 pass
// - Data: meta/library/packs from /data, progress in LocalStorage
// =======================

const BUILD = "v0.6.2-20251228";
const APP = document.getElementById("app");

// ---- Config ----
const DATA = {
  meta: "./data/meta.json",
  library: "./data/library.json",
  packs: "./data/packs.json",
};

// ---- Local Storage Keys ----
const LS_KEY = "una_words_progress_v1";

// ---- Runtime ----
let meta = null;
let library = null;
let packs = null;
let progress = null;

// session state
let session = { packId: null, ids: [], idx: 0, mode: "practice" };

// practice per-session hint plan
let practiceState = { hintPlan: {} };

// quiz per-session score
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

function safeText(s) {
  // prevent null/undefined rendering
  return String(s ?? "");
}

// TTS (iPad Safari: must be user-gesture triggered)
function speakWord(text) {
  try {
    const t = String(text ?? "").trim();
    if (!t) return;

    if (window.speechSynthesis) window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(t);
    u.lang = "en-US";
    u.rate = 0.95;
    u.pitch = 1.05;

    window.speechSynthesis.speak(u);
  } catch (e) {
    console.warn("TTS unavailable", e);
  }
}

// ---------------------------
// Progress (Local Storage)
// ---------------------------
function loadProgress() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return { dataVersionSeen: 0, selectedPackId: "week_1", stars: 0, byId: {} };

  try {
    const obj = JSON.parse(raw);
    if (!obj.byId) obj.byId = {};
    if (typeof obj.stars !== "number") obj.stars = 0;
    if (!obj.selectedPackId) obj.selectedPackId = "week_1";
    if (!obj.dataVersionSeen) obj.dataVersionSeen = 0;
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
  const remoteVer = meta?.dataVersion ?? 0;
  const localVer = progress?.dataVersionSeen ?? 0;
  const needsUpdate = remoteVer > localVer;

  // Always load library/packs (simple + reliable)
  library = await fetchJSON(DATA.library);
  packs = await fetchJSON(DATA.packs);

  // init progress entries for new words
  for (const id of Object.keys(library)) ensureWordProgress(id);

  if (needsUpdate) {
    progress.dataVersionSeen = remoteVer;
    saveProgress();
  }

  // fallback pack
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
      if (Array.isArray(inc?.content)) ids.push(...inc.content);
    }
  }

  // unique + filter archived/missing
  ids = [...new Set(ids)];
  return ids.filter(id => {
    const w = library[id];
    if (!w) return false;
    return w.archived !== true;
  });
}

function buildSession5(mode) {
  const packId = progress.selectedPackId;
  const allIds = expandPackContent(packId);

  const ranked = allIds
    .map(id => ({ id, p: ensureWordProgress(id) }))
    .sort((a, b) => {
      // lower score first, then more wrongCount, then more hintCount
      if (a.p.score !== b.p.score) return a.p.score - b.p.score;
      if (a.p.wrongCount !== b.p.wrongCount) return b.p.wrongCount - a.p.wrongCount;
      return b.p.hintCount - a.p.hintCount;
    })
    .map(x => x.id);

  const chosen = pickN(ranked, Math.min(5, ranked.length));
  session = { packId, ids: chosen, idx: 0, mode };

  practiceState = { hintPlan: {} };
  quizState = { currentScore: 100 };
}

// ---------------------------
// Mask + Hints
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

function formatMask(maskArr) {
  return maskArr.join(" ");
}

// ---------------------------
// UI: Home
// ---------------------------
function renderHome() {
  const packOptions = packs
    .map(p => `<option value="${p.id}" ${p.id === progress.selectedPackId ? "selected" : ""}>${safeText(p.title)}</option>`)
    .join("");

  APP.innerHTML = `
    <div class="wrap">
      <div class="card">
        <div class="brand">
          <div class="badge">🎀</div>
          <div>
            <h1>Una Words</h1>
            <p class="sub">今天想怎麼開始？</p>
          </div>
        </div>

        <div class="row">
          <button class="big" id="btnPractice">📝 先練習</button>
          <button class="big" id="btnQuiz">💯 考試測驗</button>
        </div>

        <details class="panel">
          <summary>🔧 家長設定（選擇考卷範圍）</summary>
          <div class="panel-body">
            <label class="label">目前範圍</label>
            <select id="packSelect">${packOptions}</select>

            <div class="row" style="margin-top:12px;">
              <button class="big ghost" id="btnSavePack">儲存</button>
              <button class="big ghost" id="btnReset">清除進度（本機）</button>
            </div>

            <div class="meta">
              <div>資料版本：<strong>${meta?.dataVersion ?? "?"}</strong></div>
              <div>更新日：${meta?.updatedAt ?? "-"}</div>
              <div>Build：${BUILD}</div>
            </div>
          </div>
        </details>

        <div class="stat">
          <div class="pill">⭐ 星星 <strong>${progress.stars}</strong></div>
          <div class="pill">📦 Pack <strong>${safeText(progress.selectedPackId)}</strong></div>
        </div>

        <p class="tiny">提示：iPad 建議關閉自動更正與自動大寫，拼字練習會更順。</p>
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

  document.getElementById("btnReset").onclick = () => {
    const ok = confirm("確定要清除本機進度嗎？（星星/分數都會歸零）");
    if (!ok) return;
    localStorage.removeItem(LS_KEY);
    progress = loadProgress();
    // keep selected pack if exists
    if (packs.find(p => p.id === progress.selectedPackId) == null && packs[0]) {
      progress.selectedPackId = packs[0].id;
    }
    saveProgress();
    renderHome();
  };
}

// ---------------------------
// Practice Mode (IPA + TTS + Hints)
// ---------------------------
function renderPractice() {
  const currentId = session.ids[session.idx];
  const w = library[currentId];

  const spellingRaw = safeText(w.s ?? w.spelling ?? "");
  const meaning = safeText(w.m ?? w.meaning ?? "");
  const ipa = safeText(w.ipa ?? "");
  const target = normalizeAnswer(spellingRaw);

  const p = ensureWordProgress(currentId);
  const plan = getHintPlan(currentId, target);

  APP.innerHTML = `
    <div class="wrap">
      <div class="card">
        <div class="topbar">
          <div>
            <h2>練習模式</h2>
            <p class="sub">第 ${session.idx + 1} / ${session.ids.length} 題</p>
          </div>
          <button class="chip" id="btnHome">🏠 回首頁</button>
        </div>

        <div class="divider"></div>

        <div class="prompt">
          <div class="label">中文</div>
          <div class="meaning">${meaning}</div>
        </div>

        <div class="pron-row">
          <div class="pron-left">
            <div class="label">發音 / 音標</div>
            <div class="ipa">${ipa ? ipa : "（本題音標尚未補上）"}</div>
          </div>
          <button class="icon-btn" id="btnSpeak" title="播放發音">🔊</button>
        </div>

        <div class="hintbox">
          <div class="label">提示</div>
          <div class="mask"><span class="word-mask">${formatMask(plan.mask)}</span></div>
          <div class="tiny">輸入後按「確認」🙂</div>
        </div>

        <div class="inputbox">
          <label class="label" for="ans">請輸入英文</label>
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

        <div class="row">
          <button class="big" id="btnConfirm">✅ 確認</button>
          <button class="big ghost" id="btnHint">💡 提示一下 <span class="mini">(${plan.hintUsed}/2)</span></button>
        </div>

        <p id="feedback" class="feedback"></p>
      </div>
    </div>
  `;

  const input = document.getElementById("ans");
  const feedback = document.getElementById("feedback");

  // Anti autofill
  input.value = "";
  input.setAttribute("name", "ans_" + Date.now());
  setTimeout(() => input.focus(), 50);

  const btnHome = document.getElementById("btnHome");
  const btnSpeak = document.getElementById("btnSpeak");
  const btnConfirm = document.getElementById("btnConfirm");
  const btnHint = document.getElementById("btnHint");

  btnHome.onclick = () => renderHome();
  btnSpeak.onclick = () => speakWord(spellingRaw);

  function setFeedback(type, textOrHtml) {
    feedback.className = "feedback " + (type || "");
    feedback.innerHTML = textOrHtml;
  }

  function goNextOrReward() {
    session.idx++;
    if (session.idx >= session.ids.length) {
      progress.stars += 1;
      saveProgress();
      renderReward("完成練習！🏆", "你得到 1 顆星星！");
    } else {
      renderPractice();
    }
  }

  function check() {
    const user = normalizeAnswer(input.value);
    if (!user) {
      setFeedback("", "先打一點點也可以🙂");
      input.focus();
      return;
    }

    if (user === target) {
      // score up gently
      p.score = Math.min(100, (p.score ?? 0) + 10);
      saveProgress();

      setFeedback("ok", `太棒了！<span class="star-pop">⭐</span>`);
      // do NOT auto-judge next without confirm; but confirm is pressed now, so we can advance
      setTimeout(goNextOrReward, 260);
    } else {
      p.wrongCount = (p.wrongCount ?? 0) + 1;
      saveProgress();

      setFeedback("ng", "差一點～再試一次🙂");
      input.focus();
      input.select?.();
    }
  }

  btnConfirm.onclick = check;

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      check();
    }
  });

  btnHint.onclick = () => {
    if (plan.hintUsed >= 2) {
      setFeedback("", "已經提示過囉～先試試看🙂");
      input.focus();
      return;
    }

    plan.hintUsed += 1;
    p.hintCount = (p.hintCount ?? 0) + 1;

    if (plan.hintUsed === 1 && plan.revealed.size === 0) {
      // Hint 1: A/B reveal
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

    // hidden penalty (small)
    p.score = Math.max(0, (p.score ?? 0) - 5);
    saveProgress();
    renderPractice();
  };
}

// ---------------------------
// Quiz Mode (Typing + Score)
// ---------------------------
function renderQuiz() {
  const currentId = session.ids[session.idx];
  const w = library[currentId];

  const spellingRaw = safeText(w.s ?? w.spelling ?? "");
  const meaning = safeText(w.m ?? w.meaning ?? "");
  const target = normalizeAnswer(spellingRaw);

  const mask = Array(target.length).fill("_");

  APP.innerHTML = `
    <div class="wrap">
      <div class="card">
        <div class="topbar">
          <div>
            <h2>考試測驗</h2>
            <p class="sub">第 ${session.idx + 1} / ${session.ids.length} 題</p>
          </div>
          <button class="chip" id="btnHome">🏠 回首頁</button>
        </div>

        <div class="scorebar">
          <div class="pill">目前分數 <strong id="scoreNow">${quizState.currentScore}</strong></div>
          <div class="pill">及格 <strong>90</strong></div>
        </div>

        <div class="divider"></div>

        <div class="prompt">
          <div class="label">中文</div>
          <div class="meaning">${meaning}</div>
        </div>

        <div class="hintbox">
          <div class="label">長度提示</div>
          <div class="mask"><span class="word-mask">${formatMask(mask)}</span></div>
          <div class="tiny">考試中沒有提示，但你一定可以🙂</div>
        </div>

        <div class="inputbox">
          <label class="label" for="ans">請輸入英文</label>
          <input
            id="ans"
            type="text"
            inputmode="latin"
            autocomplete="off"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            placeholder="輸入後按確認交卷…"
          />
        </div>

        <div class="row">
          <button class="big" id="btnConfirm">✅ 確認交卷</button>
          <button class="big ghost" id="btnClear">🧽 清空</button>
        </div>

        <p id="feedback" class="feedback"></p>
        <p class="tiny">規則：答錯扣 10 分；最後分數 ≥ 90 才算過關。</p>
      </div>
    </div>
  `;

  const input = document.getElementById("ans");
  const feedback = document.getElementById("feedback");
  const scoreNow = document.getElementById("scoreNow");

  input.value = "";
  input.setAttribute("name", "quiz_" + Date.now());
  setTimeout(() => input.focus(), 50);

  document.getElementById("btnHome").onclick = () => renderHome();
  document.getElementById("btnClear").onclick = () => {
    input.value = "";
    input.focus();
  };

  function setFeedback(type, textOrHtml) {
    feedback.className = "feedback " + (type || "");
    feedback.innerHTML = textOrHtml;
  }

  function goNextOrFinish() {
    session.idx++;
    if (session.idx >= session.ids.length) {
      finishQuiz();
    } else {
      renderQuiz();
    }
  }

  function check() {
    const user = normalizeAnswer(input.value);
    if (!user) {
      setFeedback("", "請先作答🙂");
      input.focus();
      return;
    }

    if (user === target) {
      setFeedback("ok", `正確！<span class="star-pop">✨</span>`);
      setTimeout(goNextOrFinish, 260);
    } else {
      quizState.currentScore = Math.max(0, quizState.currentScore - 10);
      scoreNow.textContent = String(quizState.currentScore);

      setFeedback("ng", "差一點～再試一次🙂（扣 10 分）");
      input.value = "";
      input.focus();
    }
  }

  document.getElementById("btnConfirm").onclick = check;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      check();
    }
  });
}

function finishQuiz() {
  const score = quizState.currentScore;
  const isPass = score >= 90;

  if (isPass) {
    progress.stars += 1;
    saveProgress();
  }

  APP.innerHTML = `
    <div class="wrap">
      <div class="card center">
        <div class="trophy">${isPass ? "🏆" : "🧸"}</div>
        <h2>${isPass ? "恭喜過關！" : "快要成功了！"}</h2>
        <div class="bigscore">${score} 分</div>
        <p class="sub">${isPass ? "你拿到 1 顆星星 ⭐" : "要 90 分才及格，再試一次也沒關係🙂"}</p>

        <div class="row" style="margin-top:14px;">
          <button class="big" id="home">🏠 回首頁</button>
          <button class="big ghost" id="retry">🔁 再考一次</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("home").onclick = () => renderHome();
  document.getElementById("retry").onclick = () => {
    buildSession5("quiz");
    renderQuiz();
  };
}

// ---------------------------
// Reward Screen
// ---------------------------
function renderReward(title, msg) {
  APP.innerHTML = `
    <div class="wrap">
      <div class="card center">
        <div class="trophy">🎉</div>
        <h2>${safeText(title)}</h2>
        <p class="sub">${safeText(msg)}</p>
        <div class="stat" style="margin-top:10px;">
          <div class="pill">⭐ 總星星 <strong>${progress.stars}</strong></div>
          <div class="pill">📦 Pack <strong>${safeText(progress.selectedPackId)}</strong></div>
        </div>
        <div class="row" style="margin-top:14px;">
          <button class="big" id="home">🏠 回首頁</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("home").onclick = () => renderHome();
}

// ---------------------------
// App Entry
// ---------------------------
boot().catch(err => {
  APP.innerHTML = `
    <div class="wrap">
      <div class="card">
        <h2>發生錯誤</h2>
        <p class="sub">請把下面文字截圖給爸爸/媽媽🙂</p>
        <pre class="err">${safeText(err?.stack ?? err)}</pre>
        <button class="big" onclick="location.reload()">重新整理</button>
      </div>
    </div>
  `;
});

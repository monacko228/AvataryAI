// ===== AvataryAI Client =====
// Стани аватара: idle → thinking (чекаємо Gemini) → speaking (грає TTS) → idle.
// Рот рухається під реальну гучність аудіо (AnalyserNode).
const API = SERVER_URL;

const LANG = (navigator.language || "en").toLowerCase().startsWith("uk") ? "uk" : "en";
const TXT = {
  uk: {
    back: "← на сайт", loading: "Завантажую кімнату…", placeholder: "Напиши щось…", mute: "Голос",
    hint: "Безкоштовно: до 20 повідомлень на добу.",
    connecting: "Підключення…", idle: "Онлайн", thinking: "Думає…", speaking: "Говорить…", offline: "Сервер офлайн",
    limit: "Ліміт 20 повідомлень на добу вичерпано. Повертайся завтра!",
    busy: "AI зараз перевантажений. Спробуй ще раз за хвилину.",
    neterr: "Не вдалося зв'язатися із сервером. Спробуй ще раз.",
    nowebgl: "Не вдалося запустити 3D. Увімкни апаратне прискорення в браузері.",
    welcome: "Привіт! Я Avatary — твій AI-аватар. Запитай мене про що завгодно: новини, погоду, ідеї для проєкту.",
    welcomeUser: "З поверненням, {name}! Про що поговоримо?",
    loginHint: "Увійди, щоб зберігати історію чату", hi: "Привіт,", clear: "Очистити історію", logout: "Вийти", delAcc: "Видалити акаунт",
    privacy: "Конфіденційність",
    hintGuest: "Гість: до 20 повідомлень на добу.", hintUser: "Сьогодні використано {used} із {limit}.",
    limitUser: "Денний ліміт ({limit}) вичерпано. Повертайся завтра!",
    loginFail: "Не вдалося увійти через Google. Спробуй ще раз.",
    expired: "Сесія завершилась. Увійди ще раз.",
    confirmClear: "Видалити всі чати? Це незворотно. Денний ліміт повідомлень при цьому не скидається.",
    newChat: "+ Новий чат", chatsBtn: "Чати", noChats: "Поки що немає чатів", clearAll: "Видалити всі чати",
    confirmDelChat: "Видалити цей чат?", delChat: "Видалити чат",
    confirmDelete: "Видалити акаунт і всю історію назавжди? Це незворотно.",
    deleted: "Акаунт і історію видалено.",
    customize: "Кастомізація", cRandom: "Випадково", cReset: "Скинути", cDone: "Готово",
    gDecor: "Декор", gDesk: "На столі", gExtra: "Додатково",
    modeOff: "Прибрати 3D", modeOn: "Повернути 3D", research: "Дослідження",
  },
  en: {
    back: "← to site", loading: "Loading the room…", placeholder: "Say something…", mute: "Voice",
    hint: "Free: up to 20 messages per day.",
    connecting: "Connecting…", idle: "Online", thinking: "Thinking…", speaking: "Speaking…", offline: "Server offline",
    limit: "Daily limit of 20 messages reached. Come back tomorrow!",
    busy: "The AI is busy right now. Please try again in a minute.",
    neterr: "Couldn't reach the server. Please try again.",
    nowebgl: "Couldn't start 3D. Enable hardware acceleration in your browser.",
    welcome: "Hi! I'm Avatary, your AI avatar. Ask me anything: news, weather, project ideas.",
    welcomeUser: "Welcome back, {name}! What shall we talk about?",
    loginHint: "Sign in to keep your chat history", hi: "Hi,", clear: "Clear history", logout: "Sign out", delAcc: "Delete account",
    privacy: "Privacy",
    hintGuest: "Guest: up to 20 messages per day.", hintUser: "Used {used} of {limit} today.",
    limitUser: "Daily limit ({limit}) reached. Come back tomorrow!",
    loginFail: "Couldn't sign in with Google. Please try again.",
    expired: "Session expired. Please sign in again.",
    confirmClear: "Delete all chats? This can't be undone. Your daily message limit is not reset.",
    newChat: "+ New chat", chatsBtn: "Chats", noChats: "No chats yet", clearAll: "Delete all chats",
    confirmDelChat: "Delete this chat?", delChat: "Delete chat",
    confirmDelete: "Delete your account and all history forever? This can't be undone.",
    deleted: "Account and history deleted.",
    customize: "Customize", cRandom: "Random", cReset: "Reset", cDone: "Done",
    gDecor: "Decor", gDesk: "On the desk", gExtra: "Extras",
    modeOff: "Remove 3D", modeOn: "Bring back 3D", research: "Research",
  },
}[LANG];

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

let token = null;
try { token = sessionStorage.getItem("avataryai_token"); } catch (e) {}
let sessionId = null;
try { sessionId = sessionStorage.getItem("avataryai_session"); } catch (e) {}
if (!sessionId) {
  sessionId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
  try { sessionStorage.setItem("avataryai_session", sessionId); } catch (e) {}
}
let userToken = null, userName = "", userLimit = 40;
let currentChatId = null, chatList = [];
try { userToken = localStorage.getItem("avataryai_user_token"); userName = localStorage.getItem("avataryai_user_name") || ""; } catch (e) {}
let muted = false;
try { muted = localStorage.getItem("avataryai_muted") === "1"; } catch (e) {}

// Режим: "avatar" (3D + голос) або "text" (звичайний чат). ?mode=text|avatar задає режим при вході (для рівномірного розподілу порядку в дослідженні)
let mode = "avatar";
try { if (localStorage.getItem("avataryai_mode") === "text") mode = "text"; } catch (e) {}
try {
  const mm = location.pathname.match(/man=([\w-]{1,20})/) || location.search.match(/[?&]man=([\w-]{1,20})/);
  if (mm && /^(text|t)$/i.test(mm[1])) mode = "text";      // /man=text — почати з текстового режиму
  if (mm && /^(avatar|a)$/i.test(mm[1])) mode = "avatar";
} catch (e) {}
try { const qm = new URLSearchParams(location.search).get("mode"); if (qm === "text" || qm === "avatar") mode = qm; } catch (e) {}

let busy = false;
let uiState = "connecting";

// ── Стан: інтерфейс + 3D-аватар ───────────────────────────────
function setState(s) {
  uiState = s;
  const st = $("status");
  if (st) st.dataset.s = s === "offline" ? "error" : s;
  const label = $("status-text");
  if (label) label.textContent = TXT[s] || s;
  if (window.AvatarScene) window.AvatarScene.setState(s === "thinking" || s === "speaking" ? s : "idle");
}
document.addEventListener("avatar-ready", () => { setState(uiState); if (mode === "text" && window.AvatarScene) window.AvatarScene.setPaused(true); });

function applyMode() {
  const text = mode === "text";
  document.documentElement.classList.toggle("text-mode", text);
  if (text) {
    stopSpeech();
    if (document.documentElement.classList.contains("customizing")) { const d = $("custom-done"); if (d) d.click(); }
  }
  if (window.AvatarScene && window.AvatarScene.setPaused) window.AvatarScene.setPaused(text);
  const b = $("mode-btn");
  if (b) { b.setAttribute("aria-pressed", text ? "true" : "false"); $("mode-label").textContent = text ? TXT.modeOn : TXT.modeOff; }
  try { localStorage.setItem("avataryai_mode", mode); } catch (e) {}
}

function addMessage(role, text) {
  const log = $("log");
  const div = document.createElement("div");
  div.className = "msg " + role;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// ── Авторизація ───────────────────────────────────────────────
async function getToken(force) {
  if (token && !force) return token;
  const r = await fetch(`${API}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: CLIENT_SECRET }),
  });
  if (!r.ok) throw new Error("auth " + r.status);
  token = (await r.json()).token;
  try { sessionStorage.setItem("avataryai_token", token); } catch (e) {}
  return token;
}

async function authed(path, body) {
  const call = async (t) => fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: JSON.stringify(body),
  });
  let r = await call(await getToken());
  if (r.status === 401) r = await call(await getToken(true));
  return r;
}

// ── Акаунт (Google) та історія ────────────────────────────────
function setHint(text) { const h = $("hint-text"); if (h) h.textContent = text; }

function renderAccount() {
  const logged = !!userToken;
  $("acc-guest").hidden = logged;
  $("acc-user").hidden = !logged;
  $("user-name").textContent = userName || "";
  if (!logged) setHint(TXT.hintGuest);
}

function saveUserSession(tok, name) {
  userToken = tok; userName = name || "";
  try {
    if (tok) { localStorage.setItem("avataryai_user_token", tok); localStorage.setItem("avataryai_user_name", userName); }
    else { localStorage.removeItem("avataryai_user_token"); localStorage.removeItem("avataryai_user_name"); }
  } catch (e) {}
}

function resetLog(withWelcome) {
  $("log").textContent = "";
  if (withWelcome) addMessage("ai", userToken && userName ? TXT.welcomeUser.replace("{name}", userName) : TXT.welcome);
}

function logout(expired) {
  saveUserSession(null, "");
  currentChatId = null; chatList = [];
  showPane(false);
  try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (e) {}
  renderAccount();
  resetLog(true);
  if (expired) addMessage("err", TXT.expired);
}

async function userFetch(method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: Object.assign({ Authorization: `Bearer ${userToken}` }, body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) logout(true);   // токен прострочений або акаунт видалено
  return r;
}

function showPane(open) {
  const pane = $("chats-pane");
  if (!pane) return;
  pane.hidden = !open;
  $("log").hidden = open;
  $("btn-chats").classList.toggle("on", open);
  $("btn-chats").setAttribute("aria-expanded", open ? "true" : "false");
}

function fmtDate(ts) {
  const d = new Date(ts * 1000), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(LANG, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(LANG, { day: "2-digit", month: "2-digit" });
}

function renderChats() {
  const list = $("chats-list");
  list.textContent = "";
  $("chats-empty").hidden = chatList.length > 0;
  $("chats-count").textContent = chatList.length ? "(" + chatList.length + ")" : "";
  chatList.forEach((c) => {
    const row = document.createElement("div");
    row.className = "chat-item" + (c.id === currentChatId ? " active" : "");
    const open = document.createElement("button");
    open.type = "button"; open.className = "open";
    const t = document.createElement("span"); t.className = "t"; t.textContent = c.title || "…";
    const d = document.createElement("span"); d.className = "d"; d.textContent = fmtDate(c.updated);
    open.append(t, d);
    open.addEventListener("click", () => openChat(c.id));
    const x = document.createElement("button");
    x.type = "button"; x.className = "x"; x.textContent = "×"; x.title = TXT.delChat; x.setAttribute("aria-label", TXT.delChat);
    x.addEventListener("click", () => deleteChat(c.id));
    row.append(open, x);
    list.appendChild(row);
  });
}

function rememberChat() {
  try { if (currentChatId) localStorage.setItem("avataryai_last_chat", String(currentChatId)); else localStorage.removeItem("avataryai_last_chat"); } catch (e) {}
}

async function loadChats() {
  const r = await userFetch("GET", "/me/chats");
  if (!r.ok) return false;
  chatList = (await r.json()).chats || [];
  renderChats();
  return true;
}

function newChat() {
  currentChatId = null;
  rememberChat();
  resetLog(true);
  renderChats();
  showPane(false);
  $("input").focus();
}

async function openChat(id) {
  const r = await userFetch("GET", "/me/chats/" + id);
  if (!r.ok) { if (userToken) { await loadChats(); newChat(); } return; }
  const d = await r.json();
  currentChatId = id;
  rememberChat();
  resetLog(false);
  d.messages.forEach((m) => addMessage(m.role === "user" ? "user" : "ai", m.text));
  renderChats();
  showPane(false);
}

async function deleteChat(id) {
  if (!confirm(TXT.confirmDelChat)) return;
  const r = await userFetch("DELETE", "/me/chats/" + id);
  if (!r.ok) return;
  await loadChats();
  if (id === currentChatId) newChat(); else renderChats();
}

async function loadAccount() {
  if (!userToken) return;
  try {
    const r = await userFetch("GET", "/me");
    if (!r.ok) return;
    const d = await r.json();
    if (d.name) { userName = d.name; try { localStorage.setItem("avataryai_user_name", userName); } catch (e) {} }
    userLimit = d.limit || userLimit;
    renderAccount();
    setHint(TXT.hintUser.replace("{used}", d.used).replace("{limit}", d.limit));
    if (!(await loadChats())) return;
    let last = null;
    try { last = parseInt(localStorage.getItem("avataryai_last_chat") || "", 10); } catch (e) {}
    const target = chatList.find((c) => c.id === last) || null;   // відновлюємо останній відкритий чат
    if (target) await openChat(target.id); else newChat();
  } catch (e) { /* залишаємо як є */ }
}

async function onGoogleCredential(resp) {
  try {
    const r = await fetch(`${API}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: resp.credential }),
    });
    if (!r.ok) throw new Error("login " + r.status);
    const d = await r.json();
    saveUserSession(d.token, d.name);
    renderAccount();
    await loadAccount();
  } catch (e) {
    addMessage("err", TXT.loginFail);
  }
}

function initGoogle() {
  if (typeof GOOGLE_CLIENT_ID === "undefined" || !GOOGLE_CLIENT_ID) { $("acc-guest").hidden = true; return; }
  const s = document.createElement("script");
  s.src = "https://accounts.google.com/gsi/client";
  s.async = true;
  s.onload = () => {
    try {
      google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGoogleCredential, auto_select: false });
      google.accounts.id.renderButton($("g-btn"), { theme: "filled_black", size: "medium", shape: "pill", text: "signin_with", locale: LANG });
    } catch (e) { $("acc-guest").hidden = true; }
  };
  s.onerror = () => { $("acc-guest").hidden = true; };   // напр. скрипт заблокований розширенням
  document.head.appendChild(s);
}

function initAccountButtons() {
  $("btn-logout").addEventListener("click", () => logout(false));
  $("btn-new").addEventListener("click", newChat);
  $("btn-chats").addEventListener("click", () => showPane($("chats-pane").hidden));
  $("btn-clear").addEventListener("click", async () => {
    if (!confirm(TXT.confirmClear)) return;
    const r = await userFetch("DELETE", "/me/chats");
    if (r.ok) { chatList = []; newChat(); const i = await userFetch("GET", "/me"); if (i.ok) { const d = await i.json(); setHint(TXT.hintUser.replace("{used}", d.used).replace("{limit}", d.limit)); } }
  });
  $("btn-delete").addEventListener("click", async () => {
    if (!confirm(TXT.confirmDelete)) return;
    const r = await userFetch("DELETE", "/me");
    if (r.ok) { logout(false); addMessage("ai", TXT.deleted); }
  });
}

// ── Кастомізація кімнати й персонажа ──────────────────────────
function initCustomizer() {
  const scene = window.AvatarScene;
  const panel = $("custom"), btn = $("custom-btn");
  if (!scene || !scene.catalog || !panel || !btn || btn.dataset.ready) return;
  btn.dataset.ready = "1";
  const lbl = (o) => (o.label && (o.label[LANG] || o.label.uk)) || "";
  const GROUP_HEAD = { room: TXT.gDecor, furniture: TXT.gDesk, accessories: TXT.gExtra };
  let tab = scene.catalog[0].id;

  function renderTabs() {
    const box = $("custom-tabs");
    box.textContent = "";
    scene.catalog.forEach((g) => {
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", g.id === tab ? "true" : "false");
      b.textContent = g.title[LANG] || g.title.uk;
      b.addEventListener("click", () => { tab = g.id; renderTabs(); renderBody(); $("custom-body").scrollTop = 0; });
      box.appendChild(b);
    });
  }

  function pick(key, value) { scene.setLook({ [key]: value }); renderBody(); }

  function renderBody() {
    const body = $("custom-body"), look = scene.getLook(), g = scene.catalog.find((x) => x.id === tab);
    const keep = body.scrollTop;
    body.textContent = "";
    const block = (label) => {
      const o = document.createElement("div"); o.className = "opt";
      const l = document.createElement("div"); l.className = "opt-label"; l.textContent = label;
      const c = document.createElement("div"); c.className = "opt-ctl";
      o.append(l, c); body.appendChild(o); return c;
    };
    let toggles = null;
    g.items.forEach((it) => {
      if (it.type === "toggle") {
        if (!toggles) toggles = block(GROUP_HEAD[g.id] || TXT.gExtra);
        const b = document.createElement("button");
        b.type = "button"; b.className = "chip"; b.textContent = lbl(it);
        b.setAttribute("aria-pressed", look[it.key] ? "true" : "false");
        b.addEventListener("click", () => pick(it.key, !look[it.key]));
        toggles.appendChild(b);
        return;
      }
      const ctl = block(lbl(it));
      it.options.forEach((o) => {
        const b = document.createElement("button");
        b.type = "button"; b.setAttribute("aria-pressed", look[it.key] === o.id ? "true" : "false");
        if (o.color !== undefined) {
          b.className = "sw" + (o.color ? "" : " none");
          if (o.color) b.style.background = o.color;
          b.title = lbl(o); b.setAttribute("aria-label", lbl(o));
        } else { b.className = "chip"; b.textContent = lbl(o); }
        b.addEventListener("click", () => pick(it.key, o.id));
        ctl.appendChild(b);
      });
    });
    body.scrollTop = keep;
  }

  function open(on) {
    panel.hidden = !on;
    document.documentElement.classList.toggle("customizing", on);
    btn.setAttribute("aria-expanded", on ? "true" : "false");
    if (on) { renderTabs(); renderBody(); }
  }
  btn.addEventListener("click", () => open(panel.hidden));
  $("custom-close").addEventListener("click", () => open(false));
  $("custom-done").addEventListener("click", () => open(false));
  $("custom-reset").addEventListener("click", () => { scene.resetLook(); renderBody(); });
  $("custom-random").addEventListener("click", () => { scene.randomLook(); renderBody(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) open(false); });
}

// ── Озвучка + синхронізація рота ──────────────────────────────
let audioCtx = null;
function ensureAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function cleanForSpeech(text) {
  return text.replace(/```[\s\S]*?```/g, " ").replace(/[*_#`>~|]/g, "").replace(/\s+/g, " ").trim();
}

// Озвучка частинами: перший шматок короткий, щоб звук стартував швидко,
// решта синтезується, поки грає попередня. Так довга відповідь не змушує чекати.
const SPEECH_FIRST = 140, SPEECH_REST = 260, SPEECH_MAX_CHARS = 1800;

function splitSpeech(text) {
  const parts = [];
  const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g) || [text];
  const pushLong = (str, max) => {   // дуже довге речення ріжемо по комах чи пробілах
    let rest = str.trim();
    while (rest.length > max) {
      let cut = Math.max(rest.lastIndexOf(", ", max), rest.lastIndexOf("; ", max), rest.lastIndexOf(": ", max));
      if (cut < max * 0.4) cut = rest.lastIndexOf(" ", max);
      if (cut < 1) cut = max;
      parts.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    return rest;
  };
  let cur = "";
  for (const sen of sentences) {
    const max = parts.length ? SPEECH_REST : SPEECH_FIRST;
    if (cur && (cur + sen).length > max) { parts.push(cur.trim()); cur = ""; }
    const lim = parts.length ? SPEECH_REST : SPEECH_FIRST;
    cur += sen.length > lim ? pushLong(cur + sen, lim) : sen;
    if (sen.length > lim) cur = cur.trim() ? cur : "";
  }
  if (cur.trim()) parts.push(cur.trim());
  const out = []; let total = 0;
  for (const c of parts) { if (c && total + c.length <= SPEECH_MAX_CHARS) { out.push(c); total += c.length; } else if (c && !out.length) { out.push(c.slice(0, SPEECH_MAX_CHARS)); break; } else break; }
  return out;
}

let player = null, analyser = null, meterBuf = null, meterRaf = 0, speakId = 0, curDone = null;

function ensurePlayer() {
  if (player) return player;
  player = new Audio();
  try {
    const ctx = ensureAudio();
    if (ctx) {
      const src = ctx.createMediaElementSource(player);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser); analyser.connect(ctx.destination);
      meterBuf = new Uint8Array(analyser.fftSize);
    }
  } catch (e) { analyser = null; }
  return player;
}

function meterTick() {
  if (!analyser) return;
  analyser.getByteTimeDomainData(meterBuf);
  let sum = 0;
  for (let i = 0; i < meterBuf.length; i++) { const v = (meterBuf[i] - 128) / 128; sum += v * v; }
  const rms = Math.sqrt(sum / meterBuf.length);
  if (window.AvatarScene) window.AvatarScene.setMouth(clamp((rms - 0.015) * 7, 0, 1));
  meterRaf = requestAnimationFrame(meterTick);
}

function stopSpeech() {   // для кнопки «без звуку»
  speakId++;
  if (player) { try { player.pause(); } catch (e) {} }
  if (curDone) curDone();   // розблоковуємо цикл відтворення
}

async function fetchSpeechUrl(chunk) {
  const r = await authed("/tts", { text: chunk });
  if (!r.ok) throw new Error("tts " + r.status);
  return URL.createObjectURL(await r.blob());
}

function playUrl(audio, url, myId, onStart) {
  return new Promise((resolve) => {
    const done = () => { audio.onplaying = audio.onended = audio.onerror = null; if (curDone === done) curDone = null; URL.revokeObjectURL(url); resolve(); };
    curDone = done;
    audio.onplaying = () => { if (myId !== speakId) return; onStart(); };
    audio.onended = done;
    audio.onerror = done;
    audio.src = url;
    audio.play().catch(done);
  });
}

/** onStart викликається, коли звук справді пішов (або одразу, якщо озвучки не буде). */
async function playTTS(text, onStart = () => {}) {
  const speech = cleanForSpeech(text);
  const chunks = (muted || mode === "text" || !speech) ? [] : splitSpeech(speech);
  if (!chunks.length) { onStart(); setState("idle"); return; }
  const myId = ++speakId;
  let started = false;
  const begin = () => { if (started) return; started = true; setState("speaking"); onStart(); cancelAnimationFrame(meterRaf); meterTick(); };
  const jobs = new Array(chunks.length);
  let next = 0;
  const kick = () => {            // не більше двох запитів одночасно
    if (next >= chunks.length) return;
    const i = next++;
    jobs[i] = fetchSpeechUrl(chunks[i]);
    jobs[i].then(kick, kick);
  };
  kick(); kick();
  try {
    const audio = ensurePlayer();
    for (let i = 0; i < chunks.length; i++) {
      const url = await jobs[i];
      if (myId !== speakId) { URL.revokeObjectURL(url); break; }
      await playUrl(audio, url, myId, begin);
    }
  } catch (e) { /* озвучка не вдалась: текст усе одно буде показано */ }
  finally {
    cancelAnimationFrame(meterRaf);
    if (window.AvatarScene) window.AvatarScene.setMouth(0);
    jobs.forEach((j) => j && j.then((u) => { try { URL.revokeObjectURL(u); } catch (e) {} }, () => {}));
    setState("idle");
  }
}

// ── Чат ───────────────────────────────────────────────────────
async function sendMessage(text) {
  setState("thinking");
  const t0 = performance.now(), sentMode = mode, sentVoice = mode === "avatar" && !muted;
  try {
    const asUser = !!userToken;
    const r = asUser
      ? await userFetch("POST", "/me/chat", { message: text, chat_id: currentChatId })
      : await authed("/chat", { message: text, session_id: sessionId });
    if (asUser && !userToken) { setState("idle"); return; }   // сесія завершилась, logout() уже показав повідомлення
    if (r.status === 429) { addMessage("err", asUser ? TXT.limitUser.replace("{limit}", userLimit) : TXT.limit); setState("idle"); return; }
    if (r.status === 503) { addMessage("err", TXT.busy); setState("idle"); return; }
    if (asUser && r.status === 404) { await loadChats(); newChat(); addMessage("err", TXT.neterr); setState("idle"); return; }
    if (!r.ok) throw new Error("chat " + r.status);
    const data = await r.json();
    const reply = data.reply || "…";
    const tReply = Math.round(performance.now() - t0);
    if (asUser && r.ok && data.chat_id) {
      const isNew = currentChatId !== data.chat_id;
      currentChatId = data.chat_id; rememberChat();
      if (isNew) await loadChats(); else { const c = chatList.find((x) => x.id === data.chat_id); if (c) c.updated = Math.floor(Date.now() / 1000); chatList.sort((a, b) => b.updated - a.updated); renderChats(); }
    }
    if (asUser && data.limit) {
      userLimit = data.limit;
      setHint(TXT.hintUser.replace("{used}", data.used).replace("{limit}", data.limit));
    }
    // Текст і звук стартують разом: поки готується перший шматок озвучки, аватар «думає», а відповідь ще не показана
    let shown = false, tShown = 0;
    const show = () => { if (!shown) { shown = true; tShown = Math.round(performance.now() - t0); addMessage("ai", reply.replace(/\*\*(.*?)\*\*/g, "$1")); } };
    await playTTS(reply, show);
    show();                        // на випадок помилки озвучки
    if (window.Research) window.Research.onMessage({ mode: sentMode, voice: sentVoice, t_reply: tReply, t_shown: tShown, chars: reply.length });
  } catch (e) {
    addMessage("err", TXT.neterr);
    setState("offline");
  }
}

async function submit(ev) {
  ev.preventDefault();
  const input = $("input");
  const text = input.value.trim();
  if (!text || busy) return;
  ensureAudio();                    // розблокувати звук у відповідь на жест користувача
  input.value = "";
  addMessage("user", text);
  busy = true; $("send").disabled = true;
  try { await sendMessage(text); }
  finally { busy = false; $("send").disabled = false; input.focus(); }
}

function applyI18n() {
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-i18n]").forEach((el) => { if (TXT[el.dataset.i18n]) el.textContent = TXT[el.dataset.i18n]; });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = TXT[el.dataset.i18nPh]; });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = TXT[el.dataset.i18nTitle]; });
}

function init() {
  applyI18n();
  setState("connecting");
  addMessage("ai", userToken && userName ? TXT.welcomeUser.replace("{name}", userName) : TXT.welcome);
  renderAccount();
  initAccountButtons();
  initGoogle();
  if (window.AvatarScene) initCustomizer(); else document.addEventListener("avatar-ready", initCustomizer);
  loadAccount();

  const mute = $("mute");
  mute.setAttribute("aria-pressed", muted ? "true" : "false");
  mute.addEventListener("click", () => {
    muted = !muted;
    if (muted) stopSpeech();
    mute.setAttribute("aria-pressed", muted ? "true" : "false");
    try { localStorage.setItem("avataryai_muted", muted ? "1" : "0"); } catch (e) {}
  });

  $("form").addEventListener("submit", submit);

  applyMode();
  $("mode-btn").addEventListener("click", () => {
    mode = mode === "text" ? "avatar" : "text";
    applyMode();
    if (window.Research) window.Research.onModeChange(mode);
  });
  if (window.Research) window.Research.init({ getMode: () => mode });

  if (document.documentElement.classList.contains("scene-failed")) $("loader-text").textContent = TXT.nowebgl;
  new MutationObserver(() => {
    if (document.documentElement.classList.contains("scene-failed")) $("loader-text").textContent = TXT.nowebgl;
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  // Перевірка сервера
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  fetch(`${API}/health`, { signal: ctl.signal })
    .then((r) => r.json())
    .then(() => { setState("idle"); getToken().catch(() => {}); })
    .catch(() => setState("offline"))
    .finally(() => clearTimeout(timer));
}

document.addEventListener("DOMContentLoaded", init);

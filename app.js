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
let muted = false;
try { muted = localStorage.getItem("avataryai_muted") === "1"; } catch (e) {}
 
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
document.addEventListener("avatar-ready", () => setState(uiState));
 
function addMessage(role, text) {
  const log = $("log");
  const div = document.createElement("div");
  div.className = "msg " + role;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

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
 
async function playTTS(text) {
  const speech = cleanForSpeech(text);
  if (muted || !speech) { setState("idle"); return; }
  let url = null, raf = 0;
  const finish = () => {
    cancelAnimationFrame(raf);
    if (window.AvatarScene) window.AvatarScene.setMouth(0);
    if (url) URL.revokeObjectURL(url);
    setState("idle");
  };
  try {
    const r = await authed("/tts", { text: speech });
    if (!r.ok) throw new Error("tts " + r.status);
    url = URL.createObjectURL(await r.blob());
    const audio = new Audio(url);
 
    let analyser = null, buf = null;
    try {
      const ctx = ensureAudio();
      if (ctx) {
        const src = ctx.createMediaElementSource(audio);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        analyser.connect(ctx.destination);
        buf = new Uint8Array(analyser.fftSize);
      }
    } catch (e) { analyser = null; }
 
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / buf.length);
      if (window.AvatarScene) window.AvatarScene.setMouth(clamp((rms - 0.015) * 7, 0, 1));
      raf = requestAnimationFrame(tick);
    };
    audio.onplaying = () => { setState("speaking"); if (analyser) tick(); };
    audio.onended = finish;
    audio.onerror = finish;
    await audio.play();
  } catch (e) {
    finish();
  }
}

async function sendMessage(text) {
  setState("thinking");
  try {
    const r = await authed("/chat", { message: text, session_id: sessionId });
    if (r.status === 429) { addMessage("err", TXT.limit); setState("idle"); return; }
    if (r.status === 503) { addMessage("err", TXT.busy); setState("idle"); return; }
    if (!r.ok) throw new Error("chat " + r.status);
    const reply = (await r.json()).reply || "…";
    addMessage("ai", reply.replace(/\*\*(.*?)\*\*/g, "$1"));
    await playTTS(reply);       
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
  ensureAudio();          
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
  addMessage("ai", TXT.welcome);
 
  const mute = $("mute");
  mute.setAttribute("aria-pressed", muted ? "true" : "false");
  mute.addEventListener("click", () => {
    muted = !muted;
    mute.setAttribute("aria-pressed", muted ? "true" : "false");
    try { localStorage.setItem("avataryai_muted", muted ? "1" : "0"); } catch (e) {}
  });
 
  $("form").addEventListener("submit", submit);
 
  if (document.documentElement.classList.contains("scene-failed")) $("loader-text").textContent = TXT.nowebgl;
  new MutationObserver(() => {
    if (document.documentElement.classList.contains("scene-failed")) $("loader-text").textContent = TXT.nowebgl;
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
 
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  fetch(`${API}/health`, { signal: ctl.signal })
    .then((r) => r.json())
    .then(() => { setState("idle"); getToken().catch(() => {}); })
    .catch(() => setState("offline"))
    .finally(() => clearTimeout(timer));
}
 
document.addEventListener("DOMContentLoaded", init);
 

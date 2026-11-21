// ===== AvataryAI: учасницьке дослідження (МАН) =====
// Лише за згодою. Зберігається: випадковий pid, режим (аватар/текст), час відповіді, довжина відповіді, тип пристрою, відповіді анкети.
// НЕ зберігається: тексти повідомлень, IP, ім'я, id акаунта.
(function () {
  // Дослідження вмикається лише за посиланням avataryai.pp.ua/man=<код> (або ?man=<код>); ?man=off вимикає
  let code = "";
  try {
    const m = location.pathname.match(/man=([\w-]{1,20})/) || location.search.match(/[?&]man=([\w-]{1,20})/);
    if (m) { if (m[1] === "off") localStorage.removeItem("avataryai_man"); else localStorage.setItem("avataryai_man", m[1]); }
    code = localStorage.getItem("avataryai_man") || "";
  } catch (e) {}
  if (!code) {
    window.Research = { init() { const l = document.getElementById("research-link"); if (l) { l.hidden = true; const n = l.nextSibling; if (n && n.nodeType === 3) n.textContent = ""; } }, onMessage() {}, onModeChange() {} };
    return;
  }
  const UK = LANG === "uk";
  const T = UK ? {
    cTitle: "Дослідження (шкільний проєкт МАН)",
    cText: "Ми порівнюємо чат з 3D-аватаром і звичайний текстовий чат. Якщо погодишся, сайт анонімно записуватиме швидкість відповідей і запропонує коротку анкету. Тексти повідомлень, ім'я та IP не зберігаються. Якщо тобі менше 14 років, спитай дозволу в дорослих.",
    yes: "Погоджуюсь", no: "Ні, дякую", more: "Детальніше",
    iTitle: "Про дослідження",
    iIntro: "Це наукова робота учня: чи змінює 3D-аватар із голосом досвід спілкування порівняно зі звичайним текстовим чатом. Участь добровільна, у будь-який момент можна вийти й видалити свої дані.",
    iCollect: "Що записується (лише за згоди)",
    iList: ["випадковий номер учасника (створюється в твоєму браузері, не пов'язаний ні з ким);", "режим (з аватаром чи текстовий) і чи був увімкнений голос;", "скільки мілісекунд минуло до відповіді та до появи тексту, довжина відповіді, тип пристрою (комп'ютер/телефон);", "відповіді анкети (оцінки 1–5, вік у діапазоні, коментар за бажанням)."],
    iNot: "Не записуються: тексти твоїх повідомлень і відповідей у дослідженні, IP-адреса, ім'я, пошта, акаунт Google. Дані акаунтів у дослідженні не використовуються.",
    iStatus: ["Зараз: участь увімкнена.", "Зараз: участь вимкнена."],
    iOn: "Взяти участь", iOff: "Вимкнути участь", iForget: "Видалити мої дані", iSurvey: "Пройти анкету", iClose: "Закрити",
    iForgot: "Дані видалено. Участь вимкнено.", iSurveyDone: "Дякуємо, анкету вже заповнено.",
    invite: "Ти спробував(-ла) обидва режими. Допоможи дослідженню: анкета займе близько хвилини.", invBtn: "Відкрити анкету", invLater: "Пізніше",
    sTitle: "Анкета", sIntro: "Оціни, наскільки ти згоден(-на) з твердженнями окремо для кожного режиму: 1 — зовсім ні, 5 — повністю так.",
    sAv: "З аватаром (3D + голос)", sTx: "Тільки текст",
    crit: { usab: "Спілкуватись було зручно", pleas: "Спілкування було приємним", trust: "Я довіряю відповідям", engage: "Мені було цікаво, не хотілося відволікатись", again: "Я б скористався(-лась) цим варіантом ще раз" },
    s1: "1 — зовсім ні", s5: "5 — повністю",
    age: "Вік", ageOpts: [["<14", "до 14"], ["14-15", "14–15"], ["16-17", "16–17"], ["18-24", "18–24"], ["25+", "25+"]],
    exp: "Як часто ти користуєшся AI-чатботами?", expOpts: [[1, "ніколи"], [2, "кілька разів"], [3, "щомісяця"], [4, "щодня"]],
    pref: "Що тобі сподобалось більше?", prefOpts: [["avatar", "з аватаром"], ["text", "текстовий чат"], ["same", "однаково"]],
    comment: "Коментар (необов'язково). Не пиши особистих даних.",
    send: "Надіслати", cancel: "Скасувати", errIncomplete: "Заповни, будь ласка, всі оцінки.", errNet: "Не вдалося надіслати. Спробуй ще раз.",
    thanks: "Дякуємо! Твоя відповідь допоможе дослідженню.",
  } : {
    cTitle: "Research (school science project)",
    cText: "We're comparing a chat with a 3D avatar to a plain text chat. If you agree, the site will anonymously record response speed and offer a short survey. Message texts, name and IP are not stored. If you're under 14, ask an adult first.",
    yes: "I agree", no: "No, thanks", more: "Details",
    iTitle: "About the research",
    iIntro: "This is a student's science project: does a 3D avatar with voice change the chat experience compared to a plain text chat? Taking part is voluntary; you can leave and delete your data at any time.",
    iCollect: "What is recorded (only if you agree)",
    iList: ["a random participant number (created in your browser, linked to no one);", "the mode (avatar or text) and whether voice was on;", "milliseconds until the reply and until the text appeared, reply length, device type (desktop/mobile);", "survey answers (1–5 ratings, an age range, an optional comment)."],
    iNot: "Not recorded: the texts of your messages and replies in the research, IP address, name, email, Google account. Account data is not used in the research.",
    iStatus: ["Status: participating.", "Status: not participating."],
    iOn: "Participate", iOff: "Stop participating", iForget: "Delete my data", iSurvey: "Take the survey", iClose: "Close",
    iForgot: "Data deleted. Participation turned off.", iSurveyDone: "Thanks, the survey is already filled in.",
    invite: "You've tried both modes. Please help the research: the survey takes about a minute.", invBtn: "Open survey", invLater: "Later",
    sTitle: "Survey", sIntro: "Rate how much you agree with each statement separately for each mode: 1 = not at all, 5 = completely.",
    sAv: "With avatar (3D + voice)", sTx: "Text only",
    crit: { usab: "It was easy to chat", pleas: "The chat felt pleasant", trust: "I trust the answers", engage: "I was engaged and not distracted", again: "I would use this option again" },
    s1: "1 = not at all", s5: "5 = completely",
    age: "Age", ageOpts: [["<14", "under 14"], ["14-15", "14–15"], ["16-17", "16–17"], ["18-24", "18–24"], ["25+", "25+"]],
    exp: "How often do you use AI chatbots?", expOpts: [[1, "never"], [2, "a few times"], [3, "monthly"], [4, "daily"]],
    pref: "Which did you like more?", prefOpts: [["avatar", "with avatar"], ["text", "text chat"], ["same", "the same"]],
    comment: "Comment (optional). Don't write personal data.",
    send: "Submit", cancel: "Cancel", errIncomplete: "Please fill in all ratings.", errNet: "Couldn't send. Please try again.",
    thanks: "Thank you! Your answers will help the research.",
  };
  const CRIT = ["usab", "pleas", "trust", "engage", "again"];
  const K = { consent: "avataryai_research", pid: "avataryai_pid", count: "avataryai_rcount", first: "avataryai_rfirst", done: "avataryai_rdone" };
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const del = (k) => { try { localStorage.removeItem(k); } catch (e) {} };
  const $ = (id) => document.getElementById(id);
  const el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    kids.flat().forEach((c) => e.append(c));
    return e;
  };
  let ctx = null, invited = false;

  const joined = () => get(K.consent) === "yes";
  function pid() {
    let p = get(K.pid);
    if (!/^[0-9a-f]{32}$/.test(p || "")) {
      const b = new Uint8Array(16); crypto.getRandomValues(b);
      p = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); set(K.pid, p);
    }
    return p;
  }
  const counts = () => { try { return Object.assign({ avatar: 0, text: 0 }, JSON.parse(get(K.count) || "{}")); } catch (e) { return { avatar: 0, text: 0 }; } };
  const device = () => (matchMedia("(max-width: 860px)").matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile" : "desktop");

  async function post(path, body) {
    try { const r = await authed(path, body); return r; } catch (e) { return null; }
  }
  function send(ev) { if (joined()) post("/r/event", Object.assign({ pid: pid(), device: device() }, ev)); }

  // ── модальні вікна ──
  function overlay(content) {
    closeOverlay();
    const o = el("div", { class: "r-overlay", id: "r-overlay", role: "dialog", "aria-modal": "true" }, el("div", { class: "r-modal" }, content));
    o.addEventListener("mousedown", (e) => { if (e.target === o) closeOverlay(); });
    document.body.append(o);
    return o;
  }
  function closeOverlay() { const o = $("r-overlay"); if (o) o.remove(); }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeOverlay(); });

  function showConsent() {
    if ($("consent") || get(K.consent)) return;
    const b = el("div", { id: "consent", role: "region", "aria-label": T.cTitle },
      el("b", {}, T.cTitle), el("p", {}, T.cText),
      el("div", { class: "row" },
        el("button", { class: "r-btn primary", type: "button", onclick: () => decide("yes") }, T.yes),
        el("button", { class: "r-btn", type: "button", onclick: () => decide("no") }, T.no),
        el("a", { onclick: showInfo }, T.more)));
    document.body.append(b);
  }
  function decide(v) {
    set(K.consent, v); const c = $("consent"); if (c) c.remove();
    if (v === "yes") { pid(); sceneEvent(); }
    closeOverlay();
  }
  function showInfo(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    const on = joined();
    const status = el("p", {}, T.iStatus[on ? 0 : 1]);
    const msg = el("p", { class: "r-err", style: "color:var(--ok)" });
    const acts = el("div", { class: "r-actions" },
      el("button", { class: "r-btn", type: "button", onclick: closeOverlay }, T.iClose),
      on ? el("button", { class: "r-btn danger", type: "button", onclick: forget }, T.iForget) : "",
      el("button", { class: "r-btn", type: "button", onclick: () => decide(on ? "no" : "yes") }, on ? T.iOff : T.iOn),
      on ? el("button", { class: "r-btn primary", type: "button", onclick: () => { if (get(K.done)) msg.textContent = T.iSurveyDone; else showSurvey(); } }, T.iSurvey) : "");
    overlay([el("h2", {}, T.iTitle), el("p", {}, T.iIntro), el("h3", {}, T.iCollect), el("ul", {}, T.iList.map((x) => el("li", {}, x))), el("p", {}, T.iNot), status, msg, acts]);
  }
  async function forget() {
    if (get(K.pid)) await post("/r/forget", { pid: get(K.pid) });
    [K.pid, K.count, K.first, K.done].forEach(del); set(K.consent, "no");
    const o = $("r-overlay"); if (o) { overlay([el("h2", {}, T.iTitle), el("p", {}, T.iForgot), el("div", { class: "r-actions" }, el("button", { class: "r-btn primary", type: "button", onclick: closeOverlay }, T.iClose))]); }
  }

  // ── запрошення до анкети ──
  function maybeInvite() {
    if (invited || !joined() || get(K.done) || $("invite")) return;
    const c = counts(); if (c.avatar < 2 || c.text < 2) return;
    invited = true;
    const bar = el("div", { id: "invite" }, el("span", {}, T.invite),
      el("button", { class: "r-btn primary", type: "button", onclick: () => { bar.remove(); showSurvey(); } }, T.invBtn),
      el("button", { class: "r-btn", type: "button", onclick: () => bar.remove() }, T.invLater));
    $("form").before(bar);
  }

  // ── анкета ──
  function showSurvey() {
    const form = el("form", { novalidate: "" });
    const err = el("p", { class: "r-err", role: "alert" });
    const block = (key, title) => el("fieldset", {}, el("legend", {}, title),
      CRIT.map((c) => el("div", { class: "r-q" }, el("div", {}, T.crit[c]),
        el("div", { class: "r-scale" }, [1, 2, 3, 4, 5].map((n) => el("label", {}, el("input", { type: "radio", name: key + "_" + c, value: String(n) }), el("span", {}, String(n))))),
        el("div", { class: "r-scale-hint" }, el("span", {}, T.s1), el("span", {}, T.s5)))));
    const opts = (name, list) => el("div", { class: "r-opts" }, list.map(([v, t]) => el("label", {}, el("input", { type: "radio", name, value: String(v) }), el("span", {}, t))));
    const ta = el("textarea", { name: "comment", maxlength: "500", "aria-label": T.comment });
    form.append(el("h2", {}, T.sTitle), el("p", {}, T.sIntro), block("av", T.sAv), block("tx", T.sTx),
      el("h3", {}, T.pref), opts("pref", T.prefOpts), el("h3", {}, T.age), opts("age", T.ageOpts), el("h3", {}, T.exp), opts("exp", T.expOpts),
      el("h3", {}, T.comment), ta, err,
      el("div", { class: "r-actions" }, el("button", { class: "r-btn", type: "button", onclick: closeOverlay }, T.cancel), el("button", { class: "r-btn primary", type: "submit" }, T.send)));
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); err.textContent = "";
      const v = (n) => { const x = form.querySelector(`input[name="${n}"]:checked`); return x ? x.value : ""; };
      const rate = (k) => { const o = {}; for (const c of CRIT) { const x = parseInt(v(k + "_" + c), 10); if (!x) return null; o[c] = x; } return o; };
      const av = rate("av"), tx = rate("tx");
      if (!av || !tx || !v("pref")) { err.textContent = T.errIncomplete; return; }
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
      const r = await post("/r/survey", { pid: pid(), av, tx, pref: v("pref"), age: v("age"), ai_exp: parseInt(v("exp"), 10) || null, comment: ta.value, order_first: get(K.first) || "" });
      if (r && r.ok) { set(K.done, "1"); const bar = $("invite"); if (bar) bar.remove(); overlay([el("h2", {}, T.sTitle), el("p", {}, T.thanks), el("div", { class: "r-actions" }, el("button", { class: "r-btn primary", type: "button", onclick: closeOverlay }, T.iClose))]); }
      else { btn.disabled = false; err.textContent = T.errNet; }
    });
    overlay(form);
  }

  // ── час завантаження 3D (один раз за відкриття сторінки) ──
  let sceneSent = false, sceneMs = null;
  document.addEventListener("avatar-ready", () => { sceneMs = Math.round(performance.now()); sceneEvent(); });
  function sceneEvent() {
    if (sceneSent || sceneMs === null || !joined()) return;
    sceneSent = true; send({ kind: "scene", mode: ctx ? ctx.getMode() : "avatar", t_shown: sceneMs });
  }

  window.Research = {
    init(c) {
      ctx = c;
      const link = $("research-link"); if (link) link.addEventListener("click", showInfo);
      if (!get(K.consent)) setTimeout(showConsent, 1200);
    },
    onMessage(m) {
      if (!joined()) return;
      const cnt = counts(); cnt[m.mode] = (cnt[m.mode] || 0) + 1; set(K.count, JSON.stringify(cnt));
      if (!get(K.first)) set(K.first, m.mode);
      send({ kind: "msg", mode: m.mode, voice: m.voice, t_reply: m.t_reply, t_shown: m.t_shown, chars: m.chars });
      maybeInvite();
    },
    onModeChange() {},
  };
})();

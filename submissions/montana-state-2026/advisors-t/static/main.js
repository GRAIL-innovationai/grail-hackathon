/* Campus Advisor Beta — frontend: accounts (JWT), saved conversations, chat, transcripts, theming. */
"use strict";

// Same origin when FastAPI serves this folder. Set window.CAMPUS_ADVISOR_API_BASE before this
// script loads to point somewhere else (e.g. "http://127.0.0.1:8000").
const API_BASE = window.CAMPUS_ADVISOR_API_BASE || "";
const REQUEST_TIMEOUT_MS = 90000;
const MAX_HISTORY = 20;          // messages sent to the advisor per request
const TOKEN_KEY = "campus-advisor-token";
const LANGUAGE_KEY = "campus-advisor-language";
const SIDEBAR_KEY = "campus-advisor-history-open";
const UNIVERSITY_KEY = "campus-advisor-university";

const $ = (id) => document.getElementById(id);
const log = $("chat-log");
const form = $("chat-form");
const input = $("message-input");
const sendBtn = $("send-btn");
const statusEl = $("status");
const suggestions = $("suggestions");
const languageSel = $("language");
const uploadBtn = $("upload-btn");
const fileInput = $("transcript-input");

const state = {
  universities: [],         // from /api/universities (public)
  university: null,         // id chosen on the picker
  user: null,               // {id, email, created_at} when signed in
  messages: [],             // active conversation [{role, content}]
  sessionId: null,          // id of the saved conversation, once it exists
  sessions: [],             // summaries for the sidebar
  transcript: null,         // JSON from /api/transcript (memory only)
  busy: false,
  controller: null,
};

/* =====================================================================
   Storage helpers (storage can be blocked: never let that break the page)
   ===================================================================== */

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* blocked */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* blocked */ } },
};
const getToken = () => store.get(TOKEN_KEY);
const setToken = (t) => store.set(TOKEN_KEY, t);
const clearToken = () => store.remove(TOKEN_KEY);

/* =====================================================================
   API: every request goes through apiFetch, which adds the Bearer token
   ===================================================================== */

class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/** Turn FastAPI error bodies (string or validation list) into one readable sentence. */
function errorMessage(data, status) {
  const d = data && data.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d.length) {
    return d.map((e) => String(e.msg || "").replace(/^Value error, /, "")).filter(Boolean).join(" ")
      || "Check the fields and try again.";
  }
  return `The server answered with an error (${status}).`;
}

async function apiFetch(path, { method = "GET", json, body, headers = {}, signal, auth = true, timeout = REQUEST_TIMEOUT_MS } = {}) {
  const token = getToken();
  const h = { ...headers };
  if (auth && token) h.Authorization = `Bearer ${token}`;
  if (json !== undefined) { h["Content-Type"] = "application/json"; body = JSON.stringify(json); }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort("timeout"), timeout);
  const onAbort = () => ctl.abort(signal.reason);
  signal?.addEventListener("abort", onAbort, { once: true });

  let response;
  try {
    response = await fetch(API_BASE + path, { method, headers: h, body, signal: ctl.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new ApiError(ctl.signal.reason === "timeout" ? "The server took too long to answer. Try again." : "Request cancelled.", 0);
    }
    throw new ApiError("Can't reach the advisor server. Check that it is running (uvicorn main:app).", 0);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (response.status === 204) return null;
  let data = null;
  try { data = await response.json(); } catch { /* not JSON */ }

  if (response.status === 401 && auth) {
    handleSignedOut("Your session has ended. Sign in again to keep going.");
    throw new ApiError(errorMessage(data, 401), 401);
  }
  if (!response.ok) throw new ApiError(errorMessage(data, response.status), response.status);
  return data;
}

const api = {
  register: (email, password) => apiFetch("/api/auth/register", { method: "POST", json: { email, password }, auth: false }),
  token: (email, password) => apiFetch("/api/auth/token", {
    method: "POST", auth: false,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: email, password }),
  }),
  me: () => apiFetch("/api/auth/me"),
  universities: () => apiFetch("/api/universities", { auth: false }),
  listSessions: () => apiFetch("/api/sessions"),
  getSession: (id) => apiFetch(`/api/sessions/${encodeURIComponent(id)}`),
  saveSession: (payload) => apiFetch("/api/sessions", { method: "POST", json: payload }),
  deleteSession: (id) => apiFetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  chat: (payload, signal) => apiFetch("/api/chat", { method: "POST", json: payload, signal }),
  transcript: (file, signal) => {
    const fd = new FormData();
    fd.append("file", file);
    return apiFetch("/api/transcript", { method: "POST", body: fd, signal });
  },
};

/* =====================================================================
   University theming (colors come from each university's catalog.json via /api/universities)
   ===================================================================== */

const DEFAULT_THEME = { id: "default", name: "Your university advisor" };
let currentUniversity = DEFAULT_THEME.id;
const UNIVERSITY_TAG = /(?:<!--\s*university:\s*([a-z0-9-]+)\s*-->|\[university:\s*([a-z0-9-]+)\])/i;
const uniById = (id) => state.universities.find((u) => u.id === id) || null;

function luminance(hex) {
  const m = String(hex || "").replace("#", "").match(/.{2}/g);
  if (!m || m.length < 3) return 1;
  const [r, g, b] = m.map((h) => { const c = parseInt(h, 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const readableOn = (hex) => (luminance(hex) > 0.4 ? "#111827" : "#ffffff");

function applyUniversityTheme(id) {
  const root = document.documentElement;
  const uni = uniById(id);
  const theme = uni && uni.theme && uni.theme.primary && uni.theme.accent ? uni.theme : null;
  const vars = ["--primary-color", "--accent-color", "--on-primary", "--on-accent", "--accent-on-primary"];
  if (!theme) {
    root.dataset.university = DEFAULT_THEME.id;
    vars.forEach((v) => root.style.removeProperty(v));
    $("university-name").textContent = uni ? uni.name : DEFAULT_THEME.name;
    currentUniversity = DEFAULT_THEME.id;
    return;
  }
  const onPrimary = readableOn(theme.primary);
  root.dataset.university = id;
  root.style.setProperty("--primary-color", theme.primary);
  root.style.setProperty("--accent-color", theme.accent);
  root.style.setProperty("--on-primary", onPrimary);
  root.style.setProperty("--on-accent", readableOn(theme.accent));
  // Small accent text on the header only when it is readable there (e.g. copper on green is not).
  root.style.setProperty("--accent-on-primary", contrast(theme.accent, theme.primary) >= 3 ? theme.accent : onPrimary);
  $("university-name").textContent = `${uni.name} · ${uni.campus || ""}`.replace(/ · $/, "");
  currentUniversity = id;
}

/** Fallback for conversations without a saved university: pick the university a reply names. */
function updateUniversityTheme(responseText) {
  if (!responseText) return null;
  const tag = responseText.match(UNIVERSITY_TAG);
  const tagged = tag && (tag[1] || tag[2]).toLowerCase();
  if (tagged && uniById(tagged)) { if (tagged !== currentUniversity) applyUniversityTheme(tagged); return tagged; }
  let best = null;
  for (const u of state.universities) {
    const re = new RegExp("\\b" + u.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi");
    const hits = [...responseText.matchAll(re)];
    if (hits.length && (!best || hits.length > best.count)) best = { id: u.id, count: hits.length };
  }
  if (best && best.id !== currentUniversity) applyUniversityTheme(best.id);
  return best ? best.id : null;
}
const stripTags = (text) => text.replace(new RegExp(UNIVERSITY_TAG.source, "gi"), "").trim();

/* =====================================================================
   University picker (step 1)
   ===================================================================== */

const picker = $("picker");

function renderPickerOptions() {
  const grid = $("university-options");
  grid.innerHTML = "";
  for (const u of state.universities) {
    const label = document.createElement("label");
    label.className = "uni-card";
    label.style.setProperty("--uni-primary", u.theme.primary || "#888");
    label.style.setProperty("--uni-accent", u.theme.accent || "#bbb");

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "university";
    radio.value = u.id;
    radio.required = true;
    radio.checked = u.id === (state.university || store.get(UNIVERSITY_KEY));

    const top = document.createElement("span");
    top.className = "uni-card__top";
    const name = document.createElement("span");
    name.className = "uni-card__name";
    name.textContent = u.name;
    const check = document.createElement("span");
    check.className = "uni-card__check";
    check.setAttribute("aria-hidden", "true");
    top.append(name, check);

    const campus = document.createElement("span");
    campus.className = "uni-card__campus";
    campus.textContent = [u.campus, u.catalog_edition ? `${u.catalog_edition} catalog` : null].filter(Boolean).join(" · ");

    const majors = document.createElement("ul");
    majors.className = "uni-card__majors";
    majors.setAttribute("aria-label", `Majors in Campus Advisor for ${u.short_name || u.name}`);
    u.majors.forEach((m) => { const li = document.createElement("li"); li.textContent = m; majors.append(li); });

    label.append(radio, top, campus, majors);
    grid.append(label);
  }
}

function showPicker() {
  renderPickerOptions();
  $("picker-error").hidden = true;
  $("picker-cancel").hidden = !state.university;
  picker.hidden = false;
  log.hidden = true;
  suggestions.hidden = true;
  form.hidden = true;
  $("attachment").hidden = true;
  document.querySelector(".composer__hint").hidden = true;
  $("change-university").hidden = true;
  const checked = picker.querySelector("input:checked") || picker.querySelector("input");
  checked?.focus();
}

function hidePicker() {
  picker.hidden = true;
  log.hidden = false;
  form.hidden = false;
  document.querySelector(".composer__hint").hidden = false;
  $("change-university").hidden = !state.university;
  if (state.transcript) $("attachment").hidden = false;
}

function chooseUniversity(id) {
  const changed = id !== state.university;
  state.university = id;
  store.set(UNIVERSITY_KEY, id);
  applyUniversityTheme(id);
  hidePicker();
  if (changed || !state.messages.length) startNewChat();
}

$("university-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const picked = picker.querySelector('input[name="university"]:checked');
  if (!picked) {
    $("picker-error").textContent = "Choose a university to continue.";
    $("picker-error").hidden = false;
    picker.querySelector("input")?.focus();
    return;
  }
  chooseUniversity(picked.value);
});
$("picker-cancel").addEventListener("click", () => { applyUniversityTheme(state.university); hidePicker(); });
$("university-options").addEventListener("change", (e) => {
  if (e.target.name === "university") { $("picker-error").hidden = true; applyUniversityTheme(e.target.value); } // live preview
});
$("change-university").addEventListener("click", () => { if (!state.busy) showPicker(); });

async function loadUniversities() {
  try {
    state.universities = await api.universities();
  } catch (err) {
    $("picker-loading").textContent = "Couldn't load the list of universities. Reload the page to try again.";
    throw err;
  }
}

/* =====================================================================
   Safe Markdown (escape first, then format)
   ===================================================================== */

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]\n<]{1,40})\]/g, '<span class="ph">[$1]</span>');
  return s;
}
const LIST_RE = /^\s*([-*•]|\d+[.)])\s+/;
const TABLE_RE = /^\s*\|.*\|\s*$/;

function renderMarkdown(src) {
  const lines = src.replace(/\r/g, "").split("\n");
  let html = "", i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = line.match(/^```\s*(\w*)\s*$/);
    if (fence) {
      const body = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      const text = escapeHtml(body.join("\n").trim());
      html += fence[1].toLowerCase() === "email"
        ? '<div class="email"><div class="email__head"><span class="email__label">Email draft</span>'
          + '<button type="button" class="btn btn--primary btn--small" data-copy>Copy</button></div>'
          + "<pre>" + text.replace(/\[([^\]\n]{1,60})\]/g, '<span class="ph">[$1]</span>') + "</pre></div>"
        : "<pre><code>" + text + "</code></pre>";
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { const lv = heading[1].length <= 3 ? 3 : 4; html += `<h${lv}>${inline(heading[2])}</h${lv}>`; i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { html += "<hr>"; i++; continue; }
    if (/^\s*>/.test(line)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
      html += "<blockquote>" + q.map(inline).join("<br>") + "</blockquote>"; continue;
    }
    if (TABLE_RE.test(line)) {
      const rows = [];
      while (i < lines.length && TABLE_RE.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      html += '<div class="table-wrap"><table>';
      rows.forEach((r, k) => {
        if (/^\s*\|?\s*:?-{2,}/.test(r)) return;
        const tag = k === 0 ? "th" : "td";
        html += "<tr>" + cells(r).map((c) => `<${tag}>${inline(c)}</${tag}>`).join("") + "</tr>";
      });
      html += "</table></div>"; continue;
    }
    if (LIST_RE.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line), items = [];
      while (i < lines.length && LIST_RE.test(lines[i])) items.push(lines[i++].replace(LIST_RE, ""));
      const tag = ordered ? "ol" : "ul";
      html += `<${tag}>` + items.map((t) => `<li>${inline(t)}</li>`).join("") + `</${tag}>`; continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*>)/.test(lines[i]) && !TABLE_RE.test(lines[i]) && !LIST_RE.test(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    html += "<p>" + para.map(inline).join("<br>") + "</p>";
  }
  return html;
}

/* =====================================================================
   Chat DOM
   ===================================================================== */

function addMessage(role, content, { html = false } = {}) {
  const wrap = document.createElement("article");
  wrap.className = `msg msg--${role}`;
  const who = document.createElement("div");
  who.className = "msg__who";
  who.textContent = role === "user" ? "You" : "Campus Advisor";
  const body = document.createElement("div");
  body.className = "msg__body";
  if (html) body.innerHTML = content; else body.textContent = content;
  wrap.append(who, body);
  log.append(wrap);
  log.scrollTop = log.scrollHeight;
  return wrap;
}
const addAdvisor = (text) => addMessage("advisor", renderMarkdown(stripTags(text)), { html: true });
const addTyping = () => addMessage("advisor", '<span class="typing" aria-label="Campus Advisor is typing"><span></span><span></span><span></span></span>', { html: true });

function addError(message, retryText) {
  const el = addMessage("error", message);
  el.querySelector(".msg__who").textContent = "Couldn't send";
  if (retryText) {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn btn--retry btn--small";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => { el.remove(); submit(retryText, { echo: false }); });
    el.querySelector(".msg__body").append(document.createElement("br"), retry);
  }
}

function setStatus(text) { statusEl.textContent = text || ""; }

function setBusy(on, label = "Campus Advisor is writing…") {
  state.busy = on;
  const locked = on || !state.user;
  sendBtn.disabled = locked;
  uploadBtn.disabled = locked;
  input.disabled = !state.user;
  input.setAttribute("aria-busy", String(on));
  setStatus(on ? label : "");
}

function autoResize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";
}

function showWelcome() {
  log.innerHTML = "";
  const uni = uniById(state.university);
  const uniName = uni ? uni.name : "your university";
  if (state.user) {
    addAdvisor(`**Hi! / ¡Hola! / Olá! / Bonjour ! / 你好！** I'm Campus Advisor for **${uniName}**. Tell me what you enjoy and what you'd like to do, `
      + "and I'll suggest majors that fit you. You can also upload your transcript to plan your first classes, "
      + "get an email to your advisor, or prepare for a career fair.");
    suggestions.hidden = false;
  } else {
    const el = addAdvisor(`**Welcome to Campus Advisor for ${uniName}.** Sign in or create a free account to start. `
      + "Your conversations are saved to your account, so you can come back to them later.");
    const gate = document.createElement("div");
    gate.className = "gate";
    const signIn = document.createElement("button");
    signIn.type = "button"; signIn.className = "btn btn--primary btn--small"; signIn.textContent = "Sign in";
    signIn.addEventListener("click", () => openAuth("sign-in"));
    const create = document.createElement("button");
    create.type = "button"; create.className = "btn btn--outline btn--small"; create.textContent = "Create account";
    create.addEventListener("click", () => openAuth("register"));
    gate.append(signIn, create);
    el.querySelector(".msg__body").append(gate);
    suggestions.hidden = true;
  }
}

/* =====================================================================
   Transcript attachment
   ===================================================================== */

function showAttachment(name, text, isError = false) {
  $("attachment").hidden = false;
  $("attachment-name").textContent = name;
  const s = $("attachment-status");
  s.textContent = text;
  s.classList.toggle("is-error", isError);
}

function clearTranscript() {
  state.transcript = null;
  $("attachment").hidden = true;
  $("attachment-table").hidden = true;
  $("attachment-table").innerHTML = "";
  $("attachment-view").hidden = true;
  fileInput.value = "";
}

function renderCourses(t) {
  const wrap = $("attachment-table");
  wrap.innerHTML = "";
  const table = document.createElement("table");
  const caption = document.createElement("caption");
  caption.textContent = [t.institution, t.level && t.level !== "unknown" ? t.level : null, t.gpa ? "GPA " + t.gpa : null].filter(Boolean).join(" · ") || "Courses found";
  table.append(caption);
  const head = document.createElement("tr");
  ["Code", "Course", "Grade", "Credits", "Term"].forEach((h) => { const th = document.createElement("th"); th.textContent = h; head.append(th); });
  table.append(head);
  t.courses.forEach((c) => {
    const tr = document.createElement("tr");
    [c.code, c.title, c.grade, c.credits, c.term].forEach((v) => {
      const td = document.createElement("td");
      td.textContent = v == null || v === "" ? "—" : String(v);
      tr.append(td);
    });
    table.append(tr);
  });
  wrap.append(table);
  $("attachment-view").hidden = false;
  $("attachment-view").textContent = "Check courses";
}

async function handleTranscript(file) {
  if (state.busy || !state.user) return;
  clearTranscript();
  showAttachment(file.name, "Reading your transcript… (up to a minute)");
  setBusy(true, "Reading your transcript…");
  state.controller = new AbortController();
  try {
    const data = await api.transcript(file, state.controller.signal);
    if (!data || !data.transcript || !Array.isArray(data.transcript.courses)) throw new ApiError("The transcript couldn't be read. Try another file.", 0);
    state.transcript = data.transcript;
    renderCourses(state.transcript);
    showAttachment(file.name, `${state.transcript.courses.length} courses found. Check them, then press Send.`);
    if (!input.value.trim()) input.value = "Here is my transcript. Which classes should I start with?";
    autoResize();
  } catch (err) {
    state.transcript = null;
    if (err.status === 401) clearTranscript();
    else if (err.message !== "Request cancelled.") showAttachment(file.name, err.message, true);
  } finally {
    state.controller = null;
    setBusy(false);
    fileInput.value = "";
    input.focus();
  }
}

/* =====================================================================
   Saved conversations (history sidebar)
   ===================================================================== */

const historyPanel = $("history");
const historyToggle = $("history-toggle");
const scrim = $("history-scrim");
const narrow = window.matchMedia("(max-width: 820px)");

function setHistoryOpen(open, remember = true) {
  historyPanel.hidden = !open;
  historyToggle.setAttribute("aria-expanded", String(open));
  scrim.hidden = !(open && narrow.matches);
  if (remember && !narrow.matches) store.set(SIDEBAR_KEY, open ? "1" : "0");
}

function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

function renderSessionList() {
  const list = $("session-list");
  list.innerHTML = "";
  $("history-empty").hidden = state.sessions.length > 0;

  for (const s of state.sessions) {
    const li = document.createElement("li");
    li.className = "history__item";
    if (s.id === state.sessionId) li.setAttribute("aria-current", "true");

    const open = document.createElement("button");
    open.type = "button";
    open.className = "history__open";
    const title = document.createElement("span");
    title.className = "history__title";
    title.textContent = s.title;
    const meta = document.createElement("span");
    meta.className = "history__meta";
    const uni = uniById(s.university_id);
    if (uni) {
      const chip = document.createElement("span");
      chip.className = "history__uni";
      chip.textContent = uni.short_name || uni.name;
      meta.append(chip);
    }
    meta.append(`${formatWhen(s.updated_at)} · ${s.message_count} messages`);
    open.append(title, meta);
    open.addEventListener("click", () => loadSession(s.id));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "history__delete";
    del.textContent = "Delete";
    del.setAttribute("aria-label", `Delete conversation: ${s.title}`);
    del.addEventListener("click", () => {
      // Two-step delete: first click asks, second click deletes.
      if (!del.classList.contains("is-confirming")) {
        del.classList.add("is-confirming");
        del.textContent = "Confirm";
        setTimeout(() => { del.classList.remove("is-confirming"); del.textContent = "Delete"; }, 3000);
        return;
      }
      deleteSession(s.id);
    });

    li.append(open, del);
    list.append(li);
  }
}

async function refreshSessions() {
  if (!state.user) return;
  try {
    state.sessions = await api.listSessions();
    renderSessionList();
  } catch (err) {
    if (err.status !== 401) setStatus("Couldn't load your saved conversations.");
  }
}

async function loadSession(id) {
  if (state.busy) return;
  try {
    setBusy(true, "Opening conversation…");
    const s = await api.getSession(id);
    state.controller?.abort();
    clearTranscript();
    state.sessionId = s.id;
    state.messages = s.messages.map((m) => ({ role: m.role, content: m.content }));
    log.innerHTML = "";
    if (s.university_id && uniById(s.university_id)) {
      state.university = s.university_id;
      store.set(UNIVERSITY_KEY, s.university_id);
      applyUniversityTheme(s.university_id);
    }
    if (!picker.hidden) hidePicker();
    for (const m of state.messages) {
      if (m.role === "user") addMessage("user", m.content);
      else { if (!s.university_id) updateUniversityTheme(m.content); addAdvisor(m.content); }
    }
    suggestions.hidden = true;
    renderSessionList();
    if (narrow.matches) setHistoryOpen(false, false);
  } catch (err) {
    if (err.status === 404) { setStatus("That conversation no longer exists."); refreshSessions(); }
    else if (err.status !== 401) setStatus(err.message);
  } finally {
    setBusy(false);
    if (state.user) input.focus();
  }
}

async function deleteSession(id) {
  try {
    await api.deleteSession(id);
    state.sessions = state.sessions.filter((s) => s.id !== id);
    if (state.sessionId === id) startNewChat();
    renderSessionList();
  } catch (err) {
    if (err.status !== 401) setStatus(err.message);
  }
}

// Saves run one at a time, so a quick follow-up message can't create a duplicate session.
let saveChain = Promise.resolve();
function saveCurrentSession() {
  const snapshot = { id: state.sessionId, university_id: state.university, messages: state.messages.slice(-200) };
  const forSession = state.sessionId;
  saveChain = saveChain.then(async () => {
    if (!state.user || !snapshot.messages.length) return;
    snapshot.id = state.sessionId ?? forSession;   // pick up the id a previous save created
    try {
      const saved = await api.saveSession(snapshot);
      if (state.sessionId === null || state.sessionId === saved.id) state.sessionId = saved.id;
      const i = state.sessions.findIndex((s) => s.id === saved.id);
      if (i >= 0) state.sessions.splice(i, 1);
      state.sessions.unshift(saved);           // most recent first
      renderSessionList();
    } catch (err) {
      if (err.status !== 401) setStatus("Couldn't save this conversation. It will try again after your next message.");
    }
  });
  return saveChain;
}

function startNewChat() {
  state.controller?.abort();
  state.messages = [];
  state.sessionId = null;
  clearTranscript();
  applyUniversityTheme(state.university);
  setBusy(false);
  showWelcome();
  renderSessionList();
  input.value = "";
  autoResize();
  if (state.user) input.focus();
  if (narrow.matches) setHistoryOpen(false, false);
}

/* =====================================================================
   Chat flow
   ===================================================================== */

async function submit(text, { echo = true } = {}) {
  text = text.trim();
  if (!text || state.busy) return;
  if (!state.user) { openAuth("sign-in"); return; }
  if (!state.university) { showPicker(); return; }

  if (echo) addMessage("user", text);
  suggestions.hidden = true;
  setBusy(true);
  const pending = addTyping();
  state.messages.push({ role: "user", content: text });
  state.controller = new AbortController();

  try {
    const data = await api.chat({
      university_id: state.university,
      messages: state.messages.slice(-MAX_HISTORY),
      language: languageSel.value || null,
      transcript: state.transcript,
    }, state.controller.signal);
    if (!data || typeof data.reply !== "string" || !data.reply.trim()) throw new ApiError("The advisor returned an empty reply. Try again.", 0);

    state.messages.push({ role: "assistant", content: data.reply });
    updateUniversityTheme(data.reply);
    pending.querySelector(".msg__body").innerHTML = renderMarkdown(stripTags(data.reply))
      + (data.truncated ? '<p class="msg__note">The reply was cut short. Ask for one part at a time.</p>' : "");
    log.scrollTop = log.scrollHeight;
    saveCurrentSession();                      // save after every exchange
  } catch (err) {
    state.messages.pop();                      // drop the unanswered turn so a retry doesn't send it twice
    pending.remove();
    if (err.status !== 401 && err.message !== "Request cancelled.") addError(err.message, text);
  } finally {
    state.controller = null;
    setBusy(false);
    if (state.user) input.focus();
  }
}

/* =====================================================================
   Accounts: sign in, create account, sign out
   ===================================================================== */

const dialog = $("auth-dialog");
const authForm = $("auth-form");
const emailInput = $("username");
const passwordInput = $("password");
const newPasswordInput = $("new-password");
const authError = $("auth-error");
let authMode = "sign-in";

function setAuthMode(mode) {
  authMode = mode;
  const register = mode === "register";
  $("tab-sign-in").setAttribute("aria-selected", String(!register));
  $("tab-register").setAttribute("aria-selected", String(register));
  $("auth-title").textContent = register ? "Create your account" : "Sign in to Campus Advisor";
  $("auth-intro").textContent = register
    ? "Use your email and a new password. Your conversations will be saved to this account."
    : "Your conversations are saved to your account so you can come back to them.";
  $("auth-submit").textContent = register ? "Create account" : "Sign in";

  // Only one password field is active at a time, so password managers fill or save the right one.
  $("field-password").hidden = register;
  passwordInput.disabled = register;
  passwordInput.required = !register;
  $("field-new-password").hidden = !register;
  newPasswordInput.disabled = !register;
  newPasswordInput.required = register;
  authForm.setAttribute("action", register ? "/api/auth/register" : "/api/auth/token");
  showAuthError("");
}

function showAuthError(message, field) {
  authError.textContent = message;
  authError.hidden = !message;
  [emailInput, passwordInput, newPasswordInput].forEach((el) => el.removeAttribute("aria-invalid"));
  if (field) field.setAttribute("aria-invalid", "true");
}

function openAuth(mode = "sign-in", message = "") {
  setAuthMode(mode);
  if (message) showAuthError(message);
  if (!dialog.open) dialog.showModal();
  (emailInput.value ? (mode === "register" ? newPasswordInput : passwordInput) : emailInput).focus();
}

function closeAuth() {
  if (dialog.open) dialog.close();
  passwordInput.value = "";
  newPasswordInput.value = "";
  $("show-password").checked = false;
  passwordInput.type = newPasswordInput.type = "password";
}

async function signIn(email, password) {
  const tok = await api.token(email, password);
  setToken(tok.access_token);
  await loadAccount();
}

async function loadAccount() {
  try {
    state.user = await api.me();
  } catch {
    state.user = null;
  }
  renderAccount();
  if (state.user) {
    if (picker.hidden) startNewChat();
    await refreshSessions();
  } else {
    showWelcome();
  }
}

function renderAccount() {
  const signedIn = !!state.user;
  $("account-signed-in").hidden = !signedIn;
  $("account-signed-out").hidden = signedIn;
  $("account-email").textContent = signedIn ? state.user.email : "";
  historyToggle.hidden = !signedIn;
  if (signedIn) setHistoryOpen(narrow.matches ? false : store.get(SIDEBAR_KEY) !== "0", false);
  else { historyPanel.hidden = true; scrim.hidden = true; }
  setBusy(false);
}

function handleSignedOut(message) {
  clearToken();
  const wasSignedIn = !!state.user;
  state.user = null;
  state.sessions = [];
  state.sessionId = null;
  state.messages = [];
  state.controller?.abort();
  clearTranscript();
  applyUniversityTheme(state.university);
  renderAccount();
  renderSessionList();
  showWelcome();
  if (wasSignedIn && message) openAuth("sign-in", message);
}

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  const password = authMode === "register" ? newPasswordInput.value : passwordInput.value;

  if (!email || !emailInput.checkValidity()) return showAuthError("Enter a valid email address.", emailInput);
  if (!password) return showAuthError("Enter your password.", authMode === "register" ? newPasswordInput : passwordInput);
  if (authMode === "register" && (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
    return showAuthError("Use at least 8 characters, with a letter and a number.", newPasswordInput);
  }

  const submitBtn = $("auth-submit");
  submitBtn.disabled = true;
  showAuthError("");
  try {
    if (authMode === "register") await api.register(email, password);
    await signIn(email, password);
    closeAuth();
  } catch (err) {
    if (err.status === 409) { setAuthMode("sign-in"); showAuthError(err.message); passwordInput.focus(); }
    else showAuthError(err.message, err.status === 401 ? passwordInput : null);
  } finally {
    submitBtn.disabled = false;
  }
});

$("tab-sign-in").addEventListener("click", () => setAuthMode("sign-in"));
$("tab-register").addEventListener("click", () => setAuthMode("register"));
$("auth-cancel").addEventListener("click", closeAuth);
$("show-password").addEventListener("change", (e) => {
  passwordInput.type = newPasswordInput.type = e.target.checked ? "text" : "password";
});
dialog.addEventListener("click", (e) => { if (e.target === dialog) closeAuth(); }); // click on the backdrop
dialog.addEventListener("close", () => { passwordInput.value = ""; newPasswordInput.value = ""; });
$("open-sign-in").addEventListener("click", () => openAuth("sign-in"));
$("sign-out").addEventListener("click", () => handleSignedOut());

/* =====================================================================
   Event wiring
   ===================================================================== */

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value;
  if (!text.trim()) { input.focus(); return; }
  input.value = "";
  autoResize();
  submit(text);
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
});
input.addEventListener("input", autoResize);

suggestions.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  if (chip.dataset.action === "upload") fileInput.click();
  else submit(chip.textContent);
});

uploadBtn.addEventListener("click", () => { if (!state.busy) fileInput.click(); });
fileInput.addEventListener("change", () => { const f = fileInput.files && fileInput.files[0]; if (f) handleTranscript(f); });
$("attachment-remove").addEventListener("click", clearTranscript);
$("attachment-view").addEventListener("click", () => {
  const t = $("attachment-table");
  t.hidden = !t.hidden;
  $("attachment-view").textContent = t.hidden ? "Check courses" : "Hide courses";
});

$("new-chat").addEventListener("click", startNewChat);
historyToggle.addEventListener("click", () => setHistoryOpen(historyPanel.hidden));
scrim.addEventListener("click", () => setHistoryOpen(false, false));
narrow.addEventListener("change", () => { if (state.user) setHistoryOpen(!narrow.matches && store.get(SIDEBAR_KEY) !== "0", false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && narrow.matches && !historyPanel.hidden) setHistoryOpen(false, false); });

languageSel.addEventListener("change", () => store.set(LANGUAGE_KEY, languageSel.value));
const savedLang = store.get(LANGUAGE_KEY);
if (savedLang !== null && [...languageSel.options].some((o) => o.value === savedLang)) languageSel.value = savedLang;

log.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-copy]");
  if (!btn) return;
  const pre = btn.closest(".email").querySelector("pre");
  try {
    await navigator.clipboard.writeText(pre.textContent);
    btn.textContent = "Copied";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(pre);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    btn.textContent = "Selected: press Ctrl+C";
  }
  setTimeout(() => { btn.textContent = "Copy"; }, 2500);
});

/* =====================================================================
   Start
   ===================================================================== */

setAuthMode("sign-in");
applyUniversityTheme(null);
(async function start() {
  try { await loadUniversities(); } catch { showPicker(); return; }
  const saved = store.get(UNIVERSITY_KEY);
  if (saved && uniById(saved)) {               // returning student: skip straight to the chat
    state.university = saved;
    applyUniversityTheme(saved);
    hidePicker();
  } else {
    showPicker();                              // step 1 for everyone else
  }
  if (getToken()) await loadAccount();         // a stored token: check it with /api/auth/me
  else { renderAccount(); if (picker.hidden) showWelcome(); }
})();

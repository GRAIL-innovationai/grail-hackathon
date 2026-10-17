/* ============================================================
   Mathub — application shell
   Multi-course: each course is a data module registered on
   window.Courses (calc, physics, precalc). This file provides utilities,
   per-course storage, the math parser, routing (#/course/view/param),
   the landing page, layout, search, pomodoro and the reference views.
   Tool views live in tools.js (shared), calc-tools.js, physics-tools.js,
   precalc-tools.js. Accounts and preview gating live in auth.js.
   ============================================================ */
(function (global) {
  'use strict';
  const BUILD = global.MATHUB_BUILD || 'dev';
  const Courses = global.Courses || (global.Courses = {});
  const COURSE_ORDER = ['calc', 'physics', 'precalc', 'writ', 'csci', 'biob', 'kin', 'psyx'];
  const GLOBAL_VIEWS = ['contact', 'forum', 'policy', 'admin', 'meet', 'badges', 'challenge', 'mock', 'people', 'settings', 'leagues', 'gpa', 'today', 'whatsnew', 'resources', 'guides', 'focus', 'recap', 'tools', 'mistakes', 'join', 'sheet', 'request', 'teach', 'class', 'syllabus', 'notfound', 'create', 'c', 'tutor', 'plan'];   // pages that work without a course, e.g. #/contact
  const SITE = 'Mathub';
  let D = null, QZ = null;        // current course data and quiz module
  const courseHooks = [];

  /* ---------- tiny DOM helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Delegated handlers. Re-binding the same root replaces the handler map instead of stacking listeners.
  function bind(root, map) {
    root.__actions = map;
    if (!root.__boundClick) {
      root.__boundClick = true;
      root.addEventListener('click', e => { const el = e.target.closest('[data-action]'); if (!el || !root.contains(el)) return; const fn = root.__actions && root.__actions[el.dataset.action]; if (fn) fn(el, e); });
    }
  }
  function on(root, evt, sel, fn) {
    root.__on = root.__on || {}; const key = evt + '|' + sel; root.__on[key] = fn; root.__onBound = root.__onBound || {};
    if (!root.__onBound[key]) { root.__onBound[key] = true; root.addEventListener(evt, e => { const el = e.target.closest(sel); if (el && root.contains(el)) root.__on[key](el, e); }); }
  }
  function toast(msg, ms = 1800) { $$('.toast').forEach(t => t.remove()); const t = document.createElement('div'); t.className = 'toast'; if (/^\s*<(svg|b|i)\b/.test(msg)) t.innerHTML = msg; else t.textContent = msg; document.body.appendChild(t); setTimeout(() => (App.dismiss ? App.dismiss(t, 220) : t.remove()), ms); }

  /* ---------- icons ---------- */
  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>', send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>', image: '<path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.5"/>', megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M17 8a5 5 0 0 1 0 8"/>',
    d20: '<path d="M12 2l8.7 5v10L12 22l-8.7-5V7z"/><path d="M12 6.5l5.2 9H6.8z"/><path d="M12 2v4.5M12 6.5L3.3 7M12 6.5L20.7 7M17.2 15.5L20.7 7M17.2 15.5L20.7 17M17.2 15.5L12 22M6.8 15.5L12 22M6.8 15.5L3.3 17M6.8 15.5L3.3 7"/>', wand: '<path d="M4 20l10-10"/><path d="M17 3l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/><path d="M20 13v2M19 14h2M8 4v2M7 5h2"/>', compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>', orb: '<circle cx="12" cy="10" r="6.5"/><path d="M7 20h10M8.5 16.5L7 20M15.5 16.5L17 20"/><path d="M9.5 8.5a3 3 0 0 1 2.5-2"/>', sword: '<path d="M20 4l-10.5 10.5M20 4h-4.2M20 4v4.2M6.5 12.5l5 5M8 16l-3.5 3.5"/>', potion: '<path d="M9.5 3h5M10.5 3v5.2L6 15.5A4.5 4.5 0 0 0 10 22h4a4.5 4.5 0 0 0 4-6.5L13.5 8.2V3"/><path d="M7.5 14h9"/>', scroll: '<path d="M8 4h10a2 2 0 0 1 2 2v1h-4"/><path d="M16 7v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1h10"/><path d="M8 4a2 2 0 0 0-2 2v11M9.5 9h4M9.5 12.5h4"/>', quill: '<path d="M20 3C12 4 7 9 5.5 17.5L4 21"/><path d="M20 3c-1 6-5 10.5-12.5 13M9 12h5"/>', crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
    home: '<path d="M2.5 20l6.5-10.5 3.5 5 2.5-3.5 6.5 9z"/><path d="M9 9.5V3.5l4.5 1.8L9 7"/>', calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>', sigma: '<path d="M18 5H7l6 7-6 7h11"/>',
    cards: '<rect x="3" y="6" width="14" height="12" rx="2"/><path d="M7 4h12a2 2 0 0 1 2 2v10"/>', list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h8"/>', chart: '<path d="M3 20h18"/><path d="M4 16c3-2 5-8 8-8s4 6 8 3"/>',
    flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7 15h10"/>', calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M16 12h.01M8 16h2M12 16h2M16 16h.01"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12l5 5L20 7"/>', play: '<path d="M7 5v14l11-7z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
    rotate: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>', print: '<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    download: '<path d="M12 3v12M6 11l6 6 6-6"/><path d="M4 21h16"/>', upload: '<path d="M12 16V4M6 9l6-6 6 6"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>', volume: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>', stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>', cc: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M10.5 10a2.4 2.4 0 1 0 0 4M17 10a2.4 2.4 0 1 0 0 4"/>', keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/>', micoff: '<path d="M15 9.5V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.9 2.3"/><path d="M5 11a7 7 0 0 0 11.3 5.5M19 11a7 7 0 0 1-.5 2.6M12 18v3M8 21h8M3 3l18 18"/>', phone: '<path d="M5 3.5h3.2l1.6 4.2-2 1.3a11 11 0 0 0 5.2 5.2l1.3-2 4.2 1.6V17a2.5 2.5 0 0 1-2.7 2.5A15.5 15.5 0 0 1 2.5 6.2 2.5 2.5 0 0 1 5 3.5z"/>', phoneoff: '<path d="M3.6 13.9a12.5 12.5 0 0 1 16.8 0l-1.9 2.5-3.4-1.1-.3-2.6a9.4 9.4 0 0 0-5.6 0l-.3 2.6-3.4 1.1z"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>', undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    right: '<path d="M9 6l6 6-6 6"/>', left: '<path d="M15 6l-6 6 6 6"/>', sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
    fire: '<path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-1 .3-2 1-3 0 2 1 3 2 3 0-3-1-5 1-9z"/>', external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', zoomin: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M11 8v6M8 11h6"/>', zoomout: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8 11h6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>',
    chat: '<path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-4.5A8 8 0 1 1 21 12z"/>', up: '<path d="M6 14l6-6 6 6"/>', down: '<path d="M6 10l6 6 6-6"/>', reply: '<path d="M9 14L4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 7 7v4"/>',
    pin: '<path d="M12 17v5"/><path d="M8 3h8l-1 7 3 3H6l3-3z"/>', bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>', canvas: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M8 14l3 3 5-5"/>', wifi_off: '<path d="M2 8.5a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 15.5a6 6 0 0 1 7 0M12 19h.01"/><path d="M3 3l18 18"/>', lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>', swap: '<path d="M7 16V4M7 4L3 8M7 4l4 4"/><path d="M17 8v12M17 20l4-4M17 20l-4-4"/>', grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2a5 5 0 0 1 6 4.8"/>', award: '<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5L7 22l5-3 5 3-1.5-8.5"/><path d="M12 6.5l.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1L9 8.7l2.1-.3z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    logout: '<path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5"/><path d="M15 16l4-4-4-4M19 12H9"/>', chevron: '<path d="M6 9l6 6 6-6"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>', gem: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3l3 6 3-6M6 9l6 12M18 9l-6 12"/>', trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6"/>', path: '<path d="M5 5c9 0 9 7 0 7s-9 7 0 7h14"/><circle cx="5" cy="5" r="1.8"/><circle cx="19" cy="19" r="1.8"/>'
  };
  const icon = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  /* ---------- storage: one bucket per course, one global bucket ---------- */
  const readJSON = key => { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; } };
  const writeJSON = (key, obj) => { try { localStorage.setItem(key, JSON.stringify(obj)); } catch { /* storage unavailable */ } };
  const storeKey = id => 'studyhub-' + id;
  const store = {
    id: null, data: {},
    load(id) {
      this.id = id;
      if (id === 'calc' && !localStorage.getItem(storeKey('calc')) && localStorage.getItem('m171-study-v1')) { writeJSON(storeKey('calc'), readJSON('m171-study-v1')); }
      this.data = readJSON(storeKey(id));
    },
    get(k, def) { return (k in this.data) ? this.data[k] : def; },
    set(k, v) { this.data[k] = v; writeJSON(storeKey(this.id), this.data); if (global.App && global.App.auth) global.App.auth.noteWrite(this.id); },
    replace(id, data) { data = data && typeof data === 'object' ? data : {}; writeJSON(storeKey(id), data); if (this.id === id) this.data = data; },
    exportJSON() { return JSON.stringify({ course: this.id, data: this.data, settings: readJSON('studyhub-settings') }, null, 2); },
    importJSON(txt) { const obj = JSON.parse(txt); if (!obj || typeof obj !== 'object') throw new Error('Not a valid export'); const data = obj.data && typeof obj.data === 'object' ? obj.data : obj; this.data = data; writeJSON(storeKey(this.id), data); if (obj.settings) writeJSON('studyhub-settings', obj.settings); if (global.App && global.App.auth) global.App.auth.noteWrite(this.id); },
    reset() { this.data = {}; try { localStorage.removeItem(storeKey(this.id)); } catch {} if (global.App && global.App.auth) global.App.auth.noteWrite(this.id); },
    peek(id) { return readJSON(storeKey(id)); },
    poke(id, fn) { if (id === this.id) { fn(this.data); writeJSON(storeKey(id), this.data); } else { const d = readJSON(storeKey(id)); fn(d); writeJSON(storeKey(id), d); } if (global.App && global.App.auth) global.App.auth.noteWrite(id); }
  };
  const settings = () => Object.assign({ theme: 'system' }, readJSON('studyhub-settings'));
  const setSetting = (k, v) => { const s = settings(); s[k] = v; writeJSON('studyhub-settings', s); if (global.App && global.App.onSetting) { try { global.App.onSetting(k); } catch (e) {} } };
  const courseSetting = (courseId, k, def) => { const s = settings(); return (s[courseId] && k in s[courseId]) ? s[courseId][k] : def; };
  const setCourseSetting = (courseId, k, v) => { const s = settings(); s[courseId] = Object.assign({}, s[courseId], { [k]: v }); writeJSON('studyhub-settings', s); };
  /* classes whose sections meet on different days (VARIANTS): calendar rows carry a section id in slot 4 and exams carry dates per section.
     The section comes from the Settings picker, or from the section number typed at sign-up ("01" → "1"). */
  const sectionVariant = C => { const V = C && C.VARIANTS; if (!V) return ''; const has = id => V.options.some(o => o.id === id); const pick = String(courseSetting(C.id, 'variant', '') || ''); if (has(pick)) return pick; const typed = String(parseInt(courseSetting(C.id, 'section', ''), 10) || ''); return has(typed) ? typed : V.default; };
  const applyVariant = C => { if (!C || !C.VARIANTS) return; const v = sectionVariant(C); if (C.CALENDAR !== C._calView) C._calAll = C.CALENDAR; C._calView = (C._calAll || []).filter(e => !e[4] || e[4] === v); C.CALENDAR = C._calView; (C.EXAMS || []).forEach(ex => { if (ex.dates && ex.dates[v]) { ex.date = ex.dates[v]; if (ex.dateLabels && ex.dateLabels[v]) ex.dateLabel = ex.dateLabels[v]; } }); };
  Object.keys(global.Courses || {}).forEach(id => applyVariant(global.Courses[id]));

  /* ---------- dates ---------- */
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const parseISO = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const toISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const asOf = () => { const v = settings().asof; return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };
  const today = () => { const ov = asOf(); const d = ov ? parseISO(ov) : new Date(); d.setHours(0, 0, 0, 0); return d; };
  const todayISO = () => toISO(today());
  const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
  // in another language the browser writes the date ("jue 15 oct", "Do., 15. Okt."); in English, as it always was
  const LOC = () => { const l = global.MATHUB_LANG; return l && l !== 'en' && l !== 'qps' ? l : null; };
  const fmtDate = (iso, long = false) => { const d = parseISO(iso); const l = LOC(); if (l) return d.toLocaleDateString(l, long ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' }); return long ? `${DOW[d.getDay()]}, ${MONL[d.getMonth()]} ${d.getDate()}` : `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`; };
  const shortDate = iso => { const d = parseISO(iso); const l = LOC(); if (l) return d.toLocaleDateString(l, { month: 'short', day: 'numeric' }); return `${MON[d.getMonth()]} ${d.getDate()}`; };
  const relDays = n => n === 0 ? 'today' : n === 1 ? 'tomorrow' : n < 0 ? `${-n} day${n === -1 ? '' : 's'} ago` : `in ${n} days`;

  /* ---------- MathJax ---------- */
  function typeset(el) {
    if (!el) return; const MJ = global.MathJax;
    if (MJ && MJ.typesetPromise) MJ.typesetPromise([el]).catch(() => {});
    else if (MJ && MJ.startup && MJ.startup.promise) MJ.startup.promise.then(() => MJ.typesetPromise([el])).catch(() => {});
  }

  /* ---------- expression parser (x or t; + - * / ^; implicit multiplication; functions; e, pi; scientific notation) ---------- */
  const FUN = { sin: Math.sin, cos: Math.cos, tan: Math.tan, sec: x => 1 / Math.cos(x), csc: x => 1 / Math.sin(x), cot: x => 1 / Math.tan(x), asin: Math.asin, acos: Math.acos, atan: Math.atan, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2, sqrt: Math.sqrt, abs: Math.abs, cbrt: Math.cbrt, floor: Math.floor, ceil: Math.ceil };
  const CONST = { e: Math.E, pi: Math.PI };
  const NAMES = Object.keys(FUN).concat(Object.keys(CONST), ['x', 't']).sort((a, b) => b.length - a.length);
  function compileExpr(src) {
    const s = String(src || '').replace(/\s+/g, '').replace(/π/g, 'pi').replace(/−/g, '-').replace(/\*\*/g, '^').replace(/×/g, '*').replace(/÷/g, '/');
    if (!s) throw new Error('Enter an expression.');
    let i = 0, absDepth = 0;
    const peek = () => s[i]; const isDigit = c => c >= '0' && c <= '9'; const isAlpha = c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    const expect = c => { if (s[i] !== c) throw new Error(`Expected "${c}" at position ${i + 1}.`); i++; };
    function parseExpr() { let l = parseTerm(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = parseTerm(); const L = l; l = op === '+' ? x => L(x) + r(x) : x => L(x) - r(x); } return l; }
    function parseTerm() { let l = parseUnary(); for (;;) { const c = peek(); if (c === '*' || c === '/') { i++; const r = parseUnary(); const L = l; l = c === '*' ? x => L(x) * r(x) : x => L(x) / r(x); } else if (c && (isDigit(c) || isAlpha(c) || c === '(' || (c === '|' && absDepth === 0))) { const r = parseUnary(); const L = l; l = x => L(x) * r(x); } else break; } return l; }
    function parseUnary() { if (peek() === '-') { i++; const r = parseUnary(); return x => -r(x); } if (peek() === '+') { i++; return parseUnary(); } return parsePower(); }
    function parsePower() { const base = parseAtom(); if (peek() === '^') { i++; const ex = parseUnary(); return x => Math.pow(base(x), ex(x)); } return base; }
    function parseAtom() {
      const c = peek(); if (c === undefined) throw new Error('Unexpected end of expression.');
      if (isDigit(c) || c === '.') {
        let j = i; while (j < s.length && (isDigit(s[j]) || s[j] === '.')) j++;
        if ((s[j] === 'e' || s[j] === 'E') && (isDigit(s[j + 1]) || ((s[j + 1] === '-' || s[j + 1] === '+') && isDigit(s[j + 2])))) { j++; if (s[j] === '-' || s[j] === '+') j++; while (j < s.length && isDigit(s[j])) j++; }
        const v = parseFloat(s.slice(i, j)); if (isNaN(v)) throw new Error('Bad number.'); i = j; return () => v;
      }
      if (c === '(') { i++; const e = parseExpr(); expect(')'); return e; }
      if (c === '|') { i++; absDepth++; const e = parseExpr(); absDepth--; expect('|'); return x => Math.abs(e(x)); }
      if (isAlpha(c)) {
        const name = NAMES.find(n => s.startsWith(n, i));
        if (!name) { let j = i; while (j < s.length && isAlpha(s[j])) j++; throw new Error(`Unknown symbol "${s.slice(i, j)}".`); }
        i += name.length;
        if (FUN[name]) { const F = FUN[name]; let arg; if (peek() === '(') { i++; arg = parseExpr(); expect(')'); } else arg = parseUnary(); return x => F(arg(x)); }
        if (name in CONST) { const v = CONST[name]; return () => v; }
        return x => x;
      }
      throw new Error(`Unexpected "${c}" at position ${i + 1}.`);
    }
    const fn = parseExpr(); if (i < s.length) throw new Error(`Unexpected "${s[i]}" at position ${i + 1}.`);
    return x => { const v = fn(x); return typeof v === 'number' ? v : NaN; };
  }
  const d1 = (f, x, hh = 1e-5) => (f(x + hh) - f(x - hh)) / (2 * hh);
  const d2 = (f, x, hh = 1e-4) => (f(x + hh) - 2 * f(x) + f(x - hh)) / (hh * hh);
  function parseNumber(str) { const t = String(str || '').trim(); if (!t) return NaN; try { return compileExpr(t)(0); } catch { return NaN; } }
  const fmtNum = (x, p = 4) => { if (!isFinite(x)) return '—'; const r = Math.round(x * 10 ** p) / 10 ** p; return String(r); };

  /* ---------- canvas helpers ---------- */
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function fitCanvas(c) { const dpr = window.devicePixelRatio || 1; const r = c.getBoundingClientRect(); const W = Math.max(50, Math.round(r.width)), H = Math.max(50, Math.round(r.height)); if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); } const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, W, H }; }
  const niceStep = range => { const raw = range / 8; const p = Math.pow(10, Math.floor(Math.log10(raw))); const m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };

  /* ---------- progress ---------- */
  function progress() { return store.get('progress', {}); }
  function recordAnswer(topic, ok) {
    const p = progress(); const t = p[topic] || { a: 0, c: 0 }; t.a++; if (ok) t.c++; p[topic] = t; store.set('progress', p);
    const hist = store.get('history', []); hist.push({ t: topic, ok, d: todayISO(), k: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }); if (hist.length > 500) hist.splice(0, hist.length - 500); store.set('history', hist); markActivity(); if (App.addXP) App.addXP(ok ? 10 : 2); if (App.quest) { App.quest('answers'); if (ok) App.quest('correct'); App.quest('topics', 1, topic); }
  }
  function markActivity() { const days = store.get('activity', {}); days[todayISO()] = true; store.set('activity', days); }
  function streakOf(data) { const days = data.activity || {}; let n = 0; let d = today(); if (!days[toISO(d)]) d = addDays(d, -1); while (days[toISO(d)]) { n++; d = addDays(d, -1); } return n; }
  const streak = () => streakOf(store.data);
  function unitMastery(unit) { const p = progress(); const topics = QZ && QZ.topicsForUnits ? QZ.topicsForUnits([unit]) : []; let a = 0, c = 0; topics.forEach(t => { if (p[t]) { a += p[t].a; c += p[t].c; } }); return { a, c, pct: a ? Math.round(100 * c / a) : 0 }; }
  function cardsMastered(unit) { const fc = store.get('flashcards', {}); const cards = D.FLASHCARDS.filter(c => !unit || c.unit === unit); return { total: cards.length, mastered: cards.filter(c => (fc[c.id] || 0) >= 3).length }; }
  function checklistState(examId) { const items = D.CHECKLISTS[examId] || []; const st = store.get('checklists', {})[examId] || {}; return { items, done: items.filter((_, i) => st[i]).length }; }

  /* ---------- course helpers (take a course object so the landing can use any course) ---------- */
  const eventsOn = (C, iso) => C.CALENDAR.filter(e => e[0] === iso);
  const isHoliday = (C, iso) => eventsOn(C, iso).some(e => e[1] === 'holiday');
  const inSemester = (C, iso) => iso >= C.SEMESTER.start && iso <= C.SEMESTER.end;
  function nextExam(C) { const t = todayISO(); return C.EXAMS.find(e => (e.endDate || e.date) >= t) || null; }
  function examStatus(ex) { const t = todayISO(); const n = daysBetween(t, ex.date); if (n > 0) return { n, big: String(n), label: n === 1 ? 'day to go' : 'days to go', chip: n === 1 ? 'tomorrow' : `${n} days` }; if (ex.endDate && t <= ex.endDate) return { n: 0, big: 'This week', label: ex.dateLabel || 'exam week', chip: 'this week' }; if (n === 0) return { n: 0, big: 'Today', label: 'exam day', chip: 'today' }; return { n, big: 'Done', label: 'exam over', chip: 'done' }; }
  function currentSection(C) { const t = todayISO(); const lec = C.CALENDAR.filter(e => e[1] === 'lecture' && e[3] && e[0] <= t).pop(); const id = lec ? lec[3] : (C.SECTIONS[0] && C.SECTIONS[0].id); return C.SECTIONS.find(s => s.id === id) || C.SECTIONS[0]; }
  function upcomingDeadlines(C, count = 6) {
    const items = []; const start = today(); const labDow = courseSetting(C.id, 'labDay', 'tue') === 'thu' ? 4 : 2;
    for (let k = 0; k < 28; k++) {
      const d = addDays(start, k), iso = toISO(d), dow = d.getDay(); if (!inSemester(C, iso)) continue; const hol = isHoliday(C, iso);
      (C.RECURRING || []).forEach(r => {
        if (r.quiet) return; if (r.from && iso < r.from) return; if (r.skipHolidays && hol) return; if (r.skipIfAdmin && eventsOn(C, iso).some(e => e[1] === 'admin' && /due/i.test(e[2]))) return;
        if (r.dows && r.dows.includes(dow)) items.push({ date: iso, time: r.time, title: r.title, type: 'recurring' });
        if (r.afterLabDay && dow === labDow + 1 && !isHoliday(C, toISO(addDays(d, -1)))) items.push({ date: iso, time: r.time, title: r.title, type: 'recurring' });
      });
      eventsOn(C, iso).filter(e => e[1] === 'exam' || e[1] === 'admin').forEach(e => items.push({ date: iso, time: e[1] === 'exam' ? '' : '', title: e[2], type: e[1] }));
    }
    const cv = Canvas.data && Canvas.data.configured ? Canvas.events(C.id, toISO(start), 28) : [];
    if (cv.length) { const real = cv.map(e => ({ date: e.date, time: e.time, title: e.title, type: 'canvas', url: e.url })); const keep = items.filter(x => x.type !== 'recurring' && !(x.type === 'admin' && /^due\b/i.test(x.title))); items.length = 0; items.push(...keep, ...real); }
    const seen = new Set(); const uniq = items.filter(x => { const k = x.date + '|' + x.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    uniq.sort((a, b) => a.date.localeCompare(b.date)); return uniq.slice(0, count);
  }
  function semesterState(C) {
    if (!C || !C.SEMESTER) return { phase: 'none', week: 0, weeks: 0 };   // no built-in classes in this copy
    const t = todayISO(); const S = C.SEMESTER;
    if (t < S.start) return { phase: 'before', days: daysBetween(t, S.start), week: 0 };
    if (t > S.end) return { phase: 'after', days: daysBetween(S.end, t), week: Math.floor(daysBetween(S.start, S.end) / 7) + 1 };
    const finalEx = C.EXAMS[C.EXAMS.length - 1]; const finals = finalEx && finalEx.endDate && t >= finalEx.date && t <= finalEx.endDate;
    return { phase: finals ? 'finals' : 'during', week: Math.floor(daysBetween(S.start, t) / 7) + 1, weeks: Math.floor(daysBetween(S.start, S.end) / 7) + 1 };
  }
  const secById = id => D.SECTIONS.find(s => s.id === id);
  const secLabel = id => { const s = secById(id); return s ? s.label : ('§' + id); };
  const topicsForSection = secId => QZ && QZ.TOPICS ? Object.keys(QZ.TOPICS).filter(t => QZ.TOPICS[t].sec === secId) : [];

  /* ---------- Canvas feed + announcement (fetched once per session, cached 5 minutes) ---------- */
  const Canvas = {
    data: null, at: 0, pending: null,
    load() {
      if (this.data && Date.now() - this.at < 300000) return Promise.resolve(this.data);
      if (this.pending) return this.pending;
      this.pending = fetch('api/index.php?r=canvas', { credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub' } }).then(r => r.json()).then(j => { if (!j || j.ok === false) throw new Error((j && j.error) || 'unavailable'); this.data = j; this.at = Date.now(); return j; }).catch(() => { this.data = this.data || { configured: false, events: [], announcement: '' }; this.at = Date.now(); return this.data; }).finally(() => { this.pending = null; });
      return this.pending;
    },
    events(courseId, fromISO, days = 28) { const d = this.data; if (!d || !d.events) return []; const to = toISO(addDays(parseISO(fromISO), days)); return d.events.filter(e => (!courseId || e.course === courseId) && e.date >= fromISO && e.date <= to); },
    async fill(el, courseId, count = 6) {
      if (!el) return; const t = todayISO();
      try { await this.load(); } catch {}
      const d = this.data; if (!d || !d.configured) { el.innerHTML = ''; return; }
      const evs = this.events(courseId, t).slice(0, count);
      el.innerHTML = `<div class="panel canvas-panel"><div class="panel-h"><div class="panel-title">${icon('canvas')} From Canvas</div><span class="small muted">${d.error ? '<span style="color:var(--warn)">using the last copy</span>' : d.fetched ? `synced ${relTime(d.fetched)}` : ''}</span></div>
        ${evs.length ? evs.map(e => `<div class="today-ev"><span class="when">${daysBetween(t, e.date) === 0 ? 'Today' : daysBetween(t, e.date) === 1 ? 'Tomorrow' : esc(fmtDate(e.date))}</span><span>${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : esc(e.title)}${e.time ? ` <span class="muted small">· ${esc(e.time)}</span>` : ''}${!courseId ? ` <span class="chip course-${esc(e.course)}" style="margin-left:6px">${esc((Courses[e.course] || { short: e.course }).short)}</span>` : ''}</div>`).join('') : `<div class="empty">Nothing on the Canvas calendar for this class in the next few weeks.</div>`}
        <p class="small muted mt-2">Real due dates from the instructor's Canvas calendar, refreshed hourly.</p></div>`;
    }
  };
  const relTime = ts => { const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60)); return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  function paintAnnouncement(root) {
    Canvas.load().then(d => { const txt = (d && d.announcement || '').trim(); if (!txt) return; let dismissed = ''; try { dismissed = localStorage.getItem('mathub-ann-dismissed') || ''; } catch {} if (dismissed === txt) return; const host = $('#announcement-slot', root); if (!host) return; host.innerHTML = `<div class="announce"><span>${icon('flag', 14)} ${esc(txt)}</span><button class="icon-btn" data-action="ann-dismiss" aria-label="Dismiss">${icon('x', 14)}</button></div>`; on(host, 'click', '[data-action="ann-dismiss"]', () => { try { localStorage.setItem('mathub-ann-dismissed', txt); } catch {} host.innerHTML = ''; }); }).catch(() => {});
  }

  /* ---------- App object ---------- */
  const App = { views: {}, current: null, icon, esc, $, $$, bind, on, toast, store, settings, setSetting, courseSetting, setCourseSetting, applyVariant, sectionVariant, typeset, compileExpr, d1, d2, parseNumber, fmtNum, cssVar, fitCanvas, niceStep,
    recordAnswer, markActivity, progress, streak, unitMastery, cardsMastered, checklistState, todayISO, toISO, parseISO, fmtDate, shortDate, addDays, daysBetween, relDays, examStatus, secLabel, secById, topicsForSection,
    nextExam: () => nextExam(D), currentSection: () => currentSection(D), upcomingDeadlines: n => upcomingDeadlines(D, n), eventsOn: iso => eventsOn(D, iso),
    onCourse(fn) { courseHooks.push(fn); if (D) fn(D); }, BUILD, SITE, COURSE_ORDER, asOf, semesterState: () => semesterState(D),
    upcomingDeadlinesOf: upcomingDeadlines, nextExamOf: nextExam, semesterStateOf: semesterState, streakOf, secLabelOf: (C, id) => { const x = (C.SECTIONS || []).find(z => z.id === id); return x ? x.label : id; } };
  // the interface's language (assets/i18n.js): App.t('…', a, b) for words that never reach the page; the page itself is translated as it is drawn
  const I18N = global.MathubI18n; App.lang = I18N ? I18N.lang : 'en'; App.t = I18N ? I18N.t : ((x, ...v) => String(x).replace(/\{(\d+)\}/g, (m, n) => v[n - 1] != null ? v[n - 1] : m));
  App.toggleTheme = () => toggleTheme();
  App.myCourses = () => { const c = settings().courses; const mine = Array.isArray(c) ? c.filter(id => Courses[id] && !Courses[id].preview) : []; return mine.length ? mine : COURSE_ORDER.filter(id => Courses[id]); };
  App.isoWeek = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + 3 - ((x.getDay() + 6) % 7)); const w1 = new Date(x.getFullYear(), 0, 4); return x.getFullYear() + '-W' + String(1 + Math.round(((x - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7)).padStart(2, '0'); };
  App.guest = () => !!(App.auth && App.auth.ready && !App.auth.user);
  App.limit = k => App.guest() && App.auth.limits && App.auth.limits[k] != null ? App.auth.limits[k] : Infinity;
  App.lockCard = (t, x, o) => App.auth ? App.auth.lockCard(t, x, o) : '';
  // The Mathub mark: Bo the bobcat's head, the same drawing as the mascot. Fixed colours (he is tan in every theme);
  // tile=true sets him on a navy rounded tile for places outside the page (icons, share cards).
  App.LOGO_PATHS = '<path d="M22 46L14 14l32 14z" fill="#C98B4B"/><path d="M98 46l8-32-32 14z" fill="#C98B4B"/><path d="M24 40l-6-19 20 10z" fill="#3B2A1C"/><path d="M96 40l6-19-20 10z" fill="#3B2A1C"/><ellipse cx="60" cy="58" rx="40" ry="34" fill="#D9A15B"/><ellipse cx="60" cy="69" rx="27" ry="21" fill="#F3DFB8"/><path d="M30 42c4 5 8 10 8 18M90 42c-4 5-8 10-8 18" stroke="#8B5A2B" stroke-width="3.2" stroke-linecap="round" fill="none"/><path d="M19 70l17 2M19 78l17-1M101 70l-17 2M101 78l-17-1" stroke="#8B5A2B" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="46" cy="56" rx="7.5" ry="8.5" fill="#fff"/><ellipse cx="74" cy="56" rx="7.5" ry="8.5" fill="#fff"/><circle cx="47" cy="57.5" r="4.6" fill="#2A1B0E"/><circle cx="75" cy="57.5" r="4.6" fill="#2A1B0E"/><circle cx="48.6" cy="55.4" r="1.6" fill="#fff"/><circle cx="76.6" cy="55.4" r="1.6" fill="#fff"/><path d="M54 68h12l-6 6z" fill="#3B2A1C"/><path d="M60 74v3.5M60 77.5c-3 3-7 3-9 0M60 77.5c3 3 7 3 9 0" stroke="#3B2A1C" stroke-width="2.2" stroke-linecap="round" fill="none"/>';
  App.logoSvg = (size = 28, tile = false) => tile
    ? `<svg class="mh-logo tile" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#14213D"/><g transform="translate(-2.8 1.3) scale(0.58)">${App.LOGO_PATHS}</g></svg>`
    : `<svg class="mh-logo bo-mark" width="${Math.round(size * 1.16)}" height="${size}" viewBox="10 10 100 86" aria-hidden="true">${App.LOGO_PATHS}</svg>`;
  App.wordmark = (cls = '') => `<span class="brand-word${cls ? ' ' + cls : ''}">Mathub</span>`;
  App.tagline = (cls = '') => `<span class="brand-tag${cls ? ' ' + cls : ''}">Learn <i>/</i> Practice <i>/</i> Excel</span>`;
  Object.defineProperty(App, 'D', { get: () => D }); Object.defineProperty(App, 'Q', { get: () => QZ });
  App.Canvas = Canvas;
  /* the site's address for links people share; inside the iOS app the page lives at capacitor://localhost, so links point at mathub.space */
  App.siteBase = () => (window.MATHUB_APP && window.MATHUB_APP.native ? window.MATHUB_APP.api : location.origin + location.pathname.replace(/index\.html$/, ''));
  App.link = (view, param, query) => { let hs = '#/' + (D ? D.id : 'calc') + '/' + view + (param ? '/' + param : ''); if (query) hs += '?' + new URLSearchParams(query).toString(); return hs; };
  App.go = (view, param, query) => { const hs = App.link(view, param, query); if (location.hash === hs) { render(); return; } try { location.hash = hs; } catch { render(); } };
  App.replaceHash = hs => { try { history.replaceState(null, '', hs); } catch {} };
  const pageHead = (title, sub, actions = '') => `<div class="page-head"><div><h1 class="page-title">${title}</h1>${sub ? `<p class="page-sub">${sub}</p>` : ''}</div><div class="page-actions">${actions}</div></div>`;
  App.pageHead = pageHead;
  const L = App.link;

  /* ---------- course selection / routing ---------- */
  const COMMUNITY_NAV = [['challenge', 'Daily challenge', 'target'], ['meet', 'Study sessions', 'clock'], ['mock', 'Mock exams', 'flag'], ['contribute', 'Contribute', 'pen'], ['leagues', 'Leagues', 'gem'], ['people', 'People', 'users']];
  function augmentNav(C) {
    const today = C.NAV[0]; if (C.quiz && App.views.path && today && !today.items.some(x => x[0] === 'path')) today.items.splice(1, 0, ['path', 'Learning path', 'path']);
    let gp = C.NAV.find(g => g.label === 'Community'); if (!gp) { gp = { label: 'Community', items: [['forum', 'Discussions', 'chat']] }; C.NAV.splice(C.NAV.length - 1, 0, gp); }
    COMMUNITY_NAV.forEach(it => { if (!C.quiz && ['challenge', 'mock', 'contribute'].includes(it[0])) return; if (App.views[it[0]] && !gp.items.some(x => x[0] === it[0])) gp.items.push(it); });
    const cg = C.NAV.find(g => g.label === 'Course'); if (cg && App.views.gpa && !cg.items.some(x => x[0] === 'gpa')) { const gi = cg.items.findIndex(x => x[0] === 'grades'); cg.items.splice(gi >= 0 ? gi + 1 : 1, 0, ['gpa', 'GPA calculator', 'calc']); }
    if (cg && App.views.resources && !cg.items.some(x => x[0] === 'resources')) cg.items.splice(Math.max(1, cg.items.length - 1), 0, ['resources', 'Resources & guides', 'link']);
    const pg = C.NAV.find(g => g.label === 'Practice'); if (pg && C.quiz && App.views.blitz && !pg.items.some(x => x[0] === 'blitz')) pg.items.push(['blitz', 'Blitz', 'zap']);
    if (pg && C.quiz && App.views.mistakes && !pg.items.some(x => x[0] === 'mistakes')) pg.items.push(['mistakes', 'Mistakes', 'undo']);
    const lg = C.NAV.find(g => g.label === 'Learn'); if (lg && App.views.cheatsheet && (C.FORMULAS || []).length && !lg.items.some(x => x[0] === 'cheatsheet')) lg.items.push(['cheatsheet', 'Cheat sheet', 'sigma']);
    if (lg && App.views.mynotes && (C.SECTIONS || []).length && (C.SECTIONS[0].ideas || C.SECTIONS[0].bullets) && !lg.items.some(x => x[0] === 'mynotes')) lg.items.push(['mynotes', 'My notes', 'pen']);
  }
  function setCourse(id) {
    if (D && D.id === id) return;
    D = Courses[id]; QZ = D.quiz; store.load(id); augmentNav(D);
    document.documentElement.setAttribute('data-course', id);
    Search.index = null; buildNav(); courseHooks.forEach(fn => { try { fn(D); } catch (e) { console.error(e); } });
    if (App.auth && App.auth.user) App.auth.pullCourse(id, true).catch(() => {});
  }
  /* ---------- on-demand class loading: the shell ships light stubs (assets/courses-index.js); the full files come when a class is opened ---------- */
  const loading = {};
  App.loadCourse = function (id) {
    const C = Courses[id]; if (!C) return Promise.reject(new Error('Unknown class.'));
    const emit = (type, detail) => { try { document.dispatchEvent(new CustomEvent(type, { detail: Object.assign({ course: id }, detail) })); } catch (e) {} };
    if (C.pack && !C.loaded && App.packs) {   // a class uploaded in the admin panel (assets/classpacks.js): one JSON file from the server instead of scripts
      if (loading[id]) return loading[id];
      if (App.loadbar) App.loadbar.start();
      loading[id] = App.packs.load(id).then(F => { F.loaded = true; delete F.stub; applyVariant(F); Search.index = null; emit('mh:loaded', {}); return F; }).finally(() => { delete loading[id]; if (App.loadbar) App.loadbar.done(); });
      return loading[id];
    }
    if (C.loaded || !C.files || !C.files.length) { C.loaded = true; delete C.stub; return Promise.resolve(C); }
    if (loading[id]) return loading[id];
    const one = src => new Promise((res, rej) => { if (document.querySelector(`script[data-src="${src}"]`)) return res(); const sc = document.createElement('script'); sc.src = `assets/${src}.js?v=${BUILD}`; sc.dataset.src = src; const t0 = performance.now(); sc.onload = () => { emit('mh:file', { src, url: sc.src, ms: Math.round(performance.now() - t0) }); res(); }; sc.onerror = () => { sc.remove(); rej(new Error(`Could not download ${src}.js. Check your connection and try again.`)); }; document.head.appendChild(sc); });
    if (App.loadbar) App.loadbar.start();
    emit('mh:load', { files: C.files.slice() });
    loading[id] = (async () => { try { for (const f of C.files) await one(f); } finally { delete loading[id]; if (App.loadbar) App.loadbar.done(); } const F = Courses[id]; F.loaded = true; delete F.stub; applyVariant(F); Search.index = null; emit('mh:loaded', {}); return F; })();
    return loading[id];
  };
  App.loadCourses = ids => Promise.all(ids.map(id => App.loadCourse(id).catch(() => null)));
  App.courseLoaded = id => !!(Courses[id] && Courses[id].loaded);
  function renderLoading(root, id) {
    const C = Courses[id]; document.documentElement.setAttribute('data-course', id);
    $('#topbar-title').innerHTML = `<a class="crumb" href="#/${id}/dashboard" title="${esc(C.name)}">${esc(C.short)}</a><span class="crumb-sep">›</span><span class="crumb-cur">Loading…</span>`; document.title = `${C.code} · ${SITE}`;
    root.innerHTML = `<div class="page-load" data-course="${id}" aria-busy="true" aria-live="polite"><div class="eyebrow">${esc(C.code)}</div><h1 class="page-title">${esc(C.name)}</h1><p class="muted small">Opening the class…</p>${App.pixel ? `<div class="px-loader" aria-hidden="true">${App.pixel('bo', 3)}<span class="px-label">Loading<span class="px-dots"></span></span></div>` : ''}${App.skeleton ? App.skeleton(6) : ''}</div>`;
  }
  function renderLoadError(root, id, err) {
    root.innerHTML = `<div class="page-load"><div class="empty px-gameover">${App.pixel ? `<div class="px-go-art">${App.pixel('boSad', 5)}</div><div class="px-label px-go-title" aria-hidden="true">Game over</div>` : ''}<p>${esc(err && err.message || 'Could not load this class.')}</p>${App.pixel ? '<div class="px-label px-go-q" aria-hidden="true">Continue?</div>' : ''}<div class="row gap-sm mt-2" style="justify-content:center"><button class="btn sm primary" data-action="retry">${icon('rotate', 13)} Try again</button><a class="btn sm" href="#/">All classes</a></div></div></div>`;
    bind(root, { retry: () => render() });
  }
  function prefetchLast() {
    const lv = settings().lastVisit; const id = lv && lv.course; if (!id || !Courses[id] || Courses[id].loaded || !App.myCourses().includes(id)) return;
    const idle = global.requestIdleCallback || (fn => setTimeout(fn, 1500)); idle(() => { if (navigator.onLine === false) return; App.loadCourse(id).catch(() => {}); });
  }
  function route() {
    const raw = location.hash.replace(/^#\/?/, ''); const [path, qs] = raw.split('?'); const parts = path.split('/').filter(Boolean);
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    if (!parts.length || !Courses[parts[0]]) return { course: null, view: !parts.length ? 'home' : GLOBAL_VIEWS.includes(parts[0]) && App.views[parts[0]] ? parts[0] : 'notfound', param: parts.length && !GLOBAL_VIEWS.includes(parts[0]) ? parts.join('/') : parts.slice(1).join('/') || null, query };
    const view = parts[1] || 'dashboard';
    return { course: parts[0], view: App.views[view] || !Courses[parts[0]].loaded ? view : 'dashboard', param: parts.slice(2).join('/') || null, query };
  }
  function render() {
    const { course, view, param, query } = route();
    if (App.current && App.current.unmount) { try { App.current.unmount(); } catch {} }
    const app = $('.app'); const stale = $('#view'); const root = stale.cloneNode(false); stale.replaceWith(root); window.scrollTo(0, 0);
    if (query.asof !== undefined) { setSetting('asof', /^\d{4}-\d{2}-\d{2}$/.test(query.asof) ? query.asof : ''); }
    if (!course) {
      app.classList.add('landing'); document.documentElement.removeAttribute('data-course');
      if (view !== 'home') { const V = App.views[view]; App.current = V; document.title = `${V.title} · ${SITE}`; V.render(root, param, query, true); applyTheme(); }
      else { App.current = App.homeView || Landing; document.title = `${SITE} · Fall 2026`; App.current.render(root); }   // App.homeView: the iOS and Android apps' own start page (assets/app-native.js)
      typeset(root); if (App.auth) App.auth.bindLocks(root); afterRender(root); return;
    }
    app.classList.remove('landing');
    if (!Courses[course].loaded) { App.current = null; renderLoading(root, course); App.loadCourse(course).then(() => { if (route().course === course && $('#view') === root) render(); }).catch(err => { if ($('#view') === root) renderLoadError(root, course, err); }); afterRender(root); return; }
    setCourse(course);
    if (App.courseGate && App.courseGate(course, root, view)) { App.current = null; afterRender(root); return; }   // a class made from a syllabus is locked while the student has no plan (assets/create.js)
    const V = App.views[view]; App.current = V;
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    const actNav = $('.nav-item.active'); if (actNav) { const g = actNav.closest('.nav-group'); if (g && g.classList.contains('closed')) { g.classList.remove('closed'); const tg = g.previousElementSibling; if (tg) { tg.classList.add('open'); tg.setAttribute('aria-expanded', 'true'); } } }
    $('#topbar-title').innerHTML = `<a class="crumb" href="#/${D.id}/dashboard" title="${esc(D.name)}">${esc(D.short)}</a><span class="crumb-sep">›</span><span class="crumb-cur">${esc(V.title)}</span>`; document.title = `${V.title} · ${D.code} · ${SITE}`;
    if (App.auth && App.auth.ready && App.auth.gate(view) === 'hard') App.auth.renderLocked(root, V, view); else V.render(root, param, query);
    if (App.auth) App.auth.bindLocks(root);
    typeset(root); app.classList.remove('nav-open'); updateExamChip(); paintAsOf(); afterRender(root);
    if (!['settings', 'contact', 'policy'].includes(view)) { const h = $('.note-title, .rd-title, .page-title', root); setSetting('lastVisit', { hash: location.hash, label: `${D.short} · ${V.title}`, detail: h && !h.classList.contains('dash-greet') && !/^Good (morning|afternoon|evening)/.test(h.textContent) && h.textContent.trim() !== V.title ? h.textContent.trim().slice(0, 70) : '', course: D.id, t: Date.now() }); }
  }
  /* ---------- an address that matches no page ---------- */
  App.views.notfound = {
    title: 'Page not found',
    render(root, param) {
      const first = String(param || '').split('/')[0]; const classy = /^[a-z]{1,6}\d{2,4}[a-z]?$/.test(first);
      root.innerHTML = `<div class="landing-wrap"><header class="landing-top"><div><div class="eyebrow">${SITE}</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>${classy ? 'This class is not open to you' : 'Page not found'}</h1><p class="muted">${classy ? `There is no class <b>${esc(first)}</b> on Mathub that you can open. If your instructor set it up, join it with the class code they gave you.` : 'The link may be old or mistyped. Nothing was lost; pick where to go from here.'}</p></div></header>
        <div class="row gap-sm" style="flex-wrap:wrap"><a class="btn primary" href="#/">${icon('home', 14)} Start page</a>${classy ? `<a class="btn" href="#/class">${icon('users', 14)} Join a class with a code</a>${App.canRequest && App.canRequest() ? `<a class="btn" href="#/request?code=${encodeURIComponent(first.toUpperCase())}">${icon('path', 14)} Request this class</a>` : `<a class="btn" href="#/create">${icon('plus', 14)} Make it from its syllabus</a>`}` : `<button class="btn" data-action="search">${icon('search', 14)} Search Mathub</button>`}</div></div>`;
      bind(root, { search: () => { const b = $('.search-btn'); if (b) b.click(); } });
    }
  };
  /* ---------- invite landing: #/join?ref=CODE ---------- */
  App.views.join = {
    title: 'Join a classmate',
    render(root, param, query) {
      const ref = String(query.ref || param || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      root.innerHTML = `<div class="landing-wrap"><header class="landing-top"><div><div class="eyebrow">Mathub</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>You're invited</h1><p class="muted" id="join-sub">Checking the invite…</p></div><div class="row gap-sm"><span id="landing-account"></span></div></header><div class="panel lift" id="join-card"><div class="empty small">Loading…</div></div></div>`;
      const card = $('#join-card', root); const sub = $('#join-sub', root);
      if (!ref) { sub.textContent = 'That link is missing its code.'; card.innerHTML = `<div class="row gap-sm" style="flex-wrap:wrap"><a class="btn primary" href="#/">Open Mathub</a></div>`; return; }
      try { localStorage.setItem('mathub-ref', ref); } catch (e) {}
      fetch(`api/index.php?r=invite_info&ref=${ref}`, { credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub' } }).then(r => r.json()).then(j => {
        const name = j && j.ok ? j.name : ''; try { sessionStorage.setItem('mathub-ref-name', name || ''); } catch (e) {}
        sub.textContent = name ? `${name} uses Mathub for ${(j.courses || []).map(c => Courses[c] ? Courses[c].short : c).join(', ') || 'their classes'} and wants you in.` : 'A classmate wants you to study on Mathub.';
        card.innerHTML = `<div class="grid cols-2" style="align-items:center"><div><h2 style="margin-top:0">${name ? `Study with ${esc(name)}` : 'Study together'}</h2><p>Free topic notes, endless practice, flashcards on a schedule, deadline calendars, a focus room and a class board for Montana State classes. Sign up with your montana.edu email and you both earn the Invited and Recruiter badges.</p><div class="row gap-sm" style="flex-wrap:wrap">${App.auth && App.auth.user ? `<a class="btn primary" href="#/">You are already signed in · open Mathub</a>` : `<button class="btn primary lg" data-action="auth-signup">${icon('fire', 14)} Sign up free</button><button class="btn" data-action="auth-login">Log in</button>`}<a class="btn" href="#/">Look around first</a></div></div><div class="mascot-slot" data-size="120"></div></div>`;
        if (App.auth) App.auth.bindLocks(card); if (App.paintMascots) App.paintMascots();
      }).catch(() => { sub.textContent = 'Could not check the invite, but you can still sign up.'; card.innerHTML = `<div class="row gap-sm"><button class="btn primary" data-action="auth-signup">Sign up free</button><a class="btn" href="#/">Open Mathub</a></div>`; if (App.auth) App.auth.bindLocks(card); });
      const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
    }
  };
  /* ---------- usage counts for the admin growth tab: which pages get opened, flushed quietly ---------- */
  const Track = { counts: {}, timer: null, hit(k) { if (!/^[a-z]+:[a-z0-9_-]{1,30}$/.test(k)) return; this.counts[k] = (this.counts[k] || 0) + 1; if (!this.timer) this.timer = setTimeout(() => this.flush(), 90000); },
    flush() { clearTimeout(this.timer); this.timer = null; const ev = this.counts; this.counts = {}; if (!Object.keys(ev).length || !navigator.onLine || !(App.auth && App.auth.mode === 'server' && !App.auth.unreachable)) return; try { fetch('api/index.php?r=track', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Content-Type': 'application/json' }, body: JSON.stringify({ events: ev }) }).catch(() => {}); } catch (e) {} } };
  App.track = k => Track.hit(k); document.addEventListener('visibilitychange', () => { if (document.hidden) Track.flush(); });
  App.ago = t => { const m = Math.round((Date.now() - t) / 60000); if (m < 2) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago'); const d = Math.round(h / 24); return d + (d === 1 ? ' day ago' : ' days ago'); };
  App.resumeCard = (mine, opts = {}) => {
    const lv = settings().lastVisit; const all = COURSE_ORDER.filter(id => Courses[id]); const topics = all.reduce((n, id) => n + (Courses[id].SECTIONS || []).length, 0); const cards = all.reduce((n, id) => n + ((Courses[id].FLASHCARDS || []).length || Courses[id].flashcardCount || 0), 0);
    const strip = `<div class="stat-strip" aria-label="What is inside"><span><b>${all.length}</b> classes</span><span><b>${topics}</b> topic guides</span><span><b>${cards}</b> flashcards</span><span><b>∞</b> practice questions</span><span><b>$0</b> forever</span></div>`;
    if (opts.stripOnly) return strip; const tail = opts.noStrip ? '' : strip;
    if (!lv || !lv.hash || !Courses[lv.course] || !mine.includes(lv.course) || Date.now() - lv.t > 7 * 86400000 || Date.now() - lv.t < 20000) return tail;
    return `<a class="resume-card course-${lv.course}" href="${esc(lv.hash)}"><span class="resume-ic">${icon('play', 16)}</span><span class="resume-body"><small>Pick up where you left off · ${esc(App.ago(lv.t))}</small><b>${esc(lv.label)}${lv.detail ? ` · ${esc(lv.detail)}` : ''}</b></span>${icon('right', 16)}</a>` + tail;
  };
  const TABS_GLOBAL = [['#/', 'Home', 'home', 'home'], ['#/today', 'Today', 'flag', 'today'], ['#/focus', 'Focus', 'clock', 'focus'], ['#/forum', 'Board', 'chat', 'forum'], ['#/settings', 'Me', 'user', 'settings']];
  function paintTabbar(course, view) {
    let bar = $('#tabbar'); if (!bar) { bar = document.createElement('nav'); bar.id = 'tabbar'; bar.setAttribute('aria-label', 'Quick navigation'); document.body.appendChild(bar); }
    let tabs;
    if (course && D) { const learn = D.kind === 'writing' ? ['readings', 'Learn', 'book'] : ['notes', 'Learn', 'book']; const prac = D.quiz ? ['practice', 'Practice', 'list'] : D.kind === 'code' ? ['playground', 'Code', 'flask'] : ['calendar', 'Calendar', 'calendar']; tabs = [['dashboard', 'Home', 'home'], learn, prac, ['forum', 'Board', 'chat'], ['settings', 'Me', 'user']].map(([v, l, ic]) => [App.link(v), l, ic, v]); }
    else tabs = TABS_GLOBAL;
    bar.innerHTML = tabs.map(([href, label, ic, v]) => `<a class="tab-item${v === view ? ' active' : ''}" href="${href}"${v === view ? ' aria-current="page"' : ''}>${icon(ic, 20)}<span>${label}</span></a>`).join('');
  }
  const SHORTCUTS = [['Ctrl / ⌘ + K', 'Search notes, formulas and pages'], ['?', 'This list'], ['Esc', 'Close search, menus and dialogs'], ['← →', 'Previous or next paragraph in a reading, previous or next question in a lesson'], ['Space', 'Play or pause a reading'], ['Enter', 'Check an answer, then continue'], ['Ctrl / ⌘ + Enter', 'Run code in the playground'], ['Tab / Shift + Tab', 'Indent or outdent in the playground']];
  App.showShortcuts = () => {
    if ($('#shortcuts-modal')) return; const el = document.createElement('div'); el.className = 'modal-backdrop'; el.id = 'shortcuts-modal';
    el.innerHTML = `<div class="modal shortcuts-modal" role="dialog" aria-label="Keyboard shortcuts"><div class="row between mb-2"><div class="panel-title">${icon('zap')} Keyboard shortcuts</div><button class="icon-btn" data-action="close" aria-label="Close">${icon('x', 14)}</button></div><div class="shortcut-list">${SHORTCUTS.map(([k, d]) => `<div class="shortcut"><kbd>${esc(k)}</kbd><span>${esc(d)}</span></div>`).join('')}</div></div>`;
    document.body.appendChild(el); const close = () => App.dismiss(el); el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-action="close"]')) close(); }); const key = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', key); } }; document.addEventListener('keydown', key);
  };
  document.addEventListener('keydown', e => { if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.matches('input, textarea, select, [contenteditable]')) { e.preventDefault(); App.showShortcuts(); } });
  function initToTop() { if ($('#totop')) return; const b = document.createElement('button'); b.id = 'totop'; b.className = 'totop'; b.title = 'Back to top'; b.setAttribute('aria-label', 'Back to top'); b.innerHTML = icon('up', 16); b.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' })); document.body.appendChild(b); let t = 0; window.addEventListener('scroll', () => { if (t) return; t = setTimeout(() => { t = 0; b.classList.toggle('show', window.scrollY > 400); }, 120); }, { passive: true }); }
  const NAV_ICON = { planner: 'path', gpa: 'award' };   // their own marks instead of a second calendar and a second calculator
  const trailSeen = new Set();
  // the winding trail between the run nodes: measured after layout so it follows the nodes at any width
  function drawTrail(root) {
    const wrap = $('.trail-board .tb-climb', root); const svg = wrap && $('.tb-path', wrap); if (!svg) return;
    const paint = () => {
      const wr = wrap.getBoundingClientRect(); if (!wr.width || !wr.height) return;
      const at = el => { const r = el.getBoundingClientRect(); return [Math.round(r.left + r.width / 2 - wr.left), Math.round(r.top + r.height / 2 - wr.top)]; };
      const pts = $$('.tb-node', wrap).map(at).sort((a, b) => b[1] - a[1]); const flag = $('.tb-flag', wrap), base = $('.tb-base-sign', wrap);
      if (base) { const b = at(base); pts.unshift([pts.length ? pts[0][0] : b[0], b[1] - 4]); }
      if (flag) { const f = flag.getBoundingClientRect(); pts.push([Math.round(f.left + 7 - wr.left), Math.round(f.bottom - 2 - wr.top)]); }
      if (pts.length < 2) return;
      let d = `M${pts[0][0]} ${pts[0][1]}`; for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; const my = Math.round((y0 + y1) / 2); d += ` C${x0} ${my} ${x1} ${my} ${x1} ${y1}`; }
      svg.setAttribute('viewBox', `0 0 ${Math.round(wr.width)} ${Math.round(wr.height)}`); svg.setAttribute('width', Math.round(wr.width)); svg.setAttribute('height', Math.round(wr.height));
      svg.innerHTML = `<path class="tb-path-bed" d="${d}"/><path class="tb-path-line" d="${d}"/>`;
    };
    paint(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(paint);
    if (global.ResizeObserver) { const ro = new ResizeObserver(() => { if (!wrap.isConnected) { ro.disconnect(); return; } paint(); }); ro.observe(wrap); }
  }
  App.drawTrail = drawTrail;   // classes whose trail board already drew itself this session
  function initTabs(root) {
    $$('.dash-tabs', root).forEach(bar => { const key = bar.dataset.store; const panes = bar.nextElementSibling; if (!panes) return; const pick = (id, save) => { $$('.tab', bar).forEach(b => { b.classList.toggle('on', b.dataset.tab === id); b.setAttribute('aria-selected', String(b.dataset.tab === id)); }); $$(':scope > .pane', panes).forEach(pn => { pn.hidden = pn.dataset.pane !== id; }); if (key && save) setSetting(key, id); slide(save); };
      // one pill slides between tabs instead of each tab lighting up on its own (transitions.dev "tabs sliding")
      let pill = $(':scope > .tab-pill', bar); if (!pill) { pill = document.createElement('span'); pill.className = 'tab-pill'; pill.setAttribute('aria-hidden', 'true'); bar.prepend(pill); bar.classList.add('has-pill'); }
      const slide = animate => { const b = $('.tab.on', bar); if (!b || !b.offsetWidth) return; if (!animate) pill.style.transition = 'none'; pill.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`; pill.style.width = b.offsetWidth + 'px'; pill.style.height = b.offsetHeight + 'px'; if (!animate) { void pill.offsetWidth; pill.style.transition = ''; } };
      if (global.ResizeObserver) { const ro = new ResizeObserver(() => { if (!bar.isConnected) { ro.disconnect(); return; } slide(false); }); ro.observe(bar); }
      bar.addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) pick(b.dataset.tab, true); }); const saved = key ? settings()[key] : null; const first = $('.tab', bar); pick(saved && $(`.tab[data-tab="${saved}"]`, bar) ? saved : first.dataset.tab, false); });
  }
  App.initTabs = initTabs;
  function afterRender(root) {
    initTabs(root); initToTop(); { const r = route(); paintTabbar(r.course, r.course ? r.view : (r.view === 'home' ? 'home' : r.view)); if (!r.course) prefetchLast(); const PRINTABLE = ['notes', 'formulas', 'course', 'calendar', 'planner', 'exam', 'checklist', 'gpa']; const pa = $('.page-head .page-actions', root) || (r.view === 'notes' ? $('.note-head', root) : null); if (pa && PRINTABLE.includes(r.view) && !$('.print-btn', pa)) pa.insertAdjacentHTML('beforeend', `<button class="btn sm print-btn" data-action="print-page" title="Print or save as PDF">${icon('print', 13)} Print</button>`); }
    (App.onRender || []).forEach(fn => { try { fn(root, route()); } catch (e) { console.error(e); } });
    if (App.motionRender) App.motionRender(root); { const r = route(); App.track('view:' + (r.course ? r.view : (r.view === 'home' ? 'landing' : r.view))); } if (App.paintStats) { App.paintStats(); App.paintMascots(); App.countUp(root); } if (App.paintQuests) App.paintQuests(); if (App.paintLeagueWidgets) App.paintLeagueWidgets(root); }
  App.rerender = () => render();
  App.currentSectionOf = C => currentSection(C);
  App.paintAnnouncement = root => paintAnnouncement(root);   // the apps' own start page shows the admin announcement too
  App.inCourse = () => !!route().course;
  App.settingsLink = () => App.inCourse() ? App.link('settings') : '#/settings';
  App.inboxLink = () => App.inCourse() ? App.link('forum', 'inbox') : '#/forum/inbox';
  function paintAsOf() {
    const ov = asOf(); let el = $('#asof-chip');
    if (!ov) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('button'); el.id = 'asof-chip'; el.className = 'exam-chip asof'; el.dataset.action = 'asof-clear'; $('#topbar .topbar-actions').prepend(el); }
    el.innerHTML = `${icon('clock', 13)} <span>Viewing as ${esc(fmtDate(ov))}</span> <b>clear</b>`; el.title = 'You are previewing the site as of another date. Click to return to today.';
  }
  function updateExamChip() {
    const ex = nextExam(D); const chip = $('#exam-chip');
    if (!ex) { chip.innerHTML = `${icon('flag', 14)} <span>${semesterState(D).phase === 'after' ? 'Semester complete' : (D.EXAMS || []).length ? 'No exams left' : 'No exams'}</span>`; return; }
    const st = examStatus(ex); chip.innerHTML = `${icon('flag', 14)} <span>${esc(ex.name)} ·</span> <b>${esc(st.chip)}</b>`;
  }
  function applyTheme() {
    if (App.applySkin) App.applySkin(); if (App.applyMotion) App.applyMotion();
    const t = settings().theme || 'system';
    if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    $$('.theme-btn').forEach(b => b.innerHTML = icon(dark ? 'sun' : 'moon', 16));
  }
  function toggleTheme() { if (App.themeFade) App.themeFade(); const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches); setSetting('theme', isDark ? 'light' : 'dark'); applyTheme(); }
  /* The sidebar groups pages by what you are doing, not by where they came from: the everyday pages (Study,
     Plan) are open, everything else waits in collapsed groups. C.NAV stays the source list; this is only the view. */
  const NAV_PLAN = [['Study', ['dashboard', 'notes', 'readings', 'playground', 'formulas', 'flashcards', 'practice', 'exam']], ['Plan', ['calendar', 'path', 'planner', 'grades', 'gpa']], ['More tools', ['mistakes', 'blitz', 'cheatsheet', 'mynotes', 'textbook', 'phonetics']], ['Community', ['forum', 'challenge', 'meet', 'mock', 'contribute', 'leagues', 'people']], ['Class info', ['course', 'resources', 'settings']]];
  function groupNav(NAV) {
    const all = NAV.flatMap(g => g.items); const used = new Set();
    const groups = NAV_PLAN.map(([label, ids]) => ({ label, items: ids.map(id => all.find(x => x[0] === id)).filter(x => x && !used.has(x[0]) && used.add(x[0])) }));
    groups.find(g => g.label === 'More tools').items.push(...all.filter(x => !used.has(x[0]) && used.add(x[0])));   // course tools (grapher, labs, solvers, scratchpad…) and anything new
    return groups.filter(g => g.items.length);
  }
  App.groupNav = groupNav;
  function buildNav() {
    $('#brand-code').textContent = D.code; $('#brand-name').innerHTML = `${esc(D.name)}<small>${esc(D.term)}</small>`;
    const mine = App.myCourses(); if (D && !mine.includes(D.id)) mine.push(D.id);
    $('#course-switch').innerHTML = COURSE_ORDER.filter(id => Courses[id] && mine.includes(id)).map(id => `<a class="switch-btn${id === D.id ? ' on' : ''}" data-c="${id}" href="#/${id}/dashboard" title="${esc(Courses[id].name)}">${esc(Courses[id].short)}</a>`).join('') + `<a class="switch-btn home" href="#/" title="All courses">${icon('grid', 14)}</a>` + (App.views.request && App.canRequest && App.canRequest() ? `<a class="switch-btn req" href="#/request" title="Send us the syllabus of a class that is not on Mathub yet">${icon('file', 13)} Request a class</a>` : App.views.create ? `<a class="switch-btn req" href="#/create" title="Make a class that is not on Mathub yet from its syllabus">${icon('plus', 13)} Make a class</a>` : '');
    const staff = App.auth && App.auth.user && App.auth.user.mod ? [{ label: App.auth.user.admin ? 'Admin' : 'Moderation', items: [['admin', 'Admin panel', 'shield']] }] : [];
    const cur = (location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[1]) || 'dashboard';
    const openMap = Object.assign({ Study: true, Plan: true, Admin: true, Moderation: true }, settings().navOpen || {});
    $('#sidebar-nav').innerHTML = groupNav(D.NAV).concat(staff).map(gp => { const o = !!openMap[gp.label] || gp.items.some(x => x[0] === cur); return `<button class="nav-label nav-toggle${o ? ' open' : ''}" data-action="navgroup" data-g="${esc(gp.label)}" aria-expanded="${o}"><span>${gp.label}</span><small>${gp.items.length}</small>${icon('chevron', 12)}</button><div class="nav-group${o ? '' : ' closed'}" data-g="${esc(gp.label)}"><div class="nav-group-in">` + gp.items.map(([id, label, ic]) => `<button class="nav-item" data-view="${id}" data-action="nav">${icon(NAV_ICON[id] || ic)}<span>${label}</span></button>`).join('') + '</div></div>'; }).join('');
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === cur));
  }
  App.rebuildNav = () => { if (D) buildNav(); };
  App.forgetCourse = () => { D = null; QZ = null; };   // the next render sets the class up again (a class pack that changed under the open page)
  function buildLayout() {
    const app = $('.app');
    bind($('#sidebar'), { nav: el => App.go(el.dataset.view), navgroup: el => { const m = Object.assign({}, settings().navOpen || {}); const now = el.classList.contains('open'); m[el.dataset.g] = !now; setSetting('navOpen', m); el.classList.toggle('open', !now); el.setAttribute('aria-expanded', String(!now)); const g = el.nextElementSibling; if (g) g.classList.toggle('closed', now); }, 'pomo-toggle': () => Pomo.toggle(), 'pomo-reset': () => Pomo.reset(), 'pomo-mode': () => Pomo.switchMode() });
    document.addEventListener('click', e => { if (e.target.closest('[data-action="print-page"]')) global.print(); });
    bind($('#topbar'), { menu: () => app.classList.toggle('nav-open'), search: () => Search.open(), theme: toggleTheme, 'exam-chip': () => App.go('dashboard'), 'asof-clear': () => { setSetting('asof', ''); render(); toast('Back to today'); }, inbox: () => { if (App.auth && !App.auth.user) App.auth.open('login'); else App.go('forum', 'inbox'); } });
    $('#nav-backdrop').addEventListener('click', () => app.classList.remove('nav-open'));
    applyTheme(); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); Search.open(); } if (e.key === 'Escape') { Search.close(); app.classList.remove('nav-open'); } });
    window.addEventListener('hashchange', render);
  }

  /* ---------- Pomodoro ---------- */
  const Pomo = {
    mode: 'focus', left: 25 * 60, running: false, tick: null,
    len() { return this.mode === 'focus' ? 25 * 60 : 5 * 60; },
    draw() { const m = Math.floor(this.left / 60), s = this.left % 60; $('#pomo-time').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; $('#pomo-mode').textContent = this.mode === 'focus' ? 'Focus' : 'Break'; $('#pomo-toggle').innerHTML = icon(this.running ? 'pause' : 'play', 15); },
    toggle() { this.running ? this.pause() : this.start(); },
    accum: 0,
    start() { if (this.running) return; this.running = true; this.tick = setInterval(() => { this.left--; if (this.mode === 'focus') this.accum++; if (this.left <= 0) this.finish(); this.draw(); }, 1000); this.draw(); },
    pause() { this.running = false; clearInterval(this.tick); this.flush(); this.draw(); },
    reset() { this.pause(); this.left = this.len(); this.draw(); },
    switchMode() { this.mode = this.mode === 'focus' ? 'break' : 'focus'; this.reset(); },
    flush() { const mins = Math.floor(this.accum / 60); if (mins >= 1 && D) { const ss = store.get('sessions', []); const t = todayISO(); const last = ss[ss.length - 1]; if (last && last.d === t) last.m += mins; else ss.push({ d: t, m: mins }); if (ss.length > 400) ss.splice(0, ss.length - 400); store.set('sessions', ss); markActivity(); if (App.addXP) App.addXP(mins); if (App.quest) App.quest('focus', mins); } this.accum = this.accum % 60; },
    finish() { this.pause(); this.beep(); if (D) markActivity(); toast(this.mode === 'focus' ? 'Focus block done. Take a 5-minute break.' : 'Break over. Back to it.', 4000); this.mode = this.mode === 'focus' ? 'break' : 'focus'; this.left = this.len(); },
    beep() { try { const ac = new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), gn = ac.createGain(); o.connect(gn); gn.connect(ac.destination); o.frequency.value = 880; gn.gain.value = 0.08; o.start(); setTimeout(() => { o.stop(); ac.close(); }, 500); } catch {} }
  };

  /* ---------- Search (per course) ---------- */
  const Search = {
    index: null, sel: 0, results: [], course: 'all',
    strip(str) { return String(str).replace(/<[^>]+>/g, '').replace(/\$[^$]*\$/g, m => m.replace(/\\[a-zA-Z]+|[{}$^_\\]/g, ' ')); },
    build() {
      const strip = this.strip; const ix = []; const goC = (c, view, param, query) => () => { location.hash = '#/' + c + '/' + view + (param ? '/' + encodeURIComponent(param) : '') + (query ? '?' + new URLSearchParams(query).toString() : ''); };
      [['today', 'Today', 'plan for today due cards lesson challenge'], ['sheet', 'Character sheet', 'character sheet abilities level class d20 dnd stats'], ['focus', 'Focus room', 'focus timer pomodoro study session sounds'], ['resources', 'Resources', 'resources links tutoring textbook videos help'], ['guides', 'Study guides', 'guides how to study exam anxiety notes office hours'], ['tools', 'Tools', 'calculator unit converter citation word counter significant figures'], ['recap', 'Your week', 'weekly recap stats share'], ['gpa', 'GPA calculator', 'gpa grade point average semester cumulative'], ['forum', 'Discussions', 'board forum posts questions classmates'], ['people', 'People', 'classmates members badges'], ['leagues', 'Leagues', 'weekly league xp rank'], ['badges', 'Your badges', 'badges achievements'], ['settings', 'Settings', 'account settings classes notifications theme email'], ['whatsnew', "What's new", 'changelog updates releases news'], ['contact', 'Contact', 'contact creator nikoloz nonikashvili phone email help feedback']].forEach(([id, label, key]) => ix.push({ type: 'page', c: '', t: label, s: SITE, go: () => { location.hash = '#/' + id; }, key: (label + ' ' + key).toLowerCase() }));
      (global.MATHUB_RESOURCES ? global.MATHUB_RESOURCES.ITEMS : []).forEach(it => ix.push({ type: 'resource', c: Courses[it.g] ? it.g : '', t: it.t, s: `Resource · ${it.g === 'general' ? 'every class' : it.g === 'msu' ? 'Montana State' : Courses[it.g] ? Courses[it.g].short : it.g}`, go: () => { if (/^https?:/.test(it.u)) global.open(it.u, '_blank', 'noopener'); else location.hash = it.u; }, key: (it.t + ' ' + it.d + ' ' + (it.tags || []).join(' ')).toLowerCase() }));
      (global.MATHUB_GUIDES || []).forEach(g => ix.push({ type: 'guide', c: '', t: g.title, s: `Guide · ${g.minutes} min`, go: () => { location.hash = '#/guides/' + g.id; }, key: (g.title + ' ' + g.blurb + ' ' + g.tags.join(' ')).toLowerCase() }));
      COURSE_ORDER.filter(id => Courses[id]).forEach(id => {
        const C = Courses[id]; const secLabelC = sid => { const x = (C.SECTIONS || []).find(z => z.id === sid); return x ? x.label : sid; };
        if (C.NAV) C.NAV.forEach(gp => gp.items.forEach(([v, label]) => ix.push({ type: 'page', c: id, t: label, s: `${C.short} · ${gp.label}`, go: goC(id, v), key: (label + ' ' + C.short + ' ' + C.code).toLowerCase() })));
        else ix.push({ type: 'page', c: id, t: `${C.short} dashboard`, s: C.name, go: goC(id, 'dashboard'), key: (C.short + ' ' + C.code + ' ' + C.name + ' notes practice flashcards calendar').toLowerCase() });
        (C.SECTIONS || []).forEach(sec => ix.push({ type: 'notes', c: id, t: `${sec.label} ${sec.title}`, s: `${C.short} · Unit ${sec.unit}`, go: goC(id, 'notes', sec.id), key: (`${sec.label} ${sec.title} ` + (sec.ideas || []).map(strip).join(' ') + ' ' + (sec.pitfalls || []).map(strip).join(' ')).toLowerCase() }));
        (C.FORMULAS || []).forEach(gp => gp.items.forEach(f => ix.push({ type: 'formula', c: id, t: f.n, s: `${C.short} · ${gp.group}`, go: goC(id, 'formulas', null, { q: f.n }), key: (f.n + ' ' + gp.group + ' ' + strip(f.t ? '$' + f.t + '$' : (f.c || ''))).toLowerCase() })));
        (C.FLASHCARDS || []).forEach(cd => ix.push({ type: 'card', c: id, t: strip(cd.f), s: `${C.short} · ${cd.sec ? secLabelC(cd.sec) : 'Unit ' + cd.unit}`, go: goC(id, 'flashcards', cd.id), key: (strip(cd.f) + ' ' + strip(cd.b)).toLowerCase() }));
        (C.CALENDAR || []).forEach(e => ix.push({ type: 'calendar', c: id, t: e[2], s: `${C.short} · ${fmtDate(e[0])}`, go: goC(id, 'calendar', e[0]), key: (e[2] + ' ' + fmtDate(e[0], true)).toLowerCase() }));
        const T = (C.quiz && C.quiz.TOPICS) || C.quizTopics || {}; Object.entries(T).forEach(([tid, t]) => ix.push({ type: 'practice', c: id, t: `Practice: ${t.label}`, s: `${C.short} · ${secLabelC(t.sec)}`, go: goC(id, 'practice', null, { topics: tid }), key: ('practice quiz ' + t.label + ' ' + C.short + ' ' + secLabelC(t.sec)).toLowerCase() }));
      });
      this.index = ix;
    },
    open() {
      if (!this.index) this.build(); const seg = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]; this.course = Courses[seg] ? seg : 'all';
      if ($('#search-modal')) { $('#search-input').focus(); return; }
      const m = document.createElement('div'); m.className = 'modal-backdrop'; m.id = 'search-modal';
      const chips = [['all', 'All classes']].concat(COURSE_ORDER.filter(id => Courses[id]).map(id => [id, Courses[id].short]));
      m.innerHTML = `<div class="modal" role="dialog" aria-label="Search"><input id="search-input" class="search-input" placeholder="Search notes, formulas, flashcards, calendars, pages…" autocomplete="off" aria-label="Search Mathub"><div class="search-chips" id="search-chips">${chips.map(([id, l]) => `<button type="button" class="chip toggle${id === this.course ? ' on' : ''}" data-c="${id}">${esc(l)}</button>`).join('')}</div><div class="search-results" id="search-results"></div><div class="search-foot"><span><span class="kbd">↑↓</span> move</span><span><span class="kbd">Enter</span> open</span><span><span class="kbd">Esc</span> close</span></div></div>`;
      document.body.appendChild(m); m.addEventListener('click', e => { if (e.target === m) this.close(); });
      const inp = $('#search-input'); inp.focus(); inp.addEventListener('input', () => this.query(inp.value));
      const missing = App.myCourses().filter(id => Courses[id] && !Courses[id].loaded); if (missing.length) App.loadCourses(missing).then(r => { if (r.some(Boolean) && $('#search-modal')) { this.index = null; this.query(inp.value); } });
      inp.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); this.sel = Math.min(this.sel + 1, this.results.length - 1); this.paint(); } else if (e.key === 'ArrowUp') { e.preventDefault(); this.sel = Math.max(this.sel - 1, 0); this.paint(); } else if (e.key === 'Enter') { const r = this.results[this.sel]; if (r) { this.close(); r.go(); } } });
      on($('#search-chips'), 'click', '.chip', el => { this.course = el.dataset.c; $$('#search-chips .chip').forEach(c => c.classList.toggle('on', c === el)); this.query(inp.value); inp.focus(); });
      on($('#search-results'), 'click', '.search-item', el => { const r = this.results[+el.dataset.i]; if (r) { this.close(); r.go(); } });
      this.query('');
    },
    close() { const m = $('#search-modal'); if (m) App.dismiss(m); },
    query(q) {
      if (!this.index) this.build();
      q = q.trim().toLowerCase(); const words = q.split(/\s+/).filter(Boolean); const pool = this.index.filter(r => this.course === 'all' || !r.c || r.c === this.course);
      this.results = !q ? pool.filter(r => r.type === 'page').slice(0, 14) : pool.map(r => ({ r, score: words.reduce((sc, w) => sc + (r.t.toLowerCase().includes(w) ? 3 : r.key.includes(w) ? 1 : -100), 0) + (D && r.c === D.id ? 0.5 : 0) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 30).map(x => x.r);
      { const m = q.toUpperCase().replace(/[\s\-_.]+/g, ' ').match(/^([A-Z]{1,5}) ?([0-9]{3}[A-Z]{0,3})$/); const bare = c => String(c).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/([0-9])[A-Z]+$/, '$1');   // a course code Mathub does not have: offer to request it
        if (m && App.views.request && !COURSE_ORDER.some(id => Courses[id] && bare(Courses[id].code) === bare(m[1] + m[2]))) { const code = `${m[1]} ${m[2]}`; this.results.unshift(App.canRequest && App.canRequest() ? { type: 'request', t: `Request ${code}`, s: 'Not on Mathub yet. Send its syllabus and we will build it.', key: '', go: () => { location.hash = '#/request?code=' + encodeURIComponent(code); } } : { type: 'create', t: `Make ${code} from its syllabus`, s: 'Not on Mathub yet. Drop in its syllabus and Bo writes the class.', key: '', go: () => { location.hash = '#/create'; } }); } }
      this.sel = 0; this.paint();
    },
    paint() { const box = $('#search-results'); if (!box) return; box.innerHTML = this.results.length ? this.results.map((r, i) => `<div class="search-item${i === this.sel ? ' active' : ''}" data-i="${i}"><span class="type">${r.type}</span><span class="t">${esc(r.t)}</span><span class="s">${r.c && Courses[r.c] ? `<span class="chip course-${r.c}">${esc(Courses[r.c].short)}</span> ` : ''}${esc(r.s)}</span></div>`).join('') : '<div class="empty small">No matches. Try another word or another class.</div>'; const a = $('.search-item.active', box); if (a) a.scrollIntoView({ block: 'nearest' }); }
  };

  /* ======================================================
     Landing page (course chooser)
     ====================================================== */
  const Landing = {
    title: SITE,
    render(root) {
      const t = todayISO(); const d = today();
      const mineIds = App.myCourses(); const showAll = Landing.showAll || mineIds.length === COURSE_ORDER.filter(id => Courses[id]).length;
      const cards = COURSE_ORDER.filter(id => Courses[id] && (showAll || mineIds.includes(id))).map(id => {
        const C = Courses[id]; const ex = nextExam(C); const st = ex ? examStatus(ex) : null; const ss = semesterState(C);
        const cur = currentSection(C);
        const chip = ss.phase === 'after' ? 'Semester complete' : ss.phase === 'before' ? `Starts ${esc(shortDate(C.SEMESTER.start))}` : ex ? `${esc(ex.name)} · ${esc(st.chip)}` : (C.EXAMS || []).length ? 'Exams done' : 'No exams';
        const writing = C.kind === 'writing'; const rp = writing && App.readingProgress ? App.readingProgress(C) : null;
        const nodes = !writing && App.pathNodes ? App.pathNodes(C) : []; const curNode = nodes.find(n => n.state === 'current'); const mastered = writing ? (rp ? rp.done : 0) : nodes.filter(n => n.state === 'done').length; const total = writing ? (rp ? rp.total : 0) : nodes.length; const mpct = total ? Math.round(100 * mastered / total) : 0; const RC = 2 * Math.PI * 15;
        const ctaHref = writing ? (rp && rp.next ? `#/${id}/reading/${rp.next.id}` : `#/${id}/readings`) : `#/${id}/lesson${curNode ? '?topics=' + encodeURIComponent(curNode.t) : ''}`;
        const ctaText = writing ? (rp && rp.next ? `${rp.started ? 'Resume' : 'Listen'}: ${esc(rp.next.title)}` : 'All readings finished') : (curNode ? 'Continue: ' + esc(curNode.label) : 'Start a lesson');
        const nowLabel = writing ? 'This week' : (ss.phase === 'after' ? 'Last topic' : ss.phase === 'before' ? 'First topic' : 'Now covering');
        return `<div class="course-card ${id}" data-action="open-course" data-c="${id}" role="link" tabindex="0">
          <div class="course-card-head">${App.classSprite ? `<span class="cc-art" aria-hidden="true">${App.classSprite(id, 5)}</span>` : ''}<span class="course-idline"><span class="course-code">${esc(C.code)}</span>${App.archetype ? `<span class="arch-chip" title="${esc(App.archetype(id).line)}">${icon(App.archetype(id).icon, 13)} ${esc(App.archetype(id).name)}</span>` : ''}</span><span class="chip exam">${chip}</span></div>
          <h2>${esc(C.name)}</h2><p class="muted">${esc(C.tagline || '')}</p>
          <div class="course-meta">
            <div><span class="eyebrow">${nowLabel}</span><div>${esc(cur.label)} ${esc(cur.title)}</div></div>
            <div><span class="eyebrow">${writing ? 'Next deadline' : 'Next exam'}</span><div>${ex ? esc(ex.dateLabel || fmtDate(ex.date, true)) : ss.phase === 'after' ? 'All done' : '—'}</div></div>
          </div>
          <div class="course-foot"><a class="btn course-open" href="${ctaHref}">${icon(writing ? 'book' : 'play', 14)} ${ctaText}</a>${mpct ? `<span class="course-ring" title="${mastered} of ${total} ${writing ? 'readings finished' : 'topics mastered'}"><svg viewBox="0 0 36 36" width="38" height="38"><circle class="ring-bg" cx="18" cy="18" r="15"/><circle class="ring-fg" cx="18" cy="18" r="15" stroke-dasharray="${RC.toFixed(2)}" stroke-dashoffset="${(RC * (1 - mpct / 100)).toFixed(2)}"/></svg><small>${mpct}%</small></span>` : ''}</div></div>`;
      }).join('');
      const merged = COURSE_ORDER.filter(id => Courses[id] && mineIds.includes(id)).flatMap(id => upcomingDeadlines(Courses[id], 8).map(x => Object.assign({ course: Courses[id] }, x))).filter(x => daysBetween(t, x.date) <= 7).sort((a, b) => a.date.localeCompare(b.date));
      const first = Courses[COURSE_ORDER[0]] || { term: '' }; const ss = semesterState(first);
      const greeting = d.getHours() < 12 ? 'this morning' : d.getHours() < 18 ? 'this afternoon' : 'tonight';
      const sub = ss.phase === 'before' ? `Classes start ${esc(fmtDate(first.SEMESTER.start, true))}. Get a head start on the first topics.` : ss.phase === 'after' ? 'The semester is over. Everything stays here for review.' : `Which class is giving you trouble ${greeting}?`;
      const guest = App.guest(); const fresh = !(App.xpTotal && App.xpTotal()) && !settings().lastVisit;   // someone who has not studied here yet
      const startHere = fresh ? `<div class="start-steps">${[['1', 'Pick a class', 'Your classes are just above. Tap one to open it.'], ['2', 'Take a 5-minute lesson', 'A few questions with worked answers. No setup.'], ['3', guest ? 'Sign up to keep it' : 'Come back tomorrow', guest ? 'A free montana.edu account saves your progress everywhere.' : 'Your streak and daily plan pick up where you left off.']].map(([n, h, p]) => `<div class="start-step"><span class="ss-n">${n}</span><div><b>${h}</b><small>${p}</small></div></div>`).join('')}</div>` : '';
      const tabs = [['week', 'This week', 'calendar'], ['community', 'Community', 'chat'], ['guides', 'Guides', 'book']].concat(guest ? [['inside', 'What is inside', 'grid']] : []);
      // students who have studied here get the apps' start page: the class they pick, its next exam, the next lesson and the unit they are in, beside today across all classes (assets/home.js)
      const chosen = Array.isArray(settings().courses) && settings().courses.length; const lv = settings().lastVisit || {};
      const homeIds = !fresh && App.home ? (chosen ? mineIds : [...new Set([lv.course].filter(id => id && Courses[id] && !Courses[id].preview).concat(mineIds))].slice(0, 6)) : [];
      const quickRow = `<div class="quick-row"><a class="btn sm hero-focus" href="#/focus">${icon('clock', 14)} Focus timer</a><button class="btn sm d20-btn" data-roll="all" title="Roll a d20 and let it pick what to study">${icon('d20', 15)} Roll a quest</button><a class="btn sm" href="#/gpa">${icon('calc', 14)} GPA calculator</a><button class="btn sm" data-action="choose">${icon('sliders', 14)} Choose classes</button></div>`;
      const nextBody = homeIds.length ? App.home.webHome(homeIds, { side: `${App.resumeCard ? App.resumeCard(mineIds, { noStrip: true }) : ''}${quickRow}` }) : `${fresh ? startHere : (App.todaySummary ? App.todaySummary() : '')}${App.resumeCard ? App.resumeCard(mineIds, { noStrip: true }) : ''}${quickRow}`;
      root.innerHTML = `<div class="landing-wrap">
        <header class="landing-top hero"><div><h1 class="landing-title brand-title"><span class="logo-mark">${App.logoSvg(50)}</span>${App.wordmark()}</h1>${App.tagline('hero-tag')}<p class="hero-sub">${sub}</p><p class="hero-when">${esc(fmtDate(t, true))}${first.term ? ` · ${esc(first.term)}` : ''}${ss.phase === 'during' ? ` · Week ${ss.week}` : ''}</p>${guest ? '<p class="muted small hero-note">Made by an MSU student from each class’s real syllabus, exam dates and Canvas calendar: what is on your next exam, practice until you are ready, and notes and flashcards for every topic. Free with a montana.edu email.</p>' : ''}${(() => { const soon = mineIds.map(id => ({ C: Courses[id], ex: nextExam(Courses[id]) })).filter(x => x.ex && x.ex.date >= t).sort((a, b) => a.ex.date.localeCompare(b.ex.date))[0]; if (!soon) return ''; const n = daysBetween(t, soon.ex.date); return `<a class="hero-count" href="#/${soon.C.id}/dashboard"><span class="hc-num count" data-count="${n}">${n}</span><span class="hc-body"><small>day${n === 1 ? '' : 's'} until ${esc(soon.ex.name)}</small><b>${esc(soon.C.short)} · ${esc(soon.ex.dateLabel || fmtDate(soon.ex.date, true))}${App.readiness ? (() => { const r = App.readiness(soon.C.id); return r && r.ok && r.score > 0 ? ` · ${r.score}% ready` : ''; })() : ''}</b></span>${icon('right', 14)}</a>`; })()}</div><div class="row gap-sm hero-actions"><a class="btn primary sm hero-today" href="#/today">${icon('flag', 14)} Today</a><a class="btn sm hero-faculty" href="#/teach" title="Mathub Faculty: write your syllabus and run your class">${icon('file', 14)} For professors</a><button class="icon-btn" data-action="search" aria-label="Search" title="Search (Ctrl K)">${icon('search', 15)}</button><button class="icon-btn amb-top" aria-label="Focus sounds and music" aria-expanded="false" title="Focus sounds and music">${icon('volume', 15)}</button><span id="landing-account"></span><button class="icon-btn theme-btn" data-action="theme" aria-label="Toggle theme"></button></div><div class="mascot-slot hero-mascot" data-size="112"></div><div class="px-skyline" aria-hidden="true"></div></header>
        <div id="announcement-slot"></div>
        <section class="land-sec land-next" aria-labelledby="lsec-next"><h2 class="sec-title" id="lsec-next">${fresh ? 'Start here' : 'Your next step'}</h2>
          ${App.inviteBanner ? App.inviteBanner() : ''}${App.recapBanner ? App.recapBanner() : ''}${nextBody}
        </section>
        <section class="land-sec" aria-labelledby="lsec-classes"><div class="sec-h"><h2 class="sec-title" id="lsec-classes">${showAll && mineIds.length < COURSE_ORDER.filter(id => Courses[id]).length ? 'All classes' : 'Your classes'}</h2>${mineIds.length < COURSE_ORDER.filter(id => Courses[id]).length ? `<button class="linkbtn small" data-action="show-all">${showAll ? 'Show only mine' : 'Show all classes'}</button>` : ''}</div>
          <div class="course-grid">${cards}</div>
          ${App.requestLink ? `<div class="rq-under">${App.requestLink()}${App.createLink ? App.createLink() : ''}${App.teachLinks ? App.teachLinks() : ''}</div>` : ''}
        </section>
        <section class="land-sec" aria-labelledby="lsec-more"><h2 class="sec-title" id="lsec-more">Explore</h2>
        <div class="dash-tabs landing-tabs" data-store="landTab" role="tablist">${tabs.map(([k, l, ic]) => `<button class="tab" data-tab="${k}" role="tab">${icon(ic, 14)}<span>${l}</span></button>`).join('')}</div>
        <div class="panes">
        <div class="pane" data-pane="week"><div class="grid cols-2">
        <div class="panel"><div class="panel-h"><div class="panel-title">${icon('clock')} Next seven days, all classes</div><span class="small muted">syllabus rules, exams and drop dates</span></div>
          ${merged.length ? `<div class="table-wrap"><table class="table compact"><tbody>${merged.slice(0, 6).map(x => `<tr><td style="width:120px" class="mono small">${daysBetween(t, x.date) === 0 ? 'Today' : daysBetween(t, x.date) === 1 ? 'Tomorrow' : esc(fmtDate(x.date))}</td><td style="width:90px"><span class="chip course-${x.course.id}">${esc(x.course.short)}</span></td><td>${esc(x.title)}${x.time ? ` <span class="muted small">· ${esc(x.time)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>${merged.length > 6 ? `<a class="small" href="#/today">${merged.length - 6} more this week · open Today ${icon('right', 11)}</a>` : ''}` : '<div class="empty">Nothing due in the next week.</div>'}
        </div>
        <div id="landing-canvas"></div></div></div>
        <div class="pane" data-pane="community"><div class="row gap-sm mb-2" style="flex-wrap:wrap;align-items:center"><div id="landing-presence"></div><div class="league-slot" data-compact="1"></div></div><div id="landing-social"></div>
        <div class="panel mt-2"><div class="panel-h"><div class="panel-title">${icon('chat')} Latest discussions</div><a class="btn sm" href="#/forum">${icon('chat', 13)} Open discussions</a></div><div id="landing-forum"><div class="empty small">Loading…</div></div></div></div>
        <div class="pane" data-pane="guides">${App.guidesStrip ? App.guidesStrip() : ''}</div>
        <div class="pane" data-pane="inside">${App.resumeCard ? App.resumeCard(mineIds, { stripOnly: true }) : ''}<div class="landing-features grid cols-4">${[['list', 'Endless quizzers', 'Procedurally generated problems with worked explanations, per topic and per exam.'], ['book', 'Notes on every topic', 'Big ideas, formulas, a worked example, pitfalls and an exam tip, linked to the free textbook.'], ['flask', 'Interactive tools', 'Graphers, simulators, solvers, a unit circle, grade calculators and a scratchpad.'], ['chat', 'Community', 'Discussions, daily challenges, study sessions, mock exams and badges with your classmates.']].map(([ic, h, p]) => `<div class="card-link"><div class="eyebrow">${icon(ic, 14)}</div><h4>${h}</h4><p>${p}</p></div>`).join('')}</div></div>
        </div></section>
        <p class="small muted mt-2" style="text-align:center">${guest ? 'Preview freely. Sign up with a montana.edu email to unlock every tool and keep your progress on all your devices.' : 'Progress, flashcards and grades are saved for each class and synced to your account.'}</p></div>`;
      if (fresh) { const cs = $('[aria-labelledby="lsec-classes"]', root), nx = $('.land-next', root); if (cs && nx) nx.before(cs); }
      bind(root, { theme: toggleTheme, search: () => Search.open(), 'open-course': (el, e) => { if (e.target.closest('a')) return; location.hash = '#/' + el.dataset.c + '/dashboard'; }, 'show-all': (el, e) => { e.preventDefault(); Landing.showAll = !Landing.showAll; render(); }, choose: (el, e) => { e.preventDefault(); if (App.auth && App.auth.user) App.auth.onboard(true); else if (App.auth) App.auth.open('signup'); } }); applyTheme();
      const slot = $('#landing-account', root); if (slot && App.auth) App.auth.paintLandingAccount(slot);
      const lf = $('#landing-forum', root); if (lf) { if (App.forumLatest) { const go = () => App.forumLatest(lf); if (App.auth && App.auth.ready) go(); else if (App.auth) App.auth.onChange(function once() { go(); }); } else lf.innerHTML = ''; }
      Canvas.fill($('#landing-canvas', root), null, 8); paintAnnouncement(root);
      if (homeIds.length) App.home.paintWebHome(root);
      if (App.ambient && App.ambient.paint) try { App.ambient.paint(); } catch (e) {}   // the sound button in the hero shows what is playing
      if (App.social) { const goS = () => { App.social.fillLanding(root); App.social.presencePing(); }; if (App.auth && App.auth.ready) goS(); else if (App.auth) App.auth.onChange(function once() { goS(); }); }
    }
  };

  /* ======================================================
     VIEW: Dashboard
     ====================================================== */
  function renderWritingDash(root) {
    const t = todayISO(); const d = today(); const ex = nextExam(D); const ss = semesterState(D); const wk = ss.week; const cur = currentSection(D); const st = streak(); const dl = upcomingDeadlines(D, 5); const todayEv = eventsOn(D, t);
    const weekLabel = ss.phase === 'before' ? `Starts ${esc(shortDate(D.SEMESTER.start))}` : ss.phase === 'after' ? 'Semester over' : ss.phase === 'finals' ? 'Finals week' : `Week ${wk} of ${ss.weeks}`;
    const es = ex ? examStatus(ex) : null; const cl = ex ? checklistState(ex.id) : { items: [], done: 0 }; const clState = ex ? (store.get('checklists', {})[ex.id] || {}) : {};
    const rp = App.readingProgress ? App.readingProgress(D) : { total: 0, done: 0, next: null }; const rprog = store.get('readings', {});
    const xpT = App.xpToday ? App.xpToday() : 0, goal = App.dailyGoal ? App.dailyGoal() : 30, lv = App.level ? App.level() : null; const gpct = Math.min(100, Math.round(100 * xpT / goal)); const RB = 2 * Math.PI * 26;
    const goalBlock = `<div class="today-goal"><span class="ring-big${gpct >= 100 ? ' done' : ''}"><svg viewBox="0 0 60 60" width="64" height="64" aria-hidden="true"><circle class="ring-bg" cx="30" cy="30" r="26"/><circle class="ring-fg" cx="30" cy="30" r="26" stroke-dasharray="${RB.toFixed(2)}" stroke-dashoffset="${(RB * (1 - gpct / 100)).toFixed(2)}"/></svg><span class="ring-txt">${gpct >= 100 ? icon('check', 18) : `<b>${xpT}</b><small>XP</small>`}</span></span><div class="today-goal-body"><div><b>${xpT} / ${goal} XP today</b>${lv ? ` <span class="chip accent">Level ${lv.n} · ${esc(lv.name)}</span>` : ''}</div><div class="small muted">${gpct >= 100 ? 'Daily goal done. Listening still counts toward your level.' : `${goal - xpT} XP to go · a paragraph is 1 XP, a finished reading 20`}</div></div></div>`;
    const gs = App.gettingStarted ? App.gettingStarted() : null;
    const gsCard = gs ? `<div class="panel gs-card"><div class="panel-h"><div class="panel-title">${icon('flag')} Getting started · ${gs.done} of ${gs.total}</div><button class="btn xs ghost" data-action="gs-dismiss">Hide</button></div><div class="gs-items">${gs.items.map(i => `<a class="gs-item${i.done ? ' done' : ''}" href="${i.href}"${i.action ? ` data-action="${i.action}"` : ''}><span class="gs-check">${icon('check', 12)}</span><span>${esc(i.label)}</span></a>`).join('')}</div></div>` : '';
    const weekMon = addDays(d, -((d.getDay() + 6) % 7)); const weekDays = Array.from({ length: 5 }, (_, i) => toISO(addDays(weekMon, i)));
    const units = D.UNITS.map(u => { const e = D.EXAMS.find(x => x.id === u.exam); const done = e ? (e.endDate || e.date) < t : false; const active = !done && e && D.EXAMS.filter(x => (x.endDate || x.date) >= t)[0] && u.sections.includes(cur.id); return { u, e, done, active }; });
    const remindNudge = App.auth && App.auth.user && !App.auth.user.local && App.auth.mode === 'server' && !App.auth.user.reminder_email && !settings().remindNudgeDismissed;
    const deadlineTile = ex ? `<div class="panel lift hero-exam"><div class="countdown"><div class="countdown-num${es.big.length > 3 ? ' small' : ''}">${esc(es.big)}</div><div class="countdown-label">${esc(es.label)}</div></div>
        <div><div class="eyebrow">Next deadline${ex.weight ? ` · ${ex.weight}% of the grade` : ''}</div><h2 style="font-size:26px;margin-top:2px">${esc(ex.name)} <span class="muted" style="font-size:16px;font-weight:400">· ${esc(ex.dateLabel || fmtDate(ex.date, true))}</span></h2><p class="muted mt-1">Turn in ${esc(ex.covers)}.</p>
        <div class="bar-row mt-2"><span>Prep checklist</span><span class="mono">${cl.done} / ${cl.items.length}</span><div class="bar"><div class="bar-fill gold" style="width:${cl.items.length ? 100 * cl.done / cl.items.length : 0}%"></div></div></div>
        <div class="row mt-2"><a class="btn primary" href="${L('course')}">${icon('info', 14)} Assignment details</a><a class="btn" href="${L('readings')}">${icon('book', 14)} Readings</a><a class="btn" href="${L('calendar')}">${icon('calendar', 14)} Calendar</a></div></div></div>`
      : `<div class="panel lift hero-exam"><div class="countdown"><div class="countdown-num small">Done</div><div class="countdown-label">all deadlines</div></div><div><div class="eyebrow">${esc(D.code)}</div><h2 style="font-size:26px;margin-top:2px">Semester complete</h2><p class="muted mt-1">Every deadline has passed. The readings and the grade calculator stay here.</p></div></div>`;
    root.innerHTML = `<div class="page-head"><div><div class="eyebrow">${esc(fmtDate(t, true))} · ${weekLabel} · ${esc(D.code)}</div><h1 class="page-title">Good ${d.getHours() < 12 ? 'morning' : d.getHours() < 18 ? 'afternoon' : 'evening'}. Here's where ${esc(D.short)} stands.</h1></div><div class="page-actions"></div></div><div id="announcement-slot"></div>
      <div class="stack">${remindNudge ? `<div class="callout small row between" style="gap:10px"><span>${icon('bell', 14)} Want an email the evening before something is due, and a heads-up when your streak is about to end?</span><span class="row gap-sm"><button class="btn xs primary" data-action="remind-on">Turn on</button><button class="btn xs ghost" data-action="remind-no">No thanks</button></span></div>` : ''}${deadlineTile}${gsCard}
        <div class="grid cols-3">
          <div class="panel"><div class="panel-h"><div class="panel-title">${icon('calendar')} Today</div><a href="${L('calendar')}" class="small">Full calendar</a></div>
            ${todayEv.length ? todayEv.map(e => `<div class="today-ev"><span class="chip ${e[1]}">${e[1] === 'lecture' ? 'class' : e[1]}</span><span>${esc(e[2])}</span></div>`).join('') : `<div class="empty small">No class today.${(() => { const nx = D.CALENDAR.find(e => e[0] > t && e[1] === 'lecture'); return nx ? ` Next: ${esc(fmtDate(nx[0]))}, ${esc(D.COURSE.meets.split(',')[1] || '9 am')}.` : ''; })()}</div>`}
            <div class="divider"></div><div class="eyebrow mb-1">${esc(cur.label)} · ${esc(cur.title)}</div><ul class="list-plain small">${(cur.bullets || []).map(b => `<li>${esc(b)}</li>`).join('')}</ul>
            <div class="divider"></div><div class="eyebrow mb-1">Due soon</div>${dl.length ? dl.slice(0, 4).map(x => `<div class="today-ev"><span class="when">${daysBetween(t, x.date) === 0 ? 'Today' : daysBetween(t, x.date) === 1 ? 'Tomorrow' : esc(fmtDate(x.date))}</span><span>${esc(x.title)}${x.time ? ` <span class="muted small">· ${esc(x.time)}</span>` : ''}</span></div>`).join('') : '<div class="empty small">Nothing scheduled.</div>'}</div>
          <div class="panel"><div class="panel-h"><div class="panel-title">${icon('fire')} Your progress</div><a class="small" href="${L('grades')}">Grade calculator</a></div>
            ${goalBlock}
            <div class="grid cols-2" style="gap:10px"><div class="stat"><div class="stat-num" data-count="${st}">${st}</div><div class="stat-label">day streak</div></div><div class="stat"><div class="stat-num" data-count="${rp.done}">${rp.done}<span class="muted" style="font-size:15px">/${rp.total}</span></div><div class="stat-label">readings finished</div></div></div>
            <div class="divider"></div>
            ${units.map(({ u, e, done, active }) => `<div class="bar-row"><span>${esc(u.title)}</span><span class="mono">${done ? 'done' : e ? esc(shortDate(e.date)) : ''}</span><div class="bar"><div class="bar-fill ${done ? 'good' : active ? 'warn' : ''}" style="width:${done ? 100 : active ? 50 : 0}%"></div></div></div>`).join('')}</div>
          <div class="panel keep-going"><div class="panel-h"><div class="panel-title">${icon('book')} Keep going</div>${rp.next ? '<span class="small muted">next reading</span>' : ''}</div>
            <a class="btn keep-cta" href="${rp.next ? L('reading', rp.next.id, rprog[rp.next.id] && rprog[rp.next.id].i ? {} : { play: 1 }) : L('readings')}">${icon(rp.next ? 'play' : 'book', 15)} ${rp.next ? `${rp.started ? 'Resume' : 'Listen'}: ${esc(rp.next.title)}` : 'Browse the readings'}</a>
            <div class="eyebrow mt-3 mb-1">Readings</div>${(D.READINGS || []).map(r => { const pr = rprog[r.id] || {}; const n = r.parts.reduce((a, pt) => a + pt.p.length + (pt.h ? 1 : 0), 0); const pct = pr.done ? 100 : Math.round(100 * Math.min(pr.i || 0, n) / n); return `<a class="bar-row rd-row" href="${L('reading', r.id)}"><span>${esc(r.title)}<small class="muted"> · ${esc(r.author)}</small></span><span class="mono">${pr.done ? '✓' : pct + '%'}</span><div class="bar"><div class="bar-fill${pr.done ? ' good' : ''}" style="width:${pct}%"></div></div></a>`; }).join('')}
            <a class="card-link mt-2" href="${L('phonetics')}"><div class="eyebrow">${icon('mic', 13)} Phonetics lab</div><h4>Sounds, IPA and stress</h4><p>${(() => { const pp = App.phoneticsProgress ? App.phoneticsProgress(D) : null; return pp && pp.answered ? `${pp.answered} answered · ${pp.pct}% right · ${pp.seen} of ${pp.symbols} symbols explored.` : 'Practice transcription, minimal pairs, syllables and stress. XP for every answer.'; })()}</p></a>
            <div class="eyebrow mt-3 mb-1">Daily quests</div><div class="quests-slot" data-compact="1"></div></div>
        </div>
        <div class="dash-tabs" data-store="dashTabW" role="tablist">${[['week', 'This week', 'calendar'], ['check', 'Checklist', 'check'], ['league', 'League', 'gem'], ['community', 'Community', 'chat']].map(([k, l, ic]) => `<button class="tab" data-tab="${k}" role="tab">${icon(ic, 14)}<span>${l}</span></button>`).join('')}</div>
        <div class="panes">
          <div class="pane" data-pane="week"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('calendar')} This week</div><span class="small muted">${esc(shortDate(weekDays[0]))} – ${esc(shortDate(weekDays[4]))}</span></div>
            <div class="week-strip">${weekDays.map(iso => { const dd = parseISO(iso); const evs = eventsOn(D, iso); return `<div class="week-day${iso === t ? ' today' : iso < t ? ' past' : ''}"><div class="d">${DOW[dd.getDay()]}<span>${dd.getDate()}</span></div>${evs.length ? evs.map(e => `<div class="ev ${e[1]}">${esc(e[2].replace(/^Week \d+ · /, ''))}</div>`).join('') : '<div class="ev muted">—</div>'}</div>`; }).join('')}</div></div><div class="mt-2"><div id="dash-canvas"></div>${Canvas.data && Canvas.data.configured ? '<div class="panel canvas-fallback"><div class="empty small">No upcoming Canvas items for this class.</div></div>' : ''}</div></div>
          <div class="pane" data-pane="check"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('check')} ${ex ? esc(ex.name) + ' checklist' : 'Checklist'}</div>${ex ? `<span class="small muted">${cl.done} of ${cl.items.length} done</span>` : ''}</div>${cl.items.length ? cl.items.map((it, i) => `<label class="check"><input type="checkbox" data-cl="${i}" ${clState[i] ? 'checked' : ''}><span>${esc(it)}</span></label>`).join('') : '<div class="empty small">Nothing to check off right now.</div>'}</div></div>
          <div class="pane" data-pane="league"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('gem')} Your league</div><a class="small" href="${L('leagues')}">All leagues</a></div><div class="league-slot"></div></div></div>
          <div class="pane" data-pane="community"><div class="grid cols-3"><div id="dash-social" class="span-2 stack"></div><div id="dash-social-side"></div></div></div>
        </div>
      </div>`;
    bind(root, { 'remind-on': async () => { try { await App.auth.savePrefs({ reminder_email: true }); toast('Evening reminders on', 3000); render(); } catch (e) { toast(e.message); } }, 'remind-no': () => { setSetting('remindNudgeDismissed', true); render(); }, 'gs-dismiss': () => { setSetting('gsDismissed', true); render(); }, 'gs-signup': (el, e) => { e.preventDefault(); if (App.auth) App.auth.open('signup'); } });
    on(root, 'change', 'input[data-cl]', el => { if (!ex) return; const all = store.get('checklists', {}); all[ex.id] = all[ex.id] || {}; all[ex.id][el.dataset.cl] = el.checked; store.set('checklists', all); markActivity(); });
    Canvas.fill($('#dash-canvas', root), D.id, 6); paintAnnouncement(root);
    if (App.social) { const goS = () => App.social.fillDashboard($('#dash-social', root), D.id); if (App.auth && App.auth.ready) goS(); else if (App.auth) App.auth.onChange(function once() { goS(); }); }
  }
  App.views.dashboard = {
    title: 'Dashboard',
    render(root) {
      if (D.kind === 'writing') return renderWritingDash(root);
      const t = todayISO(); const d = today(); const ex = nextExam(D); const ss = semesterState(D); const wk = ss.week;
      const todayEv = eventsOn(D, t); const dl = upcomingDeadlines(D, 6); const st = streak();
      const hist = store.get('history', []); const answered = hist.length, correct = hist.filter(x => x.ok).length; const cm = cardsMastered(); const cur = currentSection(D);
      const weekMon = addDays(d, -((d.getDay() + 6) % 7)); const weekDays = Array.from({ length: 5 }, (_, i) => toISO(addDays(weekMon, i)));
      const cl = ex ? checklistState(ex.id) : { items: [], done: 0 }; const p = progress();
      const weak = Object.entries(p).filter(([k, v]) => QZ && QZ.TOPICS[k] && v.a >= 3 && v.c / v.a < 0.7).sort((a, b) => (a[1].c / a[1].a) - (b[1].c / b[1].a)).slice(0, 4);
      const es = ex ? examStatus(ex) : null;
      const rd = App.readiness ? App.readiness(D.id) : null; const weak0 = rd && rd.ok && rd.weakest && rd.weakest[0];
      const readyLine = rd && rd.ok ? `<div class="ready-line"><b>${rd.score}% ready</b> · ${esc(rd.label)}${weak0 ? ` · weakest: ${esc(weak0.label)}` : ''} <button class="linkbtn" data-action="tab-ready">How to raise it ${icon('right', 12)}</button></div>` : '';
      // the trail board: the exam is the summit, its sections are the runs, each marked by how hard it is for this student right now
      const trailTile = (() => {
        if (!ex || !rd || !rd.ok || !D.SECTIONS) return '';
        const bySec = {}; rd.topics.forEach(x => { (bySec[x.sec] = bySec[x.sec] || []).push(x); });
        const secIds = ex.cumulative ? D.SECTIONS.map(s => s.id).filter(id => bySec[id]) : (ex.sections || []).filter(id => bySec[id] || D.SECTIONS.some(s => s.id === id)); if (!secIds.some(id => bySec[id])) return '';
        const runs = secIds.map(id => { const s = D.SECTIONS.find(x => x.id === id) || { id, label: id, title: '' }; const ts = bySec[id] || []; const a = ts.reduce((n, x) => n + x.a, 0); const score = ts.length ? ts.reduce((n, x) => n + x.score, 0) / ts.length : 0; return { s, ts, a, score, grade: !a ? 'new' : score >= 0.65 ? 'easy' : score >= 0.35 ? 'mid' : 'hard' }; });
        const weakSec = rd.weakest && rd.weakest[0] ? rd.weakest[0].sec : null;
        const here = runs.find(r => r.s.id === weakSec) || runs.find(r => r.ts.length && r.grade !== 'easy') || runs.filter(r => r.ts.length).pop();
        const GRADE = { easy: 'green circle, solid', mid: 'blue square, getting there', hard: 'black diamond, hard for you right now', new: 'not tried yet', notes: 'notes only, no practice questions yet' };
        const runHref = r => r.ts.length ? L('practice', null, { topics: r.ts.map(x => x.t).join(',') }) : L('notes', r.s.id);
        const sect = courseSetting(D.id, 'section', ''), etime = courseSetting(D.id, 'examTime', '');
        const anim = !trailSeen.has(D.id); trailSeen.add(D.id); const hi = runs.indexOf(here);
        const glyph = g => `<i class="run-glyph ${g}" aria-hidden="true"></i>`;
        // each run sits on a winding trail: x offsets follow a gentle wave so the nodes zig-zag up the mountain
        const wave = i => Math.round(50 * Math.sin(i * 1.15 + 0.4));
        const scoreText = r => !r.ts.length ? 'notes only' : r.a ? `${Math.round(100 * r.score)}% · ${r.grade === 'easy' ? 'solid' : r.grade === 'mid' ? 'getting there' : 'hard for you'}` : 'not tried yet';
        const bo = x => App.bobcatSvg ? `<span class="tb-bo ${x < 0 ? 'bo-r' : 'bo-l'}" aria-hidden="true">${App.bobcatSvg(64)}</span>` : '';
        const readyPct = Math.max(0, Math.min(100, rd.score));
        const clDone = store.get('checklists', {})[ex.id] || {}; const nextChecks = cl.items.map((t, i) => [t, i]).filter(([, i]) => !clDone[i]).slice(0, 3);
        return `<div class="panel lift hero-exam trail-board${anim ? ' tb-anim' : ''}${runs.length > 9 ? ' tb-many' : ''}">
          <div class="tb-summit">
            <div class="tb-head">
              <h2 class="tb-exam">${esc(ex.name)}</h2>
              <div class="tb-date">${esc(ex.dateLabel || fmtDate(ex.date, true))}</div>
              ${sect || etime ? `<div class="tb-meta">Your section${sect ? ' ' + esc(sect) : ''}${etime ? ' · ' + esc(etime) : ''}</div>` : ''}
            </div>
            <div class="tb-days"><b>${esc(es.big)}</b><span>${esc(es.label)}</span></div>
            <p class="tb-covers">Covers ${esc(ex.covers)}. ${esc(ex.format || 'Closed book, no devices.')}${ex.weight ? ` ${ex.weight}% of the grade.` : ''}</p>
            <div class="tb-ready"><div class="ready-line"><b>${rd.score}% ready</b><span>${esc(rd.label)}</span><button class="linkbtn" data-action="tab-ready">How to raise it ${icon('right', 12)}</button></div><div class="tb-readybar" role="presentation"><i style="width:${readyPct}%"></i></div></div>
            ${cl.items.length ? `<div class="tb-checks"><div class="tb-checks-h"><b>Prep checklist</b><span>${cl.done} of ${cl.items.length} done</span></div>${nextChecks.map(([t, i]) => `<label class="tb-check"><input type="checkbox" data-cl="${i}"><span>${esc(t)}</span></label>`).join('')}</div>` : ''}
            <div class="tb-go"><a class="btn primary lg tb-next" href="${runHref(here)}"><span class="tb-next-a">${icon('play', 15)} Take the next run</span><span class="tb-next-b">${esc(here.s.label)} ${esc(here.s.title)}</span></a><p class="tb-more"><a href="${L('exam', ex.id)}">${esc(ex.name)} ${D.PRACTICE && D.PRACTICE[ex.id] ? 'practice set' : 'prep'}</a><a href="${L('practice', null, { exam: ex.id })}">Drill every run</a><a href="${L('flashcards', null, { unit: ex.units[ex.units.length - 1] })}">Flashcards</a></p></div>
          </div>
          <div class="tb-trail">
            <svg class="tb-scene" viewBox="0 0 600 560" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false"><circle class="tb-sun" cx="552" cy="128" r="30"/><path class="tb-cloud" d="M64 120h86a16 16 0 0 0-14-24 22 22 0 0 0-40-6 15 15 0 0 0-32 30z"/><path class="tb-cloud" d="M392 196h64a12 12 0 0 0-10-18 17 17 0 0 0-31-4 11 11 0 0 0-23 22z"/><path class="tb-m-far" d="M0 330L70 262l52 40 86-108 70 82 60-54 92 96 66-62 104 92V560H0z"/><path class="tb-m-near" d="M0 470c60-30 120-42 190-30s120 34 200 26 150-34 210-28V560H0z"/></svg>
            <div class="tb-ridge" aria-hidden="true"></div>
            <div class="tb-climb">
              <svg class="tb-peak" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="tb-peak-side" d="M50 0L100 100H0z"/><path class="tb-peak-shade" d="M50 0L100 100H62z"/><path class="tb-peak-snow" d="M50 0L58.5 15 54 12.5 50 17 46 12.5 41.5 15z"/></svg><svg class="tb-path" aria-hidden="true" focusable="false"></svg>
              <div class="tb-summit-row"><span class="tb-flag" aria-hidden="true"><svg viewBox="0 0 32 40" width="30" height="38"><path d="M6 38V3" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path class="tb-flag-cloth" d="M8 4h19l-5 7 5 7H8z"/></svg></span><span class="tb-summit-text"><b>${esc(ex.name)}</b> · the summit</span></div>
              <ol class="tb-runs" aria-label="The runs to ${esc(ex.name)}, from the trailhead up">${runs.map((r, i) => { const x = wave(i); return `<li style="--k:${i};--x:${x}px"><a class="tb-run ${r.grade}${r === here ? ' here' : ''}${r.grade === 'easy' ? ' done' : ''}" href="${runHref(r)}" title="${esc(GRADE[r.ts.length ? r.grade : 'notes'])}"><span class="tb-band"><span class="tb-node">${glyph(r.grade)}</span>${r === here ? bo(x) : ''}</span><span class="tb-label"><span class="tb-sec">${esc(r.s.label)}</span><span class="tb-name">${esc(r.s.title)}<span class="sr-only"> (${esc(GRADE[r.ts.length ? r.grade : 'notes'])})</span></span>${r === here ? `<span class="tb-pin" style="--n:${hi}">You are here</span>` : `<span class="tb-score">${scoreText(r)}</span>`}</span></a></li>`; }).join('')}</ol>
              <div class="tb-base"><span class="tb-base-sign">Trailhead</span></div>
            </div>
            <div class="tb-legend" aria-hidden="true"><span>${glyph('easy sm')} solid</span><span>${glyph('mid sm')} getting there</span><span>${glyph('hard sm')} hard for you</span><span>${glyph('new sm')} not tried</span></div>
          </div></div>`;
      })();
      const examTile = trailTile || (ex ? `<div class="panel lift hero-exam">
          <div class="countdown"><div class="countdown-num${es.big.length > 3 ? ' small' : ''}">${esc(es.big)}</div><div class="countdown-label">${esc(es.label)}</div></div>
          <div><div class="eyebrow">Next exam${ex.weight ? ` · ${ex.weight}% of the grade` : ''}</div>
            <h2 style="font-size:26px;margin-top:2px">${esc(ex.name)} <span class="muted" style="font-size:16px;font-weight:400">· ${esc(ex.dateLabel || fmtDate(ex.date, true))}</span></h2>
            ${courseSetting(D.id, 'section', '') || courseSetting(D.id, 'examTime', '') ? `<p class="small" style="opacity:.85;margin-top:2px">${icon('info', 12)} Your section${courseSetting(D.id, 'section', '') ? ' ' + esc(courseSetting(D.id, 'section', '')) : ''}${courseSetting(D.id, 'examTime', '') ? ' · ' + esc(courseSetting(D.id, 'examTime', '')) : ''}</p>` : ''}
            <p class="muted mt-1">Covers ${esc(ex.covers)}. ${esc(ex.format || 'Closed book, no devices.')}</p>
            <div class="bar-row mt-2"><span>Prep checklist</span><span class="mono">${cl.done} / ${cl.items.length}</span><div class="bar"><div class="bar-fill gold" style="width:${cl.items.length ? 100 * cl.done / cl.items.length : 0}%"></div></div></div>${readyLine}
            <div class="row mt-2">${D.PRACTICE && D.PRACTICE[ex.id] ? `<a class="btn primary" href="${L('exam', ex.id)}">${icon('flag', 14)} ${esc(ex.name)} practice set</a>` : `<a class="btn primary" href="${L('exam', ex.id)}">${icon('flag', 14)} ${esc(ex.name)} prep</a>`}<a class="btn" href="${L('practice', null, { exam: ex.id })}">${icon('list', 14)} Drill ${esc(ex.name)} topics</a><a class="btn" href="${L('flashcards', null, { unit: ex.units[ex.units.length - 1] })}">${icon('cards', 14)} Flashcards</a></div>
          </div></div>` : !(D.EXAMS || []).length && ss.phase !== 'after' ? (() => { const nx = D.CALENDAR.find(e => e[0] >= t && e[1] === 'lecture'); const dd = nx ? daysBetween(t, nx[0]) : null; return `<div class="panel lift hero-exam"><div class="countdown"><div class="countdown-num${dd === 0 ? ' small' : ''}">${dd === null ? '–' : dd === 0 ? 'Today' : dd}</div><div class="countdown-label">${dd === null ? 'no more classes' : dd === 0 ? 'class meets' : `day${dd === 1 ? '' : 's'} to next class`}</div></div><div><div class="eyebrow">${esc(D.code)} · no exams</div><h2 style="font-size:26px;margin-top:2px">Graded on assignments and quizzes</h2><p class="muted mt-1">${esc((D.GRADING && D.GRADING.note) || 'There are no exams in this class.')}${nx ? ` Next class: ${esc(fmtDate(nx[0], true))}.` : ''}</p><div class="row mt-2"><a class="btn primary" href="${L('practice')}">${icon('list', 14)} Quizzer</a><a class="btn" href="${L('notes', cur.id)}">${icon('book', 14)} Topic notes</a><a class="btn" href="${L('calendar')}">${icon('calendar', 14)} Calendar</a></div></div></div>`; })() : `<div class="panel lift hero-exam"><div class="countdown"><div class="countdown-num small">Done</div><div class="countdown-label">all exams</div></div><div><div class="eyebrow">${esc(D.code)}</div><h2 style="font-size:26px;margin-top:2px">Semester complete</h2><p class="muted mt-1">Every exam on the calendar has passed. Everything stays here for review, and the grade calculator can settle your final letter grade.</p><div class="row mt-2"><a class="btn primary" href="${L('grades')}">${icon('calc', 14)} Grade calculator</a><a class="btn" href="${L('practice')}">${icon('list', 14)} Keep practicing</a></div></div></div>`);
      const pre = ss.phase === 'before' ? `<div class="panel callout"><b>Classes start ${esc(fmtDate(D.SEMESTER.start, true))}</b> (${ss.days === 1 ? 'tomorrow' : `in ${ss.days} days`}). Everything below already follows the Fall 2026 calendar; the first topic is ready when you are.</div>` : '';
      const weekLabel = ss.phase === 'before' ? `Starts ${esc(shortDate(D.SEMESTER.start))}` : ss.phase === 'after' ? 'Semester over' : ss.phase === 'finals' ? 'Finals week' : `Week ${wk} of ${ss.weeks}`;
      const smart = App.smartReview ? App.smartReview(3) : { picked: [] };
      const plan = App.planToday ? App.planToday() : null;
      const act = store.get('activity', {}); const yday = toISO(addDays(d, -1)), dby = toISO(addDays(d, -2)); const wk0 = App.isoWeek(d);
      const atRisk = !act[t] && !!act[yday] && st >= 2; const broken = !act[t] && !act[yday] && !!act[dby]; const freezes = store.get('freezes', {}); const freezeLeft = !freezes[wk0];
      const xpT = App.xpToday ? App.xpToday() : 0, goal = App.dailyGoal ? App.dailyGoal() : 30, lv = App.level ? App.level() : null; const gpct = Math.min(100, Math.round(100 * xpT / goal)); const curNode = App.pathNodes ? App.pathNodes().find(n => n.state === 'current') : null; const RB = 2 * Math.PI * 26;
      const goalBlock = `<div class="today-goal"><span class="ring-big${gpct >= 100 ? ' done' : ''}"><svg viewBox="0 0 60 60" width="64" height="64" aria-hidden="true"><circle class="ring-bg" cx="30" cy="30" r="26"/><circle class="ring-fg" cx="30" cy="30" r="26" stroke-dasharray="${RB.toFixed(2)}" stroke-dashoffset="${(RB * (1 - gpct / 100)).toFixed(2)}"/></svg><span class="ring-txt">${gpct >= 100 ? icon('check', 18) : `<b>${xpT}</b><small>XP</small>`}</span></span><div class="today-goal-body"><div><b>${xpT} / ${goal} XP today</b>${lv ? ` <span class="chip accent">Level ${lv.n} · ${esc(lv.name)}</span>` : ''}</div><div class="small muted">${gpct >= 100 ? 'Daily goal done. Extra XP still counts toward your level.' : `${goal - xpT} XP to go${lv ? ` · ${lv.toNext} XP to level ${lv.n + 1}` : ''}`}</div></div></div>`;
      const gs = App.gettingStarted ? App.gettingStarted() : null;
      const gsCard = gs ? `<div class="panel gs-card"><div class="panel-h"><div class="panel-title">${icon('flag')} Getting started · ${gs.done} of ${gs.total}</div><button class="btn xs ghost" data-action="gs-dismiss">Hide</button></div><div class="gs-items">${gs.items.map(i => `<a class="gs-item${i.done ? ' done' : ''}" href="${i.href}"${i.action ? ` data-action="${i.action}"` : ''}><span class="gs-check">${icon('check', 12)}</span><span>${esc(i.label)}</span></a>`).join('')}</div></div>` : '';
      const weekMins = COURSE_ORDER.filter(id => Courses[id]).reduce((sum, id) => sum + ((store.peek(id).sessions || []).filter(x => App.isoWeek(parseISO(x.d)) === wk0).reduce((a, x) => a + (x.m || 0), 0)), 0);
      const remindNudge = App.auth && App.auth.user && !App.auth.user.local && App.auth.mode === 'server' && !App.auth.user.reminder_email && !settings().remindNudgeDismissed;
      root.innerHTML = `<div class="page-head"><div><h1 class="page-title dash-greet">${ex && es && es.n > 1 ? `${es.n} days to ${esc(ex.name)}. Here's the way up.` : ex && es && es.n === 1 ? `${esc(ex.name)} is tomorrow. One more run.` : ex && es && es.n === 0 ? `${esc(ex.name)} is here. You've done the climbing.` : `Good ${d.getHours() < 12 ? 'morning' : d.getHours() < 18 ? 'afternoon' : 'evening'}. Here's where ${esc(D.short)} stands.`}</h1><p class="page-sub dash-when">${esc(fmtDate(t, true))} · ${weekLabel} · ${esc(D.code)}</p></div><div class="page-actions"><button class="btn sm d20-btn" data-roll="${D.id}" title="Roll a d20 and let it pick what to practice">${icon('d20', 15)} Roll a quest</button></div></div>${pre}
        <div class="stack">${examTile}<div id="announcement-slot"></div>${remindNudge ? `<div class="callout small row between" style="gap:10px"><span>${icon('bell', 14)} Want an email the evening before something is due, and a heads-up when your streak is about to end?</span><span class="row gap-sm"><button class="btn xs primary" data-action="remind-on">Turn on</button><button class="btn xs ghost" data-action="remind-no">No thanks</button></span></div>` : ''}${gsCard}${atRisk ? `<div class="callout warn small">${icon('fire', 13)} Your ${st}-day streak ends at midnight. <a href="${L('lesson', null, { smart: 1 })}">One quick lesson</a> keeps it.</div>` : broken ? `<div class="callout small">${icon('fire', 13)} Your streak broke yesterday.${freezeLeft ? ` <button class="btn xs primary" data-action="freeze">Use this week's freeze</button> to keep it alive.` : ' You used this week\'s freeze already.'}</div>` : ''}
          <div class="grid cols-2 dash-main">
            <div class="panel"><div class="panel-h"><div class="panel-title">${icon('calendar')} Today</div><a href="${L('calendar')}" class="small">Full calendar</a></div>
              ${todayEv.length ? todayEv.map(e => `<div class="today-ev"><span class="chip ${e[1]}">${e[1]}</span><span>${esc(e[2])}</span></div>`).join('') : `<div class="empty">No class today.${(() => { const nx = D.CALENDAR.find(e => e[0] > t && (e[1] === 'lecture' || e[1] === 'exam')); return nx ? ` Next: ${esc(nx[2])} on ${fmtDate(nx[0])}.` : ''; })()}</div>`}
              <div class="divider"></div><div class="eyebrow mb-1">Due soon${(D.RECURRING || []).some(r => r.afterLabDay) ? ` · lab ${courseSetting(D.id, 'labDay', 'tue') === 'thu' ? 'Thu' : 'Tue'} <a href="${L('settings')}">change</a>` : ''}</div>
              ${dl.length ? dl.slice(0, 4).map(x => `<div class="today-ev"><span class="when">${daysBetween(t, x.date) === 0 ? 'Today' : daysBetween(t, x.date) === 1 ? 'Tomorrow' : esc(fmtDate(x.date))}</span><span>${esc(x.title)}${x.time ? ` <span class="muted small">· ${esc(x.time)}</span>` : ''}</span></div>`).join('') : '<div class="empty small">Nothing scheduled.</div>'}
              <div class="divider"></div><div class="eyebrow mb-1">Current topic</div>
              <a class="card-link" href="${L('notes', cur.id)}"><h3>${esc(cur.label)} ${esc(cur.title)}</h3><p>Notes, worked example and practice for this topic.</p></a></div>
            <div class="panel keep-going"><div class="panel-h"><div class="panel-title">${icon('play')} Keep going</div>${curNode ? '<span class="small muted">next on your path</span>' : ''}</div>
              <a class="btn keep-cta" href="${curNode ? L('lesson', null, { topics: curNode.t }) : L('lesson', null, { smart: 1 })}">${icon('play', 15)} ${curNode ? 'Continue: ' + esc(curNode.label) : 'Start a lesson'}</a>
              <div class="eyebrow mt-3 mb-1">Smart review</div>
              ${smart.picked.length ? `${smart.picked.map(r => `<div class="bar-row"><span>${esc(r.label)}</span><span class="mono">${r.acc === null ? 'new' : Math.round(r.acc * 100) + '%'}</span><div class="bar"><div class="bar-fill ${r.acc === null ? '' : r.acc < 0.6 ? 'bad' : r.acc < 0.8 ? 'warn' : 'good'}" style="width:${r.acc === null ? 0 : 100 * r.acc}%"></div></div></div>`).join('')}<a class="btn sm mt-1" href="${L('lesson', null, { smart: 1 })}">${icon('target', 13)} Review for me</a>` : '<p class="small muted">Answer a few questions and a personalized review appears here.</p>'}
              </div>
          </div>
          <div class="dash-tabs" data-store="dashTab" role="tablist">${[['week', 'This week', 'calendar'], ['ready', 'Readiness', 'target'], ['progress', 'Progress', 'fire'], ['plan', 'Planner', 'list'], ['community', 'Community', 'chat']].map(([k, l, ic]) => `<button class="tab" data-tab="${k}" role="tab">${icon(ic, 14)}<span>${l}</span></button>`).join('')}</div>
          <div class="panes">
            <div class="pane" data-pane="week"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('calendar')} This week</div><span class="small muted">${esc(shortDate(weekDays[0]))} – ${esc(shortDate(weekDays[4]))}</span></div>
              <div class="week-strip">${weekDays.map(iso => { const dd = parseISO(iso); const evs = eventsOn(D, iso); return `<div class="week-day${iso === t ? ' today' : iso < t ? ' past' : ''}"><div class="d">${DOW[dd.getDay()]}<span>${dd.getDate()}</span></div>${evs.length ? evs.map(e => `<div class="ev ${e[1]}">${esc(e[2])}</div>`).join('') : '<div class="ev muted">—</div>'}</div>`; }).join('')}</div></div><div class="mt-2"><div id="dash-canvas"></div>${Canvas.data && Canvas.data.configured ? '<div class="panel canvas-fallback"><div class="empty small">No upcoming Canvas items for this class.</div></div>' : ''}</div></div>
            <div class="pane" data-pane="ready">${App.readinessPanel ? App.readinessPanel(D.id) : ''}</div>
            <div class="pane" data-pane="progress"><div class="grid cols-2"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('fire')} Your progress</div><a class="small" href="${L('path')}">Learning path</a></div>
              ${goalBlock}
              <div class="grid cols-2" style="gap:10px"><div class="stat"><div class="stat-num" data-count="${st}">${st}</div><div class="stat-label">day streak${freezeLeft ? '' : ' · freeze used'}</div></div><div class="stat"><div class="stat-num" data-count="${(weekMins / 60).toFixed(1)}">${(weekMins / 60).toFixed(1)}<span class="muted" style="font-size:15px"> h</span></div><div class="stat-label" id="dash-hours">focus this week</div></div><div class="stat"><div class="stat-num"><span data-count="${answered ? Math.round(100 * correct / answered) : 0}">${answered ? Math.round(100 * correct / answered) : 0}</span>%</div><div class="stat-label">accuracy · ${answered} answered</div></div><div class="stat"><div class="stat-num" data-count="${cm.mastered}">${cm.mastered}<span class="muted" style="font-size:15px">/${cm.total}</span></div><div class="stat-label">flashcards mastered</div></div></div>
              <div class="divider"></div>
              ${D.UNITS.map(u => { const m = unitMastery(u.n); return `<div class="bar-row"><span>Unit ${u.n} · ${esc(u.title)}</span><span class="mono">${m.a ? m.pct + '%' : '—'}</span><div class="bar"><div class="bar-fill ${m.pct >= 80 ? 'good' : m.pct >= 60 ? 'warn' : m.a ? 'bad' : ''}" style="width:${m.a ? m.pct : 0}%"></div></div></div>`; }).join('')}</div><div class="stack"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('zap')} Daily quests</div></div><div class="quests-slot" data-compact="1"></div></div><div class="panel"><div class="panel-h"><div class="panel-title">${icon('gem')} Your league</div><a class="small" href="${L('leagues')}">All leagues</a></div><div class="league-slot"></div></div></div></div></div>
            <div class="pane" data-pane="plan"><div class="panel plan-panel"><div class="panel-h"><div class="panel-title">${icon('calendar')} ${plan ? (plan.isToday ? 'Today’s plan' : `Next study day · ${esc(fmtDate(plan.date))}`) : 'Study planner'}</div>${plan ? `<span class="small muted">${plan.done}/${plan.total} done · <a href="${L('planner')}">open plan</a></span>` : ''}</div>
              ${plan ? (plan.items.length ? plan.items.map(i => `<label class="check plan-item${i.done ? ' done' : ''}" style="padding:4px 0"><input type="checkbox" data-plan="${i.id}" ${i.done ? 'checked' : ''}><span class="plan-label">${esc(i.label)}</span>${i.link ? `<a class="btn xs" href="${i.link}">Open</a>` : ''}</label>`).join('') : '<div class="empty">Rest day. Nothing planned.</div>') : `<div class="empty">No plan yet. Pick an exam and your study days and Mathub spreads the work across them. <a class="btn sm mt-2" href="${L('planner')}">Build a plan</a></div>`}</div></div>
            <div class="pane" data-pane="community"><div class="grid cols-3"><div id="dash-social" class="span-2 stack"></div><div id="dash-social-side"></div></div></div>
          </div>
        </div>`;
      bind(root, { 'tab-ready': () => { const b = $('.dash-tabs .tab[data-tab="ready"]', root); if (b) { b.click(); b.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, freeze: () => { if (App.useFreeze && App.useFreeze(yday)) render(); else toast('No streak freezes left. Hit your daily goal three days in a week to earn one.', 3500); }, 'remind-on': async () => { try { await App.auth.savePrefs({ reminder_email: true }); toast('Evening reminders on', 3000); render(); } catch (e) { toast(e.message); } }, 'remind-no': () => { setSetting('remindNudgeDismissed', true); render(); }, 'gs-dismiss': () => { setSetting('gsDismissed', true); render(); }, 'gs-signup': (el, e) => { e.preventDefault(); if (App.auth) App.auth.open('signup'); } });
      if (App.auth && App.auth.mode === 'server' && !App.auth.unreachable) fetch('api/index.php?r=stats_week', { credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub' } }).then(r => r.json()).then(j => { const el = $('#dash-hours', root); if (el && j && j.ok && j.stats && j.stats.median_hours !== null && j.stats.hours_users >= 3) el.textContent = `focus this week · class median ${j.stats.median_hours} h`; }).catch(() => {});
      on(root, 'change', 'input[data-plan]', el => { const p = store.get('plan', null); if (!p) return; const it = p.items.find(i => i.id === el.dataset.plan); if (it) { it.done = el.checked; store.set('plan', p); markActivity(); el.closest('.plan-item').classList.toggle('done', el.checked); } });
      Canvas.fill($('#dash-canvas', root), D.id, 6); paintAnnouncement(root); drawTrail(root);
      if (App.social) { const goS = () => App.social.fillDashboard($('#dash-social', root), D.id); if (App.auth && App.auth.ready) goS(); else if (App.auth) App.auth.onChange(function once() { goS(); }); }
    }
  };

  /* ======================================================
     VIEW: Calendar
     ====================================================== */
  App.views.calendar = {
    title: 'Calendar',
    render(root, param) {
      const t = todayISO(); const start = parseISO(D.SEMESTER.start); const weeks = [];
      for (let w = 0; ; w++) { const mon = addDays(start, 7 * w); if (toISO(mon) > D.SEMESTER.end) break; weeks.push(Array.from({ length: 5 }, (_, i) => toISO(addDays(mon, i)))); }
      root.innerHTML = pageHead(`${esc(D.term)} calendar`, D.CALENDAR_NOTE || 'Subject to change; the instructor’s Canvas calendar wins.', `<button class="btn" data-action="today">${icon('target', 14)} Jump to today</button><button class="btn print-btn" data-action="print">${icon('print', 14)} Print</button>`) + `
        <div class="grid cols-3 mb-2"><div class="panel span-2"><div class="cal-legend"><span class="chip lecture">Lecture</span><span class="chip lab">Lab</span><span class="chip exam">Exam</span><span class="chip admin">Due / deadline</span><span class="chip holiday">No class</span><span class="chip review">Review</span></div>${(() => { const up = upcomingDeadlines(D, 6); return up.length ? `<div class="eyebrow mt-2 mb-1">Coming up</div>${up.map(x => `<div class="small cal-up"><span class="mono muted">${shortDate(x.date)}</span> ${esc(x.title)}${x.time ? ` <span class="muted">· ${esc(x.time)}</span>` : ''}</div>`).join('')}` : ''; })()}</div>
          <div class="panel"><div class="eyebrow mb-1">Standing due times</div>${D.COURSE.deadlines.map(x => `<div class="small" style="padding:4px 0"><b>${esc(x.name)}.</b> ${esc(x.rule)}</div>`).join('')}</div></div>
        <div class="cal-head"><span>Week</span><span>Monday</span><span>Tuesday</span><span>Wednesday</span><span>Thursday</span><span>Friday</span></div>
        ${weeks.map((wk, i) => `<div class="cal-week"><div class="cal-wk">Wk ${i + 1}</div>${wk.map(iso => { const dd = parseISO(iso); const evs = eventsOn(D, iso); const isExam = evs.some(e => e[1] === 'exam' && !/^Finals week$/.test(e[2])); return `<div class="cal-day${iso === t ? ' today' : ''}${iso < t ? ' past' : ''}${isExam ? ' exam-day' : ''}" id="cal-${iso}"><div class="cal-date"><b>${dd.getDate()}</b><span>${MON[dd.getMonth()]}</span></div>${evs.map(e => `<div class="cal-ev ${e[1]}">${esc(e[2])}</div>`).join('')}<div class="cal-canvas" data-date="${iso}"></div></div>`; }).join('')}</div>`).join('')}`;
      bind(root, { today: () => { const el = $('#cal-' + t) || $('.cal-day'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, print: () => window.print() });
      const target = param && $('#cal-' + param); if (target) setTimeout(() => target.scrollIntoView({ block: 'center' }), 50);
      Canvas.load().then(d => { if (!d || !d.configured) return; const byDate = {}; d.events.filter(e => e.course === D.id).forEach(e => (byDate[e.date] = byDate[e.date] || []).push(e)); $$('.cal-canvas', root).forEach(el => { const evs = byDate[el.dataset.date]; if (evs) el.innerHTML = evs.map(e => `<div class="cal-ev canvas" title="From Canvas${e.time ? ' · ' + esc(e.time) : ''}">${icon('canvas', 10)} ${esc(e.title)}</div>`).join(''); }); const lg = $('.cal-legend', root); if (lg) lg.insertAdjacentHTML('beforeend', '<span class="chip canvas">From Canvas</span>'); }).catch(() => {});
    }
  };

  /* ======================================================
     VIEW: Notes
     ====================================================== */
  App.views.notes = {
    title: 'Notes',
    render(root, param) {
      const sec = secById(param) || currentSection(D); const idx = D.SECTIONS.indexOf(sec); const prev = D.SECTIONS[idx - 1], next = D.SECTIONS[idx + 1];
      const ex = D.EXAMS.find(e => e.sections.includes(sec.id)); const topics = topicsForSection(sec.id);
      const freeN = App.limit('sections'); const lockedSec = idx >= freeN;
      const runOf = (() => { const p = progress(); const T = (QZ && QZ.TOPICS) || {}; const m = {}; Object.keys(T).forEach(k => { const o = m[T[k].sec] = m[T[k].sec] || { s: 0, n: 0, a: 0 }; const v = p[k]; o.n++; if (v && v.a) { o.a += v.a; o.s += (v.c / v.a) * (0.55 + 0.45 * Math.min(1, v.a / 15)); } }); return id => { const o = m[id]; if (!o || !o.a) return 'new'; const sc = o.s / o.n; return sc >= 0.65 ? 'easy' : sc >= 0.35 ? 'mid' : 'hard'; }; })();
      const navHtml = D.UNITS.map(u => `<div class="nav-label">Unit ${u.n} · ${esc(u.title)}</div>` + u.sections.map(id => { const s = secById(id); const k = D.SECTIONS.indexOf(s); const g = runOf(s.id); return `<button class="sec-link${s.id === sec.id ? ' active' : ''}${k >= freeN ? ' locked' : ''}" data-action="open" data-id="${s.id}">${g ? `<i class="run-glyph sm ${g}" aria-hidden="true"></i>` : ''}<span class="num">${esc(s.label.replace('§', ''))}</span><span>${esc(s.title)}</span></button>`; }).join('')).join('');
      if (lockedSec) {
        root.innerHTML = `<div class="notes-layout"><div class="panel sec-nav">${navHtml}</div><div class="stack"><div class="panel">
          <div class="note-head"><span class="note-num">${esc(sec.label)}</span><span class="chip">Unit ${sec.unit}</span>${ex ? `<span class="chip exam">${esc(ex.name)}</span>` : ''}</div>
          <h1 class="note-title">${esc(sec.title)}</h1>
          <div class="note-block"><h2>Big ideas</h2><ul class="list">${sec.ideas.slice(0, 2).map(i => `<li>${i}</li>`).join('')}<li class="muted">… and ${Math.max(0, sec.ideas.length - 2)} more, plus formulas, a worked example, common mistakes and an exam tip.</li></ul></div>
          ${App.lockCard(`Notes beyond the first ${freeN} topics are for members`, `Sign up free to read every ${D.short} topic (${D.SECTIONS.length} in total) with worked examples and exam tips.`)}
          <div class="row between mt-3"><div>${prev ? `<button class="btn" data-action="open" data-id="${prev.id}">${icon('left', 14)} ${esc(prev.label)}</button>` : ''}</div><div>${next ? `<button class="btn" data-action="open" data-id="${next.id}">${esc(next.label)} ${icon('right', 14)}</button>` : ''}</div></div>
          </div></div></div>`;
        bind(root, { open: el => App.go('notes', el.dataset.id) }); return;
      }
      root.innerHTML = `<div class="notes-layout"><div class="panel sec-nav">${navHtml}</div><div class="stack"><div class="panel">
        <div class="note-head"><span class="note-num">${esc(sec.label)}</span><span class="chip">Unit ${sec.unit}</span>${ex ? `<span class="chip exam">${esc(ex.name)}</span>` : ''}${sec.link ? `<a class="small" style="margin-left:auto" href="${sec.link}" target="_blank" rel="noopener">${esc(sec.linkLabel || (D.kind === 'code' ? 'Class site' : 'Read in the textbook'))} ${icon('external', 12)}</a>` : '<span style="margin-left:auto"></span>'}${App.flagButton ? App.flagButton({ course: D.id, view: 'Notes', ref: `${sec.label} ${sec.title}` }) : ''}</div>
        <h1 class="note-title">${esc(sec.title)}</h1>
        <div class="note-block"><h2>Big ideas</h2><ul class="list">${(sec.ideas || []).map(i => `<li>${i}</li>`).join('')}</ul></div>
        ${sec.formulas && sec.formulas.length ? `<div class="note-block"><h2>Key formulas</h2>${sec.formulas.map(f => `<div class="formula-row"><div class="name">${esc(f.n)}</div><div class="tex">$$${f.t}$$</div></div>`).join('')}</div>` : ''}
        ${sec.code && sec.code.length ? `<div class="note-block"><h2>Code you should know</h2>${sec.code.map((c, i) => `<div class="code-card"><div class="code-card-h"><span>${esc(c.t)}</span><a class="btn xs primary" href="${L('playground', null, { ex: `sec:${sec.id}:${i}`, run: 1 })}">${icon('play', 11)} Try it</a></div><pre class="code-ex">${esc(c.c)}</pre>${c.out ? `<div class="code-out"><span class="eyebrow">Output</span><pre>${esc(c.out)}</pre></div>` : ''}</div>`).join('')}</div>` : ''}
        ${sec.example && sec.example.p ? `<div class="note-block"><h2>Worked example</h2><div class="callout"><div>${sec.example.p}</div><button class="btn sm mt-2" data-action="reveal">${icon('eye', 14)} Show solution</button><div class="reveal mt-2" id="sol">${sec.example.s || ''}</div></div></div>` : ''}
        ${sec.pitfalls && sec.pitfalls.length ? `<div class="note-block"><h2>Common mistakes</h2><ul class="list">${sec.pitfalls.map(i => `<li>${i}</li>`).join('')}</ul></div>` : ''}
        ${sec.tip ? `<div class="note-block"><div class="callout tip"><div class="eyebrow">Exam tip</div>${sec.tip}</div></div>` : ''}
        <div class="row between mt-3"><div>${prev ? `<button class="btn" data-action="open" data-id="${prev.id}">${icon('left', 14)} ${esc(prev.label)}</button>` : ''}</div><div class="row">${topics.length ? `<a class="btn primary" href="${L('practice', null, { topics: topics.join(',') })}">${icon('list', 14)} Practice ${esc(sec.label)}</a>` : ''}<a class="btn" href="${L('flashcards', null, { sec: sec.id })}">${icon('cards', 14)} Cards</a></div><div>${next ? `<button class="btn" data-action="open" data-id="${next.id}">${esc(next.label)} ${icon('right', 14)}</button>` : ''}</div></div>
      </div></div></div>`;
      bind(root, { open: el => App.go('notes', el.dataset.id), reveal: el => { const s = $('#sol', root); s.classList.toggle('open'); el.innerHTML = s.classList.contains('open') ? `${icon('eye', 14)} Hide solution` : `${icon('eye', 14)} Show solution`; } });
      if (App.paintMyNotes) App.paintMyNotes(root, sec);
      if (App.scrollProgress) App.scrollProgress($('.notes-layout > .stack > .panel', root));
    }
  };

  /* ======================================================
     VIEW: Formula sheet
     ====================================================== */
  App.views.formulas = {
    get title() { const it = D && (D.NAV || []).flatMap(g => g.items).find(i => i[0] === 'formulas'); return it ? it[1] : 'Formula sheet'; },
    render(root, param, query) {
      const freeG = App.limit('formulaGroups');
      const paint = filter => { const f = filter.toLowerCase(); const groups = D.FORMULAS.slice(0, freeG); const hidden = D.FORMULAS.length - groups.length; $('#fs-body', root).innerHTML = `<div class="grid cols-2">${groups.map(gp => { const items = gp.items.filter(it => !f || it.n.toLowerCase().includes(f) || gp.group.toLowerCase().includes(f) || (it.d && it.d.toLowerCase().includes(f))); if (!items.length) return ''; return `<div class="panel fs-group"><h3>${esc(gp.group)}</h3>${items.map(it => `<div class="fs-row"><div class="name">${esc(it.n)}</div>${it.c ? `<pre class="code-ex fs-code">${esc(it.c)}</pre>` : it.d ? `<div class="fs-def">${it.d}</div>` : `<div class="tex">$$${it.t}$$</div>`}</div>`).join('')}</div>`; }).join('') || '<div class="empty">No formulas match.</div>'}</div>${hidden > 0 ? `<div class="mt-2">${App.lockCard(`${hidden} more formula group${hidden === 1 ? '' : 's'} for members`, `The full ${D.short} sheet covers ${D.FORMULAS.map(g => g.group.toLowerCase()).join(', ')}. Sign up free to see and print all of it.`)}</div>` : ''}`; typeset($('#fs-body', root)); if (App.auth) App.auth.bindLocks(root); };
      root.innerHTML = pageHead(this.title, D.formulasNote || 'Everything on one page. Exams are closed-book: use this to test what you can rewrite from memory.', `<input class="input" id="fs-filter" placeholder="Filter (e.g. ${esc(D.filterExample || 'chain, torque')})…" value="${esc(query.q || '')}" style="width:220px"><button class="btn print-btn" data-action="print">${icon('print', 14)} Print</button>`) + '<div id="fs-body"></div>';
      paint(query.q || ''); $('#fs-filter', root).addEventListener('input', e => paint(e.target.value)); bind(root, { print: () => window.print() });
    }
  };

  /* ======================================================
     VIEW: Flashcards
     ====================================================== */
  App.views.flashcards = {
    title: 'Flashcards', state: {},
    render(root, param, query) {
      const st = this.state[D.id] = this.state[D.id] || { unit: 0, sec: null, deck: [], i: 0, flipped: false, mode: 'due' };
      if (query.unit) st.unit = +query.unit; if (query.sec) st.sec = query.sec; else if (!param) st.sec = null;
      const boxes = () => store.get('flashcards', {});
      const freeC = App.limit('cards'); const useCommunity = courseSetting(D.id, 'communityCards', false);
      const buildDeck = () => { const b = boxes(); let cards = D.FLASHCARDS.concat(useCommunity ? (st.community || []) : []).filter(c => (!st.unit || c.unit === st.unit) && (!st.sec || c.sec === st.sec)); st.total = cards.length; cards = QZ.helpers.shuffle(cards); if (st.mode === 'due') cards.sort((x, y) => (b[x.id] || 0) - (b[y.id] || 0)); if (cards.length > freeC) cards = cards.slice(0, freeC); st.deck = cards; st.i = 0; st.flipped = false; if (param) { const k = cards.findIndex(c => c.id === param); if (k >= 0) st.i = k; } };
      buildDeck();
      const paint = () => {
        const b = boxes(); const c = st.deck[st.i]; const mastered = st.deck.filter(x => (b[x.id] || 0) >= 3).length;
        $('#fc-stats', root).innerHTML = `<span class="chip good">${mastered} mastered</span><span class="chip">${st.deck.length}${st.total > st.deck.length ? ` of ${st.total}` : ''} cards</span>`;
        const lk = $('#fc-lock', root); if (lk) lk.innerHTML = st.total > st.deck.length ? App.lockCard(`${st.total - st.deck.length} more cards for members`, `Preview shows ${st.deck.length} cards per deck. Sign up free for all ${D.FLASHCARDS.length} ${D.short} flashcards and saved mastery boxes.`, { compact: true }) : '';
        const stage = $('#fc-stage', root); if (!c) { stage.innerHTML = '<div class="empty">No cards match this filter.</div>'; $('#fc-controls', root).innerHTML = ''; return; }
        const box = b[c.id] || 0;
        stage.innerHTML = `<div class="fc-card${st.flipped ? ' flipped' : ''}" id="fc-card" tabindex="0" role="button"><span class="sr-only">Flip card: </span><div class="fc-face fc-front"><span class="eyebrow">Card ${st.i + 1} / ${st.deck.length} · box ${box}${c.community ? ` · <span style="color:var(--accent)">community · ${esc(c.author)}</span>` : ''}</span><span class="sec chip">${esc(c.sec ? secLabel(c.sec) : 'Unit ' + c.unit)}</span><div>${c.f}</div><div class="fc-hint">Tap or press space to flip</div></div><div class="fc-face fc-back"><span class="eyebrow">Answer</span><span class="sec chip">${esc(c.sec ? secLabel(c.sec) : 'Unit ' + c.unit)}</span><div>${c.b}</div></div></div>`;
        $('#fc-controls', root).innerHTML = `${App.flagButton ? App.flagButton({ course: D.id, view: 'Flashcards', ref: c.id, prompt: c.f }) : ''}<button class="btn" data-action="prev" ${st.i === 0 ? 'disabled' : ''}>${icon('left', 14)} Prev</button><button class="btn danger" data-action="again">Again <span class="kbd">1</span></button><button class="btn primary" data-action="good">Got it <span class="kbd">2</span></button><button class="btn" data-action="next" ${st.i >= st.deck.length - 1 ? 'disabled' : ''}>Next ${icon('right', 14)}</button>`;
        typeset(stage);
      };
      root.innerHTML = pageHead('Flashcards', 'Definitions, laws and formulas. "Got it" moves a card up a box; three boxes means mastered. "Again" sends it back to the start.') + `<div class="panel"><div class="row between mb-2"><div class="chips">${[0, 1, 2, 3, 4].map(u => `<span class="chip toggle${st.unit === u ? ' on' : ''}" data-action="unit" data-u="${u}">${u ? 'Unit ' + u : 'All units'}</span>`).join('')}${st.sec ? `<span class="chip accent">${esc(secLabel(st.sec))} <span data-action="clearsec" style="cursor:pointer">✕</span></span>` : ''}</div><div class="row"><span id="fc-stats" class="row gap-sm"></span><button class="btn sm" data-action="mode">${st.mode === 'due' ? 'Order: weakest first' : 'Order: shuffled'}</button><button class="btn sm" data-action="reshuffle">${icon('rotate', 13)} Reshuffle</button><button class="btn sm${useCommunity ? ' active' : ''}" data-action="community" title="Include flashcards written by classmates">${icon('pen', 13)} Community cards</button><button class="btn sm ghost" data-action="reset">Reset progress</button></div></div><div class="fc-stage" id="fc-stage"></div><div class="fc-controls" id="fc-controls"></div><div id="fc-lock" class="mt-2"></div></div>`;
      paint();
      const grade = up => { const c = st.deck[st.i]; if (!c) return; const b = boxes(); b[c.id] = up ? Math.min(3, (b[c.id] || 0) + 1) : 0; store.set('flashcards', b); const at = store.get('fcAt', {}); at[c.id] = Date.now(); store.set('fcAt', at); markActivity(); if (st.i < st.deck.length - 1) st.i++; st.flipped = false; paint(); };
      const flip = () => { st.flipped = !st.flipped; const el = $('#fc-card', root); if (el) el.classList.toggle('flipped', st.flipped); };
      if (useCommunity && App.social && !st.community) { App.social.communityCards(D.id).then(cards => { st.community = cards; buildDeck(); paint(); if (!cards.length) toast('No community cards for this class yet. Add one under Contribute.'); }); }
      bind(root, { community: () => { setCourseSetting(D.id, 'communityCards', !useCommunity); st.community = null; this.render(root, null, {}); }, unit: el => { st.unit = +el.dataset.u; st.sec = null; App.go('flashcards', null, { unit: st.unit }); }, clearsec: () => { st.sec = null; App.go('flashcards'); }, mode: () => { st.mode = st.mode === 'due' ? 'shuffle' : 'due'; this.render(root, null, {}); }, reshuffle: () => { buildDeck(); paint(); }, reset: () => { if (confirm('Reset flashcard progress for this class?')) { store.set('flashcards', {}); paint(); toast('Flashcard progress reset'); } }, prev: () => { if (st.i > 0) { st.i--; st.flipped = false; paint(); } }, next: () => { if (st.i < st.deck.length - 1) { st.i++; st.flipped = false; paint(); } }, again: () => { grade(false); if (App.addXP) App.addXP(1); if (App.quest) App.quest('cards'); }, good: () => { grade(true); if (App.addXP) App.addXP(2); if (App.quest) App.quest('cards'); } });
      on(root, 'click', '#fc-card', flip);
      this.keys = e => { if (e.target.matches('input, textarea, select') || $('#search-modal')) return; if (e.key === ' ') { e.preventDefault(); flip(); } else if (e.key === '1') grade(false); else if (e.key === '2') grade(true); else if (e.key === 'ArrowLeft') { if (st.i > 0) { st.i--; st.flipped = false; paint(); } } else if (e.key === 'ArrowRight') { if (st.i < st.deck.length - 1) { st.i++; st.flipped = false; paint(); } } };
      document.addEventListener('keydown', this.keys);
    },
    unmount() { if (this.keys) document.removeEventListener('keydown', this.keys); }
  };

  /* ======================================================
     VIEW: Textbook & links
     ====================================================== */
  App.views.textbook = {
    title: 'Textbook & links',
    render(root) {
      const C = D.COURSE;
      root.innerHTML = pageHead('Textbook & links', `${esc(C.textbook.title)} is free online. Every topic below links straight to its chapter.`) + `<div class="stack">
        <div class="grid cols-3">${(C.links || []).map(l => `<a class="card-link" href="${l.url}" target="_blank" rel="noopener"><div class="eyebrow">${esc(l.eyebrow)}</div><h4>${esc(l.title)} ${icon('external', 12)}</h4><p>${esc(l.desc)}</p></a>`).join('')}</div>
        <div class="panel"><div class="panel-h"><div class="panel-title">${icon('book')} Topics covered this semester</div></div>
          ${D.UNITS.map(u => `<div class="eyebrow mt-2 mb-1">Unit ${u.n} · ${esc(u.title)}</div><div class="link-grid">${u.sections.map(id => { const s = secById(id); return `<div class="card-link" style="padding:10px 12px"><h4 style="font-size:14px"><a href="${s.link}" target="_blank" rel="noopener">${esc(s.label)} ${esc(s.title)} ${icon('external', 11)}</a></h4><p style="margin-top:2px"><a href="${L('notes', s.id)}">Notes on this site</a></p></div>`; }).join('')}</div>`).join('')}</div>
        ${C.pdf ? `<div class="panel"><div class="panel-h"><div class="panel-title">${icon('file')} Hosted PDF</div><a class="btn sm" href="${C.pdf}" target="_blank" rel="noopener">${icon('external', 13)} Open in new tab</a></div><iframe class="pdf-frame" src="${C.pdf}" title="Textbook PDF"></iframe><p class="small muted mt-1">Blank frame? Upload <code>${esc(C.pdf)}</code> next to this site’s <code>index.html</code>, or use the online links above.</p></div>` : ''}
      </div>`;
    }
  };

  /* ======================================================
     VIEW: Grades (supports "best n of a group", e.g. drop the lowest exam)
     ====================================================== */
  function gradeModel(vals, G = D.GRADING) {
    if (G.options && G.options.length) { let best = null; for (const o of G.options) { const m = gradeModel(vals, Object.assign({}, G, { options: null, categories: G.categories.map(c => (c.id in o.weights) ? Object.assign({}, c, { weight: o.weights[c.id] }) : c) })); if (m.den && (!best || m.cur > best.cur + 1e-9)) { best = m; best.option = o; } } return best || gradeModel(vals, Object.assign({}, G, { options: null })); }
    const cats = G.categories; const groups = G.groups || {};
    let num = 0, den = 0; const used = {};
    const groupCats = {}; cats.forEach(c => { if (c.group) (groupCats[c.group] = groupCats[c.group] || []).push(c); });
    cats.filter(c => !c.group).forEach(c => { if (c.id in vals) { num += c.weight * vals[c.id]; den += c.weight; used[c.id] = c.weight; } });
    Object.entries(groupCats).forEach(([gname, members]) => { const rule = groups[gname] || { keepBest: members.length, weight: members.reduce((s, c) => s + c.weight, 0) }; const entered = members.filter(c => c.id in vals).sort((a, b) => vals[b.id] - vals[a.id]).slice(0, rule.keepBest); const w = rule.weight / rule.keepBest; entered.forEach(c => { num += w * vals[c.id]; den += w; used[c.id] = w; }); });
    return { cur: den ? num / den : NaN, banked: num / 100, den, used };
  }
  function overallWith(vals, fill) { const all = {}; D.GRADING.categories.forEach(c => { all[c.id] = (c.id in vals) ? vals[c.id] : fill; }); return gradeModel(all).cur; }
  App.projectedGrade = id => { const C = Courses[id]; if (!C || !C.GRADING) return null; const data = (store.id === id ? store.data : store.peek(id)) || {}; const vals = data.grades || {}; if (!Object.keys(vals).length) return null; const m = gradeModel(vals, C.GRADING); if (!m.den) return null; return { letter: C.GRADING.scale.find(x => m.cur >= x.min)?.letter || 'F', pct: m.cur, den: m.den }; };
  App.views.grades = {
    title: 'Grade calculator',
    render(root) {
      const G = D.GRADING; const cats = G.categories; const saved = store.get('grades', {}); const letterFor = pct => G.scale.find(s => pct >= s.min)?.letter || 'F';
      const compute = () => {
        const vals = {}; cats.forEach(c => { const v = parseFloat($(`#g-${c.id}`, root).value); if (!isNaN(v)) vals[c.id] = Math.max(0, Math.min(100, v)); });
        store.set('grades', vals); const out = $('#g-out', root); const m = gradeModel(vals);
        if (!m.den) { out.innerHTML = '<div class="empty">Enter a percentage for at least one category.</div>'; return; }
        const finalId = G.finalId; const finalEntered = finalId in vals;
        const need = finalEntered ? [] : G.scale.filter(s => s.letter !== 'F').map(s => { const f = x => overallWith(Object.assign({}, vals, { [finalId]: x }), m.cur) - s.min; let lo = 0, hi = 100; if (f(0) >= 0) return { letter: s.letter, needed: 0 }; if (f(100) < 0) return { letter: s.letter, needed: 101 }; for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (f(mid) >= 0) hi = mid; else lo = mid; } return { letter: s.letter, needed: hi }; });
        out.innerHTML = `<div class="grid cols-3"><div class="stat"><div class="grade-letter">${letterFor(m.cur)}</div><div class="stat-label">current letter grade</div></div><div class="stat"><div class="stat-num">${m.cur.toFixed(1)}%</div><div class="stat-label">weighted average of what you entered (${Math.round(m.den)}% of the grade)</div></div><div class="stat"><div class="stat-num">${m.banked.toFixed(1)}</div><div class="stat-label">points already banked out of 100</div></div></div>${m.option ? `<p class="small mt-1">${icon('check', 12)} Using <b>${esc(m.option.label)}</b>, the exam weighting that gives you the best grade so far.</p>` : ''}
          ${finalEntered ? '' : `<div class="divider"></div><div class="eyebrow mb-1">What you need on the ${esc(cats.find(c => c.id === finalId)?.name.split(' (')[0] || 'final')}</div><p class="small muted mb-1">Assumes categories you left blank end up at your current average${Object.keys(G.groups || {}).length ? ', and applies the drop-lowest rule' : ''}.</p><div class="table-wrap"><table class="table compact"><thead><tr><th>Target</th><th class="num">Score needed</th><th>Verdict</th></tr></thead><tbody>${need.map(n => `<tr><td><b>${n.letter}</b></td><td class="num">${n.needed <= 0 ? 'any score' : n.needed > 100 ? '> 100%' : n.needed.toFixed(1) + '%'}</td><td class="small">${n.needed <= 0 ? '<span class="chip good">locked in</span>' : n.needed > 100 ? '<span class="chip bad">out of reach</span>' : n.needed > 90 ? '<span class="chip warn">tough</span>' : '<span class="chip good">doable</span>'}</td></tr>`).join('')}</tbody></table></div>`}`;
      };
      root.innerHTML = pageHead('Grade calculator', `Weights come straight from the ${esc(D.code)} syllabus. Leave a category blank if it has not happened yet.${G.note ? ' ' + esc(G.note) : ''}`, `<a class="btn sm" href="${L('gpa')}">${icon('chart', 13)} Semester GPA</a>`) + `<div class="grid cols-3"><div class="panel span-2"><div class="panel-h"><div class="panel-title">${icon('calc')} Your scores</div><button class="btn sm ghost" data-action="clear">Clear</button></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Category</th><th class="num">Weight</th><th>Your %</th></tr></thead><tbody>${cats.map(c => `<tr class="grade-row"><td>${esc(c.name)}</td><td class="num">${(+c.weight.toFixed(1))}%</td><td><input class="input mono" id="g-${c.id}" type="number" min="0" max="100" step="0.1" placeholder="—" value="${saved[c.id] ?? ''}"></td></tr>`).join('')}</tbody></table></div>
          ${Object.values(G.groups || {}).map(gp => `<p class="small muted mt-1">${esc(gp.note || '')}</p>`).join('')}</div>
        <div class="stack"><div class="panel" id="g-out"></div><div class="panel"><div class="eyebrow mb-1">Letter grade scale</div><div class="table-wrap"><table class="table compact"><thead><tr><th>Grade</th><th class="num">Percent</th>${G.scale[0].fourPt ? '<th class="num">4-point</th>' : ''}</tr></thead><tbody>${G.scale.map(s => `<tr><td><b>${s.letter}</b></td><td class="num">${s.min === 0 ? '< ' + G.scale[G.scale.length - 2].min : '≥ ' + s.min}</td>${s.fourPt ? `<td class="num">${s.fourPt}</td>` : ''}</tr>`).join('')}</tbody></table></div></div></div></div>
        ${G.rubric ? `<div class="panel mt-2"><div class="panel-h"><div class="panel-title">${icon('list')} ${G.rubricTitle || (D.id === 'physics' ? 'How each lab is scored (20 points)' : 'How written work is scored (4-point rubric)')}</div></div><div class="table-wrap"><table class="table compact"><tbody>${G.rubric.map(r => `<tr><td style="width:140px"><b>${r.score} · ${esc(r.name)}</b></td><td>${esc(r.desc)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
      compute(); $$('input', root).forEach(i => i.addEventListener('input', compute)); bind(root, { clear: () => { $$('input', root).forEach(i => i.value = ''); compute(); } });
    }
  };

  /* ======================================================
     VIEW: Course info
     ====================================================== */
  App.views.course = {
    title: 'Syllabus & policies',
    render(root) {
      const C = D.COURSE;
      root.innerHTML = pageHead('Syllabus & policies', `${esc(C.code)} ${esc(C.name)} · ${esc(C.term)} · ${esc(C.school)}. The essentials from the syllabus, in one place.`) + `<div class="grid cols-2">${D.INFO.map(p => `<div class="panel${p.span2 ? ' span-2' : ''}"><div class="panel-h"><div class="panel-title">${icon(p.icon || 'info')} ${esc(p.title)}</div></div>${p.html}</div>`).join('')}</div>`;
    }
  };

  /* ======================================================
     VIEW: Contact (works with or without a course: #/contact or #/calc/contact)
     ====================================================== */
  const CREATOR = { name: 'Nikoloz Nonikashvili', phone: '', phoneLabel: '', email: 'info@mathub.space' };
  App.CREATOR = CREATOR;
  App.views.contact = {
    title: 'Contact',
    render(root, param, query, standalone) {
      const wrap = standalone ? '<div class="landing-wrap contact-wrap">' : '';
      root.innerHTML = `${wrap}${standalone ? `<header class="landing-top"><div><div class="eyebrow">${SITE}</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Contact</h1><p class="muted">Questions, a wrong date, a broken problem, or an idea for the site? Get in touch.</p></div><div class="row gap-sm"><a class="btn" href="#/">${icon('left', 14)} All classes</a><button class="icon-btn theme-btn" data-action="theme" aria-label="Toggle theme"></button></div></header>` : pageHead('Contact', 'Questions, a wrong date, a broken problem, or an idea for the site? Get in touch.')}
        <div class="grid cols-3">
          <div class="panel span-2 contact-card">
            <div class="contact-head"><div class="avatar big">${esc(CREATOR.name.split(' ').map(w => w[0]).join(''))}</div><div><div class="eyebrow">Created by</div><h2>${esc(CREATOR.name)}</h2><p class="muted">Montana State University student. Built ${SITE} to make studying for math and physics classes easier.</p></div></div>
            <div class="divider"></div>
            <div class="contact-rows">
              ${CREATOR.phone ? `<div class="contact-row"><span class="contact-ic">${icon('clock', 18)}</span><div><div class="eyebrow">Phone</div><a class="contact-val mono" href="tel:+1${CREATOR.phone}">${esc(CREATOR.phoneLabel)}</a></div><div class="row gap-sm"><a class="btn sm" href="sms:+1${CREATOR.phone}">Text</a><button class="btn sm" data-action="copy" data-v="${CREATOR.phone}">Copy</button></div></div>` : ''}
              <div class="contact-row"><span class="contact-ic">${icon('link', 18)}</span><div><div class="eyebrow">Email</div><a class="contact-val" href="mailto:${CREATOR.email}?subject=${encodeURIComponent(SITE + ' question')}">${esc(CREATOR.email)}</a></div><div class="row gap-sm"><a class="btn sm primary" href="mailto:${CREATOR.email}?subject=${encodeURIComponent(SITE + ' question')}">Email</a><button class="btn sm" data-action="copy" data-v="${CREATOR.email}">Copy</button></div></div>
            </div>
          </div>
          <div class="stack">
            <div class="panel"><div class="panel-h"><div class="panel-title">${icon('bulb')} Reporting a problem</div></div><p class="small">The more specific, the faster the fix. Include:</p><ul class="list small mt-1"><li>the class and the page (for example “Precalc · Quizzer”)</li><li>the topic or problem number</li><li>what you expected and what you saw</li></ul></div>
            <div class="panel"><div class="panel-h"><div class="panel-title">${icon('info')} About the content</div></div><p class="small muted">Dates and rules come from each course's Fall 2026 syllabus; weekly lecture topics for physics and precalculus are estimates. Canvas and your instructor always win. ${SITE} is a student project and is not affiliated with Montana State University.</p></div>
          </div>
        </div>${standalone ? '</div>' : ''}`;
      bind(root, { copy: el => { const v = el.dataset.v; const done = () => { el.textContent = 'Copied'; setTimeout(() => el.textContent = 'Copy', 1500); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, () => toast(v, 3000)); else toast(v, 3000); }, theme: toggleTheme });
      if (standalone) applyTheme();
    }
  };

  /* ======================================================
     VIEW: Settings
     ====================================================== */
  App.views.settings = {
    title: 'Settings',
    render(root, param, query, standalone) {
      const s = settings(); const C = standalone ? null : D; const hasLab = !!(C && (C.RECURRING || []).some(r => r.afterLabDay)); const V = C && C.VARIANTS;
      const mine = App.myCourses(); const sem = (C || Courses[mine[0]] || Courses[COURSE_ORDER[0]] || {}).SEMESTER || { start: '', end: '' };
      const head = standalone
        ? `<header class="landing-top"><div><div class="eyebrow">Mathub</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Settings</h1><p class="muted">Your account, notifications, classes and preferences. They apply everywhere on Mathub.</p></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="#/">${icon('left', 14)} All classes</a></div></header>`
        : pageHead('Settings', 'Preferences apply to every class. Progress is stored per class and, when you are logged in, synced to your account.');
      const classesPanel = `<div class="panel span-2"><div class="panel-h"><div class="panel-title">${icon('grid')} Your classes</div><button class="btn sm" data-action="choose">Choose classes and sections</button></div><div class="row gap-sm" style="flex-wrap:wrap">${mine.map(id => `<span class="chip course-${id}">${esc(Courses[id].short)}${courseSetting(id, 'section', '') ? ' · sec ' + esc(courseSetting(id, 'section', '')) : ''}${courseSetting(id, 'examTime', '') ? ' · ' + esc(courseSetting(id, 'examTime', '')) : ''}</span>`).join('')}</div><p class="small muted mt-1">Only these classes show on the landing page, in the course switcher, in reminders and in the weekly digest.</p>${App.requestLink ? App.requestLink('small') : ''}</div>`;
      const prefsPanel = `<div class="panel"><div class="panel-h"><div class="panel-title">${icon('sliders')} Preferences</div></div>
          ${I18N ? `<div class="field mb-2"><label for="s-lang">Language</label><select class="select" id="s-lang" translate="no">${I18N.langs.map(([c, n]) => `<option value="${c}"${c === App.lang ? ' selected' : ''}>${n}</option>`).join('')}</select><p class="muted small mt-1">The interface and Bo. Class notes and questions stay in the class’s own language.</p></div>` : ''}
          <div class="field mb-2"><label for="s-theme">Theme</label><select class="select" id="s-theme"><option value="system"${s.theme === 'system' ? ' selected' : ''}>Match system</option><option value="light"${s.theme === 'light' ? ' selected' : ''}>Light</option><option value="dark"${s.theme === 'dark' ? ' selected' : ''}>Dark</option></select></div>
          <div class="field mb-2"><label>Look</label><div class="skin-pick" id="s-skins">${(App.SKINS || []).map(([id, name, sub, [bg, ac]]) => `<button type="button" class="skin-opt${(App.skinOf ? App.skinOf() : (s.skin || 'default')) === id ? ' on' : ''}" data-action="skin" data-skin="${id}" aria-pressed="${(App.skinOf ? App.skinOf() : (s.skin || 'default')) === id}"><span class="skin-swatch" style="background:${bg}"><i style="background:${ac}"></i><i></i></span><b>${name}</b><small>${sub}</small></button>`).join('')}</div></div>
          <label class="check" style="padding:0"><input type="checkbox" id="s-motion" ${s.motion === 'off' ? 'checked' : ''}><span>Reduce motion <span class="muted small">(no animations or transitions)</span></span></label>
          ${App.boFloat ? `<label class="check" style="padding:0"><input type="checkbox" id="s-bofloat" ${s.boFloat === false ? '' : 'checked'}><span>Bo on every page <span class="muted small">(he floats in a corner; tap him to ask about what you're looking at)</span></span></label>
          <label class="check" style="padding:0"><input type="checkbox" id="s-botips" ${s.boTips === false || s.boFloat === false ? '' : 'checked'}${s.boFloat === false ? ' disabled' : ''}><span>Tips from Bo <span class="muted small">(now and then he offers to help with the questions on a page)</span></span></label>` : ''}
          <label class="check" style="padding:0"><input type="checkbox" id="s-geek" ${s.geek === true ? 'checked' : ''}><span>Geek mode <span class="muted small">(headings decode, a terminal status line, scanlines and CRT dialogs between pages)</span></span></label>
          <div class="row gap-sm mt-2" style="flex-wrap:wrap"><button class="btn sm" data-action="tour-again">${icon('eye', 13)} Show the tour again</button><a class="btn sm" href="#/tools">${icon('sliders', 13)} Tools</a><a class="btn sm" href="#/resources">${icon('link', 13)} Resources</a></div>
          <div class="field mb-2"><label for="s-goal">Daily XP goal</label><select class="select" id="s-goal">${(App.GOALS || [[30, 'Regular']]).map(([n, name]) => `<option value="${n}"${(App.dailyGoal ? App.dailyGoal() : 30) === n ? ' selected' : ''}>${n} XP · ${name}</option>`).join('')}</select><span class="help">A correct answer is 10 XP. The ring in the header fills up as you go; hit the goal every day to keep your streak strong.</span></div>
          <label class="check" style="padding:0"><input type="checkbox" id="s-sound" ${s.sound === false ? '' : 'checked'}><span>Sound effects <span class="muted small">(short cues for right, wrong and finished lessons)</span></span></label>
          <label class="check mb-2" style="padding:0"><input type="checkbox" id="s-livebg" ${s.liveBg === true ? 'checked' : ''}><span>Animated background <span class="muted small">(drifting symbols; off automatically when your system prefers reduced motion)</span></span></label>
          ${V ? `<div class="field"><label for="s-variant">${esc(V.label || 'Your section')}</label><select class="select" id="s-variant">${V.options.map(o => `<option value="${esc(o.id)}"${sectionVariant(C) === o.id ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select><span class="help">${esc(V.hint || 'Sets the lecture days and exam dates on your calendar.')}</span></div>` : ''}
          ${hasLab ? `<div class="field"><label>Your ${esc(C.short)} lab day</label><select class="select" id="s-lab"><option value="tue"${courseSetting(C.id, 'labDay', 'tue') !== 'thu' ? ' selected' : ''}>Tuesday</option><option value="thu"${courseSetting(C.id, 'labDay', 'tue') === 'thu' ? ' selected' : ''}>Thursday</option></select><span class="help">Sets when lab sheets show as due on the dashboard (8:00 pm the day after lab).</span></div>` : ''}
          <div class="field mt-2"><label for="s-asof">Preview the site as of a date</label><div class="row gap-sm"><input class="input" id="s-asof" type="date" value="${esc(s.asof || '')}" min="${sem.start}" max="${sem.end}" style="max-width:200px"><button class="btn sm ghost" data-action="asof-clear">Back to today</button></div><span class="help">Jump ahead to see what the dashboard, countdowns and due lists will show later in the semester.</span></div>
          <div class="divider"></div><div class="eyebrow mb-1">Keyboard shortcuts</div>
          <ul class="list-plain small"><li><span class="kbd">Ctrl</span> + <span class="kbd">K</span> search this class</li><li><span class="kbd">Space</span> flip a flashcard · <span class="kbd">1</span> again · <span class="kbd">2</span> got it · <span class="kbd">←</span> <span class="kbd">→</span> move</li><li><span class="kbd">1</span>–<span class="kbd">4</span> choose an answer in the quizzer · <span class="kbd">Enter</span> check a typed answer</li></ul></div>`;
      const dataPanel = C ? `<div class="panel"><div class="panel-h"><div class="panel-title">${icon('download')} Your ${esc(C.short)} data</div></div><p class="small muted mb-2">Quiz history, flashcard boxes, checklists, grade entries and scratchpad strokes for this class.</p>
          <div class="row"><button class="btn" data-action="export">${icon('download', 14)} Export backup</button><label class="btn">${icon('rotate', 14)} Import backup <input type="file" id="s-import" accept="application/json" hidden></label><button class="btn danger" data-action="reset">${icon('trash', 14)} Reset ${esc(C.short)} progress</button></div>
          <textarea class="input mono mt-2" id="s-json" rows="8" placeholder="Export writes your backup here; paste a backup here and click Import from text." spellcheck="false"></textarea><button class="btn sm mt-1" data-action="import-text">Import from text</button></div>`
        : `<div class="panel"><div class="panel-h"><div class="panel-title">${icon('download')} Backups and class data</div></div><p class="small muted mb-2">Quiz history, flashcard boxes, checklists, grades and scratchpads are stored per class. Open a class to export, import or reset its data.</p><div class="stack-sm">${mine.map(id => `<a class="card-link" href="#/${id}/settings"><h3>${esc(Courses[id].short)} · ${esc(Courses[id].name)}</h3><p>Backup, import or reset ${esc(Courses[id].short)} progress ${icon('right', 12)}</p></a>`).join('')}</div></div>`;
      root.innerHTML = `${standalone ? '<div class="landing-wrap settings-wrap">' : ''}${head}<div class="grid cols-2"><div id="acct-panel" class="span-2"></div>${classesPanel}${prefsPanel}${dataPanel}</div>${standalone ? '</div>' : ''}`;
      const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
      $('#s-theme', root).addEventListener('change', e => { setSetting('theme', e.target.value); applyTheme(); });
      on(root, 'click', '[data-action="tour-again"]', () => { setSetting('tourDone', false); try { sessionStorage.removeItem('mh-tour'); } catch (e) {} location.hash = '#/'; setTimeout(() => { if (App.tour) App.tour.start(true); }, 700); });
      on(root, 'click', '[data-action="skin"]', el => { setSetting('skin', el.dataset.skin); applyTheme(); $$('.skin-opt', root).forEach(b => { b.classList.toggle('on', b === el); b.setAttribute('aria-pressed', b === el); }); toast(`${el.querySelector('b').textContent} look on.`, 1800); });
      const sl = $('#s-lang', root); if (sl) sl.addEventListener('change', e => I18N.set(e.target.value));
      const sm = $('#s-motion', root); if (sm) sm.addEventListener('change', e => { setSetting('motion', e.target.checked ? 'off' : 'on'); applyTheme(); });
      const sbf = $('#s-bofloat', root); if (sbf) sbf.addEventListener('change', e => { setSetting('boFloat', e.target.checked); const t = $('#s-botips', root); if (t) { t.disabled = !e.target.checked; t.checked = e.target.checked && settings().boTips !== false; } if (App.boFloat && App.boFloat.sync) App.boFloat.sync(); toast(e.target.checked ? 'Bo is back on every page.' : 'Bo stays on Ask Bo. Turn him back on here any time.'); });
      const sbt = $('#s-botips', root); if (sbt) sbt.addEventListener('change', e => setSetting('boTips', e.target.checked));
      const sgk = $('#s-geek', root); if (sgk) sgk.addEventListener('change', e => { setSetting('geek', e.target.checked); applyTheme(); if (e.target.checked && App.geekSweep) App.geekSweep(); toast(e.target.checked ? (App.geekOn && App.geekOn() ? 'Geek mode on.' : 'Geek mode on. It stays still while Reduce motion is on.') : 'Geek mode off.', 2200); });
      const sg = $('#s-goal', root); if (sg) sg.addEventListener('change', e => { setSetting('dailyGoal', +e.target.value); if (App.paintStats) { App.paintStats(); App.paintMascots(); } toast(`Daily goal: ${e.target.value} XP`); });
      const sd = $('#s-sound', root); if (sd) sd.addEventListener('change', e => { setSetting('sound', e.target.checked); if (e.target.checked && App.sfx) App.sfx.play('correct'); });
      const lb = $('#s-livebg', root); if (lb) lb.addEventListener('change', e => { setSetting('liveBg', e.target.checked); if (App.liveBg) App.liveBg.apply(); });
      $('#s-asof', root).addEventListener('change', e => { setSetting('asof', e.target.value || ''); render(); if (e.target.value) toast(`Viewing the site as of ${fmtDate(e.target.value)}`); });
      const acct = $('#acct-panel', root); if (acct && App.auth) acct.replaceWith(Object.assign(App.auth.settingsPanel(root), { className: 'panel span-2 acct-panel' }));
      const lab = $('#s-lab', root); if (lab) lab.addEventListener('change', e => { setCourseSetting(C.id, 'labDay', e.target.value); toast('Lab day saved'); });
      const vsel = $('#s-variant', root); if (vsel) vsel.addEventListener('change', e => { setCourseSetting(C.id, 'variant', e.target.value); applyVariant(C); toast(V.saved || 'Section saved. Your calendar and exam dates now follow it.'); });
      const imp = $('#s-import', root); if (imp) imp.addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; f.text().then(txt => { try { store.importJSON(txt); toast('Backup imported'); render(); } catch (err) { alert('Could not import: ' + err.message); } }); });
      bind(root, { export: () => { const txt = store.exportJSON(); $('#s-json', root).value = txt; try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = `studyhub-${C.id}-${todayISO()}.json`; a.click(); } catch {} toast('Backup ready'); }, 'import-text': () => { try { store.importJSON($('#s-json', root).value); toast('Backup imported'); render(); } catch (err) { alert('Could not import: ' + err.message); } }, reset: () => { if (confirm(`Erase all saved ${C.short} progress on this device?`)) { store.reset(); toast('Progress reset'); render(); } }, 'asof-clear': () => { setSetting('asof', ''); render(); }, choose: () => { if (App.auth && App.auth.user) App.auth.onboard(true); else if (App.auth) App.auth.open('signup'); } });
    }
  };

  /* ---------- boot ---------- */
  global.App = App;
  function staleShell() {
    // An old cached index.html can load a newer app.js. If the page is missing the pieces this build needs, reload once bypassing the cache.
    const need = ['#account-box', '#course-switch', '#sidebar-nav'].every(sel => $(sel)) && Object.keys(Courses).length >= 1;
    if (need) return false;
    let tried = false; try { tried = sessionStorage.getItem('mathub-reloaded') === BUILD; sessionStorage.setItem('mathub-reloaded', BUILD); } catch {}
    if (tried) return false;
    fetch(location.pathname, { cache: 'reload' }).catch(() => {}).finally(() => location.reload());
    return true;
  }
  document.addEventListener('DOMContentLoaded', () => { if (staleShell()) return; buildLayout(); Pomo.draw(); render(); if (global.MathJax && global.MathJax.startup && global.MathJax.startup.promise) global.MathJax.startup.promise.then(() => typeset($('#view'))); });
})(window);

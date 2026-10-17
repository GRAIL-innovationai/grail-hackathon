/* ============================================================
   Mathub — accounts, preview gating and progress sync
   Talks to api/index.php (PHP + SQLite). When the account server is
   unreachable (site opened as a file, api/ not uploaded) it falls back
   to a local sign-in that keeps progress in this browser only.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, on, toast } = App;
  const API = 'api/index.php?r=';
  const LOCAL_KEY = 'mathub-local-user';
  const LAST_KEY = 'mathub-last-user';
  const META_KEY = 'studyhub-meta';
  const HARD = new Set(['grades', 'scratchpad', 'grapher', 'labs', 'motion', 'solvers', 'explorer', 'unitcircle']);
  const LIMITS = { questions: 3, cards: 5, sections: 3, formulaGroups: 2 };

  const Auth = { user: null, mode: 'checking', ready: false, health: null, limits: LIMITS, lastPull: {}, pushing: {}, timers: {}, listeners: [] };
  App.auth = Auth;

  /* ---------- transport ---------- */
  async function call(route, body, method) {
    const opts = { method: method || (body ? 'POST' : 'GET'), credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Accept': 'application/json' }, cache: 'no-store' };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res, json;
    try { res = await fetch(API + route, opts); } catch (e) { Auth.unreachable = true; paintAccount(); throw Object.assign(new Error('You seem to be offline. Mathub keeps working; your progress syncs when you are back.'), { network: true }); }
    try { json = await res.json(); } catch (e) { throw Object.assign(new Error('The account server sent an unexpected reply (' + res.status + ').'), { network: true }); }
    if (json && json.offline) { Auth.unreachable = true; paintAccount(); throw Object.assign(new Error('You are offline. Your progress syncs when you are back.'), { network: true }); }
    if (Auth.unreachable) { Auth.unreachable = false; paintAccount(); }
    if (!json || json.ok === false) { const err = new Error((json && json.error) || 'Request failed.'); err.status = res.status; err.data = json; throw err; }
    return json;
  }
  const readJSON = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const writeJSON = (key, v) => { try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch {} };
  const meta = () => readJSON(META_KEY) || {};
  const setMeta = (course, patch) => { const m = meta(); m[course] = Object.assign({}, m[course], patch); writeJSON(META_KEY, m); };

  Auth.isIn = () => !!Auth.user;
  Auth.locked = () => !Auth.user;
  Auth.gate = view => (HARD.has(view) && !Auth.user) ? 'hard' : 'open';
  Auth.emailOk = email => { const m = /^[^\s@]+@([^\s@]+)$/.exec(String(email || '').trim().toLowerCase()); if (!m) return false; const dom = m[1]; const allowed = (Auth.health && Auth.health.domains) || ['montana.edu']; return allowed.some(d => dom === d || dom.endsWith('.' + d)); };
  Auth.onChange = fn => Auth.listeners.push(fn);
  Auth.setUnread = n => { if (Auth.user) Auth.user.unread = n; const b = $('#notif-badge'); if (b) { b.textContent = n > 99 ? '99+' : String(n); b.hidden = !(n > 0); } const btn = $('#notif-btn'); if (btn) { btn.hidden = !Auth.user || Auth.mode === 'offline'; btn.setAttribute('aria-label', n > 0 ? `Inbox, ${n > 99 ? '99+' : n} unread` : 'Inbox'); } $$('.inbox-pill').forEach(p => { p.textContent = n > 99 ? '99+' : String(n); p.hidden = !(n > 0); }); };
  function applyServerPrefs() {
    const u = Auth.user; if (!u || u.local) return;
    if (Array.isArray(u.courses)) App.setSetting('courses', u.courses);
    if (u.sections && typeof u.sections === 'object') Object.entries(u.sections).forEach(([cid, v]) => { if (!v) return; if (v.section !== undefined) App.setCourseSetting(cid, 'section', v.section || ''); if (v.examTime !== undefined) App.setCourseSetting(cid, 'examTime', v.examTime || ''); if (v.labDay) App.setCourseSetting(cid, 'labDay', v.labDay); if (App.applyVariant) App.applyVariant(global.Courses[cid]); });
  }
  /** Saves class/section/notification preferences to the account (server) and mirrors them locally. */
  Auth.savePrefs = async function (patch) {
    if (patch.courses) App.setSetting('courses', patch.courses);
    if (patch.sections) Object.entries(patch.sections).forEach(([cid, v]) => { App.setCourseSetting(cid, 'section', v.section || ''); App.setCourseSetting(cid, 'examTime', v.examTime || ''); if (v.labDay) App.setCourseSetting(cid, 'labDay', v.labDay); if (App.applyVariant) App.applyVariant(global.Courses[cid]); });
    if (Auth.user && Auth.mode === 'server' && !Auth.unreachable) { const r = await call('profile', patch); Auth.user = Object.assign(Auth.user, r.user); }
    else if (Auth.user) { Object.assign(Auth.user, patch); if (Auth.user.local) writeJSON(LOCAL_KEY, Auth.user); }
    if (App.rebuildNav) App.rebuildNav();
  };
  /** Onboarding: which classes, which section, exam time, lab day. Shown once after sign-up, or on demand from Settings. */
  Auth.onboard = function (force) {
    const u = Auth.user; if (!u) return; if (!force && Array.isArray(u.courses)) return;
    let dismissed = false; try { dismissed = localStorage.getItem('mathub-onboarded') === '1'; } catch {}
    if (!force && dismissed) return;
    const courses = App.COURSE_ORDER.filter(id => global.Courses[id]); const chosen = Array.isArray(u.courses) && u.courses.length ? u.courses : (App.settings().courses || courses);
    const m = document.createElement('div'); m.className = 'modal-backdrop'; m.id = 'onboard-modal';
    m.innerHTML = `<div class="modal auth-modal onboard-modal" role="dialog" aria-label="Your classes"><div class="auth-head"><span class="logo-mark">${App.logoSvg(26)}</span><div><b>Which classes are you taking?</b><div class="small muted">Mathub hides the rest and uses your section's times.</div></div><button class="icon-btn" data-action="close" aria-label="Close">${icon('x', 16)}</button></div>
      <div class="onboard-list">${courses.map(id => { const C = global.Courses[id]; const on = chosen.includes(id); const hasLab = (C.RECURRING || []).some(r => r.afterLabDay); return `<div class="onboard-course${on ? ' on' : ''}" data-c="${id}"><label class="check" style="padding:0"><input type="checkbox" data-course="${id}" ${on ? 'checked' : ''}><span><b>${esc(C.code)}</b> ${esc(C.name)}</span></label>
        <div class="onboard-fields grid cols-3" style="gap:8px"><div class="field"><label>Section</label><input class="input" data-sec="${id}" maxlength="20" placeholder="e.g. 002" value="${esc(App.courseSetting(id, 'section', ''))}"></div><div class="field"><label>Your lecture / exam time</label><input class="input" data-time="${id}" maxlength="60" placeholder="e.g. MWF 9:00 am" value="${esc(App.courseSetting(id, 'examTime', ''))}"></div>${hasLab ? `<div class="field"><label>Lab day</label><select class="select" data-lab="${id}"><option value="tue"${App.courseSetting(id, 'labDay', 'tue') !== 'thu' ? ' selected' : ''}>Tuesday</option><option value="thu"${App.courseSetting(id, 'labDay', 'tue') === 'thu' ? ' selected' : ''}>Thursday</option></select></div>` : '<div></div>'}</div></div>`; }).join('')}</div>
      ${App.requestLink ? `<div class="mt-1">${App.requestLink('small')}</div>` : ''}
      <div class="eyebrow mt-2 mb-1">Daily XP goal</div><div class="goal-picks">${(App.GOALS || []).map(([n, nm]) => `<button type="button" class="goal-pick${(App.dailyGoal ? App.dailyGoal() : 30) === n ? ' on' : ''}" data-action="goal" data-n="${n}"><b>${n} XP</b><span>${nm}</span></button>`).join('')}</div><p class="small muted mt-1">A correct answer is 10 XP. You can change this any time in Settings.</p>
      <div class="row gap-sm mt-2"><button class="btn primary" data-action="save">Save</button><button class="btn" data-action="close">${force ? 'Cancel' : 'Skip for now'}</button></div><div class="auth-msg" id="onboard-msg"></div></div>`;
    document.body.appendChild(m);
    const done = () => { App.dismiss(m); try { localStorage.setItem('mathub-onboarded', '1'); } catch {} };
    on(m, 'change', 'input[data-course]', el => { el.closest('.onboard-course').classList.toggle('on', el.checked); });
    bind(m, { goal: b => { $$('.goal-pick', m).forEach(x => x.classList.toggle('on', x === b)); }, close: () => { done(); if (!Array.isArray(u.courses)) Auth.savePrefs({ courses: courses }).catch(() => {}); },
      save: async () => { const picked = $$('input[data-course]', m).filter(i => i.checked).map(i => i.dataset.course); if (!picked.length) { $('#onboard-msg', m).textContent = 'Pick at least one class.'; return; } const sections = {}; courses.forEach(id => { const lab = $(`select[data-lab="${id}"]`, m); sections[id] = { section: $(`input[data-sec="${id}"]`, m).value.trim(), examTime: $(`input[data-time="${id}"]`, m).value.trim(), labDay: lab ? lab.value : '' }; }); const gp = $('.goal-pick.on', m); if (gp) App.setSetting('dailyGoal', +gp.dataset.n); try { await Auth.savePrefs({ courses: picked, sections }); done(); if (App.paintStats) App.paintStats(); toast('Saved. Mathub now shows ' + picked.map(id => global.Courses[id].short).join(', ') + '.', 3500); App.rerender(); } catch (e) { $('#onboard-msg', m).textContent = e.message; } } });
    m.addEventListener('click', e => { if (e.target === m) bind; if (e.target.closest('.rq-link')) done(); });
  };
  function changed() { applyServerPrefs(); paintAccount(); paintBanner(); Auth.setUnread(Auth.user ? (Auth.user.unread || 0) : 0); if (Auth.user && !Auth.user.local && Auth.mode === 'server') writeJSON(LAST_KEY, { user: Auth.user, health: Auth.health ? { domains: Auth.health.domains } : null, at: Date.now() }); if (!Auth.user) writeJSON(LAST_KEY, null); Auth.listeners.forEach(fn => { try { fn(Auth.user); } catch (e) { console.error(e); } }); }

  /* ---------- boot ---------- */
  Auth.init = async function () {
    try {
      const h = await call('health'); Auth.health = h; Auth.mode = 'server'; Auth.user = h.user || null; Auth.unreachable = false; writeJSON(LAST_KEY, Auth.user ? { user: Auth.user, health: { domains: h.domains }, at: Date.now() } : null);
    } catch (e) {
      const last = readJSON(LAST_KEY);
      if (e.network && last && last.user) { Auth.mode = 'server'; Auth.unreachable = true; Auth.user = last.user; Auth.health = last.health || null; }
      else { Auth.mode = 'offline'; const lu = readJSON(LOCAL_KEY); Auth.user = lu && lu.email ? Object.assign({ local: true }, lu) : null; }
    }
    window.addEventListener('online', () => { if (Auth.unreachable) Auth.init(); });
    if (Auth.mode === 'server' && !Auth.unreachable) setInterval(() => { if (document.visibilityState === 'visible' && Auth.user) call('me').then(r => { if (r.user) { Auth.user = Object.assign(Auth.user, r.user); Auth.setUnread(r.user.unread || 0); } else if (Auth.user && !Auth.user.local) { Auth.user = null; changed(); App.rerender(); } }).catch(() => {}); }, 90000);
    Auth.ready = true; changed(); if (App.rebuildNav) App.rebuildNav();
    if (App.welcome && App.welcome.needed()) setTimeout(() => { if (App.welcome.needed()) App.welcome.open(); }, 500);   // the welcome was left before the choices were made
    // an invitation from an administrator: #/?setpw=<email> opens "choose your password" with the address filled in
    { const sp = /[?&]setpw=([^&#]+)/.exec(location.hash); if (sp && !Auth.user && Auth.mode === 'server') setTimeout(() => Auth.open('reset', decodeURIComponent(sp[1])), 300); }
    if (App.current && !(App.current === App.views.practice && App.views.practice.hasSession && App.views.practice.hasSession())) { try { App.rerender(); } catch (e) { console.error(e); } }
    if (Auth.user && Auth.mode === 'server') Auth.pullAll().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Auth.user && Auth.mode === 'server' && App.D) Auth.pullCourse(App.D.id, true).catch(() => {}); });
  };

  /* ---------- push notifications ---------- */
  const b64ToU8 = b64 => { const s = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'); const raw = atob(s); const out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; };
  Auth.pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in global && 'Notification' in global && Auth.mode === 'server';
  Auth.pushSubscribe = async function () {
    const reg = await navigator.serviceWorker.ready; const perm = await Notification.requestPermission(); if (perm !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in the browser settings and try again.');
    const k = await call('push_key'); let sub = await reg.pushManager.getSubscription(); if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(k.key) });
    const r = await call('push_subscribe', sub.toJSON()); App.setSetting('pushOn', true); return r;
  };
  Auth.pushUnsubscribe = async function () { try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) { await call('push_unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); } } catch (e) {} App.setSetting('pushOn', false); };
  /* ---------- calendar link, invite link, join banner ---------- */
  /* the devices this account is signed in on, with "sign out everywhere else" (api: sessions, logout_others) */
  Auth.devicesInit = async function (panel) {
    const el = $('#acct-devices', panel); if (!el) return;
    try { const r = await call('sessions', null, 'GET'); const others = r.devices.filter(d => !d.current).length;
      el.innerHTML = `<ul class="list-plain small dev-list">${r.devices.map(d => `<li>${icon(d.current ? 'check' : 'user', 12)} <b>${esc(d.device)}</b>${d.current ? ' <span class="chip xs good">this device</span>' : ''} <span class="muted">· signed in ${esc(new Date(d.created * 1000).toLocaleDateString())}</span></li>`).join('')}</ul>${others ? `<button class="btn sm mt-1" data-action="devices-out">${icon('logout', 13)} Sign out everywhere else</button>` : '<p class="small muted mt-1">Only this device is signed in.</p>'}`; }
    catch (e) { el.innerHTML = `<div class="small muted">${esc(e.message)}</div>`; }
  };
  /* members this account blocked in discussions, with Unblock (api: forum_blocks, forum_unblock) */
  Auth.blocksInit = async function (panel) {
    const el = $('#acct-blocks', panel); if (!el) return;
    try { const r = await call('forum_blocks', null, 'GET');
      el.innerHTML = r.blocks.length ? `<ul class="list-plain small dev-list">${r.blocks.map(b => `<li class="row between gap-sm"><span>${icon('user', 12)} <b>${esc(b.label || 'A member')}</b>${b.anon ? ' <span class="muted">(their anonymous posts)</span>' : ''} <span class="muted">· blocked ${esc(new Date(b.created * 1000).toLocaleDateString())}</span></span><button class="btn xs" data-action="unblock" data-id="${b.id}">Unblock</button></li>`).join('')}</ul>` : '<p class="small muted">You have not blocked anyone.</p>';
      bind(el, { unblock: async b => { try { await call('forum_unblock', { id: +b.dataset.id }); toast('Unblocked. Their posts show again.'); Auth.blocksInit(panel); } catch (e) { toast(e.message, 3000); } } }); }
    catch (e) { el.innerHTML = `<div class="small muted">${esc(e.message)}</div>`; }
  };
  Auth.growthInit = async function (panel) {
    const cal = $('#acct-cal', panel), inv = $('#acct-invite', panel); if (!cal && !inv) return; if (!Auth.user || Auth.mode !== 'server') { if (cal) cal.innerHTML = '<div class="small muted">Needs the account server.</div>'; if (inv) inv.innerHTML = ''; return; }
    const base = App.siteBase();
    if (cal) { try { const r = await call('ics_token'); const url = `${base}api/index.php?r=ics&t=${r.token}`; const webcal = url.replace(/^https?:\/\//, 'webcal://');
      cal.innerHTML = `<div class="cal-sub"><input class="input mono small" id="acct-ics" value="${esc(url)}" readonly aria-label="Calendar subscription link"><div class="row gap-sm mt-1" style="flex-wrap:wrap"><button class="btn sm primary" data-action="ics-copy">${icon('file', 13)} Copy link</button><a class="btn sm" href="${esc(webcal)}">${icon('calendar', 13)} Open in calendar app</a><a class="btn sm" href="${esc(url)}" download="mathub.ics">${icon('download', 13)} Download .ics</a><button class="btn sm ghost" data-action="ics-reset">${icon('rotate', 13)} New link</button></div><details class="mt-1"><summary class="small">How to subscribe (${r.events} events)</summary><ul class="list small mt-1"><li><b>Google Calendar</b> (on a computer): Other calendars → + → From URL → paste the link → Add calendar. Updates every few hours.</li><li><b>Apple Calendar</b>: File → New Calendar Subscription → paste the link. On iPhone: Settings → Calendar → Accounts → Add Subscribed Calendar.</li><li><b>Outlook</b>: Add calendar → Subscribe from web → paste the link.</li></ul></details></div>`;
      bind(cal, { 'ics-copy': async () => { try { await navigator.clipboard.writeText(url); toast('Calendar link copied. Paste it into your calendar app.', 3000); } catch (e) { $('#acct-ics', cal).select(); } }, 'ics-reset': async () => { if (!confirm('Make a new link? Calendars using the old one stop updating.')) return; await call('ics_token_reset', {}); Auth.growthInit(panel); toast('New calendar link made.'); } });
    } catch (e) { cal.innerHTML = `<div class="small muted">${esc(e.message)}</div>`; } }
    if (inv) { try { const r = await call('invite_mine'); const link = `${base}#/join?ref=${r.code}`; const text = `Study with me on Mathub: free notes, endless practice and a class board for our Montana State classes. ${link}`;
      inv.innerHTML = `<div class="invite-card"><div class="row gap-sm" style="flex-wrap:wrap"><input class="input mono small" id="acct-invlink" value="${esc(link)}" readonly aria-label="Invite link" style="flex:1 1 240px"><button class="btn sm primary" data-action="inv-share">${icon('external', 13)} ${navigator.share ? 'Share' : 'Copy'}</button></div><div class="small muted mt-1">${r.joined ? `${r.joined} classmate${r.joined === 1 ? '' : 's'} joined through your link.` : 'Nobody has used it yet. Send it to your study group.'}</div></div>`;
      bind(inv, { 'inv-share': async () => { try { if (navigator.share) await navigator.share({ title: 'Mathub', text, url: link }); else { await navigator.clipboard.writeText(text); toast('Invite copied. Paste it in your group chat.', 3000); } } catch (e) {} } });
    } catch (e) { inv.innerHTML = `<div class="small muted">${esc(e.message)}</div>`; } }
  };
  App.inviteBanner = function () {
    let ref = '', name = ''; try { ref = localStorage.getItem('mathub-ref') || ''; name = sessionStorage.getItem('mathub-ref-name') || ''; } catch (e) {}
    if (!ref || Auth.user) return ''; return `<div class="callout small row between" style="gap:10px;margin-bottom:12px"><span>${icon('users', 14)} ${name ? `<b>${esc(name)}</b> invited you.` : 'You were invited by a classmate.'} Sign up with your montana.edu email and you both earn a badge.</span><button class="btn sm primary" data-action="auth-signup">Sign up</button></div>`;
  };
  Auth.pushInit = async function (panel) {
    const box = $('#acct-push', panel), note = $('#acct-push-note', panel), test = $('[data-action="push-test"]', panel); if (!box) return;
    if (!Auth.user || !Auth.pushSupported()) { note.textContent = Auth.mode !== 'server' ? 'Needs the account server.' : 'Not supported in this browser.'; return; }
    let sub = null; try { const reg = await navigator.serviceWorker.ready; sub = await reg.pushManager.getSubscription(); } catch (e) {}
    box.disabled = false; box.checked = !!sub && Notification.permission === 'granted'; test.disabled = !box.checked; note.textContent = box.checked ? 'On for this device.' : (Notification.permission === 'denied' ? 'Blocked in the browser settings.' : 'Off.');
    box.addEventListener('change', async () => { box.disabled = true; try { if (box.checked) { const r = await Auth.pushSubscribe(); note.textContent = `On for this device${r.devices > 1 ? ` (${r.devices} devices)` : ''}.`; App.toast('Reminders will arrive the evening before something is due.'); } else { await Auth.pushUnsubscribe(); note.textContent = 'Off.'; } } catch (e) { box.checked = false; note.textContent = e.message || 'Could not turn notifications on.'; } box.disabled = false; test.disabled = !box.checked; });
    test.addEventListener('click', async () => { test.disabled = true; try { const r = await call('push_test', {}); note.textContent = r.note || 'Sent.'; } catch (e) { note.textContent = e.message; } test.disabled = false; });
  };

  /* ---------- sync ---------- */
  Auth.noteWrite = function (course) {
    setMeta(course, { updated: Date.now() });
    if (!Auth.user || Auth.mode !== 'server') return;
    clearTimeout(Auth.timers[course]); Auth.timers[course] = setTimeout(() => Auth.pushCourse(course).catch(() => {}), 1500);
  };
  Auth.pushCourse = async function (course, force) {
    if (!Auth.user || Auth.mode !== 'server') return;
    const data = App.store.peek(course); const m = meta()[course] || {}; const updated = m.updated || Date.now();
    setSyncState('saving');
    try {
      const r = await call('data', { course, data, updated, force: !!force }, 'PUT');
      if (r.stale) { await Auth.pullCourse(course, true); } else setMeta(course, { synced: r.updated });
      setSyncState('ok'); if (App.social) App.social.refreshBadges();
    } catch (e) { setSyncState(e.status === 401 ? 'out' : 'error'); if (e.status === 401) { Auth.user = null; changed(); } throw e; }
  };
  Auth.pullCourse = async function (course, quiet) {
    if (!Auth.user || Auth.mode !== 'server') return;
    if (quiet && Auth.lastPull[course] && Date.now() - Auth.lastPull[course] < 45000) return;
    Auth.lastPull[course] = Date.now();
    const r = await call('data&course=' + encodeURIComponent(course));
    applyServer(course, r.data, r.updated);
  };
  /* ---------- preferences that follow the account (device-local settings such as the GPA calculator, sounds, goal, theme) ---------- */
  const PREF_KEYS = ['gpa', 'ambient', 'dailyGoal', 'theme', 'liveBg', 'sound', 'phonRate', 'phonVoice_uk', 'phonVoice_us', 'readerVoice', 'readerScroll', 'navOpen', 'seenChangelog', 'todayPlan', 'lastVisit', 'challengeDone', 'lastLessonDay', 'pushOn', 'savedResources', 'guidesRead', 'skin', 'motion', 'geek', 'tourDone', 'recapSeen', 'focusLog', 'focusGoal', 'freezeBank', 'freezeUsed', 'freezeWeeks', 'focusPublic', 'planningEmail', 'lang'];
  function applyPrefs(prefs, updated) { if (!prefs || typeof prefs !== 'object') return; const s = App.settings(); PREF_KEYS.forEach(k => { if (prefs[k] !== undefined) s[k] = prefs[k]; }); s.prefsUpdated = updated; writeJSON('studyhub-settings', s); if (App.applyTheme) App.applyTheme(); if (prefs.lang && prefs.lang !== App.lang && global.MathubI18n && MathubI18n.codes.includes(prefs.lang)) location.reload(); }   // the language picked on another device
  Auth.prefsPush = function () { if (!Auth.user || Auth.mode !== 'server' || Auth.unreachable) return; clearTimeout(Auth.prefsTimer); Auth.prefsTimer = setTimeout(async () => { const s = App.settings(); const prefs = {}; PREF_KEYS.forEach(k => { if (s[k] !== undefined) prefs[k] = s[k]; }); const updated = Date.now(); s.prefsUpdated = updated; writeJSON('studyhub-settings', s); try { const r = await call('prefs', { prefs, updated }, 'PUT'); if (r.stale) applyPrefs(r.prefs, r.updated); } catch (e) {} }, 2500); };
  Auth.prefsPull = async function () { if (!Auth.user || Auth.mode !== 'server') return; try { const r = await call('prefs'); const local = App.settings().prefsUpdated || 0; if ((r.updated || 0) > local) applyPrefs(r.prefs, r.updated); else if (local > (r.updated || 0)) Auth.prefsPush(); } catch (e) {} };
  App.onSetting = k => { if (PREF_KEYS.includes(k)) Auth.prefsPush(); };
  Auth.pullAll = async function () {
    const r = await call('data_all'); const courses = r.courses || {}; Auth.prefsPull();
    const ids = Object.keys(global.Courses || {});
    for (const id of ids) { const s = courses[id]; if (s) applyServer(id, s.data, s.updated); else if (Object.keys(App.store.peek(id)).length) { setMeta(id, { updated: (meta()[id] || {}).updated || Date.now() }); await Auth.pushCourse(id).catch(() => {}); } }
    setSyncState('ok');
  };
  /* Merge two progress blobs. Unions where possible, otherwise the newer side wins. Idempotent, so repeated pulls are safe. */
  function mergeData(local, server, localNewer) {
    const out = Object.assign({}, localNewer ? server : local, localNewer ? local : server);
    const L = local || {}, S = server || {};
    // quiz history: union by id (legacy entries without ids are kept from both sides)
    const seen = new Set(); const hist = [];
    for (const h of [...(S.history || []), ...(L.history || [])]) { if (h && h.k) { if (seen.has(h.k)) continue; seen.add(h.k); } hist.push(h); }
    hist.sort((a, b) => (a.d || '').localeCompare(b.d || '') || (a.k || '').localeCompare(b.k || '')); if (hist.length > 500) hist.splice(0, hist.length - 500); out.history = hist;
    // per-topic progress: keep the larger sample per topic
    const prog = {}; for (const src of [S.progress || {}, L.progress || {}]) for (const [t, v] of Object.entries(src)) { if (!prog[t] || (v.a || 0) > (prog[t].a || 0)) prog[t] = Object.assign({}, v); } out.progress = prog;
    // flashcard boxes: highest box wins
    const fc = Object.assign({}, S.flashcards || {}); for (const [id, box] of Object.entries(L.flashcards || {})) fc[id] = Math.max(fc[id] || 0, box || 0); out.flashcards = fc;
    const at = Object.assign({}, S.fcAt || {}); for (const [id, t] of Object.entries(L.fcAt || {})) at[id] = Math.max(at[id] || 0, t || 0); out.fcAt = at;
    // activity days, checklists and practice ticks: union
    out.activity = Object.assign({}, S.activity || {}, L.activity || {});
    const cl = {}; for (const src of [S.checklists || {}, L.checklists || {}]) for (const [ex, items] of Object.entries(src)) { cl[ex] = cl[ex] || {}; for (const [i, v] of Object.entries(items || {})) cl[ex][i] = cl[ex][i] || !!v; } out.checklists = cl;
    const pd = {}; for (const src of [S.practiceDone || {}, L.practiceDone || {}]) for (const [ex, items] of Object.entries(src)) { pd[ex] = pd[ex] || {}; for (const [i, v] of Object.entries(items || {})) pd[ex][i] = pd[ex][i] || !!v; } out.practiceDone = pd;
    // focus sessions: union by day (max minutes per day), streak freezes: union
    const sess = {}; for (const src of [S.sessions || [], L.sessions || []]) for (const x of src) if (x && x.d) sess[x.d] = Math.max(sess[x.d] || 0, x.m || 0); out.sessions = Object.keys(sess).sort().map(d => ({ d, m: sess[d] }));
    out.freezes = Object.assign({}, S.freezes || {}, L.freezes || {});
    // mistakes: union by key, the more recent attempt wins; cleared count: max
    const mk = {}; for (const src of [S.mistakes || [], L.mistakes || []]) for (const m of src) if (m && m.k && (!mk[m.k] || (m.at || 0) > (mk[m.k].at || 0))) mk[m.k] = m; out.mistakes = Object.values(mk).slice(-120); out.mistakesCleared = Math.max(S.mistakesCleared || 0, L.mistakesCleared || 0);
    // personal notes: newer text per topic; highlights: union; cheat sheet: union of picked lines
    const mn = {}, mnAt = {}; for (const src of [S, L]) for (const [sec, txt] of Object.entries(src.mynotes || {})) { const ts = (src.mynotesAt || {})[sec] || 0; if (!(sec in mn) || ts > mnAt[sec]) { mn[sec] = txt; mnAt[sec] = ts; } } out.mynotes = mn; out.mynotesAt = mnAt;
    const hl = {}; for (const src of [S.highlights || {}, L.highlights || {}]) for (const [sec, arr] of Object.entries(src)) { hl[sec] = [...new Set((hl[sec] || []).concat(arr || []))]; } out.highlights = hl;
    if (S.cheatsheet || L.cheatsheet) { const base = Object.assign({}, S.cheatsheet || {}, L.cheatsheet || {}); base.items = [...new Set(((S.cheatsheet || {}).items || []).concat((L.cheatsheet || {}).items || []))]; out.cheatsheet = base; }
    const xp = {}; for (const src of [S.xp || [], L.xp || []]) for (const x of src) if (x && x.d) xp[x.d] = Math.max(xp[x.d] || 0, x.n || 0); out.xp = Object.keys(xp).sort().map(d => ({ d, n: xp[d] }));
    // grades and scratchpad strokes: the newer side already won via Object.assign, but never replace content with nothing
    if (!(out.grades && Object.keys(out.grades).length)) out.grades = (L.grades && Object.keys(L.grades).length) ? L.grades : (S.grades || {});
    if (!(out.scratch && out.scratch.length)) out.scratch = (L.scratch && L.scratch.length) ? L.scratch : (S.scratch || []);
    return out;
  }
  Auth.mergeData = mergeData;
  function applyServer(course, data, updated) {
    const m = meta()[course] || {}; const local = App.store.peek(course); const hasLocal = Object.keys(local).length > 0;
    if (!data) { if (hasLocal) Auth.pushCourse(course).catch(() => {}); return; }
    if (!hasLocal) { App.store.replace(course, data); setMeta(course, { updated, synced: updated }); rerenderIfSafe(course); return; }
    const synced = m.synced || 0;
    if (synced === updated && (m.updated || 0) <= synced) return;            // nothing changed on either side
    if (synced === updated && (m.updated || 0) > synced) { Auth.pushCourse(course).catch(() => {}); return; }   // only local changed
    const merged = mergeData(local, data, (m.updated || 0) > (updated || 0));
    App.store.replace(course, merged); const now = Date.now(); setMeta(course, { updated: now, synced: updated });
    Auth.pushCourse(course, true).catch(() => {}); rerenderIfSafe(course);
  }
  function rerenderIfSafe(course) { if (App.D && App.D.id === course && App.current && App.current !== App.views.scratchpad && !(App.views.practice.hasSession && App.views.practice.hasSession())) { try { App.rerender(); } catch {} } }
  function setSyncState(state) { Auth.sync = state; const el = $('#acct-sync'); if (el) el.innerHTML = syncLabel(); }
  const syncLabel = () => Auth.mode !== 'server' ? '<span class="muted">local only</span>' : Auth.unreachable ? '<span style="color:var(--warn)">offline · will sync</span>' : Auth.sync === 'saving' ? 'saving…' : Auth.sync === 'error' ? '<span style="color:var(--bad)">not synced</span>' : 'synced';

  /* ---------- account box (sidebar) & preview banner ---------- */
  function paintAccount() {
    const box = $('#account-box'); if (!box) return;
    if (!Auth.ready) { box.innerHTML = '<div class="acct small muted">Checking account…</div>'; return; }
    if (Auth.user) {
      const name = Auth.user.name || Auth.user.email.split('@')[0]; const initial = name.trim()[0].toUpperCase();
      box.innerHTML = `<div class="acct"><div class="avatar">${esc(initial)}</div><div class="acct-body"><div class="acct-name" title="${esc(Auth.user.email)}">${esc(name)}</div><div class="acct-sub" id="acct-sync">${syncLabel()}</div></div><button class="icon-btn" data-action="acct-menu" title="Account settings">${icon('gear', 14)}</button></div><div class="acct-level"></div>`;
    } else {
      box.innerHTML = `<div class="acct guest"><div><div class="acct-name">Preview mode</div><div class="acct-sub">Sign up to unlock everything</div></div><div class="row gap-sm"><button class="btn xs primary" data-action="auth-signup">Sign up</button><button class="btn xs" data-action="auth-login">Log in</button></div></div><div class="acct-level"></div>`;
    }
    bind(box, { 'auth-signup': () => Auth.open('signup'), 'auth-login': () => Auth.open('login'), 'acct-menu': () => App.go('settings') });
    let top = $('#topbar-account'); if (!top) { const ta = $('#topbar .topbar-actions'); if (ta) { top = document.createElement('span'); top.id = 'topbar-account'; top.className = 'acct-slot'; ta.append(top); } }
    if (top) accountMenu(top);
    $$('#landing-account').forEach(paintLandingAccount);
    if (App.paintStats) App.paintStats();
  }
  function paintLandingAccount(el) { el.innerHTML = '<span class="row gap-sm landing-acct"><span class="hub-slot"></span><span class="acct-menu-slot"></span></span>'; accountMenu($('.acct-menu-slot', el), { landing: true }); if (App.paintStats) App.paintStats(); }
  /* ---------- header account menu: avatar button; the menu itself opens as a page-level popover so no header can clip it ---------- */
  function accountMenu(el, opts = {}) {
    if (!Auth.ready) { el.innerHTML = ''; return; }
    if (!Auth.user) {
      el.innerHTML = opts.landing ? `<span class="row gap-sm" style="flex-wrap:nowrap"><button class="btn sm primary" data-action="landing-signup">${icon('fire', 14)} Sign up free</button><button class="btn sm" data-action="landing-login">Log in</button></span>` : `<span class="row gap-sm" style="flex-wrap:nowrap"><button class="btn sm primary" data-action="landing-signup">Sign up</button><button class="btn sm" data-action="landing-login">Log in</button></span>`;
      bind(el, { 'landing-signup': () => Auth.open('signup'), 'landing-login': () => Auth.open('login') }); return;
    }
    const u = Auth.user; const name = u.name || u.email.split('@')[0]; const initial = name.trim()[0].toUpperCase();
    el.innerHTML = `<span class="acct-menu"><button class="acct-btn" data-action="acct-toggle" aria-haspopup="true" aria-expanded="false" title="Account menu"><span class="avatar sm">${esc(initial)}</span><span class="acct-btn-name">${esc(name)}</span>${icon('chevron', 12)}</button></span>`;
    bind(el, { 'acct-toggle': btn => {
      const unread = u.unread || 0;
      App.popover(btn, `<div class="acct-dd-head"><div class="acct-name">${esc(name)}</div><div class="acct-sub mono">${esc(u.email)}</div>${u.role || u.admin || u.mod ? `<div class="row gap-sm mt-1">${u.role ? `<span class="chip staff">${esc(u.role)}</span>` : ''}${u.admin ? '<span class="chip accent">administrator</span>' : u.mod ? '<span class="chip accent">moderator</span>' : ''}</div>` : ''}</div>
        <a class="acct-dd-item" href="#/plan">${icon('gem', 15)}<span>Your plan</span>${App.subscription && App.subscription.plan() && App.plans ? `<b class="pill plan-pill">${esc(App.plans[App.subscription.plan()].short)}</b>` : ''}</a>
        <a class="acct-dd-item" href="#/today">${icon('flag', 15)}<span>Today</span></a>
        <a class="acct-dd-item" href="#/focus">${icon('clock', 15)}<span>Focus room</span></a>
        <a class="acct-dd-item" href="#/recap">${icon('zap', 15)}<span>Your week</span></a>
        <a class="acct-dd-item" href="#/sheet">${icon('shield', 15)}<span>Character sheet</span></a>
        <a class="acct-dd-item" href="#/resources">${icon('link', 15)}<span>Resources & guides</span></a>
        <a class="acct-dd-item" href="#/tools">${icon('sliders', 15)}<span>Tools</span></a>
        <a class="acct-dd-item" href="${App.settingsLink ? App.settingsLink() : '#/settings'}">${icon('gear', 15)}<span>Account settings</span></a>
        <a class="acct-dd-item" href="#/badges">${icon('award', 15)}<span>Your badges</span></a>
        <a class="acct-dd-item" href="#/people">${icon('users', 15)}<span>People</span></a>
        <a class="acct-dd-item" href="#/gpa">${icon('calc', 15)}<span>GPA calculator</span></a>
        <a class="acct-dd-item" href="#/whatsnew">${icon('zap', 15)}<span>What's new</span>${App.changelogUnseen && App.changelogUnseen() ? '<i class="menu-dot"></i>' : ''}</a>
        ${App.installAvailable && App.installAvailable() ? `<button class="acct-dd-item" data-action="install-app" data-close>${icon('download', 15)}<span>Install the app</span></button>` : ''}
        ${Auth.mode === 'server' ? `<a class="acct-dd-item" href="${App.inboxLink ? App.inboxLink() : '#/forum/inbox'}">${icon('bell', 15)}<span>Inbox</span><b class="pill inbox-pill"${unread ? '' : ' hidden'}>${unread > 99 ? '99+' : unread}</b></a>` : ''}
        ${u.mod ? `<a class="acct-dd-item" href="#/admin">${icon('shield', 15)}<span>${u.admin ? 'Admin panel' : 'Moderation'}</span></a>` : ''}
        <div class="acct-dd-sep"></div>
        <button class="acct-dd-item" data-action="landing-logout" data-close>${icon('logout', 15)}<span>Log out</span></button>`,
        { 'landing-logout': () => { App.closePopover(); Auth.logout(); }, 'install-app': () => { App.closePopover(); if (App.installApp) App.installApp(); } }, { cls: 'pop-account' });
    } });
  }
  window.addEventListener('hashchange', () => { const top = $('#topbar-account'); if (top && Auth.ready) accountMenu(top); });   // links in the menu follow the current class
  Auth.accountMenu = accountMenu;
  Auth.paintLandingAccount = paintLandingAccount;
  function paintBanner() {
    let b = $('#preview-banner');
    const gone = (() => { try { return localStorage.getItem('mh-banner-hidden') === '1'; } catch (e) { return false; } })();
    if (Auth.user || !Auth.ready || gone) { if (b) b.remove(); document.documentElement.classList.toggle('guest', !Auth.user && Auth.ready); return; }
    document.documentElement.classList.add('guest');
    if (!b) { b = document.createElement('div'); b.id = 'preview-banner'; b.className = 'preview-banner'; const main = $('.main'); const top = $('#topbar'); if (main && top) main.insertBefore(b, top.nextSibling); else document.body.prepend(b); }
    b.innerHTML = `<span>${icon('eye', 14)} <b>Preview.</b> <button class="linkbtn" data-action="b-signup">Sign up</button> with your montana.edu email to unlock every tool and keep your progress.</span><button class="icon-btn ghost" data-action="b-hide" aria-label="Hide this message">${icon('x', 14)}</button>`;
    bind(b, { 'b-signup': () => Auth.open('signup'), 'b-hide': () => { try { localStorage.setItem('mh-banner-hidden', '1'); } catch (e) {} b.remove(); } });
  }

  /* ---------- lock cards used by views ---------- */
  Auth.lockCard = function (title, text, opts = {}) {
    return `<div class="lock-card${opts.compact ? ' compact' : ''}"><div class="lock-icon">${icon('flag', 22)}</div><div><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p><div class="row gap-sm mt-2"><button class="btn primary" data-action="auth-signup">${icon('fire', 14)} Sign up free</button><button class="btn" data-action="auth-login">Log in</button></div><p class="small muted mt-1">Free for anyone with a montana.edu email.</p></div></div>`;
  };
  Auth.bindLocks = function (root) { on(root, 'click', '[data-action="auth-signup"]', () => Auth.open('signup')); on(root, 'click', '[data-action="auth-login"]', () => Auth.open('login')); };
  Auth.renderLocked = function (root, V, view) {
    const D = App.D; const label = (() => { for (const gp of D.NAV) for (const it of gp.items) if (it[0] === view) return it[1]; return V.title; })();
    root.innerHTML = App.pageHead(label, V.blurb || 'This tool is part of the full Mathub experience.') + Auth.lockCard(`${label} is for members`, `Create a free account to use the ${label.toLowerCase()} for ${D.name} and every other ${D.short} tool, and to keep your progress across devices.`) + `<div class="grid cols-3 mt-3">${(V.preview || []).map(p => `<div class="card-link"><h4>${esc(p[0])}</h4><p>${esc(p[1])}</p></div>`).join('')}</div>`;
    Auth.bindLocks(root);
  };

  /* ---------- modal ---------- */
  const M = { state: 'login', email: '', busy: false };
  Auth.open = function (state, email) {
    M.state = state || 'login'; M.msg = ''; if (email) M.email = String(email).trim().toLowerCase();
    if (Auth.user) { App.go('settings'); return; }
    let m = $('#auth-modal');
    if (!m) { m = document.createElement('div'); m.className = 'modal-backdrop'; m.id = 'auth-modal'; document.body.appendChild(m); m.addEventListener('click', e => { if (e.target === m) Auth.close(); }); }
    paintModal();
  };
  Auth.close = () => { const m = $('#auth-modal'); if (m) App.dismiss(m); };
  function paintModal() {
    const m = $('#auth-modal'); if (!m) return;
    const offline = Auth.mode === 'offline';
    const tabs = ['login', 'signup'].map(t => `<button class="tab${M.state === t || (t === 'signup' && M.state === 'verify') || (t === 'login' && (M.state === 'forgot' || M.state === 'reset')) ? ' active' : ''}" data-action="tab" data-t="${t}">${t === 'login' ? 'Log in' : 'Sign up'}</button>`).join('');
    const email = `<div class="field"><label for="au-email">Montana State email</label><input class="input" id="au-email" type="email" name="email" autocomplete="username" placeholder="you@montana.edu" value="${esc(M.email)}" required></div>`;
    let body = '';
    if (offline) {
      body = `<div class="callout small mb-2"><b>Account server unreachable.</b> This happens when the site is opened as a file or the <code>api</code> folder is not on the server. You can still sign in locally: your progress stays in this browser only.</div>${email}<div class="field"><label for="au-name">Name (optional)</label><input class="input" id="au-name" type="text" autocomplete="name" placeholder="Your name"></div><button class="btn primary mt-2" type="submit" style="width:100%">Continue locally</button>`;
    } else if (M.state === 'signup') {
      body = `${email}<div class="field"><label for="au-name">Name (optional)</label><input class="input" id="au-name" type="text" autocomplete="name" placeholder="What should we call you?"></div><div class="field"><label for="au-pass">Password</label><input class="input" id="au-pass" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters" required></div><button class="btn primary mt-2" type="submit" style="width:100%">${icon('fire', 14)} Create account</button><p class="small muted mt-2">We email a 6-digit code to confirm the address. Only montana.edu addresses can join. By creating an account you agree to the <a href="#/policy" target="_blank">Terms of Use and Privacy Policy</a>.</p>`;
    } else if (M.state === 'verify') {
      body = `<p class="small mb-2">We sent a 6-digit code to <b>${esc(M.email)}</b>. Check spam if it does not arrive in a minute.</p><div class="field"><label for="au-code">Code</label><input class="input mono" id="au-code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6" placeholder="123456" required></div><button class="btn primary mt-2" type="submit" style="width:100%">${icon('check', 14)} Verify and log in</button><div class="row between mt-2"><button class="btn xs ghost" type="button" data-action="resend">Resend code</button><button class="btn xs ghost" type="button" data-action="tab" data-t="signup">Use a different email</button></div>`;
    } else if (M.state === 'forgot') {
      body = `<p class="small mb-2">Enter your email and we will send a reset code.</p>${email}<button class="btn primary mt-2" type="submit" style="width:100%">Email me a code</button><div class="row mt-2"><button class="btn xs ghost" type="button" data-action="tab" data-t="login">Back to log in</button></div>`;
    } else if (M.state === 'reset') {
      body = `<p class="small mb-2">Enter the code we sent to <b>${esc(M.email)}</b> and choose a new password.</p><div class="field"><label for="au-code">Code</label><input class="input mono" id="au-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" required></div><div class="field"><label for="au-pass">New password</label><input class="input" id="au-pass" type="password" autocomplete="new-password" minlength="8" required></div><button class="btn primary mt-2" type="submit" style="width:100%">Set password and log in</button><div class="row mt-2"><button class="btn xs ghost" type="button" data-action="resend-reset">Resend code</button></div>`;
    } else {
      body = `${email}<div class="field"><label for="au-pass">Password</label><input class="input" id="au-pass" type="password" autocomplete="current-password" required></div><button class="btn primary mt-2" type="submit" style="width:100%">Log in</button><div class="row between mt-2"><button class="btn xs ghost" type="button" data-action="tab" data-t="forgot">Forgot password?</button><span class="small muted">New here? <a href="#" data-action="tab" data-t="signup">Sign up</a></span></div>`;
    }
    m.innerHTML = `<div class="modal auth-modal" role="dialog" aria-label="Account"><div class="auth-head"><span class="logo-mark" aria-hidden="true">${App.logoSvg ? App.logoSvg(26) : ''}</span><div><b>Mathub</b><div class="small muted">Free study hub for Montana State classes</div></div><button class="icon-btn" data-action="close" aria-label="Close">${icon('x', 16)}</button></div>${offline ? '' : `<div class="tabs auth-tabs">${tabs}</div>`}<form id="auth-form" novalidate>${body}<div class="auth-msg${M.msgKind ? ' ' + M.msgKind : ''}" id="auth-msg">${M.msg ? esc(M.msg) : ''}</div></form></div>`;
    bind(m, { close: Auth.close, tab: (el, e) => { e.preventDefault(); M.state = el.dataset.t; M.msg = ''; paintModal(); }, resend: () => submit('resend'), 'resend-reset': () => submit('forgot-again') });
    const form = $('#auth-form', m); form.addEventListener('submit', e => { e.preventDefault(); submit(); });
    const first = $('#au-email', m) && !M.email ? $('#au-email', m) : ($('#au-code', m) || $('#au-pass', m) || $('#au-email', m)); if (first) setTimeout(() => first.focus(), 30);
  }
  function msg(text, kind) { M.msg = text; M.msgKind = kind || ''; const el = $('#auth-msg'); if (el) { el.textContent = text; el.className = 'auth-msg ' + (kind || ''); } }
  function busy(b) { M.busy = b; $$('#auth-form button, #auth-form input').forEach(x => x.disabled = b); }
  async function submit(action) {
    if (M.busy) return;
    const m = $('#auth-modal'); if (!m) return;
    const v = id => { const el = $('#' + id, m); return el ? el.value.trim() : ''; };
    const email = v('au-email') || M.email; if (v('au-email')) M.email = v('au-email').toLowerCase();
    if (Auth.mode === 'offline') {
      if (!Auth.emailOk(email)) return msg('Mathub is for Montana State students: use your @montana.edu address.', 'bad');
      const u = { email: email.toLowerCase(), name: v('au-name'), local: true, created: Date.now() }; writeJSON(LOCAL_KEY, u); Auth.user = u; Auth.close(); changed(); toast(`Welcome, ${u.name || u.email.split('@')[0]}. Progress is saved in this browser.`, 3000); App.rerender(); return;
    }
    try {
      busy(true);
      if (action === 'resend') { await call('resend', { email: M.email }); msg('A new code is on its way.', 'good'); }
      else if (action === 'forgot-again') { await call('forgot', { email: M.email }); msg('A new reset code is on its way.', 'good'); }
      else if (M.state === 'signup') {
        // the server checks the address (montana.edu, plus any address the operator allows, such as the App Review account)
        const r = await call('signup', { email, password: v('au-pass'), name: v('au-name'), ref: (() => { try { return localStorage.getItem('mathub-ref') || ''; } catch (e) { return ''; } })() }); M.email = r.email || email; M.state = 'verify'; M.msg = ''; paintModal(); msg('Code sent. It expires in 15 minutes.', 'good');
      } else if (M.state === 'verify') { const r = await call('verify', { email: M.email, code: v('au-code') }); finishLogin(r.user, true); }
      else if (M.state === 'forgot') { await call('forgot', { email }); M.email = email; M.state = 'reset'; M.msg = ''; paintModal(); msg('If that address has an account, a code is on its way.', 'good'); }
      else if (M.state === 'reset') { const r = await call('reset', { email: M.email, code: v('au-code'), password: v('au-pass') }); finishLogin(r.user, false); }
      else { const r = await call('login', { email, password: v('au-pass') }); if (r.pending) { M.email = r.email || email; M.state = 'verify'; M.msg = ''; paintModal(); msg(r.message || 'Verify your email to continue.', 'warn'); } else finishLogin(r.user, false); }
    } catch (e) {
      if (e.data && e.data.exists) { M.state = 'login'; paintModal(); }
      msg(e.message, 'bad');
    } finally { busy(false); }
  }
  function finishLogin(user, isNew) {
    Auth.user = user; Auth.close(); changed();
    toast(isNew ? `Welcome to Mathub, ${user.name || user.email.split('@')[0]}!` : `Welcome back, ${user.name || user.email.split('@')[0]}.`, 2600);
    Auth.pullAll().then(() => App.rerender()).catch(() => App.rerender());
    if (App.rebuildNav) App.rebuildNav();
    // a new account gets the welcome (what Mathub is, then its classes and a membership); otherwise the class picker if it has none
    setTimeout(() => { if (App.welcome && App.welcome.needed()) App.welcome.open(); else Auth.onboard(isNew || !Array.isArray(user.courses)); }, 900);
  }
  Auth.logout = async function () {
    if (Auth.mode === 'server') { try { await call('logout', {}); } catch {} }
    else writeJSON(LOCAL_KEY, null);
    Auth.user = null; writeJSON(LAST_KEY, null); changed(); toast('Logged out'); if (App.rebuildNav) App.rebuildNav(); App.rerender();
  };

  /* ---------- settings panel ---------- */
  Auth.settingsPanel = function (root) {
    const u = Auth.user; const server = Auth.mode === 'server'; let html;
    if (u) {
      const name = u.name || u.email.split('@')[0]; const initial = name.trim()[0].toUpperCase(); const S = App.social;
      const badgeLine = S && S.badges ? `${S.badges.badges.length} of ${S.badges.catalog.length} earned` : server ? 'See what you have earned' : 'Needs the account server';
      html = `<div class="panel acct-panel">
        <div class="acct-hero"><div class="avatar big">${esc(initial)}</div><div class="acct-hero-body"><h2 class="acct-hero-name">${esc(name)}</h2><div class="mono small muted">${esc(u.email)}</div><div class="row gap-sm mt-1" style="flex-wrap:wrap">${u.role ? `<span class="chip staff">${esc(u.role)}</span>` : ''}${u.admin ? '<span class="chip accent">administrator</span>' : u.mod ? '<span class="chip accent">moderator</span>' : ''}<span class="chip ${server ? (Auth.unreachable ? 'warn' : 'good') : 'warn'}">${server ? (Auth.unreachable ? 'offline · will sync' : 'synced across devices') : 'local browser only'}</span>${u.created ? `<span class="chip">member since ${esc(App.fmtDate(App.toISO(new Date(u.created * 1000))))}</span>` : ''}</div></div></div>
        <div class="link-tiles">
          <a class="link-tile gold" href="#/badges"><span class="tile-ic">${icon('award', 20)}</span><span class="tile-body"><b>Your badges</b><small id="acct-badge-count">${badgeLine}</small></span>${icon('right', 14)}</a>
          <a class="link-tile" href="#/people"><span class="tile-ic">${icon('users', 20)}</span><span class="tile-body"><b>People</b><small>Classmates and their badges</small></span>${icon('right', 14)}</a>
          <a class="link-tile" href="#/gpa"><span class="tile-ic">${icon('calc', 20)}</span><span class="tile-body"><b>GPA calculator</b><small>Semester, cumulative and goals</small></span>${icon('right', 14)}</a>
          ${server ? `<a class="link-tile" href="${App.inboxLink ? App.inboxLink() : '#/forum/inbox'}"><span class="tile-ic">${icon('bell', 20)}</span><span class="tile-body"><b>Inbox</b><small>${u.unread ? `${u.unread} unread ${u.unread === 1 ? 'reply' : 'replies'}` : 'Replies to your posts'}</small></span>${icon('right', 14)}</a>` : ''}
          ${u.mod ? `<a class="link-tile" href="#/admin"><span class="tile-ic">${icon('shield', 20)}</span><span class="tile-body"><b>${u.admin ? 'Admin panel' : 'Moderation'}</b><small>Members, reports and site settings</small></span>${icon('right', 14)}</a>` : ''}
        </div>
        <div class="acct-sections">
          <section><div class="eyebrow mb-1">Profile</div><div class="field"><label for="acct-name">Display name</label><div class="row gap-sm"><input class="input" id="acct-name" value="${esc(u.name || '')}" placeholder="Your name" maxlength="40" style="max-width:260px"><button class="btn sm" data-action="save-name">Save</button></div><span class="help">Shown on your posts, on leaderboards and on the People page.</span></div></section>
          ${server ? `<section><div class="eyebrow mb-1">Email me</div>
            <label class="check"><input type="checkbox" id="acct-notify" ${u.notify_email === false ? '' : 'checked'}><span>When someone replies to my posts or comments <span class="muted small">(at most one email per post every few hours)</span></span></label>
            <label class="check"><input type="checkbox" id="acct-reminder" ${u.reminder_email ? 'checked' : ''}><span>The evening before something is due <span class="muted small">(6 pm: tomorrow's Canvas due dates, sessions you joined, and a heads-up if your streak is about to end)</span></span></label>
            <label class="check"><input type="checkbox" id="acct-digest" ${u.digest_email === false ? '' : 'checked'}><span>The weekly digest <span class="muted small">(Sunday evening: what is due, top posts, your stats vs. the class)</span></span></label></section>
          ${server ? `<section><div class="eyebrow mb-1">Plan the week</div>
            <label class="check"><input type="checkbox" id="acct-planning" ${u.planning_email ? 'checked' : ''}><span>Sunday planning email <span class="muted small">(4 pm: everything due next week, your week in numbers, one suggested focus block)</span></span></label>
            <label class="check"><input type="checkbox" id="acct-focuspub" ${u.focus_public === false ? '' : 'checked'}><span>Show me in Focus together <span class="muted small">(others in the focus room see your name and task while your timer runs)</span></span></label></section>
          <section><div class="eyebrow mb-1">Calendar subscription</div><p class="small muted mb-1">Every exam and deadline of your classes in Google Calendar, Apple Calendar or Outlook, updated automatically. Keep the link private; anyone with it can see your class schedule.</p><div id="acct-cal"><div class="small muted">Loading…</div></div></section>
          <section><div class="eyebrow mb-1">Invite a classmate</div><p class="small muted mb-1">Share your link. When a classmate signs up through it you both earn a badge.</p><div id="acct-invite"><div class="small muted">Loading…</div></div></section>` : ''}
          <section><div class="eyebrow mb-1">Notifications on this device</div><label class="check"><input type="checkbox" id="acct-push" disabled><span>Push notifications <span class="muted small">(the evening before something is due, and when a streak is at risk; on iPhone this needs the app added to the home screen)</span></span></label><div class="row gap-sm mt-1"><button class="btn xs" data-action="push-test" disabled>Send a test</button><span class="small muted" id="acct-push-note">Checking…</span></div></section>
          <section><div class="eyebrow mb-1">Privacy</div>
            <label class="check"><input type="checkbox" id="acct-lb" ${u.show_on_leaderboard === false ? '' : 'checked'}><span>Show my name on leaderboards, helper lists and the People page <span class="muted small">(otherwise you appear as “Anonymous student”)</span></span></label>
            ${server ? `<div class="row gap-sm mt-1" style="flex-wrap:wrap"><button class="btn sm" data-action="data-export">${icon('download', 13)} Download my data</button><span class="small muted">Everything stored about your account, as one file.</span></div>` : ''}</section>
          ${server ? `<section><div class="eyebrow mb-1">Signed-in devices</div><div id="acct-devices"><div class="small muted">Loading…</div></div></section>
          <section><div class="eyebrow mb-1">Blocked members</div><p class="small muted mb-1">You do not see posts, comments, study sessions or notifications from members you block. To block someone, use Block under one of their posts or comments.</p><div id="acct-blocks"><div class="small muted">Loading…</div></div></section>` : ''}` : ''}
        </div>
        <div class="divider"></div>
        <div class="row gap-sm" style="flex-wrap:wrap">${server ? `<button class="btn sm" data-action="sync-now">${icon('rotate', 13)} Sync now</button><button class="btn sm" data-action="change-pass">${icon('lock', 13)} Change password</button>` : ''}<button class="btn sm" data-action="logout">${icon('logout', 13)} Log out</button><span style="flex:1"></span><button class="btn sm danger ghost" data-action="delete-acct">${icon('trash', 13)} Delete account</button></div>
        <p class="small muted mt-2">${server ? 'Quiz history, flashcard boxes, checklists and grades are saved to your account a moment after each change and load on any device where you log in.' : 'The account server is unreachable, so nothing leaves this browser.'}</p></div>`;
    } else {
      const inApp = !!(window.MATHUB_APP && window.MATHUB_APP.native);
      html = inApp ? `<div class="panel acct-panel"><div class="panel-h"><div class="panel-title">${icon('user')} Account</div><span class="chip">optional</span></div>${Auth.lockCard('An account is optional', 'Everything in the app works without one. Montana State students can sign in with their montana.edu email to sync progress across devices, join the class discussions and collect badges.', { compact: true })}</div>`
        : `<div class="panel acct-panel"><div class="panel-h"><div class="panel-title">${icon('user')} Account</div><span class="chip warn">preview</span></div>${Auth.lockCard('You are previewing Mathub', 'Sign up with your montana.edu email to unlock every tool, collect badges, join the People page and sync your progress across devices.', { compact: true })}</div>`;
    }
    const wrap = document.createElement('div'); wrap.innerHTML = html; const panel = wrap.firstElementChild;
    const pref = (id, key, onMsg, offMsg) => { const el = $('#' + id, panel); if (el) el.addEventListener('change', async () => { try { const r = await call('profile', { [key]: el.checked }); Auth.user = Object.assign(Auth.user, r.user); toast(el.checked ? onMsg : offMsg); } catch (e) { toast(e.message); el.checked = !el.checked; } }); };
    Auth.pushInit(panel); if (server && u) { Auth.devicesInit(panel); Auth.blocksInit(panel); }
    pref('acct-planning', 'planning_email', 'Sunday planning email on', 'Sunday planning email off'); pref('acct-focuspub', 'focus_public', 'You show up in Focus together', 'Hidden from Focus together'); Auth.growthInit(panel);
    pref('acct-notify', 'notify_email', 'Reply emails on', 'Reply emails off'); pref('acct-reminder', 'reminder_email', 'Evening reminders on', 'Evening reminders off'); pref('acct-digest', 'digest_email', 'Weekly digest on', 'Weekly digest off'); pref('acct-lb', 'show_on_leaderboard', 'Your name shows on leaderboards and the People page', 'You appear as “Anonymous student”');
    if (u && server && App.social && App.social.refreshBadges) App.social.refreshBadges().then(r => { const el = $('#acct-badge-count', panel); if (el && r) el.textContent = `${r.badges.length} of ${r.catalog.length} earned`; }).catch(() => {});
    bind(panel, {
      'auth-signup': () => Auth.open('signup'), 'auth-login': () => Auth.open('login'), logout: () => Auth.logout(),
      'save-name': async () => { const name = $('#acct-name', panel).value.trim(); if (Auth.mode === 'server') { try { const r = await call('profile', { name }); Auth.user = r.user; } catch (e) { toast(e.message); return; } } else { Auth.user.name = name; writeJSON(LOCAL_KEY, Auth.user); } changed(); toast('Name saved'); const h = $('.acct-hero-name', panel); if (h) h.textContent = name || Auth.user.email.split('@')[0]; },
      'sync-now': async () => { try { for (const id of Object.keys(global.Courses)) await Auth.pushCourse(id); await Auth.pullAll(); toast('Everything is synced'); } catch (e) { toast(e.message); } },
      'change-pass': async () => { try { await call('forgot', { email: u.email }); M.email = u.email; M.state = 'reset'; const wasUser = Auth.user; Auth.user = null; Auth.open('reset'); Auth.user = wasUser; msg('We emailed you a code. Enter it with your new password.', 'good'); } catch (e) { toast(e.message); } },
      'data-export': async () => {
        try { const res = await fetch('api/index.php?r=data_export', { credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub' }, cache: 'no-store' }); if (!res.ok) { let m = 'Could not export your data.'; try { m = (await res.json()).error || m; } catch (e) {} throw new Error(m); }
          const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `mathub-data-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast('Your data is downloading.'); }
        catch (e) { toast(e.message); }
      },
      'devices-out': async () => { if (!confirm('Sign out of Mathub on every other device? This one stays signed in.')) return; try { const r = await call('logout_others', {}); toast(r.signed_out ? `Signed out of ${r.signed_out} other device${r.signed_out === 1 ? '' : 's'}.` : 'No other devices were signed in.'); Auth.devicesInit(panel); } catch (e) { toast(e.message); } },
      'delete-acct': async () => {
        if (!confirm('Delete your Mathub account and everything saved to it? This cannot be undone.')) return;
        if (Auth.mode === 'server') { const pass = prompt('Confirm with your password:'); if (pass === null) return; try { await call('account_delete', { password: pass }); } catch (e) { toast(e.message); return; } }
        else writeJSON(LOCAL_KEY, null);
        Auth.user = null; changed(); toast('Account deleted'); App.go('dashboard');
      }
    });
    return panel;
  };

  document.addEventListener('DOMContentLoaded', () => { Auth.init(); });
})(window);

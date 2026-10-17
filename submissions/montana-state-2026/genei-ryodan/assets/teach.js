/* ============================================================
   Mathub Faculty (#/teach), and the class pages for students (#/class, #/syllabus)
   The faculty workspace is a surface of its own: a navy rail, a white top
   bar, Source Serif 4 for titles and the syllabus itself, Source Sans 3 for
   the interface, and none of the student site's chrome (no mascot, XP,
   chunky pressable buttons or tab bar). Its centre is the syllabus editor:
   one page per part of the syllabus with the finished document beside it,
   updating as you type; a checklist of what students look for; print / PDF;
   and publishing to the students who join with the class code. Around it:
   roster, announcements (inbox + push), practice assignments from Mathub's
   question banks, attendance check-in and insights.
     #/teach                    your syllabi (signed out: what the workspace is)
     #/teach/new                start a syllabus
     #/teach/verify             confirm faculty status (needed to publish)
     #/teach/<id>[/<page>]      one class: overview, course, people, about, materials,
                                schedule, exams, grading, policies, students, announce,
                                assign, attendance, insights, settings
     #/class                    the classes a student joined, and a join box
     #/class/join/<CODE>        join a class
     #/class/<id>               a class's hub: announcements, assignments, check-in
     #/syllabus/<CODE>          the published syllabus as a printable page
   Server: api/teach.php. Everything typed here is saved as plain text.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, toast } = App;
  const API = 'api/index.php?r=';

  async function api(route, body) {
    const opts = { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Accept': 'application/json' }, cache: 'no-store' };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let json; try { json = await (await fetch(API + route, opts)).json(); } catch (e) { throw new Error(navigator.onLine === false ? 'You are offline.' : 'Cannot reach the server.'); }
    if (!json || json.ok === false) { const err = new Error((json && json.error) || 'Request failed.'); err.data = json; throw err; }
    return json;
  }
  const user = () => App.auth && App.auth.user;
  const signedOut = () => !user();

  /* ---------- dates (calendar days, no time zones) ---------- */
  const D0 = s => new Date(s + 'T12:00:00Z');
  const isoOf = d => d.toISOString().slice(0, 10);
  const plus = (s, n) => { const d = D0(s); d.setUTCDate(d.getUTCDate() + n); return isoOf(d); };
  const fmt = (s, o = {}) => s ? D0(s).toLocaleDateString('en-US', Object.assign({ timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }, o)) : '';
  const fmtTime = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h >= 12 ? 'pm' : 'am'}`; };
  const ago = ts => App.ago ? App.ago(ts * 1000) : new Date(ts * 1000).toLocaleDateString();
  const fmtWhen = ts => ts ? new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  /* due dates are Montana time, whatever time zone the device is in (the class meets in Bozeman) */
  const dueText = ts => { if (!ts) return 'No due date'; const d = new Date(ts * 1000); const o = { timeZone: 'America/Denver' }; return 'Due ' + d.toLocaleDateString('en-US', Object.assign({ weekday: 'short', month: 'short', day: 'numeric' }, o)) + ', ' + d.toLocaleTimeString('en-US', Object.assign({ hour: 'numeric', minute: '2-digit' }, o)) + ' MT'; };
  /* Montana State's days without classes that are certain; the generator says to check the academic calendar for anything else. */
  const NO_CLASS = { '2026-09-07': 'Labor Day', '2026-11-11': 'Veterans Day', '2026-11-23': 'Thanksgiving break', '2026-11-24': 'Thanksgiving break', '2026-11-25': 'Thanksgiving break', '2026-11-26': 'Thanksgiving', '2026-11-27': 'Thanksgiving break', '2027-01-18': 'Martin Luther King Jr. Day', '2027-02-15': 'Presidents’ Day', '2027-05-31': 'Memorial Day', '2027-07-05': 'Independence Day (observed)' };
  const TERMS = { 'Fall 2026': ['2026-08-24', '2026-12-11'], 'Spring 2027': ['', ''], 'Summer 2027': ['', ''] };
  const DAY_CODES = { M: 1, T: 2, W: 3, R: 4, F: 5, S: 6, U: 0 };
  const parseDays = s => { const t = String(s || '').toUpperCase().replace(/TH/g, 'R').replace(/SA/g, 'S').replace(/SU/g, 'U').replace(/[^MTWRFSU]/g, ''); return [...new Set([...t].map(c => DAY_CODES[c]))]; };

  /* ---------- paths into the syllabus object ---------- */
  const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setP = (o, p, v) => { const ks = p.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[ks[i]]; } a[ks[ks.length - 1]] = v; };
  const val = (p, attrs = '') => `data-k="${p}" ${attrs}`;
  const pct = n => (Math.round(n * 100) / 100).toString();

  /* ============================================================
     The syllabus as a document (live preview, print, public page)
     ============================================================ */
  function paras(t) { if (!t) return ''; return String(t).split(/\n{2,}/).map(p => `<p>${esc(p).replace(/(https?:\/\/[^\s<]+[^\s<.,;:)\]])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>')}</p>`).join(''); }
  /** o.current marks the part being edited; o.ghost keeps empty parts as placeholders (the editor's preview). */
  function docHtml(s, cls = {}, o = {}) {
    const c = s.course || {}; const people = (s.people || []).filter(p => p.name); const meets = (c.meets || []).filter(m => m.days || m.room);
    const cats = ((s.grading || {}).categories || []).filter(x => x.name); const scale = ((s.grading || {}).scale || []).filter(x => x.letter);
    const exams = (s.exams || []).filter(e => e.name); const rows = (s.schedule || {}).rows || []; const p = s.policies || {};
    const cur = k => o.current === k ? ' is-current' : '';
    const sec = (k, t, body, ph) => body ? `<section class="sy-sec${cur(k)}" data-sec="${k}"><h2>${t}</h2>${body}</section>` : o.ghost ? `<section class="sy-sec sy-ghost${cur(k)}" data-sec="${k}"><h2>${t}</h2><p class="sy-muted">${ph}</p></section>` : '';
    const TYPE = { lecture: 'Class', lab: 'Lab', exam: 'Exam', review: 'Review', holiday: 'No class', due: 'Due', other: 'Note' };
    return `<article class="sy-doc">
      <header class="sy-head${cur('course')}" data-sec="course"><div class="sy-code">${esc(c.code || cls.code || '')}${c.section ? ` · Section ${esc(c.section)}` : ''}</div><h1>${esc(c.title || cls.title || 'Syllabus')}</h1><div class="sy-term">${esc(c.term || '')}${c.credits ? ` · ${esc(c.credits)} credits` : ''}${c.modality ? ` · ${esc(c.modality)}` : ''} · Montana State University</div></header>
      ${sec('course', 'Meetings', meets.length ? `<ul>${meets.map(m => `<li><b>${esc(m.kind || 'Class')}:</b> ${esc(m.days)} ${m.start ? esc(fmtTime(m.start)) + (m.end ? '–' + esc(fmtTime(m.end)) : '') : ''}${m.room ? ', ' + esc(m.room) : ''}</li>`).join('')}</ul>` + (c.prereqs ? `<p><b>Prerequisites:</b> ${esc(c.prereqs)}</p>` : '') : '', 'When and where the class meets.')}
      ${sec('people', people.length > 1 ? 'Instructors' : 'Instructor', people.map(x => `<p><b>${esc(x.name)}</b>${x.pronouns ? ` (${esc(x.pronouns)})` : ''}, ${esc(x.role)}${x.email ? ` · <a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : ''}${x.office ? ` · ${esc(x.office)}` : ''}${x.hours ? `<br><span class="sy-muted">Office hours: ${esc(x.hours)}</span>` : ''}</p>`).join(''), 'Who teaches the course and when their office hours are.')}
      ${sec('about', 'Course description', paras(c.description), 'What the course is about and how it is taught.')}
      ${sec('about', 'Learning outcomes', (c.outcomes || []).filter(Boolean).length ? `<p>By the end of the course you will be able to:</p><ul>${c.outcomes.filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '', 'What students will be able to do by the end.')}
      ${sec('materials', 'Materials', (s.materials || []).filter(m => m.title || m.url).length ? `<ul>${s.materials.filter(m => m.title || m.url).map(m => `<li>${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title || m.url)}</a>` : `<b>${esc(m.title)}</b>`} <span class="sy-muted">(${m.required ? 'required' : 'optional'})</span>${m.note ? ` · ${esc(m.note)}` : ''}</li>`).join('')}</ul>` : '', 'The textbook, software and anything else students need.')}
      ${sec('grading', 'Grading', cats.length ? `<table class="sy-table"><thead><tr><th>Category</th><th class="num">Share</th></tr></thead><tbody>${cats.map(x => `<tr><td>${esc(x.name)}${x.note ? ` <span class="sy-muted">${esc(x.note)}</span>` : ''}</td><td class="num">${esc(pct(x.weight))}%</td></tr>`).join('')}</tbody></table>${scale.length ? `<p><b>Letter grades:</b> ${scale.map(x => `${esc(x.letter)} ≥ ${esc(pct(x.min))}%`).join(', ')}</p>` : ''}${paras((s.grading || {}).notes)}` : '', 'How the course grade is made up.')}
      ${sec('exams', 'Exams', exams.length ? `<ul>${exams.map(e => `<li><b>${esc(e.name)}:</b> ${e.date ? esc(fmt(e.date)) + (e.time ? ', ' + esc(fmtTime(e.time)) : '') + (e.place ? ', ' + esc(e.place) : '') : 'date to be announced'}${e.covers ? `<br><span class="sy-muted">${esc(e.covers)}</span>` : ''}</li>`).join('')}</ul>` : '', 'Exams and their dates.')}
      ${sec('schedule', 'Schedule', rows.length ? `<table class="sy-table sy-sched"><thead><tr><th>Date</th><th>What</th></tr></thead><tbody>${rows.map(r => `<tr class="sy-${esc(r.type)}"><td class="sy-date">${esc(fmt(r.date))}</td><td><b>${esc(TYPE[r.type] || 'Class')}${r.title ? ':' : ''}</b> ${esc(r.title)}${r.notes ? `<br><span class="sy-muted">${esc(r.notes).replace(/\n/g, '<br>')}</span>` : ''}</td></tr>`).join('')}</tbody></table><p class="sy-muted">The schedule may change; changes are announced in class and on Mathub.</p>` : '', 'The class meetings, day by day.')}
      ${sec('policies', 'Policies', [['Attendance', p.attendance], ['Late work', p.late], ['AI tools', p.aiText], ['Academic integrity', p.integrity], ['Accommodations', p.accommodations], ['Wellbeing and support', p.wellbeing], ['Communication', p.communication]].concat((p.other || []).map(x => [x.title || 'Policy', x.text])).filter(x => x[1]).map(([t, x]) => `<h3>${esc(t)}</h3>${paras(x)}`).join(''), 'Attendance, late work, AI tools and the statements students need.')}
      <footer class="sy-foot">Made with Mathub · mathub.space</footer>
    </article>`;
  }
  function printDoc(html, title) {
    let host = $('#sy-print'); if (!host) { host = document.createElement('div'); host.id = 'sy-print'; document.body.appendChild(host); }
    host.innerHTML = html; document.body.classList.add('printing-syllabus'); const old = document.title; document.title = title || old;
    const done = () => { document.body.classList.remove('printing-syllabus'); host.innerHTML = ''; document.title = old; global.removeEventListener('afterprint', done); };
    global.addEventListener('afterprint', done); global.print(); setTimeout(() => { if (document.body.classList.contains('printing-syllabus') && !matchMedia('print').matches) done(); }, 1500);
  }
  function modal(inner, opts = {}) {
    const el = document.createElement('div'); el.className = 'modal-backdrop'; el.innerHTML = `<div class="modal tc-modal${opts.wide ? ' wide' : ''}${opts.cls ? ' ' + opts.cls : ''}" role="dialog" aria-modal="true" aria-label="${esc(opts.label || 'Dialog')}">${inner}</div>`;
    document.body.appendChild(el); const back = document.activeElement; const close = () => { (App.dismiss || (x => x.remove()))(el); document.removeEventListener('keydown', key); if (back && back.focus && back.isConnected) back.focus(); };
    const key = e => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', key);
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) close(); });
    const f = $('input, textarea, button:not([data-close])', el) || $('[data-close]', el); if (f) setTimeout(() => f.focus(), 30);
    return { el, close };
  }
  const joinLink = code => `${App.siteBase()}#/class/join/${code}`;
  function copy(text, msg) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(msg || 'Copied.')).catch(() => { const m = modal(`<h2 class="fx-dlg-h">Copy this</h2><input class="fx-input mono" value="${esc(text)}" readonly aria-label="Text to copy"><div class="fx-dlg-actions"><button class="fx-btn" data-close>Done</button></div>`, { cls: 'fx-dlg', label: 'Copy' }); const i = $('input', m.el); i.select(); }); }
  function download(text, name, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

  /* An example syllabus for the signed-out page and the empty list: what the editor produces. Marked as an example on screen. */
  const SAMPLE = { course: { code: 'M 171', title: 'Calculus I', section: '003', term: 'Fall 2026', credits: '4', modality: 'In person', meets: [{ kind: 'Lecture', days: 'MWF', start: '10:00', end: '10:50', room: 'Wilson 1-112' }, { kind: 'Recitation', days: 'R', start: '13:10', end: '14:00', room: 'Reid 105' }], prereqs: 'M 151Q or placement', description: 'Limits, derivatives and integrals of functions of one variable, with applications to rates of change, optimization and area. Lectures introduce each idea; recitations are for working problems in small groups.', outcomes: ['Compute limits and derivatives with the rules of differentiation', 'Model rates of change and solve optimization problems', 'Evaluate definite integrals with the Fundamental Theorem of Calculus'] },
    people: [{ role: 'Instructor', name: 'Your name', pronouns: '', email: 'you@montana.edu', office: 'Wilson 2-240', hours: 'Tue 2–3 pm, Thu 11 am–noon, or by appointment' }],
    materials: [{ title: 'Active Calculus, 2nd edition (free online)', url: '', required: true, note: '' }],
    grading: { categories: [{ name: 'Homework', weight: 20, note: 'lowest two dropped' }, { name: 'Quizzes', weight: 10, note: '' }, { name: 'Midterms (2)', weight: 40, note: '' }, { name: 'Final exam', weight: 30, note: '' }], scale: [{ letter: 'A', min: 90 }, { letter: 'B', min: 80 }, { letter: 'C', min: 70 }, { letter: 'D', min: 60 }, { letter: 'F', min: 0 }], notes: '' },
    exams: [{ name: 'Midterm 1', date: '2026-09-30', time: '18:10', place: 'Wilson 1-112', covers: 'Limits and the derivative' }, { name: 'Midterm 2', date: '2026-11-04', time: '18:10', place: 'Wilson 1-112', covers: 'Rules of differentiation and applications' }],
    schedule: { rows: [{ date: '2026-08-24', type: 'lecture', title: 'Velocity and limits', notes: '' }, { date: '2026-08-26', type: 'lecture', title: 'Computing limits', notes: '' }, { date: '2026-08-28', type: 'lecture', title: 'The derivative at a point', notes: '' }, { date: '2026-09-07', type: 'holiday', title: 'Labor Day', notes: '' }] },
    policies: { ai: 'disclose', aiText: 'You may use generative AI tools to brainstorm or check your understanding, but the work you hand in must be your own. If you use AI on an assignment, say how in a short note at the end.', late: 'Homework is accepted up to two days late for half credit.', other: [] } };

  /* ============================================================
     The faculty workspace: frame, rail, top bar
     ============================================================ */
  const SYL = [['course', 'Course details', 'info'], ['people', 'People and office hours', 'users'], ['about', 'Description and outcomes', 'book'], ['materials', 'Materials', 'scroll'], ['schedule', 'Schedule', 'calendar'], ['exams', 'Exams', 'flag'], ['grading', 'Grading', 'calc'], ['policies', 'Policies', 'shield']];
  const TOOLS = [['students', 'Students', 'users'], ['announce', 'Announcements', 'megaphone'], ['assign', 'Assignments', 'target'], ['attendance', 'Attendance', 'check'], ['insights', 'Insights', 'chart']];
  const PAGES = ['overview'].concat(SYL.map(x => x[0]), TOOLS.map(x => x[0]), ['settings']);
  const LEGACY = { syllabus: 'course' };   // links made before the editor was split into pages
  const pageName = k => ({ overview: 'Overview', settings: 'Class settings' })[k] || (SYL.concat(TOOLS).find(x => x[0] === k) || [k, k])[1];
  let S = null;    // the open class: { id, cls, syl, lint, starter, ai, owner, dirty, meInstructor, timer, unsaved, tab }
  let ME = null;   // teach_me for whoever is signed in

  const initials = n => String(n || '').split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
  /** The frame every faculty page sits in. Returns the frame element; o.on adds frame-level actions. */
  function frame(root, o) {
    const u = user(); const de = document.documentElement; const dark = de.getAttribute('data-theme') === 'dark' || (!de.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    root.innerHTML = `<div class="fx tex2jax_ignore mathjax_ignore${o.norail ? ' norail' : ''}" id="fx">
      <nav class="fx-rail" id="fx-rail" aria-label="Faculty workspace">
        <a class="fx-brand" href="#/teach"><span class="fx-brand-name">Mathub</span><span class="fx-brand-sub">Faculty</span></a>
        <div class="fx-rail-body">${o.rail || ''}</div>
        <div class="fx-rail-foot"><a class="fx-nav" href="#/">${icon('left', 16)}<span>Student site</span></a><button type="button" class="fx-nav" data-action="fx-theme"><span class="theme-btn fx-theme-ic" aria-hidden="true">${icon(dark ? 'sun' : 'moon', 16)}</span><span>Light or dark</span></button></div>
      </nav>
      <div class="fx-col">
        <header class="fx-top"><button type="button" class="fx-iconbtn fx-menu" data-action="fx-menu" aria-label="Menu" aria-controls="fx-rail" aria-expanded="false">${icon('menu', 18)}</button>
          <a class="fx-top-brand" href="#/teach"><span class="fx-brand-name">Mathub</span><span class="fx-brand-sub">Faculty</span></a>
          <div class="fx-crumbs">${o.crumbs || ''}</div>
          <div class="fx-top-actions">${o.actions || ''}${u ? `<a class="fx-who" href="#/settings" title="${esc(u.email)}: account settings"><span class="fx-avatar" aria-hidden="true">${esc(initials(u.name || u.email))}</span><span class="fx-who-name">${esc(u.name || u.email)}</span></a>` : `<button type="button" class="fx-btn sm" data-action="auth-login">Sign in</button>`}</div></header>
        <div class="fx-page" id="tc-body">${o.body || ''}</div>
      </div>
      <div class="fx-scrim" data-action="fx-menu" hidden></div>
    </div>`;
    if (o.title) document.title = `${o.title} · Mathub Faculty`;
    const fx = $('#fx', root);
    bind(fx, Object.assign({ 'fx-theme': () => App.toggleTheme(), 'fx-menu': () => { const open = !fx.classList.contains('rail-open'); fx.classList.toggle('rail-open', open); $('.fx-scrim', fx).hidden = !open; $('.fx-menu', fx).setAttribute('aria-expanded', String(open)); if (open) { const a = $('.fx-rail .fx-nav', fx); if (a) a.focus(); } } }, o.on || {}));
    if (App.auth) App.auth.bindLocks(fx);
    return fx;
  }
  const navItem = (href, label, ic, on, extra = '') => `<a class="fx-nav${on ? ' on' : ''}" href="${href}"${on ? ' aria-current="page"' : ''}>${icon(ic, 16)}<span>${label}</span>${extra}</a>`;
  function homeRail(active) {
    const ok = ME && ME.instructor; const waiting = ME && ME.request && ME.request.status === 'new';
    return `<div class="fx-nav-group">${navItem('#/teach', 'Your syllabi', 'file', active === 'home')}${navItem('#/teach/new', 'New syllabus', 'plus', active === 'new')}${navItem('#/teach/verify', 'Faculty status', 'shield', active === 'verify', ME && !ok ? `<span class="fx-mark ${waiting ? 'wait' : 'warn'}" title="${waiting ? 'Being checked' : 'Not confirmed yet'}"></span>` : '')}</div>`;
  }
  const lintCount = (k, lv) => (S.lint || []).filter(x => x[2] === k && x[0] === lv).length;
  const markHtml = k => { const e = lintCount(k, 'error'), w = lintCount(k, 'warn'); return e ? `<span class="fx-mark err" title="${e} to fix">${e}<span class="sr-only"> to fix</span></span>` : w ? `<span class="fx-mark warn" title="${w} suggestion${w === 1 ? '' : 's'}"><span class="sr-only">${w} suggestion${w === 1 ? '' : 's'}</span></span>` : ''; };
  const statusWord = c => c.status === 'published' ? (S && S.dirty ? 'Changes not published' : 'Published') : 'Draft';
  function classRail() {
    const c = S.cls; const locked = !c.verified;
    const item = (k, label, ic, extra = '') => navItem(`#/teach/${S.id}/${k}`, label, ic, k === S.tab, extra);
    return `<div class="fx-rail-class"><div class="fx-rail-code">${esc(c.code)}${c.section ? ` · ${esc(c.section)}` : ''}</div><div class="fx-rail-title">${esc(c.title)}</div><div class="fx-rail-meta">${esc(c.term || 'No term')} · <span id="fx-rail-status">${statusWord(c)}</span></div></div>
      <div class="fx-nav-group">${item('overview', 'Overview', 'home')}</div>
      <div class="fx-nav-group" role="group" aria-labelledby="fx-g-syl"><div class="fx-nav-h" id="fx-g-syl">Syllabus</div>${SYL.map(([k, l, ic]) => item(k, l, ic, `<span class="fx-mark-slot" data-mark="${k}">${markHtml(k)}</span>`)).join('')}</div>
      <div class="fx-nav-group" role="group" aria-labelledby="fx-g-cls"><div class="fx-nav-h" id="fx-g-cls">Class</div>${TOOLS.map(([k, l, ic]) => item(k, l, ic, locked ? `<span class="fx-lock" title="Turns on once your faculty status is confirmed">${icon('lock', 12)}</span>` : '')).join('')}</div>
      <div class="fx-nav-group">${item('settings', 'Class settings', 'gear')}</div>`;
  }
  const pubLabel = () => S.cls.status !== 'published' ? 'Publish' : S.dirty ? 'Publish changes' : 'Published';
  const pubOff = () => S.cls.status === 'published' && !S.dirty;

  /* ============================================================
     #/teach
     ============================================================ */
  App.views.teach = {
    title: 'Mathub Faculty',
    render(root, param) {
      document.documentElement.dataset.surface = 'faculty';
      const parts = String(param || '').split('/').filter(Boolean); const id = parseInt(parts[0], 10);
      if (S && S.id !== id) { flush(); S = null; }
      if (App.auth && !App.auth.ready) { frame(root, { body: '<div class="fx-wait">Checking your account…</div>', title: 'Faculty' }); return; }
      if (signedOut()) return intro(root);
      if (id) return openClass(root, id, PAGES.includes(parts[1]) ? parts[1] : LEGACY[parts[1]] || 'overview');
      if (parts[0] === 'new') return newPage(root);
      if (parts[0] === 'verify') return verifyPage(root);
      home(root);
    },
    unmount() { flush(); clearInterval(attTimer); delete document.documentElement.dataset.surface; }
  };

  /* ---------- signed out: what the workspace is, with a real example of what it makes ---------- */
  function intro(root) {
    const fact = (h, p) => `<div class="fx-fact"><dt>${h}</dt><dd>${p}</dd></div>`;
    frame(root, { norail: true, crumbs: `<a class="fx-crumb-exit" href="#/">${icon('left', 14)} Student site</a>`, title: 'Write your syllabus', body: `<div class="fx-intro">
      <div class="fx-intro-copy">
        <h1 class="fx-display">Write the syllabus once. Run the class from it.</h1>
        <p class="fx-lede lg">A syllabus editor for Montana State instructors. The finished page sits beside the form and updates as you type; print it, save it as a PDF, or publish it to your students on Mathub.</p>
        <div class="fx-actions"><button type="button" class="fx-btn primary lg" data-action="auth-login">Sign in with montana.edu</button><button type="button" class="fx-btn lg" data-action="auth-signup">Create an account</button></div>
        <p class="fx-help">Free. Writing, printing and PDFs work as soon as you sign in. Publishing to students needs your faculty status confirmed, usually within a day.</p>
        <dl class="fx-facts">${fact('The page, as you write it', 'Course facts, office hours, schedule, exams, grading and policies, each on its own page, with the typeset syllabus next to it.')}${fact('Checked before it goes out', 'A checklist flags what students look for: office hours, weights that add up to 100%, exam dates, an AI policy, an accommodations statement.')}${fact('Published to your students', 'Students join with a six-character code. Their calendar, exam countdowns and grade calculator follow your syllabus, with announcements, practice sets and attendance in the same place.')}</dl>
      </div>
      <figure class="fx-intro-paper"><figcaption class="fx-paper-tag">Example</figcaption><div class="fx-paper">${docHtml(SAMPLE)}</div></figure>
    </div>` });
  }

  /* ---------- your syllabi ---------- */
  async function home(root) {
    frame(root, { rail: homeRail('home'), crumbs: '<span aria-current="page">Your syllabi</span>', body: '<div class="fx-wait">Loading your syllabi…</div>', title: 'Your syllabi' });
    let me; try { me = ME = await api('teach_me'); } catch (e) { if (root.isConnected) $('#tc-body', root).innerHTML = `<div class="fx-wide"><p class="fx-error">${esc(e.message)}</p></div>`; return; }
    if (!root.isConnected) return;
    const rows = me.teaching.filter(c => c.access !== 'student');
    const tag = c => c.status === 'published' ? '<span class="fx-tag live">Published</span>' : '<span class="fx-tag">Draft</span>';
    const table = `<div class="fx-table-wrap"><table class="fx-table fx-classes"><caption class="sr-only">Your syllabi</caption><thead><tr><th scope="col">Course</th><th scope="col">Term</th><th scope="col">Status</th><th scope="col" class="num">Students</th><th scope="col">Last edited</th></tr></thead><tbody>${rows.map(c => `<tr><td><a class="fx-rowlink" href="#/teach/${c.id}"><span class="fx-c-code">${esc(c.code)}${c.section ? ` · ${esc(c.section)}` : ''}</span><span class="fx-c-title">${esc(c.title)}</span></a>${c.access === 'staff' ? '<span class="fx-c-note">co-teaching</span>' : ''}</td><td>${esc(c.term || '–')}</td><td>${tag(c)}</td><td class="num" data-l="Students">${c.verified ? c.students : '–'}</td><td data-l="Edited">${esc(ago(c.updated))}</td></tr>`).join('')}</tbody></table></div>`;
    const empty = `<div class="fx-empty-split"><div><h2 class="fx-h2">No syllabi yet</h2><p>Start one from the Montana State template: accommodations, academic integrity and wellbeing statements are already in, and the schedule fills itself in from your meeting days. It takes about ten minutes.</p><a class="fx-btn primary" href="#/teach/new">${icon('plus', 15)} New syllabus</a></div><figure class="fx-intro-paper sm"><figcaption class="fx-paper-tag">Example</figcaption><div class="fx-paper">${docHtml(SAMPLE)}</div></figure></div>`;
    $('#tc-body', root).innerHTML = `<div class="fx-wide"><header class="fx-head fx-head-row"><div><h1 class="fx-h1">Your syllabi</h1><p class="fx-lede">${rows.length ? 'Open one to keep writing, see what is missing, print it or publish it to your students.' : 'Everything you write here stays private until you publish it.'}</p></div>${rows.length ? `<a class="fx-btn primary" href="#/teach/new">${icon('plus', 15)} New syllabus</a>` : ''}</header>
      ${statusNote(me)}${rows.length ? table : empty}
      ${me.enrolled.length ? `<p class="fx-help fx-gap">You also joined ${me.enrolled.length} class${me.enrolled.length === 1 ? '' : 'es'} as a student. <a href="#/class">Open ${me.enrolled.length === 1 ? 'it' : 'them'} on the student site</a>.</p>` : ''}</div>`;
    const rail = $('.fx-rail-body', root); if (rail) rail.innerHTML = homeRail('home');
  }
  function statusNote(me) {
    if (me.instructor) return '';
    if (me.request && me.request.status === 'new') return `<div class="fx-note">${icon('clock', 15)}<div><p><b>Your faculty status is being checked</b> (asked ${esc(ago(me.request.created))}). Keep writing; you can publish once an administrator confirms it. You will get a message in your Mathub inbox.</p></div></div>`;
    return `<div class="fx-note">${icon('shield', 15)}<div><p>Write, preview, print and save syllabi as PDFs now. <b>To publish to your students</b>, confirm that you teach at Montana State.</p><a class="fx-btn sm" href="#/teach/verify">Confirm faculty status</a></div></div>`;
  }

  /* ---------- a new syllabus ---------- */
  const quizCourses = () => App.COURSE_ORDER.filter(id => { const C = global.Courses[id]; return C && !C.hidden && !C.preview && (C.quiz || C.hasQuiz || ['calc', 'physics', 'precalc', 'csci', 'biob', 'kin', 'psyx'].includes(id)); });
  async function newPage(root) {
    frame(root, { rail: homeRail('new'), crumbs: '<a href="#/teach">Your syllabi</a><span class="fx-sep" aria-hidden="true">/</span><span aria-current="page">New syllabus</span>', body: '<div class="fx-wait">Loading…</div>', title: 'New syllabus' });
    if (!ME) { try { ME = await api('teach_me'); } catch (e) {} } if (!root.isConnected) return;
    const mine = ((ME && ME.teaching) || []).filter(c => c.access !== 'student'); const qc = quizCourses();
    $('#tc-body', root).innerHTML = `<div class="fx-narrow"><header class="fx-head"><h1 class="fx-h1">New syllabus</h1><p class="fx-lede">The basics first. The rest is filled in page by page, with the finished syllabus beside the form.</p></header>
      <form class="fx-panel" id="tc-new" novalidate><div class="fx-grid g4">
        <div class="fx-field"><label class="fx-label" for="tn-code">Course code <span class="fx-req">required</span></label><input class="fx-input" id="tn-code" maxlength="20" placeholder="M 171" required autocomplete="off"></div>
        <div class="fx-field span2"><label class="fx-label" for="tn-title">Course title <span class="fx-req">required</span></label><input class="fx-input" id="tn-title" maxlength="120" placeholder="Calculus I" required></div>
        <div class="fx-field"><label class="fx-label" for="tn-section">Section</label><input class="fx-input" id="tn-section" maxlength="20" placeholder="003"></div>
        <div class="fx-field"><label class="fx-label" for="tn-term">Term</label><select class="fx-input fx-select" id="tn-term">${Object.keys(TERMS).map((t, i) => `<option${i === 0 ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="fx-field span2"><label class="fx-label" for="tn-from">Start from</label><select class="fx-input fx-select" id="tn-from"><option value="blank">The Montana State template</option>${mine.map(c => `<option value="copy:${c.id}">A copy of ${esc(c.code)} ${esc(c.title)}${c.term ? ' (' + esc(c.term) + ')' : ''}</option>`).join('')}</select><span class="fx-help">A copy keeps your policies, grading and materials; dates start empty.</span></div>
        <div class="fx-field"><label class="fx-label" for="tn-link">Practice questions</label><select class="fx-input fx-select" id="tn-link"><option value="">None</option>${qc.map(id => `<option value="${id}">${esc(global.Courses[id].code || global.Courses[id].short)} on Mathub</option>`).join('')}</select><span class="fx-help">For practice assignments.</span></div>
      </div><div class="fx-actions"><button class="fx-btn primary" type="submit">Create syllabus</button><a class="fx-btn quiet" href="#/teach">Cancel</a><span class="fx-msg" id="tn-status" role="status"></span></div></form></div>`;
    const f = $('#tc-new', root); const code = $('#tn-code', f), link = $('#tn-link', f);
    code.addEventListener('input', () => { const b = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); const hit = qc.find(id => String(global.Courses[id].code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[A-Z]+$/, '') === b.replace(/[A-Z]+$/, '')); if (hit && !link.dataset.touched) link.value = hit; });
    link.addEventListener('change', () => { link.dataset.touched = '1'; });
    f.addEventListener('submit', async e => { e.preventDefault(); const st = $('#tn-status', f); st.textContent = 'Creating…'; st.className = 'fx-msg';
      try { const r = await api('teach_class_create', { code: code.value, title: $('#tn-title', f).value, section: $('#tn-section', f).value, term: $('#tn-term', f).value, from: $('#tn-from', f).value, link_course: link.value }); ME = null; location.hash = `#/teach/${r.id}/course`; } catch (err) { st.textContent = err.message; st.className = 'fx-msg bad'; } });
  }

  /* ---------- faculty status ---------- */
  async function verifyPage(root) {
    frame(root, { rail: homeRail('verify'), crumbs: '<a href="#/teach">Your syllabi</a><span class="fx-sep" aria-hidden="true">/</span><span aria-current="page">Faculty status</span>', body: '<div class="fx-wait">Loading…</div>', title: 'Faculty status' });
    let me; try { me = ME = await api('teach_me'); } catch (e) { if (root.isConnected) $('#tc-body', root).innerHTML = `<div class="fx-narrow"><p class="fx-error">${esc(e.message)}</p></div>`; return; }
    if (!root.isConnected) return; const rail = $('.fx-rail-body', root); if (rail) rail.innerHTML = homeRail('verify');
    const head = `<header class="fx-head"><h1 class="fx-h1">Faculty status</h1><p class="fx-lede">Students trust that a class on Mathub comes from their instructor, so an administrator checks each instructor by hand before a class can reach students.</p></header>`;
    const body = $('#tc-body', root);
    if (me.instructor) { body.innerHTML = `<div class="fx-narrow">${head}<div class="fx-note good">${icon('check', 15)}<div><p><b>Confirmed.</b> You can publish syllabi, and use the roster, announcements, assignments, attendance and insights for your classes.</p><a class="fx-btn sm" href="#/teach">Your syllabi</a></div></div></div>`; return; }
    if (me.request && me.request.status === 'new') { body.innerHTML = `<div class="fx-narrow">${head}<div class="fx-note">${icon('clock', 15)}<div><p><b>Being checked</b>, asked ${esc(ago(me.request.created))}. You will get a message in your Mathub inbox. Meanwhile, everything except publishing works.</p><a class="fx-btn sm" href="#/teach">Keep writing</a></div></div></div>`; return; }
    body.innerHTML = `<div class="fx-narrow">${head}<form class="fx-panel" id="tc-req" novalidate>${me.request && me.request.status === 'declined' ? '<p class="fx-help">An earlier request was not approved. If that was a mistake, send a new one with a little more detail.</p>' : ''}
      <div class="fx-grid g2"><div class="fx-field"><label class="fx-label" for="tr-name">Your name, as students know it <span class="fx-req">required</span></label><input class="fx-input" id="tr-name" maxlength="80" value="${esc(user().name || '')}" placeholder="Dr. Jane Smith" required></div>
      <div class="fx-field"><label class="fx-label" for="tr-title">Title</label><input class="fx-input" id="tr-title" maxlength="80" placeholder="Assistant Professor, Lecturer, GTA…"></div>
      <div class="fx-field"><label class="fx-label" for="tr-dept">Department <span class="fx-req">required</span></label><input class="fx-input" id="tr-dept" maxlength="120" placeholder="Mathematical Sciences" required></div>
      <div class="fx-field"><label class="fx-label" for="tr-courses">Courses you teach <span class="fx-req">required</span></label><input class="fx-input" id="tr-courses" maxlength="200" placeholder="M 171 sections 3 and 5" required></div>
      <div class="fx-field span2"><label class="fx-label" for="tr-msg">Anything else?</label><textarea class="fx-input" id="tr-msg" rows="3" maxlength="800" placeholder="Optional: a link to your department page helps."></textarea></div></div>
      <p class="fx-help">You are signed in as <b>${esc(user().email)}</b>${/student\./i.test(user().email) ? '. That looks like a student address; instructors usually use their faculty address.' : '.'}</p>
      <div class="fx-actions"><button class="fx-btn primary" type="submit">Send for confirmation</button><span class="fx-msg" id="tr-status" role="status"></span></div></form></div>`;
    const f = $('#tc-req', body); f.addEventListener('submit', async e => { e.preventDefault(); const st = $('#tr-status', f); st.textContent = 'Sending…'; st.className = 'fx-msg';
      try { await api('teach_request', { name: $('#tr-name', f).value, title: $('#tr-title', f).value, department: $('#tr-dept', f).value, courses: $('#tr-courses', f).value, message: $('#tr-msg', f).value }); toast('Sent. You will hear back in your Mathub inbox.'); verifyPage(root); } catch (err) { st.textContent = err.message; st.className = 'fx-msg bad'; } });
  }

  /* ---------- one class ---------- */
  async function openClass(root, id, tab) {
    const crumbs = c => `<a href="#/teach">Your syllabi</a><span class="fx-sep" aria-hidden="true">/</span><span aria-current="page">${c ? `${esc(c.code)} · ${esc(c.title)}` : 'Class'}</span>`;
    if (!S || S.id !== id) {
      frame(root, { crumbs: crumbs(), body: '<div class="fx-wait">Opening the class…</div>', title: 'Class' });
      let r; try { r = await api('teach_class_get&id=' + id); } catch (e) { if (root.isConnected) $('#tc-body', root).innerHTML = `<div class="fx-narrow"><p class="fx-error">${esc(e.message)}</p><a class="fx-btn" href="#/teach">Back to your syllabi</a></div>`; return; }
      if (!root.isConnected) return;
      S = { id, cls: r.class, syl: r.syllabus, lint: r.lint, starter: r.starter, ai: r.ai_presets, owner: r.owner, dirty: r.dirty, meInstructor: r.me_instructor, timer: null, unsaved: false };
    }
    S.tab = tab; const c = S.cls;
    const fx = frame(root, { rail: classRail(), crumbs: crumbs(c), title: `${pageName(tab)} · ${c.code}`, body: '<div id="fx-pane" class="fx-pane"></div>',
      actions: `<span class="fx-save" id="tc-save" role="status" aria-live="polite">${S.unsaved ? 'Not saved yet' : 'All changes saved'}</span><button type="button" class="fx-btn sm fx-narrow-only" data-action="fx-preview" aria-label="Preview the syllabus">${icon('eye', 14)}<span>Preview</span></button><button type="button" class="fx-btn sm" data-action="fx-print" title="Print, or choose Save as PDF in the print dialog">${icon('print', 14)}<span>Print / PDF</span></button><button type="button" class="fx-btn sm primary" data-action="fx-publish" id="fx-publish"${pubOff() ? ' disabled' : ''}>${pubLabel()}</button>`,
      on: { 'fx-preview': () => modal(`<div class="fx-dlg-top"><h2 class="fx-dlg-h">Preview</h2><button class="fx-iconbtn" data-close aria-label="Close">${icon('x', 16)}</button></div><div class="fx-paper">${docHtml(S.syl, S.cls)}</div>`, { wide: true, cls: 'fx-dlg fx-sheet', label: 'Syllabus preview' }), 'fx-print': () => printDoc(docHtml(S.syl, S.cls), `${S.cls.code} ${S.cls.title} syllabus`), 'fx-publish': () => publish() } });
    PAGE[tab]($('#fx-pane', fx));
  }

  /* ---------- saving ---------- */
  function changed() {
    S.unsaved = true; const st = $('#tc-save'); if (st) st.textContent = 'Saving soon…';
    clearTimeout(S.timer); S.timer = setTimeout(save, 900);
  }
  async function save() {
    const cur = S; if (!cur || !cur.unsaved) return; clearTimeout(cur.timer); cur.unsaved = false; const st = $('#tc-save'); if (st) st.textContent = 'Saving…';
    const say = t => { const el = S === cur && $('#tc-save'); if (el) el.textContent = t; };   // the page may have moved on (another part of the syllabus, or another class) while this saved
    try { const r = await api('teach_class_save', { id: cur.id, syllabus: cur.syl, link_course: cur.cls.link_course }); cur.lint = r.lint; cur.dirty = r.dirty; say(cur.unsaved ? 'Saving soon…' : 'All changes saved'); if (S === cur) paintLint(); }
    catch (e) { cur.unsaved = true; if (S === cur) say('Not saved: ' + e.message); else toast('A change was not saved: ' + e.message, 6000); }
  }
  function flush() { if (S && S.unsaved) save(); }
  global.addEventListener('beforeunload', e => { if (S && S.unsaved) { save(); e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 's' && S && location.hash.startsWith('#/teach/')) { e.preventDefault(); save(); } });
  /** Inputs carrying data-k="path" write straight into the syllabus. */
  function wire(pane, after) {
    pane.__after = after || null; if (pane.__wired) return; pane.__wired = true;
    const on = e => { const el = e.target.closest('[data-k]'); if (!el || !S) return; let v = el.type === 'checkbox' ? el.checked : el.value; if (el.dataset.num !== undefined) v = v === '' ? 0 : Number(v); setP(S.syl, el.dataset.k, v); changed(); if (pane.__after) pane.__after(el); };
    pane.addEventListener('input', e => { if (!e.target.matches('select, input[type=checkbox]')) on(e); }); pane.addEventListener('change', e => { if (e.target.matches('select, input[type=checkbox]')) on(e); });
  }
  const BLANK = { 'course.meets': () => ({ days: '', start: '', end: '', room: '', kind: 'Lecture' }), people: () => ({ role: 'TA', name: '', email: '', office: '', hours: '', pronouns: '' }), 'course.outcomes': () => '', materials: () => ({ title: '', url: '', required: true, note: '' }), 'policies.other': () => ({ title: '', text: '' }), exams: () => ({ name: '', date: '', time: '', place: '', covers: '' }), 'schedule.rows': () => ({ date: '', type: 'lecture', title: '', notes: '' }), 'grading.categories': () => ({ name: '', weight: 0, note: '' }), 'grading.scale': () => ({ letter: '', min: 0 }) };
  /** "Add" and "remove" buttons on the list editors (data-act add/del, data-path). */
  function listActions(pane, rerender) {
    pane.__rerender = rerender; if (pane.__listWired) return; pane.__listWired = true;
    pane.addEventListener('click', e => {
      const b = e.target.closest('[data-act="add"], [data-act="del"]'); if (!b || !S || !b.dataset.path) return; const path = b.dataset.path; const list = getP(S.syl, path) || [];
      if (b.dataset.act === 'add') { list.push(BLANK[path] ? BLANK[path]() : ''); setP(S.syl, path, list); } else list.splice(Number(b.dataset.i), 1);
      changed(); const y = global.scrollY; pane.__rerender(pane); global.scrollTo(0, y);
      if (b.dataset.act === 'add') { const items = $$(`[data-list="${path}"] [data-item]`, pane); const last = items[items.length - 1]; const f = last && $('input, select, textarea', last); if (f) f.focus(); }
      else { const next = $(`[data-list="${path}"] [data-act="add"]`, pane); if (next) next.focus(); }
    });
  }
  async function publish() {
    await save();
    if (!S.cls.verified) { modal(`<h2 class="fx-dlg-h">Confirm your faculty status first</h2><p>Publishing puts the class in front of students, so an administrator checks that you teach at Montana State first, usually within a day. Everything else (writing, preview, print and PDF) works now.</p><div class="fx-dlg-actions"><a class="fx-btn primary" href="#/teach/verify" data-close>Confirm faculty status</a><button class="fx-btn" data-close>Not now</button></div>`, { cls: 'fx-dlg', label: 'Confirm faculty status' }); return; }
    const errs = (S.lint || []).filter(x => x[0] === 'error');
    if (errs.length) { modal(`<h2 class="fx-dlg-h">${errs.length} thing${errs.length === 1 ? '' : 's'} to fix first</h2><ul class="fx-lint">${errs.map(x => `<li class="fx-l-error">${icon('x', 13)}<span>${esc(x[1])} <a href="#/teach/${S.id}/${esc(x[2] || 'overview')}" data-close>Fix it</a></span></li>`).join('')}</ul><div class="fx-dlg-actions"><button class="fx-btn primary" data-close>OK</button></div>`, { cls: 'fx-dlg', label: 'Fix before publishing' }); return; }
    const first = S.cls.status !== 'published';
    const m = modal(`<h2 class="fx-dlg-h">${first ? 'Publish to your students' : 'Publish the changes'}</h2>
      <p>${first ? `Students who join with the code <b class="mono">${esc(S.cls.join_code)}</b> get this class on Mathub: the calendar, exam countdowns, the grade calculator with your weights, the syllabus and a class board.` : 'Everyone in the class gets the updated syllabus and calendar right away.'}</p>
      ${first ? '' : `<div class="fx-field"><label class="fx-label" for="tp-note">Tell students what changed (optional)</label><input class="fx-input" id="tp-note" maxlength="200" placeholder="Midterm 2 moved to Nov 12"><span class="fx-help">Sent to their inbox and phone.</span></div>`}
      <div class="fx-dlg-actions"><button class="fx-btn primary" data-go>Publish</button><button class="fx-btn" data-close>Cancel</button><span class="fx-msg" data-st role="status"></span></div>`, { cls: 'fx-dlg', label: 'Publish' });
    $('[data-go]', m.el).addEventListener('click', async () => { const st = $('[data-st]', m.el); st.textContent = 'Publishing…';
      try { const r = await api('teach_class_publish', { id: S.id, note: ($('#tp-note', m.el) || {}).value || '' }); S.cls.status = 'published'; S.cls.pack_id = r.pack_id; S.cls.published_at = Math.floor(Date.now() / 1000); S.dirty = false; App.teachForget(); m.close(); toast(first ? 'Published. Share the class code with your students.' : `Published${r.told ? `; ${r.told} student${r.told === 1 ? '' : 's'} told` : ''}.`, 5000); if (App.packs && App.packs.sync) App.packs.sync(); App.rerender(); }
      catch (e) { st.textContent = e.message; } });
  }

  /* ---------- the checklist, the live page ---------- */
  const lintLi = ([lv, m]) => `<li class="fx-l-${lv}">${icon(lv === 'error' ? 'x' : lv === 'warn' ? 'flag' : 'bulb', 13)}<span>${esc(m)}</span></li>`;
  function checklistHtml() {
    const L = S.lint || []; const n = { error: 0, warn: 0, tip: 0 }; L.forEach(x => n[x[0]]++);
    if (!L.length) return `<p class="fx-ok">${icon('check', 15)} Nothing missing. Students will find everything they usually look for.</p>`;
    const groups = SYL.map(([k, l]) => [k, l, L.filter(x => x[2] === k)]).filter(g => g[2].length);
    return `<p class="fx-check-sum">${n.error ? `<b>${n.error} to fix</b> before you can publish` : '<b>Ready to publish.</b>'}${n.warn + n.tip ? ` ${n.warn + n.tip} suggestion${n.warn + n.tip === 1 ? '' : 's'}.` : ''}</p>
      ${groups.map(([k, l, items]) => `<div class="fx-check-grp"><a class="fx-check-h" href="#/teach/${S.id}/${k}">${l}${icon('right', 13)}</a><ul class="fx-lint">${items.map(lintLi).join('')}</ul></div>`).join('')}`;
  }
  function paintLint() {
    if (!S) return;
    SYL.forEach(([k]) => $$(`[data-mark="${k}"]`).forEach(slot => { slot.innerHTML = markHtml(k); }));
    const notes = $('#fx-notes'); if (notes) { const mine = (S.lint || []).filter(x => x[2] === S.tab); notes.innerHTML = mine.length ? `<ul class="fx-lint">${mine.map(lintLi).join('')}</ul>` : ''; notes.hidden = !mine.length; }
    const cl = $('#fx-checklist'); if (cl) cl.innerHTML = checklistHtml();
    const pb = $('#fx-publish'); if (pb) { pb.textContent = pubLabel(); pb.disabled = pubOff(); }
    const rs = $('#fx-rail-status'); if (rs) rs.textContent = statusWord(S.cls);
  }
  const paperCol = () => `<div class="fx-paper-col" role="region" aria-label="Live preview of the syllabus"><div class="fx-paper-bar"><b>Live preview</b><span>What students see, and what prints</span></div><div class="fx-paper-scroll" id="fx-paper-scroll"><div class="fx-paper" id="fx-paper"></div></div></div>`;
  let paperTimer = null;
  const schedulePaper = () => { clearTimeout(paperTimer); paperTimer = setTimeout(() => paintPaper(false), 140); };
  function paintPaper(jump) {
    const el = $('#fx-paper'); if (!el || !S) return;
    el.innerHTML = docHtml(S.syl, S.cls, { current: S.tab, ghost: true });
    const sc = $('#fx-paper-scroll'); const cur = $('.is-current', el);
    if (jump && sc && cur) sc.scrollTop += cur.getBoundingClientRect().top - sc.getBoundingClientRect().top - 20;
  }

  /* ---------- form pieces ---------- */
  const I = (p, ph = '', attrs = '', type = 'text', cls = '') => `<input class="fx-input${cls ? ' ' + cls : ''}" type="${type}" ${val(p, attrs)} value="${esc(getP(S.syl, p) ?? '')}" placeholder="${esc(ph)}">`;
  const TA = (p, rows = 3, ph = '', attrs = '') => `<textarea class="fx-input" rows="${rows}" ${val(p, attrs)} placeholder="${esc(ph)}">${esc(getP(S.syl, p) ?? '')}</textarea>`;
  const SEL = (p, opts, attrs = '') => { const v = getP(S.syl, p); return `<select class="fx-input fx-select" ${val(p, attrs)}>${opts.map(o => { const [k, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(k)}"${v === k ? ' selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`; };
  const F = (label, body, help = '', cls = '') => `<label class="fx-field${cls ? ' ' + cls : ''}"><span class="fx-label">${label}</span>${body}${help ? `<span class="fx-help">${help}</span>` : ''}</label>`;
  const DEL = (path, i, what) => `<button type="button" class="fx-iconbtn fx-del" data-act="del" data-path="${path}" data-i="${i}" aria-label="Remove ${what}" title="Remove">${icon('trash', 15)}</button>`;
  const ADD = (path, label) => `<button type="button" class="fx-btn sm quiet fx-add" data-act="add" data-path="${path}">${icon('plus', 14)} ${label}</button>`;
  const EMPTY = t => `<p class="fx-list-empty">${t}</p>`;
  /** One page of the syllabus: the form on the left, the live page on the right. */
  function sylPage(pane, k, lede, inner, after) {
    const i = SYL.findIndex(x => x[0] === k); const prev = SYL[i - 1], next = SYL[i + 1];
    const link = (to, small, label, dir) => `<a class="fx-pager-a${dir === 'next' ? ' next' : ''}" href="#/teach/${S.id}/${to}">${dir === 'next' ? '' : icon('left', 15)}<span><small>${small}</small>${label}</span>${dir === 'next' ? icon('right', 15) : ''}</a>`;
    pane.innerHTML = `<div class="fx-split"><div class="fx-form">
        <header class="fx-head"><h1 class="fx-h1">${SYL[i][1]}</h1><p class="fx-lede">${lede}</p></header>
        <div class="fx-notes" id="fx-notes" hidden></div>
        ${inner}
        <nav class="fx-pager" aria-label="Syllabus pages">${prev ? link(prev[0], 'Previous', prev[1]) : link('overview', 'Back to', 'Overview')}${next ? link(next[0], 'Next', next[1], 'next') : link('overview', 'Done?', 'Review and publish', 'next')}</nav>
      </div>${paperCol()}</div>`;
    paintLint(); paintPaper(true);
    wire(pane, el => { schedulePaper(); if (pane.__pageAfter) pane.__pageAfter(el); }); pane.__pageAfter = after || null;
    listActions(pane, PAGE[k]);
  }

  /* ---------- the syllabus pages ---------- */
  const PAGE = {
    overview(pane) {
      const c = S.cls; const pub = c.status === 'published';
      pane.innerHTML = `<div class="fx-split"><div class="fx-form">
        <header class="fx-head"><h1 class="fx-h1">${esc(c.title)}</h1><p class="fx-lede">${esc(c.code)}${c.section ? ` · Section ${esc(c.section)}` : ''} · ${esc(c.term || 'No term yet')}${c.access === 'staff' ? ` · owned by ${esc(S.owner)}` : ''}</p></header>
        <div class="fx-state ${pub ? (S.dirty ? 'changes' : 'live') : 'draft'}">${pub ? (S.dirty ? `<b>Published, with changes since.</b> Students see the version from ${fmtWhen(c.published_at)} until you publish again.` : `<b>Published</b> ${fmtWhen(c.published_at)}. Students who join see this syllabus.`) : `<b>Draft.</b> Only you${c.access === 'staff' ? ' and the teaching team' : ''} can see it.`}</div>
        <section class="fx-sec"><h2 class="fx-h2">${pub ? 'Checklist' : 'Before you publish'}</h2><div id="fx-checklist"></div></section>
        <section class="fx-sec"><h2 class="fx-h2">Share with students</h2>${c.verified ? `<div class="fx-share"><div><span class="fx-label">Class code</span><div class="fx-code mono">${esc(c.join_code)}</div></div><div class="fx-share-actions"><button type="button" class="fx-btn sm" data-action="copy-link">${icon('copy', 14)} Copy join link</button>${pub ? `<a class="fx-btn sm quiet" href="#/syllabus/${esc(c.join_code)}" target="_blank" rel="noopener">${icon('external', 14)} Public syllabus page</a>` : ''}${pub && c.pack_id ? `<a class="fx-btn sm quiet" href="#/${esc(c.pack_id)}/dashboard" target="_blank" rel="noopener">${icon('eye', 14)} See it as a student</a>` : ''}</div></div><p class="fx-help">Students open mathub.space, choose <b>Join a class</b> and type the code, or open the link. ${pub ? 'The class appears on their start page right away.' : 'They can join now; the class appears for them once you publish.'}</p>` : verifyNote('Students can join once your faculty status is confirmed. Until then you can write, preview, print and save the syllabus as a PDF.')}</section>
        <section class="fx-sec"><h2 class="fx-h2">Write it page by page</h2><ol class="fx-steps">${SYL.map(([k, l]) => `<li><a href="#/teach/${S.id}/${k}">${l}</a><span class="fx-mark-slot" data-mark="${k}">${markHtml(k)}</span></li>`).join('')}</ol></section>
      </div>${paperCol()}</div>`;
      paintLint(); paintPaper(false);
      bind(pane, { 'copy-link': () => copy(joinLink(c.join_code), 'Join link copied.') });
    },
    course(pane) {
      const m = S.syl.course.meets;
      sylPage(pane, 'course', 'The facts at the top of the syllabus: what the course is, and when and where it meets.', `
        <section class="fx-sec"><div class="fx-grid g4">${F('Course code', I('course.code', 'M 171'))}${F('Title', I('course.title', 'Calculus I'), '', 'span2')}${F('Section', I('course.section', '003'))}
          ${F('Term', I('course.term', 'Fall 2026'))}${F('Credits', I('course.credits', '4'))}${F('Format', SEL('course.modality', ['In person', 'Hybrid', 'Online, scheduled', 'Online, self-paced']))}${F('Prerequisites', I('course.prereqs', 'M 151Q'))}
          ${F('Canvas page', I('course.canvas', 'https://montana.instructure.com/courses/…', '', 'url'), 'Optional. Students get a link to it.', 'span4')}</div></section>
        <section class="fx-sec"><h2 class="fx-h2">When and where</h2>
          <div class="fx-list" data-list="course.meets">${m.length ? '<div class="fx-cols fx-meet" aria-hidden="true"><span>Kind</span><span>Days</span><span>Starts</span><span>Ends</span><span>Room</span></div>' : ''}${m.map((x, i) => `<div class="fx-row fx-meet" data-item>${I(`course.meets.${i}.kind`, 'Lecture', 'aria-label="Kind of meeting"')}${I(`course.meets.${i}.days`, 'MWF', 'aria-label="Days (M T W R F)"', 'text', 'mono')}${I(`course.meets.${i}.start`, '', 'aria-label="Starts"', 'time')}${I(`course.meets.${i}.end`, '', 'aria-label="Ends"', 'time')}${I(`course.meets.${i}.room`, 'Wilson 1-112', 'aria-label="Room"')}${DEL('course.meets', i, 'this meeting')}</div>`).join('') || EMPTY('No meetings yet.')}${ADD('course.meets', 'Add a meeting')}</div>
          <p class="fx-help">Days as letters: M T W R F, where R is Thursday. The Schedule page fills in a row for every meeting.</p></section>`);
    },
    people(pane) {
      const P = S.syl.people;
      sylPage(pane, 'people', 'Who teaches the course and how students reach you. Office hours are what students look for most.', `
        <section class="fx-sec"><div class="fx-list" data-list="people">${P.map((p, i) => `<div class="fx-item" data-item><div class="fx-grid g3">${F('Role', SEL(`people.${i}.role`, ['Instructor', 'Co-instructor', 'TA', 'Grader', 'Learning assistant']))}${F('Name', I(`people.${i}.name`, 'Dr. Jane Smith'))}${F('Pronouns', I(`people.${i}.pronouns`, 'Optional'))}${F('Email', I(`people.${i}.email`, 'name@montana.edu', '', 'email'), '', 'span2')}${F('Office', I(`people.${i}.office`, 'Wilson 2-240'))}${F('Office hours', I(`people.${i}.hours`, 'Tue 2–3 pm, Wed 1–2 pm, or by appointment'), '', 'span3')}</div>${DEL('people', i, (p.name || 'this person'))}</div>`).join('') || EMPTY('Add at least yourself.')}${ADD('people', 'Add a person')}</div></section>`);
    },
    about(pane) {
      const O = S.syl.course.outcomes;
      sylPage(pane, 'about', 'What the course covers and what students will be able to do by the end.', `
        <section class="fx-sec">${F('Course description', TA('course.description', 7, 'What the course is about and how it is taught.'), 'Separate paragraphs with a blank line. Web addresses become links.')}</section>
        <section class="fx-sec"><h2 class="fx-h2">Learning outcomes</h2><p class="fx-help">Shown as “By the end of the course you will be able to:”.</p>
          <div class="fx-list" data-list="course.outcomes">${O.map((x, i) => `<div class="fx-row fx-one" data-item>${I(`course.outcomes.${i}`, 'Compute derivatives with the rules of differentiation', `aria-label="Outcome ${i + 1}"`)}${DEL('course.outcomes', i, `outcome ${i + 1}`)}</div>`).join('') || EMPTY('None yet.')}${ADD('course.outcomes', 'Add an outcome')}</div></section>`);
    },
    materials(pane) {
      const M = S.syl.materials;
      sylPage(pane, 'materials', 'The textbook, software, calculator or anything else students need, with a link when it is online.', `
        <section class="fx-sec"><div class="fx-list" data-list="materials">${M.map((x, i) => `<div class="fx-item" data-item><div class="fx-grid g2">${F('Title', I(`materials.${i}.title`, 'Active Calculus, 2nd edition'))}${F('Link', I(`materials.${i}.url`, 'https://… (optional)', '', 'url'))}${F('Note', I(`materials.${i}.note`, 'Free online; print copies at the bookstore'))}<label class="fx-check"><input type="checkbox" ${val(`materials.${i}.required`)} ${x.required ? 'checked' : ''}><span>Required</span></label></div>${DEL('materials', i, (x.title || 'this material'))}</div>`).join('') || EMPTY('Nothing listed yet.')}${ADD('materials', 'Add a material')}</div></section>`);
    },
    schedule(pane) {
      const s = S.syl; const sc = s.schedule; const rows = sc.rows;
      const TYPES = [['lecture', 'Class'], ['lab', 'Lab'], ['review', 'Review'], ['exam', 'Exam'], ['due', 'Due date'], ['holiday', 'No class'], ['other', 'Note']];
      const term = TERMS[s.course.term] || null; const days = [...new Set((s.course.meets || []).flatMap(m => parseDays(m.days)))];
      const dayNames = ['M', 'T', 'W', 'R', 'F', 'S', 'U'].filter(c => days.includes(DAY_CODES[c])).map(c => ({ M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri', S: 'Sat', U: 'Sun' })[c]);
      sylPage(pane, 'schedule', 'The class meetings day by day. Start from your meeting days, then add topics, labs and due dates.', `
        <section class="fx-sec"><div class="fx-grid g3">${F('First day of classes', `<input class="fx-input" type="date" ${val('schedule.start')} value="${esc(sc.start || (term ? term[0] : ''))}">`)}${F('Last day of classes', `<input class="fx-input" type="date" ${val('schedule.end')} value="${esc(sc.end || (term ? term[1] : ''))}">`)}<div class="fx-field"><span class="fx-label">Class meets</span><p class="fx-days">${dayNames.length ? dayNames.join(', ') : `<a href="#/teach/${S.id}/course">Set the meeting days first</a>`}</p></div></div>
          <div class="fx-actions"><button type="button" class="fx-btn primary sm" data-action="gen"${days.length ? '' : ' disabled'}>${icon('calendar', 14)} Fill in class meetings</button><button type="button" class="fx-btn sm" data-action="topics" aria-expanded="false" aria-controls="fx-topics"${rows.length ? '' : ' disabled'}>${icon('list', 14)} Paste topics</button><button type="button" class="fx-btn sm quiet" data-action="clear"${rows.length ? '' : ' disabled'}>Clear schedule</button></div>
          <p class="fx-help">Adds a row for every meeting between the first and last day and marks Labor Day, Veterans Day, Thanksgiving week and Monday holidays as no class. Check MSU’s academic calendar for anything else. Rows you already have are kept.</p>
          <div class="fx-inline" id="fx-topics" hidden><label class="fx-field"><span class="fx-label">Topics, one per line, in order</span><textarea class="fx-input" rows="8" id="tp-list" placeholder="Velocity and limits&#10;Computing limits&#10;The derivative at a point"></textarea><span class="fx-help">They fill the class meetings that have no topic yet; holidays are skipped.</span></label><div class="fx-actions"><button type="button" class="fx-btn primary sm" data-action="fill">Fill topics</button><button type="button" class="fx-btn sm quiet" data-action="topics">Cancel</button></div></div></section>
        <section class="fx-sec"><h2 class="fx-h2">Day by day <span class="fx-count">${rows.length} row${rows.length === 1 ? '' : 's'}</span></h2>
          <div class="fx-list fx-sched" data-list="schedule.rows">${rows.length ? '<div class="fx-cols fx-srow" aria-hidden="true"><span>Date</span><span>Type</span><span>Topic or title</span><span class="fx-c-notes">Notes</span></div>' : ''}${rows.map((r, i) => `<div class="fx-row fx-srow" data-type="${esc(r.type)}" data-item><input class="fx-input" type="date" ${val(`schedule.rows.${i}.date`)} value="${esc(r.date)}" aria-label="Date">${SEL(`schedule.rows.${i}.type`, TYPES, 'aria-label="Type"')}${I(`schedule.rows.${i}.title`, r.type === 'due' ? 'Homework 3' : r.type === 'holiday' ? 'Holiday' : 'Topic', 'aria-label="Topic or title"')}${I(`schedule.rows.${i}.notes`, i ? 'Notes' : 'Notes: reading, what to bring…', 'aria-label="Notes"', 'text', 'fx-snotes')}${DEL('schedule.rows', i, `the row for ${fmt(r.date) || 'this day'}`)}</div>`).join('') || EMPTY('No rows yet. Fill in the class meetings above, or add rows one at a time.')}${ADD('schedule.rows', 'Add a row')}</div></section>`,
        el => { if (/^schedule\.rows\.\d+\.type$/.test(el.dataset.k)) el.closest('.fx-srow').dataset.type = el.value; });
      const persistTerm = () => { if (!sc.start && term && term[0]) sc.start = term[0]; if (!sc.end && term && term[1]) sc.end = term[1]; };
      const box = $('#fx-topics', pane); const tBtn = $('[data-action="topics"]', pane);
      bind(pane, {
        gen: () => { persistTerm(); if (!sc.start || !sc.end || sc.end < sc.start) { toast('Set the first and last day of classes first.'); return; }
          const have = new Set(rows.map(r => r.date)); let added = 0;
          for (let d = sc.start; d <= sc.end; d = plus(d, 1)) { const wd = D0(d).getUTCDay(); if (!days.includes(wd) || have.has(d)) continue; rows.push(NO_CLASS[d] ? { date: d, type: 'holiday', title: NO_CLASS[d], notes: '' } : { date: d, type: 'lecture', title: '', notes: '' }); added++; }
          rows.sort((a, b) => a.date.localeCompare(b.date)); changed(); PAGE.schedule(pane); toast(added ? `Added ${added} meeting${added === 1 ? '' : 's'}. Now add the topics.` : 'Every meeting is already on the schedule.'); },
        topics: () => { const open = box.hidden; box.hidden = !open; tBtn.setAttribute('aria-expanded', String(open)); if (open) $('#tp-list', box).focus(); else tBtn.focus(); },
        fill: () => { const lines = $('#tp-list', box).value.split('\n').map(x => x.trim()).filter(Boolean); let k = 0; rows.forEach(r => { if (k < lines.length && ['lecture', 'lab', 'review'].includes(r.type) && !r.title) r.title = lines[k++].slice(0, 140); }); changed(); PAGE.schedule(pane); toast(`Filled ${k} topic${k === 1 ? '' : 's'}${lines.length > k ? `; ${lines.length - k} left over (add more meetings)` : ''}.`); },
        clear: () => { if (!confirm('Remove every row from the schedule? Exams stay.')) return; sc.rows = []; changed(); PAGE.schedule(pane); }
      });
    },
    exams(pane) {
      const E = S.syl.exams;
      sylPage(pane, 'exams', 'Each dated exam gets a countdown and an exam prep page for your students.', `
        <section class="fx-sec"><div class="fx-list" data-list="exams">${E.map((e, i) => `<div class="fx-item" data-item><div class="fx-grid g3">${F('Name', I(`exams.${i}.name`, 'Midterm 1'))}${F('Date', I(`exams.${i}.date`, '', '', 'date'))}${F('Time', I(`exams.${i}.time`, '', '', 'time'))}${F('Room', I(`exams.${i}.place`, 'Wilson 1-112'))}${F('What it covers', I(`exams.${i}.covers`, 'Limits and the derivative'), '', 'span2')}</div>${DEL('exams', i, (e.name || 'this exam'))}</div>`).join('') || EMPTY('No exams yet.')}${ADD('exams', 'Add an exam')}</div></section>`);
    },
    grading(pane) {
      const g = S.syl.grading; const sum = () => g.categories.filter(x => x.name).reduce((a, x) => a + (Number(x.weight) || 0), 0);
      const SCALES = { pm: [['A', 93], ['A-', 90], ['B+', 87], ['B', 83], ['B-', 80], ['C+', 77], ['C', 73], ['C-', 70], ['D+', 67], ['D', 63], ['D-', 60], ['F', 0]], plain: [['A', 90], ['B', 80], ['C', 70], ['D', 60], ['F', 0]] };
      sylPage(pane, 'grading', 'What the course grade is made of. Students get a grade calculator with exactly these weights.', `
        <section class="fx-sec"><h2 class="fx-h2">Categories <span class="fx-tag" id="tc-sum"></span></h2>
          <div class="fx-list" data-list="grading.categories">${g.categories.length ? '<div class="fx-cols fx-cat" aria-hidden="true"><span>Category</span><span>Weight</span><span>Note</span></div>' : ''}${g.categories.map((x, i) => `<div class="fx-row fx-cat" data-item>${I(`grading.categories.${i}.name`, 'Homework', 'aria-label="Category"')}<span class="fx-pct"><input class="fx-input num" type="number" min="0" max="100" step="0.5" ${val(`grading.categories.${i}.weight`, 'data-num')} value="${esc(String(x.weight))}" aria-label="Weight in percent"><span aria-hidden="true">%</span></span>${I(`grading.categories.${i}.note`, i ? 'Optional note' : 'Lowest two dropped', 'aria-label="Note"')}${DEL('grading.categories', i, (x.name || 'this category'))}</div>`).join('') || EMPTY('No categories yet.')}${ADD('grading.categories', 'Add a category')}</div></section>
        <section class="fx-sec"><h2 class="fx-h2">Letter grades</h2><div class="fx-actions tight"><span class="fx-help">Start from</span><button type="button" class="fx-btn sm" data-action="scale" data-s="pm">A to F with + and −</button><button type="button" class="fx-btn sm" data-action="scale" data-s="plain">A, B, C, D, F</button></div>
          <div class="fx-list" data-list="grading.scale">${g.scale.map((x, i) => `<div class="fx-row fx-letter" data-item>${I(`grading.scale.${i}.letter`, 'A', 'aria-label="Letter"', 'text', 'mono')}<span class="fx-help">at least</span><span class="fx-pct"><input class="fx-input num" type="number" min="0" max="100" step="0.5" ${val(`grading.scale.${i}.min`, 'data-num')} value="${esc(String(x.min))}" aria-label="Minimum percent for ${esc(x.letter || 'this letter')}"><span aria-hidden="true">%</span></span>${DEL('grading.scale', i, `letter ${x.letter || ''}`.trim())}</div>`).join('') || EMPTY('No letter grades yet.')}${ADD('grading.scale', 'Add a letter')}</div></section>
        <section class="fx-sec">${F('Grading notes', TA('grading.notes', 3, 'Rounding, curves, how the final can replace a midterm…'))}</section>`, () => paintSum());
      const paintSum = () => { const t = sum(); const el = $('#tc-sum', pane); if (!el) return; el.textContent = `Total ${pct(t)}%`; el.className = 'fx-tag ' + (Math.abs(t - 100) < 0.01 ? 'live' : 'bad'); };
      paintSum();
      bind(pane, { scale: b => { g.scale = SCALES[b.dataset.s].map(([letter, min]) => ({ letter, min })); changed(); PAGE.grading(pane); } });
    },
    policies(pane) {
      const s = S.syl; const P = s.policies.other;
      const aiOpts = [['none', 'Not allowed'], ['disclose', 'Allowed with disclosure'], ['open', 'Allowed'], ['custom', 'My own wording']];
      const tpl = k => S.starter[k] && s.policies[k] === S.starter[k] ? ' <span class="fx-tag">MSU template</span>' : '';
      sylPage(pane, 'policies', 'How the course runs, and the statements students need. Montana State’s accommodations, integrity and wellbeing statements are filled in; edit them to fit your course.', `
        <section class="fx-sec"><h2 class="fx-h2">AI tools</h2><div class="fx-field"><label class="fx-label" for="tc-ai">Generative AI in this course</label>${SEL('policies.ai', aiOpts, 'id="tc-ai"')}</div><div class="fx-field">${TA('policies.aiText', 4, '', 'id="tc-ai-text" aria-label="AI policy wording"')}<span class="fx-help">Picking an option replaces this text with a starting point you can edit.</span></div></section>
        <section class="fx-sec"><h2 class="fx-h2">Course policies</h2>${[['attendance', 'Attendance', 'What you expect, and how absences are handled.'], ['late', 'Late work', 'Deadlines, extensions, penalties.'], ['communication', 'Communication', 'How to reach you and how fast you reply.']].map(([k, l, ph]) => F(l, TA('policies.' + k, 3, ph))).join('')}</section>
        <section class="fx-sec"><h2 class="fx-h2">Statements</h2>${[['integrity', 'Academic integrity'], ['accommodations', 'Accommodations'], ['wellbeing', 'Wellbeing and support']].map(([k, l]) => F(l + tpl(k), TA('policies.' + k, 4))).join('')}</section>
        <section class="fx-sec"><h2 class="fx-h2">Other policies</h2><p class="fx-help">Calculators, regrades, recordings, lab safety…</p><div class="fx-list" data-list="policies.other">${P.map((x, i) => `<div class="fx-item" data-item><div class="fx-grid g1">${F('Title', I(`policies.other.${i}.title`, 'Calculators'))}${F('Text', TA(`policies.other.${i}.text`, 3))}</div>${DEL('policies.other', i, (x.title || 'this policy'))}</div>`).join('')}${ADD('policies.other', 'Add a policy')}</div></section>`,
        el => { if (el.dataset.k === 'policies.ai' && S.ai[el.value]) { S.syl.policies.aiText = S.ai[el.value]; $('#tc-ai-text', pane).value = S.ai[el.value]; changed(); schedulePaper(); } });
    },

    /* ---------- the class tools (need confirmed faculty status) ---------- */
    async students(pane) {
      if (!tool(pane, 'students', 'Who joined, how students join, and the teaching team.')) return;
      const c = S.cls; let r; try { r = await api('teach_roster&id=' + S.id); } catch (e) { return fail(pane, e); }
      const studs = r.members.filter(m => m.role === 'student'); const tas = r.members.filter(m => m.role === 'ta');
      body(pane, `<div class="fx-grid g2 fx-gap">
        <section class="fx-panel"><h2 class="fx-h2">How students join</h2><div class="fx-code big mono" aria-label="Class code">${esc(c.join_code)}</div>
          <p>Students open <b>mathub.space</b>, choose <b>Join a class</b> and type this code, or use the link.</p>
          <div class="fx-actions"><button type="button" class="fx-btn sm primary" data-action="copy-link">${icon('copy', 14)} Copy join link</button><button type="button" class="fx-btn sm quiet" data-action="new-code">${icon('rotate', 14)} New code</button></div>
          <p class="fx-help">${c.status === 'published' ? 'Students who join get the class on their start page right away.' : 'Students can join now; the class appears for them once you publish.'} A new code stops the old one from working; nobody is removed.</p></section>
        <section class="fx-panel"><h2 class="fx-h2">Teaching team</h2><ul class="fx-team"><li><b>${esc(S.owner)}</b> <span class="fx-tag">owner</span></li>${tas.map(t => `<li><span><b>${esc(t.name)}</b> · ${esc(t.email)}</span><button type="button" class="fx-btn sm quiet" data-action="rm" data-u="${t.id}" data-n="${esc(t.name)}">Remove</button></li>`).join('')}</ul>
          ${c.access === 'owner' || c.access === 'admin' ? `<form class="fx-inline-form" id="tc-ta"><label class="sr-only" for="tc-ta-email">Email of a co-instructor or TA</label><input class="fx-input" type="email" id="tc-ta-email" placeholder="ta.name@montana.edu" required><button class="fx-btn sm" type="submit">${icon('plus', 14)} Add</button></form><p class="fx-help">Co-instructors and TAs can edit the syllabus, post, assign and see results. They need a Mathub account.</p>` : ''}</section></div>
        <section class="fx-sec"><h2 class="fx-h2">Students <span class="fx-count">${studs.length}</span>${studs.length ? `<button type="button" class="fx-btn sm fx-h-act" data-action="csv">${icon('download', 14)} Download CSV</button>` : ''}</h2>
          ${studs.length ? `<div class="fx-table-wrap"><table class="fx-table"><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Joined</th><th scope="col" class="num">Assignments</th><th scope="col" class="num">Average</th><th scope="col" class="num">Check-ins</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead><tbody>${studs.map(m => `<tr><td>${esc(m.name)}</td><td class="fx-email">${esc(m.email)}</td><td>${esc(new Date(m.joined * 1000).toLocaleDateString())}</td><td class="num">${m.done}/${r.assignments}</td><td class="num">${m.avg == null ? '–' : m.avg + '%'}</td><td class="num">${m.checkins}/${r.sessions}</td><td class="act"><button type="button" class="fx-btn sm quiet" data-action="rm" data-u="${m.id}" data-n="${esc(m.name)}">Remove</button></td></tr>`).join('')}</tbody></table></div>` : `<p class="fx-list-empty">Nobody has joined yet. Share the code in class or on Canvas.</p>`}
          <p class="fx-help">You see each student’s name, email, assignment results and check-ins for this class only. The rest of their Mathub activity stays private. Official grades stay in Canvas.</p></section>`);
      bind(pane, {
        'copy-link': () => copy(joinLink(c.join_code), 'Join link copied.'),
        'new-code': async () => { if (!confirm('Make a new class code? The old code stops working.')) return; try { const x = await api('teach_class_code', { id: S.id }); S.cls.join_code = x.join_code; PAGE.students(pane); } catch (e) { toast(e.message); } },
        rm: async b => { if (!confirm(`Remove ${b.dataset.n} from the class? Their results for this class are kept until you delete the class.`)) return; try { await api('teach_member_remove', { id: S.id, user_id: Number(b.dataset.u) }); PAGE.students(pane); } catch (err) { toast(err.message); } },
        csv: () => { const q = v => { let t = String(v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };   /* a leading = + - @ would run as a spreadsheet formula */ const lines = [['Name', 'Email', 'Joined', 'Assignments done', 'Average %', 'Check-ins'].map(q).join(',')].concat(studs.map(m => [m.name, m.email, new Date(m.joined * 1000).toISOString().slice(0, 10), m.done, m.avg == null ? '' : m.avg, m.checkins].map(q).join(','))); download(lines.join('\n'), `${c.code.replace(/\s+/g, '')}-roster.csv`, 'text/csv'); }
      });
      const f = $('#tc-ta', pane); if (f) f.addEventListener('submit', async e => { e.preventDefault(); try { await api('teach_staff_add', { id: S.id, email: $('#tc-ta-email', f).value }); toast('Added to the teaching team.'); PAGE.students(pane); } catch (err) { toast(err.message, 5000); } });
    },
    async announce(pane) {
      if (!tool(pane, 'announce', 'Posts on the class hub. Every student gets them in their Mathub inbox, and on their phone if they turned notifications on.')) return;
      let h; try { h = await api('teach_hub&id=' + S.id); } catch (e) { return fail(pane, e); }
      body(pane, `<div class="fx-grid g2 fx-gap"><form class="fx-panel" id="tc-post" novalidate><h2 class="fx-h2">New announcement</h2>
          <div class="fx-field"><label class="fx-label" for="ta-title">Title <span class="fx-req">required</span></label><input class="fx-input" id="ta-title" maxlength="120" placeholder="Office hours moved this week" required></div>
          <div class="fx-field"><label class="fx-label" for="ta-body">Message</label><textarea class="fx-input" id="ta-body" rows="6" maxlength="4000" placeholder="Details, links…"></textarea></div>
          <label class="fx-check"><input type="checkbox" id="ta-pin"><span>Pin to the top of the class hub</span></label>
          <div class="fx-actions"><button class="fx-btn primary" type="submit">${icon('send', 14)} Post</button><span class="fx-msg" id="ta-st" role="status"></span></div></form>
        <section class="fx-panel"><h2 class="fx-h2">Posted</h2>${h.posts.length ? h.posts.map(p => `<article class="fx-post"><div class="fx-post-h"><h3>${p.pinned ? `${icon('pin', 13)} ` : ''}${esc(p.title)}</h3><button type="button" class="fx-btn sm quiet" data-action="del-post" data-id="${p.id}">Delete</button></div><p class="fx-meta">${esc(p.author)} · ${esc(ago(p.created))}</p>${p.body ? `<div class="fx-post-body">${paras(p.body)}</div>` : ''}</article>`).join('') : '<p class="fx-list-empty">Nothing posted yet.</p>'}</section></div>`);
      $('#tc-post', pane).addEventListener('submit', async e => { e.preventDefault(); const st = $('#ta-st', pane); st.textContent = 'Posting…';
        try { const r = await api('teach_post', { id: S.id, title: $('#ta-title', pane).value, body: $('#ta-body', pane).value, pinned: $('#ta-pin', pane).checked }); toast(r.told ? `Posted and sent to ${r.told} student${r.told === 1 ? '' : 's'}.` : 'Posted.'); PAGE.announce(pane); } catch (err) { st.textContent = err.message; } });
      bind(pane, { 'del-post': async b => { if (!confirm('Delete this announcement?')) return; try { await api('teach_post_delete', { post_id: Number(b.dataset.id) }); PAGE.announce(pane); } catch (err) { toast(err.message); } } });
    },
    async assign(pane) {
      if (!tool(pane, 'assign', 'Practice for learning, not the grade book: each student gets their own version of the questions, can retake it, and you see their best score. Official grades stay in Canvas.')) return;
      let h; try { h = await api('teach_hub&id=' + S.id); } catch (e) { return fail(pane, e); }
      const courses = quizCourses(); const def = courses.includes(S.cls.link_course) ? S.cls.link_course : courses[0];
      body(pane, `<div class="fx-split tools"><div class="fx-form">
        <section class="fx-sec flush"><h2 class="fx-h2">Assignments <span class="fx-count">${h.class.students} student${h.class.students === 1 ? '' : 's'}</span></h2>
          ${h.assignments.length ? `<ul class="fx-asgs">${h.assignments.map(a => `<li class="fx-asg"><div class="fx-asg-h"><div><h3>${esc(a.title)}</h3><p class="fx-meta">${a.count} questions · ${esc((global.Courses[a.course] || {}).short || a.course)} · ${esc(dueText(a.due))}${a.minutes ? ` · ${a.minutes} min` : ''}</p></div><div class="fx-actions tight"><span class="fx-tag${h.class.students && a.submitted >= h.class.students ? ' live' : ''}">${a.submitted}/${h.class.students} done</span><button type="button" class="fx-btn sm" data-action="res" data-id="${a.id}" aria-expanded="false" aria-controls="tc-res-${a.id}">Results</button><button type="button" class="fx-btn sm quiet" data-action="del" data-id="${a.id}">Delete</button></div></div><div class="fx-res" id="tc-res-${a.id}" hidden></div></li>`).join('')}</ul>` : '<p class="fx-list-empty">No assignments yet. Make one with the form.</p>'}</section>
      </div><div class="fx-side"><form class="fx-panel" id="tc-asg" novalidate><h2 class="fx-h2">New assignment</h2>
        <div class="fx-field"><label class="fx-label" for="as-title">Title</label><input class="fx-input" id="as-title" maxlength="120" placeholder="Limits practice" required></div>
        <div class="fx-field"><label class="fx-label" for="as-course">Questions from</label><select class="fx-input fx-select" id="as-course">${courses.map(id => `<option value="${id}"${id === def ? ' selected' : ''}>${esc(global.Courses[id].code || global.Courses[id].short)} ${esc(global.Courses[id].name || '')}</option>`).join('')}</select></div>
        <div class="fx-field" role="group" aria-labelledby="as-topics-l"><span class="fx-label" id="as-topics-l">Topics</span><div class="fx-topics" id="as-topics"><span class="fx-help">Loading topics…</span></div></div>
        <div class="fx-grid g2"><div class="fx-field"><label class="fx-label" for="as-count">Questions</label><input class="fx-input num" id="as-count" type="number" min="3" max="40" value="10"></div><div class="fx-field"><label class="fx-label" for="as-min">Time limit (min)</label><input class="fx-input num" id="as-min" type="number" min="0" max="240" value="0"><span class="fx-help">0 = suggested time only</span></div></div>
        <div class="fx-field"><label class="fx-label" for="as-due">Due (Montana time)</label><input class="fx-input" id="as-due" type="datetime-local"></div>
        <div class="fx-field"><label class="fx-label" for="as-note">Note to students</label><input class="fx-input" id="as-note" maxlength="500" placeholder="Optional"></div>
        <div class="fx-actions"><button class="fx-btn primary" type="submit">${icon('send', 14)} Assign</button><span class="fx-msg" id="as-st" role="status"></span></div></form></div></div>`);
      const sel = $('#as-course', pane); const box = $('#as-topics', pane);
      const paintTopics = async () => { box.innerHTML = '<span class="fx-help">Loading topics…</span>'; const T = await topicsOf(sel.value); box.innerHTML = T.length ? T.map(t => `<label class="fx-check"><input type="checkbox" value="${esc(t.id)}"><span>${esc(t.label)} <span class="fx-meta">unit ${t.unit}</span></span></label>`).join('') : '<span class="fx-help">This class has no question bank.</span>'; };
      if (sel.value) paintTopics(); sel.addEventListener('change', paintTopics);
      $('#tc-asg', pane).addEventListener('submit', async e => { e.preventDefault(); const st = $('#as-st', pane); const topics = $$('input:checked', box).map(x => x.value); if (!topics.length) { st.textContent = 'Pick at least one topic.'; return; } st.textContent = 'Assigning…';
        try { const r = await api('teach_assignment_save', { id: S.id, title: $('#as-title', pane).value, course: sel.value, topics, count: Number($('#as-count', pane).value), minutes: Number($('#as-min', pane).value), due: $('#as-due', pane).value, note: $('#as-note', pane).value }); toast(r.told ? `Assigned; ${r.told} student${r.told === 1 ? '' : 's'} told.` : 'Assigned.'); PAGE.assign(pane); } catch (err) { st.textContent = err.message; } });
      bind(pane, {
        del: async b => { if (!confirm('Delete this assignment and its results?')) return; try { await api('teach_assignment_delete', { id: S.id, assignment_id: Number(b.dataset.id) }); PAGE.assign(pane); } catch (err) { toast(err.message); } },
        res: async b => { const el = $('#tc-res-' + b.dataset.id, pane); const open = el.hidden; el.hidden = !open; b.setAttribute('aria-expanded', String(open)); if (!open) return; el.innerHTML = '<p class="fx-help">Loading…</p>';
          try { const r = await api('teach_results&assignment_id=' + b.dataset.id); const C = global.Courses[r.assignment.course]; const lab = t => (C && ((C.quiz && C.quiz.TOPICS[t]) || (C.quizTopics || {})[t]) || {}).label || t;
            el.innerHTML = `${r.topics.length ? `<div class="fx-bars">${r.topics.map(t => bar(lab(t.topic), t.pct, `${t.pct}%`, true)).join('')}</div>` : ''}
              <div class="fx-table-wrap"><table class="fx-table"><thead><tr><th scope="col">Student</th><th scope="col" class="num">Best</th><th scope="col" class="num">Tries</th><th scope="col" class="num">Minutes</th><th scope="col">When</th></tr></thead><tbody>${r.students.map(s => `<tr><td>${esc(s.name)}</td><td class="num">${s.done ? `${s.best}/${s.total}` : '–'}</td><td class="num">${s.attempts || ''}</td><td class="num">${s.minutes == null ? '' : s.minutes}</td><td>${s.done ? esc(new Date(s.updated * 1000).toLocaleString()) + (s.late ? ' <span class="fx-tag warn">late</span>' : '') : '<span class="fx-meta">not yet</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="fx-meta">No students yet.</td></tr>'}</tbody></table></div>`; }
          catch (err) { el.innerHTML = `<p class="fx-error">${esc(err.message)}</p>`; } }
      });
    },
    async attendance(pane) {
      clearInterval(attTimer);
      if (!tool(pane, 'attendance', 'Open a 4-digit code for a few minutes; students in the room type it on the class hub.')) return;
      let r; try { r = await api('teach_insights&id=' + S.id); } catch (e) { return fail(pane, e); }
      const open = r.open && r.open.closes * 1000 > Date.now() ? r.open : null;
      body(pane, `<div class="fx-grid g2 fx-gap"><section class="fx-panel fx-att"><h2 class="fx-h2">${open ? esc(open.label) : 'Take attendance'}</h2>
          ${open ? `<p>Show this on the screen. Students open the class on Mathub and type it.</p><div class="fx-code huge mono" aria-live="polite">${esc(open.code)}</div><p class="fx-att-meta"><b id="tc-att-left"></b> left · <span id="tc-att-n">${(r.attendance.find(x => x.id === open.id) || { n: 0 }).n}</span> of ${r.students} checked in</p><div class="fx-actions"><button type="button" class="fx-btn primary" data-action="project">${icon('zoomin', 14)} Show on the projector</button><button type="button" class="fx-btn" data-action="close" data-id="${open.id}">${icon('lock', 14)} Close check-in</button></div>`
          : `<div class="fx-grid g2"><div class="fx-field"><label class="fx-label" for="at-label">Label</label><input class="fx-input" id="at-label" maxlength="60" placeholder="Optional, e.g. Week 6 Monday"></div><div class="fx-field"><label class="fx-label" for="at-min">Open for</label><select class="fx-input fx-select" id="at-min"><option value="3">3 minutes</option><option value="5" selected>5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option></select></div></div><div class="fx-actions"><button type="button" class="fx-btn primary" data-action="open">${icon('play', 14)} Open check-in</button></div>`}</section>
        <section class="fx-panel"><h2 class="fx-h2">Past sessions</h2>${r.attendance.length ? `<div class="fx-table-wrap"><table class="fx-table"><thead><tr><th scope="col">Session</th><th scope="col">When</th><th scope="col" class="num">Checked in</th></tr></thead><tbody>${r.attendance.map(a => `<tr><td>${esc(a.label)}</td><td>${esc(new Date(a.opens * 1000).toLocaleString())}</td><td class="num">${a.n}/${r.students}</td></tr>`).join('')}</tbody></table></div>` : '<p class="fx-list-empty">No sessions yet.</p>'}<p class="fx-help">Each student’s check-ins are on the Students page.</p></section></div>`);
      bind(pane, {
        open: async () => { try { await api('teach_att_open', { id: S.id, minutes: Number($('#at-min', pane).value), label: $('#at-label', pane).value }); PAGE.attendance(pane); } catch (e) { toast(e.message); } },
        close: async b => { try { await api('teach_att_close', { id: S.id, session_id: Number(b.dataset.id) }); PAGE.attendance(pane); } catch (err) { toast(err.message); } },
        project: () => projector(open)
      });
      if (open) { const tick = async () => { const left = Math.max(0, Math.round(open.closes - Date.now() / 1000)); const el = $('#tc-att-left', pane); if (!el || !pane.isConnected) { clearInterval(attTimer); return; } el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; if (left <= 0) { clearInterval(attTimer); PAGE.attendance(pane); return; } if (left % 5 === 0) { try { const x = await api('teach_insights&id=' + S.id); const n = (x.attendance.find(a => a.id === open.id) || { n: 0 }).n; const ne = $('#tc-att-n', pane); if (ne) ne.textContent = n; } catch (e) {} } }; tick(); attTimer = setInterval(tick, 1000); }
    },
    async insights(pane) {
      if (!tool(pane, 'insights', 'How the class is doing, from its own assignments and check-ins.')) return;
      let r; try { r = await api('teach_insights&id=' + S.id); } catch (e) { return fail(pane, e); }
      const done = r.assignments.reduce((a, x) => a + x.done, 0), possible = r.assignments.length * r.students; const avgs = r.assignments.filter(x => x.avg != null);
      const stat = (n, l) => `<div class="fx-stat"><dt>${l}</dt><dd>${n}</dd></div>`;
      const lab = t => { for (const id of quizCourses()) { const C = global.Courses[id]; const T = (C.quiz && C.quiz.TOPICS) || C.quizTopics || {}; if (T[t]) return T[t].label; } return t; };
      body(pane, `<dl class="fx-stats">${stat(r.students, 'Students')}${stat(r.joined_week, 'Joined this week')}${stat(possible ? Math.round(100 * done / possible) + '%' : '–', 'Assignments completed')}${stat(avgs.length ? Math.round(avgs.reduce((a, x) => a + x.avg, 0) / avgs.length) + '%' : '–', 'Average best score')}${stat(r.attendance.length ? Math.round(100 * r.attendance.reduce((a, x) => a + x.n, 0) / Math.max(1, r.attendance.length * r.students)) + '%' : '–', 'Attendance')}</dl>
        <div class="fx-grid g2 fx-gap"><section class="fx-panel"><h2 class="fx-h2">Assignments</h2>${r.assignments.length ? `<div class="fx-bars">${r.assignments.map(a => bar(a.title, r.students ? Math.round(100 * a.done / r.students) : 0, `${a.done}/${r.students}${a.avg != null ? ` · ${a.avg}%` : ''}${a.late ? ` · ${a.late} late` : ''}`)).join('')}</div>` : '<p class="fx-list-empty">No assignments yet.</p>'}</section>
        <section class="fx-panel"><h2 class="fx-h2">Where the class struggles</h2>${r.topics.length ? `<div class="fx-bars">${r.topics.map(t => bar(lab(t.topic), t.pct, `${t.pct}% · ${t.answered}`, true)).join('')}</div><p class="fx-help">Percent correct across every student’s latest attempt, for topics with 5 or more answers. Worth a few minutes in class when a topic sits below 60%.</p>` : '<p class="fx-list-empty">Shows up once students finish assignments.</p>'}</section></div>`);
    },
    settings(pane) {
      const c = S.cls; const owner = c.access === 'owner' || c.access === 'admin'; const qc = quizCourses();
      pane.innerHTML = `<div class="fx-narrow"><header class="fx-head"><h1 class="fx-h1">Class settings</h1><p class="fx-lede">${esc(c.code)} · ${esc(c.title)}</p></header>
        <section class="fx-sec"><h2 class="fx-h2">Practice questions</h2><div class="fx-field"><label class="fx-label" for="st-link">Assignments draw questions from</label><select class="fx-input fx-select" id="st-link"><option value="">None</option>${qc.map(id => `<option value="${id}"${id === c.link_course ? ' selected' : ''}>${esc(global.Courses[id].code || global.Courses[id].short)} ${esc(global.Courses[id].name || '')}</option>`).join('')}</select><span class="fx-help">The default on the Assignments page. Each assignment can still pick its own.</span></div></section>
        ${c.status === 'published' ? `<section class="fx-sec"><h2 class="fx-h2">Take the class down</h2><p>Unpublishing hides the class from students until you publish again. Their results, announcements and check-ins are kept.</p><button type="button" class="fx-btn" data-action="unpub">Unpublish</button></section>` : ''}
        ${owner ? `<section class="fx-sec fx-danger"><h2 class="fx-h2">Delete this class</h2><p>Deletes the syllabus, the published class, its announcements, assignments, results and check-ins. Student accounts are not touched. This cannot be undone.</p><form class="fx-inline-form" id="st-del"><label class="sr-only" for="st-del-code">Type ${esc(c.code)} to confirm</label><input class="fx-input" id="st-del-code" placeholder="Type ${esc(c.code)} to confirm" autocomplete="off"><button class="fx-btn danger" type="submit">Delete class</button></form></section>` : ''}</div>`;
      $('#st-link', pane).addEventListener('change', e => { S.cls.link_course = e.target.value; S.unsaved = true; save().then(() => toast('Saved.')); });
      bind(pane, { unpub: async () => { if (!confirm('Unpublish this class? Students stop seeing it until you publish again.')) return; try { await api('teach_class_unpublish', { id: S.id }); S.cls.status = 'draft'; App.teachForget(); if (App.packs && App.packs.sync) App.packs.sync(); toast('Unpublished.'); App.rerender(); } catch (e) { toast(e.message); } } });
      const f = $('#st-del', pane); if (f) f.addEventListener('submit', async e => { e.preventDefault(); const v = $('#st-del-code', f).value; if (v.trim().toUpperCase() !== c.code.toUpperCase()) { toast(`Type ${c.code} to confirm.`); return; } try { await api('teach_class_delete', { id: S.id, confirm: v }); S = null; ME = null; App.teachForget(); if (App.packs && App.packs.sync) App.packs.sync(); toast('Deleted.'); location.hash = '#/teach'; } catch (err) { toast(err.message, 5000); } });
    }
  };
  const verifyNote = msg => `<div class="fx-note">${icon('shield', 15)}<div><p>${msg}</p><a class="fx-btn sm" href="#/teach/verify">Confirm faculty status</a></div></div>`;
  /** The frame of a class tool page; false (with an explanation) until the class's faculty status is confirmed. */
  function tool(pane, k, lede) {
    pane.innerHTML = `<div class="fx-wide"><header class="fx-head"><h1 class="fx-h1">${pageName(k)}</h1><p class="fx-lede">${lede}</p></header><div id="fx-tool"><p class="fx-wait">Loading…</p></div></div>`;
    if (S.cls.verified) return true;
    $('#fx-tool', pane).innerHTML = verifyNote(S.cls.access === 'owner' ? 'Class tools turn on once your faculty status is confirmed: an administrator checks that you teach at Montana State, usually within a day.' : 'Class tools turn on once the class owner’s faculty status is confirmed.');
    return false;
  }
  const body = (pane, html) => { const el = $('#fx-tool', pane); if (el) el.innerHTML = html; };
  const fail = (pane, e) => body(pane, `<p class="fx-error">${esc(e.message)}</p>`);
  const bar = (label, p, txt, graded) => `<div class="fx-bar"><span class="fx-bar-l">${esc(label)}</span><span class="fx-bar-track" role="img" aria-label="${esc(label)}: ${esc(txt)}"><i style="width:${Math.max(0, Math.min(100, p))}%"${graded ? ` class="${p < 60 ? 'low' : p < 80 ? 'mid' : 'high'}"` : ''}></i></span><span class="fx-bar-v">${esc(txt)}</span></div>`;
  async function topicsOf(id) { const C = global.Courses[id]; if (!C) return []; if (!C.quiz && App.loadCourse) { try { await App.loadCourse(id); } catch (e) {} } const T = (C.quiz && C.quiz.TOPICS) || C.quizTopics || {}; return Object.keys(T).map(k => ({ id: k, label: T[k].label || k, unit: T[k].unit || 1, sec: T[k].sec || '' })); }
  let attTimer = null;
  /** The check-in code, full screen, for the room's projector. */
  function projector(open) {
    if (!open) return; const el = document.createElement('div'); el.className = 'fx-projector'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Check-in code');
    el.innerHTML = `<p class="fx-proj-label">${esc(S.cls.code)} · ${esc(open.label)}</p><p class="fx-proj-code mono">${esc(open.code)}</p><p class="fx-proj-sub">Open the class on Mathub and type this code · <b data-left></b> left</p><button type="button" class="fx-btn" data-x>Close</button>`;
    document.body.appendChild(el); let t = null;
    const close = () => { clearInterval(t); document.removeEventListener('keydown', key); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); el.remove(); };
    const key = e => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', key);
    const tick = () => { const left = Math.max(0, Math.round(open.closes - Date.now() / 1000)); $('[data-left]', el).textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; if (left <= 0) close(); }; tick(); t = setInterval(tick, 1000);
    $('[data-x]', el).addEventListener('click', close); $('[data-x]', el).focus();
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }

  /* ============================================================
     #/class — students
     ============================================================ */
  App.views.class = {
    title: 'Your class',
    render(root, param) {
      const parts = String(param || '').split('/').filter(Boolean);
      root.innerHTML = `<div class="landing-wrap tc-wrap"><header class="landing-top"><div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>${parts[0] === 'join' ? 'Join a class' : parts[0] ? 'Class hub' : 'Your classes with an instructor'}</h1></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="${parts[0] && parts[0] !== 'join' ? '#/class' : '#/'}">${icon('left', 14)} ${parts[0] && parts[0] !== 'join' ? 'Your classes' : 'Mathub'}</a></div></header><div id="tc-body"><div class="empty">Loading…</div></div></div>`;
      const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
      const body = $('#tc-body', root);
      if (parts[0] === 'join') return joinPage(body, (parts[1] || '').toUpperCase());
      if (App.auth && !App.auth.ready) { body.innerHTML = '<div class="empty">Checking your account…</div>'; return; }
      if (signedOut()) { body.innerHTML = App.lockCard('Sign in to see your classes', 'Your instructor gave you a class code. Sign in with your montana.edu email to join.') + joinBox(); if (App.auth) App.auth.bindLocks(body); wireJoinBox(body); return; }
      if (parts[0]) hub(body, parseInt(parts[0], 10)); else myClasses(body);
    }
  };
  const joinBox = () => `<form class="panel tc-joinbox" id="tc-joinbox" novalidate><div class="panel-title mb-1">${icon('users')} Join with a class code</div><div class="row gap-sm"><input class="input mono tc-codein" id="tj-code" maxlength="8" placeholder="ABC234" autocomplete="off" autocapitalize="characters" aria-label="Class code"><button class="btn primary" type="submit">Continue</button></div><p class="help mt-1">Six letters and numbers, from your instructor.</p></form>`;
  const wireJoinBox = body => { const f = $('#tc-joinbox', body); if (f) f.addEventListener('submit', e => { e.preventDefault(); const v = $('#tj-code', f).value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (v.length === 6) location.hash = '#/class/join/' + v; else toast('Class codes have 6 letters and numbers.'); }); };
  async function myClasses(body) {
    let me; try { me = await api('teach_me'); } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const card = c => `<a class="tc-card" href="#/class/${c.id}"><div class="row between"><span class="tc-card-code">${esc(c.code)}${c.section ? ` · ${esc(c.section)}` : ''}</span>${c.status === 'published' ? '' : '<span class="chip xs warn">syllabus coming</span>'}</div><b class="tc-card-title">${esc(c.title)}</b><span class="small muted">${esc(c.instructor)} · ${esc(c.term)}</span></a>`;
    body.innerHTML = `${me.enrolled.length ? `<div class="tc-grid">${me.enrolled.map(card).join('')}</div>` : '<div class="empty">You have not joined a class yet.</div>'}<div class="mt-2">${joinBox()}</div>${me.teaching.length ? `<p class="small muted mt-2">Teaching? Your classes are in <a href="#/teach">Mathub Faculty</a>.</p>` : ''}`;
    wireJoinBox(body);
  }
  async function joinPage(body, code) {
    if (!/^[A-Z0-9]{6}$/.test(code)) { body.innerHTML = joinBox(); wireJoinBox(body); return; }
    let r; try { r = await api('teach_join_info&code=' + code); } catch (e) { body.innerHTML = `<div class="callout">${esc(e.message)}</div>${joinBox()}`; wireJoinBox(body); return; }
    const c = r.class; const already = c.access === 'student'; const teaching = ['owner', 'staff', 'admin'].includes(c.access);
    body.innerHTML = `<div class="grid cols-2 tc-joincard"><section class="panel"><p class="small muted">${esc(c.code)}${c.section ? ` · Section ${esc(c.section)}` : ''} · ${esc(c.term)}</p><h2 class="tc-h2">${esc(c.title)}</h2><p class="small">Taught by <b>${esc(c.instructor)}</b>${c.students ? ` · ${c.students} student${c.students === 1 ? '' : 's'} joined` : ''}</p>
        ${teaching ? `<a class="btn primary" href="#/teach/${c.id}">${icon('right', 14)} You teach this class</a>` : already ? `<a class="btn primary" href="#/class/${c.id}">${icon('right', 14)} Open the class</a>` : c.open === false ? '<div class="callout small">This class is not open to students yet. Check with your instructor.</div>' : signedOut() ? App.lockCard('Sign in to join', 'Use your montana.edu email. It takes a minute.', { compact: true }) : `<button class="btn primary" data-action="join">${icon('check', 14)} Join ${esc(c.code)}</button>`}
        <div class="callout small mt-2">${icon('eye', 13)} <b>What your instructor sees:</b> your name and email, your results on this class’s practice assignments, and your attendance check-ins. Nothing else you do on Mathub is shared, and you can leave the class at any time.</div></section>
      <section class="panel"><div class="panel-title mb-1">${icon('file')} Syllabus</div>${c.syllabus ? `<p class="small">${esc((c.syllabus.course || {}).description || '').slice(0, 280)}${((c.syllabus.course || {}).description || '').length > 280 ? '…' : ''}</p><a class="btn sm" href="#/syllabus/${esc(code)}">${icon('eye', 13)} Read the full syllabus</a>` : '<p class="small muted">Your instructor has not published the syllabus yet. Join now and it appears when it is ready.</p>'}</section></div>`;
    if (App.auth) App.auth.bindLocks(body);
    bind(body, { join: async () => { try { const x = await api('teach_join', { code }); if (App.packs && App.packs.sync) await App.packs.sync(); if (App.auth && App.auth.refresh) App.auth.refresh(); App.teachForget(); toast(`You joined ${c.code}.`); location.hash = '#/class/' + x.id; } catch (e) { toast(e.message, 5000); } } });
  }
  async function hub(body, id) {
    let h; try { h = await api('teach_hub&id=' + id); } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)} <a href="#/class">Your classes</a></div>`; return; }
    const c = h.class; const pid = c.pack_id;
    const live = c.status === 'published' && !!pid;   // the class list picks the class up on its own (and again when a link to it is opened)
    if (live && !global.Courses[pid] && App.packs && App.packs.sync) App.packs.sync().catch(() => {});
    const link = (v, l, ic) => live ? `<a class="tc-quick" href="#/${pid}/${v}">${icon(ic, 16)}<span>${l}</span></a>` : '';
    const now = Date.now() / 1000;
    body.innerHTML = `<div class="tc-hub-head"><p class="small muted">${esc(c.code)}${c.section ? ` · Section ${esc(c.section)}` : ''} · ${esc(c.term)}</p><h2 class="tc-h2">${esc(c.title)}</h2><p class="small muted">${esc(c.instructor)}${h.staff ? ' · you teach this class' : ''}</p></div>
      ${live ? `<nav class="tc-quicks" aria-label="Class pages">${link('course', 'Syllabus', 'file')}${link('calendar', 'Schedule', 'calendar')}${link('grades', 'Grade calculator', 'calc')}${link('exam', 'Exam prep', 'flag')}${link('forum', 'Class board', 'chat')}</nav>` : `<div class="callout small mb-2">${icon('clock', 13)} The syllabus is not published yet. Announcements and assignments still show up here.</div>`}
      ${h.attendance && !h.staff ? `<form class="panel tc-checkin" id="tc-checkin"><div class="panel-title">${icon('check')} ${h.attendance.done ? 'You checked in' : 'Check in: ' + esc(h.attendance.label)}</div>${h.attendance.done ? '<p class="small muted">See you next class.</p>' : `<div class="row gap-sm mt-1"><input class="input mono tc-codein" id="ci-code" inputmode="numeric" maxlength="4" placeholder="0000" aria-label="Code on the screen"><button class="btn primary" type="submit">Check in</button></div>`}</form>` : ''}
      <div class="grid cols-2">
        <section class="panel"><div class="panel-h"><div class="panel-title">${icon('target')} Assignments</div></div>${h.assignments.length ? h.assignments.map(a => { const m = a.mine; const late = a.due && now > a.due; return `<div class="tc-asg"><div class="row between"><div><b>${esc(a.title)}</b><div class="small muted">${a.count} questions · ${esc(dueText(a.due))}${a.minutes ? ` · ${a.minutes} min` : ''}</div>${a.note ? `<div class="small">${esc(a.note)}</div>` : ''}</div>${h.staff ? `<span class="chip xs">${a.submitted} done</span>` : `<div class="row gap-sm">${m ? `<span class="chip xs ${m.best === m.total ? 'good' : ''}">best ${m.best}/${m.total}</span>` : late ? '<span class="chip xs warn">past due</span>' : ''}<button class="btn sm${m ? '' : ' primary'}" data-action="start" data-id="${a.id}">${m ? 'Try again' : 'Start'}</button></div>`}</div></div>`; }).join('') : '<div class="empty">No assignments right now.</div>'}</section>
        <section class="panel"><div class="panel-h"><div class="panel-title">${icon('megaphone')} Announcements</div></div>${h.posts.length ? h.posts.map(p => `<div class="tc-post"><b>${p.pinned ? icon('pin', 12) + ' ' : ''}${esc(p.title)}</b><div class="small muted">${esc(p.author)} · ${esc(ago(p.created))}</div>${p.body ? `<div class="small tc-post-body">${paras(p.body)}</div>` : ''}</div>`).join('') : '<div class="empty">Nothing yet.</div>'}</section></div>
      ${h.staff ? `<p class="small mt-2"><a href="#/teach/${c.id}">${icon('gear', 13)} Manage this class in Mathub Faculty</a></p>` : `<p class="small muted mt-2">Your instructor sees your results on these assignments and your check-ins, nothing else. <button class="linkbtn small" data-action="leave">Leave this class</button></p>`}`;
    const f = $('#tc-checkin', body); if (f && $('#ci-code', f)) f.addEventListener('submit', async e => { e.preventDefault(); try { await api('teach_checkin', { id, code: $('#ci-code', f).value }); toast('Checked in.'); hub(body, id); } catch (err) { toast(err.message, 4000); } });
    bind(body, {
      start: b => startAssignment(h.assignments.find(a => a.id === Number(b.dataset.id)), c, () => hub(body, id)),
      leave: async () => { if (!confirm(`Leave ${c.code}? You can join again with the code.`)) return; try { await api('teach_leave', { id }); App.teachForget(); location.hash = '#/class'; } catch (err) { toast(err.message); } }
    });
  }
  const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  /** Runs an assignment in the source class's quizzer. Each student gets their own version; a retake gets a new one. */
  async function startAssignment(a, cls) {
    const C = a && global.Courses[a.course]; if (!C) { toast('The class these questions come from is not available.'); return; }
    try { if (App.loadCourse) await App.loadCourse(a.course); } catch (e) { toast(e.message, 4000); return; }
    const go = () => {
      const QZ = C.quiz; if (!QZ) { toast('That class has no question bank.'); return; }
      const topics = a.topics.filter(t => QZ.TOPICS[t]); const seed = (a.seed ^ hashStr(String(user().id) + ':' + ((a.mine && a.mine.attempts) || 0))) >>> 0;
      const qs = App.seededSet(topics.length ? topics : Object.keys(QZ.TOPICS), a.count, seed); if (!qs.length) { toast('Could not build the questions.'); return; }
      App.runTimedSet({ questions: qs, minutes: a.minutes || Math.max(10, a.count * 3), title: `${cls.code}: ${a.title}`, onSubmit: async (correct, total, seconds, per) => {
        const tp = {}; (per || []).forEach(x => { tp[x.topic] = tp[x.topic] || [0, 0]; tp[x.topic][1]++; if (x.ok) tp[x.topic][0]++; });
        try { const r = await api('teach_submit', { assignment_id: a.id, score: correct, seconds, topics: tp }); toast(`Sent to ${cls.instructor}: ${correct}/${total}${r.late ? ' (after the due date)' : ''}.`, 5000); } catch (e) { toast('Your score was not sent: ' + e.message, 6000); } } });
    };
    let fired = false; if (App.D && App.D.id === a.course) { fired = true; go(); }
    else { App.onCourse(D => { if (fired || !D || D.id !== a.course) return; fired = true; setTimeout(go, 60); }); location.hash = `#/${a.course}/practice`; }
  }

  /* ---------- #/syllabus/<CODE>: the published syllabus for anyone with the code ---------- */
  App.views.syllabus = {
    title: 'Syllabus',
    async render(root, param) {
      const code = String(param || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      root.innerHTML = `<div class="landing-wrap tc-wrap sy-wrap tex2jax_ignore mathjax_ignore"><header class="landing-top no-print"><div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Syllabus</h1></div><div class="row gap-sm"><button class="btn" data-action="print">${icon('print', 14)} Print / PDF</button><a class="btn primary" href="#/class/join/${esc(code)}">${icon('users', 14)} Join this class</a></div></header><div id="sy-body"><div class="empty">Loading…</div></div></div>`;
      const b = $('#sy-body', root); let r;
      try { r = await api('teach_join_info&code=' + code); } catch (e) { b.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
      if (!r.class.syllabus) { b.innerHTML = '<div class="empty">The instructor has not published this syllabus yet.</div>'; return; }
      b.innerHTML = `<div class="sy-sheet">${docHtml(r.class.syllabus, r.class)}</div>`; document.title = `${r.class.code} ${r.class.title} · Syllabus · Mathub`;
      bind(root, { print: () => printDoc(docHtml(r.class.syllabus, r.class), `${r.class.code} ${r.class.title} syllabus`) });
    }
  };

  /* ---------- links from the rest of the site ---------- */
  App.teachLinks = () => `<a class="rq-link" href="#/class">${icon('users', 13)} Have a class code? Join your class</a>`;
  /* A class built in #/teach: on its dashboard, students get a strip to the class hub (announcements, assignments, check-in),
     and its teaching team, who open it as a preview, get a strip back to Mathub Faculty.
     Which classes those are comes from teach_me (the classes this person joined or teaches), cached for a few minutes. */
  const hubs = { map: null, at: 0, loading: null };
  const hubMap = () => { if (hubs.map && Date.now() - hubs.at < 300000) return Promise.resolve(hubs.map); if (!hubs.loading) hubs.loading = api('teach_me').then(me => { const m = {}; me.teaching.concat(me.enrolled).forEach(c => { if (c.pack_id) m[c.pack_id] = c.id; }); hubs.map = m; hubs.at = Date.now(); return m; }).catch(() => ({})).finally(() => { hubs.loading = null; }); return hubs.loading; };
  App.teachForget = () => { hubs.map = null; };
  App.onRender = App.onRender || [];
  App.onRender.push((root, r) => {
    if (!r.course || r.view !== 'dashboard' || signedOut()) return; const C = global.Courses[r.course]; if (!C || !C.pack) return;
    hubMap().then(m => { const cid = m[r.course]; if (!cid || !root.isConnected || $('.tc-strip', root)) return;
      const strip = document.createElement('a'); strip.className = 'tc-strip' + (C.preview ? ' preview' : ''); strip.href = C.preview ? '#/teach/' + cid : '#/class/' + cid;
      strip.innerHTML = C.preview ? `${icon('eye', 15)}<span><b>Preview</b> · ${esc(C.short || C.code || '')} as your students see it. Back to Mathub Faculty</span>${icon('right', 14)}` : `${icon('megaphone', 15)}<span><b>Class hub</b> · announcements, assignments and check-in from your instructor</span>${icon('right', 14)}`;
      root.insertAdjacentElement('afterbegin', strip); });
  });

  /* ---------- admin panel: faculty status ---------- */
  if (App.views.admin) App.views.admin.teach = async function (el) {
    el.innerHTML = '<div class="empty">Loading…</div>';
    let r; try { r = await api('admin_teach_requests'); } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const open = r.requests.filter(x => x.status === 'new'); const rest = r.requests.filter(x => x.status !== 'new');
    const reqRow = x => `<div class="tc-adm-req"><div><b>${esc(x.name)}</b>${x.title ? ` · ${esc(x.title)}` : ''} · ${esc(x.department)}<div class="small">${esc(x.email)} · teaches ${esc(x.courses)}</div>${x.message ? `<div class="small muted">${esc(x.message)}</div>` : ''}<div class="small muted">${esc(ago(x.created))}</div></div>${x.status === 'new' ? `<div class="row gap-sm"><button class="btn sm primary" data-action="ok" data-id="${x.id}">Confirm</button><button class="btn sm ghost" data-action="no" data-id="${x.id}">Decline</button></div>` : `<span class="chip xs ${x.status === 'approved' ? 'good' : 'muted'}">${esc(x.status)}</span>`}</div>`;
    el.innerHTML = `<div class="callout small mb-2">Confirm only people you can verify teach at Montana State (a faculty page, a department listing, or a reply from their montana.edu address). Anyone signed in can write syllabi in Mathub Faculty; confirmed instructors can also publish them to the students who join, post to those classes, assign practice and take attendance. Nothing site-wide.</div>
      <div class="panel"><div class="panel-h"><div class="panel-title">${icon('shield')} Waiting for confirmation <span class="chip xs">${open.length}</span></div></div>${open.length ? open.map(reqRow).join('') : '<div class="empty">No requests waiting.</div>'}</div>
      <div class="grid cols-2 mt-2"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('users')} Confirmed instructors</div></div>${r.instructors.length ? r.instructors.map(i => `<div class="row between tc-team"><span class="small"><b>${esc(i.name || i.email)}</b> · ${esc(i.email)}${i.scope === 'teach' ? '' : ' <span class="chip xs">all classes</span>'}</span><button class="btn xs ghost" data-action="revoke" data-email="${esc(i.email)}">Revoke</button></div>`).join('') : '<div class="empty">None yet.</div>'}</div>
      <div class="panel"><div class="panel-h"><div class="panel-title">${icon('book')} Classes</div></div>${r.classes.length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Class</th><th>Instructor</th><th class="num">Students</th><th>Status</th></tr></thead><tbody>${r.classes.map(c => `<tr><td><a href="#/teach/${c.id}">${esc(c.code)} ${esc(c.title)}</a><div class="small muted">${esc(c.term)}</div></td><td class="small">${esc(c.instructor)}</td><td class="num">${c.students}</td><td>${c.status === 'published' ? '<span class="chip xs good">published</span>' : '<span class="chip xs warn">draft</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No classes yet.</div>'}</div></div>
      ${rest.length ? `<div class="panel mt-2"><div class="panel-h"><div class="panel-title">${icon('list')} Earlier requests</div></div>${rest.map(reqRow).join('')}</div>` : ''}`;
    bind(el, {
      ok: async b => { try { await api('admin_teach_decide', { id: Number(b.dataset.id), decision: 'approve' }); toast('Confirmed. They can publish their classes now.'); App.views.admin.teach(el); } catch (err) { toast(err.message); } },
      no: async b => { if (!confirm('Decline this request?')) return; try { await api('admin_teach_decide', { id: Number(b.dataset.id), decision: 'decline' }); App.views.admin.teach(el); } catch (err) { toast(err.message); } },
      revoke: async b => { if (!confirm(`Remove confirmed faculty status for ${b.dataset.email}? Their syllabi stay; they can no longer publish or use class tools.`)) return; try { await api('admin_teach_decide', { decision: 'revoke', email: b.dataset.email }); App.views.admin.teach(el); } catch (err) { toast(err.message); } }
    });
  };
})(window);

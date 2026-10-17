/* ============================================================
   Mathub — the start page's pieces, shared by the iOS and Android apps (their Learn page, app-native.js)
   and the website (the start page for students who have studied here, app.js):
   - your classes as cards, each with its next exam and how much of it you have mastered
   - the class you picked: where it is, its next exam and how ready you are, and the next lesson
   - today across all your classes: daily goal, flashcards due, missed questions, what is due
   - the class's study tools, and its path with every lesson named
   - exam week: from 7 days before an exam, a short plan for each day (exam-week mode)
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; const Courses = global.Courses; if (!App) return;
  const { $, $$, esc, icon, settings, setSetting } = App;
  const local = App.packs ? App.packs.local : new Set();
  const locked = id => !!(App.classLocked && App.classLocked(id));
  const ccStyle = id => (App.classStyle ? App.classStyle(id) : '');
  const myIds = () => App.myCourses().filter(id => Courses[id] && !Courses[id].preview);
  const curClass = () => { const mine = myIds(); const s = settings().appClass; return mine.includes(s) ? s : App.D && mine.includes(App.D.id) ? App.D.id : mine[0] || null; };
  const setClass = id => { if (id) setSetting('appClass', id); };
  const examOf = C => { try { return App.nextExamOf(C); } catch (e) { return null; } };
  const daysTo = ex => ex && ex.date ? App.daysBetween(App.todayISO(), ex.date) : null;
  const inDays = d => d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;

  const safe = f => { try { return f(); } catch (e) { return null; } };
  const NODE_IC = { done: 'check', current: 'play', open: 'play', soon: 'book' };
  const TOOL_ORDER = ['notes', 'readings', 'practice', 'flashcards', 'formulas', 'exam', 'calendar', 'grades', 'playground', 'mistakes', 'planner', 'course'];
  const TOOL_NAME = { notes: 'Notes', readings: 'Readings', practice: 'Practice', flashcards: 'Flashcards', formulas: 'Formulas', exam: 'Exam prep', calendar: 'Calendar', grades: 'Grades', playground: 'Python', mistakes: 'Mistakes', planner: 'Planner', course: 'Syllabus' };
  const SIDE_X = [-44, -14, 14, 44, 14, -14];   // the path's gentle zig-zag; each lesson's name sits on the roomier side of its button
  const nodesOf = C => (C && C.kind !== 'writing' && App.pathNodes ? safe(() => App.pathNodes(C)) : null) || [];
  const whenTxt = n => n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`;
  const bar = (pct, cls = '', label = '') => `<span class="ah-bar${cls ? ' ' + cls : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"${label ? ` aria-label="${esc(label)}"` : ''}><i style="width:${pct}%"></i></span>`;

  function todayHtml() {
    const ids = myIds(); const t = App.todayISO();
    const due = ids.map(x => ({ x, n: safe(() => { const d = App.dueCards(x); return d.count + (d.estimated || 0); }) || 0 })).filter(o => o.n); const dueN = due.reduce((s, o) => s + o.n, 0);
    const mist = ids.map(x => ({ x, n: (safe(() => App.mistakesDue(x)) || []).length })).filter(o => o.n); const mistN = mist.reduce((s, o) => s + o.n, 0);
    const dls = ids.flatMap(x => (safe(() => App.upcomingDeadlinesOf(Courses[x], 8)) || []).map(d => Object.assign({ c: x, n: App.daysBetween(t, d.date) }, d))).filter(d => d.n >= 0 && d.n <= 7).sort((a, b) => a.date.localeCompare(b.date));
    const xp = App.xpToday ? App.xpToday() : 0, goal = App.dailyGoal ? App.dailyGoal() : 30; const pct = Math.min(100, Math.round(100 * xp / goal));
    const row = (href, ic, tone, title, sub, end) => `<a class="ah-item ${tone}" href="${href}"><span class="ah-ic" aria-hidden="true">${icon(ic, 19)}</span><span class="ah-item-t"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${end ? `<span class="ah-end">${end}</span>` : icon('right', 16)}</a>`;
    const rows = [];
    if (dueN) rows.push(row('#/today?review=1', 'cards', 'blue', `${dueN} flashcard${dueN === 1 ? '' : 's'} to review`, esc(due.map(o => `${Courses[o.x].short || Courses[o.x].code} ${o.n}`).join(' · ')), ''));
    if (mistN) rows.push(row(`#/${mist[0].x}/mistakes`, 'undo', 'coral', `Retry ${mistN} missed question${mistN === 1 ? '' : 's'}`, 'Back with their explanations', ''));
    const shown = dls.slice(0, Math.max(1, 3 - rows.length));
    shown.forEach(d => rows.push(row(`#/${d.c}/calendar`, d.type === 'exam' ? 'flag' : 'clock', d.type === 'exam' ? 'coral' : 'gold', esc(d.title), `${esc(Courses[d.c].short || Courses[d.c].code)}${d.n > 1 ? ' · ' + esc(App.fmtDate(d.date)) : ''}${d.time ? ' · ' + esc(d.time) : ''}`, whenTxt(d.n))));
    const more = dls.length > shown.length ? `<a class="ah-more-row" href="#/today">${dls.length - shown.length} more due this week ${icon('right', 14)}</a>` : '';
    return `<section class="ah-today" aria-labelledby="ah-today-h"><div class="ah-sec-h"><h2 id="ah-today-h">Today, all classes</h2><a class="ah-link" href="#/today">Full plan ${icon('right', 14)}</a></div>
      <div class="ah-goal"><span>${icon('zap', 16)} <b>${xp}</b> of ${goal} XP</span>${bar(pct, 'gold', 'Daily goal')}</div>
      ${rows.length ? `<div class="ah-list">${rows.join('')}</div>${more}` : `<p class="ah-quiet">Nothing due this week. One lesson below keeps your streak going.</p>`}</section>`;
  }

  function classRow(mine, id, o = {}) {
    return `${o.noTitle ? '' : '<div class="ah-sec-h"><h2>Your classes</h2></div>'}<div class="ah-row" role="list" aria-label="Your classes">${mine.map(x => { const K = Courses[x]; const ex = examOf(K); const d = daysTo(ex); const ns = nodesOf(K); const done = ns.filter(n => n.state === 'done').length;
      if (locked(x)) return `<button class="ah-card locked${x === id ? ' on' : ''}" role="listitem" data-cid="${x}" style="${ccStyle(x)}" aria-pressed="${x === id}"><span class="ah-art" aria-hidden="true">${icon('lock', 22)}</span><b class="ah-code">${esc(K.short || K.code)}</b><span class="ah-exam">Locked</span></button>`;
      return `<button class="ah-card${x === id ? ' on' : ''}" role="listitem" data-cid="${x}" style="${ccStyle(x)}" aria-pressed="${x === id}"><span class="ah-art" aria-hidden="true">${App.classSprite ? App.classSprite(x, 3) : ''}</span><b class="ah-code">${esc(K.short || K.code)}</b><span class="ah-exam">${ex && d !== null && d >= 0 ? `${esc(ex.name)} ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`}` : local.has(x) ? 'Your class' : 'No exam ahead'}</span>${ns.length ? `<span class="ah-cbar" aria-label="${done} of ${ns.length} topics mastered"><i style="width:${Math.round(100 * done / ns.length)}%"></i></span>` : ''}</button>`; }).join('')}${o.addHref ? `<a class="ah-card ah-add" href="${o.addHref}">${icon('plus', 26)}<span class="ah-exam">Add a class</span></a>` : `<button class="ah-card ah-add" data-ab-add="1" aria-label="Add a class">${icon('plus', 26)}<span class="ah-exam">Add a class</span></button>`}</div>`;
  }

  function heroHtml(C, o = {}) {
    const id = C.id; const writing = C.kind === 'writing';
    const ss = safe(() => App.semesterStateOf(C)); const cur = safe(() => App.currentSectionOf(C));
    const ex = examOf(C); const es = ex ? safe(() => App.examStatus(ex)) : null; const rd = ex && !writing ? safe(() => App.readiness(id)) : null;
    const ns = nodesOf(C); const done = ns.filter(n => n.state === 'done').length; const next = ns.find(n => n.state === 'current') || ns.find(n => n.state === 'open');
    const rp = writing && App.readingProgress ? safe(() => App.readingProgress(C)) : null;
    const go = writing ? (rp && rp.next ? [`#/${id}/reading/${rp.next.id}`, rp.started ? 'Keep listening' : 'Next reading', rp.next.title] : [`#/${id}/readings`, 'Readings', 'Browse the readings'])
      : next ? [`#/${id}/lesson?topics=${encodeURIComponent(next.t)}`, done || next.n ? 'Continue · 5-minute lesson' : 'Start here · 5-minute lesson', next.label]
      : cur ? [`#/${id}/notes/${cur.id}`, 'This week in class', cur.title] : [`#/${id}/dashboard`, 'Open the class', C.name];
    const when = ss ? (ss.phase === 'before' ? `Starts ${App.fmtDate(C.SEMESTER.start, true)}` : ss.phase === 'after' ? 'Semester over' : ss.phase === 'finals' ? 'Finals week' : `Week ${ss.week}${ss.weeks ? ' of ' + ss.weeks : ''}`) : '';
    const now = cur && ss && ss.phase !== 'after' ? `${ss.phase === 'before' ? 'first up' : 'now covering'} ${cur.label} ${cur.title}` : '';
    const exHtml = ex && es ? `<a class="ah-ex" href="#/${id}/${writing ? 'course' : 'exam/' + encodeURIComponent(ex.id)}">
        <span class="ah-days">${es.n > 0 ? `<b>${es.n}</b> <small>${es.n === 1 ? 'day' : 'days'}</small>` : `<b class="sm">${esc(es.big)}</b>`}</span>
        <span class="ah-ex-t"><b>${esc(ex.name)} · ${esc(ex.dateLabel || App.fmtDate(ex.date))}</b><small>${[ex.covers ? `${writing ? 'Turn in' : 'Covers'} ${ex.covers}` : '', ex.weight ? `${ex.weight}% of the grade` : ''].filter(Boolean).map(esc).join(' · ')}</small>
        ${rd && rd.ok ? `<span class="ah-ready">${bar(rd.score, 'pine', 'Ready for ' + ex.name)}<em>${rd.score}% ready · ${esc(rd.label)}</em></span>` : ''}</span>${icon('right', 18)}</a>`
      : `<p class="ah-quiet">${(C.EXAMS || []).length ? 'No exams left this semester.' : 'No exams in this class.'}</p>`;
    return `<section class="ah-hero" aria-labelledby="ah-hero-h">
      <div class="ah-hero-h"><div><h2 id="ah-hero-h">${esc(C.name)}</h2>${when || now ? `<p>${esc([when, now].filter(Boolean).join(' · '))}</p>` : ''}</div><a class="ah-link" href="#/${id}/dashboard">Class page ${icon('right', 14)}</a></div>
      ${o.noExam ? '' : exHtml}
      <a class="ah-go" href="${go[0]}"><span class="ah-go-ic" aria-hidden="true">${icon('play', 22)}</span><span class="ah-go-t"><small>${esc(go[1])}</small><b>${esc(go[2])}</b></span></a>
      ${ns.length ? `<p class="ah-mast">${bar(Math.round(100 * done / ns.length), 'pine', 'Topics mastered')}<span>${done} of ${ns.length} topics mastered</span></p>` : ''}</section>`;
  }

  const lockHero = C => { const L = App.createLock || {}; return `<section class="ah-hero ah-locked" aria-labelledby="ah-hero-h"><div class="ah-hero-h"><div><h2 id="ah-hero-h">${esc(C.name)}</h2><p>${icon('lock', 14)} Locked because your plan is off. The class and your progress in it are still saved ${esc(L.where || 'with your account')}.</p></div></div><div class="lock-acts"><button type="button" class="btn primary lg" data-lock="buy">Subscribe to open it</button><button type="button" class="btn" data-lock="restore">${esc(L.restoreLabel || 'Restore purchases')}</button></div></section>`; };
  function toolsHtml(C, o = {}) {
    const id = C.id; const all = C.NAV && App.groupNav ? App.groupNav(C.NAV).flatMap(g => g.items) : [];
    const pick = TOOL_ORDER.map(v => all.find(x => x[0] === v)).filter(Boolean).slice(0, 7);
    if (!pick.length) return '';
    return `<section class="ah-tools" aria-labelledby="ah-tools-h"><div class="ah-sec-h"><h2 id="ah-tools-h">Study tools</h2></div><div class="ah-tgrid">${pick.map(([v, l, ic]) => `<a class="ah-tool" href="#/${id}/${v}"><span class="ah-tool-ic" aria-hidden="true">${icon(ic || 'book', 22)}</span><span>${esc(TOOL_NAME[v] || l)}</span></a>`).join('')}${o.allHref ? `<a class="ah-tool" href="${o.allHref}">` : '<button class="ah-tool" data-ab-tools="1">'}<span class="ah-tool-ic" aria-hidden="true">${icon('grid', 22)}</span><span>All tools</span>${o.allHref ? '</a>' : '</button>'}</div></section>`;
  }

  function pathHtml(C, o = {}) {
    const id = C.id; const nodes = nodesOf(C);
    const units = (C.UNITS || []).map(u => ({ u, ns: nodes.filter(n => n.unit && n.unit.n === u.n) }));
    // classes without practice topics get a path of their sections (each opens its notes)
    const cur = safe(() => App.currentSectionOf(C));
    const secPath = !nodes.length ? (C.UNITS || []).map(u => ({ u, ns: (C.SECTIONS || []).filter(s => s.unit === u.n).map(s => ({ sec: s, label: s.title || s.label, state: cur && cur.id === s.id ? 'current' : 'open', href: `#/${id}/notes/${s.id}` })) })) : null;
    let list = (secPath || units).filter(x => x.ns.length);
    if (!list.length) return '';
    const everything = list;
    if (o.unitOnly) { const at = list.find(x => x.ns.some(n => n.state === 'current')) || list.find(x => x.ns.some(n => n.state !== 'done')) || list[list.length - 1]; list = [at]; }
    const today = App.todayISO(); let k = 0; const all = everything.flatMap(x => x.ns); const done = all.filter(n => n.state === 'done').length;
    const html = list.map(({ u, ns }) => {
      const ex = (C.EXAMS || []).find(e => e.id === u.exam); const d = ex ? daysTo(ex) : null; const udone = ns.filter(n => n.state === 'done').length; const firstSec = (ns[0] && ns[0].sec && ns[0].sec.id) || '';
      const items = ns.map(n => { const x = SIDE_X[k++ % SIDE_X.length]; const side = x <= 0 ? 'r' : 'l'; const st = n.state; const sec = n.sec || {};
        const href = n.href || `#/${id}/lesson?topics=${encodeURIComponent(n.t)}`; const prac = n.t ? `#/${id}/practice?topics=${encodeURIComponent(n.t)}` : ''; const notes = `#/${id}/notes/${sec.id}`;
        const sub = secPath ? (st === 'current' ? 'This week in class' : 'Notes') : st === 'done' ? `Mastered · ${n.crowns} of 5 crowns` : st === 'current' ? (n.n ? `Up next · ${n.n} answered` : 'Up next') : st === 'soon' ? (n.n ? `Coming up in class · ${n.n} answered` : 'Coming up in class') : n.n ? `${n.n} answered · ${n.crowns} of 5 crowns` : 'Not started';
        return `<li class="ap-li ${st}" style="--x:${x}px" data-side="${side}">${st === 'current' ? `<span class="ap-start" aria-hidden="true">${secPath ? 'Read' : 'Start'}</span><span class="ap-bo" aria-hidden="true">${App.bobcatSvg ? App.bobcatSvg(52) : ''}</span>` : ''}<button class="ap-row" data-node aria-expanded="false"><span class="ap-node" aria-hidden="true">${icon(NODE_IC[st] || 'play', 28)}</span><span class="ap-label"><b>${esc(n.label)}</b><small>${sec.label ? esc(sec.label) + ' · ' : ''}${sub}</small></span></button>
          <div class="ap-pop" hidden><b>${esc(n.label)}</b><span>${esc([sec.label, n.t ? sec.title : ''].filter(Boolean).join(' '))}${n.n ? ` · ${n.n} answered` : ''}</span><div class="ap-pop-acts"><a class="btn primary" href="${href}">${icon('play', 15)} ${n.t ? 'Start lesson' : 'Read the notes'}</a>${prac ? `<a class="btn" href="${prac}">Practice</a><a class="btn ghost" href="${notes}">Notes</a>` : ''}</div></div></li>`; }).join('');
      const exNode = ex ? `<li class="ap-li exam${ex.date < today ? ' past' : ''}"><a class="ap-exam" href="#/${id}/exam/${encodeURIComponent(ex.id)}" aria-label="${esc(ex.name)}, ${ex.date < today ? 'done' : inDays(d)}">${icon(ex.date < today ? 'check' : 'flag', 30)}</a><span class="ap-exam-label"><b>${esc(ex.name)}</b>${esc(ex.dateLabel || App.fmtDate(ex.date, true))} · ${ex.date < today ? 'done' : inDays(d)}</span></li>` : '';
      return `<section class="ap-unit"><header class="ap-banner"><div class="ap-banner-txt"><h3>${esc(u.title)}</h3><p>Unit ${u.n} · ${udone} of ${ns.length} ${secPath ? 'topics' : 'mastered'}${ex ? ` · ${esc(ex.name)} ${ex.date < today ? 'done' : inDays(d)}` : ''}</p>${secPath ? '' : `<span class="ap-ubar" aria-hidden="true"><i style="width:${Math.round(100 * udone / ns.length)}%"></i></span>`}</div><a class="ap-guide" href="#/${id}/notes${firstSec ? '/' + firstSec : ''}">${icon('book', 18)}<span>Notes</span></a></header><ol class="ap-nodes">${items}${exNode}</ol></section>`;
    }).join('');
    return `<section class="ah-pathsec" aria-labelledby="ah-path-h"><div class="ah-sec-h"><h2 id="ah-path-h">Your path</h2>${secPath ? '' : `<span class="ah-count">${done} of ${all.length} mastered</span>`}</div><p class="ah-hint">${o.unitOnly ? 'The unit you are in, topic by topic.' : 'Every topic in the order the class covers it.'} ${o.unitOnly ? 'Pick' : 'Tap'} one to ${secPath ? 'read its notes' : 'start a lesson, practise it or read its notes'}.</p>${html}${o.unitOnly && everything.length > 1 ? `<a class="ah-more-row ah-whole" href="#/${id}/dashboard">The whole path: ${everything.length} units ${icon('right', 14)}</a>` : ''}</section>`;
  }

  /* the path's lesson buttons open a small card (start, practise, notes); one at a time */
  function wirePath(root, o = {}) {
    const closePops = () => { $$('.ap-pop', root).forEach(x => { x.hidden = true; }); $$('[data-node]', root).forEach(x => x.setAttribute('aria-expanded', 'false')); $$('.ap-li.open', root).forEach(x => x.classList.remove('open')); document.body.classList.remove('ap-open'); };
    root.addEventListener('click', e => {
      const node = e.target.closest('[data-node]');
      if (node) {
        if (o.haptic) o.haptic('select');
        const li = node.closest('.ap-li'); const p = $('.ap-pop', li); const open = p.hidden; closePops(); p.hidden = !open; li.classList.toggle('open', open); document.body.classList.toggle('ap-open', open); node.setAttribute('aria-expanded', String(open));
        if (open) { const lim = innerHeight - (o.bottom ? o.bottom() : 0) - 16, below = p.getBoundingClientRect().bottom - lim; if (below > 0) scrollBy({ top: below, behavior: o.reduceMotion && o.reduceMotion() ? 'auto' : 'smooth' }); }   // the card opens fully in view
        return;
      }
      if (!e.target.closest('.ap-pop')) closePops();
    });
    root.addEventListener('keydown', e => { if (e.key === 'Escape' && $('.ap-li.open', root)) { const b = $('.ap-li.open [data-node]', root); closePops(); if (b) b.focus(); } });
  }

  /* ============================================================
     Exam week: from 7 days before an exam, the start page and the class page show a short plan for
     today (the weakest topic, flashcards due, a timed practice exam near the end, the prep checklist)
     and one for each day until the exam. Built from readiness (assets/readiness.js), so it follows
     what the student has practised.
     ============================================================ */
  const WEEK = 7;
  function examWeek(C) {
    if (!C || C.kind === 'writing' || locked(C.id)) return null;
    const ex = examOf(C); const d = daysTo(ex); if (!ex || d === null || d < 0 || d > WEEK) return null;
    const id = C.id; const rd = safe(() => App.readiness(id)) || {}; const t = App.todayISO();
    const hasQuiz = !!(C.quiz || C.hasQuiz || C.quizTopics || C.QUIZ);
    // weakest first; topics already strong drop out of the plan
    let weak = rd.ok ? rd.topics.slice().sort((a, b) => a.score - b.score || a.a - b.a).filter(x => x.score < 0.85).map(x => ({ label: x.label, href: `#/${id}/lesson?topics=${encodeURIComponent(x.t)}`, kind: 'lesson' })) : [];
    if (!rd.ok) weak = (ex.cumulative ? (C.SECTIONS || []) : (C.SECTIONS || []).filter(s => (ex.sections || []).includes(s.id) || (ex.units || []).includes(s.unit))).map(s => ({ label: `${s.label ? s.label + ' ' : ''}${s.title}`, href: `#/${id}/notes/${s.id}`, kind: 'notes' }));
    const due = safe(() => { const x = App.dueCards(id); return x.count + (x.estimated || 0); }) || 0;
    const items = (C.CHECKLISTS && C.CHECKLISTS[ex.id]) || []; const checked = rd.ok && rd.checkPart !== null ? Math.round((rd.checkPart / 100) * items.length) : null;
    const set = C.PRACTICE && C.PRACTICE[ex.id];
    const timed = hasQuiz ? `#/${id}/practice?exam=${encodeURIComponent(ex.id)}&timed=1` : '';
    // one row per day from today to the exam
    const plan = []; const studyDays = Math.max(1, d - 1); const per = Math.min(3, Math.max(1, Math.ceil(weak.length / studyDays))); let w = 0;
    for (let i = 0; i <= d; i++) {
      const date = App.toISO(App.addDays(App.parseISO(t), i)); const left = d - i; const tasks = [];
      if (left === 0) tasks.push({ t: 'Exam day: a light look at the formulas and flashcards, then go. Sleep and breakfast count.', href: `#/${id}/${C.FORMULAS && C.FORMULAS.length ? 'formulas' : 'flashcards'}` });
      else if (left === 1) { if (timed) tasks.push({ t: 'Timed practice exam, then redo what you missed', href: timed }); else if (set) tasks.push({ t: `Work the practice exam: ${set.title}`, href: `#/${id}/exam/${encodeURIComponent(ex.id)}` }); tasks.push({ t: 'Flashcards for the exam', href: `#/${id}/flashcards` }); }
      else { weak.slice(w, w + per).forEach(x => tasks.push({ t: `${x.kind === 'lesson' ? 'Weak spot' : 'Review'}: ${x.label}`, href: x.href })); w += per; if (left === 2 && set && timed) tasks.push({ t: `Practice exam: ${set.title}`, href: `#/${id}/exam/${encodeURIComponent(ex.id)}` }); tasks.push({ t: 'Flashcards due', href: `#/${id}/flashcards` }); }
      plan.push({ date, left, tasks });
    }
    return { C, ex, d, rd, weak, due, items, checked, timed, set, plan };
  }
  function examWeekHtml(C, o = {}) {
    const W = examWeek(C); if (!W) return '';
    const { ex, d, rd, weak, due, items, checked, timed, plan } = W; const id = C.id;
    const row = (href, ic, title, sub) => `<a class="xw-item" href="${href}"><span class="xw-ic" aria-hidden="true">${icon(ic, 18)}</span><span class="xw-t"><b>${title}</b><small>${sub}</small></span>${icon('right', 16)}</a>`;
    const today = [];
    if (d === 0) today.push(row(`#/${id}/${C.FORMULAS && C.FORMULAS.length ? 'formulas' : 'flashcards'}`, 'flag', `${esc(ex.name)} is today`, 'A light look at the formulas and flashcards, then go'));
    if (d > 0 && weak[0]) today.push(row(weak[0].href, 'target', `Weakest topic: ${esc(weak[0].label)}`, weak[0].kind === 'lesson' ? '5-minute lesson, then practise it' : 'Read the notes, then try the flashcards'));
    if (due) today.push(row(`#/${id}/flashcards`, 'cards', `${due} flashcard${due === 1 ? '' : 's'} due`, 'Spaced review keeps them for the exam'));
    if (d > 0 && d <= 3 && timed) today.push(row(timed, 'clock', 'Timed practice exam', 'Questions from the whole exam, no feedback until you submit'));
    if (d > 0) today.push(row(`#/tutor/${id}?q=quiz`, 'chat', 'Ask Bo to quiz you', 'Your AI tutor starts with your weakest topic'));
    if (items.length) today.push(row(`#/${id}/exam/${encodeURIComponent(ex.id)}`, 'check', checked !== null ? `Prep checklist: ${checked} of ${items.length}` : 'Prep checklist', 'What to bring, what is allowed, what to review'));
    const dayName = iso => { const n = App.daysBetween(App.todayISO(), iso); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : esc(App.fmtDate(iso)); };
    return `<section class="xw${o.wide ? ' xw-wide' : ''}" aria-labelledby="xw-h-${id}"${o.style ? ` style="${o.style}"` : ''}>
      <div class="xw-head"><span class="xw-days" aria-hidden="true"><b>${d}</b><small>${d === 1 ? 'day' : 'days'}</small></span><div class="xw-h"><h2 id="xw-h-${id}">Exam week: ${d === 0 ? `${esc(ex.name)} is today` : `${esc(ex.name)} ${inDays(d)}`}</h2><p>${[o.showClass ? esc(C.short || C.code) : '', esc(ex.dateLabel || App.fmtDate(ex.date, true)), ex.covers ? `covers ${esc(ex.covers)}` : '', rd.ok ? `${rd.score}% ready` : ''].filter(Boolean).join(' · ')}</p></div></div>
      ${rd.ok ? `<span class="ah-bar pine xw-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${rd.score}" aria-label="Ready for ${esc(ex.name)}"><i style="width:${rd.score}%"></i></span>` : ''}
      <div class="xw-today"><h3 class="xw-sub">Today</h3><div class="xw-list">${today.join('') || `<p class="ah-quiet">You are on top of it. A practice round keeps it fresh.</p>`}</div></div>
      ${plan.length > 1 ? `<details class="xw-plan"${o.wide ? ' open' : ''}><summary>The plan for each day until the exam</summary><ol>${plan.map(p => `<li${p.left === 0 ? ' class="xw-exam-day"' : ''}><b>${dayName(p.date)}</b><span>${p.tasks.map(x => `<a href="${x.href}">${esc(x.t)}</a>`).join('')}</span></li>`).join('')}</ol></details>` : ''}
    </section>`;
  }

  /* ============================================================
     The website's start page for students who have studied here: the class you pick, its next exam
     and how ready you are, the next lesson and the unit you are in; beside it today across all your
     classes and the class's tools. (First visits keep the intro and the steps.)
     ============================================================ */
  function webHome(mineIds, extra = {}) {
    const mine = mineIds.filter(x => Courses[x] && !Courses[x].preview); if (!mine.length) return '';
    const id = curClass() && mine.includes(curClass()) ? curClass() : mine[0];
    return `<div class="ah wh" id="web-home">
      ${mine.length > 1 ? `<div class="wh-pick" role="tablist" aria-label="Show a class">${mine.map(x => `<button type="button" role="tab" class="wh-tab${x === id ? ' on' : ''}" aria-selected="${x === id}" data-wh="${x}" style="${ccStyle(x)}">${esc(Courses[x].short || Courses[x].code)}</button>`).join('')}</div>` : ''}
      <div class="wh-grid"><div class="wh-main" id="wh-main" aria-busy="true" style="${ccStyle(id)}"><div class="ah-loading" aria-hidden="true"><i></i><i></i><i></i></div></div>
      <aside class="wh-side">${todayHtml()}<div id="wh-tools"></div>${extra.side || ''}</aside></div></div>`;
  }
  function paintWebHome(root) {
    const box = $('#web-home', root); if (!box) return;
    const main = $('#wh-main', box); const tabs = $$('.wh-tab', box); const on = $('.wh-tab.on', box); const id = on ? on.dataset.wh : (myIds()[0] || null); if (!id) return;
    wirePath(main);
    box.addEventListener('click', e => { const b = e.target.closest('[data-wh]'); if (!b) return; setClass(b.dataset.wh); tabs.forEach(x => { const sel = x === b; x.classList.toggle('on', sel); x.setAttribute('aria-selected', String(sel)); }); fill(b.dataset.wh); });
    const fill = cid => {
      main.setAttribute('aria-busy', 'true'); main.setAttribute('style', ccStyle(cid));
      App.loadCourse(cid).then(C => {
        if (!main.isConnected) return; main.setAttribute('aria-busy', 'false');
        if (locked(cid)) { main.innerHTML = lockHero(C); if (App.createLock) App.createLock.wire(main, C); $('#wh-tools', box).innerHTML = ''; return; }
        const xw = examWeekHtml(C); main.innerHTML = heroHtml(C, { noExam: !!xw }) + xw + pathHtml(C, { unitOnly: true });
        $('#wh-tools', box).innerHTML = toolsHtml(C, { allHref: `#/${cid}/dashboard` }); $('#wh-tools', box).setAttribute('style', ccStyle(cid));
        if (App.typeset) safe(() => App.typeset(main));
      }).catch(() => { main.setAttribute('aria-busy', 'false'); main.innerHTML = `<div class="ah-empty"><p>This class could not be opened.</p><a class="btn" href="#/${cid}/dashboard">Try its class page</a></div>`; });
    };
    fill(id);
  }

  App.home = { myIds, curClass, setClass, examOf, daysTo, inDays, nodesOf, todayHtml, classRow, heroHtml, lockHero, toolsHtml, pathHtml, wirePath, examWeek, examWeekHtml, webHome, paintWebHome };

  /* the class page shows exam week too, above everything else */
  App.onRender = App.onRender || [];
  App.onRender.push((root, r) => {
    if (!r.course || r.view !== 'dashboard' || !App.D || App.D.id !== r.course || $('.xw', root)) return;
    const html = examWeekHtml(App.D); if (!html) return;
    const at = $('.page-head', root) || $('.mk-strip', root);
    const box = `<div class="xw-dash">${examWeekHtml(App.D, { wide: true })}</div>`;
    if (at) at.insertAdjacentHTML('afterend', box); else root.insertAdjacentHTML('afterbegin', box);
  });
})(window);

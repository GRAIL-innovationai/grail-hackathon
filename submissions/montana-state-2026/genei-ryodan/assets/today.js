/* ============================================================
   Mathub — Today: one daily plan across every class
   Due flashcards from all classes with a light spaced-repetition
   rule (box 0 now, box 1 after a day, box 2 after three days,
   mastered cards get a refresh after two weeks), a lesson on the
   weakest topic, the daily challenge, deadlines in the next 48 hours,
   quests and a per-class table. The review player here grades cards
   straight into each class's own store, so it stays in step with the
   Flashcards page. View: today (#/today).
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, store, toast, settings, setSetting } = App;
  const Courses = global.Courses;
  const INTERVAL = { 0: 0, 1: 1, 2: 3, 3: 14 }; const DAY = 86400000; const NEW_PER_CLASS = 10;
  const dataOf = id => (store.id === id ? store.data : store.peek(id)) || {};
  const mine = () => App.myCourses().filter(id => Courses[id]);
  const tISO = () => App.todayISO();

  /* ---------- what is due ---------- */
  function dueCards(id, now = Date.now()) {
    const C = Courses[id]; const cards = C.FLASHCARDS || []; const d = dataOf(id); const b = d.flashcards || {}; const at = d.fcAt || {}; const reviews = [], fresh = [];
    if (!C.FLASHCARDS && C.flashcardCount) {   // class not downloaded yet: count from what this device remembers about its cards
      const cap0 = App.limit('cards'); let rv = 0; Object.keys(b).forEach(k => { const t = at[k]; const wait = INTERVAL[Math.min(3, b[k])] * DAY; if (!t || now - t >= wait) rv++; });
      const fr = Math.max(0, C.flashcardCount - Object.keys(b).length); const count = Math.min(rv + Math.min(fr, NEW_PER_CLASS), isFinite(cap0) ? cap0 : Infinity);
      return { list: [], reviews: rv, fresh: fr, total: C.flashcardCount, unseen: fr, count, estimated: 0 };
    }
    cards.forEach(c => { const box = b[c.id]; if (box === undefined) { fresh.push(c); return; } const t = at[c.id]; const wait = INTERVAL[Math.min(3, box)] * DAY; if (!t || now - t >= wait) reviews.push(c); });
    const cap = App.limit('cards'); const list = reviews.concat(fresh.slice(0, NEW_PER_CLASS)).slice(0, isFinite(cap) ? cap : undefined);
    return { list, reviews: reviews.length, fresh: fresh.length, total: cards.length, unseen: fresh.length, count: list.length, estimated: !C.FLASHCARDS && C.flashcardCount ? Math.max(0, C.flashcardCount - Object.keys(b).length) : 0 };
  }
  function weakest(id) {
    const C = Courses[id]; const T = (C.quiz && C.quiz.TOPICS) || C.quizTopics; if (!T) return null; const p = dataOf(id).progress || {}; let best = null;
    Object.entries(p).forEach(([t, v]) => { if (!T[t] || !v || (v.a || 0) < 4) return; const acc = v.c / v.a; if (!best || acc < best.acc || (acc === best.acc && v.a > best.a)) best = { t, acc, a: v.a }; });
    if (best && best.acc < 0.9) return { t: best.t, label: T[best.t].label, why: `${Math.round(100 * best.acc)}% right on ${best.a} questions` };
    const nodes = App.pathNodes ? App.pathNodes(C) : []; const cur = nodes.find(n => n.state === 'current') || nodes.find(n => n.state === 'open') || nodes[0];
    return cur ? { t: cur.t, label: cur.label, why: 'where the class is right now' } : null;
  }
  function deadlines() {
    const t = tISO(); const out = [];
    mine().forEach(id => { const C = Courses[id]; if (!App.upcomingDeadlinesOf) return; App.upcomingDeadlinesOf(C, 10).forEach(x => { const n = App.daysBetween(t, x.date); if (n >= 0 && n <= 2) out.push(Object.assign({ course: C, days: n }, x)); }); });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  const plan = () => { const p = settings().todayPlan || {}; return p.d === tISO() ? p : { d: tISO(), reviewed: 0, lesson: false }; };
  const savePlan = patch => setSetting('todayPlan', Object.assign(plan(), patch));
  App.dueCards = dueCards; App.weakestTopic = weakest; App.todayPlan = plan; App.savePlan = savePlan;

  /* ---------- review player ---------- */
  const R = { queue: [], i: 0, flipped: false, good: 0, done: 0 };
  async function startReview(root, only) {
    const ids = only ? [only] : mine(); if (App.loadCourse) await Promise.all(ids.map(id => App.loadCourse(id)));
    R.queue = ids.flatMap(id => dueCards(id).list.map(c => ({ c, course: id }))); shuffle(R.queue); R.i = 0; R.flipped = false; R.good = 0; R.done = 0;
    const box = $('#td-review', root); if (!box) return; box.hidden = false; paintReview(root); box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }
  function paintReview(root) {
    const box = $('#td-review', root); if (!box) return; const it = R.queue[R.i];
    if (!it) { box.innerHTML = `<div class="panel-h"><div class="panel-title">${icon('cards')} Review</div></div><div class="td-done"><div class="mascot-slot" data-size="64" data-cls="compact"></div><div><b>${R.done ? `${R.done} card${R.done === 1 ? '' : 's'} reviewed, ${R.good} right.` : 'Nothing due right now.'}</b><p class="small muted">${R.done ? 'Cards you got right come back in a few days; the ones you missed return tomorrow.' : 'Come back tomorrow, or open a class to review ahead.'}</p></div></div>`; if (App.paintMascots) App.paintMascots(); if (R.done && App.sfx) App.sfx.play('complete'); paintPlan(root); return; }
    const C = Courses[it.course]; const d = dataOf(it.course); const boxN = (d.flashcards || {})[it.c.id] || 0;
    box.innerHTML = `<div class="panel-h"><div class="panel-title">${icon('cards')} Review · ${R.i + 1} of ${R.queue.length}</div><span class="chip course-${it.course}">${esc(C.short)}</span></div>
      <div class="fc-card td-card${R.flipped ? ' flipped' : ''}" id="td-card" tabindex="0" role="button" aria-label="Flip card"><div class="fc-face fc-front"><span class="eyebrow">box ${boxN} · ${esc(it.c.sec ? (App.secLabelOf ? App.secLabelOf(C, it.c.sec) : it.c.sec) : 'Unit ' + it.c.unit)}</span><div>${it.c.f}</div><div class="fc-hint">Tap or press space to flip</div></div><div class="fc-face fc-back"><span class="eyebrow">Answer</span><div>${it.c.b}</div></div></div>
      <div class="row gap-sm mt-2 td-controls">${R.flipped ? `<button class="btn danger" data-action="td-again">Again <span class="kbd">1</span></button><button class="btn primary" data-action="td-good">Got it <span class="kbd">2</span></button>` : `<button class="btn primary" data-action="td-flip">Show answer <span class="kbd">space</span></button>`}<button class="btn ghost sm" data-action="td-stop" style="margin-left:auto">Stop</button></div>`;
    App.typeset(box);
  }
  function gradeCard(root, up) {
    const it = R.queue[R.i]; if (!it || !R.flipped) return; const now = Date.now(); const today = tISO();
    store.poke(it.course, data => { const b = data.flashcards = data.flashcards || {}; b[it.c.id] = up ? Math.min(3, (b[it.c.id] || 0) + 1) : 0; const at = data.fcAt = data.fcAt || {}; at[it.c.id] = now; const act = data.activity = data.activity || {}; if (!act[today]) act[today] = true; });
    if (App.addXP) App.addXP(up ? 2 : 1, { course: it.course, silent: !up }); if (App.quest) App.quest('cards'); if (App.sfx) App.sfx.play(up ? 'correct' : 'wrong');
    R.done++; if (up) R.good++; savePlan({ reviewed: plan().reviewed + 1 }); R.i++; R.flipped = false; paintReview(root);
  }

  /* ---------- page ---------- */
  function paintPlan(root) {
    const el = $('#td-plan', root); if (!el) return; const p = plan(); const ids = mine(); const t = tISO();
    const due = ids.map(id => ({ id, d: dueCards(id) })); const dueN = due.reduce((n, x) => n + x.d.count + x.d.estimated, 0);
    const weak = ids.map(id => ({ id, w: weakest(id) })).filter(x => x.w); const pick = weak[0];
    const chal = ids.find(id => Courses[id].quiz || Courses[id].hasQuiz); const chalDone = chal && (settings().challengeDone || {})[chal] === t;
    const dl = deadlines(); const lessonDone = settings().lastLessonDay === t;
    const item = (done, ic, title, sub, action) => `<div class="td-item${done ? ' done' : ''}"><span class="td-check">${icon(done ? 'check' : ic, 15)}</span><div class="td-body"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>${action || ''}</div>`;
    el.innerHTML = item(dueN === 0 && p.reviewed > 0 || (dueN === 0), 'cards', dueN ? `Review ${dueN} due flashcard${dueN === 1 ? '' : 's'}` : (p.reviewed ? `Flashcards done: ${p.reviewed} reviewed today` : 'No flashcards due'), dueN ? due.filter(x => x.d.count + x.d.estimated).map(x => `${esc(Courses[x.id].short)} ${x.d.count + x.d.estimated}`).join(' · ') : 'Cards come back on a schedule: tomorrow after a miss, in a few days after a hit.', dueN ? `<button class="btn primary sm" data-action="td-review">${icon('play', 13)} Start</button>` : '')
      + item(lessonDone, 'play', pick ? `Lesson: ${esc(pick.w.label)}` : 'Lesson', pick ? `${esc(Courses[pick.id].short)} · ${esc(pick.w.why)}` : 'Pick a class to start a lesson.', pick ? `<a class="btn sm${lessonDone ? '' : ' primary'}" href="#/${pick.id}/lesson?topics=${encodeURIComponent(pick.w.t)}">${icon('play', 13)} ${lessonDone ? 'Another' : 'Start'}</a>` : '')
      + (App.mistakesSummary ? (() => { const m = App.mistakesSummary(); return m.due || m.open ? item(!m.due, 'undo', m.due ? `Retry ${m.due} mistake${m.due === 1 ? '' : 's'}` : `Mistakes notebook: ${m.open} open, none due today`, m.due ? 'Questions you missed, back with their explanations. Two hits in a row clears one.' : 'Missed questions come back the next day; right answers return in three days.', m.due ? `<a class="btn sm primary" href="#/mistakes?retry=1">${icon('play', 13)} Retry</a>` : `<a class="btn sm" href="#/mistakes">${icon('undo', 13)} Open</a>`) : ''; })() : '')
      + (chal ? item(!!chalDone, 'target', chalDone ? 'Daily challenge solved' : `Daily challenge · ${esc(Courses[chal].short)}`, 'One problem a day, the same for everyone. Fast solves climb the weekly board.', `<a class="btn sm${chalDone ? '' : ' primary'}" href="#/challenge?course=${chal}">${icon('target', 13)} ${chalDone ? 'Board' : 'Solve'}</a>`) : '')
      + `<div class="td-item${dl.length ? '' : ' done'}"><span class="td-check">${icon(dl.length ? 'clock' : 'check', 15)}</span><div class="td-body"><b>${dl.length ? `${dl.length} deadline${dl.length === 1 ? '' : 's'} in the next 48 hours` : 'Nothing due in the next 48 hours'}</b>${dl.length ? `<div class="td-dl">${dl.map(x => `<a href="#/${x.course.id}/calendar/${x.date}"><span class="chip course-${x.course.id}">${esc(x.course.short)}</span><span>${esc(x.title)}${x.time ? ` · ${esc(x.time)}` : ''}</span><b>${x.days === 0 ? 'today' : x.days === 1 ? 'tomorrow' : App.fmtDate(x.date)}</b></a>`).join('')}</div>` : '<small>Check the class calendars for what is further out.</small>'}</div></div>`;
    const tbl = $('#td-classes', root); if (tbl) tbl.innerHTML = ids.map(id => { const C = Courses[id]; const d = dataOf(id); const w = weakest(id); const dc = dueCards(id); const ex = App.nextExamOf ? App.nextExamOf(C) : null; const st = App.streakOf ? App.streakOf(d) : 0; return `<tr><td><a class="chip course-${id}" href="#/${id}">${esc(C.short)}</a></td><td class="num">${st ? `${icon('fire', 12)} ${st}` : '—'}</td><td class="num">${dc.count + dc.estimated ? `<button class="linkish" data-action="td-review-one" data-c="${id}">${dc.count + dc.estimated} due</button>` : '0'}</td><td>${w ? `<a href="#/${id}/lesson?topics=${encodeURIComponent(w.t)}">${esc(w.label)}</a>` : '<span class="muted">—</span>'}</td><td>${ex ? `${esc(ex.name)} · ${esc(ex.dateLabel || App.fmtDate(ex.date))}` : '<span class="muted">none</span>'}</td><td class="num">${(() => { const r = App.readiness ? App.readiness(id) : null; return r && r.ok ? `<a class="td-ready" href="#/${id}/dashboard" title="${esc(r.label)}">${App.readinessGauge(r, 40, { compact: true })}</a>` : '<span class="muted">—</span>'; })()}</td></tr>`; }).join('');
  }
  App.views.today = {
    title: 'Today',
    render(root, param, query, standalone) {
      const d = new Date(); const hour = d.getHours(); const ids = mine(); const p = plan();
      const head = standalone !== false ? `<header class="landing-top"><div><div class="eyebrow">Mathub · ${esc(App.fmtDate(tISO(), true))}</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Today</h1><p class="muted">Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}. Your plan across ${ids.length} class${ids.length === 1 ? '' : 'es'}: a few cards, one lesson, the challenge, and anything due soon.</p></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="#/">${icon('left', 14)} All classes</a></div></header>` : App.pageHead('Today', 'Your plan across every class.');
      root.innerHTML = `${standalone !== false ? '<div class="landing-wrap contact-wrap">' : ''}${head}<div class="grid cols-3 td-grid">
        <div class="panel td-hero"><div class="row between"><div><div class="eyebrow">Right now</div><div class="hub-slot"></div></div><div class="league-slot" data-compact="1"></div></div><div class="mascot-slot" data-size="56" data-cls="compact"></div></div>
        <div class="panel span-2"><div class="panel-h"><div class="panel-title">${icon('flag')} Your plan</div><span class="small muted">${p.reviewed ? `${p.reviewed} cards reviewed today` : 'resets every morning'}</span></div><div id="td-plan"></div></div>
        <div class="panel span-2" id="td-review" hidden></div>
        <div class="panel"><div class="panel-h"><div class="panel-title">${icon('zap')} Quests</div></div><div class="quests-slot" data-compact="1"></div></div>
        <div class="panel span-2"><div class="panel-h"><div class="panel-title">${icon('grid')} Your classes</div><a class="btn xs ghost" href="#/settings">Choose classes</a></div><div class="table-wrap"><table class="table compact"><thead><tr><th>Class</th><th class="num">Streak</th><th class="num">Cards</th><th>Weakest topic</th><th>Next exam</th><th class="num">Ready</th></tr></thead><tbody id="td-classes"></tbody></table></div></div>
      </div>${standalone !== false ? '</div>' : ''}`;
      paintPlan(root);
      bind(root, {
        'td-review': () => startReview(root), 'td-review-one': b => startReview(root, b.dataset.c), 'td-flip': () => { R.flipped = true; paintReview(root); }, 'td-again': () => gradeCard(root, false), 'td-good': () => gradeCard(root, true),
        'td-stop': () => { R.queue = []; $('#td-review', root).hidden = true; paintPlan(root); }
      });
      root.addEventListener('click', e => { if (e.target.closest('#td-card') && !R.flipped) { R.flipped = true; paintReview(root); } });
      this.keys = e => { if (!$('#td-review', root) || $('#td-review', root).hidden || e.target.matches('input, textarea, select')) return; if (e.key === ' ') { e.preventDefault(); if (!R.flipped) { R.flipped = true; paintReview(root); } } else if (e.key === '1' && R.flipped) gradeCard(root, false); else if (e.key === '2' && R.flipped) gradeCard(root, true); };
      document.addEventListener('keydown', this.keys);
      const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot); else if (App.paintStats) App.paintStats();
      if (query && query.review) startReview(root);
    },
    unmount() { if (this.keys) document.removeEventListener('keydown', this.keys); R.queue = []; }
  };
  /* Landing summary card: one line that says what today holds */
  App.todaySummary = function () {
    const ids = mine(); if (!ids.length) return ''; const t = tISO(); const dueN = ids.reduce((n, id) => { const d = dueCards(id); return n + d.count + d.estimated; }, 0); const dl = deadlines(); const p = plan();
    const chal = ids.find(id => Courses[id].quiz || Courses[id].hasQuiz); const chalDone = chal && (settings().challengeDone || {})[chal] === t; const lessonDone = settings().lastLessonDay === t;
    const bits = [dueN ? `${dueN} card${dueN === 1 ? '' : 's'} due` : (p.reviewed ? 'cards done' : 'no cards due'), lessonDone ? 'lesson done' : 'one lesson', chal ? (chalDone ? 'challenge solved' : 'the daily challenge') : null, dl.length ? `${dl.length} deadline${dl.length === 1 ? '' : 's'} soon` : null].filter(Boolean);
    const left = (dueN ? 1 : 0) + (lessonDone ? 0 : 1) + (chal && !chalDone ? 1 : 0);
    return `<a class="today-card" href="#/today"><span class="today-ic">${icon('flag', 18)}</span><span class="today-body"><small>Today's plan${left ? ` · ${left} to go` : ' · all done'}</small><b>${esc(bits.join(' · '))}</b></span><span class="btn sm primary">Open ${icon('right', 13)}</span></a>`;
  };
})(window);

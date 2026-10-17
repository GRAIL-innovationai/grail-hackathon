/* ============================================================
   Mathub — mistakes notebook
   Every question you get wrong (practice, lessons, Blitz, the daily
   challenge) is saved with its explanation and comes back on a
   schedule: tomorrow after a miss, three days after a hit, and it is
   cleared after two hits in a row. Stored per class in the synced
   data as mistakes: [{k, t, q, at, due, wins, misses, src}].
   Views: #/mistakes (every class) and #/<class>/mistakes.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, toast, store, typeset, settings, setSetting } = App; const Courses = global.Courses;
  const DAY = 86400000; const MAX = 120;
  const dataOf = id => (store.id === id ? store.data : store.peek(id)) || {};
  const startOfDay = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const clean = q => ({ type: q.type, prompt: String(q.prompt || ''), options: q.type === 'mc' ? (q.options || []).map(String) : undefined, answer: q.answer, answerTex: q.answerTex, explanation: String(q.explanation || ''), tol: q.tol, topic: q.topic });
  const keyOf = q => { let h = 0; const s = String(q.prompt || '') + '|' + (q.type === 'mc' ? (q.options || []).join('|') : ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'm' + (h >>> 0).toString(36); };

  App.recordMistake = function (q, course, src = 'practice') {
    const cid = course || (App.D && App.D.id); if (!cid || !q || !q.prompt) return;
    const now = Date.now(); const k = keyOf(q);
    store.poke(cid, d => {
      const list = Array.isArray(d.mistakes) ? d.mistakes : (d.mistakes = []); const cur = list.find(m => m.k === k);
      if (cur) { cur.misses++; cur.wins = 0; cur.at = now; cur.due = startOfDay(now) + DAY; cur.q = clean(q); }
      else { list.push({ k, t: q.topic, q: clean(q), at: now, due: startOfDay(now) + DAY, wins: 0, misses: 1, src }); }
      if (list.length > MAX) { list.sort((a, b) => a.at - b.at); list.splice(0, list.length - MAX); }
    });
  };
  App.mistakesAll = id => (dataOf(id).mistakes || []).slice().sort((a, b) => a.due - b.due);
  App.mistakesDue = (id, now = Date.now()) => App.mistakesAll(id).filter(m => m.due <= now);
  App.mistakesCleared = id => (dataOf(id).mistakesCleared || 0);
  function grade(cid, k, ok) {
    let cleared = false;
    store.poke(cid, d => {
      const list = d.mistakes || []; const i = list.findIndex(m => m.k === k); if (i < 0) return; const m = list[i]; const now = Date.now();
      if (ok) { m.wins++; if (m.wins >= 2) { list.splice(i, 1); d.mistakesCleared = (d.mistakesCleared || 0) + 1; cleared = true; } else m.due = startOfDay(now) + 3 * DAY; }
      else { m.wins = 0; m.misses++; m.due = startOfDay(now) + DAY; }
      d.activity = d.activity || {}; d.activity[App.todayISO()] = true;
    });
    if (App.recordAnswerQuiet) App.recordAnswerQuiet(cid, k, ok);
    if (App.addXP) App.addXP(ok ? (cleared ? 6 : 3) : 1, { course: cid, silent: !ok }); if (App.quest) { App.quest('answers'); if (ok) App.quest('correct'); }
    return cleared;
  }

  /* ---------- player ---------- */
  const P = { queue: [], i: 0, answered: null, done: 0, right: 0, cleared: 0 };
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  function startRetry(root, ids, all) {
    P.queue = ids.flatMap(id => (all ? App.mistakesAll(id) : App.mistakesDue(id)).map(m => ({ m, cid: id }))); P.i = 0; P.answered = null; P.done = 0; P.right = 0; P.cleared = 0;
    const box = $('#mk-player', root); if (!box) return; box.hidden = false; paintPlayer(root); box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function paintPlayer(root) {
    const box = $('#mk-player', root); if (!box) return; const it = P.queue[P.i];
    if (!it) { box.innerHTML = `<div class="panel-h"><div class="panel-title">${icon('undo')} Retry</div></div><div class="td-done"><div class="mascot-slot" data-size="64" data-cls="compact"></div><div><b>${P.done ? `${P.done} retried, ${P.right} right${P.cleared ? `, ${P.cleared} cleared for good` : ''}.` : 'Nothing due right now.'}</b><p class="small muted">${P.done ? 'Right answers come back in three days; two in a row and the mistake is gone.' : 'Mistakes come back the day after you make them.'}</p></div></div>`; if (App.paintMascots) App.paintMascots(); if (P.done && App.sfx) App.sfx.play('complete'); return; }
    const q = it.m.q; const C = Courses[it.cid]; const T = (C && ((C.quiz && C.quiz.TOPICS) || C.quizTopics)) || {}; const a = P.answered;
    box.innerHTML = `<div class="panel-h"><div class="panel-title">${icon('undo')} Retry · ${P.i + 1} of ${P.queue.length}</div><div class="row gap-sm"><span class="chip course-${it.cid}">${esc(C ? C.short : it.cid)}</span><span class="chip xs">${esc((T[it.m.t] || {}).label || it.m.t)}</span>${it.m.wins ? `<span class="chip xs good">1 of 2 hits</span>` : `<span class="chip xs warn">missed ${it.m.misses}×</span>`}</div></div>
      <div class="q-card${a ? (a.ok ? ' correct' : ' wrong') : ''}"><div class="q-prompt">${q.prompt}</div>
        ${q.type === 'mc' ? `<div class="q-opts">${(q.options || []).map((o, k) => { let cls = ''; if (a) { if (k === q.answer) cls = ' correct'; else if (a.sel === k) cls = ' wrong'; } return `<button class="q-opt${cls}" data-action="mk-mc" data-i="${k}" ${a ? 'disabled' : ''}><span class="letter">${LETTERS[k]}</span><span>${o}</span></button>`; }).join('')}</div>`
        : `<div class="q-numrow"><input class="input mono" id="mk-num" placeholder="e.g. 3/8, -0.375, 2pi" ${a ? 'disabled' : ''} value="${a ? esc(a.raw) : ''}"><button class="btn" data-action="mk-num" ${a ? 'disabled' : ''}>${icon('check', 14)} Check</button></div>`}
        ${a ? `<div class="q-feedback ${a.ok ? 'ok' : 'no'}"><b class="res">${a.ok ? (a.cleared ? '✓ Cleared for good' : '✓ Right, one more time and it is gone') : `✕ Not yet${q.type === 'num' ? ` — the answer is $${q.answerTex}$` : ` — the answer is ${LETTERS[q.answer]}`}`}</b><div>${q.explanation}</div>${!a.ok && App.askBoButton ? App.askBoButton(it.cid, q, q.type === 'mc' ? (a.sel != null ? LETTERS[a.sel] : '') : a.raw) : ''}</div>` : ''}
      </div>
      <div class="row between mt-2"><span class="small muted">${a ? '' : (q.type === 'mc' ? 'Keys 1 to 4 answer.' : 'Enter checks.')}</span><div class="row gap-sm">${a ? `<button class="btn primary" data-action="mk-next">Next ${icon('right', 14)}</button>` : ''}<button class="btn ghost sm" data-action="mk-stop">Stop</button></div></div>`;
    typeset(box); const inp = $('#mk-num', box); if (inp) inp.focus();
  }
  function answer(root, cid, m, ok, extra) {
    const cleared = grade(cid, m.k, ok); P.answered = Object.assign({ ok, cleared }, extra || {}); P.done++; if (ok) P.right++; if (cleared) P.cleared++;
    if (App.sfx) App.sfx.play(ok ? 'correct' : 'wrong'); paintPlayer(root); const card = $('#mk-player .q-card', root); if (card && App.burst) App.burst(card, ok ? 'pop' : 'shake'); paintList(root);
  }

  /* ---------- list ---------- */
  function paintList(root) {
    const el = $('#mk-list', root); if (!el) return; const ids = root.dataset.ids.split(','); const now = Date.now();
    const rows = ids.flatMap(id => App.mistakesAll(id).map(m => ({ m, cid: id })));
    const due = rows.filter(r => r.m.due <= now).length; const cleared = ids.reduce((n, id) => n + App.mistakesCleared(id), 0);
    $('#mk-stats', root).innerHTML = `<div class="stat"><div class="stat-num count" data-count="${rows.length}">${rows.length}</div><div class="stat-label">open</div></div><div class="stat"><div class="stat-num count" data-count="${due}">${due}</div><div class="stat-label">due now</div></div><div class="stat"><div class="stat-num count" data-count="${cleared}">${cleared}</div><div class="stat-label">cleared for good</div></div>`;
    const b = $('[data-action="mk-retry"]', root); if (b) { b.disabled = !due; b.innerHTML = `${icon('play', 14)} Retry ${due} due`; }
    if (!rows.length) { el.innerHTML = `<div class="empty">No mistakes saved yet. Miss a question in practice, a lesson, Blitz or the daily challenge and it lands here with its explanation.</div>`; return; }
    const byTopic = {}; rows.forEach(r => { const C = Courses[r.cid]; const T = (C && ((C.quiz && C.quiz.TOPICS) || C.quizTopics)) || {}; const label = `${C ? C.short : r.cid} · ${(T[r.m.t] || {}).label || r.m.t}`; (byTopic[label] = byTopic[label] || []).push(r); });
    el.innerHTML = Object.entries(byTopic).sort((a, b) => b[1].length - a[1].length).map(([label, list]) => `<div class="mk-group"><div class="row between mb-1"><b>${esc(label)}</b><span class="small muted">${list.length}</span></div>${list.map(r => `<div class="mk-row${r.m.due <= now ? ' due' : ''}"><div class="mk-q">${r.m.q.prompt}</div><div class="mk-meta"><span class="chip xs ${r.m.due <= now ? 'warn' : ''}">${r.m.due <= now ? 'due now' : `back ${App.fmtDate(App.toISO(new Date(r.m.due)))}`}</span><span class="small muted">missed ${r.m.misses}×${r.m.wins ? ' · 1 hit' : ''}</span><button class="icon-btn" data-action="mk-drop" data-c="${r.cid}" data-k="${r.m.k}" title="Remove" aria-label="Remove">${icon('x', 12)}</button></div></div>`).join('')}</div>`).join('');
    typeset(el); if (App.countUp) App.countUp($('#mk-stats', root));
  }
  App.views.mistakes = {
    title: 'Mistakes', blurb: 'Every question you missed, with its explanation, until you get it right twice.',
    render(root, param, query, standalone) {
      const ids = standalone ? App.myCourses().filter(id => Courses[id]) : [App.D.id]; root.dataset.ids = ids.join(',');
      const head = standalone ? `<div class="landing-wrap"><header class="landing-top"><div><div class="eyebrow">Mathub</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Mistakes</h1><p class="muted">${this.blurb} Across every class.</p></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="#/">${icon('left', 14)} All classes</a></div></header>` : App.pageHead('Mistakes notebook', this.blurb);
      root.innerHTML = `${head}<div class="mk-wrap"><div class="panel"><div class="row between" style="flex-wrap:wrap;gap:10px"><div class="stats" id="mk-stats"></div><div class="row gap-sm"><button class="btn primary" data-action="mk-retry">${icon('play', 14)} Retry</button><button class="btn" data-action="mk-all">${icon('rotate', 14)} Retry everything</button></div></div></div>
        <div class="panel" id="mk-player" hidden></div><div id="mk-list" class="stack"></div></div>${standalone ? '</div>' : ''}`;
      bind(root, {
        'mk-retry': () => startRetry(root, ids, false), 'mk-all': () => startRetry(root, ids, true),
        'mk-mc': b => { const it = P.queue[P.i]; if (!it || P.answered) return; answer(root, it.cid, it.m, +b.dataset.i === it.m.q.answer, { sel: +b.dataset.i }); },
        'mk-num': () => { const it = P.queue[P.i]; if (!it || P.answered) return; const raw = $('#mk-num', root).value.trim(); const v = App.parseNumber(raw); if (isNaN(v)) { toast('Enter a number, fraction or expression like 2pi'); return; } const q = it.m.q; const tol = q.tol ? Math.max(q.tol * Math.abs(q.answer), 1e-9) : Math.max(0.011, 0.005 * Math.abs(q.answer)); answer(root, it.cid, it.m, Math.abs(v - q.answer) <= tol, { raw }); },
        'mk-next': () => { P.i++; P.answered = null; paintPlayer(root); }, 'mk-stop': () => { P.queue = []; $('#mk-player', root).hidden = true; paintList(root); },
        'mk-drop': b => { store.poke(b.dataset.c, d => { d.mistakes = (d.mistakes || []).filter(m => m.k !== b.dataset.k); }); paintList(root); toast('Removed.', 1500); }
      });
      root.addEventListener('keydown', e => { if (e.target.matches('input') && e.key === 'Enter') { e.preventDefault(); const btn = $('[data-action="mk-num"]', root); if (btn && !btn.disabled) btn.click(); } });
      this.keys = e => { if (e.target.matches('input, textarea') || !P.queue.length || $('#mk-player', root).hidden) return; const it = P.queue[P.i]; if (!it) return; if (P.answered && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); P.i++; P.answered = null; paintPlayer(root); return; } const i = ['1', '2', '3', '4', '5', '6'].indexOf(e.key); if (i >= 0 && it.m.q.type === 'mc' && !P.answered) { e.preventDefault(); answer(root, it.cid, it.m, i === it.m.q.answer, { sel: i }); } };
      document.addEventListener('keydown', this.keys);
      paintList(root); if (query && query.retry) startRetry(root, ids, false);
      const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
    },
    unmount() { if (this.keys) document.removeEventListener('keydown', this.keys); P.queue = []; }
  };
  /* Today: one line for the plan */
  App.mistakesPlayer = P;
  App.mistakesSummary = function () { const ids = App.myCourses().filter(id => Courses[id]); const due = ids.reduce((n, id) => n + App.mistakesDue(id).length, 0); const open = ids.reduce((n, id) => n + App.mistakesAll(id).length, 0); return { due, open }; };
})(window);

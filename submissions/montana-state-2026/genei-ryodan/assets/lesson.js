/* ============================================================
   Mathub — lesson mode
   One question at a time with a progress bar, a Check button,
   a green/red feedback footer with the explanation, hints on demand,
   combo and XP, keyboard control, and an end screen with stats.
   Route: #/<course>/lesson?topics=a,b | unit=n | exam=id | smart=1 [&n=10]
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, toast, typeset, parseNumber } = App;
  const LETTERS = 'ABCDEF';
  let L = null; let keyHandler = null;

  function buildTopics(q) {
    const D = App.D, QZ = App.Q; let topics = [], label = 'Mixed practice';
    if (q.topics) { topics = String(q.topics).split(',').filter(t => QZ.TOPICS[t]); label = topics.length === 1 ? QZ.TOPICS[topics[0]].label : `${topics.length} topics`; }
    else if (q.unit) { topics = QZ.topicsForUnits([+q.unit]); const u = D.UNITS.find(x => x.n === +q.unit); label = u ? `Unit ${u.n} · ${u.title}` : `Unit ${q.unit}`; }
    else if (q.exam) { const ex = D.EXAMS.find(e => e.id === q.exam); if (ex) { topics = Object.keys(QZ.TOPICS).filter(t => ex.cumulative ? t !== 'substitution' : ex.sections.includes(QZ.TOPICS[t].sec)); label = `${ex.name} review`; } }
    else { const sr = App.smartReview(8); topics = sr.weighted.length ? sr.weighted : sr.picked.map(r => r.topic); label = 'Smart review'; }
    if (!topics.length) { const cur = App.currentSection(); topics = Object.keys(QZ.TOPICS).filter(t => QZ.TOPICS[t].sec === cur.id); if (!topics.length) topics = Object.keys(QZ.TOPICS).slice(0, 6); }
    return { topics, label };
  }

  App.views.lesson = {
    title: 'Lesson',
    render(root, param, query) {
      const q = query || {}; const { topics, label } = buildTopics(q);
      const n = App.guest() ? 5 : Math.min(20, Math.max(4, +q.n || 10));
      const qs = App.Q.generateSet(topics, n);
      if (!qs.length) { root.innerHTML = App.pageHead('Lesson', 'Nothing to practice here yet.') + `<div class="empty">No generators for these topics.</div>`; return; }
      L = { qs, i: 0, answers: [], sel: null, combo: 0, best: 0, start: Date.now(), xp0: App.xpToday ? App.xpToday() : 0, label, query: q, ladder: {}, muted: App.settings().sound === false, done: false };
      this.paint(root);
      if (keyHandler) document.removeEventListener('keydown', keyHandler);
      keyHandler = e => { if (!L || e.target.matches('input, textarea, select')) { if (e.key === 'Enter' && L && !L.done && e.target.matches('input')) { e.preventDefault(); this.check(root); } return; } if (L.done) return; if (/^[1-6]$/.test(e.key)) { const b = $(`.q-opt[data-i="${+e.key - 1}"]`, root); if (b && !b.disabled) b.click(); } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const a = L.answers[L.i]; if (a) this.next(root); else this.check(root); } };
      document.addEventListener('keydown', keyHandler);
    },
    unmount() { if (keyHandler) document.removeEventListener('keydown', keyHandler); keyHandler = null; L = null; },
    paint(root) {
      if (L.done) return this.paintEnd(root);
      const q = L.qs[L.i]; const a = L.answers[L.i]; const T = App.Q.TOPICS[q.topic]; const lvl = L.ladder[L.i] || 0;
      const body = q.type === 'mc'
        ? `<div class="q-opts">${q.options.map((o, k) => { let cls = ''; if (!a && L.sel === k) cls = ' selected'; if (a) { if (k === q.answer) cls = ' correct'; else if (a.sel === k) cls = ' wrong'; } return `<button class="q-opt${cls}" data-action="pick" data-i="${k}" ${a ? 'disabled' : ''}><span class="letter">${LETTERS[k]}</span><span>${o}</span></button>`; }).join('')}</div>`
        : `<div class="q-numrow"><input class="input mono lg" id="ls-num" placeholder="e.g. 3/8, -0.375, 2pi" value="${a ? esc(a.raw) : ''}" ${a ? 'disabled' : ''} autocomplete="off"></div>`;
      const ladder = !a ? App.ladderHtml(q, lvl, L.i) : '';
      const foot = a
        ? `<div class="lesson-foot ${a.ok ? 'ok' : 'no'}"><div class="lesson-fb"><div class="lesson-fb-ic">${icon(a.ok ? 'check' : 'x', 22)}</div><div class="lesson-fb-body"><b>${a.ok ? ['Correct!', 'Nice.', 'Exactly.', 'You got it.'][L.i % 4] : `Not quite${q.type === 'num' ? `, the answer is $${q.answerTex}$` : `, the answer is ${LETTERS[q.answer]}`}`}${a.assisted ? ' <span class="chip warn">assisted</span>' : ''}</b><div class="lesson-expl">${q.explanation}</div></div></div><button class="btn primary lg" data-action="next">${L.i + 1 < L.qs.length ? 'Continue' : 'Finish'} ${icon('right', 15)}</button></div>`
        : `<div class="lesson-foot"><span class="small muted">${q.type === 'mc' ? 'Pick an answer, then check. Keys 1–4 and Enter work too.' : 'Type your answer and press Enter.'}</span><button class="btn primary lg" data-action="check" ${q.type === 'mc' && L.sel === null ? 'disabled' : ''}>Check</button></div>`;
      root.innerHTML = `<div class="lesson">
        <div class="lesson-top"><a class="icon-btn" href="${App.link('path')}" title="Quit lesson" aria-label="Quit lesson">${icon('x', 16)}</a><div class="lesson-bar"><div class="lesson-fill" style="width:${Math.round(100 * (L.i + (a ? 1 : 0)) / L.qs.length)}%"></div></div>${L.combo >= 2 ? `<span class="combo-chip">${icon('fire', 13)} ${L.combo}</span>` : ''}<button class="icon-btn" data-action="mute" title="${L.muted ? 'Sound off' : 'Sound on'}">${icon(L.muted ? 'off' : 'bell', 15)}</button></div>
        <div class="lesson-q"><div class="eyebrow">${esc(L.label)} · ${L.i + 1} of ${L.qs.length} · ${esc(App.secLabel(T.sec))} ${esc(T.label)}${App.flagButton ? App.flagButton({ course: App.D.id, view: 'Lesson', ref: T.label, prompt: q.prompt, answer: a ? String(a.given !== undefined ? a.given : a.text !== undefined ? a.text : a.sel !== undefined ? 'option ' + (a.sel + 1) : '') : '' }) : ''}</div><div class="q-prompt lesson-prompt">${q.prompt}</div>${ladder}${body}</div>
        ${foot}</div>`;
      bind(root, {
        pick: b => { if (L.answers[L.i]) return; L.sel = +b.dataset.i; $$('.q-opt', root).forEach(x => x.classList.toggle('selected', +x.dataset.i === L.sel)); const c = $('[data-action="check"]', root); if (c) c.disabled = false; if (App.sfx) App.sfx.play('tap'); },
        check: () => this.check(root), next: () => this.next(root),
        ladder: () => { L.ladder[L.i] = (L.ladder[L.i] || 0) + 1; const keep = L.sel; this.paint(root); L.sel = keep; if (keep !== null) { const b = $(`.q-opt[data-i="${keep}"]`, root); if (b) b.classList.add('selected'); const c = $('[data-action="check"]', root); if (c) c.disabled = false; } },
        mute: () => { L.muted = !L.muted; App.setSetting('sound', !L.muted); this.paint(root); }
      });
      typeset(root); const inp = $('#ls-num', root); if (inp && !a) setTimeout(() => inp.focus(), 50);
    },
    check(root) {
      const q = L.qs[L.i]; if (L.answers[L.i]) return; let ans;
      if (q.type === 'mc') { if (L.sel === null) return; ans = { sel: L.sel, ok: L.sel === q.answer }; }
      else { const inp = $('#ls-num', root); const raw = (inp ? inp.value : '').trim(); const v = parseNumber(raw); if (isNaN(v)) { if (inp) inp.classList.add('invalid'); toast('Enter a number, fraction, or expression like 2pi'); return; } const tol = q.tol ? Math.max(q.tol * Math.abs(q.answer), 1e-9) : Math.max(0.011, 0.005 * Math.abs(q.answer)); ans = { raw, val: v, ok: Math.abs(v - q.answer) <= tol }; }
      ans.assisted = (L.ladder[L.i] || 0) >= App.ladder(q).length; L.answers[L.i] = ans;
      if (!ans.assisted) App.recordAnswer(q.topic, ans.ok); else App.markActivity(); if (!ans.ok && App.recordMistake) App.recordMistake(q, App.D.id, 'lesson');
      if (ans.ok && !ans.assisted) { L.combo++; L.best = Math.max(L.best, L.combo); if (L.combo % 5 === 0 && App.addXP) { App.addXP(5, { silent: true }); toast(`${icon('fire', 14)} ${L.combo} in a row! +5 XP bonus`, 2400); } if (App.quest) App.quest('combo', L.combo); } else L.combo = 0;
      if (App.sfx) App.sfx.play(ans.ok ? 'correct' : 'wrong');
      this.paint(root); const card = $('.lesson-q', root); if (card) card.classList.add(ans.ok ? 'pop' : 'shake'); const nb = $('[data-action="next"]', root); if (nb) nb.focus();
    },
    next(root) {
      if (!L.answers[L.i]) return; L.sel = null;
      if (L.i + 1 < L.qs.length) { L.i++; this.paint(root); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      L.done = true; if (App.quest) App.quest('lesson'); App.setSetting('lessonsDone', (App.settings().lessonsDone || 0) + 1); App.setSetting('lastLessonDay', App.todayISO()); this.paintEnd(root);
    },
    paintEnd(root) {
      const n = L.qs.length, ok = L.answers.filter(a => a && a.ok).length; const pct = Math.round(100 * ok / n); const secs = Math.round((Date.now() - L.start) / 1000); const xp = Math.max(0, (App.xpToday ? App.xpToday() : 0) - L.xp0);
      const missed = [...new Set(L.qs.filter((q, i) => !(L.answers[i] && L.answers[i].ok)).map(q => q.topic))];
      const msg = pct === 100 ? 'Perfect lesson.' : pct >= 80 ? 'Strong work.' : pct >= 60 ? 'Solid. Review the misses and go again.' : 'Every attempt teaches something. Try the missed topics next.';
      root.innerHTML = `<div class="lesson lesson-end"><div class="celebrate-ic big">${App.pixel ? App.pixel(pct >= 80 ? 'trophy' : 'star', 5) : icon(pct >= 80 ? 'award' : 'target', 42)}</div><h2>Lesson complete!</h2><p class="muted">${esc(L.label)} · ${msg}</p>
        <div class="lesson-stats"><div class="lstat xp"><b>+${xp}</b><span>XP earned</span></div><div class="lstat ${pct >= 80 ? 'good' : pct >= 60 ? 'warn' : 'bad'}"><b>${pct}%</b><span>${ok} of ${n} correct</span></div><div class="lstat"><b>${secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`}</b><span>time</span></div><div class="lstat"><b>${L.best}</b><span>best combo</span></div></div>
        ${missed.length ? `<p class="small muted mt-2">Missed: ${missed.map(t => esc(App.Q.TOPICS[t].label)).join(', ')}</p>` : ''}
        <div class="row gap-sm mt-3" style="justify-content:center;flex-wrap:wrap"><button class="btn primary lg" data-action="again">${icon('rotate', 15)} Another lesson</button>${missed.length ? `<a class="btn lg" href="${App.link('lesson', null, { topics: missed.join(','), r: Date.now().toString(36) })}">${icon('target', 15)} Review missed</a>` : ''}<a class="btn lg" href="${App.link('path')}">${icon('path', 15)} Back to path</a></div>
        ${App.guest() ? `<div class="mt-3">${App.lockCard('That was a preview lesson', 'Members get full 10-question lessons, XP that syncs everywhere, quests, leagues and badges.')}</div>` : ''}</div>`;
      bind(root, { again: () => this.render(root, null, L.query) });
      if (App.sfx) App.sfx.play('complete'); if (pct >= 80 && App.confetti) setTimeout(() => App.confetti({ count: 160 }), 200);
      if (App.auth) App.auth.bindLocks(root); window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
})(window);

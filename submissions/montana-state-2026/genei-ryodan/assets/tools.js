/* ============================================================
   Mathub — shared interactive tools (every course)
   Quizzer, exam prep, scratchpad. Course data comes from App.D / App.Q.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App;
  let D = null, QZ = null;
  const { $, $$, esc, icon, bind, on, toast, store, typeset, parseNumber, fmtNum, cssVar, fitCanvas, pageHead } = App;
  const L = App.link;
  const LETTERS = 'ABCDEF';   // banks can have up to six options
  /* ---------- hint ladders: topic hints → problem hint → first step of the solution → full solution ---------- */
  function splitSteps(text) {
    const out = []; let cur = ''; let inMath = false; const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]; if (ch === '$') inMath = !inMath; cur += ch;
      if (!inMath && (ch === '.' || ch === ';' || ch === '\n') && (i === s.length - 1 || /\s/.test(s[i + 1]) || ch === '\n')) { const t = cur.trim(); if (t && !/^[\d.]+$/.test(t)) { out.push(t); cur = ''; } }
    }
    const t = cur.trim(); if (t) out.push(t);
    // merge tiny fragments (e.g. "e.g." or a lone symbol) into the previous step
    const merged = []; out.forEach(x => { if (merged.length && x.length < 12) merged[merged.length - 1] += ' ' + x; else merged.push(x); });
    return merged;
  }
  App.splitSteps = splitSteps;
  App.ladder = function (q) {
    const L = global.MathubLadders && D ? (global.MathubLadders[D.id] || {})[q.topic] : null; const topic = Array.isArray(L) ? L : [];
    const hints = topic.slice(0, 3); if (q.hint) { if (hints.length >= 3) hints[2] = q.hint; else hints.push(q.hint); }
    while (hints.length < 3 && hints.length) hints.push(hints[hints.length - 1]);
    const steps = splitSteps(q.explanation); const rungs = hints.map((h, i) => ({ kind: 'hint', label: `Hint ${i + 1} of 3`, html: h }));
    if (steps.length > 1) rungs.push({ kind: 'step', label: 'First step', html: steps[0] });
    rungs.push({ kind: 'solution', label: 'Full solution', html: q.explanation });
    return rungs;
  };
  App.ladderHtml = function (q, level, qi) {
    const rungs = App.ladder(q); const shown = rungs.slice(0, level); const next = rungs[level];
    return `<div class="ladder" id="ld-${q.id}">${shown.map(r => `<div class="rung ${r.kind}"><span class="rung-label">${icon(r.kind === 'solution' ? 'eye' : r.kind === 'step' ? 'right' : 'bulb', 12)} ${r.label}</span><div>${r.html}</div></div>`).join('')}
      ${next ? `<button class="btn xs${next.kind === 'solution' ? ' ghost' : ''}" data-action="ladder" data-q="${qi}">${icon(next.kind === 'solution' ? 'eye' : 'bulb', 12)} ${next.kind === 'hint' ? (level === 0 ? 'Walk me through it' : 'Next hint') : next.kind === 'step' ? 'Show the first step' : 'Show the full solution'}</button>${next.kind === 'solution' ? '<span class="small muted" style="margin-left:8px">Seeing the solution first means this one won\'t count toward your accuracy.</span>' : ''}` : ''}</div>`;
  };
  /* ======================================================
     VIEW: Quizzer
     ====================================================== */
  const PQ = { units: [1], topics: new Set(), count: 10, mode: 'practice', minutes: 50, session: null };
  function topicsForExam(ex) {
    if (ex.cumulative) return Object.keys(QZ.TOPICS).filter(t => t !== 'substitution');
    return Object.keys(QZ.TOPICS).filter(t => ex.sections.includes(QZ.TOPICS[t].sec));
  }
  App.onCourse(C => { D = C; QZ = C.quiz; PQ.units = [1]; PQ.topics = new Set(); PQ.session = null; PQ.smart = null; PQ.external = null; });
  /** Runs a supplied question set as a timed exam; opts = { questions, minutes, title, onSubmit(correct, total, seconds, perQuestion [{ topic, ok }]) }. */
  App.runTimedSet = function (opts) {
    PQ.external = opts; PQ.mode = 'exam'; PQ.minutes = opts.minutes || 30; PQ.count = opts.questions.length; PQ.topics = new Set(opts.questions.map(q => q.topic)); PQ.units = [...new Set(opts.questions.map(q => QZ.TOPICS[q.topic] ? QZ.TOPICS[q.topic].unit : 1))];
    PQ.session = { questions: opts.questions, answers: {}, mode: 'exam', submitted: false, left: PQ.minutes * 60, timer: null, external: true };
    App.go('practice');
  };
  /** Deterministic question set: same seed gives the same questions for everyone (daily challenge, mock exams). */
  App.seededSet = function (topics, n, seed) {
    let s = (seed >>> 0) || 1; const rnd = () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const orig = Math.random; Math.random = rnd; const realNow = Date.now; Date.now = () => 1700000000000 + Math.floor(rnd() * 1e9);
    try { const qs = QZ.generateSet(topics, n); qs.forEach((q, i) => { q.id = 'sq' + seed.toString(36) + i; }); return qs; } finally { Math.random = orig; Date.now = realNow; }
  };
  /* Smart review: rank topics by weakness, staleness and coverage; returns a weighted topic list plus reasons. */
  App.smartReview = function (max = 8) {
    if (!QZ || !QZ.TOPICS) return { picked: [], weighted: [] };   // a class without a question bank (a syllabus-only class from #/teach)
    const t = App.todayISO(); const prog = App.progress(); const hist = store.get('history', []);
    const cur = App.currentSection(); const curIdx = D.SECTIONS.indexOf(cur);
    const covered = new Set(D.SECTIONS.slice(0, curIdx + 1).map(s => s.id));
    const last = {}; hist.forEach(h => { if (!last[h.t] || h.d > last[h.t]) last[h.t] = h.d; });
    const rows = Object.keys(QZ.TOPICS).filter(k => covered.has(QZ.TOPICS[k].sec) || prog[k]).map(k => {
      const p = prog[k] || { a: 0, c: 0 }; const acc = p.a ? p.c / p.a : null; const days = last[k] ? App.daysBetween(last[k], t) : null;
      let w = 0; const why = [];
      if (acc === null) { w += 3; why.push('never practiced'); } else { w += (1 - acc) * 4; why.push(`${Math.round(acc * 100)}% accuracy`); if (p.a < 5) { w += 1; why.push('only ' + p.a + ' tried'); } }
      if (days !== null) { w += Math.min(days, 14) / 14 * 2; if (days >= 3) why.push(`last practiced ${days} day${days === 1 ? '' : 's'} ago`); }
      if (QZ.TOPICS[k].sec === cur.id) { w += 0.5; }
      return { topic: k, label: QZ.TOPICS[k].label, sec: QZ.TOPICS[k].sec, unit: QZ.TOPICS[k].unit, w, acc, days, why: why.join(', ') };
    }).sort((a, b) => b.w - a.w);
    const picked = rows.slice(0, max); const weighted = []; picked.forEach(r => { const n = Math.max(1, Math.round(r.w)); for (let i = 0; i < n; i++) weighted.push(r.topic); });
    return { picked, weighted };
  };
  App.views.practice = {
    title: 'Quizzer', hasSession: () => !!(PQ.session && Object.keys(PQ.session.answers).length),
    render(root, param, query) {
      if (query.exam) { const ex = D.EXAMS.find(e => e.id === query.exam); if (ex) { PQ.units = ex.units.slice(); PQ.topics = new Set(topicsForExam(ex)); PQ.session = null; if (query.timed) { PQ.mode = 'exam'; PQ.count = Math.max(PQ.count, 15); } } }   // ?timed=1: exam week's timed practice exam
      else if (query.topics) { const ts = query.topics.split(',').filter(t => QZ.TOPICS[t]); if (ts.length) { PQ.units = [...new Set(ts.map(t => QZ.TOPICS[t].unit))]; PQ.topics = new Set(ts); PQ.session = null; } }
      else if (query.unit) { PQ.units = [+query.unit]; PQ.topics = new Set(QZ.topicsForUnits(PQ.units)); PQ.session = null; }
      if (query.smart) { const sr = App.smartReview(); if (sr.picked.length) { PQ.smart = sr; PQ.topics = new Set(sr.picked.map(r => r.topic)); PQ.units = [...new Set(sr.picked.map(r => r.unit))].sort(); PQ.session = null; PQ.mode = 'practice'; } }
      if (PQ.external && PQ.session && !PQ.session.external) PQ.external = null;
      if (!PQ.topics.size) PQ.topics = new Set(QZ.topicsForUnits(PQ.units));
      if (Object.keys(query).length) App.replaceHash(L('practice'));
      const ext = PQ.external && PQ.session && PQ.session.external ? PQ.external : null;
      root.innerHTML = pageHead(ext ? ext.title || 'Timed set' : 'Quizzer', ext ? `Timed set of ${PQ.session.questions.length} questions, ${PQ.minutes} minutes. Everyone gets the same questions. Feedback appears when you submit.` : 'Endless procedurally generated problems with worked explanations. Practice mode grades as you go; exam mode hides feedback until you submit.' + (D.quizNote ? ' ' + esc(D.quizNote) : '')) + `<div id="pq-setup"${ext ? ' class="hidden"' : ''}></div><div id="pq-session" class="mt-2"></div>`;
      this.paintSetup(root);
      if (PQ.session) { this.paintSession(root); if (ext && !PQ.session.timer && !PQ.session.submitted) { PQ.session.timer = setInterval(() => { const s = PQ.session; if (!s || s.submitted) return; s.left--; const el = $('#pq-timer', root); if (el) { el.textContent = fmtClock(s.left); el.classList.toggle('low', s.left < 300); } if (s.left <= 0) { this.submit(root); toast('Time is up. Set submitted.', 3000); } }, 1000); } } else this.start(root);
      bind(root, {
        unit: el => { const u = +el.dataset.u; const i = PQ.units.indexOf(u); if (i >= 0) { if (PQ.units.length > 1) PQ.units.splice(i, 1); } else PQ.units.push(u); PQ.units.sort(); PQ.topics = new Set(QZ.topicsForUnits(PQ.units)); PQ.smart = null; this.paintSetup(root); },
        topic: el => { const t = el.dataset.t; if (PQ.topics.has(t)) { if (PQ.topics.size > 1) PQ.topics.delete(t); } else PQ.topics.add(t); PQ.smart = null; this.paintSetup(root); },
        'all-topics': () => { PQ.topics = new Set(QZ.topicsForUnits(PQ.units)); this.paintSetup(root); },
        'exam-preset': el => { const ex = D.EXAMS.find(e => e.id === el.dataset.ex); PQ.units = ex.units.slice(); PQ.topics = new Set(topicsForExam(ex)); PQ.smart = null; this.paintSetup(root); },
        smart: () => { const sr = App.smartReview(); if (!sr.picked.length) { toast('Nothing to review yet: work through a topic first.'); return; } PQ.smart = sr; PQ.topics = new Set(sr.picked.map(r => r.topic)); PQ.units = [...new Set(sr.picked.map(r => r.unit))].sort(); PQ.mode = 'practice'; this.start(root); },
        start: () => this.start(root),
        'new-set': () => this.start(root),
        'retry-missed': () => this.retryMissed(root),
        mc: el => this.answerMC(root, +el.dataset.q, +el.dataset.i),
        'check-num': el => this.answerNum(root, +el.dataset.q),
        ladder: el => { const qi = +el.dataset.q; const s = PQ.session; s.ladder = s.ladder || {}; s.ladder[qi] = (s.ladder[qi] || 0) + 1; this.repaintQ(root, qi); const el2 = $(`#ld-${s.questions[qi].id} .rung:last-child`, root); if (el2) el2.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
        submit: () => this.submit(root),
        'toggle-setup': () => { $('#pq-setup-body', root).classList.toggle('hidden'); }
      });
      $('#pq-session', root).addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input[data-q]')) { e.preventDefault(); this.answerNum(root, +e.target.dataset.q); } });
      this.keys = e => {
        if (e.target.matches('input, textarea, select') || $('#search-modal') || !PQ.session) return;
        const k = LETTERS.indexOf(e.key.toUpperCase()) >= 0 ? LETTERS.indexOf(e.key.toUpperCase()) : (/^[1-6]$/.test(e.key) ? +e.key - 1 : -1);
        if (k < 0) return;
        const qi = PQ.session.questions.findIndex((q, i) => q.type === 'mc' && !PQ.session.answers[i]);
        if (qi >= 0) { const btn = $(`[data-action="mc"][data-q="${qi}"][data-i="${k}"]`, root); if (btn) { btn.click(); btn.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
      };
      document.addEventListener('keydown', this.keys);
    },
    unmount() { if (this.keys) document.removeEventListener('keydown', this.keys); if (PQ.session && PQ.session.timer) clearInterval(PQ.session.timer); },
    paintSetup(root) {
      const prog = App.progress();
      const topicList = QZ.topicsForUnits(PQ.units);
      const collapsed = !!PQ.session;
      $('#pq-setup', root).innerHTML = `<div class="panel">
        <div class="panel-h"><div><div class="panel-title">${icon('sliders')} Set up a practice set</div>${collapsed ? `<p class="small muted">Current set: Unit${PQ.units.length > 1 ? 's' : ''} ${PQ.units.join(', ')} · ${PQ.topics.size} topic${PQ.topics.size === 1 ? '' : 's'} · ${PQ.session.questions.length} questions · ${PQ.session.mode === 'exam' ? 'timed exam' : 'practice'} mode</p>` : ''}</div><div class="row"><button class="btn xs primary" data-action="smart" title="Builds a set from your weakest and least-recent topics">${icon('target', 12)} Review for me</button>${D.EXAMS.map(e => `<button class="btn xs" data-action="exam-preset" data-ex="${e.id}">${esc(e.name)} topics</button>`).join('')}<button class="btn xs ghost" data-action="toggle-setup">${collapsed ? 'Show' : 'Hide'}</button></div></div>
        ${PQ.smart ? `<div class="callout smart mb-2"><div class="eyebrow">${icon('target', 12)} Smart review · why these topics</div><div class="chips mt-1">${PQ.smart.picked.map(r => `<span class="chip ${r.acc !== null && r.acc < 0.6 ? 'bad' : r.acc === null ? 'warn' : 'accent'}" title="${esc(r.why)}">${esc(r.label)} <span style="opacity:.7">· ${esc(r.why)}</span></span>`).join('')}</div><p class="small muted mt-1">Weak, stale and never-tried topics get more questions. Answer a set and the mix updates.</p></div>` : ''}
        <div id="pq-setup-body" class="${collapsed ? 'hidden' : ''}">
          <div class="grid cols-4" style="gap:12px">
            <div class="field"><label>Units</label><div class="chips">${D.UNITS.map(u => `<span class="chip toggle${PQ.units.includes(u.n) ? ' on' : ''}" data-action="unit" data-u="${u.n}">Unit ${u.n}</span>`).join('')}</div></div>
            <div class="field"><label>Questions</label><select class="select" id="pq-count">${[5, 10, 15, 20, 30].map(n => `<option value="${n}"${PQ.count === n ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
            <div class="field"><label>Mode</label><select class="select" id="pq-mode"><option value="practice"${PQ.mode === 'practice' ? ' selected' : ''}>Practice (instant feedback)</option><option value="exam"${PQ.mode === 'exam' ? ' selected' : ''}>Timed exam (feedback at the end)</option></select></div>
            <div class="field"><label>Time limit (exam mode)</label><select class="select" id="pq-min">${[20, 30, 50, 75].map(n => `<option value="${n}"${PQ.minutes === n ? ' selected' : ''}>${n} min</option>`).join('')}</select></div>
          </div>
          <div class="field mt-2"><label>Topics <button class="btn xs ghost" data-action="all-topics">select all</button></label>
            <div class="chips">${topicList.map(t => { const p = prog[t]; const pct = p && p.a ? Math.round(100 * p.c / p.a) : null; return `<span class="chip toggle${PQ.topics.has(t) ? ' on' : ''}" data-action="topic" data-t="${t}" title="${esc(App.secLabel(QZ.TOPICS[t].sec))}">${esc(QZ.TOPICS[t].label)}${pct !== null ? ` <span style="opacity:.75">· ${pct}%</span>` : ''}</span>`; }).join('')}</div></div>
          <div class="row mt-2"><button class="btn primary" data-action="start">${icon('play', 14)} Generate set</button><a class="btn" href="${App.link('lesson', null, PQ.topics.size ? { topics: [...PQ.topics].join(',') } : { unit: PQ.units[0] })}">${icon('right', 14)} Lesson mode</a><span class="small muted">${PQ.topics.size} topic${PQ.topics.size === 1 ? '' : 's'} selected. Percentages are your accuracy so far.</span></div>
        </div></div>`;
      $('#pq-count', root).addEventListener('change', e => PQ.count = +e.target.value);
      $('#pq-mode', root).addEventListener('change', e => PQ.mode = e.target.value);
      $('#pq-min', root).addEventListener('change', e => PQ.minutes = +e.target.value);
    },
    start(root, questions) {
      if (PQ.session && PQ.session.timer) clearInterval(PQ.session.timer);
      const cap = App.limit('questions'); let qs = questions || QZ.generateSet(PQ.smart ? PQ.smart.weighted : [...PQ.topics], PQ.count); const capped = qs.length > cap; if (capped) qs = qs.slice(0, cap);
      PQ.session = { questions: qs, answers: {}, mode: PQ.mode, submitted: false, left: PQ.minutes * 60, timer: null, capped, ladder: {} };
      if (PQ.mode === 'exam') {
        PQ.session.timer = setInterval(() => { const s = PQ.session; if (!s || s.submitted) return; s.left--; const el = $('#pq-timer', root); if (el) { el.textContent = fmtClock(s.left); el.classList.toggle('low', s.left < 300); } if (s.left <= 0) { this.submit(root); toast('Time is up. Exam submitted.', 3000); } }, 1000);
      }
      this.paintSetup(root); this.paintSession(root);
      const sess = $('#pq-session', root); if (questions) sess.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    retryMissed(root) {
      const s = PQ.session; const missed = s.questions.filter((q, i) => s.answers[i] && !s.answers[i].ok);
      if (!missed.length) { toast('Nothing missed. Nice.'); return; }
      const topics = [...new Set(missed.map(q => q.topic))];
      this.start(root, QZ.generateSet(topics, Math.max(5, missed.length * 2)));
    },
    paintSession(root) {
      const s = PQ.session; const box = $('#pq-session', root);
      const answered = Object.keys(s.answers).length, correct = Object.values(s.answers).filter(a => a.ok && !a.assisted).length;
      const done = s.mode === 'practice' ? answered : (s.submitted ? s.questions.length : answered);
      const bar = s.mode === 'practice'
        ? `<div class="score-bar"><span class="stat"><span class="stat-num">${correct}<span class="muted" style="font-size:15px">/${answered}</span></span><span class="stat-label">correct so far · ${s.questions.length} questions</span></span>${(s.combo || 0) >= 2 ? `<span class="combo-chip" key="${s.combo}">${App.icon('fire', 13)} ${s.combo} in a row</span>` : ''}<div class="bar" style="flex:1;min-width:120px"><div class="bar-fill ${answered && correct / answered < 0.6 ? 'bad' : answered && correct / answered < 0.8 ? 'warn' : 'good'}" style="width:${s.questions.length ? 100 * answered / s.questions.length : 0}%"></div></div><button class="btn" data-action="retry-missed">${icon('target', 14)} Retry missed topics</button><button class="btn primary" data-action="new-set">${icon('rotate', 14)} New set</button></div>`
        : s.submitted ? this.summaryHtml(s)
        : `<div class="score-bar"><span class="timer" id="pq-timer">${fmtClock(s.left)}</span><span class="muted small">${answered} / ${s.questions.length} answered · no feedback until you submit</span><button class="btn primary" style="margin-left:auto" data-action="submit">${icon('check', 14)} Submit exam</button></div>`;
      box.innerHTML = `<div class="panel mb-2">${bar}</div><div class="stack">${s.questions.map((q, i) => this.qHtml(q, i)).join('')}</div>${s.mode === 'exam' && !s.submitted ? `<div class="row mt-2" style="justify-content:flex-end"><button class="btn primary" data-action="submit">${icon('check', 14)} Submit exam</button></div>` : ''}${s.capped ? `<div class="mt-2">${App.lockCard('That is the preview: ' + s.questions.length + ' questions per set', `Members get sets of up to 30 questions, timed exam mode, retry-missed drills and per-topic accuracy that follows you across devices.`)}</div>` : ''}`;
      typeset(box); if (App.auth) App.auth.bindLocks(root);
    },
    qHtml(q, i) {
      const s = PQ.session; const a = s.answers[i]; const graded = s.mode === 'practice' ? !!a : s.submitted;
      const T = QZ.TOPICS[q.topic];
      let body;
      if (q.type === 'mc') {
        body = `<div class="q-opts">${q.options.map((o, k) => { let cls = ''; if (a && a.sel === k) cls += ' selected'; if (graded) { if (k === q.answer) cls += ' correct'; else if (a && a.sel === k) cls += ' wrong'; } return `<button class="q-opt${cls}" data-action="mc" data-q="${i}" data-i="${k}" ${graded ? 'disabled' : ''}><span class="letter">${LETTERS[k]}</span><span>${o}</span></button>`; }).join('')}</div>`;
      } else {
        body = `<div class="q-numrow"><input class="input mono" data-q="${i}" id="num-${q.id}" placeholder="e.g. 3/8, -0.375, 2pi" value="${a ? esc(a.raw) : ''}" ${graded ? 'disabled' : ''}><button class="btn" data-action="check-num" data-q="${i}" ${graded ? 'disabled' : ''}>${icon('check', 14)} ${s.mode === 'practice' ? 'Check' : 'Save answer'}</button>${a && !graded ? '<span class="chip good">saved</span>' : ''}</div>`;
      }
      const askBo = graded && !(a && a.ok) && App.askBoButton ? App.askBoButton(D.id, q, a ? (q.type === 'mc' ? (a.sel != null && q.options[a.sel] != null ? `${LETTERS[a.sel]}` : '') : a.raw) : '') : '';   // a chat with Bo about the one they missed
      const fb = graded && a ? `<div class="q-feedback ${a.ok ? 'ok' : 'no'}"><b class="res">${a.ok ? '✓ Correct' : `✕ Not quite${q.type === 'num' ? ` — the answer is $${q.answerTex}$` : ` — the answer is ${LETTERS[q.answer]}`}`}</b><div>${q.explanation}</div>${askBo}</div>`
        : graded && !a ? `<div class="q-feedback no"><b class="res">Not answered${q.type === 'num' ? ` — the answer is $${q.answerTex}$` : ` — the answer is ${LETTERS[q.answer]}`}</b><div>${q.explanation}</div>${askBo}</div>` : '';
      const lvl = (s.ladder && s.ladder[i]) || 0; const assisted = a && a.assisted;
      const ladder = s.mode === 'practice' && !graded ? App.ladderHtml(q, lvl, i) : (s.mode === 'practice' && graded && lvl > 0 ? `<div class="small muted mt-1">${assisted ? 'Solved with the full solution shown (not counted toward accuracy).' : `You used ${lvl} hint${lvl === 1 ? '' : 's'}.`}</div>` : '');
      return `<div class="q-card${graded && a ? (a.ok ? ' correct' : ' wrong') : ''}" id="qc-${q.id}"><div class="q-top"><span class="q-num">Q${i + 1}</span><span class="chip accent">${esc(App.secLabel(T.sec))} · ${esc(T.label)}</span>${assisted ? '<span class="chip warn">assisted</span>' : ''}${App.flagButton ? App.flagButton({ course: D.id, view: 'Practice', ref: T.label, prompt: q.prompt, answer: a ? String(a.given !== undefined ? a.given : a.text !== undefined ? a.text : a.sel !== undefined ? 'option ' + (a.sel + 1) : '') : '' }) : ''}</div><div class="q-prompt">${q.prompt}</div>${ladder}${body}${fb}</div>`;
    },
    answerMC(root, qi, k) {
      const s = PQ.session; if (s.submitted) return; const q = s.questions[qi]; if (s.mode === 'practice' && s.answers[qi]) return;
      const assistedMC = s.mode === 'practice' && s.ladder && (s.ladder[qi] || 0) >= App.ladder(q).length;
      s.answers[qi] = { sel: k, ok: k === q.answer, assisted: assistedMC };
      if (s.mode === 'practice') { const ok = s.answers[qi].ok; if (!assistedMC) App.recordAnswer(q.topic, ok); else App.markActivity(); if (!ok && App.recordMistake) App.recordMistake(q, D.id, 'practice'); this.combo(s, ok && !assistedMC); this.paintSession(root); this.flash(root, q, ok); this.scrollTo(root, q); }
      else this.repaintQ(root, qi);
    },
    answerNum(root, qi) {
      const s = PQ.session; if (s.submitted) return; const q = s.questions[qi]; if (s.mode === 'practice' && s.answers[qi]) return;
      const inp = $(`#num-${q.id}`, root); const raw = inp.value.trim(); const v = parseNumber(raw);
      if (isNaN(v)) { inp.classList.add('invalid'); toast('Enter a number, fraction, or expression like 2pi'); return; }
      const tol = q.tol ? Math.max(q.tol * Math.abs(q.answer), 1e-9) : Math.max(0.011, 0.005 * Math.abs(q.answer));
      const assistedNum = s.mode === 'practice' && s.ladder && (s.ladder[qi] || 0) >= App.ladder(q).length;
      s.answers[qi] = { raw, val: v, ok: Math.abs(v - q.answer) <= tol, assisted: assistedNum };
      if (s.mode === 'practice') { const ok = s.answers[qi].ok; if (!assistedNum) App.recordAnswer(q.topic, ok); else App.markActivity(); if (!ok && App.recordMistake) App.recordMistake(q, D.id, 'practice'); this.combo(s, ok && !assistedNum); this.paintSession(root); this.flash(root, q, ok); this.scrollTo(root, q); }
      else this.repaintQ(root, qi);
    },
    repaintQ(root, qi, ok) { const q = PQ.session.questions[qi]; const old = $(`#qc-${q.id}`, root); if (!old) return; const tmp = document.createElement('div'); tmp.innerHTML = this.qHtml(q, qi); old.replaceWith(tmp.firstElementChild); const nq = $(`#qc-${q.id}`, root); if (nq && ok !== undefined) nq.classList.add(ok ? 'pop' : 'shake'); typeset(nq); },
    flash(root, q, ok) { const nq = $(`#qc-${q.id}`, root); if (nq) nq.classList.add(ok ? 'pop' : 'shake'); },
    combo(s, ok) { if (ok) { s.combo = (s.combo || 0) + 1; s.best = Math.max(s.best || 0, s.combo); if (s.combo % 5 === 0 && App.addXP) { App.addXP(5, { silent: true }); App.toast(`${App.icon('fire', 14)} ${s.combo} in a row! +5 XP bonus`, 2600); } if (App.quest) App.quest('combo', s.combo); } else s.combo = 0; },
    scrollTo(root, q) { const el = $(`#qc-${q.id}`, root); if (el) setTimeout(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30); },
    submit(root) {
      const s = PQ.session; if (!s || s.submitted) return; s.submitted = true; if (s.timer) clearInterval(s.timer);
      s.questions.forEach((q, i) => { const a = s.answers[i]; App.recordAnswer(q.topic, !!(a && a.ok)); });
      if (s.external && PQ.external && PQ.external.onSubmit) { const correct = s.questions.filter((q, i) => s.answers[i] && s.answers[i].ok).length; try { PQ.external.onSubmit(correct, s.questions.length, PQ.minutes * 60 - s.left, s.questions.map((q, i) => ({ topic: q.topic, ok: !!(s.answers[i] && s.answers[i].ok) }))); } catch (e) { console.error(e); } }
      this.paintSession(root); window.scrollTo({ top: 0, behavior: 'smooth' });
      const nOk = s.questions.filter((q, i) => s.answers[i] && s.answers[i].ok).length; if (s.questions.length && nOk / s.questions.length >= 0.8 && App.confetti) setTimeout(() => App.confetti(), 250);
    },
    summaryHtml(s) {
      const n = s.questions.length, correct = s.questions.filter((q, i) => s.answers[i] && s.answers[i].ok).length;
      const pct = Math.round(100 * correct / n);
      const byTopic = {}; s.questions.forEach((q, i) => { const t = byTopic[q.topic] = byTopic[q.topic] || { a: 0, c: 0 }; t.a++; if (s.answers[i] && s.answers[i].ok) t.c++; });
      const letter = D.GRADING.scale.find(x => pct >= x.min)?.letter || 'F';
      return `<div class="grid cols-3"><div class="stat"><div class="grade-letter">${letter}</div><div class="stat-label">on the syllabus scale</div></div><div class="stat"><div class="stat-num">${correct}/${n}</div><div class="stat-label">${pct}% correct · ${fmtClock(PQ.minutes * 60 - s.left)} used</div></div><div class="row"><button class="btn" data-action="retry-missed">${icon('target', 14)} Retry missed topics</button><button class="btn primary" data-action="new-set">${icon('rotate', 14)} New exam</button></div></div>
        <div class="divider"></div><div class="table-wrap"><table class="table compact"><thead><tr><th>Topic</th><th class="num">Score</th><th></th></tr></thead><tbody>${Object.entries(byTopic).sort((a, b) => a[1].c / a[1].a - b[1].c / b[1].a).map(([t, v]) => `<tr><td>${esc(App.secLabel(QZ.TOPICS[t].sec))} · ${esc(QZ.TOPICS[t].label)}</td><td class="num">${v.c}/${v.a}</td><td>${v.c === v.a ? '<span class="chip good">solid</span>' : v.c / v.a >= 0.5 ? '<span class="chip warn">review</span>' : '<span class="chip bad">study</span>'}</td></tr>`).join('')}</tbody></table></div>`;
    }
  };
  const fmtClock = sec => { sec = Math.max(0, sec); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; };

  /* ======================================================
     VIEW: Exam prep
     ====================================================== */
  App.views.exam = {
    title: 'Exam prep',
    render(root, param) {
      if (!(D.EXAMS || []).length) { root.innerHTML = pageHead('Exam prep', `${esc(D.short)} has no exams.`) + `<div class="empty">This class is graded on assignments and quizzes, so there is nothing to prep here. Use the quizzer and flashcards to review topics.</div>`; return; }
      const exId = D.EXAMS.some(e => e.id === param) ? param : (App.nextExam() || D.EXAMS[0]).id;
      const ex = D.EXAMS.find(e => e.id === exId);
      const t = App.todayISO(); const n = App.daysBetween(t, ex.date);
      const cl = store.get('checklists', {}); const st = cl[exId] || {};
      const items = D.CHECKLISTS[exId] || [];
      const doneAll = store.get('practiceDone', {}); const done = doneAll[exId] || {};
      const filter = this.filter || 'all';
      const SET = D.PRACTICE && D.PRACTICE[exId];
      const hasGraph = SET && SET.problems.some(p => p.graph);
      const probs = SET ? SET.problems.filter(p => filter === 'all' || (filter === 'calc' ? !p.graph : p.graph)) : [];
      const doneCount = SET ? SET.problems.filter(p => done[p.n]).length : 0;
      root.innerHTML = pageHead('Exam prep', `${esc(ex.name)} · ${esc(ex.dateLabel || App.fmtDate(ex.date, true))} · ${n < 0 ? 'done' : App.relDays(n)} · covers ${esc(ex.covers)}.`,
        `<div class="row">${D.EXAMS.map(e => `<a class="btn sm${e.id === exId ? ' active' : ''}" href="${L('exam', e.id)}">${esc(e.name)}</a>`).join('')}</div>`) + `
        <div class="grid cols-3">
          <div class="panel">
            <div class="panel-h"><div class="panel-title">${icon('list')} Prep checklist</div><span class="chip ${items.length && Object.values(st).filter(Boolean).length === items.length ? 'good' : ''}">${Object.values(st).filter(Boolean).length}/${items.length}</span></div>
            ${items.map((it, i) => `<label class="check${st[i] ? ' done' : ''}"><input type="checkbox" data-i="${i}" ${st[i] ? 'checked' : ''}><span>${esc(it)}</span></label>`).join('')}
            <div class="divider"></div>
            <a class="btn primary" href="${L('practice', null, { exam: exId })}" style="width:100%">${icon('list', 14)} Drill ${esc(ex.name)} topics</a>
            <a class="btn mt-1" href="${L('flashcards', null, { unit: ex.units[ex.units.length - 1] })}" style="width:100%">${icon('cards', 14)} Flashcards</a>
            <a class="btn mt-1" href="${L('formulas')}" style="width:100%">${icon('sigma', 14)} Formula sheet</a>
          </div>
          <div class="panel span-2">
            ${SET ? `
            <div class="panel-h"><div><div class="panel-title">${icon('flag')} ${esc(SET.title)}</div><p class="small muted">${esc(SET.subtitle)}</p></div>
              <div class="row"><span class="chip">${doneCount}/${SET.problems.length} done</span>${hasGraph ? `<div class="tabs" style="margin:0;border:0">${[['all', 'All ' + SET.problems.length], ['calc', 'Computational'], ['graph', 'Graph-based']].map(([k, l]) => `<button class="tab${filter === k ? ' active' : ''}" data-action="filter" data-f="${k}">${l}</button>`).join('')}</div>` : ''}<button class="btn sm" data-action="print">${icon('print', 13)} Print</button></div></div>
            <div class="callout mb-2 small">${hasGraph ? 'Graph-based problems refer to figures in the PDF; for those the solution here describes exactly what to read off the graph and how to justify it. ' : ''}Work each problem on paper first, then reveal.</div>
            <div class="stack">${probs.map((p, pi) => { const locked = App.guest() && pi >= 2; return `<div class="q-card" id="pe-${p.n}"><div class="q-top"><label class="check" style="padding:0"><input type="checkbox" data-done="${p.n}" ${done[p.n] ? 'checked' : ''}><span class="q-num">Problem ${p.n}</span></label><span class="chip accent">${esc(App.secLabel(p.sec))}</span>${p.tags.map(tg => QZ.TOPICS[tg] ? `<span class="chip">${esc(QZ.TOPICS[tg].label)}</span>` : '').join('')}${p.graph ? '<span class="chip warn">graph in PDF</span>' : ''}${locked ? `<button class="btn xs" data-action="auth-signup" style="margin-left:auto">${icon('flag', 12)} Solution (members)</button>` : `<button class="btn xs" data-action="sol" data-n="${p.n}" style="margin-left:auto">${icon('eye', 12)} Solution</button>`}</div><div class="q-prompt">${p.q}</div>${locked ? '' : (() => { const steps = App.splitSteps(p.s); return `<div class="reveal q-feedback ok" id="pes-${p.n}" style="background:var(--surface-2);border-color:var(--border)"><b class="res">Solution${steps.length > 1 ? ` <span class="small muted" style="font-weight:400">· ${steps.length} steps</span>` : ''}</b><div class="steps">${steps.map((st, k) => `<div class="step${k === 0 ? '' : ' hidden'}" data-k="${k}">${st}</div>`).join('')}</div>${steps.length > 1 ? `<div class="row gap-sm mt-1"><button class="btn xs" data-action="step" data-n="${p.n}">${icon('right', 12)} Next step</button><button class="btn xs ghost" data-action="steps-all" data-n="${p.n}">Show all</button></div>` : ''}</div>`; })()}</div>`; }).join('')}</div>${App.guest() && probs.length > 2 ? `<div class="mt-2">${App.lockCard('Worked solutions are for members', `The preview shows solutions for the first two problems. Sign up free for all ${SET.problems.length} worked solutions and a checklist that syncs across devices.`)}</div>` : ''}`
            : `<div class="panel-h"><div class="panel-title">${icon('flag')} ${esc(ex.name)} practice</div></div><div class="empty">No practice set is loaded for ${esc(ex.name)} yet. Use the checklist, drill the exam’s topics in the Quizzer, and redo the homework listed in the syllabus. When a practice set is posted, it can be added here.</div>
              <div class="mt-2"><div class="eyebrow mb-1">Topics on this exam</div><div class="link-grid">${ex.sections.map(id => { const s = App.secById(id); return s ? `<a class="card-link" href="${L('notes', s.id)}" style="padding:10px 12px"><h4 style="font-size:14px">${esc(s.label)} ${esc(s.title)}</h4></a>` : ''; }).join('')}</div></div>`}
          </div>
        </div>`;
      on(root, 'change', 'input[data-i]', el => { const c = store.get('checklists', {}); const s = c[exId] || {}; s[el.dataset.i] = el.checked; c[exId] = s; store.set('checklists', c); el.closest('.check').classList.toggle('done', el.checked); App.markActivity(); });
      on(root, 'change', 'input[data-done]', el => { const all = store.get('practiceDone', {}); const d = all[exId] || {}; d[el.dataset.done] = el.checked; all[exId] = d; store.set('practiceDone', all); App.markActivity(); });
      bind(root, {
        sol: el => { const s = $(`#pes-${el.dataset.n}`, root); s.classList.toggle('open'); el.innerHTML = s.classList.contains('open') ? `${icon('eye', 12)} Hide` : `${icon('eye', 12)} Solution`; },
        step: el => { const box = $(`#pes-${el.dataset.n}`, root); const nxt = $('.step.hidden', box); if (nxt) { nxt.classList.remove('hidden'); typeset(nxt); } if (!$('.step.hidden', box)) el.remove(); },
        'steps-all': el => { const box = $(`#pes-${el.dataset.n}`, root); $$('.step.hidden', box).forEach(x => x.classList.remove('hidden')); typeset(box); el.closest('.row').remove(); },
        filter: el => { this.filter = el.dataset.f; this.render(root, exId); typeset(root); },
        print: () => { $$('.reveal', root).forEach(r => r.classList.add('open')); $$('.step.hidden', root).forEach(x => x.classList.remove('hidden')); window.print(); }
      });
    }
  };

  /* ======================================================
     VIEW: Scratchpad
     ====================================================== */
  const PAD = { color: 'ink', size: 3, eraser: false, grid: true, strokes: null, cur: null, course: null };
  const PAD_COLORS = [['ink', 'Ink'], ['accent', 'Blue'], ['good', 'Green'], ['bad', 'Red'], ['gold', 'Gold']];
  App.views.scratchpad = {
    title: 'Scratchpad',
    render(root) {
      if (!PAD.strokes || PAD.course !== D.id) { PAD.strokes = store.get('scratch', []); PAD.course = D.id; }
      root.innerHTML = pageHead('Scratchpad', 'Work a problem by hand with a mouse, trackpad or stylus. Strokes are saved in this browser until you clear them.') + `
        <div class="panel">
          <div class="pad-tools">
            ${PAD_COLORS.map(([k, l]) => `<button class="swatch${PAD.color === k && !PAD.eraser ? ' on' : ''}" data-action="color" data-c="${k}" title="${l}" style="background:var(--${k})"></button>`).join('')}
            <span class="sizes">${[2, 4, 8].map(s => `<button class="size-btn${PAD.size === s ? ' on' : ''}" data-action="size" data-s="${s}" title="Pen ${s}px"><i style="width:${s + 4}px;height:${s + 4}px"></i></button>`).join('')}</span>
            <button class="btn sm${PAD.eraser ? ' active' : ''}" data-action="eraser">Eraser</button>
            <button class="btn sm" data-action="undo">${icon('undo', 13)} Undo</button>
            <button class="btn sm${PAD.grid ? ' active' : ''}" data-action="grid">Grid</button>
            <span style="flex:1"></span>
            <button class="btn sm" data-action="save">${icon('download', 13)} Save PNG</button>
            <button class="btn sm danger" data-action="clear">${icon('trash', 13)} Clear</button>
          </div>
          <canvas class="pad${PAD.grid ? ' grid' : ''}" id="pad"></canvas>
        </div>`;
      const canvas = $('#pad', root);
      const colorOf = k => cssVar('--' + k);
      const redraw = () => {
        const { ctx, W, H } = fitCanvas(canvas); ctx.clearRect(0, 0, W, H);
        for (const s of PAD.strokes) this.stroke(ctx, s, W, H);
      };
      this.stroke = (ctx, s, W, H, from = 0) => {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
        ctx.strokeStyle = s.erase ? '#000' : colorOf(s.color); ctx.lineWidth = s.erase ? s.size * 6 : s.size;
        const p = s.pts; if (p.length < 2) { ctx.beginPath(); ctx.arc(p[0][0] * W, p[0][1] * H, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill(); ctx.globalCompositeOperation = 'source-over'; return; }
        ctx.beginPath(); const st = Math.max(1, from); ctx.moveTo(p[st - 1][0] * W, p[st - 1][1] * H); for (let i = st; i < p.length; i++) ctx.lineTo(p[i][0] * W, p[i][1] * H); ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
      };
      const norm = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
      canvas.addEventListener('pointerdown', e => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); PAD.cur = { color: PAD.color, size: PAD.size, erase: PAD.eraser, pts: [norm(e)] }; const { ctx, W, H } = fitCanvas(canvas); this.stroke(ctx, PAD.cur, W, H); });
      canvas.addEventListener('pointermove', e => { if (!PAD.cur) return; PAD.cur.pts.push(norm(e)); const { ctx, W, H } = fitCanvas(canvas); this.stroke(ctx, PAD.cur, W, H, PAD.cur.pts.length - 1); });
      const finish = () => { if (!PAD.cur) return; PAD.strokes.push(PAD.cur); PAD.cur = null; if (PAD.strokes.length > 600) PAD.strokes.splice(0, PAD.strokes.length - 600); store.set('scratch', PAD.strokes); };
      canvas.addEventListener('pointerup', finish); canvas.addEventListener('pointercancel', finish); canvas.addEventListener('pointerleave', finish);
      bind(root, {
        color: el => { PAD.color = el.dataset.c; PAD.eraser = false; this.render(root); },
        size: el => { PAD.size = +el.dataset.s; this.render(root); },
        eraser: () => { PAD.eraser = !PAD.eraser; this.render(root); },
        grid: () => { PAD.grid = !PAD.grid; this.render(root); },
        undo: () => { PAD.strokes.pop(); store.set('scratch', PAD.strokes); redraw(); },
        clear: () => { if (!PAD.strokes.length || confirm('Clear the scratchpad?')) { PAD.strokes = []; store.set('scratch', []); redraw(); } },
        save: () => { const out = document.createElement('canvas'); out.width = canvas.width; out.height = canvas.height; const ctx = out.getContext('2d'); ctx.fillStyle = cssVar('--surface'); ctx.fillRect(0, 0, out.width, out.height); ctx.drawImage(canvas, 0, 0); try { const a = document.createElement('a'); a.href = out.toDataURL('image/png'); a.download = `scratchpad-${App.todayISO()}.png`; a.click(); toast('PNG saved'); } catch { toast('Could not save in this browser'); } }
      });
      this.resize = redraw; window.addEventListener('resize', this.resize);
      redraw();
    },
    unmount() { window.removeEventListener('resize', this.resize); }
  };
})(window);

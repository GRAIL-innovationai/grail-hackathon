/* ============================================================
   Mathub — exam readiness
   One number per class that answers "am I ready for the next exam?",
   built from what the student has actually done: practice accuracy
   and volume per topic on the exam, flashcard boxes for those
   sections, and the exam checklist. Shown as a gauge on the class
   dashboard, in Today's class table and on the landing cards, with
   the three weakest topics and what to do about them.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { esc, icon, store } = App; const Courses = global.Courses;
  const dataOf = id => (store.id === id ? store.data : store.peek(id)) || {};
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  /* topic score 0..1: accuracy weighted by how much practice there has been (15 questions = full confidence) */
  const topicScore = v => { if (!v || !v.a) return 0; const acc = v.c / v.a; const conf = clamp(v.a / 15, 0, 1); return clamp(acc * (0.55 + 0.45 * conf), 0, 1); };

  App.readiness = function (cid) {
    const C = Courses[cid]; if (!C) return null; const ex = App.nextExamOf(C); if (!ex) return { ok: false, reason: 'No exam ahead.' };
    const T = (C.quiz && C.quiz.TOPICS) || C.quizTopics || {}; if (!Object.keys(T).length) return { ok: false, reason: 'No practice topics for this class.', exam: ex };
    const secs = ex.cumulative ? (C.SECTIONS || []).map(s => s.id) : (ex.sections || []); const secSet = new Set(secs);
    const topics = Object.keys(T).filter(t => secSet.has(T[t].sec)); if (!topics.length) return { ok: false, reason: 'No topics matched.', exam: ex };
    const d = dataOf(cid); const p = d.progress || {}; const boxes = d.flashcards || {};
    const per = topics.map(t => ({ t, label: T[t].label, sec: T[t].sec, score: topicScore(p[t]), a: (p[t] || {}).a || 0, acc: p[t] && p[t].a ? (p[t].c / p[t].a) : null }));
    const topicPart = per.reduce((s, x) => s + x.score, 0) / per.length;
    let cardPart = null; if (C.FLASHCARDS && C.FLASHCARDS.length) { const cards = C.FLASHCARDS.filter(c => secSet.has(c.sec)); if (cards.length) cardPart = cards.reduce((s, c) => s + clamp((boxes[c.id] || 0) / 3, 0, 1), 0) / cards.length; }
    else if (C.flashcardCount && Object.keys(boxes).length) { const vals = Object.values(boxes); cardPart = clamp(vals.reduce((s, b) => s + clamp(b / 3, 0, 1), 0) / Math.max(vals.length, Math.round(C.flashcardCount * secs.length / Math.max(1, (C.SECTIONS || []).length))), 0, 1); }
    let checkPart = null; { const items = (C.CHECKLISTS && C.CHECKLISTS[ex.id]) || []; if (items.length) { const st = (d.checklists || {})[ex.id] || {}; checkPart = items.filter((_, i) => st[i]).length / items.length; } }
    const parts = [[topicPart, 0.6], [cardPart, 0.25], [checkPart, 0.15]].filter(x => x[0] !== null); const wsum = parts.reduce((s, x) => s + x[1], 0);
    const score = Math.round(100 * parts.reduce((s, x) => s + x[0] * x[1], 0) / wsum);
    const label = score >= 85 ? 'Ready' : score >= 65 ? 'On track' : score >= 35 ? 'Getting there' : score > 0 ? 'Just started' : 'Not started';
    const weakest = per.slice().sort((a, b) => a.score - b.score || a.a - b.a).slice(0, 3);
    const days = App.daysBetween(App.todayISO(), ex.date);
    return { ok: true, exam: ex, days, score, label, topicPart: Math.round(100 * topicPart), cardPart: cardPart === null ? null : Math.round(100 * cardPart), checkPart: checkPart === null ? null : Math.round(100 * checkPart), weakest, topics: per, practiced: per.filter(x => x.a > 0).length, total: per.length };
  };
  App.readinessTone = s => s >= 85 ? 'good' : s >= 65 ? 'accent' : s >= 35 ? 'gold' : 'bad';
  /* gauge: a 270° arc */
  App.readinessGauge = function (r, size = 92, opts = {}) {
    const s = r && r.ok ? r.score : 0; const R = 40; const C = 2 * Math.PI * R; const arc = C * 0.75; const off = arc * (1 - s / 100);
    const tone = App.readinessTone(s); const color = { good: 'var(--good)', accent: 'var(--accent)', gold: 'var(--gold)', bad: 'var(--bad)' }[tone];
    return `<div class="ready-gauge${opts.compact ? ' compact' : ''}" title="${r && r.ok ? `${s}% ready for ${esc(r.exam.name)}` : 'Readiness'}"><svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><circle class="rg-bg" cx="50" cy="50" r="${R}" stroke-dasharray="${arc.toFixed(1)} ${C.toFixed(1)}" transform="rotate(135 50 50)"/><circle class="rg-fg" cx="50" cy="50" r="${R}" stroke="${color}" stroke-dasharray="${arc.toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(135 50 50)" style="--rg-arc:${arc.toFixed(1)}"/></svg><div class="rg-txt"><b class="count" data-count="${s}">${s}</b><small>${opts.compact ? 'ready' : '% ready'}</small></div></div>`;
  };
  /* dashboard panel: gauge + parts + weakest topics with links */
  App.readinessPanel = function (cid) {
    const r = App.readiness(cid); const C = Courses[cid]; if (!r || !r.ok) return '';
    const link = (view, q) => `#/${cid}/${view}${q ? '?' + q : ''}`;
    const tips = r.weakest.map(w => `<a class="ready-tip" href="${w.a < 5 ? link('lesson', 'topics=' + encodeURIComponent(w.t)) : link('practice', 'topics=' + encodeURIComponent(w.t))}"><span class="chip ${!w.a ? '' : w.score < 0.35 ? 'bad' : w.score < 0.65 ? 'warn' : 'good'} xs">${w.a ? Math.round(100 * (w.acc || 0)) + '%' : 'new'}</span><span class="rt-body"><b>${esc(w.label)}</b><small>${w.a ? `${w.a} question${w.a === 1 ? '' : 's'} so far · ${w.a < 5 ? 'take the lesson' : 'practice this'}` : 'not practiced yet · start with the lesson'}</small></span>${icon('right', 13)}</a>`).join('');
    return `<div class="panel ready-panel"><div class="panel-h"><div class="panel-title">${icon('target')} Exam readiness</div><span class="small muted">${esc(r.exam.name)} · ${r.days === 0 ? 'today' : r.days === 1 ? 'tomorrow' : r.days > 0 ? `in ${r.days} days` : 'passed'}</span></div>
      <div class="ready-row">${App.readinessGauge(r, 110)}<div class="ready-parts"><div class="ready-label ${App.readinessTone(r.score)}">${esc(r.label)}</div><div class="ready-bars"><div><span>Practice · ${r.practiced} of ${r.total} topics</span><div class="bar sm"><div class="bar-fill" style="width:${r.topicPart}%"></div></div></div>${r.cardPart !== null ? `<div><span>Flashcards</span><div class="bar sm"><div class="bar-fill" style="width:${r.cardPart}%"></div></div></div>` : ''}${r.checkPart !== null ? `<div><span>Checklist</span><div class="bar sm"><div class="bar-fill" style="width:${r.checkPart}%"></div></div></div>` : ''}</div></div></div>
      <div class="eyebrow mt-2 mb-1">Raise it fastest</div><div class="ready-tips">${tips}</div>
      <div class="row gap-sm mt-2" style="flex-wrap:wrap"><a class="btn sm primary" href="${link('practice')}">${icon('list', 13)} Mixed practice</a>${C.quiz || C.hasQuiz ? `<a class="btn sm" href="${link('blitz')}">${icon('zap', 13)} Blitz</a>` : ''}<a class="btn sm" href="${link('exam')}">${icon('flag', 13)} Exam prep</a></div></div>`;
  };
})(window);

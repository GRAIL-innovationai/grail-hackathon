/* ============================================================
   Mathub — Study planner
   Pick an exam and the days you can study; the planner spreads the
   exam's topics, flashcard decks, practice sets and a final review
   across those days as a checklist. Saved per class and synced.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, on, toast, store, pageHead } = App;
  const L = App.link;
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function build(D, ex, startISO, dows) {
    const days = []; let d = App.parseISO(startISO); const last = App.addDays(App.parseISO(ex.date), -1);
    while (d <= last) { if (dows.includes(d.getDay())) days.push(App.toISO(d)); d = App.addDays(d, 1); }
    if (!days.length) return null;
    const secs = (ex.cumulative ? D.SECTIONS.map(s => s.id) : ex.sections).filter(id => App.secById(id));
    const units = [...new Set(secs.map(id => App.secById(id).unit))];
    const items = []; const add = (date, type, label, link, extra = {}) => items.push(Object.assign({ id: uid(), date, type, label, link, done: false }, extra));
    const reviewDays = Math.max(1, Math.min(3, Math.round(days.length * 0.3))); const learnDays = days.slice(0, days.length - reviewDays); const finalDays = days.slice(days.length - reviewDays);
    if (learnDays.length) {
      const per = Math.ceil(secs.length / learnDays.length); let k = 0;
      learnDays.forEach((date, i) => {
        const chunk = secs.slice(k, k + per); k += per;
        chunk.forEach(id => { const s = App.secById(id); const topics = App.topicsForSection(id); add(date, 'notes', `Read notes: ${s.label} ${s.title}`, L('notes', id), { sec: id }); if (topics.length) add(date, 'quiz', `Practice ${s.label} (${topics.length} topic${topics.length === 1 ? '' : 's'})`, L('practice', null, { topics: topics.join(',') }), { sec: id }); });
        if (i % 2 === 1 || learnDays.length <= 2) { const u = chunk.length ? App.secById(chunk[chunk.length - 1]).unit : units[units.length - 1]; add(date, 'cards', `Flashcards: Unit ${u}`, L('flashcards', null, { unit: u })); }
        if (!chunk.length) add(date, 'review', 'Smart review of everything so far', L('practice', null, { smart: 1 }));
      });
    } else { secs.forEach(id => { const s = App.secById(id); add(days[0], 'notes', `Skim notes: ${s.label} ${s.title}`, L('notes', id), { sec: id }); }); }
    const hasSet = D.PRACTICE && D.PRACTICE[ex.id];
    finalDays.forEach((date, i) => {
      const lastDay = i === finalDays.length - 1;
      if (hasSet) add(date, 'set', finalDays.length > 1 ? `${ex.name} practice set: part ${i + 1} of ${finalDays.length}` : `${ex.name} practice set`, L('exam', ex.id));
      add(date, 'review', 'Smart review: weakest topics', L('practice', null, { smart: 1 }));
      if (lastDay) { add(date, 'formulas', 'Rewrite the formula sheet from memory', L('formulas')); add(date, 'cards', 'Flashcards: everything on the exam', L('flashcards', null, { unit: units.length === 1 ? units[0] : 0 })); add(date, 'checklist', `Finish the ${ex.name} prep checklist`, L('exam', ex.id)); add(date, 'rest', 'Stop by 9 pm. Sleep beats cramming.', null); }
      else add(date, 'quiz', `Timed exam-mode set on ${ex.name} topics`, L('practice', null, { exam: ex.id }));
    });
    return { examId: ex.id, start: startISO, dows, created: Date.now(), days, items };
  }
  const ICON = { notes: 'book', quiz: 'list', cards: 'cards', set: 'flag', review: 'target', formulas: 'sigma', checklist: 'check', rest: 'clock' };

  App.planToday = function () {
    const plan = store.get('plan', null); if (!plan || !plan.items) return null;
    const D = App.D; const ex = D.EXAMS.find(e => e.id === plan.examId); if (!ex || ex.date < App.todayISO()) return null;
    const t = App.todayISO(); let date = plan.days.find(d => d >= t); if (!date) return null;
    const items = plan.items.filter(i => i.date === date); const done = plan.items.filter(i => i.done).length;
    return { plan, ex, date, items, total: plan.items.length, done, isToday: date === t };
  };

  App.views.planner = {
    title: 'Study planner',
    blurb: 'Pick an exam and the days you can study. The planner spreads the topics, flashcards and practice across those days as a checklist.',
    preview: [['Day by day', 'Notes, drills and decks assigned to specific days'], ['Final review', 'Practice set, timed drill, formulas and checklist before the exam'], ['Synced', 'Ticks follow you across devices']],
    render(root, param, query) {
      const D = App.D; const t = App.todayISO();
      const plan = store.get('plan', null); const exams = D.EXAMS.filter(e => (e.endDate || e.date) >= t);
      const S = this.setup = this.setup || {}; const defEx = (plan && exams.find(e => e.id === plan.examId)) || App.nextExam() || exams[0];
      S.examId = S.examId && exams.find(e => e.id === S.examId) ? S.examId : (defEx ? defEx.id : null); S.start = S.start || t; S.dows = S.dows || [0, 1, 2, 3, 4, 5, 6];
      const ex = exams.find(e => e.id === S.examId);
      const setupHtml = !exams.length ? '<div class="empty">No exams left this semester. Nice work.</div>' : `<div class="grid cols-3" style="gap:12px">
          <div class="field"><label for="pl-exam">Exam</label><select class="select" id="pl-exam">${exams.map(e => `<option value="${e.id}"${e.id === S.examId ? ' selected' : ''}>${esc(e.name)} · ${esc(App.fmtDate(e.date))}</option>`).join('')}</select></div>
          <div class="field"><label for="pl-start">Start on</label><input class="input" type="date" id="pl-start" value="${S.start}" min="${t}" max="${ex ? ex.date : ''}"></div>
          <div class="field"><label>Study days</label><div class="chips">${DOW.map((n, i) => `<span class="chip toggle${S.dows.includes(i) ? ' on' : ''}" data-action="dow" data-d="${i}">${n}</span>`).join('')}</div></div></div>
        <div class="row gap-sm mt-2"><button class="btn primary" data-action="generate">${icon('calendar', 14)} ${plan ? 'Regenerate plan' : 'Build my plan'}</button>${plan ? `<button class="btn ghost" data-action="clear">Clear plan</button>` : ''}<span class="small muted">${ex ? `${App.daysBetween(t, ex.date)} days until ${esc(ex.name)}.` : ''}</span></div>`;
      root.innerHTML = pageHead('Study planner', this.blurb) + `<div class="panel mb-2"><div class="panel-h"><div class="panel-title">${icon('sliders')} Set up</div></div>${setupHtml}</div><div id="pl-plan"></div>`;
      this.paintPlan(root);
      const sel = $('#pl-exam', root); if (sel) sel.addEventListener('change', e => { S.examId = e.target.value; this.render(root); });
      const st = $('#pl-start', root); if (st) st.addEventListener('change', e => { S.start = e.target.value || t; });
      bind(root, {
        dow: el => { const d = +el.dataset.d; const i = S.dows.indexOf(d); if (i >= 0) { if (S.dows.length > 1) S.dows.splice(i, 1); } else S.dows.push(d); S.dows.sort(); el.classList.toggle('on', S.dows.includes(d)); },
        generate: () => { const e = exams.find(x => x.id === S.examId); if (!e) return; if (store.get('plan', null) && !confirm('Replace your current plan? Ticks will be reset.')) return; const p = build(D, e, S.start < t ? t : S.start, S.dows); if (!p) { toast('No study days between the start date and the exam. Pick more days.', 3500); return; } store.set('plan', p); App.markActivity(); this.render(root); toast(`Plan built: ${p.items.length} tasks over ${p.days.length} days`, 3000); $('#pl-plan', root).scrollIntoView({ behavior: 'smooth', block: 'start' }); },
        clear: () => { if (confirm('Delete this plan?')) { store.set('plan', null); this.render(root); } },
        tick: el => { const p = store.get('plan', null); if (!p) return; const it = p.items.find(i => i.id === el.dataset.id); if (!it) return; it.done = !it.done; store.set('plan', p); App.markActivity(); this.paintPlan(root); }
      });
    },
    paintPlan(root) {
      const box = $('#pl-plan', root); const D = App.D; const t = App.todayISO(); const plan = store.get('plan', null);
      if (!plan || !plan.items) { box.innerHTML = `<div class="panel"><div class="empty">No plan yet. Choose an exam and your study days above, then build one. You can tick tasks off from the dashboard too.</div></div>`; return; }
      const ex = D.EXAMS.find(e => e.id === plan.examId); const done = plan.items.filter(i => i.done).length; const pct = Math.round(100 * done / plan.items.length);
      const byDay = {}; plan.items.forEach(i => (byDay[i.date] = byDay[i.date] || []).push(i));
      const overdue = plan.items.filter(i => !i.done && i.date < t).length;
      box.innerHTML = `<div class="panel"><div class="panel-h"><div><div class="panel-title">${icon('flag')} ${esc(ex ? ex.name : 'Plan')} · ${plan.days.length} study days</div><p class="small muted">${ex ? `${esc(ex.dateLabel || App.fmtDate(ex.date, true))} · ${App.daysBetween(t, ex.date) >= 0 ? App.relDays(App.daysBetween(t, ex.date)) : 'done'}` : ''}${overdue ? ` · <span style="color:var(--warn)">${overdue} task${overdue === 1 ? '' : 's'} behind</span>` : ''}</p></div><div class="stat"><div class="stat-num">${pct}%</div><div class="stat-label">${done} / ${plan.items.length} done</div></div></div>
        <div class="bar mb-2"><div class="bar-fill ${pct >= 80 ? 'good' : pct >= 40 ? 'warn' : ''}" style="width:${pct}%"></div></div>
        <div class="plan-days">${plan.days.map(date => { const its = byDay[date] || []; const dd = App.parseISO(date); const allDone = its.length && its.every(i => i.done); return `<div class="plan-day${date === t ? ' today' : date < t ? ' past' : ''}${allDone ? ' done' : ''}"><div class="plan-date"><b>${DOW[dd.getDay()]}</b><span>${App.shortDate(date)}</span>${date === t ? '<em>today</em>' : ''}</div><div class="plan-items">${its.map(i => `<label class="check plan-item${i.done ? ' done' : ''}"><input type="checkbox" data-action="tick" data-id="${i.id}" ${i.done ? 'checked' : ''}><span class="plan-ic">${icon(ICON[i.type] || 'list', 14)}</span><span class="plan-label">${esc(i.label)}</span>${i.link ? `<a class="btn xs" href="${i.link}">Open</a>` : ''}</label>`).join('') || '<div class="small muted">Rest day</div>'}</div></div>`; }).join('')}</div>
        <p class="small muted mt-2">Tick tasks here or on the dashboard. Rebuilding the plan resets the ticks.</p></div>`;
      on(box, 'change', 'input[data-action="tick"]', el => { const p = store.get('plan', null); if (!p) return; const it = p.items.find(i => i.id === el.dataset.id); if (!it) return; it.done = el.checked; store.set('plan', p); App.markActivity(); this.paintPlan(root); });
    }
  };
})(window);

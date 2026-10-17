/* ============================================================
   Mathub — Blitz (#/<class>/blitz)
   Ninety seconds of rapid-fire multiple-choice questions from the
   topics the class has covered so far. Combos raise the multiplier,
   a wrong answer resets it, the clock never stops. Answers still
   count toward topic progress and quests; XP comes at the end so the
   pace does not inflate leagues. Best score and plays are saved per
   class (synced), and the end screen shows which topics to review.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, toast, store, typeset } = App; const Courses = global.Courses;
  const LEN = 90; const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const B = { on: false, left: LEN, tick: null, q: null, pool: [], score: 0, combo: 0, best: 0, n: 0, correct: 0, topics: {}, cid: null, locked: false, started: 0 };
  App.blitz = B;
  const mult = () => Math.min(4, 1 + Math.floor(B.combo / 3));
  function topicsFor(C) {
    const nodes = App.pathNodes ? App.pathNodes(C) : []; const covered = nodes.filter(n => n.state !== 'soon').map(n => n.t);
    const all = Object.keys(C.quiz.TOPICS); return covered.length >= 3 ? covered : all;
  }
  function refill(C) {
    const topics = topicsFor(C); let tries = 0;
    while (B.pool.length < 6 && tries++ < 6) { const set = C.quiz.generateSet(topics, 12).filter(q => q.type === 'mc' && q.options && q.options.length >= 2); B.pool.push(...set); }
    if (!B.pool.length) { const set = C.quiz.generateSet(Object.keys(C.quiz.TOPICS), 20).filter(q => q.type === 'mc'); B.pool.push(...set); }
  }
  function start(root, cid) {
    const C = Courses[cid]; if (!C || !C.quiz) return;
    Object.assign(B, { on: true, left: LEN, q: null, pool: [], score: 0, combo: 0, n: 0, correct: 0, topics: {}, cid, locked: false, started: Date.now(), maxCombo: 0 });
    refill(C); clearInterval(B.tick); B.tick = setInterval(() => { B.left--; paintClock(root); if (B.left <= 0) end(root); }, 1000);
    if (App.sfx) App.sfx.play('tap'); next(root);
  }
  function next(root) {
    const C = Courses[B.cid]; if (B.pool.length < 3) refill(C); B.q = B.pool.shift(); B.locked = false; if (!B.q) { end(root); return; }
    const q = B.q; const T = C.quiz.TOPICS[q.topic] || {}; const stage = $('#bz-stage', root); if (!stage) return;
    stage.innerHTML = `<div class="bz-q"><div class="row between mb-1"><span class="chip accent xs">${esc(T.label || q.topic)}</span><span class="small muted">Q${B.n + 1}</span></div><div class="q-prompt">${q.prompt}</div><div class="q-opts bz-opts">${q.options.map((o, k) => `<button class="q-opt" data-action="bz-opt" data-i="${k}"><span class="letter">${LETTERS[k]}</span><span>${o}</span></button>`).join('')}</div></div>`;
    typeset(stage);
  }
  function answer(root, k) {
    if (!B.on || B.locked || !B.q) return; B.locked = true; const q = B.q; const ok = k === q.answer; const C = Courses[B.cid]; B.n++;
    const btns = $$('#bz-stage .q-opt', root); btns.forEach((b, i) => { b.disabled = true; if (i === q.answer) b.classList.add('correct'); else if (i === k) b.classList.add('wrong'); });
    const tp = B.topics[q.topic] = B.topics[q.topic] || { a: 0, c: 0 }; tp.a++; if (!ok && App.recordMistake) App.recordMistake(q, B.cid, 'blitz');
    if (ok) { B.correct++; B.combo++; B.maxCombo = Math.max(B.maxCombo || 0, B.combo); const gain = 10 * mult(); B.score += gain; tp.c++; if (App.sfx) App.sfx.play('correct'); floatScore(root, `+${gain}`); }
    else { B.combo = 0; if (App.sfx) App.sfx.play('wrong'); const st = $('.bz-score', root); if (st && App.burst) App.burst(st, 'shake'); }
    // progress without XP (XP comes at the end)
    store.poke(B.cid, d => { const p = d.progress = d.progress || {}; const t = p[q.topic] || { a: 0, c: 0 }; t.a++; if (ok) t.c++; p[q.topic] = t; const h = Array.isArray(d.history) ? d.history : (d.history = []); h.push({ t: q.topic, ok, d: App.todayISO(), k: 'bz' + Date.now().toString(36) }); if (h.length > 500) h.splice(0, h.length - 500); d.activity = d.activity || {}; d.activity[App.todayISO()] = true; });
    if (App.quest) { App.quest('answers'); if (ok) App.quest('correct'); App.quest('combo', B.combo); }
    paintScore(root); setTimeout(() => { if (B.on) next(root); }, ok ? 420 : 900);
  }
  function floatScore(root, txt) { if (App.motionReduced && App.motionReduced()) return; const el = document.createElement('div'); el.className = 'bz-float'; el.textContent = txt; const s = $('.bz-score', root); if (!s) return; s.appendChild(el); setTimeout(() => el.remove(), 900); }
  function paintClock(root) { const c = $('#bz-clock', root); if (!c) return; c.textContent = B.left; const bar = $('#bz-bar', root); if (bar) { bar.style.width = (100 * B.left / LEN) + '%'; bar.classList.toggle('low', B.left <= 15); } if (B.left === 10 && App.sfx) App.sfx.play('tap'); }
  function paintScore(root) { const s = $('#bz-score', root); if (s) s.textContent = B.score; const m = $('#bz-mult', root); if (m) { m.textContent = `×${mult()}`; m.classList.toggle('hot', mult() > 1); if (App.burst && mult() > 1) App.burst(m, 'pop'); } const cb = $('#bz-combo', root); if (cb) cb.textContent = B.combo ? `${B.combo} in a row` : ''; }
  function end(root) {
    if (!B.on) return; B.on = false; clearInterval(B.tick); const C = Courses[B.cid]; const rec = store.get('blitz', {}); const prevBest = rec.best || 0; const newBest = B.score > prevBest;
    store.set('blitz', { best: Math.max(prevBest, B.score), plays: (rec.plays || 0) + 1, last: B.score, lastAt: Date.now() });
    const xp = Math.min(50, B.correct * 2 + (newBest && B.score > 0 ? 10 : 0)); if (xp && App.addXP) App.addXP(xp, { course: B.cid });
    if (App.sfx) App.sfx.play(newBest && B.score > 0 ? 'levelup' : 'complete'); if (newBest && B.score > 0 && App.confetti) App.confetti({ count: 200 });
    const acc = B.n ? Math.round(100 * B.correct / B.n) : 0; const weak = Object.entries(B.topics).filter(([t, v]) => v.a >= 1 && v.c / v.a < 0.7).sort((a, b) => (a[1].c / a[1].a) - (b[1].c / b[1].a)).slice(0, 3);
    const stage = $('#bz-stage', root); if (!stage) return;
    stage.innerHTML = `<div class="bz-end"><div class="eyebrow bz-endlabel">${newBest && B.score > 0 ? 'New hi-score!' : 'Time up'}</div>${App.pixel ? `<div class="bz-endart">${App.pixel(newBest && B.score > 0 ? 'trophy' : 'invader', 4)}</div>` : ''}<div class="bz-final count" data-count="${B.score}">${B.score}</div><div class="bz-endstats"><div><b>${B.correct}/${B.n}</b><small>correct</small></div><div><b>${acc}%</b><small>accuracy</small></div><div><b>${B.maxCombo || 0}</b><small>best combo</small></div><div><b>+${xp}</b><small>XP</small></div></div>
      ${weak.length ? `<div class="eyebrow mt-2 mb-1">Review next</div><div class="row gap-sm" style="flex-wrap:wrap;justify-content:center">${weak.map(([t, v]) => `<a class="chip toggle" href="#/${B.cid}/lesson?topics=${encodeURIComponent(t)}">${esc((C.quiz.TOPICS[t] || {}).label || t)} · ${Math.round(100 * v.c / v.a)}%</a>`).join('')}</div>` : (B.n ? '<p class="small muted mt-2">No weak topics this round. Nice.</p>' : '')}
      <div class="row gap-sm mt-3" style="flex-wrap:wrap;justify-content:center"><button class="btn primary lg" data-action="bz-start">${icon('rotate', 16)} Play again</button>${navigator.share || navigator.clipboard ? `<button class="btn" data-action="bz-share">${icon('external', 14)} Share score</button>` : ''}<a class="btn" href="#/${B.cid}/practice">${icon('list', 14)} Slow practice</a></div></div>`;
    if (App.countUp) App.countUp(stage); if (App.motionRender) App.motionRender(stage); paintBest(root);
  }
  function paintBest(root) { const rec = store.get('blitz', {}); const b = $('#bz-best', root); if (b) b.textContent = rec.best || 0; const pl = $('#bz-plays', root); if (pl) pl.textContent = rec.plays || 0; }
  App.views.blitz = {
    title: 'Blitz', blurb: 'Ninety seconds. As many right answers as you can. Combos multiply your score.',
    render(root, param, query) {
      const D = App.D; if (!D || !D.quiz) { root.innerHTML = App.pageHead('Blitz', 'Blitz needs a class with practice questions.') + '<div class="empty">This class has no quiz generators yet.</div>'; return; }
      const rec = store.get('blitz', {}); const topics = topicsFor(D);
      root.innerHTML = App.pageHead(`${icon('zap', 22)} Blitz`, `${this.blurb} Questions come from the ${topics.length} topics covered so far in ${esc(D.short)}. Keys 1 to 4 answer.`) + `<div class="bz-wrap">
        <div class="bz-hud"><div class="bz-score"><span class="eyebrow">Score</span><b id="bz-score">0</b><span class="bz-mult" id="bz-mult">×1</span></div><div class="bz-clockwrap"><div class="bz-clock" id="bz-clock">${LEN}</div><div class="bz-timebar"><div id="bz-bar" style="width:100%"></div></div><small id="bz-combo" class="small muted"></small></div><div class="bz-best"><span class="eyebrow">Best</span><b id="bz-best">${rec.best || 0}</b><small><span id="bz-plays">${rec.plays || 0}</span> plays</small></div></div>
        <div class="panel bz-stagewrap"><div id="bz-stage"><div class="bz-intro"><div class="mascot-slot" data-size="72" data-cls="compact"></div><h2>Ready?</h2><p class="muted">Multiple choice only, one point burst per right answer, ×2 after three in a row, ×3 after six, ×4 after nine. A miss resets the combo but the clock keeps going. Every answer counts toward your topic progress.</p><button class="btn primary lg" data-action="bz-start">${icon('play', 16)} Start 90 seconds</button></div></div></div></div>`;
      bind(root, {
        'bz-start': () => start(root, D.id), 'bz-opt': b => answer(root, +b.dataset.i),
        'bz-share': async () => { const text = `I scored ${B.score} in a 90-second ${D.short} Blitz on Mathub (${B.correct}/${B.n} right, best combo ${B.maxCombo || 0}). Beat it: https://mathub.space/#/${D.id}/blitz`; try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('Score copied. Paste it anywhere.', 2500); } } catch (e) {} }
      });
      this.keys = e => { if (!B.on || e.target.matches('input, textarea')) return; const k = ['1', '2', '3', '4', '5', '6'].indexOf(e.key); const kl = LETTERS.indexOf(e.key.toUpperCase()); const i = k >= 0 ? k : kl; if (i >= 0) { e.preventDefault(); answer(root, i); } };
      document.addEventListener('keydown', this.keys); if (App.paintMascots) App.paintMascots();
      if (query && query.auto) start(root, D.id);
    },
    unmount() { if (this.keys) document.removeEventListener('keydown', this.keys); if (B.on) { B.on = false; clearInterval(B.tick); } }
  };
})(window);

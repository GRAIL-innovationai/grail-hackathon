/* ============================================================
   Mathub — focus room (#/focus)
   A study-session timer that keeps running while you use the rest of
   the site (a small pill shows the time left), with a task, presets
   (25 / 50 / 90 minutes or your own), the sound bubble one tap away,
   a daily focus goal, and a session log that feeds your streak, XP
   and the "focus minutes" quest. Sessions are stored per class in the
   synced data (sessions: [{d, m}]) and summarized in settings.focusLog.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, toast, settings, setSetting, store } = App;
  const QUOTES = ['Start before you feel ready.', 'Twenty-five minutes is a decision, not a feeling.', 'The first five minutes are the whole battle.', 'Done is a place you get to by starting.', 'You are one session closer than you were an hour ago.', 'Small blocks, every day, beat big plans.', 'Nobody remembers the scrolling. Everybody remembers the grade.', 'The exam is written by someone who expects you to practice. Prove them right.', 'Momentum is built, not found.', 'Focus is a muscle. This is the gym.', 'Studying with the phone in the other room counts double.', 'A tired brain that sleeps beats a wired brain that crams.'];
  const PRESETS = [[25, 'Sprint', 'one problem set or a lesson'], [50, 'Deep', 'a chapter or a long problem'], [90, 'Marathon', 'an exam prep block']];
  const F = { running: false, paused: false, total: 0, left: 0, elapsed: 0, task: '', course: null, tick: null, startedAt: 0, finishedAt: 0, lastSummary: null, breakLeft: 0, breakTick: null };
  App.focus = F;
  const tISO = () => App.todayISO(); const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const log = () => settings().focusLog || {};
  const minutesOn = iso => (log()[iso] || 0);
  const weekMinutes = () => { let n = 0; const d = new Date(); for (let i = 0; i < 7; i++) { const x = new Date(d); x.setDate(d.getDate() - i); n += minutesOn(App.toISO(x)); } return n; };
  const goal = () => settings().focusGoal || 50;
  App.focusStats = () => ({ today: minutesOn(tISO()), week: weekMinutes(), goal: goal(), sessionsToday: (settings().focusSessions || {})[tISO()] || 0 });

  /* ---------- timer ---------- */
  function start(mins, task, course) {
    stopBreak(); F.total = Math.max(60, Math.round(mins * 60)); F.left = F.total; F.elapsed = 0; F.task = task || ''; F.course = course || (App.D ? App.D.id : App.myCourses()[0]); F.running = true; F.paused = false; F.startedAt = Date.now(); F.lastSummary = null;
    setSetting('focusLastTask', F.task); setSetting('focusLastMins', mins);
    clearInterval(F.tick); F.tick = setInterval(tick, 1000); if (App.sfx) App.sfx.play('tap'); paint(); pill(); ping();
  }
  function tick() { if (!F.running || F.paused) return; F.left--; F.elapsed++; if (F.left <= 0) finish(); else { paintTime(); pill(); if (F.elapsed % 30 === 0) ping(); } }
  /* ---------- focus together: tell the server while a block runs, show who else is in ---------- */
  const online = () => App.auth && App.auth.user && App.auth.mode === 'server' && !App.auth.unreachable;
  const call = (r, body) => fetch('api/index.php?r=' + r, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(x => x.json());
  function ping() { if (!online() || !F.running) return; call('focus_ping', { task: F.task, course: F.course || '', started: Math.floor(F.startedAt / 1000), ends: Math.floor(Date.now() / 1000) + F.left }).then(r => { if (r && r.ok) { F.room = r; paintRoom(); } }).catch(() => {}); }
  function roomFetch() { if (!(App.auth && App.auth.mode === 'server' && !App.auth.unreachable)) return; call('focus_room').then(r => { if (r && r.ok) { F.room = r; paintRoom(); } }).catch(() => {}); }
  function paintRoom() {
    const box = $('#fz-room'); if (!box) return; const r = F.room; if (!r) { box.innerHTML = ''; return; }
    const rows = r.now || []; const others = rows.filter(x => !x.me);
    box.innerHTML = `<div class="panel-h"><div class="panel-title">${icon('users')} Focus together</div><span class="small muted">${r.today_sessions ? `${r.today_sessions} session${r.today_sessions === 1 ? '' : 's'} · ${r.today_minutes} min on the site today` : 'nobody has focused yet today'}</span></div>
      ${rows.length ? `<div class="fr-list">${rows.map(x => `<div class="fr-row${x.me ? ' me' : ''}"><span class="avatar sm">${esc((x.name || '?').trim()[0].toUpperCase())}</span><div class="fr-body"><b>${esc(x.name)}${x.me ? ' (you)' : ''}</b><small>${x.task ? esc(x.task) : 'focusing'}${x.course && global.Courses[x.course] ? ` · ${esc(global.Courses[x.course].short)}` : ''}</small><div class="bar sm"><div class="bar-fill" style="width:${Math.round(100 * (1 - x.left / x.total))}%"></div></div></div><span class="fr-left mono">${Math.ceil(x.left / 60)} min</span></div>`).join('')}</div>` : `<div class="empty small">${App.auth && App.auth.user ? 'Nobody is in a focus block right now. Start one and you will be first on the list.' : 'Sign in to see who is focusing right now and to be counted.'}</div>`}
      ${others.length ? `<p class="small muted mt-1">${others.length} classmate${others.length === 1 ? ' is' : 's are'} in a block right now. Same room, different desks.</p>` : ''}`;
  }
  function pause() { if (!F.running) return; F.paused = !F.paused; paint(); pill(); }
  function stop() { if (!F.running) return; const mins = Math.floor(F.elapsed / 60); F.running = false; clearInterval(F.tick); logSession(mins, false); paint(); pill(); if (online()) call('focus_done', { minutes: mins }).then(roomFetch).catch(() => {}); }
  function finish() {
    F.running = false; clearInterval(F.tick); F.finishedAt = Date.now(); const mins = Math.round(F.total / 60); logSession(mins, true); if (online()) call('focus_done', { minutes: mins }).then(roomFetch).catch(() => {});
    if (App.sfx) App.sfx.play('complete'); if (App.confetti && !(App.motionReduced && App.motionReduced())) App.confetti({ count: 160 });
    try { if ('Notification' in global && Notification.permission === 'granted' && document.visibilityState !== 'visible') new Notification('Focus block done', { body: `${mins} minutes on ${F.task || 'your work'}. Take a short break.`, icon: 'assets/icon-192.png' }); } catch (e) {}
    paint(); pill(); if (!location.hash.startsWith('#/focus')) toast(`${icon('check', 14)} Focus block done: ${mins} minutes logged. Take five.`, 6000);
  }
  function logSession(mins, complete) {
    const t = tISO(); const xp = Math.min(90, mins);
    const lg = log(); lg[t] = (lg[t] || 0) + mins; Object.keys(lg).forEach(k => { if (App.daysBetween(k, t) > 60) delete lg[k]; }); setSetting('focusLog', lg);
    const ss = settings().focusSessions || {}; if (mins >= 1) { ss[t] = (ss[t] || 0) + 1; Object.keys(ss).forEach(k => { if (k !== t && App.daysBetween(k, t) > 60) delete ss[k]; }); setSetting('focusSessions', ss); }
    if (mins >= 1 && F.course) {
      store.poke(F.course, d => { const s = Array.isArray(d.sessions) ? d.sessions : (d.sessions = []); const last = s[s.length - 1]; if (last && last.d === t) last.m += mins; else s.push({ d: t, m: mins }); if (s.length > 400) s.splice(0, s.length - 400); d.activity = d.activity || {}; d.activity[t] = true; });
      if (App.addXP) App.addXP(xp, { course: F.course, silent: !complete }); if (App.quest) App.quest('focus', mins);
    }
    F.lastSummary = { mins, xp: mins >= 1 ? xp : 0, complete, task: F.task, today: minutesOn(t), goal: goal(), sessions: ss[t] || 0 };
  }
  function startBreak(mins = 5) { stopBreak(); F.breakLeft = mins * 60; F.breakTick = setInterval(() => { F.breakLeft--; if (F.breakLeft <= 0) { stopBreak(); if (App.sfx) App.sfx.play('tap'); toast('Break over. Ready for another block?', 4000); } paintTime(); }, 1000); paint(); }
  function stopBreak() { clearInterval(F.breakTick); F.breakTick = null; F.breakLeft = 0; }
  App.focusStart = start; App.focusStop = stop;

  /* ---------- floating pill when you leave the page ---------- */
  function pill() {
    let el = $('#focus-pill'); const show = F.running && !location.hash.startsWith('#/focus');
    if (!show) { if (el) el.remove(); document.title = document.title.replace(/^\d+:\d\d · /, ''); return; }
    if (!el) { el = document.createElement('a'); el.id = 'focus-pill'; el.href = '#/focus'; el.className = 'focus-pill'; el.setAttribute('aria-label', 'Focus session running; open the focus room'); document.body.appendChild(el); }
    el.innerHTML = `<span class="fp-dot${F.paused ? ' paused' : ''}"></span><b>${fmt(F.left)}</b><span class="fp-task">${esc(F.task || 'Focus')}</span>`;
    const base = document.title.replace(/^\d+:\d\d · /, ''); document.title = `${fmt(F.left)} · ${base}`;
  }
  global.addEventListener('hashchange', pill);

  /* ---------- view ---------- */
  const RING = 2 * Math.PI * 88;
  function paintTime() {
    const root = $('#fz-root'); if (!root) return; const t = $('#fz-time', root); if (!t) return;
    const inBreak = F.breakTick && !F.running; const left = inBreak ? F.breakLeft : F.left; const total = inBreak ? 300 : F.total; t.textContent = fmt(Math.max(0, left));
    const fg = $('#fz-ring', root); if (fg) fg.style.strokeDashoffset = (RING * (total ? left / total : 1)).toFixed(1);
    const sub = $('#fz-sub', root); if (sub) sub.textContent = inBreak ? 'Break · stretch, water, no phone' : F.paused ? 'Paused' : F.running ? (F.task || 'Focus') : 'Ready';
    if (location.hash.startsWith('#/focus')) document.title = F.running || inBreak ? `${fmt(left)} · Focus · Mathub` : 'Focus · Mathub';
  }
  function suggestions() {
    const out = []; const ids = App.myCourses();
    if (App.dueCards) { const n = ids.reduce((s, id) => { try { const d = App.dueCards(id); return s + d.count; } catch (e) { return s; } }, 0); if (n) out.push([`Review ${n} due flashcards`, '#/today?review=1']); }
    if (App.weakestTopic) { for (const id of ids) { try { const w = App.weakestTopic(id); if (w) { out.push([`Lesson: ${w.label} (${global.Courses[id].short})`, `#/${id}/lesson?topics=${encodeURIComponent(w.t)}`]); break; } } catch (e) {} } }
    ids.slice(0, 3).forEach(id => { const C = global.Courses[id]; if (C && (C.quiz || C.hasQuiz)) out.push([`Practice set · ${C.short}`, `#/${id}/practice`]); });
    if (ids.some(id => global.Courses[id] && global.Courses[id].kind === 'writing')) out.push(['Draft the next WRIT 101 piece', '#/writ/dashboard']);
    const last = settings().focusLastTask; if (last && !out.some(o => o[0] === last)) out.unshift([last, '']);
    return out.slice(0, 6);
  }
  function paint() {
    const root = $('#fz-root'); if (!root) return; const st = App.focusStats(); const inBreak = F.breakTick && !F.running; const active = F.running || inBreak; const q = QUOTES[Math.floor(Date.now() / 3600000) % QUOTES.length];
    const summary = !F.running && !inBreak && F.lastSummary ? F.lastSummary : null; const pct = Math.min(100, Math.round(100 * st.today / st.goal));
    root.innerHTML = `<div class="fz-stage${active ? ' active' : ''}">
      <div class="fz-ringwrap"><svg viewBox="0 0 200 200" width="240" height="240" aria-hidden="true"><circle class="fz-bg" cx="100" cy="100" r="88"/><circle class="fz-fg${inBreak ? ' break' : ''}" id="fz-ring" cx="100" cy="100" r="88" stroke-dasharray="${RING.toFixed(1)}" stroke-dashoffset="${(RING * (active ? (inBreak ? F.breakLeft / 300 : F.left / F.total) : 1)).toFixed(1)}"/></svg>
        <div class="fz-center"><div class="fz-time" id="fz-time">${fmt(active ? (inBreak ? F.breakLeft : F.left) : (settings().focusLastMins || 25) * 60)}</div><div class="fz-sub" id="fz-sub">${inBreak ? 'Break' : F.paused ? 'Paused' : F.running ? esc(F.task || 'Focus') : 'Ready when you are'}</div></div></div>
      ${summary ? `<div class="fz-card fz-summary"><div class="fz-big">${summary.complete ? icon('check', 22) : icon('flag', 22)} ${summary.complete ? 'Block complete' : 'Session stopped'}</div><div class="fz-stats"><div><b class="count" data-count="${summary.mins}">${summary.mins}</b><small>minutes</small></div><div><b>+${summary.xp}</b><small>XP</small></div><div><b>${summary.today}</b><small>of ${summary.goal} today</small></div><div><b>${summary.sessions}</b><small>session${summary.sessions === 1 ? '' : 's'} today</small></div></div>${summary.task ? `<p class="small muted">${esc(summary.task)}</p>` : ''}<div class="row gap-sm" style="flex-wrap:wrap;justify-content:center"><button class="btn primary" data-action="fz-again">${icon('rotate', 14)} Another block</button><button class="btn" data-action="fz-break">${icon('clock', 14)} 5-minute break</button><a class="btn" href="#/today">${icon('flag', 14)} Back to Today</a></div></div>` : ''}
      ${!active && !summary ? `<div class="fz-card"><div class="eyebrow mb-1">What are you working on?</div><input class="input" id="fz-task" placeholder="e.g. Chain rule practice set" value="${esc(settings().focusLastTask || '')}" maxlength="80"><div class="fz-sugg">${suggestions().map(([t, h]) => `<button class="chip toggle" data-action="fz-sugg" data-t="${esc(t)}" data-h="${esc(h)}">${esc(t)}</button>`).join('')}</div>
        <div class="eyebrow mt-2 mb-1">How long?</div><div class="fz-presets">${PRESETS.map(([m, n, d]) => `<button class="fz-preset${(settings().focusLastMins || 25) === m ? ' on' : ''}" data-action="fz-preset" data-m="${m}"><b>${m}</b><span>${n}</span><small>${d}</small></button>`).join('')}<label class="fz-preset custom"><b><input type="number" id="fz-custom" min="5" max="180" value="${[25, 50, 90].includes(settings().focusLastMins) ? 40 : (settings().focusLastMins || 40)}" aria-label="Custom minutes"></b><span>Custom</span><small>5 to 180 min</small></label></div>
        <div class="row gap-sm mt-2" style="flex-wrap:wrap"><button class="btn primary lg" data-action="fz-start">${icon('play', 16)} Start focus</button><button class="btn" data-action="fz-sounds">${icon('mic', 14)} Sounds</button><button class="btn" data-action="fz-full">${icon('zoomin', 14)} Full screen</button></div></div>` : ''}
      ${active ? `<div class="fz-controls">${inBreak ? `<button class="btn primary" data-action="fz-skipbreak">${icon('play', 14)} Skip break</button>` : `<button class="btn primary lg" data-action="fz-pause">${F.paused ? icon('play', 16) + ' Resume' : icon('pause', 16) + ' Pause'}</button><button class="btn" data-action="fz-stop">${icon('x', 14)} Stop</button>`}<button class="btn" data-action="fz-sounds">${icon('mic', 14)} Sounds</button><button class="btn" data-action="fz-full">${icon('zoomin', 14)} Full screen</button></div><p class="small muted fz-hint">Space pauses. Leave this page and a pill keeps the time; come back any time.</p>` : ''}
      <div class="fz-goal"><div class="row between"><span class="small"><b>${st.today}</b> of <b>${st.goal}</b> focus minutes today</span><span class="small muted">${st.week} this week · <button class="linkish" data-action="fz-goal">change goal</button></span></div><div class="bar sm"><div class="bar-fill" style="width:${pct}%"></div></div></div>
      <p class="fz-quote">“${esc(q)}”</p><div class="panel fz-room" id="fz-room"></div></div>`;
    bind(root, {
      'fz-preset': b => { $$('.fz-preset', root).forEach(x => x.classList.toggle('on', x === b)); setSetting('focusLastMins', +b.dataset.m); },
      'fz-sugg': b => { $('#fz-task', root).value = b.dataset.t; $$('.fz-sugg .chip', root).forEach(x => x.classList.toggle('on', x === b)); if (b.dataset.h) root.dataset.go = b.dataset.h; },
      'fz-start': () => { const on = $('.fz-preset.on', root); const custom = $('#fz-custom', root); const mins = on ? +on.dataset.m : Math.min(180, Math.max(5, +custom.value || 25)); start(mins, $('#fz-task', root).value.trim(), null); if (root.dataset.go) { const h = root.dataset.go; delete root.dataset.go; toast(`Timer running. Opening ${h.includes('lesson') ? 'the lesson' : 'your task'}…`, 2000); setTimeout(() => { location.hash = h; }, 900); } },
      'fz-pause': () => pause(), 'fz-stop': () => { if (F.elapsed < 60 || confirm('Stop this session? Minutes so far are logged.')) stop(); },
      'fz-again': () => { F.lastSummary = null; paint(); }, 'fz-break': () => startBreak(5), 'fz-skipbreak': () => { stopBreak(); paint(); },
      'fz-sounds': () => { if (App.ambient && App.ambient.open) App.ambient.open(); else toast('Focus sounds live in the bubble at the bottom right.'); },
      'fz-full': () => { const d = document.documentElement; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (d.requestFullscreen) d.requestFullscreen().catch(() => toast('Full screen is not available here.')); },
      'fz-goal': () => { const v = prompt('Daily focus goal in minutes:', String(goal())); const n = parseInt(v, 10); if (n > 0 && n <= 600) { setSetting('focusGoal', n); paint(); } }
    });
    const ci = $('#fz-custom', root); if (ci) ci.addEventListener('focus', () => { $$('.fz-preset', root).forEach(x => x.classList.remove('on')); });
    if (App.motionRender) App.motionRender(root); if (App.countUp) App.countUp(root); paintRoom();
  }
  App.views.focus = {
    title: 'Focus', blurb: 'One task, one timer, no phone.',
    render(root, param, query, standalone) {
      root.innerHTML = `${standalone ? '<div class="landing-wrap fz-wrap">' : ''}<div class="fz-top"><div><div class="eyebrow">Mathub · focus room</div><h1 class="landing-title">${standalone ? `<span class="logo-mark">${App.logoSvg(40)}</span>` : ''}Focus</h1></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="${standalone ? '#/' : App.link('dashboard')}">${icon('left', 14)} Back</a></div></div><div id="fz-root"></div>${standalone ? '</div>' : ''}`;
      paint(); if (query && query.start && !F.running) { const m = parseInt(query.start, 10) || 25; start(m, query.task || '', null); }
      const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
      this.keys = e => { if (e.target.matches('input, textarea, select') || !F.running) return; if (e.key === ' ') { e.preventDefault(); pause(); } };
      document.addEventListener('keydown', this.keys); pill(); roomFetch(); this.roomTimer = setInterval(roomFetch, 30000);
    },
    unmount() { if (this.keys) document.removeEventListener('keydown', this.keys); clearInterval(this.roomTimer); setTimeout(pill, 0); }
  };
  document.addEventListener('DOMContentLoaded', pill);
})(window);

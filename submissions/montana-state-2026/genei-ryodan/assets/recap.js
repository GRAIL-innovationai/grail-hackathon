/* ============================================================
   Mathub — your week (#/recap)
   A short animated story of the last seven days: days studied, XP
   per day, questions and accuracy, cards and focus minutes, the
   streak, then a share card rendered on a canvas that can be saved
   or shared. Built only from data already on the device (and synced
   to the account), so it works offline. A banner on the landing page
   offers it once per week when there was something to show.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, toast, settings, setSetting, store } = App; const Courses = global.Courses;
  const DAY = 86400000; const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekDays = offset => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * offset); return Array.from({ length: 7 }, (_, i) => App.toISO(new Date(d.getTime() + i * DAY))); };
  const short = iso => { const d = App.parseISO ? App.parseISO(iso) : new Date(iso + 'T00:00:00'); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };

  App.weekStats = function (offset = 0) {
    const days = weekDays(offset); const set = new Set(days); const ids = App.myCourses(); const t = App.todayISO();
    const xpDay = Object.fromEntries(days.map(d => [d, 0])); const active = new Set(); let answered = 0, correct = 0, cards = 0, focus = 0; const perCourse = {}; const topics = {};
    ids.forEach(id => {
      const d = store.peek(id) || {}; perCourse[id] = { xp: 0, answered: 0 };
      (d.xp || []).forEach(x => { if (set.has(x.d)) { xpDay[x.d] += x.n; perCourse[id].xp += x.n; } });
      (d.history || []).forEach(h => { if (set.has(h.d)) { answered++; perCourse[id].answered++; if (h.ok) correct++; topics[id + ':' + h.t] = (topics[id + ':' + h.t] || 0) + 1; } });
      Object.keys(d.activity || {}).forEach(k => { if (set.has(k)) active.add(k); });
      Object.values(d.fcAt || {}).forEach(ts => { const iso = App.toISO(new Date(ts)); if (set.has(iso)) cards++; });
    });
    const log = settings().focusLog || {}; days.forEach(d => { focus += log[d] || 0; });
    const xp = days.reduce((n, d) => n + xpDay[d], 0); const best = days.reduce((b, d) => xpDay[d] > (b ? xpDay[b] : 0) ? d : b, null);
    const top = Object.entries(perCourse).sort((a, b) => b[1].xp - a[1].xp)[0]; const topTopic = Object.entries(topics).sort((a, b) => b[1] - a[1])[0];
    let topicLabel = null; if (topTopic) { const [cid, tid] = topTopic[0].split(':'); const C = Courses[cid]; const T = (C && ((C.quiz && C.quiz.TOPICS) || C.quizTopics)) || {}; topicLabel = T[tid] ? `${T[tid].label} (${C.short})` : null; }
    const streak = App.streakAll ? App.streakAll().n : 0; const goal = (App.dailyGoal ? App.dailyGoal() : 30) * 7;
    return { days, xpDay, active: [...active].sort(), daysActive: active.size, xp, best, answered, correct, acc: answered ? Math.round(100 * correct / answered) : null, cards, focus, topCourse: top && top[1].xp ? top[0] : null, topicLabel, streak, goal, isCurrent: offset === 0, label: `${short(days[0])} – ${short(days[6])}`, key: days[0], hasData: active.size > 0 || xp > 0 || answered > 0 || focus > 0 };
  };
  function compliment(s) {
    if (!s.hasData) return ['A quiet week.', 'Every streak starts with one day. Open Today and do three flashcards.'];
    if (s.daysActive >= 6) return ['Relentless.', `${s.daysActive} days out of 7. This is what a top grade looks like from the inside.`];
    if (s.xp >= s.goal) return ['Goal crushed.', `${s.xp} XP against a weekly goal of ${s.goal}. Raise the daily goal in Settings if that felt easy.`];
    if (s.daysActive >= 4) return ['Consistent.', `${s.daysActive} study days. Consistency beats intensity, and you had it.`];
    if (s.acc !== null && s.acc >= 85 && s.answered >= 20) return ['Sharp.', `${s.acc}% on ${s.answered} questions. Time to try harder topics or a Blitz.`];
    if (s.focus >= 120) return ['Deep work.', `${s.focus} focus minutes. That is real, logged time, not vibes.`];
    return ['A start.', `${s.daysActive} day${s.daysActive === 1 ? '' : 's'} this week. Two more next week would double it.`];
  }

  /* ---------- share card (1080×1080) ---------- */
  App.recapCanvas = function (s) {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1080; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1080, 1080); g.addColorStop(0, '#0f1f4d'); g.addColorStop(0.55, '#2B55B8'); g.addColorStop(1, '#0E7C86'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1080);
    const glow = x.createRadialGradient(900, 160, 10, 900, 160, 520); glow.addColorStop(0, 'rgba(242,193,78,0.45)'); glow.addColorStop(1, 'rgba(242,193,78,0)'); x.fillStyle = glow; x.fillRect(0, 0, 1080, 1080);
    x.fillStyle = '#fff'; x.font = '700 64px Poppins, "Helvetica Neue", "TeX Gyre Heros", Helvetica, Arial, sans-serif'; x.fillText('Mathub', 80, 130);
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.font = '600 30px "Helvetica Neue", "TeX Gyre Heros", Helvetica, Arial, sans-serif'; x.fillText('MY WEEK · ' + s.label.toUpperCase(), 80, 190);
    const [big] = compliment(s); x.fillStyle = '#fff'; x.font = '700 104px "Helvetica Neue", "TeX Gyre Heros", Helvetica, Arial, sans-serif'; x.fillText(big, 80, 330);
    // day dots
    s.days.forEach((d, i) => { const on = s.active.includes(d); x.beginPath(); x.arc(110 + i * 132, 430, 34, 0, Math.PI * 2); x.fillStyle = on ? '#F2C14E' : 'rgba(255,255,255,0.18)'; x.fill(); x.fillStyle = on ? '#1a1a1a' : 'rgba(255,255,255,0.7)'; x.font = '700 26px "Helvetica Neue", "TeX Gyre Heros", Helvetica, Arial, sans-serif'; x.textAlign = 'center'; x.fillText(dow[i], 110 + i * 132, 440); x.textAlign = 'left'; });
    const tiles = [[String(s.xp), 'XP earned'], [String(s.daysActive) + '/7', 'days studied'], [s.answered ? `${s.acc}%` : '—', s.answered ? `on ${s.answered} questions` : 'questions'], [String(s.focus), 'focus minutes'], [String(s.cards), 'cards reviewed'], [String(s.streak), 'day streak']];
    tiles.forEach(([v, l], i) => { const col = i % 3, row = Math.floor(i / 3); const px = 80 + col * 315, py = 520 + row * 215; x.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(x, px, py, 290, 185, 26); x.fill(); x.fillStyle = '#fff'; x.font = '700 72px "Helvetica Neue", "TeX Gyre Heros", Helvetica, Arial, sans-serif'; x.fillText(v, px + 26, py + 92); x.fillStyle = 'rgba(255,255,255,0.8)'; x.font = '500 26px "Helvetica Neue", "TeX Gyre Heros", Helvetica, Arial, sans-serif'; x.fillText(l, px + 26, py + 145); });
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.font = '600 30px "Helvetica Neue", "TeX Gyre Heros", Helvetica, Arial, sans-serif'; x.fillText('mathub.space · free study hub for Montana State classes', 80, 1010);
    return c;
  };
  function roundRect(x, px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  async function share(s) {
    const c = App.recapCanvas(s); const blob = await new Promise(r => c.toBlob(r, 'image/png')); const file = new File([blob], `mathub-week-${s.key}.png`, { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'My week on Mathub', text: `${s.xp} XP, ${s.daysActive} study days, ${s.answered} questions on Mathub this week.` }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); toast('Saved as an image. Post it, or send it to a friend who needs a push.', 3500);
  }

  /* ---------- story ----------
     With GSAP (assets/gsap-fx.js) every slide is one authored timeline: it arrives from the side you
     moved toward, the headline sharpens out of a blur, numbers count up, bars grow and the accuracy
     ring draws, while the segment above fills over seven seconds before the story moves on. Holding a
     finger or the mouse on the slide pauses it; so does switching tabs. Without GSAP (or with Reduce
     motion) the CSS entrances and a plain timer do the same job. */
  const R = { i: 0, offset: 0, timer: null, tl: null, seg: null, out: null };
  const STEP = 7;
  const stop = () => { clearTimeout(R.timer); [R.tl, R.seg].forEach(t => t && t.kill()); R.tl = R.seg = null; };
  document.addEventListener('visibilitychange', () => { if (R.seg) { if (document.hidden) R.seg.pause(); else R.seg.resume(); } });
  function slides(s) {
    const [big, why] = compliment(s); const maxXp = Math.max(1, ...s.days.map(d => s.xpDay[d]));
    return [
      { cls: 'intro', html: `<div class="eyebrow">Your week · ${esc(s.label)}</div><h2 class="rc-big">${s.daysActive ? `${s.daysActive} day${s.daysActive === 1 ? '' : 's'} of studying.` : 'Nothing logged yet.'}</h2><div class="rc-days">${s.days.map((d, i) => `<span class="rc-day${s.active.includes(d) ? ' on' : ''}${d === App.todayISO() ? ' today' : ''}"><b>${dow[i]}</b><i>${s.active.includes(d) ? icon('check', 12) : ''}</i></span>`).join('')}</div><p class="muted">${s.daysActive >= 5 ? 'That is a habit, not a sprint.' : s.daysActive ? 'Every dot is a day future-you will thank you for.' : 'Open Today and do three flashcards to light the first dot.'}</p>` },
      { cls: 'xp', html: `<div class="eyebrow">Points</div><h2 class="rc-big"><span class="count" data-count="${s.xp}">${s.xp}</span> XP</h2><div class="rc-chart">${s.days.map((d, i) => `<div class="rc-bar${d === s.best && s.xpDay[d] ? ' best' : ''}" style="--h:${Math.round(100 * s.xpDay[d] / maxXp)}%"><i></i><b>${s.xpDay[d] || ''}</b><small>${dow[i]}</small></div>`).join('')}</div><p class="muted">${s.best && s.xpDay[s.best] ? `Best day: ${dow[s.days.indexOf(s.best)]} with ${s.xpDay[s.best]} XP.` : 'No XP yet this week.'} Weekly goal: ${s.goal}${s.xp >= s.goal ? ' · reached' : ` · ${s.goal - s.xp} to go`}.</p>` },
      { cls: 'q', html: `<div class="eyebrow">Practice</div><h2 class="rc-big"><span class="count" data-count="${s.answered}">${s.answered}</span> question${s.answered === 1 ? '' : 's'}</h2>${s.answered ? `<div class="rc-acc"><svg viewBox="0 0 36 36" width="88" height="88" aria-hidden="true"><circle class="ring-bg" cx="18" cy="18" r="15"/><circle class="ring-fg" cx="18" cy="18" r="15" stroke-dasharray="${(2 * Math.PI * 15).toFixed(1)}" stroke-dashoffset="${(2 * Math.PI * 15 * (1 - s.acc / 100)).toFixed(1)}"/></svg><div><b>${s.acc}% right</b><small>${s.topicLabel ? `Most practiced: ${esc(s.topicLabel)}` : ''}</small></div></div>` : '<p class="muted">Practice sets, lessons, the daily challenge and Blitz all count here.</p>'}${s.topCourse ? `<p class="muted">Most time went to <span class="chip course-${s.topCourse}">${esc(Courses[s.topCourse].short)}</span>.</p>` : ''}` },
      { cls: 'focus', html: `<div class="eyebrow">Cards and focus</div><div class="rc-two"><div><b class="count" data-count="${s.cards}">${s.cards}</b><small>flashcards reviewed</small></div><div><b class="count" data-count="${s.focus}">${s.focus}</b><small>focus minutes</small></div></div><p class="muted">${s.focus ? `${Math.round(s.focus / 60 * 10) / 10} hours of logged, phone-away time.` : 'Log time in the Focus room and it shows up here.'} ${s.cards ? 'Cards you got right are coming back later; the misses are back tomorrow.' : ''}</p>` },
      { cls: 'end', html: `<div class="eyebrow">Verdict</div><h2 class="rc-big">${esc(big)}</h2><p>${esc(why)}</p><div class="rc-streak">${icon('fire', 18)} <b>${s.streak}</b>-day streak right now</div><div class="row gap-sm mt-2" style="flex-wrap:wrap;justify-content:center"><button class="btn primary" data-action="rc-share">${icon('external', 14)} Share this week</button><a class="btn" href="#/today">${icon('flag', 14)} Plan next week</a></div>` }
    ];
  }
  function paint(root, dir = 0) {
    stop(); const s = App.weekStats(R.offset); const list = slides(s); R.i = Math.min(R.i, list.length - 1); const last = R.i >= list.length - 1;
    root.innerHTML = `<div class="rc-top"><div class="row gap-sm"><button class="chip toggle${R.offset === -1 ? ' on' : ''}" data-action="rc-week" data-o="-1">Last week</button><button class="chip toggle${R.offset === 0 ? ' on' : ''}" data-action="rc-week" data-o="0">This week</button></div><div class="rc-segs" aria-hidden="true">${list.map((_, i) => `<i class="${i < R.i ? 'done' : i === R.i ? 'on' : ''}"><b></b></i>`).join('')}</div></div>
      <div class="recap-stage"><button class="rc-arrow left" data-action="rc-prev" aria-label="Previous">${icon('left', 18)}</button><div class="recap-slide ${list[R.i].cls}" id="rc-slide" aria-live="polite">${list[R.i].html}</div><button class="rc-arrow right" data-action="rc-next" aria-label="Next">${icon('right', 18)}</button></div>
      <p class="small muted" style="text-align:center">Tap, swipe or use the arrow keys. Hold to pause. Numbers come from this device and your account.</p>`;
    bind(root, { 'rc-week': b => { R.offset = +b.dataset.o; R.i = 0; paint(root); }, 'rc-prev': () => go(root, -1), 'rc-next': () => go(root, 1), 'rc-share': () => share(s) });
    const sl = $('#rc-slide', root); sl.addEventListener('click', e => { if (e.target.closest('a, button')) return; go(root, 1); });
    let x0 = null; sl.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true }); sl.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 40) go(root, dx < 0 ? 1 : -1); }, { passive: true });
    sl.addEventListener('pointerdown', () => { if (R.seg) R.seg.pause(); }); ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => sl.addEventListener(ev, () => { if (R.seg && !document.hidden) R.seg.resume(); }));
    if (R.i === 0 && s.hasData) setSetting('recapSeen', s.key);
    const g = App.gsapNow && App.gsapNow(); root.classList.toggle('gs', !!g);
    if (!g) { if (App.countUp) App.countUp(sl); if (App.motionRender) App.motionRender(root); if (!last) R.timer = setTimeout(() => { if ($('#rc-slide')) go(root, 1); }, STEP * 1000); return; }
    choreograph(g, sl, dir);
    const fill = $('.rc-segs i.on b', root);
    if (fill) R.seg = last ? g.set(fill, { scaleX: 1 }) : g.fromTo(fill, { scaleX: 0 }, { scaleX: 1, duration: STEP, ease: 'none', onComplete: () => setTimeout(() => { if ($('#rc-slide')) go(root, 1); }) });
  }
  function choreograph(g, sl, dir) {
    const q = sel => Array.from(sl.querySelectorAll(sel));
    // CSS transitions on the same properties fight GSAP, so they stand down while the timeline runs (.gs-run),
    // and every tween hands its element back to the stylesheet when done, so hover and press effects still work
    sl.classList.add('gs-run');
    const tl = R.tl = g.timeline({ defaults: { ease: 'expo.out', duration: 0.6, clearProps: 'all' }, onComplete: () => sl.classList.remove('gs-run') });
    tl.from(sl, { x: dir * 44, opacity: 0, filter: 'blur(6px)', duration: 0.55 }, 0)
      .from(q(':scope > .eyebrow'), { y: 10, opacity: 0, duration: 0.45 }, 0.06)
      .from(q('.rc-big'), { y: 26, opacity: 0, filter: 'blur(10px)', duration: 0.8 }, 0.12);
    q('.count[data-count]').forEach((el, k) => { const to = +el.dataset.count || 0; const o = { v: 0 }; el.textContent = '0'; tl.add(g.to(o, { v: to, duration: Math.min(1.6, 0.6 + to / 500), ease: 'power3.out', onUpdate: () => { el.textContent = Math.round(o.v); } }), 0.25 + k * 0.18); });
    tl.from(q('.rc-day i'), { scale: 0.3, opacity: 0, duration: 0.5, stagger: 0.06 }, 0.3)
      .from(q('.rc-bar i'), { scaleY: 0, transformOrigin: '50% 100%', duration: 0.9, stagger: 0.07 }, 0.28)
      .from(q('.rc-bar b'), { y: 6, opacity: 0, duration: 0.4, stagger: 0.07 }, 0.6);
    const ring = sl.querySelector('.rc-acc .ring-fg');
    if (ring) tl.fromTo(ring, { strokeDashoffset: +ring.getAttribute('stroke-dasharray') }, { strokeDashoffset: +ring.getAttribute('stroke-dashoffset'), duration: 1.2, ease: 'power3.out' }, 0.3);
    tl.from(q('.rc-acc > div, .rc-two > div, .rc-streak, .row .btn, :scope > p'), { y: 10, opacity: 0, duration: 0.5, stagger: 0.07 }, 0.42);
  }
  function go(root, d) {
    if (R.out) R.out.progress(1); // a press during the exit finishes it first
    const n = slides(App.weekStats(R.offset)).length; const ni = R.i + d; if (ni < 0 || ni >= n) return; R.i = ni;
    const g = App.gsapNow && App.gsapNow(); const old = $('#rc-slide', root);
    if (!g || !old) { paint(root, d); return; }
    if (R.seg) R.seg.pause();
    R.out = g.to(old, { x: -30 * d, opacity: 0, filter: 'blur(4px)', duration: 0.16, ease: 'power2.in', onComplete: () => { R.out = null; paint(root, d); } });
  }

  App.views.recap = {
    title: 'Your week', blurb: 'Seven days, in numbers you can be proud of.',
    render(root, param, query, standalone) {
      const d = new Date(); R.offset = query.w === 'last' ? -1 : query.w === 'this' ? 0 : (d.getDay() >= 1 && d.getDay() <= 3 && App.weekStats(-1).hasData ? -1 : 0); R.i = 0;
      root.innerHTML = `${standalone ? '<div class="landing-wrap rc-wrap">' : ''}<div class="fz-top"><div><div class="eyebrow">Mathub</div><h1 class="landing-title">${standalone ? `<span class="logo-mark">${App.logoSvg(40)}</span>` : ''}Your week</h1></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="${standalone ? '#/' : App.link('dashboard')}">${icon('left', 14)} Back</a></div></div><div id="rc-root"></div>${standalone ? '</div>' : ''}`;
      const host = $('#rc-root', root); if (App.gsapWithin) App.gsapWithin(450).then(() => { if (host.isConnected && !$('#rc-slide', host)) paint(host); }); else paint(host);
      const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
      this.keys = e => { if (e.target.matches('input, textarea')) return; if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go($('#rc-root', root), 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go($('#rc-root', root), -1); } };
      document.addEventListener('keydown', this.keys);
    },
    unmount() { if (this.keys) document.removeEventListener('keydown', this.keys); stop(); if (R.out) { R.out.kill(); R.out = null; } }
  };
  /* landing banner: once per week, when last week had something to show */
  App.recapBanner = function () {
    const last = App.weekStats(-1); if (!last.hasData || settings().recapSeen === last.key || settings().recapDismissed === last.key) return '';
    if (App.gsapLoad) (global.requestIdleCallback || setTimeout)(() => App.gsapLoad());
    return `<a class="recap-card" href="#/recap?w=last"><span class="rc-ic">${icon('zap', 18)}</span><span class="rc-body"><small>Your week is ready</small><b>${last.xp} XP · ${last.daysActive} day${last.daysActive === 1 ? '' : 's'} · ${last.answered} questions</b></span><span class="btn sm primary">See it ${icon('right', 13)}</span><button class="icon-btn rc-x" data-action="recap-dismiss" aria-label="Dismiss">${icon('x', 13)}</button></a>`;
  };
  document.addEventListener('click', e => { const b = e.target.closest('[data-action="recap-dismiss"]'); if (!b) return; e.preventDefault(); e.stopPropagation(); setSetting('recapDismissed', App.weekStats(-1).key); const card = b.closest('.recap-card'); if (card) card.remove(); }, true);
})(window);

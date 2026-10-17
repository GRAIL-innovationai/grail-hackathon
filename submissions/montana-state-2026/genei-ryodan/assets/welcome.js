/* ============================================================
   Mathub — the welcome (website): right after sign-up, a short walk through Mathub under the Big Sky, the
   range gliding past as you go, then the two choices every new account makes: the classes they take (at least
   one) and a membership (Free, Pro or Max; Pro and Max open the checkout). Saved with api welcome_done; until
   it is done it comes back at the next visit. Accounts from before it, and the apps, never see it.
   Scenes: hello, every class is a climb, practice, Bo (his board, calls), any class from its syllabus,
   then the classes, the membership, and you're all set. Each scene has its own small animation; all of it is
   still when motion is off or reduced. Keyboard: Enter or → next, ← back, Esc skips the tour part.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; const Courses = global.Courses; if (!App) return;
  const { $, $$, esc, icon, toast, setSetting, settings } = App;
  const N = global.Native; const MA = global.MATHUB_APP; const NATIVE = !!(N && MA && MA.native);
  const API = 'api/index.php?r=';
  const still = () => (global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.documentElement.dataset.motion === 'off';
  const bo = n => (App.bobcatSvg ? App.bobcatSvg(n) : '');
  const user = () => { const a = App.auth; return a && a.user && !a.user.local && a.mode === 'server' ? a.user : null; };
  const firstName = () => { const u = user(); const n = u ? (u.name || u.email.split('@')[0]) : ''; return n ? String(n).trim().split(/[\s.]+/)[0].replace(/^./, c => c.toUpperCase()) : ''; };
  const cls = id => (App.classStyle ? App.classStyle(id) : '');
  const STEPS = ['hello', 'climb', 'practice', 'bo', 'create', 'classes', 'plan', 'ready'];
  const CHOOSE = ['classes', 'plan'];
  const W = { el: null, i: 0, picked: new Set(), plan: '', declined: '', busy: false, back: null, saved: false };
  const ids = () => (App.COURSE_ORDER || []).filter(id => Courses[id] && !Courses[id].preview);
  const PLAN_LINES = {
    free: ['Every class built into Mathub', 'Practice, flashcards, Today and the Focus room'],
    pro: ['Bo writes your classes from any syllabus', 'Make and share your own classes'],
    max: ['Everything in Pro', 'Ask Bo anything, any time', 'Call Bo and talk it through']
  };
  const price = k => k === 'free' ? '$0' : ((App.subscription && App.subscription.price(k)) || (App.plans && App.plans[k] && App.plans[k].web) || '');
  const planName = k => k === 'free' ? 'Free' : (App.plans && App.plans[k] ? App.plans[k].name : k);
  const have = () => (App.subscription ? App.subscription.plan() : '');
  const RANK = { '': 0, free: 0, pro: 1, max: 2 };

  /* ---------- the scenes ---------- */
  const SCENE = {
    hello: () => ({
      art: `<div class="wa wa-hello"><span class="wa-disc"></span><span class="wa-bo">${bo(156)}</span><span class="wa-say">Hi${firstName() ? ` ${esc(firstName())}` : ''}!</span><i class="wa-spark s1"></i><i class="wa-spark s2"></i><i class="wa-spark s3"></i><i class="wa-spark s4"></i></div>`,
      h: `Welcome to Mathub${firstName() ? `, ${esc(firstName())}` : ''}!`,
      p: 'Your classes, your exams and a tutor who knows both, all in one place. Here is how it works. It takes a minute.',
      next: 'Show me'
    }),
    climb: () => ({
      art: `<div class="wa wa-climb" style="${cls('calc')}"><svg viewBox="0 0 420 300" role="presentation">
          <path class="m-far" d="M-20 300 L80 160 L150 222 L250 128 L330 196 L440 112 L440 300Z"/>
          <path class="m-main" d="M30 300 L226 44 L412 300Z"/><path class="m-shade" d="M226 44 L412 300 L300 300 L244 150Z"/>
          <path class="m-snow" d="M226 44 L195 85 L211 81 L224 95 L239 80 L257 84Z"/>
          <path class="m-trail" pathLength="1" d="M95 292 C 170 270, 120 232, 190 214 S 175 150, 214 132 S 222 84, 226 54"/>
          <g class="m-cp"><circle class="c1" cx="144" cy="251" r="8"/><circle class="c2" cx="190" cy="214" r="8"/><circle class="c3" cx="214" cy="132" r="8"/></g>
          <g class="m-flag"><path class="m-pole" d="M226 54 V14"/><path class="m-flag-f" d="M226 14 L254 22 L226 31Z"/></g></svg>
        <span class="wa-chip wa-c1">${icon('check', 13)} 1.4 Limits</span><span class="wa-chip wa-c2">2.2 Chain rule</span><span class="wa-chip wa-exam">${icon('flag', 13)} Exam 2 · in 9 days</span></div>`,
      h: 'Every class is a climb',
      p: 'Mathub knows each class’s syllabus: every topic, deadline and exam date. The topics are your trail and the next exam is the summit, with a readiness score that tells you how close you are.',
      next: 'Next'
    }),
    practice: () => ({
      art: `<div class="wa wa-practice"><div class="wa-cards"><i></i><i></i><i></i></div>
          <div class="wa-quiz"><p>The derivative of sin x is…</p><span class="o">−cos x</span><span class="o ok">cos x ${icon('check', 15)}</span><span class="o">tan x</span></div>
          <span class="wa-xp">+10 XP</span><span class="wa-streak">${icon('fire', 15)} 5-day streak</span></div>`,
      h: 'Practice that sticks',
      p: 'Endless questions with worked answers, flashcards that come back right before you would forget, and a Today plan that says what to do in ten minutes. Streaks and XP keep you coming back.',
      next: 'Next'
    }),
    bo: () => ({
      art: `<div class="wa wa-tutor"><div class="wa-chat"><span class="wa-mini">${bo(42)}</span><span class="wa-bubble"><span class="dots"><i></i><i></i><i></i></span><b>Let’s work it out on my board.</b></span></div>
          <div class="wa-board"><b>Solving 2x + 3 = 11</b><span class="l l1"><em>1</em>Take 3 from both sides: 2x = 8</span><span class="l l2"><em>2</em>Divide by 2</span><span class="l l3 ans">${icon('check', 14)} x = 4</span></div>
          <span class="wa-call">${icon('phone', 22)}<i></i><i></i></span></div>`,
      h: 'Meet Bo, your tutor',
      p: 'Ask him anything about your classes, snap a photo of a problem, or call him and just talk. He works the math out on his board, step by step, and he knows your exams. Bo comes with Mathub Max.',
      next: 'Next'
    }),
    create: () => ({
      art: `<div class="wa wa-create"><div class="wa-doc"><b>CHMY 121 syllabus</b><i></i><i></i><i></i><i></i><i></i></div><span class="wa-arrow">${icon('right', 22)}</span>
          <span class="wa-bot">${bo(66)}</span><div class="wa-class"><b>CHMY 121</b><span>General Chemistry</span><small>12 topics · 140 questions · 3 exams</small></div></div>`,
      h: 'Any class, from its syllabus',
      p: 'Taking something Mathub does not have yet? Drop in its syllabus and Bo writes the whole class: notes, practice, flashcards and its calendar. That comes with Mathub Pro or Max.',
      next: 'Next'
    }),
    classes: () => ({
      h: 'Which classes are you taking?',
      p: 'Pick at least one. Mathub shows only yours, and you can change them any time in Settings.',
      body: `<div class="wl-classes" role="group" aria-label="Your classes">${ids().map(id => { const C = Courses[id]; const on = W.picked.has(id); return `<button type="button" class="wl-class${on ? ' on' : ''}" aria-pressed="${on}" data-c="${esc(id)}" style="${cls(id)}"><span class="wl-class-art" aria-hidden="true">${App.classSprite ? App.classSprite(id, 4) : ''}</span><span class="wl-class-t"><b>${esc(C.short || C.code)}</b><span>${esc(C.code)} · ${esc(C.name)}</span></span><span class="wl-tick" aria-hidden="true">${icon('check', 16)}</span></button>`; }).join('')}</div>
        <p class="wl-note">${icon('plus', 14)} Taking something else? You can make any class from its syllabus after this.</p>`,
      next: 'Continue'
    }),
    plan: () => ({
      h: 'Pick your membership',
      p: 'Start free, or bring Bo along. You can change or cancel any time on Your plan.',
      body: `<div class="wl-plans" role="radiogroup" aria-label="Membership">${['free', 'pro', 'max'].map(k => { const on = W.plan === k; const mine = have() === k; return `<button type="button" role="radio" aria-checked="${on}" class="wl-plan wl-${k}${on ? ' on' : ''}" data-p="${k}"><span class="wl-plan-h"><b>${esc(planName(k))}</b>${mine ? '<span class="wl-have">Yours</span>' : ''}</span><span class="wl-price"><b>${esc(price(k))}</b>${k === 'free' ? '<small> forever</small>' : '<small> a month</small>'}</span><ul>${PLAN_LINES[k].map(l => `<li>${icon('check', 14)}<span>${esc(l)}</span></li>`).join('')}</ul></button>`; }).join('')}</div>
        <p class="wl-note" id="wl-plan-note">${W.declined ? `${icon('clock', 14)} No problem: you are on Free for now. Get ${esc(planName(W.declined))} any time from Your plan.` : `${icon('lock', 14)} Paid plans renew monthly until you cancel. Payment is taken by Stripe, in a new tab.`}</p>`,
      next: ''
    }),
    ready: () => ({
      art: `<div class="wa wa-ready"><span class="wa-disc"></span><span class="wa-bo">${bo(156)}</span><i class="wa-spark s1"></i><i class="wa-spark s2"></i><i class="wa-spark s3"></i><i class="wa-spark s4"></i></div>`,
      h: `You’re all set${firstName() ? `, ${esc(firstName())}` : ''}!`,
      p: 'Your start page always has your next step at the top, and Bo is one click away.',
      body: `<ul class="wl-sum"><li>${icon('book', 16)}<span><b>Your classes</b>${esc([...W.picked].map(id => Courses[id] ? (Courses[id].short || Courses[id].code) : id).join(', '))}</span></li><li>${icon('gem', 16)}<span><b>Membership</b>${esc(planName(have() || 'free'))}</span></li></ul>`,
      next: 'Open my start page'
    })
  };

  /* ---------- the screen ---------- */
  function shell() {
    const n = STEPS.length;
    return `<div class="wl-sky" aria-hidden="true"><span class="wl-sun"></span><span class="wl-cloud c1"></span><span class="wl-cloud c2"></span><span class="wl-cloud c3"></span>
        <svg class="wl-ridge r1" viewBox="0 0 1600 300" preserveAspectRatio="none"><path d="M0 300 L0 170 L120 110 L240 160 L380 70 L520 150 L640 100 L800 170 L930 80 L1080 150 L1220 90 L1360 160 L1480 100 L1600 140 L1600 300Z"/></svg>
        <svg class="wl-ridge r2" viewBox="0 0 1600 300" preserveAspectRatio="none"><path d="M0 300 L0 200 L160 140 L300 200 L460 120 L600 190 L760 130 L900 210 L1050 140 L1200 200 L1340 130 L1480 190 L1600 150 L1600 300Z"/></svg>
        <svg class="wl-ridge r3" viewBox="0 0 1600 300" preserveAspectRatio="none"><path d="M0 300 L0 240 L140 200 L260 236 L420 190 L560 240 L700 206 L860 250 L1000 210 L1160 246 L1300 214 L1460 244 L1600 220 L1600 300Z"/></svg></div>
      <header class="wl-top"><span class="wl-brand">${App.logoSvg ? App.logoSvg(30) : ''}<b>Mathub</b></span>
        <div class="wl-trail" aria-hidden="true"><span class="wl-line"><i></i></span>${STEPS.map((s, i) => `<span class="wl-dot" style="left:${(i / (n - 1) * 100).toFixed(2)}%"></span>`).join('')}<span class="wl-walker">${bo(30)}</span></div>
        <button type="button" class="wl-skip" data-w="skip">Skip the tour</button></header>
      <p class="sr-only" id="wl-pos" aria-live="polite"></p>
      <main class="wl-stage" id="wl-stage"></main>
      <footer class="wl-foot"><span class="wl-foot-t">Not you? <button type="button" class="linkbtn" data-w="logout">Log out</button></span></footer>`;
  }
  function acts(k, S) {
    const i = STEPS.indexOf(k); const back = i > 0 && k !== 'ready' ? `<button type="button" class="btn lg wl-back" data-w="back">${icon('left', 16)} Back</button>` : '';
    let next;
    if (k === 'classes') next = `<button type="button" class="btn primary lg wl-next" data-w="next"${W.picked.size ? '' : ' aria-disabled="true"'}>${W.picked.size ? `Continue with ${W.picked.size} class${W.picked.size === 1 ? '' : 'es'}` : 'Pick at least one class'}${icon('right', 16)}</button>`;
    else if (k === 'plan') {
      const p = W.plan; const owned = p && RANK[have()] >= RANK[p] && p !== 'free';
      const label = !p ? 'Pick a membership' : W.declined || p === 'free' ? 'Start with Free' : owned ? `Continue with ${planName(p)}` : `Get ${planName(p).replace('Mathub ', '')} · ${price(p)} a month`;
      next = `<button type="button" class="btn primary lg wl-next" data-w="next"${p ? '' : ' aria-disabled="true"'}>${W.busy ? 'One moment…' : label}${icon('right', 16)}</button>`;
    } else next = `<button type="button" class="btn primary lg wl-next" data-w="next">${S.next}${icon('right', 16)}</button>`;
    return `${back}${next}`;
  }
  function paint(focus) {
    if (!W.el) return; const k = STEPS[W.i]; const S = SCENE[k](); const el = W.el;
    el.dataset.step = k; el.dataset.kind = CHOOSE.includes(k) ? 'choose' : k === 'ready' ? 'ready' : 'tour'; el.style.setProperty('--s', W.i); el.style.setProperty('--p', (W.i / (STEPS.length - 1)).toFixed(3));
    $('#wl-stage', el).innerHTML = `${S.art ? `<div class="wl-art" aria-hidden="true">${S.art}</div>` : ''}<div class="wl-copy"><h1 class="wl-h wi" id="wl-h" tabindex="-1">${S.h}</h1><p class="wl-p wi" style="--d:90ms">${S.p}</p>${S.body ? `<div class="wl-body wi" style="--d:160ms">${S.body}</div>` : ''}<p class="wl-msg" id="wl-msg" role="alert" hidden></p><div class="wl-acts wi" style="--d:220ms">${acts(k, S)}</div></div>`;
    $('#wl-pos', el).textContent = `Step ${W.i + 1} of ${STEPS.length}`;
    $('.wl-skip', el).hidden = W.i >= STEPS.indexOf('classes');
    $('.wl-foot', el).hidden = k === 'ready';
    if (focus !== false) { const h = $('#wl-h', el); if (h) h.focus({ preventScroll: true }); }
    $('#wl-stage', el).scrollTop = 0; el.scrollTop = 0;
    if (k === 'ready' && App.confetti) setTimeout(() => App.confetti({ count: 140 }), 350);
  }
  function go(i) {
    if (!W.el || i < 0 || i >= STEPS.length || i === W.i) return;
    const stage = $('#wl-stage', W.el); W.el.dataset.dir = i > W.i ? 'fwd' : 'back';
    const swap = () => { W.i = i; if (W.el) { stage.classList.remove('out'); paint(); } };
    if (still()) return swap();
    stage.classList.add('out'); setTimeout(swap, 200);
  }
  const msg = t => { const m = W.el && $('#wl-msg', W.el); if (!m) return; m.textContent = t || ''; m.hidden = !t; };

  async function next() {
    const k = STEPS[W.i];
    if (k === 'classes') { if (!W.picked.size) { msg('Pick at least one class to go on.'); return; } return go(W.i + 1); }
    if (k === 'plan') return choosePlan();
    if (k === 'ready') return finish();
    go(W.i + 1);
  }
  /* the membership: Free goes straight on; Pro or Max opens the checkout, and closing it leaves you on Free */
  async function choosePlan() {
    const p = W.plan; if (!p) { msg('Pick Free, Pro or Max to go on.'); return; } if (W.busy) return;
    if (p !== 'free' && !W.declined && RANK[have()] < RANK[p]) {
      W.busy = true; paint(false); let ok = false;
      try { ok = await App.paywall(p === 'max' ? { need: 'max' } : {}); } catch (e) {}
      W.busy = false;
      if (!ok || RANK[have()] < RANK[p]) { W.declined = p; paint(false); return; }
    }
    await save(W.declined ? 'free' : p);
  }
  async function save(plan) {
    W.busy = true; msg('');
    try {
      const res = await fetch(API + 'welcome_done', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ courses: [...W.picked], plan }) });
      const j = await res.json().catch(() => null); if (!j || !j.ok) throw new Error((j && j.error) || 'That did not save. Check your connection and try again.');
      if (App.auth && App.auth.user) Object.assign(App.auth.user, j.user);
      setSetting('courses', [...W.picked]); setSetting('tourDone', true); W.saved = true;
      if (App.rebuildNav) App.rebuildNav();
      W.busy = false; go(STEPS.indexOf('ready'));
    } catch (e) { W.busy = false; paint(false); msg(e.message); }
  }
  function finish() { close(); if (location.hash && location.hash !== '#/') location.hash = '#/'; else if (App.rerender) App.rerender(); }

  function onClick(e) {
    const c = e.target.closest('[data-c]'); if (c && W.el.dataset.step === 'classes') { const id = c.dataset.c; if (W.picked.has(id)) W.picked.delete(id); else W.picked.add(id); const on = W.picked.has(id); c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); msg(''); $('.wl-acts', W.el).innerHTML = acts('classes', SCENE.classes()); return; }
    const pl = e.target.closest('[data-p]'); if (pl) { W.plan = pl.dataset.p; W.declined = ''; $$('[data-p]', W.el).forEach(b => { const on = b === pl; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }); msg(''); const note = $('#wl-plan-note', W.el); if (note) note.innerHTML = `${icon('lock', 14)} Paid plans renew monthly until you cancel. Payment is taken by Stripe, in a new tab.`; $('.wl-acts', W.el).innerHTML = acts('plan', SCENE.plan()); return; }
    const b = e.target.closest('[data-w]'); if (!b) return; const w = b.dataset.w;
    if (w === 'next') return next();
    if (w === 'back') return go(W.i - 1);
    if (w === 'skip') return go(STEPS.indexOf('classes'));
    if (w === 'logout') { close(); if (App.auth && App.auth.logout) App.auth.logout(); }
  }
  function onKey(e) {
    if (!W.el || $('.modal-backdrop')) return;   // the checkout card is on top
    const typing = e.target.closest && e.target.closest('input, textarea, select');
    if (e.key === 'Escape') { e.preventDefault(); if (W.i < STEPS.indexOf('classes')) go(STEPS.indexOf('classes')); return; }
    if (!typing && e.key === 'ArrowRight' && !e.target.closest('button')) { e.preventDefault(); next(); return; }
    if (!typing && e.key === 'ArrowLeft' && !e.target.closest('button') && STEPS[W.i] !== 'ready') { e.preventDefault(); go(W.i - 1); return; }
    if (e.key === 'Tab') {   // focus stays in the welcome
      const f = $$('button:not([disabled]), [href], input, [tabindex="0"]', W.el).filter(x => x.offsetParent !== null && !x.closest('[hidden]')); if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === a || document.activeElement === $('#wl-h', W.el))) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  }

  function open(o = {}) {
    if (NATIVE || W.el || !user()) return false;
    const pre = Array.isArray(settings().courses) && settings().courses.length && settings().courses.length < ids().length ? settings().courses : [];
    Object.assign(W, { i: 0, picked: new Set(pre.filter(id => Courses[id])), plan: '', declined: '', busy: false, saved: false, back: document.activeElement });
    if (o.at && STEPS.includes(o.at)) W.i = STEPS.indexOf(o.at);
    const el = W.el = document.createElement('div'); el.id = 'welcome'; el.className = 'wl'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'wl-h');
    el.innerHTML = shell(); document.body.appendChild(el); document.documentElement.classList.add('wl-lock');
    if (App.tour && App.tour.stop) App.tour.stop(false);
    el.addEventListener('click', onClick); document.addEventListener('keydown', onKey, true);
    paint(); requestAnimationFrame(() => el.classList.add('open'));
    return true;
  }
  function close() {
    if (!W.el) return; const el = W.el; W.el = null;
    document.removeEventListener('keydown', onKey, true); document.documentElement.classList.remove('wl-lock');
    el.classList.remove('open'); setTimeout(() => el.remove(), still() ? 0 : 260);
  }
  /* new accounts that have not finished it yet (the server says so); never in the apps */
  const needed = () => { const u = user(); return !NATIVE && !!u && u.welcomed === false; };

  App.welcome = { open, close, needed, isOpen: () => !!W.el, steps: STEPS };
})(window);

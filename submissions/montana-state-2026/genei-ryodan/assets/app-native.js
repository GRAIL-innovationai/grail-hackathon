/* ============================================================
   Mathub app — what only the app does (loaded only in the iOS and Android apps, after every other script)
   - reminders: exam reminders and a daily study reminder as local notifications, only after
     the student turns them on and allows them
   - haptics on right and wrong answers, finished lessons and level-ups
   - an "On this device" panel in Settings (reminders, haptics, your plan)
   - the app's own shell: app bar, start page (class cards, plan, tools, path) and tab bar
   Create a class, the classes students make, the Pro and Max plans and sharing are in assets/create.js,
   which the website loads too.
   The website never loads this file (see app/scripts/build-www.js).
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; const N = global.Native; const MA = global.MATHUB_APP; const Packs = global.MathubPacks;
  if (!App || !N || !MA || !MA.native || !Packs || !App.packs) return;
  const { $, $$, esc, icon, bind, toast, settings, setSetting } = App;
  const Courses = global.Courses;
  const ANDROID = !!(window.MATHUB_APP && window.MATHUB_APP.platform === 'android');
  const DEVICE = ANDROID ? (Math.min(screen.width, screen.height) >= 600 ? 'tablet' : 'phone') : /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iPad' : 'iPhone';

  /* ---------- haptics follow the sound cues ---------- */
  const HAPTIC = { correct: 'success', wrong: 'error', complete: 'medium', levelup: 'success', tap: 'select' };
  if (App.sfx && typeof App.sfx.play === 'function') { const play = App.sfx.play.bind(App.sfx); App.sfx.play = name => { N.haptic(HAPTIC[name] || 'light'); return play(name); }; }

  /* ---------- website-only pieces step aside ---------- */
  App.installAvailable = () => false;
  /* every study tool works without an account in the app (App Store guideline 5.1.1(v)): an account only adds sync,
     discussions and classes with an instructor, and sign-up is limited to Montana State addresses */
  if (App.auth) App.auth.gate = () => 'open';
  App.views.teach = {
    title: 'Mathub Faculty',
    render(root) {
      root.innerHTML = `<div class="landing-wrap"><header class="landing-top"><div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Mathub Faculty</h1><p class="muted">The syllabus editor for instructors is on the web, where there is room for the form and the page side by side.</p></div></header>
        <div class="row gap-sm" style="flex-wrap:wrap"><button class="btn primary" data-action="open-web">${icon('external', 14)} Open Mathub Faculty</button><a class="btn" href="#/">${icon('left', 14)} Back to your classes</a></div></div>`;
      bind(root, { 'open-web': () => N.open(MA.api + '#/teach') });
    }
  };

  /* ============================================================
     Classes students make, the Pro and Max plans and sharing are in assets/create.js (the website has them too);
     what is used here:
     ============================================================ */
  const Mine = App.myClasses, Sub = App.subscription, paywall = App.paywall, locked = App.classLocked, local = App.packs.local;
  const wireLock = (el, C) => App.createLock.wire(el, C);
  const ISO = /^\d{4}-\d{2}-\d{2}$/;

  /* ============================================================
     Reminders: local notifications, only when turned on
     ============================================================ */
  const Reminders = App.reminders = {
    timer: null,
    sync() { clearTimeout(this.timer); this.timer = setTimeout(() => this.apply().catch(() => {}), 400); },
    async apply() {
      if (!N.notify.available()) return;
      const s = settings(); const pend = await N.notify.pending(); const ours = pend.filter(n => n.extra && n.extra.mh === 1).map(n => n.id);
      if (ours.length) await N.notify.cancel(ours);
      if (!s.examReminders && !s.dailyReminder) return;
      if ((await N.notify.permission()) !== 'granted') return;
      const list = []; const now = Date.now();
      if (s.examReminders) {
        // the classes the student chose, plus the ones they made; until they choose, only the ones they made (not every class on Mathub)
        const mine = [...new Set((Array.isArray(s.courses) && s.courses.length ? s.courses : []).concat([...local]))].filter(id => Courses[id] && !Courses[id].preview);
        const items = [];
        mine.forEach(id => { const C = Courses[id]; if (!C) return; (C.EXAMS || []).forEach(e => { if (!e.date || !ISO.test(e.date)) return; const [y, m, d] = e.date.split('-').map(Number);
          [[3, 'in 3 days'], [1, 'tomorrow']].forEach(([before, when]) => { const at = new Date(y, m - 1, d - before, 18, 0, 0); if (at.getTime() > now + 60000 && at.getTime() - now < 120 * 86400000) items.push({ at, title: `${C.short || C.code}: ${e.name} is ${when}`, body: before === 1 ? 'A last look at what it covers, and a few practice questions.' : 'What it covers, the topics to review and practice for each one.', hash: `#/${id}/exam` }); }); }); });
        items.sort((a, b) => a.at - b.at).slice(0, 56).forEach((it, i) => list.push({ id: 1000 + i, title: it.title, body: it.body, schedule: { at: it.at, allowWhileIdle: true }, extra: { mh: 1, hash: it.hash } }));
      }
      if (s.dailyReminder) { const [h, mi] = String(s.reminderTime || '19:00').split(':').map(Number); list.push({ id: 999, title: 'A few minutes of study?', body: 'Your plan for today is ready: flashcards that are due and a short lesson.', schedule: { on: { hour: h || 19, minute: mi || 0 }, repeats: true, allowWhileIdle: true }, extra: { mh: 1, hash: '#/today' } }); }
      await N.notify.schedule(list);
    },
    /* asks the first time a reminder is turned on; true when notifications are allowed */
    async enable() {
      if (!N.notify.available()) return false;
      let p = await N.notify.permission(); if (p === 'prompt' || p === 'prompt-with-rationale') p = await N.notify.request();
      if (p !== 'granted') { toast(ANDROID ? 'Notifications are off for Mathub. Turn them on in Settings › Apps › Mathub › Notifications.' : 'Notifications are off for Mathub. Turn them on in the Settings app: Mathub › Notifications.', 6000); return false; }
      return true;
    }
  };
  N.notify.onTap(extra => { if (extra && typeof extra.hash === 'string' && /^#\//.test(extra.hash)) location.hash = extra.hash; });
  N.onResume(() => Reminders.sync());

  /* ---------- Settings: an "On this device" panel ---------- */
  function devicePanel() {
    const s = settings(); const mine = Mine.list().length;
    return `<div class="panel span-2 app-panel" id="app-panel"><div class="panel-h"><div class="panel-title">${icon('bell')} On this ${DEVICE}</div></div>
      <div class="grid cols-2"><div>
        <label class="check" style="padding:0"><input type="checkbox" id="ap-exams" ${s.examReminders ? 'checked' : ''}><span>Exam reminders <span class="muted small">(3 days before and the evening before each exam in your classes${Array.isArray(s.courses) && s.courses.length ? '' : '; choose your classes above so Mathub knows which ones'})</span></span></label>
        <label class="check" style="padding:0"><input type="checkbox" id="ap-daily" ${s.dailyReminder ? 'checked' : ''}><span>Daily study reminder</span></label>
        <div class="field mt-1" style="max-width:220px"><label for="ap-time">Remind me at</label><input class="input" type="time" id="ap-time" value="${esc(s.reminderTime || '19:00')}" ${s.dailyReminder ? '' : 'disabled'}></div>
      </div><div>
        <label class="check" style="padding:0"><input type="checkbox" id="ap-haptics" ${s.haptics === false ? '' : 'checked'}><span>Haptics <span class="muted small">(a tap when an answer is right or wrong)</span></span></label>
        <div class="ap-sub"><div class="ap-sub-t"><b>${Sub.active() ? esc(Sub.planName()) : 'Your plan'}</b><span class="small muted">${subLine()}</span></div><div class="row gap-sm">${Sub.active() ? `<button type="button" class="btn sm" data-sub="manage">Manage subscription</button>` : `<button type="button" class="btn sm primary" data-sub="buy">See the plans</button>`}${Sub.plan() === 'pro' ? `<button type="button" class="btn sm primary" data-sub="max">Move up to Max</button>` : ''}<button type="button" class="btn sm ghost" data-sub="restore">Restore purchases</button></div></div>
        <p class="small mt-1">${mine ? `${mine} class${mine === 1 ? '' : 'es'} you created ${mine === 1 ? 'is' : 'are'} saved on this ${DEVICE}${App.auth && App.auth.user ? ' and with your account' : ''}.` : `Classes you create from a syllabus are saved on this ${DEVICE}, and with your account when you are signed in.`} <a href="#/create">Create a class</a></p>
        <p class="small muted">Mathub ${esc(MA.version)} · <a href="#/policy">Terms and privacy</a> · <a href="#/contact">Contact</a></p>
      </div></div></div>`;
  }
  function subLine() {
    const st = Sub.status(); const day = d => { try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } };
    if (Sub.active()) return st.until ? (st.renews ? `On. Renews ${day(st.until)}.` : `On until ${day(st.until)}; it will not renew.`) : 'On.';
    return 'No plan. Pro makes classes from any syllabus; Max adds Bo, your AI tutor, who also writes classes for you. The example class is free.';
  }
  function wireSub(el) {
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-sub]'); if (!b) return; const a = b.dataset.sub;
      if (a === 'manage') { N.open(Sub.manageUrl()); return; }
      if (a === 'buy' || a === 'max') { if (await paywall(a === 'max' ? { need: 'max', reason: 'bo' } : {})) App.rerender(); return; }
      b.disabled = true; try { if (await Sub.restore()) { toast(`${Sub.planName()} is on.`, 3000); App.rerender(); } else toast(Sub.noneFound(), 4500); } catch (x) { toast(x.message, 4500); } b.disabled = false;
    });
  }
  function wireDevicePanel(el) {
    wireSub(el);
    const ex = $('#ap-exams', el), dy = $('#ap-daily', el), tm = $('#ap-time', el), hp = $('#ap-haptics', el);
    const turnOn = async (box, key) => { if (box.checked && !(await Reminders.enable())) { box.checked = false; return; } setSetting(key, box.checked); if (key === 'dailyReminder') tm.disabled = !box.checked; Reminders.sync(); if (box.checked) toast(key === 'examReminders' ? 'Exam reminders are on.' : `You will get a reminder every day at ${tm.value}.`); };
    ex.addEventListener('change', () => turnOn(ex, 'examReminders'));
    dy.addEventListener('change', () => turnOn(dy, 'dailyReminder'));
    tm.addEventListener('change', () => { setSetting('reminderTime', tm.value || '19:00'); Reminders.sync(); });
    hp.addEventListener('change', () => { setSetting('haptics', hp.checked); if (hp.checked) N.haptic('success'); });
  }

  /* ============================================================
     The app's own shell (the website keeps its sidebar, top bar and start page):
     - an app bar: the class you are in (tap to switch, add a class or open its tools), your streak,
       today's XP and the account button
     - the start page: your classes as a row of cards, and the winding path through the one you picked
     - a tab bar: Learn, Practice, Today, Board, Me
     ============================================================ */
  const { myIds, curClass, setClass, examOf, daysTo } = App.home;
  const ccStyle = App.classStyle;   // each class's colours (assets/create.js)
  const inDays = App.home.inDays;
  const goSearch = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  const ROOTS = r => (!r.course && ['home', 'today', 'forum', 'settings', 'tutor'].includes(r.view)) || (r.course && ['practice', 'flashcards'].includes(r.view));
  const practiceHref = id => { const C = Courses[id]; if (!C) return '#/'; return (C.quiz || C.hasQuiz || C.quizTopics || C.QUIZ) ? `#/${id}/practice` : `#/${id}/flashcards`; };

  /* ---------- app bar ---------- */
  function paintAppBar(r) {
    let bar = $('#appbar'); if (!bar) { bar = document.createElement('header'); bar.id = 'appbar'; bar.className = 'appbar'; document.body.prepend(bar); bar.addEventListener('click', onBar); }
    const id = (r && r.course && Courses[r.course]) ? r.course : curClass(); const C = id ? Courses[id] : null;
    const st = App.streakAll ? App.streakAll() : { n: 0, activeToday: false }; const xp = App.xpToday ? App.xpToday() : 0; const goal = App.dailyGoal ? App.dailyGoal() : 30;
    const u = App.auth && App.auth.user; const name = u ? (u.name || u.email.split('@')[0]) : '';
    const back = r && !ROOTS(r) ? `<button class="ab-back" data-ab="back" aria-label="Back">${icon('left', 22)}</button>` : '';
    bar.innerHTML = `<div class="ab-l">${back}${C ? `<button class="ab-class" data-ab="classes" style="${ccStyle(id)}" aria-label="${esc(C.short || C.code)}: switch class or open its tools" aria-haspopup="dialog"><span class="ab-class-code">${esc(C.short || C.code)}</span>${icon('chevron', 14)}</button>` : `<button class="ab-class none" data-ab="classes" aria-haspopup="dialog">${icon('plus', 16)}<span class="ab-class-code">Add a class</span></button>`}</div>
      <div class="ab-r"><button class="ab-stat ab-streak${st.activeToday ? ' on' : ''}" data-ab="streak" aria-label="${st.n} day streak${st.activeToday ? ', studied today' : ''}">${icon('fire', 20)}<b>${st.n}</b></button>
      <button class="ab-stat ab-xp${xp >= goal ? ' on' : ''}" data-ab="xp" aria-label="${xp} of ${goal} XP today">${icon('zap', 20)}<b>${xp}</b><small>/${goal}</small></button>
      ${u ? `<a class="ab-acct" href="#/settings" aria-label="Your account, ${esc(name)}"><span class="ab-avatar">${esc(name.trim()[0].toUpperCase())}</span></a>` : `<button class="ab-signin" data-ab="signin">Sign in</button>`}</div>`;
  }
  function onBar(e) {
    const b = e.target.closest('[data-ab]'); if (!b) return; const a = b.dataset.ab; N.haptic('select');
    if (a === 'back') { if (history.length > 1) history.back(); else location.hash = '#/'; }
    else if (a === 'classes') openSheet();
    else if (a === 'signin') { if (App.auth) App.auth.open('login'); }
    else if (a === 'streak' || a === 'xp') pop(a, b);
  }
  function pop(kind, anchor) {
    const old = $('.ab-pop'); if (old) { const same = old.dataset.kind === kind; old.remove(); if (same) return; }
    const el = document.createElement('div'); el.className = 'ab-pop'; el.dataset.kind = kind; el.setAttribute('role', 'status');
    if (kind === 'streak') { const st = App.streakAll(); const fz = App.freezeBank ? App.freezeBank() : 0;
      el.innerHTML = `<b>${st.n} day${st.n === 1 ? '' : 's'} in a row</b><span>${st.activeToday ? 'You studied today. Come back tomorrow to keep it going.' : st.n ? 'Answer a question or review a card today to keep it.' : 'Answer a question or review a card to start a streak.'}</span><span class="ab-pop-meta">Longest ${st.longest || st.n} · ${fz} streak freeze${fz === 1 ? '' : 's'} saved</span>`; }
    else { const xp = App.xpToday(), goal = App.dailyGoal(), lv = App.level ? App.level() : null; const pct = Math.min(100, Math.round(100 * xp / goal));
      el.innerHTML = `<b>${xp} of ${goal} XP today</b><span class="ab-bar" role="presentation"><i style="width:${pct}%"></i></span><span class="ab-pop-meta">${lv ? `Level ${lv.n}${lv.name ? ' · ' + esc(lv.name) : ''} · ${lv.toNext} XP to the next` : ''}</span>`; }
    document.body.appendChild(el); const r = anchor.getBoundingClientRect(), w = el.offsetWidth;   // centred under its button, kept 12 px inside the screen
    el.style.top = (r.bottom + 8) + 'px'; el.style.left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 12)) + 'px';
    setTimeout(() => document.addEventListener('click', function off(ev) { if (!el.contains(ev.target)) { el.remove(); document.removeEventListener('click', off, true); } }, true), 0);
  }

  /* ---------- the class sheet: switch class, add one, and this class's tools ---------- */
  function openSheet(focus) {
    if ($('#class-sheet')) return; const id = curClass(); const C = id ? Courses[id] : null; const mine = myIds();
    const all = App.COURSE_ORDER.filter(x => Courses[x] && !Courses[x].preview && !local.has(x));
    const tools = C && C.NAV && App.groupNav ? App.groupNav(C.NAV).flatMap(g => g.items) : [];
    const more = [['#/today', 'Today', 'flag'], ['#/focus', 'Focus room', 'clock'], ['#/resources', 'Resources', 'book'], ['#/guides', 'Study guides', 'bulb'], ['#/tools', 'Tools', 'calc'], ['#/gpa', 'GPA', 'chart'], ['#/leagues', 'Leagues', 'trophy'], ['#/badges', 'Badges', 'award']];
    const el = document.createElement('div'); el.className = 'modal-backdrop sheet-backdrop'; el.id = 'class-sheet';
    el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Your classes"><div class="sheet-grab" aria-hidden="true"></div>
      <div class="sheet-h"><h2>Your classes</h2><button class="icon-btn" data-action="close" aria-label="Close">${icon('x', 18)}</button></div>
      <div class="sheet-classes">${mine.map(x => { const K = Courses[x]; const ex = examOf(K); const d = daysTo(ex); return `<a class="sc-row${x === id ? ' on' : ''}" href="#/" data-pick="${x}" style="${ccStyle(x)}"><span class="sc-badge">${esc((K.short || K.code).replace(/\s+/g, ' '))}</span><span class="sc-main"><b>${esc(K.name)}</b><small>${locked(x) ? 'Locked: your plan is off' : ex && d !== null && d >= 0 ? `${esc(ex.name)} ${inDays(d)}` : local.has(x) ? 'Made from your syllabus' : 'No exam ahead'}</small></span>${x === id ? icon('check', 18) : icon('right', 16)}</a>`; }).join('')}</div>
      <div class="sheet-actions"><a class="btn primary" href="#/create">${icon('plus', 15)} Create a class from a syllabus</a><button class="btn" data-action="pick">${icon('grid', 15)} Choose Montana State classes</button></div>
      <div class="sheet-pick" hidden><p class="small muted">Tick the classes you take. The rest stay out of your way.</p><div class="pick-list">${all.map(x => `<label class="check pick-row" style="${ccStyle(x)}"><input type="checkbox" data-c="${x}"${mine.includes(x) ? ' checked' : ''}><span class="sc-badge">${esc(Courses[x].short || Courses[x].code)}</span><span>${esc(Courses[x].name)}</span></label>`).join('')}</div><div class="row gap-sm mt-1"><button class="btn primary" data-action="save-pick">Save</button>${App.views.request && App.canRequest && App.canRequest() ? `<a class="btn ghost" href="#/request">Not listed? Request it</a>` : App.views.create ? `<a class="btn ghost" href="#/create">Not listed? Make it</a>` : ''}</div></div>
      ${C ? `<h3 class="sheet-sub sheet-tools-h">In ${esc(C.short || C.code)}</h3><div class="sheet-grid" style="${ccStyle(id)}"><a class="sg-item" href="#/${id}/dashboard">${icon('home', 20)}<span>Class page</span></a>${tools.filter(t => t[0] !== 'dashboard').map(([v, l, ic]) => `<a class="sg-item" href="#/${id}/${v}">${icon(ic || 'book', 20)}<span>${esc(l)}</span></a>`).join('')}</div>` : ''}
      <h3 class="sheet-sub">Everything else</h3><div class="sheet-grid">${more.map(([h, l, ic]) => `<a class="sg-item" href="${h}">${icon(ic, 20)}<span>${l}</span></a>`).join('')}<button class="sg-item" data-action="search">${icon('search', 20)}<span>Search</span></button>${App.ambient ? `<button class="sg-item" data-action="sounds"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg><span>Focus sounds</span></button>` : ''}</div></div>`;
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('open'));
    if (focus === 'tools') { const h = $('.sheet-tools-h', el); if (h) requestAnimationFrame(() => { const sh = $('.sheet', el); sh.scrollTop += h.getBoundingClientRect().top - sh.getBoundingClientRect().top - 12; }); }   // "All tools" on the start page opens the sheet at the class's tools
    const close = () => { document.removeEventListener('keydown', onKey); el.classList.remove('open'); setTimeout(() => el.remove(), N.reduceMotion() ? 0 : 220); };
    const onKey = e => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', onKey);
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-action="close"]')) return close();
      const pick = e.target.closest('[data-pick]'); if (pick) { e.preventDefault(); setClass(pick.dataset.pick); N.haptic('select'); close(); if (location.hash === '#/' || location.hash === '' || location.hash === '#') App.rerender(); else location.hash = '#/'; return; }
      if (e.target.closest('[data-action="pick"]')) { const box = $('.sheet-pick', el); box.hidden = !box.hidden; return; }
      if (e.target.closest('[data-action="save-pick"]')) { const ids = $$('input[data-c]', el).filter(i => i.checked).map(i => i.dataset.c).concat([...local].filter(x => Courses[x])); if (!ids.length) { toast('Pick at least one class.'); return; } setSetting('courses', ids); if (App.auth && App.auth.user && App.auth.savePrefs) App.auth.savePrefs({ courses: ids }).catch(() => {}); if (App.rebuildNav) App.rebuildNav(); if (!ids.includes(settings().appClass)) setClass(ids[0]); close(); App.rerender(); return; }
      if (e.target.closest('[data-action="search"]')) { close(); setTimeout(goSearch, 50); return; }
      if (e.target.closest('[data-action="sounds"]')) { close(); setTimeout(() => App.ambient.open(), 50); return; }   // the sounds bubble stays out of the way in the app until something plays
      if (e.target.closest('a[href]')) close();
    });
  }

  /* ---------- the start page ----------
     Your classes as cards; under them the one you picked: where the class is, its next exam and how ready
     you are, and the next lesson; exam week when an exam is 7 days away or closer; then today across all
     your classes; then the class's tools and its path with every lesson named. The pieces are shared with
     the website's start page (assets/home.js). */
  const H = App.home; const safe = f => { try { return f(); } catch (e) { return null; } };
  const { nodesOf, todayHtml, classRow, heroHtml, lockHero, toolsHtml, pathHtml, examWeekHtml } = H;

  App.homeView = {
    title: 'Learn',
    render(root) {
      const mine = myIds(); const id = curClass();
      const banners = [App.inviteBanner ? safe(() => App.inviteBanner()) : '', App.recapBanner ? safe(() => App.recapBanner()) : ''].filter(Boolean).join('');
      root.innerHTML = `<div class="ah"><h1 class="sr-only">Learn</h1><div id="announcement-slot"></div>${banners ? `<div class="ah-banners">${banners}</div>` : ''}
        ${mine.length ? classRow(mine, id) : ''}
        <div class="ah-main" id="ah-main" aria-busy="${id ? 'true' : 'false'}">${id ? '<div class="ah-loading" aria-hidden="true"><i></i><i></i><i></i></div>' : `<div class="ah-empty"><span class="ah-empty-bo" aria-hidden="true">${App.bobcatSvg ? App.bobcatSvg(96) : ''}</span><h2>Which classes are you taking?</h2><p>Pick yours, or make one from any syllabus.</p><div class="row gap-sm"><button class="btn primary" data-ab-add="1">Add a class</button></div></div>`}</div></div>`;
      const row = $('.ah-row', root); const on = row && $('.ah-card.on', row); if (on) row.scrollLeft = Math.max(0, on.offsetLeft - 16);
      if (App.paintAnnouncement) safe(() => App.paintAnnouncement(root));
      const closePops = () => { $$('.ap-pop', root).forEach(x => { x.hidden = true; }); $$('[data-node]', root).forEach(x => x.setAttribute('aria-expanded', 'false')); $$('.ap-li.open', root).forEach(x => x.classList.remove('open')); document.body.classList.remove('ap-open'); };
      root.addEventListener('click', e => {
        if (e.target.closest('[data-ab-add]')) { N.haptic('select'); openSheet(); return; }
        if (e.target.closest('[data-ab-tools]')) { N.haptic('select'); openSheet('tools'); return; }
        const card = e.target.closest('.ah-card[data-cid]'); if (card) { N.haptic('select'); setClass(card.dataset.cid); App.homeView.scrolled = false; App.rerender(); return; }
        const node = e.target.closest('[data-node]'); if (node) { N.haptic('select'); const li = node.closest('.ap-li'); const p = $('.ap-pop', li); const open = p.hidden; closePops(); p.hidden = !open; li.classList.toggle('open', open); document.body.classList.toggle('ap-open', open); node.setAttribute('aria-expanded', String(open));
          if (open) { const lim = innerHeight - ($('#tabbar') || { offsetHeight: 0 }).offsetHeight - 16, below = p.getBoundingClientRect().bottom - lim; if (below > 0) scrollBy({ top: below, behavior: N.reduceMotion() ? 'auto' : 'smooth' }); }   // the card opens fully in view, above the tab bar
          return; }
        if (!e.target.closest('.ap-pop')) closePops();
      });
      if (!id) return;
      App.loadCourse(id).then(C => {
        const box = $('#ah-main'); if (!box || !root.isConnected) return;
        box.setAttribute('style', ccStyle(id)); box.setAttribute('aria-busy', 'false');
        if (locked(id)) { box.innerHTML = lockHero(C) + todayHtml(); wireLock(box, C); return; }
        const xw = examWeekHtml(C); box.innerHTML = heroHtml(C, { noExam: !!xw }) + xw + todayHtml() + toolsHtml(C) + pathHtml(C);
        // the class's cards can now show its progress, and the plan its flashcards
        const card = $(`.ah-card[data-cid="${id}"]`, root); if (card && !$('.ah-cbar', card)) { const ns = nodesOf(C); if (ns.length) { const dn = ns.filter(n => n.state === 'done').length; card.insertAdjacentHTML('beforeend', `<span class="ah-cbar" aria-label="${dn} of ${ns.length} topics mastered"><i style="width:${Math.round(100 * dn / ns.length)}%"></i></span>`); } }
        if (App.typeset) safe(() => App.typeset(box));
      }).catch(() => { const box = $('#ah-main'); if (box) { box.setAttribute('aria-busy', 'false'); box.innerHTML = `<div class="ah-empty"><p>This class could not be opened.</p><a class="btn" href="#/${id}/dashboard">Try its class page</a></div>`; } });
    }
  };

  /* ---------- tab bar ---------- */
  function paintTabs(r) {
    const bar = $('#tabbar'); if (!bar) return; const id = (r.course && Courses[r.course]) ? r.course : curClass();
    const tabs = [['#/', 'Learn', 'home', !r.course && r.view === 'home'], [id ? practiceHref(id) : '#/', 'Practice', 'list', !!r.course && ['practice', 'flashcards', 'lesson', 'blitz', 'exam'].includes(r.view)], ['#/tutor' + (id ? '/' + id : ''), 'Bo', 'bo', r.view === 'tutor'], ['#/today', 'Today', 'flag', r.view === 'today'], ['#/forum', 'Discuss', 'chat', r.view === 'forum'], ['#/settings', 'Me', 'user', r.view === 'settings']];
    bar.className = 'app-tabs'; bar.setAttribute('aria-label', 'Main');
    // Bo, the AI tutor, sits in the middle as himself
    bar.innerHTML = tabs.map(([h, l, ic, a]) => `<a class="tab-item${ic === 'bo' ? ' tab-bo' : ''}${a ? ' active' : ''}" href="${h}"${a ? ' aria-current="page"' : ''}${ic === 'bo' ? ' aria-label="Ask Bo, your AI tutor"' : ''}><span class="tab-ic">${ic === 'bo' ? (App.bobcatSvg ? App.bobcatSvg(30) : '') : icon(ic, 26)}</span><span>${l}</span></a>`).join('');
  }
  // the app bar follows XP and streak changes as they happen
  if (App.paintStats) { const ps = App.paintStats; App.paintStats = function () { const out = ps.apply(this, arguments); try { if ($('#appbar')) paintAppBar(lastRoute); } catch (e) {} return out; }; }
  let lastRoute = { course: null, view: 'home' };
  if (App.auth && App.auth.onChange) App.auth.onChange(() => { try { paintAppBar(lastRoute); } catch (e) {} });

  /* ---------- where the app's own pieces join the pages ---------- */
  App.onRender = App.onRender || [];
  App.onRender.push((root, r) => {
    /* web push needs a home-screen web app; the app has its own reminders in the panel below */
    if (r.view === 'settings') { const push = $('#acct-push', root); if (push && push.closest('section')) push.closest('section').remove(); }
    if (r.view === 'settings') { const acct = $('#acct-panel', root) || $('.acct-panel', root); const grid = $('.grid.cols-2', root); if (grid && !$('#app-panel', root)) { (acct ? acct : grid.firstElementChild || grid).insertAdjacentHTML(acct ? 'afterend' : 'beforebegin', devicePanel()); wireDevicePanel($('#app-panel', root)); } }
    lastRoute = r; document.body.classList.remove('ap-open'); paintAppBar(r); paintTabs(r); const p = $('.ab-pop'); if (p) p.remove(); const sh = $('#class-sheet'); if (sh) sh.remove();
  });
  document.addEventListener('DOMContentLoaded', () => setTimeout(() => Reminders.sync(), 1500));
})(window);

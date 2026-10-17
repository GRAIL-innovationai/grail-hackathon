/* ============================================================
   Mathub — community features (front-end)
   Daily challenge + leaderboards, badges, live presence, study
   sessions, community mock exams, student contributions, activity
   feed, and the landing/dashboard widgets that surface them.
   Server: api/social.php.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, on, toast, store, typeset, pageHead } = App;
  const API = 'api/index.php?r=';
  const auth = () => App.auth || {}; const user = () => auth().user || null; const offline = () => auth().mode !== 'server' || auth().unreachable;
  const NAMES = { calc: 'Calc I', physics: 'Physics I', precalc: 'Precalc', writ: 'WRIT 101', csci: 'CSCI 127', biob: 'BIOB 160', kin: 'KIN 322', psyx: 'PSYX 340', general: 'General' };
  const courseName = id => (global.Courses[id] && global.Courses[id].short) || NAMES[id] || id;
  const courseChip = id => `<span class="chip course-${esc(id)}">${esc(courseName(id))}</span>`;
  const fmtWhen = ts => { const d = new Date(ts * 1000); const t = App.todayISO(); const iso = App.toISO(d); const day = iso === t ? 'Today' : iso === App.toISO(App.addDays(App.parseISO(t), 1)) ? 'Tomorrow' : App.fmtDate(iso); return `${day} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`; };
  const timeAgo = ts => { const s = Math.max(0, Date.now() / 1000 - ts); if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`; };
  const fmtMs = ms => ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  async function api(route, body, method) {
    const opts = { method: method || (body ? 'POST' : 'GET'), credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Accept': 'application/json' }, cache: 'no-store' };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res, json; try { res = await fetch(API + route, opts); json = await res.json(); } catch (e) { throw Object.assign(new Error('Cannot reach the server right now.'), { network: true }); }
    if (!json || json.ok === false) { const err = new Error((json && json.error) || 'Request failed.'); err.data = json; err.status = res.status; throw err; }
    return json;
  }
  const S = { presence: null, badges: null, lastBadgeCheck: 0, community: {} };
  App.social = S;
  const lockCard = (t, x, o) => App.lockCard(t, x, o);
  const needLogin = (t, x) => lockCard(t, x, { compact: true });

  /* ---------- badges ---------- */
  function clientBadgeCodes() {
    const codes = []; const D = App.D; if (!D) return codes;
    const fc = store.get('flashcards', {});
    for (const u of D.UNITS || []) { const cards = (D.FLASHCARDS || []).filter(c => c.unit === u.n); if (cards.length && cards.every(c => (fc[c.id] || 0) >= 3)) { codes.push('unit_master'); break; } }
    return codes;
  }
  S.refreshBadges = async function (force) {
    if (!user() || offline()) return null;
    if (!force && Date.now() - S.lastBadgeCheck < 30000) return S.badges; S.lastBadgeCheck = Date.now();
    try { const r = await api('badges', { client: clientBadgeCodes() }); S.badges = r; if (r.new && r.new.length) { const names = r.new.map(c => (r.catalog.find(x => x.code === c) || { name: c }).name); toast(`${icon('award', 14)} Badge earned: ${esc(names.join(', '))}`, 5000); if (App.confetti) App.confetti({ count: 120 }); } return r; } catch (e) { return null; }
  };
  App.views.badges = {
    title: 'Badges', blurb: 'Earned by studying, helping classmates and showing up.',
    render(root, param, query, standalone) {
      const wrap = standalone ? `<div class="landing-wrap"><header class="landing-top"><div><div class="eyebrow">Mathub</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Badges</h1><p class="muted">${this.blurb}</p></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="#/">${icon('left', 14)} All classes</a></div></header><div id="bd-root"></div></div>` : pageHead('Badges', this.blurb) + '<div id="bd-root"></div>';
      root.innerHTML = wrap; const el = $('#bd-root', root); const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
      if (!user()) { el.innerHTML = lockCard('Badges are for members', 'Sign up free to collect badges for streaks, questions answered, accepted answers, daily challenges and more.'); return; }
      if (offline()) { el.innerHTML = '<div class="empty">Badges need a connection to the server.</div>'; return; }
      el.innerHTML = '<div class="empty">Loading…</div>';
      S.refreshBadges(true).then(r => {
        if (!r) { el.innerHTML = '<div class="empty">Could not load badges.</div>'; return; }
        const have = {}; r.badges.forEach(b => have[b.code] = b);
        el.innerHTML = `<div class="panel"><div class="panel-h"><div class="panel-title">${icon('award')} Your shelf</div><span class="row gap-sm"><span class="chip good">${r.badges.length} of ${r.catalog.length}</span><a class="btn sm" href="#/people">${icon('users', 13)} See everyone's badges</a></span></div><div class="badge-grid">${r.catalog.map(b => { const h = have[b.code]; return `<div class="badge${h ? ' earned' : ' locked'}" title="${esc(b.desc)}"><div class="badge-ic">${icon(b.icon, 22)}</div><div class="badge-name">${esc(b.name)}</div><div class="badge-desc">${esc(b.desc)}</div>${h ? `<div class="badge-date">${esc(App.fmtDate(App.toISO(new Date(h.earned * 1000))))}</div>` : '<div class="badge-date muted">locked</div>'}</div>`; }).join('')}</div></div>`;
        api('badges', { seen: true }).catch(() => {});
      });
    }
  };

  /* ---------- people directory ---------- */
  const PP = { q: '', sort: 'badges', page: 0, rows: [], catalog: [], total: 0, online: 0, more: false, open: {} };
  const hue = id => Math.round((id * 137.508) % 360);
  App.views.people = {
    title: 'People', blurb: 'Everyone on Mathub and the badges they have earned. Names follow each person’s privacy setting.',
    render(root, param, query, standalone) {
      const wrap = standalone ? `<div class="landing-wrap"><header class="landing-top"><div><div class="eyebrow">Mathub</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>People</h1><p class="muted">${this.blurb}</p></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="#/badges">${icon('award', 14)} Your badges</a><a class="btn" href="#/">${icon('left', 14)} All classes</a></div></header><div id="pp-root"></div></div>` : pageHead('People', this.blurb, `<a class="btn" href="#/badges">${icon('award', 14)} Your badges</a>`) + '<div id="pp-root"></div>';
      root.innerHTML = wrap; const el = $('#pp-root', root); const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
      if (!user()) { el.innerHTML = lockCard('The People page is for members', 'Sign up free with your montana.edu email to see who is studying with you and the badges they have earned.'); return; }
      if (offline()) { el.innerHTML = '<div class="empty">The People page needs a connection to the server.</div>'; return; }
      PP.q = query && query.q !== undefined ? String(query.q) : ''; PP.page = 0; PP.open = {};
      el.innerHTML = `<div class="panel people-panel"><div class="people-bar"><label class="people-search">${icon('search', 15)}<input class="input" id="pp-q" placeholder="Search by name" value="${esc(PP.q)}" maxlength="60" aria-label="Search people"></label><select class="select" id="pp-sort" aria-label="Sort">${[['badges', 'Most badges'], ['active', 'Online now'], ['new', 'Newest members'], ['name', 'Name A–Z']].map(([v, l]) => `<option value="${v}"${PP.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select><span class="people-count" id="pp-count"></span></div><div id="pp-list"><div class="empty">Loading…</div></div><div id="pp-more" class="mt-2" style="text-align:center"></div></div>`;
      const inp = $('#pp-q', el); let t; inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { PP.q = inp.value.trim(); PP.page = 0; this.load(el); }, 250); });
      $('#pp-sort', el).addEventListener('change', e => { PP.sort = e.target.value; PP.page = 0; this.load(el); });
      bind(el, { 'pp-more': () => { PP.page++; this.load(el, true); }, 'pp-expand': btn => { PP.open[btn.dataset.id] = !PP.open[btn.dataset.id]; this.paintList(el); } });
      PP.page = 0; this.load(el);
    },
    async load(el, append) {
      const list = $('#pp-list', el); if (!list) return; if (!append) list.innerHTML = '<div class="empty">Loading…</div>';
      try { const r = await api(`people&q=${encodeURIComponent(PP.q)}&sort=${encodeURIComponent(PP.sort)}&page=${PP.page}`); PP.rows = append ? PP.rows.concat(r.people) : r.people; PP.catalog = r.catalog; PP.total = r.total; PP.online = r.online; PP.more = r.more; }
      catch (e) { list.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
      this.paintList(el);
    },
    paintList(el) {
      const list = $('#pp-list', el); if (!list) return; const cat = {}; PP.catalog.forEach(b => cat[b.code] = b);
      $('#pp-count', el).innerHTML = `<b>${PP.total}</b> member${PP.total === 1 ? '' : 's'} · <span class="online-dot"></span> ${PP.online} online now`;
      if (!PP.rows.length) { list.innerHTML = `<div class="empty">${PP.q ? 'Nobody matches that name.' : 'No members yet.'}</div>`; $('#pp-more', el).innerHTML = ''; return; }
      list.innerHTML = `<div class="people-grid">${PP.rows.map(p => {
        const open = !!PP.open[p.id]; const badges = p.badges.map(b => cat[b.code]).filter(Boolean); const shown = open ? badges : badges.slice(0, 5);
        const initial = p.anon ? '?' : (p.name.trim()[0] || '?').toUpperCase(); const joined = App.fmtDate(App.toISO(new Date(p.joined * 1000)));
        return `<div class="person${p.me ? ' me' : ''}${p.anon ? ' anon' : ''}">
          <div class="person-head"><div class="avatar" style="--hue:${hue(p.id)}">${esc(initial)}</div><div class="person-id"><div class="person-name">${esc(p.name)}${p.me ? ' <span class="chip accent">you</span>' : ''}${p.role ? ` <span class="chip staff">${esc(p.role)}</span>` : ''}${p.admin ? ' <span class="chip accent">admin</span>' : p.mod ? ' <span class="chip accent">mod</span>' : ''}${p.online ? ' <span class="online-dot" title="Online now"></span>' : ''}</div><div class="small muted">Joined ${esc(joined)}${p.courses.length ? ' · ' + p.courses.map(c => esc(courseName(c))).join(', ') : ''}</div></div><span class="chip${badges.length ? ' gold' : ''}" title="${badges.length} badge${badges.length === 1 ? '' : 's'}">${icon('award', 12)} ${badges.length}</span></div>
          <div class="person-badges">${badges.length ? shown.map(b => `<span class="bpill" title="${esc(b.desc)}">${icon(b.icon, 13)}<span>${esc(b.name)}</span></span>`).join('') + (badges.length > 5 ? `<button class="bpill more" data-action="pp-expand" data-id="${p.id}">${open ? 'show fewer' : `+${badges.length - 5} more`}</button>` : '') : '<span class="small muted">No badges yet</span>'}</div>
          <div class="person-stats small muted">${p.posts} post${p.posts === 1 ? '' : 's'} · ${p.comments} ${p.comments === 1 ? 'reply' : 'replies'} · ${p.accepted} accepted answer${p.accepted === 1 ? '' : 's'}</div>
        </div>`; }).join('')}</div>`;
      $('#pp-more', el).innerHTML = PP.more ? `<button class="btn sm" data-action="pp-more">Show more</button>` : '';
    }
  };

  /* ---------- presence (heartbeat) ---------- */
  function presencePing() {
    if (!user() || offline()) return;
    const D = App.D; const hashParts = location.hash.replace(/^#\/?/, '').split('/');
    const view = D ? hashParts[1] || 'dashboard' : hashParts[0] || 'home'; const post = /forum/.test(location.hash) && /\/forum\/(\d+)/.test(location.hash) ? +RegExp.$1 : 0;
    api('presence', { course: D ? D.id : '', view, post_id: post }).then(r => { S.presence = r; paintPresence(); }).catch(() => {});
  }
  function paintPresence() {
    const p = S.presence; const pill = $('#presence-pill'); if (pill) { if (!p || !user()) pill.hidden = true; else { pill.hidden = false; const D = App.D; const n = D ? (p.by_course[D.id] || 0) : p.online; pill.innerHTML = `<span class="dot"></span>${n} studying${D ? ' ' + esc(D.short) : ''} now`; pill.title = `${p.online} online across Mathub`; } }
    const lp = $('#landing-presence'); if (lp && p) lp.innerHTML = `<span class="presence-inline"><span class="dot"></span>${p.online} studying right now${Object.keys(p.by_course).filter(k => k !== 'home' && p.by_course[k]).length ? ' · ' + Object.entries(p.by_course).filter(([k, v]) => k !== 'home' && v).map(([k, v]) => `${v} in ${esc(courseName(k))}`).join(', ') : ''}</span>`;
    const here = $('#fa-here'); if (here && p) here.textContent = p.here > 1 ? `${p.here} people are reading this` : '';
  }
  S.presencePing = presencePing;
  setInterval(() => { if (document.visibilityState === 'visible') presencePing(); }, 60000);
  window.addEventListener('hashchange', () => setTimeout(presencePing, 300));
  // auth.js loads after this file, so hook up once the page has finished loading scripts
  document.addEventListener('DOMContentLoaded', () => { if (App.auth) App.auth.onChange(() => { setTimeout(presencePing, 200); if (user()) setTimeout(() => S.refreshBadges(true), 1500); }); });

  /* ---------- daily challenge ---------- */
  const Challenge = {
    question(course, date) {
      const C = global.Courses[course]; if (!C || !C.quiz) return null;
      const covered = new Set(); const lec = C.CALENDAR.filter(e => e[1] === 'lecture' && e[3] && e[0] <= date).pop(); const curId = lec ? lec[3] : C.SECTIONS[0].id; const idx = Math.max(0, C.SECTIONS.findIndex(s => s.id === curId));
      C.SECTIONS.slice(0, idx + 1).forEach(s => covered.add(s.id));
      const topics = Object.keys(C.quiz.TOPICS).filter(t => covered.has(C.quiz.TOPICS[t].sec)); if (!topics.length) return null;
      const seed = hash(course + ':' + date); const QZsave = App.Q; // seededSet uses the current course's quiz module
      const rnd = mulberry(seed); const topic = topics[Math.floor(rnd() * topics.length)];
      const gens = C.quiz.BY_TOPIC[topic]; if (!gens || !gens.length) return null;
      const orig = Math.random; const realNow = Date.now; Math.random = mulberry(seed + 7); Date.now = () => 1700000000000;
      try { let q = null; for (let k = 0; k < 6 && !q; k++) { try { q = gens[Math.floor(Math.random() * gens.length)](); } catch (e) { q = null; } } if (q) q.id = 'ch' + seed.toString(36); return q; } finally { Math.random = orig; Date.now = realNow; }
    }
  };
  function mulberry(seed) { let s = (seed >>> 0) || 1; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const CH = { started: {}, answered: {}, hint: 0 };
  App.views.challenge = {
    title: 'Daily challenge', blurb: 'One problem per class per day, the same for everyone. Solve it fast for bonus points and climb the weekly board.',
    render(root, param, query, standalone) {
      const courses = App.COURSE_ORDER.filter(id => global.Courses[id] && (global.Courses[id].quiz || global.Courses[id].hasQuiz)); const cid = standalone ? (query.course && courses.includes(query.course) ? query.course : courses[0]) : App.D.id;
      const head = standalone ? `<div class="landing-wrap"><header class="landing-top"><div><div class="eyebrow">Mathub</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Daily challenge</h1><p class="muted">${this.blurb}</p></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="#/">${icon('left', 14)} All classes</a></div></header><div class="chips mb-2">${courses.map(c => `<a class="chip toggle${c === cid ? ' on' : ''}" href="#/challenge?course=${c}">${esc(courseName(c))}</a>`).join('')}</div><div id="ch-root"></div></div>` : pageHead('Daily challenge', this.blurb) + '<div id="ch-root"></div>';
      root.innerHTML = head; const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
      this.paint($('#ch-root', root), cid);
    },
    async paint(el, cid) {
      el.innerHTML = `<div class="grid cols-3"><div class="panel span-2" id="ch-q"><div class="empty">Loading…</div></div><div class="stack" id="ch-side"></div></div>`;
      if (App.loadCourse) { try { await App.loadCourse(cid); } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; } }
      let stats = null; if (!offline()) { try { stats = await api('challenge_stats&course=' + cid); } catch (e) { stats = null; } }
      const date = stats && stats.date ? stats.date : App.todayISO(); const q = Challenge.question(cid, date);
      if (!q) { el.innerHTML = '<div class="empty">No challenge available for this class yet.</div>'; return; }
      this.paintQuestion($('#ch-q', el), cid, date, q, stats); this.paintSide($('#ch-side', el), cid, stats);
    },
    paintQuestion(box, cid, date, q, stats) {
      const done = stats && stats.mine; const key = cid + date; const answered = CH.answered[key];
      const T = global.Courses[cid].quiz.TOPICS[q.topic];
      const secLabel = (() => { const s = global.Courses[cid].SECTIONS.find(x => x.id === (T && T.sec)); return s ? s.label : ''; })();
      box.innerHTML = `<div class="panel-h"><div><div class="eyebrow">${esc(courseName(cid))} · ${esc(App.fmtDate(date, true))}</div><div class="panel-title">${icon('target')} Today’s problem</div></div><span class="chip">${esc(secLabel)} · ${esc(T ? T.label : q.topic)}</span></div>
        ${stats ? `<p class="small muted mb-2">${stats.attempts} student${stats.attempts === 1 ? '' : 's'} tried it today${stats.attempts ? ` · ${Math.round(100 * stats.correct / stats.attempts)}% got it right` : ''}.</p>` : ''}
        <div class="q-card${done || answered ? (done ? (done.ok ? ' correct' : ' wrong') : (answered.ok ? ' correct' : ' wrong')) : ''}"><div class="q-prompt">${q.prompt}</div>
          ${done || answered ? `<div class="q-feedback ${(done ? done.ok : answered.ok) ? 'ok' : 'no'}"><b class="res">${(done ? done.ok : answered.ok) ? '✓ Correct' : '✕ Not quite'}${done ? ` · ${done.points} points · ${fmtMs(done.ms)}` : ''}${q.type === 'num' ? ` · the answer is $${q.answerTex}$` : ` · the answer is ${'ABCD'[q.answer]}`}</b><div>${q.explanation}</div><p class="small muted mt-1">Come back tomorrow for a new one.</p></div>`
          : q.type === 'mc' ? `<div class="q-opts">${q.options.map((o, k) => `<button class="q-opt" data-action="ch-mc" data-i="${k}"><span class="letter">${'ABCDEF'[k]}</span><span>${o}</span></button>`).join('')}</div>`
          : `<div class="q-numrow"><input class="input mono" id="ch-num" placeholder="e.g. 3/8, -0.375, 2pi"><button class="btn primary" data-action="ch-num">${icon('check', 14)} Submit</button></div>`}
          ${!(done || answered) ? `<div class="row mt-2 between"><span class="small muted" id="ch-timer">${user() ? 'Timer starts when you answer the first time. Faster correct answers earn up to 5 bonus points.' : 'Sign in to record your answer and earn points.'}</span><button class="btn xs ghost" data-action="ch-hint">${icon('bulb', 12)} Hint</button></div><div id="ch-hints" class="ladder"></div>` : ''}
        </div>`;
      typeset(box); if (!CH.started[key]) CH.started[key] = Date.now(); CH.hint = 0;
      const submit = async (ok, raw) => {
        if (!user()) { auth().open('signup'); return; }
        const ms = Math.max(1000, Date.now() - (CH.started[key] || Date.now())); CH.answered[key] = { ok, raw };
        App.recordAnswer(q.topic, ok); if (!ok && App.recordMistake) App.recordMistake(q, cid, 'challenge');
        if (offline()) { toast('Offline: your answer was not recorded on the board.'); this.paintQuestion(box, cid, date, q, stats); return; }
        App.setSetting('challengeDone', Object.assign({}, App.settings().challengeDone || {}, { [cid]: date })); try { const r = await api('challenge_submit', { course: cid, date, ok, ms, topic: q.topic }); toast(ok ? `Correct! +${r.points} points` : '+2 points for trying', 3000); if (App.addXP) App.addXP(r.points || (ok ? 10 : 2), { course: cid }); if (App.quest) App.quest('challenge'); if (ok && App.confetti) App.confetti({ count: 90 }); if (r.badges_new && r.badges_new.length) S.refreshBadges(true); const st = await api('challenge_stats&course=' + cid); this.paintQuestion(box, cid, date, q, st); this.paintSide($('#ch-side'), cid, st); } catch (e) { toast(e.message, 3500); this.paintQuestion(box, cid, date, q, stats); }
      };
      bind(box, {
        'ch-mc': el => { if (CH.answered[key]) return; submit(+el.dataset.i === q.answer); },
        'ch-num': () => { if (CH.answered[key]) return; const raw = $('#ch-num', box).value.trim(); const v = App.parseNumber(raw); if (isNaN(v)) { toast('Enter a number, fraction or expression like 2pi'); return; } const tol = q.tol ? Math.max(q.tol * Math.abs(q.answer), 1e-9) : Math.max(0.011, 0.005 * Math.abs(q.answer)); submit(Math.abs(v - q.answer) <= tol, raw); },
        'ch-hint': el => { const L = (global.MathubLadders && global.MathubLadders[cid] || {})[q.topic] || []; const hints = L.slice(0, 3); if (q.hint) { if (hints.length >= 3) hints[2] = q.hint; else hints.push(q.hint); } const n = CH.hint = (CH.hint || 0) + 1; const h = $('#ch-hints', box); if (!h) return; h.innerHTML = hints.slice(0, n).map((x, i) => `<div class="rung hint"><span class="rung-label">${icon('bulb', 12)} Hint ${i + 1} of ${hints.length}</span><div>${x}</div></div>`).join(''); typeset(h); if (n >= hints.length) el.remove(); }
      });
      const inp = $('#ch-num', box); if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') $('[data-action="ch-num"]', box).click(); });
    },
    paintSide(side, cid, stats) {
      if (!side) return;
      if (!stats) { side.innerHTML = `<div class="panel">${user() ? '<div class="empty">Leaderboards need a connection to the server.</div>' : needLogin('Join the leaderboard', 'Members earn points for every daily challenge and appear on the weekly board.')}</div>`; return; }
      const lb = (rows, cols) => rows.length ? `<table class="table compact lb"><tbody>${rows.map((r, i) => `<tr${r.me ? ' class="me"' : ''}><td class="rank">${i + 1}</td><td>${esc(r.name)}</td><td class="num">${cols(r)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty small">Nobody yet. Be first.</div>';
      side.innerHTML = `<div class="panel"><div class="panel-h"><div class="panel-title">${icon('clock')} Fastest today</div></div>${lb(stats.today, r => fmtMs(r.ms))}</div>
        <div class="panel"><div class="panel-h"><div class="panel-title">${icon('fire')} This week · ${esc(courseName(cid))}</div>${user() ? `<span class="chip accent">you: ${stats.my_week_points} pts</span>` : ''}</div>${lb(stats.week, r => `${r.points} pts · ${r.days}d`)}</div>
        <div class="panel"><div class="panel-h"><div class="panel-title">${icon('grid')} This week · all classes</div></div>${lb(stats.overall, r => `${r.points} pts`)}<p class="small muted mt-2">10 points for a correct answer, up to 5 more for speed, 2 for trying. Hide your name in Settings.</p></div>`;
    }
  };

  /* ---------- study sessions ---------- */
  App.views.meet = {
    title: 'Study sessions', blurb: 'Post where and when you are studying and let classmates join. Sessions disappear an hour after they end.',
    render(root, param, query, standalone) {
      const courses = App.COURSE_ORDER.filter(id => global.Courses[id]); const cid = standalone ? 'all' : App.D.id;
      root.innerHTML = standalone ? `<div class="landing-wrap"><header class="landing-top"><div><div class="eyebrow">Mathub</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Study sessions</h1><p class="muted">${this.blurb}</p></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="#/">${icon('left', 14)} All classes</a></div></header><div id="mt-root"></div></div>` : pageHead('Study sessions', this.blurb) + '<div id="mt-root"></div>';
      const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
      this.paint($('#mt-root', root), cid, courses);
    },
    async paint(el, cid, courses) {
      const u = user(); const defCourse = cid !== 'all' ? cid : courses[0]; const t = new Date(); t.setMinutes(0, 0, 0); t.setHours(t.getHours() + 2);
      const form = u && !offline() ? `<div class="panel mb-2"><div class="panel-h"><div class="panel-title">${icon('pen')} Post a session</div></div>
        <div class="grid cols-3" style="gap:12px"><div class="field"><label for="mt-title">What</label><input class="input" id="mt-title" maxlength="80" placeholder="e.g. WebWork 3.2 + Exam 2 practice"></div><div class="field"><label for="mt-place">Where</label><input class="input" id="mt-place" maxlength="80" placeholder="e.g. Romney 220, table by the window"></div><div class="field"><label for="mt-course">Class</label><select class="select" id="mt-course">${[...courses, 'general'].map(c => `<option value="${c}"${c === defCourse ? ' selected' : ''}>${esc(courseName(c))}</option>`).join('')}</select></div>
          <div class="field"><label for="mt-date">Date</label><input class="input" type="date" id="mt-date" value="${App.toISO(t)}" min="${App.todayISO()}"></div><div class="field"><label for="mt-time">Start</label><input class="input" type="time" id="mt-time" value="${String(t.getHours()).padStart(2, '0')}:00"></div><div class="field"><label for="mt-min">Length</label><select class="select" id="mt-min">${[60, 90, 120, 180, 240].map(m => `<option value="${m}"${m === 120 ? ' selected' : ''}>${m / 60 % 1 ? m + ' min' : m / 60 + ' h'}</option>`).join('')}</select></div></div>
        <div class="field"><label for="mt-note">Note (optional)</label><input class="input" id="mt-note" maxlength="300" placeholder="Bring your formula sheet. Look for the Mathub sticker."></div>
        <div class="row gap-sm mt-1"><button class="btn primary" data-action="mt-create">${icon('clock', 14)} Post session</button><span class="small muted">You are marked as going automatically.</span></div></div>` : `<div class="mb-2">${u ? '' : needLogin('Sign in to post or join sessions', 'Members can post study sessions and RSVP to them.')}</div>`;
      el.innerHTML = form + `<div id="mt-list"><div class="empty">Loading…</div></div>`;
      bind(el, {
        'mt-create': async () => { const start = Math.floor(new Date($('#mt-date', el).value + 'T' + $('#mt-time', el).value).getTime() / 1000); if (!start || isNaN(start)) { toast('Pick a date and time.'); return; } try { await api('meet_create', { course: $('#mt-course', el).value, title: $('#mt-title', el).value, place: $('#mt-place', el).value, start, minutes: +$('#mt-min', el).value, note: $('#mt-note', el).value }); toast('Session posted'); this.paint(el, cid, courses); } catch (e) { if (e.data && e.data.terms === false && App.ensureTerms) { if (await App.ensureTerms()) $('[data-action="mt-create"]', el).click(); } else toast(e.message, 3500); } },
        'mt-rsvp': async btn => { try { const r = await api('meet_rsvp', { id: +btn.dataset.id, going: btn.dataset.going === '1' }); toast(btn.dataset.going === '1' ? 'You are going' : 'RSVP removed'); this.list($('#mt-list', el), cid); } catch (e) { toast(e.message); } },
        'mt-cancel': async btn => { if (!confirm('Cancel this session?')) return; try { await api('meet_cancel', { id: +btn.dataset.id }); this.list($('#mt-list', el), cid); } catch (e) { toast(e.message); } },
        'auth-signup': () => auth().open('signup'), 'auth-login': () => auth().open('login')
      });
      this.list($('#mt-list', el), cid);
    },
    async list(box, cid) {
      if (!box) return; if (offline()) { box.innerHTML = '<div class="empty">Study sessions need a connection to the server.</div>'; return; }
      try {
        const r = await api('meet_list&course=' + cid); const u = user();
        box.innerHTML = r.meets.length ? `<div class="stack">${r.meets.map(m => `<div class="panel meet${m.live ? ' live' : ''}"><div class="row between" style="align-items:flex-start;gap:12px"><div><div class="fa-meta">${courseChip(m.course)}${m.live ? '<span class="chip good">happening now</span>' : ''}<span class="sep">·</span><span class="muted">hosted by ${esc(m.host)}</span></div><h3 class="meet-title">${esc(m.title)}</h3><div class="meet-where">${icon('target', 14)} ${esc(m.place)} <span class="sep">·</span> ${icon('clock', 14)} ${esc(fmtWhen(m.start))} – ${new Date(m.end * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>${m.note ? `<p class="small muted mt-1">${esc(m.note)}</p>` : ''}</div><div class="meet-side"><div class="stat"><div class="stat-num">${m.going}</div><div class="stat-label">going</div></div>${u ? (m.im_going ? `<button class="btn sm" data-action="mt-rsvp" data-id="${m.id}" data-going="0">${icon('check', 13)} Going</button>` : `<button class="btn sm primary" data-action="mt-rsvp" data-id="${m.id}" data-going="1">I’m in</button>`) : ''}${u && (m.mine || (user() && user().mod)) ? `<button class="btn xs ghost" data-action="mt-cancel" data-id="${m.id}">Cancel</button>` : ''}</div></div></div>`).join('')}</div>` : '<div class="panel"><div class="empty">No sessions posted yet. Post one and see who shows up.</div></div>';
      } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    }
  };

  /* ---------- community mock exams ---------- */
  App.views.mock = {
    title: 'Mock exams', blurb: 'A timed set everyone takes at the same time, with rankings when it ends. Same questions for all.',
    preview: [['Scheduled', 'Moderators schedule a mock before each exam'], ['Timed', 'Runs in the Quizzer with a clock and no feedback until you submit'], ['Ranked', 'See where you landed when the window closes']],
    render(root, param, query, standalone) {
      const cid = standalone ? 'all' : App.D.id;
      root.innerHTML = standalone ? `<div class="landing-wrap"><header class="landing-top"><div><div class="eyebrow">Mathub</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Mock exams</h1><p class="muted">${this.blurb}</p></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="#/">${icon('left', 14)} All classes</a></div></header><div id="mk-root"></div></div>` : pageHead('Community mock exams', this.blurb) + '<div id="mk-root"></div>';
      const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
      this.paint($('#mk-root', root), cid, param);
    },
    async paint(el, cid, param) {
      if (offline()) { el.innerHTML = '<div class="empty">Mock exams need a connection to the server.</div>'; return; }
      if (!user()) { el.innerHTML = lockCard('Mock exams are for members', 'Sign up free to register, take the timed set with everyone else and see the rankings.'); return; }
      el.innerHTML = '<div class="empty">Loading…</div>';
      try {
        const r = await api('mock_list&course=' + cid); const u = user();
        if (param && /^\d+$/.test(param)) { const m = r.mocks.find(x => x.id === +param); if (m) return this.results(el, m); }
        el.innerHTML = r.mocks.length ? `<div class="stack">${r.mocks.map(m => this.card(m)).join('')}</div>` : `<div class="panel"><div class="empty">No mock exam scheduled${cid !== 'all' ? ' for this class' : ''} yet. ${u.mod ? 'Schedule one from the admin panel.' : 'Moderators schedule them before each exam; watch the activity feed.'}</div></div>`;
        bind(el, {
          'mk-reg': async btn => { try { await api('mock_register', { id: +btn.dataset.id, going: btn.dataset.going === '1' }); this.paint(el, cid); } catch (e) { toast(e.message); } },
          'mk-start': btn => { const m = r.mocks.find(x => x.id === +btn.dataset.id); if (m) this.start(m); },
          'mk-results': btn => { const m = r.mocks.find(x => x.id === +btn.dataset.id); if (m) this.results(el, m); },
          'mk-official': async btn => { try { await api('mock_official', { id: +btn.dataset.id, official: btn.dataset.on !== '1' }); this.paint(el, cid); } catch (e) { toast(e.message); } }
        });
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },
    card(m) {
      const C = global.Courses[m.course]; const ex = C && C.EXAMS.find(e => e.id === m.exam_id);
      const state = m.ended ? 'ended' : m.open ? 'open' : 'upcoming';
      const staff = user() && (user().staff || user().mod);
      return `<div class="panel mock ${state}${m.official ? ' official' : ''}"><div class="row between" style="align-items:flex-start;gap:12px"><div><div class="fa-meta">${courseChip(m.course)}${m.official ? `<span class="chip accent">${icon('shield', 11)} Official</span>` : ''}${staff ? `<button class="chip toggle xs" data-action="mk-official" data-id="${m.id}" data-on="${m.official ? 1 : 0}" title="Mark as an official mock for this class">${m.official ? 'Unmark official' : 'Mark official'}</button>` : ''}${ex ? `<span class="chip">${esc(ex.name)} topics</span>` : ''}<span class="chip ${state === 'open' ? 'good' : state === 'ended' ? '' : 'warn'}">${state === 'open' ? 'open now' : state === 'ended' ? 'finished' : 'upcoming'}</span></div><h3 class="meet-title">${esc(m.title)}</h3><div class="meet-where">${icon('clock', 14)} ${esc(fmtWhen(m.start))} · ${m.minutes} min · ${m.count} questions</div><p class="small muted mt-1">${m.registered} registered${m.results ? ` · ${m.results} finished` : ''}${m.my_result ? ` · you scored ${m.my_result.score}/${m.my_result.total}` : ''}</p></div>
        <div class="meet-side">${state === 'open' && !m.my_result ? `<button class="btn primary" data-action="mk-start" data-id="${m.id}">${icon('play', 14)} Start now</button>` : ''}${state === 'upcoming' ? (m.im_registered ? `<button class="btn sm" data-action="mk-reg" data-id="${m.id}" data-going="0">${icon('check', 13)} Registered</button>` : `<button class="btn sm primary" data-action="mk-reg" data-id="${m.id}" data-going="1">Register</button>`) : ''}${state === 'ended' || m.my_result ? `<button class="btn sm" data-action="mk-results" data-id="${m.id}">Rankings</button>` : ''}</div></div></div>`;
    },
    async start(m) {
      const C = global.Courses[m.course]; if (!C) return; const ex = C.EXAMS.find(e => e.id === m.exam_id) || C.EXAMS[0];
      if (App.loadCourse) { try { await App.loadCourse(m.course); } catch (e) { toast(e.message, 4000); return; } }
      const go = () => {
        const QZ = C.quiz; const topics = ex.cumulative ? Object.keys(QZ.TOPICS) : Object.keys(QZ.TOPICS).filter(t => ex.sections.includes(QZ.TOPICS[t].sec));
        const qs = App.seededSet(topics, m.count, m.seed); if (!qs.length) { toast('Could not build the set.'); return; }
        App.runTimedSet({ questions: qs, minutes: m.minutes, title: m.title, onSubmit: async (correct, total, seconds) => { try { const r = await api('mock_submit', { id: m.id, score: correct, total, ms: seconds * 1000 }); toast(`Submitted: ${correct}/${total}. Rankings appear when the window closes.`, 5000); if (r.badges_new && r.badges_new.length) S.refreshBadges(true); } catch (e) { toast(e.message, 4000); } } });
      };
      if (App.D && App.D.id === m.course) go(); else { const off = App.onCourse(function once(D) { if (D.id === m.course) { setTimeout(go, 50); } }); location.hash = `#/${m.course}/practice`; }
    },
    async results(el, m) {
      el.innerHTML = '<div class="empty">Loading…</div>';
      try {
        const r = await api('mock_results&id=' + m.id);
        el.innerHTML = `<div class="fa-back"><a href="#" data-action="mk-back">${icon('left', 14)} All mock exams</a></div><div class="panel"><div class="panel-h"><div><div class="panel-title">${icon('flag')} ${esc(m.title)}</div><p class="small muted">${r.count} finished${r.average !== null ? ` · average ${r.average}%` : ''}${r.ended ? '' : ' · rankings unlock when the window closes'}</p></div>${courseChip(m.course)}</div>
          ${r.rankings.length ? `<div class="table-wrap"><table class="table compact lb"><thead><tr><th>#</th><th>Student</th><th class="num">Score</th><th class="num">Time</th></tr></thead><tbody>${r.rankings.map(x => `<tr${x.me ? ' class="me"' : ''}><td class="rank">${x.rank}</td><td>${esc(x.name)}${x.me ? ' <span class="chip accent">you</span>' : ''}</td><td class="num">${x.score}/${x.total}</td><td class="num">${fmtMs(x.ms)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No results to show yet.</div>'}</div>`;
        bind(el, { 'mk-back': (b, e) => { e.preventDefault(); this.paint(el, App.D ? App.D.id : 'all'); } });
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    }
  };

  /* ---------- student contributions ---------- */
  App.views.contribute = {
    title: 'Contribute', blurb: 'Write a practice problem or a flashcard for classmates. A moderator approves it, then everyone can use and upvote it.',
    preview: [['Problems', 'Community practice problems with answers and explanations'], ['Flashcards', 'Cards you can add to your own decks'], ['Votes', 'The best ones rise to the top']],
    render(root, param, query) {
      const D = App.D; const tab = this.tab = this.tab || 'problems';
      root.innerHTML = pageHead('Contribute', this.blurb) + `<div class="tabs" id="ct-tabs">${[['problems', 'Community problems'], ['cards', 'Community flashcards'], ['new', 'Submit one'], ['mine', 'My submissions']].map(([k, l]) => `<button class="tab${tab === k ? ' active' : ''}" data-action="ct-tab" data-t="${k}">${l}</button>`).join('')}</div><div id="ct-root"></div>`;
      bind(root, { 'ct-tab': el => { this.tab = el.dataset.t; this.render(root); }, 'auth-signup': () => auth().open('signup'), 'auth-login': () => auth().open('login') });
      this.paint($('#ct-root', root), D, tab, root);
    },
    async paint(el, D, tab, root) {
      if (tab === 'new') return this.form(el, D, root);
      if (offline()) { el.innerHTML = '<div class="empty">Community content needs a connection to the server.</div>'; return; }
      if (!user()) { el.innerHTML = lockCard('Community content is for members', 'Sign up free to read, vote on and add community problems and flashcards.'); return; }
      el.innerHTML = '<div class="empty">Loading…</div>';
      try {
        if (tab === 'mine') { const r = await api('contrib_mine'); el.innerHTML = r.items.length ? `<div class="stack">${r.items.map(i => `<div class="panel"><div class="fa-meta">${courseChip(i.course)}<span class="chip">${i.kind === 'card' ? 'flashcard' : 'problem'}</span><span class="chip ${i.status === 'approved' ? 'good' : i.status === 'rejected' ? 'bad' : 'warn'}">${i.status}</span><span class="sep">·</span><span class="muted">${timeAgo(i.created)}</span></div><div class="mt-1">${i.front}</div><div class="small muted mt-1">Answer: ${i.back}</div></div>`).join('')}</div>` : '<div class="panel"><div class="empty">You have not submitted anything yet.</div></div>'; typeset(el); return; }
        const kind = tab === 'cards' ? 'card' : 'problem'; const r = await api('contrib_list&course=' + D.id + '&kind=' + kind);
        el.innerHTML = r.items.length ? `<div class="stack">${r.items.map(i => `<div class="panel contrib" id="ci-${i.id}"><div class="row" style="gap:12px;align-items:flex-start"><div class="fa-vote"><button class="fa-v up${i.vote > 0 ? ' on' : ''}" data-action="ct-vote" data-id="${i.id}" data-v="${i.vote > 0 ? 0 : 1}">${icon('up', 16)}</button><span class="fa-score">${i.score}</span><button class="fa-v down${i.vote < 0 ? ' on' : ''}" data-action="ct-vote" data-id="${i.id}" data-v="${i.vote < 0 ? 0 : -1}">${icon('down', 16)}</button></div><div style="flex:1;min-width:0"><div class="fa-meta">${i.sec ? `<span class="chip">${esc(App.secLabel(i.sec))}</span>` : i.unit ? `<span class="chip">Unit ${i.unit}</span>` : ''}<span class="sep">·</span><span class="muted">by ${esc(i.author)} · ${timeAgo(i.created)}</span></div><div class="q-prompt mt-1">${i.front}</div><button class="btn xs mt-1" data-action="ct-reveal" data-id="${i.id}">${icon('eye', 12)} ${kind === 'card' ? 'Flip' : 'Answer'}</button><div class="reveal q-feedback ok mt-1" id="cia-${i.id}" style="background:var(--surface-2);border-color:var(--border)"><b class="res">${kind === 'card' ? 'Back' : 'Answer'}</b><div>${i.back}</div>${i.explanation ? `<div class="mt-1 small">${i.explanation}</div>` : ''}</div></div></div></div>`).join('')}</div>` : `<div class="panel"><div class="empty">Nothing approved for ${esc(D.short)} yet. Be the first to submit a ${kind === 'card' ? 'flashcard' : 'problem'}.</div></div>`;
        typeset(el);
        on(el, 'click', '[data-action="ct-reveal"]', b => { $('#cia-' + b.dataset.id, el).classList.toggle('open'); });
        on(el, 'click', '[data-action="ct-vote"]', async b => { try { const r2 = await api('contrib_vote', { id: +b.dataset.id, value: +b.dataset.v }); const card = $('#ci-' + b.dataset.id, el); $('.fa-score', card).textContent = r2.score; $$('.fa-v', card).forEach(x => x.classList.remove('on')); if (r2.vote > 0) $('.fa-v.up', card).classList.add('on'); if (r2.vote < 0) $('.fa-v.down', card).classList.add('on'); $('.fa-v.up', card).dataset.v = r2.vote > 0 ? 0 : 1; $('.fa-v.down', card).dataset.v = r2.vote < 0 ? 0 : -1; } catch (e) { toast(e.message); } });
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },
    form(el, D, root) {
      if (!user()) { el.innerHTML = lockCard('Sign in to contribute', 'Members can submit problems and flashcards for review.'); return; }
      el.innerHTML = `<div class="grid cols-3"><div class="panel span-2 stack"><div class="grid cols-2" style="gap:12px"><div class="field"><label for="ct-kind">Type</label><select class="select" id="ct-kind"><option value="problem">Practice problem</option><option value="card">Flashcard</option></select></div><div class="field"><label for="ct-sec">Topic</label><select class="select" id="ct-sec">${D.UNITS.map(u => `<optgroup label="Unit ${u.n} · ${esc(u.title)}">${u.sections.map(id => { const s = App.secById(id); return `<option value="${id}" data-unit="${u.n}">${esc(s.label)} ${esc(s.title)}</option>`; }).join('')}</optgroup>`).join('')}</select></div></div>
          <div class="field"><label for="ct-front" id="ct-front-l">Problem</label><textarea class="input" id="ct-front" rows="4" placeholder="State the problem clearly. $…$ renders math."></textarea></div>
          <div class="field"><label for="ct-back" id="ct-back-l">Answer</label><textarea class="input" id="ct-back" rows="2" placeholder="The final answer"></textarea></div>
          <div class="field" id="ct-expl-f"><label for="ct-expl">Explanation (optional but appreciated)</label><textarea class="input" id="ct-expl" rows="4" placeholder="How to get there, step by step"></textarea></div>
          <label class="check" style="padding:0"><input type="checkbox" id="ct-anon"><span>Submit anonymously</span></label>
          <div class="row gap-sm"><button class="btn primary" data-action="ct-submit">${icon('pen', 14)} Submit for review</button><span class="small muted">A moderator checks it before it goes live. Curse words are censored.</span></div></div>
        <div class="panel"><div class="panel-h"><div class="panel-title">${icon('bulb')} Good submissions</div></div><ul class="list small"><li>One clear question with one correct answer.</li><li>Say which section it belongs to.</li><li>For flashcards keep both sides short.</li><li>Use $…$ for math: $\\frac{d}{dx}x^2 = 2x$.</li></ul></div></div>`;
      typeset(el);
      const kindSel = $('#ct-kind', el); const upd = () => { const card = kindSel.value === 'card'; $('#ct-front-l', el).textContent = card ? 'Front' : 'Problem'; $('#ct-back-l', el).textContent = card ? 'Back' : 'Answer'; $('#ct-expl-f', el).style.display = card ? 'none' : ''; }; kindSel.addEventListener('change', upd); upd();
      on(el, 'click', '[data-action="ct-submit"]', async b => { const sec = $('#ct-sec', el); const unit = +sec.options[sec.selectedIndex].dataset.unit; b.disabled = true; try { const r = await api('contrib_create', { course: D.id, kind: kindSel.value, unit, sec: sec.value, front: $('#ct-front', el).value, back: $('#ct-back', el).value, explanation: $('#ct-expl', el).value, anon: $('#ct-anon', el).checked }); toast(r.message, 4000); this.tab = 'mine'; this.render(root); } catch (e) { b.disabled = false; if (e.data && e.data.terms === false && App.ensureTerms) { if (await App.ensureTerms()) b.click(); } else toast(e.message, 4000); } });
    }
  };
  // Approved community flashcards for the current class (used by the flashcards view when the setting is on).
  S.communityCards = async function (courseId) {
    if (!user() || offline()) return []; const c = S.community[courseId]; if (c && Date.now() - c.at < 300000) return c.cards;
    try { const r = await api('contrib_list&course=' + courseId + '&kind=card'); const cards = r.items.map(i => ({ id: 'cc' + i.id, unit: i.unit || 0, sec: i.sec || '', f: i.front, b: i.back, community: true, author: i.author })); S.community[courseId] = { at: Date.now(), cards }; return cards; } catch (e) { return []; }
  };

  /* ---------- widgets: landing + dashboard ---------- */
  S.fillLanding = async function (root) {
    const el = $('#landing-social', root); if (!el) return;
    const courses = (App.myCourses ? App.myCourses() : App.COURSE_ORDER.filter(id => global.Courses[id])).filter(id => global.Courses[id] && (global.Courses[id].quiz || global.Courses[id].hasQuiz));
    el.innerHTML = `<div class="grid cols-3"><div class="panel span-2"><div class="panel-h"><div class="panel-title">${icon('target')} Today’s challenges</div><a class="btn sm" href="#/challenge">${icon('target', 13)} Play</a></div><div class="challenge-row" id="ls-ch">${courses.map(c => `<a class="card-link ch-card" href="#/challenge?course=${c}"><div class="eyebrow">${esc(courseName(c))}</div><h4 id="lsc-${c}">Loading…</h4><p class="small muted">Same problem for everyone · beat the clock</p></a>`).join('')}</div></div>
      <div class="panel"><div class="panel-h"><div class="panel-title">${icon('bulb')} Happening now</div></div><div id="ls-act"><div class="empty small">Loading…</div></div></div></div>
      <div class="grid cols-2 mt-3"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('clock')} Study sessions</div><a class="btn sm" href="#/meet">Post one</a></div><div id="ls-meet"><div class="empty small">Loading…</div></div></div><div class="panel"><div class="panel-h"><div class="panel-title">${icon('flag')} Mock exams</div><a class="btn sm" href="#/mock">See all</a></div><div id="ls-mock"><div class="empty small">Loading…</div></div></div></div>`;
    if (offline()) { $('#ls-act', el).innerHTML = '<div class="empty small">Needs the server.</div>'; $('#ls-meet', el).innerHTML = '<div class="empty small">Needs the server.</div>'; $('#ls-mock', el).innerHTML = '<div class="empty small">Needs the server.</div>'; courses.forEach(c => { const q = global.Courses[c].quiz ? Challenge.question(c, App.todayISO()) : true; $('#lsc-' + c, el).textContent = q ? 'Today’s problem is ready' : 'No challenge yet'; }); return; }
    courses.forEach(c => api('challenge_stats&course=' + c).then(s => { const h = $('#lsc-' + c, el); if (h) h.innerHTML = s.mine ? `${s.mine.ok ? '✓ Solved' : 'Tried'} · ${s.attempts} student${s.attempts === 1 ? '' : 's'} today` : `${s.attempts} tried today${s.attempts ? ` · ${Math.round(100 * s.correct / s.attempts)}% correct` : ''}`; }).catch(() => {}));
    api('class_goal').then(r => { const host = $('#ls-ch', el); if (!host || !r.courses) return; const mine = (App.myCourses ? App.myCourses() : []).filter(c => r.courses[c] && r.courses[c].members); if (!mine.length) return; host.insertAdjacentHTML('afterend', `<div class="goal-row">${mine.map(c => { const g = r.courses[c]; const pct = Math.min(100, Math.round(100 * g.answered / g.goal)); return `<a class="goal-mini" href="#/${c}/dashboard"><div class="row between small"><span class="chip course-${c}">${esc(courseName(c))}</span><span class="muted">${g.answered} / ${g.goal}</span></div><div class="bar sm mt-1"><div class="bar-fill ${pct >= 100 ? 'good' : ''}" style="width:${pct}%"></div></div><small class="muted">class goal this week · ${g.active} practicing</small></a>`; }).join('')}</div>`); }).catch(() => {});
    api('activity').then(r => { const a = $('#ls-act', el); if (!a) return; a.innerHTML = r.items.length ? `<div class="act-feed">${r.items.slice(0, 8).map(i => `<a class="act-row" href="${esc(i.link || '#/')}"><span class="act-ic">${icon({ post: 'chat', solved: 'check', challenge: 'target', badge: 'fire', meet: 'clock', mock: 'flag', poll: 'list', contrib: 'pen', class: 'book' }[i.kind] || 'bulb', 13)}</span><span class="act-text">${esc(i.text)}</span><span class="act-when">${timeAgo(i.created)}</span></a>`).join('')}</div>` : '<div class="empty small">Quiet so far today.</div>'; }).catch(() => { const a = $('#ls-act', el); if (a) a.innerHTML = ''; });
    api('meet_list&course=all').then(r => { const m = $('#ls-meet', el); if (!m) return; m.innerHTML = r.meets.length ? r.meets.slice(0, 4).map(x => `<a class="act-row" href="#/meet">${courseChip(x.course)}<span class="act-text"><b>${esc(x.title)}</b> · ${esc(x.place)} · ${esc(fmtWhen(x.start))}</span><span class="act-when">${x.going} going</span></a>`).join('') : '<div class="empty small">No sessions posted. Studying somewhere? Post it.</div>'; }).catch(() => {});
    api('mock_list&course=all').then(r => { const m = $('#ls-mock', el); if (!m) return; const up = r.mocks.filter(x => !x.ended); m.innerHTML = up.length ? up.slice(0, 3).map(x => `<a class="act-row" href="#/${x.course}/mock">${courseChip(x.course)}<span class="act-text"><b>${esc(x.title)}</b> · ${esc(fmtWhen(x.start))}</span><span class="act-when">${x.registered} registered</span></a>`).join('') : '<div class="empty small">None scheduled yet.</div>'; }).catch(() => {});
  };
  /* course announcements (instructors, TAs, moderators) + the class-wide goal bar, prepended to the dashboard community panel */
  S.extras = async function (el, courseId) {
    if (!el || offline()) return; if (!$('#dc-ann', el)) el.insertAdjacentHTML('afterbegin', '<div id="dc-ann"></div><div id="dc-goal"></div>');
    api('ann_list&course=' + courseId).then(r => { const box = $('#dc-ann', el); if (!box) return; const me = user(); const canPost = r.can_post || (me && (me.staff || me.mod));
      box.innerHTML = (r.items.length ? `<div class="panel ann-panel"><div class="panel-h"><div class="panel-title">${icon('bell')} From your instructors</div>${canPost ? `<button class="btn xs" data-action="ann-new">${icon('pen', 12)} Post</button>` : ''}</div><div class="stack-sm">${r.items.map(a => `<div class="ann"><div class="ann-body">${esc(a.text)}${a.link ? ` <a href="${esc(a.link)}"${/^https?:/.test(a.link) ? ' target="_blank" rel="noopener"' : ''}>${icon('external', 11)} link</a>` : ''}</div><div class="ann-meta small muted">${esc(a.author)}${a.role ? ` · <span class="chip staff xs">${esc(a.role)}</span>` : ''} · ${timeAgo(a.created)}${a.mine || (me && me.mod) ? ` · <button class="linkish" data-action="ann-del" data-id="${a.id}">delete</button>` : ''}</div></div>`).join('')}</div></div>` : (canPost ? `<div class="row" style="justify-content:flex-end;margin-bottom:8px"><button class="btn xs" data-action="ann-new">${icon('bell', 12)} Post an announcement to ${esc(courseName(courseId))}</button></div>` : ''));
      bind(box, { 'ann-new': () => S.announce(courseId, () => S.extras(el, courseId)), 'ann-del': async b => { if (!confirm('Delete this announcement?')) return; try { await api('ann_delete', { id: +b.dataset.id }); S.extras(el, courseId); } catch (e) { toast(e.message); } } });
    }).catch(() => {});
    api('class_goal').then(r => { const g = r.courses && r.courses[courseId]; const box = $('#dc-goal', el); if (!box || !g || !g.members) return; const pct = Math.min(100, Math.round(100 * g.answered / g.goal));
      box.innerHTML = `<div class="panel goal-panel"><div class="panel-h"><div class="panel-title">${icon('target')} ${esc(courseName(courseId))} this week, all of us</div><span class="small muted">${g.active} student${g.active === 1 ? '' : 's'} practicing</span></div><div class="row between small"><span><b class="count" data-count="${g.answered}">${g.answered}</b> of ${g.goal} questions answered together</span><span class="muted">${g.prev ? `last week ${g.prev}` : ''}</span></div><div class="bar mt-1"><div class="bar-fill ${pct >= 100 ? 'good' : ''}" style="width:${pct}%"></div></div><p class="small muted mt-1">${pct >= 100 ? 'Goal reached. Every answer still counts toward next week.' : `${g.goal - g.answered} to go. Your practice sets, lessons and Blitz rounds all count.`}${g.cards ? ` · ${g.cards} flashcards` : ''}${g.focus ? ` · ${Math.round(g.focus / 60)} h of focus` : ''}</p></div>`; if (App.countUp) App.countUp(box);
    }).catch(() => {});
  };
  S.announce = function (courseId, done) {
    const el = document.createElement('div'); el.className = 'modal-backdrop'; el.innerHTML = `<form class="modal" style="padding:18px 20px" role="dialog" aria-label="Post an announcement"><div class="row between mb-1"><div class="panel-title">${icon('bell')} Announcement</div><button type="button" class="icon-btn" data-action="close" aria-label="Close">${icon('x', 14)}</button></div><div class="field"><label for="an-course">Class</label><select class="select" id="an-course">${App.COURSE_ORDER.filter(c => global.Courses[c]).map(c => `<option value="${c}"${c === courseId ? ' selected' : ''}>${esc(courseName(c))}</option>`).join('')}<option value="all">Every class</option></select></div><div class="field mt-1"><label for="an-text">Text</label><textarea class="input" id="an-text" rows="3" maxlength="300" placeholder="Office hours moved to Thursday 2 pm this week."></textarea></div><div class="grid cols-2 mt-1"><div class="field"><label for="an-link">Link (optional)</label><input class="input" id="an-link" placeholder="https://… or #/calc/calendar"></div><div class="field"><label for="an-days">Show for</label><select class="select" id="an-days">${[1, 3, 7, 14, 30].map(d => `<option value="${d}"${d === 7 ? ' selected' : ''}>${d} day${d === 1 ? '' : 's'}</option>`).join('')}</select></div></div><div class="row mt-2" style="justify-content:flex-end"><button class="btn primary" type="submit">Post</button></div></form>`;
    document.body.appendChild(el); const close = () => App.dismiss(el); el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-action="close"]')) close(); });
    $('form', el).addEventListener('submit', async e => { e.preventDefault(); try { await api('ann_post', { course: $('#an-course', el).value, text: $('#an-text', el).value.trim(), link: $('#an-link', el).value.trim(), days: +$('#an-days', el).value }); close(); toast('Posted. Students see it on their dashboard.', 3000); if (done) done(); } catch (err) { toast(err.message, 3500); } });
  };
  S.fillDashboard = async function (el, courseId) {
    if (!el) return; const D = global.Courses[courseId]; const t = App.todayISO(); setTimeout(() => S.extras(el, courseId), 0);
    if (!D.quiz) { el.innerHTML = `<div class="panel"><div class="panel-h"><div class="panel-title">${icon('chat')} Latest discussions</div><a class="btn sm" href="${App.link('forum')}">${icon('chat', 13)} Open discussions</a></div><div id="ws-forum"><div class="empty small">Loading…</div></div></div>`; if (App.forumLatest) App.forumLatest($('#ws-forum', el)); return; }
    const q = Challenge.question(courseId, t);   // preview topic only; the page itself uses the server date
    el.innerHTML = `<div class="panel ch-panel"><div class="panel-h"><div class="panel-title">${icon('target')} Daily challenge</div><a class="btn sm primary" href="${App.link('challenge')}">Play</a></div><div id="dc-body">${q ? `<p class="small muted">Today: ${esc((D.quiz.TOPICS[q.topic] || {}).label || q.topic)}. Same problem for everyone, points for speed.</p>` : '<p class="small muted">No challenge yet.</p>'}</div></div><div id="dc-extra"></div>`;
    if (offline()) return;
    api('challenge_stats&course=' + courseId).then(s => { const b = $('#dc-body', el); if (!b) return; b.innerHTML = (s.mine ? `<p><span class="chip ${s.mine.ok ? 'good' : 'warn'}">${s.mine.ok ? '✓ Solved today' : 'Tried today'} · ${s.mine.points} pts</span></p>` : '') + `<p class="small muted mt-1">${s.attempts} student${s.attempts === 1 ? '' : 's'} tried today${s.attempts ? ` · ${Math.round(100 * s.correct / s.attempts)}% correct` : ''}. Your week: ${s.my_week_points} pts${s.week.length ? ` · leader: ${esc(s.week[0].name)} (${s.week[0].points})` : ''}.</p>`; }).catch(() => {});
    // exam poll: create/open the anonymous "how did it go" poll for the most recent exam
    const past = D.EXAMS.filter(e => (e.endDate || e.date) < t && App.daysBetween(e.endDate || e.date, t) <= 21); const ex = past[past.length - 1];
    if (ex && user()) { const k = 'mathub-exampoll-' + courseId + '-' + ex.id; let pid = 0; try { pid = +localStorage.getItem(k) || 0; } catch {} const show = id => { const x = $('#dc-extra', el); if (x) x.innerHTML = `<a class="card-link mt-2" href="#/${courseId}/forum/${id}"><div class="eyebrow">${icon('list', 12)} Exam poll</div><h4>How did ${esc(ex.name)} go?</h4><p>Anonymous. See how the class did and share what worked.</p></a>`; }; if (pid) show(pid); else api('poll_exam', { course: courseId, exam_id: ex.id, exam_name: ex.name, date: ex.endDate || ex.date }).then(r => { try { localStorage.setItem(k, String(r.post_id)); } catch {} show(r.post_id); }).catch(() => {}); }
  };
})(window);

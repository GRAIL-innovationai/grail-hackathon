/* ============================================================
   Mathub — quests, leagues, celebrations and sound
   Daily and weekly quests with XP rewards and a double-XP boost,
   weekly leagues (server: api/social.php 'league'), the celebration
   overlay, synthesized sound effects.
   Loaded after gami.js.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, store, settings, setSetting, toast, todayISO } = App;
  const API = 'api/index.php?r=';
  const auth = () => App.auth || {}; const user = () => auth().user || null; const offline = () => auth().mode !== 'server' || auth().unreachable;
  async function api(route) {
    let res, json; try { res = await fetch(API + route, { credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Accept': 'application/json' }, cache: 'no-store' }); json = await res.json(); } catch (e) { throw new Error('Cannot reach the server right now.'); }
    if (!json || json.ok === false) throw new Error((json && json.error) || 'Request failed.'); return json;
  }
  const courses = () => App.COURSE_ORDER.filter(id => global.Courses[id]);
  const dataOf = id => (store.id === id ? store.data : store.peek(id)) || {};

  /* ---------- sound effects: tiny synthesized cues, no audio files ---------- */
  const SFX = {
    ctx: null, on: () => settings().sound !== false,
    get() { if (!this.ctx) { try { this.ctx = new (global.AudioContext || global.webkitAudioContext)(); } catch { return null; } } if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return this.ctx; },
    tone(ctx, f, t0, dur, type = 'sine', gain = 0.11) { const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.03); },
    play(name) {
      if (!this.on()) return; const ctx = this.get(); if (!ctx) return; const t = ctx.currentTime;
      if (name === 'correct') { this.tone(ctx, 659, t, 0.12); this.tone(ctx, 988, t + 0.09, 0.2); }
      else if (name === 'wrong') { this.tone(ctx, 220, t, 0.16, 'triangle', 0.09); this.tone(ctx, 175, t + 0.13, 0.24, 'triangle', 0.09); }
      else if (name === 'complete') [523, 659, 784, 1047].forEach((f, i) => this.tone(ctx, f, t + i * 0.09, 0.24));
      else if (name === 'levelup') [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(ctx, f, t + i * 0.075, 0.32, 'triangle', 0.09));
      else if (name === 'tap') this.tone(ctx, 520, t, 0.05, 'square', 0.025);
    }
  };
  App.sfx = SFX;

  /* ---------- celebration overlay ---------- */
  function celebrate(o = {}) {
    $$('.celebrate').forEach(e => e.remove());
    const el = document.createElement('div'); el.className = 'celebrate'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', o.title || 'Celebration');
    el.innerHTML = `<div class="celebrate-card"><div class="celebrate-ic">${o.icon || icon('award', 40)}</div><h2>${o.title || 'Nice!'}</h2>${o.sub ? `<p>${o.sub}</p>` : ''}${o.mascot !== false && App.bobcatSvg ? `<div class="celebrate-bo">${App.bobcatSvg(92)}</div>` : ''}<button class="btn primary lg" data-action="close">${o.cta || 'Keep going'}</button></div>`;
    document.body.appendChild(el); if (App.confetti) App.confetti({ count: o.confetti || 170 }); SFX.play(o.sound || 'complete');
    const close = () => { el.remove(); document.removeEventListener('keydown', onKey); }; const onKey = e => { if (e.key === 'Escape' || e.key === 'Enter') close(); };
    bind(el, { close }); el.addEventListener('click', e => { if (e.target === el) close(); }); document.addEventListener('keydown', onKey);
  }
  App.celebrate = celebrate;

  /* ---------- quests ---------- */
  const DAILY_POOL = [
    { k: 'answers', n: [8, 12, 15], t: n => `Answer ${n} questions`, ic: 'list' },
    { k: 'correct', n: [5, 8, 10], t: n => `Get ${n} answers right`, ic: 'check' },
    { k: 'combo', n: [3, 5], t: n => `Get ${n} in a row`, ic: 'fire' },
    { k: 'cards', n: [10, 15], t: n => `Review ${n} flashcards`, ic: 'cards' },
    { k: 'focus', n: [15, 25], t: n => `Study ${n} focus minutes`, ic: 'clock' },
    { k: 'challenge', n: [1], t: () => 'Solve the daily challenge', ic: 'target' },
    { k: 'topics', n: [2, 3], t: n => `Practice ${n} different topics`, ic: 'path' },
    { k: 'lesson', n: [1, 2], t: n => `Finish ${n} lesson${n === 1 ? '' : 's'}`, ic: 'play' }
  ];
  const WEEKLY = [{ k: 'wxp', n: 300, t: 'Earn 300 XP this week', ic: 'zap' }, { k: 'wdays', n: 5, t: 'Study on 5 different days this week', ic: 'calendar' }];
  const REWARD = 15, WEEK_REWARD = 60;
  const seedRnd = seed => { let s = (seed >>> 0) || 1; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function dailyQuests(d) { const rnd = seedRnd(hash('quest:' + d)); const pool = DAILY_POOL.slice(); const out = []; while (out.length < 3 && pool.length) { const q = pool.splice(Math.floor(rnd() * pool.length), 1)[0]; const n = q.n[Math.floor(rnd() * q.n.length)]; out.push({ k: q.k, n, title: q.t(n), ic: q.ic }); } return out; }
  function qstate() {
    const t = todayISO(); const w = App.isoWeek(new Date()); let q = settings().quests;
    if (!q || q.d !== t) q = { d: t, c: {}, done: {}, topics: [], boostGiven: false, w: q && q.w === w ? w : w, wdone: q && q.w === w ? (q.wdone || {}) : {} };
    if (q.w !== w) { q.w = w; q.wdone = {}; }
    return q;
  }
  const qsave = q => setSetting('quests', q);
  function weekXP() { const wk = App.isoWeek(new Date()); return courses().reduce((s, id) => s + (dataOf(id).xp || []).filter(x => App.isoWeek(App.parseISO(x.d)) === wk).reduce((a, x) => a + (x.n || 0), 0), 0); }
  App.weekXP = weekXP;
  const boostActive = () => (+settings().boostUntil || 0) > Date.now();
  App.boostActive = boostActive;
  function questRows() {
    const q = qstate();
    const daily = dailyQuests(q.d).map(x => { const cur = x.k === 'topics' ? (q.topics || []).length : (q.c[x.k] || 0); return Object.assign({}, x, { cur: Math.min(cur, x.n), done: !!q.done[x.k] || cur >= x.n, reward: REWARD }); });
    const wk = App.isoWeek(new Date()); const days = Object.keys(App.streakAll().days).filter(d => App.isoWeek(App.parseISO(d)) === wk).length; const wxp = weekXP();
    const weekly = WEEKLY.map(x => { const cur = x.k === 'wxp' ? wxp : days; return Object.assign({}, x, { title: x.t, cur: Math.min(cur, x.n), done: !!q.wdone[x.k] || cur >= x.n, reward: WEEK_REWARD }); });
    return { daily, weekly, dailyDone: daily.filter(x => x.done).length };
  }
  App.questRows = questRows;
  function quest(kind, n = 1, extra) {
    const q = qstate();
    if (kind === 'topics') { q.topics = q.topics || []; if (extra && !q.topics.includes(extra)) q.topics.push(extra); }
    else if (kind === 'combo') q.c.combo = Math.max(q.c.combo || 0, n);
    else q.c[kind] = (q.c[kind] || 0) + n;
    qsave(q); checkQuests();
  }
  function checkQuests() {
    const q = qstate(); const { daily, weekly } = questRows(); const newly = [];
    daily.forEach(x => { if (x.cur >= x.n && !q.done[x.k]) { q.done[x.k] = true; newly.push(x); } });
    weekly.forEach(x => { if (x.cur >= x.n && !q.wdone[x.k]) { q.wdone[x.k] = true; newly.push(x); } });
    const allDaily = daily.every(x => x.cur >= x.n); const giveBoost = allDaily && !q.boostGiven; if (giveBoost) q.boostGiven = true;
    if (!newly.length && !giveBoost) return; qsave(q);
    newly.forEach((x, i) => setTimeout(() => { App.addXP(x.reward, { raw: true }); toast(`${icon('target', 14)} Quest done: ${esc(x.title)} · +${x.reward} XP`, 3200); SFX.play('complete'); paintQuests(); }, 150 + i * 900));
    if (giveBoost) { setSetting('boostUntil', Date.now() + 15 * 60000); setTimeout(() => { celebrate({ title: 'All quests done!', sub: 'Double XP is on for the next 15 minutes. Make it count.', icon: App.pixel ? App.pixel('trophy', 5) : icon('zap', 40), sound: 'levelup' }); App.paintStats(); }, 200 + newly.length * 900); }
    paintQuests(); App.paintStats();
  }
  App.quest = quest; App.checkQuests = checkQuests;
  function questRow(x) { return `<div class="quest${x.done ? ' done' : ''}"><span class="quest-ic">${icon(x.ic, 16)}</span><div class="quest-body"><div class="quest-title"><span>${esc(x.title)}</span><span class="quest-reward">+${x.reward} XP</span></div><div class="bar sm"><div class="bar-fill${x.done ? ' good' : ''}" style="width:${Math.round(100 * x.cur / x.n)}%"></div></div></div><span class="quest-state">${x.done ? icon('check', 14) : `${x.cur}/${x.n}`}</span></div>`; }
  function questsHtml(compact) {
    const { daily, weekly } = questRows(); const bu = +settings().boostUntil || 0;
    return `<div class="quests">${daily.map(questRow).join('')}${compact ? '' : `<div class="eyebrow mt-2 mb-1">This week</div>${weekly.map(questRow).join('')}`}
      ${boostActive() ? `<div class="callout small mt-2">${icon('zap', 13)} <b>Double XP</b> until ${new Date(bu).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</div>` : `<p class="small muted mt-2">Quests reset at midnight. Finish all three for 15 minutes of double XP.</p>`}</div>`;
  }
  function paintQuests() { $$('.quests-slot').forEach(el => { el.innerHTML = questsHtml(el.dataset.compact === '1'); }); }
  App.paintQuests = paintQuests; App.questsHtml = questsHtml;
  App.questsPopover = function (anchor) { App.popover(anchor, `<div class="pop-head">${icon('target', 18)}<div><b>Daily quests</b><div class="small muted">Small goals, real XP.</div></div></div>${questsHtml(false)}`, null, { cls: 'pop-quests' }); };
  App.hubExtra = function () {
    const { dailyDone } = questRows(); const b = boostActive() ? Math.max(0, Math.ceil((+settings().boostUntil - Date.now()) / 60000)) : 0;
    return `${b ? `<span class="boost-chip" title="Double XP is on · ${dailyDone} of 3 quests done">${icon('zap', 13)} 2× · ${b}m</span>` : ''}`;
  };
  setInterval(() => { if (boostActive() || $('.boost-chip')) App.paintStats(); }, 30000);

  /* ---------- leagues ---------- */
  const TIERS = ['Bronze', 'Silver', 'Gold', 'Sapphire', 'Ruby', 'Emerald', 'Amethyst', 'Pearl', 'Obsidian', 'Diamond'];
  const TIER_COLORS = ['#B87333', '#A8A9AD', '#E1A526', '#2B6FDB', '#D7263D', '#1FA463', '#8E5BD4', '#D9C7B5', '#3B3B4F', '#4FC3F7'];
  const gem = (i, size = 28) => `<svg class="gem" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,2 30,12 16,30 2,12" fill="${TIER_COLORS[i] || '#999'}"/><polygon points="16,2 30,12 16,12" fill="#fff" opacity="0.38"/><polygon points="2,12 16,12 16,30" fill="#000" opacity="0.16"/><polygon points="16,12 30,12 16,30" fill="#000" opacity="0.06"/></svg>`;
  App.gemSvg = gem; App.TIERS = TIERS;
  const LG = { data: null, at: 0 };
  async function leagueData(force) { if (!user() || offline()) return null; if (!force && LG.data && Date.now() - LG.at < 45000) return LG.data; try { LG.data = await api('league&xp=' + weekXP()); LG.at = Date.now(); return LG.data; } catch (e) { return null; } }
  App.leagueData = leagueData;
  const endsIn = ts => { const s = Math.max(0, ts - Date.now() / 1000); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
  function boardHtml(r, limit) {
    const rows = limit ? r.board.slice(0, limit) : r.board; const n = r.members; const pz = r.zones.promote, dz = r.zones.demote;
    if (!rows.length) return '<div class="empty small">Nobody has earned XP in this league yet this week. Be first.</div>';
    let out = ''; rows.forEach((x, i) => { const rank = x.rank; const zone = pz && rank <= pz ? 'up' : (dz && rank > n - dz ? 'down' : ''); if (pz && rank === 1) out += `<div class="lb-zone up">${icon('up', 12)} Promotion zone · top ${pz}</div>`; if (dz && rank === n - dz + 1) out += `<div class="lb-zone down">${icon('down', 12)} Demotion zone · bottom ${dz}</div>`; out += `<div class="lb-row${x.me ? ' me' : ''} ${zone}"><span class="lb-rank">${rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}</span><span class="lb-name">${esc(x.name)}${x.role ? ` <span class="chip staff">${esc(x.role)}</span>` : ''}${x.me ? ' <span class="chip accent">you</span>' : ''}</span><span class="lb-xp">${x.xp} XP</span></div>`; });
    if (limit && r.board.length > limit && !rows.some(x => x.me) && r.me.rank) out += `<div class="lb-row me"><span class="lb-rank">${r.me.rank}</span><span class="lb-name">You</span><span class="lb-xp">${r.me.xp} XP</span></div>`;
    return `<div class="lb">${out}</div>`;
  }
  function checkLastWeek(r) {
    if (!r.last || r.last.result === 'stay') return; const key = 'leagueSeen'; if (settings()[key] === r.last.week) return; setSetting(key, r.last.week);
    if (r.last.result === 'up') celebrate({ title: `Promoted to ${TIERS[r.league]} League!`, sub: `You finished #${r.last.rank} in ${TIERS[r.last.league]} last week with ${r.last.xp} XP.`, icon: gem(r.league, 56), sound: 'levelup' });
    else toast(`${icon('down', 14)} You moved down to ${TIERS[r.league]} League. Climb back this week.`, 5000);
  }
  App.views.leagues = {
    title: 'Leagues', blurb: 'Every Monday the boards reset. Earn XP all week: the top of each league moves up, the bottom moves down.',
    render(root, param, query, standalone) {
      const head = standalone ? `<div class="landing-wrap"><header class="landing-top"><div><div class="eyebrow">Mathub</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Leagues</h1><p class="muted">${this.blurb}</p></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="#/">${icon('left', 14)} All classes</a></div></header><div id="lg-root"></div></div>` : App.pageHead('Leagues', this.blurb) + '<div id="lg-root"></div>';
      root.innerHTML = head; const el = $('#lg-root', root); const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
      if (!user()) { el.innerHTML = App.lockCard('Leagues are for members', 'Sign up free to compete on a weekly XP board with classmates at your level. Top finishers move up a league every Monday.'); return; }
      if (offline()) { el.innerHTML = '<div class="empty">Leagues need a connection to the server.</div>'; return; }
      el.innerHTML = '<div class="empty">Loading…</div>';
      leagueData(true).then(r => {
        if (!r) { el.innerHTML = '<div class="empty">Could not load the league right now.</div>'; return; }
        checkLastWeek(r);
        el.innerHTML = `<div class="league-head"><div class="tier-strip">${TIERS.map((t, i) => `<div class="tier${i === r.league ? ' on' : i < r.league ? ' passed' : ''}" title="${t} League">${gem(i, i === r.league ? 44 : 28)}<small>${t}</small></div>`).join('')}</div>
          <div class="league-title"><div>${gem(r.league, 40)}</div><div><h2>${TIERS[r.league]} League</h2><div class="small muted">${r.members} member${r.members === 1 ? '' : 's'} · ends in <b>${endsIn(r.week_end)}</b>${r.zones.promote ? ` · top ${r.zones.promote} move up to ${TIERS[r.league + 1]}` : ' · the top league'}${r.zones.demote ? ` · bottom ${r.zones.demote} move down` : ''}</div></div><div class="league-me"><b>${r.me.rank ? '#' + r.me.rank : '—'}</b><small>your rank</small></div><div class="league-me"><b>${r.me.xp}</b><small>XP this week</small></div></div></div>
          <div class="panel">${boardHtml(r)}</div>
          <p class="small muted mt-2">XP counts across all your classes and syncs from every device. Hide your name in Settings and you appear as “Anonymous student”.</p>
          <div class="panel mt-2" id="lg-section"><div class="panel-h"><div class="panel-title">${icon('users')} Your section</div><div class="row gap-sm" id="lg-sec-chips"></div></div><div id="lg-sec-body"><div class="empty small">Loading…</div></div></div>`;
        const mine = App.myCourses(); const chips = $('#lg-sec-chips', el); const body = $('#lg-sec-body', el);
        const loadSec = async cid => { $$('.chip', chips).forEach(c => c.classList.toggle('on', c.dataset.c === cid)); body.innerHTML = '<div class="empty small">Loading…</div>'; try { const s = await fetch('api/index.php?r=league_section&course=' + cid + '&xp=' + (App.weekXP ? App.weekXP() : 0), { credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub' } }).then(x => x.json()); if (!s || !s.ok) throw new Error((s && s.error) || 'No server.'); if (s.none) { body.innerHTML = `<div class="empty small">Set your ${esc(global.Courses[cid].short)} section in <a href="#/settings">Settings → classes and sections</a> to compete with the people who sit next to you.</div>`; return; } body.innerHTML = `<p class="small muted mb-1">Section ${esc(s.section)} · ${s.members} member${s.members === 1 ? '' : 's'} this week</p><ol class="board">${s.board.map(b => `<li class="${b.me ? 'me' : ''}"><span class="rank">${b.rank}</span><span class="name">${esc(b.name)}${b.role ? ` <span class="chip staff xs">${esc(b.role)}</span>` : ''}</span><span class="xp mono">${b.xp} XP</span></li>`).join('')}</ol>`; } catch (e) { body.innerHTML = `<div class="empty small">${esc(e.message)}</div>`; } };
        chips.innerHTML = mine.map(cid => `<button class="chip toggle" data-c="${cid}">${esc(global.Courses[cid].short)}</button>`).join(''); chips.addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) loadSec(c.dataset.c); }); if (mine.length) loadSec(mine[0]);
      });
    }
  };
  App.paintLeagueWidgets = function (root) {
    const slots = $$('.league-slot', root || document); if (!slots.length) return;
    if (!user()) { slots.forEach(el => { el.innerHTML = el.dataset.compact === '1' ? '' : `<div class="empty small">Sign up to join a weekly league.</div>`; }); return; }
    if (offline()) { slots.forEach(el => { el.innerHTML = ''; }); return; }
    leagueData().then(r => { if (!r) return; checkLastWeek(r); slots.forEach(el => {
      const compact = el.dataset.compact === '1'; const link = App.inCourse && App.inCourse() ? App.link('leagues') : '#/leagues';
      el.innerHTML = compact ? `<a class="league-pill" href="${link}">${gem(r.league, 20)}<span>${TIERS[r.league]} League</span><b>${r.me.rank ? '#' + r.me.rank : '—'}</b><small>${r.me.xp} XP · ends in ${endsIn(r.week_end)}</small></a>`
        : `<div class="league-mini"><div class="league-mini-head">${gem(r.league, 34)}<div><b>${TIERS[r.league]} League</b><div class="small muted">${r.me.rank ? `You are #${r.me.rank}` : 'No XP yet this week'} · ends in ${endsIn(r.week_end)}</div></div><a class="btn xs" href="${link}">Full board</a></div>${boardHtml(r, 5)}</div>`;
    }); });
  };
})(window);

/* ============================================================
   Mathub — motivation layer
   Popovers that never get clipped, confetti, the live background,
   XP + levels + daily goal, the streak / goal widgets in every header,
   Bo the bobcat, count-up numbers and the learning path view.
   Loaded right after app.js; everything hangs off window.App.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, store, settings, setSetting, toast, todayISO, toISO, addDays } = App;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
  const courses = () => App.COURSE_ORDER.filter(id => global.Courses[id]);
  const dataOf = id => (store.id === id ? store.data : store.peek(id)) || {};

  /* ---------- popover: appended to <body>, positioned under its anchor, so no header can clip it ---------- */
  let POP = null;
  function closePopover() { if (!POP) return; POP.el.remove(); POP.anchor.setAttribute('aria-expanded', 'false'); POP = null; }
  function popover(anchor, html, actions, opts = {}) {
    if (POP && POP.anchor === anchor) { closePopover(); return null; }
    closePopover();
    const el = document.createElement('div'); el.className = 'popover' + (opts.cls ? ' ' + opts.cls : ''); el.setAttribute('role', 'dialog'); el.innerHTML = html; document.body.appendChild(el);
    const r = anchor.getBoundingClientRect(); const w = el.offsetWidth, h = el.offsetHeight; const vw = innerWidth, vh = innerHeight;
    let left = opts.align === 'left' ? r.left : r.right - w; left = Math.max(8, Math.min(left, vw - w - 8));
    let top = r.bottom + 8; if (top + h > vh - 8) top = Math.max(8, r.top - h - 8);
    el.style.left = left + 'px'; el.style.top = top + 'px';
    anchor.setAttribute('aria-expanded', 'true'); POP = { el, anchor };
    if (actions) bind(el, actions);
    return el;
  }
  document.addEventListener('click', e => { if (!POP) return; if (POP.el.contains(e.target)) { if (e.target.closest('a[href], [data-close]')) closePopover(); return; } if (POP.anchor.contains(e.target)) return; closePopover(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopover(); });
  document.addEventListener('scroll', e => { if (POP && !(e.target !== document && POP.el.contains(e.target))) closePopover(); }, true);
  window.addEventListener('hashchange', closePopover); window.addEventListener('resize', closePopover);
  App.popover = popover; App.closePopover = closePopover;

  /* ---------- confetti ---------- */
  function confetti(opts = {}) {
    if (reduced()) return;
    const c = document.createElement('canvas'); c.className = 'confetti'; c.setAttribute('aria-hidden', 'true'); document.body.appendChild(c); const ctx = c.getContext('2d');
    const dpr = Math.min(2, devicePixelRatio || 1); c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.scale(dpr, dpr);
    const colors = opts.colors || ['#2B55B8', '#0E7C86', '#F2C14E', '#E4572E', '#7B61FF', '#2FB36B', '#FF7AB6'];
    const n = opts.count || 150; const ox = opts.x ?? innerWidth / 2, oy = opts.y ?? innerHeight * 0.32;
    const P = Array.from({ length: n }, () => { const a = Math.random() * Math.PI * 2, v = 5 + Math.random() * 9; return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 7, g: 0.22 + Math.random() * 0.14, w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, col: colors[Math.floor(Math.random() * colors.length)], life: 90 + Math.random() * 60 }; });
    let t = 0;
    (function frame() {
      ctx.clearRect(0, 0, innerWidth, innerHeight); let alive = 0;
      for (const p of P) { if (t > p.life) continue; alive++; p.vy += p.g; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, Math.min(1, (p.life - t) / 30)); ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); }
      t++; if (alive && t < 220) requestAnimationFrame(frame); else c.remove();
    })();
  }
  App.confetti = confetti;

  /* ---------- live background: drifting math and physics glyphs behind everything ---------- */
  /* glyphs by subject; each subject floats in its own hue so the background reads as "all the classes", not only math */
  const GLYPH_SETS = [
    ['math', ['∫', 'Σ', 'π', '√', '∞', 'θ', '∂', 'Δ', 'λ', '∮', 'ƒ', 'dx', 'lim', 'sin', 'cos', '≈', '∇', 'x²', 'log', 'tan', 'dy/dx', '≤', 'φ', 'e^x', 'ln']],
    ['physics', ['F=ma', 'v₀', 'ħ', 'ω', 'μ', 'α', 'Ω', 'E=mc²', 'p=mv', '½mv²', 'g', '⚡', '∆t', 'kg·m/s', 'N']],
    ['code', ['{ }', 'def', 'for', '>>>', '</>', 'if', 'return', '[ ]', 'print()', 'while', '==', 'import', '#']],
    ['writing', ['¶', '“ ”', '&', 'Aa', ';', '…', 'the', '—', 'ẽ', 'ə', 'ʃ', 'θ']],
    ['science', ['H₂O', 'mol', 'CO₂', 'pH', 'ΔG', 'Na⁺']]
  ];
  const GLYPHS = GLYPH_SETS.flatMap(([k, g]) => g.map(x => ({ k, g: x })));
  const SHAPES = ['ring', 'tri', 'dot', 'square', 'star'];
  // the Realm look floats runes, marks and dice as well as the subject glyphs
  const REALM_GLYPHS = [['rune', [...'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ']], ['mark', ['✦', '✧', '☽', '⚔', '⚜', '♜', '♞', 'd20', '+2', 'XP', 'DC 15', 'nat 20']]].flatMap(([k, g]) => g.map(x => ({ k, g: x })));
  const REALM_SHAPES = ['d20', 'd20', 'star', 'ring', 'd20'];
  const HUES = { math: '#4F46E5', physics: '#0E9488', code: '#16A34A', writing: '#7C3AED', science: '#D97706', shape: '#F2C14E' };
  const LiveBg = {
    c: null, ctx: null, items: [], raf: 0, cols: null, tick: 0,
    enabled() { return settings().liveBg === true; },   // opt-in since the trail-map redesign (2026.10.03)
    init() {
      if (this.c) return; const c = document.createElement('canvas'); c.id = 'live-bg'; c.setAttribute('aria-hidden', 'true'); document.body.prepend(c); this.c = c; this.ctx = c.getContext('2d');
      this.resize(); window.addEventListener('resize', () => this.resize()); document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); else this.start(); });
      new MutationObserver(recs => { this.cols = null; if (recs.some(r => r.attributeName === 'data-skin')) { this.items = []; this.resize(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-course', 'data-skin'] });
      this.apply();
    },
    apply() { const on = this.enabled(); this.c.hidden = !on; document.documentElement.classList.toggle('no-live-bg', !on); if (on) this.start(); else this.stop(); },
    resize() { const dpr = Math.min(2, devicePixelRatio || 1); this.c.width = innerWidth * dpr; this.c.height = innerHeight * dpr; this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const n = Math.min(60, Math.max(16, Math.round(innerWidth * innerHeight / 40000))); while (this.items.length < n) this.items.push(this.spawn(true)); this.items.length = n; this.draw(performance.now()); },
    spawn(anyY) { const realm = document.documentElement.getAttribute('data-skin') === 'realm'; const shape = Math.random() < (realm ? 0.26 : 0.22); const pool = realm && Math.random() < 0.62 ? REALM_GLYPHS : GLYPHS; const pick = pool[Math.floor(Math.random() * pool.length)]; const shapes = realm ? REALM_SHAPES : SHAPES; return { g: shape ? '' : pick.g, k: shape ? 'shape' : pick.k, shape: shape ? shapes[Math.floor(Math.random() * shapes.length)] : '', x: Math.random() * innerWidth, y: anyY ? Math.random() * innerHeight : innerHeight + 40, s: 14 + Math.random() * 24, v: 0.1 + Math.random() * 0.25, ph: Math.random() * Math.PI * 2, amp: 8 + Math.random() * 26, rot: (Math.random() - 0.5) * 0.7, a: 0.09 + Math.random() * 0.15 }; },
    palette() { if (this.cols) return this.cols; const cs = getComputedStyle(document.documentElement); const v = (n, d) => cs.getPropertyValue(n).trim() || d; return this.cols = { math: v('--c-learn', HUES.math), physics: v('--c-calm', HUES.physics), code: v('--c-practice', HUES.code), writing: v('--c-create', HUES.writing), science: v('--c-reward', HUES.science), shape: v('--gold', HUES.shape), rune: v('--bg-rune', '#9A6C1C'), mark: v('--bg-mark', '#6B3A94') }; },
    shapeDraw(ctx, p) { const s = p.s * 0.55; ctx.lineWidth = Math.max(1.2, s / 9); ctx.strokeStyle = ctx.fillStyle; ctx.beginPath();
      if (p.shape === 'ring') { ctx.arc(0, 0, s / 2, 0, Math.PI * 2); ctx.stroke(); } else if (p.shape === 'dot') { ctx.arc(0, 0, s / 4, 0, Math.PI * 2); ctx.fill(); } else if (p.shape === 'tri') { ctx.moveTo(0, -s / 2); ctx.lineTo(s / 2, s / 2); ctx.lineTo(-s / 2, s / 2); ctx.closePath(); ctx.stroke(); } else if (p.shape === 'square') { ctx.rect(-s / 2, -s / 2, s, s); ctx.stroke(); } else if (p.shape === 'd20') { const r = s * 0.62, hx = Math.cos(Math.PI / 6) * r; const H = [[0, -r], [hx, -r / 2], [hx, r / 2], [0, r], [-hx, r / 2], [-hx, -r / 2]]; const tri = [[0, -r * 0.55], [hx * 0.6, r * 0.33], [-hx * 0.6, r * 0.33]]; H.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); tri.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); [[0, 0], [0, 5], [0, 1], [1, 1], [1, 2], [1, 3], [2, 3], [2, 4], [2, 5]].forEach(([a, b]) => { ctx.moveTo(tri[a][0], tri[a][1]); ctx.lineTo(H[b][0], H[b][1]); }); ctx.stroke(); } else { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5, b = a + Math.PI / 5; ctx.lineTo(Math.cos(a) * s / 2, Math.sin(a) * s / 2); ctx.lineTo(Math.cos(b) * s / 5, Math.sin(b) * s / 5); } ctx.closePath(); ctx.fill(); } },
    draw(t) {
      const ctx = this.ctx; ctx.clearRect(0, 0, innerWidth, innerHeight); const cols = this.palette(); const dim = isDark() ? 0.85 : 1;
      this.items.forEach(p => { ctx.save(); ctx.globalAlpha = p.a * dim * (p.k === 'shape' ? 0.8 : 1); ctx.fillStyle = cols[p.k] || cols.math; ctx.translate(p.x + Math.sin(t / 1900 + p.ph) * p.amp, p.y); ctx.rotate(p.rot + Math.sin(t / 3100 + p.ph) * 0.12); if (p.k === 'shape') this.shapeDraw(ctx, p); else { ctx.font = `${p.k === 'code' ? '600' : '500'} ${p.s}px ${p.k === 'code' ? 'JetBrains Mono, ui-monospace, monospace' : p.k === 'rune' ? '"Mathub Runes", "Segoe UI Historic", serif' : p.k === 'mark' ? 'Cinzel, Georgia, serif' : 'Georgia, serif'}`; ctx.fillText(p.g, 0, 0); } ctx.restore(); });
    },
    step(t) { if (reduced()) { this.draw(t); this.raf = 0; return; } this.items.forEach((p, i) => { p.y -= p.v; if (p.y < -40) this.items[i] = this.spawn(false); }); this.draw(t); this.raf = requestAnimationFrame(ts => this.step(ts)); },
    start() { if (this.raf || !this.c || this.c.hidden) return; this.raf = requestAnimationFrame(ts => this.step(ts)); },
    stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
  };
  App.liveBg = LiveBg;

  /* ---------- XP, levels, daily goal ---------- */
  const GOALS = [[10, 'Casual'], [30, 'Regular'], [50, 'Serious'], [100, 'Intense']];
  const LEVEL_NAMES = ['Newcomer', 'Explorer', 'Learner', 'Scholar', 'Problem solver', 'Analyst', 'Strategist', 'Expert', 'Master', 'Grandmaster'];
  const REALM_LEVELS = ['Commoner', 'Apprentice', 'Initiate', 'Adept', 'Spellwright', 'Sage', 'Loremaster', 'Archmage', 'Mythic', 'Legend'];
  const isRealm = () => document.documentElement.getAttribute('data-skin') === 'realm';
  const dailyGoal = () => { const g = +settings().dailyGoal; return GOALS.some(x => x[0] === g) ? g : 30; };
  const xpOf = id => dataOf(id).xp || [];
  const xpOn = d => courses().reduce((s, id) => s + xpOf(id).filter(x => x.d === d).reduce((a, x) => a + (x.n || 0), 0), 0);
  const xpToday = () => xpOn(todayISO());
  const xpTotal = () => courses().reduce((s, id) => s + xpOf(id).reduce((a, x) => a + (x.n || 0), 0), 0);
  function level(xp) { const n = 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 100)); const base = (n - 1) ** 2 * 100, next = n ** 2 * 100; return { n, xp, base, next, pct: Math.round(100 * (xp - base) / (next - base)), toNext: next - xp, name: (isRealm() ? REALM_LEVELS : LEVEL_NAMES)[Math.min(n - 1, LEVEL_NAMES.length - 1)] }; }
  App.levelOf = level;
  let floatPending = 0, floatTimer = 0;
  function floatXP(n) {
    floatPending += n; clearTimeout(floatTimer);
    floatTimer = setTimeout(() => {
      const amt = floatPending; floatPending = 0; if (reduced()) return;
      const ring = $$('.goal-ring').find(el => el.offsetParent !== null); const el = document.createElement('div'); el.className = 'xp-float'; el.innerHTML = `${App.pixel ? App.pixel('coin', 2) : ''}<span>+${amt} XP</span>`; document.body.appendChild(el);
      if (ring) { const r = ring.getBoundingClientRect(); el.style.left = (r.left + r.width / 2) + 'px'; el.style.top = (r.bottom + 4) + 'px'; } else { el.style.left = '50%'; el.style.top = '60px'; }
      setTimeout(() => el.remove(), 1300);
    }, 60);
  }
  function addXP(n, opts = {}) {
    if (!opts.raw && App.boostActive && App.boostActive()) n *= 2;
    n = Math.round(n); const cid = opts.course || (App.D && App.D.id) || App.myCourses()[0]; if (!n || !cid) return;
    const t = todayISO(); store.poke(cid, data => { const xs = data.xp = Array.isArray(data.xp) ? data.xp : []; const last = xs[xs.length - 1]; if (last && last.d === t) last.n += n; else xs.push({ d: t, n }); if (xs.length > 400) xs.splice(0, xs.length - 400); });
    const today = xpToday(), goal = dailyGoal(), s = settings();
    paintStats(); if (!opts.silent) floatXP(n);
    if (today >= goal && s.goalHit !== t) { setSetting('goalHit', t); if (App.noteGoalDay) App.noteGoalDay(); setTimeout(() => { confetti(); toast(`${icon('zap', 14)} Daily goal reached: ${today} XP today. Nice work!`, 4200); paintStats(); paintMascots(); }, 300); }
    const lv = level(xpTotal()); const seen = settings().levelSeen;
    if (seen !== undefined && lv.n > seen) setTimeout(() => { confetti({ count: 220 }); toast(`${App.pixel ? App.pixel('star', 2) : icon('award', 14)} Level up! Level ${lv.n} · ${lv.name}`, 4800); paintStats(); }, 900);
    if (seen === undefined || lv.n !== seen) setSetting('levelSeen', lv.n);
    if (App.checkQuests && !opts.raw) App.checkQuests();
  }
  App.addXP = addXP; App.xpToday = xpToday; App.xpTotal = xpTotal; App.level = () => level(xpTotal()); App.dailyGoal = dailyGoal; App.GOALS = GOALS;

  /* ---------- streak across every class ---------- */
  function streakAll() {
    const days = {}; courses().forEach(id => Object.assign(days, dataOf(id).activity || {}));
    let d = new Date(); d.setHours(0, 0, 0, 0); const t = toISO(d); const activeToday = !!days[t]; let n = 0; if (!activeToday) d = addDays(d, -1); while (days[toISO(d)]) { n++; d = addDays(d, -1); }
    const sorted = Object.keys(days).sort(); let longest = 0, run = 0, prev = null; for (const k of sorted) { run = prev && toISO(addDays(App.parseISO(prev), 1)) === k ? run + 1 : 1; longest = Math.max(longest, run); prev = k; }
    return { n, activeToday, days, longest };
  }
  App.streakAll = streakAll;
  /* ---------- streak freezes: earned by hitting the daily goal on three days of a week (bank of two), applied automatically to a single missed day ---------- */
  App.freezeBank = () => Math.max(0, Math.min(2, settings().freezeBank || 0));
  App.useFreeze = function (dayISO) {
    const bank = App.freezeBank(); if (!bank) return false; const cid = courses()[0]; if (!cid) return false; const days = streakAll().days; if (days[dayISO]) return false;
    store.poke(cid, d => { d.activity = d.activity || {}; d.activity[dayISO] = 'freeze'; });
    setSetting('freezeBank', bank - 1); const used = settings().freezeUsed || {}; used[dayISO] = true; setSetting('freezeUsed', used);
    toast(`${icon('shield', 14)} Streak freeze used for ${App.fmtDate(dayISO)}. ${bank - 1} left.`, 4000); if (App.sfx) App.sfx.play('tap'); return true;
  };
  function autoFreeze() {
    if (!App.freezeBank()) return; const st = streakAll(); const yday = toISO(addDays(new Date(), -1)), dby = toISO(addDays(new Date(), -2));
    if (!st.days[yday] && st.days[dby] && (settings().freezeUsed || {})[yday] === undefined) { if (App.useFreeze(yday)) setTimeout(paintStats, 50); }
  }
  App.noteGoalDay = function () {
    const wk = App.isoWeek(new Date()); const t = todayISO(); const weeks = settings().freezeWeeks || {}; const w = weeks[wk] || { days: [] }; if (w.days.includes(t)) return; w.days.push(t); w.days = w.days.slice(-7); weeks[wk] = w;
    Object.keys(weeks).forEach(k => { if (k < App.isoWeek(addDays(new Date(), -21))) delete weeks[k]; }); setSetting('freezeWeeks', weeks);
    if (w.days.length === 3 && !w.granted) { w.granted = true; setSetting('freezeWeeks', weeks); const bank = App.freezeBank(); if (bank < 2) { setSetting('freezeBank', bank + 1); setTimeout(() => { toast(`${icon('shield', 14)} Streak freeze earned: three goal days this week. It covers one missed day automatically.`, 5000); if (App.sfx) App.sfx.play('levelup'); }, 1200); } }
  };

  /* ---------- the header widgets: streak flame + daily goal ring ---------- */
  function statsHtml() {
    const st = streakAll(); const today = xpToday(), goal = dailyGoal(); const pct = Math.min(100, Math.round(100 * today / goal)); const lv = level(xpTotal());
    const r = 11, C = 2 * Math.PI * r;
    return `<button class="streak-chip${st.activeToday ? ' lit' : ''}" data-action="hub-streak" aria-haspopup="true" aria-expanded="false" title="${st.activeToday ? `${st.n}-day streak, extended today` : st.n ? `${st.n}-day streak: study today to keep it` : 'Study today to start a streak'}">${App.pixel ? App.pixel('flame', 2) : icon('fire', 15)}<b>${st.n}</b></button>
      <button class="goal-ring${pct >= 100 ? ' done' : ''}" data-action="hub-goal" aria-haspopup="true" aria-expanded="false" title="${today} of ${goal} XP today · Level ${lv.n} ${lv.name}"><svg viewBox="0 0 28 28" width="30" height="30" aria-hidden="true"><circle class="ring-bg" cx="14" cy="14" r="${r}"/><circle class="ring-fg" cx="14" cy="14" r="${r}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(2)}"/></svg><span class="ring-lvl">${pct >= 100 ? icon('check', 12) : lv.n}</span></button>${App.hubExtra ? App.hubExtra() : ''}`;
  }
  function paintStats() {
    try { autoFreeze(); } catch (e) {}
    let top = $('#topbar-hub'); if (!top) { const acct = $('#topbar-account'); if (acct) { top = document.createElement('span'); top.id = 'topbar-hub'; top.className = 'hub-slot'; acct.before(top); } }
    const fresh = !xpTotal() && !streakAll().longest;   // brand-new visitors: no streak or XP widgets until they have done something
    $$('.hub-slot').forEach(el => { el.hidden = fresh; el.innerHTML = statsHtml(); bind(el, { 'hub-streak': b => streakPopover(b), 'hub-goal': b => goalPopover(b), 'hub-quests': b => { if (App.questsPopover) App.questsPopover(b); } }); });
    const lv = level(xpTotal()); $$('.acct-level').forEach(el => { el.innerHTML = `<span class="lvl-badge">${lv.n}</span><div class="acct-level-body"><b>Level ${lv.n} · ${lv.name}</b><div class="bar sm"><div class="bar-fill" style="width:${lv.pct}%"></div></div></div>`; el.title = `${lv.xp} XP · ${lv.toNext} XP to level ${lv.n + 1}`; });
  }
  function streakPopover(anchor) {
    const st = streakAll(); const t = todayISO(); const days = Array.from({ length: 7 }, (_, i) => toISO(addDays(new Date(), i - 6)));
    const bank = App.freezeBank(); const wk = (settings().freezeWeeks || {})[App.isoWeek(new Date())] || { days: [] };
    popover(anchor, `<div class="pop-head">${icon('fire', 18)}<div><b>${st.n}-day streak</b><div class="small muted">${st.activeToday ? 'Extended today. See you tomorrow.' : st.n ? 'Answer one question today to keep it going.' : 'Study today to light the first flame.'}</div></div></div>
      <div class="streak-week">${days.map(d => `<div class="sday${st.days[d] ? ' lit' : ''}${st.days[d] === 'freeze' ? ' frozen' : ''}${d === t ? ' today' : ''}"><span class="sday-flame">${st.days[d] === 'freeze' ? icon('shield', 16) : icon('fire', 16)}</span><span class="sday-name">${'SMTWTFS'[App.parseISO(d).getDay()]}</span></div>`).join('')}</div>
      <div class="row gap-sm small muted" style="justify-content:space-between"><span>Longest: <b>${st.longest}</b> day${st.longest === 1 ? '' : 's'}</span><span title="A freeze covers one missed day on its own. Hit your daily goal on three days of a week to earn one (you can hold two).">${icon('shield', 12)} <b>${bank}</b> freeze${bank === 1 ? '' : 's'} · ${Math.min(3, wk.days.length)}/3 goal days this week</span></div>
      ${App.D ? `<a class="btn sm primary mt-2" style="width:100%;justify-content:center" href="${App.link('practice', null, { smart: 1 })}">${icon('list', 13)} Quick set to keep it alive</a>` : ''}`, null, { cls: 'pop-streak' });
  }
  function goalPopover(anchor) {
    const today = xpToday(), goal = dailyGoal(); const lv = level(xpTotal()); const pct = Math.min(100, Math.round(100 * today / goal));
    popover(anchor, `<div class="pop-head">${icon('zap', 18)}<div><b>${today} / ${goal} XP today</b><div class="small muted">${today >= goal ? 'Daily goal done. Anything more is a bonus.' : `${goal - today} XP to go. A correct answer is 10 XP.`}</div></div></div>
      <div class="bar mb-2"><div class="bar-fill ${pct >= 100 ? 'good' : ''}" style="width:${pct}%"></div></div>
      <div class="lvl-row"><span class="lvl-badge">${lv.n}</span><div style="flex:1"><div class="small"><b>Level ${lv.n} · ${lv.name}</b> <span class="muted">· ${lv.xp} XP total</span></div><div class="bar sm mt-1"><div class="bar-fill" style="width:${lv.pct}%"></div></div><div class="small muted mt-1">${lv.toNext} XP to level ${lv.n + 1}</div></div></div>
      <div class="eyebrow mt-2 mb-1">Daily goal</div><div class="goal-picks">${GOALS.map(([n, name]) => `<button class="goal-pick${n === goal ? ' on' : ''}" data-action="goal" data-n="${n}"><b>${n} XP</b><span>${name}</span></button>`).join('')}</div>
      ${App.questsHtml ? `<div class="eyebrow mt-3 mb-1">Daily quests</div>${App.questsHtml(true)}` : ''}
      <p class="small muted mt-2">Earn XP: correct answer +10 · attempt +2 · flashcard you know +2 · focus minute +1 · daily challenge = its points · 5 in a row +5</p>`,
      { goal: b => { setSetting('dailyGoal', +b.dataset.n); toast(`Daily goal: ${b.dataset.n} XP`); closePopover(); paintStats(); paintMascots(); } }, { cls: 'pop-goal' });
  }
  App.paintStats = paintStats;

  /* ---------- Bo the bobcat ---------- */
  function bobcatSvg(size = 96) {
    return `<svg class="bobcat" width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true">
      <g class="bob-body"><path d="M28 118c0-20 12-32 32-32s32 12 32 32z" fill="#C98B4B"/><path d="M40 118c2-12 9-19 20-19s18 7 20 19z" fill="#F3DFB8"/></g>
      <g class="bob-head"><path d="M22 44L14 14l30 14z" fill="#C98B4B"/><path d="M98 44l8-30-30 14z" fill="#C98B4B"/><path d="M24 40l-6-19 20 10z" fill="#3B2A1C"/><path d="M96 40l6-19-20 10z" fill="#3B2A1C"/>
        <ellipse cx="60" cy="58" rx="40" ry="34" fill="#D9A15B"/><ellipse cx="60" cy="68" rx="28" ry="22" fill="#F3DFB8"/>
        <path d="M30 42c4 5 8 10 8 18M90 42c-4 5-8 10-8 18M36 76c-6 0-10-3-14-6M84 76c6 0 10-3 14-6" stroke="#8B5A2B" stroke-width="3" stroke-linecap="round" fill="none"/>
        <g class="bob-eyes"><ellipse cx="46" cy="56" rx="7" ry="8" fill="#fff"/><ellipse cx="74" cy="56" rx="7" ry="8" fill="#fff"/><circle cx="47" cy="57" r="4" fill="#2A1B0E"/><circle cx="75" cy="57" r="4" fill="#2A1B0E"/><circle cx="48.5" cy="55" r="1.4" fill="#fff"/><circle cx="76.5" cy="55" r="1.4" fill="#fff"/><g class="bob-lids"><ellipse cx="46" cy="56" rx="7.5" ry="8.5" fill="#D9A15B"/><ellipse cx="74" cy="56" rx="7.5" ry="8.5" fill="#D9A15B"/></g></g>
        <path d="M55 68h10l-5 5z" fill="#3B2A1C"/><path d="M60 73v4M60 77c-3 3-7 3-9 0M60 77c3 3 7 3 9 0" stroke="#3B2A1C" stroke-width="2" stroke-linecap="round" fill="none"/>
        <path d="M18 70l18 2M18 78l18-1M102 70l-18 2M102 78l-18-1" stroke="#8B5A2B" stroke-width="1.6" stroke-linecap="round"/></g>
      <g class="bo-hat"><path d="M39 31Q57 15 73 1Q77 16 83 31Z" fill="#4C2A85"/><path d="M73 1Q77 16 83 31L77 31Q74 16 73 1Z" fill="#3A1F68"/><ellipse cx="61" cy="31" rx="28" ry="5.5" fill="#3A1F68"/><path d="M43 27.5Q61 31 80 27.5L81.5 30.5Q61 34.5 41.5 30.5Z" fill="#E8B84E"/><path d="M60 14l1.1 2.6 2.6 1.1-2.6 1.1-1.1 2.6-1.1-2.6-2.6-1.1 2.6-1.1z M69 8.5l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8z" fill="#F6E4B3"/></g></svg>`;
  }
  function mascotLine() {
    const st = streakAll(); const today = xpToday(), goal = dailyGoal(); const h = new Date().getHours(); const guest = App.guest();
    if (today >= goal) return { t: `Daily goal done: ${today} XP. ${st.n >= 2 ? `That is ${st.n} days in a row.` : 'Come back tomorrow to build a streak.'}`, mood: 'happy' };
    if (st.n >= 1 && !st.activeToday && h >= 17) return { t: `Your ${st.n}-day streak ends at midnight. One quick set keeps it alive.`, mood: 'worried' };
    if (guest) return { t: 'Hi, I am Bo. Sign up free and your streak, XP and progress follow you to every device.', mood: 'happy' };
    if (today === 0) return { t: h < 12 ? `Morning! ${goal} XP today: that is about ${Math.ceil(goal / 10)} correct answers.` : `Nothing yet today. ${goal} XP is about ${Math.ceil(goal / 10)} correct answers.`, mood: 'neutral' };
    return { t: `${goal - today} XP to today's goal. Keep going.`, mood: 'happy' };
  }
  function mascotHtml(size = 96, cls = '') { const m = mascotLine(); return `<div class="mascot ${m.mood} ${cls}"><div class="bubble">${esc(m.t)}</div>${bobcatSvg(size)}</div>`; }
  function paintMascots() { $$('.mascot-slot').forEach(el => { el.innerHTML = mascotHtml(+el.dataset.size || 96, el.dataset.cls || ''); }); }
  App.mascotHtml = mascotHtml; App.paintMascots = paintMascots; App.bobcatSvg = bobcatSvg;
  /* Empty states: "Loading…" boxes become skeleton bars; other empty boxes get a small Bo. Works for every panel, present and future. */
  function dressEmpty(el) {
    if (el.dataset.dressed) return; el.dataset.dressed = '1'; const txt = el.textContent.trim();
    if (txt === 'Loading…') { el.classList.add('skel'); el.setAttribute('aria-busy', 'true'); el.setAttribute('aria-label', 'Loading'); el.innerHTML = '<i></i><i></i><i></i>'; return; }
    if (el.classList.contains('small') || el.classList.contains('skel') || el.querySelector('svg, .bo-mini, .btn') || txt.length > 170 || /Results appear here/.test(txt)) return;
    el.classList.add('bo'); el.insertAdjacentHTML('afterbegin', `<span class="bo-mini" aria-hidden="true">${App.pixelFor ? App.pixelFor(txt) : bobcatSvg(36)}</span>`);
  }
  App.skeleton = (n = 3) => `<div class="empty skel" aria-busy="true" aria-label="Loading">${'<i></i>'.repeat(n)}</div>`;
  if (global.MutationObserver) { const mo = new MutationObserver(muts => { muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.matches && n.matches('.empty')) dressEmpty(n); if (n.querySelectorAll) n.querySelectorAll('.empty').forEach(dressEmpty); })); }); mo.observe(document.documentElement, { childList: true, subtree: true }); }

  /* ---------- getting started checklist (dashboard, new users) ---------- */
  App.gettingStarted = function () {
    if (settings().gsDismissed) return null; const s = settings(); const u = App.auth && App.auth.user; let onboarded = false; try { onboarded = localStorage.getItem('mathub-onboarded') === '1'; } catch {}
    const badges = App.social && App.social.badges ? App.social.badges.badges.map(b => b.code) : [];
    const items = [
      { label: u ? 'Account created' : 'Create your free account', done: !!u, href: '#', action: u ? '' : 'gs-signup' },
      { label: 'Pick your classes and sections', done: onboarded || Array.isArray(s.courses), href: App.inCourse() ? App.link('settings') : '#/settings' },
      { label: 'Choose a daily XP goal', done: s.dailyGoal !== undefined, href: App.inCourse() ? App.link('settings') : '#/settings' },
      { label: 'Finish your first lesson', done: (s.lessonsDone || 0) >= 1, href: App.inCourse() ? App.link('lesson', null, { smart: 1 }) : '#/' },
      { label: 'Say hi in Discussions', done: badges.includes('first_post') || badges.includes('first_answer'), href: App.inCourse() ? App.link('forum') : '#/forum' }
    ].map(i => Object.assign(i, { action: i.done ? '' : (i.action || '') }));
    const done = items.filter(i => i.done).length; if (done === items.length) return null;
    return { items, done, total: items.length };
  };

  /* ---------- count-up numbers ---------- */
  function countUp(root) {
    if (reduced()) return;
    $$('[data-count]', root).forEach(el => { const target = parseFloat(el.dataset.count); if (isNaN(target)) return; const dec = (el.dataset.count.split('.')[1] || '').length; const t0 = performance.now(); const dur = 650; const node = el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild : null; if (!node) return; (function f(t) { const k = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - k, 3); node.nodeValue = (target * e).toFixed(dec); if (k < 1) requestAnimationFrame(f); })(t0); });
  }
  App.countUp = countUp;

  /* ---------- learning path ---------- */
  function crownsFor(v) { if (!v || !v.a) return 0; const acc = v.c / v.a; if (v.a >= 40 && acc >= 0.9) return 5; if (v.a >= 25 && acc >= 0.8) return 4; if (v.a >= 15 && acc >= 0.7) return 3; if (v.a >= 10 && acc >= 0.6) return 2; return v.a >= 5 ? 1 : 0; }
  App.pathNodes = function (C) {
    const D = C || App.D; const QZ = D && (D.quiz || (D.quizTopics ? { TOPICS: D.quizTopics } : null)); if (!D || !QZ || !D.SECTIONS) return []; const p = (dataOf(D.id).progress) || {}; const cur = App.currentSectionOf ? App.currentSectionOf(D) : App.currentSection(); const curIdx = Math.max(0, D.SECTIONS.findIndex(s => s.id === cur.id));
    let currentSet = false, k = 0; const out = [];
    D.UNITS.forEach(u => { D.SECTIONS.filter(s => s.unit === u.n).forEach(s => { const sIdx = D.SECTIONS.findIndex(x => x.id === s.id); Object.keys(QZ.TOPICS).filter(t => QZ.TOPICS[t].sec === s.id).forEach(t => { const c = crownsFor(p[t]); const covered = sIdx <= curIdx; let state = covered ? (c >= 3 ? 'done' : 'open') : 'soon'; if (state === 'open' && !currentSet) { state = 'current'; currentSet = true; } out.push({ t, label: QZ.TOPICS[t].label, sec: s, unit: u, crowns: c, state, k: k++, n: p[t] ? p[t].a : 0 }); }); }); });
    if (!currentSet) { const f = out.find(n => n.state === 'soon'); if (f) f.state = 'current'; }
    return out;
  };
  App.views.path = {
    title: 'Learning path',
    render(root) {
      const D = App.D; const nodes = App.pathNodes(); const cur = nodes.find(n => n.state === 'current');
      const units = D.UNITS.map(u => ({ u, nodes: nodes.filter(n => n.unit.n === u.n) })).filter(x => x.nodes.length);
      root.innerHTML = App.pageHead('Learning path', 'One stop per topic, in the order the class covers them. Earn crowns by answering questions on a topic: five crowns is 40 questions at 90% accuracy.', cur ? `<a class="btn primary" href="${App.link('lesson', null, { topics: cur.t })}">${icon('play', 14)} Continue: ${esc(cur.label)}</a>` : '') + `
        <div class="path-legend small muted">${icon('award', 13)} mastered (3+ crowns) · ${icon('play', 13)} covered in class · ${icon('clock', 13)} coming up · <b>${nodes.filter(n => n.state === 'done').length} of ${nodes.length}</b> topics mastered</div>
        <div class="path-wrap">${units.map(({ u, nodes: ns }, ui) => { const ex = D.EXAMS.find(e => e.id === u.exam); return `<section class="path-unit u${(ui % 4) + 1}"><div class="path-unit-head"><div><div class="eyebrow">Unit ${u.n}${ex ? ` · on ${esc(ex.name)}` : ''}</div><h2>${esc(u.title)}</h2></div><span class="chip">${ns.filter(n => n.state === 'done').length} / ${ns.length} mastered</span><a class="btn sm" href="${App.link('practice', null, { unit: u.n })}">${icon('list', 13)} Practice unit</a></div>
          <div class="path-nodes">${ns.map(n => `<a class="path-node ${n.state}" style="--ox:${Math.round(Math.sin(n.k * 0.85) * 96)}px" href="${App.link('lesson', null, { topics: n.t })}" title="${esc(n.label)} · ${n.crowns} crown${n.crowns === 1 ? '' : 's'} · ${n.n} answered">${n.state === 'current' ? '<span class="node-start">START</span>' : ''}<span class="node-btn">${n.state === 'done' ? icon('award', 24) : n.state === 'soon' ? icon('clock', 20) : icon('play', 22)}</span><span class="node-crowns" aria-label="${n.crowns} of 5 crowns">${'★'.repeat(n.crowns)}<i>${'★'.repeat(5 - n.crowns)}</i></span><span class="node-label">${esc(n.label)}<small>${esc(App.secLabel(n.sec.id))} · ${esc(n.sec.title)}</small></span></a>`).join('')}</div></section>`; }).join('')}</div>`;
    }
  };

  /* ---------- hooks ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    LiveBg.init();
    if (App.auth) App.auth.onChange(() => { paintStats(); paintMascots(); });
    if (settings().levelSeen === undefined) setSetting('levelSeen', level(xpTotal()).n);
  });
})(window);

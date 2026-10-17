/* ============================================================
   Mathub — Realm: the tabletop layer
   - class archetypes: every class is a character class (Calculus I is
     the Wizard, Physics I the Artificer, Precalculus the Ranger, Writing
     the Bard, CSCI 127 the Warlock); shown on the class cards in Realm
     and on the character sheet in every look
   - the d20 quest roller (buttons with data-roll="all" or a class id):
     a d20 tumbles and picks what to practise, leaning towards your weak
     topics; a natural 20 sends you to a Blitz, a natural 1 to your
     nemesis (weakest topic); the roll never changes XP
   - the character sheet at #/sheet: six ability scores computed from
     real study data, class levels from each class's XP, proficiencies,
     a nemesis and an inventory
   The look itself is assets/realm.css.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, store, settings, toast } = App; const Courses = global.Courses;
  App.isRealm = () => document.documentElement.getAttribute('data-skin') === 'realm';
  // warm the fonts the canvases and the decode use, only when this look is on
  const warmFonts = () => { if (App.isRealm() && document.fonts && document.fonts.load) ['600 16px Cinzel', '16px "Mathub Runes"'].forEach(f => document.fonts.load(f, 'ᚠAa20').catch(() => {})); };
  warmFonts(); new MutationObserver(warmFonts).observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin'] });

  /* ---------- archetypes ---------- */
  const ARCH = {
    calc: { name: 'Wizard', icon: 'wand', line: 'Bends limits and rates of change to their will.' },
    physics: { name: 'Artificer', icon: 'gear', line: 'Builds with force, motion and energy.' },
    precalc: { name: 'Ranger', icon: 'compass', line: 'Navigates by angles, bearings and curves.' },
    writ: { name: 'Bard', icon: 'quill', line: 'Wins the argument with words.' },
    csci: { name: 'Warlock', icon: 'orb', line: 'Made a pact with Python.' },
    biob: { name: 'Druid', icon: 'potion', line: 'Speaks the language of cells and genes.' },
    kin: { name: 'Paladin', icon: 'shield', line: 'Knows every joint, lever and muscle in the fight.' },
    psyx: { name: 'Seer', icon: 'eye', line: 'Reads the patterns behind the behavior.' }
  };
  App.archetype = id => ARCH[id] || (Courses[id] && Courses[id].archetype) || { name: 'Adventurer', icon: 'sword', line: 'Ready for any quest.' };
  const ACCENT = { calc: '--calc-accent', physics: '--phys-accent', precalc: '--precalc-accent', writ: '--writ-accent', csci: '--csci-accent', biob: '--biob-accent', kin: '--kin-accent', psyx: '--psyx-accent' };
  /* classes uploaded in the admin panel bring their own archetype; their colours are --<id>-accent (assets/classpacks.js) */
  App.addArchetype = (id, a) => { if (a) ARCH[id] = a; ACCENT[id] = `--${id}-accent`; };

  /* ---------- d20 ---------- */
  const d20Svg = (n, cls = '') => `<svg class="d20-big ${cls}" viewBox="0 0 100 100" aria-hidden="true"><path class="d20-face" d="M50 4 90 27 90 73 50 96 10 73 10 27Z"/><path class="d20-inner" d="M50 26 74 67 26 67Z"/><path class="d20-edge" d="M50 4 90 27 90 73 50 96 10 73 10 27Z M50 26 74 67 26 67Z M50 4V26 M50 26 10 27 M50 26 90 27 M74 67 90 27 M74 67 90 73 M74 67 50 96 M26 67 50 96 M26 67 10 73 M26 67 10 27"/><text x="50" y="54" text-anchor="middle" dominant-baseline="middle">${n}</text></svg>`;
  App.d20Svg = d20Svg;
  const d20 = () => { try { return 1 + (global.crypto.getRandomValues(new Uint32Array(1))[0] % 20); } catch (e) { return 1 + Math.floor(Math.random() * 20); } };
  const quizIds = ids => ids.filter(id => Courses[id] && (Courses[id].quiz || Courses[id].quizTopics || Courses[id].hasQuiz));
  function candidates(ids) {
    const out = [];
    ids.forEach(id => {
      const C = Courses[id]; const nodes = App.pathNodes ? App.pathNodes(C) : []; const prog = (store.peek(id) || {}).progress || {};
      nodes.filter(n => n.state !== 'soon').forEach(n => { const p = prog[n.t] || { a: 0, c: 0 }; const acc = p.a ? p.c / p.a : null; out.push({ id, t: n.t, label: n.label, a: p.a || 0, acc, w: acc === null ? 0.55 : Math.max(0.05, 1 - acc) + (p.a < 3 ? 0.2 : 0) }); });
    });
    return out;
  }
  const pickWeighted = list => { const tot = list.reduce((s, x) => s + x.w, 0); let r = Math.random() * tot; for (const x of list) { r -= x.w; if (r <= 0) return x; } return list[list.length - 1]; };
  const lessonHref = q => `#/${q.id}/lesson?topics=${encodeURIComponent(q.t)}`;
  // the outcome of a roll (pure, so tests can check every branch with a forced number)
  App.rollOutcome = function (r, ids) {
    const pool = candidates(quizIds(ids)); if (!pool.length) return { r, kind: 'none', title: 'The dice are quiet', text: 'None of your classes has practice questions yet. Pick classes with practice in Settings.', href: '#/settings', cta: 'Choose classes' };
    if (r === 20) { const q = pickWeighted(pool); return { r, kind: 'crit', title: 'Natural 20!', text: `Critical success. The dice grant a Blitz in ${Courses[q.id].short}: ninety seconds, combos multiply your score.`, href: `#/${q.id}/blitz`, cta: 'Start the Blitz', q }; }
    if (r === 1) { const known = pool.filter(x => x.a >= 3); const q = (known.length ? known : pool).slice().sort((a, b) => b.w - a.w)[0]; return { r, kind: 'fumble', title: 'Natural 1…', text: `Critical fail. The dice send you to face your nemesis${q.acc !== null ? ` (${Math.round(q.acc * 100)}% so far)` : ''}.`, href: lessonHref(q), cta: 'Face the nemesis', q }; }
    const q = pickWeighted(pool); const dc = Math.max(5, Math.min(20, Math.round(8 + q.w * 10))); const ok = r >= dc;
    return { r, kind: ok ? 'pass' : 'fail', dc, title: ok ? `${r} beats DC ${dc}` : `${r} against DC ${dc}`, text: ok ? 'Success. The path ahead is clear: a quick lesson on this topic.' : 'The quest resists, so it is worth the practice: a short lesson on this topic.', href: lessonHref(q), cta: 'Accept the quest', q };
  };
  App.rollQuest = async function (scope = 'all', opts = {}) {
    if ($('#roll-modal')) return; const ids = scope && scope !== 'all' ? [scope] : App.myCourses();
    const m = document.createElement('div'); m.className = 'modal-backdrop'; m.id = 'roll-modal';
    m.innerHTML = `<div class="modal roll-modal" role="dialog" aria-modal="true" aria-label="Roll for a quest"><button class="icon-btn roll-close" data-act="close" aria-label="Close">${icon('x', 14)}</button><div class="eyebrow">${scope && scope !== 'all' && Courses[scope] ? `${esc(Courses[scope].short)} · ${esc(App.archetype(scope).name)}` : 'All your classes'}</div><div class="d20-stage">${d20Svg('?')}</div><div class="roll-verdict" aria-live="polite"></div><div class="roll-sub"></div><div id="roll-body"></div></div>`;
    document.body.appendChild(m);
    const close = () => { App.dismiss(m); document.removeEventListener('keydown', onKey); }; const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey); m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-act="close"]')) close(); });
    const roll = async () => {
      const svg = $('.d20-big', m); const txt = $('text', svg); const verdict = $('.roll-verdict', m), sub = $('.roll-sub', m), body = $('#roll-body', m);
      verdict.className = 'roll-verdict'; verdict.textContent = ''; sub.textContent = 'Rolling…'; body.innerHTML = ''; svg.setAttribute('class', 'd20-big');
      const reduced = App.motionReduced && App.motionReduced(); if (App.sfx) App.sfx.play('tap');
      const missing = ids.filter(id => Courses[id] && !Courses[id].loaded && App.loadCourse);
      const load = missing.length ? App.loadCourses(missing) : Promise.resolve();
      if (!reduced) { void svg.getBoundingClientRect(); svg.classList.add('rolling'); const flick = setInterval(() => { txt.textContent = d20(); }, 70); await new Promise(res => setTimeout(res, 950)); clearInterval(flick); }
      await load; const r = opts.force && !opts.used ? +opts.force : d20(); opts.used = true; txt.textContent = r;
      const o = App.rollOutcome(r, ids); svg.classList.remove('rolling'); if (o.kind === 'crit') svg.classList.add('crit'); if (o.kind === 'fumble') svg.classList.add('fumble');
      verdict.textContent = o.title; if (o.kind === 'crit' || o.kind === 'fumble') verdict.classList.add(o.kind); sub.textContent = o.text;
      body.innerHTML = `${o.q ? `<div class="roll-quest"><small>${esc(Courses[o.q.id].short)} · ${esc(App.archetype(o.q.id).name)} quest</small><b>${esc(o.q.label)}</b><small>${o.q.acc === null ? 'Not tried yet' : `${Math.round(o.q.acc * 100)}% on ${o.q.a} question${o.q.a === 1 ? '' : 's'} so far`}</small></div>` : ''}<div class="roll-actions"><a class="btn primary" href="${esc(o.href)}" data-act="go">${icon(o.kind === 'crit' ? 'zap' : 'sword', 14)} ${esc(o.cta)}</a><button class="btn d20-btn" data-act="again">${icon('d20', 14)} Roll again</button></div>`;
      $('[data-act="go"]', body).addEventListener('click', () => { close(); if (App.track) App.track('feat:roll'); });
      $('[data-act="again"]', body).addEventListener('click', roll);
      if (App.sfx) App.sfx.play(o.kind === 'crit' ? 'levelup' : o.kind === 'fumble' ? 'wrong' : 'correct'); if (o.kind === 'crit' && App.confetti && !reduced) App.confetti({ count: 160 });
      const go = $('[data-act="go"]', body); if (go) go.focus();
    };
    roll();
  };
  document.addEventListener('click', e => { const b = e.target.closest('[data-roll]'); if (!b) return; e.preventDefault(); App.rollQuest(b.dataset.roll); });

  /* ---------- character sheet ---------- */
  const iso = d => App.toISO ? App.toISO(d) : d.toISOString().slice(0, 10);
  const lastDays = n => { const t = App.parseISO ? App.parseISO(App.todayISO()) : new Date(); return Array.from({ length: n }, (_, i) => { const d = new Date(t); d.setDate(d.getDate() - i); return iso(d); }); };
  const clamp = s => Math.max(3, Math.min(20, Math.round(s)));
  const mod = s => { const m = Math.floor((s - 10) / 2); return (m >= 0 ? '+' : '−') + Math.abs(m); };
  App.abilities = function () {
    const ids = App.myCourses().filter(id => Courses[id]); const data = ids.map(id => [id, store.peek(id) || {}]);
    const d7 = new Set(lastDays(7)), d14 = new Set(lastDays(14)), d30 = new Set(lastDays(30));
    const streak = App.streakAll ? App.streakAll().n : 0;
    const blitz = data.reduce((b, [, d]) => Math.max(b, (d.blitz && d.blitz.best) || 0), 0);
    const log = settings().focusLog || {}; const focus = [...d7].reduce((s, k) => s + (log[k] || 0), 0);
    let answered = 0, correct = 0; data.forEach(([, d]) => (d.history || []).forEach(h => { if (d30.has(h.d)) { answered++; if (h.ok) correct++; } }));
    let cards = 0; data.forEach(([, d]) => Object.values(d.fcAt || {}).forEach(ts => { if (d14.has(iso(new Date(ts)))) cards++; }));
    const days = new Set(); data.forEach(([, d]) => Object.keys(d.activity || {}).forEach(k => { if (d30.has(k)) days.add(k); }));
    const acc = answered ? correct / answered : null;
    return [
      { ab: 'STR', nm: 'Grit', sc: clamp(8 + Math.min(12, streak)), why: `${streak}-day streak`, how: 'Study every day to keep your streak.' },
      { ab: 'DEX', nm: 'Speed', sc: clamp(8 + blitz / 40), why: blitz ? `Blitz best ${blitz}` : 'No Blitz yet', how: 'Play a Blitz round and beat your best.' },
      { ab: 'CON', nm: 'Stamina', sc: clamp(8 + focus / 25), why: `${focus} focus min this week`, how: 'Run focus blocks in the Focus room.' },
      { ab: 'INT', nm: 'Accuracy', sc: answered >= 10 ? clamp(4 + acc * 16) : 10, why: answered >= 10 ? `${Math.round(acc * 100)}% on ${answered} answers` : `${answered} answers in 30 days`, how: 'Answer questions carefully; ten unlock this score.' },
      { ab: 'WIS', nm: 'Memory', sc: clamp(8 + cards / 15), why: `${cards} cards in 2 weeks`, how: 'Review your due flashcards.' },
      { ab: 'CHA', nm: 'Presence', sc: clamp(6 + days.size * 14 / 30), why: `${days.size} of 30 days studied`, how: 'Show up often, even briefly.' }
    ].map(a => Object.assign(a, { md: mod(a.sc) }));
  };
  function alignment(abs) {
    const g = abs.find(a => a.ab === 'STR').sc, i = abs.find(a => a.ab === 'INT').sc;
    const law = g >= 11 ? 'Lawful' : g >= 9 ? 'Neutral' : 'Chaotic'; const good = i >= 15 ? 'good' : 'neutral';
    return law === 'Neutral' && good === 'neutral' ? 'True neutral' : `${law} ${good}`;
  }
  function sheetData() {
    const ids = App.myCourses().filter(id => Courses[id]); const abs = App.abilities(); const lv = App.level ? App.level() : { n: 1, pct: 0, toNext: 100, name: '' };
    const classes = ids.map(id => { const xp = ((store.peek(id) || {}).xp || []).reduce((s, x) => s + (x.n || 0), 0); const L = App.levelOf ? App.levelOf(xp) : { n: 1 }; return { id, C: Courses[id], A: App.archetype(id), xp, n: L.n }; }).sort((a, b) => b.xp - a.xp);
    const profs = [], all = [];
    ids.forEach(id => { const C = Courses[id]; const T = (C.quiz && C.quiz.TOPICS) || C.quizTopics || {}; const prog = (store.peek(id) || {}).progress || {};
      Object.entries(prog).forEach(([t, p]) => { if (!T[t] || !p || !p.a) return; const acc = p.c / p.a; const row = { id, t, label: T[t].label, a: p.a, acc }; all.push(row); if (p.a >= 5 && acc >= 0.8) profs.push(row); }); });
    const nemesis = all.filter(x => x.a >= 3).sort((a, b) => a.acc - b.acc)[0] || null;
    const scrolls = ids.reduce((s, id) => s + ((((store.peek(id) || {}).cheatsheet) || {}).items || []).length, 0);
    const tomes = ids.reduce((s, id) => s + Object.keys((store.peek(id) || {}).mynotes || {}).length, 0);
    const monsters = App.mistakesSummary ? App.mistakesSummary().open : 0; const potions = App.freezeBank ? App.freezeBank() : 0;
    return { ids, abs, lv, classes, profs: profs.sort((a, b) => b.acc - a.acc).slice(0, 12), nemesis, scrolls, tomes, monsters, potions, align: alignment(abs) };
  }
  App.views.sheet = {
    title: 'Character sheet',
    render(root, param, query, standalone) {
      const S = sheetData(); const u = App.auth && App.auth.user; const name = (u && u.name) || 'Adventurer'; const top = S.classes[0];
      const head = `<header class="landing-top"><div><div class="eyebrow">Mathub · character sheet</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Character sheet</h1><p class="muted">Your study habits as a tabletop hero. Every number comes from what you actually did on Mathub.</p></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="#/">${icon('left', 14)} All classes</a></div></header>`;
      root.innerHTML = `<div class="landing-wrap cs-wrap">${head}
        <div class="cs-top mb-2">
          <div class="panel"><div class="eyebrow">Level ${S.lv.n}${S.lv.name ? ` · ${esc(S.lv.name)}` : ''}</div><div class="cs-name">${esc(name)}</div>
            <div class="muted">${top ? `${esc(S.classes.map(c => `${c.A.name} ${c.n}`).join(' / '))}` : 'No classes chosen yet'}</div>
            <div class="cs-facts"><div class="cs-fact"><span>Background</span><b>Montana State</b></div><div class="cs-fact"><span>Alignment</span><b>${esc(S.align)}</b></div><div class="cs-fact"><span>Experience</span><b>${(App.xpTotal ? App.xpTotal() : 0).toLocaleString()} XP</b></div></div>
            <div class="cs-xp"><div class="bar-row"><span>Level ${S.lv.n + 1} in</span><span class="mono">${S.lv.toNext} XP</span><div class="bar"><div class="bar-fill gold" style="width:${S.lv.pct || 0}%"></div></div></div></div>
            <div class="row gap-sm mt-2" style="flex-wrap:wrap"><button class="btn primary d20-btn" data-roll="all">${icon('d20', 15)} Roll for a quest</button><a class="btn" href="#/today">${icon('flag', 14)} Today's plan</a><button class="btn" data-act="print">${icon('print', 14)} Print sheet</button></div></div>
          <div class="panel"><div class="panel-h"><div class="panel-title">${icon('shield')} Classes</div><span class="small muted">Levels come from each class's XP</span></div>
            ${S.classes.length ? S.classes.map(c => `<a class="cs-class" href="#/${c.id}/dashboard" style="--cs-c: var(${ACCENT[c.id] || '--accent'});color:inherit;text-decoration:none"><span class="ci">${icon(c.A.icon, 18)}</span><span class="cl"><b>${esc(c.A.name)} · ${esc(c.C.short)}</b><small>${esc(c.A.line)}</small></span><span class="lv">Lv ${c.n}</span></a>`).join('') : '<div class="empty">Choose your classes in Settings.</div>'}</div>
        </div>
        <div class="panel mb-2"><div class="panel-h"><div class="panel-title">${icon('d20')} Ability scores</div><span class="small muted">3 to 20, like the tabletop; hover for how to raise one</span></div>
          <div class="cs-abils">${S.abs.map(a => `<div class="cs-abil" title="${esc(a.how)}"><div class="ab">${a.ab}</div><div class="nm">${a.nm}</div><div class="sc">${a.sc}</div><span class="md" aria-label="modifier ${a.md.replace('−', 'minus ')}">${a.md}</span><span class="why">${esc(a.why)}</span></div>`).join('')}</div></div>
        <div class="grid cols-2">
          <div class="panel"><div class="panel-h"><div class="panel-title">${icon('award')} Proficiencies</div><span class="small muted">Topics at 80% or better over 5+ answers</span></div>
            ${S.profs.length ? `<div class="cs-profs">${S.profs.map(p => `<a class="chip course-${p.id}" href="${lessonHref(p)}" title="${Math.round(p.acc * 100)}% on ${p.a}">${esc(p.label)} · ${Math.round(p.acc * 100)}%</a>`).join('')}</div>` : '<div class="empty small">None yet. Master a topic to list it here.</div>'}
            <div class="divider"></div><div class="eyebrow mb-1">Nemesis</div>
            ${S.nemesis ? `<a class="cs-item" href="${lessonHref(S.nemesis)}">${icon('sword', 20)}<span><b style="font-size:15px">${esc(S.nemesis.label)}</b><small>${esc(Courses[S.nemesis.id].short)} · ${Math.round(S.nemesis.acc * 100)}% on ${S.nemesis.a} answers. Go face it.</small></span></a>` : '<div class="empty small">No nemesis yet. Answer a few questions and one will appear.</div>'}</div>
          <div class="panel"><div class="panel-h"><div class="panel-title">${icon('potion')} Inventory</div></div>
            <div class="cs-inv">
              <a class="cs-item" href="#/today">${App.pixel ? App.pixel('potion', 3) : icon('potion', 22)}<span><b>${S.potions}</b> Potion${S.potions === 1 ? '' : 's'} of Respite<small>Streak freezes; each covers a missed day</small></span></a>
              <a class="cs-item" href="#/mistakes">${App.pixel ? App.pixel('invader', 3, { cls: 'px-monster' }) : icon('sword', 22)}<span><b>${S.monsters}</b> Monster${S.monsters === 1 ? '' : 's'} to slay<small>Open items in your mistakes notebook</small></span></a>
              <div class="cs-item">${App.pixel ? App.pixel('scroll', 3) : icon('scroll', 22)}<span><b>${S.scrolls}</b> Scroll${S.scrolls === 1 ? '' : 's'}<small>Lines on your cheat sheets</small></span></div>
              <div class="cs-item">${App.pixel ? App.pixel('book', 3) : icon('book', 22)}<span><b>${S.tomes}</b> Tome${S.tomes === 1 ? '' : 's'}<small>Topics with your own notes</small></span></div>
            </div></div>
        </div></div>`;
      const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
      const pb = $('[data-act="print"]', root); if (pb) pb.addEventListener('click', () => global.print());
    }
  };
})(window);

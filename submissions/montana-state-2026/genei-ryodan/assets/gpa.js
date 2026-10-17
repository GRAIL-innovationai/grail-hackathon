/* ============================================================
   Mathub — GPA calculator
   Semester GPA from a list of classes (prefilled with the student's
   chosen classes, their credits and the letter each class's grade
   calculator projects), cumulative GPA from what came before, and a
   target planner (what this semester needs to reach a cumulative
   goal, or how many more credits at what average). Uses Montana
   State's 4.0 scale with plus/minus grades. Works inside any class
   (#/<course>/gpa) and on its own (#/gpa). Saved in this browser.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, settings, setSetting, toast } = App;
  const Courses = global.Courses;

  const SCALE = [['A', 4.0], ['A-', 3.67], ['B+', 3.33], ['B', 3.0], ['B-', 2.67], ['C+', 2.33], ['C', 2.0], ['C-', 1.67], ['D+', 1.33], ['D', 1.0], ['D-', 0.67], ['F', 0]];
  const POINTS = Object.fromEntries(SCALE); const NOT_GRADED = 'P';
  const DEANS_GPA = 3.5, DEANS_CREDITS = 12, GOOD_STANDING = 2.0;
  const uid = () => 'r' + Math.random().toString(36).slice(2, 8);
  const fmt = g => (isFinite(g) ? g.toFixed(2) : '—');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const letterOf = pts => SCALE.find(([, p]) => pts >= p - 0.005)?.[0] || 'F';

  const load = () => Object.assign({ rows: null, priorGpa: '', priorCredits: '', target: 3.5 }, settings().gpa || {});
  const save = patch => setSetting('gpa', Object.assign(load(), patch));
  const defaultRows = () => App.myCourses().map(id => { const C = Courses[id]; const pr = App.projectedGrade ? App.projectedGrade(id) : null; return { id: uid(), course: id, name: `${C.code} · ${C.name}`, credits: (C.COURSE && C.COURSE.credits) || 3, grade: pr ? pr.letter : '' }; });
  const rows = () => { const s = load(); if (!Array.isArray(s.rows)) { const r = defaultRows(); save({ rows: r }); return r; } return s.rows; };
  const setRows = r => save({ rows: r });

  function semester(list) { let credits = 0, points = 0, attempted = 0; list.forEach(r => { const c = parseFloat(r.credits); if (!(c > 0)) return; attempted += c; if (!r.grade || r.grade === NOT_GRADED || !(r.grade in POINTS)) return; credits += c; points += c * POINTS[r.grade]; }); return { credits, points, attempted, gpa: credits ? points / credits : NaN }; }
  function cumulative(sem, priorGpa, priorCredits) { const pg = parseFloat(priorGpa), pc = parseFloat(priorCredits); if (!(pc > 0) || isNaN(pg)) return null; const credits = pc + sem.credits; return { credits, points: pg * pc + sem.points, gpa: credits ? (pg * pc + sem.points) / credits : NaN, priorGpa: clamp(pg, 0, 4), priorCredits: pc }; }

  function stats(root) {
    const list = rows(); const s = load(); const sem = semester(list); const cum = cumulative(sem, s.priorGpa, s.priorCredits); const target = clamp(parseFloat(s.target) || 0, 0, 4);
    $$('[data-pts]', root).forEach(td => { const r = list.find(x => x.id === td.dataset.pts); const c = parseFloat(r && r.credits); td.textContent = r && r.grade && r.grade !== NOT_GRADED && c > 0 ? (c * POINTS[r.grade]).toFixed(2) : r && r.grade === NOT_GRADED ? 'not counted' : '—'; });
    const deans = isFinite(sem.gpa) && sem.gpa >= DEANS_GPA && sem.credits >= DEANS_CREDITS; const low = isFinite(sem.gpa) && sem.gpa < GOOD_STANDING;
    $('#gpa-sem', root).innerHTML = `<div class="gpa-big${isFinite(sem.gpa) ? '' : ' muted'}">${fmt(sem.gpa)}</div><div class="stat-label">semester GPA</div>${isFinite(sem.gpa) ? `<div class="mt-1">${deans ? `<span class="chip gold">${icon('award', 12)} Dean's List pace</span>` : low ? `<span class="chip warn">${icon('flag', 12)} below good standing (2.00)</span>` : `<span class="chip accent">${letterOf(sem.gpa)} average</span>`}</div>` : '<p class="small muted mt-1">Pick a grade for at least one class.</p>'}`;
    $('#gpa-sem-side', root).innerHTML = `<div class="stat"><div class="stat-num">${sem.credits % 1 ? sem.credits : sem.credits.toFixed(0)}</div><div class="stat-label">graded credits${sem.attempted > sem.credits ? ` · ${sem.attempted - sem.credits} not counted` : ''}</div></div><div class="stat"><div class="stat-num">${sem.points.toFixed(1)}</div><div class="stat-label">quality points</div></div>`;
    const cumEl = $('#gpa-cum', root);
    if (!cum) cumEl.innerHTML = `<div class="empty small">Enter your GPA and graded credits from before this semester (both are on your transcript in MyInfo) to see where you land after it.</div>`;
    else { const delta = isFinite(sem.gpa) ? cum.gpa - cum.priorGpa : 0; cumEl.innerHTML = `<div class="grid cols-3"><div class="stat"><div class="stat-num">${fmt(cum.gpa)}</div><div class="stat-label">cumulative after this semester</div></div><div class="stat"><div class="stat-num">${cum.credits % 1 ? cum.credits : cum.credits.toFixed(0)}</div><div class="stat-label">credits in total</div></div><div class="stat"><div class="stat-num ${delta > 0.004 ? 'good' : delta < -0.004 ? 'bad' : ''}">${delta > 0 ? '+' : ''}${delta.toFixed(2)}</div><div class="stat-label">change from ${fmt(cum.priorGpa)}</div></div></div>${isFinite(sem.gpa) ? '' : '<p class="small muted mt-1">Add semester grades above to see the change.</p>'}`; }
    const tEl = $('#gpa-target', root);
    if (!target) tEl.innerHTML = '<div class="empty small">Set a goal above.</div>';
    else if (!cum) { const needSem = target; tEl.innerHTML = `<p class="small">With no earlier credits, your cumulative GPA is this semester's GPA. To finish at <b>${fmt(needSem)}</b> you need an average of <b>${letterOf(needSem)}</b> or better across ${sem.credits || 'your'} graded credits.</p>${isFinite(sem.gpa) ? `<p class="small mt-1">${sem.gpa >= target - 0.005 ? `${icon('check', 13)} Your current picks (${fmt(sem.gpa)}) get you there.` : `Your current picks give ${fmt(sem.gpa)}, ${(target - sem.gpa).toFixed(2)} short.`}</p>` : ''}`; }
    else {
      const semCr = sem.credits || sem.attempted; const need = semCr ? (target * (cum.priorCredits + semCr) - cum.priorGpa * cum.priorCredits) / semCr : NaN;
      let html = '';
      if (!semCr) html = '<p class="small">Add credits to this semester first.</p>';
      else if (need <= 0) html = `<p class="small">${icon('check', 13)} You are already above <b>${fmt(target)}</b>; any passing grades this semester keep you there.</p>`;
      else if (need <= 4.0005) html = `<p class="small">To reach a cumulative <b>${fmt(target)}</b> you need a <b>${fmt(need)}</b> this semester over ${semCr} credits: roughly <b>${letterOf(need)}</b> in every class.${isFinite(sem.gpa) ? ` Your current picks give <b>${fmt(sem.gpa)}</b>, ${sem.gpa >= need - 0.005 ? 'so you are on track.' : `so you are ${(need - sem.gpa).toFixed(2)} short.`}` : ''}</p>`;
      else { const extra = (target * cum.priorCredits - cum.priorGpa * cum.priorCredits) / (4 - target) - semCr; html = `<p class="small">A cumulative <b>${fmt(target)}</b> is out of reach this semester (it would take a ${fmt(need)}). Even with straight A's you would need about <b>${Math.max(0, Math.ceil(extra))} more credits</b> after this semester, all at 4.0.</p>`; }
      const after = isFinite(cum.gpa) ? cum.gpa : cum.priorGpa; const rem = (target - after) > 0.005 ? Math.ceil(Math.max(0, (target * cum.credits - after * cum.credits) / (4 - target))) : 0;
      if (target < 4 && rem > 0 && need > 4.0005) html += `<p class="small muted mt-1">Rule of thumb: every credit at 4.0 pulls a ${fmt(after)} up by about ${((4 - after) / (cum.credits + 1)).toFixed(3)}.</p>`;
      tEl.innerHTML = html;
    }
    const wl = $('#gpa-whatif', root); if (wl) wl.innerHTML = whatIf(list, s);
  }
  function whatIf(list, s) {
    const graded = list.filter(r => parseFloat(r.credits) > 0 && r.grade && r.grade !== NOT_GRADED); if (graded.length < 2) return '';
    const base = semester(list); const cum0 = cumulative(base, s.priorGpa, s.priorCredits);
    const items = graded.map(r => { const up = SCALE[Math.max(0, SCALE.findIndex(([l]) => l === r.grade) - 1)][0]; const down = SCALE[Math.min(SCALE.length - 1, SCALE.findIndex(([l]) => l === r.grade) + 1)][0]; const withG = g => { const alt = list.map(x => x.id === r.id ? Object.assign({}, x, { grade: g }) : x); const sm = semester(alt); const cm = cumulative(sm, s.priorGpa, s.priorCredits); return cm ? cm.gpa : sm.gpa; }; const cur = cum0 ? cum0.gpa : base.gpa; return { r, up: up !== r.grade ? withG(up) - cur : 0, down: down !== r.grade ? withG(down) - cur : 0, upL: up, downL: down }; });
    return `<div class="eyebrow mb-1">One grade step in each class${cum0 ? ' (cumulative)' : ''}</div><div class="table-wrap"><table class="table compact"><thead><tr><th>Class</th><th class="num">Now</th><th class="num">One step up</th><th class="num">One step down</th></tr></thead><tbody>${items.map(x => `<tr><td>${esc(x.r.name.split(' · ')[0])}</td><td class="num">${esc(x.r.grade)}</td><td class="num good">${x.up ? `${x.upL} · +${x.up.toFixed(2)}` : '—'}</td><td class="num bad">${x.down ? `${x.downL} · ${x.down.toFixed(2)}` : '—'}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function projLine(r) {
    const C = r.course && Courses[r.course]; const pr = C && App.projectedGrade ? App.projectedGrade(r.course) : null;
    if (pr) return `<div class="small muted mt-1 gpa-proj">${icon('calc', 11)} Grade calculator: <b>${esc(pr.letter)}</b> (${pr.pct.toFixed(1)}%)${r.grade !== pr.letter ? ` · <a href="#" data-action="gpa-use" data-id="${r.id}" data-letter="${esc(pr.letter)}">use it</a>` : ''}</div>`;
    if (C) return `<div class="small muted mt-1 gpa-proj">${icon('calc', 11)} <a href="#/${C.id}/grades">Enter scores in the ${esc(C.code)} grade calculator</a> to project this grade.</div>`;
    return '';
  }
  function rowHtml(r) {
    return `<tr class="gpa-row" data-id="${r.id}"><td><input class="input" data-f="name" value="${esc(r.name || '')}" placeholder="Class" aria-label="Class name">${projLine(r)}</td><td><input class="input mono" data-f="credits" type="number" min="0" max="12" step="0.5" value="${esc(String(r.credits ?? ''))}" aria-label="Credits"></td><td><select class="select" data-f="grade" aria-label="Grade"><option value="">—</option>${SCALE.map(([l]) => `<option value="${l}"${r.grade === l ? ' selected' : ''}>${l}</option>`).join('')}<option value="${NOT_GRADED}"${r.grade === NOT_GRADED ? ' selected' : ''}>P / W (not counted)</option></select></td><td class="num" data-pts="${r.id}"></td><td><button class="icon-btn" data-action="gpa-del" data-id="${r.id}" title="Remove">${icon('x', 13)}</button></td></tr>`;
  }
  function paintRows(root) { $('#gpa-rows', root).innerHTML = rows().map(rowHtml).join('') || `<tr><td colspan="5"><div class="empty small">No classes yet. Add one below.</div></td></tr>`; stats(root); }

  App.views.gpa = {
    title: 'GPA calculator',
    render(root, param, query, standalone) {
      const s = load(); const D = App.D; const back = standalone ? '#/' : App.link('dashboard');
      const head = standalone
        ? `<header class="landing-top"><div><div class="eyebrow">Mathub</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>GPA calculator</h1><p class="muted">Semester GPA, cumulative GPA and what it takes to hit a goal, on Montana State's 4.0 scale.</p></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="#/">${icon('left', 14)} All classes</a></div></header>`
        : App.pageHead('GPA calculator', 'Semester GPA, cumulative GPA and what it takes to hit a goal, on Montana State’s 4.0 scale. Your classes and credits are filled in; letters come from each grade calculator when you have entered scores there.', `<button class="btn sm ghost" data-action="gpa-reset">${icon('rotate', 13)} Reset to my classes</button>`);
      root.innerHTML = `${standalone ? '<div class="landing-wrap contact-wrap">' : ''}${head}<div class="grid cols-3 gpa-grid">
        <div class="panel span-2"><div class="panel-h"><div class="panel-title">${icon('calc')} This semester</div>${standalone ? `<button class="btn sm ghost" data-action="gpa-reset">${icon('rotate', 13)} Reset to my classes</button>` : ''}</div>
          <div class="table-wrap"><table class="table gpa-table"><thead><tr><th>Class</th><th style="width:96px">Credits</th><th style="width:150px">Grade</th><th class="num" style="width:90px">Points</th><th style="width:34px"><span class="sr-only">Remove</span></th></tr></thead><tbody id="gpa-rows"></tbody></table></div>
          <div class="row between mt-2"><button class="btn sm" data-action="gpa-add">${icon('list', 13)} Add a class</button><span class="small muted">Points = credits × grade value. P, W and I do not count.</span></div></div>
        <div class="stack"><div class="panel gpa-hero" id="gpa-sem"></div><div class="panel"><div class="grid cols-2" id="gpa-sem-side"></div></div></div>
        <div class="panel span-2"><div class="panel-h"><div class="panel-title">${icon('chart')} Cumulative GPA</div><span class="small muted">before + this semester</span></div>
          <div class="grid cols-2 mb-2"><label class="field"><span>GPA before this semester</span><input class="input mono" id="gpa-prior" type="number" min="0" max="4" step="0.01" placeholder="e.g. 3.42" value="${esc(String(s.priorGpa ?? ''))}"></label><label class="field"><span>Graded credits before this semester</span><input class="input mono" id="gpa-prior-cr" type="number" min="0" max="300" step="1" placeholder="e.g. 45" value="${esc(String(s.priorCredits ?? ''))}"></label></div><div id="gpa-cum"></div></div>
        <div class="panel"><div class="panel-h"><div class="panel-title">${icon('target')} Reach a goal</div></div><label class="field mb-2"><span>Cumulative GPA I want</span><input class="input mono" id="gpa-goal" type="number" min="0" max="4" step="0.01" value="${esc(String(s.target ?? 3.5))}"></label><div id="gpa-target"></div><div class="row gap-sm mt-2">${[2.0, 3.0, 3.5, 3.75].map(g => `<button class="chip toggle${+s.target === g ? ' on' : ''}" data-action="gpa-goal" data-g="${g}">${g.toFixed(2)}</button>`).join('')}</div></div>
        <div class="panel span-2" id="gpa-whatif"></div>
        <div class="panel"><div class="panel-h"><div class="panel-title">${icon('info')} How MSU counts it</div></div><div class="table-wrap"><table class="table compact"><tbody>${SCALE.reduce((acc, x, i) => { if (i % 2 === 0) acc.push(SCALE.slice(i, i + 2)); return acc; }, []).map(pair => `<tr>${pair.map(([l, p]) => `<td><b>${l}</b></td><td class="num">${p.toFixed(2)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
          <ul class="small muted gpa-notes"><li>GPA = quality points ÷ graded credits. A 4-credit class moves it four times as much as a 1-credit one.</li><li>Dean's List needs a semester GPA of ${DEANS_GPA.toFixed(2)} on ${DEANS_CREDITS}+ graded credits; good standing is ${GOOD_STANDING.toFixed(2)} cumulative.</li><li>Pass/fail, withdrawals and incompletes carry no grade points. Retaking a class replaces the earlier attempt in the cumulative GPA.</li><li>Figures here are estimates; the transcript in MyInfo is the official number. Saved in this browser.</li></ul></div>
      </div>${standalone ? '</div>' : ''}`;
      paintRows(root);
      const update = () => { const list = rows(); $$('.gpa-row', root).forEach(tr => { const r = list.find(x => x.id === tr.dataset.id); if (!r) return; r.name = $('[data-f="name"]', tr).value; r.credits = $('[data-f="credits"]', tr).value; r.grade = $('[data-f="grade"]', tr).value; }); setRows(list); save({ priorGpa: $('#gpa-prior', root).value, priorCredits: $('#gpa-prior-cr', root).value, target: $('#gpa-goal', root).value }); $$('.chip[data-action="gpa-goal"]', root).forEach(ch => ch.classList.toggle('on', +ch.dataset.g === +$('#gpa-goal', root).value)); stats(root); };
      root.addEventListener('input', e => { if (e.target.matches('input, select')) update(); });
      root.addEventListener('change', e => { if (e.target.matches('select[data-f="grade"]')) { update(); const tr = e.target.closest('tr'); const r = rows().find(x => x.id === tr.dataset.id); const pl = $('.gpa-proj', tr); if (pl && r) pl.outerHTML = projLine(r); } });
      bind(root, {
        'gpa-add': () => { const list = rows(); list.push({ id: uid(), name: '', credits: 3, grade: '' }); setRows(list); paintRows(root); const last = $$('.gpa-row [data-f="name"]', root).pop(); if (last) last.focus(); },
        'gpa-del': b => { setRows(rows().filter(r => r.id !== b.dataset.id)); paintRows(root); },
        'gpa-use': (b, e) => { if (e) e.preventDefault(); const list = rows(); const r = list.find(x => x.id === b.dataset.id); if (r) { r.grade = b.dataset.letter; setRows(list); paintRows(root); } },
        'gpa-reset': () => { setRows(defaultRows()); paintRows(root); toast('Reset to your classes and projected grades'); },
        'gpa-goal': b => { $('#gpa-goal', root).value = b.dataset.g; update(); }
      });
      if (standalone) { const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot); }
    }
  };
  App.gpaSummary = () => { const s = load(); if (!Array.isArray(s.rows)) return null; const sem = semester(s.rows); return isFinite(sem.gpa) ? { gpa: sem.gpa, credits: sem.credits } : null; };
})(window);

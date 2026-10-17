/* ============================================================
   Mathub — cheat-sheet builder (#/<class>/cheatsheet)
   Pick formulas from the formula sheet and the key formulas, big
   ideas and pitfalls from any topic, add your own lines, choose
   columns and text size, and print a one-page sheet. The selection
   is saved per class (synced) so the sheet grows all semester.
   "Suggest" pre-selects everything from the sections on the next exam.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, toast, store, typeset } = App;
  const state = () => Object.assign({ items: [], notes: '', cols: 2, size: 'm', title: '' }, store.get('cheatsheet', {}));
  const save = patch => store.set('cheatsheet', Object.assign(state(), patch));
  /* every selectable line in the class, with a stable id */
  function catalog(D) {
    const out = [];
    (D.FORMULAS || []).forEach((gp, gi) => gp.items.forEach((f, fi) => out.push({ id: `f:${gi}:${fi}`, group: gp.group, name: f.n, tex: f.t, code: f.c, def: f.d, sec: null, kind: 'formula' })));
    (D.SECTIONS || []).forEach(s => {
      (s.formulas || []).forEach((f, i) => out.push({ id: `s:${s.id}:f:${i}`, group: `${s.label} ${s.title}`, name: f.n, tex: f.t, sec: s.id, kind: 'formula' }));
      (s.ideas || []).forEach((t, i) => out.push({ id: `s:${s.id}:i:${i}`, group: `${s.label} ${s.title}`, name: '', html: t, sec: s.id, kind: 'idea' }));
      (s.pitfalls || []).forEach((t, i) => out.push({ id: `s:${s.id}:p:${i}`, group: `${s.label} ${s.title}`, name: '', html: t, sec: s.id, kind: 'pitfall' }));
    });
    return out;
  }
  const lineHtml = it => it.kind === 'formula' ? `<div class="cs-line formula"><span class="cs-name">${esc(it.name)}</span>${it.tex ? `<span class="cs-tex">$${it.tex}$</span>` : it.code ? `<code>${esc(it.code)}</code>` : it.def ? `<span class="cs-def">${it.def}</span>` : ''}</div>` : `<div class="cs-line ${it.kind}">${it.kind === 'pitfall' ? '<span class="cs-flag">!</span>' : '•'} ${it.html}</div>`;
  App.views.cheatsheet = {
    title: 'Cheat sheet', blurb: 'Build a one-page sheet from the formulas and notes you keep looking up, then print it. Building it is studying.',
    render(root, param, query) {
      const D = App.D; const cat = catalog(D); if (!cat.length) { root.innerHTML = App.pageHead('Cheat sheet', this.blurb) + '<div class="empty">This class has no formulas or notes to pick from yet.</div>'; return; }
      const st = state(); let filter = '';
      root.innerHTML = App.pageHead('Cheat sheet', this.blurb, `<button class="btn" data-action="cs-suggest">${icon('zap', 14)} Suggest for next exam</button><button class="btn primary" data-action="cs-print">${icon('print', 14)} Print / PDF</button>`) + `<div class="cs-layout">
        <div class="panel cs-picker"><div class="row between mb-1"><div class="panel-title">${icon('list')} Pick lines</div><span class="small muted" id="cs-count"></span></div><input class="input mb-1" id="cs-filter" placeholder="Filter (chain, torque, limit…)"><div class="row gap-sm mb-1"><button class="chip toggle on" data-action="cs-kind" data-k="all">All</button><button class="chip toggle" data-action="cs-kind" data-k="formula">Formulas</button><button class="chip toggle" data-action="cs-kind" data-k="idea">Big ideas</button><button class="chip toggle" data-action="cs-kind" data-k="pitfall">Pitfalls</button><span style="flex:1"></span><button class="btn xs ghost" data-action="cs-clear">Clear all</button></div><div id="cs-cat" class="cs-cat"></div>
          <div class="eyebrow mt-2 mb-1">Your own lines</div><textarea class="input" id="cs-notes" rows="4" placeholder="One per line. TeX works between dollar signs: $\\frac{dy}{dx}$">${esc(st.notes)}</textarea></div>
        <div class="cs-preview-wrap"><div class="row between mb-1" style="flex-wrap:wrap;gap:8px"><input class="input" id="cs-title" placeholder="Sheet title" value="${esc(st.title || D.code + ' cheat sheet')}" style="max-width:260px"><div class="row gap-sm"><span class="small muted">Columns</span>${[1, 2, 3].map(n => `<button class="chip toggle${st.cols === n ? ' on' : ''}" data-action="cs-cols" data-n="${n}">${n}</button>`).join('')}<span class="small muted">Size</span>${[['s', 'S'], ['m', 'M'], ['l', 'L']].map(([k, l]) => `<button class="chip toggle${st.size === k ? ' on' : ''}" data-action="cs-size" data-s="${k}">${l}</button>`).join('')}</div></div><div class="cs-sheet size-${st.size} cols-${st.cols}" id="cs-sheet"></div></div></div>`;
      let kind = 'all';
      const paintCat = () => { const s = state(); const sel = new Set(s.items); const f = filter.toLowerCase(); const list = cat.filter(it => (kind === 'all' || it.kind === kind) && (!f || (it.group + ' ' + it.name + ' ' + (it.html || '') + ' ' + (it.tex || '')).toLowerCase().includes(f))); const groups = {}; list.forEach(it => (groups[it.group] = groups[it.group] || []).push(it));
        $('#cs-cat', root).innerHTML = Object.entries(groups).map(([g, items]) => `<div class="cs-group"><div class="cs-group-h">${esc(g)}</div>${items.map(it => `<label class="cs-pick${sel.has(it.id) ? ' on' : ''}"><input type="checkbox" data-action="cs-toggle" data-id="${it.id}" ${sel.has(it.id) ? 'checked' : ''}><span>${it.kind === 'formula' ? `<b>${esc(it.name)}</b>${it.tex ? ` <span class="cs-mini">$${it.tex}$</span>` : ''}` : it.html}</span></label>`).join('')}</div>`).join('') || '<div class="empty small">Nothing matches.</div>';
        $('#cs-count', root).textContent = `${s.items.length} selected`; typeset($('#cs-cat', root)); };
      const paintSheet = () => { const s = state(); const sel = cat.filter(it => s.items.includes(it.id)); const bySec = {}; sel.forEach(it => (bySec[it.group] = bySec[it.group] || []).push(it)); const own = (s.notes || '').split('\n').map(x => x.trim()).filter(Boolean);
        const sheet = $('#cs-sheet', root); sheet.className = `cs-sheet size-${s.size} cols-${s.cols}`; sheet.innerHTML = `<div class="cs-head"><b>${esc(s.title || D.code + ' cheat sheet')}</b><span>${esc(D.code)} · ${esc(App.fmtDate(App.todayISO()))}</span></div><div class="cs-body">${Object.entries(bySec).map(([g, items]) => `<div class="cs-sec"><div class="cs-sec-h">${esc(g)}</div>${items.map(lineHtml).join('')}</div>`).join('')}${own.length ? `<div class="cs-sec"><div class="cs-sec-h">My notes</div>${own.map(l => `<div class="cs-line idea">• ${esc(l).replace(/\$([^$]+)\$/g, '$$$1$$')}</div>`).join('')}</div>` : ''}${!sel.length && !own.length ? '<div class="empty small">Pick lines on the left. The sheet fills in here.</div>' : ''}</div>`; typeset(sheet); };
      const paint = () => { paintCat(); paintSheet(); };
      bind(root, {
        'cs-toggle': cb => { const s = state(); const set = new Set(s.items); if (cb.checked) set.add(cb.dataset.id); else set.delete(cb.dataset.id); save({ items: [...set] }); cb.closest('.cs-pick').classList.toggle('on', cb.checked); $('#cs-count', root).textContent = `${set.size} selected`; paintSheet(); },
        'cs-kind': b => { kind = b.dataset.k; $$('[data-action="cs-kind"]', root).forEach(x => x.classList.toggle('on', x === b)); paintCat(); },
        'cs-cols': b => { save({ cols: +b.dataset.n }); $$('[data-action="cs-cols"]', root).forEach(x => x.classList.toggle('on', x === b)); paintSheet(); },
        'cs-size': b => { save({ size: b.dataset.s }); $$('[data-action="cs-size"]', root).forEach(x => x.classList.toggle('on', x === b)); paintSheet(); },
        'cs-clear': () => { save({ items: [] }); paint(); },
        'cs-suggest': () => { const ex = App.nextExam(); if (!ex) { toast('No exam ahead to suggest for.'); return; } const secs = new Set(ex.cumulative ? D.SECTIONS.map(s => s.id) : (ex.sections || [])); const ids = cat.filter(it => it.kind === 'formula' && (it.sec ? secs.has(it.sec) : true)).map(it => it.id); save({ items: [...new Set(state().items.concat(ids))] }); paint(); toast(`${icon('zap', 14)} Added the formulas for ${ex.name}. Trim what you already know.`, 3500); },
        'cs-print': () => { document.body.classList.add('print-sheet'); global.print(); setTimeout(() => document.body.classList.remove('print-sheet'), 1500); }
      });
      $('#cs-filter', root).addEventListener('input', e => { filter = e.target.value.trim(); paintCat(); });
      let t = null; $('#cs-notes', root).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { save({ notes: e.target.value }); paintSheet(); }, 400); });
      $('#cs-title', root).addEventListener('input', e => { save({ title: e.target.value }); const h = $('#cs-sheet .cs-head b', root); if (h) h.textContent = e.target.value || D.code + ' cheat sheet'; });
      paint();
    }
  };
})(window);

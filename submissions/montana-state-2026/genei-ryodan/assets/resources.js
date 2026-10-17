/* ============================================================
   Mathub — resources hub and study-skills guides
   #/resources (and #/<class>/resources): curated links per class,
   for Montana State and for studying in general, with search, kind
   filters, bookmarks that follow the account, a broken-link flag on
   every item and a "suggest a resource" form.
   #/guides and #/guides/<id>: the written guides from guides-data.js.
   Data: assets/resources-data.js, assets/guides-data.js.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, on, toast, settings, setSetting } = App;
  const R = () => global.MATHUB_RESOURCES || { KINDS: {}, GROUPS: [], ITEMS: [] };
  const GUIDES = () => global.MATHUB_GUIDES || [];
  const KIND_ICON = { video: 'play', practice: 'list', tool: 'flask', reading: 'book', reference: 'file', msu: 'pin', community: 'users', app: 'grid', wellbeing: 'info' };
  const COURSE_GROUPS = App.COURSE_ORDER;   // the same array: classes uploaded in the admin panel join it
  const saved = () => Array.isArray(settings().savedResources) ? settings().savedResources : [];
  const isSaved = u => saved().includes(u);
  const toggleSaved = u => { const s = saved(); const i = s.indexOf(u); if (i >= 0) s.splice(i, 1); else s.unshift(u); setSetting('savedResources', s.slice(0, 200)); return i < 0; };
  const external = u => /^https?:/i.test(u);
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

  /* inline markdown-lite: **bold**, [text](url), line breaks inside quotes */
  function inline(t) {
    let s = esc(t);
    s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, u) => external(u) ? `<a href="${u}" target="_blank" rel="noopener">${txt}</a>` : `<a href="${u}">${txt}</a>`);
    return s.replace(/\n/g, '<br>');
  }
  App.inlineMd = inline;

  /* ---------- resource cards ---------- */
  function itemHtml(it) {
    const ext = external(it.u); const sv = isSaved(it.u);
    return `<article class="rs-item${it.top ? ' top' : ''}" data-u="${esc(it.u)}"><div class="rs-ic kind-${it.k}">${icon(KIND_ICON[it.k] || 'link', 16)}</div>
      <div class="rs-body"><h3><a href="${esc(it.u)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${esc(it.t)}${ext ? ` ${icon('external', 11)}` : ''}</a>${it.top ? '<span class="chip accent xs">Start here</span>' : ''}</h3>
        <p class="small">${esc(it.d)}</p>
        <div class="rs-meta"><span class="chip xs">${esc(R().KINDS[it.k] || it.k)}</span>${ext ? `<span class="small muted">${esc(host(it.u))}</span>` : '<span class="small muted">in Mathub</span>'}${(it.tags || []).slice(0, 3).map(t => `<span class="small muted">#${esc(t)}</span>`).join('')}</div></div>
      <div class="rs-actions"><button class="icon-btn rs-save${sv ? ' on' : ''}" data-action="rs-save" data-u="${esc(it.u)}" title="${sv ? 'Remove from saved' : 'Save for later'}" aria-pressed="${sv}">${icon('pin', 14)}</button>${App.flagButton ? App.flagButton({ view: 'Resources', ref: it.t, prompt: it.u, reason: 'link' }) : ''}</div></article>`;
  }
  const guideCard = g => `<a class="guide-card${(settings().guidesRead || []).includes(g.id) ? ' read' : ''}" href="#/guides/${g.id}"><div class="row between"><span class="chip xs">${g.minutes} min read</span>${(settings().guidesRead || []).includes(g.id) ? `<span class="chip xs good">${icon('check', 11)} read</span>` : ''}</div><h3>${esc(g.title)}</h3><p class="small muted">${esc(g.blurb)}</p><div class="rs-meta">${g.tags.slice(0, 3).map(t => `<span class="small muted">#${esc(t)}</span>`).join('')}</div></a>`;
  App.guideCard = guideCard;
  App.guidesFor = cid => GUIDES().filter(g => g.for === 'all' || (Array.isArray(g.for) && (!cid || g.for.includes(cid))));

  /* ---------- Resources view ---------- */
  App.views.resources = {
    title: 'Resources', blurb: 'The best free help for each class, on campus and online.',
    render(root, param, query, standalone) {
      const D = App.D; const data = R(); const groups = data.GROUPS; const mine = App.myCourses();
      const order = ['general', 'msu'].concat(COURSE_GROUPS.filter(id => mine.includes(id)), COURSE_GROUPS.filter(id => !mine.includes(id)), ['wellbeing']);
      const list = order.map(id => groups.find(g => g.id === id)).filter(Boolean);
      let g = query.c || param || (!standalone && D ? D.id : 'general'); if (!list.some(x => x.id === g) && g !== 'saved') g = 'general';
      const st = { g, kind: 'all', q: '' };
      const head = standalone ? `<div class="landing-wrap"><header class="landing-top"><div><div class="eyebrow">Mathub</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Resources</h1><p class="muted">${this.blurb} Links open in a new tab; if one has moved, tap the flag on it. Saved resources follow your account.</p></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="#/">${icon('left', 14)} All classes</a></div></header>` : App.pageHead('Resources', this.blurb + ' If a link has moved, tap the flag on it.', `<a class="btn sm" href="#/guides">${icon('book', 13)} Study guides</a>`);
      root.innerHTML = `${head}<div class="rs-wrap">
        <div class="rs-groups" role="tablist">${list.map(x => `<button class="chip toggle${x.id === g ? ' on' : ''}" role="tab" data-action="rs-group" data-g="${x.id}">${COURSE_GROUPS.includes(x.id) && global.Courses[x.id] ? esc(global.Courses[x.id].short) : esc(x.title)}</button>`).join('')}<button class="chip toggle${g === 'saved' ? ' on' : ''}" role="tab" data-action="rs-group" data-g="saved">${icon('pin', 12)} Saved <b id="rs-saved-n">${saved().length}</b></button></div>
        <div class="rs-tools"><input class="input" id="rs-q" placeholder="Search resources (e.g. videos, citations, tutoring)" aria-label="Search resources"><div class="rs-kinds" id="rs-kinds"></div><button class="btn sm" data-action="rs-suggest">${icon('pen', 13)} Suggest a resource</button></div>
        <p class="muted rs-blurb" id="rs-blurb"></p>
        <div id="rs-guides"></div>
        <div class="rs-list" id="rs-list"></div>
      </div>${standalone ? '</div>' : ''}`;
      const paint = () => {
        const items = data.ITEMS.filter(it => st.g === 'saved' ? isSaved(it.u) : it.g === st.g).filter(it => st.kind === 'all' || it.k === st.kind).filter(it => !st.q || (it.t + ' ' + it.d + ' ' + (it.tags || []).join(' ')).toLowerCase().includes(st.q));
        const kinds = [...new Set(data.ITEMS.filter(it => st.g === 'saved' ? isSaved(it.u) : it.g === st.g).map(it => it.k))];
        $('#rs-kinds', root).innerHTML = [['all', 'All']].concat(kinds.map(k => [k, data.KINDS[k] || k])).map(([k, l]) => `<button class="chip toggle xs${st.kind === k ? ' on' : ''}" data-action="rs-kind" data-k="${k}">${l}</button>`).join('');
        const grp = groups.find(x => x.id === st.g); $('#rs-blurb', root).textContent = st.g === 'saved' ? (saved().length ? 'Everything you pinned, across all classes.' : 'Nothing saved yet. Pin any resource and it shows up here on every device.') : (grp ? grp.blurb : '');
        const gs = st.g === 'saved' || st.q ? [] : App.guidesFor(COURSE_GROUPS.includes(st.g) ? st.g : null).slice(0, st.g === 'general' ? 6 : 3);
        $('#rs-guides', root).innerHTML = gs.length ? `<div class="row between mb-1"><div class="eyebrow">Study guides</div><a class="small" href="#/guides">All ${GUIDES().length} guides ${icon('right', 11)}</a></div><div class="guide-grid mb-3">${gs.map(guideCard).join('')}</div><div class="eyebrow mb-1">Links</div>` : '';
        $('#rs-list', root).innerHTML = items.length ? items.sort((a, b) => (b.top ? 1 : 0) - (a.top ? 1 : 0)).map(itemHtml).join('') : `<div class="empty">${st.q ? 'No resources match that. Try another word, or suggest one.' : 'Nothing here yet.'}</div>`;
        $$('.rs-groups .chip', root).forEach(c => c.classList.toggle('on', c.dataset.g === st.g)); $('#rs-saved-n', root).textContent = saved().length;
        if (App.motionRender) App.motionRender($('#rs-list', root));
        App.replaceHash && standalone && App.replaceHash(`#/resources?c=${st.g}`);
      };
      bind(root, {
        'rs-group': b => { st.g = b.dataset.g; st.kind = 'all'; paint(); },
        'rs-kind': b => { st.kind = b.dataset.k; paint(); },
        'rs-save': b => { const now = toggleSaved(b.dataset.u); b.classList.toggle('on', now); b.setAttribute('aria-pressed', now); b.title = now ? 'Remove from saved' : 'Save for later'; if (App.burst) App.burst(b, 'pop'); $('#rs-saved-n', root).textContent = saved().length; toast(now ? `${icon('pin', 13)} Saved. Find it under Saved on any device.` : 'Removed from saved.', 1800); if (st.g === 'saved') paint(); },
        'rs-suggest': () => { if (App.reportIssue) App.reportIssue({ view: 'Resources', ref: st.g === 'saved' ? 'general' : st.g, reason: 'resource', title: 'Suggest a resource', placeholder: 'Paste the link and say what it is good for.' }); }
      });
      $('#rs-q', root).addEventListener('input', e => { st.q = e.target.value.trim().toLowerCase(); paint(); });
      paint();
      const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
    }
  };

  /* ---------- Guides view ---------- */
  function guideBody(g) {
    return g.body.map(b => {
      if (b.h) return `<h2>${inline(b.h)}</h2>`; if (b.p) return `<p>${inline(b.p)}</p>`;
      if (b.ul) return `<ul class="list">${b.ul.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`; if (b.ol) return `<ol class="list ol">${b.ol.map(x => `<li>${inline(x)}</li>`).join('')}</ol>`;
      if (b.tip) return `<div class="guide-tip">${icon('bulb', 16)}<div>${inline(b.tip)}</div></div>`; if (b.q) return `<blockquote class="guide-quote">${inline(b.q)}</blockquote>`;
      return '';
    }).join('');
  }
  App.guideBody = guideBody;
  App.views.guides = {
    title: 'Study guides', blurb: 'Short, practical guides written for these classes.',
    render(root, param, query, standalone) {
      const all = GUIDES(); const g = param ? all.find(x => x.id === param) : null; const mine = App.myCourses();
      const wrap = (inner, title, sub, actions = '') => `${standalone ? '<div class="landing-wrap">' : ''}${standalone ? `<header class="landing-top"><div><div class="eyebrow">Mathub · study guides</div><h1 class="landing-title">${g ? '' : `<span class="logo-mark">${App.logoSvg(44)}</span>`}${esc(title)}</h1><p class="muted">${esc(sub)}</p></div><div class="row gap-sm">${actions}<span id="landing-account"></span><a class="btn" href="${g ? '#/guides' : '#/'}">${icon('left', 14)} ${g ? 'All guides' : 'All classes'}</a></div></header>` : App.pageHead(esc(title), esc(sub), actions + (g ? `<a class="btn sm" href="${App.link('guides')}">${icon('left', 13)} All guides</a>` : ''))}${inner}${standalone ? '</div>' : ''}`;
      if (g) {
        const read = (settings().guidesRead || []).includes(g.id); const idx = all.indexOf(g); const next = all[(idx + 1) % all.length];
        root.innerHTML = wrap(`<article class="guide"><div class="guide-head"><span class="chip xs">${g.minutes} min read</span>${g.tags.map(t => `<span class="chip xs">${esc(t)}</span>`).join('')}${read ? `<span class="chip xs good">${icon('check', 11)} read</span>` : ''}</div>${guideBody(g)}
          <div class="guide-foot"><button class="btn primary" data-action="g-done">${icon('check', 14)} ${read ? 'Read again, still counts' : 'Mark as read · +5 XP'}</button><button class="btn" data-action="g-print">${icon('print', 14)} Print</button>${navigator.share ? `<button class="btn" data-action="g-share">${icon('external', 14)} Share</button>` : ''}<span style="flex:1"></span><a class="btn" href="#/guides/${next.id}">Next: ${esc(next.title.split(':')[0])} ${icon('right', 14)}</a></div></article>
          <div class="mt-3"><div class="eyebrow mb-1">More guides</div><div class="guide-grid">${all.filter(x => x !== g).slice(0, 3).map(guideCard).join('')}</div></div>`, g.title, g.blurb);
        bind(root, {
          'g-done': b => { const rd = settings().guidesRead || []; if (!rd.includes(g.id)) { rd.push(g.id); setSetting('guidesRead', rd); if (App.addXP) App.addXP(5, { silent: false }); if (App.sfx) App.sfx.play('complete'); if (App.confetti) App.confetti({ count: 80 }); b.innerHTML = `${icon('check', 14)} Read`; toast(`${icon('check', 14)} Nice. ${rd.length} of ${all.length} guides read.`, 2600); } else toast('Already counted. Good to reread, though.', 1800); },
          'g-print': () => global.print(),
          'g-share': async () => { try { await navigator.share({ title: g.title, text: g.blurb, url: `https://mathub.space/learn/guides/${g.id}.html` }); } catch (e) {} }
        });
        if (App.scrollProgress) App.scrollProgress($('article.guide', root));
        global.scrollTo(0, 0);
      } else {
        const st = { f: query.f || 'all' };
        root.innerHTML = wrap(`<div class="rs-groups mb-2">${[['all', 'All'], ['mine', 'My classes']].concat(COURSE_GROUPS.filter(id => global.Courses[id]).map(id => [id, global.Courses[id].short])).map(([k, l]) => `<button class="chip toggle${st.f === k ? ' on' : ''}" data-action="g-filter" data-f="${k}">${esc(l)}</button>`).join('')}</div><div class="guide-grid" id="g-grid"></div>`, 'Study guides', `${all.length} guides on studying, exams, focus, writing and code, each under six minutes. Read one, use one thing from it this week.`);
        const paint = () => { const list = all.filter(x => st.f === 'all' ? true : st.f === 'mine' ? (x.for === 'all' || x.for.some(c => mine.includes(c))) : (x.for === 'all' || x.for.includes(st.f))); $('#g-grid', root).innerHTML = list.map(guideCard).join(''); $$('.rs-groups .chip', root).forEach(c => c.classList.toggle('on', c.dataset.f === st.f)); if (App.motionRender) App.motionRender($('#g-grid', root)); };
        bind(root, { 'g-filter': b => { st.f = b.dataset.f; paint(); } }); paint();
      }
      const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
    }
  };

  /* ---------- landing strip: three guides + link, rotating daily ---------- */
  App.guidesStrip = function () {
    const all = App.guidesFor(null); if (!all.length) return ''; const day = Math.floor(Date.now() / 86400000); const rd = settings().guidesRead || [];
    const unread = all.filter(g => !rd.includes(g.id)); const pool = unread.length >= 3 ? unread : all; const pick = [0, 1, 2].map(i => pool[(day + i * 5) % pool.length]).filter((g, i, a) => a.indexOf(g) === i);
    return `<section class="panel guides-strip"><div class="panel-h"><div class="panel-title">${icon('book')} Study smarter</div><div class="row gap-sm"><a class="btn xs" href="#/resources">${icon('link', 12)} Resources</a><a class="btn xs" href="#/guides">All guides ${icon('right', 11)}</a></div></div><div class="guide-grid">${pick.map(guideCard).join('')}</div></section>`;
  };
})(window);

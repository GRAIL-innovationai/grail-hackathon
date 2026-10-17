/* ============================================================
   Mathub — Discussions (a small Reddit-style board)
   Posts, threaded comments, votes, reports, moderation tools.
   Members only for reading bodies and posting; visitors see titles.
   Server: api/forum.php. Offline (no server): sample content, read-only.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, on, toast, typeset, pageHead } = App;
  const API = 'api/index.php?r=';
  const COURSE_META = () => { const m = { all: { short: 'All classes' }, general: { short: 'General', name: 'General / campus' } }; for (const id of App.COURSE_ORDER) if (global.Courses[id]) m[id] = { short: global.Courses[id].short, name: global.Courses[id].name }; return m; };
  const FLAIRS = { question: 'Question', discussion: 'Discussion', resource: 'Resource', 'study-group': 'Study group', exam: 'Exam', other: 'Other' };
  const F = { sort: 'hot', course: null, q: '', page: 0, posts: [], more: false, thread: null, filter: '' };
  const auth = () => App.auth || {};
  const user = () => auth().user || null;
  const offline = () => auth().mode === 'offline';
  const isMod = () => !!(user() && user().mod);
  const isAdmin = () => !!(user() && user().admin);

  async function api(route, body, method) {
    const opts = { method: method || (body ? 'POST' : 'GET'), credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Accept': 'application/json' }, cache: 'no-store' };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res, json; try { res = await fetch(API + route, opts); json = await res.json(); } catch (e) { throw new Error('Cannot reach the discussion server right now.'); }
    if (!json || json.ok === false) { const err = new Error((json && json.error) || 'Request failed.'); err.data = json; err.status = res.status; throw err; }
    return json;
  }

  /* ---------- profanity preview (mirror of api/filter.php; the server is authoritative) ---------- */
  const STRONG = ['fuck', 'fuk', 'shit', 'shite', 'bitch', 'cunt', 'asshole', 'arsehole', 'motherfuck', 'bullshit', 'dumbass', 'jackass', 'nigg', 'faggot', 'retard', 'pussy', 'pussies', 'whore', 'slut', 'wanker', 'twat', 'douche', 'bastard', 'goddamn', 'cocksuck', 'dickhead', 'dipshit', 'fucker', 'fag', 'tranny', 'wetback', 'dyke'];
  const WORD = ['ass', 'arse', 'cock', 'dick', 'chink', 'kike', 'damn', 'crap', 'piss', 'tits', 'cum', 'wtf', 'stfu', 'prick', 'gook', 'coon'];
  const wre = w => w[0] + '+' + w.slice(1).split('').map(c => `[${c}*]+`).join('');
  const STRONG_RE = new RegExp('(' + STRONG.map(wre).join('|') + ')'), WORD_RE = new RegExp('^(' + WORD.map(wre).join('|') + ')(?:s|es|ed|ing|er|ers)?$');
  const LEET = { '@': 'a', '4': 'a', '3': 'e', '1': 'i', '!': 'i', '|': 'i', '0': 'o', '$': 's', '5': 's', '7': 't', '+': 't' };
  const norm = s => s.toLowerCase().replace(/[@431!|0$57+]/g, c => LEET[c]).replace(/[^a-z*]/g, '').replace(/(.)\1{2,}/g, '$1$1');
  function censor(text) {
    return String(text || '').replace(/\S+/g, tok => { const m = /^([^\p{L}\p{N}*]*)(.*?)([^\p{L}\p{N}*]*)$/su.exec(tok); if (!m || !m[2]) return tok; const n = norm(m[2]); if (n.length < 2 || !(STRONG_RE.test(n) || WORD_RE.test(n))) return tok; return m[1] + m[2][0] + '*'.repeat(Math.max(1, [...m[2]].length - 1)) + m[3]; });
  }
  App.censor = censor;

  /* ---------- rendering helpers ---------- */
  function renderBody(text) {
    let s = esc(text);
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\n$]+)\*(?=[\s).,!?]|$)/g, '$1<i>$2</i>');
    s = s.replace(/(https?:\/\/[^\s<]+)/g, m => `<a href="${m}" target="_blank" rel="nofollow noopener ugc">${m}</a>`);
    return s.split(/\n{2,}/).map(p => { const lines = p.split('\n'); if (lines.every(l => /^&gt;\s?/.test(l))) return '<blockquote>' + lines.map(l => l.replace(/^&gt;\s?/, '')).join('<br>') + '</blockquote>'; return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; }).join('');
  }
  const timeAgo = ts => { const s = Math.max(0, Date.now() / 1000 - ts); if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; if (s < 86400 * 14) return `${Math.floor(s / 86400)}d ago`; const d = new Date(ts * 1000); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getDate()}`; };
  const courseChip = id => `<span class="chip course-${esc(id)}">${esc((COURSE_META()[id] || { short: id }).short)}</span>`;
  const flairChip = f => `<span class="chip flair flair-${esc(f)}">${esc(FLAIRS[f] || f)}</span>`;
  const authorHtml = (it, opBadge) => `<span class="fa-author${it.anon ? ' anon' : ''}${it.system ? ' system' : ''}">${it.anon ? icon('eye', 12) + ' ' : it.system ? icon('shield', 12) + ' ' : ''}${esc(it.author || 'Anonymous')}</span>${it.author_role ? `<span class="chip staff">${esc(it.author_role)}</span>` : ''}${opBadge && it.is_op ? '<span class="chip op">OP</span>' : ''}${isMod() && it.author_real && !it.system ? `<span class="fa-real" title="Only moderators see this">${esc(it.author_real)}</span>` : ''}`;
  const voteBox = (kind, it, disabled) => `<div class="fa-vote"><button class="fa-v up${it.vote > 0 ? ' on' : ''}" data-action="vote" data-kind="${kind}" data-id="${it.id}" data-v="${it.vote > 0 ? 0 : 1}" ${disabled ? 'disabled' : ''} aria-label="Upvote">${icon('up', 16)}</button><span class="fa-score${it.score < 0 ? ' neg' : ''}">${it.score}</span><button class="fa-v down${it.vote < 0 ? ' on' : ''}" data-action="vote" data-kind="${kind}" data-id="${it.id}" data-v="${it.vote < 0 ? 0 : -1}" ${disabled ? 'disabled' : ''} aria-label="Downvote">${icon('down', 16)}</button></div>`;
  const base = () => F.standalone ? '#/forum' : App.link('forum');
  const threadLink = id => base() + '/' + id;

  /* ---------- sample content for offline previews ---------- */
  const DEMO = (() => {
    const now = Math.floor(Date.now() / 1000);
    const posts = [
      { id: 1, course: 'calc', flair: 'question', title: 'How do you know when to use the chain rule vs the product rule?', body: 'I keep mixing these up on the WebWork. For $\\frac{d}{dx}\\,x^2\\sin(3x)$ I know it is product rule, but then $\\sin(3x)$ needs chain rule inside it too? How do you keep this straight under exam pressure?', anon: 0, author: 'j.morales', created: now - 5400, score: 14, ncomments: 3, pinned: 0, locked: 0, removed: 0, vote: 0, mine: false },
      { id: 2, course: 'physics', flair: 'study-group', title: 'Exam 1 study group, Sunday 4 pm, Roberts Hall lobby', body: 'A few of us from the Tuesday lab are meeting to go through the practice problems and the projectile stuff. Bring the formula sheet you made. Anyone welcome.', anon: 0, author: 'Priya', created: now - 26000, score: 22, ncomments: 5, pinned: 1, locked: 0, removed: 0, vote: 1, mine: false },
      { id: 3, course: 'precalc', flair: 'discussion', title: 'Does anyone else find the log properties easier once you write them as exponent rules?', body: 'Writing $\\log_b(xy) = \\log_b x + \\log_b y$ as "multiplying means adding exponents" finally made it click for me. Curious if that helps anyone else or if I am just weird.', anon: 1, author: 'Anonymous', created: now - 90000, score: 9, ncomments: 2, pinned: 0, locked: 0, removed: 0, vote: 0, mine: false },
      { id: 4, course: 'general', flair: 'resource', title: 'Math & Stat Center hours changed this week', body: 'Romney 220 is closing at 6 instead of 8 on Thursday and Friday because of the career fair. Plan accordingly if you were going to get WebWork help there.', anon: 0, author: 'tutor.sam', created: now - 200000, score: 31, ncomments: 1, pinned: 0, locked: 0, removed: 0, vote: 0, mine: false }
    ];
    const comments = { 1: [
      { id: 11, post_id: 1, parent_id: null, body: 'Think of it as layers. Product rule when two things are *multiplied*. Chain rule whenever there is a function *inside* another one. So $x^2\\sin(3x)$: product rule on the outside, and the derivative of $\\sin(3x)$ is $3\\cos(3x)$ by chain rule.', anon: 0, author: 'Priya', is_op: false, created: now - 5000, score: 9, removed: 0, vote: 0, mine: false },
      { id: 12, post_id: 1, parent_id: 11, body: 'This is the way. Write "outside times derivative of inside" on the top of your exam paper.', anon: 1, author: 'Anonymous', is_op: false, created: now - 4000, score: 3, removed: 0, vote: 0, mine: false },
      { id: 13, post_id: 1, parent_id: 11, body: 'Thanks, the layers idea helps a lot.', anon: 0, author: 'j.morales', is_op: true, created: now - 3500, score: 2, removed: 0, vote: 0, mine: false }
    ] };
    return { posts, comments };
  })();

  /* ---------- terms acceptance ---------- */
  async function ensureTerms() {
    const u = user(); if (!u) { auth().open('signup'); return false; }
    if (u.terms || offline()) return true;
    return new Promise(resolve => {
      const m = document.createElement('div'); m.className = 'modal-backdrop'; m.id = 'terms-modal';
      m.innerHTML = `<div class="modal auth-modal terms-modal" role="dialog" aria-label="Community rules"><div class="auth-head"><span class="logo-mark">${App.logoSvg(26)}</span><div><b>Before you post</b><div class="small muted">One-time agreement</div></div><button class="icon-btn" data-action="close" aria-label="Close">${icon('x', 16)}</button></div>
        <p class="small">Discussions are written by students, for students. To keep it useful and safe, every member agrees to the community rules:</p>
        <ul class="list small mt-1"><li><b>Be decent.</b> No harassment, hate, threats or targeting of individual people.</li><li><b>Nothing illegal.</b> No selling or seeking drugs, alcohol, weapons, stolen goods or anything else against the law. Posts like that are removed and may be reported.</li><li><b>Academic honesty.</b> Help each other learn; do not share exam questions or answers during an exam, and follow each course's policies.</li><li><b>You own your words.</b> You are responsible for what you post. Mathub can remove content and accounts at any time.</li><li><b>Language filter.</b> Curse words are censored automatically.</li></ul>
        <label class="check mt-2"><input type="checkbox" id="terms-ok"><span>I agree to the <a href="#/policy" target="_blank">Terms of Use, Community Rules and Privacy Policy</a>.</span></label>
        <div class="row gap-sm mt-2"><button class="btn primary" data-action="agree" disabled>Agree and continue</button><button class="btn" data-action="close">Not now</button></div><div class="auth-msg" id="terms-msg"></div></div>`;
      document.body.appendChild(m);
      const done = ok => { App.dismiss(m); resolve(ok); };
      $('#terms-ok', m).addEventListener('change', e => { $('[data-action="agree"]', m).disabled = !e.target.checked; });
      bind(m, { close: () => done(false), agree: async () => { try { const r = await api('terms_accept', {}); auth().user = r.user; done(true); } catch (e) { $('#terms-msg', m).textContent = e.message; } } });
      m.addEventListener('click', e => { if (e.target === m) done(false); });
    });
  }

  App.ensureTerms = ensureTerms;

  /* ---------- the view ---------- */
  App.views.forum = {
    title: 'Discussions',
    blurb: 'Ask questions, share resources and organize study groups with classmates.',
    render(root, param, query, standalone) {
      F.standalone = !!standalone; F.root = root;
      const ctx = standalone ? 'all' : (App.D ? App.D.id : 'general');
      if (F.course === null || F.lastCtx !== ctx) { F.course = ctx; F.lastCtx = ctx; F.page = 0; }
      if (query.course) F.course = query.course;
      const wrapOpen = standalone ? '<div class="landing-wrap forum-wrap">' : '', wrapClose = standalone ? '</div>' : '';
      const head = standalone ? `<header class="landing-top"><div><div class="eyebrow">Mathub</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Discussions</h1><p class="muted">${this.blurb}</p></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="#/">${icon('left', 14)} All classes</a><button class="icon-btn theme-btn" data-action="theme" aria-label="Toggle theme"></button></div></header>` : '';
      root.innerHTML = `${wrapOpen}${head}<div id="fa-root"></div>${wrapClose}`;
      const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
      const box = $('#fa-root', root);
      if (param === 'new') this.compose(box);
      else if (param === 'reports') this.reports(box);
      else if (param === 'admin') this.admin(box);
      else if (param === 'inbox') this.inbox(box);
      else if (param && /^\d+$/.test(param)) this.thread(box, +param);
      else this.list(box);
      bind(root, Object.assign({ theme: () => App.toggleTheme() }, this.actions(root)));
      if (App.auth) App.auth.bindLocks(root);
      if (!this.hooked && App.auth) { this.hooked = true; App.auth.onChange(() => { if (App.current === App.views.forum) App.rerender(); }); }
    },

    /* --- list --- */
    list(box) {
      const u = user(); const cm = COURSE_META();
      box.innerHTML = `${F.standalone ? '' : pageHead('Discussions', this.blurb, `<a class="btn primary" href="${base()}/new" data-action="new-post">${icon('pen', 14)} New post</a>`)}
        ${F.standalone ? `<div class="row between mb-2"><div></div><a class="btn primary" href="${base()}/new" data-action="new-post">${icon('pen', 14)} New post</a></div>` : ''}
        <div class="panel fa-toolbar"><div class="tabs" style="margin:0;border:0">${[['hot', 'Hot'], ['new', 'New'], ['top', 'Top']].map(([k, l]) => `<button class="tab${F.sort === k ? ' active' : ''}" data-action="sort" data-s="${k}">${l}</button>`).join('')}</div>
          <div class="chips">${['all', ...App.COURSE_ORDER.filter(id => global.Courses[id]), 'general'].map(id => `<span class="chip toggle${F.course === id ? ' on' : ''}" data-action="course" data-c="${id}">${esc(cm[id].short)}</span>`).join('')}</div>
          <input class="input" id="fa-q" placeholder="Search posts…" value="${esc(F.q)}" style="max-width:220px">
          <div class="chips fa-filters">${[['', 'All'], ['unanswered', 'Unanswered'], ['solved', 'Solved'], ['polls', 'Polls']].map(([k, l]) => `<span class="chip toggle${F.filter === k ? ' on' : ''}" data-action="filter" data-f="${k}">${l}</span>`).join('')}</div></div>
        <div id="fa-helpers"></div>
        ${!u ? App.lockCard('Read and join the discussions', 'Members can read every post, ask questions, answer classmates, vote and organize study groups. Visitors see titles only.', { compact: true }) : ''}
        ${offline() ? '<div class="callout small mb-2">Sample content: the discussion server is not reachable in this preview, so these posts are examples and posting is disabled.</div>' : ''}
        <div class="stack" id="fa-list"><div class="empty">Loading…</div></div><div class="row mt-2" id="fa-more" style="justify-content:center"></div>
        ${isMod() ? `<p class="small muted mt-2">${isAdmin() ? 'Administrator' : 'Moderator'}: <a href="${base()}/reports">report queue</a>${isAdmin() ? ` · <a href="${base()}/admin">admin panel</a>` : ''}.</p>` : ''}`;
      const q = $('#fa-q', box); let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { F.q = q.value.trim(); F.page = 0; this.loadList(box); }, 350); });
      this.loadList(box);
      if (u && !offline()) api('helpers').then(r => { const h = $('#fa-helpers', box); if (!h) return; const rows = r.week.length ? r.week : r.all; if (!rows.length) return; h.innerHTML = `<div class="panel helpers mb-2"><div class="panel-h"><div class="panel-title">${icon('shield')} Helpers ${r.week.length ? 'this week' : 'of all time'}</div><span class="small muted">accepted answers and upvotes</span></div><div class="helper-row">${rows.slice(0, 6).map((x, i) => `<span class="helper"><span class="rank">${i + 1}</span><b>${esc(x.name)}</b>${x.role ? `<span class="chip staff">${esc(x.role)}</span>` : ''}<span class="muted small">${x.points} pts${x.accepted ? ` · ${x.accepted} accepted` : ''}</span></span>`).join('')}</div></div>`; }).catch(() => {});
    },
    async loadList(box, append) {
      const listEl = $('#fa-list', box); if (!listEl) return;
      if (offline()) { const posts = DEMO.posts.filter(p => F.course === 'all' || p.course === F.course).filter(p => !F.q || (p.title + p.body).toLowerCase().includes(F.q.toLowerCase())); F.posts = posts; F.more = false; this.paintList(box, false, !user()); return; }
      try {
        const r = await api(`forum_posts&course=${encodeURIComponent(F.course)}&sort=${F.sort}&q=${encodeURIComponent(F.q)}&page=${F.page}&filter=${F.filter}`);
        F.posts = append ? F.posts.concat(r.posts) : r.posts; F.more = r.more; this.paintList(box, false, r.guest);
      } catch (e) { listEl.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },
    paintList(box, _, guest) {
      const listEl = $('#fa-list', box); const moreEl = $('#fa-more', box); if (!listEl) return;
      listEl.innerHTML = F.posts.length ? F.posts.map(p => this.postCard(p, guest)).join('') : `<div class="empty">No posts here yet.${user() ? ' Be the first: ask a question or share something useful.' : ''}</div>`;
      if (moreEl) moreEl.innerHTML = F.more ? `<button class="btn" data-action="more">Load more</button>` : '';
      typeset(listEl);
    },
    postCard(p, guest) {
      const link = threadLink(p.id);
      return `<article class="fa-post${p.pinned ? ' pinned' : ''}" id="fp-${p.id}">${voteBox('p', p, guest || offline())}
        <div class="fa-main"><div class="fa-meta">${courseChip(p.course)}${flairChip(p.flair)}${p.accepted_id ? `<span class="chip good">${icon('check', 11)} Solved</span>` : ''}${p.has_poll ? `<span class="chip poll">${icon('list', 11)} Poll</span>` : ''}${p.pinned ? `<span class="chip good">${icon('pin', 11)} Pinned</span>` : ''}${p.locked ? `<span class="chip warn">${icon('lock', 11)} Locked</span>` : ''}${guest ? '' : `<span class="sep">·</span>${authorHtml(p)}`}<span class="sep">·</span><span class="muted">${timeAgo(p.created)}</span></div>
          <h2 class="fa-title">${guest ? `<a href="#" data-action="need-login">${esc(p.title)}</a>` : `<a href="${link}">${esc(p.title)}</a>`}</h2>
          ${guest ? '' : `<div class="fa-preview">${esc(p.body.slice(0, 260))}${p.body.length > 260 ? '…' : ''}</div>`}
          <div class="fa-actions"><a href="${guest ? '#' : link}" ${guest ? 'data-action="need-login"' : ''}>${icon('chat', 14)} ${p.ncomments} comment${p.ncomments === 1 ? '' : 's'}</a><button class="fa-act" data-action="share" data-id="${p.id}">${icon('link', 13)} Share</button>${!guest && !p.mine ? `<button class="fa-act" data-action="report" data-kind="p" data-id="${p.id}">${icon('flag', 13)} Report</button>${p.system ? '' : `<button class="fa-act" data-action="block" data-kind="p" data-id="${p.id}"${p.anon ? ' data-anon="1"' : ''}>${icon('x', 13)} Block</button>`}` : ''}</div></div></article>`;
    },

    /* --- thread --- */
    async thread(box, id) {
      box.innerHTML = `<div class="fa-back"><a href="${base()}">${icon('left', 14)} All discussions</a></div><div id="fa-thread"><div class="empty">Loading…</div></div>`;
      const el = $('#fa-thread', box);
      if (!user()) { el.innerHTML = App.lockCard('Sign in to read this discussion', 'Posts and comments are visible to members only. Sign up free with your montana.edu email.'); return; }
      let data;
      if (offline()) { const p = DEMO.posts.find(x => x.id === id); if (!p) { el.innerHTML = '<div class="empty">Sample post not found.</div>'; return; } data = { post: p, comments: DEMO.comments[id] || [], mod: false, banned: 0, terms: true }; }
      else { try { data = await api('forum_post&id=' + id); } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; } }
      F.thread = data; this.paintThread(el);
      if (!offline() && user() && user().unread) api('notif_read', { post_id: id }).then(r => { if (auth().setUnread) auth().setUnread(r.unread); }).catch(() => {});
    },
    paintThread(el) {
      const d = F.thread; const p = d.post; const ro = offline();
      const canComment = user() && !p.locked && !p.removed && !ro;
      const modTools = isMod() && !ro ? `<span class="fa-mod">${icon('shield', 13)} <button class="fa-act" data-action="mod" data-a="${p.pinned ? 'unpin' : 'pin'}" data-kind="p" data-id="${p.id}">${p.pinned ? 'Unpin' : 'Pin'}</button><button class="fa-act" data-action="mod" data-a="${p.locked ? 'unlock' : 'lock'}" data-kind="p" data-id="${p.id}">${p.locked ? 'Unlock' : 'Lock'}</button><button class="fa-act" data-action="mod" data-a="${p.removed === 2 ? 'restore' : 'remove'}" data-kind="p" data-id="${p.id}">${p.removed === 2 ? 'Restore' : 'Remove'}</button><button class="fa-act" data-action="ban" data-kind="p" data-id="${p.id}">Ban author</button>${isAdmin() ? `<button class="fa-act danger" data-action="purge" data-kind="p" data-id="${p.id}">Delete permanently</button>` : ''}</span>` : '';
      el.innerHTML = `<article class="fa-post full${p.pinned ? ' pinned' : ''}" id="fp-${p.id}">${voteBox('p', p, ro || p.removed)}
          <div class="fa-main"><div class="fa-meta">${courseChip(p.course)}${flairChip(p.flair)}${p.pinned ? `<span class="chip good">${icon('pin', 11)} Pinned</span>` : ''}${p.locked ? `<span class="chip warn">${icon('lock', 11)} Locked</span>` : ''}<span class="sep">·</span>${authorHtml(p)}<span class="sep">·</span><span class="muted">${timeAgo(p.created)}${p.edited ? ' · edited' : ''}</span></div>
            <h2 class="fa-title big">${esc(p.title)}</h2>
            <div class="fa-body" id="fa-post-body">${p.removed ? `<p class="muted"><i>${esc(p.title)}</i>${isMod() && p.body_real ? `<div class="fa-real-body mt-1"><div class="eyebrow">Original (moderators only)</div>${renderBody(p.body_real)}</div>` : ''}</p>` : renderBody(p.body)}</div>
            ${d.poll ? this.pollHtml(d.poll) : ''}
            <div class="fa-actions"><span>${icon('chat', 14)} ${p.ncomments} comment${p.ncomments === 1 ? '' : 's'}</span>${p.accepted_id ? `<span class="chip good">${icon('check', 11)} Solved</span>` : ''}<span id="fa-here" class="small muted"></span><button class="fa-act" data-action="share" data-id="${p.id}">${icon('link', 13)} Share</button>${p.mine && !p.removed && !ro ? `<button class="fa-act" data-action="edit-post">${icon('pen', 13)} Edit</button><button class="fa-act" data-action="delete-post">${icon('trash', 13)} Delete</button>` : ''}${!p.mine && !ro ? `<button class="fa-act" data-action="report" data-kind="p" data-id="${p.id}">${icon('flag', 13)} Report</button>${p.system ? '' : `<button class="fa-act" data-action="block" data-kind="p" data-id="${p.id}"${p.anon ? ' data-anon="1"' : ''}>${icon('x', 13)} Block</button>`}` : ''}${modTools}</div>
            <div id="fa-edit-post"></div></div></article>
        <div class="panel fa-compose-comment">${canComment ? `<div class="eyebrow mb-1">Add a comment</div><textarea class="input" id="fa-comment" rows="3" placeholder="Be specific. $…$ works for math, **bold**, *italic*, > quote."></textarea><div class="row between mt-1"><label class="check small" style="padding:0"><input type="checkbox" id="fa-comment-anon"><span>Post anonymously</span></label><button class="btn primary sm" data-action="submit-comment">${icon('chat', 13)} Post comment</button></div>` : ro ? '<div class="small muted">Commenting is disabled in this preview.</div>' : p.locked ? `<div class="small muted">${icon('lock', 13)} This post is locked. No new comments.</div>` : '<div class="small muted">This post was removed.</div>'}${d.banned ? `<div class="callout warn small mt-2">Your posting access is paused until ${new Date(d.banned * 1000).toLocaleDateString()}.</div>` : ''}</div>
        <div class="fa-comments" id="fa-comments">${this.commentsHtml(d.comments)}</div>`;
      typeset(el); if (App.social && App.social.presencePing) setTimeout(App.social.presencePing, 100);
    },
    pollHtml(poll) {
      const total = poll.voters; const voted = poll.mine.length > 0; const u = user();
      return `<div class="poll" id="fa-poll" data-id="${poll.id}">${poll.question ? `<div class="poll-q">${icon('list', 14)} ${esc(poll.question)}</div>` : ''}
        <div class="poll-opts">${poll.options.map((o, i) => { const pct = total ? Math.round(100 * o.votes / total) : 0; const mine = poll.mine.includes(i); return voted || !u || offline() ? `<div class="poll-opt${mine ? ' mine' : ''}"><div class="poll-bar" style="width:${pct}%"></div><span class="poll-label">${esc(o.text)}${mine ? ` ${icon('check', 12)}` : ''}</span><span class="poll-pct">${pct}% · ${o.votes}</span></div>` : `<button class="poll-opt choose" data-action="poll-pick" data-i="${i}"><span class="poll-label">${esc(o.text)}</span></button>`; }).join('')}</div>
        <div class="poll-foot small muted">${total} vote${total === 1 ? '' : 's'} · anonymous${poll.multi ? ' · pick several' : ''}${voted ? ' · <button class="fa-act" data-action="poll-change">change vote</button>' : poll.multi && u ? ' · <button class="btn xs primary" data-action="poll-submit">Vote</button>' : ''}</div></div>`;
    },
    commentsHtml(list) {
      const byParent = {}; list.forEach(c => { (byParent[c.parent_id || 0] = byParent[c.parent_id || 0] || []).push(c); });
      Object.values(byParent).forEach(arr => arr.sort((a, b) => ((b.accepted ? 1 : 0) - (a.accepted ? 1 : 0)) || (b.score - a.score) || (a.created - b.created)));
      const ro = offline(); const p = F.thread.post; const canAccept = user() && !ro && !p.removed && (p.mine || isMod());
      const node = (c, depth) => {
        const kids = byParent[c.id] || [];
        const acts = c.removed || c.blocked ? '' : `${!ro && !p.locked ? `<button class="fa-act" data-action="reply" data-id="${c.id}">${icon('reply', 12)} Reply</button>` : ''}${c.mine && !ro ? `<button class="fa-act" data-action="edit-comment" data-id="${c.id}">Edit</button><button class="fa-act" data-action="delete-comment" data-id="${c.id}">Delete</button>` : ''}${!c.mine && !ro ? `<button class="fa-act" data-action="report" data-kind="c" data-id="${c.id}">Report</button><button class="fa-act" data-action="block" data-kind="c" data-id="${c.id}"${c.anon ? ' data-anon="1"' : ''}>Block</button>` : ''}${isMod() && !ro ? `<span class="fa-mod">${icon('shield', 12)} <button class="fa-act" data-action="mod" data-a="remove" data-kind="c" data-id="${c.id}">Remove</button><button class="fa-act" data-action="ban" data-kind="c" data-id="${c.id}">Ban</button>${isAdmin() ? `<button class="fa-act danger" data-action="purge" data-kind="c" data-id="${c.id}">Delete permanently</button>` : ''}</span>` : ''}`;
        return `<div class="fa-comment${c.removed || c.blocked ? ' removed' : ''}${c.accepted ? ' accepted' : ''}" id="fc-${c.id}" style="--depth:${Math.min(depth, 8)}">
          <div class="fa-c-head"><button class="fa-collapse" data-action="collapse" data-id="${c.id}" aria-label="Collapse">[−]</button>${c.blocked ? '<span class="fa-author">Blocked member</span>' : authorHtml(c, true)}<span class="sep">·</span><span class="muted">${timeAgo(c.created)}${c.edited ? ' · edited' : ''}</span>${c.accepted ? `<span class="chip good">${icon('check', 11)} Accepted answer</span>` : ''}${canAccept && !c.removed && !c.parent_id ? `<button class="fa-act accept" data-action="accept" data-id="${c.id}" title="${c.accepted ? 'Un-accept' : 'Mark as the answer that solved it'}">${icon('check', 12)} ${c.accepted ? 'Un-accept' : 'Accept'}</button>` : ''}${isMod() && c.removed === 2 ? `<button class="fa-act" data-action="mod" data-a="restore" data-kind="c" data-id="${c.id}">Restore</button>` : ''}</div>
          <div class="fa-c-body" id="fcb-${c.id}">${c.blocked ? '<i class="muted">Hidden because you blocked this member.</i>' : c.removed ? `<i class="muted">${esc(c.body)}</i>${isMod() && c.body_real ? `<div class="fa-real-body mt-1">${renderBody(c.body_real)}</div>` : ''}` : renderBody(c.body)}</div>
          <div class="fa-c-actions">${c.removed || c.blocked ? '' : voteBox('c', c, ro)}${acts}</div>
          <div class="fa-c-reply" id="fcr-${c.id}"></div>
          <div class="fa-c-children">${kids.map(k => node(k, depth + 1)).join('')}</div></div>`;
      };
      const roots = byParent[0] || [];
      return roots.length ? roots.map(c => node(c, 0)).join('') : '<div class="empty">No comments yet. Start the discussion.</div>';
    },

    /* --- compose --- */
    compose(box) {
      const cm = COURSE_META(); const u = user();
      if (!u) { box.innerHTML = `<div class="fa-back"><a href="${base()}">${icon('left', 14)} All discussions</a></div>` + App.lockCard('Sign in to post', 'Create a free account with your montana.edu email to ask questions and start discussions.'); return; }
      if (offline()) { box.innerHTML = `<div class="fa-back"><a href="${base()}">${icon('left', 14)} All discussions</a></div><div class="empty">Posting needs the discussion server, which is not reachable in this preview.</div>`; return; }
      const defCourse = F.course && F.course !== 'all' ? F.course : (App.D ? App.D.id : 'general');
      box.innerHTML = `<div class="fa-back"><a href="${base()}">${icon('left', 14)} All discussions</a></div>${pageHead('New post', 'Good posts get good answers: say what you tried, quote the exact problem, and pick the right class.')}
        <div class="grid cols-3"><div class="panel span-2 stack">
          <div class="field"><label for="fa-title">Title</label><input class="input" id="fa-title" maxlength="140" placeholder="e.g. Stuck on WebWork 2.3 #7: why is the derivative negative here?"></div>
          <div class="grid cols-2" style="gap:12px"><div class="field"><label for="fa-course">Class</label><select class="select" id="fa-course">${[...App.COURSE_ORDER.filter(id => global.Courses[id]), 'general'].map(id => `<option value="${id}"${id === defCourse ? ' selected' : ''}>${esc(cm[id].name || cm[id].short)}</option>`).join('')}</select></div><div class="field"><label for="fa-flair">Type</label><select class="select" id="fa-flair">${Object.entries(FLAIRS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div></div>
          <div class="field"><label for="fa-body">Body</label><textarea class="input" id="fa-body" rows="10" placeholder="Explain the problem. Paste the exact question if you can."></textarea><span class="help">Plain text. <code>**bold**</code>, <code>*italic*</code>, <code>\`code\`</code>, <code>&gt; quote</code>, and <code>$…$</code> for math (LaTeX). Curse words are censored automatically.</span></div>
          <label class="check" style="padding:0"><input type="checkbox" id="fa-anon"><span>Post anonymously <span class="muted small">(classmates see “Anonymous”; moderators can still see who posted)</span></span></label>
          <label class="check" style="padding:0"><input type="checkbox" id="fa-poll-on"><span>Add a poll <span class="muted small">(votes are anonymous)</span></span></label>
          <div id="fa-poll-fields" class="poll-fields hidden"><div class="field"><label for="fa-poll-q">Poll question (optional)</label><input class="input" id="fa-poll-q" maxlength="140" placeholder="e.g. Which topic should the review session focus on?"></div><div class="grid cols-2" style="gap:8px">${[1, 2, 3, 4].map(i => `<input class="input" id="fa-poll-o${i}" maxlength="80" placeholder="Option ${i}${i > 2 ? ' (optional)' : ''}">`).join('')}</div><label class="check small mt-1" style="padding:0"><input type="checkbox" id="fa-poll-multi"><span>Allow picking several options</span></label></div>
          <div class="row gap-sm"><button class="btn primary" data-action="submit-post">${icon('pen', 14)} Post</button><button class="btn" data-action="preview-post">${icon('eye', 14)} Preview</button><span class="small muted">By posting you agree to the <a href="#/policy" target="_blank">community rules</a>.</span></div>
          <div id="fa-post-preview"></div></div>
          <div class="stack"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('bulb')} Tips</div></div><ul class="list small"><li>One question per post.</li><li>Include the section or problem number.</li><li>Show your attempt: people help faster when they can see where you got stuck.</li><li>Math renders: <code>$x^2$</code> becomes $x^2$.</li></ul></div>
          <div class="panel"><div class="panel-h"><div class="panel-title">${icon('shield')} Rules in short</div></div><ul class="list small"><li>Be decent. No harassment or hate.</li><li>Nothing illegal, ever.</li><li>No exam answers during exams.</li><li>Moderators can remove anything.</li></ul><a class="small" href="#/policy" target="_blank">Full terms and privacy policy</a></div></div></div>`;
      typeset(box);
      const pon = $('#fa-poll-on', box); if (pon) pon.addEventListener('change', () => $('#fa-poll-fields', box).classList.toggle('hidden', !pon.checked));
    },

    /* --- moderator report queue --- */
    async reports(box) {
      box.innerHTML = `<div class="fa-back"><a href="${base()}">${icon('left', 14)} All discussions</a></div>${pageHead('Report queue', 'Open reports from members, newest first. Removing an item or banning its author closes its reports.')}<div id="fa-rep"><div class="empty">Loading…</div></div>`;
      const el = $('#fa-rep', box);
      if (!isMod()) { el.innerHTML = '<div class="empty">Moderators only.</div>'; return; }
      try {
        const r = await api('forum_reports');
        el.innerHTML = `<div class="panel"><div class="panel-h"><div class="panel-title">${icon('flag')} Open reports</div><span class="chip">${r.reports.length}</span></div>
          ${r.reports.length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Item</th><th>Reason</th><th>Author</th><th></th></tr></thead><tbody>${r.reports.map(x => `<tr><td><span class="chip">${x.kind === 'p' ? 'post' : 'comment'}</span> <a href="${threadLink(x.post_id)}">${esc(x.snippet.slice(0, 110))}${x.snippet.length > 110 ? '…' : ''}</a>${x.removed ? ' <span class="chip bad">removed</span>' : ''}</td><td class="small">${esc(x.reason)}<div class="muted">by ${esc(x.reporter)} · ${timeAgo(x.created)}</div></td><td class="small mono">${esc(x.author)}</td><td><div class="row gap-sm" style="flex-wrap:nowrap">${x.removed ? '' : `<button class="btn xs danger" data-action="mod" data-a="remove" data-kind="${x.kind}" data-id="${x.item_id}" data-refresh="reports">Remove</button>`}<button class="btn xs" data-action="ban" data-kind="${x.kind}" data-id="${x.item_id}" data-refresh="reports">Ban</button>${isAdmin() ? `<button class="btn xs danger ghost" data-action="purge" data-kind="${x.kind}" data-id="${x.item_id}" data-refresh="reports">Delete</button>` : ''}<button class="btn xs ghost" data-action="mod" data-a="resolve" data-report="${x.id}" data-refresh="reports">Dismiss</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nothing reported. Nice community.</div>'}</div>
          <div class="panel mt-2"><div class="panel-h"><div class="panel-title">${icon('lock')} Active bans</div></div>${r.bans.length ? `<div class="table-wrap"><table class="table compact"><tbody>${r.bans.map(b => `<tr><td class="mono small">${esc(b.email)}</td><td class="small">until ${new Date(b.until * 1000).toLocaleDateString()}${b.reason ? ' · ' + esc(b.reason) : ''}</td><td><button class="btn xs" data-action="mod" data-a="unban" data-user="${b.user_id}" data-refresh="reports">Unban</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No active bans.</div>'}</div>`;
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },

    /* --- inbox --- */
    async inbox(box) {
      box.innerHTML = `<div class="fa-back"><a href="${base()}">${icon('left', 14)} All discussions</a></div>${pageHead('Inbox', 'Replies to your posts and comments.', `<button class="btn sm" data-action="read-all">${icon('check', 13)} Mark all read</button>`)}<div id="fa-inbox"><div class="empty">Loading…</div></div>`;
      const el = $('#fa-inbox', box);
      if (!user()) { el.innerHTML = App.lockCard('Sign in to see your inbox', 'Members get a notification whenever someone answers their post or replies to their comment.'); return; }
      if (offline()) { el.innerHTML = '<div class="empty">The inbox needs the discussion server, which is not reachable right now.</div>'; return; }
      try {
        const r = await api('notif_list'); if (auth().setUnread) auth().setUnread(r.unread);
        el.innerHTML = r.notifications.length ? `<div class="panel" style="padding:6px 8px">${r.notifications.map(n => `<a class="inbox-row${n.read ? '' : ' unread'}" href="${n.kind === 'badge' ? '#/badges' : ['issue', 'classreq', 'classreq_admin', 'class', 'class_assign', 'teach', 'teach_admin', 'plan'].includes(n.kind) ? esc(/^#\//.test(n.link || '') ? n.link : '#/') : threadLink(n.post_id)}" data-action="open-notif" data-id="${n.id}"><span class="inbox-dot"></span><div class="inbox-body"><div><b>${esc(n.actor)}</b> ${n.kind === 'issue' ? 'resolved your report' : n.kind === 'class' ? 'posted in your class:' : n.kind === 'class_assign' ? 'assigned practice:' : n.kind === 'teach' ? 'updated your teaching access:' : n.kind === 'teach_admin' ? 'asked for instructor access:' : n.kind === 'classreq' ? 'updated your class request for' : n.kind === 'classreq_admin' ? 'requested a class:' : n.kind === 'badge' ? 'awarded you' : n.kind === 'plan' ? 'gave you' : n.kind === 'reply' ? 'replied to your comment on' : n.kind === 'accepted' ? 'accepted your answer on' : 'commented on your post'} <b>${esc(n.title)}</b></div><div class="small muted">${esc(n.snippet)}</div></div><span class="small muted">${timeAgo(n.created)}</span></a>`).join('')}</div>` : '<div class="empty">Nothing yet. When someone answers one of your posts, it shows up here.</div>';
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },

    /* --- administrator panel --- */
    async admin(box, q, page) {
      if (App.views.admin && App.views.admin !== this) { location.hash = '#/admin'; return; }
      box.innerHTML = `<div class="fa-back"><a href="${base()}">${icon('left', 14)} All discussions</a> <span class="sep muted">·</span> <a href="${base()}/reports">Report queue</a></div>${pageHead('Admin panel', 'Site overview and member management. You can ban, unban or delete any account, and permanently delete any post or comment from its thread.')}<div id="fa-admin"><div class="empty">Loading…</div></div>`;
      const el = $('#fa-admin', box);
      if (!isAdmin()) { el.innerHTML = '<div class="empty">Administrators only.</div>'; return; }
      try {
        const [st, us] = await Promise.all([api('admin_stats'), api('admin_users&q=' + encodeURIComponent(q || '') + '&page=' + (page || 0))]);
        const stat = (n, l) => `<div class="stat"><div class="stat-num">${n}</div><div class="stat-label">${l}</div></div>`;
        el.innerHTML = `<div class="grid cols-4 mb-2">${stat(st.users, 'members')}${stat(st.active_7d, 'active this week')}${stat(st.posts, 'posts')}${stat(st.comments, 'comments')}${stat(st.reports, 'open reports')}${stat(st.bans, 'active bans')}${stat(st.removed, 'removed items')}${stat(st.pending, 'unverified sign-ups')}</div>
          <div class="panel mb-2"><div class="panel-h"><div class="panel-title">${icon('canvas')} Site settings</div></div>
            <div class="field"><label for="adm-canvas">Canvas calendar feed URL</label><div class="row gap-sm"><input class="input mono" id="adm-canvas" placeholder="https://montana.instructure.com/feeds/calendars/user_….ics" value="${esc(st.settings.canvas_feed || '')}" ${st.settings.canvas_from_config ? 'disabled' : ''} style="flex:1;min-width:240px"><button class="btn sm primary" data-action="save-setting" data-k="canvas_feed" data-i="adm-canvas" ${st.settings.canvas_from_config ? 'disabled' : ''}>Save &amp; sync</button></div><span class="help">${st.settings.canvas_from_config ? 'Set in api/config.php, so it cannot be changed here.' : 'In Canvas: Calendar → “Calendar Feed” → copy the link. Due dates for the mapped classes then show on every dashboard, refreshed hourly.'} ${st.settings.canvas.configured ? `Last sync: ${st.settings.canvas.fetched ? timeAgo(st.settings.canvas.fetched) : 'never'} · ${st.settings.canvas.count} events${st.settings.canvas.error ? ` · <span style="color:var(--bad)">${esc(st.settings.canvas.error)}</span>` : ''}` : ''}</span></div>
            <div class="field mt-2"><label for="adm-ann">Announcement banner (shown on the landing page and dashboards; leave empty to hide)</label><div class="row gap-sm"><input class="input" id="adm-ann" maxlength="240" value="${esc(st.settings.announcement || '')}" style="flex:1;min-width:240px"><button class="btn sm" data-action="save-setting" data-k="announcement" data-i="adm-ann">Save</button></div></div></div>
          <div class="panel mb-2"><div class="panel-h"><div class="panel-title">${icon('shield')} Staff</div><span class="small muted">edit <code>moderators</code> / <code>admins</code> in api/config.php</span></div><div class="row gap-sm">${st.moderators.map(m => `<span class="chip ${st.admins.includes(m) ? 'accent' : ''}">${esc(m)}${st.admins.includes(m) ? ' · admin' : ''}</span>`).join('')}</div></div>
          <div class="panel"><div class="panel-h"><div class="panel-title">${icon('info')} Members</div><input class="input" id="fa-admin-q" placeholder="Search email or name…" value="${esc(q || '')}" style="max-width:260px"></div>
            <div class="table-wrap"><table class="table compact"><thead><tr><th>Member</th><th>Joined</th><th class="num">Posts</th><th class="num">Comments</th><th>Status</th><th></th></tr></thead><tbody>${us.users.map(x => `<tr><td><div><b>${esc(x.name || x.email.split('@')[0])}</b>${x.admin ? ' <span class="chip accent">admin</span>' : x.mod ? ' <span class="chip">mod</span>' : ''}</div><div class="mono small muted">${esc(x.email)}</div></td><td class="small">${new Date(x.created * 1000).toLocaleDateString()}<div class="muted">last login ${x.last_login ? timeAgo(x.last_login) : 'never'}</div></td><td class="num">${x.posts}</td><td class="num">${x.comments}</td><td class="small">${!x.verified ? '<span class="chip warn">unverified</span>' : x.banned_until ? `<span class="chip bad">banned until ${new Date(x.banned_until * 1000).toLocaleDateString()}</span>` : '<span class="chip good">active</span>'}${x.terms ? '' : ' <span class="chip">no rules yet</span>'}</td><td><div class="row gap-sm" style="flex-wrap:nowrap;justify-content:flex-end">${x.admin ? '' : `${x.banned_until ? `<button class="btn xs" data-action="admin-user" data-a="unban" data-u="${x.id}">Unban</button>` : `<button class="btn xs" data-action="admin-user" data-a="ban" data-u="${x.id}">Ban</button>`}${!x.verified ? `<button class="btn xs" data-action="admin-user" data-a="verify" data-u="${x.id}">Verify</button>` : ''}<button class="btn xs danger ghost" data-action="admin-user" data-a="delete" data-u="${x.id}" data-e="${esc(x.email)}">Delete</button>`}</div></td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">No members match.</div></td></tr>'}</tbody></table></div>
            ${us.more ? `<div class="row mt-2" style="justify-content:center"><button class="btn" data-action="admin-page" data-p="${(page || 0) + 1}" data-q="${esc(q || '')}">Next page</button></div>` : ''}</div>`;
        const inp = $('#fa-admin-q', el); let t; inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => this.admin(box, inp.value.trim(), 0), 350); });
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },

    /* --- actions --- */
    actions(root) {
      const self = this; const V = () => $('#fa-root', root);
      const refreshThread = async () => { const d = await api('forum_post&id=' + F.thread.post.id); F.thread = d; self.paintThread($('#fa-thread', root)); };
      return {
        sort: el => { F.sort = el.dataset.s; F.page = 0; self.list(V()); },
        filter: el => { F.filter = el.dataset.f; F.page = 0; self.list(V()); },
        'poll-pick': async el => { const poll = F.thread.poll; if (!poll) return; if (poll.multi) { el.classList.toggle('picked'); return; } try { const r = await api('poll_vote', { poll_id: poll.id, options: [+el.dataset.i] }); F.thread.poll = r.poll; $('#fa-poll', root).outerHTML = self.pollHtml(r.poll); toast('Vote counted'); } catch (e) { toast(e.message, 3000); } },
        'poll-submit': async () => { const poll = F.thread.poll; const picks = $$('#fa-poll .poll-opt.picked', root).map(b => +b.dataset.i); if (!picks.length) { toast('Pick at least one option.'); return; } try { const r = await api('poll_vote', { poll_id: poll.id, options: picks }); F.thread.poll = r.poll; $('#fa-poll', root).outerHTML = self.pollHtml(r.poll); toast('Vote counted'); } catch (e) { toast(e.message, 3000); } },
        'poll-change': () => { const poll = F.thread.poll; poll.mine = []; $('#fa-poll', root).outerHTML = self.pollHtml(poll); },
        accept: async el => { try { const r = await api('forum_accept', { post_id: F.thread.post.id, comment_id: +el.dataset.id }); toast(r.accepted_id ? 'Marked as the accepted answer' : 'Accepted answer removed'); await refreshThread(); } catch (e) { toast(e.message, 3000); } },
        course: el => { F.course = el.dataset.c; F.page = 0; self.list(V()); },
        more: () => { F.page++; self.loadList(V(), true); },
        'need-login': (el, e) => { e.preventDefault(); auth().open('signup'); },
        'new-post': (el, e) => { if (!user()) { e.preventDefault(); auth().open('signup'); } },
        share: el => { const url = App.siteBase() + threadLink(+el.dataset.id); const ok = () => toast('Link copied'); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, () => prompt('Copy this link:', url)); else prompt('Copy this link:', url); },
        vote: async el => {
          if (!user()) { auth().open('signup'); return; }
          const kind = el.dataset.kind, id = +el.dataset.id, value = +el.dataset.v;
          try { const r = await api('forum_vote', { kind, id, value }); const it = kind === 'p' ? (F.thread && F.thread.post.id === id ? F.thread.post : F.posts.find(p => p.id === id)) : F.thread.comments.find(c => c.id === id); if (it) { it.score = r.score; it.vote = r.vote; } const boxEl = el.closest('.fa-vote'); if (boxEl) { const tmp = document.createElement('div'); tmp.innerHTML = voteBox(kind, it || { id, score: r.score, vote: r.vote }); boxEl.replaceWith(tmp.firstElementChild); } } catch (e) { toast(e.message, 3000); }
        },
        report: async el => {
          if (!user()) { auth().open('signup'); return; }
          const reason = prompt('What is wrong with this ' + (el.dataset.kind === 'p' ? 'post' : 'comment') + '? (harassment, illegal content, spam, exam cheating, other)'); if (!reason) return;
          try { const r = await api('forum_report', { kind: el.dataset.kind, id: +el.dataset.id, reason }); toast(r.message || 'Reported'); } catch (e) { toast(e.message, 3000); }
        },
        /* App Store guideline 1.2: blocking hides the member's posts, comments and notifications at once and tells the moderators */
        block: async el => {
          if (!user()) { auth().open('signup'); return; }
          const what = el.dataset.kind === 'p' ? 'post' : 'comment';
          const msg = el.dataset.anon ? `Block the anonymous member who wrote this ${what}?\n\nYou will stop seeing what they post anonymously, and their anonymous replies will not notify you. Their name stays hidden, from you too. The ${what} also goes to the moderators to check. You can unblock any time in Settings.`
            : `Block the member who wrote this ${what}?\n\nYou will stop seeing their posts, comments, study sessions and notifications. They are not told. The ${what} also goes to the moderators to check. You can unblock them any time in Settings.`;
          if (!confirm(msg)) return;
          try {
            const r = await api('forum_block', { kind: el.dataset.kind, id: +el.dataset.id }); toast(r.message || 'Blocked', 3500);
            if (F.thread && $('#fa-thread', root)) { if (el.dataset.kind === 'p') location.hash = base(); else await refreshThread(); }
            else self.list(V());
          } catch (e) { toast(e.message, 3000); }
        },
        'submit-post': async () => {
          if (!(await ensureTerms())) return;
          const title = $('#fa-title', root).value.trim(), body = $('#fa-body', root).value.trim(), course = $('#fa-course', root).value, flair = $('#fa-flair', root).value, anon = $('#fa-anon', root).checked;
          if (title.length < 3) { toast('Give the post a title.'); $('#fa-title', root).focus(); return; } if (!body) { toast('Write something in the body.'); $('#fa-body', root).focus(); return; }
          const btn = $('[data-action="submit-post"]', root); btn.disabled = true;
          const pollOn = $('#fa-poll-on', root) && $('#fa-poll-on', root).checked; const poll = pollOn ? { question: $('#fa-poll-q', root).value, options: [1, 2, 3, 4].map(i => $('#fa-poll-o' + i, root).value.trim()).filter(Boolean), multi: $('#fa-poll-multi', root).checked } : null;
          if (poll && poll.options.length < 2) { toast('A poll needs at least two options.'); btn.disabled = false; return; }
          try { const r = await api('forum_post_create', { title, body, course, flair, anon, poll }); toast('Posted'); F.course = course; F.sort = 'new'; location.hash = threadLink(r.post.id); } catch (e) { btn.disabled = false; if (e.data && e.data.terms === false) { auth().user.terms = false; } toast(e.message, 3500); }
        },
        'preview-post': () => { const title = $('#fa-title', root).value, body = $('#fa-body', root).value; const pv = $('#fa-post-preview', root); pv.innerHTML = `<div class="divider"></div><div class="eyebrow mb-1">Preview</div><div class="fa-post full" style="border-style:dashed"><div class="fa-main"><h2 class="fa-title big">${esc(censor(title) || 'Untitled')}</h2><div class="fa-body">${renderBody(censor(body))}</div></div></div>`; typeset(pv); },
        'submit-comment': async () => { await self.postComment(root, null, $('#fa-comment', root), $('#fa-comment-anon', root).checked); },
        reply: el => { const id = +el.dataset.id; const holder = $('#fcr-' + id, root); if (holder.innerHTML) { holder.innerHTML = ''; return; } holder.innerHTML = `<textarea class="input" rows="3" id="fcr-t-${id}" placeholder="Reply…"></textarea><div class="row between mt-1"><label class="check small" style="padding:0"><input type="checkbox" id="fcr-a-${id}"><span>Anonymously</span></label><div class="row gap-sm"><button class="btn xs" data-action="cancel-reply" data-id="${id}">Cancel</button><button class="btn xs primary" data-action="submit-reply" data-id="${id}">Reply</button></div></div>`; $('#fcr-t-' + id, root).focus(); },
        'cancel-reply': el => { $('#fcr-' + el.dataset.id, root).innerHTML = ''; },
        'submit-reply': async el => { const id = +el.dataset.id; await self.postComment(root, id, $('#fcr-t-' + id, root), $('#fcr-a-' + id, root).checked); },
        collapse: el => { const c = $('#fc-' + el.dataset.id, root); c.classList.toggle('collapsed'); el.textContent = c.classList.contains('collapsed') ? '[+]' : '[−]'; },
        'edit-post': () => { const p = F.thread.post; const holder = $('#fa-edit-post', root); if (holder.innerHTML) { holder.innerHTML = ''; return; } holder.innerHTML = `<div class="divider"></div><div class="field"><label>Title</label><input class="input" id="fa-e-title" maxlength="140" value="${esc(p.title)}"></div><div class="field"><label>Body</label><textarea class="input" id="fa-e-body" rows="8">${esc(p.body)}</textarea></div><div class="row gap-sm"><button class="btn primary sm" data-action="save-post">Save</button><button class="btn sm" data-action="edit-post">Cancel</button></div>`; },
        'save-post': async () => { try { await api('forum_post_edit', { id: F.thread.post.id, title: $('#fa-e-title', root).value, body: $('#fa-e-body', root).value }); toast('Saved'); await refreshThread(); } catch (e) { toast(e.message, 3000); } },
        'delete-post': async () => { if (!confirm('Delete this post?')) return; try { await api('forum_post_delete', { id: F.thread.post.id }); toast('Post deleted'); location.hash = base(); } catch (e) { toast(e.message, 3000); } },
        'edit-comment': el => { const id = +el.dataset.id; const c = F.thread.comments.find(x => x.id === id); const b = $('#fcb-' + id, root); if ($('textarea', b)) { b.innerHTML = renderBody(c.body); typeset(b); return; } b.innerHTML = `<textarea class="input" rows="4" id="fce-${id}">${esc(c.body)}</textarea><div class="row gap-sm mt-1"><button class="btn xs primary" data-action="save-comment" data-id="${id}">Save</button><button class="btn xs" data-action="edit-comment" data-id="${id}">Cancel</button></div>`; },
        'save-comment': async el => { const id = +el.dataset.id; try { await api('forum_comment_edit', { id, body: $('#fce-' + id, root).value }); toast('Saved'); await refreshThread(); } catch (e) { toast(e.message, 3000); } },
        'delete-comment': async el => { if (!confirm('Delete this comment?')) return; try { await api('forum_comment_delete', { id: +el.dataset.id }); await refreshThread(); } catch (e) { toast(e.message, 3000); } },
        mod: async el => {
          const a = el.dataset.a; const body = { action: a, kind: el.dataset.kind, id: +el.dataset.id || 0 }; if (el.dataset.report) body.report_id = +el.dataset.report; if (el.dataset.user) body.user_id = +el.dataset.user;
          if (a === 'remove' && !confirm('Remove this ' + (el.dataset.kind === 'p' ? 'post' : 'comment') + '? Members will see "[removed by a moderator]".')) return;
          try { await api('forum_mod', body); toast('Done'); if (el.dataset.refresh === 'reports') self.reports(V()); else await refreshThread(); } catch (e) { toast(e.message, 3000); }
        },
        purge: async el => {
          const what = el.dataset.kind === 'p' ? 'post (with all its comments)' : 'comment';
          if (!confirm('Permanently delete this ' + what + '? This cannot be undone.')) return;
          try { await api('admin_purge', { kind: el.dataset.kind, id: +el.dataset.id }); toast('Deleted permanently'); if (el.dataset.refresh === 'reports') self.reports(V()); else if (el.dataset.kind === 'p') location.hash = base(); else await refreshThread(); } catch (e) { toast(e.message, 3000); }
        },
        'admin-user': async el => {
          const a = el.dataset.a, body = { action: a, user_id: +el.dataset.u };
          if (a === 'delete' && !confirm('Delete the account ' + el.dataset.e + ' and everything they posted? This cannot be undone.')) return;
          if (a === 'ban') { const days = prompt('Ban for how many days?', '30'); if (!days) return; body.days = +days; body.reason = prompt('Reason (shown to the user):', 'Breaking the community rules') || ''; }
          try { await api('admin_user', body); toast('Done'); self.admin(V(), $('#fa-admin-q', root) ? $('#fa-admin-q', root).value.trim() : ''); } catch (e) { toast(e.message, 3500); }
        },
        'admin-page': el => self.admin(V(), el.dataset.q, +el.dataset.p),
        'save-setting': async el => { const value = $('#' + el.dataset.i, root).value.trim(); el.disabled = true; try { const r = await api('admin_setting', { key: el.dataset.k, value }); if (App.Canvas) { App.Canvas.data = null; App.Canvas.at = 0; } toast(r.canvas ? (r.canvas.error ? r.canvas.error : `Synced ${r.canvas.count} Canvas events`) : 'Saved', 4000); self.admin(V()); } catch (e) { el.disabled = false; toast(e.message, 4000); } },
        'read-all': async () => { try { const r = await api('notif_read', { all: true }); if (auth().setUnread) auth().setUnread(r.unread); self.inbox(V()); } catch (e) { toast(e.message); } },
        'open-notif': el => { api('notif_read', { id: +el.dataset.id }).then(r => { if (auth().setUnread) auth().setUnread(r.unread); }).catch(() => {}); },
        ban: async el => {
          const days = prompt('Ban the author of this item for how many days?', '7'); if (!days) return; const reason = prompt('Reason (shown to the user):', 'Breaking the community rules') || '';
          try { await api('forum_mod', { action: 'ban', kind: el.dataset.kind, id: +el.dataset.id, days: +days, reason }); toast('User banned'); if (el.dataset.refresh === 'reports') self.reports(V()); else await refreshThread(); } catch (e) { toast(e.message, 3000); }
        }
      };
    },
    async postComment(root, parentId, ta, anon) {
      if (!(await ensureTerms())) return;
      const body = ta.value.trim(); if (!body) { toast('Write a comment first.'); ta.focus(); return; }
      try { await api('forum_comment_create', { post_id: F.thread.post.id, parent_id: parentId, body, anon }); const d = await api('forum_post&id=' + F.thread.post.id); F.thread = d; this.paintThread($('#fa-thread', root)); toast('Comment posted'); if (parentId) { const el = $('#fc-' + parentId, root); if (el) el.scrollIntoView({ block: 'center' }); } } catch (e) { toast(e.message, 3500); }
    }
  };

  /* ---------- landing panel: latest discussions ---------- */
  App.forumLatest = async function (el) {
    const paint = (posts, guest) => { el.innerHTML = posts.length ? `<div class="fa-latest">${posts.slice(0, 5).map(p => `<a class="fa-latest-row" href="${guest ? '#/forum' : '#/forum/' + p.id}">${courseChip(p.course)}<span class="t">${esc(p.title)}</span><span class="muted small">${icon('chat', 12)} ${p.ncomments}</span></a>`).join('')}</div>` : '<div class="empty">No discussions yet. Start one.</div>'; };
    try { if (offline()) paint(DEMO.posts, !user()); else { const r = await api('forum_posts&course=all&sort=new'); paint(r.posts, r.guest); } } catch (e) { el.innerHTML = `<div class="empty small">${esc(e.message)}</div>`; }
  };
})(window);

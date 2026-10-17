/* ============================================================
   Mathub — admin panel (#/admin, or inside a class)
   Overview, members, reports, contributions queue, mock exams,
   keys and settings (API keys, the email password, plans, limits, who may sign up and who is staff;
   api/siteconfig.php), site settings (Canvas feed, announcement, staff roles), digest.
   Admins see everything; moderators see reports, contributions and mocks.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, on, toast, pageHead } = App;
  const PLAN_NAME = { pro: 'Pro', max: 'Max' };
  const PAID_IN = { app_store: 'the App Store', mac_app_store: 'the App Store', play_store: 'Google Play', rc_billing: 'the website', stripe: 'the website', promotional: 'RevenueCat (promotional)' };
  const day = t => new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  // the plan a member has, for the Members list: the button opens Give a membership
  const planCell = x => {
    const P = x.plan || {}; const k = P.plan || '';
    const src = !k ? '' : P.gift && P.gift.plan === k ? (P.gift.until ? `given, until ${day(P.gift.until)}` : 'given') : P.paid && P.paid.plan === k ? 'paid' : 'tester';
    return `<button class="btn xs adm-plan-btn${k ? ' is-' + k : ''}" data-action="plan" data-u="${x.id}" aria-expanded="false" aria-label="${k ? `Mathub ${PLAN_NAME[k]}${src ? `, ${src}` : ''}` : 'Free'}: give or change the membership of ${esc(x.name || x.email)}">${icon(k === 'pro' ? 'zap' : 'gem', 12)} ${k ? PLAN_NAME[k] : 'Free'}</button>${src ? `<div class="adm-plan-src">${esc(src)}</div>` : ''}`;
  };
  const API = 'api/index.php?r=';
  const user = () => (App.auth && App.auth.user) || null; const isAdmin = () => !!(user() && user().admin); const isMod = () => !!(user() && user().mod);
  const NAMES = { calc: 'Calc I', physics: 'Physics I', precalc: 'Precalc', writ: 'WRIT 101', csci: 'CSCI 127', biob: 'BIOB 160', kin: 'KIN 322', psyx: 'PSYX 340', general: 'General' };
  const courseChip = id => `<span class="chip course-${esc(id)}">${esc((global.Courses[id] && global.Courses[id].short) || NAMES[id] || id)}</span>`;
  const timeAgo = ts => { const s = Math.max(0, Date.now() / 1000 - ts); if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`; };
  const fmtWhen = ts => new Date(ts * 1000).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  async function api(route, body, method) {
    const opts = { method: method || (body ? 'POST' : 'GET'), credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Accept': 'application/json' }, cache: 'no-store' };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res, json; try { res = await fetch(API + route, opts); json = await res.json(); } catch (e) { throw new Error('Cannot reach the server.'); }
    if (!json || json.ok === false) { const err = new Error((json && json.error) || 'Request failed.'); err.data = json; throw err; }
    return json;
  }
  const TABS = [['overview', 'Overview', 'grid', 'admin'], ['members', 'Members', 'info', 'admin'], ['issues', 'Problems', 'bulb', 'mod'], ['packs', 'Add a class', 'book', 'admin'], ['classes', 'Class requests', 'path', 'admin'], ['teach', 'Instructors', 'users', 'admin'], ['errors', 'Site errors', 'zap', 'admin'], ['backups', 'Backups', 'download', 'admin'], ['reports', 'Reports', 'flag', 'mod'], ['contrib', 'Contributions', 'pen', 'mod'], ['mocks', 'Mock exams', 'target', 'mod'], ['growth', 'Growth', 'chart', 'admin'], ['config', 'Keys & settings', 'lock', 'admin'], ['settings', 'Site settings', 'sliders', 'admin'], ['digest', 'Digest & cron', 'clock', 'admin']];

  App.views.admin = {
    title: 'Admin panel',
    render(root, param, query, standalone) {
      const tabs = TABS.filter(t => t[3] === 'mod' ? isMod() : isAdmin()); const tab = tabs.find(t => t[0] === param) ? param : (tabs[0] ? tabs[0][0] : 'overview');
      const head = standalone ? `<header class="landing-top"><div><div class="eyebrow">Mathub</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Admin panel</h1><p class="muted">${isAdmin() ? 'Everything about the site, in one place.' : 'Moderation tools.'}</p></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="#/">${icon('left', 14)} All classes</a><button class="icon-btn theme-btn" data-action="theme" aria-label="Toggle theme"></button></div></header>` : pageHead('Admin panel', isAdmin() ? 'Everything about the site, in one place.' : 'Moderation tools.');
      root.innerHTML = `${standalone ? '<div class="landing-wrap admin-wrap">' : ''}${head}${!isMod() ? App.lockCard('Staff only', 'Log in with a moderator or administrator account to open the admin panel.') : `<div class="admin-layout"><nav class="admin-tabs">${tabs.map(t => `<a class="admin-tab${t[0] === tab ? ' active' : ''}" href="${standalone ? '#/admin/' + t[0] : App.link('admin', t[0])}">${icon(t[2], 15)}<span>${t[1]}</span></a>`).join('')}</nav><div class="admin-body" id="adm-body"><div class="empty">Loading…</div></div></div>`}${standalone ? '</div>' : ''}`;
      const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
      bind(root, { theme: () => App.toggleTheme(), 'auth-signup': () => App.auth.open('signup'), 'auth-login': () => App.auth.open('login') });
      if (isMod()) this[tab]($('#adm-body', root), root);
      const on = $('.admin-tab.active', root); const row = on && on.parentElement;   // phones: the tab row scrolls to the open tab
      if (row && row.scrollWidth > row.clientWidth) row.scrollLeft += on.getBoundingClientRect().left - row.getBoundingClientRect().left - 16;
    },

    /* browser errors reported by boot.js (api client_error): grouped by message, file and line */
    async errors(el) {
      try {
        const r = await api('admin_errors');
        el.innerHTML = `<div class="callout small mb-2">Uncaught errors from visitors' browsers, grouped. No names or answers are recorded: only the message, file, line, page and browser. Entries older than 45 days are removed automatically. Fix the most frequent first, then clear them.</div>
          <div class="panel"><div class="panel-h"><div class="panel-title">${icon('zap')} Errors <span class="chip xs">${r.items.length}</span></div>${r.items.length ? '<button class="btn sm ghost" data-action="err-clear-all">Clear all</button>' : ''}</div>
          ${r.items.length ? r.items.map(x => `<div class="err-row"><div class="row between"><b class="mono small">${esc(x.message)}</b><div class="row gap-sm"><span class="chip xs ${x.count >= 10 ? 'bad' : x.count >= 3 ? 'warn' : ''}">×${x.count}</span><button class="btn xs ghost" data-action="err-clear" data-sig="${esc(x.sig)}">Fixed</button></div></div>
            <div class="small muted">${esc(x.source || 'unknown file')}${x.line ? ':' + x.line : ''} · page ${esc(x.view || '#/')} · build ${esc(x.build || '?')} · ${esc(x.ua)} · last ${timeAgo(x.last)}, first ${timeAgo(x.first)}</div>${x.stack ? `<details class="small"><summary>Stack</summary><pre class="mono err-stack">${esc(x.stack)}</pre></details>` : ''}</div>`).join('') : '<div class="empty">No errors reported. Nice.</div>'}</div>`;
        bind(el, { 'err-clear': async b => { try { await api('admin_errors', { sig: b.dataset.sig }); this.errors(el); } catch (e) { toast(e.message); } }, 'err-clear-all': async () => { if (!confirm('Clear every reported error?')) return; try { await api('admin_errors', { sig: '' }); this.errors(el); } catch (e) { toast(e.message); } } });
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },
    async growth(el) {
      try {
        const r = await api('admin_growth'); const t = r.totals; const maxW = Math.max(1, ...r.weeks.map(w => w.signups)); const maxD = Math.max(1, ...r.days.map(d => d.n));
        const pct = (a, b) => b ? Math.round(100 * a / b) : 0; const heat = v => v >= 40 ? 'hot' : v >= 20 ? 'warm' : v > 0 ? 'cool' : '';
        el.innerHTML = `<div class="stats mb-2">${[['Members', t.users], ['Pending', t.pending], ['Active today', t.dau], ['Active 7 days', t.wau], ['Active 30 days', t.mau], ['Joined by invite', t.invited]].map(([l, v]) => `<div class="stat"><div class="stat-num count" data-count="${v}">${v}</div><div class="stat-label">${l}</div></div>`).join('')}</div>
          <div class="grid cols-2"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('users')} Sign-ups per week</div><span class="small muted">last 12 weeks · verified in solid</span></div><div class="gr-chart">${r.weeks.map(w => `<div class="gr-bar" title="${w.label}: ${w.signups} signed up, ${w.verified} verified"><i style="height:${Math.round(100 * w.signups / maxW)}%"><b style="height:${pct(w.verified, w.signups)}%"></b></i><small>${esc(w.label)}</small></div>`).join('')}</div></div>
          <div class="panel"><div class="panel-h"><div class="panel-title">${icon('chart')} Active members per day</div><span class="small muted">last 30 days</span></div><div class="gr-chart dense">${r.days.map(d => `<div class="gr-bar" title="${d.day}: ${d.n}"><i style="height:${Math.round(100 * d.n / maxD)}%"></i></div>`).join('')}</div><div class="row between small muted mt-1"><span>${esc(r.days[0].day)}</span><span>${esc(r.days[r.days.length - 1].day)}</span></div></div></div>
          <div class="panel mt-2"><div class="panel-h"><div class="panel-title">${icon('rotate')} Retention by sign-up week</div><span class="small muted">share of each cohort seen again after 1, 7 and 30 days</span></div>${r.cohorts.length ? `<div class="table-wrap"><table class="table compact gr-cohorts"><thead><tr><th>Week of</th><th class="num">Members</th><th class="num">After 1 day</th><th class="num">After 7 days</th><th class="num">After 30 days</th></tr></thead><tbody>${r.cohorts.map(c => `<tr><td>${esc(c.label)}</td><td class="num">${c.n}</td><td class="num ${heat(pct(c.d1, c.n))}">${c.age >= 1 ? pct(c.d1, c.n) + '%' : '—'}</td><td class="num ${heat(pct(c.d7, c.n))}">${c.age >= 7 ? pct(c.d7, c.n) + '%' : '—'}</td><td class="num ${heat(pct(c.d30, c.n))}">${c.age >= 30 ? pct(c.d30, c.n) + '%' : '—'}</td></tr>`).join('')}</tbody></table></div><p class="small muted mt-1">Activity is recorded from any signed-in request since this build, so cohorts before it show low numbers.</p>` : '<div class="empty small">No cohorts yet.</div>'}</div>
          <div class="panel mt-2"><div class="panel-h"><div class="panel-title">${icon('bulb')} What people use</div><span class="small muted">this week vs. the week before</span></div>${r.features.length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Event</th><th class="num">This week</th><th class="num">Last week</th><th class="num">Change</th></tr></thead><tbody>${r.features.map(f => { const d = f.prev ? Math.round(100 * (f.cur - f.prev) / f.prev) : null; return `<tr><td class="mono small">${esc(f.key)}</td><td class="num">${f.cur}</td><td class="num">${f.prev}</td><td class="num ${d === null ? '' : d >= 0 ? 'good' : 'bad'}">${d === null ? (f.cur ? 'new' : '') : (d >= 0 ? '+' : '') + d + '%'}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty small">Nothing recorded yet. Views and key actions are counted from now on.</div>'}</div>`;
        if (App.countUp) App.countUp(el);
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },
    async overview(el) {
      try {
        const [st, act] = await Promise.all([api('admin_stats'), api('activity')]);
        const stat = (n, l, ic) => `<div class="stat admin-stat"><div class="stat-num">${n}</div><div class="stat-label">${icon(ic, 12)} ${l}</div></div>`;
        el.innerHTML = `<div class="grid cols-4 mb-2">${stat(st.users, 'members', 'info')}${stat(st.issues_open || 0, 'open problem reports', 'bulb')}${stat(st.active_7d, 'active this week', 'fire')}${stat(st.online, 'online now', 'eye')}${stat(st.challenges_today, 'challenges today', 'target')}${stat(st.posts, 'posts', 'chat')}${stat(st.comments, 'comments', 'reply')}${stat(st.reports, 'open reports', 'flag')}${stat(st.contrib_pending, 'submissions to review', 'pen')}${stat(st.meets, 'upcoming sessions', 'clock')}${stat(st.mocks, 'upcoming mocks', 'flag')}${stat(st.bans, 'active bans', 'lock')}${stat(st.pending, 'unverified sign-ups', 'x')}</div>
          <div class="grid cols-2"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('bulb')} Latest activity</div></div>${act.items.length ? `<div class="act-feed">${act.items.slice(0, 12).map(i => `<a class="act-row" href="${esc(i.link || '#/')}"><span class="act-ic">${icon('bulb', 12)}</span><span class="act-text">${esc(i.text)}</span><span class="act-when">${timeAgo(i.created)}</span></a>`).join('')}</div>` : '<div class="empty">Nothing yet.</div>'}</div>
          <div class="panel"><div class="panel-h"><div class="panel-title">${icon('shield')} Staff</div></div><div class="row gap-sm" style="flex-wrap:wrap">${st.moderators.map(m => `<span class="chip ${st.admins.includes(m) ? 'accent' : ''}">${esc(m)}${st.admins.includes(m) ? ' · admin' : ''}</span>`).join('')}${st.roles.map(r => `<span class="chip staff">${esc(r.email)} · ${esc(r.role)}</span>`).join('')}</div><p class="small muted mt-2">Moderators and admins are set in <code>api/config.php</code> (or <code>config.local.php</code>). Instructor and TA badges are set under Site settings.</p>
            <div class="divider"></div><div class="eyebrow mb-1">Canvas</div><p class="small">${st.settings.canvas.configured ? `${st.settings.canvas.count} events · last sync ${st.settings.canvas.fetched ? timeAgo(st.settings.canvas.fetched) : 'never'}${st.settings.canvas.error ? ` · <span style="color:var(--bad)">${esc(st.settings.canvas.error)}</span>` : ''}` : 'No feed configured yet. Add it under Site settings.'}</p></div></div>`;
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },

    async issues(el, root, status = 'open') {
      try {
        const r = await api('admin_issues&status=' + status);
        el.innerHTML = `<div class="row between mb-2"><div class="row gap-sm">${['open', 'resolved', 'all'].map(x => `<button class="chip toggle${x === status ? ' on' : ''}" data-action="is-filter" data-s="${x}">${x}</button>`).join('')}</div><span class="chip${r.open ? ' warn' : ' good'}">${r.open} open</span></div>
          ${r.items.length ? `<div class="stack-sm">${r.items.map(i => `<div class="panel issue${i.status === 'resolved' ? ' resolved' : ''}"><div class="row between"><div class="row gap-sm"><span class="chip course-${esc(i.course || 'general')}">${esc(NAMES[i.course] || i.course || 'site')}</span><span class="chip">${esc(i.reason)}</span><b>${esc(i.view || 'Page')}${i.ref ? ' · ' + esc(i.ref) : ''}</b></div><span class="small muted">${App.ago(i.created * 1000)} · ${i.email ? esc(i.email) : 'anonymous'}</span></div>${i.prompt ? `<div class="issue-quote small mt-1">${esc(i.prompt)}</div>` : ''}${i.answer ? `<div class="small muted mt-1">Their answer: ${esc(i.answer)}</div>` : ''}${i.comment ? `<p class="mt-1">${esc(i.comment)}</p>` : ''}<div class="row gap-sm mt-1"><a class="btn xs" href="${esc(i.url || '#/')}">Open page</a>${/^#\/c\/[A-Za-z0-9]{8}$/.test(i.url || '') ? `<button class="btn xs danger" data-action="is-unshare" data-code="${esc(i.url.slice(4))}">Stop sharing this class</button>` : ''}${i.status === 'open' ? `<button class="btn xs primary" data-action="is-resolve" data-id="${i.id}">Resolve</button>` : `<button class="btn xs" data-action="is-reopen" data-id="${i.id}">Reopen</button>`}${isAdmin() ? `<button class="btn xs danger" data-action="is-delete" data-id="${i.id}">Delete</button>` : ''}<span class="small muted">${esc(i.build || '')}</span></div></div>`).join('')}</div>` : '<div class="empty">No problem reports here. Students can flag any question, lesson, flashcard or note.</div>'}`;
        bind(el, { 'is-filter': b => this.issues(el, root, b.dataset.s), 'is-resolve': async b => { const note = prompt('Optional note for the reporter (goes to their inbox):'); if (note === null) return; try { await api('admin_issue', { id: +b.dataset.id, action: 'resolve', note }); } catch (e) { App.toast(e.message); } this.issues(el, root, status); }, 'is-reopen': async b => { try { await api('admin_issue', { id: +b.dataset.id, action: 'reopen' }); } catch (e) { App.toast(e.message); } this.issues(el, root, status); }, 'is-unshare': async b => { if (!confirm('Stop sharing this class? Its link stops working for everyone; the owner keeps the class.')) return; try { const x = await api('admin_unshare', { code: b.dataset.code }); App.toast(x.stopped ? 'The link no longer works.' : 'It was not shared any more.'); } catch (e) { App.toast(e.message); } }, 'is-delete': async b => { if (!confirm('Delete this report?')) return; try { await api('admin_issue', { id: +b.dataset.id, action: 'delete' }); } catch (e) { App.toast(e.message); } this.issues(el, root, status); } });
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },
    async classes(el, root, status = 'open') {
      try {
        const r = await api('admin_classreqs&status=' + status); const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
        const ST = { new: ['New', ''], working: ['Being built', 'warn'], added: ['Added', 'good'], declined: ['Declined', 'muted'] };
        const guessId = code => code.replace(/\s+/g, '').toLowerCase();
        el.innerHTML = `<div class="row between mb-2" style="flex-wrap:wrap;gap:8px"><div class="row gap-sm">${[['open', 'Open'], ['added', 'Added'], ['declined', 'Declined'], ['all', 'All']].map(([k, l]) => `<button class="chip toggle${k === status ? ' on' : ''}" data-action="cr-filter" data-s="${k}">${l} <b>${r.counts[k] || 0}</b></button>`).join('')}</div><span class="small muted">Most requested first. Syllabus files are only visible here.</span></div>
          ${r.groups.length ? `<div class="stack-sm">${r.groups.map(g => `<div class="panel cr-group" data-code="${esc(g.code)}"><div class="row between" style="flex-wrap:wrap;gap:8px"><div class="row gap-sm"><b class="mono" style="font-size:16px">${esc(g.code)}</b>${g.title ? `<span>${esc(g.title)}</span>` : ''}<span class="chip ${ST[g.status] ? ST[g.status][1] : ''}">${esc(ST[g.status] ? ST[g.status][0] : g.status)}</span><span class="chip">${g.n} student${g.n === 1 ? '' : 's'}</span><span class="chip${g.syllabi ? ' good' : ' warn'}">${g.syllabi ? `${g.syllabi} syllab${g.syllabi === 1 ? 'us' : 'i'}` : 'no syllabus yet'}</span>${g.status === 'added' && g.course_id ? `<a class="chip accent" href="#/${esc(g.course_id)}">#/${esc(g.course_id)}</a>` : ''}</div>
              <div class="row gap-sm">${g.status !== 'working' && g.status !== 'added' ? `<button class="btn xs" data-action="cr-set" data-st="working">Working on it</button>` : ''}${g.status !== 'added' ? `<button class="btn xs primary" data-action="cr-set" data-st="added">Mark added</button>` : ''}${g.status !== 'declined' ? `<button class="btn xs" data-action="cr-set" data-st="declined">Can't add</button>` : ''}${g.status !== 'new' ? `<button class="btn xs ghost" data-action="cr-set" data-st="new">Back to new</button>` : ''}</div></div>
              ${g.admin_note ? `<div class="small muted mt-1">${icon('chat', 11)} Note sent: ${esc(g.admin_note)}</div>` : ''}
              <div class="cr-list mt-1">${g.requests.map(q => `<div class="cr-row"><div><b>${q.deleted ? '<span class="muted">account deleted</span>' : esc(q.name || q.email)}</b>${q.email ? ` <a class="small muted" href="mailto:${esc(q.email)}">${esc(q.email)}</a>` : ''} <span class="small muted">· ${App.ago(q.created * 1000)}${q.term ? ' · ' + esc(q.term) : ''}${q.instructor ? ' · ' + esc(q.instructor) : ''}</span>${q.note ? `<div class="small mt-1">${esc(q.note)}</div>` : ''}</div>
                <div class="row gap-sm">${q.file_name ? `<a class="btn xs" href="${API}admin_classreq_file&id=${q.id}" download>${icon('download', 12)} ${esc(q.file_name)} · ${kb(q.file_size)}</a>` : ''}${q.has_text ? `<a class="btn xs" href="${API}admin_classreq_file&id=${q.id}&part=text" download>${icon('file', 12)} Pasted text</a>` : ''}${!q.file_name && !q.has_text ? '<span class="small muted">no syllabus</span>' : ''}<button class="btn xs danger" data-action="cr-delete" data-id="${q.id}" title="Delete this request and its file">${icon('trash', 12)}</button></div></div>`).join('')}</div></div>`).join('')}</div>`
            : `<div class="empty">${status === 'open' ? 'No open class requests. Students ask from the start page, the class picker and Settings.' : 'Nothing here.'}</div>`}
          <p class="small muted mt-2">${icon('book', 12)} Built a class from a syllabus? Upload its class pack under <a href="#/admin/packs">Add a class</a>; it can tell everyone who asked.</p>`;
        const groupOf = b => r.groups.find(g => g.code === b.closest('.cr-group').dataset.code);
        bind(el, {
          'cr-filter': b => this.classes(el, root, b.dataset.s),
          'cr-set': async b => {
            const g = groupOf(b); const st = b.dataset.st; let courseId = '';
            if (st === 'added') { courseId = prompt(`Class id on Mathub for ${g.code} (the part after #/, for example ${guessId(g.code)}):`, g.course_id || guessId(g.code)); if (courseId === null) return; courseId = courseId.trim().toLowerCase(); if (!global.Courses[courseId] && !confirm(`There is no class "${courseId}" in this build yet, so the link students get will not open until you deploy it. Send anyway?`)) return; }
            const note = prompt(st === 'declined' ? `Why can't ${g.code} be added? (goes to the ${g.n} student${g.n === 1 ? '' : 's'} who asked)` : `Optional note for the ${g.n} student${g.n === 1 ? '' : 's'} who asked:`, ''); if (note === null) return;
            try { const res = await api('admin_classreq_update', { code: g.code, status: st, note, course_id: courseId }); App.toast(`${g.code}: ${ST[st][0].toLowerCase()} · ${res.notified} notified`); } catch (e) { App.toast(e.message); }
            this.classes(el, root, status);
          },
          'cr-delete': async b => { if (!confirm('Delete this request and its syllabus file? The student is not notified.')) return; try { await api('admin_classreq_delete', { id: +b.dataset.id }); } catch (e) { App.toast(e.message); } this.classes(el, root, status); }
        });
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },
    /* class packs: one .mathub.json file per class, checked here before it goes live (assets/classpacks.js, api/packs.php) */
    async packs(el, root) {
      const P = App.packs && App.packs.api; if (!P) { el.innerHTML = '<div class="empty">The class pack engine did not load. Refresh the page.</div>'; return; }
      let r; try { r = await api('admin_classpacks'); } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
      const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
      const reqCode = c => { const m = String(c || '').toUpperCase().replace(/[\s\-_.]+/g, ' ').trim().match(/^([A-Z]{1,5}) ?([0-9]{3}[A-Z]{0,3})$/); return m ? `${m[1]} ${m[2]}` : ''; };
      const asked = code => (r.requests && r.requests[reqCode(code)]) || 0;
      const builtins = App.COURSE_ORDER.filter(id => global.Courses[id] && !global.Courses[id].pack);
      el.innerHTML = `<div class="panel pk-up"><div class="panel-h"><div class="panel-title">${icon('book')} Add or update a class</div><span class="small muted">Up to ${r.max_mb} MB</span></div>
          <ol class="pk-steps small"><li>Send Claude the syllabus. You get back one file, <code>&lt;id&gt;.mathub.json</code>.</li><li>Choose it below. It is checked here, with sample questions, before anything goes live.</li><li>Press <b>Add class</b>. Uploading the same class again updates it, and the previous version is kept.</li></ol>
          <label class="rq-drop" id="pk-drop" for="pk-file"><input type="file" id="pk-file" accept=".json,application/json"><span class="rq-drop-ic">${icon('download', 22)}</span><span class="rq-drop-t"><b>Choose a class pack</b> or drop it here<small>a .mathub.json file</small></span></label>
          <div id="pk-preview"></div></div>
        <div class="panel mt-2"><div class="panel-h"><div class="panel-title">${icon('list')} Uploaded classes</div><span class="small muted">${r.packs.length} installed</span></div>
          ${r.packs.length ? `<div class="pk-list">${r.packs.map(p => `<div class="pk-row" data-id="${esc(p.id)}"><div class="pk-main"><div class="row gap-sm" style="flex-wrap:wrap"><b class="mono">${esc(p.code)}</b><span>${esc(p.name)}</span><span class="chip ${p.enabled ? 'good' : 'warn'}">${p.enabled ? 'Live' : 'Hidden'}</span><span class="chip">v${p.version}</span>${p.requests ? `<span class="chip accent">${p.requests} asking</span>` : ''}</div><div class="small muted mt-1">#/${esc(p.id)} · ${kb(p.size)} · updated ${App.ago(p.updated * 1000)}${p.uploaded_by ? ' by ' + esc(p.uploaded_by) : ''}</div></div>
            <div class="row gap-sm pk-acts"><a class="btn xs" href="#/${esc(p.id)}">${icon('eye', 12)} Open</a><button class="btn xs" data-action="pk-toggle">${p.enabled ? `${icon('lock', 12)} Hide` : `${icon('check', 12)} Publish`}</button><a class="btn xs" href="${API}admin_classpack_download&id=${esc(p.id)}" download>${icon('download', 12)} File</a>${p.has_prev ? `<button class="btn xs" data-action="pk-rollback">${icon('undo', 12)} Previous version</button>` : ''}<button class="btn xs danger" data-action="pk-delete" title="Remove this class from the site">${icon('trash', 12)}</button></div></div>`).join('')}</div>`
            : '<div class="empty">No uploaded classes yet. Classes you add here appear for everyone on the start page, in search and in the class picker.</div>'}</div>
        <div class="panel mt-2"><div class="panel-h"><div class="panel-title">${icon('grid')} Built-in classes</div></div><div class="row gap-sm" style="flex-wrap:wrap">${builtins.map(id => `<a class="chip course-${id}" href="#/${id}">${esc(global.Courses[id].short)}</a>`).join('')}</div><p class="small muted mt-1">These ship with the site's code, so they are changed in a new build rather than here.</p></div>`;
      const prev = $('#pk-preview', el), file = $('#pk-file', el), drop = $('#pk-drop', el); let pending = null;
      const refresh = async () => { try { await App.packs.sync(); } catch (e) {} this.packs(el, root); };
      const sample = (P, pack) => { try { const built = P.buildQuiz(P.clean(pack.QUIZ, 'QUIZ', { quiz: true })); const ts = Object.keys(built.quiz.TOPICS); return built.quiz.generateSet(ts.sort(() => Math.random() - 0.5).slice(0, 3), 3); } catch (e) { return []; } };
      const show = async f => {
        prev.innerHTML = ''; pending = null; if (!f) return; drop.classList.add('has-file');
        if (f.size > r.max_mb * 1048576) { prev.innerHTML = `<div class="pk-msg bad">${icon('x', 14)} ${esc(f.name)} is ${kb(f.size)}; class packs can be up to ${r.max_mb} MB.</div>`; return; }
        const text = await f.text(); let pack; try { pack = JSON.parse(text); } catch (e) { prev.innerHTML = `<div class="pk-msg bad">${icon('x', 14)} ${esc(f.name)} is not valid JSON: ${esc(e.message)}</div>`; return; }
        const v = P.validate(pack); const st = v.stats || {}; const old = r.packs.find(p => p.id === pack.id); const n = asked(pack.code);
        const qs = v.errors.length ? [] : sample(P, pack); const pal = v.errors.length ? null : P.palette(pack.color);
        prev.innerHTML = `<div class="pk-card mt-2">
          <div class="row between" style="flex-wrap:wrap;gap:8px"><div class="row gap-sm" style="flex-wrap:wrap">${pal ? `<span class="pk-swatch" style="background:${pal.light.accent}"></span><span class="pk-swatch" style="background:${pal.dark.accent}"></span>` : ''}<b class="mono" style="font-size:16px">${esc(pack.code || '?')}</b><span>${esc(P.safeHtml(pack.name || ''))}</span><span class="chip">${esc(pack.term || '')}</span><span class="chip ${old ? 'warn' : 'accent'}">${old ? `Update: v${old.version} → v${old.version + 1}` : 'New class'}</span></div><span class="small muted mono">#/${esc(pack.id || '?')} · ${kb(f.size)}</span></div>
          <div class="pk-stats mt-1">${[['sections', 'topics'], ['units', 'units'], ['exams', 'exams'], ['calendar', 'calendar days'], ['flashcards', 'flashcards'], ['formulas', 'formulas & terms'], ['practice', 'practice problems'], ['topics', 'quiz topics'], ['questions', 'question sets'], ['bankItems', 'bank questions']].map(([k, l]) => `<span><b>${st[k] || 0}</b> ${l}</span>`).join('')}</div>
          ${v.errors.length ? `<div class="pk-msg bad mt-2"><b>${v.errors.length} problem${v.errors.length === 1 ? '' : 's'} to fix before this can go live:</b><ul>${v.errors.slice(0, 30).map(x => `<li>${esc(x)}</li>`).join('')}</ul>${v.errors.length > 30 ? `<div class="small">…and ${v.errors.length - 30} more.</div>` : ''}</div>` : `<div class="pk-msg good mt-2">${icon('check', 14)} Checked: every section, date and question set is valid${st.questions ? `, and each question set generated 40 questions without a problem` : ''}.</div>`}
          ${v.warnings.length ? `<details class="pk-warn mt-1"><summary>${v.warnings.length} note${v.warnings.length === 1 ? '' : 's'} (optional to fix)</summary><ul class="small">${v.warnings.slice(0, 40).map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
          ${qs.length ? `<div class="eyebrow mt-2 mb-1">Sample questions</div><div class="stack-sm">${qs.map(q => `<div class="pk-q"><div>${q.prompt}</div>${q.type === 'mc' ? `<ol class="pk-opts">${q.options.map((o, i) => `<li class="${i === q.answer ? 'right' : ''}">${o}</li>`).join('')}</ol>` : `<div class="small mt-1">Answer: $${q.answerTex}$</div>`}<div class="small muted mt-1">${q.explanation}</div></div>`).join('')}</div>` : ''}
          ${v.errors.length ? '' : `<div class="pk-go mt-2"><label class="check"><input type="checkbox" id="pk-publish" checked> Publish now <span class="small muted">(untick to add it hidden, so only admins see it while you check it)</span></label>
            ${n ? `<label class="check"><input type="checkbox" id="pk-notify" checked> Tell the ${n} student${n === 1 ? '' : 's'} who asked for ${esc(reqCode(pack.code))} <span class="small muted">(inbox message and phone notification)</span></label>` : ''}
            <div class="row gap-sm mt-1"><button class="btn primary" data-action="pk-install">${icon('check', 14)} ${old ? 'Update class' : 'Add class'}</button><button class="btn ghost" data-action="pk-cancel">Cancel</button><span class="small muted" id="pk-status" role="status"></span></div></div>`}
        </div>`;
        pending = { text, pack, old }; App.typeset(prev);
      };
      file.addEventListener('change', () => show(file.files[0]));
      ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('drag'); }));
      drop.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) show(f); });
      const rowOf = b => r.packs.find(p => p.id === b.closest('.pk-row').dataset.id);
      bind(el, {
        'pk-cancel': () => { prev.innerHTML = ''; pending = null; file.value = ''; drop.classList.remove('has-file'); },
        'pk-install': async b => {
          if (!pending) return; b.disabled = true; const status = $('#pk-status', el); status.textContent = 'Uploading…';
          const publish = !!($('#pk-publish', el) || {}).checked, notify = !!($('#pk-notify', el) || {}).checked;
          try {
            const res = await api('admin_classpack_install', { json: pending.text, publish, notify });
            App.toast(`${pending.pack.code} ${res.created ? 'added' : 'updated'}${res.notified ? ` · ${res.notified} student${res.notified === 1 ? '' : 's'} told` : ''}`, 2600);
            pending = null; await refresh();
          } catch (e) { status.textContent = e.message; b.disabled = false; }
        },
        'pk-toggle': async b => {
          const p = rowOf(b); const on = !p.enabled; let notify = false;
          if (on && p.requests) notify = confirm(`Publish ${p.code} and tell the ${p.requests} student${p.requests === 1 ? '' : 's'} who asked for it?\n\nOK publishes and tells them. Cancel publishes without a message.`);
          else if (!on && !confirm(`Hide ${p.code}? Students stop seeing it right away; their saved progress is kept.`)) return;
          try { const res = await api('admin_classpack_set', { id: p.id, enabled: on, notify }); App.toast(`${p.code} ${on ? 'is live' : 'is hidden'}${res.notified ? ` · ${res.notified} told` : ''}`); } catch (e) { App.toast(e.message); }
          refresh();
        },
        'pk-rollback': async b => { const p = rowOf(b); if (!confirm(`Go back to the previous version of ${p.code}? The current one is kept as the "previous" version, so you can switch back.`)) return; try { await api('admin_classpack_rollback', { id: p.id }); App.toast(`${p.code} rolled back`); } catch (e) { App.toast(e.message); } refresh(); },
        'pk-delete': async b => {
          const p = rowOf(b); const typed = prompt(`Remove ${p.code} ${p.name} from the site?\n\nStudents' saved progress and its discussion posts stay in the database, so uploading the same class again brings them back.\n\nType ${p.code} to confirm:`); if (typed === null) return;
          try { await api('admin_classpack_delete', { id: p.id, confirm: typed }); App.toast(`${p.code} removed`); } catch (e) { App.toast(e.message); } refresh();
        }
      });
    },
    async backups(el, root) {
      try {
        const r = await api('admin_backups'); const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
        el.innerHTML = `<div class="panel"><div class="panel-h"><div class="panel-title">${icon('download')} Database backups</div><button class="btn sm primary" data-action="bk-now">Back up now</button></div><p class="small muted">A copy of the whole database (accounts, posts, progress) is made once a day by the server's housekeeping and the last 14 are kept; manual copies are never pruned. They live in api/data/backups, which the web server cannot serve; download them here and keep one somewhere safe. The live database is ${kb(r.db_size)}.</p>
          ${r.items.length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>File</th><th>When</th><th class="num">Size</th><th></th></tr></thead><tbody>${r.items.map(b => `<tr><td class="mono small">${esc(b.name)}</td><td>${App.ago(b.mtime * 1000)}</td><td class="num">${kb(b.size)}</td><td><a class="btn xs" href="${API}admin_backup_download&file=${encodeURIComponent(b.name)}">${icon('download', 12)} Download</a></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No backups yet. The first one is made automatically within a day, or click Back up now.</div>'}</div>`;
        bind(el, { 'bk-now': async b => { b.disabled = true; try { const x = await api('admin_backup_now', {}); App.toast(`${icon('check', 14)} Backup written: ${x.backup.name}`); } catch (e) { App.toast(e.message, 4000); } this.backups(el, root); } });
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },
    async badgeEditor(cell, uid, onDone) {
      let r; try { r = await api('admin_badges&user_id=' + uid); } catch (e) { cell.innerHTML = `<div class="empty small">${esc(e.message)}</div>`; return; }
      const n = Object.keys(r.have).length; const me = user() && user().id === r.user.id;
      cell.innerHTML = `<div class="badge-editor"><div class="row gap-sm mb-1" style="flex-wrap:wrap"><b>${esc(r.user.name)}${me ? ' (you)' : ''}</b><span class="chip${n ? ' gold' : ''}">${icon('award', 12)} ${n} of ${r.catalog.length}</span><span style="flex:1"></span><button class="btn xs primary" data-action="bd" data-a="award_all">${icon('award', 12)} Award all</button><button class="btn xs danger ghost" data-action="bd" data-a="remove_all">Remove all</button><button class="btn xs" data-action="bd-close">Close</button></div>
        <div class="bpills">${r.catalog.map(b => { const h = r.have[b.code]; return `<button class="bpill${h ? ' on' : ' off'}" data-action="bd" data-a="${h ? 'remove' : 'award'}" data-code="${b.code}" title="${esc(b.desc)}${h ? ` · ${h.manual ? 'awarded by an admin' : 'earned'} ${new Date(h.earned * 1000).toLocaleDateString()} · click to remove` : ' · click to award'}">${icon(b.icon, 13)}<span>${esc(b.name)}</span>${h ? icon('check', 12) : ''}</button>`; }).join('')}</div>
        <p class="small muted mt-1">Click a badge to award or remove it. Awarded badges stay until you remove them; the automatic check only ever adds badges.</p></div>`;
      bind(cell, {
        bd: async b => { const a = b.dataset.a; if (a === 'remove_all' && !confirm(`Remove every badge from ${r.user.name}?`)) return; try { await api('admin_badges', { user_id: uid, action: a, code: b.dataset.code || '' }); toast(a.startsWith('award') ? 'Awarded' : 'Removed'); await this.badgeEditor(cell, uid, onDone); if (me && App.social && App.social.refreshBadges) App.social.refreshBadges(true); } catch (e) { toast(e.message, 3500); } },
        'bd-close': () => { onDone(); }
      });
    },
    /* a member's membership: what they pay for, what an administrator gave them (and until when), a tester plan */
    planEditor(cell, x, done) {
      const P = x.plan || {}; const g = P.gift; const name = x.name || x.email.split('@')[0]; const id = x.id;
      const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
      const nice = v => new Date(v + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const lines = [];
      if (P.paid) lines.push(`Pays for Mathub ${PLAN_NAME[P.paid.plan]} through ${PAID_IN[P.paid.store] || 'the website'}${P.paid.until ? `; ${P.paid.renews ? 'renews' : 'ends'} ${day(P.paid.until)}` : ''}.`);
      if (g) lines.push(`Given Mathub ${PLAN_NAME[g.plan]}${g.by ? ` by ${g.by}` : ''} on ${day(g.at)}, ${g.until ? `until ${day(g.until)}` : 'with no end date'}${g.note ? `. Note: ${g.note}` : ''}.`);
      if (P.tester) lines.push(`Tester plan: Mathub ${PLAN_NAME[P.tester]} (Keys & settings or config.local.php).`);
      if (!lines.length) lines.push('Free: nothing paid for or given.');
      const untilDay = g && g.until ? iso(new Date(g.until * 1000)) : '';
      cell.innerHTML = `<form class="adm-plan" novalidate aria-labelledby="pl-h-${id}">
        <div class="adm-plan-h"><h3 id="pl-h-${id}">Membership for ${esc(name)}</h3><span class="mono small muted">${esc(x.email)}</span></div>
        <ul class="adm-plan-now">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
        <fieldset class="adm-plan-opts"><legend>Give them</legend>
          ${[['', 'Free', g ? 'Take back what was given' : 'Nothing given'], ['pro', 'Mathub Pro', 'Bo writes classes from any syllabus'], ['max', 'Mathub Max', 'Pro, plus Ask Bo and calls']].map(([v, h, d]) => `<label class="adm-plan-opt${v ? ' is-' + v : ''}"><input type="radio" name="pl-${id}" value="${v}"${(g ? g.plan : '') === v ? ' checked' : ''}><span><b>${h}</b><small>${d}</small></span></label>`).join('')}
        </fieldset>
        <div class="adm-plan-grid">
          <div class="field"><label for="pl-for-${id}">For how long</label><select class="select" id="pl-for-${id}"><option value="">No end date</option><option value="30">1 month</option><option value="91">3 months</option><option value="183">6 months</option><option value="365">1 year</option><option value="day"${untilDay ? ' selected' : ''}>Until a day you pick</option></select></div>
          <div class="field adm-plan-day"${untilDay ? '' : ' hidden'}><label for="pl-day-${id}">Last day</label><input class="input" type="date" id="pl-day-${id}" min="${iso(new Date())}" value="${untilDay}"></div>
          <div class="field"><label for="pl-note-${id}">Note <span class="muted small">(only administrators see it)</span></label><input class="input" id="pl-note-${id}" maxlength="120" autocomplete="off" placeholder="For example: TA for M 171" value="${esc(g ? g.note : '')}"></div>
        </div>
        <label class="check adm-plan-tell"><input type="checkbox" id="pl-tell-${id}" checked> <span>Tell them in their inbox</span></label>
        <p class="adm-plan-sum" id="pl-sum-${id}" aria-live="polite"></p>
        <div class="row gap-sm adm-plan-acts"><button class="btn primary" type="submit">Save</button><button class="btn ghost" type="button" data-pl-x>Close</button><p class="small adm-add-msg" role="status" id="pl-msg-${id}"></p></div>
      </form>`;
      const form = $('form', cell); const forSel = $(`#pl-for-${id}`, form); const dayBox = $('.adm-plan-day', form); const dayIn = $(`#pl-day-${id}`, form); const msg = $(`#pl-msg-${id}`, form);
      const pick = () => ($(`input[name="pl-${id}"]:checked`, form) || {}).value || '';
      const until = () => !pick() ? '' : forSel.value === 'day' ? dayIn.value : forSel.value ? plus(+forSel.value) : '';
      const sum = () => {
        const p = pick(); const u = until(); form.classList.toggle('is-free', !p);
        $('.adm-plan-grid', form).hidden = !p; $('.adm-plan-tell', form).hidden = !p; dayBox.hidden = forSel.value !== 'day';
        $(`#pl-sum-${id}`, form).textContent = p
          ? `${name} gets Mathub ${PLAN_NAME[p]} free, ${u ? `until the end of ${nice(u)}` : 'with no end date'}. It never charges them.${P.paid ? ' What they pay for is not changed.' : ''}`
          : g ? `What was given to ${name} is taken back now.${P.paid ? ` They keep Mathub ${PLAN_NAME[P.paid.plan]}, which they pay for.` : ''}` : `Nothing is given to ${name}.`;
        if (P.tester) $(`#pl-sum-${id}`, form).textContent += ' Saving also removes their tester plan from Keys & settings (one in config.local.php stays).';
      };
      form.addEventListener('change', sum); dayIn.addEventListener('input', sum); sum();
      form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); done(null); } });
      $('[data-pl-x]', form).addEventListener('click', () => done(null));
      form.addEventListener('submit', async e => {
        e.preventDefault(); const p = pick(); const u = until(); const btn = $('button[type="submit"]', form);
        dayBox.classList.remove('bad');
        if (p && forSel.value === 'day' && !u) { msg.className = 'small adm-add-msg bad'; msg.textContent = 'Pick the last day.'; dayBox.classList.add('bad'); dayIn.focus(); return; }
        btn.disabled = true; msg.className = 'small adm-add-msg'; msg.textContent = 'Saving…';
        try {
          const r = await api('admin_plan', { user_id: id, plan: p, until: u, note: $(`#pl-note-${id}`, form).value.trim(), tell: $(`#pl-tell-${id}`, form).checked });
          const still = r.plan && r.plan.plan;
          toast(p ? `${name} has Mathub ${PLAN_NAME[p]}${u ? ` until ${nice(u)}` : ''}.${r.told ? ' They were told in their inbox.' : ''}` : `Took back what was given to ${name}.${still ? ` They still have Mathub ${PLAN_NAME[still]} (${r.plan.paid && r.plan.paid.plan === still ? 'they pay for it' : 'a tester plan in config.local.php'}).` : ''}`, 5000);
          done(r);
        } catch (x2) {
          btn.disabled = false; msg.className = 'small adm-add-msg bad'; msg.textContent = x2.message;
          if (x2.data && x2.data.field === 'until') { dayBox.hidden = false; forSel.value = 'day'; dayBox.classList.add('bad'); dayIn.focus(); }
        }
      });
      const first = $(`input[name="pl-${id}"]:checked`, form) || $(`input[name="pl-${id}"]`, form); first.focus();
    },
    async members(el, root, q, page, show) {
      show = show === 'plan' ? 'plan' : '';
      try {
        const us = await api('admin_users&q=' + encodeURIComponent(q || '') + '&page=' + (page || 0) + (show ? '&show=plan' : ''));
        const again = (p2, cb) => this.members(el, root, $('#adm-q', el).value.trim(), p2 || 0, $('#adm-show', el).value).then(cb);
        const byId = new Map(us.users.map(x => [x.id, x]));
        // add a member: any email address, ready to use, with a role and a plan if wanted
        const add = `<form class="panel mb-2 adm-add" id="adm-add" novalidate><div class="panel-h"><h2 class="panel-title">${icon('plus')} Add a member</h2></div>
          <p class="small muted mb-2">Any email address, also outside montana.edu. The account is ready at once; the first time they sign in, Mathub welcomes them and they pick their classes.</p>
          <div class="adm-add-grid"><div class="field"><label for="add-email">Email <span class="req">*</span></label><input class="input" id="add-email" type="email" autocomplete="off" required placeholder="name@example.edu"></div>
            <div class="field"><label for="add-name">Name</label><input class="input" id="add-name" maxlength="60" autocomplete="off" placeholder="Optional"></div>
            <div class="field"><label for="add-role">Role</label><select class="select" id="add-role"><option value="">Student</option><option value="TA">TA</option><option value="Instructor">Instructor</option></select></div>
            <div class="field"><label for="add-plan">Plan</label><select class="select" id="add-plan"><option value="">No plan</option><option value="pro">Mathub Pro, free for them</option><option value="max">Mathub Max, free for them</option></select></div></div>
          <fieldset class="adm-add-how"><legend>How they sign in</legend>
            <label class="check"><input type="radio" name="add-how" value="invite" checked> <span>Email them a link and a code to choose their own password <span class="muted small">(good for 7 days)</span></span></label>
            <label class="check"><input type="radio" name="add-how" value="password"> <span>Set a password now and tell them yourself</span></label>
            <div class="field adm-add-pass" hidden><label for="add-pass">Password</label><input class="input" id="add-pass" type="text" autocomplete="off" spellcheck="false" placeholder="At least 8 characters"></div></fieldset>
          <div class="row gap-sm mt-2" style="flex-wrap:wrap;align-items:center"><button class="btn primary" type="submit">${icon('plus', 14)} Add member</button><p class="small adm-add-msg" id="adm-add-msg" role="status"></p></div></form>`;
        el.innerHTML = add + `<div class="panel"><div class="panel-h"><div class="panel-title">${icon('info')} Members</div><div class="adm-find"><select class="select" id="adm-show" aria-label="Show"><option value="">Everyone</option><option value="plan"${show ? ' selected' : ''}>With Pro or Max</option></select><input class="input" id="adm-q" type="search" aria-label="Search members" placeholder="Search email or name…" value="${esc(q || '')}"></div></div>
          <p class="small muted mb-2">Press a member’s plan to give them Mathub Pro or Max, free for them, for as long as you like, or to take it back.</p>
          <div class="table-wrap adm-members"><table class="table compact"><thead><tr><th>Member</th><th class="num">Badges</th><th>Plan</th><th>Status</th><th></th></tr></thead><tbody>${us.users.map(x => `<tr><td><div><b>${esc(x.name || x.email.split('@')[0])}</b>${x.admin ? ' <span class="chip accent">admin</span>' : x.mod ? ' <span class="chip">mod</span>' : ''}</div><div class="mono small muted">${esc(x.email)}</div><div class="small muted adm-mem-meta">Joined ${day(x.created)} · last login ${x.last_login ? timeAgo(x.last_login) : 'never'} · ${x.posts} ${x.posts === 1 ? 'post' : 'posts'}, ${x.comments} ${x.comments === 1 ? 'comment' : 'comments'}</div></td><td class="num"><button class="btn xs${x.badges ? ' gold' : ''}" data-action="badges" data-u="${x.id}" title="Award or remove badges">${icon('award', 12)} ${x.badges}</button></td><td class="adm-plan-cell">${planCell(x)}</td><td class="small">${!x.verified ? '<span class="chip warn">unverified</span>' : x.banned_until ? `<span class="chip bad">banned until ${new Date(x.banned_until * 1000).toLocaleDateString()}</span>` : '<span class="chip good">active</span>'}${x.terms ? '' : ' <span class="chip">no rules yet</span>'}</td><td><div class="row gap-sm" style="flex-wrap:nowrap;justify-content:flex-end">${x.admin ? '' : `${x.banned_until ? `<button class="btn xs" data-action="user" data-a="unban" data-u="${x.id}">Unban</button>` : `<button class="btn xs" data-action="user" data-a="ban" data-u="${x.id}">Ban</button>`}${!x.verified ? `<button class="btn xs" data-action="user" data-a="verify" data-u="${x.id}">Verify</button>` : ''}<button class="btn xs danger ghost" data-action="user" data-a="delete" data-u="${x.id}" data-e="${esc(x.email)}">Delete</button>`}</div></td></tr>`).join('') || `<tr><td colspan="5"><div class="empty">${show && !q ? 'Nobody has Pro or Max yet. Press a member’s plan to give them one.' : 'No members match.'}</div></td></tr>`}</tbody></table></div>
          ${us.more ? `<div class="row mt-2" style="justify-content:center"><button class="btn" data-action="page" data-p="${(page || 0) + 1}">Next page</button></div>` : ''}</div>`;
        const inp = $('#adm-q', el); let t; inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => again(0, () => { const i = $('#adm-q', el); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }), 350); });
        $('#adm-show', el).addEventListener('change', () => again(0, () => { const s2 = $('#adm-show', el); if (s2) s2.focus(); }));
        const form = $('#adm-add', el); const passBox = $('.adm-add-pass', form);
        form.addEventListener('change', e => { if (e.target.name === 'add-how') passBox.hidden = e.target.value !== 'password'; });
        form.addEventListener('submit', async e => {
          e.preventDefault(); const btn = $('button[type="submit"]', form); const out = $('#adm-add-msg', form);
          const body = { email: $('#add-email', form).value.trim(), name: $('#add-name', form).value.trim(), role: $('#add-role', form).value, plan: $('#add-plan', form).value, how: $('input[name="add-how"]:checked', form).value, password: $('#add-pass', form).value };
          $$('.field.bad', form).forEach(f => f.classList.remove('bad')); btn.disabled = true; out.className = 'small adm-add-msg'; out.textContent = 'Adding…';
          try {
            const r = await api('admin_user_add', body);
            const extra = [r.user.role ? `${r.user.role}` : '', r.user.plan ? `Mathub ${r.user.plan === 'max' ? 'Max' : 'Pro'}` : '', r.allowed ? 'allowed to sign in from outside montana.edu' : ''].filter(Boolean).join(' · ');
            toast(r.how === 'invite' ? (r.invited ? `Added ${r.user.email}. They have an email to choose their password.` : `Added ${r.user.email}, but the email could not be sent. Check Email in Keys & settings.`) : `Added ${r.user.email}. Tell them their password.`, 5000);
            await this.members(el, root, '', 0);
            const m2 = $('#adm-add-msg', el); if (m2) { m2.className = 'small adm-add-msg good'; m2.textContent = `Added ${r.user.email}${extra ? ` (${extra})` : ''}.`; }
          } catch (x) {
            btn.disabled = false; out.className = 'small adm-add-msg bad'; out.textContent = x.message;
            const f = x.data && x.data.field; const box = f && $('#add-' + (f === 'password' ? 'pass' : f), form); if (box) { box.closest('.field').classList.add('bad'); box.focus(); }
          }
        });
        bind(el, {
          page: b => again(+b.dataset.p),
          plan: b => {   // give a membership: opens under the member's row
            const tr = b.closest('tr'); const open = tr.nextElementSibling && tr.nextElementSibling.classList.contains('adm-plan-row');
            $$('.adm-plan-row, .adm-badge-row', el).forEach(r => r.remove()); $$('[data-action="plan"]', el).forEach(x => x.setAttribute('aria-expanded', 'false')); if (open) return;
            const row = document.createElement('tr'); row.className = 'adm-plan-row'; row.innerHTML = '<td colspan="5"></td>'; tr.after(row); b.setAttribute('aria-expanded', 'true');
            this.planEditor(row.firstElementChild, byId.get(+b.dataset.u), r => {
              if (!r) { row.remove(); b.setAttribute('aria-expanded', 'false'); b.focus(); return; }
              again(page || 0, () => { const nb = $(`[data-action="plan"][data-u="${r.user_id}"]`, el); if (nb) nb.focus(); });
            });
          },
          badges: b => { const tr = b.closest('tr'); const open = tr.nextElementSibling && tr.nextElementSibling.classList.contains('adm-badge-row'); $$('.adm-badge-row, .adm-plan-row', el).forEach(r => r.remove()); if (open) return; const row = document.createElement('tr'); row.className = 'adm-badge-row'; row.innerHTML = '<td colspan="5"><div class="empty small">Loading…</div></td>'; tr.after(row); this.badgeEditor(row.firstElementChild, +b.dataset.u, () => { const cnt = $('[data-action="badges"]', tr); if (cnt) again(page || 0); }); },
          user: async b => { const a = b.dataset.a, body = { action: a, user_id: +b.dataset.u }; if (a === 'delete' && !confirm('Delete the account ' + b.dataset.e + ' and everything they posted? This cannot be undone.')) return; if (a === 'ban') { const days = prompt('Ban for how many days?', '30'); if (!days) return; body.days = +days; body.reason = prompt('Reason (shown to the user):', 'Breaking the community rules') || ''; } try { await api('admin_user', body); toast('Done'); again(0); } catch (e) { toast(e.message, 3500); } }
        });
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },

    async reports(el) {
      try {
        const r = await api('forum_reports');
        el.innerHTML = `<div class="panel"><div class="panel-h"><div class="panel-title">${icon('flag')} Open reports</div><span class="chip">${r.reports.length}</span></div>
          ${r.reports.length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Item</th><th>Reason</th><th>Author</th><th></th></tr></thead><tbody>${r.reports.map(x => `<tr><td><span class="chip">${x.kind === 'p' ? 'post' : 'comment'}</span> <a href="#/forum/${x.post_id}">${esc(x.snippet.slice(0, 110))}${x.snippet.length > 110 ? '…' : ''}</a>${x.removed ? ' <span class="chip bad">removed</span>' : ''}</td><td class="small">${esc(x.reason)}<div class="muted">by ${esc(x.reporter)} · ${timeAgo(x.created)}</div></td><td class="small mono">${esc(x.author)}</td><td><div class="row gap-sm" style="flex-wrap:nowrap">${x.removed ? '' : `<button class="btn xs danger" data-action="mod" data-a="remove" data-kind="${x.kind}" data-id="${x.item_id}">Remove</button>`}<button class="btn xs" data-action="ban" data-kind="${x.kind}" data-id="${x.item_id}">Ban</button>${isAdmin() ? `<button class="btn xs danger ghost" data-action="purge" data-kind="${x.kind}" data-id="${x.item_id}">Delete</button>` : ''}<button class="btn xs ghost" data-action="mod" data-a="resolve" data-report="${x.id}">Dismiss</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nothing reported. Nice community.</div>'}</div>
          <div class="panel mt-2"><div class="panel-h"><div class="panel-title">${icon('lock')} Active bans</div></div>${r.bans.length ? `<div class="table-wrap"><table class="table compact"><tbody>${r.bans.map(b => `<tr><td class="mono small">${esc(b.email)}</td><td class="small">until ${new Date(b.until * 1000).toLocaleDateString()}${b.reason ? ' · ' + esc(b.reason) : ''}</td><td><button class="btn xs" data-action="mod" data-a="unban" data-user="${b.user_id}">Unban</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No active bans.</div>'}</div>`;
        bind(el, {
          mod: async b => { const body = { action: b.dataset.a, kind: b.dataset.kind, id: +b.dataset.id || 0 }; if (b.dataset.report) body.report_id = +b.dataset.report; if (b.dataset.user) body.user_id = +b.dataset.user; if (body.action === 'remove' && !confirm('Remove this item?')) return; try { await api('forum_mod', body); toast('Done'); this.reports(el); } catch (e) { toast(e.message, 3000); } },
          ban: async b => { const days = prompt('Ban the author for how many days?', '7'); if (!days) return; const reason = prompt('Reason:', 'Breaking the community rules') || ''; try { await api('forum_mod', { action: 'ban', kind: b.dataset.kind, id: +b.dataset.id, days: +days, reason }); toast('User banned'); this.reports(el); } catch (e) { toast(e.message, 3000); } },
          purge: async b => { if (!confirm('Permanently delete this item? This cannot be undone.')) return; try { await api('admin_purge', { kind: b.dataset.kind, id: +b.dataset.id }); toast('Deleted'); this.reports(el); } catch (e) { toast(e.message, 3000); } }
        });
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },

    async contrib(el) {
      try {
        const r = await api('contrib_queue');
        el.innerHTML = `<div class="panel"><div class="panel-h"><div class="panel-title">${icon('pen')} Submissions to review</div><span class="chip">${r.items.length}</span></div>${r.items.length ? `<div class="stack">${r.items.map(i => `<div class="panel contrib" id="cq-${i.id}"><div class="fa-meta">${courseChip(i.course)}<span class="chip">${i.kind === 'card' ? 'flashcard' : 'problem'}</span>${i.sec ? `<span class="chip">§${esc(i.sec)}</span>` : i.unit ? `<span class="chip">Unit ${i.unit}</span>` : ''}<span class="sep">·</span><span class="muted small">${esc(i.author)} · ${timeAgo(i.created)}</span></div><div class="q-prompt mt-1"><b>${i.kind === 'card' ? 'Front' : 'Problem'}:</b> ${i.front}</div><div class="mt-1"><b>${i.kind === 'card' ? 'Back' : 'Answer'}:</b> ${i.back}</div>${i.explanation ? `<div class="small muted mt-1"><b>Explanation:</b> ${i.explanation}</div>` : ''}<div class="row gap-sm mt-2"><button class="btn sm primary" data-action="cm" data-a="approve" data-id="${i.id}">${icon('check', 13)} Approve</button><button class="btn sm" data-action="cm" data-a="reject" data-id="${i.id}">Reject</button><button class="btn sm danger ghost" data-action="cm" data-a="delete" data-id="${i.id}">Delete</button></div></div>`).join('')}</div>` : '<div class="empty">Queue is empty.</div>'}</div>`;
        App.typeset(el);
        bind(el, { cm: async b => { try { await api('contrib_mod', { id: +b.dataset.id, action: b.dataset.a }); toast(b.dataset.a === 'approve' ? 'Approved and published' : 'Done'); this.contrib(el); } catch (e) { toast(e.message, 3000); } } });
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },

    async mocks(el) {
      const courses = App.COURSE_ORDER.filter(id => global.Courses[id]); const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0);
      try {
        const r = await api('mock_list&course=all');
        el.innerHTML = `<div class="panel mb-2"><div class="panel-h"><div class="panel-title">${icon('flag')} Schedule a community mock exam</div></div>
          <div class="grid cols-3" style="gap:12px"><div class="field"><label for="mk-course">Class</label><select class="select" id="mk-course">${courses.map(c => `<option value="${c}">${esc(global.Courses[c].short)}</option>`).join('')}</select></div><div class="field"><label for="mk-exam">Exam topics</label><select class="select" id="mk-exam"></select></div><div class="field"><label for="mk-title">Title</label><input class="input" id="mk-title" maxlength="80" placeholder="e.g. Exam 2 mock"></div>
            <div class="field"><label for="mk-date">Date</label><input class="input" type="date" id="mk-date" value="${App.toISO(d)}" min="${App.todayISO()}"></div><div class="field"><label for="mk-time">Start</label><input class="input" type="time" id="mk-time" value="18:00"></div><div class="grid cols-2" style="gap:8px"><div class="field"><label for="mk-min">Minutes</label><input class="input" type="number" id="mk-min" value="50" min="15" max="180"></div><div class="field"><label for="mk-count">Questions</label><input class="input" type="number" id="mk-count" value="15" min="5" max="30"></div></div></div>
          <div class="row gap-sm mt-1"><button class="btn primary" data-action="mk-create">${icon('calendar', 14)} Schedule</button><span class="small muted">Everyone gets the same questions; rankings unlock when the window closes (plus a 15-minute grace period for submissions).</span></div></div>
          <div class="panel"><div class="panel-h"><div class="panel-title">${icon('list')} Scheduled and recent</div></div>${r.mocks.length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Mock</th><th>When</th><th class="num">Registered</th><th class="num">Finished</th><th></th></tr></thead><tbody>${r.mocks.map(m => `<tr><td>${courseChip(m.course)} <b>${esc(m.title)}</b> <span class="muted small">· ${m.count} q · ${m.minutes} min</span></td><td class="small">${esc(fmtWhen(m.start))} ${m.ended ? '<span class="chip">ended</span>' : m.open ? '<span class="chip good">open</span>' : ''}</td><td class="num">${m.registered}</td><td class="num">${m.results}</td><td><div class="row gap-sm" style="justify-content:flex-end"><a class="btn xs" href="#/${m.course}/mock/${m.id}">Results</a>${m.ended ? '' : `<button class="btn xs danger ghost" data-action="mk-cancel" data-id="${m.id}">Cancel</button>`}</div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">None yet.</div>'}</div>`;
        const cs = $('#mk-course', el), es = $('#mk-exam', el); const fillExams = () => { const C = global.Courses[cs.value]; es.innerHTML = C.EXAMS.map(e => `<option value="${e.id}"${e.date >= App.todayISO() && !es.dataset.set ? ' selected' : ''}>${esc(e.name)} · ${esc(e.covers.slice(0, 50))}${e.covers.length > 50 ? '…' : ''}</option>`).join(''); es.dataset.set = '1'; const nx = C.EXAMS.find(e => (e.endDate || e.date) >= App.todayISO()); if (nx) es.value = nx.id; $('#mk-title', el).value = (nx ? nx.name : C.EXAMS[0].name) + ' mock'; }; cs.addEventListener('change', fillExams); fillExams();
        bind(el, {
          'mk-create': async b => { const start = Math.floor(new Date($('#mk-date', el).value + 'T' + $('#mk-time', el).value).getTime() / 1000); b.disabled = true; try { await api('mock_create', { course: cs.value, exam_id: es.value, title: $('#mk-title', el).value, start, minutes: +$('#mk-min', el).value, count: +$('#mk-count', el).value }); toast('Mock exam scheduled'); this.mocks(el); } catch (e) { b.disabled = false; toast(e.message, 3500); } },
          'mk-cancel': async b => { if (!confirm('Cancel this mock exam?')) return; try { await api('mock_cancel', { id: +b.dataset.id }); this.mocks(el); } catch (e) { toast(e.message); } }
        });
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },

    async settings(el) {
      try {
        const st = await api('admin_stats'); const s = st.settings;
        el.innerHTML = `<div class="panel mb-2"><div class="panel-h"><div class="panel-title">${icon('canvas')} Canvas calendar feed</div></div>
            <div class="row gap-sm"><input class="input mono" id="adm-canvas" placeholder="https://montana.instructure.com/feeds/calendars/user_….ics" value="${esc(s.canvas_feed || '')}" ${s.canvas_from_config ? 'disabled' : ''} style="flex:1;min-width:240px"><button class="btn sm primary" data-action="save" data-k="canvas_feed" data-i="adm-canvas" ${s.canvas_from_config ? 'disabled' : ''}>Save &amp; sync</button></div>
            <p class="small muted mt-1">${s.canvas_from_config ? 'Set in api/config.php, so it cannot be changed here.' : 'In Canvas: Calendar → “Calendar Feed” → copy the link. Due dates for the mapped classes then show on every dashboard, refreshed hourly.'} ${s.canvas.configured ? `Last sync: ${s.canvas.fetched ? timeAgo(s.canvas.fetched) : 'never'} · ${s.canvas.count} events${s.canvas.error ? ` · <span style="color:var(--bad)">${esc(s.canvas.error)}</span>` : ''}` : ''}</p></div>
          <div class="panel mb-2"><div class="panel-h"><div class="panel-title">${icon('flag')} Announcement banner</div></div><div class="row gap-sm"><input class="input" id="adm-ann" maxlength="240" value="${esc(s.announcement || '')}" placeholder="Shown on the landing page and dashboards until each student dismisses it. Leave empty to hide." style="flex:1;min-width:240px"><button class="btn sm" data-action="save" data-k="announcement" data-i="adm-ann">Save</button></div></div>
          <div class="panel"><div class="panel-h"><div class="panel-title">${icon('shield')} Verified instructors and TAs</div></div><p class="small muted mb-2">Their posts and comments show an Instructor or TA badge. They still need a normal account (the email must be allowed to sign up; add it to <code>extra_allowed_emails</code> in config if it is not a montana.edu address).</p>
            <div class="row gap-sm"><input class="input" id="adm-role-email" type="email" placeholder="name@montana.edu" style="max-width:280px"><select class="select" id="adm-role" style="max-width:160px"><option value="Instructor">Instructor</option><option value="TA">TA</option></select><button class="btn sm primary" data-action="role-add">Add</button></div>
            <div class="mt-2">${st.roles.length || Object.keys(st.staff_config).length ? `<table class="table compact"><tbody>${Object.entries(st.staff_config).map(([e, r]) => `<tr><td class="mono small">${esc(e)}</td><td><span class="chip staff">${esc(r)}</span></td><td class="small muted">from config.php</td></tr>`).join('')}${st.roles.map(r => `<tr><td class="mono small">${esc(r.email)}</td><td><span class="chip staff">${esc(r.role)}</span></td><td><button class="btn xs ghost" data-action="role-del" data-e="${esc(r.email)}">Remove</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty small">No staff badges yet.</div>'}</div></div>`;
        bind(el, {
          save: async b => { const value = $('#' + b.dataset.i, el).value.trim(); b.disabled = true; try { const r = await api('admin_setting', { key: b.dataset.k, value }); if (App.Canvas) { App.Canvas.data = null; App.Canvas.at = 0; } toast(r.canvas ? (r.canvas.error ? r.canvas.error : `Synced ${r.canvas.count} Canvas events`) : 'Saved', 4000); this.settings(el); } catch (e) { b.disabled = false; toast(e.message, 4000); } },
          'role-add': async () => { try { await api('admin_role', { email: $('#adm-role-email', el).value.trim(), role: $('#adm-role', el).value }); toast('Saved'); this.settings(el); } catch (e) { toast(e.message, 3500); } },
          'role-del': async b => { try { await api('admin_role', { email: b.dataset.e, role: '' }); this.settings(el); } catch (e) { toast(e.message); } }
        });
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },

    /* Keys & settings: every setting the server reads, by group. Keys and passwords are never shown, only whether
       one is set (and its last four characters); a new one replaces it. Saving asks for the administrator's password. */
    async config(el) {
      let r; try { r = await api('admin_config'); } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
      const CHECK = { ai: ['ai', 'Check the keys'], pay: ['pay', 'Check RevenueCat'], mail: ['mail', 'Send me a test email'] };
      const from = f => f.from === 'panel' ? '<span class="chip xs accent">set here</span>' : f.from === 'file' ? '<span class="chip xs">from the config file</span>' : '<span class="chip xs warn">not set</span>';
      const id = k => 'cfg-' + k;
      const input = f => {
        const a = `id="${id(f.key)}" data-k="${esc(f.key)}" aria-describedby="${id(f.key)}-h"`;
        if (f.type === 'secret') return `<div class="cfg-secret"><input class="input mono" type="password" autocomplete="new-password" spellcheck="false" ${a} placeholder="${f.set ? `Set, ends in ${esc(f.hint)}. Paste a new one to replace it` : 'Not set. Paste it here'}"><button type="button" class="icon-btn" data-action="cfg-eye" aria-label="Show what you typed" aria-pressed="false">${icon('eye', 15)}</button></div>`;
        if (f.type === 'select') return `<select class="select" ${a}>${f.options.map(o => `<option value="${esc(o)}"${o === f.value ? ' selected' : ''}>${esc(f.key === 'digest_day' ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][+o] : o)}</option>`).join('')}</select>`;
        if (['emails', 'domains', 'grants'].includes(f.type)) return `<textarea class="input mono" rows="${Math.min(6, Math.max(2, (f.value || '').split('\n').length + 1))}" spellcheck="false" ${a}>${esc(f.value || '')}</textarea>`;
        return `<input class="input${['url', 'host', 'model', 'email', 'text'].includes(f.type) && f.type !== 'text' ? ' mono' : ''}" type="${f.type === 'int' ? 'number' : f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : 'text'}"${f.range ? ` min="${f.range[0]}" max="${f.range[1]}"` : ''} value="${esc(f.value || '')}" ${a}>`;
      };
      el.innerHTML = `<div class="callout small mb-2">${icon('lock', 14)} Keys and passwords are kept on the server and never shown again: you only see whether each one is set and its last four characters. What you save here takes the place of <code>config.local.php</code>; <b>Use the file's value</b> goes back to it. Saving asks for your password, and every change is logged (which setting, who and when, never the value).${r.writable ? '' : ' <b>The data folder is not writable, so nothing can be saved.</b>'}</div>
        ${r.groups.map(g => `<section class="panel mb-2 cfg-group" aria-labelledby="cfg-h-${g.id}"><div class="panel-h"><h2 class="panel-title" id="cfg-h-${g.id}">${esc(g.title)}</h2>${CHECK[g.id] ? `<button type="button" class="btn sm" data-action="cfg-test" data-w="${CHECK[g.id][0]}">${icon('check', 13)} ${CHECK[g.id][1]}</button>` : ''}</div>
          ${CHECK[g.id] ? `<div class="cfg-results" id="cfg-res-${g.id}" role="status" aria-live="polite"></div>` : ''}
          <div class="cfg-grid">${g.fields.map(f => `<div class="cfg-field${['emails', 'domains', 'grants'].includes(f.type) || f.type === 'secret' ? ' wide' : ''}" data-f="${esc(f.key)}"><div class="cfg-lab"><label for="${id(f.key)}">${esc(f.label)}</label>${from(f)}</div>${input(f)}<p class="cfg-help" id="${id(f.key)}-h">${esc(f.help || '')}${f.from === 'panel' ? ` <button type="button" class="linkbtn small" data-action="cfg-clear" data-k="${esc(f.key)}">Use the file's value</button>` : ''}</p></div>`).join('')}</div></section>`).join('')}
        <section class="panel mb-2" aria-labelledby="cfg-log-h"><div class="panel-h"><h2 class="panel-title" id="cfg-log-h">${icon('clock')} Recent changes</h2></div>${r.log.length ? `<ul class="cfg-log">${r.log.map(x => `<li><b>${esc(x.label)}</b> ${x.action === 'cleared' ? 'back to the file’s value' : 'changed'} · ${esc(x.by || 'a removed account')} · <span class="muted">${timeAgo(x.at)}</span></li>`).join('')}</ul>` : '<p class="small muted">Nothing changed here yet.</p>'}</section>
        <form class="cfg-bar" id="cfg-bar" hidden><span class="cfg-count" id="cfg-count" role="status"></span><label class="sr-only" for="cfg-pass">Your password</label><input class="input" type="password" id="cfg-pass" autocomplete="current-password" placeholder="Your password" required><button type="submit" class="btn primary">Save changes</button><button type="button" class="btn ghost" data-action="cfg-undo">Discard</button></form>`;
      const orig = {}; r.groups.forEach(g => g.fields.forEach(f => { orig[f.key] = f; }));
      const clear = new Set(); const bar = $('#cfg-bar', el);
      const changes = () => {
        const values = {};
        $$('[data-k]', el).forEach(x => { if (!x.matches('input, select, textarea')) return; const f = orig[x.dataset.k]; const v = x.value; if (f.type === 'secret' ? v.trim() !== '' : v.trim() !== String(f.value || '').trim()) values[f.key] = v; });
        return values;
      };
      const paint = () => { const n = Object.keys(changes()).length + clear.size; bar.hidden = !n; $('#cfg-count', el).textContent = `${n} change${n === 1 ? '' : 's'}`; $$('.cfg-field', el).forEach(d => d.classList.toggle('dirty', d.dataset.f in changes() || clear.has(d.dataset.f))); };
      el.addEventListener('input', e => { if (e.target.closest('[data-k]')) paint(); });
      el.addEventListener('change', e => { if (e.target.closest('[data-k]')) paint(); });
      bind(el, {
        'cfg-eye': b => { const i = b.previousElementSibling; const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'Hide what you typed' : 'Show what you typed'); },
        'cfg-clear': b => { const k = b.dataset.k; if (clear.has(k)) { clear.delete(k); b.textContent = "Use the file's value"; } else { clear.add(k); b.textContent = 'Keep the value set here'; } paint(); },
        'cfg-undo': () => this.config(el),
        'cfg-test': async b => {
          const w = b.dataset.w; const box = $('#cfg-res-' + (w === 'ai' ? 'ai' : w === 'pay' ? 'pay' : 'mail'), el); b.disabled = true; box.innerHTML = `<p class="small muted">${icon('rotate', 13)} Checking…</p>`;
          try { const t = await api('admin_config_test', { what: w }); const rows = t.results || [{ name: '', pass: t.pass, message: t.message }]; box.innerHTML = rows.map(x => `<p class="cfg-res ${x.pass ? 'ok' : 'bad'}">${icon(x.pass ? 'check' : 'x', 14)} ${x.name ? `<b>${esc(x.name)}:</b> ` : ''}${esc(x.message)}</p>`).join(''); }
          catch (e) { box.innerHTML = `<p class="cfg-res bad">${icon('x', 14)} ${esc(e.message)}</p>`; }
          b.disabled = false;
        }
      });
      bar.addEventListener('submit', async e => {
        e.preventDefault(); const pass = $('#cfg-pass', el); const btn = $('button[type="submit"]', bar); btn.disabled = true;
        $$('.cfg-field.bad', el).forEach(d => d.classList.remove('bad'));
        try {
          const res = await api('admin_config_save', { password: pass.value, values: changes(), clear: [...clear] });
          toast(res.changed.length ? `Saved: ${res.changed.length} setting${res.changed.length === 1 ? '' : 's'} changed.` : 'Nothing changed.', 3500); this.config(el);
        } catch (x) {
          btn.disabled = false; const f = x.data && x.data.field; toast(x.message, 5000);
          if (f === 'password') { pass.value = ''; pass.focus(); } else if (f) { const d = $(`.cfg-field[data-f="${f}"]`, el); if (d) { d.classList.add('bad'); const i = $('[data-k]', d); if (i) i.focus(); } }
        }
      });
    },

    async digest(el) {
      try {
        const st = await api('admin_stats');
        el.innerHTML = `<div class="panel mb-2"><div class="panel-h"><div class="panel-title">${icon('clock')} Weekly digest</div><span class="chip ${st.digest_window ? 'good' : ''}">${st.digest_window ? 'sending window open' : 'next window: Sunday 5 pm'}</span></div>
            <p class="small">Every member who has not turned it off gets one email a week: what is due (from Canvas), the most upvoted posts, their own stats against the class average, and upcoming sessions and mock exams. Sent this week: <b>${st.digest_sent_week}</b>.</p>
            <p class="small muted">Emails go out a few at a time whenever someone uses the site during the window. For a reliable Sunday send, add a cron job in hPanel (Advanced → Cron Jobs) that runs every 10 minutes on Sunday evening:</p>
            <pre class="mono small" style="white-space:pre-wrap;background:var(--surface-2);padding:10px;border-radius:8px">curl -s "https://mathub.space/api/index.php?r=cron&amp;key=YOUR_CRON_KEY"</pre>
            <p class="small muted">Set <code>cron_key</code> in <code>api/config.local.php</code> to any long random string and use the same value in the URL. ${st.cron_configured ? '<span class="chip good">cron key set</span>' : '<span class="chip warn">cron key not set</span>'} The cron call also refreshes the Canvas cache and prunes old presence rows.</p>
            <div class="row gap-sm mt-2"><button class="btn sm primary" data-action="test">${icon('reply', 13)} Send me a test digest now</button></div></div>`;
        bind(el, { test: async b => { b.disabled = true; try { const r = await api('admin_digest_test', {}); toast(r.message, 4000); } catch (e) { toast(e.message, 5000); } b.disabled = false; } });
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    }
  };
})(window);

/* Simpler screens: the sidebar in five groups, the start page in four (hero, classes and next step, explore; a first visit sees its classes before the steps), the class dashboard with five tabs, a quiet top bar for newcomers, and the one-line preview note. */
const T = require('./lib');
(async () => {
  const { mk, go, log, check, hscroll } = await T.start({});
  const [c, p] = await mk(1360, 900, { serviceWorkers: 'block' });

  // start page, first visit as a guest
  await go(p, '#/', 1200);
  const land = await p.evaluate(() => {
    const secs = [...document.querySelectorAll('.landing-wrap > .land-sec > .sec-title, .landing-wrap > .land-sec > .sec-h > .sec-title')].map(h => h.textContent.trim());
    const hero = [...document.querySelectorAll('.landing-top .hero-actions > *')].map(e => e.id || e.className.split(' ').filter(c => c !== 'btn' && c !== 'sm').join('.'));
    const quick = [...document.querySelectorAll('.land-next .quick-row > *')].map(e => e.textContent.trim());
    const card = document.querySelector('.course-card.calc');
    return { secs, hero, quick, focus: !!document.querySelector('.land-next .hero-focus'), dice: !!document.querySelector('.land-next [data-roll="all"]'), steps: document.querySelectorAll('.start-steps .start-step').length, ticker: !!document.querySelector('#landing-ticker'), meta: card.querySelectorAll('.course-meta > div').length, buttons: card.querySelectorAll('.course-foot .btn').length, tabs: [...document.querySelectorAll('.landing-tabs .tab')].map(t => t.dataset.tab), guides: document.querySelectorAll('.pane[data-pane="guides"] .guides-strip .guide-card').length, strip: !!document.querySelector('.pane[data-pane="inside"] .stat-strip'), presence: !!document.querySelector('.pane[data-pane="community"] #landing-presence'), league: !!document.querySelector('.pane[data-pane="community"] .league-slot') };
  });
  log('start page:', JSON.stringify(land));
  check('start page reads in four groups: hero, then a first visit sees classes before the steps, explore', land.secs.join('|') === 'Your classes|Start here|Explore', land.secs);
  check('the hero keeps six controls: Today, For professors, search, focus sounds, account, theme', land.hero.length === 6 && /hero-today/.test(land.hero[0]) && land.hero[1] === 'hero-faculty' && land.hero.some(c => /amb-top/.test(c)) && land.hero.includes('landing-account'), land.hero);
  check('Focus, the d20, GPA and class picking sit together under the next step', land.focus && land.dice && land.quick.length === 4, land.quick);
  check('first-time visitors get three numbered steps', land.steps === 3);
  check('no scrolling ticker', !land.ticker);
  check('class cards show two facts and one button', land.meta === 2 && land.buttons === 1, { meta: land.meta, buttons: land.buttons });
  check('explore tabs: this week, community, guides, what is inside', land.tabs.join(',') === 'week,community,guides,inside', land.tabs);
  check('guides, the stat strip, presence and the league moved into tabs', land.guides === 3 && land.strip && land.presence && land.league, land);

  // top bar and preview note on a class page
  await go(p, '#/calc', 1500);
  const top = await p.evaluate(() => { const b = document.querySelector('#preview-banner'); const vis = s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }; return { bell: vis('#notif-btn'), hub: vis('#topbar-hub'), bannerBtns: b ? b.querySelectorAll('.btn').length : -1, signup: b ? !!b.querySelector('[data-action="b-signup"]') : false, hide: b ? !!b.querySelector('[data-action="b-hide"]') : false }; });
  check('guests do not see the inbox bell', !top.bell, top);
  check('newcomers do not see streak and XP widgets yet', !top.hub, top);
  check('the preview note is one line with a sign-up link and a close button', top.bannerBtns === 0 && top.signup && top.hide, top);
  await p.click('#preview-banner [data-action="b-hide"]'); await p.waitForTimeout(150); await p.reload(); await p.waitForTimeout(1200);
  check('closing the preview note sticks', !(await p.$('#preview-banner')));

  // sidebar: five groups, Study and Plan open, every tool listed once
  const nav = await p.evaluate(() => ({ groups: [...document.querySelectorAll('#sidebar-nav .nav-label')].map(l => [l.dataset.g, l.classList.contains('open')]), items: [...document.querySelectorAll('#sidebar-nav .nav-item')].map(b => b.dataset.view), all: App.D.NAV.flatMap(g => g.items.map(x => x[0])) }));
  log('sidebar:', JSON.stringify(nav.groups));
  check('sidebar has five groups by intent', nav.groups.map(g => g[0]).join('|') === 'Study|Plan|More tools|Community|Class info', nav.groups);
  check('only Study and Plan start open', nav.groups.filter(g => g[1]).map(g => g[0]).join('|') === 'Study|Plan', nav.groups);
  check('every tool appears exactly once', nav.items.length === new Set(nav.items).size && nav.all.every(id => nav.items.includes(id)), { items: nav.items.length, all: nav.all.length });

  // class dashboard: two panels up top, five tabs, readiness one click away
  const dash = await p.evaluate(() => ({ main: [...document.querySelectorAll('.dash-main > .panel .panel-title')].map(t => t.textContent.trim()), tabs: [...document.querySelectorAll('#view .dash-tabs .tab')].map(t => t.dataset.tab), coach: !!document.querySelector('#view .mascot-slot.coach'), readyShown: (() => { const r = document.querySelector('.ready-panel'); return !!r && !r.closest('.pane[hidden]'); })(), line: (document.querySelector('.hero-exam .ready-line') || {}).textContent || '', quests: !!document.querySelector('.pane[data-pane="progress"] .quests-slot'), league: !!document.querySelector('.pane[data-pane="progress"] .league-slot'), canvas: !!document.querySelector('.pane[data-pane="week"] #dash-canvas'), roll: !!document.querySelector('.page-actions [data-roll="calc"]') }));
  log('dashboard:', JSON.stringify(dash));
  check('dashboard opens on two panels: Today and Keep going', dash.main.length === 2 && /Today/.test(dash.main[0]) && /Keep going/.test(dash.main[1]), dash.main);
  check('five tabs: this week, readiness, progress, planner, community', dash.tabs.join(',') === 'week,ready,progress,plan,community', dash.tabs);
  check('no extra mascot on the dashboard, the d20 stays', !dash.coach && dash.roll, dash);
  check('the exam card sums up readiness in one line', /% ready/.test(dash.line) && /How to raise it/.test(dash.line), dash.line);
  check('quests and the league live in Progress, Canvas in This week', dash.quests && dash.league && dash.canvas, dash);
  await p.click('.ready-line [data-action="tab-ready"]'); await p.waitForTimeout(300);
  check('"How to raise it" opens the Readiness tab', await p.evaluate(() => { const r = document.querySelector('.ready-panel'); return !!r && !r.closest('.pane[hidden]') && document.querySelectorAll('.ready-tip').length === 3; }));
  await p.evaluate(() => App.setSetting('dashTab', 'week'));

  // after some studying the start page switches to "Your next step" and the widgets appear
  await p.evaluate(() => { App.addXP(10, { course: 'calc', silent: true }); const s = App.settings(); s.lastVisit = { hash: '#/calc/notes/1.3', label: 'Calc I · Notes', course: 'calc', t: Date.now() - 3600000 }; localStorage.setItem('studyhub-settings', JSON.stringify(s)); });
  await go(p, '#/', 1200);
  const back = await p.evaluate(() => ({ title: document.querySelector('.land-next .sec-title').textContent.trim(), steps: !!document.querySelector('.start-steps'), resume: !!document.querySelector('.land-next .resume-card'), hub: (() => { const h = document.querySelector('.landing-top .hub-slot'); return !!h && getComputedStyle(h).display !== 'none'; })() }));
  check('returning students see "Your next step" with a resume card', back.title === 'Your next step' && !back.steps && back.resume, back);
  check('streak and XP widgets appear once there is something to show', back.hub, back);
  await c.close();

  // phones
  const [cm, m] = await mk(390, 844, { serviceWorkers: 'block' });
  await go(m, '#/', 1200); check('phone: start page does not scroll sideways', await hscroll(m));
  const cta = await m.evaluate(() => { const b = document.querySelector('.course-card.calc .course-open'); return b.scrollWidth <= b.clientWidth + 1; });
  check('phone: class buttons are not cut off', cta);
  await go(m, '#/calc', 1400); check('phone: dashboard does not scroll sideways', await hscroll(m));
  await cm.close();
  await T.finish();
})();

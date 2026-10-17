const T = require('./lib');
(async () => {
  const { browser, base, errors, mk, txt, login, api, hscroll, go, log, check } = await T.start({ dialogText: 'Fixed it, thanks' });

  const [c, p] = await mk(); await go(p, '#/'); await login(p, 'alice.a@montana.edu'); await p.reload(); await p.waitForTimeout(1500); if (await p.$('.celebrate')) await p.keyboard.press('Escape');
  await p.evaluate(() => { const s = App.settings(); s.courses = ['calc', 'physics', 'csci']; localStorage.setItem('studyhub-settings', JSON.stringify(s)); });
  // seed some flashcard history so cards are due
  await p.evaluate(() => { App.store.poke('calc', d => { d.flashcards = d.flashcards || {}; d.fcAt = d.fcAt || {}; const keys = Object.keys(d.flashcards); for (let i = 0; i < 3; i++) { d.flashcards['c' + i] = 1; d.fcAt['c' + i] = Date.now() - 3 * 86400000; } }); });
  await go(p, '#/'); log('landing today card:', await txt(p, '.today-card'), '| search icon in hero:', !!(await p.$('[data-action="search"]')));
  await go(p, '#/today'); log('today title:', await txt(p, '.landing-title'), '| plan items:', (await p.$$('#td-plan .td-item')).length, '| class rows:', (await p.$$('#td-classes tr')).length, '| quests slot painted:', (await txt(p, '.quests-slot')).length > 5, '| hub painted:', !!(await p.$('.td-hero .hub-slot .streak-chip')));
  log('plan text:', (await txt(p, '#td-plan')).slice(0, 400));
  log('classes:', (await txt(p, '#td-classes')).slice(0, 300));
  const rb = await p.$('[data-action="td-review"]'); log('review button:', !!rb);
  if (rb) { await rb.click(); await p.waitForTimeout(400); log('review open:', await p.$eval('#td-review', e => !e.hidden), '| card:', (await txt(p, '#td-card')).slice(0, 120)); await p.keyboard.press(' '); await p.waitForTimeout(200); log('flipped -> good/again buttons:', !!(await p.$('[data-action="td-good"]')), !!(await p.$('[data-action="td-again"]'))); await p.click('[data-action="td-good"]'); await p.waitForTimeout(300); log('after grade card text:', (await txt(p, '#td-card')).slice(0, 80), '| fcAt set:', await p.evaluate(() => Object.keys(App.store.peek('calc').fcAt || {}).length)); await p.click('[data-action="td-stop"]'); await p.waitForTimeout(300); log('stopped:', await p.$eval('#td-review', e => e.hidden)); }
  // flag on flashcards page + notes
  await go(p, '#/calc/flashcards'); log('flashcard flag:', !!(await p.$('.q-flag')));
  await go(p, '#/calc/notes/1.3'); log('notes flag:', !!(await p.$('.q-flag')));
  await p.click('.q-flag'); await p.waitForTimeout(300); log('report modal:', !!(await p.$('#report-modal')), '| where:', await txt(p, '#report-modal .small.muted'));
  await p.selectOption('#rp-reason', 'typo'); await p.fill('#rp-text', 'Test report from the browser test'); await p.click('#rp-send'); await p.waitForTimeout(800); log('report sent (modal gone):', !(await p.$('#report-modal')), '| toast:', await txt(p, '.toast'));
  await go(p, '#/calc/practice'); await p.waitForTimeout(600); log('practice flag:', !!(await p.$('.q-top .q-flag')), '| ctx:', await p.$eval('.q-top .q-flag', e => e.dataset.ctx.slice(0, 100)).catch(() => 'n/a'));
  await go(p, '#/calc/lesson?n=2'); await p.waitForTimeout(600); log('lesson flag:', !!(await p.$('.q-flag')));
  // global search
  await go(p, '#/'); await p.keyboard.press('Control+k'); await p.waitForTimeout(300); log('search modal from landing:', !!(await p.$('#search-modal')), '| chips:', await p.$$eval('#search-chips .chip', c => c.map(x => x.textContent.trim() + (x.classList.contains('on') ? '*' : '')).join(',')));
  await p.fill('#search-input', 'derivative'); await p.waitForTimeout(300); log('results:', (await p.$$('.search-item')).length, '| first:', (await txt(p, '.search-item')).slice(0, 100));
  await p.fill('#search-input', 'velocity'); await p.click('#search-chips .chip[data-c="physics"]'); await p.waitForTimeout(300); log('physics chip results:', (await p.$$('.search-item')).length, '| first:', (await txt(p, '.search-item')).slice(0, 100));
  await p.fill('#search-input', 'loop'); await p.click('#search-chips .chip[data-c="csci"]'); await p.waitForTimeout(300); log('csci loop results:', (await p.$$('.search-item')).length, '| first:', (await txt(p, '.search-item')).slice(0, 100)); await p.keyboard.press('Escape');
  // account menu
  await go(p, '#/'); await p.click('.landing-top [data-action="acct-toggle"]'); await p.waitForTimeout(300); log('menu items:', await p.$$eval('.pop-account .acct-dd-item', a => a.map(x => x.textContent.trim()).join(' | ')), '| dot:', !!(await p.$('.pop-account .menu-dot')));
  await p.click('.pop-account a[href="#/whatsnew"]'); await p.waitForTimeout(500); log('whatsnew:', await txt(p, '.landing-title'), '| entries:', (await p.$$('.changelog .panel')).length, '| seen:', await p.evaluate(() => App.settings().seenChangelog));
  // prefs sync
  await p.evaluate(() => App.setSetting('dailyGoal', 55)); await p.waitForTimeout(3200); const pr = await api(p, 'prefs'); log('prefs on server:', pr.status, JSON.stringify(pr.json && pr.json.prefs && { dailyGoal: pr.json.prefs.dailyGoal, seen: pr.json.prefs.seenChangelog }), '| updated:', pr.json && pr.json.updated > 0);
  const stale = await api(p, 'prefs', { prefs: { dailyGoal: 1 }, updated: 5 }, 'PUT'); log('stale put rejected:', stale.json && stale.json.stale === true);
  // push routes
  const pk = await api(p, 'push_key'); log('push_key:', pk.status, pk.json && pk.json.key && pk.json.key.length);
  const ps = await api(p, 'push_subscribe', { endpoint: 'https://example.invalid/push/abc', keys: { p256dh: 'BAAA', auth: 'xyz' } }); log('push_subscribe:', ps.status, JSON.stringify(ps.json));
  const pst = await api(p, 'push_status'); log('push_status:', JSON.stringify(pst.json));
  const pp = await api(p, 'push_pending'); log('push_pending:', pp.status, JSON.stringify(pp.json).slice(0, 120));
  const pu = await api(p, 'push_unsubscribe', { endpoint: 'https://example.invalid/push/abc' }); log('push_unsubscribe:', JSON.stringify(pu.json));
  // settings panel push section
  await go(p, '#/settings'); await p.waitForTimeout(800); log('push section:', await txt(p, '#acct-push-note'), '| checkbox present:', !!(await p.$('#acct-push')));
  // empty states
  await p.evaluate(() => { const d = document.createElement('div'); d.className = 'empty'; d.id = 'e1'; d.textContent = 'Nothing here yet.'; document.querySelector('#view').appendChild(d); const l = document.createElement('div'); l.className = 'empty'; l.id = 'e2'; l.textContent = 'Loading…'; document.querySelector('#view').appendChild(l); }); await p.waitForTimeout(200);
  log('empty gets Bo:', await p.$eval('#e1', e => e.classList.contains('bo') && !!e.querySelector('svg')), '| loading gets skeleton:', await p.$eval('#e2', e => e.classList.contains('skel')));
  // install prompt logic
  log('visits counted:', await p.evaluate(() => App.settings().visits), '| installAvailable:', await p.evaluate(() => App.installAvailable()));
  await c.close();

  // admin: Problems + Backups
  const [ca, a] = await mk(); await go(a, '#/'); await login(a, 'admin.user@montana.edu'); await a.reload(); await a.waitForTimeout(1200); if (await a.$('.celebrate')) { await a.keyboard.press('Escape'); await a.waitForTimeout(300); }   // a league promotion can greet the account after the week rolls over
  await go(a, '#/admin'); await a.waitForTimeout(800);
  log('admin tabs:', await a.$$eval('.admin-tab', t => t.map(x => x.textContent.trim()).join(',')).catch(() => 'n/a'), '| issues tile:', (await txt(a, '#view')).includes('open report') || (await txt(a, '#view')).match(/report/i) !== null);
  await go(a, '#/admin/issues'); await a.waitForTimeout(800); log('issues list:', (await a.$$('.issue')).length, '| first:', (await txt(a, '.issue')).slice(0, 200));
  const resolveBtn = await a.$('[data-action="is-resolve"]'); if (resolveBtn) { await resolveBtn.click(); await a.waitForTimeout(800); log('after resolve open count:', (await a.$$('.issue')).length); await a.click('[data-action="is-filter"][data-s="resolved"]'); await a.waitForTimeout(600); log('resolved list:', (await a.$$('.issue.resolved')).length); }
  await go(a, '#/admin/backups'); await a.waitForTimeout(800); log('backups panel:', (await txt(a, '#view .panel-title')).slice(0, 40), '| rows before:', (await a.$$('#view tbody tr')).length);
  await a.click('[data-action="bk-now"]'); await a.waitForTimeout(1200); log('rows after backup:', (await a.$$('#view tbody tr')).length, '| first row:', (await txt(a, '#view tbody tr')).slice(0, 100));
  const dl = await a.$eval('#view tbody tr a', x => x.getAttribute('href')); const dres = await a.evaluate(async h => { const r = await fetch(h, { credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub' } }); return { status: r.status, type: r.headers.get('content-type'), len: +r.headers.get('content-length'), disp: r.headers.get('content-disposition') }; }, dl); log('download:', JSON.stringify(dres));
  const bad = await a.evaluate(async () => { const r = await fetch('api/index.php?r=admin_backup_download&file=../mathub.sqlite', { credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub' } }); return r.status; }); log('traversal blocked:', bad);
  const inbox = await api(a, 'push_test', {}); log('push_test (no subs):', JSON.stringify(inbox.json));
  await ca.close();
  // alice inbox has resolution notification
  const [c2, p2] = await mk(); await go(p2, '#/'); await login(p2, 'alice.a@montana.edu'); const nb = await api(p2, 'notifications'); log('alice notifications:', JSON.stringify(nb.json && (nb.json.items || nb.json.notifications || nb.json).slice ? (nb.json.items || nb.json.notifications || []).slice(0, 1) : nb.json).slice(0, 200));
  await go(p2, '#/forum/inbox'); await p2.waitForTimeout(800); log('inbox text:', (await txt(p2, '#view')).slice(0, 300));
  // non-mod cannot access admin issues
  const nm = await api(p2, 'admin_issues'); log('non-mod admin_issues:', nm.status);
  await c2.close();
  // mobile today
  const [cm, m] = await mk(390, 760); await m.goto(base + '#/today'); await m.waitForTimeout(900); log('mobile today no hscroll:', await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '| tab bar Today active:', await m.$$eval('#tabbar .tab-item.active', t => t.map(x => x.textContent.trim()).join(',')));
  await cm.close();
  await T.finish();
})();

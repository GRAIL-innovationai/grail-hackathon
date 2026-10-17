/* Calendar feed and token, invite links and join page, planning-email pref, focus together room, class goals, announcements, admin growth tab, section boards. */
const T = require('./lib');
(async () => {
  const { mk, login, go, log, check, txt, api } = await T.start({ dialogText: 'ok' });
  const [c, p] = await mk(1360, 900, { serviceWorkers: 'block' }); await go(p, '#/', 600); await login(p, 'alice.a@montana.edu'); await p.reload(); await p.waitForTimeout(1500); if (await p.$('.celebrate')) await p.keyboard.press('Escape');
  await p.evaluate(() => { const s = App.settings(); s.courses = ['calc', 'physics']; localStorage.setItem('studyhub-settings', JSON.stringify(s)); });
  // settings: calendar + invite + prefs
  await go(p, '#/settings', 1500); check('calendar link shown', (await p.$eval('#acct-ics', e => e.value).catch(() => '')).includes('r=ics&t='));
  const icsUrl = await p.$eval('#acct-ics', e => e.value); const ics = await p.evaluate(async u => { const r = await fetch(u); return { status: r.status, type: r.headers.get('content-type'), n: ((await r.text()).match(/BEGIN:VEVENT/g) || []).length }; }, icsUrl); check('ics feed serves events', ics.status === 200 && /text\/calendar/.test(ics.type) && ics.n > 50, ics);
  check('invite link shown', (await p.$eval('#acct-invlink', e => e.value).catch(() => '')).includes('#/join?ref='));
  if (!(await p.$eval('#acct-planning', e => e.checked))) await p.click('#acct-planning'); await p.waitForTimeout(800); const me = await api(p, 'me'); check('planning email pref saved', me.json.user.planning_email === true, me.json.user.planning_email);
  // join page
  const code = (await p.$eval('#acct-invlink', e => e.value)).split('ref=')[1]; await p.evaluate(() => { localStorage.removeItem('mathub-ref'); }); await p.evaluate(async () => { await fetch('api/index.php?r=logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub' } }); }); await p.reload(); await p.waitForTimeout(800);
  await go(p, '#/join?ref=' + code, 1200); check('join page names the inviter', (await txt(p, '#join-sub')).includes('Alice') && !!(await p.$('#join-card [data-action="auth-signup"]')), await txt(p, '#join-sub'));
  check('ref remembered', (await p.evaluate(() => localStorage.getItem('mathub-ref'))) === code);
  await go(p, '#/', 800); check('landing invite banner', (await txt(p, '#view')).includes('invited you'));
  // focus together
  await login(p, 'alice.a@montana.edu'); await p.reload(); await p.waitForTimeout(1200); if (await p.$('.celebrate')) await p.keyboard.press('Escape');
  await go(p, '#/focus', 900); await p.fill('#fz-task', 'Chain rule set'); await p.click('[data-action="fz-start"]'); await p.waitForTimeout(1200); const room = await api(p, 'focus_room'); check('focus ping registers in the room', room.json.count >= 1 && room.json.now.some(x => x.task === 'Chain rule set'), room.json);
  check('room panel shows me', (await txt(p, '#fz-room')).includes('(you)'));
  await p.click('[data-action="fz-stop"]'); await p.waitForTimeout(600); const room2 = await api(p, 'focus_room'); check('stop removes me from the room', !room2.json.now.some(x => x.me));
  // dashboard extras: announcements + class goal
  await go(p, '#/calc', 1500); check('class goal panel on dashboard', !!(await p.$('#dc-goal .goal-panel')), (await txt(p, '#dc-goal')).slice(0, 80));
  // admin: announcement post + growth tab
  await p.evaluate(async () => { await fetch('api/index.php?r=logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub' } }); }); await login(p, 'admin.user@montana.edu'); await p.reload(); await p.waitForTimeout(1200); if (await p.$('.celebrate')) await p.keyboard.press('Escape');
  await go(p, '#/calc', 1500); check('staff sees post button', !!(await p.$('[data-action="ann-new"]')));
  const calls = await p.evaluate(() => new Promise(res => { let n = 0; const orig = App.social.extras; App.social.extras = function () { n++; return orig.apply(this, arguments); }; setTimeout(() => { App.social.extras = orig; res(n); }, 3000); })); log('  extras re-renders in 3s:', calls);
  await p.evaluate(() => document.querySelector('[data-action="ann-new"]').click()); await p.waitForTimeout(300); await p.fill('#an-text', 'Office hours moved to Thursday 2 pm this week.'); await p.click('form.modal button[type="submit"]'); await p.waitForTimeout(900); check('announcement posted and shown', (await txt(p, '#dc-ann')).includes('Office hours moved'));
  await go(p, '#/admin/growth', 1500); check('growth tab renders', (await p.$$('.gr-bar')).length >= 40 && (await txt(p, '#adm-body')).includes('Retention'));
  const gr = await api(p, 'admin_growth'); check('growth report has users and features', gr.json.totals.users > 0 && Array.isArray(gr.json.features), gr.json.totals);
  await go(p, '#/leagues', 1500); check('section board on leagues page', (await txt(p, '#lg-section')).includes('Section') || (await txt(p, '#lg-section')).includes('Set your'), (await txt(p, '#lg-section')).slice(0, 80));
  await p.evaluate(async () => { await fetch('api/index.php?r=logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub' } }); }); await login(p, 'alice.a@montana.edu'); await p.reload(); await p.waitForTimeout(1000);
  await go(p, '#/calc', 1500); check('student sees the announcement', (await txt(p, '#dc-ann')).includes('Office hours moved') && !(await p.$('[data-action="ann-new"]')));
  await go(p, '#/mock', 900); log('  mock page ok:', (await txt(p, '#view')).slice(0, 60));
  await c.close(); await T.finish();
})();

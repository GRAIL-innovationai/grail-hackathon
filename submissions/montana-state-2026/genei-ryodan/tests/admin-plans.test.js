/* ============================================================
   Admin panel → Members → a member's plan (assets/admin.js, api admin_plan; Your plan, assets/create.js):
   - every member shows their plan (Free, Pro or Max) and where it comes from (given, paid, tester); "With Pro or
     Max" lists only them
   - an administrator gives anyone Pro or Max, free for them, with no end or until a day, with a note only
     administrators see, and tells them in their inbox if they want; or takes it back. Students and moderators cannot
   - the member has it at once (Bo, Your plan: "Given to your account until …", nothing to cancel); a plan they also
     pay for stays theirs to manage; when it ends, or is taken back, they are back where they were
   - on a phone the editor fits the screen; housekeeping forgets memberships of deleted accounts
   RevenueCat is the stand-in in tests/pyodide/router.php. Everything given here is taken back at the end.
   ============================================================ */
const T = require('./lib');
const fs = require('fs'); const path = require('path'); const { spawnSync } = require('child_process');
const STATE = path.join(__dirname, 'fixtures', 'rc-state.json');
const DB = path.join(__dirname, '..', 'api', 'data', 'mathub.sqlite');
const sql = (q, ...args) => JSON.parse(spawnSync('php', ['-r', 'try { $d = new PDO("sqlite:" . $argv[1]); $s = $d->prepare($argv[2]); $s->execute(array_slice($argv, 3)); echo json_encode($s->fetchAll(PDO::FETCH_ASSOC)); } catch (Throwable $e) { echo "[]"; }', DB, q, ...args.map(String)], { encoding: 'utf8' }).stdout || '[]');
const ALICE = 'alice.a@montana.edu', BOB = 'bob.bmu6j92pq@montana.edu', MOD = 'mod.user@montana.edu';
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
(async () => {
  const { mk, txt, login, api, go, hscroll, check } = await T.start();
  fs.writeFileSync(STATE, '{}');
  sql('DELETE FROM plan_gifts WHERE email IN (?, ?)', ALICE, BOB);
  const open = async (w, h, email) => { const [c, p] = await mk(w, h, { serviceWorkers: 'block' }); await go(p, '#/', 600); if (email) { await login(p, email); await p.reload(); await p.waitForTimeout(900); } return [c, p]; };
  const rowOf = (p, email) => p.evaluate(e => { const tr = [...document.querySelectorAll('#adm-body tbody tr')].find(r => r.textContent.includes(e)); if (!tr) return null; const b = tr.querySelector('[data-action="plan"]'); const s = tr.querySelector('.adm-plan-src'); return { id: +b.dataset.u, plan: b.textContent.trim(), src: s ? s.textContent : '', label: b.getAttribute('aria-label') }; }, email);
  const search = async (p, q) => { await p.fill('#adm-q', q); await p.waitForTimeout(1100); };

  // not for students or moderators
  const [cs, s] = await open(1360, 900, ALICE);
  check('a student cannot give a membership', (await api(s, 'admin_plan', { user_id: 1, plan: 'max' })).status === 403);
  const [cm, m] = await open(1360, 900, MOD);
  check('a moderator cannot either', (await api(m, 'admin_plan', { user_id: 1, plan: 'max' })).status === 403);
  await cm.close();

  // the administrator
  const [ca, a] = await open(1360, 900, 'admin.user@montana.edu');
  await go(a, '#/admin/members', 1500);
  check('Members has a Plan column, and a way to list only Pro and Max', (await a.$$eval('#adm-body thead th', t => t.map(x => x.textContent))).includes('Plan') && (await a.$$eval('#adm-show option', o => o.map(x => x.textContent).join())) === 'Everyone,With Pro or Max');
  check('the whole table fits on a laptop: nothing to scroll sideways to reach Delete', await a.$eval('.adm-members', w => w.scrollWidth <= w.clientWidth + 1));
  const mo = await rowOf(a, MOD);
  check('a member with a tester plan shows Max, from "tester"', mo && mo.plan === 'Max' && mo.src === 'tester' && /Mathub Max, tester/.test(mo.label), mo);
  await search(a, 'alice.a');
  const al = await rowOf(a, ALICE);
  check('a member with nothing shows Free', al && al.plan === 'Free' && al.src === '', al);
  const ID = al.id;
  await a.click(`[data-action="plan"][data-u="${ID}"]`); await a.waitForTimeout(300);
  const ed = await a.evaluate(id => { const f = document.querySelector('.adm-plan-row .adm-plan'); return f && { open: document.querySelector(`[data-action="plan"][data-u="${id}"]`).getAttribute('aria-expanded'), h: f.querySelector('h3').textContent, now: f.querySelector('.adm-plan-now').textContent, picked: f.querySelector('input[type="radio"]:checked').value, focus: document.activeElement && document.activeElement.type, grid: f.querySelector('.adm-plan-grid').hidden, sum: f.querySelector('.adm-plan-sum').textContent }; }, ID);
  check('pressing it opens Give a membership under their row: what they have now, and Free picked', ed && ed.open === 'true' && ed.h === 'Membership for Alice' && /Free: nothing paid for or given/.test(ed.now) && ed.picked === '' && ed.focus === 'radio' && ed.grid && /Nothing is given/.test(ed.sum), ed);
  await a.click('.adm-plan-opt.is-max');
  check('picking Max asks for how long, with a note, and offers to tell them', await a.evaluate(() => { const f = document.querySelector('.adm-plan'); return !f.querySelector('.adm-plan-grid').hidden && f.querySelector('.adm-plan-tell input').checked && /Alice gets Mathub Max free, with no end date\. It never charges them\./.test(f.querySelector('.adm-plan-sum').textContent); }));
  await a.selectOption(`#pl-for-${ID}`, '91'); await a.fill(`#pl-note-${ID}`, 'Testing Bo with Dr. Lee');
  check('3 months says the last day', /until the end of \w+ \d+, 20\d\d/.test(await txt(a, '.adm-plan-sum')));
  await a.click('.adm-plan button[type="submit"]'); await a.waitForTimeout(1500);
  check('saving gives it, and says they were told', /Alice has Mathub Max until/.test(await txt(a, '.toast')) && /told in their inbox/.test(await txt(a, '.toast')), await txt(a, '.toast'));
  const al2 = await rowOf(a, ALICE);
  check('the row now shows Max, given, until the last day; focus is back on it', al2.plan === 'Max' && /^given, until \w+ \d+, 20\d\d$/.test(al2.src) && await a.evaluate(id => document.activeElement === document.querySelector(`[data-action="plan"][data-u="${id}"]`), ID), al2);
  const gift = (await api(a, `admin_users&q=alice.a`)).json.users[0].plan.gift;
  check('kept with who gave it and the note', gift.plan === 'max' && gift.by === 'Ada' && gift.note === 'Testing Bo with Dr. Lee' && gift.until > Date.now() / 1000 + 89 * 86400 && gift.until < Date.now() / 1000 + 93 * 86400, gift);

  // Alice has it at once
  const st = (await api(s, 'create_status')).json;
  check('Alice has Max at once, given, until that day, never renewing', st.plan === 'max' && st.active && st.granted && st.until && st.renews === false, st);
  check('so Bo is hers', (await api(s, 'ai_status')).json.max === true);
  const nl = (await api(s, 'notif_list')).json.notifications[0];
  check('she is told in her inbox, with a link to Your plan', nl.kind === 'plan' && nl.title === 'Mathub Max' && /It is yours until \w+ \d+, 20\d\d\. It never charges you/.test(nl.snippet) && nl.link === '#/plan', nl);
  await go(s, '#/forum/inbox', 1500);
  check('the inbox reads "Ada gave you Mathub Max"', /Ada gave you Mathub Max/.test(await txt(s, '#fa-inbox')) && (await s.$eval('#fa-inbox .inbox-row', r => r.getAttribute('href'))) === '#/plan');
  await go(s, '#/plan', 1800);
  const pn = await txt(s, '#pl-now');
  check('Your plan: Mathub Max, given to her account until that day, free, nothing to cancel', /Given to your account until/.test(pn) && /Mathub Max/.test(pn) && /Ends/.test(pn) && /never charges you/.test(pn) && /Given by Mathub/.test(pn) && !(await s.$('#pl-now [data-pl="cancel"]')) && !/Manage billing/.test(pn), pn);
  await cs.close();

  // only Pro and Max
  await search(a, ''); await a.selectOption('#adm-show', 'plan'); await a.waitForTimeout(1200);
  const listed = await a.$$eval('#adm-body tbody tr .mono', t => t.map(x => x.textContent));
  check('"With Pro or Max" lists Alice and the tester, not Bob', listed.includes(ALICE) && listed.includes(MOD) && !listed.includes(BOB) && await a.evaluate(() => document.activeElement && document.activeElement.id === 'adm-show'), listed);
  await a.selectOption('#adm-show', ''); await a.waitForTimeout(1200);
  const mod = await rowOf(a, MOD); await a.click(`[data-action="plan"][data-u="${mod.id}"]`); await a.waitForTimeout(300);
  check('the tester\'s editor says where the plan comes from', /Tester plan: Mathub Max/.test(await txt(a, '.adm-plan-now')));
  await a.keyboard.press('Escape'); await a.waitForTimeout(200);
  check('Esc closes it, back on the button', !(await a.$('.adm-plan-row')) && await a.evaluate(id => document.activeElement === document.querySelector(`[data-action="plan"][data-u="${id}"]`), mod.id));

  // wrong values
  const e1 = await api(a, 'admin_plan', { user_id: ID, plan: 'max', until: '2020-01-01' }); const e2 = await api(a, 'admin_plan', { user_id: ID, plan: 'max', until: 'soon' });
  const e3 = await api(a, 'admin_plan', { user_id: ID, plan: 'gold' }); const e4 = await api(a, 'admin_plan', { user_id: 999999, plan: 'pro' });
  check('a last day in the past or not a date, an unknown plan or member are refused, naming the field', e1.status === 400 && e1.json.field === 'until' && e2.status === 400 && e2.json.field === 'until' && e3.status === 400 && e3.json.field === 'plan' && e4.status === 404);

  // when it ends, she is back on Free
  sql('UPDATE plan_gifts SET until = ? WHERE email = ?', Math.floor(Date.now() / 1000) - 60, ALICE);
  const [cs2, s2] = await open(1360, 900, ALICE);
  check('when the last day has passed, she is on Free again', (await api(s2, 'create_status')).json.plan === '' && (await api(s2, 'ai_status')).json.max !== true);
  await go(a, '#/admin/members', 1300); await search(a, 'alice.a');
  check('and Members shows Free', (await rowOf(a, ALICE)).plan === 'Free');

  // until a day picked by hand, then taken back
  await a.click(`[data-action="plan"][data-u="${ID}"]`); await a.waitForTimeout(300);
  await a.click('.adm-plan-opt.is-pro'); await a.selectOption(`#pl-for-${ID}`, 'day');
  check('"Until a day you pick" shows the date box', await a.$eval('.adm-plan-day', d => !d.hidden));
  await a.click('.adm-plan button[type="submit"]'); await a.waitForTimeout(400);
  check('without a day it says to pick one, on the box', /Pick the last day/.test(await txt(a, '.adm-plan .adm-add-msg')) && await a.evaluate(() => document.activeElement && document.activeElement.type === 'date'));
  const told = async () => (await api(s2, 'notif_list')).json.notifications.filter(n => n.kind === 'plan').length; const before = await told();
  await a.fill(`#pl-day-${ID}`, inDays(10)); await a.uncheck(`#pl-tell-${ID}`);
  await a.click('.adm-plan button[type="submit"]'); await a.waitForTimeout(1500);
  const al3 = await rowOf(a, ALICE);
  check('with a day it is given until then', al3.plan === 'Pro' && /given, until/.test(al3.src) && !/told/.test(await txt(a, '.toast')), al3);
  check('not telling her leaves her inbox alone', before >= 1 && (await told()) === before);
  await a.click(`[data-action="plan"][data-u="${ID}"]`); await a.waitForTimeout(300);
  check('opening it again shows what was given, with its day', await a.evaluate(id => { const f = document.querySelector('.adm-plan'); return f.querySelector('input[type="radio"]:checked').value === 'pro' && document.querySelector(`#pl-for-${id}`).value === 'day' && !!document.querySelector(`#pl-day-${id}`).value && /Given Mathub Pro by Ada/.test(f.querySelector('.adm-plan-now').textContent); }, ID));
  await a.click('.adm-plan-opt:not(.is-pro):not(.is-max)');
  check('picking Free says it is taken back', /What was given to Alice is taken back now/.test(await txt(a, '.adm-plan-sum')) && await a.$eval('.adm-plan-grid', g => g.hidden));
  await a.click('.adm-plan button[type="submit"]'); await a.waitForTimeout(1500);
  check('saved: taken back, Free', /Took back what was given to Alice/.test(await txt(a, '.toast')) && (await rowOf(a, ALICE)).plan === 'Free' && (await api(s2, 'create_status')).json.plan === '');
  await cs2.close();

  // Bob pays for Pro, and is given Max
  const [cb, b] = await open(1360, 900, BOB);
  const bobCust = (await api(b, 'create_status')).json.customer; const bobId = +bobCust.replace('mh_', '');
  fs.writeFileSync(STATE, JSON.stringify({ [bobCust]: { plan: 'pro', expires: new Date(Date.now() + 20 * 864e5).toISOString() } }));
  check('Bob pays for Pro', (await api(b, 'create_status&refresh=1')).json.plan === 'pro');
  const gb = await api(a, 'admin_plan', { user_id: bobId, plan: 'max', until: '', note: '', tell: true });
  check('given Max on top: the answer has both', gb.json.ok && gb.json.plan.plan === 'max' && gb.json.plan.paid.plan === 'pro' && gb.json.plan.gift.plan === 'max' && gb.json.told === true, gb.json);
  const sb = (await api(b, 'create_status')).json;
  check('Bob has Max, given, and still pays for Pro', sb.plan === 'max' && sb.granted && sb.paid === 'pro' && sb.paid_renews === true, sb);
  await b.evaluate(() => App.subscription.refresh(true)); await go(b, '#/plan', 1800);
  const bp = await txt(b, '#pl-now');
  check('his Your plan says so, with Manage billing and Cancel Pro for what he pays for', /Mathub Max/.test(bp) && /No end date/.test(bp) && /You also pay for Mathub Pro/.test(bp) && /Manage billing/.test(bp) && /Cancel Pro/.test(await txt(b, '#pl-now [data-pl="cancel"]')), bp);
  await go(a, '#/admin/members', 1300); await search(a, 'bob.');
  const br = await rowOf(a, BOB); await a.click(`[data-action="plan"][data-u="${br.id}"]`); await a.waitForTimeout(300);
  check('Members: Max, given; the editor also says he pays for Pro', br.plan === 'Max' && br.src === 'given' && /Pays for Mathub Pro through the website/.test(await txt(a, '.adm-plan-now')), br);
  await a.click('.adm-plan-opt:not(.is-pro):not(.is-max)'); await a.click('.adm-plan button[type="submit"]'); await a.waitForTimeout(1500);
  check('taking Max back leaves the Pro he pays for', /They still have Mathub Pro \(they pay for it\)/.test(await txt(a, '.toast')) && (await api(b, 'create_status')).json.plan === 'pro' && !(await api(b, 'create_status')).json.granted);
  fs.writeFileSync(STATE, '{}'); await api(b, 'create_status&refresh=1');
  await cb.close();

  // a phone
  const [cp, ph] = await open(390, 844, 'admin.user@montana.edu');
  await go(ph, '#/admin/members', 1500); await search(ph, 'alice.a');
  await ph.click(`[data-action="plan"][data-u="${ID}"]`); await ph.waitForTimeout(300); await ph.click('.adm-plan-opt.is-max');
  const lay = await ph.evaluate(() => { const w = document.querySelector('.adm-members').getBoundingClientRect(); const f = document.querySelector('.adm-plan').getBoundingClientRect(); const o = [...document.querySelectorAll('.adm-plan-opt')].map(x => x.getBoundingClientRect()); const sv = document.querySelector('.adm-plan button[type="submit"]').getBoundingClientRect(); return { left: f.left >= w.left - 1, right: f.right <= w.right + 1 && w.right <= innerWidth, stack: o[1].top >= o[0].bottom - 1 && Math.abs(o[1].left - o[0].left) < 2, save: sv.right <= w.right && sv.height >= 36 }; });
  check('phone: the editor fits the screen, the plans stack, Save is reachable', lay.left && lay.right && lay.stack && lay.save && await hscroll(ph), lay);
  await cp.close();

  // housekeeping forgets memberships of accounts that are gone
  sql("INSERT OR REPLACE INTO plan_gifts (email, plan, until, note, by_id, created) VALUES ('gone.person@montana.edu', 'max', 0, '', 3, 0)");
  spawnSync('php', ['-r', 'chdir($argv[1]); require "lib.php"; require "myclasses.php"; mh_myclass_prune();', path.join(__dirname, '..', 'api')], { encoding: 'utf8' });
  check('housekeeping removes a membership given to an account that is gone', !sql("SELECT 1 FROM plan_gifts WHERE email = 'gone.person@montana.edu'").length);

  sql('DELETE FROM plan_gifts WHERE email IN (?, ?)', ALICE, BOB); sql("DELETE FROM notifications WHERE kind = 'plan' AND user_id IN (SELECT id FROM users WHERE email IN (?, ?))", ALICE, BOB);
  check('cleaned up: nothing given is left', !sql('SELECT 1 FROM plan_gifts WHERE email IN (?, ?)', ALICE, BOB).length);
  await ca.close();
  await T.finish();
})().catch(e => { console.error(e); try { require('fs').writeFileSync(require('path').join(__dirname, 'fixtures', 'rc-state.json'), '{}'); } catch (x) {} process.exit(1); });

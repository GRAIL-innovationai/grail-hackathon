/* ============================================================
   Admin panel → Members → Add a member (assets/admin.js, api admin_user_add):
   - an administrator adds anyone, also outside montana.edu: the account is verified at once, with a role and
     a plan if wanted (given like Members gives one); an outside address is allowed to sign in (Keys & settings)
   - invited: an email with a link (#/?setpw=…) that opens "choose your password" with the address filled in,
     and a code good for 7 days; then Mathub welcomes them. Or the administrator sets the password
   - duplicates and weak passwords are refused, naming the field; students and moderators cannot add anyone
   Everything made here is removed at the end.
   ============================================================ */
const T = require('./lib');
const fs = require('fs'); const path = require('path'); const { spawnSync } = require('child_process');
const LOG = path.join(__dirname, '..', 'api', 'data', 'mail.log');
(async () => {
  const { mk, txt, login, api, go, hscroll, check } = await T.start();
  const rowPlan = (p, e) => p.evaluate(e => { const tr = [...document.querySelectorAll('#adm-body tbody tr')].find(r => r.textContent.includes(e)); return tr && tr.querySelector('[data-action="plan"]').textContent.trim(); }, e);
  const open = async (w, h, email) => { const [c, p] = await mk(w, h, { serviceWorkers: 'block' }); await go(p, '#/', 600); if (email) { await login(p, email); await p.reload(); await p.waitForTimeout(900); } return [c, p]; };
  const stamp = Date.now().toString(36); const OUT = `dr.hall.${stamp}@example.edu`, IN = `ta.${stamp}@montana.edu`;

  // not for students or moderators
  const [cs, s] = await open(1360, 900, 'alice.a@montana.edu');
  check('a student cannot add members', (await api(s, 'admin_user_add', { email: 'x@example.edu' })).status === 403);
  await cs.close();
  const [cm, m] = await open(1360, 900, 'mod.user@montana.edu');
  check('a moderator cannot either', (await api(m, 'admin_user_add', { email: 'x@example.edu' })).status === 403);
  await cm.close();

  // the administrator adds an outside instructor with Max, by invitation
  const [ca, a] = await open(1360, 900, 'admin.user@montana.edu');
  await go(a, '#/admin/members', 1500);
  check('Members has an Add a member form: email, name, role, plan and how they sign in', !!(await a.$('#adm-add #add-email')) && (await a.$$eval('#add-role option', o => o.map(x => x.textContent).join())) === 'Student,TA,Instructor' && (await a.$$('#adm-add input[name="add-how"]')).length === 2 && !!(await a.$('.adm-add-pass[hidden]')));
  await a.fill('#add-email', OUT); await a.fill('#add-name', 'Dr. Lee'); await a.selectOption('#add-role', 'Instructor'); await a.selectOption('#add-plan', 'max');
  await a.click('#adm-add button[type="submit"]'); await a.waitForTimeout(1500);
  check('it adds them and says how they sign in', /Added dr\.hall/.test(await txt(a, '#adm-add-msg')) && /Instructor/.test(await txt(a, '#adm-add-msg')) && /Mathub Max/.test(await txt(a, '#adm-add-msg')) && /outside montana\.edu/.test(await txt(a, '#adm-add-msg')), await txt(a, '#adm-add-msg'));
  check('they are in the list', (await txt(a, '#adm-body .table-wrap')).includes(OUT));
  const mail = fs.readFileSync(LOG, 'utf8'); const part = mail.slice(mail.lastIndexOf('to=' + OUT));
  const code = (/Your code: (\d{6})/.exec(part) || [])[1]; const link = (/(https?:\/\/\S+#\/\?setpw=\S+)/.exec(part) || [])[1];
  check('they get an email with a link to choose their password and a code', !!code && !!link && link.includes(encodeURIComponent(OUT)) && /Ada added you to Mathub/.test(part), part.slice(0, 300));
  const cfg = (await api(a, 'admin_config')).json.groups.flatMap(g => g.fields); const F = k => cfg.find(f => f.key === k).value;
  const given = (await api(a, `admin_users&q=${encodeURIComponent(OUT)}`)).json.users[0].plan;
  check('an outside address is allowed to sign in (Keys & settings), and Max is given to them (Members shows it)', F('extra_allowed_emails').includes(OUT) && given.plan === 'max' && given.gift.plan === 'max' && given.gift.until === 0 && (await rowPlan(a, OUT)) === 'Max', given);
  const dup = await api(a, 'admin_user_add', { email: OUT });
  check('adding the same address again is refused, naming the field', dup.status === 409 && dup.json.field === 'email');
  // with a password set by the administrator
  await a.fill('#add-email', IN); await a.selectOption('#add-role', 'TA'); await a.check('#adm-add input[value="password"]');
  check('choosing to set a password shows its box', !(await a.$('.adm-add-pass[hidden]')));
  await a.fill('#add-pass', 'short'); await a.click('#adm-add button[type="submit"]'); await a.waitForTimeout(900);
  check('a weak password is refused, on its box', /at least 8/i.test(await txt(a, '#adm-add-msg')) && await a.$eval('#add-pass', i => i.closest('.field').classList.contains('bad') && document.activeElement === i));
  await a.fill('#add-pass', 'teaching-assistant-77'); await a.click('#adm-add button[type="submit"]'); await a.waitForTimeout(1500);
  check('with a good password it is added', /Added ta\./.test(await txt(a, '#adm-add-msg')) && /TA/.test(await txt(a, '#adm-add-msg')));

  // the invited instructor opens the link
  const [ci, i] = await mk(1360, 900, { serviceWorkers: 'block' });
  await i.goto(link.replace(/^https?:\/\/[^/#]+/, T.base.replace(/\/index\.html.*$/, ''))); await i.waitForTimeout(1500);
  check('the link opens "choose your password" with their address filled in', !!(await i.$('#auth-modal #au-code')) && /dr\.hall/.test(await txt(i, '#auth-modal')));
  await i.fill('#au-code', code); await i.fill('#au-pass', 'office-hours-tuesday-3'); await i.click('#auth-modal button[type="submit"]'); await i.waitForTimeout(2000);
  const me = await i.evaluate(() => App.auth.user && { email: App.auth.user.email, role: App.auth.user.role, req: App.auth.user.can_request, welcomed: App.auth.user.welcomed });
  check('they are signed in, as an instructor who can request classes', me && me.email === OUT && me.role === 'Instructor' && me.req === true, me);
  check('and Mathub welcomes them (classes and membership)', !!(await i.$('#welcome')) && me.welcomed === false);
  check('their plan is Max', (await api(i, 'ai_status')).json.max === true);
  await api(i, 'account_delete', { password: 'office-hours-tuesday-3' }); await ci.close();
  // the TA signs in with the password they were given
  const [ct, t] = await mk(1360, 900, { serviceWorkers: 'block' }); await go(t, '#/', 600);
  const li = await api(t, 'login', { email: IN, password: 'teaching-assistant-77' });
  check('the TA signs in with the password set for them', li.json.ok && li.json.user.role === 'TA' && li.json.user.can_request === true);
  await api(t, 'account_delete', { password: 'teaching-assistant-77' }); await ct.close();

  // phones, then clean up
  const [cp, ph] = await open(390, 844, 'admin.user@montana.edu');
  await go(ph, '#/admin/members', 1500);
  check('phone: Members does not scroll sideways, and its tabs are one scrolling row', await hscroll(ph) && await ph.$eval('.admin-tabs', n => n.scrollWidth > n.clientWidth && getComputedStyle(n).flexWrap === 'nowrap'));
  await cp.close();
  await api(a, 'admin_role', { email: OUT, role: '' }); await api(a, 'admin_role', { email: IN, role: '' });
  await api(a, 'admin_config_save', { password: 'password123', clear: ['extra_allowed_emails', 'plan_grants'] });
  spawnSync('php', ['-r', '$d = new PDO("sqlite:" . $argv[1]); $d->prepare("DELETE FROM plan_gifts WHERE email LIKE ?")->execute(["%" . $argv[2] . "%"]);', path.join(__dirname, '..', 'api', 'data', 'mathub.sqlite'), stamp]);
  check('cleaned up: no test accounts or grants left', !(await api(a, `admin_users&q=${stamp}`)).json.users.length);
  await ca.close();
  await T.finish();
})();

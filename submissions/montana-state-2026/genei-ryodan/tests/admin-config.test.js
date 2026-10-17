/* ============================================================
   Admin panel → Keys & settings (assets/admin.js, api/siteconfig.php):
   - only administrators can see or change it; keys and passwords never come back to the browser
     (only "set", where from, and the last four characters)
   - a change needs the administrator's password, is checked, takes effect at once, and is logged
     (which setting and who, never the value); "Use the file's value" goes back to config.local.php
   - Check buttons try the AI keys, RevenueCat and email; an administrator cannot remove themselves
   Everything set here is cleared at the end, so config.local.php applies again.
   ============================================================ */
const T = require('./lib');
const fs = require('fs'); const path = require('path');
const FILE = path.join(__dirname, '..', 'api', 'data', 'site-config.json');
(async () => {
  const { mk, txt, login, api, go, hscroll, check } = await T.start();
  const open = async (w, h, email) => { const [c, p] = await mk(w, h, { serviceWorkers: 'block' }); await go(p, '#/', 600); await login(p, email); await p.reload(); await p.waitForTimeout(900); return [c, p]; };
  const reset = p => api(p, 'admin_config_save', { password: 'password123', clear: ['ai_tutor_monthly', 'smtp_pass', 'pro_web_price', 'plan_grants', 'pro_web_link', 'admins', 'mail_from_name'] });

  // not for students or moderators
  const [cs, s] = await open(1360, 900, 'alice.a@montana.edu');
  check('a student cannot read the keys and settings', (await api(s, 'admin_config')).status === 403);
  await cs.close();
  const [cm, m] = await open(1360, 900, 'mod.user@montana.edu');
  check('a moderator cannot either', (await api(m, 'admin_config')).status === 403 && (await api(m, 'admin_config_save', { password: 'password123', values: { ai_tutor_monthly: '5' } })).status === 403);
  await go(m, '#/admin', 1200);
  check('and the panel has no Keys & settings tab for them', !(await m.$('.admin-tab[href$="config"]')));
  await cm.close();

  // the administrator
  const [ca, a] = await open(1360, 900, 'admin.user@montana.edu');
  await reset(a);
  const r = await api(a, 'admin_config'); const all = (r.json.groups || []).flatMap(g => g.fields); const F = k => all.find(f => f.key === k) || {};
  check('every group is there: Bo and the AI, plans and payments, email, sign-up and staff, the site', (r.json.groups || []).map(g => g.id).join() === 'ai,pay,mail,access,site', (r.json.groups || []).map(g => g.id));
  check('keys are never sent to the browser: only set, where from, and the last four characters', F('anthropic_key').set === true && F('anthropic_key').hint === '…test' && F('anthropic_key').from === 'file' && !('value' in F('anthropic_key')) && !JSON.stringify(r.json).includes('sk-ant-test') && !JSON.stringify(r.json).includes('sk_test'), F('anthropic_key'));
  check('the email password shows as not set yet', F('smtp_pass').set === false && F('smtp_pass').from === 'none');
  await go(a, '#/admin/config', 1500);
  check('the Keys & settings tab shows each setting with where it comes from', (await a.$$('.cfg-field')).length === all.length && /from the config file/.test(await txt(a, '.cfg-field[data-f="anthropic_key"]')) && /ends in …test/.test(await a.$eval('#cfg-anthropic_key', i => i.placeholder)));
  check('the key boxes are empty password fields', await a.$eval('#cfg-openai_key', i => i.type === 'password' && i.value === '' && i.autocomplete === 'new-password'));
  // change three things, with a wrong password first
  await a.fill('#cfg-ai_tutor_monthly', '1234'); await a.fill('#cfg-smtp_pass', 'hunter2-mail-pass'); await a.fill('#cfg-mail_from_name', 'Mathub Team');
  check('the save bar counts the changes', !(await a.$('#cfg-bar[hidden]')) && /3 changes/.test(await txt(a, '#cfg-count')));
  await a.fill('#cfg-pass', 'not-my-password'); await a.click('#cfg-bar [type="submit"]'); await a.waitForTimeout(700);
  const saved = () => (fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '');
  check('a wrong password saves nothing', /not your password/.test(await txt(a, '.toast')) && !/ai_tutor_monthly/.test(saved()));
  await a.fill('#cfg-pass', 'password123'); await a.click('#cfg-bar [type="submit"]'); await a.waitForTimeout(1200);
  check('with the password, it saves', /Saved: 3 settings changed/.test(await txt(a, '.toast')));
  const st = (await api(a, 'ai_status')).json;
  check('and takes effect at once (Bo\'s monthly questions)', st.usage && st.usage.tutor_limit === 1234, st.usage);
  const r2 = (await api(a, 'admin_config')).json; const all2 = r2.groups.flatMap(g => g.fields); const F2 = k => all2.find(f => f.key === k) || {};
  check('the email password is now set here, still never shown', F2('smtp_pass').set && F2('smtp_pass').from === 'panel' && F2('smtp_pass').hint === '…pass' && !JSON.stringify(r2).includes('hunter2'));
  check('every change is logged with who made it, never the value', r2.log.slice(0, 3).every(l => l.by === 'admin.user@montana.edu') && r2.log.some(l => l.key === 'smtp_pass') && !JSON.stringify(r2.log).includes('hunter2'));
  check('the log is on the page', /Email password/.test(await txt(a, '.cfg-log')));
  // checks
  await a.click('[data-action="cfg-test"][data-w="ai"]'); await a.waitForTimeout(1500);
  check('Check the keys tries Anthropic and OpenAI', /Anthropic: The key works/.test(await txt(a, '#cfg-res-ai')) && /OpenAI: The key works/.test(await txt(a, '#cfg-res-ai')));
  await a.click('[data-action="cfg-test"][data-w="pay"]'); await a.waitForTimeout(1500);
  check('Check RevenueCat tries both keys', /RevenueCat \(v1\): The key works/.test(await txt(a, '#cfg-res-pay')) && /RevenueCat \(v2\): The key and project work/.test(await txt(a, '#cfg-res-pay')));
  await a.click('[data-action="cfg-test"][data-w="mail"]'); await a.waitForTimeout(1500);
  check('Send me a test email uses the new settings', /mail log/.test(await txt(a, '#cfg-res-mail')));
  // a value that is not right, and the lock-out guard
  const bad = await api(a, 'admin_config_save', { password: 'password123', values: { pro_web_link: 'http://not-https.example' } });
  check('a link that is not https is refused, naming the field', bad.status === 400 && bad.json.field === 'pro_web_link');
  const lock = await api(a, 'admin_config_save', { password: 'password123', values: { admins: 'someone.else@montana.edu' } });
  check('an administrator cannot take themselves off the list', lock.status === 400 && lock.json.field === 'admins');
  const grants = await api(a, 'admin_config_save', { password: 'password123', values: { plan_grants: 'mod.user@montana.edu = max\nbob.bmu6j92pq@montana.edu = pro' } });
  check('plans given without paying are set one per line', grants.json.ok && (await api(a, 'admin_config')).json.groups.flatMap(g => g.fields).find(f => f.key === 'plan_grants').value === 'mod.user@montana.edu = max\nbob.bmu6j92pq@montana.edu = pro');
  // back to the file's value
  await go(a, '#/admin/config', 1500);
  await a.click('.cfg-field[data-f="smtp_pass"] [data-action="cfg-clear"]');
  check('Use the file\'s value marks it as a change', /1 change/.test(await txt(a, '#cfg-count')));
  await a.fill('#cfg-pass', 'password123'); await a.click('#cfg-bar [type="submit"]'); await a.waitForTimeout(1200);
  check('and the email password goes back to the file (not set)', (await api(a, 'admin_config')).json.groups.flatMap(g => g.fields).find(f => f.key === 'smtp_pass').set === false);
  await ca.close();

  // phones
  const [cp, ph] = await open(390, 844, 'admin.user@montana.edu');
  await go(ph, '#/admin/config', 1500);
  check('phone: Keys & settings does not scroll sideways', await hscroll(ph));
  await reset(ph);
  check('everything set here is cleared again', !fs.existsSync(FILE) || Object.keys(JSON.parse(fs.readFileSync(FILE, 'utf8'))).length === 0);
  await cp.close();
  await T.finish();
})();

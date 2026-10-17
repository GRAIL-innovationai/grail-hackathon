/* ============================================================
   Create a class on the website (assets/create.js, api/myclasses.php): the page works for guests up to
   Add, classes are saved with the account (and come back in a new browser), Mathub Pro is bought
   through the RevenueCat web checkout (a stand-in RevenueCat answers in the tests), a class is locked
   when it lapses, and a class can be shared by link and QR code, opened by anyone and reported.
   ============================================================ */
const T = require('./lib');
const fs = require('fs'); const path = require('path');
const STATE = path.join(__dirname, 'fixtures', 'rc-state.json');
(async () => {
  const { mk, txt, login, api, go, hscroll, log, check } = await T.start();
  const ALICE = 'alice.a@montana.edu', BOB = 'bob.bmu6j92pq@montana.edu';
  const quiet = () => document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.celebrate{display:none!important}'; document.head.appendChild(st); });
  const setRc = v => fs.writeFileSync(STATE, JSON.stringify(v));
  setRc({});
  const sample = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app-sample-class.json'), 'utf8');
  const other = sample.split('SKIL 101').join('WEBT 210').split('"SKIL').join('"WEBT');
  const paste = async (p, text) => { await p.evaluate(() => { document.querySelector('#mk-diy').open = true; }); await p.fill('#mk-text', text); await p.click('[data-action="check"]'); await p.waitForTimeout(400); };

  // a guest can read the page and check an answer; adding asks them to sign in
  const [cg, g] = await mk(1360, 900); await cg.addInitScript(quiet);
  await go(g, '#/create', 1200);
  check('the website has Create a class: Bo writes it from the syllabus first, the three do-it-yourself steps folded away', /Create a class/.test(await txt(g, '#view')) && /Bo writes it from your syllabus/.test(await txt(g, '#mk-bo')) && !!(await g.$('#mk-drop #mk-bo-file')) && !!(await g.$('#mk-bo-text')) && (await g.$$('#mk-diy .mk-step')).length === 3 && !(await g.$eval('#mk-diy', d => d.open)));
  check('the other ways: the example, a share code, a class file, and your own AI', !!(await g.$('.mk-ways [data-action="example"]')) && !!(await g.$('.mk-ways #mk-code-form')) && !!(await g.$('.mk-ways #mk-file')) && /Use the AI you already use/.test(await txt(g, '#mk-diy summary')));
  await g.fill('#mk-bo-text', 'TEST 101, Fall 2026'); await g.click('[data-bo-write]'); await g.waitForTimeout(600);
  check('Write my class asks a guest to sign in first', !!(await g.$('#auth-modal')) && !(await g.$('#paywall')));
  await g.evaluate(() => App.auth.close()); await g.waitForTimeout(300);
  check('a guest sees why to sign in: classes are saved with the account', /Sign in to add a class/.test(await txt(g, '#mk-signin')));
  await g.click('[data-action="example"]'); await g.waitForTimeout(700);
  check('the example class checks clean for a guest too, shown right under the other ways', !!(await g.$('#mk-alt-result [data-add]')));
  await g.click('#mk-alt-result [data-add]'); await g.waitForTimeout(600);
  check('Add asks a guest to sign in (and saves nothing)', !!(await g.$('#auth-modal')) && (await g.evaluate(() => JSON.parse(localStorage.getItem('mh-my-classes') || '[]').length)) === 0);
  await g.evaluate(() => App.auth.close()); await g.waitForTimeout(300);

  // Alice: start clean
  const [ca, a] = await mk(1360, 900); await ca.addInitScript(quiet); await go(a, '#/'); check('Alice signs in', await login(a, ALICE)); await a.reload(); await a.waitForTimeout(800);
  for (const c of ((await api(a, 'myclasses')).json.classes || [])) await api(a, 'myclass_delete', { id: c.id });
  await go(a, '#/create', 1400);
  check('signed in, the page says classes are saved with the account', /saved with your account/.test(await txt(a, '.mk-lede')) && !(await a.$('#mk-signin')));
  check('it names Mathub Pro with the web price, and Max', /Mathub Pro/.test(await txt(a, '#mk-sub')) && /\$15 a month/.test(await txt(a, '#mk-sub')) && /Max/.test(await txt(a, '#mk-sub')), await txt(a, '#mk-sub'));

  // the free example class: no paywall, saved with the account
  await a.click('[data-action="example"]'); await a.waitForTimeout(700); await a.click('#mk-alt-result [data-add]'); await a.waitForTimeout(1500);
  check('the example class is added without a subscription and opens', !(await a.$('#paywall')) && /#\/my\d{4}\/dashboard/.test(a.url()), a.url());
  const exId = (/#\/(my\d{4})\//.exec(a.url()) || [])[1];
  let srv = (await api(a, 'myclasses')).json.classes || [];
  check('it is saved in her account, marked free', srv.length === 1 && srv[0].id === exId && srv[0].free === true, srv);
  check('the class page says where it is kept', /saved with your account/.test(await txt(a, '.mk-strip')));

  // a class from a syllabus: the web paywall with the checkout link
  await go(a, '#/create', 1200); await paste(a, other);
  await a.click('#mk-result [data-add]'); await a.waitForTimeout(1200);
  const pw = await a.evaluate(() => { const s = document.querySelector('#paywall'); if (!s) return null; const b = s.querySelector('[data-action="pw-buy"]'); return { card: !!s.querySelector('.modal.pw'), price: s.querySelector('#pw-price').textContent, tag: b.tagName, href: b.getAttribute('href') || '', target: b.getAttribute('target'), text: b.textContent, fine: s.querySelector('.pw-fine').textContent, terms: !!s.querySelector('.pw-fine a[href="#/policy/create"]'), restore: s.querySelector('[data-action="pw-restore"]').textContent }; });
  check('adding it opens the plans card: Pro $15 and Max $50 a month', pw && pw.card && /Pro \$15 · Max \$50/.test(pw.price), pw);
  check('Get Pro is a link to her own Pro checkout at RevenueCat, in a new tab', pw && pw.tag === 'A' && /^https:\/\/pay\.rev\.cat\/sbx_pro_link\/mh_\d+$/.test(pw.href) && pw.target === '_blank' && /Get Pro for \$15 a month/.test(pw.text), pw);
  check('the terms: renews monthly, how to cancel, Stripe, works in the app too, Terms and Privacy', pw && /Renews every month at \$15/.test(pw.fine) && /Cancel any time in Your plan/.test(pw.fine) && /Stripe/.test(pw.fine) && /app with this account/.test(pw.fine) && pw.terms, pw && pw.fine);
  await a.click('#paywall [data-action="pw-restore"]'); await a.waitForTimeout(900);
  check('"I already subscribed" before paying says none was found', /No Mathub Pro or Max subscription was found/.test(await txt(a, '#pw-err')));
  // she pays in the other tab (the stand-in RevenueCat now says she has it), then comes back
  const customer = pw.href.split('/').pop();
  const ctxPages = ca.pages().length;
  await a.click('#paywall [data-action="pw-buy"]'); await a.waitForTimeout(600);
  check('after the checkout opens, the card waits for the payment', /Finish paying in the new tab/.test(await txt(a, '#pw-wait')) && /I paid/.test(await txt(a, '#paywall [data-action="pw-restore"]')));
  for (const pg of ca.pages().slice(ctxPages)) await pg.close();
  setRc({ [customer]: { expires: new Date(Date.now() + 30 * 864e5).toISOString(), store: 'rc_billing' } });
  await a.click('#paywall [data-action="pw-restore"]'); await a.waitForTimeout(2000);
  check('once paid, the card closes and the class is added', !(await a.$('#paywall')) && /#\/my\d{4}\/dashboard/.test(a.url()) && (/#\/(my\d{4})\//.exec(a.url()) || [])[1] !== exId, a.url());
  const myId = (/#\/(my\d{4})\//.exec(a.url()) || [])[1];
  srv = (await api(a, 'myclasses')).json.classes || [];
  check('both classes are in her account', srv.length === 2 && srv.some(c => c.id === myId && c.free === false), srv.map(c => [c.id, c.free]));

  // Settings shows the subscription
  await go(a, '#/settings', 1400);
  check('Settings has a Your plan panel: Mathub Pro, renewing, with Manage your plan (the Your plan page) and Move up to Max', /Mathub Pro\. Renews/.test(await txt(a, '#create-panel')) && !!(await a.$('#create-panel [data-cp="max"]')) && !!(await a.$('#create-panel a[href="#/plan"]')), await txt(a, '#create-panel'));

  // a new browser: her classes come back from the account
  const [cn, n] = await mk(1360, 900); await cn.addInitScript(quiet); await go(n, '#/'); await login(n, ALICE); await n.reload(); await n.waitForTimeout(800); await go(n, '#/create', 2500);
  check('in a new browser, signing in brings her classes down from the account', (await n.$$('.mk-item')).length === 2, await txt(n, '#mk-mine'));
  await go(n, `#/${myId}/flashcards`, 2500);
  check('and they open there (read from the account)', /flashcard/i.test(await txt(n, '#view')) && !(await n.$('.sublock')), (await txt(n, '#view')).slice(0, 120));

  // sharing: a link, a code and a QR code
  await go(a, '#/create', 1200);
  await a.click(`[data-sharelink="${myId}"]`); await a.waitForTimeout(1800);
  const sh = await a.evaluate(() => { const s = document.querySelector('#share-sheet'); return s && { url: (s.querySelector('#share-url') || {}).value || '', qr: !!s.querySelector('svg.qr path'), code: (s.querySelector('.share-code b') || {}).textContent || '', text: s.textContent }; });
  check('Share gives a mathub.space/#/c/ link, its code and a QR code', sh && /^https:\/\/mathub\.space\/#\/c\/[A-Z2-9]{8}$/.test(sh.url) && sh.qr && sh.code.replace(/\s| /g, '') === sh.url.slice(-8), sh);
  check('it says who sees what: not her name or progress', sh && /do not see your name or your progress/.test(sh.text));
  const code = sh.url.slice(-8);
  await a.keyboard.press('Escape'); await a.waitForTimeout(400);
  check('her list marks the class as shared', /Shared/.test(await txt(a, `.mk-item:has([data-sharelink="${myId}"])`)));

  // anyone can open the link; a guest is asked to sign in to add it
  await go(g, '#/c/' + code.toLowerCase(), 1800);
  check('a guest opens the link and sees the class', /WEBT 210/.test(await txt(g, '#shared-box')) && !!(await g.$('[data-sc="add"]')), (await txt(g, '#view')).slice(0, 160));
  check('the shared page shows nothing about who made it', !/alice/i.test(await txt(g, '#view')));
  check('no sideways scroll on a shared class at 1360px', await hscroll(g));
  await g.click('[data-sc="report"]'); await g.waitForTimeout(500);
  check('Report opens the report form for this shared class', /Report this shared class/.test(await txt(g, '#report-modal')));
  await g.keyboard.press('Escape'); await g.waitForTimeout(300);

  // Bob is signed in without a plan: adding a shared class asks for it
  const [cb, b] = await mk(390, 844); await cb.addInitScript(quiet); await go(b, '#/'); await login(b, BOB); await b.reload(); await b.waitForTimeout(800);
  for (const c of ((await api(b, 'myclasses')).json.classes || [])) await api(b, 'myclass_delete', { id: c.id });
  await go(b, '#/c/' + code, 1800);
  check('no sideways scroll on a shared class at 390px', await hscroll(b));
  await b.click('[data-sc="add"]'); await b.waitForTimeout(1200);
  check('Bob adding it gets the plans card (he has no plan)', /Adding WEBT 210 to your classes needs Mathub Pro or Max/.test(await txt(b, '#paywall .pw-why')), await txt(b, '#paywall'));
  check('no sideways scroll with the card open at 390px', await hscroll(b));
  await b.keyboard.press('Escape'); await b.waitForTimeout(400);
  // Bo writing a class needs Pro (or Max): Bob is offered both plans, Pro first
  await go(b, '#/create', 1400);
  check('no sideways scroll on the Create page at 390px', await hscroll(b));
  await b.fill('#mk-bo-text', 'TEST 101, Fall 2026'); await b.click('[data-bo-write]'); await b.waitForTimeout(1200);
  const bpw = await b.evaluate(() => { const s = document.querySelector('#paywall'); return s && { why: s.querySelector('.pw-why').textContent, plans: [...s.querySelectorAll('[data-plan]')].map(x => x.dataset.plan), on: (s.querySelector('[data-plan].on') || {}).dataset }; });
  check('Write my class without a plan opens the plans card: Pro (picked) and Max', bpw && /part of Mathub Pro and Max/.test(bpw.why) && bpw.plans.join() === 'pro,max' && bpw.on && bpw.on.plan === 'pro', bpw);
  await b.keyboard.press('Escape'); await b.waitForTimeout(400);
  // the share code form on the Create page goes to the same place
  await go(b, '#/create', 1200); await b.fill('#mk-code', code.slice(0, 4) + '-' + code.slice(4)); await b.click('#mk-code-form button'); await b.waitForTimeout(1500);
  check('a code typed with a dash on the Create page opens the shared class', new RegExp('#/c/' + code + '$').test(b.url()) && /WEBT 210/.test(await txt(b, '#shared-box')), b.url());

  // when the plan ends, her class from a syllabus is locked; the free example stays open
  setRc({ [customer]: { expires: new Date(Date.now() - 864e5).toISOString(), store: 'rc_billing' } });
  await go(a, '#/settings', 1400); await a.click('#create-panel [data-cp="check"]'); await a.waitForTimeout(1800);
  check('after it ends, Settings says there is no plan', /No plan\./.test(await txt(a, '#create-panel')), await txt(a, '#create-panel'));
  await go(a, `#/${myId}/dashboard`, 1500);
  check('her class is locked, kept with the account', !!(await a.$('.sublock')) && /saved with your account/.test(await txt(a, '.sublock')) && /I already subscribed/.test(await txt(a, '.sublock')));
  await go(a, `#/${exId}/dashboard`, 1500);
  check('the free example class still opens', !(await a.$('.sublock')));

  // she stops sharing: the link stops working
  await go(a, '#/create', 1200); await a.click(`[data-sharelink="${myId}"]`); await a.waitForTimeout(1500);
  await a.click('#share-sheet [data-sh="stop"]'); await a.waitForTimeout(1200);
  await go(g, '#/c/' + code, 1800);
  check('after she stops sharing, the link says it is not shared any more', /not shared any more/.test(await txt(g, '#shared-box')), await txt(g, '#shared-box'));

  // deleting removes it from the account and, on the next sync, from the other browser
  await go(a, '#/create', 1200); await a.click(`[data-del="${myId}"]`); await a.waitForTimeout(1500);
  srv = (await api(a, 'myclasses')).json.classes || [];
  check('Delete removes it from her account', srv.length === 1 && srv[0].id === exId, srv.map(c => c.id));
  await n.evaluate(() => App.classSync.run(true)); await n.waitForTimeout(800); await go(n, '#/create', 1500);
  check('and the other browser drops it when it syncs', (await n.$$('.mk-item')).length === 1, await txt(n, '#mk-mine'));

  // signing out on the website clears her classes from this browser
  await a.evaluate(() => App.auth.logout()); await a.waitForTimeout(1500);
  const left = await a.evaluate(() => ({ list: JSON.parse(localStorage.getItem('mh-my-classes') || '[]').length, reg: Object.keys(window.Courses).filter(k => /^my\d{4}$/.test(k)).length }));
  check('signing out takes her classes off this browser', left.list === 0 && left.reg === 0, left);

  for (const c of ((await api(n, 'myclasses')).json.classes || [])) await api(n, 'myclass_delete', { id: c.id });
  try { fs.unlinkSync(STATE); } catch (e) {}
  log('share code:', code);
  await T.finish();
})().catch(e => { console.error(e); try { require('fs').unlinkSync(require('path').join(__dirname, 'fixtures', 'rc-state.json')); } catch (x) {} process.exit(1); });

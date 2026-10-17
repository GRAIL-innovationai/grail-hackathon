/* ============================================================
   The welcome after sign-up (assets/welcome.js, api welcome_done):
   - a new account gets it right after verifying its email: a walk through Mathub (with Back, Skip the tour,
     the keyboard), then the classes it takes (at least one) and a membership (Free, Pro or Max; Pro and Max
     open the checkout, and closing it leaves you on Free), then You're all set
   - until those choices are made it comes back at every visit; once made, never again, and the old tour
     does not start on top of it; accounts from before it never see it
   - it works on a phone, and nothing moves when motion is reduced
   The test account is deleted at the end (the normal Delete account route).
   ============================================================ */
const T = require('./lib');
const fs = require('fs'); const path = require('path'); const { spawnSync } = require('child_process');
const LOG = path.join(__dirname, '..', 'api', 'data', 'mail.log'); const DB = path.join(__dirname, '..', 'api', 'data', 'mathub.sqlite');
const row = email => JSON.parse(spawnSync('php', ['-r', '$d = new PDO("sqlite:" . $argv[1]); $s = $d->prepare("SELECT welcomed, plan_choice, courses FROM users WHERE email = ?"); $s->execute([$argv[2]]); echo json_encode($s->fetch(PDO::FETCH_ASSOC));', DB, email], { encoding: 'utf8' }).stdout || 'null');
(async () => {
  const { mk, txt, login, api, go, hscroll, check } = await T.start();
  const PASS = 'correct-horse-battery-9';
  const newAccount = async (p, email) => {
    await api(p, 'signup', { email, password: PASS, name: 'Riley Quinn' });
    const log = fs.readFileSync(LOG, 'utf8'); const code = /\b(\d{6})\b/.exec(log.slice(log.lastIndexOf('to=' + email)))[1];
    return (await api(p, 'verify', { email, code })).json;
  };
  const step = p => p.$eval('#welcome', e => e.dataset.step).catch(() => 'closed');
  const next = async p => { await p.$eval('#welcome .wl-next', b => b.click()); await p.waitForTimeout(450); };   // it may be aria-disabled, which still answers a press with a hint

  // a brand-new account on a laptop
  const [c, p] = await mk(1360, 900, { serviceWorkers: 'block' });
  await go(p, '#/', 700);
  const email = `welcome.${Date.now().toString(36)}@montana.edu`;
  const v = await newAccount(p, email);
  check('a new account is not welcomed yet', v.ok && v.user.welcomed === false, v.user);
  await p.reload(); await p.waitForTimeout(1500);
  const dlg = await p.evaluate(() => { const w = document.querySelector('#welcome'); return w && { role: w.getAttribute('role'), modal: w.getAttribute('aria-modal'), step: w.dataset.step, h: w.querySelector('h1').textContent, focus: document.activeElement && document.activeElement.id, skip: !w.querySelector('.wl-skip').hidden, tour: !!document.querySelector('.tour') }; });
  check('the welcome opens: a dialog that greets them by name, with the heading focused', dlg && dlg.role === 'dialog' && dlg.modal === 'true' && dlg.step === 'hello' && /Welcome to Mathub, Riley!/.test(dlg.h) && dlg.focus === 'wl-h' && dlg.skip && !dlg.tour, dlg);
  await next(p);
  check('Next walks on: every class is a climb', (await step(p)) === 'climb' && /Every class is a climb/.test(await txt(p, '#wl-h')));
  check('the trail at the top follows', (await p.$eval('#welcome', e => getComputedStyle(e).getPropertyValue('--s').trim())) === '1');
  await p.click('#welcome [data-w="back"]'); await p.waitForTimeout(450);
  check('Back goes back', (await step(p)) === 'hello');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(450); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(450);
  check('the arrow keys walk too: practice', (await step(p)) === 'practice' && /Practice that sticks/.test(await txt(p, '#wl-h')));
  await next(p);
  check('then Bo, with his board and calls', (await step(p)) === 'bo' && /Meet Bo/.test(await txt(p, '#wl-h')) && /Solving 2x \+ 3 = 11/.test(await txt(p, '.wa-board')));
  await next(p);
  check('then any class from its syllabus', (await step(p)) === 'create' && /Any class, from its syllabus/.test(await txt(p, '#wl-h')));
  await p.click('#welcome [data-w="back"]'); await p.waitForTimeout(450); await p.keyboard.press('Escape'); await p.waitForTimeout(450);
  check('Esc skips the rest of the tour, straight to the classes', (await step(p)) === 'classes' && (await p.$eval('#welcome .wl-skip', b => b.hidden)));
  // the classes: at least one
  check('Continue waits for a class', (await p.$eval('#welcome .wl-next', b => b.getAttribute('aria-disabled'))) === 'true');
  await next(p);
  check('Continue without one says to pick one, and stays', (await step(p)) === 'classes' && /at least one class/.test(await txt(p, '#wl-msg')));
  const cards = await p.$$eval('.wl-class', bs => bs.map(b => b.dataset.c));
  check('every class is offered, as pressable cards', cards.includes('calc') && cards.includes('physics') && cards.length >= 8, cards);
  await p.click('.wl-class[data-c="calc"]'); await p.click('.wl-class[data-c="physics"]'); await p.click('.wl-class[data-c="physics"]');
  check('picking marks the card and counts it', (await p.$eval('.wl-class[data-c="calc"]', b => b.getAttribute('aria-pressed'))) === 'true' && (await p.$eval('.wl-class[data-c="physics"]', b => b.getAttribute('aria-pressed'))) === 'false' && /Continue with 1 class/.test(await txt(p, '#welcome .wl-next')));
  // left halfway: it comes back
  await p.reload(); await p.waitForTimeout(1500);
  check('leaving before choosing brings the welcome back next time', (await step(p)) === 'hello' && row(email).welcomed === 0);
  await p.click('#welcome [data-w="skip"]'); await p.waitForTimeout(450);
  await p.click('.wl-class[data-c="calc"]'); await next(p);
  // the membership
  check('then the membership: Free, Pro and Max, with their prices', (await step(p)) === 'plan' && (await p.$$eval('.wl-plan', bs => bs.map(b => b.dataset.p).join())) === 'free,pro,max' && /\$15/.test(await txt(p, '.wl-plan[data-p="pro"]')) && /\$50/.test(await txt(p, '.wl-plan[data-p="max"]')));
  check('Continue waits for a choice', (await p.$eval('#welcome .wl-next', b => b.getAttribute('aria-disabled'))) === 'true');
  await p.click('.wl-plan[data-p="max"]');
  check('picking Max offers its checkout', (await p.$eval('.wl-plan[data-p="max"]', b => b.getAttribute('aria-checked'))) === 'true' && /Get Max · \$50 a month/.test(await txt(p, '#welcome .wl-next')));
  await next(p); await p.waitForTimeout(900);
  check('which opens the Max checkout card on top', /Mathub Max/.test(await txt(p, '#paywall h2')) && (await step(p)) === 'plan');
  await p.keyboard.press('Escape'); await p.waitForTimeout(700);
  check('closing it leaves them on Free, and says so', !(await p.$('#paywall')) && /on Free for now/.test(await txt(p, '#wl-plan-note')) && /Start with Free/.test(await txt(p, '#welcome .wl-next')));
  await next(p); await p.waitForTimeout(900);
  const done = await p.evaluate(() => ({ step: document.querySelector('#welcome') && document.querySelector('#welcome').dataset.step, sum: (document.querySelector('.wl-sum') || {}).textContent, courses: App.settings().courses, tour: App.settings().tourDone, welcomed: App.auth.user.welcomed }));
  check('You\'re all set: their classes and membership', done.step === 'ready' && /Calc I/.test(done.sum) && /Free/.test(done.sum) && done.courses.join() === 'calc' && done.tour === true && done.welcomed === true, done);
  const saved = row(email);
  check('saved with the account: welcomed, the classes and the membership picked', saved.welcomed > 0 && saved.plan_choice === 'free' && JSON.parse(saved.courses).join() === 'calc', saved);
  await next(p); await p.waitForTimeout(900);
  check('Open my start page closes it, and the old tour does not start on top', !(await p.$('#welcome')) && !(await p.$('.tour')) && /^#\/?$/.test(new URL(p.url()).hash || '#/'));
  await p.reload(); await p.waitForTimeout(2200);
  check('once done, it never comes back', !(await p.$('#welcome')));
  const gone = await api(p, 'account_delete', { password: PASS });
  check('the test account is deleted', gone.json && gone.json.ok);
  await c.close();

  // an existing account never sees it; the server refuses empty choices
  const [ca, a] = await mk(1360, 900, { serviceWorkers: 'block' });
  await go(a, '#/', 600); await login(a, 'alice.a@montana.edu'); await a.reload(); await a.waitForTimeout(1500);
  check('an account from before the welcome does not get it', !(await a.$('#welcome')) && (await a.evaluate(() => App.auth.user.welcomed)) === true);
  const e1 = await api(a, 'welcome_done', { courses: [], plan: 'free' }); const e2 = await api(a, 'welcome_done', { courses: ['calc'], plan: '' });
  check('the server needs at least one class and a membership', e1.status === 400 && /at least one class/.test(e1.json.error) && e2.status === 400 && /membership/.test(e2.json.error));
  await ca.close();

  // a phone, with motion reduced
  const [cp, ph] = await mk(390, 844, { serviceWorkers: 'block', reducedMotion: 'reduce' });
  await go(ph, '#/', 700);
  const email2 = `welcome.p${Date.now().toString(36)}@montana.edu`;
  await newAccount(ph, email2); await ph.reload(); await ph.waitForTimeout(1500);
  check('phone: the welcome opens and does not scroll sideways', (await step(ph)) === 'hello' && await hscroll(ph));
  check('phone: nothing moves when motion is reduced', await ph.$eval('#welcome .wa-bo', e => getComputedStyle(e).animationName === 'none'));
  await ph.click('#welcome [data-w="skip"]'); await ph.waitForTimeout(300);
  const lay = await ph.evaluate(() => { const cs = [...document.querySelectorAll('.wl-class')].map(b => b.getBoundingClientRect()); const n = document.querySelector('#welcome .wl-next').getBoundingClientRect(); return { oneCol: cs[1].top >= cs[0].bottom - 1 && Math.abs(cs[1].left - cs[0].left) < 2, next: n.bottom <= innerHeight + 1 && n.height >= 44, w: innerWidth }; });
  check('phone: the classes stack, and Continue stays on screen', lay.oneCol && lay.next, lay);
  await ph.click('.wl-class[data-c="physics"]'); await next(ph);
  await ph.click('.wl-plan[data-p="free"]'); await next(ph); await ph.waitForTimeout(500);
  check('phone: done with Free', (await step(ph)) === 'ready' && row(email2).plan_choice === 'free');
  await api(ph, 'account_delete', { password: PASS });
  await cp.close();
  await T.finish();
})();

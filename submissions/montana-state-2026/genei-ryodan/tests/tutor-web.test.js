/* ============================================================
   Mathub Pro and Max, Ask Bo and "Let Bo write it", in the browser (assets/tutor.js, assets/create.js):
   - guests are asked to sign in; without Max the tutor shows what Bo does and offers Max only;
     Pro members are offered the move up to Max
   - a Max member agrees to what is sent to the AI first, then chats: Bo greets with the next exam and
     the weakest topic (from this device, free), answers with the progress snapshot sent along, keeps
     notes she can see and delete, takes a photo, and every answer can be reported
   - Bo writes a class from a pasted syllabus, step by step, and it is added like any other class
   The AI and RevenueCat are stand-ins (tests/pyodide/router.php); mod.user has Max through plan_grants.
   ============================================================ */
const T = require('./lib');
const fs = require('fs'); const path = require('path');
const STATE = path.join(__dirname, 'fixtures', 'rc-state.json'); const LAST = path.join(__dirname, 'fixtures', 'ai-last.json');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAAABJRU5ErkJggg==';
(async () => {
  const { mk, txt, login, api, go, hscroll, check } = await T.start();
  fs.writeFileSync(STATE, '{}');
  const quiet = () => document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.celebrate{display:none!important}'; document.head.appendChild(st); });
  const setup = () => { try { const s = JSON.parse(localStorage.getItem('studyhub-settings') || '{}'); s.tourDone = true; s.courses = ['calc', 'physics']; s.asof = '2026-10-13'; localStorage.setItem('studyhub-settings', JSON.stringify(s)); } catch (e) {} };
  const open = async (w, h, email) => { const [c, p] = await mk(w, h, { serviceWorkers: 'block' }); await c.addInitScript(quiet); await c.addInitScript(setup); await go(p, '#/', 600); if (email) { await login(p, email); await p.reload(); await p.waitForTimeout(900); } return [c, p]; };
  const last = () => JSON.parse(fs.readFileSync(LAST, 'utf8'));

  // a guest
  const [cg, g] = await open(1360, 900);
  await go(g, '#/tutor', 1500);
  check('a guest is asked to sign in to talk with Bo', /Sign in to talk with Bo/.test(await txt(g, '#bo-main')) && !!(await g.$('[data-go="login"]')));
  await go(g, '#/calc/dashboard', 1500);
  check('the website\'s top bar has Ask Bo, pointing at the class you are in', (await g.$eval('#bo-top', a => a.getAttribute('href'))) === '#/tutor/calc' && /Ask Bo/.test(await txt(g, '#bo-top')));
  await cg.close();

  // alice without a plan, then with Pro
  const [ca, a] = await open(1360, 900, 'alice.a@montana.edu');
  await api(a, 'create_status&refresh=1');
  await go(a, '#/tutor', 1800);
  check('without Max: Meet Bo, what he does, and Get Mathub Max', /Meet Bo, your tutor/.test(await txt(a, '#bo-main')) && (await a.$$('.bo-perks li')).length === 5 && /Call him/.test(await txt(a, '.bo-perks')) && /Get Mathub Max/.test(await txt(a, '[data-go="max"]')));
  await a.click('[data-go="max"]'); await a.waitForTimeout(1500);
  const pw = await a.evaluate(() => { const s = document.querySelector('#paywall'); return s && { h: s.querySelector('h2').textContent, plans: [...s.querySelectorAll('[data-plan]')].map(b => b.dataset.plan), buy: (s.querySelector('[data-action="pw-buy"]') || {}).textContent, href: (s.querySelector('[data-action="pw-buy"]') || {}).getAttribute && s.querySelector('[data-action="pw-buy"]').getAttribute('href'), why: s.querySelector('.pw-why').textContent }; });
  check('Bo\'s paywall offers Max only, at $50, with her Max checkout', pw && pw.h === 'Mathub Max' && pw.plans.join() === 'max' && /Get Max for \$50 a month/.test(pw.buy) && /^https:\/\/pay\.rev\.cat\/sbx_max_link\/mh_\d+$/.test(pw.href) && /part of Mathub Max/.test(pw.why), pw);
  await a.keyboard.press('Escape'); await a.waitForTimeout(300);
  const aliceId = (await api(a, 'create_status')).json.customer;
  fs.writeFileSync(STATE, JSON.stringify({ [aliceId]: { expires: new Date(Date.now() + 30 * 864e5).toISOString(), plan: 'pro' } }));
  await api(a, 'create_status&refresh=1'); await a.evaluate(() => App.subscription.refresh(true)); await a.waitForTimeout(500);
  await go(a, '#/create', 1500);
  check('with Pro, the Create page says Pro is on and Bo writes her classes, with the way up to Max for Ask Bo', /Mathub Pro is on: Bo writes your classes/.test(await txt(a, '#mk-sub')) && !!(await a.$('#mk-bo-text')) && /classes left this month/.test(await txt(a, '#mk-bo-left')), await txt(a, '#mk-sub'));
  await a.fill('#mk-bo-text', 'TEST 102 Pro writing, Fall 2026. Exam 1 Oct 20. Topics: ratios, percents, rates, growth.');
  await a.click('[data-bo-write]'); await a.waitForTimeout(5000);
  check('Bo writes a class for a Pro member too: no plans card, the steps run, then the preview with Add', !(await a.$('#paywall')) && (await a.$$eval('#mk-bo-steps li.done', l => l.length)) === 4 && /TEST 101/.test(await txt(a, '#mk-bo-result')) && !!(await a.$('#mk-bo-result [data-add]')) && /Your class is ready/.test(await txt(a, '#mk-prog-now')), await txt(a, '#mk-bo'));
  await a.click('#mk-sub [data-action="sub-max"]'); await a.waitForTimeout(1200);
  check('the move-up card: Max only, and a note to cancel Pro on the website so she is not billed twice', /Move up to Max/.test(await txt(a, '#paywall h2')) && /cancel Pro/.test(await txt(a, '#paywall .pw-fine')) && /Move up to Max for \$50 a month/.test(await txt(a, '#paywall [data-action="pw-buy"]')));
  await a.keyboard.press('Escape');
  fs.writeFileSync(STATE, '{}'); await api(a, 'create_status&refresh=1');
  await ca.close();

  // a Max member (granted)
  const [cm, m] = await open(1360, 900, 'mod.user@montana.edu');
  await api(m, 'ai_forget', { what: 'all' });
  for (const c of ((await api(m, 'myclasses')).json.classes || [])) await api(m, 'myclass_delete', { id: c.id });
  await m.evaluate(() => App.setSetting('aiConsent', 0));
  await go(m, '#/tutor/calc', 1800);
  const cons = await txt(m, '#bo-main');
  check('before the first question: what is sent to Anthropic, that it is not used for training, and where the chat is kept', /Before you start/.test(cons) && /Anthropic/.test(cons) && /does not train/.test(cons) && /saved with your Mathub account/.test(cons) && !!(await m.$('[data-go="agree"]')), cons.slice(0, 200));
  await m.click('[data-go="agree"]'); await m.waitForTimeout(1800);
  const greet = await txt(m, '#bo-log .bo-msg.bo');
  check('Bo greets from what the device knows (no AI call): the next exam and the weakest topic', /I'm Bo/.test(greet) && /Exam 2 is in 3 days/.test(greet) && /weakest topic/.test(greet), greet);
  check('suggestions to start from', (await m.$$('#bo-suggest .bo-chip')).length >= 3 && /Quiz me for Exam 2/.test(await txt(m, '#bo-suggest')));
  check('a clear way back: Your classes and the class\'s own page, at the top', (await m.$eval('.bo-nav a.bo-back', a => a.getAttribute('href'))) === '#/' && !!(await m.$('.bo-nav a[href="#/calc/dashboard"]')) && /Your classes/.test(await txt(m, '.bo-nav')) && /Open Calc I/.test(await txt(m, '.bo-nav')));
  await m.fill('#bo-q', 'Please remember I like worked examples. And math: is x < 3?'); await m.click('.bo-send'); await m.waitForTimeout(2500);
  const reply = await txt(m, '#bo-log .bo-msg.bo:last-child');
  check('Bo answers in the chat, with what the device sent: her weakest topic', /Bo here\. Your weakest topic is/.test(reply) && /x < 3 here/.test(reply), reply.slice(0, 200));
  const q = last(); const sys = q.system.map(b => b.text).join('\n');
  check('the device sent a progress snapshot (readiness, topics, due cards) and the date it uses', /READINESS: Exam 2 on 2026-10-16 \(3 days\)/.test(sys) && /WEAKEST TOPICS: /.test(sys) && /TODAY: 2026-10-13/.test(sys) && /flashcards due/.test(sys), sys.slice(-600));
  check('a note Bo keeps shows under his answer, with Forget it', /Bo will remember: Likes worked examples first/.test(await txt(m, '#bo-log .bo-remember')));
  await m.click('#bo-log .bo-msg.bo:last-child [data-bo-report]'); await m.waitForTimeout(500);
  check('every answer can be reported', /Report this answer from Bo/.test(await txt(m, '#report-modal')));
  await m.keyboard.press('Escape'); await m.waitForTimeout(300);
  // a photo
  await m.setInputFiles('#bo-file', { name: 'problem.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') }); await m.waitForTimeout(600);
  check('a photo shows before sending, and can be removed', !!(await m.$('#bo-photo-prev img')) && !!(await m.$('#bo-photo-prev [data-bo-unphoto]')));
  await m.fill('#bo-q', 'Help with this one'); await m.click('.bo-send'); await m.waitForTimeout(2500);
  const lq = last(); const lc = lq.messages[lq.messages.length - 1].content;
  check('the photo goes as a small JPEG made on the device, and Bo sees it', lc[0].type === 'image' && lc[0].source.media_type === 'image/jpeg' && /I see your photo/.test(await txt(m, '#bo-log .bo-msg.bo:last-child')) && /Photo/.test(await m.evaluate(() => { const y = document.querySelectorAll('#bo-log .bo-msg.you'); return y[y.length - 1].textContent; })), lc.map(b => b.type));
  // Bo's board: beside the chat on a wide screen, empty until he writes on it
  const bd0 = await m.evaluate(() => { const b = document.querySelector('#bo-board'); const r = b.getBoundingClientRect(); const c = document.querySelector('#bo-main').getBoundingClientRect(); return { shown: !b.hidden && r.width > 360, beside: r.left >= c.right, tall: r.height > 500, empty: /Nothing on the board yet/.test(b.textContent), fold: getComputedStyle(b.querySelector('[data-bb="fold"]')).display }; });
  check('on a wide screen, Bo\'s board sits beside the chat, tall, empty for now (and it does not fold)', bd0.shown && bd0.beside && bd0.tall && bd0.empty && bd0.fold === 'none', bd0);
  await m.fill('#bo-q', 'Can you solve 2x + 3 = 11?'); await m.click('.bo-send');
  await m.waitForTimeout(700);
  const writing = await m.evaluate(() => ({ live: !!document.querySelector('#bo-log .bo-msg.live'), title: (document.querySelector('#bo-board .bb-title') || {}).textContent || '' }));
  await m.waitForTimeout(2600);
  const bd1 = await m.evaluate(() => { const b = document.querySelector('#bo-board'); return { title: (b.querySelector('.bb-title') || {}).textContent, steps: [...b.querySelectorAll('.bb-step')].map(x => x.textContent.replace(/\s+/g, ' ').trim()), nums: [...b.querySelectorAll('.bb-n')].map(x => x.textContent), answer: (b.querySelector('.bb-answer') || {}).textContent, tip: (b.querySelector('.bb-tip') || {}).textContent, pager: b.querySelector('.bb-pager').hidden, writing: !!b.querySelector('.bb-writing') }; });
  check('Bo writes the worked problem on his board: a title, numbered steps with their math, the answer boxed, a tip', bd1.title === 'Solving 2x + 3 = 11' && bd1.steps.length === 2 && bd1.nums.join() === '1,2' && /Take 3 from both sides/.test(bd1.steps[0]) && /2x = 8/.test(bd1.steps[0]) && /Answer/.test(bd1.answer) && /x = 4/.test(bd1.answer) && /Check it/.test(bd1.tip) && bd1.pager && !bd1.writing, bd1);
  check('the page goes up while he is still writing', writing.title === 'Solving 2x + 3 = 11' || writing.live, writing);
  const msg1 = await m.evaluate(() => { const b = [...document.querySelectorAll('#bo-log .bo-msg.bo')].pop(); return { text: b.querySelector('.bo-text').textContent, chip: (b.querySelector('[data-bo-page]') || {}).textContent }; });
  check('in the chat he just talks, with a link to the page instead of the math', /one step at a time/.test(msg1.text) && /On the board: Solving 2x \+ 3 = 11/.test(msg1.chip || '') && !/Take 3 from both sides/.test(msg1.text) && !/\[board/.test(msg1.text), msg1);
  await m.fill('#bo-q', 'Solve it again, slower'); await m.click('.bo-send'); await m.waitForTimeout(3200);
  check('a second page: the board turns to it, with the pages to flip through', /Page 2 of 2/.test(await txt(m, '#bo-board .bb-pos')) && !(await m.$('#bo-board .bb-pager[hidden]')));
  await m.click('#bo-board [data-bb="prev"]'); await m.waitForTimeout(300);
  check('flipping back shows page 1, and its link in the chat lights up', /Page 1 of 2/.test(await txt(m, '#bo-board .bb-pos')) && await m.$eval('#bo-log [data-bo-page="0"]', b => b.classList.contains('on')));
  await m.click('#bo-log [data-bo-page="1"]'); await m.waitForTimeout(300);
  check('the link in a message opens its page', /Page 2 of 2/.test(await txt(m, '#bo-board .bb-pos')));
  await m.click('#bo-board [data-bb="copy"]'); await m.waitForTimeout(300);
  check('a page can be copied as text', /Page copied|Copying is not available/.test(await txt(m, '.toast')));
  // What Bo knows: a sheet from the i button
  await m.click('[data-bo="knows"]'); await m.waitForTimeout(500);
  const k = await txt(m, '#bo-knows');
  check('What Bo knows: the class, the next exam, weakest topics, his notes and questions left', /The class/.test(k) && /Exam 2, in 3 days/.test(k) && /Weakest topics/.test(k) && /Likes worked examples first/.test(k) && /questions left/.test(k), k.slice(0, 300));
  await m.click('#bo-knows [data-k-note="0"]'); await m.waitForTimeout(700);
  check('a note can be deleted there', !/Likes worked examples first/.test(await txt(m, '#bo-knows .bo-k-notes')) && ((await api(m, 'ai_status')).json.notes || []).length === 0);
  await m.keyboard.press('Escape'); await m.waitForTimeout(300);
  // the chat is kept with the account
  await m.reload(); await m.waitForTimeout(2200);
  check('the chat is still there after a reload (kept with the account), and so are the pages of the board', (await m.$$('#bo-log .bo-msg.you')).length === 4 && (await m.$$('#bo-log .bo-msg.bo')).length === 4 && /Page 2 of 2/.test(await txt(m, '#bo-board .bb-pos')));
  // he draws: a graph on his board, with the steps under it
  await m.fill('#bo-q', 'Can you graph x^2 - 3 and show me where it is negative?'); await m.keyboard.press('Enter'); await m.waitForTimeout(4500);
  const dw = await m.evaluate(() => { const b = document.querySelector('#bo-board'); const f = b.querySelector('.bb-draw'); const svg = f && f.querySelector('svg'); return { title: (b.querySelector('.bb-title') || {}).textContent, first: b.querySelector('.bb-items > *') === f, role: svg && svg.getAttribute('role'), name: svg && svg.querySelector('title').textContent, curve: !!b.querySelector('.bd-curve'), shade: !!b.querySelector('.bd-fill'), dots: b.querySelectorAll('.bd-dot').length, ticks: b.querySelectorAll('.bd-tick').length, cap: (b.querySelector('.bd-cap') || {}).textContent, step: !!b.querySelector('.bb-step'), answer: !!b.querySelector('.bb-answer'), chip: (document.querySelector('#bo-log .bo-msg.bo:last-of-type .bo-onb') || {}).textContent, chat: (document.querySelector('#bo-log .bo-msg.bo:last-of-type') || {}).textContent }; });
  check('Bo draws: the graph comes first on the page (curve, shaded part, the roots marked, numbered axes, what to notice), then the steps and the answer', dw.title === 'Where y = x^2 - 3 is below zero' && dw.first && dw.role === 'img' && /Graph of y = x² - 3/.test(dw.name) && dw.curve && dw.shade && dw.dots === 2 && dw.ticks > 6 && /Below zero between the two roots/.test(dw.cap) && dw.step && dw.answer, dw);
  check('the chat links to that page and never shows the drawing\'s code', /On the board: Where y = x\^2 - 3 is below zero/.test(dw.chip || '') && !/"type":"graph"/.test(dw.chat) && /See the red part\?/.test(dw.chat), dw.chat);
  await m.reload(); await m.waitForTimeout(2200);
  check('the drawing is still on the board after a reload', !!(await m.$('#bo-board .bb-draw svg .bd-curve')) && !(await m.$('#bo-board .bd.bd-anim')));
  const kinds = await m.evaluate(() => { const D = App.boDraw; return [
    { type: 'graph', fns: [{ f: '1/(x-1)', label: 'y = 1/(x - 1)' }, { x: 'cos(t)', y: 'sin(t)', t: [0, 6.3] }], vlines: [{ x: 1, label: 'x = 1' }], points: [{ x: 0, y: -1, open: true }], segments: [{ from: [0, 0], to: [1, 1], arrow: true }] },
    { type: 'numberline', min: -3, max: 5, points: [{ x: 2, open: true }], intervals: [{ from: 2, to: null, left: 'open' }] },
    { type: 'figure', shapes: [{ kind: 'polygon', points: [[0, 0], [4, 0], [4, 3]], labels: ['A', 'B', 'C'] }, { kind: 'angle', at: [4, 0], from: [0, 0], to: [4, 3], right: true }, { kind: 'circle', center: [0, 0], r: 1 }, { kind: 'arrow', from: [0, 0], to: [2, 2], label: 'F' }, { kind: 'rect', at: [5, 0], w: 2, h: 1, text: 'box' }] },
    { type: 'table', head: ['x', 'y'], rows: [['0', '$1$']] },
    { type: 'bars', bars: [{ label: 'A', value: 3 }, { label: 'B', value: -2 }], hist: true },
    { type: 'normal', mean: 70, sd: 8, from: null, to: 62 },
    { type: 'tree', branches: [{ label: 'H', p: '1/2', children: [{ label: 'H', p: '1/2', result: 'HH 1/4' }] }, { label: 'T', p: '1/2' }] }
  ].map(o => { const sp = D.parse(JSON.stringify(o)); const h = sp ? D.html(sp, false) : ''; return [o.type, !!sp, /<svg|<table/.test(h), /NaN|undefined|Infinity/.test(h), D.plain(sp).length > 10]; }); });
  check('every kind of drawing draws cleanly and has words for screen readers: graph, number line, figure, table, bars, normal curve, tree', kinds.every(k => k[1] && k[2] && !k[3] && k[4]), kinds);
  const bad = await m.evaluate(() => { const D = App.boDraw; return [D.parse('{"type":"graph","fns":[{"f":"alert(1)"}]}'), D.parse('{"type":"script"}'), D.parse('not json'), D.html(D.parse({ type: 'table', head: ['<script>alert(1)</script>'], rows: [['<img src=x onerror=alert(1)>']] }))]; });
  check('a drawing is only data: code, unknown kinds and broken JSON are refused, and its text is escaped', bad[0] === null && bad[1] === null && bad[2] === null && !/<script|<img/.test(bad[3]) && /&lt;script&gt;/.test(bad[3]), bad);
  const st = await m.evaluate(() => { const sp = App.boBoard.split('Here it is.\ndraw: {"type":"table","head":["x"],"rows":[["1"]]}\nWhat do you see?', false); const live = App.boBoard.split('Look:\ndraw: {"type":"tab', true); return { say: sp.say, kinds: sp.pages.map(p => p.items.map(i => i.k).join()).join(), liveSay: live.say, livePages: live.pages.length }; });
  check('a drawing written outside a page still goes on the board, and its JSON never shows in the chat (not even half-written)', st.say === 'Here it is.\n\u00020\u0002\nWhat do you see?' && st.kinds === 'draw' && !/draw/.test(st.liveSay) && st.livePages === 0, st);
  // exam week leads to Bo
  await go(m, '#/calc/dashboard', 1800);
  const quiz = await m.$eval('.xw-dash .xw-item[href^="#/tutor/"]', x => x.getAttribute('href'));
  check('exam week has "Ask Bo to quiz you"', quiz === '#/tutor/calc?q=quiz', quiz);
  await go(m, quiz, 2200);
  check('which opens Bo with the quiz request ready to send', /Quiz me for Exam 2/.test(await m.$eval('#bo-q', x => x.value)));
  // Bo writes a class
  await go(m, '#/create', 1500);
  check('with Max, the Create page says so, with the link to ask Bo, and the syllabus form', /Mathub Max is on/.test(await txt(m, '#mk-sub')) && !!(await m.$('#mk-sub a[href="#/tutor"]')) && !!(await m.$('#mk-bo-text')));
  await m.fill('#mk-bo-text', 'TEST 101 Testing Bo, Fall 2026. Exam 1 Oct 20. Topics: ratios, percents, rates, growth.');
  await m.click('[data-bo-write]'); await m.waitForTimeout(5000);
  const steps = await m.$$eval('#mk-bo-steps li', ls => ls.map(l => [l.textContent.trim(), l.className]));
  check('Bo shows his steps: reading the syllabus, each unit, checking', steps.length === 4 && steps.every(s => s[1] === 'done') && /Writing unit 1: Numbers/.test(steps[1][0]), steps);
  check('then the class preview with Add', /TEST 101/.test(await txt(m, '#mk-bo-result')) && /4 topics/.test(await txt(m, '#mk-bo-result')) && !!(await m.$('#mk-bo-result [data-add]')));
  await m.click('#mk-bo-result [data-add]'); await m.waitForTimeout(2000);
  check('adding it opens the class (no paywall: Max includes making classes)', !(await m.$('#paywall')) && /#\/my\d{4}\/dashboard/.test(m.url()), m.url());
  const saved = (await api(m, 'myclasses')).json.classes || [];
  check('and it is saved with the account', saved.some(c => c.code === 'TEST 101'), saved.map(c => c.code));
  await go(m, `#/${saved[0].id}/practice`, 1500);
  check('the class Bo wrote has a working quizzer', /Quizzer/.test(await txt(m, '#view')));
  await cm.close();

  // phones
  const [cp, ph] = await open(390, 844, 'mod.user@montana.edu');
  await ph.evaluate(() => App.setSetting('aiConsent', Date.now()));
  await go(ph, '#/tutor/calc', 2200);
  check('phone: Ask Bo does not scroll sideways', await hscroll(ph));
  const pos = await ph.evaluate(() => { const c = document.querySelector('.bo-compose').getBoundingClientRect(); const t = document.querySelector('#tabbar'); return { composer: Math.round(c.bottom), tabbar: t ? Math.round(t.getBoundingClientRect().top) : innerHeight }; });
  check('phone: the message box sits above the tab bar', pos.composer <= pos.tabbar + 1, pos);
  const pb = await ph.evaluate(() => { const b = document.querySelector('#bo-board'); const r = b.getBoundingClientRect(); const l = document.querySelector('#bo-log').getBoundingClientRect(); return { above: !!(b.compareDocumentPosition(document.querySelector('#bo-log')) & Node.DOCUMENT_POSITION_FOLLOWING), w: r.width, sticky: getComputedStyle(b).position, sheet: b.querySelector('.bb-sheet').getBoundingClientRect().height }; });
  check('phone: the board is above the chat, sticky, and not too tall', pb.above && pb.w > 300 && pb.sticky === 'sticky' && pb.sheet > 80 && pb.sheet <= 320, pb);
  await ph.evaluate(() => scrollTo(0, document.body.scrollHeight)); await ph.waitForTimeout(300);
  check('phone: scrolling the chat, the board stays on screen', await ph.$eval('#bo-board', b => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.top < 40; }));
  await ph.click('#bo-board [data-bb="fold"]'); await ph.waitForTimeout(250);
  const folded = await ph.evaluate(() => { const b = document.querySelector('#bo-board'); return { fold: b.hasAttribute('data-fold'), h: b.getBoundingClientRect().height, exp: b.querySelector('[data-bb="fold"]').getAttribute('aria-expanded'), saved: App.settings().boBoardFold }; });
  check('phone: the board folds down to its bar (and stays folded next time)', folded.fold && folded.h < 70 && folded.exp === 'false' && folded.saved === true, folded);
  await ph.click('#bo-log [data-bo-page="0"]'); await ph.waitForTimeout(250);
  check('phone: a page link in the chat unfolds the board on that page', !(await ph.$('#bo-board[data-fold]')) && /Page 1 of 3/.test(await txt(ph, '#bo-board .bb-pos')));
  await ph.evaluate(() => App.setSetting('boBoardFold', false));
  await ph.click('[data-bo="knows"]'); await ph.waitForTimeout(500);
  check('phone: the sheet has the class, the next exam and the notes', /The class/.test(await txt(ph, '#bo-knows')) && /Bo's notes about you/.test(await txt(ph, '#bo-knows')) && await hscroll(ph));
  await ph.keyboard.press('Escape'); await ph.waitForTimeout(300);
  await cp.close();

  // the board does more: a drawing over several lines, a slider to drag, a question to answer right there, code
  const [cn, n] = await open(1360, 900, 'mod.user@montana.edu');
  await n.evaluate(() => App.setSetting('aiConsent', Date.now()));
  await go(n, '#/tutor/calc', 2200);
  await n.fill('#bo-q', 'Show me the tangent line'); await n.keyboard.press('Enter'); await n.waitForTimeout(4500);
  const tg = await n.evaluate(() => { const b = document.querySelector('#bo-board'); return { title: (b.querySelector('.bb-title') || {}).textContent, svg: !!b.querySelector('.bb-draw svg .bd-curve'), slider: !!b.querySelector('input[type="range"][data-bd-p="a"]'), out: (b.querySelector('.bd-sl output') || {}).textContent, opts: b.querySelectorAll('.bb-check .bb-chk-o').length, q: (b.querySelector('.bb-chk-q') || {}).textContent, chat: (document.querySelector('#bo-log .bo-msg.bo:last-of-type') || {}).textContent, chips: [...document.querySelectorAll('#bo-suggest:not([hidden]) .bo-chip')].map(c => c.textContent) }; });
  check('a drawing written over several lines goes up whole: the graph, its tangent line and a slider to drag', tg.title === 'The tangent line' && tg.svg && tg.slider && tg.out === '1' && !/"type"|sliders/.test(tg.chat), tg);
  check('and a question for them on the board, with choices to tap', tg.opts === 3 && /slope of the tangent at x = 1/.test(tg.q), tg);
  check('after his answer, one-tap ways to go on (simpler, another example, another question, the drawing)', tg.chips.join('|') === 'Explain it more simply|Show me another example|Give me another question|Walk me through the drawing', tg.chips);
  const line0 = await n.$eval('#bo-board .bb-draw .bd-seg', p => p.getAttribute('d'));
  await n.$eval('#bo-board input[data-bd-p="a"]', el => { el.value = '-1'; el.dispatchEvent(new Event('input', { bubbles: true })); }); await n.waitForTimeout(250);
  const line1 = await n.$eval('#bo-board .bb-draw .bd-seg', p => p.getAttribute('d'));
  check('dragging the slider redraws it: the tangent moves along the curve, the number shows', line1 !== line0 && (await txt(n, '#bo-board .bd-sl output')) === '−1' && /slope = −2/.test(await txt(n, '#bo-board .bb-draw svg')), { line0, line1 });
  await n.click('#bo-board .bb-chk-o[data-chk-o="0"]'); await n.waitForTimeout(300);
  const ck = await n.evaluate(() => { const c = document.querySelector('#bo-board .bb-check'); return { no: c.querySelector('[data-chk-o="0"]').classList.contains('no'), ok: c.querySelector('[data-chk-o="1"]').classList.contains('ok'), off: [...c.querySelectorAll('.bb-chk-o')].every(b => b.disabled), fb: (c.querySelector('.bb-chk-fb:not([hidden])') || {}).textContent }; });
  check('tapping a wrong answer: marked at once, the right one shown, and why', ck.no && ck.ok && ck.off && /Not quite\. The answer is 2\./.test(ck.fb) && /derivative of x\^2 is 2x/.test(ck.fb), ck);
  const youBefore = (await n.$$('#bo-log .bo-msg.you')).length;
  await n.click('#bo-board [data-chk-ask="explain"]'); await n.waitForTimeout(4500);
  const asked = await n.$$eval('#bo-log .bo-msg.you', ms => ms.map(m => m.textContent).pop());
  check('"Explain it" asks Bo about the question and what they answered', (await n.$$('#bo-log .bo-msg.you')).length === youBefore + 1 && /On the board you asked: "What is the slope of the tangent at x = 1\?" I answered "1", but the answer is "2"\. Explain it to me\./.test(asked), asked);
  await n.fill('#bo-q', 'Write a loop that prints 0 to 2'); await n.keyboard.press('Enter'); await n.waitForTimeout(4500);
  const code = await n.evaluate(() => { const c = document.querySelector('#bo-board .bb-code'); return c ? { lang: (c.querySelector('.bb-code-l') || {}).textContent, text: c.querySelector('pre').textContent } : null; });
  check('code goes on the board as written, indentation and all', code && code.lang === 'python' && code.text === 'for i in range(3):\n    print(i)', code);
  const bad2 = await n.evaluate(() => { const el = document.createElement('section'); el.className = 'bb'; el.innerHTML = App.boBoard.shell({ id: 'tmp' }); document.body.appendChild(el); App.boBoard.paint(el, App.boBoard.split('[board: X]\ndraw: {"type":"graph","fns":[{"f":"alert(1)"}]}\nstep: Next\n[/board]').pages, 0, false); const t = el.querySelector('.bb-draw-bad'); const r = t ? t.textContent : ''; el.remove(); return r; });
  check('a drawing that cannot be drawn says so on the board instead of leaving a gap', /didn’t come out/.test(bad2), bad2);
  const messy = await n.evaluate(() => { const D = App.boDraw; return [
    "```json\n{'type': 'graph', 'fns': [{'f': 'x^2'}],}\n```", '{type: graph, f: x^2 - 3, x: [-4, 4]}', '{“type”: “bars”, “bars”: [{“label”: “A”, “value”: 3}]}', '{"type":"graph","fns":[{"f":"\\frac{1}{x}"}],"asymptotes":["x = 0"]}', '{"type":"graph","fns":[{"f":"x^2"},{"f":"2x"', "{'type': 'numberline', 'intervals': [{'from': 2, 'to': None, 'left': 'open'}]}", '{"drawing": {"type": "pie", "slices": {"A": 3, "B": 1}}}', '{"type":"graph","f":"y = \\sqrt{x}, x ≥ 0"}', '{"type":"plot","points":[[1,2],[2,3]]}', '{"type":"number line","intervals":["x > 2"]}'
  ].map(t => { const sp = D.parse(t); return sp ? sp.type : null; }); });
  check('drawings are read the way a model writes them: code fences, single or smart quotes, bare keys, trailing commas, LaTeX, cut off, wrapped, synonyms', messy.join() === 'graph,graph,bars,graph,graph,numberline,pie,graph,graph,numberline', messy);
  const kinds2 = await n.evaluate(() => { const D = App.boDraw; return [
    { type: 'graph', f: 'x^2', tangent: { at: 1 }, secant: { from: 0, to: 2 }, riemann: { from: 0, to: 2, n: 4, rule: 'mid' } },
    { type: 'unitcircle', highlight: 60 }, { type: 'pie', slices: [{ label: 'A', value: 3 }, { label: 'B', value: 1 }] },
    { type: 'scatter', points: [[1, 2], [2, 4.1], [3, 5.9], [4, 8.2]], residuals: true, predict: 5 }, { type: 'boxplot', boxes: [{ label: 'A', data: [1, 2, 3, 4, 5, 30] }, { label: 'B', min: 1, q1: 2, median: 3, q3: 4, max: 5 }] },
    { type: 'venn', sets: ['A', 'B', 'C'], values: { A: 1, AB: 2, ABC: 3, none: 4 }, shade: ["A ∩ B'"] }, { type: 'flow', steps: ['Start', 'Is it done?', 'Keep going'], loops: [{ from: 3, to: 2 }] },
    { type: 'normal', mean: 0, sd: 1, to: 1.96, tails: 'both' }
  ].map(o => { const sp = D.parse(o); const h = sp ? D.html(sp, false) : ''; return [o.type, !!sp, /<svg/.test(h), /NaN|undefined|Infinity/.test(h), D.plain(sp).length > 10]; }); });
  check('the new kinds draw cleanly too, with words for screen readers: tangent, secant and Riemann sums, the unit circle, pie, scatter with its line, box plots, Venn, flow chart, two tails', kinds2.every(k => k[1] && k[2] && !k[3] && k[4]), kinds2);
  const nums = await n.evaluate(() => { const D = App.boDraw; const sp = D.parse({ type: 'scatter', points: [[1, 2], [2, 4], [3, 6]] }); const uc = D.plain(D.parse({ type: 'unitcircle', highlight: 'pi/6' })); const nm = D.html(D.parse({ type: 'normal', mean: 100, sd: 15, from: 130, to: null })); const rs = D.plain(D.parse({ type: 'graph', f: 'x^2', riemann: { from: 0, to: 2, n: 4, rule: 'left' } })); return { fit: [sp.fit.a, sp.fit.b, sp.fit.r], uc, area: /area ≈ 0\.02\d\d/.test(nm), rs }; });
  check('and their numbers are right: the least-squares line, exact unit-circle values, the shaded area, the Riemann sum', Math.abs(nums.fit[0]) < 1e-9 && Math.abs(nums.fit[1] - 2) < 1e-9 && Math.abs(nums.fit[2] - 1) < 1e-9 && /at π\/6: cos = √3\/2, sin = 1\/2/.test(nums.uc) && nums.area && /sum = 1\.75/.test(nums.rs), nums);
  // "Ask Bo about this", from a question they missed
  const href = await n.evaluate(() => App.askBoHref('calc', { type: 'mc', prompt: '<p>What is $2 + 2$?</p>', options: ['3', '4'], answer: 1 }, 'A'));
  check('a missed question links straight to a chat with Bo about it (the question, the choices, what they said, the answer)', href.startsWith('#/tutor/calc?ask=') && /I got this question wrong: "What is \$2 \+ 2\$\?" The choices were A\) 3; B\) 4\. I answered A\. The answer is B\) 4\./.test(decodeURIComponent(href.split('ask=')[1])), decodeURIComponent(href));
  await go(n, '#/calc/practice', 1800);
  for (let k = 0; k < 6 && !(await n.$('.q-feedback.no .ask-bo')); k++) { const cards = await n.$$('.q-card'); const c = cards[k]; if (!c) break; const o = await c.$('.q-opt'); if (o) { await o.click(); await n.waitForTimeout(250); } else { const inp = await c.$('input'); if (inp) { await inp.fill('12345'); const b = await c.$('[data-action="check-num"]'); if (b) await b.click(); await n.waitForTimeout(250); } } }
  const ab = await n.$('.q-feedback.no .ask-bo');
  check('the quizzer: "Ask Bo about this" under a missed question', !!ab);
  if (ab) {
    const youN = (await n.$$('#bo-log .bo-msg.you')).length; await ab.click(); await n.waitForTimeout(5200);
    const last = await n.$$eval('#bo-log .bo-msg.you', ms => ms.map(m => m.textContent).pop());
    check('which opens Ask Bo and sends him the question once (the address no longer carries it)', /I got this question wrong/.test(last || '') && /#\/tutor\/calc$/.test(n.url()), { last, url: n.url(), youN });
  }
  await cn.close();

  // clean up
  const [cc, cl] = await open(1360, 900, 'mod.user@montana.edu');
  await api(cl, 'ai_forget', { what: 'all' }); for (const c of ((await api(cl, 'myclasses')).json.classes || [])) await api(cl, 'myclass_delete', { id: c.id });
  await cc.close();
  try { fs.unlinkSync(STATE); } catch (e) {}
  await T.finish();
})().catch(e => { console.error(e); try { require('fs').unlinkSync(require('path').join(__dirname, 'fixtures', 'rc-state.json')); } catch (x) {} process.exit(1); });

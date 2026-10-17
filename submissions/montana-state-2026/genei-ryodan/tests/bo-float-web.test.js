/* ============================================================
   Bo on every page (assets/bo-float.js), in the browser:
   - he floats in a corner of every page (not on Ask Bo itself), says hello once, and can be dragged to the
     other side, where he stays; Alt+B and Esc open and close him; Settings turns him off
   - guests are asked to sign in, members without Max see what he does; a Max member agrees first
   - he sees the page: the Quizzer's questions as chips (right and wrong marked), what they answered; a question
     goes with the page and the part asked about, and the chat is the class's chat (Ask Bo shows it)
   - the eye turns his seeing off; a page change during a chat brings the ways in for the new page
   - select text and Explain; Point at it; a PDF of a problem set; his board inline, with a question to answer
   - on a phone: above the tab bar, a sheet with a backdrop, nothing wider than the screen
   The AI is a stand-in (tests/pyodide/router.php); mod.user has Max through plan_grants.
   ============================================================ */
const T = require('./lib');
const fs = require('fs'); const path = require('path');
const STATE = path.join(__dirname, 'fixtures', 'rc-state.json'); const LAST = path.join(__dirname, 'fixtures', 'ai-last.json');
(async () => {
  const { mk, txt, login, api, go, hscroll, check } = await T.start();
  fs.writeFileSync(STATE, '{}');
  const quiet = () => document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.celebrate{display:none!important}'; document.head.appendChild(st); });
  const setup = () => { try { const s = JSON.parse(localStorage.getItem('studyhub-settings') || '{}'); s.tourDone = true; s.courses = ['calc', 'physics']; s.asof = '2026-10-13'; localStorage.setItem('studyhub-settings', JSON.stringify(s)); } catch (e) {} };
  const open = async (w, h, email, more = {}) => { const [c, p] = await mk(w, h, Object.assign({ serviceWorkers: 'block' }, more)); await c.addInitScript(quiet); await c.addInitScript(setup); await go(p, '#/', 600); if (email) { await login(p, email); await p.reload(); await p.waitForTimeout(900); } return [c, p]; };
  const last = () => JSON.parse(fs.readFileSync(LAST, 'utf8'));
  const sysOf = q => q.system.map(b => b.text).join('\n');
  const shownEl = (p, s) => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0; }, s);
  const hop = async (p, hash, wait = 1200) => { await p.evaluate(h => { location.hash = h; }, hash); await p.waitForTimeout(wait); };
  const lastBo = p => p.evaluate(() => { const m = [...document.querySelectorAll('#bo-pop .bf-msg.bo')].pop(); return m ? m.textContent.replace(/\s+/g, ' ').trim() : ''; });
  const lastYou = p => p.evaluate(() => { const m = [...document.querySelectorAll('#bo-pop .bf-msg.you')].pop(); return m ? m.textContent.replace(/\s+/g, ' ').trim() : ''; });
  const lastTags = p => p.evaluate(() => { const m = [...document.querySelectorAll('#bo-pop .bf-msg.you')].pop(); return m ? [...m.querySelectorAll('.bo-photo-tag')].map(t => t.textContent.trim()) : []; });

  // a guest
  const [cg, g] = await open(1360, 900);
  await go(g, '#/calc/dashboard', 1200);
  const fab = await g.evaluate(() => { const f = document.querySelector('#bo-fab'); const r = f.getBoundingClientRect(); return { shown: !f.hidden && r.width > 50, right: innerWidth - r.right < 40, bottom: innerHeight - r.bottom < 40, label: f.getAttribute('aria-label') }; });
  check('Bo floats in the bottom-right corner of every page, a button that says what it does', fab.shown && fab.right && fab.bottom && /Ask Bo about this page/.test(fab.label), fab);
  await g.waitForTimeout(2600);
  check('the first time, he says hello once: what he does here', /I'm here on every page now/.test(await txt(g, '#bf-tip')) && await shownEl(g, '#bf-tip') && !!(await g.evaluate(() => App.settings().boFloatSeen)));
  await g.click('#bf-tip [data-tip="x"]'); await g.waitForTimeout(200);
  check('and the hello can be closed', !(await shownEl(g, '#bf-tip')));
  await g.click('#bo-fab'); await g.waitForTimeout(500);
  const gp = await g.evaluate(() => { const p = document.querySelector('#bo-pop'); return { open: !p.hidden && p.classList.contains('open'), role: p.getAttribute('role'), exp: document.querySelector('#bo-fab').getAttribute('aria-expanded'), fabGone: document.querySelector('#bo-fab').hidden, text: p.querySelector('.bf-body').textContent, login: !!p.querySelector('[data-go="login"]'), signup: !!p.querySelector('[data-go="signup"]'), off: p.querySelector('#bf-q').disabled }; });
  check('one tap opens his panel (a dialog); a guest is asked to sign in, with what Bo does, and cannot type yet', gp.open && gp.role === 'dialog' && gp.exp === 'true' && gp.fabGone && /Sign in to ask Bo/.test(gp.text) && /sees the page you ask from/.test(gp.text) && gp.login && gp.signup && gp.off, gp);
  await g.keyboard.press('Escape'); await g.waitForTimeout(400);
  check('Esc closes it, and the focus goes back to Bo', !(await g.evaluate(() => document.querySelector('#bo-pop').classList.contains('open'))) && await g.evaluate(() => document.activeElement && document.activeElement.id === 'bo-fab'));
  await g.keyboard.press('Alt+KeyB'); await g.waitForTimeout(400);
  check('Alt+B opens him from anywhere', await g.evaluate(() => document.querySelector('#bo-pop').classList.contains('open')));
  await g.click('#bo-pop [data-go="login"]'); await g.waitForTimeout(500);
  check('Log in goes to the sign-in, and the panel steps aside', !(await g.evaluate(() => document.querySelector('#bo-pop').classList.contains('open'))) && await g.evaluate(() => !!document.querySelector('.modal-backdrop, .auth-modal, #auth-modal, [role="dialog"]:not(#bo-pop)')));
  await g.keyboard.press('Escape'); await g.waitForTimeout(300);
  await go(g, '#/tutor', 1200);
  check('not on Ask Bo itself (he is the page there)', await g.$eval('#bo-fab', f => f.hidden));
  await hop(g, '#/calc/notes', 900);
  check('and back on a page when you leave it', !(await g.$eval('#bo-fab', f => f.hidden)));
  await cg.close();

  // alice, without a plan
  const [ca, a] = await open(1360, 900, 'alice.a@montana.edu');
  await api(a, 'create_status&refresh=1');
  await go(a, '#/calc/practice', 1600);
  await a.click('#bo-fab'); await a.waitForTimeout(900);
  const ag = await txt(a, '#bo-pop .bf-body');
  check('without Max: what he does on a page (sees it, explains anything, reads problem sets) and Get Mathub Max', /Bo is part of Mathub Max/.test(ag) && /He sees your page/.test(ag) && /Reads your problem sets/.test(ag) && !!(await a.$('#bo-pop [data-go="max"]')) && /Get Mathub Max/.test(await txt(a, '#bo-pop [data-go="max"]')), ag);
  await a.click('#bo-pop [data-go="max"]'); await a.waitForTimeout(1200);
  check('which opens the Max paywall', /Mathub Max/.test(await txt(a, '#paywall h2')));
  await a.keyboard.press('Escape');
  await ca.close();

  // a Max member
  const [cm, m] = await open(1360, 900, 'mod.user@montana.edu');
  await api(m, 'ai_forget', { what: 'all' });
  for (const c of ((await api(m, 'myclasses')).json.classes || [])) await api(m, 'myclass_delete', { id: c.id });
  await m.evaluate(() => { App.setSetting('aiConsent', 0); App.setSetting('boFloatSeen', Date.now()); });
  await go(m, '#/calc/practice', 2000);
  // the nudge on a page with questions
  await m.waitForTimeout(6600);
  check('on a page of questions, he offers once to help (a short tip by him)', /Stuck on one of these questions\? Tap me\./.test(await txt(m, '#bf-tip')) && await shownEl(m, '#bf-tip'), await txt(m, '#bf-tip'));
  // answer the first question on the page
  const qa = await m.evaluate(() => { const cards = [...document.querySelectorAll('#view .q-card')]; const k = cards.findIndex(c => c.querySelector('.q-opt')); return k; });
  await (await m.$$('#view .q-card'))[qa].$('.q-opt').then(o => o.click()); await m.waitForTimeout(500);
  const q1state = await m.evaluate(k => { const c = document.querySelectorAll('#view .q-card')[k]; return c.classList.contains('correct') ? 'right' : c.classList.contains('wrong') ? 'wrong' : 'answered'; }, qa);
  await m.click('#bo-fab'); await m.waitForTimeout(900);
  const cons = await txt(m, '#bo-pop .bf-body');
  check('a Max member agrees first to what is sent, and that now includes the page they ask from', /Anthropic/.test(cons) && /what is on that page/.test(cons) && !!(await m.$('#bo-pop [data-go="agree"]')), cons.slice(0, 300));
  await m.click('#bo-pop [data-go="agree"]'); await m.waitForTimeout(900);
  const nCards = await m.$$eval('#view .q-card', l => l.length);
  const wel = await m.evaluate(() => { const p = document.querySelector('#bo-pop'); return { see: p.querySelector('.bf-see').textContent.replace(/\s+/g, ' ').trim(), pressed: p.querySelector('.bf-see').getAttribute('aria-pressed'), hi: p.querySelector('.bf-hi').textContent.replace(/\s+/g, ' ').trim(), items: [...p.querySelectorAll('.bf-item')].map(b => [b.textContent.trim(), b.className.replace('bf-item', '').trim()]), acts: [...p.querySelectorAll('.bf-acts .bf-act')].map(b => b.textContent.trim()), point: !!p.querySelector('.bf-pointer'), full: p.querySelector('#bf-full').getAttribute('href'), sub: p.querySelector('#bf-sub').textContent, focused: document.activeElement && document.activeElement.id }; });
  check('he says what he sees: the page and how many questions are on it (the eye is on)', new RegExp(`Bo sees Calc I › Quizzer · ${nCards} questions`).test(wel.see) && wel.pressed === 'true', wel.see);
  check('every question as a chip, numbered as on the page, the one answered marked right or wrong', wel.items.length === nCards && wel.items[0][0] === 'Q1' && wel.items[1][0] === 'Q2' && wel.items[qa][1] === q1state && ['right', 'wrong'].includes(q1state) && wel.items.every((i, k) => k === qa || i[1] === 'open'), { items: wel.items.slice(0, 4), qa, q1state });
  check('ways in made for the page (check my answers, the topic, a question like these, any topic) and Point at it', wel.acts.some(t => /Explain the topic/.test(t)) && wel.acts.some(t => /A question like these/.test(t)) && wel.acts.some(t => /Explain a topic/.test(t)) && wel.acts.some(t => q1state === 'wrong' ? /Go over what I missed/.test(t) : /Check my answers/.test(t)) && wel.point && new RegExp(`I can see these ${nCards} questions \\(1 answered`).test(wel.hi), wel);
  check('the full chat is one tap away (the class\'s Ask Bo), and the box is ready to type in', wel.full === '#/tutor/calc' && /Your tutor for Calc I/.test(wel.sub) && wel.focused === 'bf-q', wel);
  // a question chip: help with Q2
  await m.click('#bo-pop .bf-item:nth-child(2)'); await m.waitForTimeout(700);
  const writing = await m.evaluate(() => !!document.querySelector('#bo-pop .bf-msg.bo.typing') || !!document.querySelector('#bo-pop .bf-msg.bo .bf-flow'));
  await m.waitForTimeout(2600);
  const r2 = await lastBo(m); const q2 = last(); const s2 = sysOf(q2);
  check('tapping Q2 asks about it, and Bo answers right there', /Help me with Q2\./.test(await lastYou(m)) && /Bo here\./.test(r2) && writing, r2);
  check('the page went with it: its questions as numbered, and Q2 as the one asked about', /THE PAGE:\nPAGE: Calc I › Quizzer/.test(s2) && /\[Q1\]/.test(s2) && /\[Q2\]/.test(s2) && /WHAT THEY POINTED AT[\s\S]*\[Q2\]/.test(s2) && /Looking at Q2:/.test(r2) && /I can see your page: Calc I › Quizzer/.test(r2), s2.slice(-900));
  check('what they answered on the page went too', /\[Q1\][\s\S]*?They answered [A-D]\)/.test(s2), (s2.match(/\[Q1\][^\n]*\n[^\n]*\n[^\n]*/) || [])[0]);
  check('his question shows where it was asked from', (await lastTags(m)).join() === 'Calc I › Quizzer · Q2', await lastTags(m));
  check('after the answer: copy it, and one tap to go on', !!(await m.$('#bo-pop .bf-msg.bo [data-bf="copy"]')) && (await m.$$('#bo-pop .bf-next .bf-mini')).length >= 2);
  const th = (await api(m, 'ai_thread&class=calc')).json.turns || [];
  check('it is the class\'s chat with Bo, kept with the account, with where it was asked from', th.length >= 2 && th[th.length - 2].t === '[from: Calc I › Quizzer · Q2] Help me with Q2.', th.slice(-2).map(t => t.t));
  // the eye: he stops looking
  await m.click('#bo-pop [data-bf="see"]'); await m.waitForTimeout(300);
  check('the eye turns his seeing off, and says so', /Bo isn’t looking at this page/.test(await txt(m, '#bo-pop .bf-see')) && (await m.$eval('#bo-pop .bf-see', b => b.getAttribute('aria-pressed'))) === 'false' && (await m.evaluate(() => App.settings().boSee)) === false);
  await m.fill('#bf-q', 'What is a limit?'); await m.keyboard.press('Enter'); await m.waitForTimeout(3000);
  const s3 = sysOf(last());
  check('with the eye off, the page does not go with a question', /What is a limit\?/.test(await lastBo(m)) && !/THE PAGE:/.test(s3) && !(await lastTags(m)).length, s3.slice(-300));
  await m.click('#bo-pop [data-bf="see"]'); await m.waitForTimeout(300);
  // a page change during the chat
  await hop(m, '#/calc/notes', 1500);
  const pc = await m.evaluate(() => { const p = document.querySelector('#bo-pop'); const c = p.querySelector('.bf-page'); return { open: p.classList.contains('open'), see: p.querySelector('.bf-see').textContent.replace(/\s+/g, ' '), card: c ? c.textContent.replace(/\s+/g, ' ').trim() : '', acts: c ? [...c.querySelectorAll('.bf-act')].map(b => b.textContent.trim()) : [], msgs: p.querySelectorAll('.bf-msg').length }; });
  check('going to another page keeps the chat, and he says what he sees now, with the ways in for it', pc.open && /Bo sees Calc I › Notes/.test(pc.see) && /Now on Calc I › Notes/.test(pc.card) && /You're reading/.test(pc.card) && pc.acts.some(t => /Explain this more simply/.test(t)) && pc.acts.some(t => /Draw it/.test(t)) && pc.msgs >= 4, pc);
  await m.click('#bo-pop [data-bf="close"]'); await m.waitForTimeout(300);
  // select text: Explain
  const picked = await m.evaluate(() => { const el = [...document.querySelectorAll('#view .note-block li, #view .note-block p')].find(x => x.textContent.trim().length > 20 && x.getBoundingClientRect().top > 60 && x.getBoundingClientRect().bottom < innerHeight - 60) || document.querySelector('#view .note-block li'); el.scrollIntoView({ block: 'center' }); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return String(s).replace(/\s+/g, ' ').trim().slice(0, 40); });
  await m.waitForTimeout(500);
  const pill = await m.evaluate(() => { const p = document.querySelector('#bo-sel'); const r = p.getBoundingClientRect(); return { shown: !p.hidden && r.width > 60, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, btns: [...p.querySelectorAll('button')].map(b => b.textContent.trim()) }; });
  check('selecting text on the page brings Explain and Ask Bo… beside it', pill.shown && pill.inside && pill.btns.join('|') === 'Explain|Ask Bo…', pill);
  await m.click('#bo-sel [data-sel="explain"]'); await m.waitForTimeout(3500);
  const s4 = sysOf(last());
  check('Explain asks Bo about just that, with the page around it', /Explain this to me\./.test(await lastYou(m)) && /WHAT THEY POINTED AT[\s\S]*They selected: «/.test(s4) && /THE PAGE:\nPAGE: Calc I › Notes/.test(s4) && /You pointed at: They selected: «/.test(await lastBo(m)), { picked, you: await lastYou(m) });
  check('his question shows the words selected', /^“.+”$/.test((await lastTags(m))[0] || ''), await lastTags(m));
  // point at it, on the Quizzer
  await hop(m, '#/calc/practice', 1800);
  await m.click('#bo-pop [data-bf="point"]'); await m.waitForTimeout(300);
  check('Point at it: a bar says what to do, and the page waits for a tap', await shownEl(m, '.bf-pointbar') && /Tap the part of the page/.test(await txt(m, '.bf-pointbar')) && await m.evaluate(() => document.documentElement.classList.contains('bf-pointing')));
  await m.keyboard.press('Escape'); await m.waitForTimeout(300);
  check('Esc cancels pointing', !(await m.$('.bf-pointbar')) && !(await m.evaluate(() => document.documentElement.classList.contains('bf-pointing'))));
  await m.click('#bo-pop [data-bf="point"]'); await m.waitForTimeout(300);
  const pk = qa === 2 ? 3 : 2; const PQ = `Q${pk + 1}`;   // a question not answered yet
  const c3 = (await m.$$('#view .q-card'))[pk]; await c3.scrollIntoViewIfNeeded(); const b3 = await c3.boundingBox();
  await m.mouse.move(b3.x + 30, b3.y + 30); await m.mouse.move(b3.x + 40, b3.y + 34); await m.waitForTimeout(200);
  check('the part under the pointer lights up', await shownEl(m, '.bf-hl'));
  await m.mouse.click(b3.x + 40, b3.y + 34); await m.waitForTimeout(700);
  const fc = await m.evaluate(() => { const c = document.querySelector('#bo-pop #bf-chips'); return { shown: !c.hidden, focus: (c.querySelector('.bf-chip.focus') || {}).textContent || '', quick: [...c.querySelectorAll('.bf-quick .bf-mini')].map(b => b.textContent.trim()), }; });
  check('tapping a question picks it: it shows above the box, with quick asks (explain, a hint, the steps)', fc.shown && fc.focus.includes(`Calc I › Quizzer · ${PQ} `) && fc.quick.join('|') === 'Explain this|Give me a hint|Show me the steps', fc);
  await m.click('#bo-pop .bf-quick .bf-mini:nth-child(2)'); await m.waitForTimeout(3200);
  const s5 = sysOf(last());
  check('a quick ask sends it with the question pointed at', /Give me a hint\./.test(await lastYou(m)) && (await lastTags(m)).join() === `Calc I › Quizzer · ${PQ}` && new RegExp(`WHAT THEY POINTED AT[^\\n]*\\n\\[${PQ}\\]`).test(s5) && (await lastBo(m)).includes(`You pointed at: [${PQ}]`) && !(await shownEl(m, '#bo-pop #bf-chips')), s5.slice(-500));
  // a problem set as a PDF
  await m.setInputFiles('#bf-file', { name: 'HW 5.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%mathub test\n') }); await m.waitForTimeout(500);
  check('a PDF of a problem set shows above the box, and can be taken off', /HW 5\.pdf/.test(await txt(m, '#bo-pop .bf-chip.file')) && !!(await m.$('#bo-pop .bf-chip.file [data-bf="unfile"]')));
  await m.click('#bo-pop .bf-send'); await m.waitForTimeout(3500);
  const q6 = last(); const lc = q6.messages[q6.messages.length - 1].content;
  check('sent alone, it asks for help with the set; Bo reads it as a document', lc[0].type === 'document' && lc[0].source.media_type === 'application/pdf' && /I read your PDF\./.test(await lastBo(m)) && /Can you help me with this problem set\?/.test(await lastYou(m)) && (await lastTags(m))[0] === 'HW 5.pdf' && q6.max_tokens === 2000, { types: lc.map(b => b.type), you: await lastYou(m) });
  // his board, inline: a drawing and a question to answer
  await m.fill('#bf-q', 'Show me the tangent line'); await m.keyboard.press('Enter'); await m.waitForTimeout(4200);
  const bd = await m.evaluate(() => { const b = [...document.querySelectorAll('#bo-pop .bf-board')].pop(); return b ? { title: (b.querySelector('.bb-title') || {}).textContent, svg: !!b.querySelector('.bb-draw svg .bd-curve'), slider: !!b.querySelector('input[type="range"]'), opts: b.querySelectorAll('.bb-chk-o').length, wide: b.getBoundingClientRect().width <= document.querySelector('#bo-pop').getBoundingClientRect().width, chat: [...document.querySelectorAll('#bo-pop .bf-msg.bo')].pop().textContent } : null; });
  check('his board pages come inline in the panel: the drawing with its slider, and a question to answer', bd && bd.title === 'The tangent line' && bd.svg && bd.slider && bd.opts === 3 && bd.wide && !/"type"|sliders/.test(bd.chat), bd);
  await m.click('#bo-pop .bf-board .bb-chk-o[data-chk-o="1"]'); await m.waitForTimeout(300);
  check('tapping the right answer: marked at once, with why', /Right!/.test(await txt(m, '#bo-pop .bf-board .bb-chk-fb')) && /derivative of x\^2 is 2x/.test(await txt(m, '#bo-pop .bf-board .bb-chk-fb')));
  const youN = (await m.$$('#bo-pop .bf-msg.you')).length;
  await m.click('#bo-pop .bf-board [data-chk-ask="explain"]'); await m.waitForTimeout(3500);
  check('"Why does it work?" on the board asks Bo in the panel', (await m.$$('#bo-pop .bf-msg.you')).length === youN + 1 && /On the board you asked/.test(await lastYou(m)), await lastYou(m));
  // the same chat in Ask Bo
  await go(m, '#/tutor/calc', 2200);
  const tut = await m.evaluate(() => [...document.querySelectorAll('#bo-log .bo-msg.you')].map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  check('Ask Bo shows the same chat, each question with where it came from (and the PDF by its name)', tut.some(t => /Calc I › Quizzer · Q2/.test(t) && /Help me with Q2\./.test(t) && !/\[from:/.test(t)) && tut.some(t => /HW 5\.pdf/.test(t)) && await m.$eval('#bo-fab', f => f.hidden), tut.slice(0, 4));
  // drag him to the other side
  await go(m, '#/calc/dashboard', 1500);
  const f0 = await m.$eval('#bo-fab', x => x.getBoundingClientRect().toJSON());
  await m.mouse.move(f0.x + 30, f0.y + 30); await m.mouse.down(); await m.mouse.move(600, 500, { steps: 6 }); await m.mouse.move(160, 380, { steps: 6 }); await m.mouse.up(); await m.waitForTimeout(400);
  const dr = await m.evaluate(() => { const f = document.querySelector('#bo-fab'); const r = f.getBoundingClientRect(); return { left: f.classList.contains('left'), x: r.left, top: r.top, open: document.querySelector('#bo-pop').classList.contains('open'), saved: App.settings().boFab }; });
  check('drag him anywhere: he settles on the nearer side, at that height, and a drag does not open him', dr.left && dr.x < 40 && dr.top > 250 && dr.top < 450 && !dr.open && dr.saved && dr.saved.side === 'left', dr);
  await m.reload(); await m.waitForTimeout(1500);
  check('and he stays there after a reload', await m.evaluate(() => { const f = document.querySelector('#bo-fab'); return f.classList.contains('left') && f.getBoundingClientRect().left < 40; }));
  await m.focus('#bo-fab'); await m.keyboard.press('Alt+ArrowRight'); await m.waitForTimeout(200);
  check('Alt+arrows move him with the keyboard', await m.evaluate(() => !document.querySelector('#bo-fab').classList.contains('left') && App.settings().boFab.side === 'right'));
  await m.click('#bo-fab'); await m.waitForTimeout(800);
  check('opened on the dashboard, his chat is still there', (await m.$$('#bo-pop .bf-msg.you')).length >= 1 || /I can see|You're on/.test(await txt(m, '#bo-pop .bf-body')));
  await m.keyboard.press('Escape'); await m.waitForTimeout(300);
  await m.evaluate(() => App.setSetting('boFab', null));
  // Settings: off and on
  await go(m, '#/settings', 1500);
  check('Settings has "Bo on every page" and "Tips from Bo", both on', await m.$eval('#s-bofloat', x => x.checked) && await m.$eval('#s-botips', x => x.checked && !x.disabled));
  await m.click('#s-bofloat'); await m.waitForTimeout(400);
  check('turning him off hides him at once, and the tips with him', await m.$eval('#bo-fab', f => f.hidden) && await m.$eval('#s-botips', x => x.disabled && !x.checked) && (await m.evaluate(() => App.settings().boFloat)) === false);
  await go(m, '#/calc/practice', 1500);
  check('off stays off on every page, and Alt+B does nothing', await m.$eval('#bo-fab', f => f.hidden) && await (async () => { await m.keyboard.press('Alt+KeyB'); await m.waitForTimeout(300); return m.evaluate(() => { const p = document.querySelector('#bo-pop'); return !p || !p.classList.contains('open'); }); })());
  await go(m, '#/settings', 1500); await m.click('#s-bofloat'); await m.waitForTimeout(400);
  check('and on again', !(await m.$eval('#bo-fab', f => f.hidden)) && await m.$eval('#s-botips', x => x.checked && !x.disabled));
  await cm.close();

  // a phone, in the dark
  const [cp, ph] = await open(390, 844, 'mod.user@montana.edu', { colorScheme: 'dark', hasTouch: true });
  await ph.evaluate(() => { App.setSetting('aiConsent', Date.now()); App.setSetting('boFloatSeen', Date.now()); });
  await go(ph, '#/calc/practice', 2000);
  const pf = await ph.evaluate(() => { const f = document.querySelector('#bo-fab').getBoundingClientRect(); const t = document.querySelector('#tabbar'); const tb = t ? t.getBoundingClientRect() : null; return { above: tb ? f.bottom <= tb.top + 1 : false, right: innerWidth - f.right < 30, size: f.width >= 48 }; });
  check('on a phone he sits above the tab bar, big enough to tap', pf.above && pf.right && pf.size, pf);
  await ph.tap('#bo-fab'); await ph.waitForTimeout(800);
  const sh = await ph.evaluate(() => { const p = document.querySelector('#bo-pop').getBoundingClientRect(); const bk = document.querySelector('#bf-back'); return { full: p.left <= 1 && p.right >= innerWidth - 1, bottom: Math.abs(p.bottom - innerHeight) < 2, tall: p.height > 300 && p.top > 40, back: !bk.hidden, ph: document.querySelector('#bf-q').placeholder, kb: document.activeElement && document.activeElement.id === 'bf-q', chips: document.querySelectorAll('#bo-pop .bf-item').length }; });
  check('it opens as a sheet from the bottom, over a dimmed page, with the questions to tap (no keyboard in the way)', sh.full && sh.bottom && sh.tall && sh.back && sh.ph === 'Ask Bo anything…' && !sh.kb && sh.chips > 0, sh);
  check('nothing on the phone is wider than the screen', await hscroll(ph));
  await ph.mouse.click(195, 30); await ph.waitForTimeout(400);
  check('tapping the dimmed page closes it', !(await ph.evaluate(() => document.querySelector('#bo-pop').classList.contains('open'))) && !(await ph.$eval('#bo-fab', f => f.hidden)));
  await cp.close();

  // clean up
  const [cc, cl] = await open(1360, 900, 'mod.user@montana.edu');
  await api(cl, 'ai_forget', { what: 'all' });
  await cc.close();
  try { fs.unlinkSync(STATE); } catch (e) {}
  await T.finish();
})().catch(e => { console.error(e); try { require('fs').unlinkSync(require('path').join(__dirname, 'fixtures', 'rc-state.json')); } catch (x) {} process.exit(1); });

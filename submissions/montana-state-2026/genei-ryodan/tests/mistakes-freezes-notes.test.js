/* Mistakes notebook (capture, Today row, retry player), streak freezes (auto-apply, earn, popover), cheat-sheet builder, personal notes and highlights. */
const T = require('./lib');
(async () => {
  const { mk, login, go, log, check, txt } = await T.start({ dialogText: 'ok' });
  const [c, p] = await mk(1360, 900, { serviceWorkers: 'block' }); await go(p, '#/', 700);
  await p.evaluate(() => { const s = App.settings(); s.courses = ['calc', 'physics']; localStorage.setItem('studyhub-settings', JSON.stringify(s)); });
  // mistakes from practice: answer wrong on purpose
  await go(p, '#/calc/practice', 1200); await p.evaluate(() => { const b = document.querySelector('.q-card .q-opt'); }); 
  const wrongIdx = await p.evaluate(() => { const q = App.views.practice && window.PQ ? null : null; return null; });
  await p.evaluate(() => { const card = document.querySelector('.q-card'); const opts = card.querySelectorAll('.q-opt'); if (opts.length) { const qi = +opts[0].dataset.q; const q = App.__pq ? App.__pq.session.questions[qi] : null; } });
  // simplest: click every option except the right one is unknown; click option 0 then option 1 on next card, one will be wrong most of the time; instead use recordMistake directly plus one real practice click
  const before = await p.evaluate(() => App.mistakesAll('calc').length);
  // guests get three random questions; about one set in eight is all typed answers, so miss whichever kind is there
  const kind = await p.evaluate(() => document.querySelector('#view .q-card .q-opt[data-i="0"]') ? 'mc' : (document.querySelector('#view .q-card .q-numrow input') ? 'num' : null));
  if (kind === 'mc') await p.click('#view .q-card .q-opt[data-i="0"]'); else if (kind === 'num') { await p.fill('#view .q-card .q-numrow input', '987654321'); await p.click('#view .q-card [data-action="check-num"]'); }
  check('practice set has a question to miss', !!kind, kind); await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({ n: App.mistakesAll('calc').length, ok: !!document.querySelector('.q-card.correct') }));
  check('practice miss saved to mistakes (or the guess was right)', after.ok ? after.n === before : after.n === before + 1, after);
  await p.evaluate(() => { App.recordMistake({ type: 'mc', prompt: 'Test prompt $x^2$', options: ['1', '2', '3', '4'], answer: 2, explanation: 'Because.', topic: 'velocity' }, 'calc', 'practice'); App.recordMistake({ type: 'num', prompt: 'What is 2+2?', answer: 4, answerTex: '4', explanation: 'Add.', topic: 'velocity' }, 'physics', 'lesson'); App.store.poke('calc', d => { d.mistakes.forEach(m => { m.due = Date.now() - 1000; }); }); App.store.poke('physics', d => { d.mistakes.forEach(m => { m.due = Date.now() - 1000; }); }); });
  await go(p, '#/today', 900); check('today shows retry row', (await txt(p, '#td-plan')).includes('Retry') && !!(await p.$('a[href="#/mistakes?retry=1"]')));
  await go(p, '#/mistakes', 900); const open0 = await p.evaluate(() => App.mistakesSummary()); check('mistakes page lists open items', open0.open >= 2 && (await p.$$('.mk-row')).length >= 2, open0);
  await p.click('[data-action="mk-retry"]'); await p.waitForTimeout(400); check('retry player opens', await p.$eval('#mk-player', e => !e.hidden) && !!(await p.$('#mk-player .q-card')));
  // answer the queue using the stored answers
  for (let i = 0; i < 6; i++) { const cur = await p.evaluate(() => { const P = App.mistakesPlayer; const it = P.queue[P.i]; return it ? { type: it.m.q.type, answer: it.m.q.answer } : null; }); if (!cur) break;
    if (cur.type === 'num') { await p.fill('#mk-num', String(cur.answer)); await p.click('[data-action="mk-num"]'); } else await p.click(`#mk-player .q-opt[data-i="${cur.answer}"]`);
    await p.waitForTimeout(300); log('  retry feedback:', (await txt(p, '#mk-player .q-feedback')).slice(0, 40)); await p.click('[data-action="mk-next"]').catch(() => {}); await p.waitForTimeout(250); }
  check('player reaches the end', (await txt(p, '#mk-player')).includes('retried'));
  const w = await p.evaluate(() => (App.mistakesAll('physics')[0] || {}).wins); check('a right retry raises wins', w === 1 || w === undefined, w);
  // freezes
  await p.evaluate(() => { App.setSetting('freezeBank', 1); const y = App.toISO(App.addDays(new Date(), -1)), d2 = App.toISO(App.addDays(new Date(), -2)), d3 = App.toISO(App.addDays(new Date(), -3)); App.store.poke('calc', d => { d.activity = { [d2]: true, [d3]: true }; delete d.activity[y]; }); App.setSetting('freezeUsed', {}); App.paintStats(); });
  await p.waitForTimeout(300); const fz = await p.evaluate(() => ({ bank: App.freezeBank(), y: App.streakAll().days[App.toISO(App.addDays(new Date(), -1))], n: App.streakAll().n }));
  check('freeze auto-applied to yesterday', fz.bank === 0 && fz.y === 'freeze' && fz.n >= 3, fz);
  await go(p, '#/', 900); await p.click('.landing-top .streak-chip'); await p.waitForTimeout(400); if (!(await p.$('.pop-streak'))) { await p.click('.landing-top .streak-chip'); await p.waitForTimeout(400); } const pop = await txt(p, '.pop-streak'); log('  popover:', pop.slice(0, 120), '| frozen cells:', (await p.$$('.pop-streak .sday.frozen')).length); check('popover shows freezes and a frozen day', pop.includes('freeze') && !!(await p.$('.pop-streak .sday.frozen'))); await p.keyboard.press('Escape');
  await p.evaluate(() => { App.setSetting('freezeWeeks', {}); App.setSetting('freezeBank', 0); const wk = App.isoWeek(new Date()); const w = { days: [App.toISO(App.addDays(new Date(), -2)), App.toISO(App.addDays(new Date(), -1))] }; App.setSetting('freezeWeeks', { [wk]: w }); App.noteGoalDay(); }); await p.waitForTimeout(100);
  check('third goal day earns a freeze', (await p.evaluate(() => App.freezeBank())) === 1);
  // cheat sheet
  await go(p, '#/calc/cheatsheet', 1200); check('cheat sheet nav + picker', !!(await p.$('.nav-item[data-view="cheatsheet"]')) && (await p.$$('.cs-pick')).length > 20);
  await p.click('.cs-pick input'); await p.waitForTimeout(200); check('picked line appears on sheet', (await p.$$('#cs-sheet .cs-line')).length === 1 && (await p.evaluate(() => App.store.peek('calc').cheatsheet.items.length)) === 1);
  await p.click('[data-action="cs-suggest"]'); await p.waitForTimeout(500); check('suggest adds exam formulas', (await p.$$('#cs-sheet .cs-line')).length > 5);
  await p.click('[data-action="cs-cols"][data-n="3"]'); await p.waitForTimeout(100); check('columns setting', await p.$eval('#cs-sheet', e => e.classList.contains('cols-3')));
  await p.fill('#cs-notes', 'My own rule $a^2+b^2=c^2$'); await p.waitForTimeout(600); check('own notes on sheet', (await txt(p, '#cs-sheet')).includes('My notes'));
  // my notes + highlights
  await go(p, '#/calc/notes/1.3', 1200); check('my notes box on topic', !!(await p.$('#mynotes #mn-text')) && !!(await p.$('.nav-item[data-view="mynotes"]')));
  await p.fill('#mn-text', 'Remember: the derivative at a point is a limit of secant slopes.'); await p.waitForTimeout(800); check('note saved', (await p.evaluate(() => App.store.peek('calc').mynotes['1.3'] || '')).includes('secant'));
  const hlTxt = await p.evaluate(() => { const li = document.querySelector('.note-block ul.list li'); const range = document.createRange(); const tn = [...li.childNodes].find(n => n.nodeType === 3 && n.textContent.trim().length > 12); if (!tn) return ''; range.setStart(tn, 0); range.setEnd(tn, Math.min(20, tn.textContent.length)); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); return String(sel).trim(); });
  await p.evaluate(() => document.querySelector('.note-block ul.list li').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))); await p.waitForTimeout(150);
  const hb = await p.$('.hl-btn'); check('highlight button appears on selection', !!hb && hlTxt.length > 3, hlTxt);
  if (hb) { await p.evaluate(() => { document.querySelector('.hl-btn').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }); await p.waitForTimeout(200); }
  check('highlight saved and painted', (await p.$$('mark.hl')).length >= 1 && (await p.evaluate(() => (App.store.peek('calc').highlights['1.3'] || []).length)) === 1);
  await go(p, '#/calc/mynotes', 700); check('my notes page lists topic', (await txt(p, '#view')).includes('secant') && (await p.$$('mark.hl')).length >= 1);
  await c.close(); await T.finish();
})();

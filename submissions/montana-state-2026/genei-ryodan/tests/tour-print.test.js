/* First-visit tour (steps, keyboard, replay from settings) and the print stylesheet/buttons. */
const T = require('./lib');
(async () => {
  const { mk, go, log, check, txt } = await T.start({ tour: true });
  const [c, p] = await mk(1360, 900, { serviceWorkers: 'block' }); await go(p, '#/', 2600);
  check('tour appears on first visit', !!(await p.$('.tour')) && (await txt(p, '.tour-card h3')) === 'Start with Today', await txt(p, '.tour-card h3'));
  check('spotlight positioned on target', await p.$eval('.tour-spot', e => e.style.display !== 'none' && parseFloat(e.style.width) > 40));
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(400); check('next step', (await txt(p, '.tour-card h3')) === 'Your classes');
  await p.click('[data-action="tour-back"]'); await p.waitForTimeout(300); check('back step', (await txt(p, '.tour-card h3')) === 'Start with Today');
  for (let i = 0; i < 5; i++) { await p.click('[data-action="tour-next"]').catch(() => {}); await p.waitForTimeout(350); }
  check('tour finishes and is remembered', !(await p.$('.tour')) && (await p.evaluate(() => App.settings().tourDone)) === true);
  await p.reload(); await p.waitForTimeout(2600); check('tour does not repeat', !(await p.$('.tour')));
  await go(p, '#/settings', 600); await p.click('[data-action="tour-again"]'); await p.waitForTimeout(1600); check('settings replays the tour', !!(await p.$('.tour')), await p.evaluate(() => location.hash)); await p.keyboard.press('Escape'); await p.waitForTimeout(200); check('escape closes', !(await p.$('.tour')));
  await go(p, '#/calc/formulas', 1200); check('print button on formulas', !!(await p.$('.page-actions .print-btn')));
  await go(p, '#/calc/notes/1.3', 900); check('print button on notes', !!(await p.$('.note-head .print-btn')));
  await p.emulateMedia({ media: 'print' }); check('print hides chrome', await p.evaluate(() => getComputedStyle(document.getElementById('sidebar')).display === 'none' && getComputedStyle(document.getElementById('topbar')).display === 'none')); await p.emulateMedia({ media: 'screen' });
  await go(p, '#/calc/dashboard', 900); check('no print button on dashboard', !(await p.$('.print-btn')));
  await c.close(); await T.finish();
})();

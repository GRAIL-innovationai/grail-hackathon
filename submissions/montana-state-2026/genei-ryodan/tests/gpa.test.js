const T = require('./lib');
(async () => {
  const { browser, base, errors, mk, txt, login, api, hscroll, go, log, check } = await T.start({});
  const setGrade = async (p, i, g) => { await p.selectOption(`.gpa-row:nth-child(${i}) select`, g); await p.waitForTimeout(80); };

  const [c, p] = await mk(); await go(p, '#/'); await login(p, 'alice.a@montana.edu'); await p.reload(); await p.waitForTimeout(1500); if (await p.$('.celebrate')) await p.keyboard.press('Escape');
  await p.evaluate(() => { const s = App.settings(); delete s.gpa; s.courses = ['calc', 'physics', 'precalc', 'writ']; localStorage.setItem('studyhub-settings', JSON.stringify(s)); });
  // grade calculator scores for calc so a projection exists
  await go(p, '#/calc/grades'); await p.waitForTimeout(400); log('grades page GPA button:', await txt(p, '.page-actions a[href="#/calc/gpa"]'));
  await p.fill('#g-webwork', '95'); await p.fill('#g-labs', '88'); await p.waitForTimeout(200); log('calc projected:', await txt(p, '#g-out .grade-letter'), JSON.stringify(await p.evaluate(() => App.projectedGrade('calc'))), '| physics projected:', await p.evaluate(() => App.projectedGrade('physics')));
  // in-course view
  await go(p, '#/calc/gpa'); await p.waitForTimeout(400);
  log('nav item:', await txt(p, '.nav-item[data-view="gpa"]'), '| title:', await txt(p, '.page-title'));
  log('rows:', await p.$$eval('.gpa-row', rs => rs.map(r => r.querySelector('[data-f=name]').value.split(' · ')[0] + ':' + r.querySelector('[data-f=credits]').value + ':' + (r.querySelector('[data-f=grade]').value || '-')).join(' | ')));
  log('projection line:', await txt(p, '.gpa-row:nth-child(1) .gpa-proj'), '| physics line:', (await txt(p, '.gpa-row:nth-child(2) .gpa-proj')).slice(0, 60));
  log('semester (calc prefilled):', await txt(p, '#gpa-sem'), '| side:', await txt(p, '#gpa-sem-side'));
  await setGrade(p, 1, 'A'); await setGrade(p, 2, 'B+'); await setGrade(p, 3, 'P'); await setGrade(p, 4, 'A-');
  log('A,B+,P,A- ->', await txt(p, '#gpa-sem'), '|', await txt(p, '#gpa-sem-side'), '| points col:', await p.$$eval('[data-pts]', e => e.map(x => x.textContent).join(',')));
  await setGrade(p, 3, 'B'); log('precalc B ->', await txt(p, '.gpa-big'), '(expect 3.49)', '| chip:', await txt(p, '#gpa-sem .chip'));
  await p.fill('#gpa-prior', '3.2'); await p.fill('#gpa-prior-cr', '30'); await p.waitForTimeout(150); log('cumulative:', await txt(p, '#gpa-cum'), '(expect 3.30, 45, +0.10)');
  log('goal 3.5:', await txt(p, '#gpa-target'));
  await p.fill('#gpa-goal', '3.3'); await p.waitForTimeout(150); log('goal 3.3:', await txt(p, '#gpa-target'));
  await p.click('.chip[data-action="gpa-goal"][data-g="2"]'); await p.waitForTimeout(150); log('goal 2.0:', await txt(p, '#gpa-target'), '| chip on:', await txt(p, '.chip[data-action="gpa-goal"].on'));
  log('what-if:', (await txt(p, '#gpa-whatif')).slice(0, 200));
  await setGrade(p, 1, 'A'); await setGrade(p, 2, 'A'); await setGrade(p, 3, 'A'); await setGrade(p, 4, 'A-'); log('near-4.0 ->', await txt(p, '.gpa-big'), '| chip:', await txt(p, '#gpa-sem .chip'));
  await setGrade(p, 1, 'D'); await setGrade(p, 2, 'F'); await setGrade(p, 3, 'C-'); await setGrade(p, 4, 'D+'); log('low ->', await txt(p, '.gpa-big'), '| chip:', await txt(p, '#gpa-sem .chip'));
  await p.click('[data-action="gpa-add"]'); await p.waitForTimeout(150); log('added row focused:', await p.evaluate(() => document.activeElement && document.activeElement.dataset.f), '| rows:', (await p.$$('.gpa-row')).length);
  await p.fill('.gpa-row:nth-child(5) [data-f="name"]', 'CHMY 141'); await p.fill('.gpa-row:nth-child(5) [data-f="credits"]', '4'); await setGrade(p, 5, 'B'); log('after add:', await txt(p, '#gpa-sem-side'));
  await p.click('.gpa-row:nth-child(2) [data-action="gpa-del"]'); await p.waitForTimeout(150); log('after delete:', (await p.$$('.gpa-row')).length, await p.$$eval('.gpa-row', rs => rs.map(r => r.querySelector('[data-f=name]').value.split(' · ')[0]).join(',')));
  await p.reload(); await p.waitForTimeout(1200); log('persisted after reload:', (await p.$$('.gpa-row')).length, '| gpa:', await txt(p, '.gpa-big'), '| prior:', await p.$eval('#gpa-prior', e => e.value), '| goal:', await p.$eval('#gpa-goal', e => e.value));
  await p.click('.gpa-row:nth-child(1) [data-action="gpa-use"]').catch(() => {}); await p.waitForTimeout(150); log('use projected:', await p.$eval('.gpa-row:nth-child(1) select', e => e.value), '| proj line now:', await txt(p, '.gpa-row:nth-child(1) .gpa-proj'));
  await p.click('[data-action="gpa-reset"]'); await p.waitForTimeout(200); log('reset:', await p.$$eval('.gpa-row', rs => rs.map(r => r.querySelector('[data-f=name]').value.split(' · ')[0] + ':' + r.querySelector('[data-f=credits]').value + ':' + (r.querySelector('[data-f=grade]').value || '-')).join(' | ')));
  // standalone
  await go(p, '#/gpa'); await p.waitForTimeout(500); log('standalone title:', await txt(p, '.landing-title'), '| account painted:', !!(await p.$('#landing-account .acct-btn')), '| landing class:', await p.$eval('.app', e => e.classList.contains('landing')), '| reset btn:', !!(await p.$('[data-action="gpa-reset"]')));
  await go(p, '#/'); await p.waitForTimeout(600); log('landing link:', !!(await p.$('a[href="#/gpa"]'))); await p.click('#landing-account .acct-btn'); await p.waitForTimeout(200); log('menu item:', await txt(p, '.pop-account a[href="#/gpa"]'));
  await go(p, '#/settings'); await p.waitForTimeout(500); log('settings tile:', await txt(p, '.link-tile[href="#/gpa"]'));
  await go(p, '#/physics/gpa'); await p.waitForTimeout(300); log('physics nav:', !!(await p.$('.nav-item[data-view="gpa"]')), '| credits phys:', await p.evaluate(() => Courses.physics.COURSE.credits + '/' + Courses.precalc.COURSE.credits));
  await c.close();
  // guest + mobile
  const [cm, m] = await mk(390, 720); await go(m, '#/gpa'); await m.waitForTimeout(500); log('guest standalone rows:', (await m.$$('.gpa-row')).length, '| no hscroll:', await hscroll(m)); await go(m, '#/calc/gpa'); await m.waitForTimeout(400); log('guest in-course no hscroll:', await hscroll(m), '| gated?', !!(await m.$('.lock-card')));
  await cm.close();
  await T.finish();
})();

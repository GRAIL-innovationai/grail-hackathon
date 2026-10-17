/* Accessibility audit with axe-core on the main pages (WCAG 2.2 A/AA rules), the professors' pages included. Fails on serious/critical violations.
   The pages enforce a Content-Security-Policy without inline scripts, so the contexts that inject axe bypass it. */
const T = require('./lib'); const fs = require('fs'); const path = require('path');
(async () => {
  const { mk, login, txt, go, log, check, api } = await T.start({});
  const axe = fs.readFileSync(path.join(__dirname, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
  const PAGES = [['#/', 'landing'], ['#/today', 'today'], ['#/calc', 'dashboard'], ['#/calc/notes/1.3', 'notes'], ['#/calc/practice', 'practice'], ['#/calc/flashcards', 'flashcards'], ['#/calc/calendar', 'calendar'], ['#/forum', 'forum'], ['#/settings', 'settings'], ['#/gpa', 'gpa'], ['#/whatsnew', 'whatsnew'], ['#/csci/playground', 'playground'], ['#/writ/phonetics', 'phonetics'], ['#/class', 'class-hub'], ['#/teach', 'teach-signed-out'], ['#/no-such-page', 'not-found'], ['#/create', 'create'], ['#/tutor', 'tutor'], ['#/plan', 'plan']];
  const [c, p] = await mk(1360, 900, { bypassCSP: true }); await go(p, '#/'); await login(p, 'alice.a@montana.edu'); await p.reload(); await p.waitForTimeout(1200); if (await p.$('.celebrate')) await p.keyboard.press('Escape');
  await p.evaluate(() => { const s = App.settings(); s.courses = ['calc', 'physics', 'writ', 'csci']; s.motion = 'off'; localStorage.setItem('studyhub-settings', JSON.stringify(s)); });   // no entrance animations: axe measures colours mid-fade otherwise
  const totals = {}; const serious = [];
  for (const [hash, name] of PAGES) {
    await go(p, hash, 900); await p.addScriptTag({ content: axe });
    const r = await p.evaluate(async () => { const res = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] }); return res.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, sample: v.nodes.slice(0, 2).map(x => x.target.join(' ').slice(0, 90)) })); });
    totals[name] = r.length; const bad = r.filter(v => v.impact === 'serious' || v.impact === 'critical');
    log(`${name.padEnd(11)} ${r.length ? r.map(v => `${v.impact[0]}:${v.id}(${v.n})`).join(' ') : 'clean'}`);
    bad.forEach(v => { serious.push(`${name}: ${v.id} ×${v.n} — ${v.help} e.g. ${v.sample.join(' | ')}`); });
  }
  // the professors' pages, as an instructor with a published class that has a schedule
  { const [ci, pi] = await mk(1360, 900, { bypassCSP: true }); await go(pi, '#/'); await login(pi, 'admin.user@montana.edu'); await pi.reload(); await pi.waitForTimeout(1000);
    await pi.evaluate(() => { const s = App.settings(); s.motion = 'off'; localStorage.setItem('studyhub-settings', JSON.stringify(s)); });
    const made = (await api(pi, 'teach_class_create', { code: 'AXE 101', title: 'Accessibility check', term: 'Fall 2026', link_course: 'calc' })).json; const cid = made.id;
    const syl = (await api(pi, 'teach_class_get&id=' + cid)).json.syllabus;
    syl.schedule = { start: '2026-08-24', end: '2026-09-11', rows: [{ date: '2026-08-24', type: 'lecture', title: 'Limits', notes: 'Read 1.1' }, { date: '2026-08-28', type: 'due', title: 'Homework 1', notes: '' }, { date: '2026-09-07', type: 'holiday', title: 'Labor Day', notes: '' }] };
    syl.exams = [{ name: 'Midterm 1', date: '2026-09-30', time: '18:00', place: 'Reid 108', covers: 'Chapter 1' }];
    await api(pi, 'teach_class_save', { id: cid, syllabus: syl }); await api(pi, 'teach_class_publish', { id: cid }); const jc = (await api(pi, 'teach_class_get&id=' + cid)).json.class.join_code;
    for (const [hash, name] of [['#/teach', 'teach-home'], ['#/teach/new', 'teach-new'], ['#/teach/verify', 'teach-verify'], [`#/teach/${cid}`, 'teach-overview'], [`#/teach/${cid}/course`, 'teach-course'], [`#/teach/${cid}/people`, 'teach-people'], [`#/teach/${cid}/schedule`, 'teach-schedule'], [`#/teach/${cid}/exams`, 'teach-exams'], [`#/teach/${cid}/grading`, 'teach-grading'], [`#/teach/${cid}/policies`, 'teach-policies'], [`#/teach/${cid}/students`, 'teach-students'], [`#/teach/${cid}/attendance`, 'teach-attendance'], [`#/teach/${cid}/settings`, 'teach-settings'], [`#/teach/${cid}/assign`, 'teach-assign'], [`#/teach/${cid}/insights`, 'teach-insights'], [`#/syllabus/${jc}`, 'syllabus-page'], ['#/admin/teach', 'admin-teach']]) {
      await go(pi, hash, 1400); await pi.evaluate(() => document.querySelectorAll('.celebrate').forEach(e => e.remove())); await pi.addScriptTag({ content: axe });
      const r = await pi.evaluate(async () => { const res = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] }); return res.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, sample: v.nodes.slice(0, 2).map(x => x.target.join(' ')) })); });
      log(`${name.padEnd(15)} ${r.length ? r.map(v => `${v.impact[0]}:${v.id}(${v.n})`).join(' ') : 'clean'}`);
      r.filter(v => v.impact === 'serious' || v.impact === 'critical').forEach(v => serious.push(`${name}: ${v.id} ×${v.n} — ${v.help} e.g. ${v.sample.join(' | ')}`));
    }
    await api(pi, 'teach_class_delete', { id: cid, confirm: 'AXE 101' }); await ci.close(); }
  // static page too
  await p.goto(T.base.replace('index.html', 'learn/calc/index.html')); await p.waitForTimeout(400); await p.addScriptTag({ content: axe });
  const st = await p.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } })).violations.map(v => `${v.impact[0]}:${v.id}(${v.nodes.length})`));
  log('static learn/calc:', st.length ? st.join(' ') : 'clean');
  // keyboard: skip link + focus visible + escape closes modals
  await go(p, '#/calc/notes/1.3', 600); await p.keyboard.press('Tab'); const first = await p.evaluate(() => document.activeElement && (document.activeElement.className + ' ' + document.activeElement.textContent.trim().slice(0, 30)));
  log('first tab stop:', first);
  check('a skip link is the first tab stop', /skip/i.test(first || ''), first);
  await p.keyboard.press('Control+k'); await p.waitForTimeout(200); check('search modal takes focus', await p.evaluate(() => document.activeElement && document.activeElement.id === 'search-input')); await p.keyboard.press('Escape'); await p.waitForTimeout(150); check('escape closes search', !(await p.$('#search-modal')));
  serious.forEach(s => log('  ! ' + s));
  check('no serious or critical axe violations', serious.length === 0, serious.length);
  await c.close(); await T.finish();
})();

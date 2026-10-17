/* M 172 Calculus II: the bundled class pack built from the Fall 2026 syllabus (packs/src/m172.js).
   It installs itself, opens on its dashboard, follows the syllabus calendar and the lab-day picker,
   and its quizzer, exam prep, grade calculator (4-point scale and rubric) and syllabus page work. */
const T = require('./lib');
(async () => {
  const { mk, go, txt, login, log, check, hscroll } = await T.start();
  const setSettings = (p, patch) => p.evaluate(patch => { const s = App.settings(); Object.assign(s, patch); localStorage.setItem('studyhub-settings', JSON.stringify(s)); }, patch);
  const [c, p] = await mk(1360, 900, { serviceWorkers: 'block' });
  await go(p, '#/', 1200);
  await setSettings(p, { asof: '2026-10-03', motion: 'off' }); await p.reload(); await p.waitForTimeout(1500);
  const card = await p.evaluate(() => [...document.querySelectorAll('.course-card')].some(c => c.classList.contains('m172')));
  check('the start page lists M 172', card);

  await go(p, '#/m172', 2200);
  const dash = await p.evaluate(() => { const C = window.Courses.m172; return { loaded: !!(C && C.loaded), title: (document.querySelector('.page-title') || {}).textContent || '', chip: (document.querySelector('#exam-chip') || {}).textContent || '', current: App.currentSectionOf(C).id }; });
  log('dashboard:', dash);
  check('M 172 opens on its dashboard', dash.loaded && dash.title.length > 3, dash);
  check('as of Oct 3 the next exam is Exam 2', /Exam 2/.test(dash.chip), dash.chip);
  check('as of Oct 3 the current topic is 6.4 Work', dash.current === 'work', dash.current);

  await go(p, '#/m172/notes/sub', 900);
  const note = await txt(p, '#view');
  check('the substitution note renders', note.length > 800 && /Integration by substitution/.test(note) && /function–derivative pair/.test(note), note.slice(0, 120));
  await go(p, '#/m172/notes/fourier', 900);
  check('the Fourier note says it is beyond the textbook', /beyond Active Calculus/.test(await txt(p, '#view')));
  await go(p, '#/m172/flashcards', 900); check('flashcards view', /flash/i.test(await txt(p, '.page-title')));

  await login(p, 'alice.a@montana.edu'); await p.reload(); await p.waitForTimeout(1200); await p.evaluate(() => document.querySelectorAll('.celebrate').forEach(e => e.remove()));
  await go(p, '#/m172/formulas', 900);
  const fs = await txt(p, '#view');
  check('signed in, the formula sheet has the series tests and Maclaurin series', /Ratio test/.test(fs) && /Lagrange error/.test(fs) && /Shells/.test(fs));
  await go(p, '#/m172/practice', 1200); if (await p.isVisible('#view [data-action="start"]')) { await p.click('#view [data-action="start"]'); await p.waitForTimeout(600); }
  check('every quizzer option has a letter', !/undefined|NaN/.test(await txt(p, '#view')) && (await p.$$eval('.q-opt .letter', ls => ls.map(l => l.textContent))).every(l => /^[A-F]$/.test(l)));
  const gen = await p.evaluate(() => { const Q = window.Courses.m172.quiz; let n = 0, bad = 0; for (let r = 0; r < 10; r++) { const set = Q.generateSet(Object.keys(Q.TOPICS), 30); n += set.length; bad += set.filter(q => q.type === 'mc' ? !(q.answer >= 0 && q.answer < q.options.length && q.options.length >= 2) : !(typeof q.answer === 'number' && isFinite(q.answer))).length; } return { n, bad, topics: Object.keys(Q.TOPICS).length }; });
  check('the quizzer generates 300 well-formed questions across 24 topics', gen.n === 300 && gen.bad === 0 && gen.topics === 24, gen);

  await go(p, '#/m172/exam/exam1', 900);
  const ex = await txt(p, '#view');
  check('Exam 1 prep covers 5.3–6.1', /Exam prep/.test(await txt(p, '.page-title')) && /5\.3–6\.1/.test(ex), ex.slice(0, 160));
  await go(p, '#/m172/exam/exam4', 900);
  check('Exam 4 says finals week and that its sections are not listed', /Finals week/i.test(await txt(p, '#view')) && /does not list/.test(await txt(p, '#view')));

  await go(p, '#/m172/grades', 900);
  check('the grade calculator has the 8 syllabus categories', (await p.$$('.grade-row')).length === 8);
  const g = await txt(p, '#view');
  check('it shows the 4-point scale and the rubric', /3\.75 – 4\.00/.test(g) && /Substantial/.test(g) && /4-point/.test(g));

  // the lab-day picker shows only that day's labs
  await go(p, '#/m172/settings', 900);
  check('settings offers the lab-day picker', !!(await p.$('#s-variant')));
  for (const v of ['tue', 'thu']) {
    await p.selectOption('#s-variant', v); await p.waitForTimeout(250);
    const labs = await p.evaluate(v => { const rows = window.Courses.m172.CALENDAR.filter(e => e[1] === 'lab'); return { n: rows.length, others: rows.filter(e => e[4] !== v).length, first: rows[0] && rows[0][0] }; }, v);
    check(`${v === 'tue' ? 'Tuesday' : 'Thursday'} lab: 14 labs, none from the other day`, labs.n === 14 && labs.others === 0 && labs.first === (v === 'tue' ? '2026-09-01' : '2026-09-03'), labs);
  }
  await go(p, '#/m172/calendar', 900);
  const cal = await txt(p, '#view');
  check('the calendar shows exams and the lab note', /Exam/.test(cal) && /lab/i.test(cal));
  await go(p, '#/m172/course', 900);
  const course = await txt(p, '#view');
  check('the syllabus page has the instructor, AI policy and exam rules', /Rob Malo/.test(course) && /support tool for learning/.test(course) && /No electronics/i.test(course) && (await p.$$('#view .panel')).length >= 5);
  await c.close();

  const [cm, m] = await mk(390, 844, { serviceWorkers: 'block' });
  await go(m, '#/', 900); await setSettings(m, { motion: 'off' });
  for (const h of ['#/m172', '#/m172/notes/power', '#/m172/formulas', '#/m172/calendar']) { await go(m, h, 1400); check(`no sideways scroll on ${h} at 390px`, await hscroll(m)); }
  await cm.close();
  await T.finish();
})();

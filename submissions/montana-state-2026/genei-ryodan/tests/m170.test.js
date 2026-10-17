/* M 170 Trigonometry for Calculus: the bundled class pack built from the Fall 2026 syllabus (packs/src/m170.js).
   The syllabus has no schedule, so the exam dates and weekly topics are labeled estimates. It installs itself,
   opens on its dashboard, and its notes, quizzer, exam prep, grade calculator and syllabus page work. */
const T = require('./lib');
(async () => {
  const { mk, go, txt, login, log, check, hscroll } = await T.start();
  const setSettings = (p, patch) => p.evaluate(patch => { const s = App.settings(); Object.assign(s, patch); localStorage.setItem('studyhub-settings', JSON.stringify(s)); }, patch);
  const [c, p] = await mk(1360, 900, { serviceWorkers: 'block' });
  await go(p, '#/', 1200);
  await setSettings(p, { asof: '2026-10-08', motion: 'off' }); await p.reload(); await p.waitForTimeout(1500);
  const card = await p.evaluate(() => [...document.querySelectorAll('.course-card')].some(c => c.classList.contains('m170')));
  check('the start page lists M 170', card);

  await go(p, '#/m170', 2200);
  const dash = await p.evaluate(() => { const C = window.Courses.m170; return { loaded: !!(C && C.loaded), title: (document.querySelector('.page-title') || {}).textContent || '', chip: (document.querySelector('#exam-chip') || {}).textContent || '', current: App.currentSectionOf(C).id }; });
  log('dashboard:', dash);
  check('M 170 opens on its dashboard', dash.loaded && dash.title.length > 3, dash);
  check('as of Oct 8 the next exam is Exam 1', /Exam 1/.test(dash.chip), dash.chip);
  check('as of Oct 8 the current topic is the other trig functions', dash.current === 'otherfns', dash.current);
  const est = await p.evaluate(() => { const C = window.Courses.m170; return { exams: C.EXAMS.map(e => [e.date, e.dateLabel]), rows: C.CALENDAR.filter(e => e[1] === 'exam').map(e => e[2]) }; });
  check('both exam dates are labeled as estimates', est.exams.length === 2 && est.exams[0][0] === '2026-10-14' && est.exams[1][0] === '2026-12-09' && est.exams.every(e => /estimated/.test(e[1])) && est.rows.every(r => /estimated/.test(r)), est);

  await go(p, '#/m170/notes/angles', 900);
  const note = await txt(p, '#view');
  check('the angles note renders with its OpenStax link', note.length > 600 && /radian/.test(note) && (await p.$$eval('#view a[href*="openstax.org/books/algebra-and-trigonometry-2e/pages/7-1-angles"]', a => a.length)) > 0, note.slice(0, 120));
  await go(p, '#/m170/flashcards', 900); check('flashcards view', /flash/i.test(await txt(p, '.page-title')));

  await login(p, 'alice.a@montana.edu'); await p.reload(); await p.waitForTimeout(1200); await p.evaluate(() => document.querySelectorAll('.celebrate').forEach(e => e.remove()));
  await go(p, '#/m170/notes/laws', 900);
  check('signed in, the Laws of Sines and Cosines note renders', /Law of Cosines/.test(await txt(p, '#view')));
  await go(p, '#/m170/formulas', 900);
  const fs = await txt(p, '#view');
  check('the formula sheet has the unit circle, identities and triangle laws', /SOH CAH TOA/.test(fs) && /Pythagorean/.test(fs) && /Law of Sines/.test(fs) && /Inverse ranges/.test(fs));
  await go(p, '#/m170/practice', 1200); if (await p.isVisible('#view [data-action="start"]')) { await p.click('#view [data-action="start"]'); await p.waitForTimeout(600); }
  check('every quizzer option has a letter', !/NaN|\{\{\s*[a-z=]/.test(await txt(p, '#view')) && (await p.$$eval('.q-opt .letter', ls => ls.map(l => l.textContent))).every(l => /^[A-F]$/.test(l)));
  const gen = await p.evaluate(() => { const Q = window.Courses.m170.quiz; let n = 0, bad = 0; for (let r = 0; r < 10; r++) { const set = Q.generateSet(Object.keys(Q.TOPICS), 30); n += set.length; bad += set.filter(q => q.type === 'mc' ? !(q.answer >= 0 && q.answer < q.options.length && q.options.length >= 2 && new Set(q.options).size === q.options.length) : !(typeof q.answer === 'number' && isFinite(q.answer))).length; } return { n, bad, topics: Object.keys(Q.TOPICS).length }; });
  check('the quizzer generates 300 well-formed questions across 9 topics', gen.n === 300 && gen.bad === 0 && gen.topics === 9, gen);
  const typed = await p.evaluate(() => [['sqrt(3)/2', 0.8660254], ['5pi/6', 2.6179939], ['(sqrt(6)-sqrt(2))/4', 0.2588190], ['-sqrt(2)/2', -0.7071068]].map(([s, v]) => Math.abs(App.parseNumber(s) - v) < 1e-6));
  check('exact typed answers like sqrt(3)/2 and 5pi/6 are read correctly', typed.every(Boolean), typed);

  await go(p, '#/m170/exam/exam1', 900);
  const ex = await txt(p, '#view');
  check('Exam 1 prep says the date is an estimate', /Exam prep/.test(await txt(p, '.page-title')) && /estimate/i.test(ex), ex.slice(0, 200));
  await go(p, '#/m170/exam/exam2', 900);
  check('Exam 2 prep lists the triangle laws', /Laws of Sines and Cosines/.test(await txt(p, '#view')));

  await go(p, '#/m170/grades', 900);
  check('the grade calculator has the 6 syllabus categories', (await p.$$('.grade-row')).length === 6);
  const g = await txt(p, '#view');
  check('it shows the 4-point scale and the written-work rubric', /3\.75 – 4\.0/.test(g) && /Substantial/.test(g) && /Developing/.test(g));

  await go(p, '#/m170/calendar', 900);
  const cal = await txt(p, '#view');
  check('the calendar shows the estimated exams and the pacing note', /Exam 1/.test(cal) && /estimate/i.test(cal));
  await go(p, '#/m170/course', 900);
  const course = await txt(p, '#view');
  check('the syllabus page has the instructor, AI policy and the estimated exam dates', /Shari Kepner/.test(course) && /support tool for learning/.test(course) && /Oct 14/.test(course) && /Dec 9/.test(course) && (await p.$$('#view .panel')).length >= 5);
  await c.close();

  const [cm, m] = await mk(390, 844, { serviceWorkers: 'block' });
  await go(m, '#/', 900); await setSettings(m, { motion: 'off' });
  for (const h of ['#/m170', '#/m170/notes/unitcircle', '#/m170/formulas', '#/m170/calendar']) { await go(m, h, 1400); check(`no sideways scroll on ${h} at 390px`, await hscroll(m)); }
  await cm.close();
  await T.finish();
})();

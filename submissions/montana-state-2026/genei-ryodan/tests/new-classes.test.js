/* BIOB 160, KIN 322 and PSYX 340: every class view renders, the question banks
   generate, section and lab-section variants move the calendar and exam dates,
   KIN's best-of exam weighting works, and the static pages and API accept them. */
const T = require('./lib');
(async () => {
  const { base, mk, txt, login, hscroll, go: open, log, check } = await T.start();
  /* celebrations (league promotions, level-ups) sit over the page; clear them so clicks land */
  const go = async (p, hash, wait) => { await open(p, hash, wait); await p.evaluate(() => document.querySelectorAll('.celebrate').forEach(e => e.remove())); };
  const setSettings = (p, patch) => p.evaluate(patch => { const s = App.settings(); Object.assign(s, patch); localStorage.setItem('studyhub-settings', JSON.stringify(s)); }, patch);
  const IDS = ['biob', 'kin', 'psyx'];
  const ACCENT = { biob: '#4d7c0f', kin: '#b45309', psyx: '#be185d' };

  const [c, p] = await mk(); await go(p, '#/'); await p.waitForTimeout(600);
  check('class order lists the new classes', await p.evaluate(() => ['biob', 'kin', 'psyx'].every(id => window.Courses[id] && window.Courses[id].stub)));
  await setSettings(p, { courses: ['calc', 'biob', 'kin', 'psyx'], motion: 'off' }); await p.reload(); await p.waitForTimeout(700);
  const cards = await p.$$eval('.course-grid .course-card', cs => cs.map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)));
  check('start page shows the new class cards', ['BIOB 160', 'KIN 322', 'PSYX 340'].every(code => cards.some(t => t.includes(code))), cards);
  await login(p, 'alice.a@montana.edu'); await p.reload(); await p.waitForTimeout(1000); await p.evaluate(() => document.querySelectorAll('.celebrate').forEach(e => e.remove()));   // grade calculators and full sheets are for members

  for (const id of IDS) {
    log(`-- ${id} --`);
    await go(p, `#/${id}`, 900);
    check(`${id} dashboard loads its files`, await p.evaluate(id => !!(window.Courses[id].loaded && window.Courses[id].quiz && window.Courses[id].FLASHCARDS.length), id));
    check(`${id} accent colour`, (await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase())) === ACCENT[id]);
    const first = await p.evaluate(id => window.Courses[id].SECTIONS[1].id, id);
    await go(p, `#/${id}/notes/${first}`); check(`${id} topic note renders`, (await txt(p, '#view')).length > 800);
    await go(p, `#/${id}/formulas`); const defs = (await p.$$('.fs-def')).length; check(`${id} key-terms sheet has definitions`, defs > 10, defs);
    check(`${id} key-terms sheet title`, /key terms/i.test(await txt(p, '.page-title')));
    await go(p, `#/${id}/flashcards`); check(`${id} flashcards view`, /flash/i.test(await txt(p, '.page-title')));
    await go(p, `#/${id}/practice`); check(`${id} quizzer page`, (await txt(p, '#view')).length > 100);
    check(`${id} every option has a letter`, !/undefined/.test(await txt(p, '#view')) && (await p.$$eval('.q-opt .letter', ls => ls.map(l => l.textContent))).every(l => /^[A-F]$/.test(l)));
    const gen = await p.evaluate(id => { const Q = window.Courses[id].quiz; const set = Q.generateSet(Object.keys(Q.TOPICS), 30); return { n: set.length, bad: set.filter(q => q.type === 'mc' ? !(q.answer >= 0 && q.answer < q.options.length) : !isFinite(q.answer)).length }; }, id);
    check(`${id} generates a 30-question set`, gen.n === 30 && gen.bad === 0, gen);
    await go(p, `#/${id}/exam/exam1`); check(`${id} exam prep`, /Exam prep/.test(await txt(p, '.page-title')) && /Exam 1/.test(await txt(p, '#view')));
    await go(p, `#/${id}/calendar`); check(`${id} calendar shows exams`, /Exam/.test(await txt(p, '#view')));
    await go(p, `#/${id}/course`); check(`${id} syllabus panels`, (await p.$$('#view .panel')).length >= 5);
    await go(p, `#/${id}/grades`); check(`${id} grade calculator rows`, (await p.$$('.grade-row')).length >= 4);
  }

  // ---- KIN 322: the best of six exam-weighting options ----
  await go(p, '#/kin/grades');
  const scores = { hw: 90, quizzes: 90, exam1: 50, exam2: 80, exam3: 85, final: 90, labs: 95, labexams: 90 };
  for (const [k, v] of Object.entries(scores)) await p.fill(`#g-${k}`, String(v));
  await p.waitForTimeout(200);
  const gout = await txt(p, '#g-out');
  check('KIN uses option 6 when the final is strongest', /Option 6/.test(gout) && /90\.8%/.test(gout), gout.slice(0, 160));
  check('KIN projected grade is A-', await p.evaluate(() => { const g = App.projectedGrade('kin'); return g && g.letter === 'A-' && Math.abs(g.pct - 90.75) < 0.01; }));
  await p.fill('#g-final', '60'); await p.waitForTimeout(150);
  const g2 = await txt(p, '#g-out'); check('KIN picks option 2 when Exam 1 and the final are weak', /Option 2/.test(g2) && /83\.0%/.test(g2), g2.slice(0, 160));
  await p.click('[data-action="clear"]'); await p.waitForTimeout(150);

  // ---- PSYX 340: section variants move lecture days and exam dates ----
  await go(p, '#/psyx/settings');
  check('PSYX settings offers the section picker', !!(await p.$('#s-variant')));
  await p.selectOption('#s-variant', '2'); await p.waitForTimeout(200);
  const v2 = await p.evaluate(() => { const C = window.Courses.psyx; return { exam1: C.EXAMS[0].date, label: C.EXAMS[0].dateLabel, tagged: C.CALENDAR.filter(e => e[4] && e[4] !== '2').length, firstLec: C.CALENDAR.find(e => e[1] === 'lecture')[0] }; });
  check('section 02 exam dates', v2.exam1 === '2026-09-28' && /Cheever/.test(v2.label), v2);
  check('section 02 calendar has only its rows', v2.tagged === 0 && v2.firstLec === '2026-08-26', v2);
  await go(p, '#/psyx/settings'); await p.selectOption('#s-variant', '1'); await p.waitForTimeout(200);
  check('section 01 exam dates', await p.evaluate(() => window.Courses.psyx.EXAMS[0].date === '2026-09-29'));
  await setSettings(p, { asof: '2026-10-07' }); await go(p, '#/psyx');
  check('PSYX current topic follows the calendar', await p.evaluate(() => App.currentSectionOf(window.Courses.psyx).id === 'bipolar'));

  // ---- KIN 322: the lab section puts labs on the right day ----
  await go(p, '#/kin/settings'); await p.selectOption('#s-variant', 'wed10'); await p.waitForTimeout(200);
  const lab = await p.evaluate(() => { const C = window.Courses.kin; const rows = C.CALENDAR.filter(e => e[4]); return { n: rows.length, others: rows.filter(e => e[4] !== 'wed10').length, practical: (rows.find(e => /Practical 1/.test(e[2])) || [])[0] }; });
  check('KIN Wednesday 10:00 lab rows', lab.n === 13 && lab.others === 0 && lab.practical === '2026-09-30', lab);
  await go(p, '#/kin/calendar'); check('KIN calendar shows the lab note', /lab section/i.test(await txt(p, '#view')));
  await setSettings(p, { asof: '' });

  // ---- search, resources, guides ----
  await go(p, '#/resources'); check('resources list the new classes', await p.evaluate(() => ['biob', 'kin', 'psyx'].every(g => window.MATHUB_RESOURCES.ITEMS.some(i => i.g === g))));
  check('study guide for the new classes', await p.evaluate(() => App.guidesFor('kin').some(g => g.id === 'science-exam')));

  // ---- server accepts the new class ids ----
  const forum = await p.evaluate(async () => { const out = {}; for (const id of ['biob', 'kin', 'psyx']) { const x = await fetch('api/index.php?r=forum_posts&course=' + id, { headers: { 'X-Requested-With': 'MatHub' } }); out[id] = x.status === 200 && (await x.json()).ok === true; } return out; });
  check('forum lists posts for each new class', Object.values(forum).every(Boolean), forum);

  // ---- static study pages ----
  for (const id of IDS) { const r = await p.request.get(base.replace('index.html', '') + `learn/${id}/`); check(`learn/${id}/ exists`, r.status() === 200 && (await r.text()).includes('study guide')); }

  // ---- phone width ----
  const [cm, m] = await mk(390, 760); await m.goto(base + '#/'); await m.waitForTimeout(400); await setSettings(m, { courses: ['biob', 'kin', 'psyx'], motion: 'off' });
  for (const h of ['#/kin/notes/levers', '#/biob/formulas', '#/psyx/calendar', '#/kin/grades']) { await go(m, h, 700); check(`no sideways scroll on ${h} at 390px`, await hscroll(m)); }
  await cm.close(); await c.close();
  await T.finish();
})();

/* Class packs: an admin uploads a class as one JSON file in the admin panel and it
   works like a built-in class. Covers the builder's checks, the upload preview, the
   class on the start page, in the sidebar and in search, every class view, the
   quizzer, section variants, the cleaner (no script from a pack ever runs), the
   server accepting the new class id, telling the students who asked, hide and
   publish, updates reaching students, rollback, and delete. Uses ZZP 101, which is
   not a real course, and removes it at the end. */
const T = require('./lib');
const fs = require('fs'); const path = require('path'); const { spawnSync } = require('child_process');
(async () => {
  const { base, mk, txt, login, api: raw, hscroll, go: open, log, check } = await T.start();
  const api = async (...a) => ((await raw(...a)).json || {});
  const go = async (p, hash, wait) => { await open(p, hash, wait); await p.evaluate(() => document.querySelectorAll('.celebrate').forEach(e => e.remove())); };
  const ROOT = path.resolve(__dirname, '..'); const FIX = path.join(__dirname, 'fixtures');
  const P = require('../assets/classpacks.js');

  // ---- the builder: checks the pack and writes the JSON the admin uploads ----
  const b = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'make-pack.js'), path.join(FIX, 'zzp101.js'), '--out', FIX, '--runs', '200'], { encoding: 'utf8' });
  check('make-pack builds the sample class', b.status === 0 && fs.existsSync(path.join(FIX, 'zzp101.mathub.json')), b.stdout.slice(-300) + b.stderr);
  const pack = JSON.parse(fs.readFileSync(path.join(FIX, 'zzp101.mathub.json'), 'utf8'));
  const broken = JSON.parse(JSON.stringify(pack)); broken.id = 'calc'; broken.SECTIONS[1].unit = 9; broken.CALENDAR.push(['2026-13-01', 'party', 'x']); broken.QUIZ.questions.push({ type: 'calc', topic: 'prob', vars: { p: [1, 2] }, prompt: 'x', answer: 'p.constructor' });
  const v = P.validate(broken);
  check('the checker catches a bad id, a bad unit, a bad date and type, and a bad expression', v.errors.some(e => /"id"/.test(e)) && v.errors.some(e => /unit 9/.test(e)) && v.errors.filter(e => /CALENDAR\[\d+\]/.test(e)).length >= 1 && v.errors.some(e => /unexpected "."/.test(e)), v.errors);
  const bad = path.join(FIX, 'zzp101-broken.mathub.json'); fs.writeFileSync(bad, JSON.stringify(broken));

  // ---- the admin uploads it ----
  const [ca, a] = await mk(1360, 1000); await go(a, '#/'); await login(a, 'admin.user@montana.edu'); await a.reload(); await a.waitForTimeout(900);
  const leftover = await api(a, 'admin_classpacks'); for (const p of (leftover.packs || []).filter(p => p.id === 'zzp101')) await api(a, 'admin_classpack_delete', { id: p.id, confirm: p.code });
  // a TA asks for the class first, so the upload can tell them (requests come from professors and TAs)
  await api(a, 'admin_role', { email: 'alice.a@montana.edu', role: 'TA' });
  const [cs, s] = await mk(1360, 1000); await go(s, '#/'); await login(s, 'alice.a@montana.edu'); await s.reload(); await s.waitForTimeout(900);
  const asked = await api(s, 'classreq_create', { code: 'ZZP 101', title: 'Sample Statistics' });
  check('a TA asks for ZZP 101', asked.ok === true || /already asked/.test(asked.error || ''), asked);
  check('students cannot use the admin pack routes', (await api(s, 'admin_classpacks')).ok === false && (await api(s, 'admin_classpack_install', { json: JSON.stringify(pack) })).ok === false);

  await go(a, '#/admin/packs', 1200);
  check('the admin panel has an Add a class tab', /Add or update a class/.test(await txt(a, '#adm-body')) && !!(await a.$('.admin-tab.active[href="#/admin/packs"]')));
  await a.setInputFiles('#pk-file', bad); await a.waitForTimeout(600);
  check('a broken pack is stopped before upload', /problems? to fix/.test(await txt(a, '#pk-preview')) && !(await a.$('[data-action="pk-install"]')));
  await a.setInputFiles('#pk-file', path.join(FIX, 'zzp101.mathub.json')); await a.waitForTimeout(800);
  const pv = await txt(a, '#pk-preview');
  check('the preview shows the class, its counts and sample questions', /ZZP 101/.test(pv) && /New class/.test(pv) && /6 topics/.test(pv) && (await a.$$('.pk-q')).length >= 1, pv.slice(0, 200));
  check('the preview offers to tell the student who asked', !!(await a.$('#pk-notify:checked')) && /who asked for ZZP 101/.test(pv));
  await a.click('[data-action="pk-install"]'); await a.waitForTimeout(1500);
  check('the class is installed and listed as live', /ZZP 101/.test(await txt(a, '.pk-list')) && /Live/.test(await txt(a, '.pk-row[data-id="zzp101"]')));
  const inbox = await api(s, 'notif_list'); const msg = (inbox.notifications || []).find(x => x.kind === 'classreq' && x.title === 'ZZP 101');
  check('the student who asked is told, with a link to the class', !!msg && msg.link === '#/zzp101', msg);

  // ---- a student sees it everywhere, on a fresh device ----
  const [cg, g] = await mk(1360, 1000); await go(g, '#/zzp101/notes/intro', 1500);
  check('a direct link works on a first visit', /Data and sampling/.test(await txt(g, '#view')) && await g.evaluate(() => window.Courses.zzp101 && window.Courses.zzp101.loaded));
  check('hostile markup in the pack never runs', await g.evaluate(() => window.__pwned === undefined && !document.querySelector('#view img, #view script')) && /this sentence stays/.test(await txt(g, '#view')));
  check('the sidebar switcher includes the class with its colour', await g.evaluate(() => !!document.querySelector('.switch-btn[data-c="zzp101"]') && getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toUpperCase() === '#0F766E'));
  check('the sidebar offers a guest Make a class (requests are for professors and TAs)', !!(await g.$('#course-switch a.req[href="#/create"]')) && !(await g.$('#course-switch a.req[href="#/request"]')));
  await go(g, '#/', 900);
  check('the start page shows the class card', !!(await g.$('.course-card.zzp101')) || /ZZP 101/.test(await txt(g, '.course-grid')));
  await g.keyboard.press('Control+k'); await g.waitForTimeout(300); await g.fill('#search-input', 'z-score'); await g.waitForTimeout(400);
  check('search finds the class', /ZZP 101/.test(await txt(g, '#search-results'))); await g.keyboard.press('Escape');
  await s.reload(); await s.waitForTimeout(800);
  for (const h of ['#/today', '#/gpa', '#/sheet', '#/focus', '#/leagues', '#/guides', '#/tools', '#/mistakes', '#/challenge', '#/settings']) { await go(s, h, 900); check(`${h} renders with the uploaded class`, (await txt(s, '#view')).length > 40); }
  await s.evaluate(() => document.documentElement.setAttribute('data-skin', 'realm')); await go(s, '#/sheet', 900); check('the character sheet knows its archetype', await s.evaluate(() => App.archetype('zzp101').name === 'Oracle'));
  await go(s, '#/request', 900); await s.fill('#rq-code', 'zzp101'); await s.waitForTimeout(150);
  check('the request page knows the class is on Mathub', /already on Mathub/.test(await txt(s, '#rq-code-help')));
  await login(g, 'mod.user@montana.edu'); await g.reload(); await g.waitForTimeout(800);   // signed in from here: full quizzer and grade calculator
  await go(g, '#/zzp101/practice', 900); if (await g.isVisible('#view [data-action="start"]')) { await g.click('#view [data-action="start"]'); await g.waitForTimeout(500); }   // a set is generated on arrival
  const cards = (await g.$$('.q-card')).length; const opt = await g.$('.q-card .q-opt'); if (opt) { await opt.click(); await g.waitForTimeout(250); }
  check('the quizzer generates and grades questions', cards >= 5 && (!opt || !!(await g.$('.q-feedback'))), cards);
  const gen = await g.evaluate(() => { const Q = window.Courses.zzp101.quiz; const set = Q.generateSet(Object.keys(Q.TOPICS), 30); return { n: set.length, bad: set.filter(q => q.type === 'mc' ? !(q.answer >= 0 && q.answer < q.options.length) : !isFinite(q.answer)).length }; });
  check('30-question sets come out whole', gen.n >= 20 && gen.bad === 0, gen);
  await go(g, '#/zzp101/formulas', 700); check('TeX formulas render safely', (await g.$$('.fs-row')).length === 6 && !(await g.$('#fs-body img')));
  await go(g, '#/zzp101/flashcards', 700); check('flashcards view', /Flashcards/.test(await txt(g, '.page-title')));
  check('an unsafe link in a card loses its href', await g.evaluate(() => [...document.querySelectorAll('a')].every(x => !/^\s*javascript:/i.test(x.getAttribute('href') || ''))));
  await go(g, '#/zzp101/settings', 700); await g.selectOption('#s-variant', '2'); await g.waitForTimeout(200);
  check('section variants move the exam date', await g.evaluate(() => window.Courses.zzp101.EXAMS[0].date === '2026-10-01' && window.Courses.zzp101.CALENDAR.every(e => !e[4] || e[4] === '2')));
  await go(g, '#/zzp101/grades', 700); check('grade calculator rows', (await g.$$('.grade-row')).length === 4);
  await go(g, '#/resources', 800); check('resources list the class links and drop the unsafe one', await g.evaluate(() => { const it = window.MATHUB_RESOURCES.ITEMS.filter(i => i.g === 'zzp101'); return it.length === 2 && it.every(i => !/javascript/i.test(i.u)); }));
  const [cm, m] = await mk(390, 760); for (const h of ['#/zzp101', '#/zzp101/calendar', '#/zzp101/notes/describe']) { await go(m, h, 1200); check(`no sideways scroll on ${h} at 390px`, await hscroll(m)); } await cm.close();

  // ---- the server accepts the new class id ----
  const forum = await api(s, 'forum_posts&course=zzp101'); check('discussions accept the class', forum.ok === true, forum);
  const prof = await api(s, 'profile', { courses: ['zzp101', 'calc'] }); check('a student can add it to their classes', prof.ok !== false && JSON.stringify(prof.user || {}).includes('zzp101'), prof);
  const goal = await api(s, 'class_goal&course=zzp101'); check('class goals accept it', goal.ok === true, goal);
  const ics = await s.evaluate(async () => { const t = await (await fetch('api/index.php?r=ics_token', { headers: { 'X-Requested-With': 'MatHub' }, credentials: 'same-origin' })).json(); return t.token ? (await fetch('api/index.php?r=ics&t=' + t.token)).text() : ''; });
  check('the calendar feed includes its exams', /ZZP 101/.test(ics) && /Exam 1/.test(ics), ics.slice(0, 120));
  await api(s, 'profile', { courses: [] });

  // ---- hide, update, roll back, delete ----
  await go(a, '#/admin/packs', 1000); await a.click('.pk-row[data-id="zzp101"] [data-action="pk-toggle"]'); await a.waitForTimeout(1200);
  check('hiding it marks it hidden', /Hidden/.test(await txt(a, '.pk-row[data-id="zzp101"]')));
  check('students no longer get it', !(await api(g, 'classpack_list')).packs.some(p => p.id === 'zzp101') && (await api(g, 'classpack_get&id=zzp101')).ok === false);
  check('admins still do, marked hidden', (await api(a, 'classpack_list')).packs.some(p => p.id === 'zzp101' && p.hidden));
  await g.reload(); await go(g, '#/', 1200); check('the hidden class leaves a student\'s start page', await g.evaluate(() => !window.Courses.zzp101) && !(await g.$('.course-card.zzp101')));
  await api(a, 'admin_classpack_set', { id: 'zzp101', enabled: true });
  const v2 = JSON.parse(JSON.stringify(pack)); v2.SECTIONS[0].title = 'Data, samples and bias'; v2.QUIZ.questions[0].items.push(['Who answers a voluntary survey?', 'people who choose to respond', ['a random sample', 'everyone', 'nobody'], 'They pick themselves.']);
  const up = await api(a, 'admin_classpack_install', { json: JSON.stringify(v2) });
  check('re-uploading updates it to version 2', up.ok && !up.created && up.pack.version === 2 && up.pack.has_prev, up);
  await g.reload(); await go(g, '#/zzp101/notes/intro', 1500); check('students get the update', /Data, samples and bias/.test(await txt(g, '#view')));
  const rb = await api(a, 'admin_classpack_rollback', { id: 'zzp101' }); check('rollback brings the previous version back', rb.ok && rb.pack.has_prev, rb);
  await g.reload(); await go(g, '#/zzp101/notes/intro', 1500); check('students see the rolled-back text', /Data and sampling/.test(await txt(g, '#view')) && !/Data, samples and bias/.test(await txt(g, '#view')));
  const dl = await a.request.get(base.replace('index.html', '') + 'api/index.php?r=admin_classpack_download&id=zzp101'); check('the admin can download the installed file', dl.status() === 200 && JSON.parse(await dl.text()).id === 'zzp101');
  check('a student cannot download it', (await g.request.get(base.replace('index.html', '') + 'api/index.php?r=admin_classpack_download&id=zzp101')).status() !== 200);
  check('delete needs the course code typed', (await api(a, 'admin_classpack_delete', { id: 'zzp101', confirm: 'nope' })).ok === false);
  a.removeAllListeners('dialog'); a.on('dialog', d => d.accept('ZZP 101'));
  await go(a, '#/admin/packs', 1000); await a.click('.pk-row[data-id="zzp101"] [data-action="pk-delete"]'); await a.waitForTimeout(1200);
  check('the class is removed', !(await a.$('.pk-row[data-id="zzp101"]')) && !(await api(a, 'classpack_list')).packs.some(p => p.id === 'zzp101'));

  // ---- a class with no exams (graded on coursework) ----
  const noEx = JSON.parse(JSON.stringify(pack)); noEx.EXAMS = []; noEx.PRACTICE = {}; noEx.CHECKLISTS = {}; noEx.CALENDAR = noEx.CALENDAR.filter(e => e[1] !== 'exam'); noEx.UNITS.forEach(u => delete u.exam);
  check('a pack without exams passes the checker', P.validate(noEx).errors.length === 0, P.validate(noEx).errors);
  check('and installs', (await api(a, 'admin_classpack_install', { json: JSON.stringify(noEx), publish: true })).ok === true);
  await g.reload(); await g.waitForTimeout(1200); await go(g, '#/zzp101', 1500);
  check('its dashboard explains there are no exams', /Graded on assignments and quizzes/.test(await txt(g, '#view')) && !/Semester complete/.test(await txt(g, '#view')) && /No exams/.test(await txt(g, '#exam-chip')));
  check('the sidebar has no exam prep', !(await g.$('#sidebar-nav .nav-item[data-view="exam"]')));
  await go(g, '#/zzp101/exam', 900); check('the exam page says there are none instead of breaking', /has no exams/.test(await txt(g, '#view')));
  await go(g, '#/', 900); check('its start page card says No exams', /No exams/.test(await txt(g, '.course-card.zzp101')));
  await api(a, 'admin_classpack_delete', { id: 'zzp101', confirm: 'ZZP 101' });

  // ---- clean up ----
  const all = await api(a, 'admin_classreqs&status=all'); for (const gr of (all.groups || []).filter(x => x.code === 'ZZP 101')) for (const q of gr.requests) await api(a, 'admin_classreq_delete', { id: q.id });
  await api(a, 'admin_role', { email: 'alice.a@montana.edu', role: '' });
  fs.rmSync(bad, { force: true });
  await cg.close(); await cs.close(); await ca.close();
  await T.finish();
})();

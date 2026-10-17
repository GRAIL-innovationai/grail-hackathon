/* Mathub Faculty end to end: the "For professors" button opens the workspace (its own frame), an instructor writes a syllabus page by page with the live page beside it (schedule generator, grading, checklist),
   publishes it, and runs the class (announcement, assignment, attendance, insights); a student joins with the code, gets the
   class, sees the hub, does the assignment and checks in; a student who did not join cannot open the class. Also the
   "page not found" view, the public syllabus page, account devices and data export, and no sideways scroll on a phone. */
const T = require('./lib');
(async () => {
  const { mk, go, txt, login, api: rawApi, log, check, hscroll } = await T.start();
  const api = async (...a) => ((await rawApi(...a)).json || {});
  // league and badge celebrations pop up over the page after a login; they are not what this test is about
  const mk2 = async (w, h) => { const [c, p] = await mk(w, h, { serviceWorkers: 'block' }); await c.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.celebrate{display:none!important}'; document.head.appendChild(st); }); }); return [c, p]; };
  const quiet = p => p.evaluate(() => { const s = App.settings(); s.motion = 'off'; s.asof = '2026-10-12'; localStorage.setItem('studyhub-settings', JSON.stringify(s)); });
  const [ca, prof] = await mk2(1360, 900);
  await go(prof, '#/', 900); await quiet(prof); await login(prof, 'admin.user@montana.edu'); await prof.reload(); await prof.waitForTimeout(1200);
  // tidy up classes left by an earlier run of this test
  const mine = await api(prof, 'teach_me'); for (const c of (mine.teaching || []).filter(c => c.code === 'M 171' && c.section === '009')) await api(prof, 'teach_class_delete', { id: c.id, confirm: 'M 171' });

  // the way in: one button on the start page, and the workspace is its own surface
  await go(prof, '#/', 1200);
  check('the start page has a "For professors" button to the faculty workspace', (await prof.getAttribute('.hero-actions .hero-faculty', 'href')) === '#/teach');
  await prof.click('.hero-actions .hero-faculty'); await prof.waitForTimeout(1600);
  const surf = await prof.evaluate(() => ({ s: document.documentElement.dataset.surface, tab: !!document.querySelector('#tabbar') && getComputedStyle(document.querySelector('#tabbar')).display, rail: !!document.querySelector('.fx-rail'), side: getComputedStyle(document.querySelector('.sidebar')).display }));
  check('the workspace has its own frame and none of the student site’s chrome', surf.s === 'faculty' && surf.rail && surf.side === 'none' && (surf.tab === false || surf.tab === 'none'), surf);
  check('it lists your syllabi with a "New syllabus" button', /Your syllabi/.test(await txt(prof, '#tc-body')) && !!(await prof.$('a[href="#/teach/new"]')));
  await go(prof, '#/teach/new', 1200);
  await prof.fill('#tn-code', 'M 171'); await prof.fill('#tn-title', 'Calculus I'); await prof.fill('#tn-section', '009'); await prof.selectOption('#tn-link', 'calc');
  await prof.click('#tc-new button[type=submit]'); await prof.waitForTimeout(1600);
  const id = Number((/#\/teach\/(\d+)/.exec(prof.url()) || [])[1]);
  check('creating a syllabus opens the editor on its first page, with the live page beside it', id > 0 && /\/course$/.test(prof.url()) && !!(await prof.$('#fx-paper .sy-doc')) && !!(await prof.$('.fx-rail [data-mark="people"]')), prof.url());
  await go(prof, `#/teach/${id}/policies`, 1200);
  check('the starter syllabus has the MSU accommodations statement', /Disability Services/.test(await prof.inputValue('[data-k="policies.accommodations"]')));

  // fill the course facts; autosave; the page follows the typing
  await go(prof, `#/teach/${id}/about`, 1200);
  await prof.fill('[data-k="course.description"]', 'Limits, derivatives and their applications, with weekly group work.'); await prof.waitForTimeout(400);
  check('the live page shows what was just typed, marked as the part being edited', /weekly group work/.test(await txt(prof, '#fx-paper')) && /Course description/.test(await txt(prof, '#fx-paper .is-current')));
  await go(prof, `#/teach/${id}/course`, 1200);
  await prof.fill('[data-k="course.meets.0.days"]', 'MWF'); await prof.fill('[data-k="course.meets.0.start"]', '10:00'); await prof.fill('[data-k="course.meets.0.end"]', '10:50'); await prof.fill('[data-k="course.meets.0.room"]', 'Wilson 1-112');
  await go(prof, `#/teach/${id}/people`, 1200);
  await prof.fill('[data-k="people.0.name"]', 'Dr. Ada Lovelace'); await prof.fill('[data-k="people.0.hours"]', 'Tue 2–3 pm, Wilson 2-240');
  await go(prof, `#/teach/${id}/policies`, 1200);
  await prof.selectOption('#tc-ai', 'none'); await prof.waitForTimeout(1800);
  check('changes save on their own', /All changes saved/.test(await txt(prof, '#tc-save')), await txt(prof, '#tc-save'));
  check('choosing an AI policy fills in its wording', /may not be used/.test(await prof.inputValue('#tc-ai-text')));
  await go(prof, `#/teach/${id}`, 1400); const lint1 = await txt(prof, '#fx-checklist');
  check('the checklist no longer asks for office hours or meeting times', !/office hours/i.test(lint1) && !/when and where/i.test(lint1), lint1);

  // schedule: generator, topics; exams
  await go(prof, `#/teach/${id}/schedule`, 1400);
  await prof.click('[data-action="gen"]'); await prof.waitForTimeout(500);
  const rows = await prof.$$eval('.fx-row.fx-srow', r => r.length); const sched = await prof.$$eval('.fx-row.fx-srow input[data-k$=".title"]', xs => xs.map(x => x.value));
  check('"Fill in class meetings" adds every MWF meeting of the term', rows >= 40 && rows <= 48, rows);
  check('it marks Labor Day and Thanksgiving week as no class', sched.includes('Labor Day') && sched.filter(t => /Thanksgiving/.test(t)).length >= 2, sched.filter(Boolean).slice(0, 6));
  await prof.click('[data-action="topics"]'); await prof.waitForTimeout(200); await prof.fill('#tp-list', 'Velocity and limits\nComputing limits\nContinuity\nThe derivative'); await prof.click('[data-action="fill"]'); await prof.waitForTimeout(400);
  check('pasted topics fill the first meetings', (await prof.$$eval('.fx-row.fx-srow input[data-k$=".title"]', xs => xs.map(x => x.value))).slice(0, 4).join('|') === 'Velocity and limits|Computing limits|Continuity|The derivative');
  await go(prof, `#/teach/${id}/exams`, 1200);
  await prof.click('[data-path="exams"][data-act="add"]'); await prof.waitForTimeout(250);
  await prof.fill('[data-k="exams.0.name"]', 'Midterm 1'); await prof.fill('[data-k="exams.0.date"]', '2026-10-21'); await prof.fill('[data-k="exams.0.time"]', '18:00'); await prof.fill('[data-k="exams.0.place"]', 'Reid 108');
  await prof.waitForTimeout(1500);

  // grading: the sum indicator
  await go(prof, `#/teach/${id}/grading`, 1200);
  check('grading starts at 100%', /Total 100%/.test(await txt(prof, '#tc-sum')));
  await prof.fill('[data-k="grading.categories.0.weight"]', '25'); await prof.waitForTimeout(300);
  check('a wrong total is flagged right away', /Total 105%/.test(await txt(prof, '#tc-sum')) && await prof.$eval('#tc-sum', e => e.classList.contains('bad')));
  check('the rail marks the grading page as having something to fix', await prof.evaluate(() => new Promise(r => setTimeout(() => r(!!document.querySelector('[data-mark="grading"] .fx-mark.err')), 1600))));
  await prof.fill('[data-k="grading.categories.0.weight"]', '20'); await prof.waitForTimeout(1500);

  // publish
  await prof.click('#fx-publish'); await prof.waitForTimeout(400); await prof.click('.fx-dlg [data-go]'); await prof.waitForTimeout(2200);
  check('publishing marks the class published', /Published/.test(await txt(prof, '#fx-rail-status')) && await prof.$eval('#fx-publish', b => b.disabled), await txt(prof, '#fx-rail-status'));
  const cls = (await api(prof, 'teach_class_get&id=' + id)).class; const code = cls.join_code; const pid = cls.pack_id;
  log('class:', { id, code, pid });
  await go(prof, `#/teach/${id}/students`, 1200);
  check('the Students page shows the join code', (await txt(prof, '.fx-code.big')) === code);
  await go(prof, '#/', 1800);
  const sep = await prof.evaluate(pid => ({ order: App.COURSE_ORDER.includes(pid), mine: App.myCourses().includes(pid), open: !!window.Courses[pid], preview: !!(window.Courses[pid] || {}).preview, surface: document.documentElement.dataset.surface || '' }), pid);
  check('the published class stays out of the instructor’s own classes, and the student site is back to normal', !sep.order && !sep.mine && sep.open && sep.preview && sep.surface === '', sep);
  await go(prof, `#/${pid}`, 2200); check('opening it as a student shows a preview strip back to Mathub Faculty', /Preview/.test(await txt(prof, '.tc-strip')) && (await prof.getAttribute('.tc-strip', 'href')) === `#/teach/${id}`);

  // a student joins
  const [cb, stu] = await mk2(1360, 900);
  await go(stu, '#/', 900); await quiet(stu); await login(stu, 'alice.a@montana.edu'); await stu.reload(); await stu.waitForTimeout(1200);
  await api(stu, 'teach_leave', { id });
  await go(stu, '#/class/join/' + code, 1500);
  check('the join page names the class and says what the instructor will see', /Calculus I/.test(await txt(stu, '#tc-body')) && /What your instructor sees/.test(await txt(stu, '#tc-body')));
  await stu.click('[data-action="join"]'); await stu.waitForTimeout(2200);
  check('joining opens the class hub', new RegExp('#/class/' + id + '$').test(stu.url()) && /Assignments/.test(await txt(stu, '#tc-body')), stu.url());
  check('the hub links to the class pages', (await stu.$$('.tc-quick')).length >= 4);
  await go(stu, `#/${pid}/course`, 2200);
  const sy = await txt(stu, '#view');
  check('the class opens for her with the syllabus panels', /Dr\. Ada Lovelace/.test(sy) && /Accommodations/.test(sy) && /AI tools/.test(sy), sy.slice(0, 200));
  await go(stu, `#/${pid}/calendar`, 1600); check('the class calendar has the midterm', /Midterm 1/.test(await txt(stu, '#view')));
  await go(stu, `#/${pid}/grades`, 1400); check('the grade calculator uses the instructor’s categories', (await stu.$$('.grade-row')).length === 4);
  await go(stu, `#/${pid}`, 1800); check('the class dashboard links to the class hub', !!(await stu.$('.tc-strip')));

  // announcement → inbox and hub
  await go(prof, `#/teach/${id}/announce`, 1200);
  await prof.fill('#ta-title', 'Office hours moved'); await prof.fill('#ta-body', 'This week only: Thursday 3 pm.'); await prof.click('#tc-post button[type=submit]'); await prof.waitForTimeout(1200);
  const notes = await api(stu, 'notif_list'); check('the student gets the announcement in her inbox', (notes.notifications || []).some(n => n.kind === 'class' && n.title === 'Office hours moved'));

  // assignment → student does it → instructor sees the result
  await go(prof, `#/teach/${id}/assign`, 1600); await prof.waitForTimeout(1200);
  await prof.fill('#as-title', 'Limits warm-up'); const boxes = await prof.$$('#as-topics input[type=checkbox]'); check('the assignment form lists the calc topics', boxes.length > 10, boxes.length);
  await boxes[0].check(); await boxes[1].check(); await prof.fill('#as-count', '3'); await prof.click('#tc-asg button[type=submit]'); await prof.waitForTimeout(1500);
  check('the assignment is listed', /Limits warm-up/.test(await txt(prof, '#fx-pane')));
  await go(stu, `#/class/${id}`, 1500);
  check('the hub shows the announcement and the assignment', /Office hours moved/.test(await txt(stu, '#tc-body')) && /Limits warm-up/.test(await txt(stu, '#tc-body')));
  await stu.click('[data-action="start"]'); await stu.waitForTimeout(2600);
  check('starting it opens the timed set in the calc quizzer', /#\/calc\/practice/.test(stu.url()) && !!(await stu.$('#view [data-action="submit"]')), stu.url());
  await stu.click('#view [data-action="submit"]'); await stu.waitForTimeout(1500);
  const asg = (await api(prof, 'teach_hub&id=' + id)).assignments.find(a => a.title === 'Limits warm-up');
  const res = await api(prof, 'teach_results&assignment_id=' + asg.id);
  check('the instructor sees her attempt', res.students.some(s => s.done && s.total === 3), res.students);

  // attendance
  await go(prof, `#/teach/${id}/attendance`, 1200); await prof.click('[data-action="open"]'); await prof.waitForTimeout(1200);
  const acode = await txt(prof, '.fx-code.huge'); check('opening check-in shows a 4-digit code', /^\d{4}$/.test(acode), acode);
  await go(stu, `#/class/${id}`, 1500); await stu.fill('#ci-code', acode); await stu.click('#tc-checkin button[type=submit]'); await stu.waitForTimeout(1500);
  check('the student checks in', /You checked in/.test(await txt(stu, '#tc-body')));
  await go(prof, `#/teach/${id}/insights`, 1500); const ins = await prof.$$eval('.fx-stat', xs => Object.fromEntries(xs.map(x => [x.querySelector('dt').textContent, x.querySelector('dd').textContent])));
  check('insights count her, the assignment and attendance', ins.Students === '1' && ins.Attendance === '100%', ins);
  await go(prof, `#/teach/${id}/students`, 1500); check('the roster lists her with her check-in', /alice\.a@montana\.edu/.test(await txt(prof, '#fx-tool table')) && /1\/1/.test(await txt(prof, '#fx-tool table')));

  // a student who did not join
  const [cc, out] = await mk2(1360, 900);
  await go(out, '#/', 900); await quiet(out); await login(out, 'bob.bmu6j92pq@montana.edu'); await out.reload(); await out.waitForTimeout(1500);
  const list = await api(out, 'classpack_list'); check('another student does not get the class', !list.packs.some(p => p.id === pid));
  await go(out, '#/' + pid, 1500); check('opening its address says it is not open to them', /not open to you/.test(await txt(out, '#view')), await txt(out, '#view'));
  await go(out, '#/syllabus/' + code, 1500); check('the public syllabus page shows the published syllabus', /Dr\. Ada Lovelace/.test(await txt(out, '#sy-body')) && /Midterm 1/.test(await txt(out, '#sy-body')));
  await go(out, '#/no-such-page', 900); check('an unknown address shows "Page not found"', /Page not found/.test(await txt(out, '#view')));
  // anyone signed in can write a syllabus; publishing and class tools wait for confirmed faculty status
  await go(out, '#/teach', 1500); check('someone without faculty status is told how to get it', /Confirm faculty status/.test(await txt(out, '#tc-body')));
  await go(out, '#/teach/verify', 1200); check('the faculty status page has the request form', !!(await out.$('#tc-req')));
  const draft = await api(out, 'teach_class_create', { code: 'BIOB 160', title: 'Draft only', section: '901', term: 'Fall 2026' }); check('they can still start a syllabus', draft.ok && draft.id > 0, draft);
  await go(out, `#/teach/${draft.id}/course`, 1500); check('and write it, with the live page', !!(await out.$('#fx-paper .sy-doc')));
  await out.click('#fx-publish'); await out.waitForTimeout(500); check('publishing asks them to confirm faculty status first', /Confirm your faculty status first/.test(await txt(out, '.fx-dlg'))); await out.keyboard.press('Escape');
  await go(out, `#/teach/${draft.id}/students`, 1200); check('class tools are locked until then', /turn on once your faculty status is confirmed/.test(await txt(out, '#fx-tool')));
  const pubTry = await rawApi(out, 'teach_class_publish', { id: draft.id }); check('the server refuses to publish it', pubTry.status === 403, pubTry.status);
  await api(out, 'teach_class_delete', { id: draft.id, confirm: 'BIOB 160' });

  // account: devices and data export
  await go(stu, '#/settings', 1800);
  check('settings list her signed-in devices', /this device/.test(await txt(stu, '#acct-devices')));
  check('settings offer "Download my data"', !!(await stu.$('[data-action="data-export"]')));
  const exp = await stu.evaluate(async () => { const r = await fetch('api/index.php?r=data_export', { credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub' } }); return { cd: r.headers.get('content-disposition'), j: await r.json() }; });
  check('the export is a download with her class membership and no password hash', /attachment; filename="mathub-data-/.test(exp.cd || '') && exp.j.tables && exp.j.tables.teach_members && !JSON.stringify(exp.j).includes('pass_hash'));

  // phone width
  const [cm, m] = await mk2(390, 844);
  await go(m, '#/', 800); await quiet(m); await login(m, 'admin.user@montana.edu'); await m.reload(); await m.waitForTimeout(1000);
  for (const h of [`#/teach/${id}/course`, `#/teach/${id}/schedule`, `#/teach/${id}/grading`, `#/teach/${id}/insights`, '#/teach', '#/syllabus/' + code]) { await go(m, h, 1500); check(`no sideways scroll on ${h.replace(/\d+/, 'ID').replace(code, 'CODE')} at 390px`, await hscroll(m)); }
  await go(m, `#/teach/${id}/course`, 1200); await m.click('.fx-menu'); await m.waitForTimeout(400); check('on a phone the rail opens from the menu button', await m.$eval('.fx', e => e.classList.contains('rail-open')) && await m.$eval('.fx-rail', e => e.getBoundingClientRect().left >= -1));

  // clean up: the class and its pack go away; accounts stay
  const del = await api(prof, 'teach_class_delete', { id, confirm: 'M 171' }); check('the instructor can delete the class', del.ok);
  await Promise.all([ca.close(), cb.close(), cc.close(), cm.close()]);
  await T.finish();
})();

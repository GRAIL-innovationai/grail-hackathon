/* Request a class, for professors and TAs: guests and students do not see the links and are
   pointed to Create a class instead (and the server refuses them); with a TA or Instructor role:
   the links that lead to it, the form's checks, uploads with and without a syllabus, "me too"
   from a second staff member, withdrawing, the admin tab with private file downloads and status
   changes, and the inbox message that reaches everyone who asked. Uses ZZT course codes and
   removes them, and the test roles, at the end. */
const T = require('./lib');
const fs = require('fs'); const path = require('path'); const os = require('os');
(async () => {
  const { base, mk, txt, login, api: raw, hscroll, go: open, log, check } = await T.start();
  const api = async (...a) => ((await raw(...a)).json || {});
  const go = async (p, hash, wait) => { await open(p, hash, wait); await p.evaluate(() => document.querySelectorAll('.celebrate').forEach(e => e.remove())); };
  const n = 100 + Math.floor(Math.random() * 900); const CODE = `ZZT ${n}`, CODE2 = `ZZT ${n === 999 ? 998 : n + 1}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-req-')); const pdf = path.join(dir, 'syllabus.pdf'), fake = path.join(dir, 'notes.pdf');
  fs.writeFileSync(pdf, '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n'); fs.writeFileSync(fake, 'this is not a pdf');

  // ---- the admin makes alice a TA and mod.user an instructor, for this test ----
  const [ca, a] = await mk(1360, 1000); await go(a, '#/'); await login(a, 'admin.user@montana.edu'); await a.reload(); await a.waitForTimeout(1000);
  if (await a.$('.celebrate')) { await a.keyboard.press('Escape'); await a.waitForTimeout(200); }
  const roles = async on => { await api(a, 'admin_role', { email: 'alice.a@montana.edu', role: on ? 'TA' : '' }); await api(a, 'admin_role', { email: 'mod.user@montana.edu', role: on ? 'Instructor' : '' }); };
  await roles(false);

  // ---- guests and students: no request links, a way to make the class instead ----
  const [cg, g] = await mk(); await go(g, '#/', 800);
  check('a guest\'s start page has no request link', !(await g.$('.rq-under a[href="#/request"]')));
  await go(g, '#/request', 900);
  check('#/request tells guests requests are for professors and TAs, with Create a class', /for professors and TAs/.test(await txt(g, '.rq-staff')) && !!(await g.$('.rq-staff a[href="#/create"]')) && !(await g.$('#rq-form')));
  check('most requested list loads for guests', (await txt(g, '#rq-top')).length > 5 && !/Loading/.test(await txt(g, '#rq-top')));
  await cg.close();
  const [cb, b] = await mk(); await go(b, '#/'); await login(b, 'bob.bmu6j92pq@montana.edu'); await b.reload(); await b.waitForTimeout(1000);
  check('a student\'s start page has no request link', !(await b.$('.rq-under a[href="#/request"]')) && (await b.evaluate(() => App.auth.user.can_request)) === false);
  await go(b, '#/request', 900);
  check('a student sees Create a class instead of the form', !!(await b.$('.rq-staff a[href="#/create"]')) && !(await b.$('#rq-form')));
  const refused = await raw(b, 'classreq_create', { code: 'ZZT 555' });
  check('and the server refuses a student\'s request', refused.status === 403 && refused.json.staff_only === true, refused);
  await b.keyboard.press('Control+k'); await b.waitForTimeout(300);
  if (await b.$('#search-input')) { await b.fill('#search-input', 'ZZT 777'); await b.waitForTimeout(300); check('search offers a student to make an unknown class from its syllabus', /Make ZZT 777 from its syllabus/.test(await txt(b, '#search-results')) && !/Request ZZT 777/.test(await txt(b, '#search-results'))); await b.keyboard.press('Escape'); }
  await cb.close();
  await roles(true);

  const [cm, m] = await mk(390, 760); await go(m, '#/request', 900); check('no sideways scroll at 390px', await hscroll(m)); await cm.close();

  // ---- a TA sends requests ----
  const [c, p] = await mk(1360, 1000); await go(p, '#/'); await login(p, 'alice.a@montana.edu'); await p.reload(); await p.waitForTimeout(1000);
  check('a TA\'s start page links to the request page', !!(await p.$('.rq-under a[href="#/request"]')) && (await p.evaluate(() => App.auth.user.can_request)) === true);
  await p.click('.rq-under a[href="#/request"]'); await p.waitForTimeout(700);
  check('the link opens #/request with the form', p.url().endsWith('#/request') && /Request a class/.test(await txt(p, 'h1')) && !!(await p.$('#rq-form')));
  await go(p, '#/request', 900);
  await p.click('#rq-send'); await p.waitForTimeout(200);
  check('an empty code is caught before sending', /course code/i.test(await txt(p, '#rq-msg')));
  await p.fill('#rq-code', 'm 171q'); await p.waitForTimeout(100);
  check('a class already on Mathub is pointed to', /already on Mathub/.test(await txt(p, '#rq-code-help')) && !!(await p.$('#rq-code-help a[href="#/calc"]')));
  await p.fill('#rq-code', 'zzt' + n); await p.waitForTimeout(100);
  check('the code is normalised as you type', (await txt(p, '#rq-code-help')).includes(CODE));
  await p.setInputFiles('#rq-file', fake); await p.waitForTimeout(150);
  check('attaching a file asks for consent', await p.isVisible('#rq-consent-row'));
  await p.click('#rq-send'); await p.waitForTimeout(250);
  check('consent is required with a syllabus', /tick the box/.test(await txt(p, '#rq-msg')));
  await p.check('#rq-consent'); await p.click('#rq-send'); await p.waitForTimeout(700);
  check('the server rejects a file that is not really a PDF', /PDF or a Word/.test(await txt(p, '#rq-msg')));
  await p.setInputFiles('#rq-file', pdf); await p.fill('#rq-title', 'Test Chemistry'); await p.fill('#rq-note', 'Section 002 please'); await p.check('#rq-consent');
  await p.click('#rq-send'); await p.waitForTimeout(900);
  const mine = await txt(p, '#rq-mine');
  check('the request is sent and listed', mine.includes(CODE) && mine.includes('syllabus.pdf') && /Requested/.test(mine), mine.slice(0, 120));
  check('the form resets after sending', (await p.inputValue('#rq-code')) === '' && !(await p.isVisible('#rq-consent-row')));
  await p.fill('#rq-code', CODE); await p.click('#rq-send'); await p.waitForTimeout(600);
  check('asking twice for the same class is refused', /already asked/.test(await txt(p, '#rq-msg')));
  // a pasted-text request for a second class, then withdraw it
  await p.fill('#rq-code', CODE2); await p.click('[data-action="rq-paste"]'); await p.fill('#rq-text', 'Week 1: intro. Exam 1 Oct 1. Grading: exams 60%.'); await p.check('#rq-consent');
  await p.click('#rq-send'); await p.waitForTimeout(800);
  check('a pasted syllabus works too', (await txt(p, '#rq-mine')).includes('pasted syllabus'));
  const mineApi = await api(p, 'classreq_mine'); const second = mineApi.items.find(x => x.code === CODE2);
  await p.click(`[data-action="rq-withdraw"][data-id="${second.id}"]`); await p.waitForTimeout(700);
  check('withdrawing removes the request', !(await txt(p, '#rq-mine')).includes(CODE2));

  // ---- a second staff member adds their voice ----
  const [c2, s] = await mk(); await go(s, '#/'); await login(s, 'mod.user@montana.edu'); await s.reload(); await s.waitForTimeout(800);
  await go(s, '#/request', 900);
  const metoo = await s.$(`[data-action="rq-metoo"][data-code="${CODE}"]`); check('other staff see a Me too button', !!metoo);
  if (metoo) { await metoo.click(); await s.waitForTimeout(800); }
  check('Me too counts a second student', /2 students/.test(await txt(s, '#rq-top')) && (await txt(s, '#rq-mine')).includes(CODE));
  check('staff who are not administrators cannot open the admin routes', (await api(s, 'admin_classreqs')).ok === false);
  await c2.close();

  // ---- search offers a request for an unknown code ----
  await p.keyboard.press('Control+k'); await p.waitForTimeout(300);
  if (await p.$('#search-input')) { await p.fill('#search-input', 'ZZT 777'); await p.waitForTimeout(300); check('search offers to request an unknown class', /Request ZZT 777/.test(await txt(p, '#search-results'))); await p.keyboard.press('Escape'); }

  // ---- the admin sees the group, downloads the file and updates the status ----
  await go(a, '#/admin/classes', 1200);
  const grp = await txt(a, `.cr-group[data-code="${CODE}"]`);
  check('admin tab groups the requests by class', /2 students/.test(grp) && /1 syllabus/.test(grp) && grp.includes('alice.a@montana.edu'), grp.slice(0, 160));
  const href = await a.$eval(`.cr-group[data-code="${CODE}"] a[download]`, el => el.getAttribute('href')).catch(() => '');
  const dl = href ? await a.request.get(base.replace('index.html', '') + href) : null;
  check('admin downloads the original file', !!dl && dl.status() === 200 && (await dl.body()).toString().startsWith('%PDF-') && /attachment/.test(dl.headers()['content-disposition'] || ''));
  const asStudent = href ? await p.request.get(base.replace('index.html', '') + href) : null;
  check('students cannot download syllabus files', !!asStudent && asStudent.status() === 403);
  check('alerts reach the admin inbox', (await api(a, 'notif_list')).notifications.some(x => x.kind === 'classreq_admin' && x.title.startsWith(CODE)));
  a.removeAllListeners('dialog'); a.on('dialog', d => d.accept('Thanks, building it now.'));
  await a.click(`.cr-group[data-code="${CODE}"] [data-action="cr-set"][data-st="working"]`); await a.waitForTimeout(900);
  check('marking it as being built', /Being built/.test(await txt(a, `.cr-group[data-code="${CODE}"]`)));
  const added = await api(a, 'admin_classreq_update', { code: CODE, status: 'added', note: '', course_id: 'calc' });
  check('marking it added notifies both students', added.ok && added.notified === 2, added);

  // ---- the student hears back ----
  const inbox = await api(p, 'notif_list'); const msg = inbox.notifications.find(x => x.kind === 'classreq' && x.title === CODE);
  check('the student gets the update in the inbox', !!msg && msg.link === '#/calc' && /on Mathub/.test(msg.snippet), msg);
  await go(p, '#/', 500); await go(p, '#/request', 900);
  check('the request shows as added with an Open button', /On Mathub/.test(await txt(p, '#rq-mine')) && !!(await p.$('#rq-mine a[href="#/calc"]')));

  // ---- clean up the test classes ----
  const all = await api(a, 'admin_classreqs&status=all'); let removed = 0;
  for (const gr of all.groups.filter(x => x.code.startsWith('ZZT '))) for (const q of gr.requests) { const r = await api(a, 'admin_classreq_delete', { id: q.id }); if (r.ok) removed++; }
  if (second && (await api(a, 'admin_classreq_delete', { id: second.id })).ok) removed++;   // the withdrawn one is not listed, so remove it by id
  check('test requests cleaned up', removed >= 2, removed);
  await roles(false);
  await ca.close(); await c.close(); fs.rmSync(dir, { recursive: true, force: true });
  await T.finish();
})();

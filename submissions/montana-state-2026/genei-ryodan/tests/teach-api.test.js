/* The #/teach server API on its own: who may do what (students, instructors, non-members), what is stored as plain text,
   how a syllabus becomes a class pack, and that deleting a class removes its pack but never an account. Also the account
   self-service routes added with it (devices, data export) and browser error reports. Plain HTTP, no browser pages. */
const T = require('./lib');
const BASE = T.base.replace(/index\.html.*$/, '') + 'api/index.php?r=';
const jar = {};
async function call(who, route, body, method) {
  const headers = { 'X-Requested-With': 'MatHub', 'Content-Type': 'application/json' }; if (jar[who]) headers.Cookie = jar[who];
  const r = await fetch(BASE + route, { method: method || (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) { const m = /mathub_session=([^;]*)/.exec(sc); if (m) jar[who] = 'mathub_session=' + m[1]; }
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = { raw: t.slice(0, 200) }; } j.status = r.status; return j;
}
let check; const ok = (label, cond, extra) => check(label, !!cond, cond ? undefined : JSON.stringify(extra === undefined ? null : extra).slice(0, 300));
(async () => {
  ({ check } = await T.start());
  for (const [who, email] of [['admin', 'admin.user@montana.edu'], ['alice', 'alice.a@montana.edu'], ['bob', 'bob.bmu6j92pq@montana.edu']]) { const r = await call(who, 'login', { email, password: 'password123' }); ok(`${who} logs in`, r.ok, r); }
  let r = await call('admin', 'teach_me'); for (const c of (r.teaching || []).filter(c => c.code === 'M 171' && c.title === 'Calculus I' && !c.section)) await call('admin', 'teach_class_delete', { id: c.id, confirm: 'M 171' });
  r = await call('admin', 'teach_me'); ok('admin is an instructor', r.ok && r.instructor === true, r);
  r = await call('alice', 'teach_me'); ok('alice is not an instructor', r.ok && r.instructor === false, r);
  // anyone signed in can write a syllabus; only a confirmed instructor's class can reach students
  r = await call('alice', 'teach_class_create', { code: 'M 171', title: 'Draft', section: '950' }); ok('without faculty status she can still start a syllabus', r.ok && r.id > 0, r); const draft = r.id;
  r = await call('alice', 'teach_class_get&id=' + draft); ok('it opens for her, marked as not confirmed', r.ok && r.class.verified === false && r.me_instructor === false && Array.isArray(r.lint) && r.lint.every(x => typeof x[2] === 'string'), r);
  r = await call('alice', 'teach_class_publish', { id: draft }); ok('publishing it is refused until her faculty status is confirmed', r.status === 403 && r.verify === true, r);
  r = await call('alice', 'teach_roster&id=' + draft); ok('class tools are refused too', r.status === 403, r);
  r = await call('alice', 'teach_class_get&id=' + draft); const dcode = r.class.join_code;
  r = await call('bob', 'teach_join', { code: dcode }); ok('nobody can join a class whose owner is not confirmed', r.status === 403, r);
  r = await call('bob', 'teach_class_get&id=' + draft); ok('another student cannot open her draft', r.status === 403, r);
  r = await call('alice', 'teach_class_delete', { id: draft, confirm: 'M 171' }); ok('she can delete her draft', r.ok, r);
  r = await call('admin', 'teach_class_create', { code: 'm171', title: 'Calculus I', term: 'Fall 2026', section: '003', link_course: 'calc' }); ok('admin creates a class', r.ok && r.id > 0, r); const id = r.id;
  r = await call('admin', 'teach_class_get&id=' + id); ok('the draft has the starter syllabus and lint', r.ok && r.syllabus.policies.accommodations.length > 50 && r.lint.length > 0 && r.class.join_code.length === 6, r); const code = r.class.join_code; const syl = r.syllabus;
  { const bad = JSON.parse(JSON.stringify(r.syllabus)); bad.grading.categories[0].weight = 10; await call('admin', 'teach_class_save', { id, syllabus: bad }); }
  r = await call('admin', 'teach_class_publish', { id }); ok('publishing with grading weights that do not add to 100 is refused with reasons', r.status === 400 && Array.isArray(r.problems) && /100%/.test(r.problems.join(' ')), r);
  syl.course.description = 'Limits, derivatives and their uses. <script>alert(1)</script>'; syl.course.outcomes = ['Compute derivatives', 'Model rates of change'];
  syl.course.meets = [{ days: 'MWF', start: '10:00', end: '10:50', room: 'Wilson 1-112', kind: 'Lecture' }];
  syl.people[0].name = 'Dr. Ada Lovelace'; syl.people[0].hours = 'Tue 2:00–3:00, Wilson 2-240';
  syl.materials = [{ title: 'Active Calculus', url: 'https://activecalculus.org/single/', required: true, note: 'free' }, { title: 'Bad link', url: 'javascript:alert(1)', required: false }];
  syl.exams = [{ name: 'Midterm 1', date: '2026-09-30', time: '18:00', place: 'Reid 108', covers: 'Chapters 1–2' }, { name: 'Final exam', date: '2026-12-15', time: '08:00', place: 'TBA', covers: 'Everything' }];
  syl.schedule = { start: '2026-08-24', end: '2026-12-11', rows: [ { date: '2026-08-24', type: 'lecture', title: 'Velocity and limits', notes: 'Read 1.1' }, { date: '2026-08-26', type: 'lecture', title: 'Limits', notes: '' }, { date: '2026-08-28', type: 'due', title: 'WeBWorK 1', notes: '' }, { date: '2026-09-07', type: 'holiday', title: 'Labor Day', notes: '' }, { date: '2026-09-09', type: 'lecture', title: 'The derivative', notes: 'Read 1.3' }, { date: '2026-09-30', type: 'exam', title: 'Midterm 1', notes: '' }, { date: '2026-10-05', type: 'lecture', title: 'Product rule', notes: '' } ] };
  r = await call('admin', 'teach_class_save', { id, syllabus: syl }); ok('saving a complete syllabus leaves no errors', r.ok && !r.lint.some(x => x[0] === 'error'), r);
  r = await call('admin', 'teach_class_get&id=' + id); ok('saved text is plain (tags stripped) and bad links dropped', r.ok && !/<script/.test(r.syllabus.course.description) && r.syllabus.materials[1].url === '', r.syllabus && r.syllabus.course);
  r = await call('admin', 'teach_class_publish', { id }); ok('publishing builds a class pack', r.ok && /^m171[b-z]?$|^tc\d{4}$/.test(r.pack_id), r); const pid = r.pack_id;
  r = await call('admin', 'me'); ok('the class does not join the instructor’s own classes', r.ok && !(r.user.courses || []).includes(pid), r.user && r.user.courses);
  r = await call('admin', 'classpack_list'); ok('the instructor gets it only as a preview', r.ok && r.packs.some(p => p.id === pid && p.preview === true), r.packs && r.packs.filter(p => p.id === pid));
  r = await call('admin', 'classpack_get&id=' + pid); const P = r.pack; ok('the pack has weeks, units, exams, calendar and syllabus panels', r.ok && P.SECTIONS.length >= 4 && P.UNITS.length >= 2 && P.EXAMS.length === 2 && P.CALENDAR.some(e => e[2] === 'Due: WeBWorK 1') && P.INFO.some(p => p.title === 'Grading') && P.INFO.some(p => p.title === 'Accommodations'), r.pack && { s: P.SECTIONS.length, u: P.UNITS, e: P.EXAMS });
  ok('the pack escapes instructor text', !JSON.stringify(P).includes('<script'), null);
  r = await call('bob', 'classpack_list'); ok('a non-member does not see the class in the list', r.ok && !r.packs.some(p => p.id === pid), r.packs && r.packs.map(p => p.id));
  r = await call('bob', 'classpack_get&id=' + pid); ok('a non-member cannot open the class', r.status === 403, r);
  r = await call('alice', 'teach_join_info&code=' + code); ok('the public join card shows the published syllabus', r.ok && r.class.title === 'Calculus I' && r.class.syllabus && r.class.join_code === code && r.class.access === '', r);
  r = await call('alice', 'teach_join', { code: 'ZZZZZZ' }); ok('a wrong code is refused', r.status === 404, r);
  r = await call('alice', 'teach_join', { code }); ok('alice joins with the code', r.ok && r.pack_id === pid, r);
  r = await call('alice', 'classpack_list'); ok('after joining, the class is in her list as a normal class', r.ok && r.packs.some(p => p.id === pid && !p.preview), r.packs && r.packs.map(p => p.id));
  r = await call('alice', 'me'); ok('the class is added to her classes', r.ok && (r.user.courses || []).includes(pid), r.user && r.user.courses);
  r = await call('alice', 'teach_roster&id=' + id); ok('a student cannot see the roster', r.status === 403, r);
  r = await call('alice', 'teach_post', { id, title: 'hi' }); ok('a student cannot post announcements', r.status === 403, r);
  r = await call('admin', 'teach_post', { id, title: 'Welcome to M 171', body: 'Office hours moved to Wilson 2-240.', pinned: true }); ok('the instructor posts an announcement to 1 student', r.ok && r.told === 1, r);
  r = await call('alice', 'notif_list'); ok('alice gets an inbox notification linking to the hub', r.ok && r.notifications.some(n => n.kind === 'class' && n.link === '#/class/' + id), r.notifications && r.notifications.slice(0, 2));
  r = await call('admin', 'teach_assignment_save', { id, title: 'Limits practice', course: 'calc', topics: ['limit-forms', 'aroc'], count: 6, due: '2026-10-20T23:59' }); ok('the instructor assigns practice', r.ok && r.id > 0, r); const aid = r.id;
  r = await call('alice', 'teach_hub&id=' + id); ok('the hub shows the announcement, the assignment and no roster', r.ok && r.posts.length === 1 && r.assignments.length === 1 && r.assignments[0].mine === null && r.staff === false && r.assignments[0].submitted === undefined, r);
  r = await call('alice', 'teach_submit', { assignment_id: aid, score: 9, topics: { 'limit-forms': [3, 3], aroc: [1, 3] } }); ok('alice submits; the score is capped at the question count', r.ok, r);
  r = await call('admin', 'teach_results&assignment_id=' + aid); ok('the instructor sees her result and the weak topic', r.ok && r.students[0].best === 6 && r.topics[0].topic === 'aroc', r);
  r = await call('bob', 'teach_submit', { assignment_id: aid, score: 3 }); ok('a non-member cannot submit', r.status === 403, r);
  r = await call('admin', 'teach_att_open', { id, minutes: 5 }); ok('the instructor opens check-in', r.ok && /^\d{4}$/.test(r.session.code), r); const acode = r.session.code;
  r = await call('alice', 'teach_checkin', { id, code: acode === '0000' ? '1111' : '0000' }); ok('a wrong check-in code is refused', r.status === 400, r);
  r = await call('alice', 'teach_checkin', { id, code: acode }); ok('alice checks in', r.ok, r);
  r = await call('admin', 'teach_insights&id=' + id); ok('insights count the student, the assignment and the check-in', r.ok && r.students === 1 && r.assignments[0].done === 1 && r.attendance[0].n === 1, r);
  r = await call('admin', 'teach_roster&id=' + id); ok('the roster shows her work and check-ins', r.ok && r.members.length === 1 && r.members[0].done === 1 && r.members[0].checkins === 1, r);
  r = await call('alice', 'data_export'); ok('her data export includes her class membership and results, no secrets', r.ok !== false && r.tables && r.tables.teach_members && r.tables.teach_submissions && !JSON.stringify(r).includes('pass_hash'), r && Object.keys(r.tables || {}));
  r = await call('alice', 'ann_post', { course: 'calc', text: 'hello all' }); ok('a student cannot post site announcements', r.status === 403, r);
  r = await call('alice', 'sessions'); ok('she sees her signed-in devices', r.ok && r.devices.some(d => d.current), r);
  r = await call('alice', 'client_error', { message: 'TypeError: x is undefined', source: 'http://127.0.0.1:8766/assets/app.js?v=1', line: 12, stack: 'at f (http://127.0.0.1:8766/assets/app.js:12:3)', view: '#/calc/notes?asof=2026-01-01', build: '2026.10.11.1' }); ok('a browser error is recorded', r.ok, r);
  r = await call('admin', 'admin_errors'); const e0 = (r.items || []).find(x => x.message === 'TypeError: x is undefined'); ok('admins see it, without the host or query', r.ok && e0 && e0.source === '/assets/app.js' && e0.view === '#/calc/notes' && !e0.stack.includes('127.0.0.1'), e0);
  await call('admin', 'admin_errors', { sig: e0 ? e0.sig : '' });
  r = await call('alice', 'teach_class_delete', { id, confirm: 'M 171' }); ok('a student cannot delete the class', r.status === 403, r);
  r = await call('admin', 'teach_class_delete', { id, confirm: 'nope' }); ok('delete needs the course code typed', r.status === 400, r);
  r = await call('admin', 'teach_class_delete', { id, confirm: 'M 171' }); ok('the owner deletes the class', r.ok, r);
  r = await call('admin', 'classpack_get&id=' + pid); ok('its class pack is gone too', r.status === 404, r);
  r = await call('alice', 'me'); ok('alice\'s account is untouched', r.ok && r.user && r.user.email === 'alice.a@montana.edu', r);
  await T.finish();
})();

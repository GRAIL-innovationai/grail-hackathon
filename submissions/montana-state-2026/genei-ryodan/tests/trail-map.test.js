/* The trail map, Big Sky look (2026.10.02.3): the default look's faces and flat fills, the trail board on the class dashboard (summit, runs marked by difficulty, the you-are-here pin and its next-run link), run markers in the notes contents, the exam-first headline, and the drifting background and geek mode being opt-in. */
const T = require('./lib');
(async () => {
  const { mk, go, log, check, hscroll } = await T.start({});
  const [c, p] = await mk(1440, 900, { serviceWorkers: 'block' });

  await go(p, '#/calc', 1600);
  const look = await p.evaluate(() => {
    const cs = el => getComputedStyle(el); const b = document.querySelector('.btn.primary');
    return { body: cs(document.body).fontFamily, h1: cs(document.querySelector('.page-title')).fontFamily, bodyBg: cs(document.body).backgroundImage, btnBg: b ? cs(b).backgroundImage : '', live: !!document.querySelector('#live-bg:not([hidden])'), geek: document.documentElement.getAttribute('data-geek'), skin: document.documentElement.getAttribute('data-skin') };
  });
  log('look:', JSON.stringify(look));
  check('default look sets text in Figtree and headings in Gabarito', /Figtree/.test(look.body) && /Gabarito/.test(look.h1), look);
  check('no gradients on the page ground or the primary button', look.bodyBg === 'none' && look.btnBg === 'none', look);
  check('the drifting background and geek mode are off unless switched on', !look.live && look.geek !== 'on' && look.skin === null, look);

  const board = await p.evaluate(() => {
    const b = document.querySelector('.hero-exam.trail-board'); if (!b) return null;
    const runs = [...b.querySelectorAll('.tb-run')]; const here = b.querySelector('.tb-run.here');
    return { exam: b.querySelector('.tb-exam').textContent.trim(), days: b.querySelector('.tb-days b').textContent.trim(), runs: runs.length, glyphs: runs.every(r => /run-glyph (easy|mid|hard|new)/.test(r.querySelector('.run-glyph').className)), pin: here ? here.querySelector('.tb-pin').textContent.trim() : '', hereHref: here ? here.getAttribute('href') : '', go: (b.querySelector('.tb-go .btn.primary') || {}).textContent || '', goHref: (b.querySelector('.tb-go .btn.primary') || { getAttribute: () => '' }).getAttribute('href'), ready: (b.querySelector('.ready-line') || {}).textContent || '', title: document.querySelector('.page-title').textContent.trim() };
  });
  log('board:', JSON.stringify(board));
  check('the class dashboard opens on the trail board with the exam as the summit', board && /Exam/.test(board.exam) && /^(\d+|Today)$/.test(board.days), board);   // on the exam day itself it says Today
  check('every section on the exam is a run with a difficulty marker', board && board.runs >= 3 && board.glyphs, board);
  check('one run carries the you-are-here pin, linked to practice on its topics', board && /You are here/i.test(board.pin) && /practice\?topics=/.test(board.hereHref), board);
  check('the main button takes that run', board && /Take the next run/.test(board.go) && board.goHref === board.hereHref, board);
  check('the board keeps the readiness line and the way to raise it', board && /% ready/.test(board.ready) && /How to raise it/.test(board.ready), board);
  check('the headline counts down to the exam', board && /days to Exam|is tomorrow|is here/.test(board.title), board.title);

  // practising a section re-marks its run on the next visit
  const sec = await p.evaluate(() => { const r = document.querySelector('.tb-run.here'); return r && r.querySelector('.tb-sec').textContent.trim(); });
  await p.evaluate(() => { const T = (App.QZ && App.QZ.TOPICS) || (Courses.calc.quiz && Courses.calc.quiz.TOPICS); const r = App.readiness('calc'); const w = r.weakest[0]; const pr = App.store.get('progress', {}); pr[w.t] = { a: 20, c: 20 }; App.store.set('progress', pr); });
  await go(p, '#/calc/notes', 300); await go(p, '#/calc', 900);
  const after = await p.evaluate(() => ({ here: (document.querySelector('.tb-run.here .tb-sec') || {}).textContent, marks: [...document.querySelectorAll('.tb-run')].map(r => r.querySelector('.tb-sec').textContent.trim() + ':' + r.className.replace('tb-run', '').trim()) }));
  log('after practice:', JSON.stringify(after));
  check('practising moves the pin off the run you cleared', after.here && after.here.trim() !== sec, { before: sec, after });

  await go(p, '#/calc/notes', 1000);
  const toc = await p.evaluate(() => ({ links: document.querySelectorAll('.sec-link').length, glyphs: document.querySelectorAll('.sec-link .run-glyph').length }));
  check('section notes mark every topic with its run marker', toc.links > 5 && toc.glyphs === toc.links, toc);
  await go(p, '#/calc', 1200);
  const trail = await p.evaluate(() => { const svg = document.querySelector('.trail-board .tb-path path.tb-path-line'); const bo = document.querySelector('.tb-run.here .tb-bo'); return { path: svg ? svg.getAttribute('d').split('C').length - 1 : 0, nodes: document.querySelectorAll('.tb-node').length, bo: !!bo }; });
  check('the trail is drawn through every run node, from the trailhead to the flag', trail.path === trail.nodes + 1 && trail.nodes >= 3, trail);
  check('Bo stands at the run you are on', trail.bo, trail);
  await c.close();

  const [cm, m] = await mk(390, 844, { serviceWorkers: 'block' });
  await go(m, '#/calc', 1400);
  const mob = await m.evaluate(() => { const b = document.querySelector('.trail-board'); const r = b.getBoundingClientRect(); const go = b.querySelector('.tb-go .btn.primary').getBoundingClientRect(); return { w: Math.round(r.width), goW: Math.round(go.width) }; });
  check('phone: the board stacks and the next-run button spans the width', mob.goW >= mob.w - 60, mob);
  check('phone: no sideways scroll on the dashboard', await hscroll(m));
  await cm.close();
  await T.finish();
})();

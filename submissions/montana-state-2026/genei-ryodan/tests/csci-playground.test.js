const T = require('./lib');
(async () => {
  const { browser, base, errors, mk, txt, login, api, hscroll, go, log, check } = await T.start({ pyodide: true });
  const setCourses = (p, ids) => p.evaluate(ids => { const s = App.settings(); s.courses = ids; localStorage.setItem('studyhub-settings', JSON.stringify(s)); }, ids);
  const waitStatus = async (p, re, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await txt(p, '#py-status'); if (re.test(s)) return s; await p.waitForTimeout(300); } return 'TIMEOUT: ' + await txt(p, '#py-status'); };
  const cardSpans = p => p.$$eval('.course-grid .course-card', cs => { const gw = cs[0].parentElement.getBoundingClientRect().width; return cs.map(c => Math.round(100 * c.getBoundingClientRect().width / gw)); });

  // ---- landing grid + switcher as a guest with different class counts ----
  const [c, p] = await mk(); await go(p, '#/'); await p.waitForTimeout(800);
  log('guest cards:', (await p.$$('.course-grid .course-card')).length, '| widths %:', JSON.stringify(await cardSpans(p)));
  for (const ids of [['csci'], ['calc', 'csci'], ['calc', 'physics', 'csci'], ['calc', 'physics', 'precalc', 'writ'], ['calc', 'physics', 'precalc', 'writ', 'csci']]) { await setCourses(p, ids); await p.reload(); await p.waitForTimeout(700); log(`${ids.length} classes -> cards:`, (await p.$$('.course-grid .course-card')).length, 'widths %:', JSON.stringify(await cardSpans(p))); }
  await go(p, '#/calc'); await p.waitForTimeout(500);
  const sw = await p.evaluate(() => { const side = document.getElementById('sidebar').getBoundingClientRect(); return Array.from(document.querySelectorAll('.switch-btn')).map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), inside: r.right <= side.right + 1 && r.left >= side.left - 1 && r.width > 20, w: Math.round(r.width) }; }); });
  log('switcher (5 classes):', JSON.stringify(sw), '| all inside:', sw.every(x => x.inside));
  await go(p, '#/'); await setCourses(p, ['calc', 'physics', 'precalc', 'writ']); await go(p, '#/calc'); await p.waitForTimeout(400);
  log('switcher (4 classes) all inside:', await p.evaluate(() => { const side = document.getElementById('sidebar').getBoundingClientRect(); return Array.from(document.querySelectorAll('.switch-btn')).every(b => b.getBoundingClientRect().right <= side.right + 1); }));

  // ---- CSCI course pages ----
  await go(p, '#/csci'); await p.waitForTimeout(600); log('csci dashboard:', await txt(p, '.page-title'), '| exam tile:', (await txt(p, '.hero-exam')).slice(0, 80), '| accent:', await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()));
  log('nav:', await p.$$eval('.nav-item', e => e.map(x => x.dataset.view).join(',')));
  await go(p, '#/csci/calendar'); await p.waitForTimeout(400); log('calendar has lab + exam:', (await txt(p, '#view')).includes('Lab 7') || (await txt(p, '#view')).includes('Exam 2'));
  await go(p, '#/csci/notes/functions'); await p.waitForTimeout(400); log('notes:', await txt(p, '.note-title'), '| code cards:', (await p.$$('.code-card')).length, '| try-it links:', (await p.$$('.code-card a[href*="playground"]')).length, '| formulas block absent:', !(await txt(p, '#view')).includes('Key formulas'), '| link label:', await txt(p, '.note-head a'));
  await go(p, '#/csci/formulas'); await p.waitForTimeout(400); log('cheat sheet groups:', (await p.$$('.fs-group')).length, '| code blocks:', (await p.$$('.fs-code')).length);
  await go(p, '#/csci/flashcards'); await p.waitForTimeout(400); log('flashcards view:', (await txt(p, '.page-title')));
  await go(p, '#/csci/practice'); await p.waitForTimeout(500); log('practice setup topics:', (await p.$$('[data-action="topic"], .topic-chip, .chip.toggle')).length);
  const startBtn = await p.$('#view .btn.primary:not([disabled])'); if (startBtn && await startBtn.isVisible()) { await startBtn.click(); await p.waitForTimeout(600); log('quiz started, first question:', (await txt(p, '.q-card')).slice(0, 100)); const opt = await p.$('.q-card .q-opt'); if (opt) { await opt.click(); await p.waitForTimeout(200); const chk = await p.$('.q-card [data-action="check"]'); if (chk) await chk.click(); await p.waitForTimeout(300); log('answered; feedback present:', !!(await p.$('.q-card .q-opt.correct, .q-card .feedback, .q-card .explain'))); } }
  await go(p, '#/csci/exam/exam2'); await p.waitForTimeout(500); log('exam prep exam2:', (await txt(p, '.page-title')), '| practice problems:', (await txt(p, '#view')).includes('Exam 2 practice'));
  await go(p, '#/csci/course'); await p.waitForTimeout(400); log('syllabus panels:', (await p.$$('#view .panel')).length, '| TA table rows:', (await p.$$('#view table tr')).length);
  await go(p, '#/csci/grades'); await p.waitForTimeout(400); log('grades categories:', await p.$$eval('.grade-row', r => r.map(x => x.textContent.trim().split('\n')[0].slice(0, 30)).join(' | ')));
  log('forum csci course accepted:', await p.evaluate(async () => { const out = []; for (const r of ['posts', 'forum', 'list']) { const x = await fetch('api/index.php?r=' + r + '&course=csci', { headers: { 'X-Requested-With': 'MatHub' } }); out.push(r + ':' + x.status + (x.status === 200 ? ':' + ((await x.json()).ok ? 'ok' : 'fail') : '')); } return out.join(' '); }));

  // ---- playground ----
  await go(p, '#/csci/playground?ex=hello&run=1'); await p.waitForTimeout(300); log('playground status:', await txt(p, '#py-status'));
  let st = await waitStatus(p, /Done|error|Error|failed/); log('first run status:', st, '| output:', (await txt(p, '#py-out')).slice(0, 120));
  const xp0 = await p.evaluate(() => App.xpToday());
  await p.selectOption('#py-example', 'input'); await p.waitForTimeout(200); log('input example loaded, stdin:', await p.$eval('#py-stdin', e => e.value.replace('\n', '/')), '| title:', await txt(p, '#py-title')); await p.click('#py-run'); st = await waitStatus(p, /Done|error/); log('input run:', st, '|', (await txt(p, '#py-out')).slice(0, 120), '| xp +2:', (await p.evaluate(() => App.xpToday())) - xp0);
  await p.selectOption('#py-example', 'turtle-square'); await p.click('#py-run'); st = await waitStatus(p, /Done|error/); log('turtle run:', st, '| svg:', !!(await p.$('#py-out .py-fig svg')), '| gold polygon:', await p.evaluate(() => { const s = document.querySelector('#py-out svg'); return s ? !!s.querySelector('polygon[fill="gold"]') && s.querySelectorAll('line').length === 4 : false; }), '| arrow hidden? turtle visible ->', await p.evaluate(() => document.querySelectorAll('#py-out svg polygon').length));
  await p.selectOption('#py-example', 'turtle-tree'); await p.click('#py-run'); st = await waitStatus(p, /Done|error/); log('tree run:', st, '| lines:', await p.evaluate(() => document.querySelectorAll('#py-out svg line').length));
  const setCode = code => p.evaluate(code => { const ta = document.getElementById('py-code'); ta.value = code; ta.dispatchEvent(new Event('input', { bubbles: true })); }, code);
  await setCode('print("before")\nprint(1 / 0)'); await p.click('#py-run'); st = await waitStatus(p, /Done|error/); const errOut = await txt(p, '#py-out'); log('error run:', st, '| has ZeroDivisionError:', errOut.includes('ZeroDivisionError'), '| before printed:', errOut.includes('before'), '| internals hidden:', !/_pyodide|pyodide\//.test(errOut), '|', errOut.slice(0, 160));
  await setCode('name = input("Name: ")\nprint("hi", name)'); await p.evaluate(() => { document.querySelector('.py-stdin-wrap').open = true; document.getElementById('py-stdin').value = ''; }); await p.click('#py-run'); st = await waitStatus(p, /Done|error/); log('EOF hint:', (await txt(p, '#py-out')).includes('Program input'));
  await setCode('import turtle\nturtle.bgcolor("black")\nturtle.color("white")\nturtle.circle(50)\nturtle.write("hi <b>", font=("Arial", 14, "bold"))\nscreen = turtle.Screen()\nscreen.onkey(lambda: None, "Up")\nscreen.listen()\nturtle.done()'); await p.click('#py-run'); st = await waitStatus(p, /Done|error/); log('module-level turtle:', st, '| bg black:', await p.evaluate(() => { const r = document.querySelector('#py-out svg rect'); return r && r.getAttribute('fill'); }), '| text escaped:', await p.evaluate(() => { const t = document.querySelector('#py-out svg text'); return t && t.textContent; }), '| events note:', (await txt(p, '#py-out')).includes('registered turtle events'));
  await setCode('import numpy as np\nprint(np.arange(3))'); await p.click('#py-run'); st = await waitStatus(p, /Done|error/); log('numpy (not available locally):', st, '|', (await txt(p, '#py-out')).slice(0, 120));
  await setCode('i = 0\nwhile True:\n    i += 1\n    if i % 1000000 == 0:\n        print(i)'); await p.click('#py-run'); await p.waitForTimeout(2500); log('infinite loop streaming:', (await txt(p, '#py-out')).slice(0, 40), '| status:', await txt(p, '#py-status')); await p.click('#py-stop'); await p.waitForTimeout(300); log('after stop:', await txt(p, '#py-status'), '| run enabled:', await p.$eval('#py-run', e => !e.disabled));
  await setCode('print(sum(range(10)))'); await p.click('#py-run'); st = await waitStatus(p, /Done|error/); log('run after stop (reload):', st, '|', (await txt(p, '#py-out')).slice(0, 20));
  // editor keys
  await setCode('def f():'); await p.focus('#py-code'); await p.keyboard.press('End'); await p.keyboard.press('Enter'); await p.keyboard.type('x = 1'); await p.keyboard.press('Enter'); await p.keyboard.press('Tab'); await p.keyboard.type('y'); log('auto-indent + tab:', JSON.stringify(await p.$eval('#py-code', e => e.value)), '| gutter lines:', await txt(p, '#py-gutter'));
  await p.click('[data-action="py-save"]'); await p.waitForTimeout(300); log('snippet saved:', await txt(p, '.py-snips'), '| in examples menu:', await p.$eval('#py-example', e => e.options.length));
  await p.click('[data-action="py-share"]'); await p.waitForTimeout(300); log('share ok (toast or prompt):', (await txt(p, '.toast')).slice(0, 40) || 'prompt');
  // Try it from notes
  await go(p, '#/csci/notes/functions'); await p.waitForTimeout(400); await p.click('.code-card a[href*="playground"]'); await p.waitForTimeout(300); st = await waitStatus(p, /Done|error/); log('try-it from notes:', await txt(p, '#py-title'), '|', st, '|', (await txt(p, '#py-out')).slice(0, 40));
  await go(p, '#/csci/playground'); await p.waitForTimeout(300); log('draft restored:', (await p.$eval('#py-code', e => e.value)).slice(0, 30));
  await c.close();
  // mobile
  const [cm, m] = await mk(390, 720); await go(m, '#/csci/playground'); await m.waitForTimeout(500); log('mobile playground no hscroll:', await hscroll(m)); await go(m, '#/csci/notes/lists'); await m.waitForTimeout(400); log('mobile notes no hscroll:', await hscroll(m)); await go(m, '#/'); await m.waitForTimeout(400); log('mobile landing no hscroll:', await hscroll(m)); await cm.close();
  await T.finish();
})();

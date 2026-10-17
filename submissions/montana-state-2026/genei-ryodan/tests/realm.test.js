/* Realm look (default skin) and the tabletop layer: fonts, archetypes, the d20 quest roller, the character sheet, Bo's hat, Realm level names, geek-mode runes, Classic, dark mode and phones. */
const T = require('./lib');
(async () => {
  const { mk, go, log, check, txt, login } = await T.start({});
  // Classic is the default; Realm is one click away in Settings → Look
  const [c0, p0] = await mk(1360, 900, { serviceWorkers: 'block' }); await go(p0, '#/', 900);
  check('Classic is the default look', await p0.evaluate(() => document.documentElement.getAttribute('data-skin')) === null);
  await go(p0, '#/settings', 800); check('Classic is first in the look picker and selected', await p0.evaluate(() => { const o = document.querySelector('.skin-opt'); return o.dataset.skin === 'default' && o.classList.contains('on'); }));
  await p0.click('.skin-opt[data-skin="realm"]'); await p0.waitForTimeout(200); check('picking Realm applies it', await p0.evaluate(() => document.documentElement.getAttribute('data-skin')) === 'realm'); await c0.close();
  const realmOn = ctx => ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('studyhub-settings') || '{}'); if (!s.skin) { s.skin = 'realm'; localStorage.setItem('studyhub-settings', JSON.stringify(s)); } } catch (e) {} });
  const [c, p] = await mk(1360, 900, { serviceWorkers: 'block' }); await realmOn(c);
  await go(p, '#/', 1200);
  check('Realm applies before first paint', await p.evaluate(() => document.documentElement.getAttribute('data-skin')) === 'realm');
  const fonts = await p.evaluate(async () => { await document.fonts.ready; const h = document.querySelector('.course-card h2'); return { cinzel: document.fonts.check('600 20px Cinzel'), h2: getComputedStyle(h).fontFamily, body: getComputedStyle(document.body).fontFamily, feat: getComputedStyle(document.body).fontFeatureSettings }; });
  log('fonts:', JSON.stringify(fonts));
  check('Cinzel loads from the site and sets the headings', fonts.cinzel && /Cinzel/.test(fonts.h2), fonts);
  check('body text stays Helvetica Neue', /Helvetica Neue/.test(fonts.body), fonts.body);
  check('no stylistic set that hooks Cinzel\'s I', fonts.feat === 'normal', fonts.feat);
  const arch = await p.$$eval('.course-card .arch-chip', els => els.map(e => ({ t: e.textContent.trim(), vis: getComputedStyle(e).display !== 'none' })));
  log('archetypes:', arch.map(a => a.t).join(', '));
  check('every class card shows its archetype', arch.length >= 3 && arch.every(a => a.vis) && arch.some(a => a.t === 'Wizard') && arch.some(a => a.t === 'Artificer'), arch);
  check('Bo wears the wizard hat', await p.evaluate(() => { const h = document.querySelector('.mascot-slot .bo-hat'); return !!h && getComputedStyle(h).display !== 'none'; }));
  const bg = await p.evaluate(() => ({ body: getComputedStyle(document.body).backgroundImage.slice(0, 30), bgc: getComputedStyle(document.body).backgroundColor, panel: getComputedStyle(document.querySelector('.course-card')).backgroundImage.split('url(').length - 1 }));
  check('parchment texture and panel corner ornaments', /url\(/.test(bg.body) && bg.bgc === 'rgb(237, 225, 198)' && bg.panel === 4, bg);
  check('pages outside a class use the crimson accent', await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()) === '#9E1B2E');

  // the d20: every outcome
  const out = await p.evaluate(() => { const ids = App.myCourses(); return [1, 7, 15, 20].map(r => { const o = App.rollOutcome(r, ids); return { r, kind: o.kind, href: o.href, title: o.title, dc: o.dc || null, topic: o.q ? o.q.label : null }; }); });
  log('outcomes:', JSON.stringify(out));
  check('natural 1 sends you to your nemesis lesson', out[0].kind === 'fumble' && /\/lesson\?topics=/.test(out[0].href), out[0]);
  check('middle rolls set a DC and a lesson', [out[1], out[2]].every(o => (o.kind === 'pass' || o.kind === 'fail') && o.dc >= 5 && o.dc <= 20 && /\/lesson\?topics=/.test(o.href) && o.topic) && (out[1].kind === 'pass') === (7 >= out[1].dc), out.slice(1, 3));
  check('natural 20 grants a Blitz', out[3].kind === 'crit' && /\/blitz$/.test(out[3].href), out[3]);
  await p.click('.land-next [data-roll="all"]'); await p.waitForTimeout(80);
  check('rolling tumbles the die', await p.evaluate(() => !!document.querySelector('#roll-modal .d20-big.rolling')));
  await p.waitForTimeout(1500);
  const roll = await p.evaluate(() => { const m = document.querySelector('#roll-modal'); const n = +m.querySelector('.d20-big text').textContent; return { n, verdict: m.querySelector('.roll-verdict').textContent, go: m.querySelector('[data-act="go"]').getAttribute('href'), focus: document.activeElement === m.querySelector('[data-act="go"]') }; });
  log('roll:', JSON.stringify(roll));
  check('the die lands on 1 to 20 with a verdict and a quest link', roll.n >= 1 && roll.n <= 20 && roll.verdict.length > 3 && /^#\//.test(roll.go) && roll.focus, roll);
  await p.keyboard.press('Escape'); check('Escape closes the roll', !(await p.$('#roll-modal')));
  await p.evaluate(() => App.rollQuest('calc', { force: 20 })); await p.waitForTimeout(1500);
  const crit = await p.evaluate(() => ({ crit: !!document.querySelector('#roll-modal .d20-big.crit'), n: document.querySelector('#roll-modal .d20-big text').textContent, href: document.querySelector('#roll-modal [data-act="go"]').getAttribute('href') }));
  check('a forced natural 20 glows and links to Blitz in that class', crit.crit && crit.n === '20' && crit.href === '#/calc/blitz', crit);
  await p.click('#roll-modal [data-act="go"]'); await p.waitForTimeout(700);
  check('accepting the quest navigates and closes the dialog', /#\/calc\/blitz/.test(p.url()) && !(await p.$('#roll-modal')));
  await go(p, '#/calc', 1200); check('class dashboard has a Roll a quest button', !!(await p.$('.page-actions [data-roll="calc"]')));

  // the character sheet computes from real data
  await p.evaluate(() => {
    const t = App.todayISO(); const d = App.store.peek('calc'); d.history = Array.from({ length: 20 }, (_, i) => ({ t: 'velocity', ok: i < 15, d: t, k: 'x' + i })); d.progress = Object.assign({}, d.progress, { velocity: { a: 20, c: 15 }, aroc: { a: 10, c: 9 } }); d.blitz = { best: 200, plays: 3 };
    localStorage.setItem('studyhub-calc', JSON.stringify(d)); const s = App.settings(); s.courses = ['calc', 'physics']; s.focusLog = { [t]: 100 }; localStorage.setItem('studyhub-settings', JSON.stringify(s));
  });
  await go(p, '#/sheet', 1000);
  const sheet = await p.evaluate(() => { const ab = {}; document.querySelectorAll('.cs-abil').forEach(e => { ab[e.querySelector('.ab').textContent] = { sc: +e.querySelector('.sc').textContent, md: e.querySelector('.md').textContent, why: e.querySelector('.why').textContent }; }); return { ab, classes: [...document.querySelectorAll('.cs-class b')].map(b => b.textContent), profs: [...document.querySelectorAll('.cs-profs .chip')].map(c => c.textContent), nemesis: (document.querySelector('.cs-item[href*="lesson"] b') || {}).textContent || null, level: document.querySelector('.cs-wrap .eyebrow + .cs-name') ? document.querySelector('.cs-top .eyebrow').textContent : '' }; });
  log('sheet:', JSON.stringify(sheet));
  const modOk = Object.values(sheet.ab).every(a => a.sc >= 3 && a.sc <= 20 && a.md.replace('−', '-') === (Math.floor((a.sc - 10) / 2) >= 0 ? '+' : '-') + Math.abs(Math.floor((a.sc - 10) / 2)));
  check('six ability scores from 3 to 20 with the tabletop modifier', Object.keys(sheet.ab).join() === 'STR,DEX,CON,INT,WIS,CHA' && modOk, sheet.ab);
  check('INT is 75% accuracy → 16 (4 + 0.75 × 16)', sheet.ab.INT.sc === 16 && /75% on 20/.test(sheet.ab.INT.why), sheet.ab.INT);
  check('DEX from the Blitz best (200 → 13)', sheet.ab.DEX.sc === 13, sheet.ab.DEX);
  check('CON from focus minutes (100 → 12)', sheet.ab.CON.sc === 12, sheet.ab.CON);
  check('classes listed with archetypes', sheet.classes.some(t => /Wizard · Calc I/.test(t)) && sheet.classes.some(t => /Artificer · Physics I/.test(t)), sheet.classes);
  check('proficiency lists the 90% topic, nemesis the weaker one', sheet.profs.some(t => /90%/.test(t)) && !!sheet.nemesis, { profs: sheet.profs, nemesis: sheet.nemesis });
  check('Realm level names', /Level \d+ · (Commoner|Apprentice|Initiate|Adept|Spellwright|Sage|Loremaster|Archmage|Mythic|Legend)/.test(sheet.level), sheet.level);

  // geek mode in Realm decodes with runes and teleports
  await p.evaluate(() => { const s = App.settings(); s.geek = true; localStorage.setItem('studyhub-settings', JSON.stringify(s)); App.applyGeek(); });
  const gk = await p.evaluate(() => new Promise(res => { addEventListener('hashchange', () => setTimeout(() => { const i = document.querySelector('#view .gk-dec i'); const s = document.querySelector('#gk-status'); res({ glyphs: i ? i.textContent : '', font: i ? getComputedStyle(i).fontFamily : '' , status: s ? s.textContent : '' }); }, 30), { once: true }); location.hash = '#/calc/notes/1.2'; }));
  await p.waitForTimeout(700); const st = await p.evaluate(() => document.querySelector('#gk-status').textContent);
  log('realm geek:', JSON.stringify(gk), st);
  check('decode uses runes in the rune font', /[ᚠ-ᛸ]/.test(gk.glyphs) && /Mathub Runes/.test(gk.font), gk);
  check('status line teleports', /~\/realm \$ teleport calc\/notes\/1\.2/.test(st), st);

  // Classic takes it all away
  await go(p, '#/settings', 900);
  check('Realm is marked in the look picker', await p.evaluate(() => document.querySelector('.skin-opt[data-skin="realm"]').classList.contains('on')));
  await p.click('.skin-opt[data-skin="default"]'); await p.waitForTimeout(200);
  const classic = await p.evaluate(() => ({ skin: document.documentElement.getAttribute('data-skin'), h: getComputedStyle(document.querySelector('h1')).fontFamily, hat: getComputedStyle(document.querySelector('.bo-hat') || document.body).display }));
  check('Classic removes the look, Cinzel and the hat', classic.skin === null && !/Cinzel/.test(classic.h), classic);
  await go(p, '#/', 900); check('archetype chips hidden in Classic', await p.$$eval('.arch-chip', els => els.every(e => getComputedStyle(e).display === 'none')));
  const lvC = await p.evaluate(() => App.level().name); check('Classic level names are back', /Newcomer|Explorer|Learner|Scholar|Problem solver|Analyst|Strategist|Expert|Master/.test(lvC), lvC);
  await p.reload(); await p.waitForTimeout(500); check('Classic survives a reload', await p.evaluate(() => document.documentElement.getAttribute('data-skin')) === null);
  await go(p, '#/settings', 800); await p.click('.skin-opt[data-skin="realm"]'); await p.waitForTimeout(150);
  check('back to Realm', await p.evaluate(() => document.documentElement.getAttribute('data-skin')) === 'realm');
  await c.close();

  // dark mode: dungeon, gold accent with dark text
  const [cd, dp] = await mk(1360, 900, { serviceWorkers: 'block', colorScheme: 'dark' }); await realmOn(cd); await go(dp, '#/', 1000);
  const dark = await dp.evaluate(() => { const cs = getComputedStyle(document.documentElement); const b = document.querySelector('.hero-today'); return { bg: getComputedStyle(document.body).backgroundColor, accent: cs.getPropertyValue('--accent').trim(), ink: cs.getPropertyValue('--accent-ink').trim(), btn: b ? getComputedStyle(b).color : '' }; });
  log('dark:', JSON.stringify(dark));
  check('dark Realm is a starlit dungeon with a gold accent and dark button text', dark.bg === 'rgb(17, 14, 24)' && dark.accent === '#E8B84E' && dark.ink === '#1B1206' && dark.btn === 'rgb(27, 18, 6)', dark);
  await cd.close();

  // phones
  const [cm, m] = await mk(390, 820, { serviceWorkers: 'block' }); await realmOn(cm);
  for (const h of ['#/', '#/sheet', '#/calc']) { await go(m, h, 900); check(`no sideways scroll on ${h}`, await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }
  await cm.close();
  // the account menu links the sheet (signed in, own context so synced preferences stay out of the other checks)
  const [ca, a] = await mk(1360, 900, { serviceWorkers: 'block' }); await go(a, '#/', 400); await login(a, 'alice.a@montana.edu'); await a.reload(); await a.waitForTimeout(1400); if (await a.$('.celebrate')) await a.keyboard.press('Escape');
  await a.evaluate(() => { const b = document.querySelector('.landing-top [data-action="acct-toggle"]'); if (b) b.click(); }); await a.waitForTimeout(250);
  check('account menu links the sheet', !!(await a.$('.popover a[href="#/sheet"]')));
  await a.evaluate(async () => { await fetch('api/index.php?r=logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub' } }); }); await ca.close();
  await T.finish();
})();

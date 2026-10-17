/* Bundled class packs: every packs/<id>.mathub.json ships with the site and installs itself
   on the server the first time anyone opens it (api/lib.php, mh_packs_seed_bundled), marked
   "bundled with the site". With no account server (the static preview) the site lists the
   same classes from packs/index.json and opens them straight from their files. */
const T = require('./lib');
const fs = require('fs'); const path = require('path');
(async () => {
  const { mk, go, api, log, check } = await T.start();
  const ROOT = path.resolve(__dirname, '..');
  const files = fs.readdirSync(path.join(ROOT, 'packs')).filter(f => f.endsWith('.mathub.json')).sort();
  const ids = files.map(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'packs', f), 'utf8')).id).sort();
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'packs', 'index.json'), 'utf8'));
  check('packs/index.json lists every bundled pack', index.packs.map(p => p.id).sort().join() === ids.join() && index.packs.every(p => p.file && p.version && p.SECTIONS), index.packs.map(p => p.id));

  const [c0, p0] = await mk(1360, 900, { serviceWorkers: 'block' }); await go(p0, '#/', 800);
  const list = ((await api(p0, 'classpack_list')).json || {}).packs || []; await c0.close();
  log('server list:', list.map(p => `${p.id} v${p.version}`).join(', '));
  check('the server installed the bundled classes on its own', ids.every(id => list.some(p => p.id === id && !p.hidden)), { ids, list: list.map(p => p.id) });

  for (const mode of ['server', 'no server']) {
    const [c, p] = await mk(1360, 900, { serviceWorkers: 'block' });
    if (mode === 'no server') await c.route('**/api/index.php**', r => r.abort());
    await go(p, '#/', 1800);
    const tiles = await p.evaluate(() => [...document.querySelectorAll('.course-card')].map(c => [...c.classList].find(k => k !== 'course-card')));
    check(`${mode}: the start page lists the bundled classes`, ids.every(id => tiles.includes(id)), tiles);
    const id = ids.find(x => x === 'psci230d') || ids[0];
    await go(p, '#/' + id, 2200);
    const dash = await p.evaluate(() => ({ title: (document.querySelector('.page-title') || {}).textContent || '', hero: !!document.querySelector('.hero-exam'), err: !!document.querySelector('.page-load .err, .load-error') }));
    check(`${mode}: ${id} opens on its dashboard`, dash.hero && dash.title.length > 5 && !dash.err, dash);
    await c.close();
  }
  await T.finish();
})();

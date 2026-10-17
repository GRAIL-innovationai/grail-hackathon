/* Classes students make, on the account server: saving, listing, opening and deleting them, the limits, share codes
   and the public shared page, and Mathub Create's status from RevenueCat (a stand-in on the Pyodide mirror server,
   see tests/pyodide/router.php; config.local.php needs revenuecat_secret 'sk_test', revenuecat_api and create_web_link).
   Plain HTTP, no browser pages. */
const T = require('./lib'); const fs = require('fs'); const path = require('path');
const BASE = T.base.replace(/index\.html.*$/, '') + 'api/index.php?r=';
const STATE = path.join(__dirname, 'fixtures', 'rc-state.json');
const jar = {};
async function call(who, route, body, method) {
  const headers = { 'X-Requested-With': 'MatHub', 'Content-Type': 'application/json' }; if (jar[who]) headers.Cookie = jar[who];
  const r = await fetch(BASE + route, { method: method || (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) { const m = /mathub_session=([^;]*)/.exec(sc); if (m) jar[who] = 'mathub_session=' + m[1]; }
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = { raw: t.slice(0, 200) }; } j.status = r.status; return j;
}
let check; const ok = (label, cond, extra) => check(label, !!cond, cond ? undefined : JSON.stringify(extra === undefined ? null : extra).slice(0, 300));
const pack = (id, code, extra = {}) => Object.assign({ format: 'mathub-class-pack', version: 1, id, code, name: code + ' class', term: 'Fall 2026', UNITS: [{ n: 1, title: 'One', sections: ['a'] }], SECTIONS: [{ id: 'a', title: 'Alpha', unit: 1, ideas: ['x'] }], EXAMS: [], CALENDAR: [] }, extra);
(async () => {
  ({ check } = await T.start());
  fs.writeFileSync(STATE, '{}');
  for (const [who, email] of [['alice', 'alice.a@montana.edu'], ['bob', 'bob.bmu6j92pq@montana.edu']]) { const r = await call(who, 'login', { email, password: 'password123' }); ok(`${who} signs in`, r.ok, r); }
  let r = await call('alice', 'myclasses'); for (const c of (r.classes || [])) await call('alice', 'myclass_delete', { id: c.id });
  r = await call('bob', 'myclasses'); for (const c of (r.classes || [])) await call('bob', 'myclass_delete', { id: c.id });

  r = await call('anon', 'myclasses'); ok('signed out, the list needs an account', r.status === 401, r);
  r = await call('alice', 'myclass_save', { id: 'my1234', pack: pack('my1234', 'CHMY 121') }); ok('alice saves a class', r.ok && r.updated > 0 && r.free === false, r);
  r = await call('alice', 'myclass_save', { id: 'my2222', pack: pack('my2222', 'SKIL 101'), free: true }); ok('and the free example class', r.ok && r.free === true, r);
  r = await call('alice', 'myclasses'); ok('her list has both, with code, name and size', r.ok && r.classes.length === 2 && r.classes[0].code === 'CHMY 121' && r.classes[0].bytes > 100 && r.classes[1].free === true, r);
  r = await call('alice', 'myclass&id=my1234'); ok('a class opens with its whole pack', r.ok && r.pack.SECTIONS[0].title === 'Alpha' && r.class.code === 'CHMY 121', r);
  r = await call('bob', 'myclass&id=my1234'); ok('another student cannot open it', r.status === 404, r);
  r = await call('bob', 'myclasses'); ok('and it is not in his list', r.ok && r.classes.length === 0, r);
  r = await call('alice', 'myclass_save', { id: 'my1234', pack: pack('my1234', 'CHMY 121', { name: 'General Chemistry' }) }); ok('saving again updates it', r.ok, r);
  r = await call('alice', 'myclass&id=my1234'); ok('with the new name', r.pack.name === 'General Chemistry' && r.class.name === 'General Chemistry', r.class);
  r = await call('alice', 'myclass_save', { id: 'my2222', pack: pack('my2222', 'SKIL 101') }); r = await call('alice', 'myclasses'); ok('a free class stays free when saved again', r.classes.find(c => c.id === 'my2222').free === true, r.classes);
  r = await call('alice', 'myclass_save', { id: 'my9999', pack: pack('my1234', 'X 1') }); ok('a pack whose id does not match is refused', r.status === 400, r);
  r = await call('alice', 'myclass_save', { id: 'calc', pack: pack('calc', 'M 171') }); ok('only ids of classes students make (my####)', r.status === 400, r);
  r = await call('alice', 'myclass_save', { id: 'my3333', pack: { format: 'something-else', id: 'my3333', code: 'A', name: 'B' } }); ok('only Mathub class packs', r.status === 400, r);
  r = await call('alice', 'myclass_save', { id: 'my4444', pack: pack('my4444', 'BIG 1', { blob: 'x'.repeat(3100000) }) }); ok('a class over 3 MB is refused', r.status === 413, r);

  // sharing
  r = await call('alice', 'myclass_share', { id: 'my1234' }); ok('sharing gives an 8-character code', r.ok && /^[A-Z2-9]{8}$/.test(r.code), r); const code = r.code;
  r = await call('alice', 'myclass_share', { id: 'my1234' }); ok('sharing again gives the same code', r.code === code, r);
  r = await call('anon', 'shared_class&code=' + code.toLowerCase()); ok('anyone with the code can open the class, signed in or not (case does not matter)', r.ok && r.pack.code === 'CHMY 121' && r.pack.name === 'General Chemistry', r);
  ok('the shared copy carries no owner details', r.ok && !JSON.stringify(r).includes('alice'), r);
  r = await call('alice', 'myclasses'); ok('her list shows the class is shared', r.classes.find(c => c.id === 'my1234').share === code, r.classes);
  r = await call('bob', 'myclass_share', { id: 'my1234' }); ok('nobody else can share her class', r.status === 404, r);
  r = await call('alice', 'myclass_unshare', { id: 'my1234' }); r = await call('anon', 'shared_class&code=' + code); ok('after she stops sharing, the link stops working', r.status === 404, r);
  r = await call('anon', 'shared_class&code=abc'); ok('a malformed code is refused with a reason', r.status === 400 && /8 letters/.test(r.error), r);

  // the Pro and Max plans from RevenueCat
  r = await call('anon', 'create_status'); ok('signed out: no plan, the web prices, and whether web purchase is set up', r.ok && r.active === false && r.plan === '' && r.signed_in === false && r.configured === true && r.prices.pro === '$15' && r.prices.max === '$50', r);
  r = await call('alice', 'create_status&refresh=1'); ok('alice without a plan: a checkout link for each plan with her customer id', r.ok && r.active === false && r.plan === '' && /^https:\/\/pay\.rev\.cat\/sbx_pro_link\/mh_\d+$/.test(r.buy.pro) && /^https:\/\/pay\.rev\.cat\/sbx_max_link\/mh_\d+$/.test(r.buy.max) && r.customer === r.buy.pro.split('/').pop(), r);
  const aliceId = r.customer;
  fs.writeFileSync(STATE, JSON.stringify({ [aliceId]: { expires: new Date(Date.now() + 30 * 864e5).toISOString(), store: 'rc_billing', plan: 'pro' } }));
  r = await call('alice', 'create_status'); ok('the answer is kept for a while (no refresh asked)', r.active === false, r);
  r = await call('alice', 'create_status&refresh=1'); ok('after buying Pro on the web, a refresh shows Pro until the period ends, with a manage link', r.ok && r.active === true && r.plan === 'pro' && /T/.test(r.until) && r.store === 'rc_billing' && r.manage_url === 'https://billing.example/manage' && r.renews === true, r);
  fs.writeFileSync(STATE, JSON.stringify({ [aliceId]: { expires: new Date(Date.now() + 30 * 864e5).toISOString(), store: 'app_store', plan: 'max', cancelled: new Date().toISOString() } }));
  r = await call('alice', 'create_status&refresh=1'); ok('after moving to Max (bought in the app, then cancelled): Max, from the App Store, not renewing', r.ok && r.plan === 'max' && r.store === 'app_store' && r.renews === false, r);
  r = await call('bob', 'create_status&refresh=1'); ok('bob has no plan', r.ok && r.active === false && r.plan === '', r);
  fs.writeFileSync(STATE, JSON.stringify({ [aliceId]: { expires: new Date(Date.now() - 864e5).toISOString(), plan: 'max' } }));
  r = await call('alice', 'create_status&refresh=1'); ok('when it has expired, there is no plan', r.ok && r.active === false && r.plan === '', r);
  r = await call('mod', 'login', { email: 'mod.user@montana.edu', password: 'password123' });
  r = await call('mod', 'create_status'); ok('an account in plan_grants has Max without paying (for testers)', r.ok && r.active === true && r.plan === 'max' && r.granted === true, r);

  // export and account deletion
  r = await call('alice', 'data_export'); ok('her classes are in Download my data', r.tables && Array.isArray(r.tables.my_classes) && r.tables.my_classes.length === 2, Object.keys(r.tables || {}));
  for (const c of (await call('alice', 'myclasses')).classes) await call('alice', 'myclass_delete', { id: c.id });
  r = await call('alice', 'myclasses'); ok('deleting removes them', r.ok && r.classes.length === 0, r);
  fs.unlinkSync(STATE);
  await T.finish();
})();

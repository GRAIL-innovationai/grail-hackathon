/* The iOS app's web side, in Chromium with a stand-in for Capacitor (the phone's native layer): app/www is built by
   app/scripts/build-www.js and opened from the test server. Checks that the app marks itself, keeps the website-only
   pieces out, opens other sites in the in-app browser, and that Create a class works end to end: copy the instructions,
   paste a messy AI answer, the repairs and the checks, the preview, adding the class, its file on the device, reopening
   it after a restart, deleting it; a cut-off answer and a broken one; the example class; reminders after permission;
   haptics on answers; nothing of this on the website. Account calls to https://mathub.space go to the test server. */
const T = require('./lib');
const { execFileSync } = require('child_process'); const path = require('path');
(async () => {
  execFileSync(process.execPath, [path.join(__dirname, '..', 'app', 'scripts', 'build-www.js')], { stdio: 'inherit' });
  const { mk, go: goSite, txt, log, check, hscroll, base } = await T.start();
  const APP = base.replace(/index\.html$/, 'app/www/index.html');
  const go = async (p, hash, wait = 1200) => { await p.goto(APP + hash, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(wait); };

  /* a stand-in for Capacitor and its plugins; what the app asks of them is recorded in window.__cap */
  const fakeCapacitor = (platform = 'ios') => {
    const rec = window.__cap = { haptics: [], browser: [], shared: [], scheduled: [], cancelled: [], clipboard: sessionStorage.getItem('fake-clip') || '', perm: sessionStorage.getItem('fake-perm') || 'prompt', status: [], bars: [], channels: [], listeners: {}, minimized: 0, purchases: [], billingKey: '' };
    // the store (RevenueCat): the plan in sessionStorage ('pro' or 'max'; '0' or nothing for none)
    const plan = () => { const v = sessionStorage.getItem('fake-sub') || ''; return v === 'max' || v === 'pro' ? v : ''; };
    const ent = (id, prod) => ({ identifier: id, isActive: true, willRenew: true, productIdentifier: prod, expirationDate: new Date(Date.now() + 30 * 864e5).toISOString() });
    const info = () => ({ entitlements: { active: plan() === 'max' ? { pro: ent('pro', 'mathub_max_monthly'), max: ent('max', 'mathub_max_monthly') } : plan() === 'pro' ? { pro: ent('pro', 'mathub_pro_monthly') } : {}, all: {} }, managementURL: 'https://apps.apple.com/account/subscriptions' });
    const pkgs = [{ identifier: 'pro', packageType: 'CUSTOM', offeringIdentifier: 'default', product: { identifier: 'mathub_pro_monthly', title: 'Mathub Pro', priceString: '$14.99', price: 14.99 } }, { identifier: 'max', packageType: 'CUSTOM', offeringIdentifier: 'default', product: { identifier: 'mathub_max_monthly', title: 'Mathub Max', priceString: '$49.99', price: 49.99 } }];
    window.MATHUB_BILLING_KEYS = { ios: 'appl_test', android: 'goog_test' };
    const fsKey = p => 'fakefs:' + p;
    const ok = v => Promise.resolve(v);
    const Plugins = {
      Haptics: { notification: o => { rec.haptics.push('n:' + o.type); return ok(); }, impact: o => { rec.haptics.push('i:' + o.style); return ok(); }, selectionChanged: () => { rec.haptics.push('s'); return ok(); } },
      Clipboard: { write: o => { rec.clipboard = o.string; sessionStorage.setItem('fake-clip', o.string); return ok(); }, read: () => ok({ value: rec.clipboard, type: 'text/plain' }) },
      Share: { share: o => { rec.shared.push(o); return ok({}); } },
      Filesystem: {
        writeFile: o => { localStorage.setItem(fsKey(o.directory + '/' + o.path), o.data); return ok({ uri: 'file:///' + o.directory + '/' + o.path }); },
        readFile: o => { const v = localStorage.getItem(fsKey(o.directory + '/' + o.path)); return v == null ? Promise.reject(new Error('File does not exist.')) : ok({ data: v }); },
        deleteFile: o => { localStorage.removeItem(fsKey(o.directory + '/' + o.path)); return ok(); },
        readdir: o => { const pre = fsKey(o.directory + '/' + o.path + '/'); const files = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(pre)) files.push({ name: k.slice(pre.length) }); } return ok({ files }); }
      },
      LocalNotifications: {
        checkPermissions: () => ok({ display: rec.perm }), requestPermissions: () => { rec.perm = 'granted'; sessionStorage.setItem('fake-perm', 'granted'); return ok({ display: 'granted' }); },
        schedule: o => { rec.scheduled = rec.scheduled.concat(o.notifications); return ok({ notifications: o.notifications.map(n => ({ id: n.id })) }); },
        createChannel: o => { rec.channels.push(o); return ok(); },
        getPending: () => ok({ notifications: rec.scheduled.map(n => ({ id: n.id, extra: n.extra })) }),
        cancel: o => { const ids = o.notifications.map(n => n.id); rec.cancelled.push(...ids); rec.scheduled = rec.scheduled.filter(n => !ids.includes(n.id)); return ok(); },
        addListener: () => ok({ remove() {} })
      },
      Browser: { open: o => { rec.browser.push(o.url); return ok(); } },
      StatusBar: { setStyle: o => { rec.status.push(o.style); return ok(); } },
      SystemBars: { setStyle: o => { rec.bars.push(o.style); return ok(); } },
      Purchases: {
        configure: o => { rec.billingKey = o.apiKey; return ok(); }, addCustomerInfoUpdateListener: () => ok('cb'), getCustomerInfo: () => ok({ customerInfo: info() }),
        getOfferings: () => ok({ current: { identifier: 'default', availablePackages: pkgs } }),
        purchasePackage: o => { rec.purchases.push(o.aPackage.identifier); sessionStorage.setItem('fake-sub', o.aPackage.identifier); return ok({ customerInfo: info(), productIdentifier: o.aPackage.product.identifier }); },
        restorePurchases: () => ok({ customerInfo: info() }),
        logIn: o => { rec.billingUser = o.appUserID; return ok({ customerInfo: info(), created: false }); }
      },
      App: { addListener: (ev, fn) => { (rec.listeners[ev] = rec.listeners[ev] || []).push(fn); return ok({ remove() {} }); }, minimizeApp: () => { rec.minimized++; return ok(); } }, SplashScreen: { hide: () => ok() }, Keyboard: {}
    };
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform, getServerUrl: () => location.origin, Plugins, registerPlugin: n => Plugins[n] };
  };
  const mkApp = async (w = 390, h = 844, platform = 'ios') => {
    const [c, p] = await mk(w, h, { serviceWorkers: 'block' });
    await c.addInitScript(fakeCapacitor, platform);
    await c.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.celebrate{display:none!important}'; document.head.appendChild(st); }); });
    // the app's account calls go to https://mathub.space; here they go to the test server
    await c.route('https://mathub.space/**', async route => { const u = route.request().url().replace('https://mathub.space/', base.replace(/index\.html$/, '')); try { const r = await route.fetch({ url: u }); await route.fulfill({ response: r }); } catch (e) { await route.abort(); } });
    return [c, p];
  };

  const [ca, p] = await mkApp();
  await go(p, '#/', 2200);
  const shell = await p.evaluate(() => ({ app: document.documentElement.dataset.app, native: !!(window.MATHUB_APP && window.MATHUB_APP.native), py: window.PYODIDE_URL, mj: (document.getElementById('MathJax-script') || {}).src || '', sw: 'serviceWorker' in navigator && !!navigator.serviceWorker.controller, faculty: (() => { const b = document.querySelector('.hero-faculty'); return b ? getComputedStyle(b).display : 'none'; })(), home: App.current === App.homeView }));
  check('the app marks itself and points Python at its own copy', shell.app === 'ios' && shell.native && shell.py === 'assets/pyodide/', shell);
  check('MathJax loads from inside the app, not from a CDN', /\/app\/www\/assets\/mathjax\/tex-svg\.js$/.test(shell.mj), shell.mj);
  check('the app has its own start page, not the website’s (no "For professors")', shell.home && shell.faculty === 'none', shell);
  check('no sideways scroll on the start page at 390px', await hscroll(p));

  // the app's own layout: a top bar with the class switcher, streak, XP and the account; a card per class; the class's path; a tab bar
  const look = await p.evaluate(() => { const q = s => document.querySelector(s); const b = q('#appbar'); const r = b ? b.getBoundingClientRect() : {}; const shown = s => { const e = q(s); return !!e && getComputedStyle(e).display !== 'none'; };
    return { bar: !!b && getComputedStyle(b).position === 'fixed' && r.top >= 0 && r.top < 80, parts: ['.ab-class', '.ab-streak', '.ab-xp', '.ab-signin'].filter(x => !!q('#appbar ' + x)), site: ['.topbar', '.sidebar', '.site-foot', '.hero-faculty'].filter(shown), cards: [...document.querySelectorAll('.ah-card[data-cid]')].map(c => c.dataset.cid), on: q('.ah-card.on') ? q('.ah-card.on').dataset.cid : '', add: !!q('.ah-add'), nodes: document.querySelectorAll('.ap-node').length, start: !!q('.ap-li.current .ap-start'), bo: !!q('.ap-li.current .ap-bo'), banner: q('.ap-banner h3') ? q('.ap-banner h3').textContent : '', labels: [...document.querySelectorAll('.ap-li:not(.exam) .ap-label b')].length, hero: q('.ah-hero h2') ? q('.ah-hero h2').textContent : '', exam: q('.ah-ex') ? q('.ah-ex').textContent.replace(/\s+/g, ' ').trim() : '', go: q('.ah-go') ? q('.ah-go').getAttribute('href') : '', today: q('.ah-today') ? q('.ah-today').textContent.replace(/\s+/g, ' ').trim() : '', tools: document.querySelectorAll('.ah-tool').length, xp: q('#appbar .ab-xp') ? q('#appbar .ab-xp').textContent.trim() : '', tabs: [...document.querySelectorAll('#tabbar.app-tabs .tab-item')].map(t => t.textContent.trim()), active: q('#tabbar .tab-item.active') ? q('#tabbar .tab-item.active').textContent.trim() : '' }; });
  check('a top bar holds the class switcher, streak, XP and Sign in; the website’s top bar, menu and footer are hidden', look.bar && look.parts.length === 4 && !look.site.length, look);
  check('the start page has a card per class (and Add a class) and the chosen class’s path, with Start and Bo on the next lesson', look.cards.length >= 1 && look.cards.includes(look.on) && look.add && look.nodes >= 3 && look.start && look.bo && look.banner.length > 0, look);
  check('a tab bar: Learn, Practice, Bo, Today, Discuss, Me, with Learn chosen', look.tabs.join() === 'Learn,Practice,Bo,Today,Discuss,Me' && look.active === 'Learn', look.tabs);
  check('the chosen class shows where it is, its next exam with days left and readiness, and a Continue button into the next lesson', /Calculus I|Calc/.test(look.hero) && /Week \d+|now covering|Semester/.test(look.hero + (await txt(p, '.ah-hero'))) && (!look.exam || (/\d+ days?|today|this week/i.test(look.exam) && /ready/.test(look.exam))) && /#\/\w+\/lesson\?topics=/.test(look.go), { hero: look.hero, exam: look.exam, go: look.go });
  check('every lesson on the path is named, and Today shows the daily goal across classes', look.labels === look.nodes && look.labels >= 3 && /of \d+ XP/.test(look.today) && /\/\d+/.test(look.xp), { labels: look.labels, nodes: look.nodes, today: look.today.slice(0, 120), xp: look.xp });
  check('the class tools are on the start page, with All tools', look.tools >= 6, look.tools);
  await p.click('.ap-li.current .ap-node'); await p.waitForTimeout(250);
  const lesson = await p.evaluate(() => { const li = document.querySelector('.ap-li.current'); const pp = li.querySelector('.ap-pop'); return { shown: !pp.hidden, raised: li.classList.contains('open') && getComputedStyle(li).zIndex !== 'auto', open: document.querySelectorAll('.ap-pop:not([hidden])').length, links: [...pp.querySelectorAll('a')].map(x => x.textContent.trim()) }; });
  check('tapping a lesson opens its card (above the lessons after it) with Start lesson, Practice and Notes', lesson.shown && lesson.raised && lesson.open === 1 && /Start lesson/.test(lesson.links.join()) && /Practice/.test(lesson.links.join()), lesson);
  await p.click('#appbar .ab-streak'); await p.waitForTimeout(250);
  const sp = await p.evaluate(() => { const e = document.querySelector('.ab-pop'); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, t: e.textContent }; });
  check('the streak opens a note that stays on screen', sp && sp.l >= 8 && sp.r <= sp.w - 8 && /in a row/.test(sp.t), sp);
  await p.click('.ah-tool[data-ab-tools]'); await p.waitForTimeout(500);
  const allTools = await p.evaluate(() => { const s = document.querySelector('#class-sheet'); if (!s) return null; const h = s.querySelector('.sheet-tools-h'), sh = s.querySelector('.sheet'); return { top: Math.round(h.getBoundingClientRect().top - sh.getBoundingClientRect().top), scrolled: sh.scrollTop > 0 }; });
  check('All tools opens the sheet at the class\u2019s tools', allTools && allTools.scrolled && allTools.top < 80, allTools);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.click('#appbar .ab-class'); await p.waitForTimeout(450);
  const sheet = await p.evaluate(() => { const s = document.querySelector('#class-sheet'); return s && { open: s.classList.contains('open'), pop: !!document.querySelector('.ab-pop'), rows: s.querySelectorAll('[data-pick]').length, create: !!s.querySelector('a[href="#/create"]'), tools: s.querySelectorAll('.sg-item').length }; });
  check('the class button opens a sheet: your classes, Create a class, and every tool', sheet && sheet.open && sheet.rows >= 1 && sheet.create && sheet.tools >= 8, sheet);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  check('Escape closes the sheet', !(await p.$('#class-sheet')));
  const other = look.cards.find(x => x !== look.on);
  if (other) {
    await p.click(`.ah-card[data-cid="${other}"]`); await p.waitForTimeout(1500);
    const sw = await p.evaluate(() => ({ on: document.querySelector('.ah-card.on').dataset.cid, chip: document.querySelector('#appbar .ab-class').textContent.trim(), nodes: document.querySelectorAll('.ap-node, .ap-exam').length }));
    check('tapping another class card switches the path and the top bar to it', sw.on === other && sw.nodes > 0 && sw.chip.length > 0, sw);
  }
  await go(p, '#/calc/dashboard', 1600);
  check('inside a class the top bar has a back button and Practice points into that class', !!(await p.$('#appbar [data-ab="back"]')) && await p.evaluate(() => /#\/calc\/(practice|flashcards)$/.test(document.querySelector('#tabbar .tab-item:nth-child(2)').getAttribute('href'))));
  await go(p, '#/settings', 1400);
  check('the Me tab is chosen on Settings', (await txt(p, '#tabbar .tab-item.active')).trim() === 'Me');
  await go(p, '#/', 1800);
  check('a strip covers the status bar area, above the top bar and below dialogs', await p.evaluate(() => { const s = document.querySelector('.app-statusbar'); if (!s) return false; const cs = getComputedStyle(s); return cs.position === 'fixed' && cs.display !== 'none' && +cs.zIndex > 50 && +cs.zIndex < 60; }));
  // exam week: three days before calc's Exam 2 the Learn page shows the plan under the class card
  await p.evaluate(() => { App.setSetting('asof', '2026-10-13'); App.setSetting('appClass', 'calc'); App.rerender(); }); await p.waitForTimeout(2200);
  const xw = await p.evaluate(() => { const x = document.querySelector('#ah-main .xw'); return x ? { h: x.querySelector('h2').textContent, items: x.querySelectorAll('.xw-today .xw-item').length, days: x.querySelectorAll('.xw-plan li').length, exRow: !!document.querySelector('#ah-main .ah-hero .ah-ex'), after: x.previousElementSibling && x.previousElementSibling.classList.contains('ah-hero') } : { cls: App.home.curClass(), asof: App.settings().asof, d: App.home.daysTo(App.home.examOf(Courses.calc)), wk: !!App.home.examWeek(Courses.calc), main: ((document.querySelector('#ah-main') || {}).innerHTML || '').slice(0, 120) }; });
  check('exam week in the app: the plan for today and each day, right under the class card (which drops its exam row)', xw && xw.h && /Exam week: Exam 2 in 3 days/.test(xw.h) && xw.items >= 3 && xw.days === 4 && !xw.exRow && xw.after, xw);
  check('no sideways scroll on the Learn page in exam week', await hscroll(p));
  await p.evaluate(() => App.setSetting('asof', null));
  const fetched = await p.evaluate(async () => { const r = await fetch('api/index.php?r=config', { headers: { 'X-Requested-With': 'MatHub' } }); return r.url; });
  check('account calls go to https://mathub.space', /^https:\/\/mathub\.space\/api\/index\.php\?r=config/.test(fetched), fetched);

  // links to other sites open in the in-app browser and the app stays put
  await p.evaluate(() => { const a = document.createElement('a'); a.href = 'https://example.org/page'; a.id = 'ext'; a.textContent = 'x'; a.style.cssText = 'position:fixed;top:120px;left:10px;z-index:99999'; document.body.appendChild(a); const b = document.createElement('a'); b.href = 'learn/'; b.id = 'web'; b.textContent = 'y'; b.style.cssText = 'position:fixed;top:160px;left:10px;z-index:99999'; document.body.appendChild(b); });
  const before = p.url(); await p.click('#ext'); await p.click('#web'); await p.waitForTimeout(300);
  const br = await p.evaluate(() => window.__cap.browser);
  check('an outside link opens in the in-app browser', br[0] === 'https://example.org/page' && p.url() === before, br);
  check('a website-only page opens on mathub.space', br[1] === 'https://mathub.space/learn/', br);

  // Create a class: the instructions
  await go(p, '#/create', 1200);
  check('#/create opens with Bo writing it from the syllabus, and the three do-it-yourself steps folded away', /Create a class/.test(await txt(p, '#view')) && !!(await p.$('#mk-bo-text')) && (await p.$$('#mk-diy .mk-step')).length === 3);
  check('no sideways scroll on #/create at 390px', await hscroll(p));
  await p.click('#mk-diy summary'); await p.waitForTimeout(200);
  await p.click('[data-action="copy-prompt"]'); await p.waitForTimeout(300);
  const clip = await p.evaluate(() => window.__cap.clipboard);
  check('Copy instructions puts the full instructions on the clipboard', /mathub-class-pack/.test(clip) && /THE SYLLABUS:\s*$/.test(clip) && /about 60/.test(clip), clip.slice(0, 120));
  await p.click('[data-action="size"][data-size="short"]'); await p.click('[data-action="copy-prompt"]'); await p.waitForTimeout(200);
  check('"Shorter answer" asks for less', /about 25/.test(await p.evaluate(() => window.__cap.clipboard)));
  check('copying gives a haptic tap', (await p.evaluate(() => window.__cap.haptics)).includes('n:SUCCESS'));

  // a messy answer, as a chat AI writes it: text around it, a trailing comma, a missing unit, a "quiz" calendar row, flashcards with front/back, an exam without a date, a question as an object
  const messy = `Sure! Here is your Mathub class:\n\n\`\`\`json\n${JSON.stringify({
    format: 'mathub-class-pack', version: 1, id: 'chmy121', code: 'CHMY 121', name: 'Introduction to General Chemistry', term: 'Fall 2026',
    COURSE: { instructor: 'Dr. Jane Smith', instructorEmail: 'jane.smith@montana.edu', officeHours: 'Tue 2-3 pm', lectures: 'MWF 9:00-9:50' },
    GRADING: { categories: [{ name: 'Homework', weight: 20 }, { name: 'Exams', weight: 50 }, { name: 'Final', weight: 30 }] },
    EXAMS: [{ id: 'exam1', name: 'Exam 1', date: '2026-10-28', units: [1] }, { id: 'final', name: 'Final exam', date: 'TBA' }],
    CALENDAR: [['2026-08-24', 'lecture', 'Atoms', 'atoms'], ['2026-09-18', 'quiz', 'Quiz 1'], ['2026-10-28', 'exam', 'Exam 1'], ['not a date', 'lecture', 'x']],
    UNITS: [{ n: 1, title: 'Atoms and molecules', sections: ['atoms', 'moles'] }],
    SECTIONS: [{ id: 'atoms', title: 'Atoms and isotopes', unit: 1, ideas: ['Protons and neutrons sit in the nucleus.', 'Isotopes differ in neutrons.'] }, { id: 'moles', title: 'The mole', ideas: 'A mole is $6.022 \\times 10^{23}$ particles.' }],
    FLASHCARDS: [{ front: 'Isotope', back: 'Same element, different number of neutrons' }, { f: 'Mole', b: '6.022 x 10^23 particles', sec: 'moles' }],
    QUIZ: { topics: { atoms: { unit: 1, sec: 'atoms', label: 'Atoms' }, moles: { sec: 'moles', label: 'Moles' } },
      questions: [{ type: 'bank', topic: 'atoms', items: [['Isotopes differ in their number of', 'neutrons', ['protons', 'electrons', 'charges'], 'Same protons, different neutrons.'], { q: 'The nucleus contains', a: 'protons and neutrons', wrong: ['electrons only', 'photons', 'electrons and protons'], why: 'Electrons are outside the nucleus.' }] },
        { type: 'bank', topic: 'moles', items: [['One mole is about how many particles?', '6.022 × 10^23', ['6.022 × 10^22', '3.14 × 10^23', '1000'], 'Avogadro’s number.']] }] }
  }, null, 2).replace('"Final exam",\n      "date": "TBA"', '"Final exam",\n      "date": "TBA",')}\n\`\`\`\n\nLet me know if you want more questions!`;
  await p.fill('#mk-text', messy); await p.click('[data-action="check"]'); await p.waitForTimeout(500);
  const pv = await txt(p, '#mk-result');
  check('a messy answer is repaired and previewed', /Introduction to General Chemistry/.test(pv) && /Add CHMY 121/.test(pv), pv.slice(0, 300));
  check('the preview counts what is in it and says what was left out', /2 topics/.test(pv) && /flashcards/.test(pv) && /notes? about this class/.test(pv), pv.slice(0, 300));
  check('the Create page says Bo writing classes is part of Mathub Pro, with the store price, and that Max adds Ask Bo', /Mathub Pro/.test(await txt(p, '#mk-sub')) && /\$14\.99 a month/.test(await txt(p, '#mk-sub')) && /Max adds Ask Bo/.test(await txt(p, '#mk-sub')), await txt(p, '#mk-sub'));
  await p.click('[data-add]'); await p.waitForTimeout(700);
  const pw = await p.evaluate(() => { const s = document.querySelector('#paywall'); return s && { plans: [...s.querySelectorAll('[data-plan]')].map(b => [b.dataset.plan, b.querySelector('.pw-plan-price').textContent, b.getAttribute('aria-checked')]), price: s.querySelector('#pw-price').textContent, buy: s.querySelector('[data-action="pw-buy"]').textContent, restore: !!s.querySelector('[data-action="pw-restore"]'), fine: s.querySelector('.pw-fine').textContent, terms: !!s.querySelector('.pw-fine a[href="#/policy/create"]') && !!s.querySelector('.pw-fine a[href="#/policy/privacy"]'), why: s.querySelector('.pw-why').textContent, saved: JSON.parse(localStorage.getItem('mh-my-classes') || '[]').length }; });
  check('adding a class from a syllabus asks for a plan first: Pro and Max with the store prices, Pro picked, renewal terms, Terms and Privacy, Restore; nothing is saved yet', pw && pw.plans.map(x => x.join(':')).join() === 'pro:$14.99 a month:true,max:$49.99 a month:false' && /Pro \$14\.99 · Max \$49\.99/.test(pw.price) && /Get Pro for \$14\.99 a month/.test(pw.buy) && pw.restore && /Renews every month at \$14\.99/.test(pw.fine) && /at least 24 hours/.test(pw.fine) && pw.terms && /CHMY 121/.test(pw.why) && pw.saved === 0, pw);
  check('the app connects to the store with its own key', (await p.evaluate(() => window.__cap.billingKey)) === 'appl_test');
  await p.click('#paywall [data-action="pw-buy"]'); await p.waitForTimeout(1800);
  check('subscribing buys the Pro package, then the class is added', (await p.evaluate(() => window.__cap.purchases)).join() === 'pro' && /#\/my\d{4}\/dashboard/.test(p.url()), p.url());
  const cid = (/#\/(my\d{4})\/dashboard/.exec(p.url()) || [])[1];
  check('adding the class opens its dashboard', !!cid, p.url());
  const saved = await p.evaluate(id => ({ file: !!localStorage.getItem('fakefs:DATA/classes/' + id + '.mathub.json'), idx: JSON.parse(localStorage.getItem('mh-my-classes') || '[]').map(e => e.id), local: App.packs.local.has(id), order: App.COURSE_ORDER.includes(id), strip: !!document.querySelector('.mk-strip') }), cid);
  check('the class is saved as a file in the app’s own folder and listed with the other classes', saved.file && saved.idx.includes(cid) && saved.local && saved.order && saved.strip, saved);
  check('an exam the syllabus gave no weight shows no made-up percent', !/undefined|NaN/.test(await txt(p, '#view')) && /Exam 1/.test(await txt(p, '#view')), (await txt(p, '#view')).slice(0, 200));
  log('class id:', cid);

  // after a restart the class is still there and opens from its file
  await go(p, `#/${cid}/flashcards`, 2200);
  const fc = await p.evaluate(id => ({ loaded: !!(window.Courses[id] && window.Courses[id].loaded), cards: ((window.Courses[id] || {}).FLASHCARDS || []).map(c => c.f) }), cid);
  check('after a restart the class loads from its saved file, flashcards and all', fc.loaded && fc.cards.includes('Isotope') && fc.cards.includes('Mole') && /Flashcards/.test(await txt(p, '#view')), fc);
  await go(p, `#/${cid}/notes`, 1800);
  check('its notes show the topics', /Atoms and isotopes/.test(await txt(p, '#view')) && /The mole/.test(await txt(p, '#view')));
  await go(p, `#/${cid}/calendar`, 1600);
  check('its calendar has the exam and the quiz row (filed as a deadline)', /Exam 1/.test(await txt(p, '#view')) && /Quiz 1/.test(await txt(p, '#view')));

  // haptics follow answers
  await p.evaluate(() => { window.__cap.haptics = []; App.sfx.play('correct'); App.sfx.play('wrong'); });
  check('right and wrong answers give the matching haptic', (await p.evaluate(() => window.__cap.haptics)).join() === 'n:SUCCESS,n:ERROR', await p.evaluate(() => window.__cap.haptics));

  // a cut-off answer and a broken one
  await go(p, '#/create', 1000); await p.click('#mk-diy summary'); await p.waitForTimeout(200);
  await p.fill('#mk-text', messy.slice(0, 900)); await p.click('[data-action="check"]'); await p.waitForTimeout(300);
  check('a cut-off answer is caught, with a message to send the AI', /stops before the end/.test(await txt(p, '#mk-result')) && !!(await p.$('#mk-result [data-copy]')));
  await p.click('#mk-result [data-copy]'); await p.waitForTimeout(200);
  check('that message asks for a shorter, complete answer', /cut off/.test(await p.evaluate(() => window.__cap.clipboard)));
  await p.fill('#mk-text', '```json\n{ "code": "X 101", "name": "Nothing in it" }\n```'); await p.click('[data-action="check"]'); await p.waitForTimeout(300);
  const broken = await txt(p, '#mk-result');
  check('an answer missing what a class needs lists what to fix', /Almost there/.test(broken) && /SECTIONS/.test(broken), broken.slice(0, 200));
  await p.fill('#mk-text', '```json\n{ "code": "X 101", "name": "Typo" "term": "Fall 2026" }\n```'); await p.click('[data-action="check"]'); await p.waitForTimeout(300);
  check('a JSON typo is caught', /typo/.test(await txt(p, '#mk-result')));
  await p.fill('#mk-text', '<script>alert(1)</script> { "code": "<img src=x onerror=alert(1)>" '); await p.click('[data-action="check"]'); await p.waitForTimeout(300);
  check('markup in a pasted answer is never put on the page', !(await p.$('#mk-result img, #mk-result script')));

  // the example class
  await p.click('[data-action="example"]'); await p.waitForTimeout(800);
  check('the example class checks clean', /Add SKIL 101/.test(await txt(p, '#mk-alt-result')) && !/to fix/.test(await txt(p, '#mk-alt-result')));
  await p.click('#mk-alt-result [data-add]'); await p.waitForTimeout(1500);
  const exId = (/#\/(my\d{4})\/dashboard/.exec(p.url()) || [])[1];
  await go(p, `#/${exId}/practice`, 2500);
  check('the example class has a working quizzer', !!(await p.$('#view .q-opt, #view [data-action="answer"], #view .quiz')) || /Retrieval|Spacing|Notes|Planning/.test(await txt(p, '#view')), (await txt(p, '#view')).slice(0, 160));

  // managing them: send, delete
  await go(p, '#/create', 1000);
  check('both classes are listed under "Classes you created"', (await p.$$('.mk-item')).length === 2);
  await p.click(`[data-file="${cid}"]`); await p.waitForTimeout(400);
  const sh = await p.evaluate(() => window.__cap.shared.slice(-1)[0]);
  check('Send shares the class as a file', sh && Array.isArray(sh.files) && /CHMY121\.mathub\.json$/.test(sh.files[0]), sh);
  await p.click(`[data-del="${exId}"]`); await p.waitForTimeout(800);
  const gone = await p.evaluate(id => ({ file: !!localStorage.getItem('fakefs:DATA/classes/' + id + '.mathub.json'), reg: !!window.Courses[id], rows: document.querySelectorAll('.mk-item').length }), exId);
  check('Delete removes the class and its file', !gone.file && !gone.reg && gone.rows === 1, gone);

  // when the plan ends: the class stays, locked; the example class is still free; classes made before subscriptions stay free
  await p.evaluate(() => { sessionStorage.setItem('fake-sub', '0'); return App.subscription.refresh(); }); await p.waitForTimeout(300);
  await go(p, `#/${cid}/dashboard`, 1600);
  const lk = await p.evaluate(() => { const c = document.querySelector('.sublock'); return { text: c ? c.textContent.replace(/\s+/g, ' ') : '', buy: !!document.querySelector('[data-lock="buy"]'), restore: !!document.querySelector('[data-lock="restore"]') }; });
  check('with no plan, a class made from a syllabus is kept but locked, with Subscribe and Restore', /is locked/.test(lk.text) && /still saved/.test(lk.text) && lk.buy && lk.restore, lk.text.slice(0, 160));
  check('the locked class is still on the device', await p.evaluate(id => !!localStorage.getItem('fakefs:DATA/classes/' + id + '.mathub.json'), cid));
  await go(p, '#/', 1800);
  check('its card on the start page says Locked', /Locked/.test(await txt(p, `.ah-card[data-cid="${cid}"]`)), await txt(p, `.ah-card[data-cid="${cid}"]`));
  await go(p, '#/create', 1000);
  await p.click('[data-action="example"]'); await p.waitForTimeout(800); await p.click('#mk-alt-result [data-add]'); await p.waitForTimeout(1600);
  const ex2 = (/#\/(my\d{4})\/dashboard/.exec(p.url()) || [])[1];
  check('the example class is free: added without the paywall, and it opens', !!ex2 && !(await p.$('#paywall')) && !(await p.$('.sublock')), p.url());
  await go(p, `#/${cid}/dashboard`, 1600); await p.click('[data-lock="buy"]'); await p.waitForTimeout(700); await p.click('#paywall [data-action="pw-buy"]'); await p.waitForTimeout(1600);
  check('subscribing from the locked class opens it again', !(await p.$('.sublock')) && /Exam 1/.test(await txt(p, '#view')));
  await go(p, '#/settings', 1400);
  check('Settings shows Mathub Pro as on, with Manage subscription, Move up to Max and Restore', /Mathub Pro/.test(await txt(p, '.ap-sub')) && !!(await p.$('.ap-sub [data-sub="max"]')) && /On\. Renews/.test(await txt(p, '.ap-sub')) && !!(await p.$('.ap-sub [data-sub="manage"]')) && !!(await p.$('.ap-sub [data-sub="restore"]')), await txt(p, '.ap-sub'));
  await p.evaluate(() => { sessionStorage.setItem('fake-sub', '0'); return App.subscription.refresh(); });
  await go(p, `#/${cid}/dashboard`, 1400);
  check('with the plan off again, the class locks again', !!(await p.$('.sublock')));
  await p.evaluate(() => App.setSetting('subMigrated', 0)); await p.reload(); await p.waitForTimeout(2000);   // as if this version had just been installed over an older one
  await go(p, `#/${cid}/dashboard`, 1600);
  check('classes made before subscriptions existed stay free', !(await p.$('.sublock')) && /Exam 1/.test(await txt(p, '#view')));

  // reminders: asked only when turned on, then scheduled for the exams
  await go(p, '#/settings', 1600);
  check('Settings has the "On this iPhone" panel', /On this iPhone/.test(await txt(p, '#app-panel')));
  check('signed out, Settings says an account is optional and does not offer web push', /An account is optional/.test(await txt(p, '.acct-panel')) && !(await p.$('#acct-push')));
  await go(p, '#/calc/grapher', 1500);
  check('every study tool works without an account in the app (the grapher is open)', !(await p.$('#view .sublock')) && !(await p.isVisible('#preview-banner')) && /Grapher/.test(await txt(p, '#view')) && !!(await p.$('#view canvas, #view svg')), (await txt(p, '#view')).slice(0, 120));
  await go(p, '#/settings', 1200);
  const before2 = await p.evaluate(() => window.__cap.perm);
  await p.check('#ap-exams'); await p.waitForTimeout(1200);
  const rem = await p.evaluate(() => ({ perm: window.__cap.perm, n: window.__cap.scheduled.length, titles: window.__cap.scheduled.map(n => n.title).slice(0, 4), on: App.settings().examReminders }));
  check('turning exam reminders on asks permission first, then schedules them', before2 === 'prompt' && rem.perm === 'granted' && rem.on && rem.n > 0 && rem.titles.some(t => /Exam 1 is (in 3 days|tomorrow)/.test(t)), rem);
  await p.check('#ap-daily'); await p.waitForTimeout(900);
  check('the daily reminder repeats at the chosen time', await p.evaluate(() => window.__cap.scheduled.some(n => n.id === 999 && n.schedule.repeats && n.schedule.on.hour === 19)));
  await p.uncheck('#ap-exams'); await p.uncheck('#ap-daily'); await p.waitForTimeout(900);
  check('turning them off cancels them', await p.evaluate(() => window.__cap.scheduled.filter(n => n.extra && n.extra.mh === 1).length === 0));

  // a web view cannot save files: files the page makes go to the share sheet, files on the server open in the Safari sheet
  await p.evaluate(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['{"x":1}'], { type: 'application/json' })); a.download = 'mathub-data.json'; document.body.appendChild(a); a.click(); a.remove(); });
  await p.waitForTimeout(700);
  const dl = await p.evaluate(() => ({ s: window.__cap.shared.slice(-1)[0], body: atob(localStorage.getItem('fakefs:CACHE/share/mathub-data.json') || '') }));
  check('a file the page makes (Download my data) opens the share sheet with that file', dl.s && /share\/mathub-data\.json$/.test(dl.s.files[0]) && dl.body === '{"x":1}', dl);
  await p.evaluate(() => { const a = document.createElement('a'); a.href = 'https://mathub.space/api/index.php?r=ics&t=x'; a.download = 'mathub.ics'; a.id = 'dl-ics'; a.textContent = 'ics'; a.style.cssText = 'position:fixed;top:120px;left:10px;z-index:9999;padding:8px;background:#fff'; document.body.appendChild(a); });
  await p.click('#dl-ics'); await p.waitForTimeout(300);
  check('a file on the server (the .ics feed) opens in the in-app browser', (await p.evaluate(() => window.__cap.browser.slice(-1)[0])) === 'https://mathub.space/api/index.php?r=ics&t=x' && p.url().startsWith(APP));
  check('links people share point at mathub.space, not the app', await p.evaluate(() => App.siteBase()) === 'https://mathub.space/');

  // #/teach in the app points to the web
  await go(p, '#/teach', 1000); await p.click('[data-action="open-web"]'); await p.waitForTimeout(200);
  check('Mathub Faculty opens on the web from the app', (await p.evaluate(() => window.__cap.browser.slice(-1)[0])) === 'https://mathub.space/#/teach');

  // ---------- Android: the same app, with Android's conventions ----------
  const [cn, a] = await mkApp(412, 915, 'android');
  await go(a, '#/', 2200);
  const and = await a.evaluate(() => ({ app: document.documentElement.dataset.app, platform: MATHUB_APP.platform, bars: window.__cap.bars.slice(), back: (window.__cap.listeners.backButton || []).length }));
  check('Android: the app marks itself and colours the system bars through SystemBars', and.app === 'android' && and.platform === 'android' && and.bars.length > 0, and);
  check('Android: the back button and back gesture are handled', and.back === 1, and);
  await a.evaluate(() => { location.hash = '#/create'; }); await a.waitForTimeout(1000);
  check('Android: Create a class says the class stays on this phone', /saved on this phone/.test(await txt(a, '#view')));
  const back = () => a.evaluate(() => window.__cap.listeners.backButton.forEach(fn => fn({ canGoBack: true })));
  await a.evaluate(() => App.showShortcuts()); await a.waitForTimeout(300);
  await back(); await a.waitForTimeout(700);
  check('Android back: closes an open dialog first', !(await a.$('#shortcuts-modal')) && /#\/create$/.test(a.url()), a.url());
  await a.evaluate(() => document.querySelector('.app') && document.querySelector('.app').classList.add('nav-open'));
  await back(); await a.waitForTimeout(300);
  check('Android back: then closes the menu', await a.evaluate(() => !document.querySelector('.app.nav-open')) && /#\/create$/.test(a.url()));
  await back(); await a.waitForTimeout(1000);
  check('Android back: then goes back a page', /#\/$/.test(a.url()), a.url());
  await back(); await a.waitForTimeout(300);
  check('Android back: on the start page it leaves the app for the home screen', (await a.evaluate(() => window.__cap.minimized)) === 1);
  await a.evaluate(() => { location.hash = '#/settings'; }); await a.waitForTimeout(1400);
  check('Android: Settings has the "On this phone" panel', /On this phone/.test(await txt(a, '#app-panel')));
  await a.check('#ap-daily'); await a.waitForTimeout(1000);
  const arem = await a.evaluate(() => ({ ch: window.__cap.channels, n: window.__cap.scheduled.filter(n => n.id === 999) }));
  check('Android: reminders go in their own channel and are inexact (no exact-alarm permission needed)', arem.ch.some(c => c.id === 'reminders' && c.importance === 3) && arem.n.length === 1 && arem.n[0].channelId === 'reminders' && arem.n[0].isExactNotification === false, arem);
  check('no sideways scroll on Android at 412px', await hscroll(a));

  // the website has Create a class too (assets/create.js), but none of the app's own code
  const [cw, w] = await mk(1360, 900, { serviceWorkers: 'block' });
  await goSite(w, '#/create', 1400);
  const web = await w.evaluate(() => ({ app: document.documentElement.dataset.app || '', create: !!(window.App && App.views.create), scripts: [...document.scripts].map(s => s.src).filter(s => /app-(boot|native)/.test(s)).length, steps: document.querySelectorAll('.mk-step').length }));
  check('the website has the Create a class page and loads no app code', web.app === '' && web.create && web.scripts === 0 && web.steps === 3, web);

  await goSite(w, '#/policy/delete', 1400);
  const del = await txt(w, '#pol-delete') + ' ' + await w.evaluate(() => { const h = document.querySelector('#pol-delete'); let t = ''; for (let n = h && h.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling) t += n.textContent + ' '; return t; });
  check('the website has a public "Deleting your Mathub account" page (Google Play asks for its link)', /Deleting your Mathub account/.test(del) && /Settings/.test(del) && /Delete account/.test(del) && /within 7 days/.test(del) && /Kept, but no longer linked/.test(del), del.slice(0, 160));
  await Promise.all([ca.close(), cn.close(), cw.close()]);
  await T.finish();
})();

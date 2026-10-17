/* Mathub service worker: makes notes, formula sheets, flashcards and tools work offline.
   Registered as sw.js?v=<build>; the build string names the cache, so every release gets a clean cache. */
const BUILD = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'mathub-' + BUILD;
const V = '?v=' + BUILD;
const SHELL = ['./', 'index.html', 'assets/fonts/texgyreheros-regular.woff2', 'assets/fonts/texgyreheros-bold.woff2', 'assets/styles.css' + V, 'assets/motion.css' + V, 'assets/gsap-fx.js' + V, 'assets/vendor/gsap.min.js' + V, 'assets/vendor/ScrollTrigger.min.js' + V, 'assets/realm.css' + V, 'assets/world.css' + V, 'assets/teach.css' + V, 'assets/create.css' + V, 'assets/home.css' + V, 'assets/tutor.css' + V, 'assets/fonts.css' + V, 'assets/boot.js' + V, 'assets/fonts/poppins-latin-500-normal.woff2', 'assets/fonts/poppins-latin-600-normal.woff2', 'assets/fonts/poppins-latin-700-normal.woff2', 'assets/fonts/jetbrains-mono-latin-400-normal.woff2', 'assets/fonts/jetbrains-mono-latin-500-normal.woff2', 'assets/fonts/press-start-2p-latin-400-normal.woff2', 'assets/fonts/source-serif-4-var.woff2', 'assets/fonts/source-sans-3-var.woff2', 'assets/fonts/figtree-var.woff2', 'assets/fonts/gabarito-var.woff2', 'assets/fonts/cinzel.woff2', 'assets/fonts/runes.woff2', 'assets/courses-index.js' + V, 'assets/app.js' + V, 'assets/motion.js' + V, 'assets/pixel.js' + V, 'assets/geek.js' + V, 'assets/realm.js' + V, 'assets/gami.js' + V, 'assets/quests.js' + V, 'assets/lesson.js' + V, 'assets/ladders.js' + V, 'assets/tools.js' + V, 'assets/auth.js' + V, 'assets/create.js' + V, 'assets/home.js' + V, 'assets/board-draw.js' + V, 'assets/tutor.js' + V, 'assets/talk.js' + V, 'assets/bo-float.js' + V, 'assets/i18n.js' + V, 'assets/welcome.js' + V, 'assets/welcome.css' + V, 'assets/app-sample-class.json', 'assets/forum.js' + V, 'assets/policy.js' + V, 'assets/planner.js' + V, 'assets/gpa.js' + V, 'assets/today.js' + V, 'assets/report.js' + V, 'assets/pwa.js' + V, 'assets/changelog.js' + V, 'assets/resources-data.js' + V, 'assets/guides-data.js' + V, 'assets/resources.js' + V, 'assets/requests.js' + V, 'assets/classpacks.js' + V, 'assets/focus.js' + V, 'assets/readiness.js' + V, 'assets/mistakes.js' + V, 'assets/cheatsheet.js' + V, 'assets/mynotes.js' + V, 'assets/blitz.js' + V, 'assets/utils.js' + V, 'assets/recap.js' + V, 'assets/tour.js' + V, 'assets/social.js' + V, 'assets/admin.js' + V, 'assets/teach.js' + V, 'assets/calc-tools.js' + V, 'assets/physics-tools.js' + V, 'assets/precalc-tools.js' + V, 'assets/pylab.js' + V, 'assets/pyworker.js' + V, 'assets/reader.js' + V, 'assets/phonetics.js' + V, 'assets/ambient.js' + V, 'assets/icon.svg' + V, 'assets/icon-192.png' + V, 'assets/icon-512.png' + V, 'assets/manifest.webmanifest' + V];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => { await Promise.all(SHELL.map(u => c.add(u).catch(() => {}))); }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('mathub-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // The account server is never cached. When offline, answer with a JSON error the app understands.
  if (url.origin === self.location.origin && url.pathname.includes('/api/')) {
    e.respondWith(fetch(req).catch(() => new Response(JSON.stringify({ ok: false, error: 'You are offline.', offline: true }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }
  // The page itself: network first so new builds arrive immediately, cached copy when offline.
  if (url.origin === self.location.origin && (url.pathname.includes('/learn/') || url.pathname.endsWith('/sitemap.xml') || url.pathname.endsWith('/robots.txt'))) { e.respondWith(fetch(req).catch(() => caches.match(req))); return; }
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)).catch(() => {}); return res; }).catch(() => caches.match('index.html').then(r => r || caches.match('./'))));
    return;
  }
  // Same-origin assets carry a build tag: cache first.
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); } return res; })));
    return;
  }
  // MathJax from its CDN: serve the cached copy at once and refresh it in the background.
  e.respondWith(caches.match(req).then(hit => { const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); } return res; }).catch(() => hit); return hit || net; }));
});

/* ---------- push notifications: the push itself is empty; the pending items are fetched for the logged-in user ---------- */
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let items = [];
    try { const r = await fetch('api/index.php?r=push_pending', { credentials: 'include', headers: { 'X-Requested-With': 'MatHub' }, cache: 'no-store' }); const j = await r.json(); items = (j && j.items) || []; } catch (err) {}
    if (!items.length && e.data) { try { const d = e.data.json(); if (d && d.title) items = [d]; } catch (err) { items = [{ title: 'Mathub', body: e.data.text() }]; } }
    if (!items.length) items = [{ title: 'Mathub', body: 'Something new is waiting for you.', url: './' }];
    await Promise.all(items.map(it => self.registration.showNotification(it.title || 'Mathub', { body: it.body || '', icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', tag: it.tag || undefined, data: { url: it.url || './' } })));
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const target = (e.notification.data && e.notification.data.url) || './'; const url = new URL(target, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { const c = cs.find(x => x.url.startsWith(self.registration.scope)); if (c) { return c.focus().then(w => ('navigate' in w ? w.navigate(url) : w)); } return self.clients.openWindow(url); }));
});

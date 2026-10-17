/* ============================================================
   Mathub — classes students make (loaded on the website and in the iOS and Android apps, after auth.js)
   - Create a class (#/create): Mathub writes instructions for an AI; the student gives them, with their
     syllabus, to the AI chat they already use, pastes the answer back, and Mathub checks it, repairs what
     it safely can, shows a preview and adds the class. The class is data, cleaned like every other class
     pack. Mathub never sends the syllabus anywhere.
   - where classes live: in the apps, on the device (and with the account when signed in); on the website,
     with the account (and cached in this browser). The same account sees the same classes everywhere.
     Server: api/myclasses.php.
   - the plans: Mathub Pro (Bo writes classes from a syllabus, api/ai.php; making and adding classes; $15 a month)
     and Mathub Max (Pro, plus Ask Bo, the AI tutor, assets/tutor.js; $50 a month). In the apps they are bought through the
     App Store or Google Play; on the website through a RevenueCat Web Purchase Link (Stripe). Both go to
     the same RevenueCat customer (mh_<account id>), so one subscription works everywhere.
     The example class is free, and classes made before subscriptions existed stay free. When it ends,
     the classes stay, locked, and open again the moment it is back. Setup: docs/app-subscriptions.md.
   - sharing: a link and QR code (mathub.space/#/c/CODE) anyone can open; adding a copy needs Pro or Max.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; const Packs = global.MathubPacks; const Courses = global.Courses;
  if (!App || !Packs || !App.packs) return;
  const { $, $$, esc, icon, bind, toast, settings, setSetting } = App;
  const N = global.Native; const MA = global.MATHUB_APP;
  const NATIVE = !!(N && MA && MA.native);
  const ANDROID = NATIVE && MA.platform === 'android';
  const DEVICE = !NATIVE ? 'browser' : ANDROID ? (Math.min(screen.width, screen.height) >= 600 ? 'tablet' : 'phone') : /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iPad' : 'iPhone';
  const STORE = ANDROID ? 'Google Play' : 'the App Store';
  const SHARE_URL = 'https://mathub.space/#/c/';
  const API = 'api/index.php?r=';

  /* ---------- what differs between the apps and a browser ---------- */
  const Plat = NATIVE ? N : {
    haptic() {},
    reduceMotion: () => !!(global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
    copy: t => (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(String(t)) : Promise.reject(new Error('Copying is not available in this browser. Select the text and copy it.'))),
    paste: () => (navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText() : Promise.reject(new Error('Click in the box and press Ctrl+V (⌘V on a Mac) to paste.'))),
    share: o => (navigator.share ? navigator.share({ title: o.title, text: o.text, url: o.url }) : Plat.copy(o.url).then(() => toast('Link copied.'))),
    shareFile(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); return Promise.resolve(); },
    open: url => { global.open(url, '_blank', 'noopener'); }
  };
  const WHERE = NATIVE ? `on this ${DEVICE}` : 'with your account';
  async function api(route, body, method) {
    const opts = { method: method || (body ? 'POST' : 'GET'), credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Accept': 'application/json' }, cache: 'no-store' };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res, json; try { res = await fetch(API + route, opts); json = await res.json(); } catch (e) { throw Object.assign(new Error('Mathub cannot reach the server right now. Check your connection and try again.'), { network: true }); }
    if (!json || json.ok === false) { const err = new Error((json && json.error) || 'Something went wrong. Please try again.'); err.status = res.status; err.data = json; throw err; }
    return json;
  }
  /* the signed-in account, when the server knows it (not the offline stand-in account) */
  const user = () => { const a = App.auth; return a && a.user && !a.user.local && a.mode === 'server' ? a.user : null; };
  const signIn = (state = 'login') => { if (App.auth && App.auth.open) App.auth.open(state); else location.hash = '#/settings'; };
  const lsGet = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? fb : v; } catch (e) { return fb; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const fmtDay = d => { try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (e) { return d; } };
  const fmtDate = d => { try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } };
  const fmtSize = n => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1000)) + ' KB';

  /* ============================================================
     Where the class files are kept: the app's own folder, or IndexedDB in a browser
     (the account is the real copy on the website; a class missing here is fetched from it)
     ============================================================ */
  const fileOf = id => `classes/${id}.mathub.json`;
  const Store = NATIVE ? {
    read: id => N.fs.read(fileOf(id)),
    write: (id, text) => N.fs.write(fileOf(id), text),
    remove: id => N.fs.remove(fileOf(id)),
    async ids() { return (await N.fs.list('classes')).map(f => (/^(my\d{4,6})\.mathub\.json$/.exec(f) || [])[1]).filter(Boolean); },
    async clear() {}
  } : (() => {
    let dbp = null; const mem = new Map();
    const open = () => dbp || (dbp = new Promise(res => { try { const r = indexedDB.open('mathub-classes', 1); r.onupgradeneeded = () => r.result.createObjectStore('packs'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (e) { res(null); } }));
    const tx = async (mode, fn) => { const db = await open(); if (!db) return null; return new Promise(res => { try { const t = db.transaction('packs', mode); const q = fn(t.objectStore('packs')); t.oncomplete = () => res(q ? q.result : null); t.onerror = t.onabort = () => res(null); } catch (e) { res(null); } }); };
    return {
      async read(id) {
        if (mem.has(id)) return mem.get(id);
        let t = await tx('readonly', s => s.get(id));
        if (typeof t !== 'string') { const r = await api('myclass&id=' + encodeURIComponent(id)); t = JSON.stringify(r.pack); this.write(id, t); }
        mem.set(id, t); return t;
      },
      async write(id, text) { mem.set(id, text); await tx('readwrite', s => s.put(text, id)); },
      async remove(id) { mem.delete(id); await tx('readwrite', s => s.delete(id)); },
      async ids() { return (await tx('readonly', s => s.getAllKeys())) || []; },
      async clear() { mem.clear(); await tx('readwrite', s => s.clear()); }
    };
  })();

  /* ============================================================
     Classes you made: the list (a light copy of each class, so they show before the files are read),
     and keeping it the same as the account's
     ============================================================ */
  const IDX = 'mh-my-classes';                // [{ id, code, name, term, added, bytes, stub, free?, synced?, owner?, share?, from? }]
  const GONE = 'mh-my-classes-gone';          // classes deleted here while offline or signed out: [{ id, owner }]
  const readIdx = () => { const v = lsGet(IDX, []); return Array.isArray(v) ? v.filter(e => e && Packs.ID_RE.test(e.id || '')) : []; };
  const writeIdx = list => lsSet(IDX, list);
  const patchEntry = (id, patch) => { writeIdx(readIdx().map(e => e.id === id ? Object.assign({}, e, patch) : e)); };
  const local = App.packs.local;
  let accountIds = new Set();   // ids in the account, so a new class never takes one
  const newId = () => { let id; do { id = 'my' + String(1000 + Math.floor(Math.random() * 9000)); } while (Courses[id] || local.has(id) || accountIds.has(id)); return id; };
  function registerLocal(entry) { local.add(entry.id); App.packs.register(entry.stub, true); }
  const reminders = () => { if (App.reminders) App.reminders.sync(); };
  const Mine = App.myClasses = {
    list: () => readIdx(),
    has: id => local.has(id),
    entry: id => readIdx().find(e => e.id === id) || null,
    async read(id) { return JSON.parse(await Store.read(id)); },
    /* opts: free (the example class, or a class made before subscriptions), synced/owner (it came from the account), from (a share code) */
    async add(pack, opts = {}) {
      const text = JSON.stringify(pack); const old = Mine.entry(pack.id);
      await Store.write(pack.id, text);
      const entry = { id: pack.id, code: pack.code, name: pack.name, term: pack.term, added: (old && old.added) || Date.now(), bytes: text.length, stub: App.packs.stubOf(pack) };
      if (opts.free || (old && old.free)) entry.free = true;
      if (opts.synced) { entry.synced = opts.synced; entry.owner = opts.owner; }
      if (opts.share) entry.share = opts.share;
      if (opts.from || (old && old.from)) entry.from = opts.from || old.from;
      writeIdx(readIdx().filter(e => e.id !== pack.id).concat([entry]));
      registerLocal(entry);
      const s = settings(); if (Array.isArray(s.courses) && s.courses.length && !s.courses.includes(pack.id)) setSetting('courses', s.courses.concat([pack.id]));
      if (!opts.quiet && App.rebuildNav) App.rebuildNav();
      reminders();
      if (!opts.synced) Sync.push(pack.id).catch(() => {});
      return entry;
    },
    /* opts.here: only on this device or browser (the account keeps it) */
    async remove(id, opts = {}) {
      const e = Mine.entry(id);
      if (App.D && App.D.id === id && App.forgetCourse) App.forgetCourse();
      await Store.remove(id); writeIdx(readIdx().filter(x => x.id !== id)); local.delete(id); App.packs.unregister(id);
      const s = settings(); if (Array.isArray(s.courses) && s.courses.includes(id)) setSetting('courses', s.courses.filter(x => x !== id));
      if (!opts.quiet && App.rebuildNav) App.rebuildNav();
      reminders();
      if (!opts.here && e && e.synced) await Sync.drop(e);
    }
  };
  /* registered before the first render, from the light copy kept in the list; the full class is read when opened */
  readIdx().forEach(e => { try { if (e.stub) registerLocal(e); } catch (err) {} });
  /* in the apps, if the list was lost (storage cleared) the files are still there: rebuild it from them */
  if (NATIVE) (async () => {
    const known = new Set(readIdx().map(e => e.id)); let added = 0;
    for (const id of await Store.ids()) { if (known.has(id)) continue;
      try { const pack = await Mine.read(id); const entry = { id: pack.id, code: pack.code, name: pack.name, term: pack.term, added: Date.now(), bytes: 0, stub: App.packs.stubOf(pack) }; writeIdx(readIdx().concat([entry])); registerLocal(entry); added++; } catch (e) {} }
    if (added && App.rerender) App.rerender();
  })();
  const baseLoad = App.packs.load;
  App.packs.load = async id => {
    if (!local.has(id)) return baseLoad(id);
    let raw; try { raw = await Mine.read(id); } catch (e) { throw new Error(NATIVE ? `This class is not saved on this ${DEVICE} any more.` : e.network ? 'This class is saved with your account. Connect to the internet to open it here.' : 'This class could not be opened. Sign in with the account you made it with.'); }
    return App.packs.install(id, raw);
  };

  /* keeping the classes here and in the account the same: new ones go up, the account's come down, and a class
     deleted on one device goes from the others. A class made in the app while signed out (or under another
     account) stays on that device until someone signs in. */
  const Sync = App.classSync = {
    busy: null, last: 0,
    async push(id) {
      const u = user(); const e = Mine.entry(id); if (!u || !e || (e.owner && e.owner !== u.id)) return false;
      const pack = await Mine.read(id);
      const r = await api('myclass_save', { id, pack, free: !!e.free });
      patchEntry(id, { synced: r.updated, owner: u.id, free: !!r.free }); accountIds.add(id); return true;
    },
    async drop(e) {
      const u = user(); const owner = e.owner;
      const later = () => { const g = lsGet(GONE, []); if (!g.some(x => x.id === e.id)) lsSet(GONE, g.concat([{ id: e.id, owner }])); };
      if (!u || u.id !== owner) { if (owner) later(); return; }
      try { await api('myclass_delete', { id: e.id }); accountIds.delete(e.id); } catch (x) { if (x.network) later(); }
    },
    /* a class made here took an id the account already uses for another class: give it a new one */
    async rekey(e) {
      const pack = await Mine.read(e.id); const id = newId(); pack.id = id;
      try { const p = localStorage.getItem('studyhub-' + e.id); if (p) localStorage.setItem('studyhub-' + id, p); } catch (x) {}
      await Mine.remove(e.id, { here: true, quiet: true }); await Mine.add(pack, { free: e.free, from: e.from, quiet: true });
    },
    run(force) {
      const u = user(); if (!u) return Promise.resolve(false);
      if (Sync.busy) return Sync.busy;
      if (!force && Date.now() - Sync.last < 120000) return Promise.resolve(false);
      Sync.busy = (async () => {
        let changed = false;
        if (!NATIVE && readIdx().some(e => e.owner && e.owner !== u.id)) { await wipeHere(); changed = true; }
        for (const g of lsGet(GONE, [])) { if (g.owner !== u.id) continue; try { await api('myclass_delete', { id: g.id }); } catch (x) { if (x.network) throw x; } lsSet(GONE, lsGet(GONE, []).filter(x => x.id !== g.id)); }
        const r = await api('myclasses'); const S = new Map((r.classes || []).map(c => [c.id, c])); accountIds = new Set(S.keys());
        for (const e of readIdx()) {
          if (e.owner && e.owner !== u.id) continue;
          const s = S.get(e.id);
          if (s && e.synced) { if ((e.share || '') !== (s.share || '') || !!e.free !== !!s.free) patchEntry(e.id, { share: s.share || '', free: !!s.free }); continue; }
          if (s && !e.synced) { await Sync.rekey(e); changed = true; continue; }
          if (!s && e.synced) { await Mine.remove(e.id, { here: true, quiet: true }); changed = true; continue; }
          try { await Sync.push(e.id); } catch (x) { if (x.network) throw x; console.warn('Mathub: a class could not be saved to the account', e.id, x.message); }
        }
        for (const s of S.values()) {
          if (local.has(s.id) || Courses[s.id]) continue;
          try { const x = await api('myclass&id=' + encodeURIComponent(s.id)); await Mine.add(x.pack, { free: s.free, synced: s.updated, owner: u.id, share: s.share || '', quiet: true }); changed = true; } catch (err) { if (err.network) throw err; }
        }
        Sync.last = Date.now();
        if (changed) { if (App.rebuildNav) App.rebuildNav(); const h = location.hash; if (h === '' || h === '#/' || /^#\/(create|settings)\b/.test(h)) App.rerender(); }
        return changed;
      })().catch(e => { if (!e.network) console.warn('Mathub: syncing your classes stopped:', e.message); return false; }).finally(() => { Sync.busy = null; });
      return Sync.busy;
    }
  };
  /* the website keeps classes only for the account that is signed in */
  async function wipeHere() {
    for (const e of readIdx()) { try { await Mine.remove(e.id, { here: true, quiet: true }); } catch (x) {} }
    writeIdx([]); await Store.clear(); accountIds = new Set(); if (App.rebuildNav) App.rebuildNav();
  }

  /* ============================================================
     The instructions for the AI, and reading its answer
     ============================================================ */
  const SIZES = {
    full: { sections: '8 to 16', ideas: '3 to 5', cards: 'about 60', questions: '6 to 8' },
    short: { sections: '6 to 10', ideas: '2 or 3', cards: 'about 25', questions: '4' }
  };
  function prompt(size) {
    const Z = SIZES[size] || SIZES.full;
    return `You are turning a college course syllabus into a study class for Mathub, a study app. The syllabus is attached or pasted after these instructions.

Reply with ONE JSON object and nothing else: no greeting and no explanation, just the JSON in a single \`\`\`json code block.

WHAT TO WRITE
1. Course facts from the syllabus: code, title, term, instructor, email, office hours, meeting times, textbook, grading categories and weights, the letter-grade scale, exam dates, holidays and deadlines. Copy dates and numbers exactly. Never invent a date: if an exam has no date in the syllabus, leave it out of EXAMS and list it in COURSE.deadlines instead.
2. Study material you write yourself from the topics the syllabus covers, accurate and at the level of the course:
   - SECTIONS: one per main topic, ${Z.sections} in total, grouped into UNITS (one unit per exam period when the course has exams).
   - Each section: ${Z.ideas} "ideas" (short paragraphs that teach the topic), one or two "pitfalls" (common mistakes), and an "example" ({ "p": a problem, "s": its worked solution }) when the subject has problems to solve.
   - FLASHCARDS: ${Z.cards} cards, front "f" and back "b".
   - QUIZ: one topic per section with ${Z.questions} multiple-choice questions each.
3. Plain text only: no HTML and no Markdown inside the strings. Write math as LaTeX between dollar signs, and double every backslash inside JSON strings, for example "$\\\\frac{a}{b}$".

FORMAT (ids use lowercase letters, digits and dashes)
{
  "format": "mathub-class-pack",
  "version": 1,
  "id": "chmy121",
  "code": "CHMY 121",
  "name": "Introduction to General Chemistry",
  "term": "Fall 2026",
  "color": { "light": "#0F766E" },
  "COURSE": {
    "code": "CHMY 121", "name": "Introduction to General Chemistry", "term": "Fall 2026",
    "school": "Montana State University",
    "instructor": "Dr. Jane Smith", "instructorEmail": "jane.smith@montana.edu",
    "officeHours": "Tue 2-3 pm, Gaines 210", "lectures": "MWF 9:00-9:50, Gaines 101",
    "textbook": { "title": "Chemistry: The Central Science", "url": "" },
    "deadlines": [{ "name": "Last day to drop", "rule": "Oct 30" }]
  },
  "GRADING": {
    "categories": [{ "id": "hw", "name": "Homework", "weight": 20 }, { "id": "exams", "name": "Midterms", "weight": 50 }, { "id": "final", "name": "Final exam", "weight": 30 }],
    "scale": [{ "letter": "A", "min": 93 }, { "letter": "B", "min": 83 }, { "letter": "C", "min": 73 }, { "letter": "D", "min": 63 }, { "letter": "F", "min": 0 }]
  },
  "SEMESTER": { "start": "2026-08-24", "end": "2026-12-18" },
  "EXAMS": [{ "id": "exam1", "name": "Exam 1", "date": "2026-09-30", "covers": "Units 1 and 2", "units": [1, 2], "weight": 15 }],
  "CALENDAR": [
    ["2026-08-24", "lecture", "Atoms and isotopes", "atoms"],
    ["2026-09-07", "holiday", "Labor Day, no class"],
    ["2026-09-30", "exam", "Exam 1"],
    ["2026-10-30", "admin", "Last day to drop"]
  ],
  "UNITS": [{ "n": 1, "title": "Atoms and molecules", "sections": ["atoms", "moles"], "exam": "exam1" }],
  "SECTIONS": [{
    "id": "atoms", "label": "1.1", "title": "Atoms and isotopes", "unit": 1,
    "ideas": ["An atom has protons and neutrons in its nucleus...", "..."],
    "pitfalls": ["The mass number is protons plus neutrons, not protons plus electrons."],
    "example": { "p": "How many neutrons are in carbon-14?", "s": "14 - 6 = 8 neutrons." }
  }],
  "FLASHCARDS": [{ "id": "c1", "unit": 1, "sec": "atoms", "f": "Isotopes", "b": "Atoms of one element with different numbers of neutrons." }],
  "QUIZ": {
    "topics": { "atoms": { "unit": 1, "sec": "atoms", "label": "Atoms and isotopes" } },
    "questions": [{ "type": "bank", "topic": "atoms", "items": [
      ["Isotopes of an element differ in their number of", "neutrons", ["protons", "electrons", "charges"], "Same element means same protons; isotopes differ in neutrons."]
    ] }]
  }
}

RULES THAT MATTER
- CALENDAR rows are ["YYYY-MM-DD", type, title] with an optional fourth value, the id of the section taught that day. type is one of lecture, lab, exam, review, holiday, admin (use admin for deadlines). Include every exam, holiday and deadline in the syllabus, and one lecture row per topic when the syllabus has a schedule.
- Every section has a "unit" that is one of the UNITS "n" values, and every id in a unit's "sections" exists in SECTIONS.
- An exam's "units" lists the unit numbers it covers. Its "weight" is its percent of the final grade; leave "weight" out when the syllabus does not say.
- GRADING weights add up to 100. Use the syllabus's own letter scale when it has one.
- Each question item is [question, correct answer, [three or four wrong answers], a one-sentence explanation]. Wrong answers are plausible but clearly wrong, and the question never gives the answer away.
- color.light is a deep colour that white text can sit on, as #RRGGBB.
- If the answer would get too long, write fewer flashcards and questions, but always finish with a complete, valid JSON object.

THE SYLLABUS:
`;
  }
  const fixPrompt = problems => `The JSON you wrote for Mathub has problems. Fix them and send the complete corrected JSON again, in one \`\`\`json code block and nothing else:\n${problems.map(p => '- ' + p).join('\n')}`;
  const cutPrompt = () => 'Your answer was cut off before the JSON ended, so Mathub cannot read it. Write the whole class again, shorter this time: 6 to 10 SECTIONS with 2 ideas each, about 25 FLASHCARDS and 4 questions per topic. Send only the JSON, in one ```json code block, and make sure it is complete.';

  /* finds the JSON in whatever was pasted: a code block, text around it, or the bare object */
  function extract(text) {
    let t = String(text || '').replace(/^﻿/, '').trim();
    if (!t) return { error: 'empty' };
    const fence = /```[a-zA-Z]*\s*\n?([\s\S]*?)```/.exec(t);
    if (fence && fence[1].includes('{')) t = fence[1].trim(); else t = t.replace(/^```[a-zA-Z]*\s*/, '');
    const s = t.indexOf('{'); if (s < 0) return { error: 'none' };
    t = t.slice(s);
    let depth = 0, inStr = false, escp = false, end = -1;
    for (let i = 0; i < t.length; i++) { const ch = t[i];
      if (inStr) { if (escp) escp = false; else if (ch === '\\') escp = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true; else if (ch === '{' || ch === '[') depth++; else if (ch === '}' || ch === ']') { depth--; if (depth === 0) { end = i; break; } } }
    if (end < 0) return { error: 'cut' };
    const body = t.slice(0, end + 1);
    try { return { data: JSON.parse(body) }; } catch (e) {
      try { return { data: JSON.parse(body.replace(/,(\s*[}\]])/g, '$1')) }; } catch (e2) {
        const at = Number((/position (\d+)/.exec(e.message) || [])[1]); const near = Number.isFinite(at) ? body.slice(Math.max(0, at - 40), at + 40).replace(/\s+/g, ' ') : '';
        return { error: 'syntax', message: e.message.replace(/^JSON\.parse: /, ''), near };
      }
    }
  }

  /* safe, mechanical repairs: missing ids, unknown calendar types, units and topics left implied */
  const KEY = /^[a-z0-9][a-z0-9_.-]{0,40}$/i; const ISO = /^\d{4}-\d{2}-\d{2}$/; const HEX = /^#[0-9a-f]{6}$/i;
  const COLORS = ['#1D4ED8', '#0F766E', '#B91C1C', '#6D28D9', '#B45309', '#0E7490', '#BE185D', '#4D7C0F', '#9333EA', '#C2410C'];
  const str = v => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').trim();
  const arr = v => (Array.isArray(v) ? v : []);
  const obj = v => v && typeof v === 'object' && !Array.isArray(v);
  const slug = (s, fb) => { const x = String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s.-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); return KEY.test(x) ? x : fb; };
  const realDate = d => ISO.test(d || '') && !isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
  const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const CAL = { lecture: 'lecture', class: 'lecture', lesson: 'lecture', discussion: 'lecture', seminar: 'lecture', topic: 'lecture', recitation: 'lab', lab: 'lab', laboratory: 'lab', studio: 'lab', exam: 'exam', midterm: 'exam', final: 'exam', test: 'exam', quiz: 'admin', review: 'review', holiday: 'holiday', break: 'holiday', 'no class': 'holiday', 'no-class': 'holiday', admin: 'admin', deadline: 'admin', due: 'admin', assignment: 'admin', homework: 'admin', project: 'admin' };
  function termGuess() { const d = new Date(); const m = d.getMonth() + 1, y = d.getFullYear(); return m >= 8 ? `Fall ${y}` : m <= 5 ? `Spring ${y}` : `Summer ${y}`; }
  function termDates(term) {
    const m = /(fall|autumn|spring|summer|winter)\s+(\d{4})/i.exec(term || ''); const y = m ? m[2] : String(new Date().getFullYear()); const k = m ? m[1].toLowerCase() : '';
    return k === 'spring' || k === 'winter' ? { start: `${y}-01-12`, end: `${y}-05-08` } : k === 'summer' ? { start: `${y}-05-18`, end: `${y}-08-07` } : { start: `${y}-08-24`, end: `${y}-12-18` };
  }
  function repair(input, id) {
    const notes = []; const P = obj(input) ? input : {};
    const C = P.COURSE = obj(P.COURSE) ? P.COURSE : {};
    P.format = 'mathub-class-pack'; P.version = 1; P.id = id;
    P.code = str(P.code) || str(C.code) || 'MY CLASS'; P.name = str(P.name) || str(C.name) || str(P.title) || P.code; P.term = str(P.term) || str(C.term);
    if (!P.term) { P.term = termGuess(); notes.push(`The answer had no term, so it is set to ${P.term}.`); }
    P.short = (str(P.short) || P.code).slice(0, 12);
    C.code = str(C.code) || P.code; C.name = str(C.name) || P.name; C.term = str(C.term) || P.term;
    if (!obj(P.color) || !HEX.test(P.color.light || '')) P.color = { light: COLORS[hash(P.code) % COLORS.length] };
    if (P.color.dark && !HEX.test(P.color.dark)) delete P.color.dark;
    ['NAV', 'title', 'notes', 'hidden', 'preview', 'file'].forEach(k => delete P[k]);
    const keep = new Set(Packs.DATA_KEYS.concat(['format', 'version', 'id', 'color', 'archetype', 'resources', 'resourcesBlurb', 'guides', 'canvasMatch', 'QUIZ', 'formulasTitle']));
    Object.keys(P).forEach(k => { if (!keep.has(k)) delete P[k]; });
    // sections, with a map from the ids the AI wrote to the ids used here
    const secMap = {}; const used = new Set();
    P.SECTIONS = arr(P.SECTIONS).filter(obj).map((s, i) => {
      const was = str(s.id); let sid = KEY.test(was) ? was : slug(was || s.title, `topic-${i + 1}`); let n = 2; while (used.has(sid)) sid = `${sid.replace(/-\d+$/, '')}-${n++}`; used.add(sid); if (was) secMap[was] = sid; secMap[sid] = sid;
      s.id = sid; s.title = str(s.title) || str(s.name) || `Topic ${i + 1}`; s.unit = Number(s.unit) || 1;
      if (typeof s.ideas === 'string') s.ideas = [s.ideas]; s.ideas = arr(s.ideas || s.bullets || s.notes).map(x => (typeof x === 'string' ? x : str(x && (x.text || x.idea)))).filter(Boolean);
      if (typeof s.pitfalls === 'string') s.pitfalls = [s.pitfalls]; s.pitfalls = arr(s.pitfalls).map(str).filter(Boolean);
      if (!(obj(s.example) && s.example.p && s.example.s)) delete s.example;
      if (s.formulas && !Array.isArray(s.formulas)) delete s.formulas;
      delete s.bullets; delete s.notes; delete s.name; return s;
    });
    const mapSec = x => secMap[str(x)] || '';
    // units
    let units = arr(P.UNITS).filter(obj).map((u, i) => ({ n: Number(u.n) || Number(u.unit) || i + 1, title: str(u.title) || str(u.name) || `Unit ${Number(u.n) || i + 1}`, sections: arr(u.sections).map(mapSec).filter(Boolean), exam: str(u.exam) || undefined }));
    const seen = new Set(); units = units.filter(u => (seen.has(u.n) ? false : seen.add(u.n)));
    P.SECTIONS.forEach(s => { let u = units.find(x => x.n === s.unit); if (!u) { u = { n: s.unit, title: `Unit ${s.unit}`, sections: [] }; units.push(u); } if (!u.sections.includes(s.id)) u.sections.push(s.id); });
    units.forEach(u => { u.sections = u.sections.filter(id => P.SECTIONS.some(s => s.id === id && s.unit === u.n)); });
    P.UNITS = units.sort((a, b) => a.n - b.n);
    P.SECTIONS.forEach(s => { if (!str(s.label)) { const u = P.UNITS.find(x => x.n === s.unit); s.label = `${s.unit}.${u ? u.sections.indexOf(s.id) + 1 : 1}`; } });
    // exams: an exam without a real date cannot have a countdown
    const exIds = new Set(); let dropped = 0;
    P.EXAMS = arr(P.EXAMS).filter(obj).map((e, i) => { let eid = KEY.test(str(e.id)) ? str(e.id) : slug(e.name, `exam${i + 1}`); while (exIds.has(eid)) eid += 'b'; exIds.add(eid); e.id = eid; e.name = str(e.name) || `Exam ${i + 1}`; e.date = str(e.date).slice(0, 10); e.units = arr(e.units).map(Number).filter(n => P.UNITS.some(u => u.n === n)); e.sections = arr(e.sections).map(mapSec).filter(Boolean); const w = Number(e.weight); if (w > 0 && w <= 100) e.weight = Math.round(w * 10) / 10; else delete e.weight; e.covers = str(e.covers) || (e.units.length ? `Unit${e.units.length > 1 ? 's' : ''} ${e.units.join(', ')}` : 'the material before it'); if (e.endDate && !realDate(e.endDate)) delete e.endDate; ['dates', 'dateLabels', 'n'].forEach(k => delete e[k]); return e; })
      .filter(e => { if (realDate(e.date)) return true; dropped++; return false; });
    if (dropped) notes.push(`${dropped} exam${dropped === 1 ? ' had' : 's had'} no date in the answer and ${dropped === 1 ? 'is' : 'are'} left out.`);
    P.UNITS.forEach(u => { if (u.exam && !P.EXAMS.some(e => e.id === u.exam)) delete u.exam; });
    // calendar
    let badRows = 0;
    P.CALENDAR = arr(P.CALENDAR).map(r => (Array.isArray(r) ? r : obj(r) ? [r.date, r.type, r.title || r.name, r.section || r.sec] : null)).filter(Boolean).map(r => {
      const d = str(r[0]).slice(0, 10); const type = CAL[str(r[1]).toLowerCase()] || (str(r[1]) ? 'lecture' : 'lecture'); const title = str(r[2]) || (type === 'holiday' ? 'No class' : 'Class');
      if (!realDate(d)) { badRows++; return null; } const sec = r[3] ? mapSec(r[3]) : ''; return sec ? [d, type, title, sec] : [d, type, title];
    }).filter(Boolean).sort((a, b) => a[0].localeCompare(b[0]));
    if (badRows) notes.push(`${badRows} calendar row${badRows === 1 ? '' : 's'} without a real date ${badRows === 1 ? 'was' : 'were'} left out.`);
    delete P.RECURRING; delete P.VARIANTS;
    if (!obj(P.SEMESTER) || !realDate(P.SEMESTER.start) || !realDate(P.SEMESTER.end)) { const ds = P.CALENDAR.map(r => r[0]).concat(P.EXAMS.map(e => e.date)).sort(); P.SEMESTER = ds.length > 1 ? { start: ds[0], end: ds[ds.length - 1] } : termDates(P.term); if (!ds.length) notes.push(`The answer had no dates, so the term is set to ${P.SEMESTER.start} to ${P.SEMESTER.end}.`); }
    // grading
    const G = P.GRADING = obj(P.GRADING) ? P.GRADING : {}; const catIds = new Set();
    G.categories = arr(G.categories).filter(obj).map((c, i) => { let cid = KEY.test(str(c.id)) ? str(c.id) : slug(c.name, `cat${i + 1}`); while (catIds.has(cid)) cid += '2'; catIds.add(cid); return { id: cid, name: str(c.name) || `Category ${i + 1}`, weight: Number(c.weight) || 0 }; }).filter(c => c.weight > 0);
    if (!G.categories.length) { G.categories = [{ id: 'course', name: 'Course grade', weight: 100 }]; notes.push('The answer had no grading categories, so the grade calculator uses one overall grade.'); }
    G.scale = arr(G.scale).filter(obj).map(x => ({ letter: str(x.letter), min: Number(x.min) })).filter(x => x.letter && Number.isFinite(x.min)).sort((a, b) => b.min - a.min);
    if (!G.scale.length) { G.scale = [['A', 90], ['B', 80], ['C', 70], ['D', 60], ['F', 0]].map(([letter, min]) => ({ letter, min })); notes.push('The answer had no letter-grade scale, so A 90, B 80, C 70, D 60 is used.'); }
    if (G.options && !Array.isArray(G.options)) delete G.options;
    // flashcards
    const cardIds = new Set();
    P.FLASHCARDS = arr(P.FLASHCARDS).filter(obj).map((c, i) => { const f = str(c.f || c.front || c.q || c.term), b = str(c.b || c.back || c.a || c.definition); if (!f || !b) return null; let cid = KEY.test(str(c.id)) ? str(c.id) : `c${i + 1}`; while (cardIds.has(cid)) cid += 'x'; cardIds.add(cid); const sec = mapSec(c.sec || c.section); const s = sec && P.SECTIONS.find(x => x.id === sec); return Object.assign({ id: cid, unit: Number(c.unit) || (s ? s.unit : 1), f, b }, sec ? { sec } : {}); }).filter(Boolean);
    P.FORMULAS = arr(P.FORMULAS).filter(g => obj(g) && str(g.group)).map(g => ({ group: str(g.group), items: arr(g.items).filter(it => obj(it) && it.n && (it.t || it.d || it.c)) })).filter(g => g.items.length);
    if (!obj(P.PRACTICE)) delete P.PRACTICE; else Object.keys(P.PRACTICE).forEach(k => { const v = P.PRACTICE[k]; if (!exIds.has(k) || !obj(v) || !Array.isArray(v.problems)) { delete P.PRACTICE[k]; return; } v.title = str(v.title) || k; v.problems = v.problems.filter(p => obj(p) && p.q && p.s).map((p, i) => Object.assign(p, { n: i + 1 })); if (!v.problems.length) delete P.PRACTICE[k]; });
    if (!obj(P.CHECKLISTS)) delete P.CHECKLISTS; else Object.keys(P.CHECKLISTS).forEach(k => { if (!exIds.has(k) || !Array.isArray(P.CHECKLISTS[k])) delete P.CHECKLISTS[k]; });
    P.INFO = arr(P.INFO).filter(x => obj(x) && str(x.title) && str(x.html));
    // the question bank
    if (obj(P.QUIZ)) {
      const Q = P.QUIZ; let topics = Q.topics; if (Array.isArray(topics)) topics = Object.fromEntries(topics.filter(obj).map((t, i) => [str(t.id) || slug(t.label, `t${i + 1}`), t]));
      topics = obj(topics) ? topics : {}; const T = {}; const tMap = {};
      Object.entries(topics).forEach(([k, t], i) => { const tk = KEY.test(k) ? k : slug(k, `t${i + 1}`); tMap[k] = tk; const sec = mapSec((t && t.sec) || k); const s = sec && P.SECTIONS.find(x => x.id === sec); T[tk] = Object.assign({ unit: Number(t && t.unit) || (s ? s.unit : 1), label: str(t && t.label) || (s ? s.title : tk) }, sec ? { sec } : {}); });
      let badItems = 0;
      const qs = arr(Q.questions).filter(obj).map(q => {
        let tk = tMap[str(q.topic)] || str(q.topic); if (!T[tk]) { const sec = mapSec(q.topic); if (sec) { const s = P.SECTIONS.find(x => x.id === sec); T[sec] = { unit: s.unit, label: s.title, sec }; tk = sec; } else return null; }
        q.topic = tk;
        if (q.type === 'bank' || (!q.type && Array.isArray(q.items))) {
          q.type = 'bank';
          q.items = arr(q.items).map(it => Array.isArray(it) ? it : obj(it) ? [it.q || it.question || it.prompt, it.a || it.answer || it.correct, it.wrong || it.distractors || it.options, it.why || it.explanation || it.explain || ''] : null)
            .filter(it => { const ok = it && str(it[0]) && it[1] != null && str(it[1]) !== '' && Array.isArray(it[2]) && it[2].filter(x => str(x) && str(x) !== str(it[1])).length; if (!ok) badItems++; return ok; })
            .map(it => [str(it[0]), str(it[1]), it[2].map(str).filter(x => x && x !== str(it[1])).slice(0, 6), str(it[3])]);
          return q.items.length ? q : null;
        }
        if (q.type === 'mc') return q.prompt && q.answer != null && arr(q.distractors).length ? q : null;
        if (q.type === 'table') return Array.isArray(q.columns) && Array.isArray(q.rows) && Array.isArray(q.asks) ? q : null;
        return null;   // calculated questions need the expression language; the instructions only ask for multiple choice
      }).filter(Boolean);
      if (badItems) notes.push(`${badItems} question${badItems === 1 ? ' was' : 's were'} incomplete and left out.`);
      const usedT = new Set(qs.map(q => q.topic)); Object.keys(T).forEach(k => { if (!usedT.has(k)) delete T[k]; });
      if (qs.length) P.QUIZ = Object.assign({ topics: T, questions: qs }, Q.hint ? { hint: str(Q.hint) } : {}); else { delete P.QUIZ; notes.push('The answer had no usable questions, so the class has no quizzer.'); }
    } else delete P.QUIZ;
    return { pack: P, notes };
  }
  /* ============================================================
     The plans: Mathub Pro (Bo writes classes from a syllabus; making and adding classes) and Mathub Max (Pro,
     plus Ask Bo, the AI tutor). One RevenueCat customer per account (mh_<id>) with the entitlements "pro" and "max";
     a Max product unlocks both.
     ============================================================ */
  const BILLING = { ios: '', android: '', pro: 'pro', max: 'max' };   // RevenueCat public SDK keys (appl_… and goog_…): public by design, safe in the app
  const PLANS = {
    pro: { name: 'Mathub Pro', short: 'Pro', web: '$15', lines: ['Drop in any syllabus and Bo writes the whole class: notes, flashcards, practice questions, its calendar and grades', 'Classes your classmates share, class files, and classes made with the AI you already use'] },
    max: { name: 'Mathub Max', short: 'Max', web: '$50', lines: ['Everything in Pro', 'Ask Bo, your AI tutor, any question, any time. He knows your syllabus, your exams and what you are stuck on', NATIVE ? 'Send him a photo of a problem and he walks you through it' : 'Talk with him out loud, or send a photo of a problem, and he walks you through it'] }
  };
  const RANK = { '': 0, pro: 1, max: 2 };
  const subKey = () => ((global.MATHUB_BILLING_KEYS || BILLING)[ANDROID ? 'android' : 'ios']) || '';
  const cancelled = e => !!(e && (e.userCancelled || (e.data && e.data.userCancelled) || String(e.code) === '1' || /cancel/i.test(e.message || '')));
  const pendingPay = e => !!(e && (String(e.code) === '20' || /pending/i.test(e.message || '')));
  const subChanged = () => document.dispatchEvent(new CustomEvent('mathub-sub'));
  const planOf = s => (s && s.on && (!s.until || Date.parse(s.until) > Date.now()) ? (s.plan === 'max' ? 'max' : 'pro') : '');

  /* in the apps: the App Store or Google Play, through RevenueCat. The answer is kept so classes stay open offline until the paid period ends. */
  function storeSub() {
    const S = {
      ok: false, pkgs: null, manage: null, who: '', ready: Promise.resolve(),
      status() { return settings().sub || { on: false }; },
      plan() { return planOf(S.status()); },
      active() { return !!S.plan(); },
      init() {
        S.ready = (async () => {
          const p = N.purchases; const key = subKey(); if (!p || !key) return;
          try { await p.configure({ apiKey: key }); S.ok = true; } catch (e) { console.warn('Mathub plans: the store connection did not start', e); return; }
          try { await p.addCustomerInfoUpdateListener(info => S.apply(info)); } catch (e) {}
        })();
        S.ready.then(() => S.refresh()); N.onResume(() => S.refresh());
      },
      /* the plan follows the Mathub account (RevenueCat customer mh_<id>), so it also works on the website and on other devices */
      async identify(u) {
        await S.ready; if (!S.ok || !u) return; const id = 'mh_' + u.id; if (S.who === id) return;
        try { const r = await N.purchases.logIn({ appUserID: id }); S.who = id; S.apply(r && r.customerInfo); } catch (e) {}
      },
      async refresh() { await S.ready; if (!S.ok) return S.active(); try { const r = await N.purchases.getCustomerInfo(); S.apply(r.customerInfo); } catch (e) {} return S.active(); },
      apply(info) {
        if (!info) return; const was = S.plan(); const act = (info.entitlements && info.entitlements.active) || {};
        const e = act[BILLING.max] || act[BILLING.pro]; const plan = act[BILLING.max] ? 'max' : act[BILLING.pro] ? 'pro' : '';
        setSetting('sub', e ? { on: true, plan, until: e.expirationDate || null, renews: e.willRenew !== false, product: e.productIdentifier || '', at: Date.now() } : { on: false, at: Date.now() });
        S.manage = info.managementURL || null;
        if (was !== S.plan()) subChanged();
      },
      /* the two packages of the current offering: identifiers "pro" and "max" (or products named so) */
      async offer() {
        await S.ready;
        if (!S.ok) throw Object.assign(new Error('Subscribing is not available in this version of the app.'), { off: true });
        if (S.pkgs) return S.pkgs;
        const o = await N.purchases.getOfferings(); const all = (o && o.current && o.current.availablePackages) || [];
        const find = k => all.find(p => p.identifier === k) || all.find(p => new RegExp(`(^|_)${k}(_|:|$)`).test((p.product && p.product.identifier) || ''));
        const pkgs = { pro: find('pro'), max: find('max') };
        if (!pkgs.pro && !pkgs.max) throw new Error(`Mathub Pro and Max are not on sale in ${STORE} yet.`);
        S.pkgs = pkgs; return pkgs;
      },
      price(plan) { const p = S.pkgs && S.pkgs[plan]; return (p && p.product && p.product.priceString) || ''; },
      has(plan) { return !!(S.pkgs && S.pkgs[plan]); },
      async buy(plan) {
        const pkgs = await S.offer(); const pkg = pkgs[plan]; if (!pkg) throw new Error(`${PLANS[plan].name} is not on sale in ${STORE} yet.`);
        const o = { aPackage: pkg }; const cur = S.status();
        if (ANDROID && cur.on && cur.product && cur.plan !== plan) o.googleProductChangeInfo = { oldProductIdentifier: cur.product };   // Google Play moves the subscription to the new plan
        const r = await N.purchases.purchasePackage(o); S.apply(r.customerInfo); return RANK[S.plan()] >= RANK[plan];
      },
      async restore() { await S.ready; if (!S.ok) throw new Error('Subscribing is not available in this version of the app.'); const r = await N.purchases.restorePurchases(); S.apply(r.customerInfo); return S.active(); },
      manageUrl() { return S.manage || (ANDROID ? 'https://play.google.com/store/account/subscriptions?package=space.mathub.app' : 'https://apps.apple.com/account/subscriptions'); },
      noneFound: () => `No Mathub Pro or Max subscription was found for this ${ANDROID ? 'Google' : 'Apple'} account.`
    };
    return S;
  }

  /* on the website: the account's plan, which the server reads from RevenueCat (api: create_status). Paying opens
     RevenueCat's checkout (Stripe) in a new tab; this page notices when the payment has gone through. */
  function webSub() {
    const KEY = 'mh-create-web';
    const S = {
      ok: false, info: null,
      status() { const v = lsGet(KEY, null); const u = user(); return v && u && v.uid === u.id ? v : { on: false }; },
      plan() { return planOf(S.status()); },
      active() { return !!S.plan(); },
      init() {
        // back from the checkout (RevenueCat can send buyers to #/create?paid=1), or back in this tab
        const paid = () => /[?&]paid=1\b/.test(location.hash);
        addEventListener('focus', () => { if (S.waiting || paid()) S.refresh(true).catch(() => {}); });
        addEventListener('hashchange', () => { if (paid()) S.refresh(true).catch(() => {}); });
        if (paid()) S.wantFresh = true;
      },
      async identify(u) { if (u) return S.refresh(!!S.wantFresh).catch(() => {}).then(() => { S.wantFresh = false; }); S.info = null; S.ok = false; },
      async refresh(force) {
        const u = user(); if (!u) { S.info = null; S.ok = false; return false; }
        const was = S.plan();
        const r = await api('create_status' + (force ? '&refresh=1' : ''));
        S.info = r; S.ok = !!r.configured;
        lsSet(KEY, { uid: u.id, on: !!r.active, plan: r.plan || '', until: r.until || null, renews: r.renews !== false, store: r.store || '', manage: r.manage_url || '', granted: !!r.granted, paid: r.paid || '', paidRenews: r.paid_renews !== false, at: Date.now() });
        if (was !== S.plan()) subChanged(); else if (S.onInfo) S.onInfo();   // the same plan, maybe cancelled or turned back on
        return S.active();
      },
      async offer() {
        if (!user()) throw Object.assign(new Error('Sign in to subscribe. Your plan belongs to your account.'), { signin: true });
        if (!S.info) await S.refresh();
        if (!S.info || !S.info.configured) throw Object.assign(new Error('Subscribing on the website is not available yet. It is coming soon.'), { off: true });
        return S.info;
      },
      price(plan) { return (S.info && S.info.prices && S.info.prices[plan]) || PLANS[plan].web; },
      has(plan) { return !!(S.info && S.info.buy && S.info.buy[plan]); },
      checkoutUrl(plan) { return (S.info && S.info.buy && S.info.buy[plan]) || ''; },
      async restore() { if (!user()) throw Object.assign(new Error('Sign in first.'), { signin: true }); return S.refresh(true); },
      manageUrl() { return S.status().manage || ''; },
      noneFound: () => 'No Mathub Pro or Max subscription was found for this account yet. If you just paid, wait a minute and check again.'
    };
    return S;
  }
  const Sub = App.subscription = NATIVE ? storeSub() : webSub();
  Sub.isMax = () => Sub.plan() === 'max';
  Sub.planName = () => (Sub.plan() ? PLANS[Sub.plan()].name : '');
  App.plans = PLANS;
  Sub.init();

  // classes made before subscriptions existed stay free (runs once, on the first start of this version)
  if (!settings().subMigrated) { const list = readIdx(); if (list.length) writeIdx(list.map(e => Object.assign({}, e, { free: true }))); setSetting('subMigrated', 1); }
  const freeClass = id => { const e = Mine.entry(id); return !!(e && e.free); };
  const locked = App.classLocked = id => local.has(id) && !freeClass(id) && !Sub.active();

  /* the account decides which classes and which plan this device or browser shows */
  let lastUid = null;
  if (App.auth && App.auth.onChange) App.auth.onChange(() => {
    const a = App.auth; const u = user(); const uid = u ? u.id : null;
    if (!u && a.mode === 'server' && !a.user && !NATIVE && readIdx().length) wipeHere().then(() => App.rerender());   // signed out on the website
    if (uid === lastUid) return; lastUid = uid;
    Sub.identify(u);
    if (u) Sync.run(true);
  });
  if (NATIVE) N.onResume(() => Sync.run());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.run(); });

  /* ---------- the paywall: the two plans, their prices and the renewal terms. Resolves true once the plan needed is on. ----------
     o.need: 'pro' (making or adding a class; both plans are offered) or 'max' (Bo; only Max). o.code, o.reason: why it opened. */
  function paywall(o = {}) {
    return new Promise(resolve => {
      const old = $('#paywall'); if (old) old.remove();
      const need = o.need === 'max' ? 'max' : 'pro'; const have = Sub.plan();
      const what = o.code ? esc(o.code) : '';
      const why = o.reason === 'locked' ? `${what} is locked because your plan is off. Everything in it is still saved ${WHERE}.` : o.reason === 'shared' ? `Adding ${what} to your classes needs Mathub Pro or Max.` : o.reason === 'bo' ? (have === 'pro' ? 'Bo is part of Mathub Max. Move up from Pro to talk with him.' : 'Talking with Bo, your AI tutor, is part of Mathub Max.') : o.reason === 'bo-class' ? 'Bo writing your class from the syllabus is part of Mathub Pro and Max.' : what ? `Adding ${what} needs Mathub Pro or Max.` : 'Bo writes your classes with Mathub Pro. Max adds Ask Bo, your AI tutor.';
      const plans = need === 'max' || have === 'pro' ? ['max'] : ['pro', 'max']; let pick = plans[0];
      const el = document.createElement('div'); el.id = 'paywall'; el.className = NATIVE ? 'modal-backdrop sheet-backdrop' : 'modal-backdrop pw-backdrop';
      const cancelWhere = NATIVE ? `your ${ANDROID ? 'Google Play' : 'Apple ID'} subscriptions` : 'Your plan (in your account menu), or with the link in your receipt email';
      const fine = p => `Renews every month${p ? ` at ${p}` : ''} until you cancel. Cancel any time in ${cancelWhere}${NATIVE ? ', at least 24 hours before it renews' : ''}.${NATIVE ? '' : ' Payment is handled by Stripe.'} The example class stays free. `;
      const card = k => `<button type="button" class="pw-plan${k === pick ? ' on' : ''}" data-plan="${k}" role="radio" aria-checked="${k === pick}"><span class="pw-plan-h"><b>${PLANS[k].name}</b><span class="pw-plan-price" data-price="${k}">${esc(PLANS[k].web)}<small> a month</small></span></span><ul>${PLANS[k].lines.map(l => `<li>${icon('check', 15)}<span>${esc(l)}</span></li>`).join('')}</ul></button>`;
      el.innerHTML = `<div class="${NATIVE ? 'sheet' : 'modal'} pw" role="dialog" aria-modal="true" aria-labelledby="pw-h">${NATIVE ? '<div class="sheet-grab" aria-hidden="true"></div>' : ''}
        <div class="pw-top"><span class="pw-bo" aria-hidden="true">${App.bobcatSvg ? App.bobcatSvg(64) : ''}</span><div class="pw-title"><h2 id="pw-h">${plans.length === 1 ? (have === 'pro' ? 'Move up to Max' : 'Mathub Max') : 'Pick your plan'}</h2><p class="pw-price" id="pw-price">${NATIVE ? `Getting the prices from ${STORE}…` : 'Checking your account…'}</p></div><button class="icon-btn" data-action="close" aria-label="Close">${icon('x', 18)}</button></div>
        <p class="pw-why">${why}</p>
        <div class="pw-plans${plans.length === 1 ? ' one' : ''}" role="radiogroup" aria-label="Plans">${plans.map(card).join('')}</div>
        <p class="pw-err" id="pw-err" role="alert" hidden></p><p class="pw-wait" id="pw-wait" role="status" hidden></p>
        <div class="pw-acts"><button type="button" class="btn primary lg" data-action="pw-buy" disabled>Subscribe</button><button type="button" class="btn ghost" data-action="pw-restore">${NATIVE ? 'Restore purchases' : 'I already subscribed'}</button></div>
        <p class="pw-fine" id="pw-fine"><span>${fine('')}</span>${NATIVE ? '' : 'If you subscribe in the Mathub app with this account, it works here too. '}${!NATIVE && have === 'pro' ? 'Moving up on the website: cancel Pro in Your plan so you are not billed twice. ' : ''}<a href="#/policy/create">Terms of Use</a> · <a href="#/policy/privacy">Privacy Policy</a></p></div>`;
      document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('open'));
      let buy = $('[data-action="pw-buy"]', el); const rest = $('[data-action="pw-restore"]', el), err = $('#pw-err', el), wait = $('#pw-wait', el);
      let done = false, poll = null, ready = false;
      const enough = () => RANK[Sub.plan()] >= RANK[need];
      const finish = v => { if (done) return; done = true; clearInterval(poll); Sub.waiting = false; document.removeEventListener('keydown', onKey); document.removeEventListener('mathub-sub', onSub); el.classList.remove('open'); setTimeout(() => el.remove(), Plat.reduceMotion() ? 0 : 220); resolve(v); };
      const onKey = e => { if (e.key === 'Escape') finish(false); }; document.addEventListener('keydown', onKey);
      const thanks = () => `${Sub.planName()} is on. Thank you!`;
      const onSub = () => { if (enough()) { Plat.haptic('success'); toast(thanks(), 3500); finish(true); } }; document.addEventListener('mathub-sub', onSub);
      const fail = msg => { err.textContent = msg; err.hidden = !msg; };
      // the button names the plan picked and its price; on the website it is a link to that plan's checkout
      const paint = () => {
        const p = Sub.price(pick); $$('[data-plan]', el).forEach(b => { const on = b.dataset.plan === pick; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
        $('#pw-fine span', el).textContent = fine(p);
        if (!ready) return;
        buy.textContent = `${have === 'pro' && pick === 'max' ? 'Move up to Max' : `Get ${PLANS[pick].short}`}${p ? ` for ${p} a month` : ''}`;
        if (!NATIVE) { buy.href = Sub.checkoutUrl(pick); }
        buy.disabled = !Sub.has(pick); if (!NATIVE && !Sub.has(pick)) buy.removeAttribute('href');
      };
      const showPrice = () => Sub.offer().then(() => {
        ready = true; $$('[data-price]', el).forEach(x => { const p = Sub.price(x.dataset.price); if (p) x.innerHTML = `${esc(p)}<small> a month</small>`; });
        $('#pw-price', el).textContent = plans.length === 1 ? `${Sub.price('max') || PLANS.max.web} a month` : `Pro ${Sub.price('pro') || PLANS.pro.web} · Max ${Sub.price('max') || PLANS.max.web} a month`;
        if (!NATIVE) { const a = document.createElement('a'); a.className = buy.className; a.dataset.action = 'pw-buy'; a.target = '_blank'; a.rel = 'noopener'; buy.replaceWith(a); buy = a; }
        paint();
      }).catch(e => {
        if (e.signin) { $('#pw-price', el).textContent = 'Sign in to subscribe'; buy.textContent = 'Log in to subscribe'; buy.disabled = false; buy.dataset.signin = '1'; rest.hidden = true; return; }
        $('#pw-price', el).textContent = e.off ? 'Not available yet' : 'Prices unavailable'; fail(e.off ? e.message : NATIVE ? `Mathub could not reach ${STORE}. Check your connection and try again.` : e.message);
        buy.disabled = !!e.off; buy.textContent = e.off ? 'Subscribe' : 'Try again'; if (!e.off) buy.dataset.retry = '1';
      });
      showPrice();
      el.addEventListener('click', async e => {
        if (e.target === el || e.target.closest('[data-action="close"]')) return finish(false);
        const pl = e.target.closest('[data-plan]'); if (pl) { pick = pl.dataset.plan; Plat.haptic('select'); paint(); return; }
        const b = e.target.closest('[data-action="pw-buy"]');
        if (e.target.closest('a[href]') && !b) return finish(false);
        if (b) {
          if (b.dataset.retry) { e.preventDefault(); delete b.dataset.retry; fail(''); b.disabled = true; b.textContent = 'Subscribe'; showPrice(); return; }
          if (b.dataset.signin) { e.preventDefault(); finish(false); signIn('login'); return; }
          if (!NATIVE) {   // the checkout opens in a new tab (the link itself); this sheet waits for the payment
            if (!b.getAttribute('href')) { e.preventDefault(); return; }
            fail(''); Sub.waiting = true; wait.hidden = false; wait.innerHTML = `${icon('clock', 15)} Finish paying in the new tab. ${PLANS[pick].name} turns on here as soon as the payment goes through.`; rest.textContent = 'I paid: check now';
            clearInterval(poll); let n = 0; poll = setInterval(() => { if (++n > 48 || done) { clearInterval(poll); return; } Sub.refresh(true).catch(() => {}); }, 10000);
            return;
          }
          fail(''); b.disabled = true; rest.disabled = true; const label = b.textContent; b.textContent = `Waiting for ${STORE}…`;
          try { const on = await Sub.buy(pick); if (on && enough()) { Plat.haptic('success'); toast(thanks(), 3500); return finish(true); } fail('The purchase went through but your plan is not on yet. Tap Restore purchases in a minute.'); }
          catch (x) { if (!cancelled(x)) fail(pendingPay(x) ? `Your payment is pending with ${STORE}. Your plan turns on as soon as it goes through.` : (x.message || 'The purchase did not go through. Nothing was charged.')); }
          b.disabled = false; rest.disabled = false; b.textContent = label; return;
        }
        if (e.target.closest('[data-action="pw-restore"]')) {
          fail(''); rest.disabled = true;
          try { await Sub.restore(); if (enough()) { Plat.haptic('success'); toast(`${Sub.planName()} is on.`, 3000); return finish(true); } fail(Sub.active() && need === 'max' ? `You have ${Sub.planName()}. Bo needs Mathub Max.` : Sub.noneFound()); }
          catch (x) { if (x.signin) { finish(false); signIn('login'); return; } fail(x.message || `Mathub could not reach ${STORE}. Check your connection and try again.`); }
          rest.disabled = false;
        }
      });
    });
  }
  App.paywall = paywall;

  /* ---------- a locked class: what it is, that it is kept, and how to open it again ---------- */
  /* each class's colours, read from the site's own class rules (built-in classes, packs and classes students made) */
  const probe = (() => { let el = null; return id => { if (!el) { el = document.createElement('i'); el.hidden = true; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); } el.className = 'course-card ' + id; const cs = getComputedStyle(el); const v = n => cs.getPropertyValue(n).trim(); return { c: v('--accent'), ink: v('--accent-ink') || '#fff', soft: v('--accent-soft'), line: v('--accent-line'), deep: v('--accent-deep') || v('--accent') }; }; })();
  const classStyle = App.classStyle = id => { const k = probe(id); return k.c ? `--cc:${k.c};--cc-ink:${k.ink};--cc-soft:${k.soft};--cc-line:${k.line};--cc-deep:${k.deep}` : ''; };
  function lockHtml(C) {
    return `<div class="lock-wrap"><div class="sublock" style="${classStyle(C.id)}"><span class="lock-ic" aria-hidden="true">${icon('lock', 30)}</span>
      <h1 class="lock-h">${esc(C.short || C.code)} is locked</h1>
      <p>${esc(C.name)} is a class you made from a syllabus. Classes you make need Mathub Pro or Max, and your plan is off right now. Everything in it, your progress included, is still saved ${WHERE} and opens again when you subscribe.</p>
      <div class="lock-acts"><button type="button" class="btn primary lg" data-lock="buy">Subscribe to open it</button><button type="button" class="btn" data-lock="restore">${NATIVE ? 'Restore purchases' : 'I already subscribed'}</button><a class="btn ghost" href="#/">Back to your classes</a></div></div></div>`;
  }
  function wireLock(el, C) {
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-lock]'); if (!b) return;
      if (b.dataset.lock === 'buy') { if (await paywall({ reason: 'locked', code: C.short || C.code })) App.rerender(); return; }
      b.disabled = true; try { if (await Sub.restore()) { toast(`${Sub.planName()} is on.`, 3000); App.rerender(); } else toast(Sub.noneFound(), 4500); } catch (x) { if (x.signin) signIn('login'); else toast(x.message, 4500); } b.disabled = false;
    });
  }
  App.createLock = { html: lockHtml, wire: wireLock, where: WHERE, restoreLabel: NATIVE ? 'Restore purchases' : 'I already subscribed' };
  App.courseGate = (id, root) => { if (!locked(id)) return false; const C = Courses[id]; document.title = `${C.short || C.code} is locked · Mathub`; root.innerHTML = lockHtml(C); wireLock(root, C); return true; };
  // when the subscription turns on or off, the page in front of the student follows (not the Create page: a class may be waiting to be added)
  document.addEventListener('mathub-sub', () => { const m = /^#\/([^/?]*)/.exec(location.hash || '#/'); const first = m ? m[1] : ''; if (!first || first === 'settings' || first === 'plan' || local.has(first)) App.rerender(); });

  /* ============================================================
     #/create
     ============================================================ */
  let pending = null;   // the checked class waiting for "Add" (each result keeps its own copy when it is wired)
  let pendingFree = false;   // the example class is the one class anyone can add for free
  /* the plan line under the title: what the plan gives here, and the way up */
  const subLine = () => {
    const p = Sub.plan();
    if (p === 'max') return `${icon('check', 15)} Mathub Max is on: Bo writes your classes, and you can <a href="#/tutor">ask him anything</a>.`;
    if (p === 'pro') return `${icon('check', 15)} Mathub Pro is on: Bo writes your classes. <button type="button" class="linkbtn" data-action="sub-max">Max</button> adds Ask Bo, your AI tutor.`;
    return `Bo writing your class is part of <button type="button" class="linkbtn" data-action="sub">Mathub Pro</button> (<span class="mk-sub-price">${esc(PLANS.pro.web)} a month</span>). <button type="button" class="linkbtn" data-action="sub-max">Max</button> adds Ask Bo, your AI tutor. The example class is free.`;
  };
  App.views.create = {
    title: 'Create a class',
    render(root) {
      const size = settings().mkSize === 'short' ? 'short' : 'full'; pending = null;
      const u = user(); const webOut = !NATIVE && !u;
      root.innerHTML = `<div class="landing-wrap mk-page">
        <header class="landing-top mk-head"><div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Create a class</h1><p class="muted mk-lede">Any class with a syllabus becomes a Mathub class: notes, flashcards, practice questions, its calendar and your grade calculator. ${NATIVE ? `It is saved on this ${DEVICE}${u ? ' and with your account' : ''}, and it works offline.` : 'It is saved with your account, so it is also in the Mathub apps when you sign in there.'}</p><p class="mk-sub" id="mk-sub">${subLine()}</p></div><div class="row gap-sm"><a class="btn" href="#/">${icon('left', 14)} Your classes</a></div></header>
        ${webOut ? `<div class="callout mk-signin" id="mk-signin"><b>Sign in to add a class.</b> Classes you make are saved with your Mathub account, so they are on every device where you sign in, the apps included. <span class="row gap-sm mt-1" style="flex-wrap:wrap"><button type="button" class="btn sm primary" data-action="login">Log in</button><button type="button" class="btn sm" data-action="signup">Create an account</button></span></div>` : ''}
        ${boCardHtml()}
        <section class="mk-ways" aria-labelledby="mk-ways-h"><h2 class="sec-title" id="mk-ways-h">Other ways to add a class</h2>
          <div class="panel mk-ways-list">
            <div class="mk-way"><span class="mk-way-ic" aria-hidden="true">${icon('play', 18)}</span><div class="mk-way-t"><b>Try the example class</b><span>See what a finished class looks like. It is free.</span></div><div class="mk-way-act"><button type="button" class="btn" data-action="example">Open the example</button></div></div>
            <div class="mk-way"><span class="mk-way-ic" aria-hidden="true">${icon('link', 18)}</span><div class="mk-way-t"><b>Open a shared class</b><span>The 8-character code from a classmate's link.</span></div><form class="mk-way-act mk-code-form" id="mk-code-form"><label class="sr-only" for="mk-code">Share code</label><input class="input mono" id="mk-code" maxlength="40" placeholder="K7P2QX9M" autocapitalize="characters" autocomplete="off" spellcheck="false"><button class="btn" type="submit">Open</button></form></div>
            <div class="mk-way"><span class="mk-way-ic" aria-hidden="true">${icon('file', 18)}</span><div class="mk-way-t"><b>Import a class file</b><span>A .mathub.json file someone sent you.</span></div><div class="mk-way-act"><label class="btn mk-file">${icon('upload', 15)} Choose a file<input type="file" id="mk-file" class="sr-only" accept=".json,application/json"></label></div></div>
            <details class="mk-way mk-diy" id="mk-diy"><summary><span class="mk-way-ic" aria-hidden="true">${icon('copy', 18)}</span><span class="mk-way-t"><b>Use the AI you already use</b><span>Copy Mathub's instructions into any AI chat, then paste its answer here.</span></span><span class="mk-diy-chev" aria-hidden="true">${icon('chevron', 18)}</span></summary>
              <ol class="mk-steps">
                <li class="mk-step"><span class="mk-n" aria-hidden="true">1</span><div class="mk-body"><h3 class="mk-h">Copy the instructions</h3>
                  <p>Mathub writes instructions that tell an AI exactly how to turn a syllabus into a class.</p>
                  <div class="mk-size" role="radiogroup" aria-label="How long should the answer be?"><button type="button" role="radio" class="chip toggle${size === 'full' ? ' on' : ''}" aria-checked="${size === 'full'}" data-action="size" data-size="full">Full class</button><button type="button" role="radio" class="chip toggle${size === 'short' ? ' on' : ''}" aria-checked="${size === 'short'}" data-action="size" data-size="short">Shorter answer</button><span class="small muted">Choose “Shorter answer” if your AI stops partway through long replies.</span></div>
                  <div class="row gap-sm mt-2" style="flex-wrap:wrap"><button type="button" class="btn primary" data-action="copy-prompt">${icon('copy', 15)} Copy instructions</button><button type="button" class="btn" data-action="show-prompt" aria-expanded="false" aria-controls="mk-prompt">${icon('eye', 15)} Read them</button></div>
                  <pre class="mk-prompt" id="mk-prompt" hidden></pre></div></li>
                <li class="mk-step"><span class="mk-n" aria-hidden="true">2</span><div class="mk-body"><h3 class="mk-h">Ask your AI</h3>
                  <p>Open the AI chat you use${NATIVE ? ', in its app or on the web' : ' in another tab'}. Paste the instructions, attach your syllabus (a PDF, a photo of it, or its text) and send.</p>
                  <p class="small muted">${icon('shield', 13)} This way Mathub never sees or sends your syllabus. You choose which AI to give it to, and that AI's own privacy terms apply to what you send it.</p></div></li>
                <li class="mk-step"><span class="mk-n" aria-hidden="true">3</span><div class="mk-body"><h3 class="mk-h">Paste the answer</h3>
                  <p>Copy the AI's whole answer and paste it here. Mathub checks it, fixes small slips and shows you the class before adding it.</p>
                  <label class="sr-only" for="mk-text">The AI's answer</label>
                  <textarea class="input mono mk-text" id="mk-text" rows="7" placeholder="Paste the AI's answer here" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"></textarea>
                  <div class="row gap-sm mt-1" style="flex-wrap:wrap"><button type="button" class="btn" data-action="paste">${icon('download', 15)} Paste</button><button type="button" class="btn primary" data-action="check">${icon('check', 15)} Check the answer</button><button type="button" class="btn ghost" data-action="clear">Clear</button></div>
                  <div id="mk-result" class="mk-result" aria-live="polite"></div></div></li>
              </ol>
            </details>
          </div>
          <div class="mk-result" id="mk-alt-result" aria-live="polite"></div>
        </section>
        <section class="land-sec mk-mine-sec" aria-labelledby="mk-mine-h"><h2 class="sec-title" id="mk-mine-h">Classes you created</h2><div id="mk-mine"></div></section>
      </div>`;
      const ta = $('#mk-text', root), out = $('#mk-result', root), alt = $('#mk-alt-result', root);
      wireBo($('#mk-bo', root));
      paintMine($('#mk-mine', root));
      if (!Sub.active()) Sub.offer().then(() => { const p = Sub.price('pro'); const el = $('.mk-sub-price', root); if (p && el) el.textContent = `${p} a month`; }).catch(() => {});
      const check = () => { pending = null; pendingFree = false; out.innerHTML = resultHtml(ta.value); wireResult(out, ta); };
      const showAlt = (text, free) => { pending = null; out.innerHTML = ''; alt.innerHTML = resultHtml(text); pendingFree = !!free; wireResult(alt, null); alt.scrollIntoView({ block: 'nearest', behavior: Plat.reduceMotion() ? 'auto' : 'smooth' }); };
      ta.addEventListener('paste', () => setTimeout(check, 30));
      bind(root, {
        size: b => { setSetting('mkSize', b.dataset.size); $$('[data-action="size"]', root).forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); }); const pre = $('#mk-prompt', root); if (!pre.hidden) pre.textContent = prompt(b.dataset.size); },
        'copy-prompt': async () => { try { await Plat.copy(prompt(settings().mkSize === 'short' ? 'short' : 'full')); Plat.haptic('success'); toast('Instructions copied. Paste them into your AI with your syllabus.', 3500); } catch (e) { toast(e.message); } },
        'show-prompt': b => { const pre = $('#mk-prompt', root); pre.hidden = !pre.hidden; b.setAttribute('aria-expanded', String(!pre.hidden)); if (!pre.hidden) pre.textContent = prompt(settings().mkSize === 'short' ? 'short' : 'full'); },
        paste: async () => { try { const t = await Plat.paste(); if (!t) { toast('The clipboard is empty. Copy the AI’s answer first.'); return; } ta.value = t; check(); } catch (e) { toast(NATIVE ? e.message : 'Click in the box and press Ctrl+V (⌘V on a Mac) to paste.', 4000); ta.focus(); } },
        check,
        clear: () => { ta.value = ''; out.innerHTML = ''; pending = null; ta.focus(); },
        sub: async () => { if (await paywall()) App.rerender(); },
        'sub-max': async () => { if (await paywall({ need: 'max', reason: 'bo' })) App.rerender(); },
        login: () => signIn('login'), signup: () => signIn('signup'),
        example: async b => { b.disabled = true; try { const t = await (await fetch('assets/app-sample-class.json')).text(); showAlt(t, true); } catch (e) { toast('The example could not be opened.'); } b.disabled = false; }
      });
      $('#mk-file', root).addEventListener('change', async e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return; if (f.size > 3e6) { toast('That file is too large to be a class.'); return; } showAlt(await f.text()); });
      $('#mk-code-form', root).addEventListener('submit', e => { e.preventDefault(); const c = codeOf($('#mk-code', root).value); if (!c) { toast('A share code has 8 letters and numbers, like K7P2QX9M.', 4000); return; } location.hash = '#/c/' + c; });
    }
  };
  /* "K7P2-QX9M", "k7p2qx9m" or a whole link: the 8-character code in it */
  const codeOf = v => { const s = String(v || '').trim(); const m = /#\/c\/([A-Za-z0-9-]+)/.exec(s); const c = (m ? m[1] : s).replace(/[^A-Za-z0-9]/g, '').toUpperCase(); return /^[A-Z0-9]{8}$/.test(c) ? c : ''; };

  /* the class, as it will look: its colour, code and term, what is in it and its exam dates */
  function previewHtml(pack, v, notes, action) {
    const st = v.stats || {}; const chip = (n, l) => n ? `<span class="chip">${n} ${l}</span>` : '';
    const later = (notes || []).concat(v.warnings.filter(w => !/^Unknown key/.test(w)));
    const exams = (pack.EXAMS || []).slice(0, 6);
    return `<div class="mk-preview" style="--mk:${esc(pack.color.light)}">
      <div class="mk-cover"><span class="mk-code">${esc(pack.code)}</span><span class="mk-term">${esc(pack.term)}</span></div>
      <div class="mk-pv-body"><h3 class="mk-pv-name">${esc(pack.name)}</h3>
        <div class="row gap-sm mk-chips" style="flex-wrap:wrap">${chip(st.sections, st.sections === 1 ? 'topic' : 'topics')}${chip(st.flashcards, 'flashcards')}${chip(st.bankItems || st.questions, 'practice questions')}${chip(st.exams, st.exams === 1 ? 'exam' : 'exams')}${chip(st.calendar, 'calendar dates')}</div>
        ${exams.length ? `<ul class="mk-exams">${exams.map(e => `<li><b>${esc(e.name)}</b> · ${esc(fmtDay(e.date))}</li>`).join('')}</ul>` : '<p class="small muted">No exam dates in the syllabus.</p>'}
        ${later.length ? `<details class="mk-notes"><summary>${later.length} note${later.length === 1 ? '' : 's'} about this class</summary><ul class="mk-list">${later.slice(0, 12).map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
        <p class="small muted">Written by an AI from a syllabus: check dates and grading against the syllabus itself.</p>
        ${action}</div></div>`;
  }
  function resultHtml(text) {
    const x = extract(text);
    const copyBtn = msg => `<button type="button" class="btn sm" data-copy="${esc(msg)}">${icon('copy', 13)} Copy a message for your AI</button>`;
    if (x.error === 'empty') return `<p class="small muted">Paste the AI's answer first.</p>`;
    if (x.error === 'none') return `<div class="callout warn"><b>No class in that text.</b> Paste the AI's whole answer, including the part that starts with <code>{</code>. If it only wrote a summary, send it the instructions again.</div>`;
    if (x.error === 'cut') return `<div class="callout warn"><b>The answer stops before the end.</b> The AI ran out of room partway through. Send it this message, or choose “Shorter answer” in step 1 and start again.<div class="mt-1">${copyBtn(cutPrompt())}</div></div>`;
    if (x.error === 'syntax') { const msg = `Mathub could not read your JSON: ${x.message}${x.near ? ` (near: ${x.near})` : ''}. Send the complete corrected JSON again, in one \`\`\`json code block and nothing else.`; return `<div class="callout warn"><b>The answer has a typo in it</b>, so it cannot be read${x.near ? `, near “${esc(x.near.slice(0, 60))}”` : ''}. Send the AI this message and paste its new answer.<div class="mt-1">${copyBtn(msg)}</div></div>`; }
    const id = newId(); const { pack, notes } = repair(x.data, id); const v = Packs.validate(pack);
    const bytes = JSON.stringify(pack).length;
    if (bytes > 3e6) return `<div class="callout warn"><b>This class is too large</b> (${fmtSize(bytes)}; the limit is 3 MB). Choose “Shorter answer” in step 1 and ask again.</div>`;
    if (v.errors.length) return `<div class="callout warn"><b>Almost there: ${v.errors.length} thing${v.errors.length === 1 ? '' : 's'} to fix.</b><ul class="mk-list">${v.errors.slice(0, 6).map(m => `<li>${esc(m)}</li>`).join('')}</ul>${v.errors.length > 6 ? `<p class="small">…and ${v.errors.length - 6} more.</p>` : ''}<div class="mt-1">${copyBtn(fixPrompt(v.errors.slice(0, 20)))}</div></div>`;
    pending = pack;
    return previewHtml(pack, v, notes, `<div class="row gap-sm mt-1"><button type="button" class="btn primary" data-add>${icon('plus', 15)} Add ${esc(pack.code)}</button></div>`);
  }
  /* adding a class: an account on the website, and Pro or Max unless the class is free */
  async function canAdd(code, free, reason) {
    if (!NATIVE && !user()) { toast('Sign in first: classes you make are saved with your account.', 4000); signIn('login'); return false; }
    if (!free && !Sub.active() && !(await paywall({ code, reason }))) return false;
    return true;
  }
  const savedMsg = code => NATIVE ? `${code} is ready. It is saved on this ${DEVICE}${user() ? ' and with your account' : ''}.` : `${code} is ready. It is saved with your account.`;
  /* ============================================================
     Mathub Pro and Max: Bo writes the class from the syllabus (api/ai.php, step by step: the outline, then each unit)
     ============================================================ */
  function boCardHtml() {
    const size = settings().mkSize === 'short' ? 'short' : 'full';
    return `<section class="mk-bo" id="mk-bo" aria-labelledby="mk-bo-h">
      <div class="mk-bo-intro"><span class="mk-bo-av" aria-hidden="true">${App.bobcatSvg ? App.bobcatSvg(84) : ''}</span>
        <div class="mk-bo-t"><h2 class="mk-bo-h" id="mk-bo-h">Bo writes it from your syllabus</h2><p>Give him the syllabus. In a minute or two you have the whole class:</p>
        <ul class="mk-bo-gets"><li>${icon('book', 16)}<span>Notes and the key ideas of every topic</span></li><li>${icon('cards', 16)}<span>Flashcards and practice questions</span></li><li>${icon('calendar', 16)}<span>Its calendar, exams and your grade calculator</span></li></ul></div></div>
      <div class="mk-bo-form">
        <label class="mk-drop" id="mk-drop"><input type="file" id="mk-bo-file" class="sr-only" accept=".pdf,application/pdf,image/*,.txt,text/plain"><span class="mk-drop-ic" aria-hidden="true">${icon('upload', 22)}</span><span class="mk-drop-t"><b>Drop your syllabus here</b><span>PDF, photo or text file · <u>choose a file</u></span></span></label>
        <div class="mk-drop-file" id="mk-bo-filechip" hidden><span class="mk-drop-ic" aria-hidden="true">${icon('file', 20)}</span><span class="mk-drop-t"><b id="mk-bo-fname"></b><span id="mk-bo-fsize"></span></span><button type="button" class="icon-btn" data-bo-unfile aria-label="Remove the file">${icon('x', 16)}</button></div>
        <div class="mk-or-line" aria-hidden="true"><span>or paste its text</span></div>
        <label class="sr-only" for="mk-bo-text">The syllabus text</label>
        <textarea class="input mk-bo-text" id="mk-bo-text" rows="4" placeholder="The schedule, topics, exams and grading"></textarea>
        <div class="mk-bo-go"><div class="mk-size" role="radiogroup" aria-label="How big a class?"><button type="button" role="radio" class="chip toggle${size === 'full' ? ' on' : ''}" aria-checked="${size === 'full'}" data-bo-size="full">Full class</button><button type="button" role="radio" class="chip toggle${size === 'short' ? ' on' : ''}" aria-checked="${size === 'short'}" data-bo-size="short">Shorter class</button></div><button type="button" class="btn primary lg mk-bo-write" data-bo-write>${icon('wand', 18)} Write my class</button></div>
        <p class="small muted mk-bo-note">${icon('shield', 13)} Bo sends your syllabus to Anthropic's AI to write the class; it is not used to train the AI. <a href="#/policy/privacy">Privacy</a></p><p class="small mk-bo-left" id="mk-bo-left"></p>
      </div>
      <div class="mk-prog" id="mk-bo-prog" hidden><div class="mk-prog-h"><span class="mk-prog-av" aria-hidden="true">${App.bobcatSvg ? App.bobcatSvg(40) : ''}</span><div class="mk-prog-t" role="status"><b id="mk-prog-now"></b><span id="mk-prog-of"></span></div></div>
        <div class="mk-prog-bar" aria-hidden="true"><i id="mk-prog-fill"></i></div><ol class="mk-bo-steps" id="mk-bo-steps"></ol></div>
      <div class="mk-result" id="mk-bo-result" aria-live="polite"></div>
    </section>`;
  }
  /* reads a file into base64; photos are shrunk on the device, PDFs and text go as they are */
  async function readSyllabusFile(f) {
    if (/^image\//.test(f.type) && App.shrinkPhoto) { const p = await App.shrinkPhoto(f, 2000); return { type: p.type, data: p.data }; }
    const type = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) ? 'application/pdf' : /^text\//.test(f.type) || /\.txt$/i.test(f.name) ? 'text/plain' : '';
    if (!type) throw new Error('Bo reads PDFs, photos and plain text files.');
    if (f.size > 7e6) throw new Error('That file is too large. Keep it under 7 MB.');
    const buf = new Uint8Array(await f.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { type, data: btoa(bin) };
  }
  /* the outline and the units Bo wrote, put together as one class pack */
  function assemble(O, units) {
    const P = JSON.parse(JSON.stringify(O)); const byId = {}; (P.SECTIONS || []).forEach(x => { if (x && x.id) { byId[x.id] = x; delete x.about; } });
    P.FLASHCARDS = []; P.QUIZ = { topics: {}, questions: [] };
    units.forEach(({ n, data }) => {
      (data.SECTIONS || []).forEach(x => { const t = x && byId[x.id]; if (t) ['ideas', 'pitfalls', 'example'].forEach(k => { if (x[k]) t[k] = x[k]; }); });
      (data.FLASHCARDS || []).forEach((c, i) => { if (c && c.f && c.b) P.FLASHCARDS.push({ id: `u${n}-${String(c.id || 'c' + i).replace(/[^a-z0-9_.-]/gi, '')}`, unit: n, sec: c.sec, f: c.f, b: c.b }); });
      ((data.QUIZ || {}).questions || []).forEach(q => { const sec = q && byId[q.topic]; if (!sec || !Array.isArray(q.items)) return; P.QUIZ.topics[q.topic] = { unit: sec.unit, sec: q.topic, label: sec.title }; P.QUIZ.questions.push({ type: 'bank', topic: q.topic, items: q.items }); });
    });
    return P;
  }
  function wireBo(box) {
    if (!box) return; let file = null, build = null, outline = null, done = [];
    const ta = $('#mk-bo-text', box), drop = $('#mk-drop', box), chip = $('#mk-bo-filechip', box), left = $('#mk-bo-left', box);
    // how many classes Bo can still write this month, and whether he is switched on at all (no AI call)
    if (user()) api('ai_status').then(r => {
      if (!left.isConnected) return;
      if (!r.enabled) { left.textContent = 'Bo is not switched on yet: use the AI you already use below for now.'; const d = $('#mk-diy'); if (d) d.open = true; return; }
      if (r.pro && r.usage) { const n = Math.max(0, r.usage.class_limit - r.usage.classes); left.textContent = `${n} of ${r.usage.class_limit} classes left this month.`; }
    }).catch(() => {});
    const setFile = (f, name) => { file = f; build = null; chip.hidden = !f; drop.hidden = !!f; if (f) { $('#mk-bo-fname', box).textContent = name; $('#mk-bo-fsize', box).textContent = `${f.type === 'application/pdf' ? 'PDF' : f.type === 'text/plain' ? 'Text file' : 'Photo'} · ${fmtSize(f.data.length * 0.75)} · ready for Bo`; } };
    const take = async f => { if (!f) return; try { setFile(await readSyllabusFile(f), f.name); } catch (x) { toast(x.message, 4000); } };
    box.addEventListener('click', async e => {
      const sz = e.target.closest('[data-bo-size]'); if (sz) { setSetting('mkSize', sz.dataset.boSize); $$('[data-bo-size]', box).forEach(x => { const on = x === sz; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); }); return; }
      if (e.target.closest('[data-bo-unfile]')) { setFile(null); $('#mk-bo-file', box).focus(); return; }
      const go = e.target.closest('[data-bo-write]'); if (go) run(go);
    });
    $('#mk-bo-file', box).addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; take(f); });
    // drag a syllabus onto the drop zone (or the paste box)
    [drop, ta].forEach(z => {
      z.addEventListener('dragover', e => { if (![...(e.dataTransfer.types || [])].includes('Files')) return; e.preventDefault(); drop.classList.add('drag'); });
      z.addEventListener('dragleave', () => drop.classList.remove('drag'));
      z.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return; e.preventDefault(); drop.classList.remove('drag'); take(f); });
    });
    const prog = $('#mk-bo-prog', box), steps = $('#mk-bo-steps', box), res = $('#mk-bo-result', box);
    const paint = (list, at, fail) => {
      prog.hidden = false; prog.classList.toggle('fail', !!fail); prog.classList.toggle('done', at >= list.length);
      $('#mk-prog-now', box).textContent = fail ? `Bo stopped while ${list[at].charAt(0).toLowerCase() + list[at].slice(1)}` : at >= list.length ? 'Your class is ready' : list[at] + '…';
      $('#mk-prog-of', box).textContent = at >= list.length ? `${list.length} steps done` : `Step ${at + 1} of ${list.length}${at === 0 && !fail ? ' · this takes a minute or two' : ''}`;
      $('#mk-prog-fill', box).style.width = `${Math.round(Math.min(1, (at + (fail ? 0 : at >= list.length ? 0 : 0.35)) / list.length) * 100)}%`;
      steps.innerHTML = list.map((t, i) => `<li class="${i < at ? 'done' : i === at ? (fail ? 'fail' : 'now') : ''}"><span class="mk-bo-dot" aria-hidden="true">${i < at ? icon('check', 13) : ''}</span>${esc(t)}</li>`).join('');
    };
    async function run(btn) {
      if (!user()) { toast('Sign in first: Bo writes classes for your Mathub account.', 4000); signIn('login'); return; }
      if (!Sub.active() && !(await paywall({ need: 'pro', reason: 'bo-class' }))) return;
      const text = (ta.value || '').trim(); const size = settings().mkSize === 'short' ? 'short' : 'full';
      if (!build && !text && !file) { toast('Drop in your syllabus or paste its text first.', 3500); ta.focus(); return; }
      btn.disabled = true; res.innerHTML = ''; box.classList.add('busy');
      let list = ['Reading your syllabus']; let at = 0;
      try {
        if (!build) { paint(list, 0); const r = await api('ai_class', { step: 'outline', size, syllabus: Object.assign({}, text ? { text } : {}, file ? { file } : {}) }); build = r.build; outline = r.outline; done = []; }
        const units = (outline.UNITS || []).map(u => u.n);
        list = ['Reading your syllabus'].concat(units.map(n => { const u = outline.UNITS.find(x => x.n === n); return `Writing unit ${n}: ${u.title}`; })).concat(['Checking the class']);
        for (const n of units) {
          if (done.some(d => d.n === n)) continue; at = 1 + units.indexOf(n); paint(list, at);
          const r = await api('ai_class', { step: 'unit', build, unit: n, size }); done.push({ n, data: r.data });
        }
        at = list.length - 1; paint(list, at);
        const { pack, notes } = repair(assemble(outline, done.sort((a, b) => a.n - b.n)), newId()); const v = Packs.validate(pack);
        if (v.errors.length) throw new Error('Bo\'s class did not pass the checks: ' + v.errors.slice(0, 2).join(' ') + ' Try again, or use “Shorter class”.');
        paint(list, list.length); pending = pack; pendingFree = false;
        res.innerHTML = previewHtml(pack, v, notes, `<div class="row gap-sm mt-1"><button type="button" class="btn primary" data-add>${icon('plus', 15)} Add ${esc(pack.code)}</button></div>`);
        wireResult(res, ta); Plat.haptic('success'); build = null; setFile(null);
        if (left.textContent && /left this month/.test(left.textContent)) left.textContent = left.textContent.replace(/\d+(?= of)/, m => Math.max(0, +m - 1));
        res.scrollIntoView({ block: 'nearest', behavior: Plat.reduceMotion() ? 'auto' : 'smooth' });
      } catch (x) {
        paint(list, at, true);
        if (x.status === 402) { if (await paywall({ need: 'pro', reason: 'bo-class' })) App.rerender(); }
        else res.innerHTML = `<div class="callout warn"><b>${esc(x.message)}</b>${build ? ' Bo kept what he has written so far: Write my class picks up where he stopped.' : ''}</div>`;
        if (x.status === 404) build = null;
      }
      btn.disabled = false; box.classList.remove('busy');
    }
  }

  /* Add: each result adds the class it showed (pending and pendingFree are read when it is wired) */
  function wireResult(out, ta) {
    out.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => { try { await Plat.copy(b.dataset.copy); Plat.haptic('success'); toast('Copied. Paste it into the same AI chat.', 3000); } catch (e) { toast(e.message); } }));
    const add = $('[data-add]', out); if (!add) { Plat.haptic('warning'); return; }
    const pack = pending, free = pendingFree;
    add.addEventListener('click', async () => {
      if (!pack) return;
      if (!(await canAdd(pack.code, free))) return;
      add.disabled = true;
      try { const entry = await Mine.add(pack, { free }); pending = null; if (ta) ta.value = ''; Plat.haptic('success'); toast(savedMsg(entry.code), 4000); location.hash = `#/${entry.id}/dashboard`; }
      catch (e) { add.disabled = false; toast('The class could not be saved: ' + e.message, 5000); }
    });
  }
  function paintMine(el) {
    const list = Mine.list(); const u = user();
    const where = e => !u ? (NATIVE ? `On this ${DEVICE}` : '') : e.owner && e.owner !== u.id ? `On this ${DEVICE} only (made under another account)` : e.synced ? (NATIVE ? `On this ${DEVICE} and in your account` : 'Saved with your account') : 'Saving to your account…';
    const tile = code => { const m = /^(\S+)\s+(.+)$/.exec(String(code || '').trim()); return m ? `${esc(m[1])}<br>${esc(m[2])}` : esc(code); };
    el.innerHTML = list.length ? `<ul class="mk-mine">${list.map(e => `<li class="panel mk-item" style="${classStyle(e.id)}"><span class="mk-item-tile" aria-hidden="true">${tile(e.code)}</span><div class="mk-item-main"><b>${esc(e.code)}</b> <span>${esc(e.name)}</span>${locked(e.id) ? ` <span class="chip lock-chip">${icon('lock', 12)} Locked</span>` : ''}${e.share ? ` <span class="chip mk-shared">${icon('link', 12)} Shared</span>` : ''}<div class="small muted">${[esc(e.term || ''), `added ${esc(new Date(e.added).toLocaleDateString())}`, esc(where(e))].filter(Boolean).join(' · ')}</div></div>
        <div class="row gap-sm mk-item-act"><a class="btn sm primary" href="#/${esc(e.id)}/dashboard">Open</a><button type="button" class="btn sm" data-sharelink="${esc(e.id)}">${icon('link', 13)} Share</button><button type="button" class="btn sm" data-file="${esc(e.id)}">${icon(NATIVE ? 'external' : 'download', 13)} ${NATIVE ? 'Send file' : 'Download'}</button><button type="button" class="btn sm ghost" data-del="${esc(e.id)}" aria-label="Delete ${esc(e.code)}">${icon('trash', 13)} Delete</button></div></li>`).join('')}</ul>`
      : `<p class="mk-none small muted">None yet. Classes you create show up here and with your other classes.</p>`;
    $$('[data-file]', el).forEach(b => b.addEventListener('click', async () => { const id = b.dataset.file; const e = list.find(x => x.id === id); try { const pack = await Mine.read(id); const name = `${String(e.code || id).replace(/[^A-Za-z0-9]+/g, '')}.mathub.json`; await Plat.shareFile(name, JSON.stringify(pack), `${e.code} for Mathub`); } catch (err) { if (!/cancel/i.test(err.message || '')) toast('Could not send the class: ' + err.message); } }));
    $$('[data-sharelink]', el).forEach(b => b.addEventListener('click', () => shareSheet(b.dataset.sharelink).then(() => paintMine(el))));
    $$('[data-del]', el).forEach(b => b.addEventListener('click', async () => { const id = b.dataset.del; const e = list.find(x => x.id === id);
      const msg = e.synced && u ? `Delete ${e.code}? It is deleted from your account and from every device where you are signed in, with your progress in it.${e.share ? ' Its share link stops working.' : ''}` : `Delete ${e.code} from this ${DEVICE}? Your progress in it is deleted too.`;
      if (!confirm(msg)) return; try { await Mine.remove(id); try { localStorage.removeItem('studyhub-' + id); } catch (er) {} toast(`${e.code} deleted.`); paintMine(el); } catch (err) { toast(err.message); } }));
  }

  /* ============================================================
     Sharing: a link and a QR code anyone can open (#/c/CODE). The class is stored with the account, so
     sharing needs one; whoever opens the link sees the class, never who made it.
     ============================================================ */
  let qrLib = null;
  const loadQr = () => qrLib || (qrLib = new Promise((res, rej) => { if (global.qrcode) return res(global.qrcode); const s = document.createElement('script'); s.src = 'assets/vendor/qrcode.js'; s.onload = () => res(global.qrcode); s.onerror = () => { qrLib = null; rej(new Error('The QR code could not be drawn.')); }; document.head.appendChild(s); }));
  /* one dark square per module, drawn as a single path so it stays sharp at any size */
  async function qrSvg(text) {
    const qrcode = await loadQr(); const q = qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(), m = 4, size = n + m * 2; let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    return `<svg class="qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code for the link" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#0d1626"/></svg>`;
  }
  function sheetEl(id, inner) {
    const old = $('#' + id); if (old) old.remove();
    const el = document.createElement('div'); el.id = id; el.className = NATIVE ? 'modal-backdrop sheet-backdrop' : 'modal-backdrop pw-backdrop';
    el.innerHTML = `<div class="${NATIVE ? 'sheet' : 'modal'} pw share-sheet" role="dialog" aria-modal="true" aria-labelledby="${id}-h">${NATIVE ? '<div class="sheet-grab" aria-hidden="true"></div>' : ''}${inner}</div>`;
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('open'));
    return el;
  }
  function shareSheet(id) {
    return new Promise(resolve => {
      const e = Mine.entry(id); if (!e) return resolve(false);
      const el = sheetEl('share-sheet', `<div class="sheet-h"><h2 id="share-sheet-h">Share ${esc(e.code)}</h2><button class="icon-btn" data-action="close" aria-label="Close">${icon('x', 18)}</button></div><div class="share-body" id="share-body"><p class="small muted">Getting the link…</p></div>`);
      const body = $('#share-body', el);
      const close = v => { document.removeEventListener('keydown', onKey); el.classList.remove('open'); setTimeout(() => el.remove(), Plat.reduceMotion() ? 0 : 220); resolve(v); };
      const onKey = x => { if (x.key === 'Escape') close(false); }; document.addEventListener('keydown', onKey);
      el.addEventListener('click', x => { if (x.target === el || x.target.closest('[data-action="close"]')) close(false); });
      const show = async code => {
        const url = SHARE_URL + code;
        body.innerHTML = `<div class="share-grid"><div class="share-qr" id="share-qr" aria-busy="true"></div><div class="share-side">
          <p>Anyone with this link or code can see ${esc(e.code)} and add a copy to their classes. They do not see your name or your progress.</p>
          <label class="small muted" for="share-url">Link</label><input class="input mono share-url" id="share-url" readonly value="${esc(url)}">
          <p class="share-code">Code <b class="mono">${esc(code.slice(0, 4))}&thinsp;${esc(code.slice(4))}</b></p>
          <div class="row gap-sm" style="flex-wrap:wrap"><button type="button" class="btn primary" data-sh="copy">${icon('copy', 15)} Copy link</button>${NATIVE || navigator.share ? `<button type="button" class="btn" data-sh="send">${icon('external', 15)} Send…</button>` : ''}</div></div></div>
          <p class="small muted share-foot">Adding a shared class needs Mathub Pro or Max. <button type="button" class="linkbtn small danger-link" data-sh="stop">Stop sharing</button></p>`;
        qrSvg(url).then(svg => { const q = $('#share-qr', el); if (q) { q.innerHTML = svg; q.removeAttribute('aria-busy'); } }).catch(() => { const q = $('#share-qr', el); if (q) q.remove(); });
        $('#share-url', el).addEventListener('focus', x => x.target.select());
        body.addEventListener('click', async x => {
          const b = x.target.closest('[data-sh]'); if (!b) return;
          if (b.dataset.sh === 'copy') { try { await Plat.copy(url); Plat.haptic('success'); toast('Link copied.'); } catch (er) { $('#share-url', el).select(); toast(er.message); } }
          if (b.dataset.sh === 'send') { try { await Plat.share({ title: `${e.code} on Mathub`, text: `${e.code}: ${e.name}. Study it on Mathub:`, url }); } catch (er) {} }
          if (b.dataset.sh === 'stop') { if (!confirm(`Stop sharing ${e.code}? The link and code stop working. Copies people already added stay theirs.`)) return; b.disabled = true; try { await api('myclass_unshare', { id }); patchEntry(id, { share: '' }); toast('The link no longer works.'); close(true); } catch (er) { b.disabled = false; toast(er.message, 4500); } }
        });
      };
      (async () => {
        if (!user()) { body.innerHTML = `<p>${NATIVE ? 'A shared class is kept with your Mathub account, so you need to sign in to share one.' : 'Sign in to share this class.'}</p><div class="row gap-sm mt-1"><button type="button" class="btn primary" data-sh-in>Log in</button></div>`; $('[data-sh-in]', body).addEventListener('click', () => { close(false); signIn('login'); }); return; }
        try {
          let cur = Mine.entry(id);
          if (cur.owner && cur.owner !== user().id) { body.innerHTML = `<p>This class was made under another account on this ${DEVICE}, so it cannot be shared from this one.</p>`; return; }
          if (!cur.synced) await Sync.push(id);
          const r = await api('myclass_share', { id }); patchEntry(id, { share: r.code }); show(r.code);
        } catch (x) { body.innerHTML = `<div class="callout warn">${esc(x.message)}</div>`; }
      })();
    });
  }
  App.shareClass = shareSheet;

  /* #/c/CODE: a shared class, for anyone. A preview, Add (on the website with an account; Pro or Max unless
     you already have it), and Report. */
  App.views.c = {
    title: 'Shared class',
    async render(root, param) {
      const code = codeOf(param);
      const shell = inner => `<div class="landing-wrap mk-page shared-page"><header class="landing-top"><div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>A shared class</h1><p class="muted">A classmate made this class on Mathub from a syllabus and shared it with you.</p></div><div class="row gap-sm"><a class="btn" href="#/">${icon('left', 14)} Your classes</a></div></header><div id="shared-box">${inner}</div></div>`;
      if (!code) { root.innerHTML = shell(`<div class="callout warn"><b>That share code is not right.</b> A code has 8 letters and numbers, like K7P2QX9M.</div>${codeForm()}`); wireCodeForm(root); return; }
      root.innerHTML = shell(`<div class="panel"><p class="small muted">Opening ${esc(code)}…</p></div>`);
      let r; try { r = await api('shared_class&code=' + code); } catch (e) {
        if (!$('#shared-box', root)) return;
        $('#shared-box', root).innerHTML = `<div class="callout warn"><b>${e.status === 404 ? 'This class is not shared any more.' : e.status === 400 ? 'That share code is not right.' : 'The class could not be opened.'}</b> ${esc(e.status === 404 ? 'Its owner stopped sharing it, or the code is mistyped.' : e.message)}</div>${codeForm()}`; wireCodeForm(root); return;
      }
      const box = $('#shared-box', root); if (!box) return;
      const id = newId(); const { pack } = repair(JSON.parse(JSON.stringify(r.pack)), id); const v = Packs.validate(pack);
      if (v.errors.length) { box.innerHTML = `<div class="callout warn"><b>This shared class cannot be used.</b> It has problems Mathub cannot fix: ${esc(v.errors.slice(0, 3).join(' '))}</div>`; return; }
      const have = Mine.list().find(e => e.from === code);
      document.title = `${pack.code} · Shared class · Mathub`;
      box.innerHTML = previewHtml(pack, v, [], `<div class="row gap-sm mt-1" style="flex-wrap:wrap">${have ? `<a class="btn primary" href="#/${esc(have.id)}/dashboard">${icon('check', 15)} Open your copy</a>` : `<button type="button" class="btn primary" data-sc="add">${icon('plus', 15)} Add ${esc(pack.code)} to my classes</button>`}<button type="button" class="btn ghost" data-sc="report">${icon('flag', 14)} Report</button></div>${have ? '' : `<p class="small muted mt-1">${Sub.active() ? `You have ${Sub.planName()}, so adding it is included.` : 'Adding a shared class needs Mathub Pro or Max.'} You get your own copy: your progress stays yours.</p>`}`);
      box.addEventListener('click', async e => {
        const b = e.target.closest('[data-sc]'); if (!b) return;
        if (b.dataset.sc === 'report') { if (App.reportIssue) App.reportIssue({ title: 'Report this shared class', view: 'Shared class', ref: `share ${code} · ${pack.code}`, reason: 'other', placeholder: 'What is wrong with it? For example: copied material, something offensive, or wrong facts.' }); return; }
        if (!(await canAdd(pack.code, false, 'shared'))) return;
        b.disabled = true;
        try { const entry = await Mine.add(pack, { from: code }); Plat.haptic('success'); toast(savedMsg(entry.code), 4000); location.hash = `#/${entry.id}/dashboard`; }
        catch (x) { b.disabled = false; toast('The class could not be added: ' + x.message, 5000); }
      });
    }
  };
  const codeForm = () => `<form class="mk-code-form mt-2" id="mk-code-form"><label for="mk-code">Share code</label><input class="input mono" id="mk-code" maxlength="40" placeholder="K7P2QX9M" autocapitalize="characters" autocomplete="off" spellcheck="false"><button class="btn sm primary" type="submit">Open</button></form>`;
  const wireCodeForm = root => { const f = $('#mk-code-form', root); if (f) f.addEventListener('submit', e => { e.preventDefault(); const c = codeOf($('#mk-code', root).value); if (!c) { toast('A share code has 8 letters and numbers, like K7P2QX9M.', 4000); return; } location.hash = '#/c/' + c; }); };

  /* ============================================================
     The website's own pieces (the apps have theirs in app-native.js)
     ============================================================ */
  App.createLink = (cls = '') => `<a class="rq-link ${cls}" href="#/create">${icon('plus', 13)} Make your own class from a syllabus</a>`;
  if (!NATIVE) {
    /* Settings: your plan */
    const panel = () => {
      const s = Sub.status(); const on = Sub.active(); const plan = Sub.plan(); const mine = Mine.list().length; const u = user();
      const line = !u ? 'Sign in to see your plan.' : on ? `${Sub.planName()}${s.granted ? ' (given to your account)' : ''}. ` + (s.until ? (s.renews ? `Renews ${fmtDate(s.until)}.` : `On until ${fmtDate(s.until)}; it will not renew.`) : '') : `No plan. With Mathub Pro (${PLANS.pro.web} a month) Bo writes your classes from any syllabus; Mathub Max (${PLANS.max.web} a month) adds Ask Bo, your AI tutor. The example class is free.`;
      return `<div class="panel span-2 create-panel" id="create-panel"><div class="panel-h"><div class="panel-title">${icon('plus')} Your plan</div></div>
        <div class="ap-sub"><div class="ap-sub-t"><b>${on ? esc(Sub.planName()) : 'Mathub Pro and Max'}</b><span class="small muted">${line}</span></div><div class="row gap-sm">${u ? `<a class="btn sm" href="#/plan">${on ? 'Manage your plan' : 'Your plan'}</a>` : ''}${!on ? `<button type="button" class="btn sm primary" data-cp="buy">See the plans</button>` : plan === 'pro' ? `<button type="button" class="btn sm primary" data-cp="max">Move up to Max</button>` : `<a class="btn sm primary" href="#/tutor">Ask Bo</a>`}${u ? `<button type="button" class="btn sm ghost" data-cp="check">Check again</button>` : ''}</div></div>
        <p class="small mt-1">${mine ? `${mine} class${mine === 1 ? '' : 'es'} you created ${mine === 1 ? 'is' : 'are'} saved with your account.` : 'Classes you create from a syllabus are saved with your account.'} <a href="#/create">Create a class</a></p></div>`;
    };
    App.onRender = App.onRender || [];
    App.onRender.push((root, r) => {
      if (r.view !== 'settings' || r.course || $('#create-panel', root)) return;
      const acct = $('#acct-panel', root) || $('.acct-panel', root); const grid = $('.grid.cols-2', root); if (!grid) return;
      (acct || grid.firstElementChild || grid).insertAdjacentHTML(acct ? 'afterend' : 'beforebegin', panel());
      $('#create-panel', root).addEventListener('click', async e => {
        const b = e.target.closest('[data-cp]'); if (!b) return;
        if (b.dataset.cp === 'buy' || b.dataset.cp === 'max') { if (await paywall(b.dataset.cp === 'max' ? { need: 'max', reason: 'bo' } : {})) App.rerender(); return; }
        b.disabled = true; try { await Sub.refresh(true); App.rerender(); } catch (x) { toast(x.message, 4500); b.disabled = false; }
      });
    });
  }
  /* ============================================================
     #/plan — Your plan: the plan you have and how it is paid, what you have used this month, the plans side by
     side, billing and receipts, cancelling (api: plan_cancel), and answers to the usual questions.
     ============================================================ */
  const STORE_NAME = { app_store: 'the App Store', mac_app_store: 'the App Store', play_store: 'Google Play', rc_billing: 'the website (card, through Stripe)', stripe: 'the website (card, through Stripe)', promotional: 'a gift from Mathub' };
  const FREE_LINES = ['Every class built into Mathub: lessons, practice, flashcards and exam prep', 'Today, your calendar, the Focus room and the GPA calculator', 'The example class you can make from a syllabus'];
  const nextReset = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12)).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }); };
  const num = n => Number(n || 0).toLocaleString('en-US');
  const P = { use: null, busy: false };
  function planStore(s) { if (NATIVE) return ANDROID ? 'play_store' : 'app_store'; return s.store || ''; }
  function nowHtml() {
    const u = user(); const s = Sub.status(); const plan = Sub.plan(); const on = !!plan;
    if (!u && !NATIVE) return `<div class="pl-now pl-out"><div class="pl-now-t"><h2 class="pl-name">Sign in to see your plan</h2><p>Your plan belongs to your Mathub account, so it works on the website and in the apps.</p></div><div class="pl-acts"><button type="button" class="btn primary" data-pl="login">Log in</button><button type="button" class="btn" data-pl="signup">Create an account</button></div></div>`;
    if (!on) return `<div class="pl-now pl-free"><span class="pl-badge" aria-hidden="true">${App.bobcatSvg ? App.bobcatSvg(54) : ''}</span><div class="pl-now-t"><p class="pl-state"><span class="pl-chip">Free</span></p><h2 class="pl-name">You’re on the free plan</h2><p>Everything built into Mathub is free. With <b>Mathub Pro</b> Bo writes your classes from any syllabus, and <b>Mathub Max</b> adds Bo, your AI tutor, in a chat and on calls.</p></div><div class="pl-acts"><button type="button" class="btn primary" data-pl="buy-max">Get Max</button><button type="button" class="btn" data-pl="buy-pro">Get Pro</button>${u ? `<button type="button" class="btn ghost" data-pl="check">I already subscribed</button>` : ''}</div></div>`;
    const ends = s.until && !s.renews && !s.granted; const store = planStore(s); const where = STORE_NAME[store] || 'the website';
    const paid = s.granted && PLANS[s.paid] ? s.paid : '';   // given a plan, and paying for a smaller one too
    const chip = s.granted ? `<span class="pl-chip gift">Given to your account${s.until ? ` until ${esc(fmtDate(s.until))}` : ''}</span>` : ends ? `<span class="pl-chip warn">Ends ${esc(fmtDate(s.until))}</span>` : '<span class="pl-chip ok">Active</span>';
    const facts = [
      ['Price', s.granted ? 'Free for you' : `${esc(Sub.price(plan) || PLANS[plan].web)} a month`],
      s.granted ? (s.until ? ['Ends', `${esc(fmtDate(s.until))}. It never charges you`] : ['Lasts', 'No end date. It never charges you']) : [ends ? 'Ends' : 'Renews', s.until ? `${esc(fmtDate(s.until))}${ends ? ', and it will not renew' : ''}` : 'Every month'],
      s.granted ? ['From', 'Given by Mathub'] : ['Paid through', esc(where)],
      u ? ['Account', esc(u.email)] : null
    ].filter(Boolean);
    const manage = (!s.granted || paid) && Sub.manageUrl();
    return `<div class="pl-now pl-${plan}"><span class="pl-badge" aria-hidden="true">${icon(plan === 'max' ? 'gem' : 'zap', 30)}</span><div class="pl-now-t"><p class="pl-state">${chip}</p><h2 class="pl-name">${esc(PLANS[plan].name)}</h2>
        <dl class="pl-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        ${ends ? `<p class="pl-note">${icon('clock', 15)} Everything in ${esc(PLANS[plan].short)} keeps working until then. Changed your mind? ${manage ? 'Turn it back on from Manage billing.' : ''}</p>` : ''}
        ${s.granted && s.until ? `<p class="pl-note">${icon('clock', 15)} Everything in ${esc(PLANS[plan].short)} works until then. After that you are on ${paid ? esc(PLANS[paid].name) : 'Free'} again, unless you get a plan.</p>` : ''}
        ${paid ? `<p class="pl-note pl-paid">${icon('info', 15)} You also pay for <b>${esc(PLANS[paid].name)}</b> through ${esc(where)}. That did not change: cancel it below if you no longer need it.</p>` : ''}</div>
      <div class="pl-acts">${plan === 'pro' ? `<button type="button" class="btn primary" data-pl="buy-max">Move up to Max</button>` : ''}${manage ? `<a class="btn${plan === 'max' && !paid ? ' primary' : ''}" href="${esc(manage)}" target="_blank" rel="noopener">${icon('external', 15)} Manage billing</a>` : ''}${(!s.granted && !ends) || (paid && s.paidRenews) ? `<button type="button" class="btn ghost pl-cancel" data-pl="cancel">${paid ? `Cancel ${esc(PLANS[paid].short)}` : 'Cancel plan'}</button>` : ''}<button type="button" class="btn ghost" data-pl="check">${icon('rotate', 14)} Check again</button></div></div>`;
  }
  function useHtml() {
    const plan = Sub.plan(); const st = P.use; if (!plan) return '';
    if (!st || !st.usage) return `<div class="pl-meters pl-wait" aria-busy="true"><i></i><i></i><i></i></div>`;
    const U = st.usage;
    const meter = (label, used, limit, unit, note, off) => {
      if (off) return `<div class="pl-m off"><div class="pl-m-h"><b>${label}</b><span>${note}</span></div></div>`;
      const left = Math.max(0, limit - used); const pct = limit ? Math.min(100, Math.round(used / limit * 100)) : 0;
      return `<div class="pl-m${pct >= 90 ? ' low' : ''}"><div class="pl-m-h"><b>${label}</b><span><b>${num(left)}</b> ${unit} left</span></div><div class="pl-bar" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${limit}" aria-valuenow="${used}" aria-valuetext="${num(used)} of ${num(limit)} ${unit} used"><i style="width:${Math.max(pct, used ? 2 : 0)}%"></i></div><p class="pl-m-f">${num(used)} of ${num(limit)} used${note ? ` · ${note}` : ''}</p></div>`;
    };
    const mins = s => Math.floor(s / 60); const calls = st.voice && (st.voice.live || U.live > 0) && !NATIVE;
    return `<div class="pl-meters">
      ${plan === 'max' ? meter('Questions to Bo', U.tutor, U.tutor_limit, 'questions', '') : meter('Questions to Bo', 0, 0, '', 'Part of Mathub Max', true)}
      ${meter('Classes Bo writes', U.classes, U.class_limit, U.class_limit - U.classes === 1 ? 'class' : 'classes', '')}
      ${plan === 'max' && calls ? meter('Calls with Bo', mins(U.live), mins(U.live_limit), 'minutes', '') : ''}
    </div><p class="pl-reset">${icon('rotate', 14)} These start again on ${nextReset()}.</p>`;
  }
  function cardsHtml() {
    const plan = Sub.plan();
    const card = (k, name, price, lines) => {
      const mine = (plan || 'free') === k;
      const act = k === 'free' ? '' : mine ? '' : k === 'pro' ? (plan === 'max' ? '' : `<button type="button" class="btn" data-pl="buy-pro">Get Pro</button>`) : `<button type="button" class="btn primary" data-pl="buy-max">${plan === 'pro' ? 'Move up to Max' : 'Get Max'}</button>`;
      return `<article class="pl-card${mine ? ' mine' : ''}" aria-label="${name}${mine ? ', your plan' : ''}"><header><h3>${name}</h3>${mine ? '<span class="pl-chip ok">Your plan</span>' : ''}</header><p class="pl-price"><b>${esc(price)}</b>${k === 'free' ? '' : '<small> a month</small>'}</p><ul>${lines.map(l => `<li>${icon('check', 15)}<span>${esc(l)}</span></li>`).join('')}</ul>${act ? `<div class="pl-card-act">${act}</div>` : ''}</article>`;
    };
    return `<div class="pl-cards">${card('free', 'Free', '$0', FREE_LINES)}${card('pro', PLANS.pro.name, Sub.price('pro') || PLANS.pro.web, PLANS.pro.lines)}${card('max', PLANS.max.name, Sub.price('max') || PLANS.max.web, PLANS.max.lines)}</div>
      <p class="pl-fine">Monthly plans that renew until you cancel. ${NATIVE ? `Bought in ${STORE}, which handles the billing.` : 'On the website the payment is taken by Stripe, through RevenueCat.'} A plan belongs to your Mathub account, so it works on the website and in the apps. <a href="#/policy/create">Terms</a> · <a href="#/policy/privacy">Privacy</a></p>`;
  }
  function faqHtml() {
    const A = P.use && P.use.usage; const lim = A ? `${num(A.tutor_limit)} questions to Bo and ${num(A.class_limit)} classes Bo writes each month${A.live_limit ? `, and ${Math.floor(A.live_limit / 60)} minutes of calls` : ''}` : 'generous monthly limits';
    const qa = [
      ['How do I cancel?', NATIVE ? `In your ${ANDROID ? 'Google Play' : 'Apple ID'} subscriptions (Manage billing above), at least 24 hours before it renews. Your plan stays on until the end of the month you paid for.` : 'Press <b>Cancel plan</b> above. Your plan stays on until the end of the month you paid for, and you are not charged again. If you bought it in the Mathub app, it is cancelled in the App Store or Google Play instead; the page tells you where.'],
      ['What happens when my plan ends?', `The classes you made are kept, locked, and open again if you subscribe again. Your progress, your chats with Bo and his notes stay with your account. Everything built into Mathub, and the example class, stay free.`],
      ['Where are my receipts? How do I change my card?', NATIVE ? `${STORE} keeps your receipts and payment details.` : '<b>Manage billing</b> opens the billing page for your plan, where you can see every receipt, change your card or cancel. A receipt is also emailed to you each month.'],
      ['Can I switch between Pro and Max?', NATIVE ? `Yes. Move up any time; ${STORE} handles the change.` : 'Move up to Max any time. On the website, cancel Pro after you get Max so you are not billed for both. To go down to Pro, cancel Max and get Pro when it ends.'],
      ['I subscribed in the app. Does it work here?', 'Yes. A plan belongs to your Mathub account, so it works everywhere you sign in with it. If it does not show up, press Check again.'],
      ['Are there limits?', `Fair-use limits that most students never reach: ${lim}. They start again on the 1st.`],
      ['A question about a charge?', `Write to us from the <a href="#/contact">Contact page</a>${NATIVE ? `, or ask ${STORE}` : ''} and a person will answer.`]
    ];
    return `<div class="pl-faq">${qa.map(([q, a]) => `<details><summary>${q}${icon('chevron', 16)}</summary><p>${a}</p></details>`).join('')}</div>`;
  }
  Sub.onInfo = () => { const el = $('#pl-now'); if (el && /^#\/plan/.test(location.hash)) el.innerHTML = nowHtml(); };
  App.views.plan = {
    title: 'Your plan',
    render(root) {
      root.innerHTML = `<div class="landing-wrap pl-page">
        <header class="landing-top pl-head"><div><h1 class="landing-title">Your plan</h1><p class="muted">What you have, what you have used this month, and everything about billing.</p></div><a class="btn" href="#/">${icon('left', 14)} Your classes</a></header>
        <section class="pl-sec" aria-label="Your plan now" id="pl-now">${nowHtml()}</section>
        <section class="pl-sec" aria-labelledby="pl-use-h" id="pl-use-s"${Sub.plan() ? '' : ' hidden'}><h2 class="pl-h" id="pl-use-h">This month</h2><div id="pl-use">${useHtml()}</div></section>
        <section class="pl-sec" aria-labelledby="pl-cmp-h"><h2 class="pl-h" id="pl-cmp-h">The plans</h2>${cardsHtml()}</section>
        <section class="pl-sec" aria-labelledby="pl-faq-h"><h2 class="pl-h" id="pl-faq-h">Questions</h2><div id="pl-faq-b">${faqHtml()}</div></section></div>`;
      root.onclick = async e => {
        const b = e.target.closest('[data-pl]'); if (!b) return; const k = b.dataset.pl;
        if (k === 'login' || k === 'signup') return signIn(k);
        if (k === 'buy-pro' || k === 'buy-max') { if (await paywall(k === 'buy-max' ? { need: 'max' } : {})) App.rerender(); return; }
        if (k === 'check') { b.disabled = true; try { await Sub.refresh(true); toast(Sub.active() ? `${Sub.planName()} is on.` : Sub.noneFound(), 3500); App.rerender(); } catch (x) { toast(x.message, 4500); b.disabled = false; } return; }
        if (k === 'cancel') cancelPlan();
      };
      // what has been used this month (the same numbers Bo's pages show)
      if (user() && Sub.plan()) api('ai_status').then(st => { P.use = st; const el = $('#pl-use'); if (el) el.innerHTML = useHtml(); const f = $('#pl-faq-b'); if (f) f.innerHTML = faqHtml(); }).catch(() => { const el = $('#pl-use'); if (el) el.innerHTML = '<p class="small muted">This month’s numbers could not be loaded. Try again in a moment.</p>'; });
      if (user() && (!P.fresh || Date.now() - (Sub.status().at || 0) > 60000)) { P.fresh = true; Sub.refresh(true).catch(() => {}); }   // also a plan given since (the inbox links here)
    }
  };
  /* cancelling: what changes and when, an optional reason, then it is done here or the page says where */
  function cancelPlan() {
    const s = Sub.status(); const plan = s.granted && PLANS[s.paid] ? s.paid : Sub.plan(); if (!plan) return; const store = planStore(s);   // given a plan: what they also pay for
    const inStore = store === 'app_store' || store === 'mac_app_store' || store === 'play_store';
    const old = $('#pl-cancel'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'pl-cancel'; el.className = NATIVE ? 'modal-backdrop sheet-backdrop' : 'modal-backdrop pw-backdrop';
    const until = s.until ? fmtDate(s.until) : 'the end of the month you paid for';
    const reasons = [['price', 'It costs too much'], ['use', 'I’m not using it enough'], ['done', 'My semester or exams are over'], ['broken', 'Something didn’t work'], ['other', 'Something else']];
    el.innerHTML = `<div class="${NATIVE ? 'sheet' : 'modal'} pw pl-cx" role="dialog" aria-modal="true" aria-labelledby="pl-cx-h">${NATIVE ? '<div class="sheet-grab" aria-hidden="true"></div>' : ''}
      <div class="sheet-h"><h2 id="pl-cx-h">Cancel ${esc(PLANS[plan].name)}?</h2><button class="icon-btn" data-x="keep" aria-label="Close">${icon('x', 18)}</button></div>
      <div class="pl-cx-body" id="pl-cx-body">
        <p>Your plan stays on until <b>${esc(until)}</b>. After that it does not renew, and you are not charged again.</p>
        <ul class="pl-cx-list">${plan === 'max' ? `<li>${icon('chat', 16)}<span>Ask Bo and calls with him stop then.</span></li>` : ''}<li>${icon('lock', 16)}<span>The classes you made are kept, locked, and open again if you come back.</span></li><li>${icon('check', 16)}<span>Your progress, chats and everything built into Mathub stay yours, free.</span></li></ul>
        <fieldset class="pl-why"><legend>Why are you cancelling? <span class="muted">(optional, it helps us)</span></legend><div class="pl-why-opts">${reasons.map(([v, l]) => `<label class="chip toggle pl-why-o"><input type="radio" name="pl-why" value="${v}"><span>${l}</span></label>`).join('')}</div></fieldset>
        <label class="pl-note-l" for="pl-cx-note">Anything we could do better? <span class="muted">(optional)</span></label><textarea class="input" id="pl-cx-note" rows="2" maxlength="500"></textarea>
        <p class="pw-err" id="pl-cx-err" role="alert" hidden></p>
        <div class="pl-cx-acts"><button type="button" class="btn" data-x="keep">Keep my plan</button><button type="button" class="btn danger" data-x="go">${inStore ? `Cancel in ${store === 'play_store' ? 'Google Play' : 'the App Store'}` : 'Cancel my plan'}</button></div>
      </div></div>`;
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('open'));
    const back = document.activeElement;
    const close = () => { document.removeEventListener('keydown', onKey); el.classList.remove('open'); setTimeout(() => el.remove(), Plat.reduceMotion() ? 0 : 220); if (back && back.focus) try { back.focus(); } catch (x) {} };
    const onKey = e => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', onKey);
    setTimeout(() => { const f = $('[data-x="keep"].btn', el); if (f) f.focus(); }, 50);
    const step = (h, p, link, label) => { $('#pl-cx-body', el).innerHTML = `<div class="pl-cx-done"><h3>${h}</h3><p>${p}</p><div class="pl-cx-acts">${link ? `<a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener" data-x="out">${icon('external', 15)} ${label}</a>` : ''}<button type="button" class="btn${link ? '' : ' primary'}" data-x="${link ? 'later' : 'keep'}">${link ? 'Done' : 'Close'}</button></div></div>`; const f = $('.pl-cx-done .btn', el); if (f) f.focus(); };
    el.addEventListener('click', async e => {
      if (e.target === el) return close();
      const x = e.target.closest('[data-x]'); if (!x) return; const k = x.dataset.x;
      if (k === 'keep') return close();
      if (k === 'out') { Sub.waiting = true; return; }   // back from the billing page, the plan is checked again
      if (k === 'later') { close(); Sub.refresh(true).then(() => App.rerender()).catch(() => {}); return; }
      if (k !== 'go') return;
      const why = $('input[name="pl-why"]:checked', el); const note = $('#pl-cx-note', el).value.trim();
      x.disabled = true; x.textContent = 'Cancelling…'; const err = $('#pl-cx-err', el); err.hidden = true;
      let r; try { r = await api('plan_cancel', { reason: why ? why.value : '', note }); }
      catch (y) { x.disabled = false; x.textContent = 'Cancel my plan'; err.textContent = y.network ? 'Mathub could not be reached. Check your connection and try again.' : y.message; err.hidden = false; return; }
      const end = r.until ? fmtDate(r.until) : until; const name = PLANS[plan].name;
      if (r.how === 'cancelled') { Plat.haptic('success'); close(); toast(`${name} is cancelled. It stays on until ${end}.`, 5000); await Sub.refresh(true).catch(() => {}); App.rerender(); return; }
      if (r.how === 'portal' && r.url) return step('One more step', `Website plans are cancelled on their billing page, which RevenueCat runs for Mathub (payments by Stripe). It opens in a new tab: choose <b>Cancel subscription</b> there. ${esc(name)} stays on until ${esc(end)}.`, r.url, 'Open the billing page');
      if (r.how === 'app_store' || r.how === 'play_store') return step(`Cancel in ${r.how === 'play_store' ? 'Google Play' : 'the App Store'}`, `You bought ${esc(name)} in the Mathub app, so ${r.how === 'play_store' ? 'Google Play' : 'Apple'} handles it: open your subscriptions, pick Mathub and cancel. It stays on until ${esc(end)}.`, r.url, `Open ${r.how === 'play_store' ? 'Google Play' : 'App Store'} subscriptions`);
      if (r.how === 'already') return step('It is already cancelled', `${esc(name)} ends on ${esc(end)} and will not renew.`, '', '');
      if (r.how === 'granted') return step('Nothing to cancel', `${esc(name)} was given to your account by Mathub, so it never charges you.`, '', '');
      if (r.how === 'portal') return step('Write to us to cancel', 'The billing page for your plan could not be found. Write to us from the Contact page and we will cancel it for you, and make sure you are not charged again.', '', '');
      step('No plan to cancel', 'Your account has no plan right now.', '', '');
      Sub.refresh(true).catch(() => {});
    });
  }

  /* ---------- the start page (website): Bo and your plan in one place: call him, ask him, have him write a class,
     what is left this month, and the plan, a click away. Without a plan: the two plans. ---------- */
  if (!NATIVE) {
    let hubStatus = null;
    const hubCid = () => {
      const H = App.home; let ids = [], cur = null; try { ids = H.myIds() || []; cur = H.curClass(); } catch (e) {}
      const ok = x => !!(x && Courses[x] && !Courses[x].preview && !(App.classLocked && App.classLocked(x)));
      return ok(cur) && ids.includes(cur) ? cur : ids.find(ok) || null;
    };
    const hubLine = () => {
      const plan = Sub.plan(); const U = hubStatus && hubStatus.usage; const s = Sub.status();
      const ends = s.until && !s.renews && !s.granted ? ` Your plan ends ${fmtDate(s.until)}.` : '';
      if (plan === 'max') return (U ? `${num(Math.max(0, U.tutor_limit - U.tutor))} questions${hubStatus.voice && (hubStatus.voice.live || U.live) ? ` and ${Math.floor(Math.max(0, U.live_limit - U.live) / 60)} call minutes` : ''} left this month.` : 'Mathub Max is on.') + ends;
      if (plan === 'pro') return (U ? `Bo can write ${num(Math.max(0, U.class_limit - U.classes))} more classes this month. ` : 'Bo writes your classes from any syllabus. ') + 'Max adds Ask Bo and calls.' + ends;
      return 'He knows your syllabus, your exams and where you are stuck. Call him, ask him anything, or have him write a whole class from a syllabus.';
    };
    const hubHtml = () => {
      const plan = Sub.plan(); const cid = hubCid(); const cname = cid ? (Courses[cid].short || Courses[cid].code) : '';
      const talkOk = !!(App.boTalk && App.boTalk.supported());
      const act = o => { const tag = o.href ? 'a' : 'button'; return `<${tag} ${o.href ? `href="${o.href}"` : `type="button" data-bh="${o.k}"`} class="bh-act${o.main ? ' bh-main' : ''}"><span class="bh-ic" aria-hidden="true">${icon(o.ic, 22)}</span><span class="bh-l"><b>${o.b}</b><small>${o.s}</small></span></${tag}>`; };
      let acts;
      if (plan === 'max') acts = [talkOk && cid ? act({ k: 'call', ic: 'phone', b: 'Call Bo', s: `Talk ${esc(cname)} through, out loud`, main: true }) : '', act({ href: cid ? `#/tutor/${cid}` : '#/tutor', ic: 'chat', b: 'Ask Bo', s: 'Chat, photos and his board', main: !(talkOk && cid) }), act({ href: '#/create', ic: 'wand', b: 'Write a class', s: 'From any syllabus' })];
      else if (plan === 'pro') acts = [act({ href: '#/create', ic: 'wand', b: 'Write a class', s: 'From any syllabus', main: true }), act({ k: 'max', ic: 'chat', b: 'Ask Bo', s: 'Move up to Max' }), talkOk ? act({ k: 'max', ic: 'phone', b: 'Call Bo', s: 'Move up to Max' }) : ''];
      else acts = [act({ k: 'max', ic: 'gem', b: 'Get Mathub Max', s: `Bo in a chat and on calls · ${esc(Sub.price('max') || PLANS.max.web)} a month`, main: true }), act({ k: 'pro', ic: 'wand', b: 'Get Mathub Pro', s: `Bo writes your classes · ${esc(Sub.price('pro') || PLANS.pro.web)} a month` }), act({ href: '#/plan', ic: 'list', b: 'Compare the plans', s: 'What each one includes' })];
      return `<section class="bh bh-${plan || 'free'}" id="bo-hub" aria-labelledby="bh-h"><div class="bh-who"><span class="bh-av" aria-hidden="true">${App.bobcatSvg ? App.bobcatSvg(58) : ''}</span><div class="bh-t"><h2 id="bh-h">${plan ? 'Bo, your tutor' : 'Meet Bo, your tutor'}</h2><p class="bh-sub" id="bh-sub">${esc(hubLine())}</p><a class="bh-plan" href="#/plan"><span>Your plan</span><b>${plan ? PLANS[plan].short : 'Free'}</b>${icon('right', 14)}</a></div></div><div class="bh-acts">${acts.filter(Boolean).join('')}</div></section>`;
    };
    App.onRender = App.onRender || [];
    App.onRender.push((root, r) => {
      if (r.view !== 'home' || r.course || !user() || $('#bo-hub', root)) return; const slot = $('#announcement-slot', root); if (!slot) return;
      slot.insertAdjacentHTML('afterend', hubHtml());
      $('#bo-hub', root).addEventListener('click', async e => {
        const b = e.target.closest('[data-bh]'); if (!b) return; const k = b.dataset.bh;
        if (k === 'max' || k === 'pro') { if (await paywall(k === 'max' ? { need: 'max', reason: 'bo' } : {})) App.rerender(); return; }
        if (k === 'call') {
          const cid = hubCid(); if (!cid) { location.hash = '#/tutor'; return; }
          // the first time, Bo's page asks for consent first, then the call opens there
          if (!settings().aiConsent || !hubStatus || !hubStatus.max || !App.boTalk) { location.hash = `#/tutor/${cid}?talk=1`; return; }
          App.boTalk.open({ cid, status: hubStatus, gesture: true, onClose: () => { api('ai_status').then(st => { hubStatus = st; const s = $('#bh-sub'); if (s) s.textContent = hubLine(); }).catch(() => {}); } });
        }
      });
      if (Sub.plan()) api('ai_status').then(st => { hubStatus = st; if (App.boTalk && App.boTalk.setStatus) App.boTalk.setStatus(st); const s = $('#bh-sub'); if (s) s.textContent = hubLine(); }).catch(() => {});
    });
  }

  /* a class you made, on its class page: where it is kept, and the way back to managing it */
  App.onRender = App.onRender || [];
  App.onRender.push((root, r) => {
    if (r.course && r.view === 'dashboard' && local.has(r.course) && !$('.mk-strip', root)) root.insertAdjacentHTML('afterbegin', `<p class="mk-strip small">${icon('file', 13)} A class you created from a syllabus, saved ${WHERE}. <a href="#/create">Manage or share it</a></p>`);
  });
})(window);

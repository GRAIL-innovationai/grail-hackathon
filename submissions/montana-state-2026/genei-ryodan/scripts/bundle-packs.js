#!/usr/bin/env node
/* ============================================================
   Mathub — list the bundled class packs
   Every packs/<id>.mathub.json ships with the site and installs itself
   on the server the first time anyone opens it (api/lib.php,
   mh_packs_seed_bundled). This script writes packs/index.json, the
   light listing of those packs (the same stub the server's
   classpack_list returns), so a copy of the site with no account server
   (the static preview, or a first visit while the server is down)
   still shows the bundled classes and opens them from their files.
     node scripts/bundle-packs.js
   make-pack.js runs it after building a pack.
   ============================================================ */
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const DIR = path.join(__dirname, '..', 'packs');
const KEYS = ['id', 'code', 'name', 'short', 'term', 'tagline', 'kind', 'quizNote', 'COURSE', 'EXAMS', 'CALENDAR', 'CALENDAR_NOTE', 'RECURRING', 'SEMESTER', 'VARIANTS', 'UNITS', 'NAV', 'color', 'archetype', 'resources', 'resourcesBlurb', 'guides', 'canvasMatch'];
// the same light fields as mh_pack_stub() in api/packs.php
function stub(p) {
  const s = {}; KEYS.forEach(k => { if (k in p) s[k] = p[k]; }); if (!s.short) s.short = p.code;
  s.SECTIONS = (p.SECTIONS || []).filter(x => x && typeof x === 'object').map(x => ({ id: String(x.id || ''), label: String(x.label || x.id || ''), title: String(x.title || ''), unit: x.unit != null ? x.unit : 1 }));
  const topics = p.QUIZ && p.QUIZ.topics;
  if (topics && Object.keys(topics).length) { s.hasQuiz = true; s.quizTopics = {}; Object.entries(topics).forEach(([k, t]) => { s.quizTopics[k] = { label: String((t && t.label) || k), sec: String((t && t.sec) || k), unit: (t && t.unit != null) ? t.unit : 1 }; }); }
  s.hasGrading = !!(p.GRADING && Array.isArray(p.GRADING.categories) && p.GRADING.categories.length);
  s.sectionCount = s.SECTIONS.length; s.flashcardCount = Array.isArray(p.FLASHCARDS) ? p.FLASHCARDS.length : 0;
  s.formulaCount = (p.FORMULAS || []).reduce((n, g) => n + (g && Array.isArray(g.items) ? g.items.length : 0), 0);
  return s;
}
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.mathub.json')).sort();
const packs = files.map(f => {
  const raw = fs.readFileSync(path.join(DIR, f), 'utf8'); const p = JSON.parse(raw);
  // a version from the file's contents, so a rebuilt pack replaces the copy saved in the browser
  const version = parseInt(crypto.createHash('sha1').update(raw).digest('hex').slice(0, 7), 16);
  return Object.assign(stub(p), { id: p.id, version, file: f, hidden: false });
});
fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify({ packs }));
console.log(`packs/index.json: ${packs.map(p => p.id).join(', ') || 'no packs'}`);

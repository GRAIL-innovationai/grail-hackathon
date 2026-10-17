#!/usr/bin/env node
/* ============================================================
   Mathub — build a class pack
   A class is written as a small JavaScript file that exports one
   object (loops and helpers are handy for calendars and question
   banks). This script turns it into the JSON file the admin uploads
   in the admin panel (Add a class), after the same checks the panel
   runs, plus a longer run of every question set:
     node scripts/make-pack.js packs/src/chmy121.js
     → packs/chmy121.mathub.json
   Options: --out <dir>   where to write (default packs/)
            --runs <n>    questions generated per set (default 400)
   The format is described in packs/README.md.
   ============================================================ */
'use strict';
const fs = require('fs'); const path = require('path');
const P = require('../assets/classpacks.js');
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const outDir = path.resolve(opt('--out', path.join(__dirname, '..', 'packs'))); const runs = +opt('--runs', 400);
const src = args[0]; if (!src) { console.error('Usage: node scripts/make-pack.js <class source .js or .json> [--out dir] [--runs n]'); process.exit(2); }
let pack = src.endsWith('.json') ? JSON.parse(fs.readFileSync(src, 'utf8')) : require(path.resolve(src));
if (typeof pack === 'function') pack = pack();
const json = JSON.stringify(pack); pack = JSON.parse(json);   // exactly what the server will store: functions and undefined are gone

const v = P.validate(pack);
const red = s => `\x1b[31m${s}\x1b[0m`, yellow = s => `\x1b[33m${s}\x1b[0m`, green = s => `\x1b[32m${s}\x1b[0m`;
v.warnings.forEach(w => console.log(yellow('note  ') + w));
v.errors.forEach(e => console.log(red('error ') + e));
let longRun = [];
if (!v.errors.length && pack.QUIZ) { const built = P.buildQuiz(P.clean(pack.QUIZ, 'QUIZ', { quiz: true })); longRun = P.exercise(built, runs); longRun.forEach(p => console.log(red('error ') + `QUIZ.questions[${p.q}] (${p.topic}) after more runs: ${p.error}${p.sample ? ' · ' + String(p.sample).slice(0, 80) : ''}`)); }
if (v.errors.length || longRun.length) { console.log(red(`\n${v.errors.length + longRun.length} problem(s): nothing written.`)); process.exit(1); }

fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${pack.id}.mathub.json`); fs.writeFileSync(out, json);
const s = v.stats; const kb = (json.length / 1024).toFixed(1);
console.log(green(`\n${pack.code} ${pack.name} → ${path.relative(process.cwd(), out)} (${kb} KB)`));
console.log(`  ${s.sections} topics in ${s.units} units · ${s.exams} exams · ${s.calendar} calendar rows · ${s.flashcards} flashcards · ${s.formulas} formulas/terms · ${s.practice} practice problems`);
if (pack.QUIZ) {
  const built = P.buildQuiz(P.clean(pack.QUIZ, 'QUIZ', { quiz: true })); const per = {};
  (pack.QUIZ.questions || []).forEach(q => { per[q.topic] = (per[q.topic] || 0) + 1; });
  console.log(`  quiz: ${s.topics} topics, ${s.questions} question sets, ${s.bankItems} written questions; every set ran ${runs} times`);
  Object.keys(built.quiz.TOPICS).forEach(t => { const q = built.quiz.generateSet([t], 1)[0]; console.log(`    ${t.padEnd(14)} ${String(per[t] || 0).padStart(2)} sets · e.g. ${q ? String(q.prompt).replace(/<[^>]+>/g, '').slice(0, 90) : '(none)'}`); });
}
if (json.length > 3 * 1024 * 1024) console.log(red('Larger than 3 MB: the server will refuse it. Trim notes or split question banks.'));
if (path.resolve(outDir) === path.resolve(__dirname, '..', 'packs')) require('./bundle-packs.js');   // packs/ ships with the site: keep its listing current
console.log(`\nIt installs itself on the server with the next deploy (packs/ is bundled), or upload it now in the admin panel: #/admin/packs → Choose a class pack.`);

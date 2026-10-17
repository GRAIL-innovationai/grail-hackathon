#!/usr/bin/env node
/* ============================================================
   Mathub — the dictionaries the site loads:  node scripts/build-i18n.js [--pseudo]
   i18n/catalog.json (the interface's words, numbered; scripts/i18n-extract.js) and i18n/<lang>.tsv (one line per
   number: the number, a tab, the words in that language) → assets/i18n/<lang>.js, keyed by the English.
   In a translation: {1}, {2} are the values the English has; {1|one|few|many} picks a plural by the number in {1}
   (Russian has one, few, many; the others one and other), {2?días:día} is the first when the English had something
   in {2} (a plural "s") and the second when not, and {2|} leaves a value out;
   \n is a new line. Lines starting with # are notes.
   It checks every translation keeps the English's values, and says what is missing.
   --pseudo writes assets/i18n/qps.js, a test language («every word in brackets») that shows on the page what is
   not in the catalog yet: open index.html?lang=qps. Never ship qps.js.
   ============================================================ */
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'i18n'); const OUT = path.join(ROOT, 'assets', 'i18n');
const LANGS = ['es', 'ru', 'fr', 'it', 'pt', 'de'];
const cat = JSON.parse(fs.readFileSync(path.join(DIR, 'catalog.json'), 'utf8')).filter(e => !e.gone);
const byId = new Map(cat.map(e => [e.id, e]));
fs.mkdirSync(OUT, { recursive: true });
const head = l => `/* Mathub — the interface in ${l}. Built by scripts/build-i18n.js from i18n/${l}.tsv: edit that file, not this one. */\n`;
if (process.argv.includes('--pseudo')) {
  const d = {}; cat.forEach(e => { d[e.en] = '«' + e.en + '»'; });
  fs.writeFileSync(path.join(OUT, 'qps.js'), head('qps') + `MathubI18n.add('qps', ${JSON.stringify(d)});\n`);
  console.log(`assets/i18n/qps.js: ${cat.length} entries (the test language; do not ship it)`);
  process.exit(0);
}
let bad = 0;
const vals = s => (s.match(/\{(\d+)(?:\|[^}]*|\?[^:}]*:[^}]*)?\}/g) || []).map(x => +x.match(/\d+/)[0]);
for (const l of LANGS) {
  const f = path.join(DIR, l + '.tsv'); if (!fs.existsSync(f)) { console.log(`${l}: no i18n/${l}.tsv yet`); continue; }
  const d = {}; let n = 0; const seen = new Set();
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, k) => {
    if (!line.trim() || line[0] === '#') return;
    const tab = line.indexOf('\t'); if (tab < 0) { console.log(`  ${l}.tsv:${k + 1}: no tab`); bad++; return; }
    const id = +line.slice(0, tab); const t = line.slice(tab + 1).replace(/\\n/g, '\n').trim(); const e = byId.get(id);
    if (!e) return;   // a number no longer used
    if (seen.has(id)) { console.log(`  ${l}.tsv:${k + 1}: ${id} twice`); bad++; } seen.add(id);
    if (!t) return;
    const want = new Set(vals(e.en)), got = vals(t);
    if (got.some(v => !want.has(v)) || [...want].some(v => !got.includes(v))) { console.log(`  ${l}.tsv:${k + 1}: values differ — "${e.en}" → "${t}"`); bad++; }
    d[e.en] = t; n++;
  });
  fs.writeFileSync(path.join(OUT, l + '.js'), head(l) + `MathubI18n.add('${l}', ${JSON.stringify(d)});\n`);
  const miss = cat.filter(e => !seen.has(e.id)).length;
  console.log(`${l}: ${n} of ${cat.length} translated${miss ? `, ${miss} missing` : ''} → assets/i18n/${l}.js (${Math.round(fs.statSync(path.join(OUT, l + '.js')).size / 1024)} KB)`);
}
if (bad) { console.log(`${bad} problem(s)`); process.exitCode = 1; }

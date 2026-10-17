#!/usr/bin/env node
/* ============================================================
   Mathub — class data for Bo, the AI tutor (api/ai.php)
   The built-in classes live in assets/*-data.js, which the server cannot read. This writes the parts
   Bo needs (course facts, grading, exams, calendar, units, and each topic's ideas) as one small JSON
   file per class in api/classdata/, where the server turns it into a compact text summary. Class packs
   (packs/*.mathub.json) and classes students make are read by the server directly.
   api/.htaccess keeps api/classdata/ off the web.
   Run from calc1/ after changing a class:  node scripts/build-classdata.js
   ============================================================ */
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..'); const OUT = path.join(ROOT, 'api', 'classdata');
global.window = {};
['calc-data', 'calc-quiz', 'physics-data', 'physics-quiz', 'precalc-data', 'precalc-quiz', 'writ-data', 'csci-data', 'csci-quiz', 'biob-data', 'biob-quiz', 'kin-data', 'kin-quiz', 'psyx-data', 'psyx-quiz'].forEach(f => require(path.join(ROOT, 'assets', f + '.js')));
const Courses = window.Courses;
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o && o[k] != null && o[k] !== '').map(k => [k, o[k]]));
fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const id of Object.keys(Courses)) {
  const C = Courses[id]; if (!C || !C.COURSE || !Array.isArray(C.SECTIONS)) continue;
  const data = {
    id, code: C.code, name: C.name, short: C.short, term: C.term, kind: C.kind || '',
    COURSE: pick(C.COURSE, ['code', 'name', 'term', 'school', 'credits', 'instructor', 'instructors', 'instructorEmail', 'officeHours', 'lectures', 'meets', 'classDays', 'textbook', 'deadlines']),
    GRADING: C.GRADING ? pick(C.GRADING, ['categories', 'scale']) : null,
    EXAMS: (C.EXAMS || []).map(e => pick(e, ['id', 'name', 'date', 'endDate', 'dateLabel', 'covers', 'units', 'weight', 'cumulative'])),
    CALENDAR: (C.CALENDAR || []).map(r => r.slice(0, 3)),
    UNITS: (C.UNITS || []).map(u => pick(u, ['n', 'title', 'sections', 'exam'])),
    SECTIONS: C.SECTIONS.map(s => pick(s, ['id', 'label', 'title', 'unit', 'ideas'])),
    READINGS: (C.READINGS || []).map(r => pick(r, ['id', 'title', 'author']))
  };
  fs.writeFileSync(path.join(OUT, id + '.json'), JSON.stringify(data));
  n++;
}
console.log(`Wrote ${n} class files to api/classdata/`);

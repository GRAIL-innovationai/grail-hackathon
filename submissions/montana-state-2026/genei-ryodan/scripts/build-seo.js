#!/usr/bin/env node
/* ============================================================
   Mathub — static study-guide pages for search engines
   The app itself is a hash-routed single page, which search engines
   index as one URL. This script renders every topic of every class
   into a plain HTML page under learn/, plus a class page per course,
   a hub page, sitemap.xml and robots.txt, so "M171 chain rule notes"
   or "PHSX 220 exam 2" can rank and lead students into the app.
   Run from calc1/:  node scripts/build-seo.js
   ============================================================ */
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://mathub.space';
const SITE = 'Mathub';
const BUILD = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/data-build="([^"]+)"/) || [])[1] || 'dev';
const TODAY = new Date().toISOString().slice(0, 10);

global.window = {};
['calc-data', 'calc-quiz', 'physics-data', 'physics-quiz', 'precalc-data', 'precalc-quiz', 'writ-data', 'csci-data', 'csci-quiz', 'biob-data', 'biob-quiz', 'kin-data', 'kin-quiz', 'psyx-data', 'psyx-quiz'].forEach(f => require(path.join(ROOT, 'assets', f + '.js')));
const Courses = window.Courses; const ORDER = ['calc', 'physics', 'precalc', 'writ', 'csci', 'biob', 'kin', 'psyx'].filter(id => Courses[id]);

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const text = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\$\$?([^$]*)\$\$?/g, '$1').replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
const slug = s => String(s).toLowerCase().replace(/§/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const fmtDate = iso => { const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); };
const LOGO = '<svg class="mh-logo bo-mark" width="35" height="30" viewBox="10 10 100 86" aria-hidden="true"><path d="M22 46L14 14l32 14z" fill="#C98B4B"/><path d="M98 46l8-32-32 14z" fill="#C98B4B"/><path d="M24 40l-6-19 20 10z" fill="#3B2A1C"/><path d="M96 40l6-19-20 10z" fill="#3B2A1C"/><ellipse cx="60" cy="58" rx="40" ry="34" fill="#D9A15B"/><ellipse cx="60" cy="69" rx="27" ry="21" fill="#F3DFB8"/><path d="M30 42c4 5 8 10 8 18M90 42c-4 5-8 10-8 18" stroke="#8B5A2B" stroke-width="3.2" stroke-linecap="round" fill="none"/><path d="M19 70l17 2M19 78l17-1M101 70l-17 2M101 78l-17-1" stroke="#8B5A2B" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="46" cy="56" rx="7.5" ry="8.5" fill="#fff"/><ellipse cx="74" cy="56" rx="7.5" ry="8.5" fill="#fff"/><circle cx="47" cy="57.5" r="4.6" fill="#2A1B0E"/><circle cx="75" cy="57.5" r="4.6" fill="#2A1B0E"/><circle cx="48.6" cy="55.4" r="1.6" fill="#fff"/><circle cx="76.6" cy="55.4" r="1.6" fill="#fff"/><path d="M54 68h12l-6 6z" fill="#3B2A1C"/><path d="M60 74v3.5M60 77.5c-3 3-7 3-9 0M60 77.5c3 3 7 3 9 0" stroke="#3B2A1C" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>';
const KIND = { calc: 'math', physics: 'physics', precalc: 'math', writ: 'writing', csci: 'programming', biob: 'biology', kin: 'kinesiology', psyx: 'psychology' };
const BLURB = {
  calc: 'Limits, derivatives, integrals and everything in between, section by section from Active Calculus.',
  physics: 'Kinematics, forces, energy, momentum and rotation, with simulators and worked problems.',
  precalc: 'Functions, exponentials, logarithms and trigonometry, section by section from the course text.',
  writ: 'Week-by-week guide to the writing projects, the notebook, the readings and the portfolio.',
  csci: 'Python from data types to classes, then NumPy, matplotlib and pandas, with a code playground.',
  biob: 'The chemistry of life, cells and energy, then genetics from Mendel to DNA technology, topic by topic.',
  kin: 'Planes, joints, levers and the muscles that move the spine, arms and legs, through to gait.',
  psyx: 'The DSM-5-TR disorders from anxiety to schizophrenia: criteria, causes and treatments, topic by topic.'
};
const topicSlug = s => slug(`${s.label || s.id}-${s.title}`);
const courseDir = c => path.join(ROOT, 'learn', c);
const courseUrl = c => `/learn/${c}/`;
const topicUrl = (c, s) => `/learn/${c}/${topicSlug(s)}.html`;
const quizTopics = (C, secId) => C.quiz ? Object.keys(C.quiz.TOPICS).filter(t => C.quiz.TOPICS[t].sec === secId) : [];
const meets = C => C.COURSE.lectures || C.COURSE.meets || C.COURSE.classDays || '';
const instructor = C => C.COURSE.instructor || (Array.isArray(C.COURSE.instructors) ? C.COURSE.instructors.map(i => i.name || i).join(', ') : '');

const ogFor = c => (c && fs.existsSync(path.join(ROOT, 'assets', `og-${c}.png`)) ? `/assets/og-${c}.png` : '/assets/og.png');
function page(o) {
  const hasTex = /\$/.test(o.body); const image = o.image || ogFor(o.course);
  const crumbs = [{ n: SITE, u: '/' }, { n: 'Study guides', u: '/learn/' }].concat(o.crumbs || []);
  const breadcrumbLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.n, item: SITE_URL + c.u })) };
  const ld = [breadcrumbLd].concat(o.ld || []);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://cdn.jsdelivr.net/npm/mathjax@3.2.2/; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https:; connect-src 'self' https://cdn.jsdelivr.net/npm/mathjax@3.2.2/; object-src 'none'; base-uri 'self'; form-action 'self'">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<link rel="canonical" href="${SITE_URL}${o.url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="${o.type === 'website' ? 'website' : 'article'}">
<meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${esc(o.ogTitle || o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:url" content="${SITE_URL}${o.url}">
<meta property="og:image" content="${SITE_URL}${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.ogTitle || o.title)}">
<meta name="twitter:description" content="${esc(o.desc)}">
<meta name="twitter:image" content="${SITE_URL}${image}">
<meta name="theme-color" content="#2B55B8">
<link rel="icon" type="image/svg+xml" href="/assets/icon.svg">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/icon-180.png">
<link rel="stylesheet" href="/assets/fonts.css?v=${BUILD}">
<link rel="stylesheet" href="/assets/seo.css?v=${BUILD}">
${hasTex ? `<script src="/assets/mathjax-static.js?v=${BUILD}"></script>
<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js"></script>` : ''}
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body class="${o.course ? 'course-' + o.course : ''}">
<header class="s-head"><a class="s-brand" href="/">${LOGO}<span><b>Mathub</b><small>Learn <i>/</i> Practice <i>/</i> Excel</small></span></a><nav class="s-nav"><a href="/learn/">Study guides</a>${o.course ? `<a href="${courseUrl(o.course)}">${esc(Courses[o.course].short)}</a>` : ''}<a class="s-btn" href="${o.appLink || '/'}">Open Mathub</a></nav></header>
<main class="s-wrap">
<nav class="s-crumbs" aria-label="Breadcrumb">${crumbs.map((c, i) => i < crumbs.length - 1 ? `<a href="${c.u}">${esc(c.n)}</a><span>›</span>` : `<span aria-current="page">${esc(c.n)}</span>`).join('')}</nav>
${o.body}
</main>
<footer class="s-foot"><div><b>${SITE}</b> is a free, independent study site made by a Montana State student. It is not affiliated with Montana State University; syllabus details come from each class and can change, so confirm dates on Canvas.</div><div class="s-foot-links">${ORDER.map(c => `<a href="${courseUrl(c)}">${esc(Courses[c].code)}</a>`).join('')}<a href="/learn/guides/">Guides</a><a href="/learn/resources.html">Resources</a><a href="/learn/whats-new.html">What's new</a><a href="/#/contact">Contact</a><a href="/#/policy">Terms &amp; Privacy</a></div></footer>
</body>
</html>
`;
}

function topicBody(c, C, s, i) {
  const unit = C.UNITS.find(u => u.n === s.unit); const prev = C.SECTIONS[i - 1], next = C.SECTIONS[i + 1]; const topics = quizTopics(C, s.id);
  const exam = C.EXAMS.find(e => e.sections && e.sections.includes(s.id));
  const ideas = s.ideas && s.ideas.length ? s.ideas : (s.bullets || []);
  const parts = [];
  parts.push(`<div class="s-eyebrow">${esc(C.code)} ${esc(C.name)}${unit ? ` · Unit ${unit.n}: ${esc(unit.title)}` : ''}${exam ? ` · on ${esc(exam.name)}` : ''}</div>`);
  parts.push(`<h1>${esc(s.label && s.label !== s.id ? s.label + ' ' : (s.label || ''))}${esc(s.title)}</h1>`);
  parts.push(`<p class="s-lead">${C.kind === 'writing' ? `What happens in ${esc(s.label)} of ${esc(C.code)} ${esc(C.name)} at Montana State University, with the notebook prompts and project deadlines for the week.` : `Study notes for <b>${esc(s.title)}</b> in ${esc(C.code)} ${esc(C.name)} at Montana State University: the big ideas, ${s.formulas && s.formulas.length ? 'key formulas, ' : ''}${s.code && s.code.length ? 'code you should know, ' : ''}a worked example, common mistakes and an exam tip. The same topic has endless practice questions and flashcards in Mathub.`}</p>`);
  if (ideas.length) parts.push(`<section><h2>${C.kind === 'writing' ? 'This week' : 'Big ideas'}</h2><ul class="s-list">${ideas.map(x => `<li>${x}</li>`).join('')}</ul></section>`);
  if (s.formulas && s.formulas.length) parts.push(`<section><h2>Key formulas</h2>${s.formulas.map(f => `<div class="s-formula"><div class="s-fname">${esc(f.n)}</div><div class="s-tex">$$${f.t}$$</div></div>`).join('')}</section>`);
  if (s.code && s.code.length) parts.push(`<section><h2>Code you should know</h2>${s.code.map(x => `<div class="s-code"><div class="s-code-h">${esc(x.t)}</div><pre><code>${esc(x.c)}</code></pre>${x.out ? `<div class="s-out"><span>Output</span><pre>${esc(x.out)}</pre></div>` : ''}</div>`).join('')}</section>`);
  if (s.example && s.example.p) parts.push(`<section><h2>Worked example</h2><div class="s-callout"><div>${s.example.p}</div>${s.example.s ? `<details><summary>Show the solution</summary><div class="s-solution">${s.example.s}</div></details>` : ''}</div></section>`);
  if (s.pitfalls && s.pitfalls.length) parts.push(`<section><h2>Common mistakes</h2><ul class="s-list">${s.pitfalls.map(x => `<li>${x}</li>`).join('')}</ul></section>`);
  if (s.tip) parts.push(`<section><div class="s-tip"><span class="s-eyebrow">Exam tip</span>${s.tip}</div></section>`);
  const cta = [`<a class="s-btn primary" href="/#/${c}/notes/${encodeURIComponent(s.id)}">Open these notes in Mathub</a>`];
  if (topics.length) cta.push(`<a class="s-btn" href="/#/${c}/practice?topics=${encodeURIComponent(topics.join(','))}">Practice questions on this topic</a>`);
  if (C.FLASHCARDS && C.FLASHCARDS.some(f => f.sec === s.id)) cta.push(`<a class="s-btn" href="/#/${c}/flashcards?sec=${encodeURIComponent(s.id)}">Flashcards</a>`);
  if (C.kind === 'code') cta.push(`<a class="s-btn" href="/#/${c}/playground">Python playground</a>`);
  if (C.kind === 'writing') cta.push(`<a class="s-btn" href="/#/${c}/readings">Readings as audiobooks</a>`);
  parts.push(`<section class="s-cta"><h2>Keep going in Mathub</h2><p>Mathub is free for Montana State students: ${C.quiz ? 'an endless quizzer with worked explanations, one-question lessons, ' : ''}flashcards, exam prep checklists, the class calendar with every deadline, a grade calculator and a study board for ${esc(C.code)}.</p><div class="s-btns">${cta.join('')}</div></section>`);
  parts.push(`<nav class="s-prevnext" aria-label="Previous and next topic">${prev ? `<a href="${topicUrl(c, prev)}">← ${esc(prev.label || '')} ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a href="${topicUrl(c, next)}">${esc(next.label || '')} ${esc(next.title)} →</a>` : '<span></span>'}</nav>`);
  return parts.join('\n');
}

function coursePage(c, C) {
  const exams = C.EXAMS.map(e => `<tr><td><b>${esc(e.name)}</b></td><td>${esc(e.dateLabels ? Object.values(e.dateLabels).join('; ') : (e.dateLabel || fmtDate(e.date)))}</td><td>${esc(e.covers || '')}</td></tr>`).join('');
  const units = C.UNITS.map(u => `<section class="s-unit"><h2>Unit ${u.n}: ${esc(u.title)}</h2><ol class="s-topics">${u.sections.map(id => C.SECTIONS.find(s => s.id === id)).filter(Boolean).map(s => `<li><a href="${topicUrl(c, s)}"><span class="s-num">${esc(s.label && s.label !== s.id ? s.label : '')}</span>${esc(s.title)}</a></li>`).join('')}</ol></section>`).join('');
  const offers = { calc: ['Section notes with formulas, worked examples and exam tips', 'Endless quizzer with 30+ procedural question types and worked explanations', 'Flashcards, learning path and one-question lessons', 'Exam prep checklists and practice sets', 'Grapher, labs and a grade calculator', 'Calendar with every WebWork, homework, lab and exam date'], physics: ['Section notes with formulas and worked problems', 'Endless quizzer and one-question lessons', 'Projectile, motion and force simulators', 'Exam prep checklists and practice sets', 'Grade calculator and study planner', 'Calendar with labs, homework and exams'], precalc: ['Section notes with formulas and worked examples', 'Endless quizzer with worked explanations', 'Unit circle and grapher tools', 'Exam prep, flashcards and learning path', 'Grade calculator', 'Calendar with every quiz and exam'], writ: ['Week-by-week guide to all three projects and the portfolio', 'The class readings as read-along audiobooks', 'English Phonetics Lab: IPA practice, minimal pairs, symbols and a transcription tool', 'Deadline calendar and grade calculator', 'Writer’s notebook reminders'], csci: ['Topic notes with runnable code examples', 'Code playground: Python in the browser with turtle drawings and matplotlib charts', 'Endless "what does this print" questions and lessons', 'Cheat sheet, flashcards and practice sets for all three exams', 'Calendar with every lab, program and exam', 'Grade calculator with the syllabus weights'], biob: ['Topic notes with worked examples and Campbell reading pages', 'Genetics, pH, respiration and PCR questions generated fresh with worked answers', 'Formulas and key-terms sheet, flashcards and practice sets for all four exams', 'Calendar with every lecture topic and exam window', 'Grade calculator with the 400-point breakdown'], kin: ['Topic notes for every joint and region, with worked examples', 'Torque, lever, range-of-motion and gait questions with computed answers', 'Key-terms sheet with ROM norms, nerves and lever rules', 'Calendar that follows your lab section, with every practical and quiz window', 'Grade calculator that applies the best of the six exam-weighting options'], psyx: ['Topic notes on every disorder: criteria, causes and treatments', 'Criteria and timing questions (durations, counts, severity) generated fresh', 'Criteria and key-terms sheet, flashcards and practice sets for all three exams', 'Calendar that follows your section (Tue/Thu or Mon/Wed)', 'Grade calculator with the syllabus points'] }[c] || [];
  const body = `<div class="s-eyebrow">Montana State University · ${esc(C.term)} · ${KIND[c] || ''}</div>
<h1>${esc(C.code)} ${esc(C.name)}: study guide</h1>
<p class="s-lead">${esc(BLURB[c] || C.tagline || '')} Every topic below is a free study page; the same material lives in the Mathub app with practice, flashcards, the calendar and a grade calculator for this class.</p>
<div class="s-facts">${instructor(C) ? `<div><span>Instructor</span><b>${esc(instructor(C))}</b></div>` : ''}${meets(C) ? `<div><span>Meets</span><b>${esc(meets(C))}</b></div>` : ''}${C.COURSE.credits ? `<div><span>Credits</span><b>${esc(C.COURSE.credits)}</b></div>` : ''}<div><span>Topics</span><b>${C.SECTIONS.length}</b></div></div>
${exams ? `<section><h2>Exams and major deadlines</h2><div class="s-table"><table><thead><tr><th>Exam</th><th>When</th><th>Covers</th></tr></thead><tbody>${exams}</tbody></table></div></section>` : ''}
<section class="s-cta"><h2>What Mathub gives you for ${esc(C.code)}</h2><ul class="s-list">${offers.map(x => `<li>${esc(x)}</li>`).join('')}</ul><div class="s-btns"><a class="s-btn primary" href="/#/${c}">Open ${esc(C.short)} in Mathub</a><a class="s-btn" href="/#/${c}/calendar">Class calendar</a></div></section>
${units}`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${C.code} ${C.name} study guide`, url: SITE_URL + courseUrl(c), description: BLURB[c] || C.tagline, isPartOf: { '@type': 'WebSite', name: SITE, url: SITE_URL + '/' }, about: { '@type': 'Thing', name: `${C.code} ${C.name}, Montana State University` }, hasPart: C.SECTIONS.map(s => ({ '@type': 'LearningResource', name: `${s.label && s.label !== s.id ? s.label + ' ' : ''}${s.title}`, url: SITE_URL + topicUrl(c, s) })) }];
  return page({ title: `${C.code} ${C.name} study guide · Montana State · ${SITE}`, desc: clip(`${C.code} ${C.name} at Montana State University: ${BLURB[c] || ''} ${C.SECTIONS.length} topic pages, exam dates and free practice in Mathub.`, 158), url: courseUrl(c), type: 'website', course: c, appLink: `/#/${c}`, crumbs: [{ n: C.short, u: courseUrl(c) }], body, ld });
}

function hubPage() {
  const cards = ORDER.map(c => { const C = Courses[c]; return `<a class="s-card" href="${courseUrl(c)}"><div class="s-eyebrow">${esc(C.code)} · ${esc(KIND[c] || '')}</div><h2>${esc(C.name)}</h2><p>${esc(BLURB[c] || C.tagline || '')}</p><small>${C.SECTIONS.length} topics${C.FLASHCARDS && C.FLASHCARDS.length ? ` · ${C.FLASHCARDS.length} flashcards` : ''}${C.quiz ? ' · endless practice' : ''}</small></a>`; }).join('');
  const body = `<div class="s-eyebrow">Montana State University · Bozeman · Fall 2026</div>
<h1>Free study guides for Montana State classes</h1>
<p class="s-lead">Mathub turns each class syllabus into topic-by-topic notes, practice questions, flashcards and a deadline calendar. Pick a class below to read the study pages, or open the app to practice.</p>
<div class="s-cards">${cards}</div>
<section class="s-cta"><h2>How Mathub works</h2><ul class="s-list"><li><b>Notes</b> for every section with big ideas, formulas, a worked example, common mistakes and an exam tip.</li><li><b>Endless practice</b>: procedurally generated questions with worked explanations, one-question lessons, daily challenges and mock exams.</li><li><b>The calendar</b> with every homework, lab, quiz, exam and drop date from the syllabus, plus a study planner.</li><li><b>Tools</b>: grade calculators, a GPA calculator, graphers, physics simulators, a Python playground and read-along audiobooks.</li><li><b>A class board</b> to ask questions and study with classmates, with streaks, XP, badges and leagues to keep you going.</li></ul><div class="s-btns"><a class="s-btn primary" href="/">Open Mathub</a></div></section>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Study guides for Montana State classes', url: SITE_URL + '/learn/', isPartOf: { '@type': 'WebSite', name: SITE, url: SITE_URL + '/' }, hasPart: ORDER.map(c => ({ '@type': 'CollectionPage', name: `${Courses[c].code} ${Courses[c].name} study guide`, url: SITE_URL + courseUrl(c) })) }];
  return page({ title: `Study guides for Montana State classes: M171, PHSX 220, M151Q, WRIT 101, CSCI 127 · ${SITE}`, desc: 'Free topic-by-topic study notes, practice questions, flashcards and deadline calendars for Montana State University classes: Calculus I, Physics I, Precalculus, College Writing I and Joy and Beauty of Data.', url: '/learn/', type: 'website', appLink: '/', body, ld });
}

function whatsNewPage() {
  require(path.join(ROOT, 'assets', 'changelog.js')); const LOG = (global.MATHUB_CHANGELOG || window.MATHUB_CHANGELOG || []);
  const body = `<div class="s-eyebrow">Mathub · release notes</div>
<h1>What's new in Mathub</h1>
<p class="s-lead">Every release, newest first. Mathub ships most weeks; the current build is ${esc(LOG[0] ? LOG[0].v : BUILD)}. Ideas and bug reports are welcome on the class board or with the flag on any page.</p>
${LOG.map((r, i) => `<section class="s-release${i === 0 ? ' latest' : ''}"><h2>${esc(r.t)}</h2><div class="s-eyebrow">${esc(fmtDate(r.d))} · build ${esc(r.v)}</div><ul class="s-list">${r.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>`).join('')}
<section class="s-cta"><div class="s-btns"><a class="s-btn primary" href="/#/whatsnew">Open in the app</a><a class="s-btn" href="/learn/">All study guides</a></div></section>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'WebPage', name: "What's new in Mathub", url: SITE_URL + '/learn/whats-new.html', dateModified: LOG[0] ? LOG[0].d : TODAY, isPartOf: { '@type': 'WebSite', name: SITE, url: SITE_URL + '/' } }];
  return page({ title: `What's new · release notes · ${SITE}`, desc: clip(`Mathub release notes: ${LOG.slice(0, 3).map(r => r.t).join('; ')}.`, 158), url: '/learn/whats-new.html', type: 'website', crumbs: [{ n: "What's new", u: '/learn/whats-new.html' }], body, ld });
}

/* ---------- study guides and resources ---------- */
require(path.join(ROOT, 'assets', 'guides-data.js')); require(path.join(ROOT, 'assets', 'resources-data.js'));
const GUIDES = global.MATHUB_GUIDES || window.MATHUB_GUIDES || []; const RES = global.MATHUB_RESOURCES || window.MATHUB_RESOURCES || { GROUPS: [], ITEMS: [], KINDS: {} };
const inlineMd = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, u) => /^https?:/.test(u) ? `<a href="${u}" target="_blank" rel="noopener">${txt}</a>` : `<a href="${u.startsWith('#/guides/') ? '/learn/guides/' + u.slice(9) + '.html' : '/' + u}">${txt}</a>`).replace(/\n/g, '<br>');
const guideUrl = g => `/learn/guides/${g.id}.html`;
function guideBodyHtml(g) { return g.body.map(b => b.h ? `<h2>${inlineMd(b.h)}</h2>` : b.p ? `<p>${inlineMd(b.p)}</p>` : b.ul ? `<ul class="s-list">${b.ul.map(x => `<li>${inlineMd(x)}</li>`).join('')}</ul>` : b.ol ? `<ol class="s-list ol">${b.ol.map(x => `<li>${inlineMd(x)}</li>`).join('')}</ol>` : b.tip ? `<div class="s-tip"><span class="s-eyebrow">Tip</span><div>${inlineMd(b.tip)}</div></div>` : b.q ? `<blockquote class="s-quote">${inlineMd(b.q)}</blockquote>` : '').join(''); }
function guidePage(g) {
  const others = GUIDES.filter(x => x !== g).slice(0, 4);
  const body = `<div class="s-eyebrow">Mathub study guide · ${g.minutes} min read · ${g.tags.map(esc).join(' · ')}</div>
<h1>${esc(g.title)}</h1>
<p class="s-lead">${esc(g.blurb)}</p>
${guideBodyHtml(g)}
<section class="s-cta"><h2>Put it to work</h2><p>Mathub turns these ideas into a daily plan: due flashcards on a spacing schedule, one-question lessons, endless practice and a focus timer, for ${ORDER.map(c => Courses[c].code).join(', ')}.</p><div class="s-btns"><a class="s-btn primary" href="/#/today">Open Today in Mathub</a><a class="s-btn" href="/learn/guides/">All study guides</a></div></section>
<section><h2>More guides</h2><div class="s-cards">${others.map(o => `<a class="s-card" href="${guideUrl(o)}"><div class="s-eyebrow">${o.minutes} min</div><h2>${esc(o.title)}</h2><p>${esc(o.blurb)}</p></a>`).join('')}</div></section>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.blurb, url: SITE_URL + guideUrl(g), datePublished: TODAY, dateModified: TODAY, author: { '@type': 'Organization', name: SITE }, publisher: { '@type': 'Organization', name: SITE }, keywords: g.tags.join(', '), timeRequired: `PT${g.minutes}M` }];
  return page({ title: `${g.title} · study guide · ${SITE}`, desc: clip(g.blurb, 158), url: guideUrl(g), crumbs: [{ n: 'Guides', u: '/learn/guides/' }, { n: g.title, u: guideUrl(g) }], body, ld });
}
function guidesIndexPage() {
  const body = `<div class="s-eyebrow">Mathub · study skills</div><h1>Study guides for college classes</h1><p class="s-lead">${GUIDES.length} short, practical guides written for Montana State students in calculus, physics, precalculus, writing and Python: how to study for a math exam, active recall, focus, office hours, test anxiety, note-taking and more. Each takes under six minutes.</p>
<div class="s-cards">${GUIDES.map(g => `<a class="s-card" href="${guideUrl(g)}"><div class="s-eyebrow">${g.minutes} min · ${g.tags.slice(0, 2).map(esc).join(' · ')}</div><h2>${esc(g.title)}</h2><p>${esc(g.blurb)}</p></a>`).join('')}</div>
<section class="s-cta"><h2>Study with Mathub</h2><p>Free notes, endless practice, flashcards and calendars for every class, plus a focus room and a resources hub.</p><div class="s-btns"><a class="s-btn primary" href="/">Open Mathub</a><a class="s-btn" href="/learn/resources.html">Resources</a></div></section>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Study guides', url: SITE_URL + '/learn/guides/', hasPart: GUIDES.map(g => ({ '@type': 'Article', headline: g.title, url: SITE_URL + guideUrl(g) })) }];
  return page({ title: `Study guides: how to study for math and physics exams, focus, notes · ${SITE}`, desc: clip(`${GUIDES.length} practical study-skills guides for college students: exam plans, active recall, focus blocks, office hours, test anxiety, note-taking, coding and essay drafting.`, 158), url: '/learn/guides/', type: 'website', crumbs: [{ n: 'Guides', u: '/learn/guides/' }], body, ld });
}
function resourcesPage() {
  const grp = g => RES.ITEMS.filter(it => it.g === g.id && /^https?:/.test(it.u));
  const body = `<div class="s-eyebrow">Mathub · resources</div><h1>Free study resources for Montana State classes</h1><p class="s-lead">Curated links for every class and for studying in general: free textbooks, video channels, practice sites, tools, and the campus services most students never use. Save any of them to your account inside Mathub.</p>
${RES.GROUPS.map(g => { const items = grp(g); return items.length ? `<section><h2>${esc(g.title)}</h2><p>${esc(g.blurb)}</p><ul class="s-res">${items.map(it => `<li><a href="${esc(it.u)}" target="_blank" rel="noopener">${esc(it.t)}</a> <span class="s-kind">${esc(RES.KINDS[it.k] || it.k)}</span><br><span class="s-desc">${esc(it.d)}</span></li>`).join('')}</ul></section>` : ''; }).join('')}
<section class="s-cta"><h2>Everything else lives in the app</h2><p>Practice questions, flashcards, calendars, a focus room, a code playground and a class board.</p><div class="s-btns"><a class="s-btn primary" href="/#/resources">Open resources in Mathub</a><a class="s-btn" href="/learn/guides/">Study guides</a></div></section>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Study resources for Montana State classes', url: SITE_URL + '/learn/resources.html', isPartOf: { '@type': 'WebSite', name: SITE, url: SITE_URL + '/' } }];
  return page({ title: `Free study resources for M171, PHSX 220, M151Q, WRIT 101 and CSCI 127 · ${SITE}`, desc: clip('Curated free resources for Montana State classes: textbooks, video channels, practice sites, tools, tutoring, the Writing Center, counseling and more, organized by class.', 158), url: '/learn/resources.html', type: 'website', crumbs: [{ n: 'Resources', u: '/learn/resources.html' }], body, ld });
}

/* ---------- write everything ---------- */
const written = [];
const out = (rel, content) => { const p = path.join(ROOT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); written.push(rel); };
fs.rmSync(path.join(ROOT, 'learn'), { recursive: true, force: true });
out('learn/index.html', hubPage());
out('learn/.htaccess', '# Static study pages: cache for an hour, revalidate after\n<IfModule mod_headers.c>\n  <FilesMatch "\\.html$">\n    Header set Cache-Control "public, max-age=3600, must-revalidate"\n  </FilesMatch>\n</IfModule>\n');
const urls = [{ u: '/', p: '1.0', f: 'daily' }, { u: '/learn/', p: '0.9', f: 'weekly' }];
out('learn/whats-new.html', whatsNewPage()); urls.push({ u: '/learn/whats-new.html', p: '0.6', f: 'weekly' });
out('learn/guides/index.html', guidesIndexPage()); urls.push({ u: '/learn/guides/', p: '0.8', f: 'monthly' });
GUIDES.forEach(g => { out(`learn/guides/${g.id}.html`, guidePage(g)); urls.push({ u: guideUrl(g), p: '0.7', f: 'monthly' }); });
out('learn/resources.html', resourcesPage()); urls.push({ u: '/learn/resources.html', p: '0.8', f: 'monthly' });
for (const c of ORDER) {
  const C = Courses[c]; out(`learn/${c}/index.html`, coursePage(c, C)); urls.push({ u: courseUrl(c), p: '0.8', f: 'weekly' });
  C.SECTIONS.forEach((s, i) => {
    const ideas = (s.ideas && s.ideas.length ? s.ideas : s.bullets || []).map(text);
    const title = `${s.label && s.label !== s.id ? s.label + ' ' : ''}${s.title} · ${C.code} ${C.name} · ${SITE}`;
    const desc = clip(`${C.code} ${s.title}: ${ideas.slice(0, 2).join(' ')}`.replace(/\s+/g, ' '), 158);
    const ld = [{ '@context': 'https://schema.org', '@type': 'LearningResource', name: `${s.label && s.label !== s.id ? s.label + ' ' : ''}${s.title}`, description: desc, url: SITE_URL + topicUrl(c, s), inLanguage: 'en', learningResourceType: 'Study guide', educationalLevel: 'Undergraduate', dateModified: TODAY, about: { '@type': 'Thing', name: `${C.code} ${C.name}, Montana State University` }, isPartOf: { '@type': 'CollectionPage', name: `${C.code} ${C.name} study guide`, url: SITE_URL + courseUrl(c) }, publisher: { '@type': 'Organization', name: SITE, url: SITE_URL + '/' } }];
    out(`learn/${c}/${topicSlug(s)}.html`, page({ title, desc, url: topicUrl(c, s), course: c, appLink: `/#/${c}/notes/${encodeURIComponent(s.id)}`, crumbs: [{ n: C.short, u: courseUrl(c) }, { n: `${s.label && s.label !== s.id ? s.label + ' ' : ''}${s.title}`, u: topicUrl(c, s) }], body: topicBody(c, C, s, i), ld }));
    urls.push({ u: topicUrl(c, s), p: '0.7', f: 'monthly' });
  });
}
out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(x => `  <url><loc>${SITE_URL}${x.u}</loc><lastmod>${TODAY}</lastmod><changefreq>${x.f}</changefreq><priority>${x.p}</priority></url>`).join('\n')}\n</urlset>\n`);
out('robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
console.log(`Wrote ${written.length} files: ${urls.length - 3} topic, class, guide and resource pages, learn/index.html, learn/whats-new.html, sitemap.xml, robots.txt (build ${BUILD}).`);

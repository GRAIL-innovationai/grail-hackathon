#!/usr/bin/env node
/* ============================================================
   Mathub — social preview cards (1200×630 PNG)
   Renders assets/og.png (site) and assets/og-<class>.png (one per
   class, in the class colour) with headless Chromium, so links to
   the app and to /learn pages show a proper card on iMessage,
   Discord, Slack, Facebook and X.
   Run from calc1/ after adding a class:  node scripts/build-og.js
   Needs Playwright: `npm install` inside tests/ provides it.
   ============================================================ */
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'))); }
global.window = {}; require(path.join(ROOT, 'assets', 'courses-index.js')); const Courses = window.Courses;
const ORDER = ['calc', 'physics', 'precalc', 'writ', 'csci', 'biob', 'kin', 'psyx'].filter(id => Courses[id]);
const COLORS = { site: '#1A64D6', calc: '#1D5BB5', physics: '#0F6E66', precalc: '#C2410C', writ: '#6B3FA0', csci: '#2E7D32', biob: '#4D7C0F', kin: '#B45309', psyx: '#BE185D' };
// Bo's head on a white tile: the same mark as the app (assets/app.js App.LOGO_PATHS)
const BO = '<path d="M22 46L14 14l32 14z" fill="#C98B4B"/><path d="M98 46l8-32-32 14z" fill="#C98B4B"/><path d="M24 40l-6-19 20 10z" fill="#3B2A1C"/><path d="M96 40l6-19-20 10z" fill="#3B2A1C"/><ellipse cx="60" cy="58" rx="40" ry="34" fill="#D9A15B"/><ellipse cx="60" cy="69" rx="27" ry="21" fill="#F3DFB8"/><path d="M30 42c4 5 8 10 8 18M90 42c-4 5-8 10-8 18" stroke="#8B5A2B" stroke-width="3.2" stroke-linecap="round" fill="none"/><path d="M19 70l17 2M19 78l17-1M101 70l-17 2M101 78l-17-1" stroke="#8B5A2B" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="46" cy="56" rx="7.5" ry="8.5" fill="#fff"/><ellipse cx="74" cy="56" rx="7.5" ry="8.5" fill="#fff"/><circle cx="47" cy="57.5" r="4.6" fill="#2A1B0E"/><circle cx="75" cy="57.5" r="4.6" fill="#2A1B0E"/><circle cx="48.6" cy="55.4" r="1.6" fill="#fff"/><circle cx="76.6" cy="55.4" r="1.6" fill="#fff"/><path d="M54 68h12l-6 6z" fill="#3B2A1C"/><path d="M60 74v3.5M60 77.5c-3 3-7 3-9 0M60 77.5c3 3 7 3 9 0" stroke="#3B2A1C" stroke-width="2.2" stroke-linecap="round" fill="none"/>';
const LOGO = `<svg width="116" height="116" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#fff"/><g transform="translate(-2.8 1.3) scale(0.58)">${BO}</g></svg>`;
// the site faces, embedded from assets/fonts so the cards render the same with or without web access
const font = (fam, file) => `@font-face{font-family:"${fam}";font-weight:100 900;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, 'assets', 'fonts', file)).toString('base64')}) format("woff2")}`;
const FONT_LINK = `<style>${font('Gabarito', 'gabarito-var.woff2')}${font('Figtree', 'figtree-var.woff2')}</style>`;
// a range of peaks in white along the bottom, like the class tiles in the app
const RANGE = '<svg class="range" viewBox="0 0 1200 260" preserveAspectRatio="none"><path d="M0 260V170l120-80 90 50 150-120 110 90 90-60 140 120 120-90 140 110 110-70 130 80V260z" fill="#fff" opacity=".14"/><path d="M380 260l180-170 70 60 110-110 160 220z" fill="#fff" opacity=".22"/><path d="M630 120l110-110 50 70-26-8-20 22-24-22-30 26z" fill="#fff" opacity=".6"/></svg>';
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const HEAD = `<!DOCTYPE html><html><head><meta charset="utf-8">${FONT_LINK}<style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:Figtree,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .card{position:relative;width:1200px;height:630px;color:#fff;padding:64px 72px;box-sizing:border-box;overflow:hidden}
  .range{position:absolute;left:0;right:0;bottom:0;width:1200px;height:260px}
  .brand{position:relative;display:flex;align-items:center;gap:26px} .brand svg{flex:none;border-radius:16px;box-shadow:0 6px 0 rgba(0,0,0,.18)}
  .brand b{font-family:Gabarito,Figtree,sans-serif;font-size:84px;font-weight:800;letter-spacing:-.03em;line-height:1}
  .brand small{margin-left:auto;align-self:center;white-space:nowrap;font-size:24px;font-weight:700;opacity:.9}
  .tag{position:relative;font-family:Gabarito,Figtree,sans-serif;font-size:54px;font-weight:800;line-height:1.08;margin-top:44px;max-width:980px;letter-spacing:-.025em}
  .tag.big{font-size:60px;margin-top:40px}
  .sub{position:relative;font-size:25px;font-weight:500;opacity:.95;margin-top:18px;max-width:900px;line-height:1.4}
  .chips{position:absolute;left:72px;bottom:64px;display:flex;gap:12px}
  .chip{padding:9px 18px;border-radius:999px;background:#fff;color:#14213D;font-weight:800;font-size:21px;box-shadow:0 4px 0 rgba(0,0,0,.18)}
  .url{position:absolute;right:72px;bottom:70px;font-size:24px;font-weight:700}
  .card.cls .chips{bottom:122px} .card.cls .url{left:72px;right:auto;bottom:66px}
  .chips.many{right:72px;flex-wrap:wrap;gap:10px} .chips.many .chip{font-size:19px;padding:8px 15px}
</style></head><body>`;
const card = (color, inner, cls = '') => `${HEAD}<div class="card${cls ? ' ' + cls : ''}" style="background:${color}">${RANGE}${inner}</div></body></html>`;
const site = card(COLORS.site, `<div class="brand">${LOGO}<b>Mathub</b></div>
<div class="tag">Free study hub for Montana State classes</div>
<div class="sub">Topic notes, endless practice, flashcards, deadline calendars, simulators, a Python playground and a class board. Built by a Bobcat, for Bobcats.</div>
<div class="chips${ORDER.length > 6 ? ' many' : ''}">${ORDER.map(c => `<span class="chip">${esc(Courses[c].code)}</span>`).join('')}</div><div class="url">mathub.space</div>`, ORDER.length > 6 ? 'cls' : '');
const classCard = c => { const C = Courses[c]; const bits = [`${C.sectionCount} topic guides`, C.flashcardCount ? `${C.flashcardCount} flashcards` : null, C.hasQuiz ? 'endless practice' : (C.READINGS ? 'read-along readings' : null), 'deadline calendar'].filter(Boolean);
  return card(COLORS[c] || COLORS.site, `<div class="brand">${LOGO}<b>Mathub</b><small>Montana State · ${esc(C.term)}</small></div>
<div class="tag big">${esc(C.code)} · ${esc(C.name)}</div>
<div class="sub">${esc(C.tagline || '')}</div>
<div class="chips">${bits.map(b => `<span class="chip">${esc(b)}</span>`).join('')}</div><div class="url">mathub.space/learn/${c}</div>`, 'cls'); };
(async () => {
  const exe = process.env.MATHUB_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell') ? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' : undefined);
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const shots = [['og.png', site]].concat(ORDER.map(c => [`og-${c}.png`, classCard(c)]));
  for (const [name, html] of shots) { await page.setContent(html); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(name === 'og.png' ? 1200 : 300); const out = path.join(ROOT, 'assets', name); await page.screenshot({ path: out, type: 'png' }); console.log(name, Math.round(fs.statSync(out).size / 1024) + ' KB'); }
  await browser.close();
})();

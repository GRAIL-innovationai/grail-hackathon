#!/usr/bin/env node
/* Generates assets/realm.css, the Realm look. The ornaments, dividers, map, compass and textures are SVG built here and embedded as data URIs,
   so edit this file rather than the generated CSS. Run from calc1/: node scripts/build-realm-css.js */
'use strict';
const fs = require('fs'); const path = require('path');
const uri = svg => `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim()).replace(/'/g, '%27')}")`;
const corner = (col, t) => uri(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><g transform='${t}'><g fill='none' stroke='${col}' stroke-width='1.2' stroke-linecap='round'><path d='M1.5 18V8A6.5 6.5 0 0 1 8 1.5h10'/><path d='M5.5 14.5a9 9 0 0 1 9-9'/></g><path d='M5 1.8 7.2 4 5 6.2 2.8 4Z' transform='translate(0.3 0.3)' fill='${col}'/></g></svg>`);
const T = { tl: 'matrix(1 0 0 1 0 0)', tr: 'matrix(-1 0 0 1 24 0)', bl: 'matrix(1 0 0 -1 0 24)', br: 'matrix(-1 0 0 -1 24 24)' };
const orn = col => Object.fromEntries(Object.entries(T).map(([k, t]) => [k, corner(col, t)]));
const L = orn('#B8862F'), D = orn('#C99A45');
const divider = col => uri(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 16'><g fill='none' stroke='${col}' stroke-width='1.1' stroke-linecap='round'><path d='M2 8h50M108 8h50'/><path d='M58 8c4-5.5 9.5-5.5 13.5 0M88.5 8c4 5.5 9.5 5.5 13.5 0'/><path d='M58 8c4 5.5 9.5 5.5 13.5 0M88.5 8c4-5.5 9.5-5.5 13.5 0' opacity='.55'/></g><path d='M80 1.5 86.5 8 80 14.5 73.5 8Z' fill='${col}'/><circle cx='54.5' cy='8' r='1.7' fill='${col}'/><circle cx='105.5' cy='8' r='1.7' fill='${col}'/></svg>`);
const fiber = uri(`<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.42  0 0 0 0 0.29  0 0 0 0 0.12  0 0 0 0.085 0'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`);
const stains = uri(`<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900'><filter id='s' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.006' numOctaves='3' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.55  0 0 0 0 0.38  0 0 0 0 0.14  0 0 0 0.9 -0.36'/></filter><rect width='100%' height='100%' filter='url(#s)'/></svg>`);
// deterministic star field for the night look
let seed = 20261027; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const stars = n => { let s = ''; for (let i = 0; i < n; i++) { const x = (rnd() * 480).toFixed(1), y = (rnd() * 480).toFixed(1), r = (0.35 + rnd() * rnd() * 1.3).toFixed(2), o = (0.25 + rnd() * 0.6).toFixed(2); s += `<circle cx='${x}' cy='${y}' r='${r}' fill='#F2EAD8' opacity='${o}'/>`; } return uri(`<svg xmlns='http://www.w3.org/2000/svg' width='480' height='480'>${s}</svg>`); };
const starField = stars(70);
const compass = uri(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><g fill='none' stroke='#8A5F12' stroke-opacity='.28' stroke-width='1.2'><circle cx='100' cy='100' r='94'/><circle cx='100' cy='100' r='86' stroke-dasharray='2 5'/><circle cx='100' cy='100' r='60'/><circle cx='100' cy='100' r='14'/></g><g fill='#8A5F12'><path d='M100 4 110 100 100 196 90 100Z' fill-opacity='.16'/><path d='M4 100 100 90 196 100 100 110Z' fill-opacity='.16'/><path d='M32 32 104 96 168 168 96 104Z' fill-opacity='.08'/><path d='M168 32 104 104 32 168 96 96Z' fill-opacity='.08'/><path d='M100 4 110 100H90Z' fill-opacity='.14'/></g><text x='100' y='26' text-anchor='middle' font-family='Georgia,serif' font-size='13' fill='#8A5F12' fill-opacity='.4'>N</text></svg>`);
const map = uri(`<svg xmlns='http://www.w3.org/2000/svg' width='520' height='260' viewBox='0 0 520 260'><g fill='none' stroke='#8A5F12' stroke-opacity='.16' stroke-width='1.3' stroke-linecap='round'><path d='M10 200c40-30 70-10 110-40s60-70 110-60 70 50 120 40 80-60 150-50'/><path d='M40 240c50-20 90 0 140-20s70-40 120-30'/><path d='M300 60l12-20 12 20M330 70l10-16 10 16M280 72l9-14 9 14'/><path d='M120 90c10 0 14 8 24 8s14-8 24-8' stroke-dasharray='3 6'/></g><path d='M70 150l4 4-4 4-4-4z M430 110l4 4-4 4-4-4z' fill='#9E1B2E' fill-opacity='.35'/></svg>`);
const R = ':root[data-skin="realm"]';
const light = `
  --bg: #EDE1C6; --grid: transparent;
  --surface: #FBF4E2; --surface-2: #F4E9CF; --surface-3: #EADBB9;
  --border: #D8C398; --border-strong: #B99A62;
  --ink: #2A1C0F; --ink-2: #4A3722; --muted: #6B5639;
  --gold: #8A5F12; --gold-soft: #F6E4B3;
  --brand-accent: #9E1B2E; --brand-accent-soft: #F7E1DC; --brand-accent-line: #D9A0A6; --brand-accent-deep: #761221;
  --realm-gold: #B8862F; --realm-gold-text: #7E5510; --realm-crimson: #9E1B2E; --realm-violet: #5B2A86; --realm-edge: rgba(140, 98, 36, 0.10); --realm-line: rgba(184, 134, 47, 0.55);
  --realm-tex: var(--img-fiber), var(--img-stains);
  --realm-vignette: radial-gradient(ellipse at 50% 38%, transparent 52%, rgba(110, 72, 24, 0.22) 100%);
  --orn-tl: var(--img-orn-l-tl); --orn-tr: var(--img-orn-l-tr); --orn-bl: var(--img-orn-l-bl); --orn-br: var(--img-orn-l-br);
  --realm-divider: var(--img-div-l);
  --bg-rune: #9A6C1C; --bg-mark: #6B3A94;
  --mesh-a: rgba(184, 134, 47, 0.10); --mesh-b: rgba(158, 27, 46, 0.05); --mesh-c: rgba(91, 42, 134, 0.05); --mesh-d: rgba(184, 134, 47, 0.08);
  --shadow: 0 18px 40px -22px rgba(58, 36, 10, 0.45), 0 4px 14px -6px rgba(58, 36, 10, 0.14);
  --shadow-sm: 0 1px 2px rgba(58, 36, 10, 0.07), 0 5px 14px -8px rgba(58, 36, 10, 0.18);`;
const dark = `
  --bg: #110E18; --grid: transparent;
  --surface: #1B1624; --surface-2: #221C2E; --surface-3: #2C2439;
  --border: #372D48; --border-strong: #52456B;
  --ink: #F2EAD8; --ink-2: #D9CDB5; --muted: #AB9D84;
  --gold: #E8B84E; --gold-soft: #3A2C10;
  --brand-accent: #E8B84E; --brand-accent-soft: #33280F; --brand-accent-line: #7A5E22; --brand-accent-deep: #C8952B;
  --realm-gold: #C99A45; --realm-gold-text: #E8B84E; --realm-crimson: #F07A86; --realm-violet: #B69BE8; --realm-edge: rgba(0, 0, 0, 0.35); --realm-line: rgba(201, 154, 69, 0.5);
  --realm-tex: var(--img-stars);
  --realm-vignette: radial-gradient(ellipse at 20% -10%, rgba(91, 42, 134, 0.32), transparent 55%), radial-gradient(ellipse at 110% 110%, rgba(232, 184, 78, 0.10), transparent 50%), radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0, 0, 0, 0.45) 100%);
  --orn-tl: var(--img-orn-d-tl); --orn-tr: var(--img-orn-d-tr); --orn-bl: var(--img-orn-d-bl); --orn-br: var(--img-orn-d-br);
  --realm-divider: var(--img-div-d);
  --bg-rune: #E8B84E; --bg-mark: #B69BE8;
  --mesh-a: rgba(91, 42, 134, 0.18); --mesh-b: rgba(232, 184, 78, 0.06); --mesh-c: rgba(158, 27, 46, 0.08); --mesh-d: rgba(91, 42, 134, 0.10);
  --shadow: 0 18px 40px -18px rgba(0, 0, 0, 0.7), 0 4px 14px -6px rgba(0, 0, 0, 0.4);
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.35), 0 5px 14px -8px rgba(0, 0, 0, 0.45);`;
const css = `/* ============================================================
   Mathub — the Realm look (the default skin)
   A fantasy tabletop look on top of the normal layout: parchment and
   ink by day, a starlit dungeon by night, Cinzel for headings (body text
   stays Helvetica Neue), gold ornaments on panels, gem buttons, a map on
   the start page and runes in the background. Everything is scoped to
   :root[data-skin="realm"]; Settings -> Look -> Classic removes it.
   The D&D features (d20 quest roller, character sheet, class archetypes)
   live in assets/realm.js; their styles at the end of this file work in
   every look. Generated by scripts/build-realm-css.js: edit that file.
   Fonts: Cinzel and Noto Sans Runic (SIL OFL), see assets/fonts/README.txt.
   ============================================================ */
@font-face { font-family: "Cinzel"; src: url("fonts/cinzel.woff2") format("woff2"); font-weight: 400 900; font-style: normal; font-display: swap; }
@font-face { font-family: "Mathub Runes"; src: url("fonts/runes.woff2") format("woff2"); unicode-range: U+16A0-16F8; font-display: swap; }

/* ---------- tokens: parchment by day, dungeon by night ---------- */
${R} { --font-display: "Cinzel", "Trajan Pro", Georgia, serif; --font-rune: "Mathub Runes", "Segoe UI Historic", "Noto Sans Runic", serif;
  --img-fiber: ${fiber}; --img-stains: ${stains}; --img-stars: ${starField}; --img-compass: ${compass}; --img-map: ${map};
  --img-orn-l-tl: ${L.tl}; --img-orn-l-tr: ${L.tr}; --img-orn-l-bl: ${L.bl}; --img-orn-l-br: ${L.br};
  --img-orn-d-tl: ${D.tl}; --img-orn-d-tr: ${D.tr}; --img-orn-d-bl: ${D.bl}; --img-orn-d-br: ${D.br};
  --img-div-l: ${divider('#B8862F')}; --img-div-d: ${divider('#C99A45')}; }
${R}:not([data-theme="dark"]) {${light}
}
${R}:not([data-theme="dark"]):not([data-course]) { --accent: var(--brand-accent); --accent-soft: var(--brand-accent-soft); --accent-line: var(--brand-accent-line); --accent-deep: var(--brand-accent-deep); --accent-ink: #FFFFFF; }
${R}[data-theme="dark"] {${dark}
}
@media (prefers-color-scheme: dark) { ${R}:not([data-theme="light"]) {${dark}
} }
/* pages that belong to no class: crimson by day, gold by night (gold needs dark text) */
${R}[data-theme="dark"]:not([data-course]) { --accent: var(--brand-accent); --accent-soft: var(--brand-accent-soft); --accent-line: var(--brand-accent-line); --accent-deep: var(--brand-accent-deep); --accent-ink: #1B1206; }
@media (prefers-color-scheme: dark) { ${R}:not([data-theme="light"]):not([data-course]) { --accent: var(--brand-accent); --accent-soft: var(--brand-accent-soft); --accent-line: var(--brand-accent-line); --accent-deep: var(--brand-accent-deep); --accent-ink: #1B1206; } }

/* ---------- page ---------- */
${R} body { background-color: var(--bg); background-image: var(--realm-tex); background-attachment: fixed; font-feature-settings: normal; }
${R} body::before { background: var(--realm-vignette); }
${R} ::selection { background: color-mix(in srgb, var(--realm-gold) 38%, transparent); }
${R} { scrollbar-color: var(--border-strong) transparent; }

/* ---------- type: Cinzel for display, Helvetica Neue for reading ---------- */
${R} h1, ${R} h2, ${R} h3, ${R} h4, ${R} .page-title, ${R} .panel-title, ${R} .topbar-title, ${R} .note-title { font-weight: 600; letter-spacing: 0.01em; }
${R} .page-title, ${R} .note-title { font-size: 30px; line-height: 1.18; }
${R} .landing-title:not(.brand-title) { font-size: 40px; letter-spacing: 0.01em; font-weight: 600; }
${R} .panel-title { font-size: 16.5px; }
${R} .brand-code, ${R} .course-code { font-style: normal; font-weight: 700; letter-spacing: 0.02em; }
${R} .fc-front, ${R} .rd-text, ${R} .rd-by, ${R} .guide-quote, ${R} .fz-quote, ${R} .fa-title.big { font-family: var(--font-sans); }
${R} .eyebrow { color: var(--realm-gold-text); letter-spacing: 0.16em; }
${R} .hero-exam .eyebrow, ${R} .today-card .eyebrow { color: rgba(255, 255, 255, 0.82); }
${R} .table th { font-family: var(--font-display); letter-spacing: 0.08em; color: var(--realm-gold-text); }
@media (max-width: 760px) { ${R}:not([data-theme="dark"]) .landing-top.hero { background-size: 190px 190px, 360px 180px, auto; background-position: right -60px top -40px, left 30% bottom -30px, 0 0; } ${R} .landing-title:not(.brand-title) { font-size: 30px; } ${R} .page-title, ${R} .note-title { font-size: 25px; } }

/* ---------- panels: vellum with gold corner ornaments ---------- */
${R} .panel:not(.hero-exam):not(.gs-card):not(.ann-panel):not(.callout), ${R} .fz-card, ${R} .modal, ${R} .course-card {
  border: 1px solid var(--border-strong); background-color: var(--surface);
  background-image: var(--orn-tl), var(--orn-tr), var(--orn-bl), var(--orn-br); background-repeat: no-repeat; background-size: 16px 16px;
  background-position: 4px 4px, calc(100% - 4px) 4px, 4px calc(100% - 4px), calc(100% - 4px) calc(100% - 4px);
  box-shadow: var(--shadow-sm), inset 0 0 30px var(--realm-edge);
}
${R} .panel.lift:not(.hero-exam) { box-shadow: var(--shadow), inset 0 0 30px var(--realm-edge); border-color: var(--realm-gold); }
${R} .hero-exam { box-shadow: var(--shadow), inset 0 0 0 1px rgba(255, 226, 160, 0.45), inset 0 0 0 5px rgba(255, 255, 255, 0.04); }
${R} .gs-card, ${R} .ann-panel { border-color: var(--realm-gold); }
${R} .hero-exam .btn, ${R} .today-card .btn, ${R} .recap-card .btn:not(.primary) { background: rgba(255, 255, 255, 0.14); border-color: rgba(255, 255, 255, 0.3); color: #fff; box-shadow: none; }
${R} .hero-exam .btn.primary, ${R} .today-card .btn.btn { background: #fff; color: var(--accent-deep, var(--accent)); border-color: #fff; box-shadow: inset 0 0 0 1px rgba(184, 134, 47, 0.45), 0 6px 16px -10px rgba(0, 0, 0, 0.5); }
${R} .today-card .btn.btn { color: #9A3412; }
${R} .stat { background: var(--surface-2); border: 1px solid var(--border); }
${R} .callout { border-left: 3px solid var(--realm-gold); }
${R} .divider { height: 16px; background: var(--realm-divider) center / 120px 12px no-repeat, linear-gradient(90deg, transparent, var(--realm-line) 20%, var(--realm-line) 80%, transparent) center / 100% 1px no-repeat; opacity: 0.8; margin: 10px 0; }

/* ---------- page heading: a flourish under the title ---------- */
${R} .page-head { position: relative; padding-bottom: 18px; }
${R} .page-head::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 14px; pointer-events: none; background: var(--realm-divider) 0 50% / 150px 14px no-repeat, linear-gradient(90deg, var(--realm-line), transparent 75%) 152px 50% / calc(100% - 152px) 1px no-repeat; }

/* ---------- buttons: parchment, and gems for the main action ---------- */
${R} .btn { background: linear-gradient(180deg, var(--surface), var(--surface-2)); border-color: var(--border-strong); color: var(--ink); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 1px 0 rgba(58, 36, 10, 0.06); font-weight: 600; }
${R}[data-theme="dark"] .btn { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05); }
${R} .btn:not(:disabled):hover { border-color: var(--realm-gold); }
${R} .btn.primary { background: radial-gradient(130% 150% at 30% 0%, color-mix(in srgb, var(--accent) 88%, #fff) 0%, var(--accent) 42%, var(--accent-deep, var(--accent)) 100%); color: var(--accent-ink); border: 1px solid color-mix(in srgb, var(--accent-deep, var(--accent)) 70%, #000); box-shadow: inset 0 0 0 1px rgba(255, 222, 150, 0.5), inset 0 -8px 14px -8px rgba(0, 0, 0, 0.35), 0 6px 16px -8px color-mix(in srgb, var(--accent) 80%, transparent); }
${R} .btn.primary:not(:disabled):hover { filter: brightness(1.06) saturate(1.05); border-color: color-mix(in srgb, var(--accent-deep, var(--accent)) 70%, #000); }
${R} .btn.ghost { background: transparent; box-shadow: none; }
${R} .icon-btn:hover { background: var(--gold-soft); }
${R} .chip { border: 1px solid color-mix(in srgb, var(--border-strong) 70%, transparent); }
${R} .input, ${R} .select, ${R} textarea.input { background: color-mix(in srgb, var(--surface) 70%, #fff); border-color: var(--border-strong); }
${R}[data-theme="dark"] .input, ${R}[data-theme="dark"] .select, ${R}[data-theme="dark"] textarea.input { background: var(--surface-2); }
${R} .input:focus, ${R} .select:focus, ${R} textarea.input:focus { border-color: var(--realm-gold); box-shadow: 0 0 0 3px color-mix(in srgb, var(--realm-gold) 28%, transparent); }

/* ---------- sidebar, top bar, tab bar ---------- */
${R} .sidebar { background: linear-gradient(90deg, var(--surface-2), color-mix(in srgb, var(--surface) 70%, var(--surface-2))); border-right: 3px double var(--realm-line); }
${R} .brand { border-bottom: 1px solid var(--realm-line); }
${R} .nav-label { font-family: var(--font-display); font-weight: 700; letter-spacing: 0.12em; color: var(--realm-gold-text); }
${R} .nav-item.active { background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 14%, var(--surface)), transparent); }
${R} .nav-item::before { width: 4px; border-radius: 0 3px 3px 0; background: linear-gradient(180deg, var(--realm-gold), var(--accent)); }
${R} .topbar { background: color-mix(in srgb, var(--surface) 82%, transparent); border-bottom: 1px solid var(--realm-line); box-shadow: 0 1px 0 color-mix(in srgb, var(--realm-gold) 25%, transparent), 0 3px 0 -2px var(--realm-line); }
${R} #tabbar { border-top: 1px solid var(--realm-line); }
${R} .dash-tabs { border: 1px solid var(--border); background: var(--surface-2); }
${R} .dash-tabs .tab { font-family: var(--font-display); font-weight: 700; letter-spacing: 0.04em; }
${R} .dash-tabs .tab.on { background: var(--surface); box-shadow: inset 0 -2px 0 var(--realm-gold), var(--shadow-sm); }

/* ---------- start page: a map by day, the night sky by night ---------- */
${R} .landing-top.hero { border: 1px solid var(--realm-gold); background: var(--img-compass) right -40px top -30px / 300px 300px no-repeat, var(--img-map) left 45% bottom -20px / 520px 260px no-repeat, radial-gradient(120% 90% at 20% 0%, #FFF9EA 0%, var(--surface) 45%, var(--surface-2) 100%); box-shadow: var(--shadow), inset 0 0 0 5px var(--surface), inset 0 0 0 6px var(--realm-line), inset 0 0 60px rgba(140, 98, 36, 0.14); }
${R}[data-theme="dark"] .landing-top.hero { background: radial-gradient(circle at calc(74% + 9px) calc(44% - 6px), #1D1733 0 17px, transparent 18px), radial-gradient(circle at 74% 44%, #FFF3D6 0 19px, rgba(255, 236, 190, 0.30) 21px, rgba(255, 236, 190, 0.07) 42px, transparent 70px), var(--img-stars) 0 0 / 240px 240px, radial-gradient(120% 100% at 15% 0%, #2A1F48 0%, #16122A 55%, #0F0C18 100%); border-color: var(--realm-line); box-shadow: var(--shadow), inset 0 0 0 5px rgba(0, 0, 0, 0.15), inset 0 0 0 6px var(--realm-line); }
@media (prefers-color-scheme: dark) { ${R}:not([data-theme="light"]) .landing-top.hero { background: radial-gradient(circle at calc(74% + 9px) calc(44% - 6px), #1D1733 0 17px, transparent 18px), radial-gradient(circle at 74% 44%, #FFF3D6 0 19px, rgba(255, 236, 190, 0.30) 21px, rgba(255, 236, 190, 0.07) 42px, transparent 70px), var(--img-stars) 0 0 / 240px 240px, radial-gradient(120% 100% at 15% 0%, #2A1F48 0%, #16122A 55%, #0F0C18 100%); border-color: var(--realm-line); box-shadow: var(--shadow), inset 0 0 0 5px rgba(0, 0, 0, 0.15), inset 0 0 0 6px var(--realm-line); } }
${R} .landing-top.hero::after { background: radial-gradient(circle, color-mix(in srgb, var(--realm-gold) 22%, transparent), transparent 70%); }
${R} .hero-tag i, ${R} .brand-logo small i { color: var(--realm-crimson); }
${R} .hero-count { background: var(--surface); border-color: var(--realm-line); }
${R} .course-card::before { height: 6px; background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--realm-gold)), var(--accent)); }
${R} .course-card-head .course-code { font-size: 30px; }

/* ---------- overlays ---------- */
${R} .modal-backdrop { background: rgba(28, 16, 4, 0.55); }
${R}[data-theme="dark"] .modal-backdrop { background: rgba(4, 2, 10, 0.7); }
${R} .modal { border-color: var(--realm-gold); }
${R} .acct-dd, ${R} .popover { border-color: var(--realm-line); background-color: var(--surface); }
${R} .toast { background: #2A1C0F; color: #F6E8C8; border: 1px solid #B8862F; box-shadow: 0 10px 30px -12px rgba(0, 0, 0, 0.6), inset 0 0 0 3px #2A1C0F, inset 0 0 0 4px rgba(184, 134, 47, 0.45); }
${R}[data-theme="dark"] .toast { background: #F2EAD8; color: #1B1206; border-color: #C99A45; box-shadow: 0 10px 30px -12px rgba(0, 0, 0, 0.8), inset 0 0 0 3px #F2EAD8, inset 0 0 0 4px rgba(184, 134, 47, 0.55); }
${R} .lvl-badge { clip-path: polygon(50% 0, 100% 14%, 100% 58%, 50% 100%, 0 58%, 0 14%); border-radius: 0; background: linear-gradient(160deg, var(--realm-gold), var(--accent)); }
${R} .bar { background: var(--surface-3); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--realm-gold) 25%, transparent); }

/* ---------- Bo wears a wizard hat here ---------- */
.bobcat .bo-hat { display: none; }
${R} .bobcat .bo-hat { display: inline; }

/* ---------- archetype chips on the class cards (Realm only) ---------- */
.arch-chip { display: none; }
${R} .arch-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px 2px 7px; border-radius: 999px; font: 700 11.5px/1.6 var(--font-display); letter-spacing: 0.08em; color: color-mix(in srgb, var(--accent) 68%, var(--ink)); background: color-mix(in srgb, var(--accent) 10%, var(--surface)); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); white-space: nowrap; }
.course-idline { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; }

/* ---------- geek mode, Realm edition: runes, gold, a travelling party ---------- */
${R} .gk-dec i { font-family: var(--font-rune), var(--font-mono); color: var(--realm-gold-text); }
${R} #gk-scan::before { background: color-mix(in srgb, var(--realm-gold) 80%, #fff); box-shadow: 0 0 12px 2px color-mix(in srgb, var(--realm-gold) 55%, transparent), 0 0 44px 10px color-mix(in srgb, var(--realm-gold) 22%, transparent); }
${R} #gk-scan::after { background: radial-gradient(1.5px 1.5px at 12% 30%, var(--realm-gold) 50%, transparent), radial-gradient(1.5px 1.5px at 38% 62%, var(--realm-gold) 50%, transparent), radial-gradient(1.5px 1.5px at 67% 22%, var(--realm-gold) 50%, transparent), radial-gradient(1.5px 1.5px at 86% 74%, var(--realm-gold) 50%, transparent), radial-gradient(1px 1px at 52% 44%, var(--realm-gold) 50%, transparent); }
${R} #gk-status { background: rgba(27, 18, 8, 0.94); color: #F6E8C8; border-color: rgba(201, 154, 69, 0.55); }
${R} #gk-status .gk-path { color: #E8B84E; } ${R} #gk-status .gk-cmd { color: #FFF6E2; } ${R} #gk-status .gk-cur { background: #E8B84E; }
${R} .gk-boot { background: #1B1208; color: #F6E8C8; border-color: rgba(201, 154, 69, 0.45); } ${R} .gk-boot b { color: #E8B84E; } ${R} .gk-boot .gk-line { color: #FBEFD5; }
html[data-geek="on"]${R} .toast::before { content: '\\2726  '; opacity: 0.8; }

/* ============================================================
   d20 quest roller and character sheet (every look)
   ============================================================ */
@keyframes d20Tumble { 0% { transform: translateY(-34px) rotate(-220deg) scale(0.55); opacity: 0.3; } 55% { transform: translateY(8px) rotate(30deg) scale(1.08); opacity: 1; } 78% { transform: translateY(-5px) rotate(-10deg) scale(0.98); } 100% { transform: none; opacity: 1; } }
@keyframes d20Glow { 0%, 100% { filter: drop-shadow(0 0 6px rgba(232, 184, 78, 0.55)); } 50% { filter: drop-shadow(0 0 16px rgba(232, 184, 78, 0.95)); } }
.d20-btn svg { transition: transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1); }
.d20-btn:hover svg { transform: rotate(72deg); }
.roll-modal { max-width: 440px; padding: 24px 24px 20px; text-align: center; }
.roll-modal .roll-close { position: absolute; top: 12px; right: 12px; }
.roll-modal { position: relative; }
.d20-stage { width: 150px; height: 150px; margin: 2px auto 8px; }
.d20-big { width: 150px; height: 150px; overflow: visible; display: block; }
.d20-big .d20-face { fill: color-mix(in srgb, var(--accent) 14%, var(--surface)); }
.d20-big .d20-inner { fill: color-mix(in srgb, var(--accent) 30%, var(--surface)); }
.d20-big .d20-edge { fill: none; stroke: var(--accent); stroke-width: 2.4; stroke-linejoin: round; stroke-linecap: round; }
.d20-big text { font: 700 24px var(--font-display); fill: var(--ink); }
.d20-big.rolling { animation: d20Tumble 1s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
.d20-big.crit .d20-edge { stroke: #D9A232; stroke-width: 3; } .d20-big.crit { animation: d20Glow 1.4s ease-in-out infinite; }
.d20-big.fumble .d20-edge { stroke: var(--bad); } .d20-big.fumble { animation: shake 0.45s; }
.roll-verdict { font: 700 22px/1.2 var(--font-display); letter-spacing: 0.02em; margin: 2px 0 4px; min-height: 27px; }
.roll-verdict.crit { color: var(--gold); } .roll-verdict.fumble { color: var(--bad); }
.roll-sub { color: var(--muted); font-size: 14px; min-height: 20px; }
.roll-quest { margin-top: 12px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border-strong); background: var(--surface-2); text-align: left; }
.roll-quest b { display: block; font-size: 15.5px; }
.roll-quest small { color: var(--muted); }
.roll-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 14px; }

.cs-top { display: grid; grid-template-columns: 1.35fr 1fr; gap: 16px; align-items: start; }
.cs-name { font: 700 30px/1.1 var(--font-display); letter-spacing: 0.01em; margin: 2px 0 4px; overflow-wrap: anywhere; }
.cs-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
.cs-fact { padding: 8px 10px; border-radius: 10px; background: var(--surface-2); border: 1px solid var(--border); min-width: 0; }
.cs-fact span { display: block; font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); font-weight: 700; }
.cs-fact b { display: block; font-size: 14.5px; overflow-wrap: anywhere; }
.cs-xp { margin-top: 12px; }
.cs-abils { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
.cs-abil { position: relative; text-align: center; padding: 12px 8px 22px; background: var(--surface-2); border: 2px solid var(--border-strong); border-radius: 14px 14px 46% 46% / 14px 14px 20% 20%; }
.cs-abil .ab { font: 700 13px/1 var(--font-display); letter-spacing: 0.14em; color: var(--gold); }
.cs-abil .nm { font-size: 11.5px; color: var(--muted); margin-top: 3px; }
.cs-abil .sc { font: 700 38px/1.1 var(--font-display); margin: 6px 0 4px; font-variant-numeric: tabular-nums; }
.cs-abil .md { display: inline-block; min-width: 44px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border-strong); background: var(--surface); font-weight: 700; font-size: 14px; }
.cs-abil .why { display: block; font-size: 11.5px; color: var(--ink-2); margin-top: 8px; line-height: 1.35; min-height: 2.7em; }
.cs-class { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px dashed var(--border); }
.cs-class:last-child { border-bottom: 0; }
.cs-class .ci { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 10px; color: #fff; background: linear-gradient(145deg, var(--cs-c, var(--accent)), color-mix(in srgb, var(--cs-c, var(--accent)) 60%, #000)); }
.cs-class .cl { flex: 1; min-width: 0; } .cs-class .cl b { display: block; } .cs-class .cl small { color: var(--muted); }
.cs-class .lv { font: 700 20px var(--font-display); white-space: nowrap; }
.cs-inv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.cs-item { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-2); color: var(--ink); text-decoration: none; min-width: 0; }
a.cs-item:hover { border-color: var(--accent); text-decoration: none; }
.cs-item svg { flex: none; color: var(--gold); } .cs-item b { font-size: 18px; margin-right: 2px; } .cs-item small { display: block; color: var(--muted); font-size: 12px; }
.cs-profs { display: flex; flex-wrap: wrap; gap: 6px; }
@media (max-width: 980px) { .cs-abils { grid-template-columns: repeat(3, minmax(0, 1fr)); } .cs-top { grid-template-columns: 1fr; } }
@media (max-width: 520px) { .cs-abils { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cs-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cs-inv { grid-template-columns: 1fr; } .cs-name { font-size: 25px; } }

@media print {
  ${R} body { background: #fff !important; }
  ${R} .panel, ${R} .modal, ${R} .course-card { background-image: none !important; box-shadow: none !important; }
  ${R} .page-head::after { display: none; }
}
`;
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'realm.css'), css);
console.log('realm.css', Math.round(css.length / 1024) + ' KB');

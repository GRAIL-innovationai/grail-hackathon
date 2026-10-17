/* ============================================================
   Mathub browser tests — shared helpers
   Every *.test.js starts with  const T = require('./lib')  and
   const H = await T.start(opts)  which launches headless Chromium
   and returns: browser, base, errors, mk(w, h, ctxOpts), login(page,
   email), api(page, route, body, method), txt(page, selector),
   hscroll(page), go(page, hash), log(...), check(label, ok, detail).
   T.finish() prints the console/page errors collected across every
   page and exits non-zero when anything failed.
   Environment: MATHUB_BASE (default http://127.0.0.1:8766/index.html),
   MATHUB_CHROMIUM (path to a Chromium binary; Playwright's own
   download is used when unset), MATHUB_PYODIDE (URL of a local Pyodide
   mirror, see tests/README.md).
   ============================================================ */
'use strict';
const fs = require('fs');
const { chromium } = require('playwright');
const base = process.env.MATHUB_BASE || 'http://127.0.0.1:8766/index.html';
const HEADLESS_SHELL = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const executablePath = process.env.MATHUB_CHROMIUM || (fs.existsSync(HEADLESS_SHELL) ? HEADLESS_SHELL : undefined);
const IGNORE = /ERR_CERT|ERR_TUNNEL|ERR_PROXY|ERR_NAME|net::|fonts|mathjax|favicon|404|Failed to load resource/i;
const state = { browser: null, errors: [], failures: [], checks: 0 };

async function start(opts = {}) {
  const args = ['--no-sandbox']; if (opts.audio) args.push('--autoplay-policy=no-user-gesture-required');
  const browser = state.browser = await chromium.launch({ executablePath, args });
  const errors = state.errors;
  const pyodide = opts.pyodide ? (process.env.MATHUB_PYODIDE || 'http://127.0.0.1:8767/') : null;
  const mk = async (w = 1360, h = 850, ctxOpts = {}) => {
    const c = await browser.newContext(Object.assign({ viewport: { width: w, height: h } }, ctxOpts));
    if (pyodide) await c.addInitScript(url => { window.PYODIDE_URL = url; }, pyodide);
    const geek = opts.geek === true || process.env.MATHUB_GEEK === '1';
    if (geek) await c.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('studyhub-settings') || '{}'); if (s.geek === undefined) { s.geek = true; localStorage.setItem('studyhub-settings', JSON.stringify(s)); } } catch (e) {} });
    if (!geek) await c.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('studyhub-settings') || '{}'); if (s.geek === undefined) { s.geek = false; localStorage.setItem('studyhub-settings', JSON.stringify(s)); } } catch (e) {} });
    if (opts.tour !== true) await c.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('studyhub-settings') || '{}'); if (s.tourDone === undefined) { s.tourDone = true; localStorage.setItem('studyhub-settings', JSON.stringify(s)); } } catch (e) {} });
    const p = await c.newPage();
    p.on('pageerror', e => errors.push('PAGEERROR ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' ').replace(/\s+/g, ' ').trim().slice(0, 160)));
    p.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push('CONSOLE ' + m.text().slice(0, 200)); });
    if (opts.dialogs !== false) p.on('dialog', d => d.accept(opts.dialogText || 'ok'));
    return [c, p];
  };
  const txt = async (p, s) => ((await p.textContent(s).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const login = (p, email, password = 'password123') => p.evaluate(async ([email, password]) => { const r = await fetch('api/index.php?r=login', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); return (await r.json()).ok; }, [email, password]);
  const api = (p, r, body, method) => p.evaluate(async ([r, body, method]) => { const res = await fetch('api/index.php?r=' + r, { method: method || (body ? 'POST' : 'GET'), credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, json: await res.json().catch(() => null) }; }, [r, body, method]);
  const hscroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const go = async (p, hash, wait = 500) => { await p.goto(base + hash); await p.waitForTimeout(wait); };
  const log = (...a) => console.log(...a);
  const check = (label, ok, detail) => { state.checks++; if (!ok) { state.failures.push(label + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); console.log('  ✗ ' + label, detail !== undefined ? detail : ''); } else console.log('  ✓ ' + label); return ok; };
  return { browser, base, errors, mk, txt, login, api, hscroll, go, log, check };
}
async function finish() {
  const { errors, failures, checks } = state;
  console.log(`\nchecks: ${checks - failures.length}/${checks} passed`);
  if (failures.length) console.log('FAILED:', failures);
  console.log('ERRORS:', errors.length ? errors : 'none');
  if (state.browser) await state.browser.close();
  process.exitCode = errors.length || failures.length ? 1 : 0;
}
module.exports = { start, finish, base };

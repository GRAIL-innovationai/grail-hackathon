#!/usr/bin/env node
/* ============================================================
   Builds app/www, the web content the iOS and Android apps ship inside them.
   Run from calc1/app:  node scripts/build-www.js   (then: npx cap sync ios)

   - copies the site (index.html, assets/, the bundled class packs in packs/)
   - MathJax 3.2.2 and Pyodide 0.28.3 come from node_modules and ship inside the
     app, so maths and the Python playground work offline and no code is ever
     downloaded at run time (App Review guideline 2.5.2)
   - index.html gets the app's Content-Security-Policy, viewport-fit=cover,
     assets/app.css, and the two app-only scripts: assets/app-boot.js (right after
     boot.js) and assets/app-native.js (last, after create.js, home.js and tutor.js)
   - the website keeps working as before: nothing here changes the files it serves
   ============================================================ */
'use strict';
const fs = require('fs'); const path = require('path');
const APP = path.resolve(__dirname, '..'); const SITE = path.resolve(APP, '..'); const WWW = path.join(APP, 'www');
const pkg = require(path.join(APP, 'package.json'));
const VERSION = pkg.version;

const rm = p => fs.rmSync(p, { recursive: true, force: true });
const copy = (from, to, filter = () => true) => {
  const st = fs.statSync(from);
  if (st.isDirectory()) { fs.mkdirSync(to, { recursive: true }); for (const f of fs.readdirSync(from)) { const a = path.join(from, f); if (filter(a)) copy(a, path.join(to, f), filter); } }
  else fs.copyFileSync(from, to);
};
const size = p => { let n = 0; const walk = q => { const st = fs.statSync(q); if (st.isDirectory()) fs.readdirSync(q).forEach(f => walk(path.join(q, f))); else n += st.size; }; walk(p); return n; };

rm(WWW); fs.mkdirSync(WWW, { recursive: true });

// 1. the site
copy(path.join(SITE, 'assets'), path.join(WWW, 'assets'), p => !/\.DS_Store$|\.map$/.test(p));
fs.mkdirSync(path.join(WWW, 'packs'), { recursive: true });
for (const f of fs.readdirSync(path.join(SITE, 'packs'))) if (/\.mathub\.json$|^index\.json$/.test(f)) fs.copyFileSync(path.join(SITE, 'packs', f), path.join(WWW, 'packs', f));

// 2. MathJax, only what tex-svg needs (TeX input with its extensions, SVG output, the menu and accessibility parts)
const MJ = path.join(APP, 'node_modules', 'mathjax', 'es5'); const MJO = path.join(WWW, 'assets', 'mathjax');
fs.mkdirSync(MJO, { recursive: true }); fs.copyFileSync(path.join(MJ, 'tex-svg.js'), path.join(MJO, 'tex-svg.js'));
['input', 'a11y', 'ui', 'sre', 'adaptors'].forEach(d => copy(path.join(MJ, d), path.join(MJO, d)));
copy(path.join(MJ, 'output'), path.join(MJO, 'output'), p => !/output[\\/]chtml/.test(p));

// 3. Pyodide (the CPython runtime the playground runs in a worker)
const PY = path.join(APP, 'node_modules', 'pyodide'); const PYO = path.join(WWW, 'assets', 'pyodide');
fs.mkdirSync(PYO, { recursive: true });
['pyodide.js', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json', 'package.json'].forEach(f => fs.copyFileSync(path.join(PY, f), path.join(PYO, f)));

// 4. index.html for the app
let html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const BUILD = (/data-build="([^"]+)"/.exec(html) || [])[1] || 'dev';
const must = (re, what) => { if (!re.test(html)) throw new Error('build-www: could not find ' + what + ' in index.html'); };
must(/<meta http-equiv="Content-Security-Policy"[^>]*>/, 'the CSP meta tag');
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,
  `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https:; media-src 'self' blob: data:; connect-src 'self' blob: data: https://mathub.space https://api.dictionaryapi.dev; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'">`);
must(/<meta name="viewport"[^>]*>/, 'the viewport meta tag');
html = html.replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
html = html.replace(/<html lang="en" data-build="([^"]+)">/, `<html lang="en" data-build="$1" data-app-version="${VERSION}">`);
must(/<script id="MathJax-script"[^>]*><\/script>/, 'the MathJax script');
html = html.replace(/<script id="MathJax-script"[^>]*><\/script>/, `<script id="MathJax-script" async src="assets/mathjax/tex-svg.js"></script>`);
must(/<script src="assets\/boot\.js[^"]*"><\/script>/, 'boot.js');
html = html.replace(/(<script src="assets\/boot\.js[^"]*"><\/script>)/, `$1\n  <script src="assets/app-boot.js?v=${BUILD}"></script>`);
must(/<link rel="stylesheet" href="assets\/teach\.css[^"]*">/, 'teach.css');
html = html.replace(/(<link rel="stylesheet" href="assets\/teach\.css[^"]*">)/, `$1\n  <link rel="stylesheet" href="assets/app.css?v=${BUILD}">`);
must(/<script src="assets\/tutor\.js[^"]*"><\/script>/, 'tutor.js');
html = html.replace(/(<script src="assets\/tutor\.js[^"]*"><\/script>)/, `$1\n  <script src="assets/app-native.js?v=${BUILD}"></script>`);
// the app has no service worker, web manifest or install prompt
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '').replace(/\s*<meta name="apple-mobile-web-app-[^>]*>/g, '').replace(/\s*<meta name="mobile-web-app-capable"[^>]*>/, '');
fs.writeFileSync(path.join(WWW, 'index.html'), html);
fs.writeFileSync(path.join(WWW, 'app-build.json'), JSON.stringify({ version: VERSION, site: BUILD, built: new Date().toISOString() }, null, 1));

// 5. checks: no script from another origin, every local script and stylesheet the page names exists
const remote = [...html.matchAll(/<script[^>]+src="(https?:[^"]+)"/g)].map(m => m[1]);
if (remote.length) throw new Error('build-www: scripts from other sites in index.html: ' + remote.join(', '));
const missing = [...html.matchAll(/(?:src|href)="(assets\/[^"?]+)/g)].map(m => m[1]).filter(f => !fs.existsSync(path.join(WWW, f)));
if (missing.length) throw new Error('build-www: missing files: ' + missing.join(', '));
console.log(`app/www built: Mathub ${VERSION} (site ${BUILD}), ${(size(WWW) / 1e6).toFixed(1)} MB`);

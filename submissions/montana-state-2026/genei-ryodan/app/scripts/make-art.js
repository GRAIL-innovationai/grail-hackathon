#!/usr/bin/env node
/* ============================================================
   Mathub app art: every icon and launch image for iOS, Android and the store listings, drawn from Bo
   (assets/icon.svg) so they always match. Run after changing the logo:

     node app/scripts/make-art.js            (from calc1/)

   Needs the test suite's Playwright (cd tests && npm install) and python3 with Pillow (to flatten the
   iOS icon: the App Store refuses icons with an alpha channel).
   Writes:
     ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png   1024 icon, no alpha
     ios/App/App/Assets.xcassets/Splash.imageset/*.png                  2732 launch image
     android/app/src/main/res/mipmap-* /ic_launcher*.png                adaptive layers, monochrome, legacy, round
     android/app/src/main/res/drawable-* /ic_stat_mathub.png            notification icon (white on clear)
     android/app/src/main/res/drawable* /splash.png                     launch images (Android < 12 fallback)
     store/play-icon-512.png, store/play-feature-1024x500.png           Google Play listing art
   ============================================================ */
'use strict';
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const APP = path.resolve(__dirname, '..'); const ROOT = path.resolve(APP, '..');
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const SHELL = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const NAVY = '#14213D', INK = '#F4F7FB';

const svg = fs.readFileSync(path.join(ROOT, 'assets', 'icon.svg'), 'utf8');
const FACE = /<g transform="[^"]*">([\s\S]*)<\/g>/.exec(svg)[1];           // Bo, in his own 120-unit space
const BOX = { cx: 60, cy: 53, w: 92, tip: 60.3 };                           // bounding box centre, width, ear tip distance
// Bo as one shape (ears and head) with the eyes and nose cut out: for the notification icon and themed icons
const MONO = `<mask id="m"><path d="M22 46L14 14l32 14zM98 46l8-32-32 14z" fill="#fff"/><ellipse cx="60" cy="58" rx="40" ry="34" fill="#fff"/><ellipse cx="46" cy="56" rx="7.5" ry="8.5" fill="#000"/><ellipse cx="74" cy="56" rx="7.5" ry="8.5" fill="#000"/><path d="M53 67h14l-7 7z" fill="#000"/></mask><rect x="0" y="0" width="120" height="100" fill="#fff" mask="url(#m)"/>`;
const place = (S, k, art, dy = 0) => `<g transform="translate(${S / 2 - BOX.cx * k} ${S / 2 - BOX.cy * k + dy}) scale(${k})">${art}</g>`;
const font = 'data:font/woff2;base64,' + fs.readFileSync(path.join(ROOT, 'assets', 'fonts', 'gabarito-var.woff2')).toString('base64');
const page = (w, h, body, bg = 'transparent') => `<!doctype html><html><head><style>@font-face{font-family:G;src:url(${font}) format("woff2");font-weight:400 900}html,body{margin:0;width:${w}px;height:${h}px;background:${bg};overflow:hidden}</style></head><body>${body}</body></html>`;
const sq = (S, inner, bg) => page(S, S, `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${inner}</svg>`, bg);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.MATHUB_CHROMIUM || (fs.existsSync(SHELL) ? SHELL : undefined) });
  const p = await browser.newPage();
  const shoot = async (file, w, h, html, clear = true) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await p.setViewportSize({ width: w, height: h }); await p.setContent(html); await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: file, omitBackground: clear }); console.log('wrote', path.relative(APP, file), `${w}x${h}`);
  };
  const res = path.join(APP, 'android', 'app', 'src', 'main', 'res');
  const DPI = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

  /* ---------- iOS ---------- */
  const iosIcon = path.join(APP, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png');
  await shoot(iosIcon, 1024, 1024, sq(1024, `<rect width="1024" height="1024" fill="${NAVY}"/>` + place(1024, 1024 * 0.58 * 1.12 / 64, FACE, -1), NAVY), false);
  const splash = (w, h, faceW) => page(w, h, `<div style="width:${w}px;height:${h}px;background:${NAVY};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(faceW * 0.12)}px"><svg xmlns="http://www.w3.org/2000/svg" width="${faceW}" height="${faceW}" viewBox="0 0 ${faceW} ${faceW}">${place(faceW, faceW * 0.952 / BOX.w, FACE)}</svg><div style="font-family:G;font-weight:800;font-size:${Math.round(faceW * 0.33)}px;letter-spacing:-0.01em;color:${INK}">Mathub</div></div>`, NAVY);
  const iosSplash = path.join(APP, 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset');
  for (const n of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) await shoot(path.join(iosSplash, n), 2732, 2732, splash(2732, 2732, 460), false);

  /* ---------- Android launcher icons ---------- */
  for (const [d, x] of Object.entries(DPI)) {
    const S = Math.round(108 * x), k = (34 * x) / BOX.tip;                    // the ear tips stay inside the 68 dp circle every launcher mask keeps
    await shoot(path.join(res, `mipmap-${d}`, 'ic_launcher_foreground.png'), S, S, sq(S, place(S, k, FACE)));
    await shoot(path.join(res, `mipmap-${d}`, 'ic_launcher_monochrome.png'), S, S, sq(S, place(S, k, MONO)));
    const L = Math.round(48 * x), r = 10 * x;                                   // the pre-Android 8 icons
    await shoot(path.join(res, `mipmap-${d}`, 'ic_launcher.png'), L, L, sq(L, `<rect x="${x}" y="${x}" width="${L - 2 * x}" height="${L - 2 * x}" rx="${r}" fill="${NAVY}"/>` + place(L, (32 * x) / BOX.w, FACE)));
    await shoot(path.join(res, `mipmap-${d}`, 'ic_launcher_round.png'), L, L, sq(L, `<circle cx="${L / 2}" cy="${L / 2}" r="${L / 2 - x}" fill="${NAVY}"/>` + place(L, (30 * x) / BOX.w, FACE)));
    const N = Math.round(24 * x);                                               // notification: white, 22 dp wide, on clear
    await shoot(path.join(res, `drawable-${d}`, 'ic_stat_mathub.png'), N, N, sq(N, place(N, (22 * x) / BOX.w, MONO)));
  }

  /* ---------- Android launch images (the Android 12+ splash uses the icon on navy; these cover older versions) ---------- */
  const sizes = { 'drawable/splash.png': [480, 320], 'drawable-land-mdpi/splash.png': [480, 320], 'drawable-land-hdpi/splash.png': [800, 480], 'drawable-land-xhdpi/splash.png': [1280, 720], 'drawable-land-xxhdpi/splash.png': [1600, 960], 'drawable-land-xxxhdpi/splash.png': [1920, 1280], 'drawable-port-mdpi/splash.png': [320, 480], 'drawable-port-hdpi/splash.png': [480, 800], 'drawable-port-xhdpi/splash.png': [720, 1280], 'drawable-port-xxhdpi/splash.png': [960, 1600], 'drawable-port-xxxhdpi/splash.png': [1280, 1920] };
  for (const [f, [w, h]] of Object.entries(sizes)) await shoot(path.join(res, f), w, h, splash(w, h, Math.round(Math.min(w, h) * 0.36)), false);

  /* ---------- Google Play listing ---------- */
  const store = path.join(APP, 'store');
  await shoot(path.join(store, 'play-icon-512.png'), 512, 512, sq(512, `<rect width="512" height="512" fill="${NAVY}"/>` + place(512, 512 * 0.58 * 1.12 / 64, FACE), NAVY), false);
  await shoot(path.join(store, 'play-feature-1024x500.png'), 1024, 500, page(1024, 500, `<div style="width:1024px;height:500px;background:radial-gradient(120% 140% at 85% 10%, #22356A 0%, ${NAVY} 60%);display:flex;align-items:center;gap:56px;padding:0 84px;box-sizing:border-box"><svg xmlns="http://www.w3.org/2000/svg" width="230" height="230" viewBox="0 0 230 230">${place(230, 230 / BOX.w, FACE)}</svg><div style="font-family:G;color:${INK}"><div style="font-weight:800;font-size:92px;letter-spacing:-0.02em;line-height:1">Mathub</div><div style="font-weight:600;font-size:34px;line-height:1.25;margin-top:18px;color:#C9D6F2">Your classes, offline.<br>Any class, from its syllabus.</div></div></div>`, NAVY), false);

  await browser.close();
  // flatten the iOS icon (no alpha channel) and the Play art (opaque by design)
  execFileSync('python3', ['-c', `from PIL import Image\nimport sys\nfor f in sys.argv[1:]:\n    Image.open(f).convert('RGB').save(f, optimize=True)`, iosIcon, path.join(store, 'play-icon-512.png'), path.join(store, 'play-feature-1024x500.png')]);
  console.log('flattened the iOS icon and the Play art');
})();

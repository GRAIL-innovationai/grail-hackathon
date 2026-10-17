#!/usr/bin/env node
/* Renders assets/icon.svg to the PNG sizes the manifest and browsers need (512, 192, 180, 32). Run from calc1/: node scripts/build-icons.js */
'use strict';
const fs = require('fs'); const path = require('path'); const ROOT = path.resolve(__dirname, '..');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'))); }
(async () => {
  const exe = process.env.MATHUB_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell') ? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' : undefined);
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); const svg = fs.readFileSync(path.join(ROOT, 'assets', 'icon.svg'), 'utf8');
  // maskable: same tile, mark shrunk into the safe zone (inner 80%) so launchers that mask to a circle keep all of Bo
  const maskable = svg.replace('translate(-2.8 1.3) scale(0.58)', 'translate(5.6 8.7) scale(0.44)').replace('rx="14"', 'rx="0"');
  { const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 }); await page.setContent(`<body style="margin:0;background:#fff">${maskable.replace('width="64" height="64"', 'width="512" height="512"')}</body>`); const out = path.join(ROOT, 'assets', 'icon-maskable-512.png'); await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 512, height: 512 } }); console.log('icon-maskable-512.png', Math.round(fs.statSync(out).size / 1024) + ' KB'); await page.close(); }
  for (const size of [512, 192, 180, 32]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('width="64" height="64"', `width="${size}" height="${size}"`)}</body>`);
    const out = path.join(ROOT, 'assets', `icon-${size}.png`); await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }); console.log(`icon-${size}.png`, Math.round(fs.statSync(out).size / 1024) + ' KB'); await page.close();
  }
  await browser.close();
})();

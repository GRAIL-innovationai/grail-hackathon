/* ============================================================
   Mathub — pixel art
   Hand-drawn sprites stored as character grids and drawn as crisp SVG
   (one rectangle run per row and colour), so they stay sharp at any
   size, weigh a few hundred bytes and need no image files.
   App.pixel(name, scale, opts) returns the SVG; sprites with two frames
   (Bo blinking, the invader marching, the terminal cursor) animate with
   CSS steps and hold still when motion is reduced.
   Used in: the start page skyline (Bridger Range at 8 bits), empty
   states, the XP pop-up, the streak flame, level-ups, lesson ends and
   quest celebrations, class loading, the "game over" load error, the
   footer signature, Blitz's arcade HUD and the character sheet.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const $ = App.$;
  // mirror a left half into a symmetric sprite (odd widths share the middle column)
  const mirror = (rows, odd) => rows.map(r => r + [...r].reverse().join('').slice(odd ? 1 : 0));
  const BO = mirror([
    '..o.....', '..oo....', '..oko...', '..okfo..', '.ookffoo', '.offffff', 'offffdfd', 'offfffff',
    'offfweff', 'offfeeff', 'offfcccc', 'offccccn', 'offcccoc', 'ofdccccc', '.offcccc', '..oooooo'
  ]);
  const BO_PAL = { o: '#3B2A1C', f: '#D9A15B', d: '#B7793A', k: '#8B5A2B', c: '#F3DFB8', w: '#FFFFFF', e: '#2A1B0E', n: '#3B2A1C', b: '#60A5FA' };
  const withRows = (rows, patch) => rows.map((r, i) => patch[i] !== undefined ? patch[i] : r);
  const BO_BLINK = withRows(BO, { 8: mirror(['offfffff'])[0], 9: mirror(['offfeeff'])[0].replace(/e/g, 'o') });
  const BO_SAD = withRows(BO_BLINK, { 10: mirror(['offfbccc'])[0], 11: mirror(['offfbccn'])[0], 12: mirror(['offccccc'])[0], 13: mirror(['ofdcccoc'])[0] });
  const S = {
    bo: { rows: BO, pal: BO_PAL, frames: [BO, BO_BLINK] },
    boSad: { rows: BO_SAD, pal: BO_PAL },
    heart: { rows: ['.xx.xx.', 'xhxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'], pal: { x: '#E53950', h: '#FFB3BF' } },
    coin: { rows: ['..oooo..', '.oYYyyo.', 'oYYyyyso', 'oYyyyyso', 'oyyyyyso', 'oyyyysso', '.oyssso.', '..oooo..'], pal: { o: '#8A5A00', y: '#F2C14E', Y: '#FFE59A', s: '#D48A1A' } },
    flame: { rows: ['...r...', '..rr...', '..ryr..', '.rryrr.', '.ryyyr.', 'rryYyrr', 'ryYWYyr', 'ryYWYyr', '.rrrrr.'], pal: { r: '#E8590C', y: '#FF9F1C', Y: '#FFD24D', W: '#FFF4C2' } },
    trophy: { rows: mirror(['..oooo', 'oooyyy', 'o.oYyy', 'o.oYyy', '.ooYyy', '..oyyy', '...oyy', '....oy', '....oy', '...ooo', '..obbb', '..oooo']), pal: { o: '#7A4E00', y: '#F2C14E', Y: '#FFE59A', b: '#8B5A2B' } },
    star: { rows: ['....y....', '....y....', '...yYy...', 'yyyyYyyyy', '.yyYYYyy.', '..yyYyy..', '..yy.yy..', '.yy...yy.', '.y.....y.'], pal: { y: '#F2C14E', Y: '#FFE59A' } },
    invader: { rows: ['..x.....x..', '...x...x...', '..xxxxxxx..', '.xx.xxx.xx.', 'xxxxxxxxxxx', 'x.xxxxxxx.x', 'x.x.....x.x', '...xx.xx...'], pal: { x: 'currentColor' },
      frames: [null, ['..x.....x..', 'x..x...x..x', 'x.xxxxxxx.x', 'xxx.xxx.xxx', 'xxxxxxxxxxx', '.xxxxxxxxx.', '..x.....x..', '.x.......x.']] },
    floppy: { rows: ['ooooooooo.', 'oBsssgsBoo', 'oBsssgsBBo', 'oBsssssBBo', 'oBBBBBBBBo', 'oBwwwwwwBo', 'oBwllllwBo', 'oBwwwwwwBo', 'oBwllllwBo', 'oooooooooo'], pal: { o: '#1E293B', B: '#3B5BDB', s: '#CBD5E1', g: '#475569', w: '#F8FAFC', l: '#94A3B8' } },
    potion: { rows: ['...ooo...', '...oco...', '...oco...', '..ogggo..', '.ogggggo.', 'oPPPPPPPo', 'oPwPPPPPo', 'oPPPPPPPo', '.oPPPPPo.', '..ooooo..'], pal: { o: '#2A1B3D', c: '#A16207', g: '#DDE6F5', P: '#9B5DE5', w: '#F3E8FF' } },
    book: { rows: ['ooooooooo.', 'oBBBBBBBo.', 'oBBwwwBBo.', 'oBBBBBBBo.', 'oBBBBBBBoo', 'oBBBBBBBop', 'oBBBBBBBop', 'oBBBBBBBop', 'ooooooooop', '.ppppppppp'], pal: { o: '#3B1F0F', B: '#B4232A', w: '#F2C14E', p: '#F3E9D2' } },
    scroll: { rows: ['.oo....oo.', 'oPPooooPPo', 'oPPwwwwPPo', 'oPPwllwPPo', 'oPPwwwwPPo', 'oPPwllwPPo', 'oPPooooPPo', '.oo....oo.'], pal: { o: '#6B4A1A', P: '#D9B26B', w: '#F6E7C1', l: '#9C7A45' } },
    computer: { rows: ['.oooooooooooo.', '.oSSSSSSSSSSo.', '.oSGSSSSSSSSo.', '.oSSGSSSSSSSo.', '.oSGSGGSSSSSo.', '.oSSSSSSSSSSo.', '.oooooooooooo.', '......oo......', '....oooooo....', 'oooooooooooooo', 'okkkkkkkkkkkko', 'oooooooooooooo'], pal: { o: '#1E293B', S: '#0B1B3A', G: '#4ADE80', k: '#94A3B8' },
      frames: [null, null] },
    // class icons on the start-page tiles
    integral: { rows: [".....ooooo.", "....ooWWWoo", "....oWWooWo", "....oWWoooo", "...ooWWo...", "...oWWoo...", "...oWWo....", "...oWWo....", "...oWWo....", "...oWWo....", "...oWWo....", "...oWWo....", "ooooWWo....", "oWoWWoo....", "ooWWWo.....", ".ooooo....."], pal: {"o": "#14213D", "W": "#FFFFFF"} },
    graph: { rows: [".ooo.......ooo", ".oAo.......oWo", ".oAo..ooo.ooWo", ".oAo..oYoooWoo", ".oAo..ooooWWo.", ".oAo....oWWoo.", ".oAo..oooWoo..", ".oAo.ooWWoo...", ".oAoooWooo....", ".oAWWWoooooooo", ".oAAAAAAAAAAAo", ".oAooooooooooo", ".ooo.........."], pal: {"o": "#14213D", "W": "#FFFFFF", "A": "#FFC629", "Y": "#FFC629"} },
    brain: { rows: ["...oooooooo...", ".oooPPPdPPooo.", "ooPPwPPdPPwPoo", "oPPdPPPdPPdPPo", "oPPPdPPdPdPPPo", "oPPPPPPdPPPPPo", "oPPddPPdPPddPo", "oPPPPPPdPPPPPo", "ooPPPdPdPdPPoo", ".oooPPPdPPooo.", "...oooooooo..."], pal: {"o": "#14213D", "P": "#F9A8D4", "d": "#DB5A9B", "w": "#FFE4F1"} },
    apple: { rows: ["........oooo..", "......oooGGo..", "......oBGGGo..", "...ooooBGooo..", "..ooRRoBRRoo..", ".ooRRRDDRRRoo.", "ooRwwRRRRRRRoo", "oRRwRRRRRRRRRo", "oRRRRRRRRRRRRo", "oRRRRRRRRRRRRo", "ooRRRRRRRRRRoo", ".oRRRRRRRRRRo.", ".ooRRRRRRRRoo.", "..oooooooooo.."], pal: {"o": "#14213D", "R": "#E5383B", "D": "#B42328", "B": "#7A4A20", "G": "#4ADE80", "w": "#FFC2C2"} }
  };
  S.computer.frames[1] = withRows(S.computer.rows, { 4: '.oSGSSSSSSSSo.' });
  // the start page skyline: the Bridger Range, pines and a sun, generated so it tiles seamlessly
  (function skyline() {
    const W = 64, H = 20, peaks = [[10, 13], [26, 16], [41, 12], [55, 9]]; const g = Array.from({ length: H }, () => Array(W).fill('.'));
    const put = (x, y, ch) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = ch; };
    for (let x = 0; x < W; x++) {
      let best = null; peaks.forEach(([px, ph]) => { const dx = Math.min(Math.abs(x - px), W - Math.abs(x - px)); const h = ph - dx; if (h > 0 && (!best || h > best.h)) best = { h, px, ph, dx, right: ((x - px + W) % W) < W / 2 && x !== px }; });
      if (!best) continue; const top = H - 2 - best.h;
      for (let y = top; y < H - 2; y++) put(x, y, best.ph >= 12 && y < top + 2 + (best.dx < 2 ? 1 : 0) ? 'M' : best.right ? 'n' : 'm');
    }
    [[3, 5], [7, 4], [17, 6], [21, 5], [33, 4], [36, 6], [47, 5], [51, 4], [60, 6]].forEach(([x, h]) => { for (let i = 0; i < h; i++) { const w = Math.min(2, Math.floor(i / 2)); for (let k = -w; k <= w; k++) put(x + k, H - 4 - (h - 1) + i, i % 2 ? 'T' : 't'); } put(x, H - 3, 'b'); });
    for (let x = 0; x < W; x++) { put(x, H - 2, 'g'); put(x, H - 1, x % 5 === 0 ? 'G' : 'g'); }
    const sun = [[46, 2], 3]; for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) { const d = x * x + y * y; if (d <= 9) put(sun[0][0] + x, sun[0][1] + 1 + y, d <= 3 ? 'S' : 's'); }
    [[12, 3, 6], [31, 5, 5]].forEach(([cx, cy, w]) => { for (let i = 0; i < w; i++) put(cx + i, cy, 'w'); for (let i = 1; i < w - 1; i++) put(cx + i, cy - 1, 'w'); for (let i = 1; i < w; i++) put(cx + i, cy + 1, 'W'); });
    S.skyline = { rows: g.map(r => r.join('')), pal: { m: '#8093BD', n: '#63759F', M: '#F1F5F9', t: '#2F855A', T: '#22603F', b: '#6B4423', g: '#4A9A63', G: '#3A7D50', s: '#F2C14E', S: '#FFE08A', w: '#FFFFFF', W: '#E2E8F0' } };
  })();
  // rows -> one path per colour, horizontal runs merged
  function paths(rows, pal) {
    const by = {}; rows.forEach((r, y) => { let x = 0; while (x < r.length) { const ch = r[x]; if (ch === '.' || !pal[ch]) { x++; continue; } let n = 1; while (r[x + n] === ch) n++; (by[ch] = by[ch] || []).push(`M${x} ${y}h${n}v1h-${n}z`); x += n; } });
    return Object.entries(by).map(([ch, d]) => { const c = pal[ch]; return c.startsWith('var(') || c === 'currentColor' ? `<path style="fill:${c}" d="${d.join('')}"/>` : `<path fill="${c}" d="${d.join('')}"/>`; }).join('');
  }
  const cache = {};
  App.pixel = function (name, scale = 3, opts = {}) {
    const sp = S[name]; if (!sp) return ''; const key = name + scale + (opts.cls || '') + (opts.still ? 's' : '') + (opts.label || '');
    if (cache[key]) return cache[key];
    const h = sp.rows.length, w = sp.rows[0].length; const frames = !opts.still && sp.frames ? sp.frames.map(f => f || sp.rows) : null;
    const body = frames ? frames.map((f, i) => `<g class="pxf pxf${i + 1}">${paths(f, sp.pal)}</g>`).join('') : paths(sp.rows, sp.pal);
    const cls = `px px-${name}${frames ? ` px-anim px-n${frames.length}` : ''}${opts.cls ? ' ' + opts.cls : ''}`;
    const aria = opts.label ? `role="img" aria-label="${opts.label}"` : 'aria-hidden="true"';
    return (cache[key] = `<svg class="${cls}" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" ${aria} focusable="false">${body}</svg>`);
  };
  App.pixelSprites = Object.keys(S);
  // each class wears its own little sprite on its start-page tile; class packs fall back to the book
  const CLASS_SPRITE = { calc: 'integral', physics: 'apple', precalc: 'graph', writ: 'scroll', csci: 'computer', biob: 'potion', kin: 'heart', psyx: 'brain' };
  App.classSprite = (id, scale = 4) => App.pixel(CLASS_SPRITE[id] || 'book', scale, { cls: 'px-class', still: true });
  // a stable sprite per empty-state message, so the same box always shows the same friend
  const FRIENDS = ['bo', 'invader', 'floppy', 'potion', 'computer', 'book', 'star', 'heart'];
  App.pixelFor = txt => { let h = 0; for (const ch of String(txt || '')) h = (h * 31 + ch.charCodeAt(0)) | 0; const name = FRIENDS[Math.abs(h) % FRIENDS.length]; return App.pixel(name, name === 'heart' || name === 'star' ? 4 : 3, { cls: 'px-friend' }); };
  // the skyline as a CSS background (tiles horizontally along the bottom of the start page hero)
  const sky = S.skyline; const skySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sky.rows[0].length}" height="${sky.rows.length}" viewBox="0 0 ${sky.rows[0].length} ${sky.rows.length}" shape-rendering="crispEdges">${paths(sky.rows, sky.pal)}</svg>`;
  document.documentElement.style.setProperty('--px-skyline', `url("data:image/svg+xml,${encodeURIComponent(skySvg)}")`);
  // footer signature
  function signFooter() {
    const f = $('.site-foot'); if (!f || $('.px-sig', f)) return;
    f.insertAdjacentHTML('afterbegin', `<span class="px-sig">${App.pixel('invader', 2, { cls: 'px-foot-inv' })}<span>Handmade with</span>${App.pixel('heart', 2)}<span class="sr-only"> love </span><span>in Bozeman</span></span><span class="sep">·</span>`);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', signFooter); else signFooter();
})(window);

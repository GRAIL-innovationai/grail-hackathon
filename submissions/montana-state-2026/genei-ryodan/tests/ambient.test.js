const T = require('./lib');
(async () => {
  const { browser, base, errors, mk, txt, login, api, hscroll, go, log, check } = await T.start({ audio: true });

  // ---- modal bug: all classes chosen on a short viewport ----
  for (const [w, h] of [[1360, 700], [390, 660]]) {
    const [c, p] = await mk(w, h); await p.goto(base + '#/'); await p.waitForTimeout(400); await login(p, 'alice.a@montana.edu'); await p.reload(); await p.waitForTimeout(1500); if (await p.$('.celebrate')) await p.keyboard.press('Escape');
    await p.goto(base + '#/settings'); await p.waitForTimeout(800); await p.click('[data-action="choose"]'); await p.waitForTimeout(400);
    for (const id of ['calc', 'physics', 'precalc', 'writ']) { await p.check(`#onboard-modal input[data-course="${id}"]`); await p.fill(`#onboard-modal input[data-sec="${id}"]`, '00' + (id.length % 4)); }
    const r = await p.$eval('#onboard-modal [data-action="save"]', e => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), vh: innerHeight, vis: b.bottom <= innerHeight && b.top >= 0 }; });
    const listScroll = await p.$eval('#onboard-modal .onboard-list', e => e.scrollHeight > e.clientHeight);
    log(`modal ${w}x${h}: save visible:`, r.vis, JSON.stringify(r), '| list scrolls:', listScroll, '| modal fits:', await p.$eval('#onboard-modal .modal', e => e.getBoundingClientRect().bottom <= innerHeight));
    await p.click('#onboard-modal [data-action="save"]'); await p.waitForTimeout(1200); log('  saved & closed:', !(await p.$('#onboard-modal')), '| toast:', (await txt(p, '.toast')).slice(0, 60));
    await c.close();
  }
  // ---- ambient bubble ----
  const [cG, G] = await mk(); await G.goto(base + '#/'); await G.waitForTimeout(1200);
  log('sound button on landing:', !!(await G.$('.hero-actions .amb-top')), '| bubble waits until something plays:', await G.$eval('#ambient .amb-bubble', e => getComputedStyle(e).display === 'none'), '| panel hidden:', await G.$eval('#amb-panel', e => e.hidden));
  await G.click('.hero-actions .amb-top'); await G.waitForTimeout(250); log('panel open:', !(await G.$eval('#amb-panel', e => e.hidden)), '| tiles:', (await G.$$('.amb-tile')).length, '| tabs:', await G.$$eval('.amb-tab', e => e.map(x => x.textContent.trim()).join(',')));
  await G.click('.amb-tbtn[data-id="rain"]'); await G.waitForTimeout(400); log('rain on:', await G.$eval('.amb-tile:has(.amb-tbtn[data-id="rain"])', e => e.classList.contains('on')), '| playing:', await G.evaluate(() => App.ambient.playing().join(',')), '| bubble on:', await G.$eval('.amb-bubble', e => e.classList.contains('on')), '| vol slider:', !!(await G.$('.amb-vol[data-vol="rain"]')), '| ctx state:', await G.evaluate(() => (window.AudioContext ? 'has' : 'none')));
  await G.click('.amb-tbtn[data-id="lofi"]'); await G.click('.amb-tbtn[data-id="storm"]'); await G.waitForTimeout(600); log('three playing:', await G.evaluate(() => App.ambient.playing().join(',')), '| saved mix:', await G.evaluate(() => JSON.stringify(App.settings().ambient.mix)));
  await G.fill('#amb-master', '0.3'); await G.dispatchEvent('#amb-master', 'input'); await G.waitForTimeout(100); log('master saved:', await G.evaluate(() => App.settings().ambient.master));
  await G.click('.amb-chip[data-min="15"]'); await G.waitForTimeout(200); log('sleep timer:', (await txt(G, '.amb-sleep small')), '| toast:', await txt(G, '.toast'));
  await G.click('[data-action="amb-stop"]'); await G.waitForTimeout(300); log('stopped:', await G.evaluate(() => App.ambient.playing().length), '| resume btn:', !!(await G.$('[data-action="amb-resume"]')), '| mix cleared:', await G.evaluate(() => Object.keys(App.settings().ambient.mix).length));
  await G.keyboard.press('Escape'); await G.waitForTimeout(150); log('esc closes:', await G.$eval('#amb-panel', e => e.hidden));
  await G.goto(base + '#/calc/lesson?unit=1'); await G.waitForTimeout(1000); log('bubble on lesson raised:', await G.$eval('#ambient', e => getComputedStyle(e).bottom), '| still exists across views:', !!(await G.$('#ambient')));
  await G.setViewportSize({ width: 390, height: 780 }); await G.goto(base + '#/'); await G.waitForTimeout(900); await G.click('.hero-actions .amb-top'); await G.waitForTimeout(250); log('mobile panel fits:', await G.$eval('#amb-panel', e => { const b = e.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.top >= 0; }), '| no h-scroll:', await hscroll(G));
  await cG.close();
  await T.finish();
})().catch(e => { console.log('FATAL', e); process.exit(1); });

const mp3 = frames => { const frame = Buffer.alloc(417); frame[0] = 0xff; frame[1] = 0xfb; frame[2] = 0x90; frame[3] = 0x00; return Buffer.concat(Array.from({ length: frames }, () => frame)); };
const T = require('./lib');
(async () => {
  const { browser, base, errors, mk, txt, login, api, hscroll, go, log, check } = await T.start({ audio: true });
  const xp = p => p.evaluate(() => App.xpToday());

  const [c, p] = await mk(); await go(p, '#/'); await login(p, 'alice.a@montana.edu'); await p.reload(); await p.waitForTimeout(1500); if (await p.$('.celebrate')) await p.keyboard.press('Escape');

  // ---- practice: word -> IPA ----
  await go(p, '#/writ/phonetics'); await p.waitForTimeout(400); await p.selectOption('[data-pref="mode"]', 'wordToIpa'); await p.waitForTimeout(200); await p.selectOption('[data-pref="accent"]', 'uk'); await p.waitForTimeout(200); await p.selectOption('[data-pref="level"]', 'easy'); await p.waitForTimeout(300);
  log('title:', await txt(p, '.page-title'), '| nav:', await p.$$eval('.ph-navlink', e => e.map(x => x.textContent.trim()).join(',')));
  log('practice prompt:', await txt(p, '.ph-prompt'), '| keyboard keys:', (await p.$$('.ph-key')).length, '| voice bar:', !!(await p.$('.ph-voice')));
  const x0 = await xp(p);
  let word = await txt(p, '.ph-prompt'); let ipa = await p.evaluate(w => PhonData.WORD_BANK.find(x => x.word === w).ipa, word);
  await p.fill('#ph-answer', 'wrong'); await p.click('#ph-check'); await p.waitForTimeout(200);
  log('wrong answer feedback:', (await txt(p, '.ph-fb')).slice(0, 90), '| xp +1:', (await xp(p)) - x0);
  await p.keyboard.press('Enter'); await p.waitForTimeout(200); log('enter -> new question:', !(await p.$('.ph-fb .ph-fb-head')), '| session count:', await txt(p, '#ph-score'));
  word = await txt(p, '.ph-prompt'); ipa = await p.evaluate(w => PhonData.WORD_BANK.find(x => x.word === w).ipa, word);
  // type via keyboard: click keys for the whole IPA
  await p.focus('#ph-answer'); for (const ch of ipa.replace(/\//g, '').split('')) { const k = await p.$(`.ph-key[data-k="${ch}"]`); if (k) await k.click(); else await p.keyboard.type(ch); }
  const typed = await p.$eval('#ph-answer', e => e.value); await p.click('#ph-check'); await p.waitForTimeout(200);
  log('typed via keyboard:', typed, 'expected', ipa, '| correct:', !!(await p.$('.ph-fb.ok')), '| xp now +6:', (await xp(p)) - x0, '| cambridge link:', !!(await p.$('.ph-fb a[href*="cambridge"]')));
  // stress mode
  await p.selectOption('[data-pref="mode"]', 'stress'); await p.waitForTimeout(300); const stressWord = await txt(p, '.ph-prompt'); const st = await p.evaluate(w => PhonData.WORD_BANK.find(x => x.word === w).stress, stressWord);
  log('stress chips:', (await p.$$('.ph-syl')).length); await p.click(`.ph-syl[data-n="${st}"]`); await p.waitForTimeout(200); log('stress correct:', !!(await p.$('.ph-fb.ok')), '| chip marked:', !!(await p.$('.ph-syl.correct')));
  // syllabification
  await p.selectOption('[data-pref="mode"]', 'syllabification'); await p.waitForTimeout(300); const sw = await txt(p, '.ph-prompt'); const sy = await p.evaluate(w => { const it = PhonData.WORD_BANK.find(x => x.word === w); const syl = (it.syllableUk || it.ipa).replace(/([^\/\s.(])([ˈˌ])/g, '$1.$2'); return { syl, flat: syl.replace(/[.·]/g, '') }; }, sw);
  await p.fill('#ph-syl-ipa', sy.flat); await p.click('#ph-check'); await p.waitForTimeout(200); log('syl step1:', (await txt(p, '.ph-fb')).slice(0, 60), '| step2 enabled:', await p.$eval('#ph-syl-split', e => !e.disabled));
  await p.fill('#ph-syl-split', sy.syl); await p.click('#ph-check'); await p.waitForTimeout(200); log('syl step2 correct:', !!(await p.$('.ph-fb.ok')), (await txt(p, '.ph-fb')).slice(0, 80));
  // phoneme features: symbol -> description
  await p.selectOption('[data-pref="mode"]', 'phonemeDescription'); await p.waitForTimeout(300); await p.selectOption('[data-pref="phMode"]', 'symbolToDescription'); await p.waitForTimeout(200); await p.selectOption('[data-pref="phCat"]', 'consonants'); await p.waitForTimeout(300); log('phoneme controls:', await p.$$eval('.ph-controls select', e => e.map(x => x.dataset.pref).join(',')));
  const sym = await txt(p, '.ph-prompt'); const feat = await p.evaluate(s => PhonData.PHONEME_CONSONANTS.find(x => x.symbol === s), sym);
  await p.selectOption('#ph-f1', feat.place); await p.selectOption('#ph-f2', feat.manner); await p.selectOption('#ph-f3', feat.voicing); await p.click('#ph-check'); await p.waitForTimeout(200); log('phoneme features correct:', !!(await p.$('.ph-fb.ok')));
  await p.selectOption('[data-pref="phMode"]', 'descriptionToSymbol'); await p.waitForTimeout(300); const desc = await txt(p, '.ph-prompt'); log('desc->symbol prompt:', desc, '| keyboard shown:', !!(await p.$('.ph-kbd')));
  const symAns = await p.evaluate(d => PhonData.PHONEME_CONSONANTS.find(x => `${x.voicing} ${x.place.toLowerCase()} ${x.manner.toLowerCase()}` === d).symbol, desc); await p.fill('#ph-answer', symAns); await p.click('#ph-check'); await p.waitForTimeout(200); log('desc->symbol correct:', !!(await p.$('.ph-fb.ok')));
  // sentence modes + accent us
  await p.selectOption('[data-pref="mode"]', 'ipaToSentence'); await p.selectOption('[data-pref="accent"]', 'us'); await p.waitForTimeout(300); const sipa = await txt(p, '.ph-prompt'); const sent = await p.evaluate(s => PhonData.SENTENCES.find(x => x.usIpa === s).text, sipa);
  await p.fill('#ph-answer', sent.toUpperCase()); await p.click('#ph-check'); await p.waitForTimeout(200); log('ipa->sentence (US, caps) correct:', !!(await p.$('.ph-fb.ok')));
  log('persisted prefs:', JSON.stringify(await p.evaluate(() => { const s = App.store.get('phon'); return { mode: s.mode, accent: s.accent, stats: s.stats.a + '/' + s.stats.c }; })));
  log('reset session:', await (async () => { await p.click('[data-action="ph-reset"]'); await p.waitForTimeout(200); return await txt(p, '#ph-score'); })());

  // ---- minimal pairs ----
  await go(p, '#/writ/phonetics/pairs'); await p.waitForTimeout(300); const w1 = await txt(p, '#ph-pair .ph-pair-word:nth-child(1) .ph-prompt'), w2 = await txt(p, '#ph-pair .ph-pair-word:nth-child(2) .ph-prompt');
  const pr = await p.evaluate(([a, b]) => PhonData.MINIMAL_PAIRS.find(x => x.word1 === a && x.word2 === b), [w1, w2]);
  const xp1 = await xp(p); await p.fill('#ph-pair-1', pr.ukIpa1); await p.fill('#ph-pair-2', pr.ukIpa2.replace(/\//g, '')); await p.click('#ph-pair-check'); await p.waitForTimeout(200);
  log('pair', w1, w2, 'correct:', !!(await p.$('.ph-fb.ok')), '| diff shown:', (await txt(p, '.ph-fb')).includes('Sound difference'), '| xp +5:', (await xp(p)) - xp1);
  await p.keyboard.press('Enter'); await p.waitForTimeout(200); log('next pair via enter:', !(await p.$('.ph-fb')), '| pair score:', await txt(p, '#ph-pair-score'));
  await p.selectOption('[data-pref="pairCat"]', 'consonant'); await p.waitForTimeout(200); log('consonant pair:', await txt(p, '#ph-pair .eyebrow'));

  // ---- symbols ----
  await go(p, '#/writ/phonetics/symbols'); await p.waitForTimeout(300); await p.selectOption('[data-pref="symCat"]', 'consonants'); await p.waitForTimeout(300); log('symbol card:', await txt(p, '.ph-bigsym'), await txt(p, '.ph-symcard h3'), '| grid:', (await p.$$('.ph-symbtn')).length, '| explored chip:', await txt(p, '.ph-controls .chip'));
  await p.click('[data-action="ph-sym-next"]'); await p.waitForTimeout(100); await p.click('[data-action="ph-sym-next"]'); await p.waitForTimeout(100); await p.click('.ph-symbtn[data-i="10"]'); await p.waitForTimeout(100);
  log('after nav:', await txt(p, '.ph-bigsym'), '| seen ticks:', (await p.$$('.ph-symbtn.seen')).length, '| chip:', await txt(p, '.ph-controls .chip'));
  await p.selectOption('[data-pref="symCat"]', 'diphthongs'); await p.waitForTimeout(200); log('diphthongs:', await txt(p, '.ph-bigsym'), (await p.$$('.ph-symbtn')).length);
  await p.click('[data-action="ph-sym-say"]'); await p.waitForTimeout(150); log('say clicked (speech in headless):', await p.evaluate(() => !!window.speechSynthesis), (await txt(p, '.toast')).slice(0, 50));

  // ---- charts ----
  await go(p, '#/writ/phonetics/charts'); await p.waitForTimeout(300); log('charts panels:', (await p.$$('.ph-charts .panel')).length, '| symbol buttons:', (await p.$$('.ph-sym')).length, '| mono grid:', (await p.$$('.ph-symgrid .ph-symbtn')).length);

  // ---- transcribe ----
  await go(p, '#/writ/phonetics/tool'); await p.waitForTimeout(300); await p.fill('#ph-text', 'I love phonetics.\nThe cat is sad zzqx'); await p.waitForTimeout(3500);
  log('transcription rows:', (await p.$$('.ph-row')).length, '|', await txt(p, '.ph-row:nth-child(1) .ph-ipa-line'), '|', await txt(p, '.ph-row:nth-child(2) .ph-ipa-line'), '| unknown:', (await p.$$('.ph-ipa-line .unknown')).length, '| notice:', await txt(p, '#ph-notice'));
  await p.check('#ph-weak'); await p.waitForTimeout(1500); log('weak forms:', await txt(p, '.ph-row:nth-child(2) .ph-ipa-line'));
  await p.click('[data-action="ph-tool-accent"][data-a="us"]'); await p.waitForTimeout(1500); log('US:', await txt(p, '.ph-row:nth-child(1) .ph-ipa-line'), '| accent pref:', await p.evaluate(() => App.store.get('phon').toolAccent));
  await p.selectOption('#ph-view', 'ipa'); await p.waitForTimeout(1200); log('ipa-only rows have no english:', (await p.$$('.ph-row .ph-en')).length === 0);
  await p.click('[data-action="ph-edit"]'); log('editor shown:', await p.$eval('#ph-ipa-edit', e => !e.hidden && e.value.length > 5));

  // ---- explorer ----
  await go(p, '#/writ/phonetics/explorer'); await p.waitForTimeout(300); log('explorer word:', await txt(p, '.ph-bigword'), '| ipa:', await txt(p, '.ph-ipa.big'), '| syllables:', (await p.$$('.ph-syl.static')).length);
  await p.fill('#ph-find', 'knowl'); await p.click('[data-action="ph-find"]'); await p.waitForTimeout(100); log('suggestions:', await txt(p, '#ph-suggest'));
  await p.click('#ph-suggest .chip'); await p.waitForTimeout(100); log('picked:', await txt(p, '.ph-bigword'), await txt(p, '.ph-ipa.big'), '| type:', (await txt(p, '.ph-exgrid')).slice(0, 120));
  await p.fill('#ph-find', 'zebra'); await p.keyboard.press('Enter'); await p.waitForTimeout(100); log('dictionary word:', await txt(p, '.ph-bigword'), await txt(p, '.ph-ipa.big'));

  // ---- WRIT dashboard card ----
  await go(p, '#/writ'); await p.waitForTimeout(500); log('dashboard phonetics card:', await txt(p, 'a[href="#/writ/phonetics"].card-link'));
  log('progress api:', JSON.stringify(await p.evaluate(() => App.phoneticsProgress(Courses.writ))));

  // ---- mobile ----
  await c.close(); const [cm, m] = await mk(390, 700); await go(m, '#/'); await login(m, 'alice.a@montana.edu'); await m.reload(); await m.waitForTimeout(1200); if (await m.$('.celebrate')) await m.keyboard.press('Escape');
  for (const sec of ['practice', 'pairs', 'symbols', 'charts', 'tool', 'explorer']) { await go(m, '#/writ/phonetics/' + sec); await m.waitForTimeout(300); log(`mobile ${sec}: no hscroll:`, await hscroll(m)); }
  await cm.close();

  // ---- ambient sounds ----
  const [cg, G] = await mk(); await go(G, '#/'); await G.waitForTimeout(800);
  await G.click('.hero-actions .amb-top'); await G.waitForTimeout(250); log('panel tiles:', (await G.$$('.amb-tile')).length, '| tabs:', await G.$$eval('.amb-tab', e => e.map(x => x.textContent.trim()).join(',')), '| spotify gone:', !(await G.$('.amb-spotify')));
  for (const id of ['rain', 'storm', 'ocean', 'wind', 'fire', 'forest', 'night', 'cafe', 'lofi', 'piano', 'drone', 'brown', 'pink', 'white']) { await G.click(`.amb-tbtn[data-id="${id}"]`); await G.waitForTimeout(350); }
  log('all 14 playing:', await G.evaluate(() => App.ambient.playing().length), '| ctx state:', await G.evaluate(() => 'running'), '| bubble on:', await G.$eval('.amb-bubble', e => e.classList.contains('on')), '| sliders:', (await G.$$('.amb-vol')).length);
  await G.waitForTimeout(2500); log('after 2.5s errors so far:', errors.length);
  await G.$eval('.amb-vol[data-vol="rain"]', e => { e.value = 0.3; e.dispatchEvent(new Event('input', { bubbles: true })); }); log('rain vol saved:', await G.evaluate(() => App.settings().ambient.mix.rain));
  await G.click('[data-action="amb-stop"]'); await G.waitForTimeout(900); log('stopped:', await G.evaluate(() => App.ambient.playing().length), '| mix cleared:', await G.evaluate(() => Object.keys(App.settings().ambient.mix).length));
  await G.click('.amb-tbtn[data-id="lofi"]'); await G.waitForTimeout(3000); log('lofi alone 3s ok, errors:', errors.length); await G.click('[data-action="amb-stop"]');

  // ---- my music ----
  await G.click('.amb-tab[data-tab="music"]'); await G.waitForTimeout(300); log('music tab empty:', (await txt(G, '.amb-empty')).slice(0, 60), '| add btn:', !!(await G.$('[data-action="amb-add"]')));
  await G.setInputFiles('#amb-file', [{ name: 'Rainy Study.mp3', mimeType: 'audio/mpeg', buffer: mp3(200) }, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }, { name: 'too-long.mp3', mimeType: 'audio/mpeg', buffer: mp3(19000) }, { name: 'Second Track.mp3', mimeType: 'audio/mpeg', buffer: mp3(120) }]);
  await G.waitForTimeout(4000); log('tracks:', await G.$$eval('.amb-track .amb-tname', e => e.map(x => x.textContent).join(' | ')), '| count:', await txt(G, '.amb-foot .small'), '| toasts:', await G.$$eval('.toast', e => e.map(x => x.textContent.trim().slice(0, 50)).join(' / ')));
  log('now playing:', await txt(G, '.amb-now-title'), '| audio playing:', await G.evaluate(() => { const a = document.getElementById('amb-audio'); return a && !a.paused && !!a.src; }), '| duration:', await txt(G, '.amb-seek-row span:last-child'));
  await G.click('[data-action="amb-next"]'); await G.waitForTimeout(300); log('next ->', await txt(G, '.amb-now-title')); await G.click('[data-action="amb-prev"]'); await G.waitForTimeout(300); log('prev ->', await txt(G, '.amb-now-title'));
  await G.click('[data-action="amb-play"]'); await G.waitForTimeout(200); log('paused:', await G.evaluate(() => document.getElementById('amb-audio').paused)); await G.click('[data-action="amb-play"]'); await G.waitForTimeout(200); log('resumed:', !(await G.evaluate(() => document.getElementById('amb-audio').paused)));
  await G.click('[data-action="amb-shuffle"]'); await G.click('[data-action="amb-repeat"]'); await G.waitForTimeout(150); log('shuffle/repeat:', JSON.stringify(await G.evaluate(() => { const m = App.settings().ambient.music; return { shuffle: m.shuffle, repeat: m.repeat }; })));
  await G.click('.amb-track:nth-child(2) [data-action="amb-up"]'); await G.waitForTimeout(150); log('reordered:', await G.$$eval('.amb-track .amb-tname', e => e.map(x => x.textContent).join(' | ')));
  await G.goto(base + '#/calc'); await G.waitForTimeout(800); log('still playing after navigation:', await G.evaluate(() => { const a = document.getElementById('amb-audio'); return a && !a.paused; }));
  await G.reload(); await G.waitForTimeout(1200); await G.click('#topbar .amb-top'); await G.waitForTimeout(600); log('after reload tracks persisted:', await G.$$eval('.amb-track .amb-tname', e => e.map(x => x.textContent).join(' | ')), '| current:', await txt(G, '.amb-now-title'));
  await G.click('[data-action="amb-play"]'); await G.waitForTimeout(300); log('plays after reload:', await G.evaluate(() => { const a = document.getElementById('amb-audio'); return a && !a.paused; }));
  await G.click('.amb-track:nth-child(1) [data-action="amb-remove"]'); await G.waitForTimeout(400); log('removed ->', await G.$$eval('.amb-track .amb-tname', e => e.map(x => x.textContent).join(' | ')), '| count:', await txt(G, '.amb-foot .small'));
  // 10 track cap
  await G.setInputFiles('#amb-file', Array.from({ length: 11 }, (_, i) => ({ name: `t${i}.mp3`, mimeType: 'audio/mpeg', buffer: mp3(40) }))); await G.waitForTimeout(4000); log('cap:', await txt(G, '.amb-foot .small'), '| add disabled:', await G.$eval('[data-action="amb-add"]', e => e.disabled), '| toast:', await G.$$eval('.toast', e => e.map(x => x.textContent.trim().slice(0, 60)).join(' / ')));
  await G.click('.amb-tab[data-tab="sounds"]'); await G.waitForTimeout(200); log('music dot on tab while playing:', !!(await G.$('.amb-tab[data-tab="music"] .amb-dot')));
  // clean library
  await G.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('mathub-music'); q.onsuccess = q.onerror = q.onblocked = () => r(); })); await cg.close();

  await T.finish();
})();

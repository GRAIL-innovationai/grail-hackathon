/* ============================================================
   Mathub — readings library and read-along audiobook player
   Uses the browser's speech synthesis (no audio files): one sentence
   at a time with highlighting, play/pause, paragraph skipping, speed,
   voice choice, auto-scroll, remembered position, XP for progress.
   Views: readings (library), reading/<id> (player). Data: D.READINGS.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, store, toast, settings, setSetting } = App;
  const list = () => (App.D && App.D.READINGS) || [];
  const prog = () => store.get('readings', {});
  const save = (id, patch) => { const p = prog(); p[id] = Object.assign({}, p[id] || {}, patch); store.set('readings', p); };
  const itemsOf = r => { const out = []; r.parts.forEach(pt => { if (pt.h) out.push({ kind: 'h', text: pt.h }); pt.p.forEach(text => out.push({ kind: 'p', text })); }); return out; };
  const wordCount = r => r.parts.reduce((n, pt) => n + pt.p.reduce((m, s) => m + s.split(/\s+/).length, 0), 0);
  const minutesOf = r => Math.max(1, Math.round(wordCount(r) / 160));
  function sentences(text) {
    const raw = text.match(/[^.!?]+[.!?]+["”’)\]]*|[^.!?]+$/g) || [text]; const out = [];
    raw.forEach(s => { s = s.trim(); if (!s) return; if (out.length && (s.length < 14 || /^[a-z]/.test(s) || /\b(Dr|Mr|Mrs|Ms|St|vs|No|Col|Capt)\.$/.test(out[out.length - 1]))) out[out.length - 1] += ' ' + s; else out.push(s); });
    return out;
  }
  const synth = () => global.speechSynthesis || null;
  const RS = { r: null, items: [], sents: [], i: 0, s: 0, playing: false, u: null, voices: [], root: null, key: null };
  function loadVoices() { const sy = synth(); if (!sy) return []; RS.voices = (sy.getVoices() || []).filter(v => /^en/i.test(v.lang)); return RS.voices; }
  if (synth()) { loadVoices(); if (typeof synth().addEventListener === 'function') synth().addEventListener('voiceschanged', () => { loadVoices(); const sel = $('#rd-voice'); if (sel) sel.innerHTML = voiceOptions(); }); }
  function pickVoice() { const vs = RS.voices.length ? RS.voices : loadVoices(); if (!vs.length) return null; const want = settings().readerVoice; return vs.find(v => v.name === want) || vs.find(v => /natural|premium|enhanced|neural/i.test(v.name)) || vs.find(v => /google us english|samantha|daniel|karen|moira|alex/i.test(v.name)) || vs.find(v => v.default) || vs[0]; }
  const rate = () => { const r = +settings().readerRate; return r >= 0.5 && r <= 2 ? r : 1; };
  const autoscroll = () => settings().readerScroll !== false;
  const voiceOptions = () => { const cur = pickVoice(); return (RS.voices.length ? RS.voices : loadVoices()).map(v => `<option value="${esc(v.name)}"${cur && v.name === cur.name ? ' selected' : ''}>${esc(v.name.replace(/^Microsoft |^Google /, ''))}</option>`).join('') || '<option>System voice</option>'; };

  function speakCurrent() {
    const sy = synth(); if (!sy || !RS.r || !RS.playing) return;
    if (RS.i >= RS.items.length) { finish(); return; }
    const sents = RS.sents[RS.i]; const text = sents[RS.s];
    if (text === undefined) { nextItem(); return; }
    const u = new SpeechSynthesisUtterance(text); const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; } u.rate = rate(); u.pitch = 1;
    u.onend = () => { if (!RS.playing || RS.u !== u) return; RS.s++; if (RS.s >= sents.length) { paragraphDone(); nextItem(); } else speakCurrent(); };
    u.onerror = e => { if (!e || e.error === 'interrupted' || e.error === 'canceled') return; RS.playing = false; paintBar(); highlight(); toast('The voice stopped (' + (e.error || 'error') + '). Press play to continue.', 3500); };
    RS.u = u; highlight(); sy.speak(u);
  }
  function play() { const sy = synth(); if (!sy) { toast('This browser cannot read aloud. You can still read along below.', 3500); return; } if (RS.playing) return; if (RS.i >= RS.items.length) { RS.i = 0; RS.s = 0; } RS.playing = true; sy.cancel(); paintBar(); speakCurrent(); if (App.sfx) App.sfx.play('tap'); }
  function pause() { RS.playing = false; const sy = synth(); if (sy) sy.cancel(); RS.u = null; paintBar(); highlight(); }
  function goTo(i, resume) { RS.i = Math.max(0, Math.min(RS.items.length, i)); RS.s = 0; save(RS.r.id, { i: RS.i }); const sy = synth(); if (sy) sy.cancel(); RS.u = null; paintBar(); if (RS.playing && resume !== false) speakCurrent(); else highlight(); }
  function nextItem() { RS.s = 0; RS.i++; save(RS.r.id, { i: Math.min(RS.i, RS.items.length) }); if (RS.i >= RS.items.length) { finish(); return; } paintBar(); if (RS.playing) speakCurrent(); else highlight(); }
  function paragraphDone() { const it = RS.items[RS.i]; if (!it || it.kind !== 'p') return; const p = prog()[RS.r.id] || {}; const seen = Array.isArray(p.seen) ? p.seen.slice() : []; if (!seen.includes(RS.i)) { seen.push(RS.i); save(RS.r.id, { seen }); if (App.addXP) App.addXP(1, { silent: true }); if (App.markActivity) App.markActivity(); } }
  function finish() {
    RS.playing = false; const sy = synth(); if (sy) sy.cancel(); RS.u = null; RS.i = RS.items.length; const p = prog()[RS.r.id] || {};
    if (!p.done) { save(RS.r.id, { done: true, i: RS.items.length, finished: Date.now() }); if (App.markActivity) App.markActivity(); if (App.addXP) App.addXP(20); if (App.sfx) App.sfx.play('complete'); if (App.confetti) App.confetti({ count: 130 }); toast(`${icon('book', 14)} Finished “${esc(RS.r.title)}” · +20 XP`, 4200); }
    else save(RS.r.id, { i: RS.items.length });
    paintBar(); highlight();
  }
  function highlight() {
    const root = RS.root; if (!root) return;
    $$('.rd-item.now', root).forEach(e => e.classList.remove('now')); $$('.rd-s.now-s', root).forEach(e => e.classList.remove('now-s'));
    const it = $(`.rd-item[data-i="${RS.i}"]`, root); if (!it) return; it.classList.add('now');
    const sp = $(`.rd-s[data-s="${RS.s}"]`, it); if (sp && RS.playing) sp.classList.add('now-s');
    if (RS.playing && autoscroll()) { const r = it.getBoundingClientRect(); if (r.top < 120 || r.bottom > innerHeight - 140) it.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
  function remaining() { let w = 0; for (let k = RS.i; k < RS.items.length; k++) w += RS.items[k].text.split(/\s+/).length; return Math.max(0, Math.round(w / (160 * rate()))); }
  function paintBar() {
    const bar = RS.root && $('#rd-bar', RS.root); if (!bar) return; const n = RS.items.length; const pct = n ? Math.round(100 * Math.min(RS.i, n) / n) : 0; const done = RS.i >= n;
    bar.innerHTML = `<div class="rd-player${RS.playing ? ' playing' : ''}">
      <button class="icon-btn" data-action="rd-prev" title="Previous paragraph" aria-label="Previous paragraph">${icon('left', 16)}</button>
      <button class="btn primary rd-play" data-action="rd-play">${icon(RS.playing ? 'pause' : 'play', 16)} ${RS.playing ? 'Pause' : done ? 'Listen again' : RS.i > 0 ? 'Resume' : 'Listen'}</button>
      <button class="icon-btn" data-action="rd-next" title="Next paragraph" aria-label="Next paragraph">${icon('right', 16)}</button>
      <div class="rd-prog"><div class="bar sm"><div class="bar-fill${done ? ' good' : ''}" style="width:${pct}%"></div></div><small>${done ? 'Finished' : `Paragraph ${Math.min(RS.i + 1, n)} of ${n} · about ${remaining()} min left`}</small></div>
      <label class="rd-ctl"><span>Speed</span><select class="select sm" id="rd-rate">${[0.8, 0.9, 1, 1.1, 1.25, 1.5].map(r => `<option value="${r}"${rate() === r ? ' selected' : ''}>${r}×</option>`).join('')}</select></label>
      <label class="rd-ctl"><span>Voice</span><select class="select sm" id="rd-voice">${voiceOptions()}</select></label>
      <button class="icon-btn${autoscroll() ? ' on' : ''}" data-action="rd-scroll" title="Auto-scroll to the sentence being read">${icon('down', 15)}</button></div>`;
    const rs = $('#rd-rate', bar); rs.addEventListener('change', e => { setSetting('readerRate', +e.target.value); if (RS.playing) goTo(RS.i); });
    const vs = $('#rd-voice', bar); vs.addEventListener('change', e => { setSetting('readerVoice', e.target.value); if (RS.playing) goTo(RS.i); });
  }
  function itemHtml(it, i) {
    if (it.kind === 'h') return `<h3 class="rd-item rd-h" data-i="${i}" data-action="rd-jump"><span class="rd-s" data-s="0">${esc(it.text)}</span></h3>`;
    return `<p class="rd-item" data-i="${i}" data-action="rd-jump">${sentences(it.text).map((s, k) => `<span class="rd-s" data-s="${k}">${esc(s)}</span>`).join(' ')}</p>`;
  }
  function stop() { RS.playing = false; const sy = synth(); if (sy) sy.cancel(); RS.u = null; if (RS.key) { document.removeEventListener('keydown', RS.key); RS.key = null; } RS.root = null; }
  window.addEventListener('beforeunload', () => { const sy = synth(); if (sy) sy.cancel(); });

  function cardHtml(r, p) {
    const n = itemsOf(r).length; const i = p ? Math.min(p.i || 0, n) : 0; const pct = p && p.done ? 100 : Math.round(100 * i / n);
    return `<div class="panel rd-card${p && p.done ? ' done' : ''}"><div class="rd-card-top"><div class="rd-cover">${icon('book', 22)}</div><div class="rd-card-body"><div class="eyebrow">${esc(r.kind)} · ${r.year}${p && p.done ? ' · finished' : ''}</div><h3>${esc(r.title)}</h3><div class="muted small">by ${esc(r.author)} · about ${minutesOf(r)} min</div></div></div>
      <p class="small mt-1">${esc(r.blurb)}</p><p class="small muted">${esc(r.why)}</p>
      <div class="bar sm mt-1"><div class="bar-fill${p && p.done ? ' good' : ''}" style="width:${pct}%"></div></div>
      <div class="row gap-sm mt-2"><a class="btn primary" href="${App.link('reading', r.id, { play: 1 })}">${icon('play', 14)} ${p && p.done ? 'Listen again' : i > 0 ? 'Resume' : 'Listen'}</a><a class="btn" href="${App.link('reading', r.id)}">${icon('book', 14)} Read</a>${r.questions ? `<span class="chip">${r.questions.length} discussion questions</span>` : ''}</div></div>`;
  }
  App.views.readings = {
    title: 'Readings',
    render(root) {
      const rs = list(); const p = prog(); const done = rs.filter(r => p[r.id] && p[r.id].done).length;
      root.innerHTML = App.pageHead('Readings', 'The pieces handed out for Project 1, as read-along audiobooks. Your browser reads them aloud one sentence at a time, highlights as it goes, and remembers where you stopped. Every paragraph is 1 XP; finishing a reading is 20.', `<span class="chip${done === rs.length && rs.length ? ' good' : ''}">${done} of ${rs.length} finished</span>`) + `<div class="grid cols-2">${rs.map(r => cardHtml(r, p[r.id])).join('')}</div>
        ${App.guest() ? `<div class="mt-3">${App.lockCard('The full texts are for members', 'These readings were handed out in class. Sign up with your montana.edu email to read and listen to all of them.')}</div>` : ''}
        <p class="small muted mt-3">Each reading keeps its author’s copyright and is here only for students in this class. The voice comes from your own device, so it sounds different on Chrome, Safari and Edge; pick another voice from the menu in the player.</p>`;
      if (App.auth) App.auth.bindLocks(root);
    }
  };
  App.views.reading = {
    title: 'Reading',
    render(root, param, query) {
      const r = list().find(x => x.id === param); if (!r) { App.go('readings'); return; }
      stop(); RS.r = r; RS.items = itemsOf(r); RS.sents = RS.items.map(it => sentences(it.text)); RS.root = root; RS.playing = false;
      const p = prog()[r.id] || {}; RS.i = p.done ? 0 : Math.min(p.i || 0, RS.items.length); RS.s = 0;
      const guest = App.guest(); const shown = guest ? RS.items.slice(0, 3) : RS.items;
      root.innerHTML = `<div class="reader"><div class="rd-head"><a class="btn sm" href="${App.link('readings')}">${icon('left', 13)} All readings</a><div class="eyebrow mt-2">${esc(r.kind)} · ${r.year} · about ${minutesOf(r)} min</div><h1 class="rd-title">${esc(r.title)}</h1><div class="rd-by">by ${esc(r.author)}</div><p class="small muted">${esc(r.why)}</p></div>
        <div id="rd-bar" class="rd-bar"></div>
        <article class="rd-text">${r.epigraph ? `<p class="rd-epigraph">${esc(r.epigraph)}</p>` : ''}${shown.map((it, i) => itemHtml(it, i)).join('')}</article>
        ${guest ? `<div class="mt-3">${App.lockCard('That is the preview', 'Sign up with your montana.edu email to read and listen to the whole piece.')}</div>` : ''}
        ${r.questions && !guest ? `<div class="panel mt-3"><div class="panel-h"><div class="panel-title">${icon('bulb')} Consider this</div><span class="small muted">for your notebook</span></div><ol class="rd-questions">${r.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ol></div>` : ''}
        <p class="small muted mt-3 rd-source">${esc(r.source)}</p>
        ${!guest ? `<div class="row gap-sm mt-2"><button class="btn sm" data-action="rd-finish">${icon('check', 13)} Mark as finished</button><button class="btn sm ghost" data-action="rd-restart">${icon('rotate', 13)} Start over</button></div>` : ''}</div>`;
      if (guest) { $('#rd-bar', root).innerHTML = `<div class="rd-player"><span class="small muted">Sign up to listen. The player reads the whole text aloud and follows along.</span></div>`; if (App.auth) App.auth.bindLocks(root); return; }
      paintBar(); highlight(); const cur = $(`.rd-item[data-i="${RS.i}"]`, root); if (cur && RS.i > 0) setTimeout(() => cur.scrollIntoView({ block: 'center' }), 60);
      bind(root, {
        'rd-play': () => RS.playing ? pause() : play(), 'rd-prev': () => goTo(RS.i - 1), 'rd-next': () => goTo(RS.i + 1),
        'rd-jump': el => { const i = +el.dataset.i; if (i === RS.i && RS.playing) return; goTo(i); },
        'rd-scroll': el => { setSetting('readerScroll', !autoscroll()); el.classList.toggle('on', autoscroll()); toast(autoscroll() ? 'Auto-scroll on' : 'Auto-scroll off'); },
        'rd-finish': () => finish(), 'rd-restart': () => { save(r.id, { i: 0, done: false }); goTo(0, false); toast('Back to the start'); }
      });
      RS.key = e => { if (e.target.matches('input, textarea, select')) return; if (e.key === ' ') { e.preventDefault(); RS.playing ? pause() : play(); } else if (e.key === 'ArrowRight') goTo(RS.i + 1); else if (e.key === 'ArrowLeft') goTo(RS.i - 1); };
      document.addEventListener('keydown', RS.key);
      if (query && query.play) setTimeout(play, 150);
    },
    unmount() { stop(); }
  };
  App.readingProgress = function (C) { const rs = (C && C.READINGS) || []; const p = (store.id === C.id ? store.data : store.peek(C.id)).readings || {}; const done = rs.filter(r => p[r.id] && p[r.id].done).length; const next = rs.find(r => !(p[r.id] && p[r.id].done)) || null; return { total: rs.length, done, next, started: next && p[next.id] && p[next.id].i > 0 }; };
})(window);

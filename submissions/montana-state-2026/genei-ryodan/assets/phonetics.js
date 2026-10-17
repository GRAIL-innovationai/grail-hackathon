/* ============================================================
   Mathub — English phonetics lab (WRIT 101)
   A native port of the English Phonetics Lab: practice trainer with
   seven modes (word→IPA, IPA→word, sentence→IPA, IPA→sentence,
   syllabification, stress, phoneme features), British and American
   accents, an IPA keyboard, a minimal pairs lab, a symbol trainer,
   reference charts, a text-to-IPA tool with weak forms and online
   lookup, and a word explorer. Speech comes from the browser's
   speech synthesis. Every graded answer earns XP and counts toward
   quests; stats and preferences live in the course store (key phon).
   Views: phonetics/<practice|pairs|symbols|charts|tool|explorer>.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; const P = global.PhonData; if (!App || !P) return;
  const { $, $$, esc, icon, bind, store, toast, settings, setSetting } = App;

  /* ---------- data preparation (ported from the lab) ---------- */
  const americanize = ipa => ipa.replaceAll('ɒ', 'ɑː').replaceAll('ə/', 'ɚ/').replaceAll('.ə/', '.ɚ/').replaceAll('eɪ.pə', 'eɪ.pɚ').replaceAll('tʃə', 'tʃɚ').replaceAll('ðə', 'ðɚ').replaceAll('tə', 'tɚ').replaceAll('də', 'dɚ');
  P.WORD_BANK.forEach(w => { if (!w.usIpa) w.usIpa = americanize(w.ipa); if (!w.syllableUk) w.syllableUk = w.ipa; if (!w.syllableUs) w.syllableUs = w.usIpa; });
  const LOOKUP = new Map();
  P.WORD_BANK.forEach(w => LOOKUP.set(w.word.toLowerCase(), w));
  P.EXTRA_WORDS.forEach(([word, ipa, usIpa]) => LOOKUP.set(word.toLowerCase(), { word, ipa, usIpa: usIpa || americanize(ipa) }));
  P.DICTIONARY.forEach(([word, ipa, usIpa]) => LOOKUP.set(word.toLowerCase(), { word, ipa, usIpa: usIpa || americanize(ipa) }));
  const ALL_SYMBOLS = Object.values(P.SYMBOL_LIBRARY).reduce((n, l) => n + l.length, 0);
  const cambridge = word => `https://dictionary.cambridge.org/pronunciation/english/${encodeURIComponent(word.toLowerCase().replace(/\s+/g, '-'))}`;
  const youglish = word => `https://youglish.com/pronounce/${encodeURIComponent(word)}/english`;

  const MODES = [['wordToIpa', 'Word → IPA'], ['ipaToWord', 'IPA → word'], ['sentenceToIpa', 'Sentence → IPA'], ['ipaToSentence', 'IPA → sentence'], ['syllabification', 'Syllables'], ['stress', 'Word stress'], ['phonemeDescription', 'Phoneme features']];
  const SECTIONS = [['practice', 'Practice', 'target'], ['pairs', 'Minimal pairs', 'swap'], ['symbols', 'Symbols', 'mic'], ['charts', 'Charts', 'grid'], ['tool', 'Transcribe', 'pen'], ['explorer', 'Word explorer', 'search']];
  const ACCENTS = [['uk', 'British (RP)'], ['us', 'American']];
  const LEVELS = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];
  const ipaFor = (item, accent, weak) => { if (weak && accent === 'uk' && item.weakUk) return item.weakUk; if (weak && accent === 'us' && item.weakUs) return item.weakUs; return accent === 'us' ? item.usIpa : item.ipa; };
  const sentenceIpa = (item, accent) => accent === 'us' ? item.usIpa : item.ipa;
  const stressBoundaries = ipa => ipa.replace(/([^\/\s.(])([ˈˌ])/g, '$1.$2');
  const syllabified = (item, accent) => stressBoundaries(accent === 'us' ? item.syllableUs || item.usIpa : item.syllableUk || item.ipa);
  const unsyllabified = (item, accent) => syllabified(item, accent).replace(/[.·]/g, '');
  const displaySyl = t => t.replace(/[\/[\]()]/g, '').replace(/·/g, '.').replace(/\s+/g, '').replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
  const normSyl = t => (/[-‐‑‒–—·]/.test(t) ? null : t.toLowerCase().trim().replace(/[\/[\]()]/g, '').replace(/[ˈˌ]/g, '').replace(/\s+/g, '').replace(/\.+/g, '.').replaceAll('ɡ', 'g').replaceAll('ɛ', 'e').replaceAll(':', 'ː'));
  const norm = t => t.toLowerCase().trim().replace(/[ˈˌ/[\]()]/g, '').replace(/[.·-]/g, ' ').replace(/\s+/g, ' ');
  const normIpa = t => norm(t).replaceAll('ɡ', 'g').replaceAll('ɛ', 'e').replaceAll(':', 'ː');
  const normTrans = t => t.toLowerCase().trim().replace(/[ˈˌ/[\]()]/g, '').replace(/[.,!?;:"“”‘’]/g, '').replace(/[·.-]/g, '').replace(/\s+/g, ' ').replaceAll('ɡ', 'g').replaceAll('ɛ', 'e').replaceAll(':', 'ː');
  const noSlash = t => normIpa(t).replace(/^\/|\/$/g, '');
  const normPlain = t => t.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
  const rnd = arr => arr[Math.floor(Math.random() * arr.length)];
  const pickNew = (arr, cur) => { if (arr.length < 2) return arr[0]; let x = rnd(arr); let n = 0; while (x === cur && n++ < 8) x = rnd(arr); return x; };
  function expected(item, mode, accent) {
    if (mode === 'wordToIpa') return [ipaFor(item, accent), ...(item.ipaAlt || [])];
    if (mode === 'ipaToWord') return [item.word];
    if (mode === 'sentenceToIpa') return [sentenceIpa(item, accent)];
    if (mode === 'ipaToSentence') return [item.text];
    if (mode === 'syllabification') return [syllabified(item, accent)];
    return [String(item.stress), item.syllables[item.stress - 1]];
  }
  function isCorrect(user, item, mode, accent) {
    const answers = expected(item, mode, accent);
    if (mode === 'wordToIpa' || mode === 'sentenceToIpa') return answers.some(a => normTrans(a) === normTrans(user));
    if (mode === 'ipaToSentence') return answers.some(a => normPlain(a) === normPlain(user));
    return answers.some(a => norm(a) === norm(user));
  }
  function wordType(item) {
    if (item.wordType || item.type) return item.wordType || item.type;
    const w = item.word.toLowerCase(); if (P.WORD_TYPES[w]) return P.WORD_TYPES[w];
    if (w.endsWith('ly')) return 'adverb'; if (/(tion|ness|ment|ity)$/.test(w)) return 'noun'; if (/(ful|ous|ive|al|able)$/.test(w)) return 'adjective'; if (/(ing|ed|ate|ise|ize)$/.test(w)) return 'verb'; return 'noun';
  }

  /* ---------- state ---------- */
  const A = { root: null, sec: 'practice', ipaTarget: null, symIndex: 0, toolText: '', toolTimer: 0, toolReq: 0, explorer: null, ipaCache: new Map() };
  const Q = { item: null, answered: false, step: 'ipa', session: { a: 0, c: 0 }, combo: 0, pair: null, pairDone: false, pairSession: { a: 0, c: 0 } };
  const DEFAULTS = { mode: 'wordToIpa', accent: 'uk', level: 'easy', phMode: 'symbolToDescription', phCat: 'consonants', pairAccent: 'uk', pairCat: 'vowel', pairLevel: 'easy', symCat: 'consonants', symAccent: 'uk', toolAccent: 'uk', toolView: 'stacked', weak: false, exAccent: 'uk' };
  const prefs = () => Object.assign({}, DEFAULTS, store.get('phon', {}));
  const setPref = patch => store.set('phon', Object.assign({}, store.get('phon', {}), patch));
  const stats = () => Object.assign({ a: 0, c: 0, best: 0, byMode: {}, pairs: { a: 0, c: 0 }, seen: {}, explored: 0 }, store.get('phon', {}).stats || {});
  const bump = fn => { const s = stats(); fn(s); setPref({ stats: s }); };
  const pct = (c, a) => a ? Math.round(100 * c / a) : 0;

  /* ---------- speech ---------- */
  let voices = [];
  const synth = () => global.speechSynthesis || null;
  function loadVoices() { const sy = synth(); if (!sy) return []; voices = (sy.getVoices() || []).filter(v => /^en/i.test(v.lang)); return voices; }
  if (synth()) { loadVoices(); if (typeof synth().addEventListener === 'function') synth().addEventListener('voiceschanged', () => { loadVoices(); $$('.ph-voice').forEach(sel => { sel.innerHTML = voiceOptions(sel.dataset.accent); }); }); }
  const langOf = accent => accent === 'us' ? 'en-us' : 'en-gb';
  function voicesFor(accent) {
    const lang = langOf(accent); const vs = voices.length ? voices : loadVoices();
    const rank = v => (String(v.lang).replace('_', '-').toLowerCase() === lang ? 0 : 3) + (/google|natural|neural|premium|enhanced|online/i.test(v.name) ? 0 : 1);
    return vs.slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }
  function pickVoice(accent) { const vs = voicesFor(accent); const want = settings()['phonVoice_' + accent]; return vs.find(v => v.name === want) || vs[0] || null; }
  const voiceOptions = accent => { const cur = pickVoice(accent); return voicesFor(accent).map(v => `<option value="${esc(v.name)}"${cur && v.name === cur.name ? ' selected' : ''}>${esc(v.name.replace(/^Microsoft |^Google /, '').replace(/\s*-\s*English.*$/, ''))} · ${esc(v.lang)}</option>`).join('') || '<option>System voice</option>'; };
  const rate = () => +(settings().phonRate || 0.85);
  const voiceBar = accent => `<div class="ph-voice-bar"><span class="small muted">${icon('mic', 12)} Voice</span><select class="select sm ph-voice" data-accent="${accent}" aria-label="Voice">${voiceOptions(accent)}</select><span class="small muted">Speed</span><input type="range" class="ph-rate" min="0.55" max="1.2" step="0.05" value="${rate()}" aria-label="Speech speed"><span class="mono small ph-rate-val">${rate()}x</span></div>`;
  function speak(text, accent) {
    const sy = synth(); if (!sy) { toast('This browser cannot speak. Try Chrome, Edge or Safari.'); return; }
    sy.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = rate(); u.pitch = 1; u.volume = 1; const v = pickVoice(accent); if (v) u.voice = v; u.lang = v ? v.lang : (accent === 'us' ? 'en-US' : 'en-GB'); sy.speak(u);
  }
  const stopSpeech = () => { const sy = synth(); if (sy) sy.cancel(); };
  const cueFor = symbol => P.SOUND_CUES[symbol] || P.SOUND_CUES['/' + symbol.replace(/\//g, '') + '/'] || null;

  /* ---------- shared pieces ---------- */
  const isCombining = k => k.length === 1 && k.charCodeAt(0) >= 0x300 && k.charCodeAt(0) <= 0x36f;
  const keyboardHtml = () => `<div class="ph-kbd" aria-label="IPA keyboard">${Object.entries(P.IPA_KEYS).map(([g, keys]) => `<div class="ph-kgroup"><span class="ph-klabel">${esc(g)}</span><div class="ph-keys">${keys.map(k => `<button type="button" class="ph-key${k === ' ' ? ' wide' : ''}" data-action="ph-key" data-k="${esc(k)}" tabindex="-1" title="${esc(cueFor('/' + k + '/') || k)}">${k === ' ' ? 'space' : isCombining(k) ? '◌' + esc(k) : esc(k)}</button>`).join('')}</div></div>`).join('')}</div>`;
  function insertKey(k) {
    const live = A.ipaTarget && document.contains(A.ipaTarget) && !A.ipaTarget.disabled ? A.ipaTarget : $('[data-ipa]:not([disabled])', A.root); if (!live) return;
    const s = live.selectionStart ?? live.value.length, e = live.selectionEnd ?? s; live.value = live.value.slice(0, s) + k + live.value.slice(e); live.focus(); live.selectionStart = live.selectionEnd = s + k.length; live.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const sel = (pref, opts, cur, label) => `<label class="field ph-field"><span>${label}</span><select class="select" data-pref="${pref}">${opts.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const scoreLine = (a, c) => a ? `${c} of ${a} correct · ${pct(c, a)}%` : 'No answers yet';
  function award(correct) {
    if (App.addXP) App.addXP(correct ? 5 : 1); if (App.markActivity) App.markActivity();
    if (App.quest) { App.quest('answers'); if (correct) App.quest('correct'); }
    if (App.sfx) App.sfx.play(correct ? 'correct' : 'wrong');
    if (correct) { Q.combo++; if (Q.combo % 5 === 0 && App.addXP) { App.addXP(5, { silent: true }); toast(`${icon('fire', 14)} ${Q.combo} in a row! +5 XP bonus`, 2600); } if (App.quest) App.quest('combo', Q.combo); } else Q.combo = 0;
  }
  const fbHtml = (ok, lines, extra = '') => `<div class="ph-fb ${ok ? 'ok' : 'no'}"><div class="ph-fb-head">${icon(ok ? 'check' : 'x', 16)} <b>${ok ? 'Correct.' : 'Not quite.'}</b></div>${lines.filter(Boolean).map(l => `<div class="ph-fb-line">${l}</div>`).join('')}${extra}</div>`;

  /* ---------- practice ---------- */
  function poolFor(p) {
    if (p.mode === 'sentenceToIpa' || p.mode === 'ipaToSentence') return P.SENTENCES.filter(s => s.level === p.level);
    if (p.mode === 'phonemeDescription') return p.phCat === 'vowels' ? P.PHONEME_VOWELS : P.PHONEME_CONSONANTS;
    return P.WORD_BANK.filter(w => w.level === p.level && !(p.mode === 'stress' && w.avoidStress));
  }
  function renderPractice(el) {
    const p = prefs(); const g = P.GUIDES[p.mode]; const s = stats();
    el.innerHTML = `<div class="ph-controls">${sel('mode', MODES, p.mode, 'Mode')}${sel('accent', ACCENTS, p.accent, 'Accent')}${p.mode === 'phonemeDescription' ? sel('phMode', [['symbolToDescription', 'Symbol → features'], ['descriptionToSymbol', 'Features → symbol']], p.phMode, 'Direction') + sel('phCat', [['consonants', 'Consonants'], ['vowels', 'Vowels']], p.phCat, 'Sounds') : sel('level', LEVELS, p.level, 'Level')}<div class="ph-ctl-actions"><button class="btn" data-action="ph-next">${icon('rotate', 14)} New question</button><button class="btn ghost sm" data-action="ph-reset">Reset session</button></div></div>
      <div class="ph-work"><aside class="panel ph-guide"><div class="eyebrow">How this mode works</div><h2 class="ph-h">${esc(g.title)}</h2><p class="small">${esc(g.text)}</p><div class="ph-example"><span class="eyebrow">Example</span><div class="ph-ipa">${esc(g.example)}</div></div>${p.mode === 'stress' ? '<p class="small muted mt-1">Here you tap the stressed syllable instead of typing its number.</p>' : ''}<div class="ph-score" id="ph-score"></div><p class="small muted mt-2">${icon('zap', 12)} 5 XP for a correct answer, 1 XP for a try, +5 for every 5 in a row.${s.a ? ` All time: ${scoreLine(s.a, s.c)}.` : ''}</p></aside><div class="panel ph-trainer" id="ph-trainer"></div></div>`;
    newQuestion();
  }
  function newQuestion() {
    const p = prefs(); const pool = poolFor(p); if (!pool.length) { $('#ph-trainer', A.root).innerHTML = '<p class="muted">Nothing to practise at this level yet.</p>'; return; }
    Q.item = pickNew(pool, Q.item); Q.answered = false; Q.step = 'ipa'; paintTrainer(); paintScore();
    const first = $('#ph-trainer [data-ipa], #ph-trainer input.input', A.root); if (first) setTimeout(() => first.focus(), 30);
  }
  function paintScore() { const el = $('#ph-score', A.root); if (!el) return; const s = stats(); el.innerHTML = `<div class="ph-score-row"><span><b>${Q.session.a}</b> this session</span><span class="${Q.session.a ? '' : 'muted'}">${scoreLine(Q.session.a, Q.session.c)}</span></div><div class="ph-score-row"><span>${icon('fire', 12)} ${Q.combo} in a row</span><span class="muted">best ${Math.max(s.best, Q.combo)}</span></div>`; }
  function promptText(p) {
    const it = Q.item; const m = p.mode;
    if (m === 'ipaToWord') return ipaFor(it, p.accent); if (m === 'sentenceToIpa') return it.text; if (m === 'ipaToSentence') return sentenceIpa(it, p.accent);
    if (m === 'phonemeDescription') return p.phMode === 'descriptionToSymbol' ? (p.phCat === 'vowels' ? `${it.height} ${it.backness} ${it.rounding.toLowerCase()} vowel` : `${it.voicing} ${it.place.toLowerCase()} ${it.manner.toLowerCase()}`) : it.symbol;
    return it.word;
  }
  function speakText(p) { const it = Q.item; if (!it) return ''; if (p.mode === 'sentenceToIpa' || p.mode === 'ipaToSentence') return it.text; if (p.mode === 'phonemeDescription') return cueFor(it.symbol) || it.symbol; return it.word; }
  function paintTrainer() {
    const p = prefs(); const it = Q.item; const m = p.mode; const el = $('#ph-trainer', A.root); if (!el || !it) return;
    const reveals = m === 'ipaToWord' || m === 'ipaToSentence' || (m === 'phonemeDescription' && p.phMode === 'descriptionToSymbol');
    const isIpa = m === 'wordToIpa' || m === 'sentenceToIpa' || (m === 'phonemeDescription' && p.phMode === 'descriptionToSymbol');
    let body = '';
    if (m === 'stress') body = `<div class="ph-label">Tap the syllable with the main stress</div><div class="ph-syls">${it.syllables.map((s, i) => `<button type="button" class="ph-syl" data-action="ph-stress" data-n="${i + 1}"><small>${i + 1}</small>${esc(s)}</button>`).join('')}</div><p class="small muted">The stressed syllable is usually louder, longer and clearer.</p>`;
    else if (m === 'syllabification') body = `<div class="ph-label">Step 1 · transcribe the word</div><input class="input lg mono" data-ipa id="ph-syl-ipa" placeholder="/ˈbjuːtɪfəl/" autocomplete="off" spellcheck="false"><div class="ph-label mt-2">Step 2 · syllabify the IPA <span class="muted">(unlocks after step 1)</span></div><input class="input lg mono" data-ipa id="ph-syl-split" placeholder="ˈbjuː.tɪ.fəl" autocomplete="off" spellcheck="false" disabled><div class="row gap-sm mt-2"><button class="btn primary" type="submit" id="ph-check">${icon('check', 14)} Check transcription</button></div>`;
    else if (m === 'phonemeDescription' && p.phMode === 'symbolToDescription') { const V = p.phCat === 'vowels'; const O = P.PHONEME_OPTIONS; const opt = (id, list) => `<select class="select" id="ph-${id}">${list.map(v => `<option>${esc(v)}</option>`).join('')}</select>`; body = `<div class="ph-label">Choose the features of ${esc(it.symbol)}</div><div class="ph-feats">${V ? `<label class="field"><span>Height</span>${opt('f1', O.height)}</label><label class="field"><span>Backness</span>${opt('f2', O.backness)}</label><label class="field"><span>Rounding</span>${opt('f3', O.rounding)}</label>` : `<label class="field"><span>Place</span>${opt('f1', O.place)}</label><label class="field"><span>Manner</span>${opt('f2', O.manner)}</label><label class="field"><span>Voicing</span>${opt('f3', O.voicing)}</label>`}</div><p class="small muted">${V ? 'Vowels are described by height, backness and lip rounding.' : 'Consonants are described by place, manner and voicing.'}</p><div class="row gap-sm mt-2"><button class="btn primary" type="submit" id="ph-check">${icon('check', 14)} Check</button></div>`; }
    else {
      const cfg = { wordToIpa: ['Type the IPA transcription', '/ʃɜːt/', 'Slashes are optional. Use the keyboard below for symbols.'], ipaToWord: ['Type the English word', 'phonetics', 'Look for the stress mark and the vowel sounds.'], sentenceToIpa: ['Type the IPA sentence', '/aɪ ˈlʌv juː/', 'Put a space between IPA words.'], ipaToSentence: ['Type the English sentence', 'I love you.', 'Capital letters and punctuation are optional.'], phonemeDescription: ['Type the IPA symbol', '/p/', 'Slashes are optional.'] }[m];
      body = `<div class="ph-label">${cfg[0]}</div><input class="input lg${isIpa ? ' mono' : ''}" id="ph-answer"${isIpa ? ' data-ipa' : ''} placeholder="${esc(cfg[1])}" autocomplete="off" autocapitalize="off" spellcheck="false"><p class="small muted">${cfg[2]}</p><div class="row gap-sm mt-2"><button class="btn primary" type="submit" id="ph-check">${icon('check', 14)} Check</button></div>`;
    }
    el.innerHTML = `<div class="ph-prompt-wrap"><div class="eyebrow">${esc(P.GUIDES[m].title)} · ${p.accent === 'us' ? 'American' : 'British RP'}${m !== 'phonemeDescription' ? ' · ' + esc(p.level) : ''}</div><div class="ph-prompt${(m === 'sentenceToIpa' || m === 'ipaToSentence') ? ' long' : ''}${isIpa || m === 'ipaToWord' || m === 'ipaToSentence' ? '' : ''}">${esc(promptText(p))}</div><div class="row gap-sm"><button type="button" class="btn sm" data-action="ph-say">${icon('play', 13)} ${reveals ? 'Hear it (reveals the answer)' : 'Listen'}</button></div></div>
      <form class="ph-form" id="ph-form">${body}</form>${isIpa || m === 'syllabification' ? keyboardHtml() : ''}<div id="ph-fb"></div>${voiceBar(p.accent)}`;
  }
  function checkPractice() {
    const p = prefs(); const it = Q.item; const m = p.mode; if (!it) return; if (Q.answered) { newQuestion(); return; }
    if (m === 'syllabification') {
      const ipaIn = $('#ph-syl-ipa', A.root), splitIn = $('#ph-syl-split', A.root); const correctIpa = unsyllabified(it, p.accent); const correctSyl = syllabified(it, p.accent);
      if (Q.step === 'ipa') {
        if (normIpa(ipaIn.value) !== normIpa(correctIpa)) { $('#ph-fb', A.root).innerHTML = fbHtml(false, ['Check your transcription before syllabifying.', `Expected IPA: <span class="ph-ipa">${esc(correctIpa)}</span>`]); if (App.sfx) App.sfx.play('wrong'); ipaIn.classList.add('shake'); setTimeout(() => ipaIn.classList.remove('shake'), 400); return; }
        Q.step = 'syl'; splitIn.disabled = false; ipaIn.disabled = true; $('#ph-check', A.root).innerHTML = `${icon('check', 14)} Check syllables`; $('#ph-fb', A.root).innerHTML = fbHtml(true, ['Correct transcription. Now mark the syllable boundaries with dots.']); A.ipaTarget = splitIn; splitIn.focus(); return;
      }
      const ok = normSyl(splitIn.value) === normSyl(correctSyl); finish(ok, [`Your answer: ${esc(splitIn.value || '(blank)')}`, `IPA: <span class="ph-ipa">${esc(displaySyl(correctIpa))}</span> · syllabified: <span class="ph-ipa">${esc(displaySyl(correctSyl))}</span>`, `Syllables: ${esc(it.syllables.join(' · '))}`]); return;
    }
    if (m === 'phonemeDescription') {
      if (p.phMode === 'descriptionToSymbol') { const v = $('#ph-answer', A.root).value; const ok = normIpa(v) === normIpa(it.symbol); finish(ok, [`Your answer: ${esc(v || '(blank)')}`, `Correct symbol: <span class="ph-ipa">${esc(it.symbol)}</span>`, cueFor(it.symbol) ? `Sounds like: ${esc(cueFor(it.symbol))}` : '']); return; }
      const f = ['f1', 'f2', 'f3'].map(id => $('#ph-' + id, A.root).value); const V = p.phCat === 'vowels'; const want = V ? [it.height, it.backness, it.rounding] : [it.place, it.manner, it.voicing];
      const ok = f.every((x, i) => x === want[i]); finish(ok, [`Your answer: ${esc(f.join(', '))}`, `Correct: ${esc(want.join(', '))}`]); return;
    }
    const user = $('#ph-answer', A.root).value; const ok = isCorrect(user, it, m, p.accent); const exp = expected(it, m, p.accent)[0];
    const detail = `${p.accent === 'uk' ? 'British RP' : 'American'} IPA: <span class="ph-ipa">${esc(m === 'sentenceToIpa' || m === 'ipaToSentence' ? sentenceIpa(it, p.accent) : ipaFor(it, p.accent))}</span>`;
    finish(ok, [`Your answer: ${esc(user || '(blank)')}`, `Expected: <span class="ph-ipa">${esc(exp)}</span>`, detail]);
  }
  function stressPick(n) { const it = Q.item; if (!it || Q.answered) return; const ok = n === it.stress; $$('.ph-syl', A.root).forEach(b => { b.disabled = true; if (+b.dataset.n === it.stress) b.classList.add('correct'); else if (+b.dataset.n === n) b.classList.add('wrong'); }); finish(ok, [`Main stress: syllable ${it.stress} (${esc(it.syllables[it.stress - 1])})`, `IPA: <span class="ph-ipa">${esc(ipaFor(it, prefs().accent))}</span>`]); }
  function finish(ok, lines) {
    const p = prefs(); const it = Q.item; Q.answered = true; Q.session.a++; if (ok) Q.session.c++;
    award(ok); bump(s => { s.a++; if (ok) s.c++; s.best = Math.max(s.best, Q.combo); const bm = s.byMode[p.mode] = s.byMode[p.mode] || { a: 0, c: 0 }; bm.a++; if (ok) bm.c++; });
    $$('#ph-form input, #ph-form select, #ph-form button', A.root).forEach(x => { x.disabled = true; });
    const link = it.source ? `<a class="small" href="${esc(it.source)}" target="_blank" rel="noopener noreferrer">Check on Cambridge Dictionary ${icon('external', 11)}</a>` : (it.word ? `<a class="small" href="${cambridge(it.word)}" target="_blank" rel="noopener noreferrer">Check on Cambridge Dictionary ${icon('external', 11)}</a>` : '');
    $('#ph-fb', A.root).innerHTML = fbHtml(ok, lines, `<div class="row gap-sm mt-2 between"><span>${link}</span><button class="btn primary" data-action="ph-next" id="ph-continue">Continue ${icon('right', 14)}</button></div>`);
    paintScore(); const c = $('#ph-continue', A.root); if (c) c.focus();
  }

  /* ---------- minimal pairs ---------- */
  const pairIpa = (pair, n, accent) => pair[`${accent === 'us' ? 'us' : 'uk'}Ipa${n}`];
  function renderPairs(el) {
    const p = prefs(); const s = stats();
    el.innerHTML = `<div class="ph-controls">${sel('pairAccent', ACCENTS, p.pairAccent, 'Accent')}${sel('pairCat', [['vowel', 'Vowel pairs'], ['consonant', 'Consonant pairs']], p.pairCat, 'Sound category')}${sel('pairLevel', LEVELS, p.pairLevel, 'Level')}<div class="ph-ctl-actions"><button class="btn" data-action="ph-pair-next">${icon('rotate', 14)} Next pair</button></div></div>
      <div class="ph-work"><aside class="panel ph-guide"><div class="eyebrow">Minimal pairs lab</div><h2 class="ph-h">One sound apart</h2><p class="small">A minimal pair is two words that differ by only one sound. Listen to both, transcribe each into IPA, then check to see exactly which sound changes.</p><ol class="small ph-steps"><li>Listen to the two words.</li><li>Type the IPA for each one (keyboard below).</li><li>Check, then read the sound difference.</li></ol><div class="ph-score" id="ph-pair-score"></div><p class="small muted mt-2">${icon('zap', 12)} 5 XP when both words are right, 1 XP for a try.${s.pairs.a ? ` All time: ${scoreLine(s.pairs.a, s.pairs.c)}.` : ''}</p></aside><div class="panel ph-trainer" id="ph-pair"></div></div>`;
    newPair();
  }
  function newPair() {
    const p = prefs(); const pool = P.MINIMAL_PAIRS.filter(x => x.category === p.pairCat && x.level === p.pairLevel); const el = $('#ph-pair', A.root); if (!el) return;
    if (!pool.length) { el.innerHTML = '<p class="muted">No pairs at this level yet.</p>'; return; }
    Q.pair = pickNew(pool, Q.pair); Q.pairDone = false; const pr = Q.pair;
    el.innerHTML = `<div class="eyebrow">${p.pairCat === 'vowel' ? 'Vowel' : 'Consonant'} pair · ${p.pairAccent === 'us' ? 'American' : 'British RP'} · ${esc(p.pairLevel)}</div><form class="ph-form" id="ph-pair-form"><div class="ph-pair-grid">${[1, 2].map(n => `<div class="ph-pair-word"><div class="ph-prompt">${esc(pr['word' + n])}</div><button type="button" class="btn sm" data-action="ph-pair-say" data-n="${n}">${icon('play', 13)} Listen</button><input class="input lg mono" data-ipa id="ph-pair-${n}" placeholder="/…/" aria-label="${esc(pr['word' + n])} IPA" autocomplete="off" spellcheck="false"></div>`).join('')}</div><div class="row gap-sm mt-2"><button class="btn primary" type="submit" id="ph-pair-check">${icon('check', 14)} Check both</button></div></form>${keyboardHtml()}<div id="ph-pair-fb"></div>${voiceBar(p.pairAccent)}`;
    paintPairScore(); setTimeout(() => { const i = $('#ph-pair-1', A.root); if (i) i.focus(); }, 30);
  }
  function paintPairScore() { const el = $('#ph-pair-score', A.root); if (!el) return; el.innerHTML = `<div class="ph-score-row"><span><b>${Q.pairSession.a}</b> pair${Q.pairSession.a === 1 ? '' : 's'} this session</span><span class="${Q.pairSession.a ? '' : 'muted'}">${scoreLine(Q.pairSession.a, Q.pairSession.c)}</span></div>`; }
  function checkPair() {
    const p = prefs(); const pr = Q.pair; if (!pr) return; if (Q.pairDone) { newPair(); return; }
    const v1 = $('#ph-pair-1', A.root).value, v2 = $('#ph-pair-2', A.root).value; const ipa1 = pairIpa(pr, 1, p.pairAccent), ipa2 = pairIpa(pr, 2, p.pairAccent);
    const ok1 = noSlash(v1) === noSlash(ipa1), ok2 = noSlash(v2) === noSlash(ipa2); const ok = ok1 && ok2;
    Q.pairDone = true; Q.pairSession.a++; if (ok) Q.pairSession.c++; award(ok); bump(s => { s.pairs.a++; if (ok) s.pairs.c++; });
    $$('#ph-pair-form input, #ph-pair-form button[type=submit]', A.root).forEach(x => { x.disabled = true; });
    $('#ph-pair-fb', A.root).innerHTML = fbHtml(ok, [`${esc(pr.word1)}: ${ok1 ? 'correct' : 'not quite'} · <span class="ph-ipa">${esc(ipa1)}</span>`, `${esc(pr.word2)}: ${ok2 ? 'correct' : 'not quite'} · <span class="ph-ipa">${esc(ipa2)}</span>`, `<b>Sound difference:</b> ${esc(pr.difference)}`], `<div class="row gap-sm mt-2 between"><span class="row gap-sm"><button type="button" class="btn sm" data-action="ph-pair-say" data-n="1">${icon('play', 12)} ${esc(pr.word1)}</button><button type="button" class="btn sm" data-action="ph-pair-say" data-n="2">${icon('play', 12)} ${esc(pr.word2)}</button></span><button class="btn primary" data-action="ph-pair-next" id="ph-pair-continue">Next pair ${icon('right', 14)}</button></div>`);
    paintPairScore(); const c = $('#ph-pair-continue', A.root); if (c) c.focus();
  }

  /* ---------- symbols ---------- */
  const SYM_CATS = [['consonants', 'Consonants'], ['monophthongs', 'Monophthongs'], ['diphthongs', 'Diphthongs'], ['stress', 'Stress and length marks']];
  function renderSymbols(el) {
    const p = prefs(); const list = P.SYMBOL_LIBRARY[p.symCat] || P.SYMBOL_LIBRARY.consonants; if (A.symIndex >= list.length) A.symIndex = 0; if (A.symIndex < 0) A.symIndex = list.length - 1;
    const it = list[A.symIndex]; bump(s => { s.seen[it.symbol] = 1; }); const s = stats(); const seenN = Object.keys(s.seen).length;
    el.innerHTML = `<div class="ph-controls">${sel('symCat', SYM_CATS, p.symCat, 'Symbol group')}${sel('symAccent', ACCENTS, p.symAccent, 'Accent')}<div class="ph-ctl-actions"><span class="chip accent">${icon('eye', 12)} ${seenN} of ${ALL_SYMBOLS} symbols explored</span></div></div>
      <div class="ph-work"><div class="panel ph-symcard"><div class="eyebrow">${esc(SYM_CATS.find(c => c[0] === p.symCat)[1])} · ${A.symIndex + 1} of ${list.length}</div><div class="ph-bigsym">${esc(it.symbol)}</div><h2 class="ph-h">${esc(it.name)}</h2><p>${esc(it.description)}</p><div class="ph-example"><span class="eyebrow">Example</span><div class="ph-ipa"><b>${esc(it.word)}</b> · ${esc(it.ipa)}</div></div><div class="row gap-sm mt-2"><button class="btn primary sm" data-action="ph-sym-say">${icon('play', 13)} Play the sound</button><button class="btn sm" data-action="ph-sym-word">${icon('play', 13)} Play ${esc(it.word)}</button></div>${voiceBar(p.symAccent)}<div class="row between mt-2"><button class="btn sm" data-action="ph-sym-prev">${icon('left', 13)} Previous</button><button class="btn sm" data-action="ph-sym-next">Next ${icon('right', 13)}</button></div></div>
      <div class="panel"><div class="panel-h"><div class="panel-title">${icon('grid')} All ${esc(SYM_CATS.find(c => c[0] === p.symCat)[1].toLowerCase())}</div><span class="small muted">tap one to open it</span></div><div class="ph-symgrid">${list.map((x, j) => `<button class="ph-symbtn${j === A.symIndex ? ' on' : ''}${s.seen[x.symbol] ? ' seen' : ''}" data-action="ph-sym-go" data-i="${j}"><span>${esc(x.symbol)}</span><small>${esc(x.word)}</small></button>`).join('')}</div><p class="small muted mt-2">Symbols you have opened are ticked. Open all ${ALL_SYMBOLS} to finish the symbol tour.</p></div></div>`;
  }

  /* ---------- charts ---------- */
  const symBtn = (sym, accent, label) => `<button type="button" class="ph-sym" data-action="ph-say-sym" data-s="${esc(sym)}" data-accent="${accent}" title="Hear ${esc(sym)}">${label === undefined ? esc(sym) : label}</button>`;
  function renderCharts(el) {
    const C = P.CHARTS; const acc = prefs().symAccent; const syms = cell => cell.split(' ').filter(Boolean).map(x => symBtn(x, acc)).join(' ');
    const table = (rows, head) => `<div class="table-wrap"><table class="ph-table">${head ? `<thead><tr><th></th>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>` : ''}<tbody>${rows.map(r => `<tr><th>${esc(r[0])}</th>${r.slice(1).map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    el.innerHTML = `<p class="small muted">Every symbol is a button: tap it to hear the sound with the accent chosen under Symbols (${acc === 'us' ? 'American' : 'British'}).</p><div class="ph-charts">
      <div class="panel span-2"><div class="panel-h"><div class="panel-title">${icon('grid')} English consonant chart</div><span class="small muted">place across, manner down</span></div>${table(C.consonants.rows.map(r => [r[0], ...r.slice(1).map(syms)]), C.consonants.cols)}</div>
      <div class="panel"><div class="panel-h"><div class="panel-title">Vowel positions</div></div>${table(C.vowelPositions.map(r => [r[0], syms(r[1])]))}</div>
      <div class="panel"><div class="panel-h"><div class="panel-title">Vowel description</div></div>${table(C.vowelFeatures.map(r => [r[0], esc(r[1])]))}</div>
      <div class="panel"><div class="panel-h"><div class="panel-title">Monophthongs</div><span class="small muted">tap to hear the word</span></div><div class="ph-symgrid tight">${C.monophthongs.map(([s, w]) => `<button class="ph-symbtn" data-action="ph-say-word" data-w="${esc(w)}" data-accent="${acc}"><span>${esc(s)}</span><small>${esc(w)}</small></button>`).join('')}</div></div>
      <div class="panel"><div class="panel-h"><div class="panel-title">Diphthongs</div><span class="small muted">tap to hear the word</span></div><div class="ph-symgrid tight">${C.diphthongs.map(([s, w]) => `<button class="ph-symbtn" data-action="ph-say-word" data-w="${esc(w)}" data-accent="${acc}"><span>${esc(s)}</span><small>${esc(w)}</small></button>`).join('')}</div></div>
      <div class="panel"><div class="panel-h"><div class="panel-title">Place of articulation</div></div>${table(C.place.map(r => [r[0], esc(r[1])]))}</div>
      <div class="panel"><div class="panel-h"><div class="panel-title">Manner of articulation</div></div>${table(C.manner.map(r => [r[0], esc(r[1])]))}</div>
      <div class="panel"><div class="panel-h"><div class="panel-title">Voicing</div></div>${table(C.voicing.map(r => [r[0], syms(r[1])]))}</div></div>`;
  }

  /* ---------- transcription tool ---------- */
  const tokenize = text => text.match(/[A-Za-z']+|[.,!?;:]/g) || [];
  const isPunct = t => /^[.,!?;:]$/.test(t);
  async function onlineIpa(word, accent) {
    const key = `${accent}:${word.toLowerCase()}`; if (A.ipaCache.has(key)) return A.ipaCache.get(key);
    try {
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`); if (!r.ok) throw new Error('none');
      const entries = await r.json(); const ph = entries.flatMap(e => e.phonetics || []);
      const pref = ph.find(x => accent === 'uk' ? /-uk\.mp3|uk/i.test(x.audio || '') : /-us\.mp3|us/i.test(x.audio || '')); const withText = (pref && pref.text) ? pref : ph.find(x => x.text); const ipa = (withText && withText.text) || null;
      A.ipaCache.set(key, ipa); return ipa;
    } catch { A.ipaCache.set(key, null); return null; }
  }
  async function transcribeLine(line, accent, weak) {
    const pieces = []; let unknown = 0;
    for (const tok of tokenize(line)) { if (isPunct(tok)) { pieces.push({ tok, ipa: tok }); continue; } const e = LOOKUP.get(tok.toLowerCase()); const ipa = e ? ipaFor(e, accent, weak) : await onlineIpa(tok, accent); if (!ipa) unknown++; pieces.push({ tok, ipa }); }
    return { pieces, unknown };
  }
  const joinPieces = pieces => pieces.map(p => p.ipa || `[${p.tok}]`).join(' ').replace(/\s+([.,!?;:])/g, '$1');
  function renderTool(el) {
    const p = prefs();
    el.innerHTML = `<div class="ph-work tool"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('pen')} Text to IPA</div><div class="ph-seg">${ACCENTS.map(([v, l]) => `<button type="button" class="${p.toolAccent === v ? 'on' : ''}" data-action="ph-tool-accent" data-a="${v}">${l.replace(' (RP)', '')}</button>`).join('')}</div></div>
        <textarea class="input" id="ph-text" rows="5" placeholder="Type or paste English text. Each line is transcribed on its own." spellcheck="false">${esc(A.toolText)}</textarea>
        <div class="row gap-sm mt-2"><label class="check small" style="padding:0"><input type="checkbox" id="ph-weak"${p.weak ? ' checked' : ''}> Weak forms (the, to, have, and…)</label><select class="select sm" id="ph-view" aria-label="Layout">${[['stacked', 'English above IPA'], ['line', 'Side by side'], ['ipa', 'IPA only']].map(([v, l]) => `<option value="${v}"${p.toolView === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="row gap-sm mt-2"><button class="btn sm primary" data-action="ph-listen">${icon('play', 13)} Listen</button><button class="btn sm" data-action="ph-stop">${icon('pause', 13)} Stop</button><button class="btn sm" data-action="ph-copy">${icon('file', 13)} Copy IPA</button><button class="btn sm" data-action="ph-edit">${icon('pen', 13)} Edit IPA</button><button class="btn sm ghost" data-action="ph-clear">Clear</button><button class="btn sm ghost" data-action="ph-youglish">${icon('external', 13)} YouGlish</button></div>
        <textarea class="input mono mt-2" id="ph-ipa-edit" rows="3" hidden aria-label="Editable IPA"></textarea>${voiceBar(p.toolAccent)}
        <p class="small muted mt-2">Words are looked up in the lab dictionary (about ${LOOKUP.size} entries); anything missing is fetched from the free Dictionary API when you are online. Unknown words stay in [brackets].</p></div>
      <div class="panel"><div class="panel-h"><div class="panel-title">${icon('list')} Transcription</div></div><div class="small muted" id="ph-notice"></div><div class="ph-out" id="ph-out"></div></div></div>`;
    renderTranscription();
  }
  async function renderTranscription() {
    const p = prefs(); const out = $('#ph-out', A.root); const notice = $('#ph-notice', A.root); if (!out) return; const req = ++A.toolReq;
    const text = A.toolText.trim(); const lines = text ? text.split(/\n+/) : []; if (!lines.length) { out.innerHTML = '<p class="muted">Type English text to begin.</p>'; notice.textContent = ''; return; }
    notice.textContent = 'Transcribing…'; let unknown = 0; const ipaLines = []; const rows = [];
    for (const line of lines) { const r = await transcribeLine(line, p.toolAccent, p.weak); if (req !== A.toolReq) return; unknown += r.unknown; ipaLines.push(joinPieces(r.pieces)); rows.push(r); }
    out.innerHTML = rows.map((r, i) => `<div class="ph-row ${p.toolView}">${p.toolView !== 'ipa' ? `<div class="ph-en">${esc(lines[i])}</div>` : ''}<div class="ph-ipa-line">${r.pieces.map(x => x.ipa ? `<span>${esc(x.ipa)}</span>` : `<span class="unknown" title="Not in the dictionary">${esc(x.tok)}</span>`).join(' ')}</div></div>`).join('');
    A.lastIpa = ipaLines.join('\n'); const ed = $('#ph-ipa-edit', A.root); if (ed) ed.value = A.lastIpa;
    notice.textContent = unknown ? `${unknown} word${unknown === 1 ? '' : 's'} could not be found.` : `${p.toolAccent === 'uk' ? 'British' : 'American'} transcription${p.weak ? ' with weak forms' : ''}.`;
  }

  /* ---------- word explorer ---------- */
  function renderExplorer(el) {
    const p = prefs(); if (!A.explorer) A.explorer = rnd(P.WORD_BANK);
    el.innerHTML = `<div class="ph-controls">${sel('exAccent', ACCENTS, p.exAccent, 'Accent')}<label class="field ph-field grow"><span>Look up a word</span><div class="row gap-sm nowrap"><input class="input" id="ph-find" placeholder="e.g. knowledge" autocomplete="off" spellcheck="false"><button class="btn" data-action="ph-find">${icon('search', 14)} Find</button></div></label><div class="ph-ctl-actions"><button class="btn" data-action="ph-ex-random">${icon('rotate', 14)} Random word</button></div></div><div id="ph-suggest" class="row gap-sm"></div><div id="ph-explorer"></div>`;
    paintExplorer();
  }
  function paintExplorer() {
    const p = prefs(); const it = A.explorer; const el = $('#ph-explorer', A.root); if (!el || !it) return; const full = !!it.syllables;
    el.innerHTML = `<div class="ph-work"><div class="panel ph-symcard"><div class="eyebrow">${full ? 'From the word bank' : 'From the dictionary'} · ${p.exAccent === 'us' ? 'American' : 'British RP'}</div><div class="ph-bigword">${esc(it.word)}</div><div class="ph-ipa big">${esc(ipaFor(it, p.exAccent))}</div><div class="small muted">${p.exAccent === 'us' ? 'British' : 'American'}: <span class="ph-ipa">${esc(ipaFor(it, p.exAccent === 'us' ? 'uk' : 'us'))}</span>${it.weakUk ? ` · weak form: <span class="ph-ipa">${esc(ipaFor(it, p.exAccent, true))}</span>` : ''}</div>
        ${full ? `<div class="ph-exgrid mt-2"><div><span class="eyebrow">Syllables</span><div class="ph-syls small">${it.syllables.map((s, i) => `<span class="ph-syl static${i + 1 === it.stress ? ' stressed' : ''}">${esc(s)}</span>`).join('')}</div></div><div><span class="eyebrow">Main stress</span><div>syllable ${it.stress} · <b>${esc(it.syllables[it.stress - 1])}</b></div></div><div><span class="eyebrow">Word type</span><div>${esc(wordType(it))}</div></div><div><span class="eyebrow">Level</span><div>${esc(it.level)}</div></div></div>` : `<p class="small muted mt-2">Word type: ${esc(wordType(it))}</p>`}
        <div class="row gap-sm mt-2"><button class="btn primary sm" data-action="ph-ex-say">${icon('play', 13)} Listen</button><a class="btn sm" href="${cambridge(it.word)}" target="_blank" rel="noopener noreferrer">${icon('external', 13)} Cambridge</a><a class="btn sm" href="${youglish(it.word)}" target="_blank" rel="noopener noreferrer">${icon('external', 13)} YouGlish</a><a class="btn sm ghost" href="${App.link('phonetics', 'practice')}">${icon('target', 13)} Practise words like this</a></div>${voiceBar(p.exAccent)}</div>
      <div class="panel"><div class="panel-h"><div class="panel-title">${icon('bulb')} Reading a transcription</div></div><ul class="small ph-tips"><li><b>ˈ</b> goes before the syllable with the main stress; <b>ˌ</b> marks secondary stress.</li><li><b>ː</b> makes a vowel long: /iː/ in <i>sleep</i> against /ɪ/ in <i>slip</i>.</li><li>A dot <b>.</b> separates syllables when it helps.</li><li>American transcriptions often write <b>ɚ</b> for an r-coloured schwa and <b>ɑː</b> where British has <b>ɒ</b>.</li></ul><p class="small muted mt-1">${LOOKUP.size} words are in the lab dictionary. Look one up above or open a random one.</p></div></div>`;
  }
  function findWord(q) {
    q = (q || '').trim().toLowerCase(); const box = $('#ph-suggest', A.root); if (!q) { box.innerHTML = ''; return; }
    const exact = LOOKUP.get(q); if (exact) { A.explorer = exact; bump(s => { s.explored++; }); box.innerHTML = ''; paintExplorer(); return; }
    const hits = [...LOOKUP.keys()].filter(w => w.startsWith(q)).slice(0, 10);
    box.innerHTML = hits.length ? `<span class="small muted">Did you mean</span>${hits.map(w => `<button class="chip toggle" data-action="ph-ex-pick" data-w="${esc(w)}">${esc(w)}</button>`).join('')}` : `<span class="small muted">“${esc(q)}” is not in the lab dictionary. Try the Transcribe tab, which also looks words up online.</span>`;
  }

  /* ---------- view ---------- */
  const RENDER = { practice: renderPractice, pairs: renderPairs, symbols: renderSymbols, charts: renderCharts, tool: renderTool, explorer: renderExplorer };
  App.views.phonetics = {
    title: 'Phonetics lab',
    render(root, param) {
      const sec = RENDER[param] ? param : 'practice'; A.root = root; A.sec = sec; const s = stats();
      root.innerHTML = App.pageHead('English Phonetics Lab', 'Transcribe with the International Phonetic Alphabet, hear every sound, tell minimal pairs apart, mark syllables and stress, and describe phonemes by their features. Every graded answer earns XP.', s.a ? `<span class="chip accent">${icon('target', 12)} ${s.a} answered · ${pct(s.c, s.a)}%</span>` : '') + `<nav class="ph-nav" aria-label="Lab sections">${SECTIONS.map(([k, l, ic]) => `<a class="ph-navlink${k === sec ? ' on' : ''}" href="${App.link('phonetics', k)}">${icon(ic, 14)}<span>${l}</span></a>`).join('')}</nav><div id="ph-body" class="ph-body"></div>`;
      RENDER[sec]($('#ph-body', root));
      bind(root, {
        'ph-key': b => insertKey(b.dataset.k), 'ph-next': () => newQuestion(), 'ph-reset': () => { Q.session = { a: 0, c: 0 }; Q.combo = 0; newQuestion(); toast('Session score reset'); },
        'ph-say': () => speak(speakText(prefs()), prefs().accent), 'ph-stress': b => stressPick(+b.dataset.n),
        'ph-pair-next': () => newPair(), 'ph-pair-say': b => { if (Q.pair) speak(Q.pair['word' + b.dataset.n], prefs().pairAccent); },
        'ph-sym-prev': () => { A.symIndex--; renderSymbols($('#ph-body', root)); }, 'ph-sym-next': () => { A.symIndex++; renderSymbols($('#ph-body', root)); }, 'ph-sym-go': b => { A.symIndex = +b.dataset.i; renderSymbols($('#ph-body', root)); },
        'ph-sym-say': () => { const it = (P.SYMBOL_LIBRARY[prefs().symCat] || [])[A.symIndex]; if (it) speak(cueFor(it.symbol) || it.word, prefs().symAccent); }, 'ph-sym-word': () => { const it = (P.SYMBOL_LIBRARY[prefs().symCat] || [])[A.symIndex]; if (it) speak(it.word, prefs().symAccent); },
        'ph-say-sym': b => speak(cueFor('/' + b.dataset.s + '/') || b.dataset.s, b.dataset.accent || 'uk'), 'ph-say-word': b => speak(b.dataset.w, b.dataset.accent || 'uk'),
        'ph-tool-accent': b => { setPref({ toolAccent: b.dataset.a }); renderTool($('#ph-body', root)); }, 'ph-listen': () => speak(A.toolText.trim() || 'Type English text first.', prefs().toolAccent), 'ph-stop': () => stopSpeech(),
        'ph-copy': async () => { try { await navigator.clipboard.writeText(A.lastIpa || ''); toast('IPA copied'); } catch { toast('Copy failed. Use Edit IPA and copy from there.'); } },
        'ph-edit': () => { const ed = $('#ph-ipa-edit', root); ed.hidden = !ed.hidden; if (!ed.hidden) ed.focus(); }, 'ph-clear': () => { A.toolText = ''; $('#ph-text', root).value = ''; renderTranscription(); },
        'ph-youglish': () => { const w = tokenize(A.toolText).find(t => /[A-Za-z]/.test(t)) || 'phonetics'; window.open(youglish(w), '_blank', 'noopener,noreferrer'); },
        'ph-ex-random': () => { A.explorer = pickNew(P.WORD_BANK, A.explorer); bump(s => { s.explored++; }); $('#ph-suggest', root).innerHTML = ''; paintExplorer(); }, 'ph-ex-say': () => { if (A.explorer) speak(A.explorer.word, prefs().exAccent); },
        'ph-find': () => findWord($('#ph-find', root).value), 'ph-ex-pick': b => { $('#ph-find', root).value = b.dataset.w; findWord(b.dataset.w); }
      });
      root.addEventListener('focusin', e => { if (e.target.matches && e.target.matches('[data-ipa]')) A.ipaTarget = e.target; });
      root.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'ph-form') checkPractice(); else if (e.target.id === 'ph-pair-form') checkPair(); });
      root.addEventListener('change', e => {
        const t = e.target; if (t.dataset && t.dataset.pref) { setPref({ [t.dataset.pref]: t.value }); if (t.dataset.pref === 'symCat') A.symIndex = 0; if (t.dataset.pref === 'mode' || t.dataset.pref === 'level' || t.dataset.pref === 'accent' || t.dataset.pref === 'phMode' || t.dataset.pref === 'phCat') { Q.combo = 0; } RENDER[A.sec]($('#ph-body', root)); return; }
        if (t.classList.contains('ph-voice')) { setSetting('phonVoice_' + t.dataset.accent, t.value); return; }
        if (t.id === 'ph-weak') { setPref({ weak: t.checked }); renderTranscription(); } else if (t.id === 'ph-view') { setPref({ toolView: t.value }); renderTranscription(); }
      });
      root.addEventListener('input', e => {
        const t = e.target; if (t.classList.contains('ph-rate')) { setSetting('phonRate', +t.value); $$('.ph-rate-val', root).forEach(x => { x.textContent = t.value + 'x'; }); $$('.ph-rate', root).forEach(x => { if (x !== t) x.value = t.value; }); }
        else if (t.id === 'ph-text') { A.toolText = t.value; clearTimeout(A.toolTimer); A.toolTimer = setTimeout(renderTranscription, 300); }
        else if (t.id === 'ph-find') { if (!t.value.trim()) $('#ph-suggest', root).innerHTML = ''; }
      });
      root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'ph-find') { e.preventDefault(); findWord(e.target.value); } else if (e.key === 'Enter' && !e.target.matches('textarea, select') && ((A.sec === 'practice' && Q.answered) || (A.sec === 'pairs' && Q.pairDone))) { e.preventDefault(); A.sec === 'practice' ? newQuestion() : newPair(); } });
    },
    unmount() { stopSpeech(); clearTimeout(A.toolTimer); }
  };
  App.phoneticsProgress = function (C) { const d = (store.id === C.id ? store.data : store.peek(C.id)) || {}; const s = Object.assign({ a: 0, c: 0, pairs: { a: 0, c: 0 }, seen: {} }, (d.phon && d.phon.stats) || {}); return { answered: s.a + s.pairs.a, correct: s.c + s.pairs.c, pct: pct(s.c + s.pairs.c, s.a + s.pairs.a), seen: Object.keys(s.seen).length, symbols: ALL_SYMBOLS }; };
})(window);

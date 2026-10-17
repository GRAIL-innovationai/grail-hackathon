/* ============================================================
   Calling Bo (assets/talk.js). A live call: WebRTC and OpenAI's side of it are stand-ins in the page
   (window.__rt sends the server's events and records what the page sends; the call is set up through
   api/ai.php against the stand-in in tests/pyodide/router.php). Covered: the first-call explanation, the
   call setup, Bo speaking first, captions, talking over him, his board and notes (tools), mute, typing,
   settings that change the call, the transcript saved to the chat, a failed call falling back to basic
   voice, basic voice itself (browser speech recognition and voices are stand-ins: window.__say,
   window.__spoken), a blocked microphone, phones, and no Max.
   ============================================================ */
const T = require('./lib'); const fs = require('fs'); const path = require('path');
const F = n => path.join(__dirname, 'fixtures', n);
const readJ = (n, fb) => { try { return JSON.parse(fs.readFileSync(F(n), 'utf8')); } catch (e) { return fb; } };
const live = () => {
  window.__rt = { sent: [], dc: null, pc: null, answer: '', emit(ev) { if (this.dc) this.dc._fire('message', { data: JSON.stringify(ev) }); } };
  const tone = () => { const ctx = new AudioContext(); ctx.resume(); const osc = ctx.createOscillator(); const g = ctx.createGain(); g.gain.value = 0; const dst = ctx.createMediaStreamDestination(); osc.connect(g); g.connect(dst); osc.start(); return { g, stream: dst.stream }; };
  class FakeDC { constructor() { this.readyState = 'connecting'; this.ls = {}; window.__rt.dc = this; } addEventListener(t, f) { (this.ls[t] = this.ls[t] || []).push(f); } send(s) { window.__rt.sent.push(JSON.parse(s)); } close() { this.readyState = 'closed'; } _fire(t, e) { (this.ls[t] || []).forEach(f => f(e)); } }
  class FakePC {
    constructor() { this.ls = {}; this.connectionState = 'new'; window.__rt.pc = this; }
    addTrack() {} createDataChannel(name) { window.__rt.channel = name; return new FakeDC(); }
    async createOffer() { return { type: 'offer', sdp: window.__badOffer ? 'x=bad' : 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=browser-offer\r\nt=0 0\r\n' }; }
    async setLocalDescription() {}
    async setRemoteDescription(d) { window.__rt.answer = d.sdp; setTimeout(() => { this.connectionState = 'connected'; const dc = window.__rt.dc; dc.readyState = 'open'; dc._fire('open', {}); const t = tone(); window.__rt.boGain = t.g; this.ontrack && this.ontrack({ streams: [t.stream] }); }, 100); }
    addEventListener(t, f) { (this.ls[t] = this.ls[t] || []).push(f); } close() { this.connectionState = 'closed'; window.__rt.closed = true; }
  }
  window.RTCPeerConnection = FakePC;
  navigator.mediaDevices.getUserMedia = async () => { if (window.__micDenied) { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; } const t = tone(); window.__rt.mic = t.stream; return t.stream; };
};
const basic = () => {
  window.__say = []; window.__spoken = [];
  class FakeSR {
    start() { const say = window.__say.shift(); if (!say) { setTimeout(() => this.onend && this.onend(), 300); return; } const words = say.split(' '); let i = 0; const step = () => { i++; const fin = i === words.length; const alt = [{ transcript: words.slice(0, i).join(' ') }]; alt.isFinal = fin; this.onresult && this.onresult({ resultIndex: 0, results: [alt] }); if (!fin) setTimeout(step, 60); }; setTimeout(step, 200); }
    stop() { setTimeout(() => this.onend && this.onend(), 10); } abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  const synth = { speaking: false, paused: false, getVoices: () => [{ name: 'Microsoft Andrew Online (Natural)', lang: 'en-US' }, { name: 'Zarvox', lang: 'en-US', default: true }], speak(u) { if (!u.text.trim()) return; window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name }); setTimeout(() => u.onend && u.onend(), 120); }, cancel() {}, pause() {}, resume() {}, addEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
};
const quiet = () => { try { const s = JSON.parse(localStorage.getItem('studyhub-settings') || '{}'); s.tourDone = true; localStorage.setItem('studyhub-settings', JSON.stringify(s)); } catch (e) {} document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.celebrate{display:none!important}'; document.head.appendChild(st); }); };
(async () => {
  const { mk, txt, login, api, go, hscroll, log, check } = await T.start({ audio: true });
  const ds = (p, k) => p.evaluate(k => { const t = document.querySelector('#bo-talk'); return t ? t.dataset[k] || '' : 'closed'; }, k);
  const waitFor = async (p, k, want, ms = 8000) => { const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await ds(p, k); if (want.includes(s)) return s; await p.waitForTimeout(60); } return s; };
  const setup = async (w, h, extra) => {
    const [c, p] = await mk(w, h); await c.addInitScript(quiet); await c.addInitScript(live); await c.addInitScript(basic); if (extra) await c.addInitScript(extra);
    await go(p, '#/'); await login(p, 'mod.user@montana.edu'); await p.reload(); await p.waitForTimeout(700);
    await api(p, 'ai_forget', { what: 'all' }); await p.evaluate(() => { App.setSetting('aiConsent', Date.now()); App.setSetting('boTalkOk', 0); App.setSetting('boMode', ''); App.setSetting('boEager', ''); App.setSetting('boLiveVoice', ''); App.setSetting('boCaptions', true); });
    return [c, p];
  };
  const E = (p, ev) => p.evaluate(ev => window.__rt.emit(ev), ev);
  const sent = p => p.evaluate(() => window.__rt.sent);
  for (const n of ['live-last.json', 'live-hangups.json', 'live-tries.json', 'tts-all.json']) try { fs.unlinkSync(F(n)); } catch (e) {}

  // a Max member calls Bo on a laptop
  const [cm, m] = await setup(1360, 900);
  await go(m, '#/tutor/calc', 2200);
  check('Ask Bo has Call Bo, and a call button in the message box', /Call Bo/.test(await txt(m, '.bo-talk-btn:not([hidden])')) && !!(await m.$('.bo-mic')));
  await m.click('.bo-talk-btn'); await m.waitForTimeout(500);
  const hello = await txt(m, '#bo-talk');
  check('the first call explains it is a real call and that the voice goes to OpenAI, before anything is sent', /It’s a real call/.test(hello) && /cut in/.test(hello) && /OpenAI/.test(hello) && /Nothing is recorded/.test(hello) && !fs.existsSync(F('live-last.json')), hello.slice(0, 300));
  check('the call is a dialog with a live status, mute, photo, type and end', await m.$eval('#bo-talk', e => e.getAttribute('role') === 'dialog' && e.getAttribute('aria-modal') === 'true') && !!(await m.$('#bt-status[role="status"]')) && !!(await m.$('#bt-mute')) && !!(await m.$('#bt-file')) && !!(await m.$('[data-t="type"]')) && !!(await m.$('.bt-end')));
  await m.click('#bt-start');
  const s1 = await waitFor(m, 'state', ['live'], 6000);
  const setupReq = readJ('live-last.json', {}); const sess = setupReq.session || {};
  check('Start: the page sends its offer to Mathub, which sets the call up with OpenAI and hands the answer back', s1 === 'live' && /browser-offer/.test(setupReq.sdp || '') && setupReq.accept === 'application/sdp' && /s=stand-in/.test(await m.evaluate(() => window.__rt.answer)) && (await m.evaluate(() => window.__rt.channel)) === 'oai-events', { s1, accept: setupReq.accept });
  check('the call is speech to speech, with semantic turn-taking, interruptions, noise reduction and the natural voice', sess.type === 'realtime' && sess.model === 'gpt-realtime-2.1-mini' && sess.audio.input.turn_detection.type === 'semantic_vad' && sess.audio.input.turn_detection.interrupt_response === true && sess.audio.input.noise_reduction.type === 'near_field' && sess.audio.output.voice === 'cedar' && /Calculus I/.test(sess.audio.input.transcription.prompt), sess.audio);
  const ins = sess.instructions || '';
  check('Bo is told to talk like a friend, not an assistant, and knows the class and the student', /not a help desk/.test(ins) && /Never say things like "How can I help you today"/.test(ins) && /If they cut in, stop/.test(ins) && /CLASS:/.test(ins) && /WEAKEST TOPICS/.test(ins) && /you speak first/.test(ins), ins.slice(0, 200));
  check('he has four tools: writing on the board, drawing on it, asking a question on it, and his notes', (sess.tools || []).map(t => t.name).join() === 'write_on_board,draw_on_board,ask_on_board,remember');
  check('and he is told how to teach: explain new things properly with the board, check with a real question', /HOW YOU TEACH/.test(ins) && /take a proper turn of four to seven sentences/.test(ins) && /never "does that make sense\?"/.test(ins) && !/Ask more than you tell/.test(ins));
  check('Bo speaks first: the page asks for a response as soon as the call opens', (await sent(m)).some(x => x.type === 'response.create'));
  check('the clock runs', /\d:\d\d/.test(await txt(m, '#bt-clock')));
  const eb = await m.evaluate(() => { const b = document.querySelector('#bt-board'); const r = b.getBoundingClientRect(); const o = document.querySelector('#bt-orb').getBoundingClientRect(); return { shown: r.width > 300 && r.height > 60, beside: r.left > o.right, empty: /Nothing on the board yet/.test(b.textContent) }; });
  check('his board is on screen from the start (beside him on a wide screen), empty until he writes', eb.shown && eb.beside && eb.empty, eb);
  // Bo talks
  await E(m, { type: 'conversation.item.added', item: { id: 'b1', type: 'message', role: 'assistant', content: [] } });
  await E(m, { type: 'response.created', response: { id: 'r1' } }); await E(m, { type: 'output_audio_buffer.started' });
  await E(m, { type: 'response.output_audio_transcript.delta', item_id: 'b1', delta: 'Hey! Exam two is Friday. ' }); await E(m, { type: 'response.output_audio_transcript.delta', item_id: 'b1', delta: 'Want to hit the chain rule?' });
  check('while Bo talks: status and captions follow him', (await ds(m, 'who')) === 'bo' && /talking/.test(await txt(m, '#bt-status')) && /Want to hit the chain rule/.test(await txt(m, '#bt-bo')));
  // you cut in by talking: the server stops him (interrupt_response); the page follows
  await E(m, { type: 'input_audio_buffer.speech_started' });
  await E(m, { type: 'conversation.item.added', item: { id: 'u1', type: 'message', role: 'user', content: [{ type: 'input_audio' }] } });
  await E(m, { type: 'output_audio_buffer.cleared' });
  await E(m, { type: 'response.output_audio_transcript.done', item_id: 'b1', transcript: 'Hey! Exam two is Friday. Want to hit the chain rule?' });
  await E(m, { type: 'conversation.item.input_audio_transcription.delta', item_id: 'u1', delta: 'yeah I keep mixing up' });
  check('when you talk over him, he stops and the page listens, with your words as you say them', (await ds(m, 'who')) === 'you' && /mixing up/.test(await txt(m, '#bt-you')));
  await E(m, { type: 'input_audio_buffer.speech_stopped' });
  check('then he thinks', (await ds(m, 'who')) === 'thinking');
  await E(m, { type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'Yeah, I keep mixing up which part goes inside.' });
  // his answer, with the board and a note
  await E(m, { type: 'response.created', response: { id: 'r2' } });
  // as OpenAI sends it: the item that starts the call has its name; the arguments come later without it, then the finished item
  const a1 = JSON.stringify({ title: 'The chain rule', page: 'new', items: [{ kind: 'math', text: "\\frac{d}{dx} f(g(x)) = f'(g(x))\\,g'(x)" }, { kind: 'tip', text: 'Outside first, then times the derivative of the inside' }] });
  await E(m, { type: 'response.output_item.added', response_id: 'r2', output_index: 0, item: { id: 'fc1', type: 'function_call', status: 'in_progress', name: 'write_on_board', call_id: 'c1', arguments: '' } });
  await E(m, { type: 'response.function_call_arguments.done', response_id: 'r2', item_id: 'fc1', output_index: 0, call_id: 'c1', arguments: a1 });
  await E(m, { type: 'response.output_item.done', response_id: 'r2', output_index: 0, item: { id: 'fc1', type: 'function_call', status: 'completed', name: 'write_on_board', call_id: 'c1', arguments: a1 } });
  await E(m, { type: 'response.function_call_arguments.done', name: 'write_on_board', call_id: 'c3', arguments: JSON.stringify({ page: 'add', items: [{ kind: 'step', text: 'For $\\sin(x^2)$: $\\cos(x^2)\\cdot 2x$' }] }) });
  await E(m, { type: 'response.function_call_arguments.done', name: 'remember', call_id: 'c2', arguments: JSON.stringify({ fact: 'Mixes up inside and outside functions' }) });
  await E(m, { type: 'conversation.item.added', item: { id: 'b2', type: 'message', role: 'assistant', content: [] } });
  await E(m, { type: 'output_audio_buffer.started' });
  await E(m, { type: 'response.output_audio_transcript.done', item_id: 'b2', transcript: 'Totally normal. Outside first, then times the derivative of the inside. I put it on the board.' });
  await E(m, { type: 'response.done', response: { output: [{ type: 'function_call' }, { type: 'function_call' }, { type: 'message' }] } });
  const outs = (await sent(m)).filter(x => x.type === 'conversation.item.create' && x.item.type === 'function_call_output');
  const cb1 = await m.evaluate(() => { const b = document.querySelector('#bt-board'); return { title: (b.querySelector('.bb-title') || {}).textContent, items: [...b.querySelectorAll('.bb-item')].map(x => x.className.replace(/bb-item|bb-new/g, '').trim()), text: b.textContent }; });
  check('he writes a neat page: a title, the formula, a tip, then a step added to the same page', cb1.title === 'The chain rule' && cb1.items.join() === 'bb-math,bb-tip,bb-step' && /frac\{d\}\{dx\}/.test(cb1.text) && !/Nothing on the board/.test(cb1.text), cb1);
  check('the page answers both board tools, once each (the arguments and the finished item are one call)', outs.filter(o => o.item.call_id === 'c1').length === 1 && outs.some(o => o.item.call_id === 'c1' && /"written":2/.test(o.item.output)) && outs.some(o => o.item.call_id === 'c3' && /"written":1/.test(o.item.output)), outs.map(o => o.item.output));
  check('his note is kept, and the page answers that tool too', outs.some(o => o.item.call_id === 'c2' && /saved/.test(o.item.output)) && /Bo will remember/.test(await txt(m, '.toast')));
  // he draws, too: a graph on a new page; a drawing that makes no sense goes back to him to fix
  await E(m, { type: 'response.output_item.done', response_id: 'r3', output_index: 0, item: { id: 'fc4', type: 'function_call', status: 'completed', name: 'draw_on_board', call_id: 'c4', arguments: JSON.stringify({ title: 'y = sin(x^2)', page: 'new', caption: 'It wiggles faster as x grows', drawing: { type: 'graph', x: [0, 4], fns: [{ f: 'sin(x^2)', label: 'y = sin(x^2)' }], points: [{ x: 0, y: 0, label: 'O' }] } }) } });
  await E(m, { type: 'response.function_call_arguments.done', call_id: 'c5', arguments: JSON.stringify({ drawing: { type: 'graph', fns: [{ f: 'alert(1)' }] } }) });   // no name at all: known by its arguments
  await m.waitForTimeout(400);
  const cbd = await m.evaluate(() => { const b = document.querySelector('#bt-board'); const svg = b.querySelector('.bb-draw svg'); return { title: (b.querySelector('.bb-title') || {}).textContent, pos: b.querySelector('.bb-pos').textContent, role: svg && svg.getAttribute('role'), name: svg && svg.querySelector('title').textContent, curve: !!b.querySelector('.bd-curve'), dot: !!b.querySelector('.bd-dot'), cap: (b.querySelector('.bd-cap') || {}).textContent, anim: !!b.querySelector('.bd.bd-anim') }; });
  check('he draws on the board too: a graph on a new page, drawn stroke by stroke, named for screen readers, with what to notice', cbd.title === 'y = sin(x^2)' && /Page 2 of 2/.test(cbd.pos) && cbd.role === 'img' && /Graph of y = sin\(x²\)/.test(cbd.name) && cbd.curve && cbd.dot && /wiggles faster/.test(cbd.cap) && cbd.anim, cbd);
  const outs2 = (await sent(m)).filter(x => x.type === 'conversation.item.create' && x.item.type === 'function_call_output');
  check('the page tells him what he drew, and sends a drawing that makes no sense back to him', outs2.some(o => o.item.call_id === 'c4' && /"drawn":"graph"/.test(o.item.output)) && outs2.some(o => o.item.call_id === 'c5' && /could not be drawn/.test(o.item.output)) && /Page 2 of 2/.test(await txt(m, '#bt-board .bb-pos')), outs2.map(o => o.item.output));
  check('an answer that already spoke is not asked for again', (await sent(m)).filter(x => x.type === 'response.create').length === 1);
  await E(m, { type: 'response.done', response: { output: [{ type: 'function_call' }] } });
  check('a turn that only used a tool asks Bo to go on talking', (await sent(m)).filter(x => x.type === 'response.create').length === 2);
  const creates = async () => (await sent(m)).filter(x => x.type === 'response.create').length;
  await E(m, { type: 'response.created', response: { id: 'r5' } }); await E(m, { type: 'response.output_audio_transcript.delta', item_id: 'b5', delta: 'Let me sketch that.' });
  await E(m, { type: 'response.done', response: { output: [{ type: 'message' }, { type: 'function_call' }] } });
  check('after a few words and a drawing ("let me sketch that"), Bo goes on to walk them through it', (await creates()) === 3);
  await E(m, { type: 'response.created', response: { id: 'r6' } }); await E(m, { type: 'response.done', response: { output: [{ type: 'function_call' }] } });
  check('but not more than twice in a row without them saying anything (no loops)', (await creates()) === 3);
  await E(m, { type: 'input_audio_buffer.speech_started' }); await E(m, { type: 'response.created', response: { id: 'r7' } }); await E(m, { type: 'response.done', response: { output: [{ type: 'function_call' }] } });
  check('once they talk again, he can go on after his tools again', (await creates()) === 4);
  // tapping Bo while he talks stops him at once
  await m.click('#bt-orb');
  check('tapping Bo while he talks stops him (cancel, and clear what is still playing)', (await sent(m)).some(x => x.type === 'response.cancel') && (await sent(m)).some(x => x.type === 'output_audio_buffer.clear'));
  await E(m, { type: 'output_audio_buffer.stopped' });
  // mute
  await m.click('#bt-mute');
  check('Mute turns the microphone off and says so', (await m.$eval('#bt-mute', b => b.getAttribute('aria-pressed'))) === 'true' && (await m.evaluate(() => window.__rt.mic.getAudioTracks().every(t => !t.enabled))) && /muted/.test(await txt(m, '#bt-status')));
  await m.keyboard.press('m');
  check('M unmutes', (await m.evaluate(() => window.__rt.mic.getAudioTracks().every(t => t.enabled))) && (await m.$eval('#bt-mute', b => b.getAttribute('aria-pressed'))) === 'false');
  // typing in the call
  const before = (await sent(m)).filter(x => x.type === 'response.create').length;
  await m.click('[data-t="type"]'); await m.fill('#bt-q', 'Can you quiz me?'); await m.press('#bt-q', 'Enter');
  const typed = (await sent(m)).filter(x => x.type === 'conversation.item.create' && x.item.type === 'message');
  check('typing in the call sends your words to Bo and asks him to answer', typed.some(x => x.item.content[0].text === 'Can you quiz me?') && (await sent(m)).filter(x => x.type === 'response.create').length === before + 1);
  await E(m, { type: 'conversation.item.added', item: { id: 'u2', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Can you quiz me?' }] } });
  // a question on the board: they answer it there, and Bo hears what they picked
  await E(m, { type: 'response.output_item.done', response_id: 'r8', output_index: 0, item: { id: 'fc8', type: 'function_call', status: 'completed', name: 'ask_on_board', call_id: 'c8', arguments: JSON.stringify({ title: 'Quick check', question: 'What is the derivative of $x^2$?', choices: ['$x$', '$2x$', '$x^2$'], answer: '$2x$', why: 'Bring the 2 down and take one off the power.' }) } });
  // a drawing as a JSON string with LaTeX written with one backslash, added to that page; and a drawing given as a board line
  await E(m, { type: 'response.function_call_arguments.done', name: 'draw_on_board', call_id: 'c10', arguments: JSON.stringify({ page: 'add', drawing: '{"type":"graph","fns":[{"f":"\\frac{1}{x}"}],"asymptotes":["x = 0"]}' }) });
  await E(m, { type: 'response.function_call_arguments.done', name: 'write_on_board', call_id: 'c11', arguments: JSON.stringify({ page: 'add', items: [{ kind: 'code', text: 'def f(x):\n    return x ** 2', lang: 'python' }] }) });
  await m.waitForTimeout(400);
  const qb = await m.evaluate(() => { const b = document.querySelector('#bt-board'); return { title: (b.querySelector('.bb-title') || {}).textContent, pos: b.querySelector('.bb-pos').textContent, opts: b.querySelectorAll('.bb-chk-o').length, draws: b.querySelectorAll('.bb-draw svg .bd-curve').length, asym: /x = 0/.test((b.querySelector('.bb-draw svg') || {}).textContent || ''), code: (b.querySelector('.bb-code pre') || {}).textContent }; });
  check('he puts a question on the board (a new page), a drawing sent as text with one-backslash LaTeX, and code', qb.title === 'Quick check' && /Page 3 of 3/.test(qb.pos) && qb.opts === 3 && qb.draws === 1 && qb.asym && qb.code === 'def f(x):\n    return x ** 2', qb);
  const outs3 = (await sent(m)).filter(x => x.type === 'conversation.item.create' && x.item.type === 'function_call_output');
  check('the page tells him the question is up and to wait for the answer', outs3.some(o => o.item.call_id === 'c8' && /"asked":true/.test(o.item.output) && /let them answer/.test(o.item.output)) && outs3.some(o => o.item.call_id === 'c10' && /"drawn":"graph"/.test(o.item.output)), outs3.map(o => o.item.output));
  const before2 = await creates();
  await m.click('#bt-board .bb-chk-o[data-chk-o="0"]'); await m.waitForTimeout(250);
  const told = (await sent(m)).filter(x => x.type === 'conversation.item.create' && x.item.type === 'message').pop();
  check('tapping an answer marks it on the board and tells Bo what they picked, so he can react', !!(await m.$('#bt-board .bb-chk-o.no[data-chk-o="0"]')) && /On the board I answered "\$x\$" to your question "What is the derivative of \$x\^2\$\?"\. That is not right; the answer is \$2x\$\./.test(told && told.item.content[0].text) && (await creates()) === before2 + 1, told && told.item.content[0].text);
  // settings
  await m.click('[data-t="settings"]'); await m.waitForTimeout(200);
  check('settings: his voices, speed, when he jumps in, captions, and basic voice', (await m.$$('#bt-set input[name="bt-lv"]')).length >= 6 && !!(await m.$('#bt-set [data-eager="low"]')) && !!(await m.$('#bt-set [data-lrate="1.1"]')) && !!(await m.$('#bt-cp')) && !!(await m.$('#bt-bm')));
  await m.click('#bt-set [data-eager="low"]');
  const upd = (await sent(m)).filter(x => x.type === 'session.update').pop();
  check('"Lets me finish" tells the call to wait longer before Bo answers', upd && upd.session.audio.input.turn_detection.eagerness === 'low' && upd.session.audio.input.turn_detection.type === 'semantic_vad', upd);
  await m.click('#bt-set input[value="marin"]'); await m.keyboard.press('Escape'); await m.waitForTimeout(150);
  check('Esc closes the settings first', !!(await m.$('#bo-talk')) && !!(await m.$('#bt-set[hidden]')));
  await m.click('[data-t="cc"]');
  check('captions can be turned off', await m.$eval('#bt-caps', e => e.classList.contains('off')));
  await m.click('[data-t="cc"]');
  check('no sideways scroll in the call at 1360px', await hscroll(m));
  // hang up: the transcript goes into the chat, the call is hung up on the server
  await m.click('.bt-end'); await m.waitForTimeout(1800);
  check('End closes the call and stops the connection', !(await m.$('#bo-talk')) && (await m.evaluate(() => window.__rt.closed === true)));
  check('the server hung the call up too', readJ('live-hangups.json', []).length >= 1);
  const chat = await m.$$eval('#bo-log .bo-msg', ms => ms.map(x => ({ bo: x.classList.contains('bo'), t: x.textContent.trim() })));
  const iB1 = chat.findIndex(x => x.bo && /Exam two is Friday/.test(x.t)), iU1 = chat.findIndex(x => !x.bo && /which part goes inside/.test(x.t)), iB2 = chat.findIndex(x => x.bo && /Totally normal/.test(x.t));
  check('the chat now has the call, in order, with what you said marked as said out loud', iB1 >= 0 && iU1 > iB1 && iB2 > iU1 && /Said out loud/.test(chat[iU1].t), chat.map(x => x.t.slice(0, 30)));
  const cb2 = await m.evaluate(() => ({ links: [...document.querySelectorAll('#bo-log [data-bo-page]')].map(b => b.textContent.trim()), title: (document.querySelector('#bo-board .bb-title') || {}).textContent, items: document.querySelectorAll('#bo-board .bb-item').length }));
  check('his page is in the chat (one link) and on the chat\'s board, whole, and his note is saved', cb2.links.length === 1 && /On the board: The chain rule/.test(cb2.links[0]) && cb2.title === 'The chain rule' && cb2.items === 3 && ((await api(m, 'ai_status')).json.notes || []).includes('Mixes up inside and outside functions'), cb2);
  await go(m, '#/tutor/calc', 1500); await m.click('.bo-talk-btn'); await waitFor(m, 'state', ['live'], 6000);
  check('the next call uses the voice picked, and Bo never asks for the first-call explanation again', (readJ('live-last.json', {}).session || {}).audio.output.voice === 'marin' && !(await m.$('#bt-start')));
  check('and he remembers: his note and the last call are in what he is told', /Mixes up inside and outside functions/.test(readJ('live-last.json', {}).session.instructions) && /YOUR LAST FEW MESSAGES/.test(readJ('live-last.json', {}).session.instructions) && /\[on the board: The chain rule\]/.test(readJ('live-last.json', {}).session.instructions) && !/\ntip: Outside first/.test(readJ('live-last.json', {}).session.instructions));
  await m.keyboard.press('Escape'); await m.waitForTimeout(500);
  await cm.close();

  // a call that cannot be set up offers basic voice; basic voice works without the live service
  const [cf, f] = await setup(1360, 900, () => { window.__badOffer = true; });
  await f.evaluate(() => App.setSetting('boTalkOk', Date.now()));
  await go(f, '#/tutor/calc', 2200); await f.click('.bo-talk-btn');
  const f1 = await waitFor(f, 'state', ['error'], 6000);
  check('a call that fails says so, with Call again and Use basic voice', f1 === 'error' && !!(await f.$('[data-t="retry"]')) && !!(await f.$('[data-t="basic"]')), await txt(f, '#bt-extra'));
  await f.evaluate(() => { window.__say.push('What is the chain rule'); });
  await f.click('[data-t="basic"]');
  const f2 = await waitFor(f, 'who', ['you', 'thinking'], 8000); const f3 = await waitFor(f, 'who', ['bo'], 8000);
  check('basic voice: Bo greets, listens, hears the question and answers out loud', (await ds(f, 'mode')) === 'basic' && ['you', 'thinking'].includes(f2) && f3 === 'bo' && /What is the chain rule/.test(await txt(f, '#bt-you')), { f2, f3, you: await txt(f, '#bt-you') });
  await waitFor(f, 'who', ['listening'], 9000);
  check('basic voice: his answer is read out, sentence by sentence, without the formula', readJ('tts-all.json', []).some(x => /derivative of the outside/.test(x)) && !readJ('tts-all.json', []).some(x => /frac|board/.test(x)), readJ('tts-all.json', []).slice(-4));
  check('basic voice: the board shows the page from his answer, and the tip on it is not read out', (await txt(f, '#bt-board .bb-title')) === 'The chain rule' && !!(await f.$('#bt-board .bb-tip')) && !readJ('tts-all.json', []).some(x => /Outside first/.test(x)));
  await f.keyboard.press('Escape'); await cf.close();

  // a blocked microphone
  const [cb, bl] = await setup(1360, 900, () => { window.__micDenied = true; });
  await bl.evaluate(() => App.setSetting('boTalkOk', Date.now()));
  await go(bl, '#/tutor/calc', 2200); await bl.click('.bo-talk-btn');
  await waitFor(bl, 'state', ['error'], 6000);
  check('a blocked microphone says how to allow it, and opens typing', /allow it/i.test(await txt(bl, '#bt-extra')) && !(await bl.$('#bt-type[hidden]')), await txt(bl, '#bt-extra'));
  await bl.keyboard.press('Escape'); await cb.close();

  // phones
  const [cp, ph] = await setup(390, 844);
  await ph.evaluate(() => App.setSetting('boTalkOk', Date.now()));
  await go(ph, '#/tutor/calc', 2200);
  check('phone: the call button in the message box starts the call (the header button steps aside)', (await ph.$eval('.bo-talk-btn', b => getComputedStyle(b).display)) === 'none' && await ph.$eval('.bo-mic', b => b.getBoundingClientRect().width >= 44));
  await ph.click('.bo-mic'); await waitFor(ph, 'state', ['live'], 6000);
  await E(ph, { type: 'response.function_call_arguments.done', name: 'write_on_board', call_id: 'c9', arguments: JSON.stringify({ lines: ['x^2 + 3x'] }) });
  await E(ph, { type: 'response.output_audio_transcript.delta', item_id: 'b9', delta: 'Okay so look at the board for a sec, what do you notice first about this one?' });
  const lay = await ph.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { bar: r('.bt-bar').bottom, end: r('.bt-end').right, endW: r('.bt-end .bt-btn-ic').width, board: r('#bt-board').width, h: innerHeight, w: innerWidth }; });
  check('phone: the call fits with the board, and the call buttons are big and on screen', lay.bar <= lay.h + 1 && lay.end <= lay.w && lay.endW >= 56 && lay.board > 300, lay);
  check('phone: no sideways scroll in the call', await hscroll(ph));
  await ph.keyboard.press('Escape'); await cp.close();

  // no Max: no call
  const [ca, a] = await mk(1360, 900); await a.addInitScript(quiet); await go(a, '#/'); await login(a, 'alice.a@montana.edu'); await a.reload(); await a.waitForTimeout(600);
  await api(a, 'create_status&refresh=1'); await go(a, '#/tutor/calc', 1800);
  check('without Max, Ask Bo shows Meet Bo and no way to call him', /Meet Bo/.test(await txt(a, '#bo-main')) && !(await a.$('.bo-talk-btn:not([hidden])')) && !(await a.$('.bo-mic')));
  await ca.close();

  const [cc, cl] = await mk(1360, 900); await go(cl, '#/'); await login(cl, 'mod.user@montana.edu'); await api(cl, 'ai_forget', { what: 'all' }); await cc.close();
  log('calls checked');
  await T.finish();
})().catch(e => { console.error(e); process.exit(1); });

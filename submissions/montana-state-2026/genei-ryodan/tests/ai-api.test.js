/* Bo, the AI tutor, and classes Bo writes (api/ai.php), on the account server: only Mathub Max (or a granted
   account) can use them; what the server sends to the AI is small (a class summary marked for caching, a short
   progress snapshot, the last few turns, Bo's notes) and goes to the small default model; the chat and Bo's
   notes are kept with the account; a class is written as an outline, then one unit at a time from the outline.
   The AI and RevenueCat are stand-ins on the Pyodide mirror server (tests/pyodide/router.php); config.local.php
   needs anthropic_key 'sk-ant-test', anthropic_api, openai_key 'sk-openai-test', openai_api, and plan_grants for mod.user.
   Also: answers streamed as JSON lines, voice mode, and Bo's voice and ears (ai_speak, ai_listen). Plain HTTP, no browser pages. */
const T = require('./lib'); const fs = require('fs'); const path = require('path');
const BASE = T.base.replace(/index\.html.*$/, '') + 'api/index.php?r=';
const STATE = path.join(__dirname, 'fixtures', 'rc-state.json'); const LAST = path.join(__dirname, 'fixtures', 'ai-last.json');
const jar = {};
async function call(who, route, body, method) {
  const headers = { 'X-Requested-With': 'MatHub', 'Content-Type': 'application/json' }; if (jar[who]) headers.Cookie = jar[who];
  const r = await fetch(BASE + route, { method: method || (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) { const m = /mathub_session=([^;]*)/.exec(sc); if (m) jar[who] = 'mathub_session=' + m[1]; }
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = { raw: t.slice(0, 200) }; } j.status = r.status; return j;
}
let check; const ok = (label, cond, extra) => check(label, !!cond, cond ? undefined : JSON.stringify(extra === undefined ? null : extra).slice(0, 400));
const last = () => JSON.parse(fs.readFileSync(LAST, 'utf8'));
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const snapshot = { name: 'Alice', streak: 4, xpToday: 10, goal: 30, page: 'Calc I notes 1.7', readiness: { exam: 'Exam 2', date: '2026-10-16', days: 3, score: 41, label: 'Getting there', checklist: '2/6' }, weak: [{ t: 'Limits by algebra', acc: 0.4, n: 5 }, { t: 'Chain rule', acc: 0.5, n: 4 }], strong: ['Velocity'], missed: [{ t: 'Limits', q: '<p>Find the limit of (x^2-1)/(x-1) as x → 1</p>', a: '0', c: '2' }], due: 12, mistakes: 3, deadlines: [{ d: '2026-10-14', t: 'WebWork 2.3' }], others: [{ c: 'PHSX 220', ex: 'Exam 2', days: 9 }], junk: 'x'.repeat(50000) };
(async () => {
  ({ check } = await T.start());
  fs.writeFileSync(STATE, '{}');
  for (const [who, email] of [['alice', 'alice.a@montana.edu'], ['bob', 'bob.bmu6j92pq@montana.edu'], ['mod', 'mod.user@montana.edu']]) { const r = await call(who, 'login', { email, password: 'password123' }); ok(`${who} signs in`, r.ok, r); }
  await call('alice', 'ai_forget', { what: 'all' }); await call('mod', 'ai_forget', { what: 'all' }); await call('alice', 'create_status&refresh=1');
  for (const c of ((await call('alice', 'myclasses')).classes || [])) await call('alice', 'myclass_delete', { id: c.id });

  // who can use Bo
  let r = await call('anon', 'ai_status'); ok('signed out: Bo is switched on, no plan', r.ok && r.enabled === true && r.signed_in === false && r.max === false, r);
  r = await call('anon', 'ai_tutor', { class: 'calc', q: 'hi' }); ok('signed out: asking Bo needs an account', r.status === 401, r);
  r = await call('alice', 'ai_tutor', { class: 'calc', q: 'hi' }); ok('without Max, asking Bo is refused and names the plan', r.status === 402 && r.plan === 'max', r);
  const aliceId = (await call('alice', 'create_status')).customer;
  fs.writeFileSync(STATE, JSON.stringify({ [aliceId]: { expires: new Date(Date.now() + 30 * 864e5).toISOString(), plan: 'pro' } }));
  await call('alice', 'create_status&refresh=1');
  r = await call('alice', 'ai_tutor', { class: 'calc', q: 'hi' }); ok('Pro is not enough for Bo', r.status === 402, r);
  r = await call('alice', 'ai_status'); ok('with Pro: pro, not max', r.ok && r.plan === 'pro' && r.pro === true && r.max === false, r);
  r = await call('alice', 'ai_class', { step: 'outline', syllabus: { text: 'TEST 100 Pro writing. Fall 2026. Exam 1 Oct 20. Topics: ratios, percents, rates, growth.' }, size: 'short' });
  ok('Pro is enough for Bo to write a class from a syllabus', r.ok && /^[a-f0-9]{24}$/.test(r.build) && r.units.join() === '1,2', r);
  fs.writeFileSync(STATE, JSON.stringify({ [aliceId]: { expires: new Date(Date.now() + 30 * 864e5).toISOString(), plan: 'max' } }));
  await call('alice', 'create_status&refresh=1');
  r = await call('alice', 'ai_status'); ok('with Max: plan max, this month\'s usage and limits', r.ok && r.max === true && r.usage.tutor === 0 && r.usage.tutor_limit === 1500 && r.usage.class_limit === 15, r);

  // a question, and what the server sends to the AI
  r = await call('alice', 'ai_tutor', { class: 'calc', q: 'What should I study tonight?', snapshot, today: '2026-10-13' });
  ok('Bo answers with her weakest topic and her class', r.ok && /weakest topic is Limits by algebra/.test(r.reply) && /I know your class/.test(r.reply), r);
  let q = last(); const sysText = q.system.map(b => b.text).join('\n');
  ok('the small default model, and a short answer limit (with room for a page of the board)', q.model === 'claude-haiku-5-5' && q.max_tokens <= 1500, { model: q.model, max: q.max_tokens });
  ok('Bo is told how great tutors teach: where the student is, the big picture, one idea at a time, a worked example then fading, drawing it, real checks, a hint ladder', /HOW YOU TEACH/.test(q.system[0].text) && /Find out where they are first/.test(q.system[0].text) && /Show, then fade/.test(q.system[0].text) && /never "does that make sense\?"/.test(q.system[0].text) && /Hints go up a ladder/.test(q.system[0].text) && /Change the angle/.test(q.system[0].text), q.system[0].text.length);
  ok('and how to draw on his board: all thirteen kinds of drawing, tangent lines, Riemann sums and sliders', /DRAWINGS on your board/.test(q.system[0].text) && /draw: a graph, number line, figure/.test(q.system[0].text) && ['graph', 'numberline', 'figure', 'unitcircle', 'table', 'bars', 'pie', 'scatter', 'boxplot', 'normal', 'tree', 'venn', 'flow'].every(t => q.system[0].text.includes(`{"type":"${t}"`)) && /"tangent":\{/.test(q.system[0].text) && /"riemann":\{/.test(q.system[0].text) && /"sliders":\[/.test(q.system[0].text));
  ok('and to put questions on the board for the student to answer there, and code in a block', /YOUR TURN/.test(q.system[0].text) && /check: a question they answer on the board/.test(q.system[0].text) && /"choices":\[/.test(q.system[0].text) && /CODE: a block in ```/.test(q.system[0].text));
  ok('Bo\'s instructions and the class summary come first and are marked for caching', q.system.length === 3 && q.system[1].cache_control && q.system[1].cache_control.type === 'ephemeral' && /^CLASS: M171 Calculus I/.test(q.system[1].text) && !q.system[2].cache_control, q.system.map(b => [b.text.slice(0, 30), !!b.cache_control]));
  ok('the class summary is compact: every unit, one line per topic, exams and grading, under 9,000 characters', q.system[1].text.length < 9000 && /EXAMS: .*Exam 2 2026-10-16/.test(q.system[1].text) && /GRADING: /.test(q.system[1].text) && /\n- §?1\.1 How do we measure velocity\?/.test(q.system[1].text), q.system[1].text.length);
  ok('today\'s part: the date, the next two weeks, and her progress cut to a few lines (HTML stripped, junk dropped)', /TODAY: 2026-10-13/.test(sysText) && /NEXT TWO WEEKS: /.test(sysText) && /READINESS: Exam 2 on 2026-10-16 \(3 days\): 41% Getting there, prep checklist 2\/6/.test(sysText) && /RECENTLY MISSED:\n- \[Limits\] Find the limit/.test(sysText) && !/<p>/.test(sysText) && !/xxxxxxxxxx/.test(sysText) && q.system[2].text.length < 2500, q.system[2].text);
  ok('the first question goes alone', q.messages.length === 1 && q.messages[0].role === 'user', q.messages.length);

  // more turns: only the last few go to the AI
  for (let i = 1; i <= 5; i++) await call('alice', 'ai_tutor', { class: 'calc', q: 'Question number ' + i, snapshot });
  q = last(); ok('later questions carry only the last 6 turns, starting with the student, ending with the new question', q.messages.length === 7 && q.messages[0].role === 'user' && q.messages[6].role === 'user' && /Question number 5/.test(JSON.stringify(q.messages[6])), q.messages.map(m => m.role));
  r = await call('alice', 'ai_thread&class=calc'); ok('the chat is kept with the account (all 12 turns, newest last)', r.ok && r.turns.length === 12 && r.turns[11].r === 'b' && /Question number 5/.test(r.turns[10].t), r.turns && r.turns.length);

  // Bo remembers, and math survives
  r = await call('alice', 'ai_tutor', { class: 'calc', q: 'Please remember I like worked examples', snapshot });
  ok('a [remember: …] line is saved as a note and taken out of the reply', r.ok && r.remembered === 'Likes worked examples first' && !/\[remember/.test(r.reply), r);
  await call('alice', 'ai_tutor', { class: 'calc', q: 'math please, is x < 3?', snapshot });
  q = last(); ok('the next question carries Bo\'s notes about her', /WHAT BO REMEMBERS ABOUT THEM:\n- Likes worked examples first/.test(q.system[2].text), q.system[2].text.slice(-200));
  ok('math in her question is kept (x < 3 is not taken for HTML)', /x < 3\?/.test(JSON.stringify(q.messages[q.messages.length - 1])));
  r = await call('alice', 'ai_thread&class=calc'); ok('and in Bo\'s answer', /x < 3 here/.test(r.turns[r.turns.length - 1].t) && /\\frac\{\\Delta y\}/.test(r.turns[r.turns.length - 1].t), r.turns[r.turns.length - 1]);

  // a photo of a problem
  r = await call('alice', 'ai_tutor', { class: 'calc', q: 'Help with this one', image: { type: 'image/png', data: PNG } });
  q = last(); ok('a photo goes with the question as an image', r.ok && /I see your photo/.test(r.reply) && q.messages[q.messages.length - 1].content[0].type === 'image', r);
  r = await call('alice', 'ai_tutor', { class: 'calc', q: 'x', image: { type: 'application/zip', data: PNG } }); ok('other file types are refused', r.status === 400, r);
  r = await call('alice', 'ai_tutor', { class: 'calc', q: 'x', image: { type: 'image/png', data: 'A'.repeat(3600000) } }); ok('a photo over 2.5 MB is refused', r.status === 413, r);
  r = await call('alice', 'ai_tutor', { class: 'calc', q: '   ' }); ok('an empty question is refused', r.status === 400, r);

  // her own class
  const mine = { format: 'mathub-class-pack', version: 1, id: 'my7777', code: 'OWN 101', name: 'Her own class', term: 'Fall 2026', COURSE: { code: 'OWN 101', name: 'Her own class', term: 'Fall 2026', instructor: 'Dr. Own' }, EXAMS: [{ id: 'e1', name: 'Midterm', date: '2026-10-30', covers: 'Unit 1' }], UNITS: [{ n: 1, title: 'Basics', sections: ['a'], exam: 'e1' }], SECTIONS: [{ id: 'a', label: '1.1', title: 'Alpha', unit: 1, ideas: ['<b>Alpha</b> is the first idea.'] }] };
  await call('alice', 'myclass_save', { id: 'my7777', pack: mine });
  r = await call('alice', 'ai_tutor', { class: 'my7777', q: 'What is on my midterm?' }); q = last();
  ok('Bo knows a class she made, from the copy saved with her account', r.ok && /^CLASS: OWN 101 Her own class/.test(q.system[1].text) && /U1 Basics \[Midterm\]\n- 1\.1 Alpha: Alpha is the first idea\./.test(q.system[1].text), q.system[1].text);
  r = await call('bob', 'ai_thread&class=my7777'); ok('nobody else sees her chat', r.ok && r.turns.length === 0, r);

  // forgetting
  r = await call('alice', 'ai_forget', { what: 'note', i: 0 }); ok('she can delete a note', r.ok && r.notes.length === 0, r);
  r = await call('alice', 'ai_forget', { what: 'chat', class: 'calc' }); r = await call('alice', 'ai_thread&class=calc'); ok('and clear a chat', r.turns.length === 0, r);

  // Bo writes a class from a syllabus
  r = await call('bob', 'ai_class', { step: 'outline', syllabus: { text: 'TEST 101 syllabus' } }); ok('writing a class needs Pro or Max (bob has neither)', r.status === 402 && r.plan === 'pro', r);
  r = await call('alice', 'ai_class', { step: 'outline', syllabus: {} }); ok('a syllabus is needed', r.status === 400, r);
  r = await call('alice', 'ai_class', { step: 'outline', syllabus: { text: 'TEST 101 Testing Bo. Fall 2026. Exam 1 Oct 20. Topics: ratios, percents, rates, growth.' }, size: 'short' });
  ok('step 1: the syllabus becomes an outline with its units, kept on the server', r.ok && /^[a-f0-9]{24}$/.test(r.build) && r.units.join() === '1,2' && r.outline.SECTIONS.length === 4, r);
  const build = r.build; q = last();
  const otext = q.messages[0].content.map(b => b.text || '').join('\n');
  ok('the outline request carries the syllabus once, with the outline instructions', /THE SYLLABUS:\nTEST 101/.test(otext) && /Read the syllabus/.test(otext) && q.model === 'claude-haiku-5-5', otext.slice(0, 200));
  r = await call('alice', 'ai_class', { step: 'unit', build, unit: 1, size: 'short' }); q = last();
  ok('step 2: a unit is written from the outline alone, not the syllabus', r.ok && r.unit === 1 && r.data.SECTIONS.map(s => s.id).join() === 'ratios,percents' && !/THE SYLLABUS/.test(JSON.stringify(q.messages)) && /Write the study material for unit 1 "Numbers"/.test(q.messages[0].content) && q.messages[0].content.length < 3000, r);
  r = await call('alice', 'ai_class', { step: 'unit', build, unit: 2 }); ok('and the next unit', r.ok && r.data.SECTIONS.map(s => s.id).join() === 'rates,growth' && r.data.QUIZ.questions.length === 2, r);
  r = await call('alice', 'ai_class', { step: 'unit', build, unit: 9 }); ok('a unit not in the outline is refused', r.status === 400, r);
  r = await call('alice', 'ai_class', { step: 'unit', build: 'ffffffffffffffffffffffff', unit: 1 }); ok('an unknown build is refused', r.status === 404, r);
  r = await call('mod', 'ai_class', { step: 'unit', build, unit: 1 }); ok('another account cannot continue her build', r.status === 404, r);
  r = await call('alice', 'ai_status'); ok('her month: 2 classes written by Bo (one with Pro, one with Max), and the questions she asked', r.usage.classes === 2 && r.usage.tutor === 10, r.usage);
  r = await call('alice', 'ai_class', { step: 'outline', syllabus: { file: { type: 'application/pdf', data: 'JVBERi0xLjQK' } } }); q = last();
  ok('a syllabus PDF goes to the AI as a document', r.ok && q.messages[0].content[0].type === 'document' && q.messages[0].content[0].source.media_type === 'application/pdf', q.messages[0].content.map(b => b.type));

  // a granted tester
  r = await call('mod', 'ai_tutor', { class: 'physics', q: 'hello' }); ok('an account in plan_grants can ask Bo without paying', r.ok && /Bo here/.test(r.reply), r);

  // asked from a page (Bo floats on every page): what is on it, what they pointed at, a problem set as a PDF
  const page = "PAGE: Calc I › Quizzer\nTHE 2 ITEMS ON IT (numbered as they see them):\n[Q1] (§1.2 · Limits) What is $\\lim_{x\\to 2} x^2$?\n  Not answered yet.\n[Q2] (§1.3 · Derivatives) Find $f'(x)$ for $f(x) = x^3$.\n  Choices: A) $3x^2$  B) $x^2$\n  They answered B) $x^2$: wrong; the answer is A) $3x^2$.";
  r = await call('mod', 'ai_tutor', { class: 'calc', q: 'Help me with Q2.', screen: page + '\u0007', focus: "[Q2] Find f'(x) for f(x) = x^3", where: 'Calc I › Quizzer · Q2' });
  q = last(); const ssys = q.system.map(b => b.text).join('\n'); const sb = q.system[q.system.length - 1];
  ok('asked from a page: Bo is told what is on it and how to use it, in its own part after the cached ones', r.ok && /THEIR SCREEN:/.test(sb.text) && /THE PAGE:\nPAGE: Calc I › Quizzer/.test(sb.text) && /\[Q2\] \(§1\.3 · Derivatives\) Find \$f'\(x\)\$/.test(sb.text) && /hint ladder/.test(sb.text) && /hidden is for you/.test(sb.text) && !/\u0007/.test(ssys) && !sb.cache_control && q.system[1].cache_control, q.system.map(b => b.text.slice(0, 60)));
  ok('and what they pointed at, as "this"', /WHAT THEY POINTED AT \(or selected\)/.test(sb.text) && /\[Q2\] Find f'\(x\) for f\(x\) = x\^3/.test(sb.text), sb.text.slice(-300));
  ok('so Bo answers about Q2 on their page', /I can see your page: Calc I › Quizzer\./.test(r.reply) && /Looking at Q2: Find \$f'\(x\)\$/.test(r.reply), r.reply);
  r = await call('mod', 'ai_thread&class=calc'); ok('the chat keeps the question with where it was asked from', /^\[from: Calc I › Quizzer · Q2\] Help me with Q2\.$/.test(r.turns[r.turns.length - 2].t), r.turns.slice(-2));
  r = await call('mod', 'ai_tutor', { class: 'calc', q: 'Explain this', screen: 'P'.repeat(20000) }); q = last();
  ok('what is on a page is cut to 9,000 characters', r.ok && (q.system[q.system.length - 1].text.match(/P{50,}/) || [''])[0].length < 9000 && (q.system[q.system.length - 1].text.match(/P{50,}/) || [''])[0].length > 8000, null);
  r = await call('mod', 'ai_tutor', { class: 'calc', q: 'Explain limits' }); q = last(); ok('a question from Ask Bo itself has no page part', r.ok && !/THEIR SCREEN/.test(q.system.map(b => b.text).join('\n')), null);
  r = await call('mod', 'ai_tutor', { class: 'calc', q: 'Can you help with this set?', file: { type: 'application/pdf', data: 'JVBERi0xLjQK', name: 'HW 5.pdf' } }); q = last();
  ok('a problem set as a PDF goes to the AI as a document, with what to do with it and more room to answer', r.ok && /I read your PDF\./.test(r.reply) && q.messages[q.messages.length - 1].content[0].type === 'document' && q.messages[q.messages.length - 1].content[0].source.media_type === 'application/pdf' && /THEIR FILE:/.test(q.system.map(b => b.text).join('\n')) && q.max_tokens === 2000, { reply: r.reply, max: q.max_tokens });
  r = await call('mod', 'ai_thread&class=calc'); ok('and the chat shows the file by its name', /^\[pdf: HW 5\.pdf\] Can you help with this set\?$/.test(r.turns[r.turns.length - 2].t), r.turns.slice(-2));
  r = await call('mod', 'ai_tutor', { class: 'calc', q: 'x', file: { type: 'image/png', data: PNG } }); ok('only PDFs go as files (photos go as images)', r.status === 400, r);
  r = await call('mod', 'ai_tutor', { class: 'calc', file: { type: 'application/pdf', data: 'JVBERi0xLjQK', name: 'Set.pdf' } }); ok('a PDF alone is enough to ask', r.ok, r);

  // talking with Bo: answers stream as JSON lines, voice mode answers briefly with a board line, and the speech routes
  const raw = async (who, route, body) => { const r = await fetch(BASE + route, { method: 'POST', headers: { 'X-Requested-With': 'MatHub', 'Content-Type': 'application/json', Cookie: jar[who] || '' }, body: JSON.stringify(body) }); return { status: r.status, type: r.headers.get('content-type') || '', buf: Buffer.from(await r.arrayBuffer()) }; };
  await call('mod', 'ai_forget', { what: 'all' });
  let sr = await raw('mod', 'ai_tutor', { class: 'calc', q: 'What is the chain rule?', snapshot, today: '2026-10-13', voice: 1, stream: 1 });
  const lines = sr.buf.toString('utf8').trim().split('\n').map(l => { try { return JSON.parse(l); } catch (e) { return { bad: l }; } });
  const deltas = lines.filter(l => l.t === 'd'); const fin = lines[lines.length - 1];
  ok('a streamed answer comes as JSON lines: pieces of text, then the whole answer', /ndjson/.test(sr.type) && deltas.length > 3 && fin.t === 'done' && fin.ok === true && deltas.map(d => d.x).join('') === fin.reply, { type: sr.type, n: deltas.length, fin });
  q = last(); const vsys = q.system.map(b => b.text).join('\n');
  ok('the server asks the AI to stream, in voice mode: brief, spoken math, a whiteboard for formulas', q.stream === true && /VOICE MODE/.test(vsys) && /\[board: A short title\]/.test(vsys) && /\[\/board\]/.test(vsys) && q.max_tokens === 800 && /DRAWINGS/.test(vsys) && /take up to about 120 words to do it properly/.test(vsys) && q.system[1].cache_control && !q.system[q.system.length - 1].cache_control, { stream: q.stream, max: q.max_tokens });
  ok('the voice answer keeps its page of the board for the screen', /\[board: The chain rule\]\nmath: \\frac\{d\}\{dx\}/.test(fin.reply) && /\[\/board\]/.test(fin.reply), fin.reply);
  r = await call('mod', 'ai_thread&class=calc'); ok('a spoken question and its answer are saved in the chat, marked as said out loud', r.turns.length === 2 && r.turns[0].v === 1 && r.turns[1].v === 1 && /chain rule/.test(r.turns[0].t), r.turns);
  r = await call('mod', 'ai_tutor', { class: 'calc', q: 'And the product rule?', today: '2026-10-13' });
  ok('without stream, the same route answers in one JSON object (and not in voice mode)', r.ok && typeof r.reply === 'string' && !/VOICE MODE/.test(last().system.map(b => b.text).join('')) && last().max_tokens === 1500 && !last().stream && /\[board: A short title, like/.test(last().system.map(b => b.text).join('')), r);
  r = await call('anon', 'ai_status'); ok('Bo\'s natural voice and listening are switched on, with the voices to pick from', r.voice && r.voice.natural === true && r.voice.listen === true && r.voice.default === 'ash' && Object.keys(r.voice.voices).length >= 5, r.voice);
  sr = await raw('mod', 'ai_speak', { text: 'The chain rule: take the derivative of the outside, times the derivative of the inside.', voice: 'coral' });
  const tts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tts-last.json'), 'utf8'));
  ok('ai_speak answers with audio in the voice picked, from the speech model with Bo\'s speaking style', sr.status === 200 && /^audio\//.test(sr.type) && sr.buf.slice(0, 4).toString() === 'RIFF' && tts.voice === 'coral' && tts.model === 'gpt-4o-mini-tts' && /warm/.test(tts.instructions) && /chain rule/.test(tts.input), { status: sr.status, type: sr.type, tts });
  sr = await raw('mod', 'ai_speak', { text: 'Hello there', voice: 'not-a-voice' }); ok('an unknown voice falls back to the default', sr.status === 200 && JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tts-last.json'), 'utf8')).voice === 'ash');
  r = await call('mod', 'ai_speak', { text: '' }); ok('nothing to say is refused', r.status === 400, r);
  r = await call('bob', 'ai_speak', { text: 'hi' }); ok('Bo\'s voice needs Max', r.status === 402 && r.plan === 'max', r);
  r = await call('anon', 'ai_speak', { text: 'hi' }); ok('and an account', r.status === 401, r);
  r = await call('mod', 'ai_listen', { audio: { type: 'audio/webm;codecs=opus', data: Buffer.from('fake opus audio '.repeat(40)).toString('base64') }, secs: 3, class: 'calc' });
  const stt = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'stt-last.json'), 'utf8'));
  ok('ai_listen turns a recording into text, with the class\'s topics as a hint', r.ok && r.text === 'What is the chain rule?' && stt.post.model === 'gpt-4o-mini-transcribe' && stt.post.language === 'en' && /Calculus I/.test(stt.post.prompt) && /speech\.webm$/.test(stt.file.name) && stt.file.size > 100, { r, stt });
  r = await call('mod', 'ai_listen', { audio: { type: 'video/mp4', data: 'AAAA' }, secs: 3 }); ok('a recording of another kind is refused', r.status === 400, r);
  r = await call('mod', 'ai_status'); ok('this month\'s voice use is counted: characters spoken and seconds heard', r.usage.voice >= 90 && r.usage.voice_limit === 300000 && r.usage.listen === 3 && r.usage.listen_limit === 36000, r.usage);
  await call('mod', 'ai_forget', { what: 'all' });

  // live calls: set up here with OpenAI (the stand-in), counted in minutes, hung up past a limit, saved to the chat
  const FX = n => path.join(__dirname, 'fixtures', n); const rd = (n, fb) => { try { return JSON.parse(fs.readFileSync(FX(n), 'utf8')); } catch (e) { return fb; } };
  for (const n of ['live-last.json', 'live-hangups.json', 'live-tries.json']) try { fs.unlinkSync(FX(n)); } catch (e) {}
  const db = (sql, arg) => require('child_process').spawnSync('php', ['-r', '$d = new PDO("sqlite:" . $argv[1]); $s = $d->prepare($argv[2]); $s->execute([$argv[3]]);', path.join(__dirname, '..', 'api', 'data', 'mathub.sqlite'), sql, arg]);
  const OFFER = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=test\r\nt=0 0\r\n';
  r = await call('anon', 'ai_status'); ok('live calls are switched on, with the realtime voices (cedar first)', r.voice.live === true && r.voice.live_default === 'cedar' && Object.keys(r.voice.live_voices)[0] === 'cedar' && 'marin' in r.voice.live_voices, r.voice);
  r = await call('bob', 'ai_live_start', { class: 'calc', sdp: OFFER }); ok('a live call needs Max', r.status === 402 && r.plan === 'max', r);
  r = await call('mod', 'ai_live_start', { class: 'calc', sdp: 'not sdp' }); ok('an offer that is not SDP is refused', r.status === 400, r);
  r = await call('mod', 'ai_live_start', { class: 'calc', sdp: OFFER, voice: 'marin', speed: 1.1, eagerness: 'high', snapshot, today: '2026-10-13' });
  const live1 = r; const L1 = rd('live-last.json', {}); const ls = L1.session || {};
  ok('a call starts: OpenAI\'s answer comes back with an id for the call', r.ok && /^v=0/.test(r.sdp) && /^[a-f0-9]{24}$/.test(r.lid) && r.left === 1800 && r.voice === 'marin', r);
  ok('the offer and the session go to OpenAI as a form, asking for SDP back', /s=test/.test(L1.sdp) && L1.accept === 'application/sdp' && ls.type === 'realtime' && ls.model === 'gpt-realtime-2.1-mini', { accept: L1.accept, model: ls.model });
  ok('the voice, speed and eagerness picked are used; semantic turn-taking with interruptions', ls.audio.output.voice === 'marin' && ls.audio.output.speed === 1.1 && ls.audio.input.turn_detection.eagerness === 'high' && ls.audio.input.turn_detection.type === 'semantic_vad' && ls.audio.input.turn_detection.interrupt_response === true, ls.audio);
  ok('Bo\'s live instructions: his persona, then the class, today, the student\'s progress and his notes', /You are Bo, the bobcat tutor from Mathub, on a live voice call/.test(ls.instructions) && /CLASS:/.test(ls.instructions) && /TODAY: 2026-10-13/.test(ls.instructions) && /WEAKEST TOPICS: Limits by algebra/.test(ls.instructions) && ls.instructions.length < 16000, ls.instructions.length);
  ok('his tools: writing on the board (code too), drawing on it, asking on it, and his notes', ls.tools.map(t => t.name).join() === 'write_on_board,draw_on_board,ask_on_board,remember' && ls.tools[0].parameters.required[0] === 'items' && ls.tools[0].parameters.properties.items.items.properties.kind.enum.join() === 'step,math,answer,tip,text,code' && ls.tools[0].parameters.properties.page.enum.join() === 'new,add', ls.tools && ls.tools[0].parameters);
  const ak = ls.tools[2].parameters;
  ok('the question tool takes a question and its answer, with choices to tap and a why', ak.required.join() === 'question,answer' && ak.properties.choices.type === 'array' && !!ak.properties.why && /stop and wait/i.test(ls.tools[2].description), ak);
  const dr = ls.tools[1].parameters;
  ok('the drawing tool takes a drawing of one of thirteen kinds, with what each kind needs described', dr.required.join() === 'drawing' && dr.properties.drawing.required.join() === 'type' && dr.properties.drawing.properties.type.enum.join() === 'graph,numberline,figure,unitcircle,table,bars,pie,scatter,boxplot,normal,tree,venn,flow' && /f is in x/.test(dr.properties.drawing.properties.fns.description) && dr.properties.drawing.properties.shapes.items.properties.kind.enum.includes('angle') && ['tangent', 'riemann', 'sliders', 'slices', 'boxes', 'sets', 'steps'].every(k => dr.properties.drawing.properties[k]), dr.properties.drawing.properties.type);
  ok('on a call he is told to teach the same way, to take a proper turn to explain something new, and to draw', /HOW YOU TEACH/.test(ls.instructions) && /Explaining something new does not: take a proper turn/.test(ls.instructions) && /draw_on_board: whenever a picture explains it better/.test(ls.instructions) && /ask_on_board: a question on the board/.test(ls.instructions) && !/Ask more than you tell/.test(ls.instructions) && ls.max_output_tokens === 1600, ls.max_output_tokens);
  r = await call('mod', 'ai_live_start', { class: 'calc', sdp: OFFER, voice: 'nobody', speed: 9, eagerness: 'wild' });
  const L2 = rd('live-last.json', {}).session;
  ok('unknown voices, speeds and eagerness fall back to the defaults (and the speed is kept in range)', r.ok && L2.audio.output.voice === 'cedar' && L2.audio.output.speed === 1.25 && L2.audio.input.turn_detection.eagerness === 'auto', L2.audio);
  ok('one call at a time: starting a new call hung up the last one', rd('live-hangups.json', []).length === 1, rd('live-hangups.json', []));
  const lid = r.lid;
  r = await call('mod', 'ai_live_tick', { lid }); ok('the browser reports the call; the minutes left come back', r.ok && r.left > 1790 && !r.end, r);
  r = await call('mod', 'ai_live_tick', { lid: live1.lid }); ok('the call that was replaced is over', r.ok && r.end === true && r.left === 0, r);
  r = await call('alice', 'ai_live_tick', { lid }); ok('another account cannot report on this call', r.status === 404, r);
  db('UPDATE ai_live SET secs = 1800 WHERE id = ?', lid);
  r = await call('mod', 'ai_live_tick', { lid }); ok('past the length of a call, the server ends it and says why', r.ok && r.end === true && /30 minutes/.test(r.why) && rd('live-hangups.json', []).length === 2, r);
  r = await call('mod', 'ai_live_start', { class: 'calc', sdp: OFFER, snapshot: Object.assign({}, snapshot, { name: 'REFUSE-FULL' }) });
  const tries = rd('live-tries.json', []).slice(-2);
  ok('if OpenAI refuses a setting, the call is tried again with the fewest settings', r.ok && tries[0].includes('max_output_tokens') && !tries[1].includes('max_output_tokens') && tries[1].includes('tools'), tries);
  await call('mod', 'ai_forget', { what: 'all' });
  r = await call('mod', 'ai_live_log', { lid: r.lid, turns: [{ r: 'b', t: 'Hey! What are we working on?' }, { r: 'u', t: 'The chain rule' }, { r: 'b', t: 'Outside, then inside. [board: $f(g(x))\'$]' }, { r: 'u', t: '' }], notes: ['Likes to talk it through', 'Likes to talk it through'], end: 1 });
  ok('what was said on the call is saved to the chat, and new notes to his notes (once)', r.ok && r.saved === 3 && r.notes.filter(n => n === 'Likes to talk it through').length === 1, r);
  r = await call('mod', 'ai_thread&class=calc'); ok('in order, marked as said out loud', r.turns.length === 3 && r.turns.every(t => t.v === 1) && r.turns[0].r === 'b' && r.turns[1].t === 'The chain rule' && /\[board:/.test(r.turns[2].t), r.turns);
  ok('ending the call hangs it up on OpenAI\'s side', rd('live-hangups.json', []).length === 3);
  r = await call('mod', 'ai_status'); ok('live minutes are counted, with the monthly limit, and what is left takes today\'s calls into account', typeof r.usage.live === 'number' && r.usage.live_limit === 18000 && r.usage.live_left <= 90 * 60 - 1800, r.usage);
  db('DELETE FROM ai_live WHERE user_id = (SELECT id FROM users WHERE email = ?)', 'mod.user@montana.edu');
  require('child_process').spawnSync('php', ['-r', '$d = new PDO("sqlite:" . $argv[1]); $d->exec("UPDATE ai_usage SET live = 0");', path.join(__dirname, '..', 'api', 'data', 'mathub.sqlite')]);
  await call('mod', 'ai_forget', { what: 'all' });

  // Download my data, then clean up
  r = await call('alice', 'data_export'); ok('Bo\'s chats, notes and usage are in Download my data', r.tables && Array.isArray(r.tables.ai_threads) && Array.isArray(r.tables.ai_usage) && Array.isArray(r.tables.ai_notes), Object.keys(r.tables || {}));
  await call('alice', 'ai_forget', { what: 'all' }); await call('mod', 'ai_forget', { what: 'all' });
  for (const c of ((await call('alice', 'myclasses')).classes || [])) await call('alice', 'myclass_delete', { id: c.id });
  try { fs.unlinkSync(STATE); } catch (e) {}
  await T.finish();
})().catch(e => { console.error(e); try { require('fs').unlinkSync(STATE); } catch (x) {} process.exit(1); });

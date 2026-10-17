/* ============================================================
   Mathub — Ask Bo (#/tutor, #/tutor/<class>): talk with Bo, an AI tutor who knows the class from its
   syllabus and how the student's studying is going. Part of Mathub Max. Website and apps.
   - Bo answers through Mathub's server (api/ai.php), which holds the AI key, keeps each request small
     (a compact class summary, a short progress snapshot, the last few turns, Bo's notes) and uses the
     smallest model that does the job. The chat and Bo's notes are kept with the account.
   - The progress snapshot is made here, from what this device knows: readiness for the next exam,
     the weakest and strongest topics, questions missed lately, flashcards due, what is due soon.
   - Before the first question the student is told what is sent to the AI provider and agrees.
   - Every answer can be copied, read aloud or reported; "What Bo knows" shows the snapshot and Bo's notes,
     which can be deleted one by one, with the chat.
   - Answers stream in as Bo writes them (App.boAsk). On the website, Talk opens a voice call with Bo
     (assets/talk.js); what is said there is saved in this chat too.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; const Courses = global.Courses; if (!App) return;
  const { $, $$, esc, icon, toast, settings, setSetting } = App;
  const N = global.Native; const MA = global.MATHUB_APP; const NATIVE = !!(N && MA && MA.native);
  const API = 'api/index.php?r=';
  const safe = f => { try { return f(); } catch (e) { return null; } };
  const H = () => App.home;
  const user = () => { const a = App.auth; return a && a.user && !a.user.local && a.mode === 'server' ? a.user : null; };
  const haptic = k => { if (NATIVE && N.haptic) N.haptic(k); };
  async function api(route, body) {
    const opts = { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Accept': 'application/json' }, cache: 'no-store' };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res, json; try { res = await fetch(API + route, opts); json = await res.json(); } catch (e) { throw Object.assign(new Error('Bo cannot be reached right now. Check your connection and try again.'), { network: true }); }
    if (!json || json.ok === false) throw Object.assign(new Error((json && json.error) || 'Something went wrong. Please try again.'), { status: res.status, data: json });
    return json;
  }
  const bo = n => (App.bobcatSvg ? App.bobcatSvg(n) : '');
  const talk = () => !!(App.boTalk && App.boTalk.supported());
  /* a question to Bo, his answer streamed: onDelta gets each piece as it is written; resolves with the whole answer */
  App.boAsk = async function (body, onDelta) {
    if (App.lang && App.lang !== 'en' && body && !body.lang) body = Object.assign({}, body, { lang: App.lang });   // Bo answers in the student's language
    let res; try { res = await fetch(API + 'ai_tutor', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Accept': 'application/x-ndjson, application/json', 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify(Object.assign({ stream: 1 }, body)) }); }
    catch (e) { throw Object.assign(new Error('Bo cannot be reached right now. Check your connection and try again.'), { network: true }); }
    if (!/ndjson/.test(res.headers.get('content-type') || '') || !res.body) { const j = await res.json().catch(() => null); if (!j || j.ok === false) throw Object.assign(new Error((j && j.error) || 'Bo could not answer just now. Please try again.'), { status: res.status, data: j }); return j; }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '', done = null;
    for (;;) {
      let r; try { r = await reader.read(); } catch (e) { break; }
      if (r.value) buf += dec.decode(r.value, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
        let o; try { o = JSON.parse(line); } catch (e) { continue; }
        if (o.t === 'd') { if (onDelta) onDelta(o.x || ''); } else if (o.t === 'done') done = o; else if (o.t === 'error') throw Object.assign(new Error(o.error || 'Bo could not answer just now.'), { status: o.status || 502 });
      }
      if (r.done) break;
    }
    if (!done) throw Object.assign(new Error('Bo was cut off. Please try again.'), { status: 502 });
    return done;
  };
  const plainHtml = h => { try { return (new DOMParser().parseFromString(String(h || ''), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim(); } catch (e) { return String(h || ''); } };
  const short = id => { const C = Courses[id]; return C ? (C.short || C.code) : id; };

  /* ---------- what Bo is told about the student: a short snapshot of this device's progress ---------- */
  function snapshot(id) {
    const C = Courses[id]; const s = {}; const u = user(); if (!C) return s;
    if (u && u.name) s.name = String(u.name).split(/\s+/)[0];
    const st = safe(() => App.streakAll()); if (st) s.streak = st.n;
    const xp = safe(() => App.xpToday()); if (xp !== null) { s.xpToday = xp; s.goal = safe(() => App.dailyGoal()) || 30; }
    const lv = settings().lastVisit; if (lv && lv.label) s.page = lv.label;
    const rd = safe(() => App.readiness(id));
    if (rd && rd.ok) {
      const items = (C.CHECKLISTS && C.CHECKLISTS[rd.exam.id]) || [];
      s.readiness = { exam: rd.exam.name, date: rd.exam.date, days: rd.days, score: rd.score, label: rd.label };
      if (items.length && rd.checkPart !== null) s.readiness.checklist = `${Math.round(rd.checkPart / 100 * items.length)}/${items.length}`;
      const tops = rd.topics.slice().sort((a, b) => a.score - b.score || a.a - b.a);
      s.weak = tops.filter(x => x.score < 0.85).slice(0, 6).map(x => Object.assign({ t: x.label, n: x.a }, x.acc === null ? {} : { acc: Math.round(x.acc * 100) / 100 }));
      s.strong = tops.filter(x => x.score >= 0.85).slice(-4).map(x => x.label);
    } else { const ex = safe(() => H().examOf(C)); if (ex) s.readiness = { exam: ex.name, date: ex.date, days: H().daysTo(ex), score: 0, label: 'no practice topics' }; }
    const T = (C.quiz && C.quiz.TOPICS) || C.quizTopics || {};
    const answer = q => { const a = q.type === 'mc' && typeof q.answer === 'number' && Array.isArray(q.options) ? q.options[q.answer] : q.answer; return plainHtml(a == null ? '' : String(a)).slice(0, 80); };
    const ms = safe(() => App.mistakesAll(id)) || [];
    if (ms.length) s.missed = ms.slice().sort((a, b) => b.at - a.at).slice(0, 5).map(m => ({ t: (T[m.t] && T[m.t].label) || m.t || '', q: plainHtml(m.q && m.q.prompt).slice(0, 200), c: answer(m.q || {}) }));
    s.mistakes = (safe(() => App.mistakesDue(id)) || []).length;
    s.due = safe(() => { const d = App.dueCards(id); return d.count + (d.estimated || 0); }) || 0;
    const t = App.todayISO(); const ids = safe(() => H().myIds()) || [id];
    s.deadlines = ids.flatMap(x => (safe(() => App.upcomingDeadlinesOf(Courses[x], 6)) || []).map(d => ({ d: d.date, t: `${short(x)}: ${d.title}` }))).filter(d => d.d >= t && App.daysBetween(t, d.d) <= 7).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 6);
    s.others = ids.filter(x => x !== id && Courses[x]).map(x => { const ex = safe(() => H().examOf(Courses[x])); return ex ? { c: short(x), ex: ex.name, days: H().daysTo(ex) } : { c: short(x) }; }).slice(0, 5);
    return s;
  }
  App.tutorSnapshot = snapshot;

  /* ---------- Bo's board ----------
     Bo works things out on a whiteboard, not in the chat bubble. In his replies a page of the board is a block:
         [board: Solving 2x + 3 = 11]
         step: Take 3 from both sides: $2x = 8$
         step: Divide both sides by 2: $x = 4$
         answer: $x = 4$
         tip: Check it: $2(4) + 3 = 11$
         [/board]
     Lines are text (words), math (LaTeX), step (what to do, then its math), answer (boxed), tip, draw (a graph,
     number line, figure, table, chart, tree…, as JSON: assets/board-draw.js; it may run on over several lines or
     sit in a ``` block under the draw: line), check (a question the student answers on the board, also JSON:
     {"q", "choices", "answer", "why"}) and code (a line of code; a ``` block on a page is code too). On a call
     Bo can keep writing on the page he is on ([board+: Title]). Older replies have one-line boards
     ([board: $x^2$]); they become a page without a title. Every page Bo wrote in a chat is kept, in order,
     so the board has pages to flip back through. Shared with the call (assets/talk.js) through App.boBoard. */
  const B_KIND = /^\s*(?:[-*•]\s+)?(text|math|step|answer|tip|note|draw|check|code)\s*:\s?(.*)$/i;
  const B_OPEN = /^\s*\[board(\+)?:\s*([^\]]*)\]\s*$/i;
  const B_CLOSE = /^\s*\[\/board\]\s*$/i;
  const kindOf = k => { k = String(k || '').toLowerCase(); return k === 'note' ? 'tip' : ['text', 'math', 'step', 'answer', 'tip', 'draw', 'check', 'code'].includes(k) ? k : 'text'; };
  const allTex = s => /^\s*\$\$?[^$]+\$\$?\s*\.?\s*$/.test(s);
  const unTex = s => String(s).trim().replace(/\.$/, '').replace(/^\$\$?|\$\$?$/g, '').trim();
  const looksTex = s => !/\$/.test(s) && /[=\\^_{}<>]/.test(s) && !/[a-z]{4,}/i.test(s.replace(/\\[a-z]+/gi, ''));
  const oneLine = x => ({ k: allTex(x) || looksTex(x) ? 'math' : 'text', t: x });
  /* a draw: or check: line whose JSON goes on over the next lines, or sits in a ``` block under it: all of it, the
     line it ends on, and whether its brackets have closed */
  function gather(lines, i, t) {
    const dep = App.boDraw ? App.boDraw.depth : () => 0; let j = i;
    if (!t.trim() || /^```\w*$/.test(t.trim())) {
      let k = j + 1; while (k < lines.length && (!lines[k].trim() || /^\s*```\w*\s*$/.test(lines[k]))) k++;
      if (k < lines.length && /^\s*\{/.test(lines[k])) { j = k; t = lines[k]; } else return { t: '', end: /^```/.test(t.trim()) ? k - 1 : i, done: k < lines.length };
    }
    t = t.replace(/^\s*```\w*\s*/, ''); let n = 0;
    while (dep(t) > 0 && j + 1 < lines.length && n++ < 160) { if (/^\s*```\s*$/.test(lines[j + 1])) { j++; break; } j++; t += '\n' + lines[j]; }
    const done = dep(t) <= 0;
    if (done && j + 1 < lines.length && /^\s*```\s*$/.test(lines[j + 1])) j++;   // the block's closing fence
    return { t: t.replace(/\s*```\s*$/, '').trim(), end: j, done };
  }
  /* is what follows draw: or check: JSON (on that line, or on the next ones, maybe in a ``` block)? */
  function jsonish(lines, i, t) {
    if (/^\s*(\{|```)/.test(t)) return true; if (t.trim()) return false;
    let k = i + 1; while (k < lines.length && !lines[k].trim()) k++; return k >= lines.length || /^\s*(\{|```)/.test(lines[k]);
  }
  /* an item added to a page: lines of code one after another are one block, the rest as they come */
  function addItem(page, k, t, extra) {
    const last = page.items[page.items.length - 1];
    if (k === 'code' && !extra && last && last.k === 'code' && last.lines) { last.t += '\n' + t; return last; }
    const it = Object.assign({ k, t }, k === 'code' && !extra ? { lines: true } : {}, extra || {}); page.items.push(it); return it;
  }
  /* a reply taken apart: what Bo says (with a marker where each page goes) and the pages he writes.
     writing: the reply is still coming in, so a half-written line is left for later */
  function boardSplit(text, writing) {
    let src = String(text || '').replace(/\r/g, '');
    if (writing) src = src.replace(/\[[^\]\n]*$/, '');   // a tag still being written
    const partial = writing && !/\n$/.test(src);
    const lines = src.split('\n'); const pages = []; const say = [];
    let cur = null, loose = null;
    const next = i => { for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) return B_KIND.test(lines[j]) || B_CLOSE.test(lines[j]) ? 1 : 0; return -1; };
    const mark = p => { pages.push(p); say.push(`\u0002${pages.length - 1}\u0002`); };
    const looseOf = () => { if (!loose) { loose = { title: '', items: [], open: false }; mark(loose); } return loose; };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (cur) {
        if (B_CLOSE.test(line)) { cur.open = false; cur = null; continue; }
        if (/^\s*```/.test(line)) {   // a block of code on the page (a ```json block that is a drawing goes up as the drawing)
          const lang = line.replace(/^\s*```/, '').trim().slice(0, 20); const body = []; let j = i + 1;
          while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) body.push(lines[j++]);
          const closed = j < lines.length; i = closed ? j : lines.length - 1; const t = body.join('\n').replace(/\s+$/, '');
          if (/^json$/i.test(lang) && App.boDraw && (closed || !writing) && App.boDraw.parse(t)) addItem(cur, 'draw', t.trim());
          else if (t || closed) addItem(cur, 'code', t, { lang });
          continue;
        }
        const k = B_KIND.exec(line);
        if (k) {
          const kind = kindOf(k[1]);
          if (kind === 'check' && !jsonish(lines, i, k[2])) { const t = k[2].trim(); if (t && !(partial && i === lines.length - 1)) addItem(cur, 'tip', t); continue; }   // "check: plug it back in" is a tip
          if (kind === 'draw' || kind === 'check') { const g = gather(lines, i, k[2]); i = g.end; if (g.t && (g.done || !writing)) addItem(cur, kind, g.t); continue; }
          if (kind === 'code') { if (!(partial && i === lines.length - 1)) addItem(cur, 'code', k[2].replace(/\s+$/, '')); continue; }
          const t = k[2].trim(); if (t && !(partial && i === lines.length - 1)) addItem(cur, kind, t); continue;
        }
        if (!line.trim()) continue;
        cur.open = false; cur = null;   // he forgot to close the page
      }
      const o = B_OPEN.exec(line);
      if (o && (next(i) === 1 || (writing && next(i) === -1))) { cur = { title: o[2].trim(), cont: !!o[1], items: [], open: true }; mark(cur); continue; }
      // a drawing or a question outside a page still goes on the board (and its JSON never shows in the chat)
      const dm = /^\s*(draw|check)\s*:\s?(.*)$/i.exec(line);
      if (dm && jsonish(lines, i, dm[2])) { const g = gather(lines, i, dm[2]); i = g.end; if (g.t && (g.done || !writing)) addItem(looseOf(), dm[1].toLowerCase(), g.t); continue; }
      const l = line.replace(/\[board\+?:\s*([^\]]*)\]/gi, (m, x) => { x = x.trim(); if (x) looseOf().items.push(oneLine(x)); return ' '; }).replace(/\[\/board\]/gi, ' ');
      if (l.trim() || !line.trim()) say.push(l);
    }
    if (cur && !writing) cur.open = false;
    pages.forEach(p => { if (!p.items.length && !p.open && p.title) { p.items.push(oneLine(p.title)); p.title = ''; } });
    return { say: say.join('\n').replace(/\n{3,}/g, '\n\n').trim(), pages };
  }
  /* new pages added after the ones already on the board ([board+: …] keeps writing on the last page); nothing is changed in place */
  function boardMerge(have, add) {
    const pages = have.slice();
    const ids = add.map(p => {
      const last = pages[pages.length - 1];
      if (p.cont && last && (!p.title || p.title === last.title)) { pages[pages.length - 1] = Object.assign({}, last, { items: last.items.concat(p.items), open: p.open }); return pages.length - 1; }
      pages.push(p); return pages.length - 1;
    });
    return { pages, ids };
  }
  const inlineMd = x => x.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
  const words = t => inlineMd(esc(t));
  const disp = t => `<div class="bb-math">$$${esc(unTex(t))}$$</div>`;
  /* a question on the board: check: {"q": "…", "choices": ["…", "…"], "answer": "the right choice", "why": "…"};
     with no choices the student types the answer (numbers are compared as numbers: 0.5, 1/2 and \frac{1}{2} match) */
  const S = (v, n) => typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim().slice(0, n) : '';
  const norm = x => String(x).replace(/\$/g, '').replace(/\\left|\\right|\\[,;!]|\s+/g, '').replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)').replace(/[−–]/g, '-').replace(/\*\*/g, '^').replace(/\*/g, '').replace(/^[a-z]=(?!=)/i, '').replace(/\.$/, '').toLowerCase();
  function checkOf(t) {
    const D = App.boDraw; let o = null; try { o = typeof t === 'object' ? t : D ? D.json(t) : JSON.parse(t); } catch (e) {}
    if (!o || typeof o !== 'object') return null;
    const q = S(o.q ?? o.question ?? o.prompt ?? o.ask ?? o.text, 400); if (!q) return null;
    const raw = Array.isArray(o.choices ?? o.options) ? (o.choices ?? o.options) : [];
    const opts = raw.slice(0, 6).map(c => { let x = S(c && typeof c === 'object' ? c.text ?? c.label : c, 160); const star = /^\*\s*/.test(x) || !!(c && typeof c === 'object' && c.correct); return { x: x.replace(/^\*\s*/, ''), star }; }).filter(c => c.x);
    const choices = opts.length >= 2 ? opts.map(c => c.x) : []; const ans = o.answer ?? o.correct ?? o.ans ?? o.solution;
    let pick = choices.length ? opts.findIndex(c => c.star) : -1;
    if (choices.length && pick < 0 && ans != null) {
      const a = String(ans).trim(); pick = choices.findIndex(c => norm(c) === norm(a));
      if (pick < 0 && /^[A-F]$/i.test(a)) pick = a.toUpperCase().charCodeAt(0) - 65;   // "B"
      if (pick < 0 && typeof ans === 'number' && Number.isInteger(ans)) pick = ans;   // an index
      if (pick >= choices.length) pick = -1;
    }
    const answers = choices.length ? [] : [].concat(ans ?? [], o.answers ?? [], o.accept ?? []).map(x => S(x, 80)).filter(Boolean).slice(0, 6);
    return { q, choices, pick, answers, why: S(o.why ?? o.explanation ?? o.explain ?? o.feedback, 500), hint: S(o.hint, 200) };
  }
  function gradeTyped(c, said) {
    if (!c.answers.length) return null;   // no answer to compare: Bo looks at it
    const D = App.boDraw; const s = norm(said);
    return c.answers.some(a => { const n = norm(a); if (n === s) return true; const x = D ? D.value(s) : NaN, y = D ? D.value(n) : NaN; return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= Math.max(0.005, 0.005 * Math.abs(y)); });
  }
  const rightOf = c => c.choices.length ? (c.pick >= 0 ? c.choices[c.pick] : '') : c.answers[0] || '';
  function checkFb(c, d) {
    const right = rightOf(c); const res = d.ok === true ? 'Right!' : d.ok === false ? (right ? `Not quite. The answer is ${right}.` : 'Not quite.') : 'Bo will look at your answer with you.';
    return `<b class="res">${d.ok === true ? icon('check', 15) + ' ' : ''}${words(res)}</b>${c.why && d.ok !== null ? `<p>${words(c.why)}</p>` : c.hint && d.ok === false ? `<p>${words(c.hint)}</p>` : ''}<div class="bb-chk-acts"><button type="button" class="btn sm" data-chk-ask="explain">${icon('chat', 14)} ${d.ok === true ? 'Why does it work?' : 'Explain it'}</button><button type="button" class="btn sm ghost" data-chk-ask="more">Another one</button></div>`;
  }
  let chkN = 0;
  function checkHtml(it, cls, st, idx) {
    const c = checkOf(it.t); if (!c) return badItem(cls, st, 'This question did not come out. Ask Bo for it again.');
    const d = it.done; const id = `bbc${++chkN}`;
    const body = c.choices.length
      ? `<div class="bb-chk-opts" role="group" aria-labelledby="${id}">${c.choices.map((x, k) => `<button type="button" class="bb-chk-o${d ? (k === c.pick ? ' ok' : k === d.pick ? ' no' : '') : ''}" data-chk-o="${k}"${d ? ' disabled' : ''}><span class="bb-chk-k" aria-hidden="true">${'ABCDEF'[k]}</span><span>${words(x)}</span></button>`).join('')}</div>`
      : `<form class="bb-chk-in" data-chk-form><label class="sr-only" for="${id}-in">Your answer</label><input class="input" id="${id}-in" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="80" placeholder="Your answer"${d ? ` value="${esc(d.said)}" disabled` : ''}><button type="submit" class="btn primary sm"${d ? ' disabled' : ''}>Check</button></form>`;
    return `<div class="${cls} bb-check" data-chk="${idx}"${st}><span class="bb-chk-l">${icon('target', 14)} Your turn</span><div class="bb-chk-q" id="${id}"><p>${words(c.q)}</p></div>${body}<div class="bb-chk-fb${d ? (d.ok === true ? ' ok' : d.ok === false ? ' no' : '') : ''}" aria-live="polite"${d ? '' : ' hidden'}>${d ? checkFb(c, d) : ''}</div></div>`;
  }
  const badItem = (cls, st, t) => `<div class="${cls} bb-draw-bad"${st}>${icon('pen', 15)}<p>${t}</p></div>`;
  function itemHtml(it, n, fresh, d, idx) {
    const t = String(it.t || ''); const cls = `bb-item bb-${it.k}${fresh ? ' bb-new' : ''}`; const st = fresh ? ` style="--d:${d}ms"` : '';
    if (it.k === 'math') return `<div class="${cls}"${st}>${allTex(t) || looksTex(t) || !/\s\w{4,}\s/.test(t) ? disp(t) : `<p>${words(t)}</p>`}</div>`;
    if (it.k === 'step') {
      // what to do, then its math on a line of its own: "Take 3 from both sides: $2x = 8$"
      const m = /^(.*?)[\s:;,—–-]*\$\$?([^$]+?)\$\$?\s*\.?\s*$/.exec(t); const say = m ? m[1].trim() : t; const tex = m ? m[2] : (looksTex(t) ? t : '');
      return `<div class="${cls}"${st}><span class="bb-n" aria-hidden="true">${n}</span><div class="bb-step-b"><span class="sr-only">Step ${n}: </span>${say && !(tex && say === t) ? `<p>${words(say)}</p>` : ''}${tex ? disp(tex) : ''}</div></div>`;
    }
    if (it.k === 'answer') return `<div class="${cls}"${st}><span class="bb-answer-l">${icon('check', 14)} Answer</span>${allTex(t) || looksTex(t) ? disp(t) : `<p>${words(t)}</p>`}</div>`;
    if (it.k === 'tip') return `<div class="${cls}"${st}><span class="bb-tip-i" aria-hidden="true">${icon('bulb', 15)}</span><p><span class="sr-only">Tip: </span>${words(t)}</p></div>`;
    if (it.k === 'draw') { const D = App.boDraw; const sp = D && D.parse(t); return sp ? `<figure class="${cls}"${st}>${D.html(sp, fresh)}</figure>` : badItem(cls, st, 'This drawing didn’t come out. Ask Bo to draw it again.'); }   // a graph, figure, table, chart…
    if (it.k === 'check') return checkHtml(it, cls, st, idx);
    if (it.k === 'code') return `<div class="${cls}"${st}>${it.lang ? `<span class="bb-code-l">${esc(it.lang)}</span>` : ''}<pre><code>${esc(t)}</code></pre></div>`;
    return `<div class="${cls}"${st}><p>${words(t)}</p></div>`;
  }
  const stepNo = (items, i) => items.slice(0, i + 1).filter(x => x.k === 'step').length;
  function pageHtml(p, fresh) {
    return `${p.title ? `<h3 class="bb-title">${words(p.title)}</h3>` : ''}<div class="bb-items">${p.items.map((it, i) => itemHtml(it, stepNo(p.items, i), fresh, i * 160, i)).join('')}</div>${p.open ? `<p class="bb-writing">${icon('pen', 14)} Bo is writing…</p>` : ''}`;
  }
  /* a page as plain text, for copying */
  const drawWords = t => { const D = App.boDraw; return D ? `[${D.plain(D.parse(t))}]` : '[A drawing]'; };
  const checkWords = t => { const c = checkOf(t); return c ? `Question: ${c.q}${c.choices.length ? ' ' + c.choices.map((x, k) => `${'ABCDEF'[k]}) ${x}`).join('  ') : ''}` : ''; };
  const pagePlain = p => [p.title, ...p.items.map((it, i) => it.k === 'draw' ? drawWords(it.t) : it.k === 'check' ? checkWords(it.t) : it.k === 'code' ? it.t : (it.k === 'step' ? `${stepNo(p.items, i)}. ` : it.k === 'answer' ? 'Answer: ' : it.k === 'tip' ? 'Tip: ' : '') + it.t)].filter(Boolean).join('\n');
  const EMPTY = `<div class="bb-empty"><p class="bb-empty-h">Nothing on the board yet</p><p>When Bo works something out, the steps, the formulas and the answer go up here, neatly, a page at a time.</p></div>`;
  function boardShell(o = {}) {
    return `<div class="bb-bar"><h2 class="bb-name" id="${o.id || 'bb'}-h">${icon('pen', 15)} Bo’s board</h2>
        <span class="bb-pager" hidden><button type="button" class="bb-btn" data-bb="prev" aria-label="Previous page">${icon('left', 16)}</button><span class="bb-pos" aria-live="polite"></span><button type="button" class="bb-btn" data-bb="next" aria-label="Next page">${icon('right', 16)}</button></span>
        <button type="button" class="bb-btn" data-bb="copy" aria-label="Copy this page" title="Copy this page" hidden>${icon('copy', 15)}</button>
        ${o.fold ? `<button type="button" class="bb-btn bb-fold" data-bb="fold" aria-expanded="true" aria-controls="${o.id || 'bb'}-sheet" aria-label="Fold the board away">${icon('chevron', 16)}</button>` : ''}</div>
      <div class="bb-sheet" id="${o.id || 'bb'}-sheet">${EMPTY}</div>`;
  }
  /* draws page i of pages on a board; write: Bo is writing it now, so new lines appear as if written */
  function boardPaint(root, pages, i, write) {
    if (!root) return; const s = root._bb || (root._bb = { shown: -1, drawn: 0, open: false, title: '' }); root._pages = pages;
    const sheet = $('.bb-sheet', root); const p = pages[i]; const anim = write && !still();
    if (!p) { sheet.innerHTML = EMPTY; s.shown = -1; }
    else if (write && s.shown === i && s.drawn <= p.items.length && s.title === p.title) {
      // the page on show grows: only the new lines are added
      const box = $('.bb-items', sheet); const add = p.items.slice(s.drawn); const from = s.drawn;
      const lastIt = p.items[from - 1]; if (lastIt && lastIt.t !== s.lastT && box.children[from - 1]) { const tmp = document.createElement('div'); tmp.innerHTML = itemHtml(lastIt, stepNo(p.items, from - 1), false, 0, from - 1); const nu = tmp.firstElementChild; if (nu) { box.children[from - 1].replaceWith(nu); if (App.typeset) safe(() => App.typeset(nu)); } }   // the last line grew (code still coming in)
      if (add.length) { const tmp = document.createElement('div'); tmp.innerHTML = add.map((it, j) => itemHtml(it, stepNo(p.items, from + j), anim, j * 160, from + j)).join(''); const nodes = [...tmp.children]; nodes.forEach(n => box.appendChild(n)); nodes.forEach(n => { if (App.typeset) safe(() => App.typeset(n)); }); }
      const w = $('.bb-writing', sheet); if (p.open && !w) sheet.insertAdjacentHTML('beforeend', `<p class="bb-writing">${icon('pen', 14)} Bo is writing…</p>`); else if (!p.open && w) w.remove();
      if (add.length) { const last = box.lastElementChild; if (last && sheet.scrollHeight > sheet.clientHeight) sheet.scrollTo({ top: sheet.scrollHeight, behavior: anim ? 'smooth' : 'auto' }); }
    } else {
      sheet.innerHTML = `<article class="bb-page${anim ? ' bb-fresh' : ''}">${pageHtml(p, anim)}</article>`; sheet.scrollTop = 0;
      if (App.typeset) safe(() => App.typeset(sheet));
    }
    if (p) Object.assign(s, { shown: i, drawn: p.items.length, open: !!p.open, title: p.title, lastT: p.items.length ? p.items[p.items.length - 1].t : '' });
    root.dataset.pages = pages.length; root.classList.toggle('has-page', !!p);
    const pg = $('.bb-pager', root); pg.hidden = pages.length < 2; $('.bb-pos', root).textContent = p ? `Page ${i + 1} of ${pages.length}` : '';
    $('[data-bb="prev"]', root).disabled = !p || i <= 0; $('[data-bb="next"]', root).disabled = !p || i >= pages.length - 1;
    $('[data-bb="copy"]', root).hidden = !p || p.open;
    if (root._onPaint) root._onPaint(p, i);
  }
  /* a question on the board answered: marked at once; root._onAnswer (a call: Bo hears it) and root._onAsk (the
     Explain and Another one buttons: a message to Bo) are set by whoever shows the board */
  function answerCheck(root, el, a) {
    const s = root._bb || {}; const p = (root._pages || [])[s.shown]; const idx = +el.dataset.chk; const it = p && p.items[idx]; if (!it || it.done) return;
    const c = checkOf(it.t); if (!c) return;
    const said = a.pick != null ? c.choices[a.pick] : a.said; const ok = a.pick != null ? (c.pick >= 0 ? a.pick === c.pick : null) : gradeTyped(c, said);
    it.done = { pick: a.pick != null ? a.pick : -1, said, ok };
    const tmp = document.createElement('div'); tmp.innerHTML = itemHtml(it, 0, false, 0, idx); const nu = tmp.firstElementChild; el.replaceWith(nu); if (App.typeset) safe(() => App.typeset(nu));
    if (App.sfx && ok !== null) safe(() => App.sfx.play(ok ? 'correct' : 'wrong')); else haptic('light');   // the sound brings its own tap in the app
    const fb = $('.bb-chk-fb', nu); if (fb && fb.getBoundingClientRect().bottom > (root.querySelector('.bb-sheet') || root).getBoundingClientRect().bottom) fb.scrollIntoView({ block: 'nearest', behavior: still() ? 'auto' : 'smooth' });
    if (root._onAnswer) root._onAnswer({ q: c.q, said, ok, answer: rightOf(c) });
  }
  function askAbout(root, el, kind) {
    const s = root._bb || {}; const p = (root._pages || [])[s.shown]; const it = p && p.items[+el.dataset.chk]; const c = it && checkOf(it.t); if (!c) return; const d = it.done || {};
    const text = kind === 'more' ? `Give me another question like this one: "${c.q}"` : `On the board you asked: "${c.q}" I answered "${d.said || '?'}"${d.ok === true ? ' and got it right. Why does it work?' : d.ok === false ? `, but the answer is "${rightOf(c)}". Explain it to me.` : '. Is that right? Explain it to me.'}`;
    if (root._onAsk) root._onAsk(text);
  }
  /* the board's own buttons: pages, copy, fold, and its questions */
  function boardWire(root, onFold) {
    root.addEventListener('submit', e => { const f = e.target.closest('[data-chk-form]'); if (!f) return; e.preventDefault(); const v = $('input', f).value.trim(); if (!v) { $('input', f).focus(); return; } answerCheck(root, f.closest('[data-chk]'), { said: v }); });
    root.addEventListener('click', async e => {
      const o = e.target.closest('[data-chk-o]'); if (o) { if (!o.disabled) answerCheck(root, o.closest('[data-chk]'), { pick: +o.dataset.chkO }); return; }
      const x = e.target.closest('[data-chk-ask]'); if (x) { askAbout(root, x.closest('[data-chk]'), x.dataset.chkAsk); return; }
      const b = e.target.closest('[data-bb]'); if (!b) return; const k = b.dataset.bb; const s = root._bb || {}; const pages = root._pages || [];
      if (k === 'prev' && s.shown > 0) boardPaint(root, pages, s.shown - 1, false);
      if (k === 'next' && s.shown < pages.length - 1) boardPaint(root, pages, s.shown + 1, false);
      if (k === 'copy' && pages[s.shown]) { const t = pagePlain(pages[s.shown]); try { await (NATIVE ? N.copy(t) : navigator.clipboard.writeText(t)); toast('Page copied.'); } catch (x) { toast('Copying is not available here.'); } }
      if (k === 'fold' && onFold) onFold();
    });
  }
  const still = () => (global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.documentElement.dataset.motion === 'off';
  App.boBoard = { KIND: B_KIND, OPEN: B_OPEN, CLOSE: B_CLOSE, kind: kindOf, oneLine, split: boardSplit, merge: boardMerge, shell: boardShell, paint: boardPaint, wire: boardWire, plain: pagePlain, add: addItem, check: checkOf, fmt: (sp, ids) => fmt(sp, ids), userHtml: (t, v) => userHtml(t, v), plainOf: src => plainOf(src) };

  /* ---------- Bo's answers: plain text with **bold**, lists and LaTeX, and a link to each page he wrote on the board ---------- */
  function fmt(sp, ids) {
    const code = []; const t = sp.say.replace(/\u0002(\d+)\u0002/g, '\n\n\u0001$1\n\n').replace(/\[remember:[^\]]*\]?\s*$/i, '')
      .replace(/(^|\n)```[^\n]*\n([\s\S]*?)(?:\n```|$)/g, (m, a, body) => `${a}\n\u0003${code.push(body) - 1}\n\n`); const seen = new Set();   // ``` blocks: code, as written
    return t.split(/\n{2,}/).filter(b => b.trim()).map(block => {
      if (block.trim().startsWith('\u0003')) return `<pre class="bo-code"><code>${esc(code[+block.trim().slice(1)] || '')}</code></pre>`;
      if (block.startsWith('\u0001')) { const i = +block.slice(1); const p = sp.pages[i]; const id = ids ? ids[i] : i; if (!p || seen.has(id)) return ''; seen.add(id); const first = p.items[0]; const name = p.title || (first ? (first.k === 'draw' ? 'a drawing' : first.k === 'check' ? 'a question for you' : first.k === 'code' ? 'some code' : first.k === 'math' || allTex(first.t) ? `$${unTex(first.t)}$` : first.t) : 'a page'); return `<button type="button" class="bo-onb" data-bo-page="${id}">${icon('pen', 15)}<span>On the board: <b>${words(name.length > 90 ? name.slice(0, 88) + '…' : name)}</b></span></button>`; }
      const lines = block.split('\n'); const li = l => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l);
      if (lines.every(li)) { const ol = /^\s*\d/.test(lines[0]); return `<${ol ? 'ol' : 'ul'}>${lines.map(l => `<li>${words(l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''))}</li>`).join('')}</${ol ? 'ol' : 'ul'}>`; }
      return `<p>${lines.map(l => words(l)).join('<br>')}</p>`;
    }).join('');
  }
  /* an answer as plain text, for copying: what Bo said, then his pages */
  const plainOf = src => { const sp = boardSplit(src); return [sp.say.replace(/\u0002\d+\u0002/g, '').trim(), ...sp.pages.map(pagePlain)].filter(Boolean).join('\n\n'); };
  /* a student's message: tags in front say where it came from ([photo], [pdf: name], [from: Quizzer · Q3], from the floating Bo) */
  const userHtml = (t, v) => {
    let q = String(t || ''), tags = ''; let m;
    while ((m = /^\[(photo|pdf(?::\s*[^\]]*)?|from:\s*[^\]]*)\]\s?/i.exec(q))) {
      const x = m[1]; q = q.slice(m[0].length);
      tags += /^photo$/i.test(x) ? `<span class="bo-photo-tag">${icon('image', 13)} Photo</span>` : /^pdf/i.test(x) ? `<span class="bo-photo-tag">${icon('file', 13)} ${esc(x.replace(/^pdf:?\s*/i, '') || 'PDF')}</span>` : `<span class="bo-photo-tag">${icon('target', 13)} ${esc(x.replace(/^from:\s*/i, ''))}</span>`;
    }
    return `${v ? `<span class="bo-photo-tag">${icon('mic', 13)} Said out loud</span>` : ''}${tags}${q ? `<p>${esc(q).replace(/\n/g, '<br>')}</p>` : ''}`;
  };
  const tools = () => `<div class="bo-tools">${talk() ? `<button type="button" class="bo-tool" data-bo-read aria-label="Read this answer aloud" title="Read aloud">${icon('volume', 15)}</button>` : ''}<button type="button" class="bo-tool" data-bo-copy aria-label="Copy this answer" title="Copy">${icon('copy', 14)}</button><button type="button" class="bo-tool" data-bo-report aria-label="Report this answer" title="Report">${icon('flag', 14)}</button></div>`;
  /* a message; for Bo's, ids are where his pages are on the board */
  const msgHtml = (r, t, extra = '', v = false, ids = null) => r === 'b'
    ? `<div class="bo-msg bo" data-src="${esc(t)}"><span class="bo-mini" aria-hidden="true">${bo(34)}</span><div class="bo-bubble"><div class="bo-text">${fmt(boardSplit(t), ids)}</div>${tools()}${extra}</div></div>`
    : `<div class="bo-msg you"><div class="bo-bubble">${userHtml(t, v)}</div></div>`;

  /* ---------- a photo of a problem, shrunk on the device so it costs little to send ---------- */
  function shrink(file, max = 1280) {
    return new Promise((res, rej) => {
      if (!/^image\//.test(file.type)) return rej(new Error('Pick a photo (JPEG, PNG or WebP).'));
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); const d = c.toDataURL('image/jpeg', 0.82); res({ type: 'image/jpeg', data: d.split(',')[1], preview: d }); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That photo could not be read.')); };
      img.src = url;
    });
  }
  App.shrinkPhoto = shrink;

  /* ---------- the screen ---------- */
  const st = { cid: null, status: null, busy: false, photo: null, notes: [] };
  App.views.tutor = {
    title: 'Ask Bo',
    render(root, param, query) {
      const ids = (safe(() => H().myIds()) || []).filter(x => Courses[x] && !(App.classLocked && App.classLocked(x)));
      const want = param && Courses[param] ? param : ids.includes(settings().boClass) ? settings().boClass : safe(() => H().curClass());
      st.cid = want && Courses[want] ? want : ids[0] || null;
      if (st.cid && !ids.includes(st.cid)) ids.unshift(st.cid);
      root.innerHTML = `<div class="bo-shell"><div class="bo-page bo-col">
        <header class="bo-head"><nav class="bo-nav" aria-label="Leave Ask Bo"><a class="btn sm bo-back" href="#/">${icon('left', 14)} Your classes</a>${st.cid && Courses[st.cid] ? `<a class="btn sm ghost" href="#/${esc(st.cid)}/dashboard">Open ${esc(short(st.cid))}</a>` : ''}</nav><span class="bo-av" aria-hidden="true">${bo(52)}</span><div class="bo-title"><h1>Ask Bo</h1><p>Your tutor${st.cid ? ` for <b>${esc(short(st.cid))}</b>` : ''}. He knows your syllabus and how your studying is going.</p></div>${talk() ? `<button type="button" class="btn primary bo-talk-btn" data-bo-talk hidden>${icon('phone', 17)}<span>Call Bo</span></button>` : ''}<button type="button" class="icon-btn bo-knows-btn" data-bo="knows" aria-label="What Bo knows about you" title="What Bo knows">${icon('info', 18)}</button></header>
        ${ids.length > 1 ? `<div class="bo-classes" role="tablist" aria-label="Which class">${ids.map(x => `<button type="button" role="tab" class="wh-tab bo-class${x === st.cid ? ' on' : ''}" aria-selected="${x === st.cid}" data-bo-class="${esc(x)}" style="${App.classStyle ? App.classStyle(x) : ''}">${esc(short(x))}</button>`).join('')}</div>` : ''}
        <section class="bb bo-board" id="bo-board" aria-labelledby="bob-h" hidden${settings().boBoardFold ? ' data-fold' : ''}>${boardShell({ id: 'bob', fold: true })}</section>
        <div class="bo-main" id="bo-main"><div class="bo-loading" aria-hidden="true"><i></i><i></i></div></div></div></div>`;
      $('.bo-page', root).addEventListener('click', e => {
        const c = e.target.closest('[data-bo-class]'); if (c) { setSetting('boClass', c.dataset.boClass); location.hash = '#/tutor/' + c.dataset.boClass; return; }
        if (e.target.closest('[data-bo="knows"]')) knowsSheet();
        if (e.target.closest('[data-bo-talk]')) openTalk(true);
      });
      const board = $('#bo-board', root);
      boardWire(board, () => fold(!board.hasAttribute('data-fold'), true));
      start($('#bo-main', root), query || {});
    }
  };

  async function start(main, query) {
    if (!user()) { main.innerHTML = gate('Sign in to talk with Bo', 'Bo is part of Mathub Max and works with your account, so he can follow your classes and progress on every device.', `<button type="button" class="btn primary lg" data-go="login">Log in</button><button type="button" class="btn" data-go="signup">Create an account</button>`); wireGate(main); return; }
    let s; try { s = st.status = await api('ai_status'); } catch (e) { main.innerHTML = gate('Bo cannot be reached', esc(e.message), `<button type="button" class="btn" data-go="retry">Try again</button>`); wireGate(main, () => start(main, query)); return; }
    st.notes = s.notes || []; if (App.boTalk) App.boTalk.setStatus(s);
    if (!s.enabled) { main.innerHTML = gate('Bo is getting ready', 'Bo is not switched on yet. He will be here soon.', ''); return; }
    if (!s.max) { main.innerHTML = intro(s.plan); wireGate(main, () => start(main, query)); return; }
    if (!settings().aiConsent) { main.innerHTML = consent(); wireGate(main, () => start(main, query)); return; }
    if (!st.cid) { main.innerHTML = gate('Pick a class first', 'Bo helps with a class you take. Choose your classes, or make one from a syllabus.', `<a class="btn primary" href="#/">Your classes</a><a class="btn" href="#/create">Create a class</a>`); return; }
    main.onclick = null; chat(main, query);
  }
  const gate = (h, p, acts) => `<section class="bo-gate"><span class="bo-gate-av" aria-hidden="true">${bo(96)}</span><h2>${h}</h2><p>${p}</p>${acts ? `<div class="bo-gate-acts">${acts}</div>` : ''}</section>`;
  function wireGate(main, again) {
    main.onclick = async e => {
      const b = e.target.closest('[data-go]'); if (!b) return; const g = b.dataset.go;
      if (g === 'login' || g === 'signup') { if (App.auth) App.auth.open(g); return; }
      if (g === 'retry') { again && again(); return; }
      if (g === 'max') { if (await App.paywall({ need: 'max', reason: 'bo' })) again && again(); return; }
      if (g === 'agree') { setSetting('aiConsent', Date.now()); haptic('success'); again && again(); return; }
      if (g === 'later') { location.hash = '#/'; }
    };
  }
  function intro(plan) {
    return `<section class="bo-gate bo-intro"><span class="bo-gate-av" aria-hidden="true">${bo(96)}</span><h2>Meet Bo, your tutor</h2>
      <p>Bo knows your classes from their syllabi and keeps up with how you are doing, so his help fits you.</p>
      <ul class="bo-perks"><li>${icon('chat', 18)}<span><b>Ask anything</b> about your classes, any time: “Why is the derivative of $\\sin x$ equal to $\\cos x$?”</span></li><li>${icon('target', 18)}<span><b>He knows where you are stuck</b>: your weakest topics, the questions you missed and your next exam.</span></li>${talk() ? `<li>${icon('phone', 18)}<span><b>Call him</b> and just talk, like with a friend: he answers right away, you can cut in, and he writes the math on his board.</span></li>` : ''}<li>${icon('image', 18)}<span><b>Snap a problem</b> and he walks you through it, step by step.</span></li><li>${icon('flag', 18)}<span><b>Plans and quizzes</b> built on your real exam dates.</span></li></ul>
      <div class="bo-gate-acts"><button type="button" class="btn primary lg" data-go="max">${plan === 'pro' ? 'Move up to Max' : 'Get Mathub Max'}</button></div>
      <p class="small muted">Mathub Max includes everything in Pro: Bo also writes your classes from their syllabi. <a href="#/plan">Compare the plans</a></p></section>`;
  }
  App.boGateHtml = { consent: () => consent(), intro: plan => intro(plan) };   // the floating Bo (assets/bo-float.js) asks the same way
  function consent() {
    return `<section class="bo-gate bo-consent" aria-labelledby="bo-consent-h"><span class="bo-gate-av" aria-hidden="true">${bo(80)}</span><h2 id="bo-consent-h">Before you start</h2>
      <p>To answer you, Bo sends what you ask (and any photo or PDF you add, and, when you ask him from a page, what is on that page), a summary of your class's syllabus and a short summary of your progress (your scores by topic, questions you missed, flashcards due and your exam dates) to <b>Anthropic</b>, the company that makes the Claude AI Bo runs on. Anthropic uses it only to write Bo's answer and does not train its AI on it.</p>
      <p>Your chat with Bo and the notes he keeps about how you like to learn are saved with your Mathub account, so they are on all your devices. You can see and delete them any time under “What Bo knows”. <a href="#/policy/privacy">Privacy Policy</a></p>
      <div class="bo-gate-acts"><button type="button" class="btn primary lg" data-go="agree">I agree, let's start</button><button type="button" class="btn ghost" data-go="later">Not now</button></div></section>`;
  }

  function suggestions(id) {
    const C = Courses[id]; const s = snapshot(id); const out = [];
    if (s.weak && s.weak[0]) out.push(`Explain ${s.weak[0].t} to me`);
    if (s.readiness && s.readiness.exam && s.readiness.days >= 0) out.push(`Quiz me for ${s.readiness.exam}`);
    out.push('Make me a study plan for tonight');
    if (s.missed && s.missed[0]) out.push('Why did I get my last missed question wrong?');
    if (!s.weak || !s.weak.length) out.push(`What is ${C && C.SECTIONS && C.SECTIONS[0] ? C.SECTIONS[0].title : 'this class'} about?`);
    return out.slice(0, 4);
  }
  App.boSuggestions = suggestions;
  /* after each answer: one tap to go on (simpler, another example, a question, a picture) */
  function followups(reply) {
    const items = [].concat(...boardSplit(reply).pages.map(p => p.items)); const drew = items.some(x => x.k === 'draw'), asked = items.some(x => x.k === 'check');
    return ['Explain it more simply', 'Show me another example', asked ? 'Give me another question' : 'Quiz me on this', drew ? 'Walk me through the drawing' : 'Draw it on the board'];
  }
  App.boFollowups = followups;
  const chips = list => list.map(x => `<button type="button" class="chip bo-chip" data-bo-say="${esc(x)}">${esc(x)}</button>`).join('');
  /* "Ask Bo about this", under a question the student missed (the quizzer, the mistakes notebook): straight into a
     chat with Bo about it. q is the question (prompt, options, answer, answerTex); said is what they answered. */
  const plainQ = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
  App.askBoHref = (cid, q, said) => {
    if (!cid || !q) return '';
    const opts = Array.isArray(q.options) ? q.options.map((o, k) => `${String.fromCharCode(65 + k)}) ${plainQ(o)}`) : [];
    const right = q.type === 'mc' && opts[q.answer] ? opts[q.answer] : q.answerTex ? `$${q.answerTex}$` : '';
    const text = `I got this question wrong: "${plainQ(q.prompt).slice(0, 700)}"${opts.length ? ` The choices were ${opts.join('; ').slice(0, 500)}.` : ''}${said ? ` I answered ${String(said).slice(0, 120)}.` : ''}${right ? ` The answer is ${right}.` : ''} Where did I go wrong, and how do I do it?`;
    return `#/tutor/${encodeURIComponent(cid)}?ask=${encodeURIComponent(text.slice(0, 1800))}`;
  };
  App.askBoButton = (cid, q, said) => { const h = App.askBoHref(cid, q, said); return h ? `<a class="btn sm ask-bo" href="${esc(h)}"><span class="ask-bo-av" aria-hidden="true">${bo(20)}</span> Ask Bo about this</a>` : ''; };
  /* the board sits beside the chat on wide screens; above it, sticky, on narrow ones, where it can be folded away */
  const wide = () => { const sh = $('.bo-shell'); return !!sh && sh.clientWidth >= 1000; };
  function fold(on, user) {
    const b = $('#bo-board'); if (!b) return; if (wide()) on = false;
    b.toggleAttribute('data-fold', !!on); const f = $('[data-bb="fold"]', b); if (f) { f.setAttribute('aria-expanded', String(!on)); f.setAttribute('aria-label', on ? 'Show the board' : 'Fold the board away'); }
    if (user) setSetting('boBoardFold', !!on);
  }
  /* the voice call; when it ends, the chat shows what was said */
  function openTalk(gesture) {
    if (!talk() || !st.cid || !st.status || !st.status.max) return;
    App.boTalk.open({ cid: st.cid, status: st.status, gesture, onClose: changed => { if (changed && /^#\/tutor/.test(location.hash)) App.rerender(); } });
  }
  function greeting(id) {
    const s = snapshot(id); const name = s.name ? `Hi ${esc(s.name)}! ` : 'Hi! ';
    const ex = s.readiness && s.readiness.exam && s.readiness.days >= 0 ? `${s.readiness.exam} is ${s.readiness.days === 0 ? 'today' : s.readiness.days === 1 ? 'tomorrow' : `in ${s.readiness.days} days`}${s.readiness.score ? ` and you are ${s.readiness.score}% ready` : ''}. ` : '';
    const weak = s.weak && s.weak[0] ? `Your weakest topic right now is ${s.weak[0].t}. Want to start there? ` : '';
    return `${name}I'm Bo. I know ${short(id)} from its syllabus and how your studying is going. ${ex}${weak}Ask me anything, or snap a photo of a problem.`;
  }

  async function chat(main, query) {
    const id = st.cid;
    main.innerHTML = `<div class="bo-log" id="bo-log" role="log" aria-live="polite" aria-label="Chat with Bo"></div>
      <div class="bo-suggest" id="bo-suggest"></div>
      <form class="bo-compose" id="bo-compose"><div class="bo-photo-prev" id="bo-photo-prev" hidden></div>
        <div class="bo-row"><label class="icon-btn bo-photo" title="Add a photo of a problem" aria-label="Add a photo of a problem">${icon('image', 19)}<input type="file" id="bo-file" accept="image/*" hidden></label>
        <label class="sr-only" for="bo-q">Ask Bo</label><textarea id="bo-q" class="input bo-q" rows="1" maxlength="2000" placeholder="Ask Bo about ${esc(short(id))}…"></textarea>
        ${talk() ? `<button type="button" class="icon-btn bo-mic" data-bo-talk aria-label="Call Bo and talk out loud" title="Call Bo">${icon('phone', 19)}</button>` : ''}<button type="submit" class="btn primary bo-send" aria-label="Send">${icon('send', 18)}</button></div>
        <p class="bo-foot" id="bo-foot">Bo is an AI and can be wrong. Check important answers against your notes or your instructor.</p></form>`;
    const log = $('#bo-log', main), q = $('#bo-q', main), form = $('#bo-compose', main), sug = $('#bo-suggest', main);
    const scroll = () => { const last = log.lastElementChild; if (last) last.scrollIntoView({ block: 'end', behavior: 'auto' }); };
    const typeset = el => { if (App.typeset) safe(() => App.typeset(el)); };
    const paintFoot = u => { if (!u) return; const left = Math.max(0, u.tutor_limit - u.tutor); $('#bo-foot', main).textContent = `Bo is an AI and can be wrong. Check important answers against your notes or your instructor. ${left} of ${u.tutor_limit} questions left this month.`; };
    paintFoot(st.status && st.status.usage);
    try { await App.loadCourse(id); } catch (e) {}
    let turns = []; try { turns = (await api('ai_thread&class=' + encodeURIComponent(id))).turns || []; } catch (e) {}
    // the board: every page Bo wrote in this chat, in order, the last one showing
    const board = $('#bo-board'); let pages = [];
    const add = text => { const v = boardMerge(pages, boardSplit(text).pages); pages = v.pages; return v.ids; };
    log.innerHTML = turns.length ? turns.map(t => t.r === 'b' ? msgHtml('b', t.t || '', '', !!t.v, add(t.t || '')) : msgHtml(t.r, t.t || '', '', !!t.v)).join('') : msgHtml('b', greeting(id));
    if (board) { board.hidden = false; fold(!!settings().boBoardFold); board._onPaint = (p, i) => { $$('.bo-onb', log).forEach(b => b.classList.toggle('on', +b.dataset.boPage === i)); }; boardPaint(board, pages, pages.length - 1, false); }
    const tb = $('[data-bo-talk][hidden]'); if (tb) tb.hidden = false;
    typeset(log); scroll();
    sug.innerHTML = chips(suggestions(id));
    if (board) board._onAsk = text => { q.value = text; grow(); form.requestSubmit(); };   // Explain it / Another one, under a question on the board
    if (query.talk && talk()) setTimeout(() => openTalk(false), 300);
    if (query.q === 'quiz') { const s = snapshot(id); q.value = s.readiness && s.readiness.exam ? `Quiz me for ${s.readiness.exam}: one question at a time, starting with my weakest topic.` : 'Quiz me: one question at a time, starting with my weakest topic.'; }
    const grow = () => { q.style.height = 'auto'; q.style.height = Math.min(q.scrollHeight, 168) + 'px'; }; q.addEventListener('input', grow); grow();
    const coarse = global.matchMedia && matchMedia('(pointer: coarse)').matches;
    q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !coarse) { e.preventDefault(); form.requestSubmit(); } });
    const prev = $('#bo-photo-prev', main);
    $('#bo-file', main).addEventListener('change', async e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return; try { st.photo = await shrink(f); prev.hidden = false; prev.innerHTML = `<img src="${st.photo.preview}" alt="Your photo"><button type="button" class="icon-btn" data-bo-unphoto aria-label="Remove the photo">${icon('x', 14)}</button>`; } catch (x) { toast(x.message); } });
    prev.addEventListener('click', e => { if (e.target.closest('[data-bo-unphoto]')) { st.photo = null; prev.hidden = true; prev.innerHTML = ''; } });
    sug.addEventListener('click', e => { const b = e.target.closest('[data-bo-say]'); if (!b) return; q.value = b.dataset.boSay; grow(); form.requestSubmit(); });
    log.addEventListener('click', async e => {
      const msg = e.target.closest('.bo-msg'); if (!msg) return; const text = msg.dataset.src ? plainOf(msg.dataset.src) : ($('.bo-text', msg) || msg).innerText.trim();
      const pg = e.target.closest('[data-bo-page]'); if (pg && board) { boardPaint(board, pages, +pg.dataset.boPage, false); fold(false); board.classList.remove('bb-flash'); void board.offsetWidth; board.classList.add('bb-flash'); if (board.getBoundingClientRect().bottom < 60) board.scrollIntoView({ block: 'nearest' }); return; }
      const rd = e.target.closest('[data-bo-read]'); if (rd) { App.boTalk.read(msg.dataset.src || text, rd, st.status); return; }
      if (e.target.closest('[data-bo-copy]')) { try { await (NATIVE ? N.copy(text) : navigator.clipboard.writeText(text)); toast('Copied.'); } catch (x) { toast('Copying is not available here.'); } return; }
      if (e.target.closest('[data-bo-report]')) { if (App.reportIssue) App.reportIssue({ title: 'Report this answer from Bo', view: 'Ask Bo', course: id, ref: 'Bo · ' + short(id), prompt: text.slice(0, 400), reason: 'wrong', placeholder: 'What is wrong with it? For example: a wrong fact, a wrong answer, or something inappropriate.' }); return; }
      if (e.target.closest('[data-bo-forget]')) { const i = st.notes.indexOf(e.target.closest('[data-bo-forget]').dataset.boForget); try { const r = await api('ai_forget', { what: 'note', i }); st.notes = r.notes || []; e.target.closest('.bo-remember').remove(); toast('Bo forgot it.'); } catch (x) { toast(x.message); } return; }
      if (e.target.closest('[data-bo-retry]')) { const t = msg.dataset.q || ''; msg.remove(); q.value = t; grow(); form.requestSubmit(); }
    });
    // from "Ask Bo about this": the question goes straight to Bo, once (the link is taken out of the address)
    if (query.ask) { q.value = String(query.ask).slice(0, 2000); grow(); try { history.replaceState(history.state, '', `${location.pathname}${location.search}#/tutor/${id}`); } catch (e) {} setTimeout(() => form.requestSubmit(), 60); }
    form.addEventListener('submit', async e => {
      e.preventDefault(); if (st.busy) return;
      const text = q.value.trim(); const photo = st.photo; if (!text && !photo) { q.focus(); return; }
      st.busy = true; q.value = ''; grow(); st.photo = null; prev.hidden = true; prev.innerHTML = ''; sug.hidden = true;
      log.insertAdjacentHTML('beforeend', msgHtml('u', (photo ? '[photo] ' : '') + text));
      log.insertAdjacentHTML('beforeend', `<div class="bo-msg bo typing" id="bo-typing"><span class="bo-mini" aria-hidden="true">${bo(34)}</span><div class="bo-bubble" aria-label="Bo is thinking"><i></i><i></i><i></i></div></div>`); scroll();
      // the answer appears as Bo writes it
      // the answer appears as Bo writes it; what he puts on the board goes up on the board as he writes it
      let live = null, sofar = '', frame = 0;
      const paintLive = () => {
        frame = 0; const sp = boardSplit(sofar.replace(/\[remember:[^\]]*\]?\s*$/i, ''), true); const v = boardMerge(pages, sp.pages);
        if (!live && (sp.say.replace(/\u0002\d+\u0002/g, '').trim() || sp.pages.length)) { const t = $('#bo-typing', log); if (t) t.remove(); log.insertAdjacentHTML('beforeend', `<div class="bo-msg bo live"><span class="bo-mini" aria-hidden="true">${bo(34)}</span><div class="bo-bubble"><div class="bo-text"></div></div></div>`); live = log.lastElementChild; }
        if (live) $('.bo-text', live).innerHTML = fmt(sp, v.ids);
        if (sp.pages.length && board) { boardPaint(board, v.pages, v.ids[v.ids.length - 1], true); if (!wide()) fold(false); }
        scroll();
      };
      try {
        const r = await App.boAsk(Object.assign({ class: id, q: text, snapshot: snapshot(id), today: App.todayISO() }, photo ? { image: { type: photo.type, data: photo.data } } : {}), d => { sofar += d; if (!frame) frame = requestAnimationFrame(paintLive); });
        cancelAnimationFrame(frame); const t = $('#bo-typing', log); if (t) t.remove(); if (live) live.remove();
        if (r.remembered) st.notes.push(r.remembered);
        if (r.usage && st.status) st.status.usage = r.usage;
        const ids = add(r.reply);
        log.insertAdjacentHTML('beforeend', msgHtml('b', r.reply, r.remembered ? `<p class="bo-remember">${icon('bulb', 13)} Bo will remember: ${esc(r.remembered)} <button type="button" class="linkbtn small" data-bo-forget="${esc(r.remembered)}">Forget it</button></p>` : '', false, ids));
        if (ids.length && board) boardPaint(board, pages, ids[ids.length - 1], true);
        typeset(log.lastElementChild); haptic('light'); paintFoot(r.usage);
        sug.innerHTML = chips(followups(r.reply)); sug.hidden = false; sug.classList.add('bo-next');
      } catch (x) {
        cancelAnimationFrame(frame); if (live) live.remove();
        if (board) boardPaint(board, pages, pages.length - 1, false);
        const t = $('#bo-typing', log); if (t) t.remove();
        if (x.status === 402) { App.rerender(); return; }
        log.insertAdjacentHTML('beforeend', `<div class="bo-msg bo err" data-q="${esc(text)}"><span class="bo-mini" aria-hidden="true">${bo(34)}</span><div class="bo-bubble"><p>${esc(x.message)}</p>${x.status === 429 ? '' : `<button type="button" class="btn sm" data-bo-retry>Try again</button>`}</div></div>`);
      }
      st.busy = false; scroll();
    });
  }

  /* ---------- What Bo knows: the snapshot in words, Bo's notes, and clearing, in a sheet (the i button) ---------- */
  function knowsHtml(id) {
    const s = id ? snapshot(id) : {}; const u = st.status && st.status.usage;
    const li = (h, v) => v ? `<li><b>${h}</b><span>${v}</span></li>` : '';
    const ready = s.readiness && s.readiness.exam ? `${esc(s.readiness.exam)}, ${s.readiness.days === 0 ? 'today' : s.readiness.days === 1 ? 'tomorrow' : `in ${s.readiness.days} days`}${s.readiness.score ? `<span class="bo-k-meter" aria-hidden="true"><i style="width:${Math.max(4, Math.min(100, s.readiness.score))}%"></i></span><small>${s.readiness.score}% ready</small>` : ''}` : '';
    const left = u ? Math.max(0, u.tutor_limit - u.tutor) : null;
    return `${id ? `<h3 class="bo-k-h">About ${esc(short(id))}</h3><p class="bo-k-sub">Sent with each question, so Bo's help fits you.</p><ul class="bo-k-list">
        ${li('The class', 'Its syllabus: dates, exams, grading and topics')}
        ${li('Next exam', ready)}
        ${li('Weakest topics', s.weak && s.weak.length ? esc(s.weak.slice(0, 3).map(w => w.t).join(', ')) : '')}
        ${li('Missed lately', s.missed && s.missed.length ? `${s.missed.length} question${s.missed.length === 1 ? '' : 's'}` : '')}
        ${li('To do', `${s.due || 0} flashcards due, ${s.mistakes || 0} missed questions to retry`)}
        ${li('Due soon', s.deadlines && s.deadlines.length ? esc(s.deadlines.slice(0, 3).map(d => d.t).join('; ')) : '')}</ul>` : ''}
      <h3 class="bo-k-h">Bo's notes about you</h3><div class="bo-k-notes">${st.notes.length ? `<ul class="bo-notes">${st.notes.map((n, i) => `<li><span>${esc(n)}</span><button type="button" class="icon-btn" data-k-note="${i}" aria-label="Delete this note">${icon('x', 14)}</button></li>`).join('')}</ul>` : '<p class="small muted">Nothing yet. When you tell Bo how you like to learn, he writes it down here.</p>'}</div>
      ${left !== null ? `<h3 class="bo-k-h">This month</h3><p class="bo-k-use"><span class="bo-k-meter" aria-hidden="true"><i style="width:${Math.round(left / Math.max(1, u.tutor_limit) * 100)}%"></i></span>${left} of ${u.tutor_limit} questions left · <a href="#/plan">Your plan</a></p>` : ''}
      <div class="bo-gate-acts">${id ? `<button type="button" class="btn sm" data-k="chat">Clear this chat</button>` : ''}<button type="button" class="btn sm ghost" data-k="all">Forget everything</button></div>`;
  }
  /* note deletes and clearing, for the panel and the sheet; after() repaints whichever asked */
  function wireKnows(el, after, close) {
    if (!el) return;
    el.addEventListener('click', async e => {
      const n = e.target.closest('[data-k-note]'); if (n) { try { const r = await api('ai_forget', { what: 'note', i: +n.dataset.kNote }); st.notes = r.notes || []; after(); } catch (x) { toast(x.message); } return; }
      const k = e.target.closest('[data-k]'); if (!k) return; const id = st.cid;
      if (!confirm(k.dataset.k === 'chat' ? `Clear your chat with Bo about ${short(id)}?` : 'Forget everything Bo knows about you: every chat and every note? Your classes and progress stay.')) return;
      try { await api('ai_forget', k.dataset.k === 'chat' ? { what: 'chat', class: id } : { what: 'all' }); if (k.dataset.k === 'all') st.notes = []; toast(k.dataset.k === 'chat' ? 'Chat cleared.' : 'Bo forgot everything.'); if (close) close(); App.rerender(); } catch (x) { toast(x.message); }
    });
  }
  async function knowsSheet() {
    const id = st.cid;
    const old = $('#bo-knows'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'bo-knows'; el.className = NATIVE ? 'modal-backdrop sheet-backdrop' : 'modal-backdrop pw-backdrop';
    el.innerHTML = `<div class="${NATIVE ? 'sheet' : 'modal'} pw bo-knows" role="dialog" aria-modal="true" aria-labelledby="bo-knows-h">${NATIVE ? '<div class="sheet-grab" aria-hidden="true"></div>' : ''}
      <div class="sheet-h"><h2 id="bo-knows-h">What Bo knows</h2><button class="icon-btn" data-action="close" aria-label="Close">${icon('x', 18)}</button></div>
      <div class="bo-k-body">${knowsHtml(id)}</div>
      <p class="small muted">Your chat and these notes are saved with your Mathub account. Questions go to Anthropic's AI to be answered; see the <a href="#/policy/privacy">Privacy Policy</a>.</p></div>`;
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('open'));
    const close = () => { document.removeEventListener('keydown', onKey); el.classList.remove('open'); setTimeout(() => el.remove(), 200); };
    const onKey = e => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', onKey);
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-action="close"]')) return close(); if (e.target.closest('a[href]')) return close(); });
    wireKnows(el, () => { $('.bo-k-body', el).innerHTML = knowsHtml(id); }, close);
  }

  /* ---------- ways in: the website's top bar, and the class pages ---------- */
  App.onRender = App.onRender || [];
  App.onRender.push((root, r) => {
    const top = $('#topbar .topbar-actions');
    if (top && !NATIVE) { let a = $('#bo-top', top); if (!a) { a = document.createElement('a'); a.id = 'bo-top'; a.className = 'bo-top'; a.innerHTML = `<span class="bo-top-av" aria-hidden="true">${bo(22)}</span><span>Ask Bo</span>`; const s = $('.search-btn', top); top.insertBefore(a, s || top.firstChild); } a.href = r.course ? `#/tutor/${r.course}` : '#/tutor'; }
  });
})(window);

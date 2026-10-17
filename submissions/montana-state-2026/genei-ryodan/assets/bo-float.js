/* ============================================================
   Bo, always there (website): he floats in a corner of every page, and one tap opens a small chat with him
   that knows what is on the screen.
   - What he sees (screen()): the page and the class; its questions and problems numbered as the student sees
     them, with the choices, what they answered, right or wrong, and a worked solution that is still hidden
     (for Bo to be right, not to give away); a flashcard and whether it is flipped; their code; the math as TeX;
     what is in view first. It goes with each question while the eye in the panel is on ("Bo sees this page").
   - Ways in, made for this page: the questions as chips (tap Q3: "help me with Q3"), Check my answers, Explain
     the topic, A problem like these, Quiz me; "Point at it" (tap any part of the page); select any text and
     "Explain" appears beside it; or just type, about anything.
   - A photo or a PDF of a problem set can go with a question.
   - Answers stream in, with his board pages inline (drawings, questions to answer, code), then one tap to go on.
     It is the class's chat with Bo, so Ask Bo (#/tutor) shows it too; "Open the full chat" goes there.
   - Drag him to either side, up or down; he stays where he is put. Alt+B opens him, Esc closes.
     Settings → "Bo on every page" turns him off. Not on Ask Bo itself, during a call, or in the apps (Bo is a tab).
   Needs tutor.js (App.boAsk, App.boBoard). Answers need Mathub Max, as in Ask Bo.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; const Courses = global.Courses; if (!App) return;
  const { $, $$, esc, icon, toast, settings, setSetting } = App;
  const N = global.Native; const MA = global.MATHUB_APP; if (N && MA && MA.native) return;   // the apps have Bo as a tab
  const API = 'api/index.php?r=';
  const safe = f => { try { return f(); } catch (e) { return null; } };
  const bo = n => (App.bobcatSvg ? App.bobcatSvg(n) : '');
  const user = () => { const a = App.auth; return a && a.user && !a.user.local && a.mode === 'server' ? a.user : null; };
  const still = () => (global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.documentElement.dataset.motion === 'off';
  const phone = () => global.innerWidth <= 640;
  const short = id => { const C = Courses[id]; return C ? (C.short || C.code) : id; };
  async function api(route, body) {
    const opts = { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Accept': 'application/json' }, cache: 'no-store' };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res, json; try { res = await fetch(API + route, opts); json = await res.json(); } catch (e) { throw Object.assign(new Error('Bo cannot be reached right now. Check your connection and try again.'), { network: true }); }
    if (!json || json.ok === false) throw Object.assign(new Error((json && json.error) || 'Something went wrong. Please try again.'), { status: res.status, data: json });
    return json;
  }

  /* ---------- where the student is ---------- */
  function where() {
    const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
    const course = parts[0] && Courses[parts[0]] ? parts[0] : null;
    return { course, view: course ? parts[1] || 'dashboard' : parts[0] || 'home' };
  }
  const HIDE_ON = ['tutor', 'welcome', 'admin', 'teach', 'faculty'];
  function pageName() {
    const r = where(); const V = App.current; const t = (V && V.title) || '';
    if (r.course) return `${short(r.course)} › ${t || r.view}`;
    return r.view === 'home' ? 'the start page' : t || r.view;
  }

  /* ---------- what is on the screen, as text Bo can read ----------
     The math goes back to its TeX (MathJax keeps it); hidden parts are left out unless asked for. */
  function texMap() {
    const m = new Map();
    try { const doc = global.MathJax && MathJax.startup && MathJax.startup.document; if (doc && doc.math) for (const it of doc.math) if (it && it.typesetRoot) m.set(it.typesetRoot, { tex: it.math, display: !!it.display }); } catch (e) {}
    return m;
  }
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'CANVAS', 'SELECT', 'VIDEO', 'AUDIO', 'IMG', 'OBJECT']);
  const BLOCK = /^(P|DIV|LI|UL|OL|H[1-6]|TR|TABLE|SECTION|ARTICLE|HEADER|FOOTER|FIGURE|FIGCAPTION|PRE|BLOCKQUOTE|DD|DT|DL|DETAILS|SUMMARY|FORM|NAV|ASIDE|MAIN|FIELDSET)$/;
  const shown = n => !n.hidden && n.getClientRects().length > 0;
  const NOREAD = '.sr-only, .bf-skip, nav, .sec-nav, .nav-label, .page-actions, .q-flag, .print-btn, .bb-bar, .tabs, [role="tablist"], .toolbar';   // menus and buttons are not the content
  const INLINE = /^(B|I|EM|STRONG|SUB|SUP|CODE|SMALL|MARK|U|S|KBD|VAR|ABBR)$/;
  function textOf(el, T, o = {}) {
    if (!el) return ''; let out = '';
    const walk = n => {
      if (n.nodeType === 3) { out += n.nodeValue; return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName, lo = tag.toLowerCase();
      if (o.skip && o.skip.has(n)) return;
      if (lo === 'mjx-container') { const t = T.get(n); out += t ? (t.display ? ` $$${t.tex}$$ ` : ` $${t.tex}$ `) : ` ${n.textContent} `; return; }
      if (lo === 'svg') { const ti = n.querySelector('title'); if (ti && ti.textContent.length > 12) out += `\n[A drawing: ${ti.textContent.trim()}]\n`; return; }
      if (SKIP.has(tag) || n.id === 'bo-fab' || n.id === 'bo-pop' || (!o.keepNav && n.matches(NOREAD))) return;
      if (n.getAttribute('aria-hidden') === 'true' && !n.querySelector('mjx-container')) return;
      if (!o.hidden && !shown(n) && lo !== 'mjx-container') return;
      if (tag === 'BUTTON' && !n.classList.contains('q-opt') && n.textContent.trim().length < 30) return;
      if (tag === 'TEXTAREA' || tag === 'INPUT') { const v = String(n.value || '').trim(); if (v && (tag === 'TEXTAREA' || /^(text|number|search|)$/i.test(n.type))) out += tag === 'TEXTAREA' ? `\n[What they wrote in ${n.id === 'py-code' ? 'the code editor' : 'a box'}:]\n${v.slice(0, 3000)}\n[end]\n` : ` [they typed: ${v.slice(0, 120)}] `; return; }
      const blk = BLOCK.test(tag); if (blk) out += '\n'; if (tag === 'LI') out += '- '; if (tag === 'TD' || tag === 'TH') out += ' | ';
      const pad = !blk && !INLINE.test(tag); if (pad) out += ' ';
      for (const c of n.childNodes) walk(c);
      if (blk) out += '\n'; else if (pad) out += ' ';
    };
    walk(el);
    return out.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  const clip = (s, n) => s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;

  /* the questions, problems and cards on the page, numbered as the student sees them */
  const ITEM = '.q-card, .lesson-q, .bz-q, .fc-card';
  function itemOf(el, k, T) {
    if (el.classList.contains('fc-card')) {
      const flipped = el.classList.contains('flipped'); const eb = $('.eyebrow', el);
      const front = textOf($('.fc-front', el), T, { hidden: true, skip: new Set($$('.fc-front .eyebrow', el)) }), back = textOf($('.fc-back', el), T, { hidden: true });
      return { el, label: 'This card', short: 'Card', kind: 'card', state: flipped ? 'flipped' : 'front', text: `[${eb ? eb.textContent.trim() : 'Flashcard'}]\nFront: ${front}\nBack${flipped ? '' : ' (not flipped yet, so they have not seen it)'}: ${back}`, front };
    }
    const num = $('.q-num', el); const lab = num ? num.textContent.trim() : '';
    const label = lab || (el.classList.contains('lesson-q') ? 'This question' : `Question ${k + 1}`);
    const sh = /^Q\d+$/.test(lab) ? lab : /^Problem\s+(\d+)$/i.test(lab) ? 'P' + lab.match(/\d+/)[0] : lab ? lab.slice(0, 12) : `#${k + 1}`;
    const topic = $('.q-top .chip.accent, .lesson-q > .eyebrow', el); const prompt = textOf($('.q-prompt', el) || el, T);
    const opts = $$('.q-opt', el).map(o => ({ letter: ($('.letter', o) || {}).textContent || '', t: textOf($('span:not(.letter)', o) || o, T), sel: o.classList.contains('selected'), ok: o.classList.contains('correct'), bad: o.classList.contains('wrong') }));
    const inp = $('input.input:not([type="checkbox"])', el); const typed = inp ? String(inp.value || '').trim() : '';
    const graded = el.classList.contains('correct') ? 'right' : el.classList.contains('wrong') ? 'wrong' : '';
    const picked = opts.find(o => o.sel || o.bad) || (graded === 'right' ? opts.find(o => o.ok) : null); const right = opts.find(o => o.ok);
    const fb = $('.q-feedback:not(.reveal), .lesson-fb', el); const feed = fb && shown(fb) ? textOf(fb, T) : '';
    const sol = $('.reveal', el); const solT = sol ? textOf(sol, T, { hidden: true }) : ''; const solShown = sol && shown(sol);
    let state = 'open', said = '';
    if (graded) state = graded; else if (picked || typed) state = 'answered';
    if (picked) said = `${picked.letter}) ${picked.t}`; else if (typed) said = typed;
    const L = [`[${label}]${topic ? ` (${topic.textContent.trim()})` : ''} ${prompt}`];
    if (opts.length) L.push('  Choices: ' + opts.map(o => `${o.letter}) ${o.t}`).join('  '));
    L.push(state === 'open' ? '  Not answered yet.' : state === 'answered' ? `  They answered ${said || 'it'} (not checked yet).` : state === 'right' ? `  They answered ${said || 'it'}: right.` : `  They answered ${said || 'it'}: wrong${right ? `; the answer is ${right.letter}) ${right.t}` : ''}.`);
    if (feed) L.push('  What the page tells them: ' + clip(feed, 700));
    if (solT) L.push(solShown ? '  Worked solution (open on the page): ' + clip(solT, 1200) : '  Worked solution (hidden from them; use it to be right, do not give it away unless they ask): ' + clip(solT, 1200));
    return { el, label, short: sh, kind: /^Problem/i.test(lab) ? 'problem' : 'question', state, text: L.join('\n'), prompt };
  }
  function screen() {
    const root = $('#view'); if (!root) return null;
    const T = texMap(); const r = where();
    const its = $$(ITEM, root).filter(el => !el.parentElement.closest(ITEM) && shown(el)).slice(0, 40).map((el, k) => itemOf(el, k, T));
    const skip = new Set(its.map(i => i.el));
    // what is in view now: the outermost blocks that cross the screen
    const top = 64, bot = global.innerHeight - 60;
    const cand = $$('h1, h2, h3, h4, p, li, pre, table, figure, blockquote, .note-block, .formula, .fc-card, .q-card', root).filter(el => { if ([...skip].some(s => s !== el && s.contains(el))) return false; const b = el.getBoundingClientRect(); return b.height > 0 && b.bottom > top && b.top < bot; });
    const outer = cand.filter(el => !cand.some(o => o !== el && o.contains(el)));
    const heading = $('.note-title, .page-title, h1', root); const sec = outer.length ? (outer[0].closest('.note-block') || null) : null;
    const secHead = sec ? $('h2, h3, .note-sub', sec) : null;
    const full = textOf(root, T, { skip });
    let body;
    if (full.length <= 5200) body = full;
    else {
      const inView = outer.filter(el => !skip.has(el)).map(el => textOf(el, T)).filter(Boolean).join('\n');
      const heads = $$('h1, h2, h3', root).filter(shown).map(h => h.textContent.trim()).filter(Boolean).slice(0, 30);
      body = `IN VIEW NOW:\n${clip(inView, 3000)}\n\nTHE PAGE'S HEADINGS: ${heads.join(' · ')}\n\nTHE START OF THE PAGE:\n${clip(full, 1600)}`;
    }
    // a worked solution on the page that they haven't opened: for Bo to be right, not to give away
    const hid = $$('.reveal', root).filter(x => !its.some(i => i.el.contains(x)) && !shown(x)).map(x => textOf(x, T, { hidden: true })).filter(Boolean);
    if (hid.length) body += `\n\nHIDDEN ON THE PAGE (a worked solution they haven't opened; use it to be right, don't give it away unless they ask):\n${clip(hid.join('\n'), 1500)}`;
    const code = $('#py-code', root); const kind = its.some(i => i.kind === 'card') ? 'card' : its.some(i => i.kind === 'problem') ? 'problems' : its.length ? 'questions' : code ? 'code' : r.view === 'notes' || $('.note-title', root) ? 'notes' : 'page';
    const topic = (secHead && secHead.textContent.trim()) || (heading && heading.textContent.trim()) || (App.current && App.current.title) || '';
    const lines = [`PAGE: ${pageName()}${heading && heading.textContent.trim() && !pageName().includes(heading.textContent.trim()) ? ` · "${heading.textContent.trim().slice(0, 90)}"` : ''}`];
    if (its.length) lines.push(`${its.length === 1 ? 'THE ITEM' : `THE ${its.length} ITEMS`} ON IT (numbered as they see them):`, ...its.map(i => i.text));
    if (body) lines.push(its.length ? '\nOTHER TEXT ON THE PAGE:\n' + clip(body, 2500) : 'WHAT IS ON IT:\n' + body);
    return { where: pageName(), kind, items: its, topic: clip(topic.replace(/\s+/g, ' '), 70), text: clip(lines.join('\n'), 9000), code: !!code };
  }
  App.boScreen = screen;   // for tests and for anyone who wants Bo to see the page

  /* ---------- state ---------- */
  const F = { open: false, el: null, fab: null, busy: false, cid: null, status: null, statusAt: 0, logs: {}, focus: null, file: null, point: null, hint: 0, hinted: new Set(), unread: false, uid: 0, dragged: false };
  const see = () => settings().boSee !== false;
  function pickCid() {
    const r = where(); const mine = safe(() => App.home.myIds()) || []; const ok = id => id && Courses[id] && !(App.classLocked && App.classLocked(id));
    if (ok(r.course)) return r.course;
    if (ok(F.cid)) return F.cid; if (ok(settings().boClass)) return settings().boClass;
    const cur = safe(() => App.home.curClass()); if (ok(cur)) return cur;
    return mine.find(ok) || null;
  }

  /* ---------- the floating button ---------- */
  function hidden() { const r = where(); return settings().boFloat === false || HIDE_ON.includes(r.view) || !!$('#bo-talk') || !!$('.tour'); }
  function build() {
    if (F.fab) return;
    const fab = F.fab = document.createElement('button'); fab.type = 'button'; fab.id = 'bo-fab'; fab.className = 'bf-fab';
    fab.setAttribute('aria-label', 'Ask Bo about this page (Alt+B)'); fab.setAttribute('aria-expanded', 'false'); fab.setAttribute('aria-controls', 'bo-pop');
    fab.innerHTML = `<span class="bf-fab-av">${bo(54)}</span><span class="bf-fab-l">Ask Bo</span><span class="bf-dot" aria-hidden="true"></span>`;
    document.body.appendChild(fab);
    const tip = document.createElement('div'); tip.id = 'bf-tip'; tip.className = 'bf-tip'; tip.hidden = true; tip.setAttribute('role', 'status'); document.body.appendChild(tip);
    tip.addEventListener('click', e => { if (e.target.closest('[data-tip="x"]')) { tip.hidden = true; return; } tip.hidden = true; openPanel(); });
    drag(fab); place();
    addEventListener('resize', () => place());
  }
  function place() {
    const fab = F.fab; if (!fab) return; const p = settings().boFab; fab.classList.toggle('left', !!(p && p.side === 'left'));
    if (p && typeof p.top === 'number') { const h = fab.offsetHeight || 60; const y = Math.max(70, Math.min(global.innerHeight - h - (phone() || global.innerWidth <= 900 ? 86 : 16), p.top * global.innerHeight)); fab.style.top = y + 'px'; fab.style.bottom = 'auto'; }
    else { fab.style.top = ''; fab.style.bottom = ''; }
    const tip = $('#bf-tip'); if (tip) tip.classList.toggle('left', fab.classList.contains('left'));
  }
  /* drag him anywhere; he settles on the nearer side and stays there */
  function drag(fab) {
    let s = null;
    fab.addEventListener('pointerdown', e => { if (e.button) return; const b = fab.getBoundingClientRect(); s = { x: e.clientX, y: e.clientY, dx: e.clientX - b.left, dy: e.clientY - b.top, moved: false, id: e.pointerId }; try { fab.setPointerCapture(e.pointerId); } catch (x) {} });
    fab.addEventListener('pointermove', e => {
      if (!s || e.pointerId !== s.id) return;
      if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 8) return;
      if (!s.moved) { s.moved = true; fab.classList.add('dragging'); $('#bf-tip').hidden = true; }
      fab.style.left = Math.max(4, Math.min(global.innerWidth - fab.offsetWidth - 4, e.clientX - s.dx)) + 'px'; fab.style.right = 'auto';
      fab.style.top = Math.max(4, Math.min(global.innerHeight - fab.offsetHeight - 4, e.clientY - s.dy)) + 'px'; fab.style.bottom = 'auto';
    });
    const end = e => {
      if (!s || (e && e.pointerId !== s.id)) return; const moved = s.moved; s = null; if (!moved) return;
      fab.classList.remove('dragging'); F.dragged = true; setTimeout(() => { F.dragged = false; }, 50);
      const b = fab.getBoundingClientRect(); const side = b.left + b.width / 2 < global.innerWidth / 2 ? 'left' : 'right';
      fab.style.left = ''; fab.style.right = ''; setSetting('boFab', { side, top: Math.round(b.top / global.innerHeight * 1000) / 1000 }); place();
    };
    fab.addEventListener('pointerup', end); fab.addEventListener('pointercancel', end);
    fab.addEventListener('click', () => { if (F.dragged) return; F.open ? closePanel() : openPanel(); });
    fab.addEventListener('keydown', e => { if (!e.altKey) return; const p = settings().boFab || {}; if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setSetting('boFab', Object.assign({}, p, { side: e.key === 'ArrowLeft' ? 'left' : 'right' })); place(); } });   // Alt+arrows move him too
  }
  function sync() {
    build(); const off = hidden(); F.fab.hidden = off || F.open; if (off && F.open) closePanel(true);
    if (F.open) refresh(); else if (!off) maybeTip();
  }
  // the page changed under the open panel: what he sees, and the ways in (or the other class's chat)
  function refresh() {
    if (!F.open || F.busy) return; const was = F.cid; paintCtx(); const b = $('#bf-body', F.el);
    if (F.gated || b.dataset.cid !== F.cid || was !== F.cid) paintBody(); else if (!logOf().length) paintWelcome(); else pageCard();
  }
  /* a nudge, now and then, on a page with questions: never more than three a visit, never twice for a page */
  function maybeTip() {
    clearTimeout(F.tipT); const tip = $('#bf-tip'); if (!tip) return; tip.hidden = true;
    if (!settings().boFloatSeen) {   // the first time: who he is and what he does, once
      F.tipT = setTimeout(() => { if (F.open || hidden() || document.hidden) return; setSetting('boFloatSeen', Date.now()); tip.innerHTML = `<button type="button" class="bf-tip-b"><span><b>I'm here on every page now.</b> Tap me to ask about what you're looking at, or select any text and tap Explain.</span></button><button type="button" class="bf-tip-x" data-tip="x" aria-label="Hide this tip">${icon('x', 13)}</button>`; tip.hidden = false; F.tipT2 = setTimeout(() => { tip.hidden = true; }, 12000); }, 2500);
      return;
    }
    if (settings().boTips === false || F.hint >= 3) return; const key = location.hash.split('?')[0]; if (F.hinted.has(key)) return;
    F.tipT = setTimeout(() => {
      if (F.open || hidden() || document.hidden) return; const c = safe(screen); if (!c || !['questions', 'problems', 'card', 'code'].includes(c.kind)) return;
      const wrong = c.items.filter(i => i.state === 'wrong').length;
      const t = c.kind === 'card' ? 'Stuck on this card? I can explain it.' : c.kind === 'code' ? 'Code not working? I can look at it.' : wrong ? (wrong === 1 ? 'Missed one? Tap me and we’ll go through it.' : 'Missed a few? Tap me and we’ll go through them.') : c.kind === 'problems' ? 'Stuck on one of these problems? Tap me.' : 'Stuck on one of these questions? Tap me.';
      F.hint++; F.hinted.add(key); tip.innerHTML = `<button type="button" class="bf-tip-b"><span>${esc(t)}</span></button><button type="button" class="bf-tip-x" data-tip="x" aria-label="Hide this tip">${icon('x', 13)}</button>`; tip.hidden = false;
      F.tipT2 = setTimeout(() => { tip.hidden = true; }, 9000);
    }, 6000);
  }

  /* ---------- the panel ---------- */
  function panel() {
    if (F.el) return F.el;
    const el = F.el = document.createElement('div'); el.id = 'bo-pop'; el.className = 'bf-pop'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'bf-h');
    el.innerHTML = `<div class="bf-grab" aria-hidden="true"></div>
      <header class="bf-head"><span class="bf-av" aria-hidden="true">${bo(40)}</span><div class="bf-ttl"><h2 id="bf-h">Ask Bo</h2><p class="bf-sub" id="bf-sub">Your tutor</p></div>
        <a class="bf-ic" id="bf-full" href="#/tutor" title="Open the full chat" aria-label="Open the full chat">${icon('external', 17)}</a><button type="button" class="bf-ic" data-bf="close" aria-label="Close (Esc)" title="Close">${icon('x', 19)}</button></header>
      <div class="bf-ctx" id="bf-ctx"></div>
      <div class="bf-body" id="bf-body"></div>
      <form class="bf-compose" id="bf-compose"><div class="bf-chips" id="bf-chips" hidden></div>
        <div class="bf-row"><label class="bf-ic" title="Add a photo or PDF of a problem set" aria-label="Add a photo or PDF of a problem set">${icon('upload', 18)}<input type="file" id="bf-file" accept="image/*,.pdf,application/pdf" hidden></label>
          <button type="button" class="bf-ic" data-bf="point" title="Point at something on the page" aria-label="Point at something on the page">${icon('target', 18)}</button>
          <label class="sr-only" for="bf-q">Ask Bo</label><textarea id="bf-q" class="bf-q" rows="1" maxlength="2000" placeholder="Ask about this page, or any topic…"></textarea>
          <button type="submit" class="btn primary bf-send" aria-label="Send">${icon('send', 17)}</button></div>
        <p class="bf-foot" id="bf-foot">Bo is an AI and can be wrong.</p></form>`;
    const back = document.createElement('div'); back.className = 'bf-back'; back.id = 'bf-back'; back.hidden = true; back.addEventListener('click', () => closePanel());
    document.body.appendChild(back); document.body.appendChild(el);
    const q = $('#bf-q', el), form = $('#bf-compose', el);
    const grow = () => { q.style.height = 'auto'; q.style.height = Math.min(q.scrollHeight, 140) + 'px'; }; F.grow = grow;
    q.addEventListener('input', grow);
    q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !(global.matchMedia && matchMedia('(pointer: coarse)').matches)) { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener('submit', e => { e.preventDefault(); const t = q.value.trim(); if (!t && !F.file) { q.focus(); return; } send(t || (F.file ? App.t('Can you help me with this problem set?') : '')); });
    $('#bf-file', el).addEventListener('change', async e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) addFile(f); });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-bf]'); if (b) { const k = b.dataset.bf;
        if (k === 'close') closePanel(); else if (k === 'point') startPoint(); else if (k === 'see') { setSetting('boSee', !see()); paintCtx(); if (!logOf().length) paintWelcome(); }
        else if (k === 'unfocus') { F.focus = null; paintChips(); } else if (k === 'unfile') { F.file = null; paintChips(); } else if (k === 'retry') { const m = b.closest('.bf-msg'); const t = m.dataset.q || ''; m.remove(); send(t); }
        else if (k === 'copy') { const m = b.closest('.bf-msg'); const t = App.boBoard ? App.boBoard.plainOf(m.dataset.src || '') : m.textContent; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Copied.'), () => toast('Copying is not available here.')); }
        return; }
      const s = e.target.closest('[data-say]'); if (s) { const it = s.dataset.item != null && F.items ? F.items[+s.dataset.item] : null; send(App.t(s.dataset.say), it ? { focus: it.text, tag: `${F.ctxWhere} · ${it.label}` } : {}); return; }
      const g = e.target.closest('[data-go]'); if (g) gateGo(g.dataset.go);
      if (e.target.closest('a[href^="#/"]') && phone()) closePanel();
    });
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } });
    return el;
  }
  async function openPanel(o = {}) {
    if (hidden()) return; const el = panel(); F.cid = pickCid();
    F.open = true; el.hidden = false; F.fab.hidden = true; F.fab.setAttribute('aria-expanded', 'true'); $('#bf-tip').hidden = true; clearTimeout(F.tipT);
    el.classList.toggle('left', F.fab.classList.contains('left')); $('#bf-back').hidden = !phone();
    F.unread = false; F.fab.classList.remove('unread');
    requestAnimationFrame(() => el.classList.add('open'));
    paintCtx(); await paintBody();
    if (o.focus) { F.focus = o.focus; paintChips(); }
    const q = $('#bf-q', el); if (!q.value) q.placeholder = phone() ? 'Ask Bo anything…' : 'Ask about this page, or any topic…';
    // focus goes into the panel: the box to type in, or (signed out, or on a phone, where the keyboard would hide the ways in) its first button
    if (!o.noFocus) setTimeout(() => { const t = !q.disabled && !phone() ? q : $('.bf-gate .btn.primary, .bf-gate .btn, .bf-item, .bf-act', el) || $('[data-bf="close"]', el); if (t && F.open) t.focus({ preventScroll: true }); }, 30);
  }
  function closePanel(quiet) {
    if (!F.open) return; F.open = false; const el = F.el; el.classList.remove('open'); $('#bf-back').hidden = true;
    setTimeout(() => { if (!F.open) el.hidden = true; }, still() ? 0 : 180);
    F.fab.hidden = hidden(); F.fab.setAttribute('aria-expanded', 'false'); if (!quiet && !F.fab.hidden) F.fab.focus();
  }
  App.boFloat = { open: openPanel, close: closePanel, screen, sync: () => sync(), ask: (t, o) => openPanel(o).then(() => send(t, o)) };

  /* what Bo can see: one chip, on or off */
  function paintCtx() {
    if (!F.el) return; const c = see() ? safe(screen) : null; F.ctx = c; F.ctxWhere = c ? c.where : pageName();
    const n = c && c.items.length; const what = !c ? '' : c.kind === 'card' ? 'this flashcard' : n ? (c.kind === 'problems' ? App.t(n === 1 ? '1 problem' : '{1} problems', n) : App.t(n === 1 ? '1 question' : '{1} questions', n)) : c.code ? 'your code' : '';
    $('#bf-ctx', F.el).innerHTML = `<button type="button" class="bf-see${see() ? ' on' : ''}" data-bf="see" aria-pressed="${see()}" title="${see() ? 'Bo sees what is on this page when you ask. Tap to turn it off.' : 'Bo does not see this page. Tap to let him.'}">${icon('eye', 15)}<span>${see() ? `Bo sees <b>${esc(F.ctxWhere)}</b>${what ? ` · ${esc(what)}` : ''}` : 'Bo isn’t looking at this page'}</span><i class="bf-sw" aria-hidden="true"></i></button>`;
    const cid = F.cid = pickCid(); $('#bf-sub', F.el).textContent = cid ? `Your tutor for ${short(cid)}` : 'Your tutor';
    $('#bf-full', F.el).setAttribute('href', cid ? `#/tutor/${cid}` : '#/tutor');
  }
  const logOf = () => (F.logs[F.cid || '_'] = F.logs[F.cid || '_'] || []);

  /* who can ask: signed in, Mathub Max, agreed to what is sent, and a class */
  async function status(force) {
    if (!force && F.status && Date.now() - F.statusAt < 60000) return F.status;
    F.status = await api('ai_status'); F.statusAt = Date.now(); if (App.boTalk && App.boTalk.setStatus) App.boTalk.setStatus(F.status); return F.status;
  }
  async function gate() {
    if (!user()) return `<div class="bf-gate"><p class="bf-gate-h">Sign in to ask Bo</p><p>Bo is your AI tutor in Mathub Max. He explains any topic, and sees the page you ask from: the questions on it, your answers, the notes you're reading.</p><div class="bf-gate-acts"><button type="button" class="btn primary" data-go="login">Log in</button><button type="button" class="btn" data-go="signup">Create an account</button></div></div>`;
    let s; try { s = await status(); } catch (e) { return `<div class="bf-gate"><p class="bf-gate-h">Bo can't be reached</p><p>${esc(e.message)}</p><div class="bf-gate-acts"><button type="button" class="btn" data-go="retry">Try again</button></div></div>`; }
    if (!s.enabled) return `<div class="bf-gate"><p class="bf-gate-h">Bo is getting ready</p><p>Bo isn't switched on yet. He'll be here soon.</p></div>`;
    if (!s.max) return `<div class="bf-gate"><p class="bf-gate-h">Bo is part of Mathub Max</p><ul class="bf-perks"><li>${icon('target', 16)}<span><b>He sees your page</b>: tap a question and he walks you through it, or checks your answers.</span></li><li>${icon('chat', 16)}<span><b>Explains anything</b>, a step at a time, with drawings on his board.</span></li><li>${icon('upload', 16)}<span><b>Reads your problem sets</b>: a photo or a PDF.</span></li></ul><div class="bf-gate-acts"><button type="button" class="btn primary" data-go="max">${s.plan === 'pro' ? 'Move up to Max' : 'Get Mathub Max'}</button><a class="btn ghost" href="#/plan">Compare the plans</a></div></div>`;
    if (!settings().aiConsent) return `<div class="bf-gate bf-consent">${App.boGateHtml ? App.boGateHtml.consent() : ''}</div>`;
    if (!F.cid) return `<div class="bf-gate"><p class="bf-gate-h">Pick a class first</p><p>Bo helps with a class you take. Choose your classes, or make one from a syllabus.</p><div class="bf-gate-acts"><a class="btn primary" href="#/">Your classes</a><a class="btn" href="#/create">Create a class</a></div></div>`;
    return '';
  }
  async function gateGo(g) {
    if (g === 'login' || g === 'signup') { closePanel(true); if (App.auth) App.auth.open(g); return; }
    if (g === 'retry') { F.statusAt = 0; paintBody(); return; }
    if (g === 'max') { closePanel(true); if (App.paywall && await App.paywall({ need: 'max', reason: 'bo' })) { F.statusAt = 0; openPanel(); } return; }
    if (g === 'agree') { setSetting('aiConsent', Date.now()); await paintBody(); const q = $('#bf-q', F.el); if (!phone()) q.focus(); return; }
    if (g === 'later') closePanel();
  }
  async function paintBody() {
    const body = $('#bf-body', F.el); const form = $('#bf-compose', F.el);
    const g = await gate(); F.gated = !!g;
    $('#bf-q', F.el).disabled = !!g; $$('.bf-send, [data-bf="point"], #bf-file', F.el).forEach(x => { x.disabled = !!g; });
    form.classList.toggle('off', !!g);
    if (g) { body.innerHTML = g; return; }
    const log = logOf();
    if (!log.length) paintWelcome(); else { if (body.dataset.cid !== F.cid || !body.querySelector('.bf-msg')) { body.innerHTML = ''; log.forEach(m => body.appendChild(m)); F.cardAt = F.lastWhere; } pageCard(); }
    body.dataset.cid = F.cid; paintFoot(); body.scrollTop = log.length ? body.scrollHeight : 0;
  }
  function paintFoot() { const u = F.status && F.status.usage; $('#bf-foot', F.el).textContent = `Bo is an AI and can be wrong.${u ? ` ${Math.max(0, u.tutor_limit - u.tutor)} of ${u.tutor_limit} questions left this month.` : ''}`; }

  /* the first thing in the panel: what he sees, and the ways in that fit this page */
  function paintWelcome() {
    const body = $('#bf-body', F.el); const c = F.ctx; const u = user(); const name = u && u.name ? ` ${esc(String(u.name).split(/\s+/)[0])}` : '';
    const w = waysIn(c);
    body.innerHTML = `<div class="bf-hi"><span class="bf-hi-av" aria-hidden="true">${bo(34)}</span><p><b>Hi${name}!</b> ${w.line}</p></div>${w.items}<div class="bf-acts">${w.acts}</div>
      ${c ? `<button type="button" class="bf-pointer" data-bf="point">${icon('target', 16)} <span><b>Point at it</b>: tap anything on the page and I'll look at it</span></button>` : ''}
      <p class="bf-tipline">Tip: select any text on the page and an <b>Explain</b> button appears.</p>`;
    F.cardAt = c ? c.where : ''; wireTopic(body);
  }
  /* the page changed during a conversation: a small card with the ways in for the new page */
  function pageCard() {
    const c = F.ctx; if (!c || c.where === F.cardAt) return; F.cardAt = c.where; const body = $('#bf-body', F.el);
    const old = body.lastElementChild; if (old && old.classList.contains('bf-page')) old.remove();
    $$('.bf-next', body).forEach(x => x.remove());
    const w = waysIn(c, true); const el = document.createElement('div'); el.className = 'bf-page';
    el.innerHTML = `<p class="bf-page-h">${icon('eye', 14)} <span>Now on <b>${esc(c.where)}</b>. ${w.line}</span></p>${w.items}<div class="bf-acts">${w.acts}</div>`;
    body.appendChild(el); wireTopic(el); stick(body, true);
  }
  const wireTopic = box => $$('[data-topic]', box).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const q = $('#bf-q', F.el); q.placeholder = 'Explain a topic, like "the chain rule"…'; q.value = 'Explain '; F.grow(); q.focus(); }, true));
  function waysIn(c, brief) {
    const its = c ? c.items : []; F.items = its;
    const answered = its.filter(i => i.state !== 'open').length, wrong = its.filter(i => i.state === 'wrong').length;
    const kindWord = c && c.kind === 'problems' ? 'problem' : 'question';
    // whole sentences, each one a line to translate (assets/i18n.js)
    const T = App.t; const N = its.length, P = kindWord === 'problem';
    const line = !c ? esc(T('Ask me about anything in {1}, or turn on “Bo sees” above and I\'ll look at this page with you.', short(F.cid)))
      : c.kind === 'card' ? esc(T('I can see your flashcard. Want me to explain it, or help you remember it?'))
      : N ? esc(T(answered ? (wrong ? (N === 1 ? (P ? 'I can see this problem ({1} answered, {2} wrong). Which one?' : 'I can see this question ({1} answered, {2} wrong). Which one?') : (P ? 'I can see these {3} problems ({1} answered, {2} wrong). Which one?' : 'I can see these {3} questions ({1} answered, {2} wrong). Which one?'))
          : (N === 1 ? (P ? 'I can see this problem ({1} answered). Which one?' : 'I can see this question ({1} answered). Which one?') : (P ? 'I can see these {3} problems ({1} answered). Which one?' : 'I can see these {3} questions ({1} answered). Which one?')))
          : (N === 1 ? (P ? 'I can see this problem. Which one?' : 'I can see this question. Which one?') : (P ? 'I can see these {3} problems. Which one?' : 'I can see these {3} questions. Which one?')), answered, wrong, N))
      : c.kind === 'code' ? esc(T('I can see your code. Tell me what it should do, or what goes wrong.'))
      : c.kind === 'notes' ? esc(T('You\'re reading “{1}”. I can explain it another way, give an example or quiz you on it.', c.topic || T('these notes')))
      : esc(T('You\'re on {1}. Ask me about anything here, or any topic.', c.where));
    const chip = (t, say, o = '') => `<button type="button" class="bf-act" data-say="${esc(say)}"${o}>${t}</button>`;
    const acts = [];
    if (c && c.kind === 'card') acts.push(chip(`${icon('bulb', 15)} Explain this card`, 'Explain this flashcard to me.', ' data-item="0"'), chip(`${icon('target', 15)} Help me remember it`, 'Help me remember this card: a trick, a picture or a story.', ' data-item="0"'), chip(`${icon('list', 15)} Quiz me on it`, 'Quiz me on this card and the idea behind it, one question at a time.', ' data-item="0"'));
    else if (its.length) {
      if (wrong) acts.push(chip(`${icon('undo', 15)} Go over what I missed`, wrong === 1 ? (P ? 'Go over the problem I got wrong on this page: what went wrong, and how to do it.' : 'Go over the question I got wrong on this page: what went wrong, and how to do it.') : (P ? 'Go over the problems I got wrong on this page: what went wrong, and how to do them.' : 'Go over the questions I got wrong on this page: what went wrong, and how to do them.')));
      if (answered && answered > wrong) acts.push(chip(`${icon('check', 15)} Check my answers`, 'Check my answers on this page: which are right, and what went wrong on the others?'));
      acts.push(chip(`${icon('bulb', 15)} Explain the topic`, P ? 'Explain the topic of these problems to me, simply, before I try them.' : 'Explain the topic of these questions to me, simply, before I try them.'), chip(`${icon('wand', 15)} ${P ? 'A problem like these' : 'A question like these'}`, P ? 'Give me a problem like these to practise, and help me if I get stuck.' : 'Give me a question like these to practise, and help me if I get stuck.'));
    } else if (c && c.kind === 'code') acts.push(chip(`${icon('flask', 15)} Why doesn't it work?`, 'Look at my code: what is wrong with it, and how do I fix it? Give me a hint before the answer.'), chip(`${icon('bulb', 15)} Explain my code`, 'Explain what my code does, line by line.'));
    else if (c && c.kind === 'notes') acts.push(chip(`${icon('bulb', 15)} Explain this more simply`, c.topic ? App.t('Explain “{1}” more simply, with an example.', c.topic) : 'Explain what I am reading more simply, with an example.'), chip(`${icon('pen', 15)} Draw it`, c.topic ? App.t('Draw “{1}” on your board and walk me through it.', c.topic) : 'Draw this on your board and walk me through it.'), chip(`${icon('list', 15)} Quiz me on this`, c.topic ? App.t('Quiz me on “{1}”, one question at a time.', c.topic) : 'Quiz me on what I am reading, one question at a time.'));
    else if (c) acts.push(chip(`${icon('bulb', 15)} Explain this page`, 'Explain what is on this page to me, simply.'), chip(`${icon('list', 15)} Quiz me on this`, 'Quiz me on what is on this page, one question at a time.'));
    if (!brief) acts.push(chip(`${icon('chat', 15)} Explain a topic…`, '', ' data-topic="1"'));
    const items = its.length && c.kind !== 'card' ? `<div class="bf-items" role="group" aria-label="${P ? 'The problems on this page' : 'The questions on this page'}">${its.map((i, k) => `<button type="button" class="bf-item ${i.state}" data-say="${esc(`Help me with ${i.label}.`)}" data-item="${k}" title="${esc(clip(i.prompt || '', 140))}"><span>${esc(i.short)}</span>${i.state === 'wrong' ? '<i aria-label="wrong"></i>' : i.state === 'right' ? '<i aria-label="right"></i>' : ''}</button>`).join('')}</div>` : '';
    return { line, items, acts: (brief ? acts.slice(0, 3) : acts).join('') };
  }

  /* ---------- what goes with a question: something pointed at or selected, a file ---------- */
  function paintChips() {
    const box = $('#bf-chips', F.el); const parts = [];
    if (F.focus) parts.push(`<span class="bf-chip focus">${icon('target', 14)}<span><b>${esc(F.focus.tag || 'This')}</b> ${esc(clip(F.focus.short || F.focus.text, 90))}</span><button type="button" data-bf="unfocus" aria-label="Don't send this">${icon('x', 13)}</button></span>`);
    if (F.file) parts.push(`<span class="bf-chip file">${F.file.preview ? `<img src="${F.file.preview}" alt="">` : icon('file', 14)}<span>${esc(F.file.name)}</span><button type="button" data-bf="unfile" aria-label="Remove the file">${icon('x', 13)}</button></span>`);
    if (F.focus) parts.push(`<span class="bf-quick">${['Explain this', 'Give me a hint', 'Show me the steps', 'Why is that the answer?'].slice(0, F.focus.answered ? 4 : 3).map(t => `<button type="button" class="bf-mini" data-say="${esc(t + '.')}">${esc(t)}</button>`).join('')}</span>`);
    box.innerHTML = parts.join(''); box.hidden = !parts.length;
  }
  async function addFile(f) {
    try {
      if (/^image\//.test(f.type)) { const p = await App.shrinkPhoto(f, 1600); F.file = { kind: 'image', type: p.type, data: p.data, preview: p.preview, name: f.name || 'Photo' }; }
      else if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) { if (f.size > 6.5e6) throw new Error('That PDF is too large. Keep it under 6.5 MB.'); const buf = new Uint8Array(await f.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); F.file = { kind: 'pdf', type: 'application/pdf', data: btoa(bin), name: f.name || 'Problem set.pdf' }; }
      else throw new Error('Bo reads photos and PDFs.');
      paintChips(); $('#bf-q', F.el).focus();
    } catch (x) { toast(x.message); }
  }

  /* ---------- asking, and his answer coming in ---------- */
  async function send(text, o = {}) {
    if (F.busy) return; if (!F.open) await openPanel({ noFocus: true }); if (F.gated) return;
    const cid = F.cid; if (!cid) return;
    const file = F.file; const focus = o.focus ? { text: o.focus, tag: o.tag } : F.focus; const c = see() ? safe(screen) : null;
    const tag = focus && focus.tag ? focus.tag : c ? c.where : '';
    text = String(text || '').trim(); if (!text && !file) return;
    F.busy = true; F.file = null; F.focus = null; paintChips(); const q = $('#bf-q', F.el); q.value = ''; F.grow(); q.placeholder = phone() ? 'Ask Bo anything…' : 'Ask about this page, or any topic…';
    const body = $('#bf-body', F.el); if (!logOf().length) body.innerHTML = '';
    $$('.bf-next', body).forEach(x => x.remove()); const pc = body.lastElementChild; if (pc && pc.classList.contains('bf-page')) pc.remove();
    F.cardAt = F.lastWhere = c ? c.where : F.cardAt;
    const shownQ = `${file ? (file.kind === 'pdf' ? `[pdf: ${file.name}] ` : '[photo] ') : ''}${tag && (c || focus) ? `[from: ${tag}] ` : ''}${text}`;
    const you = document.createElement('div'); you.className = 'bf-msg you'; you.innerHTML = `<div class="bf-bub">${App.boBoard ? App.boBoard.userHtml(shownQ) : esc(text)}</div>`; body.appendChild(you); logOf().push(you);
    const me = document.createElement('div'); me.className = 'bf-msg bo typing'; me.innerHTML = `<span class="bf-mini-av" aria-hidden="true">${bo(28)}</span><div class="bf-bub"><div class="bf-flow"></div><span class="bf-dots" aria-label="Bo is thinking"><i></i><i></i><i></i></span></div>`;
    body.appendChild(me); logOf().push(me); body.scrollTop = body.scrollHeight;
    const flow = $('.bf-flow', me); let sofar = '', frame = 0;
    const paint = () => { frame = 0; if (sofar) me.classList.remove('typing'); paintFlow(flow, sofar, true); stick(body); };
    const req = { class: cid, q: text || 'Can you help me with this?', snapshot: safe(() => App.tutorSnapshot(cid)) || {}, today: App.todayISO() };
    if (c) req.screen = c.text; if (focus && focus.text) req.focus = String(focus.text).slice(0, 3000); if (tag && (c || focus)) req.where = String(tag).slice(0, 80);
    if (file) { if (file.kind === 'pdf') req.file = { type: file.type, data: file.data, name: file.name }; else req.image = { type: file.type, data: file.data }; }
    try {
      const r = await App.boAsk(req, d => { sofar += d; if (!frame) frame = requestAnimationFrame(paint); });
      cancelAnimationFrame(frame); me.classList.remove('typing'); me.dataset.src = r.reply;
      paintFlow(flow, r.reply, false); if (App.typeset) safe(() => App.typeset(flow));
      $('.bf-dots', me) && $('.bf-dots', me).remove();
      $('.bf-bub', me).insertAdjacentHTML('beforeend', `<div class="bf-tools"><button type="button" class="bf-tool" data-bf="copy" aria-label="Copy" title="Copy">${icon('copy', 14)}</button></div>`);
      if (r.remembered) $('.bf-bub', me).insertAdjacentHTML('beforeend', `<p class="bf-note">${icon('bulb', 13)} Bo will remember: ${esc(r.remembered)}</p>`);
      if (r.usage && F.status) { F.status.usage = r.usage; paintFoot(); }
      const next = App.boFollowups ? App.boFollowups(r.reply) : []; if (next.length) { const n = document.createElement('div'); n.className = 'bf-next'; n.innerHTML = next.map(t => `<button type="button" class="bf-mini" data-say="${esc(t)}">${esc(t)}</button>`).join(''); body.appendChild(n); }
      stick(body, true);
      if (!F.open) { F.unread = true; F.fab.classList.add('unread'); const tip = $('#bf-tip'); tip.innerHTML = `<button type="button" class="bf-tip-b"><span>Bo answered. Tap to read it.</span></button>`; tip.hidden = false; clearTimeout(F.tipT2); F.tipT2 = setTimeout(() => { tip.hidden = true; }, 8000); }
    } catch (x) {
      cancelAnimationFrame(frame); me.remove(); const i = logOf().indexOf(me); if (i >= 0) logOf().splice(i, 1);
      if (x.status === 402) { F.statusAt = 0; await paintBody(); F.busy = false; return; }
      const err = document.createElement('div'); err.className = 'bf-msg bo err'; err.dataset.q = text; err.innerHTML = `<span class="bf-mini-av" aria-hidden="true">${bo(28)}</span><div class="bf-bub"><p>${esc(x.message)}</p>${x.status === 429 ? '' : `<button type="button" class="btn sm" data-bf="retry">Try again</button>`}</div>`;
      body.appendChild(err); logOf().push(err); stick(body, true);
    }
    F.busy = false;
  }
  // keep the newest words in view, unless they scrolled up to read
  const stick = (body, force) => { if (force || body.scrollHeight - body.scrollTop - body.clientHeight < 140) body.scrollTop = body.scrollHeight; };
  /* his answer: what he says, and each board page right where it goes, drawn as it comes in */
  function paintFlow(flow, text, writing) {
    const BB = App.boBoard; if (!BB) { flow.textContent = text; return; }
    const sp = BB.split(String(text).replace(/\[remember:[^\]]*\]?\s*$/i, ''), writing);
    const segs = []; sp.say.split(/\u0002(\d+)\u0002/).forEach((x, k) => { if (k % 2) segs.push({ page: +x }); else if (x.trim()) segs.push({ text: x }); });
    segs.forEach((g, k) => {
      let el = flow.children[k];
      if (el && (g.page != null) !== el.classList.contains('bf-board')) { while (flow.children.length > k) flow.lastChild.remove(); el = null; }
      if (g.page == null) {
        if (!el) { el = document.createElement('div'); el.className = 'bf-say bo-text'; flow.appendChild(el); }
        const h = BB.fmt({ say: g.text, pages: [] }); if (el._h !== h) { el.innerHTML = h; el._h = h; }
      } else {
        const p = sp.pages[g.page]; if (!p) return;
        if (!el) { el = document.createElement('section'); el.className = 'bb bf-board'; el.innerHTML = BB.shell({ id: `bf${++F.uid}` }); BB.wire(el); el._onAsk = t => send(t); flow.appendChild(el); }
        BB.paint(el, [p], 0, true);
      }
    });
    while (flow.children.length > segs.length) flow.lastChild.remove();
  }

  /* ---------- point at it: tap any part of the page ---------- */
  const PICK = '.q-card, .lesson-q, .bz-q, .fc-card, .note-block, figure, table, pre, blockquote, .bb, li, p, h1, h2, h3, h4, .panel, .card';
  const pickable = t => { const v = $('#view'); if (!t || !t.closest || !v || !v.contains(t)) return null; return t.closest(ITEM) || t.closest(PICK); };
  function startPoint() {
    if (F.point || F.gated) return; const wasOpen = F.open; if (F.open && phone()) closePanel(true);
    const bar = document.createElement('div'); bar.className = 'bf-pointbar'; bar.setAttribute('role', 'status');
    bar.innerHTML = `<span class="bf-pointbar-av" aria-hidden="true">${bo(26)}</span><span>Tap the part of the page you want Bo to look at</span><button type="button" class="btn sm">Cancel</button>`;
    const hl = document.createElement('div'); hl.className = 'bf-hl'; hl.hidden = true;
    document.body.append(bar, hl); document.documentElement.classList.add('bf-pointing');
    let cur = null;
    const over = e => { const el = pickable(document.elementFromPoint(e.clientX, e.clientY)); cur = el; if (!el) { hl.hidden = true; return; } const b = el.getBoundingClientRect(); Object.assign(hl.style, { left: b.left - 4 + 'px', top: b.top - 4 + 'px', width: b.width + 8 + 'px', height: b.height + 8 + 'px' }); hl.hidden = false; };
    const click = e => {
      if (bar.contains(e.target)) { if (e.target.closest('button')) { e.preventDefault(); stop(); if (wasOpen && !F.open) openPanel(); } return; }
      if (F.el && F.el.contains(e.target)) return;
      e.preventDefault(); e.stopPropagation(); const el = pickable(e.target) || cur; if (!el) return;
      stop(); const T = texMap(); const its = $$(ITEM, $('#view')); const k = its.indexOf(el);
      const it = k >= 0 ? itemOf(el, k, T) : null; const text = it ? it.text : textOf(el, T);
      if (!text) { toast('There is nothing for Bo to read there.'); return; }
      openPanel({ focus: { text: clip(text, 3000), tag: it ? `${F.ctxWhere || pageName()} · ${it.label}` : 'What you pointed at', short: it ? it.prompt || text : text, answered: !!(it && it.state !== 'open') } });
    };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stop(); if (wasOpen) openPanel(); } };
    const stop = () => { F.point = null; document.removeEventListener('pointermove', over, true); document.removeEventListener('click', click, true); document.removeEventListener('keydown', key, true); bar.remove(); hl.remove(); document.documentElement.classList.remove('bf-pointing'); };
    F.point = stop;
    document.addEventListener('pointermove', over, true); document.addEventListener('click', click, true); document.addEventListener('keydown', key, true);
  }

  /* ---------- select any text: Explain appears beside it ---------- */
  let selT = 0;
  function selPill() {
    let p = $('#bo-sel'); if (p) return p;
    p = document.createElement('div'); p.id = 'bo-sel'; p.className = 'bf-sel'; p.hidden = true; p.setAttribute('role', 'toolbar'); p.setAttribute('aria-label', 'Ask Bo about the selected text');
    p.innerHTML = `<button type="button" data-sel="explain"><span class="bf-sel-av" aria-hidden="true">${bo(22)}</span>Explain</button><button type="button" data-sel="ask">Ask Bo…</button>`;
    p.addEventListener('mousedown', e => e.preventDefault());   // keep the selection
    p.addEventListener('click', e => {
      const b = e.target.closest('[data-sel]'); if (!b) return; const s = p._sel; p.hidden = true; if (!s) return;
      const focus = { text: s.ctx ? `They selected: «${s.text}»\nIn: ${s.ctx}` : `They selected: «${s.text}»`, tag: `“${clip(s.text, 48)}”`, short: `“${s.text}”` };
      try { getSelection().removeAllRanges(); } catch (x) {}
      if (b.dataset.sel === 'explain') { openPanel({ focus, noFocus: true }).then(() => { if (!F.gated) send(App.t('Explain this to me.')); }); }
      else openPanel({ focus });
    });
    document.body.appendChild(p); return p;
  }
  function onSel() {
    if (F.point || hidden()) return; const p = selPill(); const sel = global.getSelection && getSelection();
    const t = sel && !sel.isCollapsed ? String(sel).replace(/\s+/g, ' ').trim() : ''; const v = $('#view');
    const a = sel && sel.anchorNode; const node = a && (a.nodeType === 1 ? a : a.parentElement);
    if (!t || t.length < 2 || t.length > 1500 || !v || !node || !v.contains(node) || node.closest('input, textarea, [contenteditable], #bo-pop')) { p.hidden = true; return; }
    const r = sel.getRangeAt(0).getBoundingClientRect(); if (!r.width && !r.height) { p.hidden = true; return; }
    const block = node.closest(ITEM) || node.closest('p, li, .note-block, td, pre, figure, h1, h2, h3, .panel');
    p._sel = { text: clip(t, 1200), ctx: block ? clip(textOf(block, texMap()), 1500) : '' };
    p.hidden = false; const w = p.offsetWidth || 170, h = p.offsetHeight || 40; const coarse = global.matchMedia && matchMedia('(pointer: coarse)').matches;
    let y = coarse || r.top < 80 ? r.bottom + 10 : r.top - h - 10; y = Math.max(8, Math.min(global.innerHeight - h - 8, y));
    p.style.left = Math.max(8, Math.min(global.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px'; p.style.top = y + 'px';
  }
  document.addEventListener('selectionchange', () => { clearTimeout(selT); selT = setTimeout(onSel, 180); });
  addEventListener('scroll', () => { const p = $('#bo-sel'); if (p && !p.hidden) onSel(); }, { passive: true });

  /* ---------- keys, and every page change ---------- */
  document.addEventListener('keydown', e => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyB' || e.key === 'b' || e.key === '∫')) { if (hidden()) return; e.preventDefault(); F.open ? closePanel() : openPanel(); }
    else if (e.key === 'Escape' && F.open && !F.point && !(F.el && F.el.contains(document.activeElement)) && !document.querySelector('.modal-backdrop, .pw-backdrop')) closePanel(true);
  });
  // answering on the page while the panel is open: the chips follow (Q3 turns red when it is wrong)
  let pageT = 0; document.addEventListener('click', e => { const v = $('#view'); if (F.open && v && v.contains(e.target)) { clearTimeout(pageT); pageT = setTimeout(refresh, 400); } });
  document.addEventListener('change', e => { const v = $('#view'); if (F.open && v && v.contains(e.target)) { clearTimeout(pageT); pageT = setTimeout(refresh, 400); } });
  App.onRender = App.onRender || [];
  App.onRender.push(() => { sync(); const p = $('#bo-sel'); if (p) p.hidden = true; });
  addEventListener('hashchange', () => setTimeout(sync, 0));
  const boot = () => { if (document.body) { build(); sync(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  // a call opening or closing, the tour: Bo steps aside
  try { new MutationObserver(() => { if (F.fab) { const off = hidden(); if (off !== F.fab.hidden && !F.open) F.fab.hidden = off; if (off && F.open) closePanel(true); } }).observe(document.body || document.documentElement, { childList: true }); } catch (e) {}
})(window);

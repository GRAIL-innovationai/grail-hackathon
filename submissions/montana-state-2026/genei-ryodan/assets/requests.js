/* ============================================================
   Mathub — request a class (#/request)
   Professors and TAs ask for a class Mathub does not have yet (students
   are pointed to Create a class, where Bo writes it from the syllabus) and attach its
   syllabus (PDF or Word, up to 10 MB) or paste the text. Requests for
   the same course code are grouped on the server, so the "most
   requested" list shows demand and anyone can add their voice with one
   click. Syllabus files are only ever seen by administrators (admin
   panel → Class requests); status changes arrive in the inbox.
   Server: api/requests.php.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, toast } = App;
  const API = 'api/index.php?r=';
  const MAX_MB = 10;
  const STATUS = { new: ['Requested', ''], working: ['Being built', 'warn'], added: ['On Mathub', 'good'], declined: ['Not for now', 'muted'] };
  const statusChip = s => { const [l, c] = STATUS[s] || [s, '']; return `<span class="chip xs ${c}">${esc(l)}</span>`; };
  const CODE_RE = /^([A-Z]{1,5}) ?([0-9]{3}[A-Z]{0,3})$/;
  const normCode = raw => { const s = String(raw || '').toUpperCase().replace(/[\s\-_.]+/g, ' ').trim(); const m = s.match(CODE_RE); return m ? `${m[1]} ${m[2]}` : null; };
  const bare = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/([0-9])[A-Z]+$/, '$1');   // "M 171Q" and "M171" both become "M171"
  const onMathub = code => { const b = bare(code); return App.COURSE_ORDER.map(id => global.Courses[id]).find(C => C && bare(C.code) === b) || null; };
  const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

  async function api(route, body) {
    const opts = { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Accept': 'application/json' }, cache: 'no-store' };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let json; try { json = await (await fetch(API + route, opts)).json(); } catch (e) { throw new Error('Cannot reach the server.'); }
    if (!json || json.ok === false) { const err = new Error((json && json.error) || 'Request failed.'); err.data = json; throw err; }
    return json;
  }
  /* multipart upload with progress, so a 10 MB syllabus on a slow connection shows it is moving */
  function send(form, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest(); x.open('POST', API + 'classreq_create'); x.withCredentials = true; x.setRequestHeader('X-Requested-With', 'MatHub'); x.setRequestHeader('Accept', 'application/json');
      x.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      x.onload = () => { let j = null; try { j = JSON.parse(x.responseText); } catch (e) {} if (j && j.ok) resolve(j); else { const err = new Error((j && j.error) || (x.status === 413 ? 'That file is too large for the server.' : 'The request did not go through.')); err.data = j; reject(err); } };
      x.onerror = () => reject(new Error('Cannot reach the server.')); x.send(form);
    });
  }
  const terms = () => { const d = App.parseISO ? App.parseISO(App.todayISO()) : new Date(); const y = d.getFullYear(), m = d.getMonth(); const seq = m >= 7 ? [['Fall', y], ['Spring', y + 1], ['Summer', y + 1]] : m >= 5 ? [['Summer', y], ['Fall', y], ['Spring', y + 1]] : [['Spring', y], ['Summer', y], ['Fall', y]]; return seq.map(([s, yy]) => `${s} ${yy}`); };

  App.views.request = {
    title: 'Request a class', blurb: 'Don’t see your class? Send its code and syllabus and we will build it: notes, practice, the calendar and a grade calculator.',
    render(root, param, query, standalone) {
      const guest = App.guest(); const pre = normCode(query.code || param || '') || '';
      const head = standalone ? `<div class="landing-wrap"><header class="landing-top"><div><div class="eyebrow">Mathub</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Request a class</h1><p class="muted">${this.blurb}</p></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="#/">${icon('left', 14)} All classes</a></div></header>` : App.pageHead('Request a class', this.blurb);
      const form = !App.canRequest() ? `<div class="panel rq-staff"><div class="rq-staff-t"><h2>${icon('path', 18)} Class requests are for professors and TAs</h2><p>They send the official syllabus, so the class is right from day one. You can make any class yourself, right now: drop in its syllabus and Bo writes the whole thing, notes, practice, flashcards and its calendar.</p></div><div class="row gap-sm" style="flex-wrap:wrap"><a class="btn primary" href="#/create">${icon('plus', 14)} Create a class</a>${guest ? '<button class="btn" data-action="auth-login">Log in</button>' : ''}<a class="btn ghost" href="#/class">${icon('users', 14)} Join your instructor’s class</a></div></div>` : guest ? App.lockCard('Sign in to request a class', 'Requests are for Montana State students, so we can tell you when your class is ready. It takes a minute with your montana.edu email.') : `
        <form class="panel rq-form" id="rq-form" novalidate>
          <div class="panel-h"><div class="panel-title">${icon('path')} Which class?</div></div>
          <div class="grid cols-2 rq-grid">
            <div class="field"><label for="rq-code">Course code <span class="req">*</span></label><input class="input mono" id="rq-code" name="code" maxlength="20" autocomplete="off" placeholder="e.g. CHMY 121" value="${esc(pre)}" required><span class="help" id="rq-code-help">As MSU writes it: rubric and number.</span></div>
            <div class="field"><label for="rq-title">Course name</label><input class="input" id="rq-title" name="title" maxlength="120" placeholder="e.g. Introduction to General Chemistry"></div>
            <div class="field"><label for="rq-term">Term</label><select class="select" id="rq-term" name="term">${terms().map((t, i) => `<option${i === 0 ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
            <div class="field"><label for="rq-instructor">Instructor</label><input class="input" id="rq-instructor" name="instructor" maxlength="80" placeholder="Optional"></div>
          </div>
          <div class="eyebrow mt-2 mb-1">The syllabus</div>
          <p class="small muted mb-1">We build each class from its syllabus: the schedule, exam dates and grading. Download it from Canvas and attach it here. If someone already sent it, you can skip this.</p>
          <label class="rq-drop" id="rq-drop" for="rq-file"><input type="file" id="rq-file" name="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"><span class="rq-drop-ic">${icon('download', 22)}</span><span class="rq-drop-t"><b>Choose the syllabus file</b><small>PDF or Word, up to ${MAX_MB} MB. You can also drop it here.</small></span></label>
          <div class="rq-file" id="rq-file-row" hidden></div>
          <button type="button" class="linkbtn small mt-1" data-action="rq-paste">No file? Paste the syllabus text instead</button>
          <div class="field mt-1" id="rq-text-field" hidden><label for="rq-text">Syllabus text</label><textarea class="input" id="rq-text" name="text" rows="6" maxlength="60000" placeholder="Paste the schedule, exam dates and grading policy"></textarea></div>
          <div class="field mt-2"><label for="rq-note">Anything else?</label><textarea class="input" id="rq-note" name="note" rows="2" maxlength="600" placeholder="Optional: which section, what you need most (practice exams, a formula sheet…)"></textarea></div>
          <label class="check rq-consent" id="rq-consent-row" hidden><input type="checkbox" id="rq-consent" name="consent" value="1"><span>This is the syllabus for a class I am taking. I understand only Mathub's team sees the file, and they use it to build study tools in their own words.</span></label>
          <div class="rq-progress" id="rq-progress" hidden><div class="bar"><div class="bar-fill" style="width:0%"></div></div></div>
          <div class="row gap-sm mt-2"><button class="btn primary" type="submit" id="rq-send">${icon('check', 14)} Send request</button><span class="small muted" id="rq-msg" role="status" aria-live="polite"></span></div>
        </form>`;
      root.innerHTML = `${head}<div class="grid cols-3 rq-wrap">
        <div class="span-2 stack">${form}<div class="panel" id="rq-mine-panel"${guest ? ' hidden' : ''}><div class="panel-h"><div class="panel-title">${icon('list')} Your requests</div></div><div id="rq-mine"><div class="empty small">Loading…</div></div></div></div>
        <div class="stack">
          <div class="panel rq-how"><div class="panel-h"><div class="panel-title">${icon('bulb')} How it works</div></div>
            <ol class="rq-steps"><li><b>Send the code and syllabus.</b><span>The syllabus has the schedule, exams and grading we need.</span></li><li><b>We build the class.</b><span>Topic notes, practice questions, flashcards, the calendar and a grade calculator, written in our own words.</span></li><li><b>You hear back.</b><span>Your inbox tells you when we start and when it is ready.</span></li></ol>
            <p class="small muted">Syllabus files go only to Mathub's administrators and are never posted. Classes with the most requests and a syllabus are built first.</p></div>
          <div class="panel"><div class="panel-h"><div class="panel-title">${icon('trophy')} Most requested</div></div><div id="rq-top"><div class="empty small">Loading…</div></div></div>
        </div></div>${standalone ? '</div>' : ''}`;

      const paintTop = async () => {
        const el = $('#rq-top', root); if (!el) return;
        try {
          const r = await api('classreq_top');
          el.innerHTML = r.items.length ? `<div class="rq-top">${r.items.map(it => { const C = it.status === 'added' && it.course_id && global.Courses[it.course_id];
            return `<div class="rq-top-row"><div><b class="mono">${esc(it.code)}</b>${it.title ? ` <span class="small muted">${esc(it.title)}</span>` : ''}<div class="small muted">${it.n} student${it.n === 1 ? '' : 's'} · ${it.syllabus ? 'syllabus in' : 'needs a syllabus'}</div></div><div class="row gap-sm">${statusChip(it.status)}${C ? `<a class="btn xs" href="#/${esc(it.course_id)}">Open</a>` : it.mine ? `<span class="chip xs good">${icon('check', 11)} you</span>` : (it.status === 'new' || it.status === 'working') && !guest && App.canRequest() ? `<button class="btn xs" data-action="rq-metoo" data-code="${esc(it.code)}">${icon('up', 11)} Me too</button>` : ''}</div></div>`; }).join('')}</div>`
            : '<div class="empty small">No requests yet. Be the first.</div>';
        } catch (e) { el.innerHTML = `<div class="empty small">${esc(e.message)}</div>`; }
      };
      const paintMine = async () => {
        const el = $('#rq-mine', root); if (!el || guest) return;
        try {
          const r = await api('classreq_mine');
          el.innerHTML = r.items.length ? `<div class="stack-sm">${r.items.map(it => `<div class="rq-mine-row"><div class="rq-mine-main"><div class="row gap-sm"><b class="mono">${esc(it.code)}</b>${it.title ? `<span>${esc(it.title)}</span>` : ''}${statusChip(it.status)}</div>
              <div class="small muted">${App.ago(it.created * 1000)}${it.term ? ' · ' + esc(it.term) : ''}${it.file_name ? ` · ${icon('file', 11)} ${esc(it.file_name)} (${kb(it.file_size)})` : it.has_text ? ' · pasted syllabus' : ' · no syllabus attached'}${it.askers > 1 ? ` · ${it.askers} students asked` : ''}</div>
              ${it.admin_note ? `<div class="rq-note small">${icon('chat', 11)} ${esc(it.admin_note)}</div>` : ''}</div>
              <div class="row gap-sm">${it.status === 'added' && it.course_id && global.Courses[it.course_id] ? `<a class="btn xs primary" href="#/${esc(it.course_id)}">Open ${esc(global.Courses[it.course_id].short)}</a>` : ''}${it.status === 'new' ? `<button class="btn xs ghost" data-action="rq-withdraw" data-id="${it.id}">Withdraw</button>` : ''}</div></div>`).join('')}</div>`
            : '<div class="empty small">You have not requested a class yet.</div>';
        } catch (e) { el.innerHTML = `<div class="empty small">${esc(e.message)}</div>`; }
      };

      const f = $('#rq-form', root);
      if (f) {
        const code = $('#rq-code', f), help = $('#rq-code-help', f), file = $('#rq-file', f), drop = $('#rq-drop', f), fileRow = $('#rq-file-row', f), text = $('#rq-text', f), msg = $('#rq-msg', f);
        const syncConsent = () => { $('#rq-consent-row', f).hidden = !(file.files.length || text.value.trim()); };
        const checkCode = () => {
          const v = code.value.trim(); const n = normCode(v); const C = n && onMathub(n); code.classList.toggle('invalid', !!v && !n);
          help.innerHTML = !v ? 'As MSU writes it: rubric and number.' : !n ? 'That does not look like a course code. Try something like CHMY 121.' : C ? `${esc(C.code)} is already on Mathub. <a href="#/${esc(C.id)}">Open ${esc(C.short)}</a>` : `We will file it as <b>${esc(n)}</b>.`;
          return n && !C ? n : null;
        };
        const showFile = () => {
          const fl = file.files[0]; drop.classList.toggle('has-file', !!fl);
          if (!fl) { fileRow.hidden = true; fileRow.innerHTML = ''; syncConsent(); return; }
          const bad = fl.size > MAX_MB * 1048576 ? `Files can be up to ${MAX_MB} MB.` : !/\.(pdf|docx)$/i.test(fl.name) ? 'Use a PDF or a Word (.docx) file.' : '';
          fileRow.hidden = false; fileRow.innerHTML = `${icon('file', 14)} <span class="rq-fname">${esc(fl.name)}</span> <span class="small muted">${kb(fl.size)}</span>${bad ? ` <span class="small bad-text">${bad}</span>` : ''} <button type="button" class="btn xs ghost" data-action="rq-clear-file">${icon('x', 11)} Remove</button>`;
          syncConsent();
        };
        code.addEventListener('input', checkCode); if (pre) checkCode();
        file.addEventListener('change', showFile);
        text.addEventListener('input', syncConsent);
        ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
        ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
        drop.addEventListener('drop', e => { const dt = e.dataTransfer; if (dt && dt.files && dt.files.length) { try { file.files = dt.files; } catch (err) {} showFile(); } });
        f.addEventListener('submit', async e => {
          e.preventDefault(); msg.textContent = '';
          const n = checkCode(); if (!n) { msg.textContent = normCode(code.value) ? 'That class is already on Mathub.' : 'Enter the course code first.'; code.focus(); return; }
          const fl = file.files[0]; if (fl && (fl.size > MAX_MB * 1048576 || !/\.(pdf|docx)$/i.test(fl.name))) { msg.textContent = 'Check the file: a PDF or Word file up to 10 MB.'; return; }
          if ((fl || text.value.trim()) && !$('#rq-consent', f).checked) { msg.textContent = 'Please tick the box about the syllabus.'; $('#rq-consent', f).focus(); return; }
          const fd = new FormData(f); fd.set('code', n); if (!fl) fd.delete('file'); if (!$('#rq-consent', f).checked) fd.delete('consent');
          const btn = $('#rq-send', f); const prog = $('#rq-progress', f); btn.disabled = true; prog.hidden = !fl;
          try {
            const r = await send(fd, p => { $('.bar-fill', prog).style.width = Math.round(p * 100) + '%'; });
            f.reset(); showFile(); $('#rq-text-field', f).hidden = true; checkCode(); syncConsent();
            toast(`${icon('check', 14)} Request sent for ${esc(r.request.code)}${r.count > 1 ? `. ${r.count} students have asked for it.` : '. We will tell you in your inbox when it changes.'}`, 4200);
            if (App.burst) App.burst(btn, 'pop'); if (App.sfx) App.sfx.play('complete'); if (App.track) App.track('feat:classreq');
            paintMine(); paintTop();
          } catch (err) { msg.textContent = err.message; if (err.data && err.data.auth === false && App.auth) App.auth.open('login'); }
          finally { btn.disabled = false; prog.hidden = true; $('.bar-fill', prog).style.width = '0%'; }
        });
      }
      bind(root, {
        'rq-paste': () => { const fl = $('#rq-text-field', root); fl.hidden = !fl.hidden; if (!fl.hidden) $('#rq-text', root).focus(); },
        'rq-clear-file': () => { const fi = $('#rq-file', root); fi.value = ''; fi.dispatchEvent(new Event('change')); },
        'rq-withdraw': async b => { if (!confirm('Withdraw this request? The syllabus you sent is deleted.')) return; try { await api('classreq_withdraw', { id: +b.dataset.id }); toast('Request withdrawn.'); } catch (e) { toast(e.message); } paintMine(); paintTop(); },
        'rq-metoo': async b => { b.disabled = true; const fd = new FormData(); fd.set('code', b.dataset.code); try { const r = await send(fd); toast(`${icon('check', 14)} Added your vote for ${esc(r.request.code)}: ${r.count} students now.`, 3200); paintMine(); paintTop(); } catch (e) { toast(e.message); b.disabled = false; } },
        'auth-signup': () => App.auth && App.auth.open('signup'), 'auth-login': () => App.auth && App.auth.open('login')
      });
      paintTop(); paintMine();
      const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
    }
  };

  /* who can request a class: professors and TAs (a staff role, set by the server) and administrators */
  App.canRequest = () => { const u = App.auth && App.auth.user; return !!(u && !u.local && (u.can_request || u.admin || u.role)); };
  /* a small link for the start page, the class picker and Settings: professors and TAs only */
  App.requestLink = (cls = '') => App.canRequest() ? `<a class="rq-link ${cls}" href="#/request">${icon('path', 13)} Don’t see your class? Request it</a>` : '';
})(window);

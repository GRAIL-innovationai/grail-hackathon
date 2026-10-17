/* ============================================================
   Mathub — report a problem
   A small flag on every question, lesson step, flashcard and topic
   page. Opens a dialog that sends what the student was looking at
   (class, page, question or section, their answer) plus a reason and
   a comment to the admin panel, where reports are triaged.
   Guests can report too; the server rate-limits by address.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, esc, icon, toast } = App;
  const API = 'api/index.php?r=';
  const REASONS = [['wrong', 'The answer or solution is wrong'], ['typo', 'Typo or formatting problem'], ['unclear', 'The question or note is unclear'], ['bug', 'Something did not work'], ['link', 'A link is broken or has moved'], ['resource', 'Suggest a resource'], ['other', 'Something else']];
  const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
  App.flagButton = ctx => `<button type="button" class="icon-btn q-flag" data-ctx="${esc(JSON.stringify(ctx))}" title="Report a problem with this" aria-label="Report a problem">${icon('flag', 12)}</button>`;
  App.reportIssue = function (ctx) {
    ctx = ctx || {}; if ($('#report-modal')) return;
    const course = ctx.course || (App.D && App.D.id) || ''; const C = global.Courses[course]; const el = document.createElement('div'); el.className = 'modal-backdrop'; el.id = 'report-modal';
    const where = [C ? C.short : 'Mathub', ctx.view || (App.current && App.current.title) || '', ctx.ref || ''].filter(Boolean).join(' · ');
    el.innerHTML = `<form class="modal report-modal" role="dialog" aria-label="${esc(ctx.title || 'Report a problem')}"><div class="row between mb-1"><div class="panel-title">${icon(ctx.reason === 'resource' ? 'pen' : 'flag')} ${esc(ctx.title || 'Report a problem')}</div><button type="button" class="icon-btn" data-action="close" aria-label="Close">${icon('x', 14)}</button></div>
      <p class="small muted">${esc(where)}${ctx.prompt ? `<br><span class="report-quote">${esc(strip(ctx.prompt).slice(0, 160))}${strip(ctx.prompt).length > 160 ? '…' : ''}</span>` : ''}</p>
      <div class="field"><label for="rp-reason">What is wrong?</label><select class="select" id="rp-reason">${REASONS.map(([v, l]) => `<option value="${v}"${ctx.reason === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field mt-1"><label for="rp-text">Tell us more <span class="muted">(optional)</span></label><textarea class="input" id="rp-text" rows="3" maxlength="800" placeholder="${esc(ctx.placeholder || 'What did you expect instead?')}"></textarea></div>
      ${ctx.answer ? `<label class="check small"><input type="checkbox" id="rp-ans" checked><span>Include my answer (${esc(strip(ctx.answer).slice(0, 60))})</span></label>` : ''}
      <div class="row between mt-2"><span class="small muted">${App.auth && App.auth.user ? 'Sent with your account, so we can reply in your inbox.' : 'Sent anonymously. Log in if you want a reply.'}</span><button class="btn primary" type="submit" id="rp-send">Send report</button></div></form>`;
    document.body.appendChild(el); const close = () => App.dismiss(el);
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-action="close"]')) close(); });
    const key = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', key); } }; document.addEventListener('keydown', key);
    $('form', el).addEventListener('submit', async e => {
      e.preventDefault(); const btn = $('#rp-send', el); btn.disabled = true; btn.textContent = 'Sending…';
      const body = { course, view: ctx.view || (App.current && App.current.title) || '', ref: String(ctx.ref || '').slice(0, 120), prompt: strip(ctx.prompt), answer: ctx.answer && (!$('#rp-ans', el) || $('#rp-ans', el).checked) ? strip(ctx.answer).slice(0, 200) : '', reason: $('#rp-reason', el).value, comment: $('#rp-text', el).value.trim().slice(0, 800), url: location.hash, build: global.MATHUB_BUILD || '' };
      try { const r = await fetch(API + 'issue_report', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (!j || !j.ok) throw new Error((j && j.error) || 'Could not send.'); close(); toast(`${icon('check', 14)} Thanks, the report is in. ${j.count > 1 ? `Others flagged this too.` : 'We look at every one.'}`, 4000); }
      catch (err) { btn.disabled = false; btn.textContent = 'Send report'; toast(err.message || 'Could not send the report. Are you online?', 4000); }
    });
    setTimeout(() => { const s = $('#rp-text', el); if (s) s.focus(); }, 50);
  };
  document.addEventListener('click', e => { const b = e.target.closest('.q-flag'); if (!b) return; e.preventDefault(); e.stopPropagation(); let ctx = {}; try { ctx = JSON.parse(b.dataset.ctx || '{}'); } catch (err) {} App.reportIssue(ctx); }, true);
})(window);

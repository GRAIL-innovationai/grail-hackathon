(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PracticeUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const esc = value => root.Core.escape(value == null ? '' : value);
  let options = {};
  const $ = selector => document.querySelector(selector);
  const list = value => Array.isArray(value) ? value : [];

  function render(item) {
    if (!item) return '<p>That practice record could not be found.</p>';
    const attempt = item.attempt || { language: '', solution: '', notes: '', outcome: '', demo: false };
    const label = attempt.demo ? '<p class="notice"><strong>DEMO example</strong> This is first-party sample code and notes, not a submission from you. The outcome is illustrative and no code was run.</p>'
      : (item.attempt ? '<p class="notice">Your manually recorded attempt. Outcome and notes are self-reported; code was not run.</p>' : '<p class="muted">No attempt has been saved for this entry yet.</p>');
    const problem = root.InterviewProblems?.catalog.find(entry => entry.id === item.problemId);
    const url = problem?.url || root.Core.practiceUrl(item.title);
    const job = list(options.getState?.()?.jobs).find(entry => entry.id === item.jobId);
    return `<section class="card"><p class="eyebrow">${esc(item.topic)} · ${esc(item.difficulty)}</p>${job ? `<p class="notice">Preparing for <strong>${esc(job.company)} · ${esc(job.role)}</strong></p>` : ''}${problem ? `<p>${esc(problem.focus)}</p>` : ''}${url ? `<p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open problem on LeetCode ↗</a></p><p class="muted">Read and run the problem on LeetCode. Keep your solution, comments, and feedback here; no submissions are imported.</p>` : ''}<p class="muted">Recorded ${esc(item.date)}</p>${label}<form data-practice-attempt>
      <label class="field"><span>Language</span><input name="language" maxlength="60" value="${esc(attempt.language)}" placeholder="JavaScript, Python, etc."></label>
      <label class="field"><span>Solution or approach (optional)</span><textarea name="solution" maxlength="12000" rows="10" placeholder="Paste your solution or leave blank to save notes only">${esc(attempt.solution)}</textarea></label>
      <label class="field"><span>Notes</span><textarea name="notes" maxlength="2000" rows="4" placeholder="What did you try or learn?">${esc(attempt.notes)}</textarea></label>
      <label class="field"><span>Self-reported outcome (optional)</span><input name="outcome" maxlength="500" value="${esc(attempt.outcome)}" placeholder="For example: completed after reviewing a hint"></label>
      <p data-practice-status role="status" aria-live="polite"></p><div class="dialog-actions"><button class="btn primary" type="submit">Save my attempt</button></div>
      <small>Manual record only. This app does not execute code or verify a test result.</small>
    </form></section>`;
  }

  function configure(next) { options = { ...next }; }

  function open(id) {
    const item = list(options.getState && options.getState()?.practice).find(entry => entry.id === id);
    const dialog = $('#practice-dialog');
    const title = $('#practice-title');
    const body = $('#practice-body');
    if (!dialog || !title || !body) return false;
    title.textContent = item ? item.title : 'Practice attempt';
    body.innerHTML = render(item);
    if (!dialog.open) dialog.showModal();
    const form = body.querySelector('[data-practice-attempt]');
    if (!form || !item) return true;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const status = form.querySelector('[data-practice-status]');
      const button = form.querySelector('button[type="submit"]');
      const current = options.getState && options.getState();
      const next = current && structuredClone(current);
      if (!next || !root.Core.savePracticeAttempt(next, id, {
        language: form.elements.language.value,
        solution: form.elements.solution.value,
        notes: form.elements.notes.value,
        outcome: form.elements.outcome.value
      })) { status.textContent = 'Add a language, solution, note, or outcome within the character limits.'; return; }
      if (button) button.disabled = true;
      try {
        const saved = await options.commitState(next);
        if (saved === false) {
          status.textContent = 'The attempt could not be saved.';
          if (button) button.disabled = false;
          return;
        }
        open(id);
        const updatedStatus = $('#practice-body').querySelector('[data-practice-status]');
        if (updatedStatus) updatedStatus.textContent = 'Attempt saved on this computer.';
        options.onNotice && options.onNotice('Practice attempt saved.');
      } catch {
        status.textContent = 'The attempt could not be saved.';
        if (button) button.disabled = false;
      }
    });
    return true;
  }

  return { configure, open, render };
});

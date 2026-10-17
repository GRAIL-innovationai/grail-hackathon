(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CoachUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const MAX_FILES = 5, MAX_FILE = 8000, MAX_TOTAL = 20000;
  const esc = value => (root.Core && root.Core.escape ? root.Core.escape(value) : String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const str = value => typeof value === 'string' ? value : '';
  const list = value => Array.isArray(value) ? value : [];
  const selected = (a, b) => String(a || '') === String(b || '') ? ' selected' : '';
  let opts = {}, sequence = 0, busy = false;
  const $ = selector => document.querySelector(selector);
  const body = () => $('#coach-body');
  const dialog = () => $('#coach-dialog');
  const state = () => opts.getState ? opts.getState() || {} : {};
  const revision = () => opts.getRevision ? opts.getRevision() : 0;
  const jobOptions = value => `<option value="">No role context</option>${list(state().jobs).map(j => `<option value="${esc(j.id)}"${selected(j.id, value)}>${esc(j.role)} · ${esc(j.company)} (${esc(j.status)})</option>`).join('')}`;
  const open = (title, html) => { sequence++; $('#coach-title').textContent = title; body().innerHTML = html; if (!dialog().open) dialog().showModal(); return sequence; };
  const noticeError = e => { const message = e && typeof e.message === 'string' ? e.message : 'The request could not be completed.'; const el = body().querySelector('[data-error]'); if (el) el.textContent = message; else opts.onNotice && opts.onNotice(message); };
  const field = (label, name, value, type = 'text', max = 5000) => `<label class="field"><span>${esc(label)}</span><input name="${name}" type="${type}" maxlength="${max}" value="${esc(value)}"></label>`;
  const area = (label, name, value, max, rows = 5) => `<label class="field"><span>${esc(label)}</span><textarea name="${name}" maxlength="${max}" rows="${rows}">${esc(value)}</textarea></label>`;
  const consent = context => `<label class="field"><span><input type="checkbox" name="consent" required> I agree to send the selected ${esc(context)}, profile target and skills, optional selected role, recent coding practice, and prior coding feedback to Groq for this review.</span><small>Remove secrets and private details first. Selected content is sent only when you generate.</small></label>`;
  function setStatus(text) { const el = body().querySelector('[data-error]'); if (el) el.textContent = text; }
  function loading(button, value) { if (button) { button.disabled = value; button.textContent = value ? 'Working…' : (button.dataset.label || 'Try again'); } }
  function projectForm(projectId) {
    const project = list(state().projects).find(p => p.id === projectId);
    if (!project) { open('Project coach', '<p data-error>That project could not be found.</p>'); return; }
    const profile = state().profile || {};
    const token = open('Project coaching', `<p class="muted">Review ${esc(project.name)} (${esc(project.url)}). Source is added only when you choose files below; no repository fetch or code execution occurs.</p><section class="card"><strong>Profile context sent with consent</strong><p>Target: ${esc(profile.target)} · Skills: ${esc(profile.skills)}</p></section><form id="coach-project-form"><div class="field"><span>Choose up to 5 text/code files (8,000 characters each; 20,000 total)</span><input type="file" name="upload" multiple accept=".js,.cjs,.mjs,.ts,.tsx,.jsx,.py,.java,.go,.rs,.html,.css,.json,.md,.txt,.sql"></div><div id="coach-files"></div><div class="form-actions"><button class="btn" type="button" data-add-file>Add empty file</button></div><label class="field"><span>Optional role context</span><select name="jobId">${jobOptions('')}</select></label>${consent('code files')}<p data-error role="status" aria-live="polite"></p><div class="dialog-actions"><button class="btn" type="button" data-history="project">Past reviews</button><button class="btn primary" data-submit data-label="Generate review" ${opts.ai && opts.ai.configured ? '' : 'disabled'}>Generate review</button></div></form>${opts.ai && opts.ai.configured ? '' : '<p>AI is unavailable. Configure a Groq key in the local .env file and restart the server. Past reviews remain available.</p>'}`);
    const form = body().querySelector('#coach-project-form');
    const fileWrap = form.querySelector('#coach-files');
    const addFile = (path = '', content = '') => {
      if (fileWrap.children.length >= MAX_FILES) return setStatus(`Choose no more than ${MAX_FILES} files.`);
      const item = document.createElement('section'); item.className = 'card';
      item.innerHTML = `<label class="field"><span>File path</span><input name="path" maxlength="240" value="${esc(path)}" required></label><label class="field"><span>File content</span><textarea name="content" maxlength="${MAX_FILE}" rows="8" required></textarea></label><button class="btn" type="button" data-remove>Remove file</button>`;
      item.querySelector('textarea').value = content;
      item.querySelector('[data-remove]').onclick = () => item.remove(); fileWrap.append(item);
    };
    form.querySelector('[data-add-file]').onclick = () => addFile();
    form.upload.onchange = async event => {
      setStatus('');
      for (const file of [...event.target.files]) {
        if (file.size > MAX_FILE * 4) { setStatus(`${file.name} is too large to read.`); continue; }
        if (fileWrap.children.length >= MAX_FILES) { setStatus(`Choose no more than ${MAX_FILES} files.`); break; }
        try { const content = await file.text(); if (content.length > MAX_FILE) { setStatus(`${file.name} exceeds ${MAX_FILE} characters.`); continue; } addFile(file.name, content); }
        catch { setStatus(`Could not read ${file.name}.`); }
      }
      event.target.value = '';
    };
    form.onsubmit = async event => {
      event.preventDefault(); if (busy || !opts.ai?.configured) return;
      const files = [...fileWrap.children].map(item => ({ path: item.querySelector('[name=path]').value.trim(), content: item.querySelector('[name=content]').value }));
      const total = files.reduce((n, f) => n + f.content.length, 0);
      if (!form.consent.checked) return setStatus('Select consent before generating a review.');
      if (!files.length || files.length > MAX_FILES || total > MAX_TOTAL || files.some(f => !f.path || !f.content || f.content.length > MAX_FILE)) return setStatus('Add 1–5 files with a path and content (maximum 8,000 characters each and 20,000 total).');
      busy = true; const button = form.querySelector('[data-submit]'); loading(button, true);
      try {
        if (await opts.flushSaves() === false) throw new Error('Save pending workspace changes before generating a review.');
        const currentRevision = revision();
        const result = await opts.api('/api/coaches/project', { method: 'POST', body: { projectId, jobId: form.jobId.value, files, revision: currentRevision, consent: true } });
        if (token !== sequence) { opts.onNotice && opts.onNotice('Project review saved. Open past reviews to view it.'); return; }
        showReport(result.review || result, 'project', projectId);
      } catch (e) { if (token === sequence) noticeError(e); }
      finally { busy = false; if (token === sequence) { const b = body().querySelector('[data-submit]'); if (b) loading(b, false); } }
    };
    form.querySelector('[data-history]').onclick = () => openHistory('project', projectId);
  }
  function codingForm(prefill = {}) {
    const profile = state().profile || {}, practice = list(state().practice).slice(-5).map(item => `${item.title} (${item.topic}, ${item.difficulty})`).join('; ');
    const token = open('Coding coach', `<section class="card"><strong>Profile context sent with consent</strong><p>Target: ${esc(profile.target)} · Skills: ${esc(profile.skills)}</p><p>Recent practice: ${esc(practice || 'None recorded')}</p></section><form id="coach-coding-form">${area('Problem statement', 'problem', '', 6000)}${area('Your solution', 'solution', '', 12000, 9)}${field('Language', 'language', 'JavaScript', 'text', 60)}${field('Topic', 'topic', '', 'text', 100)}<label class="field"><span>Difficulty</span><select name="difficulty"><option>Easy</option><option selected>Medium</option><option>Hard</option></select></label><label class="field"><span>Optional role context</span><select name="jobId">${jobOptions('')}</select></label><label class="field"><span><input type="checkbox" name="hintOnly" checked> Hints only (do not reveal a full solution)</span></label>${consent('your problem and solution')}<p data-error role="status" aria-live="polite"></p><div class="dialog-actions"><button class="btn" type="button" data-history="coding">Past reviews</button><button class="btn primary" data-submit data-label="Review solution" ${opts.ai && opts.ai.configured ? '' : 'disabled'}>Review solution</button></div></form>${opts.ai && opts.ai.configured ? '' : '<p>AI is unavailable. Configure a Groq key in the local .env file and restart the server. Past reviews remain available.</p>'}`);
    const form = body().querySelector('#coach-coding-form');
    const input = prefill.input || {};
    for (const [name, limit] of [['problem', 6000], ['solution', 12000], ['language', 60], ['topic', 100]]) {
      if (typeof input[name] === 'string') form.elements[name].value = input[name].slice(0, limit);
    }
    if (['Easy', 'Medium', 'Hard'].includes(input.difficulty)) form.elements.difficulty.value = input.difficulty;
    if (list(state().jobs).some(job => job.id === prefill.jobId)) form.elements.jobId.value = prefill.jobId;
    form.querySelector('[data-history]').onclick = () => openHistory('coding', 'coding');
    form.onsubmit = async event => {
      event.preventDefault(); if (busy || !opts.ai?.configured) return;
      const input = { problem: form.problem.value.trim(), solution: form.solution.value.trim(), language: form.language.value.trim(), topic: form.topic.value.trim(), difficulty: form.difficulty.value, hintOnly: form.hintOnly.checked };
      if (!input.problem || !input.solution) return setStatus('Add both the problem and your solution.');
      if (!form.consent.checked) return setStatus('Select consent before generating a review.');
      busy = true; loading(form.querySelector('[data-submit]'), true);
      try {
        if (await opts.flushSaves() === false) throw new Error('Save pending workspace changes before generating a review.');
        const result = await opts.api('/api/coaches/coding', { method: 'POST', body: { jobId: form.jobId.value, input, revision: revision(), consent: true } });
        opts.onReview && opts.onReview(result.review || result);
        if (token !== sequence) { opts.onNotice && opts.onNotice('Coding review saved. Open past reviews to view it.'); return; }
        showReport(result.review || result, 'coding', 'coding');
      } catch (e) { if (token === sequence) noticeError(e); }
      finally { busy = false; if (token === sequence) { const b = body().querySelector('[data-submit]'); if (b) loading(b, false); } }
    };
  }
  function bullets(values, render) { return list(values).map(render).join('') || '<li>None provided.</li>'; }
  function projectReport(review) {
    const r = review.result || review, findings = list(r.findings), tasks = list(r.tasks);
    return `<section class="card"><h3>Summary</h3><p>${esc(r.summary)}</p><h3>Role relevance</h3><p>${esc(r.jobRelevance)}</p></section><section class="card"><h3>Findings</h3>${findings.length ? findings.map(f => `<article><h4>${esc(f.path)} · lines ${esc(f.lineStart)}–${esc(f.lineEnd)}</h4><blockquote>${esc(f.quote)}</blockquote><p>${esc(f.issue)}</p><p><strong>Suggestion:</strong> ${esc(f.suggestion)}</p></article>`).join('') : '<p>No grounded findings.</p>'}</section><section class="card"><h3>Improvement tasks</h3><ul>${bullets(tasks, t => `<li><strong>${esc(t.title)}</strong> — ${esc(t.reason)} <span>${esc(t.doneWhen)}</span></li>`)}</ul></section>`;
  }
  function codingReport(review) {
    const r = review.result || review, correctness = r.correctness || {}, complexity = r.complexity || {};
    return `<section class="card"><h3>Correctness assessment</h3><p>${esc(correctness.assessment)}</p><h4>Evidence from your solution</h4><ul>${bullets(correctness.evidence, item => `<li>Lines ${esc(item.lineStart)}–${esc(item.lineEnd)} <blockquote>${esc(item.quote)}</blockquote><p>${esc(item.explanation)}</p></li>`)}</ul><h3>Complexity</h3><p>Time: ${esc(complexity.time)}</p><p>Space: ${esc(complexity.space)}</p><p>${esc(complexity.reasoning)}</p></section><section class="card"><h3>Hints</h3><ul>${bullets(r.hints, h => `<li>${esc(h)}</li>`)}</ul><h3>Weaknesses</h3><ul>${bullets(r.weaknesses, w => `<li>${esc(w)}</li>`)}</ul><h3>Next practice</h3><ul>${bullets(r.nextPractice, item => `<li><strong>${esc(item.topic)} · ${esc(item.exercise)}</strong> — ${esc(item.reason)}</li>`)}</ul><h3>Role relevance</h3><p>${esc(r.jobRelevance)}</p><p>${esc(r.limitations)}</p><small>Review guidance only. No code was executed and no test pass is claimed.</small></section>`;
  }
  function showReport(review, kind, targetId) {
    const token = sequence;
    const selectedJob = list(state().jobs).find(job => job.id === review.jobId);
    const roleName = selectedJob ? `${selectedJob.role} · ${selectedJob.company}` : (review.jobId ? `Saved role (${review.jobId})` : 'none');
    const stale = review.revision !== revision();
    const importReason = review.tasksImported ? 'Tasks from this review were already added.' : stale ? 'Workspace changed since this review. Run the review again before importing tasks.' : '';
    const context = `Review snapshot · created ${esc(review.createdAt)} · role ${esc(roleName)}. This report uses the context saved at review time.`;
    body().innerHTML = `<p>${context}</p>${kind === 'project' ? projectReport(review) : codingReport(review)}<p data-error role="status" aria-live="polite">${esc(importReason)}</p><div class="dialog-actions"><button class="btn" data-back>Past reviews</button>${kind === 'project' ? `<button class="btn primary" data-import ${review.tasksImported || stale ? 'disabled' : ''}>${review.tasksImported ? 'Tasks added' : 'Add improvement tasks'}</button>` : ''}</div>`;
    body().querySelector('[data-back]').onclick = () => openHistory(kind, targetId);
    const importButton = body().querySelector('[data-import]');
    if (importButton) { importButton.dataset.label = 'Add improvement tasks'; importButton.onclick = async () => {
      if (busy || review.tasksImported || review.revision !== revision()) return setStatus(review.tasksImported ? 'These tasks were already added.' : 'Workspace changed since this review. Run the review again before importing tasks.');
      busy = true; loading(importButton, true);
      try { const snapshot = await opts.api(`/api/coaches/reviews/${encodeURIComponent(review.id)}/tasks`, { method: 'POST', body: { revision: revision() } }); opts.onState(snapshot); if (token === sequence) { review.tasksImported = true; showReport(review, kind, targetId); } }
      catch (e) { if (token === sequence) noticeError(e); }
      finally { busy = false; if (token === sequence && body().contains(importButton)) loading(importButton, false); }
    }; }
  }
  async function openHistory(kind, targetId) {
    const token = open(kind === 'project' ? 'Project review history' : 'Coding review history', '<p data-error role="status">Loading past reviews…</p>');
    try {
      const query = new URLSearchParams({ kind }); if (targetId) query.set('targetId', targetId);
      const response = await opts.api(`/api/coaches/reviews?${query}`);
      if (token !== sequence) return;
      const reviews = list(response.reviews || response);
      body().innerHTML = `<p data-error role="status"></p>${reviews.length ? reviews.map(r => `<article class="card"><strong>${esc(r.createdAt)}</strong><p>${esc(r.result && r.result.summary || r.result && r.result.reasoning || 'Saved coaching review')}</p><small>Role: ${esc(r.jobId || 'none')} · workspace revision ${esc(r.revision)}</small><button class="btn" type="button" data-view="${esc(r.id)}">View report</button></article>`).join('') : '<p>No saved reviews yet.</p>'}`;
      body().querySelectorAll('[data-view]').forEach(button => button.onclick = async () => {
        const viewToken = sequence; try { const result = await opts.api(`/api/coaches/reviews/${encodeURIComponent(button.dataset.view)}`); if (viewToken === sequence) showReport(result.review || result, kind, targetId || result.targetId); } catch (e) { if (viewToken === sequence) noticeError(e); }
      });
    } catch (e) { if (token === sequence) noticeError(e); }
  }
  return {
    configure(config) { opts = config || {}; },
    openProject(projectId) { projectForm(projectId); },
    openCoding(prefill) { codingForm(prefill); },
    openHistory,
    renderProjectReview: projectReport,
    renderCodingReview: codingReport
  };
});

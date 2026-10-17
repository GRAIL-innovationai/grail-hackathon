(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JourneysUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const esc = value => root.Core && root.Core.escape ? root.Core.escape(value) : String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const arr = value => Array.isArray(value) ? value : [];
  const text = value => typeof value === 'string' ? value : '';
  let opts = {}, generation = 0, busy = false;
  const $ = selector => document.querySelector(selector), body = () => $('#journey-body');
  const state = () => opts.getState ? opts.getState() || {} : {};
  const revision = () => opts.getRevision ? opts.getRevision() : 0;
  const open = (title, html) => { generation++; $('#journey-title').textContent = title; body().innerHTML = html; if (!$('#journey-dialog').open) $('#journey-dialog').showModal(); return generation; };
  const status = message => { const node = body().querySelector('[data-message]'); if (node) node.textContent = message; else opts.onNotice && opts.onNotice(message); };
  const job = id => arr(state().jobs).find(item => item.id === id);
  const roleTitle = item => item ? `${item.role} at ${item.company}` : 'Selected role';
  const safeUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
  const sourceLinks = sources => arr(sources).map(s => { const url = safeUrl(s.url), wiki = /wikipedia\.org/i.test(url); return `<li>${wiki ? '<strong>Possible company name match (Wikipedia):</strong> ' : ''}${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || url)}</a>` : esc(s.title)}${s.excerpt ? `<blockquote>${esc(s.excerpt)}</blockquote>` : ''}</li>`; }).join('') || '<li>No external sources supplied.</li>';
  const renderTurns = history => arr(history).map(turn => `<article class="card"><strong>${turn.role === 'candidate' ? 'You' : 'Interviewer prompt'}</strong><p class="ai-text">${esc(turn.text)}</p>${turn.feedback ? `<p><strong>Feedback:</strong> ${esc(turn.feedback)}</p>` : ''}${turn.focus ? `<p><strong>Focus:</strong> ${esc(turn.focus)}</p>` : ''}${turn.practiceTask ? `<p><strong>Practice:</strong> ${esc(turn.practiceTask)}</p>` : ''}${turn.evidenceQuote ? `<blockquote>${esc(turn.evidenceQuote)}</blockquote>` : ''}${turn.limitations ? `<small>${esc(turn.limitations)}</small>` : ''}</article>`).join('');
  const jobsHtml = jobs => arr(jobs).map((item, i) => {
    const url = safeUrl(item.url), sourceUrl = safeUrl(item.sourceUrl);
    return `<article class="card"><h3>${esc(item.role)} · ${esc(item.company)}</h3><p>${esc(item.location)} · ${esc(item.type)}</p><p>${esc(item.description)}</p><p>${item.publishedAt ? `Published ${esc(item.publishedAt)}` : 'Publication date unavailable'} · ${esc(item.source || 'Source unavailable')}</p>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">View listing</a>` : '<p>Listing link unavailable</p>'}${sourceUrl ? ` · <a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">Source</a>` : ''}<button class="btn" type="button" data-save="${i}">Save role</button></article>`;
  }).join('');

  async function openSearch() {
    const profile = state().profile || {}, token = open('Find opportunities', `<p class="notice">Search curated employer postings checked October 17, 2026. This catalog is a snapshot; confirm availability on the employer site. No application is sent.</p><form id="opportunity-form"><label class="field"><span>Role or keyword</span><input name="query" maxlength="120" value="${esc(profile.target || '')}" required></label><label class="field"><span>Level</span><select name="level"><option value="all">All</option><option value="internship">Internship</option><option value="entry">Entry level</option><option value="senior">Senior</option></select></label><label class="field"><span>Location contains</span><input name="location" maxlength="120" value="${esc(profile.location || '')}"></label><p data-message role="status" aria-live="polite"></p><div class="dialog-actions"><button class="btn primary" data-label="Search">Search sourced roles</button></div></form><div id="opportunity-results"></div>`);
    const form = body().querySelector('#opportunity-form');
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      busy = true; const button = form.querySelector('button'); button.disabled = true; button.textContent = 'Searching…';
      try {
        const result = await opts.api('/api/opportunities/search', { method: 'POST', body: { query: form.query.value.trim(), level: form.level.value, location: form.location.value.trim() } });
        if (token !== generation) return;
        const results = body().querySelector('#opportunity-results');
        results.innerHTML = `<p>${esc(result.notice || 'Remote job listings may be delayed by up to 24 hours.')}</p><p>Source: ${esc(result.source || 'Remotive')}${result.cachedAt ? ` · cached ${esc(result.cachedAt)}` : ''}</p>${jobsHtml(result.jobs) || '<p>No matching roles found. Try a broader search.</p>'}`;
        results.querySelectorAll('[data-save]').forEach(save => save.onclick = async () => {
          const item = arr(result.jobs)[Number(save.dataset.save)]; if (!item || (!item.demo && !safeUrl(item.url))) return status('This listing has no safe HTTPS link and cannot be saved.');
          const current = state(), next = structuredClone(current); const duplicate = next.jobs.some(existing => existing.id === item.id || (item.url && existing.url === item.url) || (existing.company === item.company && existing.role === item.role));
          if (duplicate) return status('This role is already in your workspace.');
          const jobRecord = item;
          next.jobs.push({ ...jobRecord, status: 'Saved', skills: arr(jobRecord.skills), description: text(jobRecord.description), resume: '', cover: '', outreach: '' });
          if (opts.commitState && await opts.commitState(next)) { status(`${item.role} at ${item.company} saved.`); save.disabled = true; }
          else status('Could not save this role. Resolve any pending workspace save and try again.');
        });
      } catch (error) { if (token === generation) status(error && error.message || 'Opportunity search failed.'); }
      finally { busy = false; if (token === generation && body().contains(button)) { button.disabled = false; button.textContent = 'Search roles'; } }
    };
  }

  function interviewView(session) {
    const item = job(session.jobId), history = arr(session.history), atLimit = history.filter(turn => turn.role === 'candidate').length >= 12;
    const token = generation;
    body().innerHTML = `<p>${esc(roleTitle(item))} · ${esc(session.mode)} practice. These are generated exercises, not confirmed employer questions.</p>${session.context ? `<section class="card"><h3>Research context</h3><p>${esc(session.context.notice || '')}</p><ul>${sourceLinks(session.context.sources)}</ul><p>${esc(session.context.limitations || '')}</p></section>` : ''}<div>${renderTurns(history)}</div>${atLimit ? '<p>Session limit reached (12 candidate turns). Start a new session to continue.</p>' : `<form id="interview-answer"><label class="field"><span>Your answer</span><textarea name="answer" maxlength="4000" rows="5" required></textarea></label><p data-message role="status" aria-live="polite"></p><div class="dialog-actions"><button class="btn">Continue practice</button></div></form>`}<button class="btn" type="button" data-sessions>Past sessions</button>`;
    const form = body().querySelector('#interview-answer');
    if (form) form.onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      const answer = form.answer.value.trim(); if (!answer) return;
      busy = true; const button = form.querySelector('button'); button.disabled = true; button.textContent = 'Preparing next turn…';
      try { const result = await opts.api(`/api/interviews/${encodeURIComponent(session.id)}/answer`, { method: 'POST', body: { answer, revision: revision(), consent: true } }); if (token === generation) interviewView(result.session || result); }
      catch (error) { if (token === generation) status(error && error.message || 'Could not continue practice.'); }
      finally { busy = false; }
    };
    body().querySelector('[data-sessions]').onclick = () => interviewHistory(session.jobId);
  }
  async function interviewHistory(jobId) {
    const token = open('Saved interview sessions', '<p data-message role="status">Loading sessions…</p>');
    try {
      const result = await opts.api(`/api/interviews?jobId=${encodeURIComponent(jobId)}`); if (token !== generation) return;
      const sessions = arr(result.sessions);
      body().innerHTML = `<p data-message role="status"></p>${sessions.length ? sessions.map(s => `<article class="card"><strong>${esc(s.createdAt)} · ${esc(s.mode)}</strong><p>${esc(roleTitle(job(s.jobId)))}</p><small>${arr(s.history).filter(t => t.role === 'candidate').length} answers</small><button class="btn" type="button" data-session="${esc(s.id)}">Open session</button></article>`).join('') : '<p>No saved sessions.</p>'}`;
      body().querySelectorAll('[data-session]').forEach(button => button.onclick = async () => { const viewToken = generation; try { const response = await opts.api(`/api/interviews/${encodeURIComponent(button.dataset.session)}`); if (viewToken === generation) interviewView(response.session || response); } catch (error) { if (viewToken === generation) status(error && error.message || 'Could not load session.'); } });
    } catch (error) { if (token === generation) status(error && error.message || 'Could not load sessions.'); }
  }
  function openInterview(jobId) {
    const item = job(jobId); if (!item) return open('Interview practice', '<p data-message role="status">That role is no longer available.</p>');
    const token = open('Practice for an interview', `<p>Practice for ${esc(roleTitle(item))}. Generated prompts are practice exercises and may not match the employer’s process.</p><label class="field"><span>Practice style</span><select id="interview-mode"><option value="behavioral">Behavioral</option><option value="technical">Technical</option><option value="mixed" selected>Mixed</option></select></label><button type="button" class="btn" data-research>Load sourced posting brief</button><section id="interview-research" class="card" hidden></section><label class="field" id="research-confirm-wrap" hidden><span><input id="research-confirmed" type="checkbox"> I reviewed the dated posting summary and want to include it in practice.</span></label><label class="field"><span><input id="interview-consent" type="checkbox"> I agree to send my resume text (up to 6,000 characters), this role, confirmed optional company research and prior answers to Groq for this practice session.</span><small>Remove private details before continuing.</small></label><p data-message role="status" aria-live="polite"></p><div class="dialog-actions"><button type="button" class="btn" data-sessions>Past sessions</button><button type="button" class="btn primary" data-start ${opts.ai && opts.ai.configured ? '' : 'disabled'}>Start practice</button></div>${opts.ai && opts.ai.configured ? '' : '<p>AI is unavailable. Configure a Groq key in the local .env file and restart the server. Past sessions remain available.</p>'}`);
    let researchLoaded = false;
    body().querySelector('[data-research]').onclick = async event => {
      const button = event.currentTarget; if (busy) return; busy = true; button.disabled = true; button.textContent = 'Loading…';
      try { const result = await opts.api(`/api/company?jobId=${encodeURIComponent(jobId)}`); if (token !== generation) return; const panel = body().querySelector('#interview-research'); panel.hidden = false; panel.innerHTML = `<p>${esc(result.notice || 'Check that each source describes this company.')}</p><ul>${sourceLinks(result.sources)}</ul>`; body().querySelector('#research-confirm-wrap').hidden = false; researchLoaded = true; }
      catch (error) { if (token === generation) status(error && error.message || 'Could not load company research.'); }
      finally { busy = false; if (token === generation && body().contains(button)) { button.disabled = false; button.textContent = 'Reload sourced posting brief'; } }
    };
    body().querySelector('[data-sessions]').onclick = () => interviewHistory(jobId);
    body().querySelector('[data-start]').onclick = async event => {
      const button = event.currentTarget; if (busy || !body().querySelector('#interview-consent').checked || !opts.ai?.configured) return status('Select consent before starting practice.');
      busy = true; button.disabled = true; button.textContent = 'Starting…';
      try { if (await opts.flushSaves() === false) throw new Error('Save pending workspace changes before starting practice.'); const result = await opts.api('/api/interviews/start', { method: 'POST', body: { jobId, mode: body().querySelector('#interview-mode').value, researchConfirmed: researchLoaded && body().querySelector('#research-confirmed').checked, revision: revision(), consent: true } }); if (token === generation) interviewView(result.session || result); else opts.onNotice && opts.onNotice('Interview session saved. Open past sessions to view it.'); }
      catch (error) { if (token === generation) status(error && error.message || 'Could not start practice.'); }
      finally { busy = false; if (token === generation && body().contains(button)) { button.disabled = !opts.ai?.configured; button.textContent = 'Start practice'; } }
    };
  }

  function openCompanyUpdate(jobId) {
    const item = job(jobId); if (!item) return open('Company update', '<p data-message role="status">That role is no longer available.</p>');
    const token = open('Review a company update', `<p>Paste a message you received about ${esc(roleTitle(item))}. This tool reviews only the message you provide; it does not connect to email or LinkedIn.</p><button class="btn secondary" type="button" data-demo-message>Load demo interview invitation</button><form id="update-form"><label class="field"><span>Subject</span><input name="subject" maxlength="240"></label><label class="field"><span>Message text (up to 12,000 characters)</span><textarea name="message" maxlength="12000" rows="10" required></textarea><input type="file" name="upload" accept=".eml,.txt"></label><label class="field"><span>Received date</span><input type="date" name="receivedDate"></label><label class="field"><span><input type="checkbox" name="consent" required> I agree to send this selected message and role details to Groq for a proposed status update.</span><small>Review the proposal before applying it to your workspace.</small></label><p data-message role="status" aria-live="polite"></p><div class="dialog-actions"><button class="btn primary" ${opts.ai && opts.ai.configured ? '' : 'disabled'}>Review update</button></div></form>${opts.ai && opts.ai.configured ? '' : '<p>AI is unavailable. Configure a Groq key in the local .env file and restart the server.</p>'}`);
    const form = body().querySelector('#update-form');
    body().querySelector('[data-demo-message]').onclick = () => {
      form.subject.value = `DEMO invitation: ${item.role}`;
      form.message.value = `DEMO MESSAGE — not a real recruiter email.\n\nHi,\nThank you for applying for ${item.role} at ${item.company}. We would like to schedule an interview. Please reply with your availability for a 30-minute technical conversation next week.\n\n${item.company} recruiting team (fictional)`;
      status('Demo invitation loaded. You can edit it before consenting to AI review.');
    };
    form.upload.onchange = async () => { const file = form.upload.files[0]; if (!file) return; try { if (file.size > 50000) throw new Error('File is too large.'); const content = await file.text(); if (content.length > 12000) throw new Error('Message exceeds 12,000 characters.'); form.message.value = content; if (!form.subject.value) form.subject.value = file.name.replace(/\.(eml|txt)$/i, ''); status('Message loaded. Check it before generating.'); } catch (error) { status(error.message); } form.upload.value = ''; };
    form.onsubmit = async event => {
      event.preventDefault(); if (busy || !opts.ai?.configured) return;
      const message = `${form.subject.value.trim() ? `Subject: ${form.subject.value.trim()}\n` : ''}${form.receivedDate.value ? `Received date: ${form.receivedDate.value}\n` : ''}${form.message.value.trim()}`;
      if (!form.consent.checked) return status('Select consent before reviewing this message.');
      if (!message || message.length > 12000) return status('Add a message under 12,000 characters.');
      busy = true; const button = form.querySelector('button.primary'); button.disabled = true; button.textContent = 'Reviewing…';
      try { if (await opts.flushSaves() === false) throw new Error('Save pending workspace changes before reviewing the update.'); const result = await opts.api('/api/updates/preview', { method: 'POST', body: { jobId, message, revision: revision(), consent: true } }); if (token === generation) updatePreview(result.update || result, jobId); else opts.onNotice && opts.onNotice('Company update review saved. Reopen the role to view it.'); }
      catch (error) { if (token === generation) status(error && error.message || 'Could not review this update.'); }
      finally { busy = false; if (token === generation && body().contains(button)) { button.disabled = !opts.ai?.configured; button.textContent = 'Review update'; } }
    };
  }
  function updatePreview(update, jobId) {
    const token = generation, allowed = ['Applied', 'Interview', 'Offer', 'Rejected'].includes(update.proposedStatus);
    body().innerHTML = `<p>${esc(roleTitle(job(jobId)))} · Proposed status: <strong>${esc(update.proposedStatus)}</strong></p><p>Summary: ${esc(update.summary)}</p><h3>Evidence from your message</h3><blockquote>${esc(update.evidenceQuote)}</blockquote><p>Review this proposal. The original message is stored as plain text.</p><p data-message role="status" aria-live="polite"></p><div class="dialog-actions"><button class="btn" data-back>Back to message</button><button class="btn primary" data-accept ${allowed && !update.applied && update.revision === revision() ? '' : 'disabled'}>Apply status</button></div>${allowed && update.revision === revision() ? '' : '<p>This proposal cannot be applied because its status is Unknown or the workspace has changed.</p>'}`;
    body().querySelector('[data-back]').onclick = () => openCompanyUpdate(jobId);
    body().querySelector('[data-accept]').onclick = async () => {
      if (!allowed || update.applied || update.revision !== revision() || busy) return status('This proposal cannot be applied.');
      busy = true; const button = body().querySelector('[data-accept]'); button.disabled = true;
      try { const snapshot = await opts.api(`/api/updates/${encodeURIComponent(update.id)}/accept`, { method: 'POST', body: { revision: revision() } }); opts.onState && opts.onState(snapshot); if (token === generation) { update.applied = true; status(`Applied ${update.proposedStatus} to ${roleTitle(job(jobId))}.`); } }
      catch (error) { if (token === generation) status(error && error.message || 'Could not apply this update.'); }
      finally { busy = false; }
    };
  }

  return { configure(config) { opts = config || {}; }, openSearch, openInterview, openCompanyUpdate, renderJobs: jobsHtml, safeUrl, renderSources: sourceLinks, renderTurns, renderInterview: interviewView, renderUpdate: updatePreview };
});

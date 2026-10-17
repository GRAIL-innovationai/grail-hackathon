/* Inline, consented job research and replayable reports. */
(function () {
  'use strict';
  const esc = value => window.Core.escape(value == null ? '' : String(value));
  const arr = value => Array.isArray(value) ? value : [];
  let opts = {}, brief = '', context = null, contextRevision = null, contextNotice = '', runs = [], selected = '', loading = false, loadingRuns = false, loaded = false, generation = 0, notice = '';
  const root = () => document.querySelector('#discover-assistant');
  const safeUrl = value => window.JourneysUI.safeUrl(value);
  const sameListing = (a, b) => a.id === b.id || Boolean(safeUrl(a.url) && safeUrl(a.url) === safeUrl(b.url));
  const stamp = value => { const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toLocaleString() : 'Time unavailable'; };
  const checkedRun = () => runs.find(run => run.id === selected) || runs[0] || null;

  function contextHtml() {
    if (!context) return '<p class="muted" role="status">Loading the context available to Scout…</p>';
    const skills = arr(context.skills).length ? arr(context.skills).join(', ') : String(context.skills || 'Not added');
    const projects = arr(context.projects);
    return `<div class="discover-context"><div><strong>Target</strong><span>${esc(context.target || 'Not added')}</span></div><div><strong>Skills</strong><span>${esc(skills || 'Not added')}</span></div><div><strong>Location</strong><span>${esc(context.location || 'Not added')}</span></div><details><summary>Resume excerpt · up to 2,500 characters</summary><pre>${esc(String(context.resumeExcerpt || context.resumeText || '').slice(0, 2500) || 'No resume text selected.')}</pre></details><details><summary>Personal background · up to 3,000 characters</summary><pre>${esc(context.background || 'No personal background added.')}</pre></details><details><summary>Project summaries · ${projects.length}</summary>${projects.length ? `<ul>${projects.map(project => `<li>${esc(typeof project === 'string' ? project : [project.name, project.description || project.summary || project.notes].filter(Boolean).join(' — '))}</li>`).join('')}</ul>` : '<p>No project summaries added.</p>'}</details></div>${contextNotice ? `<p class="muted small-note">${esc(contextNotice)}</p>` : ''}`;
  }

  function reportHtml(run) {
    if (!run) return '<div class="discover-placeholder"><span class="discover-placeholder-icon" aria-hidden="true">✳</span><h3>Your shortlist will appear here</h3><p>Describe what you want to find. Scout will explain the evidence, fit, and gaps for each result.</p></div>';
    const result = run.result || {}, plan = result.plan || {};
    const cards = arr(result.recommendations).map((recommendation, index) => {
      const job = recommendation.job || {}, href = safeUrl(job.url), jobId = job.id || `${job.company || ''}|${job.role || ''}`;
      const saved = arr(opts.getState()?.jobs).some(item => item.status !== 'Available' && sameListing(item, job));
      const evidence = arr(recommendation.evidence).map(item => { const sourceUrl = safeUrl(item.source) || href; const sourceLabel = item.source === 'metadata' ? 'Employer listing metadata' : item.source === 'description' ? 'Employer listing description' : (item.source || job.source || 'Source not specified'); return `<li><blockquote>“${esc(item.quote)}”</blockquote><small>${sourceUrl ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(sourceLabel)}</a>` : esc(sourceLabel)}</small></li>`; }).join('');
      const fit = arr(recommendation.whyFit).map(item => `<li>${esc(item)}</li>`).join(''), gaps = arr(recommendation.gaps).map(item => `<li>${esc(item)}</li>`).join('');
      return `<article class="card recommendation"><div class="recommendation-head"><span class="rank">${String(index + 1).padStart(2, '0')}</span><div><p class="eyebrow">${esc(job.company)}${job.demo === false ? '' : ' · DEMO'}</p><h3>${esc(job.role)}</h3><p class="muted">${esc(job.location)} · ${esc(job.type || 'Role')}</p></div><button class="btn primary" type="button" data-save-recommendation="${esc(jobId)}" ${saved || !href ? 'disabled' : ''}>${saved ? 'Saved to Applications' : 'Save role'}</button></div><p>${esc(job.description || '')}</p><div class="recommendation-columns"><div><h4>Why it fits</h4><ul>${fit || '<li>No fit reasons supplied.</li>'}</ul></div><div><h4>Potential gaps</h4><ul>${gaps || '<li>No gaps identified.</li>'}</ul></div></div>${evidence ? `<details class="evidence"><summary>Source evidence</summary><ul>${evidence}</ul></details>` : '<p class="muted">No source quote supplied for this recommendation.</p>'}<p class="next-step"><strong>Next step</strong><br>${esc(recommendation.nextStep || 'Review the listing and decide whether to save it.')}</p><div class="recommendation-actions">${href ? `<a class="btn secondary" href="${esc(href)}" target="_blank" rel="noopener noreferrer">View source ↗</a>` : '<span class="muted">No safe HTTPS listing link</span>'}</div></article>`;
    }).join('');
    const changed = Number.isFinite(run.revision) && typeof opts.getRevision === 'function' && run.revision !== opts.getRevision();
    return `<div class="report-top"><div><p class="eyebrow">RESEARCH REPORT · ${esc(result.source || 'Source unspecified')}</p><h3>${esc(result.summary || 'Role research')}</h3><p class="muted">Created ${esc(stamp(run.createdAt))} · ${esc(result.sourceNotice || '')}</p></div></div>${changed ? '<p class="notice">Your workspace has changed since this report. Its shortlist uses the profile context available when you researched; run a fresh search to reflect your current profile.</p>' : ''}<p class="report-request"><strong>Brief:</strong> ${esc(run.request)}</p><details class="report-plan"><summary>Saved search plan and prior criteria</summary><p>${esc(plan.rationale || 'No search rationale supplied.')}</p><p><strong>Location:</strong> ${esc(plan.location || 'Not specified')} · <strong>Level:</strong> ${esc(plan.level || 'Not specified')}</p>${arr(plan.queries).length ? `<ul>${arr(plan.queries).map(query => `<li>${esc(query)}</li>`).join('')}</ul>` : ''}<p class="muted">This report replays its saved results without a provider call. The original resume excerpt and project summaries are not retained with the report.</p></details>${arr(result.limitations).length ? `<p class="notice">${arr(result.limitations).map(esc).join(' ')}</p>` : ''}${cards ? `<div class="recommendations">${cards}</div>` : '<p class="muted">This report contains no recommendations.</p>'}`;
  }

  function render() {
    const container = root(); if (!container) return;
    const report = checkedRun(); if (!selected && report) selected = report.id;
    container.innerHTML = `<section class="discover-hero"><div class="discover-hero-copy"><p class="eyebrow">A BETTER WAY TO FIND YOUR FIT</p><h2>Tell Scout what you’re looking for.</h2><p>Get a sourced shortlist, with clear reasons each role may fit your experience and what to strengthen next.</p></div><div class="assistant-composer"><form data-discovery-form><label class="sr-only" for="discovery-brief">Describe the role you want</label><textarea id="discovery-brief" maxlength="1200" placeholder="I’m looking for a summer software internship near Bozeman or remote, focused on accessible web apps…">${esc(brief)}</textarea><div class="composer-footer"><span><span data-count>${brief.length}</span> / 1,200</span><button class="btn primary research-button" type="submit" ${loading || !opts.ai?.configured ? 'disabled' : ''}>${loading ? 'Researching…' : '✦ Research roles'}</button></div></form><div class="prompt-chips" aria-label="Suggested briefs">${['Remote frontend internships with React', 'Entry-level data roles near me', 'Product engineering roles at mission-driven teams'].map(prompt => `<button class="prompt-chip" type="button" data-brief="${esc(prompt)}">${esc(prompt)}</button>`).join('')}</div></div><div class="consent-context"><label class="research-consent"><input type="checkbox" data-consent><span><strong>Share this selected context for role research</strong><small>The brief, target, skills, location, up to 2,500 resume characters, up to 3,000 personal background characters, and short project summaries will be sent to Groq. Profile name and contact fields are not sent separately; a resume excerpt may contain them. Research searches selected employer job boards; verify the listing before acting. Review the context below first.</small></span></label><div class="context-preview"><button class="context-toggle" type="button" data-context-toggle aria-expanded="false">Preview shared context <span>⌄</span></button><div data-context-panel hidden>${contextHtml()}</div></div></div>${opts.ai?.configured ? '' : '<p class="notice">Role research is unavailable until a Groq key is configured in the local .env file and the server is restarted. Existing reports remain available.</p>'}</section><section class="discover-results"><div class="section-heading"><div><p class="eyebrow">YOUR RESEARCH</p><h2>Role shortlist</h2><p class="muted">Each recommendation includes its listing evidence, fit, gaps, and a practical next step.</p></div>${runs.length ? `<label class="report-picker"><span>Past reports</span><select data-report-select>${runs.map(item => `<option value="${esc(item.id)}"${item.id === (report && report.id) ? ' selected' : ''}>${esc(stamp(item.createdAt))} · ${esc(String(item.request || '').slice(0, 48))}</option>`).join('')}</select></label>` : ''}</div><p class="status-line" role="status" aria-live="polite">${esc(notice || (loaded ? (report ? 'Saved report loaded. No AI usage was spent.' : 'Ready when you are.') : 'Loading saved research…'))}</p><div data-report>${reportHtml(report)}</div></section>`;
    const textarea = container.querySelector('#discovery-brief');
    textarea.addEventListener('input', () => { brief = textarea.value.slice(0, 1200); container.querySelector('[data-count]').textContent = String(brief.length); });
    container.querySelector('[data-consent]').checked = false;
    container.querySelector('[data-context-toggle]').addEventListener('click', event => {
      const panel = container.querySelector('[data-context-panel]'); panel.hidden = !panel.hidden; event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
    });
    container.querySelectorAll('[data-brief]').forEach(button => button.addEventListener('click', () => { brief = button.dataset.brief; render(); container.querySelector('#discovery-brief').focus(); }));
    const select = container.querySelector('[data-report-select]'); if (select) select.addEventListener('change', () => { selected = select.value; notice = 'Saved report loaded. No AI usage was spent.'; render(); });
    container.querySelector('[data-discovery-form]').addEventListener('submit', research);
    container.querySelectorAll('[data-save-recommendation]').forEach(button => button.addEventListener('click', () => saveRole(button.dataset.saveRecommendation)));
  }

  async function load() {
    const token = ++generation; loadingRuns = true; loaded = false; notice = '';
    const [contextResult, runResult] = await Promise.allSettled([opts.api('/api/discovery/context'), opts.api('/api/discovery/runs')]);
    if (token !== generation) return;
    if (contextResult.status === 'fulfilled') { context = contextResult.value.context || null; contextRevision = contextResult.value.revision ?? null; contextNotice = contextResult.value.notice || ''; }
    else notice = 'Could not load the current profile context. Try refreshing before research.';
    if (runResult.status === 'fulfilled') { runs = arr(runResult.value.runs).slice(0, 10); if (!runs.some(run => run.id === selected)) selected = runs[0]?.id || ''; }
    else notice = 'Could not load saved reports. You can still draft a new research brief.';
    loadingRuns = false; loaded = true; render();
  }

  async function refreshContext() {
    const result = await opts.api('/api/discovery/context');
    context = result.context || null; contextRevision = result.revision ?? null; contextNotice = result.notice || '';
    render();
  }

  async function research(event) {
    event.preventDefault(); const container = root(), consent = container.querySelector('[data-consent]');
    brief = container.querySelector('#discovery-brief').value.trim();
    if (!brief) { notice = 'Describe the roles you want to find first.'; render(); return; }
    if (!consent.checked) { notice = 'Review the shared context and select consent before researching.'; render(); return; }
    if (!opts.ai?.configured) { notice = 'Configure the local Groq key before starting research.'; render(); return; }
    if (loading) return;
    loading = true; notice = 'Preparing your research request…'; render();
    try {
      if (await opts.flushSaves() === false) throw new Error('Save profile changes before starting research.');
      if (contextRevision !== opts.getRevision()) {
        const latest = await opts.api('/api/discovery/context');
        context = latest.context || context; contextRevision = latest.revision ?? null; contextNotice = latest.notice || '';
        notice = 'Your saved profile changed since you reviewed this context. Check the refreshed preview and select consent again.';
        return;
      }
      notice = 'Research request sent. Waiting for source search and role analysis…'; render();
      const response = await opts.api('/api/discovery/research', { method: 'POST', body: { request: brief.slice(0, 1200), consent: true, revision: opts.getRevision() } });
      const run = response.run; if (!run || !run.id || !run.result) throw new Error('The research response was incomplete.');
      runs = [run, ...runs.filter(item => item.id !== run.id)].slice(0, 10); selected = run.id;
      notice = `Research saved. Shared AI usage: ${response.usage?.used ?? 'unknown'} of ${response.usage?.limit ?? 'unknown'} today.`;
    } catch (error) { notice = error?.message || 'Research could not be completed. No automatic retry was made.'; }
    finally { loading = false; render(); }
  }

  async function saveRole(id) {
    const run = checkedRun(), recommendation = arr(run?.result?.recommendations).find(item => { const job = item.job || {}; return (job.id || `${job.company || ''}|${job.role || ''}`) === id; });
    const sourceJob = recommendation?.job; if (!sourceJob || !safeUrl(sourceJob.url)) return;
    const state = opts.getState(), existing = arr(state.jobs).find(job => sameListing(job, sourceJob));
    const duplicate = existing && existing.status !== 'Available';
    if (duplicate) { notice = 'This role is already in Applications.'; render(); return; }
    const next = structuredClone(state);
    if (existing) {
      window.Core.transition(next, existing.id, 'Saved');
      const saved = await opts.commitState(next);
      notice = saved ? `${existing.role} saved to Applications.` : 'The role could not be saved. Please retry after resolving the workspace connection.';
      render(); return;
    }
    const job = { ...sourceJob, id: String(sourceJob.id || `discovery-${crypto.randomUUID()}`).slice(0, 100), company: String(sourceJob.company || '').slice(0, 200), role: String(sourceJob.role || '').slice(0, 200), location: String(sourceJob.location || 'Not specified').slice(0, 160), type: String(sourceJob.type || 'Full-time').slice(0, 100), description: String(sourceJob.description || '').slice(0, 12000), skills: arr(sourceJob.skills).slice(0, 50).map(skill => String(skill).slice(0, 100)), status: 'Saved', resume: '', cover: '', outreach: '', demo: false, source: sourceJob.source || 'Job listing', url: safeUrl(sourceJob.url) };
    if (!job.company || !job.role || !job.id || next.jobs.some(item => item.id === job.id)) { notice = 'This role could not be saved because its listing details are incomplete.'; render(); return; }
    next.jobs.push(job);
    const saved = await opts.commitState(next);
    notice = saved ? `${job.role} saved to Applications.` : 'The role could not be saved. Your current application records were left unchanged.';
    render();
  }

  window.DiscoverUI = { configure(config) { opts = config || {}; }, mount() { render(); if (!loaded && !loadingRuns) load(); else if (loaded && !loadingRuns && contextRevision !== opts.getRevision()) { loadingRuns = true; refreshContext().catch(() => { notice = 'Could not refresh the shared context. Reload before researching.'; render(); }).finally(() => { loadingRuns = false; }); } }, renderReport: reportHtml };
}());

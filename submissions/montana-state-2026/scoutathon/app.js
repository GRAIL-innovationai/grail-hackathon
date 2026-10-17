/* Single-user localhost workspace. The general chat remains a labeled sample; role reviews use the server AI workflow. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const e = Core.escape;
  let storage;
  try { storage = window.localStorage; } catch { storage = null; }
  let state = Core.load(storage);
  let apiToken, revision = 0, backendReady = false, saveQueue = Promise.resolve(true), saveBlocked = false;
  const applicationFilters = { query: '', sort: 'status' };
  let ai = { configured: false, provider: 'Groq', model: 'openai/gpt-oss-20b' };
  const pages = {
    dashboard: ['Overview', 'Your career, moving forward.', 'A clear next step, wherever you are in your search.'],
    discover: ['Discover roles', 'Find your next opportunity.', 'Explore opportunities through the experience you already have.'],
    applications: ['Applications', 'Every opportunity. One place.', 'Your materials, conversations, and next steps, kept together.'],
    prep: ['Interview prep', 'Walk in with a little more confidence.', 'Turn your experience into clear stories and thoughtful answers.'],
    development: ['Development', 'Build something worth talking about.', 'Make steady progress on the skills your next role needs.'],
    profile: ['Profile', 'Start with your story.', 'Your experience and preferences shape your career workspace.']
  };
  let toastTimer, activeJobId, aiJobId, proposal = null, generating = false;
  let practiceFeedback = [], practiceFeedbackLoaded = false, practiceFeedbackLoading = false;
  function toast(message) {
    $('#toast').textContent = message; $('#toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
  }
  function connectionNotice(message) {
    $('#connection-notice').textContent = message; $('#connection-notice').hidden = !message;
  }
  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options, body: options.body && typeof options.body === 'object' ? JSON.stringify(options.body) : options.body,
      signal: AbortSignal.timeout(path === '/api/discovery/research' ? 85000 : /^\/api\/(generate|coaches|interviews|updates)/.test(path) ? 40000 : 15000),
      headers: { 'Content-Type': 'application/json', ...(apiToken ? { 'X-Workspace-Token': apiToken } : {}), ...options.headers }
    });
    const body = await response.json();
    if (!response.ok) { const error = new Error(body.error || 'The local server could not complete this request.'); error.status = response.status; throw error; }
    return body;
  }
  function persist(message = 'Saved to local SQLite.') {
    const cached = Core.save(storage, state);
    if (!backendReady || saveBlocked) { toast('Not saved to SQLite. Resolve the connection message before continuing.'); return Promise.resolve(false); }
    const snapshot = structuredClone(state);
    $('#storage-status').textContent = '● Saving to SQLite…';
    saveQueue = saveQueue.then(async previous => {
      if (!previous || saveBlocked) return false;
      try {
        const result = await api('/api/state', { method: 'PUT', body: JSON.stringify({ state: snapshot, revision }) });
        revision = result.revision; $('#storage-status').textContent = '● SQLite · saved on this computer';
        toast(message.replace(/in this browser\.?/i, 'to local SQLite.')); return true;
      } catch (error) {
        saveBlocked = true; $('#storage-status').textContent = '● SQLite save needs attention';
        connectionNotice(`${error.status === 409 ? 'Another tab changed this workspace.' : 'The workspace save could not be confirmed.'} ${cached ? 'Your changes are backed up in this browser.' : 'Browser backup is unavailable.'} Use “Export recovery copy” before reloading.`);
        if (!$('#recovery-export')) { const button = document.createElement('button'); button.id = 'recovery-export'; button.className = 'btn secondary'; button.textContent = 'Export recovery copy'; button.addEventListener('click', exportRecovery); $('#connection-notice').after(button); }
        toast(cached ? 'Save not confirmed. Your changes are backed up in this browser.' : 'Save not confirmed. Export a recovery copy before closing.'); return false;
      }
    });
    return saveQueue;
  }
  function exportRecovery() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url;
    link.download = 'scout-recovery.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function bootstrap() {
    $('#view').textContent = 'Opening your local workspace…';
    try {
      const session = await api('/api/session'); apiToken = session.token; ai = session.ai;
      const snapshot = await api('/api/state'); revision = snapshot.revision;
      if (snapshot.initialized) state = snapshot.state;
      else {
        const initialized = await api('/api/state', { method: 'PUT', body: JSON.stringify({ state, revision }) });
        state = initialized.state; revision = initialized.revision;
      }
      const referencesUpdated = Core.refreshReferenceContent(state);
      const attemptsAdded = Core.attachSampleAttempts ? Core.attachSampleAttempts(state) : false;
      backendReady = true; Core.save(storage, state);
      CoachUI.configure({
        api, getState: () => state, getRevision: () => revision,
        flushSaves: async () => { const saved = await saveQueue; return saved && !saveBlocked; },
        onState: snapshot => { state = snapshot.state; revision = snapshot.revision; Core.save(storage, state); render(); if ($('#editor-dialog').open && activeJobId) showJob(activeJobId); },
        onReview: review => { practiceFeedback = [review, ...practiceFeedback.filter(item => item.id !== review.id)]; practiceFeedbackLoaded = true; InterviewProblemsUI.mount(); },
        onNotice: toast, ai
      });
      JourneysUI.configure({
        api, getState: () => state, getRevision: () => revision,
        flushSaves: async () => { const saved = await saveQueue; return saved && !saveBlocked; },
        onState: snapshot => { state = snapshot.state; revision = snapshot.revision; Core.save(storage, state); render(); if ($('#editor-dialog').open && activeJobId) showJob(activeJobId); },
        commitState: async nextState => { if (!Core.validateState(nextState)) { toast('This record could not be saved.'); return false; } state = nextState; const saved = await persist(); render(); return saved; },
        onNotice: toast, ai
      });
      DiscoverUI.configure({
        api, getState: () => state, getRevision: () => revision,
        flushSaves: async () => { const saved = await saveQueue; return saved && !saveBlocked; },
        commitState: async nextState => { if (!Core.validateState(nextState)) { toast('This record could not be saved.'); return false; } state = nextState; const saved = await persist(); render(); return saved; },
        onNotice: toast, ai
      });
      PracticeUI.configure({
        getState: () => state,
        commitState: async nextState => { if (!Core.validateState(nextState)) return false; state = nextState; const saved = await persist(); render(); return saved; },
        onNotice: toast
      });
      InterviewProblemsUI.configure({
        getState: () => state,
        commitState: async nextState => { if (!Core.validateState(nextState)) return false; state = nextState; const saved = await persist(); render(); return saved; },
        getFeedback: jobId => practiceFeedback.filter(review => !review.jobId || review.jobId === jobId).slice(0, 3).flatMap(review => review.result?.weaknesses || []),
        onOpenAttempt: id => PracticeUI.open(id),
        onReviewAttempt: (jobId, problemId, practiceId) => {
          const job = state.jobs.find(item => item.id === jobId && item.status === 'Interview');
          const problem = InterviewProblems.catalog.find(item => item.id === problemId);
          const record = state.practice.find(item => item.id === practiceId && item.jobId === jobId && item.problemId === problemId);
          if (!job || !problem || !record) { toast('This interview role or attempt is no longer available.'); return; }
          CoachUI.openCoding({ jobId, input: { problem: `${problem.title}\nPractice focus: ${problem.focus}\nProblem reference: ${problem.url}\nCandidate reflection: ${record.attempt?.notes || ''}`, solution: record.attempt?.solution || '', language: record.attempt?.language || 'JavaScript', topic: problem.topic, difficulty: problem.difficulty } });
        },
        onNotice: toast
      });
      $('#storage-status').textContent = '● SQLite · saved on this computer';
      $('#footer-status').textContent = `Local SQLite · public employer boards · company updates mocked · ${ai.configured ? 'AI connected to Groq' : 'AI needs a Groq key'}`;
      render();
      if (attemptsAdded || referencesUpdated) persist('Demo references updated; edited records kept.');
    } catch {
      connectionNotice('Cannot open the SQLite workspace. Start the app with npm start and open http://127.0.0.1:4173. Existing browser data has been kept.');
      $('#view').textContent = 'The local server is required to load and save your workspace.';
      $('#storage-status').textContent = '● Local server unavailable';
    }
  }
  function route() { return Object.hasOwn(pages, location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard'; }
  function render() {
    const current = route(), [label, title, description] = pages[current];
    $('#breadcrumb').textContent = label; $('#page-title').textContent = title;
    $('#page-description').textContent = description;
    $('#view').innerHTML = Views[current](state, current === 'applications' ? applicationFilters : undefined);
    if (current === 'discover') DiscoverUI.mount();
    if (current === 'prep' || current === 'development') {
      const panel = document.createElement('section'); panel.id = 'interview-problems'; $('#view').prepend(panel);
      InterviewProblemsUI.mount();
      if (!practiceFeedbackLoaded && !practiceFeedbackLoading) {
        practiceFeedbackLoading = true;
        api('/api/coaches/reviews?kind=coding').then(result => { practiceFeedback = Array.isArray(result.reviews) ? result.reviews : []; practiceFeedbackLoaded = true; InterviewProblemsUI.mount(); })
          .catch(() => { /* Role-based practice remains available without past feedback. */ }).finally(() => { practiceFeedbackLoading = false; });
      }
    }
    document.querySelectorAll('.nav-link').forEach(link => {
      const active = link.hash === `#${current}`; link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    $('#avatar').textContent = state.profile.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'ME';
    document.title = `${label} · Scout`;
  }
  const jobById = id => state.jobs.find(job => job.id === id);
  function showForm(title, content) {
    $('#form-title').textContent = title; $('#form-body').innerHTML = content; $('#form-dialog').showModal();
  }
  function showJob(id) {
    const job = jobById(id); if (!job) return;
    activeJobId = id;
    const fit = Core.match(job, state.profile);
    $('#editor-title').textContent = `${job.company} · ${job.role}`;
    $('#editor-body').innerHTML = `<div class="job-meta"><span class="badge">${e(job.status === 'Offer' ? 'Offer received' : job.status === 'Accepted' ? 'Offer accepted' : job.status)}</span> ${e(job.location)} · ${e(job.type)}</div>
      <div class="application-link-row">${JourneysUI.safeUrl(job.url) ? `<a class="btn primary" href="${e(JourneysUI.safeUrl(job.url))}" target="_blank" rel="noopener noreferrer">Open application page ↗</a>` : '<span class="muted">Demo role or no application URL entered.</span>'}</div><div class="button-row"><button class="btn secondary" data-action="company-update" data-id="${e(id)}">Review company update</button><button class="btn secondary" data-action="adaptive-interview" data-id="${e(id)}">Interview practice</button><button class="btn secondary" data-action="export-materials" data-id="${e(id)}">Download saved drafts</button></div>
      <p>${e(job.description)}</p><div class="notice"><strong>${e(fit.label)}</strong><p>Matching skills: ${e(fit.matched.join(', ') || 'None listed yet')}. Skills to explore: ${e(fit.missing.join(', ') || 'No listed gaps')}.</p><small>This compares listed skills only; it is not a hiring prediction.</small></div>
      <section class="card"><h3>Create tailored drafts with AI</h3><p>Start from your saved resume and profile. Generate resume suggestions, a cover letter, and an outreach note—even when the draft fields are blank.</p><button class="btn primary" data-action="ai-review" data-id="${e(id)}" ${ai.configured ? '' : 'disabled'}>Generate review & drafts with AI</button><button class="btn secondary" data-action="previous-review" data-id="${e(id)}">View previous AI review</button><p class="muted">${ai.configured ? `${e(ai.provider)} · ${e(ai.model)}. You choose whether to send your resume. Review all suggestions before accepting.` : 'Add a Groq Free-plan key to the local .env file and restart npm start. Your key stays on the server.'}</p></section>
      <form id="materials-form"><label class="field"><span>Personalized resume notes</span><textarea name="resume" rows="4" maxlength="12000" placeholder="Choose the experience most relevant to this role…">${e(job.resume)}</textarea></label><label class="field"><span>Cover letter</span><textarea name="cover" rows="5" maxlength="12000" placeholder="Write or paste your cover letter…">${e(job.cover)}</textarea></label><label class="field"><span>Outreach draft</span><textarea name="outreach" rows="4" maxlength="12000" placeholder="An introduction you can personalize before sending…">${e(job.outreach)}</textarea></label><div class="dialog-actions"><button class="btn secondary" type="button" data-action="draft-outline">Add starter outlines</button><button class="btn primary" type="submit">Save materials</button></div><p class="muted">Saved on this computer in SQLite. Nothing is submitted or emailed.</p></form>`;
    if (!$('#editor-dialog').open) $('#editor-dialog').showModal();
  }
  async function reviewWithAi(id) {
    if (!ai.configured || generating || !backendReady) return;
    const job = jobById(id), form = $('#materials-form'); if (!job || !form) return;
    const data = Object.fromEntries(new FormData(form));
    Object.assign(job, { resume: data.resume, cover: data.cover, outreach: data.outreach });
    if (!await persist('Materials saved before AI review.')) return;
    $('#editor-dialog').close(); proposal = null; aiJobId = id;
    $('#ai-body').innerHTML = `<p>The review sends only the selected role and your saved resume/profile context to <strong>Groq</strong>. It does not access your email, LinkedIn, files, or other applications.</p><p class="notice">Check the resume below for private details. Remove contact details or confidential information in Profile before continuing. A free plan is still an external service.</p><details><summary>View resume text that will be sent (up to 10,000 characters)</summary><pre class="ai-text">${e(state.profile.resumeText.slice(0, 10000))}</pre></details><details><summary>View personal background that will be sent (up to 6,000 characters)</summary><pre class="ai-text">${e((state.profile.background || '').slice(0, 6000))}</pre></details><details><summary>View role context (up to 6,000 description characters)</summary><pre class="ai-text">${e(JSON.stringify({company:job.company,role:job.role,location:job.location,type:job.type,skills:job.skills,description:job.description.slice(0,6000)},null,2))}</pre></details><p>Also included: your target role, location, listed skills, and the personal background shown here. Documents and instructions are treated as source data. AI output may still contain mistakes.</p><form id="ai-consent-form"><label class="consent"><input type="checkbox" name="consent" required> I agree to send this resume and role context to Groq for this review.</label><div class="dialog-actions"><a href="#profile" class="btn secondary" data-action="ai-edit-profile">Edit profile first</a><button class="btn primary" type="submit">Generate review & drafts</button></div><p class="muted">One request, no automatic retries. The app caps requests at 20 per UTC day. Stay on Groq Free with no payment method; the app cannot verify account billing status.</p></form>`;
    $('#ai-dialog').showModal();
  }
  async function generateReview(form) {
    if (generating || !form.elements.consent.checked) return;
    generating = true; const button = form.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = 'Reviewing…';
    const status = document.createElement('p'); status.setAttribute('role', 'status'); form.append(status); status.textContent = 'Waiting for Groq. Your application has not been changed.';
    try {
      if (!await saveQueue || saveBlocked) throw new Error('Save your workspace before generating a review.');
      const result = await api('/api/generate', { method: 'POST', body: JSON.stringify({ jobId: aiJobId, revision, consent: true }) });
      proposal = result.proposal;
      if ($('#ai-dialog').open) renderProposal(result.usage);
      else toast('Review saved. Reopen the role to review the generated draft.');
    } catch (error) { status.textContent = error.name === 'TimeoutError' ? 'Review timed out. No automatic retry was sent.' : error.message; }
    finally { generating = false; if (button.isConnected) { button.disabled = false; button.textContent = 'Generate review'; } }
  }
  function renderProposal(usage) {
    const result = proposal.result;
    const items = values => `<ul>${values.map(value => `<li>${e(value)}</li>`).join('')}</ul>`;
    const canAccept = proposal.status === 'pending' && proposal.revision === revision;
    $('#ai-body').innerHTML = `<p class="notice">AI-generated proposal · ${proposal.status === 'accepted' ? 'previously accepted' : 'not applied yet'}. Verify claims and wording. ${canAccept ? 'Accepting replaces this role’s three material fields with the drafts below.' : 'This review is read-only because it was accepted or the workspace changed. Generate a new review for current materials.'}</p><h3>Assessment</h3><p>${e(result.summary)}</p><h3>Evidence from your inputs</h3><ul>${result.evidence.map(item => `<li><strong>${e(item.source)}:</strong> “${e(item.quote)}”</li>`).join('')}</ul><h3>Strengths</h3>${items(result.strengths)}<h3>Gaps</h3>${items(result.gaps)}<h3>Next steps</h3>${items(result.nextSteps)}<h3>Resume notes</h3><pre class="ai-text">${e(result.resume)}</pre><h3>Cover letter</h3><pre class="ai-text">${e(result.cover)}</pre><h3>Outreach draft</h3><pre class="ai-text">${e(result.outreach)}</pre><div class="dialog-actions"><button class="btn secondary" data-close>Close review</button><button class="btn primary" data-action="accept-proposal" ${canAccept ? '' : 'disabled'}>Accept these drafts</button></div><p class="muted">${usage ? `${usage.used} of ${usage.limit} app requests used today. ` : ''}Proposal saved in local SQLite. No application or email is sent.</p><p id="ai-accept-status" role="status"></p>`;
  }
  async function previousReview(id) {
    if (generating) { toast('Wait for the current review to finish.'); return; }
    try {
      const result = await api(`/api/proposals?jobId=${encodeURIComponent(id)}`);
      if (!result.proposal) { toast('No AI review has been generated for this role yet.'); return; }
      proposal = result.proposal; renderProposal(); $('#ai-dialog').showModal();
    } catch { toast('Could not load the previous review. Check the local server.'); }
  }
  async function acceptProposal(button) {
    if (!proposal || !await saveQueue || saveBlocked) return;
    button.disabled = true;
    try {
      const snapshot = await api(`/api/proposals/${encodeURIComponent(proposal.id)}/accept`, { method: 'POST', body: JSON.stringify({ revision: proposal.revision }) });
      state = snapshot.state; revision = snapshot.revision; Core.save(storage, state);
      $('#ai-dialog').close(); render(); showJob(proposal.jobId); proposal = null;
      toast('Reviewed drafts saved to SQLite. Nothing was submitted.');
    } catch (error) { $('#ai-accept-status').textContent = error.message; button.disabled = false; }
  }
  const field = (label, name, placeholder = '', type = 'text') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" placeholder="${placeholder}" required maxlength="160"></label>`;
  function addJob() {
    showForm('Add an opportunity', `<form id="add-job-form">${field('Company', 'company')}${field('Role', 'role')}${field('Location', 'location', 'Remote or a city')}<label class="field"><span>Application URL (optional)</span><input name="url" type="url" maxlength="1000" placeholder="https://company.example/careers/role"></label><label class="field"><span>Role level</span><select name="type"><option>Internship</option><option>Entry-level</option><option>Mid-level</option><option>Senior</option></select></label>${field('Required skills, separated by commas', 'skills', 'Python, SQL')}<label class="field"><span>Job description</span><textarea name="description" required maxlength="10000" rows="4"></textarea></label><div class="dialog-actions"><button class="btn primary">Save opportunity</button></div></form>`);
  }
  function addProject() {
    showForm('Add a project', `<form id="add-project-form">${field('Project name', 'name')}${field('GitHub repository', 'url', 'https://github.com/owner/repository', 'url')}<label class="field"><span>What are you building or learning?</span><textarea name="notes" rows="4" maxlength="2000"></textarea></label><p class="muted">Stores your project link and notes. Live repository analysis is not connected.</p><div class="dialog-actions"><button class="btn primary">Add project</button></div></form>`);
  }
  function logPractice() {
    showForm('Log coding practice', `<form id="practice-form">${field('Problem or exercise', 'title', 'Two Sum')}${field('Topic', 'topic', 'Arrays, hash maps')}<label class="field"><span>Difficulty</span><select name="difficulty"><option>Easy</option><option>Medium</option><option>Hard</option></select></label><div class="dialog-actions"><button class="btn primary">Log practice</button></div></form>`);
  }
  function startPractice(id) {
    JourneysUI.openInterview(id);
  }
  function exportMaterials(id) {
    const job = jobById(id); if (!job) return;
    const text = `${job.company} — ${job.role}\n\nRESUME NOTES\n${job.resume}\n\nCOVER LETTER\n${job.cover}\n\nOUTREACH DRAFT\n${job.outreach}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${job.company.replace(/[^a-z0-9-]/gi, '-').slice(0,60)}-drafts.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function openAssistant() {
    if (!$('#chat-messages').children.length) appendMessage($('#chat-messages'), 'assistant', `Hi ${state.profile.name.split(' ')[0] || 'there'}! I can show sample guidance using your saved profile and roles. What would you like to focus on?`);
    $('#assistant-dialog').showModal(); $('#chat-input').focus();
  }
  function appendMessage(target, role, text) {
    const element = document.createElement('div'); element.className = `message ${role}`; element.textContent = text;
    target.append(element); element.scrollIntoView({ block: 'nearest' });
  }
  function chat(prompt) {
    const target = $('#chat-messages'); appendMessage(target, 'user', prompt);
    const interview = state.jobs.find(job => job.status === 'Interview');
    const next = state.tasks.find(task => !task.done);
    let reply;
    if (/interview|prep/i.test(prompt)) reply = interview ? `You have ${interview.company} marked as Interview for ${interview.role}. Open Interview Prep, practice a project walkthrough, then explain a tradeoff involving ${interview.skills[0]}. These are generated practice topics, not confirmed employer questions.` : 'Save a target role and open Interview Prep. Start with a project story: the problem, your contribution, and the result.';
    else if (/resume|cover|application/i.test(prompt)) reply = 'Open a role in Applications to keep your tailored resume notes, cover letter, and outreach together. Start with one real project that demonstrates a listed requirement. Keep claims faithful to what you actually did.';
    else if (/project|code|skill|learn/i.test(prompt)) reply = `Your listed skills are ${state.profile.skills || 'not filled in yet'}. Open Development to use Project coach on selected repository files or Coding coach on a pasted problem and solution. Choose a target role to focus the feedback. These workflows use Groq after your consent; this general chat remains sample guidance.`;
    else if (/update|email|compan/i.test(prompt)) reply = 'This demo does not read email or LinkedIn. Your application stages are updated manually. Open Applications to record a response or interview invitation.';
    else reply = next ? `A useful next step: ${next.title}. You currently have ${state.jobs.filter(job => !['Available', 'Rejected'].includes(job.status)).length} saved or active roles. Focus on one strong application and one small learning task today.` : 'Your next-step list is complete. Explore a role, polish one application, or log a coding exercise. Small, specific actions make progress visible.';
    appendMessage(target, 'assistant', `Sample guidance: ${reply}`); $('#chat-input').value = '';
  }
  function filterJobs() {
    const search = ($('#discover-search')?.value || '').toLowerCase(), type = $('#discover-level')?.value || '';
    let count = 0;
    document.querySelectorAll('[data-job-card]').forEach(card => {
      card.hidden = !((card.dataset.search || '').toLowerCase().includes(search) && (!type || card.dataset.type === type));
      if (!card.hidden) count++;
    });
    let empty = $('#filter-empty');
    if (!empty) { empty = document.createElement('p'); empty.id = 'filter-empty'; empty.className = 'empty-state'; empty.textContent = 'No roles match these filters. Try another skill or location.'; $('#view').append(empty); }
    empty.hidden = count > 0;
  }
  document.addEventListener('click', event => {
    const close = event.target.closest('[data-close]'); if (close) { close.closest('dialog').close(); return; }
    const prompt = event.target.closest('[data-prompt]'); if (prompt) { chat(prompt.dataset.prompt); return; }
    const button = event.target.closest('[data-action]'); if (!button) return;
    const { action, id } = button.dataset;
    if (!backendReady) { toast('The local workspace is still connecting.'); return; }
    if (action === 'project-coach') { CoachUI.openProject(id); return; }
    if (action === 'coding-coach') { CoachUI.openCoding(); return; }
    if (action === 'project-feedback') { CoachUI.openHistory('project', id); return; }
    if (action === 'coding-feedback') { CoachUI.openHistory('coding'); return; }
    if (action === 'search-jobs') { JourneysUI.openSearch(); return; }
    if (action === 'adaptive-interview') { JourneysUI.openInterview(id); return; }
    if (action === 'company-update') { JourneysUI.openCompanyUpdate(id); return; }
    if (action === 'view-attempt') { PracticeUI.open(id); return; }
    if (action === 'export-materials') { exportMaterials(id); return; }
    if (action === 'ai-review') { reviewWithAi(id).catch(() => toast('Could not open the AI review. Please save and retry.')); return; }
    if (action === 'previous-review') { previousReview(id); return; }
    if (action === 'accept-proposal') { acceptProposal(button); return; }
    if (action === 'ai-edit-profile') { $('#ai-dialog').close(); return; }
    if (action === 'assistant') openAssistant();
    if (action === 'open-profile') location.hash = 'profile';
    if (action === 'add-job') addJob();
    if (action === 'add-project') addProject();
    if (action === 'log-practice') logPractice();
    if (action === 'open-job' || action === 'select-prep') showJob(id);
    if (action === 'start-practice') startPractice(id);
    if (action === 'save-job') {
      const job = jobById(id);
      if (job && job.status === 'Available') { Core.transition(state, id, 'Saved'); persist('Opportunity saved to Applications.'); render(); }
      else toast('This role is already in your applications.');
    }
    if (action === 'toggle-task') { const task = state.tasks.find(item => item.id === id); if (task) { task.done = button.checked; persist('Next step updated.'); render(); } }
    if (action === 'draft-outline') {
      const job = jobById(activeJobId), form = $('#materials-form'); if (!job || !form) return;
      const texts = {
        resume: `Target: ${job.role} at ${job.company}\nRelevant experience: [Choose a real project or role.]\nAction: [Describe your specific contribution.]\nResult: [Add a result you can substantiate.]\nConnect your evidence to: ${job.skills.join(', ')}.`,
        cover: `Hello ${job.company} team,\n\nI am interested in your ${job.role} position.\n[Explain what interests you about the role using the job description.]\n[Describe one real experience that demonstrates a required skill.]\n\nThank you for considering my application.\n${state.profile.name}`,
        outreach: `Hi [name],\nI am exploring the ${job.role} opportunity at ${job.company}. [Add a genuine connection or specific question.] Would you be open to sharing what the team values in someone entering this role?\nThank you,\n${state.profile.name}`
      };
      Object.entries(texts).forEach(([name, text]) => { if (!form.elements[name].value.trim()) form.elements[name].value = text; });
      toast('Starter outlines added to empty fields. Review and save when ready.');
    }
  });
  function filterApplications() {
    applicationFilters.query = $('#applications-search').value;
    applicationFilters.sort = $('#applications-sort').value;
    $('#applications-results').innerHTML = Views.applicationCards(state, applicationFilters);
  }
  document.addEventListener('input', event => {
    if (event.target.id === 'discover-search') filterJobs();
    if (event.target.id === 'applications-search') filterApplications();
  });
  document.addEventListener('change', async event => {
    const target = event.target;
    if (target.id === 'discover-level') filterJobs();
    if (target.id === 'applications-sort') filterApplications();
    if (target.id === 'profile-background-file') {
      const file = target.files[0]; if (!file) return;
      if (!/\.(txt|md)$/i.test(file.name) || file.size > 2 * 1024 * 1024) { target.value = ''; toast('Choose a TXT or Markdown file under 2 MB.'); return; }
      try {
        const text = await file.text(), field = $('#profile-form')?.elements.background;
        if (!field) return;
        const combined = [field.value.trim(), text.trim()].filter(Boolean).join('\n\n');
        if (combined.length > 6000) { toast('Background notes exceed 6,000 characters. Shorten the file or paste a selected section.'); return; }
        field.value = combined;
        toast('Background notes imported. Review them and save your profile.');
      } catch { toast('Could not read the background file. Try pasting the text.'); }
      finally { target.value = ''; }
    }
    if (target.dataset.statusId && Core.transition(state, target.dataset.statusId, target.value)) { persist('Application stage updated.'); render(); }
    if (target.id === 'resume-file') {
      const file = target.files[0]; if (!file) return;
      if (file.size > 2 * 1024 * 1024) { target.value = ''; toast('Choose a file smaller than 2 MB.'); return; }
      if (!/\.(txt|md|pdf|docx)$/i.test(file.name)) { target.value = ''; toast('Choose TXT, Markdown, PDF, or DOCX.'); return; }
      try {
        if (/\.(txt|md)$/i.test(file.name)) { const text = await file.text(); if (text.length > 20000) { toast('Resume text is limited to 20,000 characters.'); target.value = ''; return; } $('#profile-form').elements.resumeText.value = text; }
        else {
          toast('Extracting resume text locally…');
          const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
          const extracted = await api('/api/resume/extract', { method: 'POST', body: { filename: file.name, base64 } });
          const resumeField = $('#profile-form')?.elements.resumeText;
          if (!resumeField) return;
          resumeField.value = extracted.text;
        }
        target.dataset.filename = file.name.slice(0, 240);
        toast('Resume text imported. Review it and save your profile.');
      } catch (error) { target.value = ''; toast(error.message || 'Could not read this file. Try pasting the text.'); }
    }
  });
  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.id === 'ai-consent-form') { event.preventDefault(); generateReview(form); return; }
    if (!['profile-form', 'materials-form', 'add-job-form', 'add-project-form', 'practice-form', 'chat-form'].includes(form.id)) return;
    event.preventDefault(); const data = Object.fromEntries(new FormData(form));
    if (form.id === 'chat-form') { const prompt = $('#chat-input').value.trim(); if (prompt) chat(prompt); return; }
    if (form.id === 'profile-form') {
      if (!data.name.trim()) { toast('Please enter your name.'); return; }
      ['name', 'location', 'target', 'skills', 'resumeText', 'background'].forEach(key => { state.profile[key] = data[key].trim(); });
      state.profile.resumeName = $('#resume-file').dataset.filename || state.profile.resumeName;
    }
    if (form.id === 'materials-form') {
      const job = jobById(activeJobId); if (!job) return;
      Object.assign(job, { resume: data.resume, cover: data.cover, outreach: data.outreach });
      if (['Available', 'Saved'].includes(job.status)) Core.transition(state, job.id, 'Preparing');
      $('#editor-dialog').close();
    }
    if (form.id === 'add-job-form') {
      if (![data.company, data.role, data.location, data.skills, data.description].every(value => value.trim())) { toast('Complete each field.'); return; }
      if (data.skills.split(',').some(skill => skill.trim().length > 100)) { toast('Keep each skill under 100 characters.'); return; }
      if (state.jobs.length >= 500) { toast('This demo supports up to 500 roles.'); return; }
      if (data.url && !JourneysUI.safeUrl(data.url)) { toast('Use an HTTPS application URL without embedded credentials.'); return; }
      state.jobs.push({ id: crypto.randomUUID(), company: data.company.trim(), role: data.role.trim(), location: data.location.trim(), type: data.type, skills: data.skills.split(',').map(value => value.trim()).filter(Boolean), description: data.description.trim(), status: 'Saved', resume: '', cover: '', outreach: '', url: data.url.trim(), demo:false });
      $('#form-dialog').close();
    }
    if (form.id === 'add-project-form') {
      const url = Core.safeRepoUrl(data.url);
      if (!url) { toast('Use a GitHub repository URL: https://github.com/owner/repository'); return; }
      if (!data.name.trim()) { toast('Enter a project name.'); return; }
      if (state.projects.length >= 500) { toast('This demo supports up to 500 projects.'); return; }
      state.projects.push({ id: crypto.randomUUID(), name: data.name.trim(), url, notes: data.notes.trim() }); $('#form-dialog').close();
    }
    if (form.id === 'practice-form') {
      if (!Core.addPractice(state, data)) { toast('Complete the problem, topic, and difficulty.'); return; } $('#form-dialog').close();
    }
    persist(); render();
  });
  $('#theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    try { storage?.setItem('career-demo.theme', document.body.classList.contains('dark') ? 'dark' : 'light'); } catch { /* Theme still works without persistence. */ }
  });
  try { document.body.classList.toggle('dark', storage?.getItem('career-demo.theme') === 'dark'); } catch { /* Use light theme. */ }
  window.addEventListener('hashchange', () => { if (backendReady) { render(); $('#main-content').focus(); } });
  window.addEventListener('beforeunload', event => { if (saveBlocked || $('#storage-status').textContent.includes('Saving')) { event.preventDefault(); event.returnValue = ''; } });
  bootstrap();
})();

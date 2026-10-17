/* Vanilla HTML templates for the local career-coach demo. */
(function () {
  'use strict';

  const esc = (value) => window.Core.escape(value == null ? '' : String(value));
  const list = (value) => Array.isArray(value) ? value : [];
  const safeState = (state) => state || {};
  const statusClass = (status) => `status-${String(status || 'Saved').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const statusLabel = status => status === 'Offer' ? 'Offer received' : status === 'Accepted' ? 'Offer accepted' : status;
  const safeLink = (value) => /^https?:\/\//i.test(String(value || '')) ? esc(value) : '';

  function shell(_title, _subtitle, content) { return content; }

  function button(label, action, id, style) {
    return `<button class="button ${style || ''}" data-action="${action}"${id == null ? '' : ` data-id="${esc(id)}"`}>${label}</button>`;
  }

  function jobCard(job, options) {
    const skills = list(job.skills).slice(0, 4).map((skill) => `<span class="tag">${esc(skill)}</span>`).join('');
    const status = options && options.status;
    const save = options && (options.discover || options.save) ? `<button class="btn primary" type="button" data-action="save-job" data-id="${esc(job.id)}"${job.status !== 'Available' ? ' disabled' : ''}>${job.status !== 'Available' ? '✓ Saved' : 'Save job'}</button>` : '';
    return `<article class="card job-card" data-job-card${options && options.search ? ` data-search="${esc([job.company, job.role, job.location, ...(job.skills || [])].join(' '))}"` : ''}${options && options.type ? ` data-type="${esc(job.type || '')}"` : ''}>
      <div class="job-card-top"><div><p class="eyebrow">${esc(job.company)} ${job.demo === false ? '' : '<span class="demo-label">DEMO</span>'}</p><h3>${esc(job.role)}</h3><p class="muted">${esc(job.location)} · ${esc(job.type || 'Full-time')}</p></div>${status ? `<span class="status ${esc(statusClass(job.status))}">${esc(statusLabel(job.status))}</span>` : ''}${save}</div>
      <p class="job-description">${esc(job.description || 'A sample opportunity for exploring your career workflow.')}</p>
      ${skills ? `<div class="tag-list">${skills}</div>` : ''}
      ${safeLink(job.url) ? `<p><a href="${safeLink(job.url)}" target="_blank" rel="noopener noreferrer">View employer posting ↗</a>${job.checkedAt ? ` · Source checked ${esc(job.checkedAt)}` : ''}</p>` : ''}
      ${job.demoActivity ? '<p class="muted">Real posting · application stage is fictional demo activity.</p>' : ''}
      ${options && options.match ? `<div class="fit-note"><strong>${esc(options.match.label)}</strong><p>Profile lists: ${options.match.matched.length ? options.match.matched.map(esc).join(', ') : 'no listed skills yet'}.</p>${options.match.missing.length ? `<p>Not listed in profile: ${options.match.missing.map(esc).join(', ')}.</p>` : ''}</div>` : ''}
      <div class="job-card-bottom"><div class="button-row">${options && options.discover ? button('View fit', 'open-job', job.id) : ''}${options && options.open ? button('Open details', 'open-job', job.id, 'button-secondary') : ''}</div></div>
    </article>`;
  }

  function empty(title, detail, action) {
    return `<div class="empty-state"><h3>${title}</h3><p>${detail}</p>${action || ''}</div>`;
  }

  function practiceHistory(practice, limit) {
    const recent = list(practice).slice().reverse().slice(0, limit);
    return recent.length ? `<ul class="practice-history-list">${recent.map(item => `<li class="practice-history-row"><span class="practice-history-main"><strong>${esc(item.title)}</strong>${window.Core.practiceUrl(item.title) ? `<a href="${esc(window.Core.practiceUrl(item.title))}" target="_blank" rel="noopener noreferrer">Open on LeetCode ↗</a>` : ""}<small>${esc(item.difficulty)} · ${esc(item.date.slice(0, 10))}</small></span><span class="practice-history-topic">${esc(item.topic)}</span><button class="btn secondary" type="button" data-action="view-attempt" data-id="${esc(item.id)}">View my attempt</button></li>`).join('')}</ul>` : '<p class="muted">Coding practice you log will appear here.</p>';
  }

  function dashboard(state) {
    const s = safeState(state), profile = s.profile || {}, jobs = list(s.jobs), tasks = list(s.tasks);
    const active = jobs.filter((j) => ['Preparing', 'Applied', 'Interview', 'Offer'].includes(j.status));
    const interviews = jobs.filter((j) => j.status === 'Interview').length;
    const nextTasks = tasks.filter((t) => !t.done);
    const featured = jobs.find(j => j.status === 'Available') || jobs.find(j => j.status === 'Saved') || jobs[0];
    const taskHtml = nextTasks.length ? `<ul class="task-list">${nextTasks.map((task) => `<li><label><input type="checkbox" data-action="toggle-task" data-id="${esc(task.id)}"><span>${esc(task.title)}</span></label></li>`).join('')}</ul>` : empty('You’re all caught up', 'Add a small next step when you’re ready.');
    const featuredHtml = featured ? jobCard(featured, { match: window.Core.match(featured, profile), open: true, save: true, status: featured.status }) : empty('No sample roles yet', 'Explore opportunities to start your tracker.', '<a class="button button-secondary" href="#discover">Explore roles</a>');
    const greeting = profile.name ? `Welcome back, ${profile.name}.` : 'Welcome to your career workspace.';
    const content = `<section class="welcome-card"><div><p class="eyebrow">YOUR NEXT STEP</p><h2>${esc(greeting)}</h2><p>Build your skills, tell your story, and find your fit.</p></div></section>
      <section class="metric-grid" aria-label="Career overview"><article class="card metric-card"><span class="metric-value">${active.length}</span><span class="metric-label">Active applications</span></article><article class="card metric-card"><span class="metric-value">${interviews}</span><span class="metric-label">Interviews</span></article><article class="card metric-card"><span class="metric-value">${list(s.practice).length}</span><span class="metric-label">Coding sessions</span></article></section>
      <div class="dashboard-grid"><section><div class="section-heading"><div><h2>Next steps</h2><p class="muted">A few useful actions to keep moving.</p></div></div><div class="card"><form id="add-task-form" class="task-composer"><div class="field"><label class="sr-only" for="task-title">New next step</label><input id="task-title" name="title" placeholder="Add a next step…" maxlength="300" required autocomplete="off"></div><button class="button" type="submit">Add</button></form>${taskHtml}</div></section><section><div class="section-heading"><div><h2>Opportunity to explore</h2><p class="muted">Curated employer posting; confirm availability at its source.</p></div></div>${featuredHtml}</section></div>
      <section class="card callout-card"><div><p class="eyebrow">PREP A LITTLE AT A TIME</p><h2>Build confidence before the next conversation</h2><p class="muted">Review role-specific topics and log practice as you go.</p></div><a class="button button-secondary" href="#prep">Open interview prep</a></section>`;
    return shell('Your dashboard', greeting, content);
  }

  function discover(state) {
    const s = safeState(state), jobs = list(s.jobs).filter((j) => j.status === 'Available' || j.status === 'Saved');
    const types = [...new Set(jobs.map((job) => job.type).filter(Boolean))];
    const cards = jobs.length ? jobs.map((job) => jobCard(job, { discover: true, match: window.Core.match(job, s.profile || {}), search: true, type: true })).join('') : empty('No roles to show', 'Use live research above or add an employer posting yourself.');
    const typeOptions = types.map((type) => `<option value="${esc(type)}">${esc(type)}</option>`).join('');
    const content = `<section id="discover-assistant" aria-label="Scout role research"></section><section class="manual-discover"><div class="section-heading"><div><p class="eyebrow">CURATED / MANUAL SEARCH</p><h2>Browse sourced roles</h2><p class="muted">Real employer postings checked October 17, 2026, plus roles you add yourself.</p></div><div class="button-row">${button('Add a role', 'add-job', null, 'button-secondary')}</div></div><section class="card filter-bar"><label class="field"><span>Filter saved listings</span><input id="discover-search" type="search" placeholder="Role, company, location, or skill"></label><label class="field"><span>Work type</span><select id="discover-level"><option value="">All types</option>${typeOptions}</select></label><p class="muted demo-note">Curated snapshots are not a live feed. Check the employer link before applying.</p></section><div class="job-grid">${cards}</div></section>`;
    return shell('Discover opportunities', 'Explore sourced roles and decide which ones belong in your application tracker.', content);
  }

  function applicationCards(state, { query = '', sort = 'status' } = {}) {
    const all = list(safeState(state).jobs).filter(job => job.status !== 'Available');
    const search = query.trim().toLocaleLowerCase();
    const jobs = all.filter(job => String(job.company || '').toLocaleLowerCase().includes(search));
    jobs.sort((a, b) => (sort === 'status' ? window.Core.STATUSES.indexOf(a.status) - window.Core.STATUSES.indexOf(b.status) : 0) || String(a.company).localeCompare(String(b.company)) || String(a.role).localeCompare(String(b.role)));
    if (all.length && !jobs.length) return empty('No companies match your search', 'Try another company name or clear the search.');
    const cards = jobs.length ? jobs.map((job) => `<article class="card application-card">${jobCard(job, { open: true, status: job.status })}<div class="application-controls"><label for="status-${esc(job.id)}">Application stage</label><select id="status-${esc(job.id)}" data-status-id="${esc(job.id)}"><option${job.status === 'Saved' ? ' selected' : ''}>Saved</option><option${job.status === 'Preparing' ? ' selected' : ''}>Preparing</option><option${job.status === 'Applied' ? ' selected' : ''}>Applied</option><option${job.status === 'Interview' ? ' selected' : ''}>Interview</option><option value="Offer"${job.status === 'Offer' ? ' selected' : ''}>Offer received</option><option value="Accepted"${job.status === 'Accepted' ? ' selected' : ''}>Offer accepted</option><option${job.status === 'Rejected' ? ' selected' : ''}>Rejected</option><option value="remove-listing">Remove listing…</option></select></div></article>`).join('') : empty('Your tracker is ready', 'Save a role from Discover to keep its materials and progress together.', '<a class="button" href="#discover">Discover roles</a>');
    return cards;
  }

  function applications(state, { query = '', sort = 'status' } = {}) {
    const controls = `<section class="card filter-bar"><label class="field"><span>Search company name</span><input id="applications-search" type="search" value="${esc(query)}" placeholder="Company name" aria-controls="applications-results"></label><label class="field"><span>Sort applications</span><select id="applications-sort" aria-controls="applications-results"><option value="status"${sort === 'status' ? ' selected' : ''}>Application status</option><option value="company"${sort === 'company' ? ' selected' : ''}>Company name (A–Z)</option></select></label><p class="muted demo-note">Status order: Saved → Preparing → Applied → Interview → Offer → Accepted → Rejected.</p></section>`;
    return shell('Application tracker', 'Keep each role, its materials, and its current stage in one place.', `${controls}<div id="applications-results" class="job-grid" aria-live="polite">${applicationCards(state, { query, sort })}</div>`);
  }

  function prep(state) {
    const jobs = list(safeState(state).jobs).filter((j) => j.status !== 'Available');
    const roleCards = jobs.length ? jobs.map((job) => `<article class="card prep-role"><div><p class="eyebrow">${esc(job.company)}</p><h3>${esc(job.role)}</h3><p class="muted">Practice tailored to this role’s listed skills.</p></div><div class="button-row">${button('Select role', 'select-prep', job.id, 'button-secondary')} ${button('Start practice', 'start-practice', job.id)}</div></article>`).join('') : empty('No saved roles yet', 'Save a role to see focused preparation here.', '<a class="button button-secondary" href="#discover">Explore roles</a>');
    const historyHtml = practiceHistory(safeState(state).practice, 5);
    const content = `<section class="card prep-intro"><p class="eyebrow">ADAPTIVE PRACTICE</p><h2>Practice a clear story, then follow the next question.</h2><p class="muted">Choose behavioral, technical, or mixed practice. The coach uses your resume, selected role, and previous answers. Known catalog roles include sourced posting summaries; practice questions do not represent an employer.</p></section><section><div class="section-heading"><div><h2>Prepare for a role</h2><p class="muted">Choose a saved role to start or resume a practice session.</p></div></div><div class="job-grid">${roleCards}</div></section><section class="card practice-history"><div class="section-heading"><div><h2>Recent coding practice</h2><p class="muted">Coding problems are tracked separately from interview practice.</p></div></div>${historyHtml}</section>`;
    return shell('Interview preparation', 'Practice clear stories, technical thinking, and questions you want to ask.', content);
  }

  function development(state) {
    const projects = list(safeState(state).projects), practice = list(safeState(state).practice);
    const projectHtml = projects.length ? `<div class="project-grid">${projects.map((project) => { const href = safeLink(project.url); return `<article class="card project-card"><div><h3>${esc(project.name)}</h3>${project.reference ? '<span class="tag">External learning reference · not your portfolio</span>' : ''}<p>${esc(project.notes || 'Personal project')}</p></div>${href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">Open project ↗</a>` : '<span class="muted">No link added</span>'}<div class="button-row">${button('Project coach', 'project-coach', project.id)}${button('Previous feedback', 'project-feedback', project.id, 'button-secondary')}</div></article>`; }).join('')}</div>` : empty('Your portfolio starts here', 'Add projects you want to discuss with employers.');
    const codingHistory = practiceHistory(practice, 8);
    const content = `<div class="section-heading"><div><h2>Projects</h2><p class="muted">Add your repositories, describe what you built, and use Project coach to identify improvements.</p></div>${button('Add project', 'add-project')}</div>${projectHtml}<p class="muted small-note">For each project, describe your contribution, the problem it solves, and what you want to improve. Project coach reviews the source files you select or paste and can suggest concrete next steps. It does not download or execute your repository.</p><details class="card practice-history"><summary>Coding practice · ${practice.length} ${practice.length === 1 ? 'session' : 'sessions'} recorded</summary><div class="practice-summary"><div><p class="muted">Track your practice, then review a solution with your target role in mind.</p></div><div class="button-row">${button('Coding coach', 'coding-coach')}${button('Log practice', 'log-practice', null, 'button-secondary')}${button('Previous feedback', 'coding-feedback', null, 'button-secondary')}</div></div><section class="practice-history"><h3>Recent coding practice</h3>${codingHistory}</section><p class="muted small-note">Open the original problem on LeetCode; keep solutions and comments here. LeetCode tracking is manual. Coach feedback comes from reading your code; it is not an executed test or a proof of correctness.</p></details>`;
    return shell('Projects & development', 'Keep a simple record of projects and practice that support your growth.', content);
  }

  function profile(state) {
    const profile = safeState(state).profile || {};
    const content = `${profile.resumeText === window.Core.seed().profile.resumeText ? '<p class="notice">The starter resume describes fictional student Alex Morgan. Replace it with your own profile when ready.</p>' : ''}<form id="profile-form" class="card profile-form"><div class="form-grid"><label class="field"><span>Name</span><input name="name" maxlength="80" value="${esc(profile.name)}" autocomplete="name"></label><label class="field"><span>Location</span><input name="location" maxlength="120" value="${esc(profile.location)}" autocomplete="address-level2"></label><label class="field full-width"><span>Target role</span><input name="target" maxlength="160" value="${esc(profile.target)}" placeholder="e.g. Software engineering internship"></label><label class="field full-width"><span>Skills and tools</span><textarea name="skills" maxlength="2000" rows="3" placeholder="Languages, tools, and strengths">${esc(profile.skills)}</textarea></label><section class="field full-width" aria-labelledby="personal-background-title"><h3 id="personal-background-title">About you</h3><p class="muted">Add experiences, achievements, interests, values, preferred work, and what you want employers to know. This helps job research and cover letter or outreach drafts alongside your resume.</p><label class="field"><span>Personal background and preferences</span><textarea name="background" maxlength="6000" rows="7" placeholder="What have you built or learned? What motivates you? What kind of team or work are you looking for?">${esc(profile.background || '')}</textarea></label><label class="field"><span>Import background notes (TXT or Markdown)</span><input id="profile-background-file" type="file" accept=".txt,.md"><small>Imported text is added below your current notes. Review it, then choose Save profile. Up to 6,000 characters total. Saving stays local; AI use requires consent.</small></label></section><label class="field full-width"><span>Resume text</span><textarea name="resumeText" maxlength="20000" rows="7" placeholder="Paste resume text or import a TXT or Markdown file">${esc(profile.resumeText)}</textarea><small class="muted">TXT, Markdown, PDF, and DOCX files are extracted locally. Review the text before saving or sharing it with AI. Scanned image-only PDFs need pasted text.</small></label><label class="field full-width"><span>Choose a resume file</span><input id="resume-file" type="file" accept=".txt,.md,.pdf,.docx"><small class="muted">${profile.resumeName ? `Selected: ${esc(profile.resumeName)}` : 'TXT, Markdown, PDF, and DOCX text import.'}</small></label></div><div class="form-actions"><button class="button" type="submit">Save profile</button></div></form>`;
    return shell('Profile', 'Add the details that help you keep your career workspace organized.', content);
  }

  window.Views = { dashboard, discover, applications, applicationCards, prep, development, profile };
}());

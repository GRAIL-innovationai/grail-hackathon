/* Company and role aligned interview practice, backed by first-party catalog data. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.InterviewProblemsUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const esc = value => root.Core.escape(value == null ? '' : String(value));
  const list = value => Array.isArray(value) ? value : [];
  const $ = selector => root.document.querySelector(selector);
  let options = {}, selectedJobId = '', notice = '', busy = false;

  function safeHttps(value, host) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && url.hostname.toLowerCase() === host ? url.href : '';
    } catch { return ''; }
  }
  const leetCodeUrl = value => safeHttps(value, 'leetcode.com');
  const sourceUrl = value => {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
    catch { return ''; }
  };
  const normalize = value => String(value || '').trim().toLowerCase();

  function selectedRole(state) {
    const jobs = list(state && state.jobs).filter(job => job.status === 'Interview');
    if (!jobs.some(job => job.id === selectedJobId)) selectedJobId = jobs[0]?.id || '';
    return jobs.find(job => job.id === selectedJobId) || null;
  }
  function recentWeaknesses(jobId) {
    try {
      const feedback = options.getFeedback ? options.getFeedback(jobId) : [];
      return list(Array.isArray(feedback) ? feedback : feedback && feedback.weaknesses);
    } catch { return []; }
  }
  function recommendations(state, job) {
    if (!job || !root.InterviewProblems?.recommendations) return [];
    return list(root.InterviewProblems.recommendations(state, job.id, recentWeaknesses(job.id)));
  }

  function sourceReport(item, job) {
    const report = item.report;
    const matches = report && normalize(report.company) === normalize(job.company) &&
      sourceUrl(report.url) && String(report.checkedAt || '').trim() && String(report.quote || '').trim();
    return matches ? report : null;
  }

  function cardHtml(item, job, state) {
    const problem = item.problem || {}, recUrl = leetCodeUrl(problem.url), report = item.basis === 'company-reported' ? sourceReport(item, job) : null;
    const practice = item.practiceId && list(state.practice).find(row => row.id === item.practiceId);
    const hasAttempt = Boolean(practice?.attempt && !practice.attempt.demo && (practice.attempt.solution.trim() || practice.attempt.notes.trim()));
    const complete = item.completed === true;
    const metadata = [problem.topic, problem.difficulty, problem.focus].filter(Boolean).map(esc).join(' · ');
    const provenance = report
      ? `<div class="interview-source"><p><strong>Candidate report · ${esc(job.company)}</strong> · interview ${esc(report.interviewDate || 'date not stated')} · checked ${esc(report.checkedAt)}</p><blockquote>“${esc(report.quote)}”</blockquote><a href="${esc(sourceUrl(report.url))}" target="_blank" rel="noopener noreferrer">Open source report ↗</a><p class="muted">${esc(report.caveat || 'Candidate self-report; not verified by the employer. It does not predict questions for this role.')}</p></div>`
      : `<p class="interview-practice-label">Role aligned practice · suggested from the role and your preparation history. This is not an employer-confirmed question or a hiring prediction.</p>`;
    const attemptAction = practice?.id ? 'Continue attempt' : 'Start attempt';
    return `<article class="card interview-problem-card"><div class="interview-problem-meta"><span>${esc(problem.topic || 'Practice')}</span>${problem.difficulty ? `<span>${esc(problem.difficulty)}</span>` : ''}</div><h3>${esc(problem.title || 'Interview practice')}</h3>${problem.focus ? `<p>${esc(problem.focus)}</p>` : ''}<p class="muted">${esc(item.reason || 'A focused practice problem for this role.')}</p>${provenance}<div class="interview-problem-actions">${recUrl ? `<a class="btn secondary" href="${esc(recUrl)}" target="_blank" rel="noopener noreferrer">Open on LeetCode ↗</a>` : '<span class="muted">No verified LeetCode link</span>'}<button class="btn primary" type="button" data-attempt="${esc(problem.id)}" ${busy ? 'disabled' : ''}>${attemptAction}</button>${hasAttempt ? `<button class="btn secondary" type="button" data-review="${esc(problem.id)}">Review my attempt</button>` : ''}</div><label class="interview-completion"><input type="checkbox" data-complete="${esc(problem.id)}" ${complete ? 'checked' : ''} ${!hasAttempt || complete || busy ? (complete ? '' : 'disabled') : ''}><span>Mark completed</span></label>${!hasAttempt && !complete ? '<small class="muted">Save a solution or reflection note in your attempt before marking this complete.</small>' : ''}</article>`;
  }

  function render() {
    const mount = $('#interview-problems'); if (!mount) return;
    const state = options.getState ? options.getState() : null;
    const jobs = list(state && state.jobs).filter(job => job.status === 'Interview');
    const job = selectedRole(state);
    if (!job) {
      mount.innerHTML = `<section class="interview-problems card"><div class="interview-problems-header"><p class="eyebrow">ROLE SPECIFIC PRACTICE</p><h2>Next problems to prepare</h2><p class="muted">Save a role and set its stage to Interview to see focused practice here.</p></div><a class="btn secondary" href="#applications">Open Applications</a></section>`;
      return;
    }
    const recs = recommendations(state, job), completeCount = recs.filter(item => item.completed === true).length;
    const roleLink = sourceUrl(job.url);
    const optionsHtml = jobs.map(item => `<option value="${esc(item.id)}"${item.id === job.id ? ' selected' : ''}>${esc(item.company)} · ${esc(item.role)}</option>`).join('');
    const cards = recs.length ? recs.map(item => cardHtml(item, job, state)).join('') : '<div class="interview-problems-empty"><h3>No problem recommendations yet</h3><p>There are no matching catalog problems for this role right now.</p></div>';
    mount.innerHTML = `<section class="interview-problems"><div class="interview-problems-header"><div><p class="eyebrow">ROLE SPECIFIC PRACTICE</p><h2>Recommended next problems</h2><p class="muted">Practice grounded in this saved role and your recent feedback.</p></div>${jobs.length > 1 ? `<label class="interview-role-picker"><span>Interviewing for</span><select data-role>${optionsHtml}</select></label>` : ''}</div><div class="interview-role-context"><div><strong>${esc(job.company)}</strong><span>${esc(job.role)}</span><small>${esc(job.location)} · Interview stage</small></div>${roleLink ? `<a href="${esc(roleLink)}" target="_blank" rel="noopener noreferrer">View role posting ↗</a>` : ''}</div><div class="interview-progress"><div><strong>${completeCount} of ${recs.length}</strong><span>recommended problems completed</span></div><progress max="${Math.max(recs.length, 1)}" value="${completeCount}" aria-label="${completeCount} of ${recs.length} recommended problems completed"></progress></div><p class="interview-ui-status" role="status" aria-live="polite">${esc(notice)}</p><div class="interview-problem-grid">${cards}</div><p class="muted interview-disclaimer">Completion is self-reported. Scout does not submit answers to LeetCode or execute code.</p></section>`;
    const picker = mount.querySelector('[data-role]'); if (picker) picker.addEventListener('change', () => { selectedJobId = picker.value; notice = ''; render(); });
    mount.querySelectorAll('[data-attempt]').forEach(button => button.addEventListener('click', () => start(button.dataset.attempt)));
    mount.querySelectorAll('[data-review]').forEach(button => button.addEventListener('click', () => review(button.dataset.review)));
    mount.querySelectorAll('[data-complete]').forEach(input => input.addEventListener('change', () => complete(input.dataset.complete, input.checked)));
  }

  async function start(problemId) {
    if (busy) return;
    const state = options.getState && options.getState(), job = selectedRole(state);
    if (!job || job.status !== 'Interview') { notice = 'Choose a role whose stage is Interview first.'; render(); return; }
    const rec = recommendations(state, job).find(item => item.problem?.id === problemId);
    if (!rec) { notice = 'This problem is no longer available for the selected role.'; render(); return; }
    if (rec.practiceId) {
      busy = true; notice = 'Opening your saved practice entry…'; render();
      try {
        if (!await options.commitState(structuredClone(state))) throw new Error('Save your workspace before continuing this attempt.');
        options.onOpenAttempt?.(rec.practiceId);
      } catch (error) { notice = error?.message || 'Could not open this attempt.'; }
      finally { busy = false; render(); }
      return;
    }
    if (!root.InterviewProblems?.startAttempt) { notice = 'Practice records are unavailable.'; render(); return; }
    busy = true; notice = 'Saving your practice entry…'; render();
    try {
      const next = structuredClone(state), attempt = root.InterviewProblems.startAttempt(next, job.id, problemId);
      if (!attempt?.id || !await options.commitState(next)) throw new Error('The practice entry could not be saved.');
      notice = 'Practice entry saved.';
      options.onOpenAttempt?.(attempt.id);
    } catch (error) { notice = error?.message || 'Could not start this attempt.'; }
    finally { busy = false; render(); }
  }

  async function review(problemId) {
    const state = options.getState && options.getState(), job = selectedRole(state);
    if (!job || job.status !== 'Interview') { notice = 'Choose a role whose stage is Interview first.'; render(); return; }
    const rec = recommendations(state, job).find(item => item.problem?.id === problemId);
    if (!rec?.practiceId) return;
    const practice = list(state.practice).find(item => item.id === rec.practiceId);
    if (!practice?.attempt || practice.attempt.demo || !practice.attempt.solution.trim()) {
      notice = 'Save your solution in this attempt before requesting a code review.'; render(); return;
    }
    if (options.onReviewAttempt) options.onReviewAttempt(job.id, problemId, practice.id);
    else { notice = 'Code review is unavailable right now.'; render(); }
  }

  async function complete(problemId, completed) {
    if (busy) return;
    const state = options.getState && options.getState(), job = selectedRole(state);
    if (!job || job.status !== 'Interview') { notice = 'Choose a role whose stage is Interview first.'; render(); return; }
    const rec = recommendations(state, job).find(item => item.problem?.id === problemId);
    const practice = rec?.practiceId && list(state.practice).find(item => item.id === rec.practiceId);
    if (!practice || practice.jobId !== job.id || practice.problemId !== problemId || practice.attempt?.demo ||
        !(practice.attempt?.solution.trim() || practice.attempt?.notes.trim())) {
      notice = 'Save a non-demo solution or reflection note before marking a problem complete.'; render(); return;
    }
    const next = structuredClone(state);
    if (!root.InterviewProblems?.setCompleted || !root.InterviewProblems.setCompleted(next, practice.id, completed)) {
      notice = 'Completion could not be recorded.'; render(); return;
    }
    busy = true; notice = 'Saving completion…'; render();
    try {
      if (!await options.commitState(next)) throw new Error('Completion could not be saved.');
      notice = completed ? 'Problem marked complete.' : 'Completion status cleared.';
    } catch (error) { notice = error?.message || 'Completion could not be saved.'; }
    finally { busy = false; render(); }
  }

  return { configure(next) { options = next || {}; }, mount: render, render, safeLeetCodeUrl: leetCodeUrl };
});

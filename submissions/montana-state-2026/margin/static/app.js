import { Whiteboard } from './board.js';
import { SolutionBoard } from './solution-board.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const storageKey = 'margin.workspace.v1';
const PAUSE_MS = 2000;
let problem = '';
let problemDraft = '';
let problemConfirmed = false;
let problemReviewReady = false;
let problemMode = 'type';
let problemRevision = 0;
let problemReadInFlight = false;
let problemReadTimer;
let queuedProblemRead = null;
let lastProblemAttemptFingerprint = '';
let lastProblemActivity = 0;
const problemReadingCache = new Map();
let resettingProblem = false;
let subject = 'Math';
let revision = 0;
let problemVersion = 0;
let analysis = null;
let messages = [];
let connection = { connected: false, provider: null };
let checkTimer;
let saveTimer;
let toastTimer;
let pendingRevision = null;
let checkInFlight = false;
let lastActivity = 0;
let chatInFlight = false;
let statusInFlight = false;
let authPending = false;
let authPoll;
let authTimeout;
let initializing = true;
let storageWarned = false;
const readingOverrides = new Map();
const readingHistory = new Map();
let approvedRows = [];
let approvedProblem = '';
let approvedProblemVersion = -1;
let checkClock;

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}
function el(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}
function toast(text) {
  clearTimeout(toastTimer);
  $('#toast').textContent = text;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}
async function request(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  let data;
  try { data = await response.json(); } catch { throw new Error('The local server returned an unexpected response. Please try again.'); }
  if (!response.ok) {
    const error = data.detail || data.error || data.message;
    const text = typeof error === 'string' ? error : error?.message || 'Your tutor could not respond just now.';
    throw new Error(text);
  }
  return data;
}
function errorText(error) {
  if (error instanceof TypeError) return 'The local server is unavailable. Check that it is still running, then try again.';
  const text = String(error?.message || 'Something went wrong. Please try again.');
  if (/api.?key|not configured|not connected|sign.?in|unauthorized|credentials/i.test(text)) {
    return 'Your tutor needs a connection. Open the connection settings above to sign in or configure the Gemini fallback.';
  }
  if (/429|quota|rate.?limit/i.test(text)) return 'Your AI provider is at its usage limit. Give it a moment or check your provider’s available quota, then try again.';
  return text.length > 360 ? `${text.slice(0, 357)}…` : text;
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ problem, problemDraft, problemConfirmed, problemReviewReady, problemMode, problemInk: problemBoard.getState(), typedProblem: $('#problem-draft').value, subject, board: board.getState(), readings: [...readingOverrides] })); }
    catch {
      $('.autosave').lastChild.textContent = 'Saving unavailable';
      if (!storageWarned) { toast('Browser storage is full or unavailable. Keep this tab open to preserve your board.'); storageWarned = true; }
    }
  }, 200);
}
function updateProblem() {
  $('#problem-title').textContent = 'Problem';
  $('#subject-tag').textContent = subject;
  $('#problem-state').textContent = problemConfirmed ? 'Confirmed' : 'Draft';
  $('#problem-state').classList.toggle('confirmed', problemConfirmed);
  $('#edit-problem').hidden = !problemConfirmed;
  $('#problem-type-panel').hidden = problemConfirmed || problemMode !== 'type';
  $('#problem-write-panel').hidden = problemConfirmed || problemMode !== 'write';
  $('.problem-modes').hidden = problemConfirmed;
  ['type', 'write'].forEach(mode => {
    $(`#problem-${mode}-mode`).classList.toggle('selected', problemMode === mode);
    $(`#problem-${mode}-mode`).setAttribute('aria-pressed', String(problemMode === mode));
  });
  $('#problem-confirmed-text').hidden = !problemConfirmed;
  $('#problem-confirmed-text').textContent = problemConfirmed ? problem : '';
  $('#problem-confirmation').hidden = problemConfirmed;
  $('#problem-confirm-input').hidden = !problemReviewReady;
  $('#confirm-problem').disabled = !problemReviewReady || !problemDraft.trim();
  $('#review-problem').disabled = !$('#problem-draft').value.trim();
  $('#read-problem').disabled = problemReadInFlight || problemBoard.isEmpty() || problemBoard.isDrawing;
  $('#problem-ink-empty').hidden = !problemBoard.isEmpty();
  $('#solution-state').textContent = problemConfirmed ? 'One step per line. Pause to check.' : 'Confirm your problem before checking steps.';
  $('#recheck-button').disabled = !canCheck() || checkInFlight;
}
function focusConfirmation() {
  if (matchMedia('(max-width: 760px)').matches) $('#problem-confirmation').scrollIntoView({behavior: 'smooth', block: 'center'});
  $('#problem-confirm-input').focus({preventScroll: true});
}
function invalidateProblem(fromInk = false) {
  if (initializing || resettingProblem) return;
  problemRevision += 1; problemVersion += 1; revision += 1;
  lastProblemActivity = Date.now(); clearTimeout(problemReadTimer); queuedProblemRead = null;
  problemConfirmed = false; problemReviewReady = false;
  approvedRows = [];
  if (fromInk) problemDraft = '';
  analysis = null; pendingRevision = null; clearTimeout(checkTimer);
  clearSolutionAnnotations();
  $('#problem-confirm-message').textContent = fromInk || problemMode === 'write' ? 'Pause for two seconds and I’ll read the problem. Then confirm or correct the text.' : 'Select Review problem to confirm it before checking your solution.';
  updateProblem(); renderUpdating(); setFeedbackStatus('Confirm your problem');
  setNote('Confirm your problem before checking these steps.'); save();
}
function reviewProblem(text, confidence = 1, focus = true) {
  problemDraft = text.trim(); problemReviewReady = true;
  $('#problem-confirm-input').value = problemDraft;
  $('#problem-confirm-message').textContent = !problemDraft ? 'I couldn’t read the problem. Type it here or write it more clearly and try again.' : confidence < .8 ? 'Some handwriting is unclear. Correct the text below before you confirm.' : 'Check the text below. You can correct it before starting.';
  updateProblem(); save(); if (focus && !problemBoard.isDrawing && !board.isDrawing) focusConfirmation();
}
function chooseProblemMode(mode) {
  if (problemMode !== mode) {
    problemMode = mode;
    if (mode === 'type' && !$('#problem-draft').value) $('#problem-draft').value = problemDraft || problem;
    problemDraft = mode === 'type' ? $('#problem-draft').value : '';
    invalidateProblem();
  }
  updateProblem();
  if (mode === 'type') $('#problem-draft').focus();
  else requestAnimationFrame(() => { problemBoard.render(); scheduleProblemRead(); });
}
function problemFingerprint() {
  return problemBoard.getLines().map(line => `${line.id}:${line.fingerprint}`).join('|');
}
function scheduleProblemRead() {
  clearTimeout(problemReadTimer);
  if (problemMode !== 'write' || problemBoard.isDrawing || problemBoard.isEmpty() || !connection.connected || problemConfirmed) return;
  const snapshot = {revision: problemRevision, fingerprint: problemFingerprint(), manual: false};
  problemReadTimer = setTimeout(() => {
    if (problemConfirmed || snapshot.revision !== problemRevision || problemBoard.isDrawing || snapshot.fingerprint !== problemFingerprint()) return;
    queuedProblemRead = snapshot; runProblemRead();
  }, Math.max(0, PAUSE_MS - (Date.now() - lastProblemActivity)));
}
function readProblem() {
  if (problemReadInFlight || problemBoard.isDrawing || problemBoard.isEmpty()) return;
  if (!connection.connected) { openConnection(); return; }
  invalidateProblem(true);
  queuedProblemRead = {revision: problemRevision, fingerprint: problemFingerprint(), manual: true};
  runProblemRead();
}
async function runProblemRead() {
  if (problemReadInFlight || !queuedProblemRead || problemBoard.isDrawing || !connection.connected || problemConfirmed) return;
  const job = queuedProblemRead; queuedProblemRead = null;
  if (job.revision !== problemRevision || job.fingerprint !== problemFingerprint() || problemMode !== 'write' || problemBoard.isEmpty()) return;
  const cached = problemReadingCache.get(job.fingerprint);
  if (cached && !job.manual) { reviewProblem(cached.text, cached.confidence, false); return; }
  if (job.fingerprint === lastProblemAttemptFingerprint && !job.manual) return;
  const snapshot = job.revision;
  lastProblemAttemptFingerprint = job.fingerprint;
  problemReadInFlight = true;
  const startedAt = Date.now();
  const tick = () => { $('#read-problem span').textContent = `Reading · ${Math.floor((Date.now() - startedAt) / 1000)}s`; };
  tick(); const clock = setInterval(tick, 1000);
  $('#problem-confirm-message').textContent = 'Reading the problem. Your solution will be checked only after you confirm.';
  updateProblem();
  try {
    const result = await request('/api/read-problem', {method: 'POST', body: JSON.stringify({image: problemBoard.toDataURL(), revision: snapshot})});
    if (Number(result.revision) !== snapshot) return;
    const reading = {text: result.text || '', confidence: Number(result.confidence)};
    // Cache the exact ink even when a newer revision superseded this response.
    // Undo may restore that ink while its request is still in flight.
    problemReadingCache.set(job.fingerprint, reading);
    if (problemReadingCache.size > 8) problemReadingCache.delete(problemReadingCache.keys().next().value);
    if (problemConfirmed || snapshot !== problemRevision || problemMode !== 'write' || problemBoard.isDrawing || job.fingerprint !== problemFingerprint()) return;
    reviewProblem(reading.text, reading.confidence, job.manual);
  } catch (error) {
    if (snapshot !== problemRevision && lastProblemAttemptFingerprint === job.fingerprint) lastProblemAttemptFingerprint = '';
    if (snapshot === problemRevision) {
      $('#problem-confirm-message').textContent = `${errorText(error)} You can also switch to Type.`;
      toast('Couldn’t read the problem. Try again or type it.');
    }
  } finally {
    problemReadInFlight = false; clearInterval(clock);
    $('#read-problem span').textContent = 'Read problem'; updateProblem();
    if (queuedProblemRead) runProblemRead();
  }
}
function setNote(text, checking = false) {
  $('#board-note').textContent = text;
  $('.board-top-note').classList.toggle('checking', checking);
}
function setFeedbackStatus(text, checking = false) {
  $('#feedback-status').textContent = text;
  $('#feedback-status').classList.toggle('checking', checking);
}
function pruneReadings(lines = board.getLines()) {
  const fingerprints = new Map(lines.map(line => [String(line.id), line.fingerprint]));
  for (const [id, saved] of readingOverrides) {
    if (!saved.fingerprint || fingerprints.get(id) !== saved.fingerprint) readingOverrides.delete(id);
  }
  for (const [id, saved] of readingHistory) {
    if (!saved.fingerprint || fingerprints.get(id) !== saved.fingerprint) readingHistory.delete(id);
  }
}
function requestLines() {
  const lines = board.getLines();
  pruneReadings(lines);
  return lines.map(line => {
    const correction = readingOverrides.get(String(line.id));
    return correction ? {...line, text: correction.text} : line;
  });
}
function analysisLines(lines) {
  return lines.map(line => {
    if (typeof line.text === 'string' && line.text.trim()) return line;
    const image = board.getLineImage(line.id);
    if (!image) throw new Error('A handwritten step could not be captured. Try checking again, or edit its reading.');
    return {...line, image};
  });
}
function canCheck(lines = requestLines()) {
  return problemConfirmed && !!problem && lines.length > 0 && (connection.connected || lines.every(line => typeof line.text === 'string' && line.text.trim()));
}
function rowSignature(line) {
  return JSON.stringify([String(line.id), line.fingerprint || '', line.text || '']);
}
function approvedPrefix(lines) {
  if (!problemConfirmed || approvedProblem !== problem || approvedProblemVersion !== problemVersion) approvedRows = [];
  let count = 0;
  while (count < approvedRows.length && lines[count] && rowSignature(lines[count]) === approvedRows[count].signature) count += 1;
  approvedRows = approvedRows.slice(0, count);
  return approvedRows;
}
function rememberApproved(lines, sentLines) {
  approvedProblem = problem; approvedProblemVersion = problemVersion;
  approvedRows = [];
  for (const source of sentLines) {
    const result = lines.find(line => String(line.id) === String(source.id));
    if (!source.fingerprint || result?.status !== 'correct') break;
    approvedRows.push({signature: rowSignature(source), id: String(source.id), result: {...result}});
  }
}
function pendingReadings(lines) {
  const approved = approvedPrefix(lines);
  return lines.map((line, index) => approved[index] ? {...line, ...approved[index].result} : {...line, status: 'pending', text: line.text || readingHistory.get(String(line.id))?.text || ''});
}
function unclearReading(line) {
  return !!line.readingIssue || !String(line.text || '').trim() || (typeof line.transcriptionConfidence === 'number' && line.transcriptionConfidence < .8);
}
function verificationSummary(lines, processingMode) {
  const decisive = lines.filter(line => ['correct', 'incorrect'].includes(line.status));
  const local = decisive.filter(line => line.verifiedBy === 'sympy').length;
  const ai = decisive.filter(line => line.verifiedBy === 'ai').length;
  const unresolved = lines.length - local - ai;
  if (local && local === lines.length) return processingMode === 'local' ? 'Checked locally with symbolic math' : 'Every step checked with symbolic math';
  const parts = [];
  if (local) parts.push(`${local} ${local === 1 ? 'step' : 'steps'} checked with symbolic math`);
  if (ai) parts.push(`${ai} ${ai === 1 ? 'step' : 'steps'} reviewed by AI`);
  if (unresolved) parts.push(`${unresolved} ${unresolved === 1 ? 'step awaits' : 'steps await'} verification`);
  return parts.join('; ');
}
function rowNumber(line, index, sentLines) {
  return sentLines.find(item => String(item.id) === String(line.id))?.number || index + 1;
}
function applyReadingOverride(line, source, text, accepted = false) {
  if (accepted && line.readingIssue) { toast('Edit the reading to contain only this step before checking it.'); return false; }
  const current = board.getLines().find(item => String(item.id) === String(line.id));
  if (!current?.fingerprint || current.fingerprint !== source?.fingerprint) {
    toast('This line changed. Check its latest reading first.'); return false;
  }
  const correction = {text, fingerprint: current.fingerprint, accepted};
  readingOverrides.set(String(line.id), correction); readingHistory.set(String(line.id), correction);
  revision += 1; lastActivity = Date.now(); pendingRevision = null; analysis = null;
  clearTimeout(checkTimer); clearSolutionAnnotations();
  renderUpdating(); save(); scheduleCheck(true);
  toast(accepted ? 'Reading confirmed. Checking the math next.' : 'Reading corrected. Your writing stays unchanged.');
  return true;
}
function readingList(lines, sentLines) {
  const list = el('div', 'reading-list');
  const visibleLines = board.getLines();
  lines.forEach((line, index) => {
    const source = sentLines.find(item => String(item.id) === String(line.id));
    const typed = !!visibleLines.find(item => String(item.id) === String(line.id))?.text;
    const number = rowNumber(line, index, sentLines);
    const corrected = readingOverrides.get(String(line.id));
    const row = el('div', `reading-row ${line.status || 'pending'}`);
    const heading = el('div', 'reading-heading');
    const status = line.status === 'correct' ? 'Correct' : line.status === 'incorrect' ? 'Check this step' : line.status === 'uncertain' ? (unclearReading(line) ? 'Check this reading' : 'Needs review') : 'Not checked yet';
    heading.append(el('span', 'reading-number', String(number)), el('strong', 'reading-status', status));
    const edit = el('button', 'edit-reading', typed ? 'Edit step' : 'Edit reading');
    edit.type = 'button';
    edit.setAttribute('aria-label', `${typed ? 'Edit step' : 'Edit reading'} for line ${number}`);
    heading.append(edit);
    const body = el('div', 'reading-body');
    const displayedText = corrected?.text || line.text || '';
    body.append(el('span', 'reading-text', `I read: ${displayedText || 'Not read yet'}`));
    if (corrected) body.append(el('span', 'reading-corrected', corrected.accepted ? 'Reading confirmed by you' : 'Your correction'));
    if (line.readingIssue) body.append(el('span', 'reading-issue', 'This reading may include more than one step. Edit it to match only this line.'));
    row.append(heading, body);
    if (line.status === 'uncertain' && !line.readingIssue && !typed && displayedText.trim() && !corrected) {
      const accept = el('button', 'reading-accept', 'Yes, that’s what I wrote');
      accept.type = 'button';
      accept.addEventListener('click', () => applyReadingOverride(line, source, displayedText, true));
      row.append(accept);
    }
    edit.addEventListener('click', () => {
      if (body.querySelector('input')) { body.querySelector('input').focus(); return; }
      const form = el('form', 'reading-form');
      const input = el('input');
      input.value = displayedText; input.maxLength = typed ? 180 : 1200; input.required = true;
      input.autocomplete = 'off'; input.spellcheck = false;
      input.setAttribute('aria-label', `Correct transcription of line ${number}`);
      input.placeholder = 'Type what you wrote';
      const actions = el('div', 'reading-form-actions');
      const submit = el('button', 'primary-button', typed ? 'Update step' : 'Use reading'); submit.type = 'submit';
      const cancel = el('button', 'text-button', 'Cancel'); cancel.type = 'button';
      cancel.addEventListener('click', () => {
        body.replaceChildren(el('span', 'reading-text', `I read: ${displayedText || 'Not read yet'}`));
        if (corrected) body.append(el('span', 'reading-corrected', corrected.accepted ? 'Reading confirmed by you' : 'Your correction'));
      });
      actions.append(submit, cancel); form.append(input, actions); body.replaceChildren(form);
      input.focus(); input.select();
      form.addEventListener('submit', event => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        if (line.readingIssue && text === displayedText.trim()) { toast('Correct the reading so it contains only this step.'); input.focus(); return; }
        const current = board.getLines().find(item => String(item.id) === String(line.id));
        if (!current?.fingerprint || current.fingerprint !== source?.fingerprint) {
          toast('This line changed. Check your latest work before editing its reading.'); return;
        }
        if (typed) {
          if (board.updateText(line.id, text)) { scheduleCheck(true); toast('Step updated.'); }
          else toast('This step could not be updated. Try again.');
          return;
        }
        applyReadingOverride(line, source, text);
      });
    });
    list.append(row);
  });
  return list;
}
function focusedReadings(lines, sentLines) {
  const wrapper = el('div', 'reading-review');
  if (!lines.length) return wrapper;
  const current = lines.find(line => line.status === 'incorrect' || line.status === 'uncertain') || lines.at(-1);
  wrapper.append(readingList([current], sentLines));
  const earlier = lines.filter(line => line !== current);
  if (earlier.length) {
    const details = el('details', 'earlier-readings');
    details.append(el('summary', '', 'Review all readings'), readingList(earlier, sentLines));
    wrapper.append(details);
  }
  return wrapper;
}
const welcomeTemplate = $('#feedback').innerHTML;
function welcome() {
  $('#feedback').innerHTML = welcomeTemplate;
  setFeedbackStatus(problemConfirmed ? 'Waiting for your first step' : 'Confirm your problem');
  setNote(problemConfirmed ? 'Write one step per line. Pause to check.' : 'Add and confirm your problem above.');
}
function setTool(tool) {
  board.setTool(tool);
  ['pen', 'eraser'].forEach((name) => {
    $(`#${name}-tool`).classList.toggle('active', name === tool);
    $(`#${name}-tool`).setAttribute('aria-pressed', String(name === tool));
  });
  $('#solution-rows').style.setProperty('--drawing-cursor', tool === 'eraser' ? 'cell' : 'crosshair');
}
function changed() {
  if (initializing || resettingProblem) return;
  revision += 1;
  lastActivity = Date.now();
  pendingRevision = null;
  clearTimeout(checkTimer);
  analysis = null;
  pruneReadings();
  clearSolutionAnnotations();
  $('#board-empty').hidden = !board.isEmpty();
  $('#recheck-button').disabled = !canCheck() || checkInFlight;
  save();
  if (board.isEmpty()) { welcome(); return; }
  if (!problemConfirmed) { renderUpdating(); setNote('Confirm your problem before checking these steps.'); setFeedbackStatus('Confirm your problem'); return; }
  if (!canCheck()) { renderUpdating(); setNote('Connect your tutor to read handwriting, or type your steps.'); setFeedbackStatus('Handwriting needs a connection'); return; }
  setNote('Write one step per line. Pause to check.');
  setFeedbackStatus('Waiting for a pause');
  renderUpdating();
  scheduleCheck();
}
const board = new SolutionBoard($('#solution-rows'), {onChange: changed});
const problemBoard = new Whiteboard($('#problem-canvas'), {onChange: () => { invalidateProblem(true); scheduleProblemRead(); }, ariaLabel: 'Problem whiteboard'});
$('#problem-canvas').addEventListener('boardactivity', event => {
  if (event.detail?.drawing) invalidateProblem(true);
  else updateProblem();
});
$('#solution-rows').addEventListener('boardactivity', (event) => {
  if (event.detail?.drawing) {
    const changedIndex = approvedRows.findIndex(row => row.id === String(event.detail.rowId));
    if (changedIndex >= 0) approvedRows = approvedRows.slice(0, changedIndex);
    revision += 1;
    lastActivity = Date.now();
    clearTimeout(checkTimer);
    pendingRevision = null;
    clearSolutionAnnotations();
    analysis = null; renderUpdating();
    setNote('Write one step per line. Pause to check.');
  } else {
    lastActivity = Date.now();
    scheduleCheck();
  }
});
function renderUpdating() {
  const lines = requestLines();
  const readings = pendingReadings(lines);
  const note = el('p', 'checking-note', !problemConfirmed ? 'Confirm the problem on the right before checking your solution.' : canCheck(lines) ? 'Pause for a check, or select Check work.' : 'Type your steps for local math checks, or connect your tutor to read handwriting.');
  $('#feedback').replaceChildren(note, focusedReadings(readings, lines));
  renderAnnotations(readings);
}
function scheduleCheck(immediate = false) {
  clearTimeout(checkTimer);
  if (!canCheck() || board.isDrawing) return;
  const snapshot = revision;
  const wait = immediate ? 0 : Math.max(0, PAUSE_MS - (Date.now() - lastActivity));
  checkTimer = setTimeout(() => {
    if (snapshot !== revision || board.isDrawing) return;
    pendingRevision = snapshot;
    runPendingCheck();
  }, wait);
}
async function runPendingCheck() {
  if (checkInFlight || pendingRevision === null || board.isDrawing || !canCheck()) return;
  const snapshot = pendingRevision;
  pendingRevision = null;
  if (snapshot !== revision) return;
  checkInFlight = true;
  $('#recheck-button').disabled = true;
  $('#recheck-button .icon').classList.add('spin');
  const startedAt = Date.now();
  const updateElapsed = () => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    $('#recheck-button span').textContent = `Checking · ${seconds}s`;
    if (snapshot === revision) {
      setFeedbackStatus(`Checking · ${seconds}s`, true);
      setNote(`Checking your work · ${seconds}s`, true);
    } else setFeedbackStatus(`Finishing previous check · ${seconds}s`, true);
  };
  updateElapsed(); clearInterval(checkClock); checkClock = setInterval(updateElapsed, 1000);
  const sentLines = requestLines();
  try {
    const result = await request('/api/analyze', {
      method: 'POST', body: JSON.stringify({ problem, image: null, lines: analysisLines(sentLines), revision: snapshot }),
    });
    if (snapshot !== revision || board.isDrawing || (result.revision !== undefined && Number(result.revision) !== snapshot)) return;
    analysis = result;
    renderAnalysis(result, sentLines);
  } catch (error) {
    if (snapshot !== revision) return;
    setFeedbackStatus('Couldn’t check this time');
    setNote('Your writing is safe. Try checking again.');
    const card = el('div', 'feedback-card neutral feedback-failure');
    card.append(el('div', 'feedback-title', 'Check failed'), el('p', '', errorText(error)));
    const retry = el('button', '', 'Retry check →');
    retry.addEventListener('click', () => scheduleCheck(true));
    card.append(retry);
    const latestLines = requestLines();
    $('#feedback').replaceChildren(card, focusedReadings(pendingReadings(latestLines), latestLines));
  } finally {
    checkInFlight = false;
    clearInterval(checkClock);
    $('#recheck-button span').textContent = 'Check work';
    $('#recheck-button .icon').classList.remove('spin');
    $('#recheck-button').disabled = !canCheck();
    if (pendingRevision !== null) runPendingCheck();
  }
}
function createCard(type, title, body, iconName) {
  const card = el('div', `feedback-card ${type}`);
  const heading = el('div', 'feedback-title', title);
  if (iconName) heading.prepend(icon(iconName));
  card.append(heading);
  if (body) card.append(el('p', '', body));
  return card;
}
function renderAnalysis(result, sentLines) {
  const lines = Array.isArray(result.lines) ? result.lines : [];
  rememberApproved(lines, sentLines);
  for (const line of lines) {
    const source = sentLines.find(item => String(item.id) === String(line.id));
    if (source?.fingerprint) readingHistory.set(String(line.id), {text: line.text || '', fingerprint: source.fingerprint});
  }
  const firstError = lines.find((line) => String(line.id) === String(result.firstErrorLineId)) || lines.find((line) => line.status === 'incorrect');
  const uncertain = lines.find((line) => line.status === 'uncertain');
  const correct = lines.filter((line) => line.status === 'correct');
  const fragment = document.createDocumentFragment();
  if (result.solved && !firstError && !uncertain) {
    fragment.append(createCard('solved', 'Solved', 'All steps check out.', 'check'));
    setNote('All steps check out.');
    setFeedbackStatus('Solved');
  } else if (firstError) {
    const index = rowNumber(firstError, lines.indexOf(firstError), sentLines);
    const card = createCard('error', 'Check this step', firstError.hint || 'Compare this step with the previous line.', 'info');
    const actions = el('div', 'feedback-actions');
    const hint = el('button', '', 'Show hint 2');
    const why = el('button', '', 'Why?');
    const dismiss = el('button', '', 'Dismiss');
    function reveal(text, fallbackQuestion, button) {
      if (!text) { sendChat(fallbackQuestion); return; }
      const old = card.querySelector('.feedback-detail');
      if (old) old.remove();
      card.append(el('p', 'feedback-detail', text));
    }
    hint.addEventListener('click', () => reveal(firstError.hint2, `Give me a stronger hint for line ${index}, without revealing the full answer.`, hint));
    why.addEventListener('click', () => reveal(firstError.explanation, `Why is line ${index} incorrect? Explain the underlying idea without solving the problem for me.`, why));
    dismiss.addEventListener('click', () => { card.remove(); toast('Hint dismissed. Your tutor will check again when you write.'); });
    actions.append(hint, why, dismiss); card.append(actions); fragment.append(card);
    setNote('Take another look at the highlighted step.');
    setFeedbackStatus('Check this step');
  } else if (uncertain) {
    const index = rowNumber(uncertain, lines.indexOf(uncertain), sentLines);
    const unreadable = unclearReading(uncertain);
    const card = createCard('uncertain', unreadable ? 'Check this reading' : 'This step needs review', uncertain.readingIssue ? 'The reading may combine separate steps. Edit it below to contain only this line.' : unreadable ? 'Check the reading below. Confirm it if it’s right, or edit it.' : uncertain.hint || 'Explain this step in the chat so I can check your reasoning.', 'info');
    fragment.append(card);
    setNote(unreadable ? 'Check the reading in the tutor panel.' : 'Explain this step to your tutor.');
    setFeedbackStatus(unreadable ? 'Reading needs a correction' : 'Needs review');
  } else {
    setNote(correct.length ? 'Correct. Add your next step.' : 'Ready for your next step');
    setFeedbackStatus(correct.length ? `${correct.length} ${correct.length === 1 ? 'step' : 'steps'} checked` : 'Keep going');
  }
  if (!lines.length) fragment.append(createCard('neutral', 'Add a step', 'Write or type a complete math step.', 'pen'));
  const verification = verificationSummary(lines, result.processingMode);
  if (verification) {
    const verified = el('div', 'verified-label verification-summary', verification);
    fragment.append(verified);
  }
  if (result.processingMode === 'local') setFeedbackStatus('Local math check');
  fragment.append(focusedReadings(lines, sentLines));
  $('#feedback').replaceChildren(fragment);
  renderAnnotations(lines, firstError, sentLines);
}
function clearSolutionAnnotations() {
  $('#annotations').replaceChildren();
  $$('#solution-rows .solution-step').forEach(row => row.classList.remove('has-error', 'has-correct', 'has-uncertain'));
  $$('#solution-rows .row-analysis-badge').forEach(badge => badge.remove());
}
function renderAnnotations(lines, firstError) {
  clearSolutionAnnotations();
  lines.forEach(line => {
    const row = board.getRowElement(line.id);
    if (!row) return;
    if (line.status === 'correct') row.classList.add('has-correct');
    else if (line.status === 'incorrect') row.classList.add('has-error');
    else if (line.status === 'uncertain') row.classList.add('has-uncertain');
    else return;
    const label = line.status === 'correct' ? 'Correct' : line === firstError ? 'Check this line' : line.status === 'uncertain' ? 'Needs review' : 'Check this step';
    const badge = el('span', 'row-analysis-badge', label);
    row.querySelector('.solution-step-header')?.append(badge);
  });
}
function appendMessage(role, content, extraClass = '') {
  $('#chat-empty')?.remove();
  const message = el('div', `message ${role} ${extraClass}`, content);
  $('#messages').append(message);
  $('#messages').scrollTop = $('#messages').scrollHeight;
  return message;
}
function renderMessages() {
  if (!messages.length) return;
  $('#messages').replaceChildren();
  messages.forEach((message) => appendMessage(message.role, message.content));
}
function resetChat() {
  messages = [];
  $('#messages').innerHTML = '<div class="chat-empty" id="chat-empty"><div class="chat-suggestions"><button data-question="Can you give me a hint for my next step?">Give me a hint <span>↗</span></button><button data-question="Can you explain the last step on my board?">Explain this step <span>↗</span></button></div></div>';
}
async function sendChat(value) {
  const text = String(value || '').trim();
  if (!text || chatInFlight) return;
  if (!problemConfirmed) { if (problemReviewReady) focusConfirmation(); else openProblem(); toast('Confirm your problem first so your tutor knows the context.'); return; }
  if (!connection.connected) { openConnection(); return; }
  const currentProblem = problem;
  const currentProblemVersion = problemVersion;
  chatInFlight = true;
  $('#chat-send').disabled = true;
  messages.push({ role: 'user', content: text });
  appendMessage('user', text);
  $('#chat-input').value = '';
  $('#chat-input').style.height = 'auto';
  const thinking = appendMessage('assistant', '', 'thinking');
  for (let i = 0; i < 3; i++) thinking.append(el('span', 'thinking-dot'));
  try {
    const chatLines = requestLines().map(line => {
      const prior = analysis?.lines?.find(item => String(item.id) === String(line.id));
      return {...prior, ...line, text: line.text || prior?.text || readingHistory.get(String(line.id))?.text || ''};
    });
    const result = await request('/api/chat', { method: 'POST', body: JSON.stringify({ problem, image: board.toDataURL(), lines: chatLines, messages: messages.slice(-20) }) });
    if (problem !== currentProblem || problemVersion !== currentProblemVersion) return;
    if (!result.reply) throw new Error('Your tutor sent an empty reply. Please try again.');
    messages.push({ role: 'assistant', content: result.reply });
    appendMessage('assistant', result.reply);
    save();
  } catch (error) {
    if (problem === currentProblem && problemVersion === currentProblemVersion) appendMessage('assistant', errorText(error), 'error-message');
  } finally {
    thinking.remove(); chatInFlight = false; $('#chat-send').disabled = false;
    $('#messages').scrollTop = $('#messages').scrollHeight;
  }
}
function openProblem() {
  $('.problem-section').scrollIntoView({behavior: 'smooth', block: 'nearest'});
  if (problemMode === 'type') $('#problem-draft').focus({preventScroll: true});
  else $('#problem-write-mode').focus({preventScroll: true});
}
function beginProblem(text = '', nextSubject = 'Math') {
  resettingProblem = true;
  problem = ''; problemDraft = text.trim(); subject = nextSubject;
  problemConfirmed = false; problemReviewReady = false; problemMode = 'type';
  problemVersion += 1; problemRevision += 1; revision += 1;
  clearTimeout(problemReadTimer); queuedProblemRead = null; lastProblemAttemptFingerprint = ''; problemReadingCache.clear();
  analysis = null; messages = []; pendingRevision = null;
  readingOverrides.clear(); readingHistory.clear();
  clearTimeout(checkTimer);
  resetChat();
  board.setState([]); problemBoard.setState([]);
  $('#problem-draft').value = problemDraft; $('#problem-confirm-input').value = ''; $('#typed-step').value = '';
  $('#problem-confirm-message').textContent = 'Type your problem and select Review problem, or write it and pause for two seconds for an automatic reading.';
  resettingProblem = false;
  updateProblem(); welcome(); save();
  $('#board-empty').hidden = false;
  clearSolutionAnnotations();
  $('#problem-dialog').close(); $('#type-form').hidden = true;
  $('#board-surface').classList.remove('typing-open');
  setTool('pen');
  setProblemTool('pen');
  openProblem();
  if (problemDraft) reviewProblem(problemDraft);
}
function toggleTyping(show = $('#type-form').hidden) {
  $('#type-form').hidden = !show;
  $('#board-surface').classList.toggle('typing-open', show);
  $('#type-tool').classList.toggle('typing', show);
  if (show) $('#typed-step').focus();
}
function openConnection() { updateConnectionUI(); $('#connection-dialog').showModal(); }
function updateConnectionUI() {
  const connected = !!connection.connected;
  const provider = connection.provider === 'chatgpt' ? 'ChatGPT' : connection.provider === 'gemini' ? 'Gemini' : 'AI';
  $('#connection-button').classList.toggle('connected', connected);
  $('#connection-button').classList.toggle('busy', authPending && !connected);
  const verified = connection.connectionState === 'verified';
  $('#connection-label').textContent = connected ? `${provider} ${verified ? 'connected' : connection.provider === 'chatgpt' ? 'signed in' : 'configured'}` : authPending ? 'Waiting for sign-in' : 'Connect your tutor';
  $('#connection-card').hidden = connected;
  $('#tutor-live').textContent = connected ? 'LIVE' : 'READY';
  $('#tutor-live').classList.toggle('online', connected);
  $('#verification-label').textContent = connection.sympy ? 'Symbolic math + AI' : 'AI can make mistakes.';
  $('#recheck-button').disabled = !canCheck() || checkInFlight;
  $('#connection-modal-title').textContent = connected ? 'Your tutor is ready.' : 'A tutor, right beside you.';
  $('#connection-description').textContent = connected ? `Your whiteboard is connected to ${provider}. Pause after writing a step, and your tutor will take a look.` : 'Connect your ChatGPT account to get live feedback. You can keep writing while you connect.';
  $('#sign-in-button').hidden = false;
  $('#sign-in-button').firstChild.textContent = authPending ? 'Open ChatGPT sign-in again ' : connected && connection.provider === 'chatgpt' ? 'Reconnect ChatGPT ' : 'Continue with ChatGPT ';
  $('#connection-footnote').textContent = authPending ? 'Finish signing in in the other window. This page will reconnect automatically.' : location.hostname !== 'localhost' && location.hostname !== '127.0.0.1' ? 'If you’re using a tablet, complete sign-in on the laptop running Margin.' : 'Sign-in opens in a separate window. Your writing stays here.';
  $('#connection-details').hidden = !connected;
  if (connected) {
    $('#connection-details').replaceChildren(el('div', '', `Provider: ${provider}`));
    if (connection.model) $('#connection-details').append(el('div', '', `Model: ${connection.model}`));
    $('#connection-details').append(el('div', '', connection.sympy ? 'Symbolic math verification is available.' : 'Steps will be checked by your AI tutor.'));
  }
  if (connection.authError) {
    $('#connection-details').hidden = false;
    if (!connected) $('#connection-details').replaceChildren();
    $('#connection-details').append(el('div', 'connection-error', String(connection.authError).slice(0, 350)));
  }
}
async function refreshStatus() {
  if (statusInFlight) return;
  statusInFlight = true;
  try {
    const before = connection.connected;
    connection = await request('/api/status');
    if (connection.connected) {
      if (authPending && connection.provider === 'chatgpt') {
        authPending = false; clearInterval(authPoll); clearTimeout(authTimeout);
        $('#connection-dialog').close(); toast('Your ChatGPT tutor is connected. Let’s work it out.');
      }
      if (!before && !board.isEmpty()) { lastActivity = Date.now(); scheduleCheck(); }
      if (!before && !problemConfirmed && !problemReviewReady && problemMode === 'write') scheduleProblemRead();
    }
    updateConnectionUI();
  } catch {
    connection = { connected: false, provider: null };
    updateConnectionUI();
    $('#connection-label').textContent = 'Server unavailable';
  } finally { statusInFlight = false; }
}
function signIn() {
  const authWindow = window.open('/auth/start', 'margin-provider-signin', 'popup=yes,width=560,height=740');
  // Embedded browsers can open a tab without returning a WindowProxy. Polling
  // must still begin; a null return does not prove that sign-in was blocked.
  authPending = true;
  updateConnectionUI();
  $('#connection-dialog').close();
  toast(authWindow ? 'Complete sign-in in the other window. Your board is ready to use.' : 'Sign-in opens in another tab. If it doesn’t appear, allow pop-ups and try again.');
  clearInterval(authPoll);
  clearTimeout(authTimeout);
  authPoll = setInterval(refreshStatus, 2500);
  authTimeout = setTimeout(() => { clearInterval(authPoll); authPending = false; updateConnectionUI(); }, 300000);
}

$('#pen-tool').addEventListener('click', () => { setTool('pen'); toggleTyping(false); });
$('#eraser-tool').addEventListener('click', () => setTool('eraser'));
$('#undo-tool').addEventListener('click', () => board.undo());
$('#next-line').addEventListener('click', () => { board.addRow(); if (!$('#type-form').hidden) $('#typed-step').focus(); });
$('#clear-tool').addEventListener('click', () => { if (!board.isEmpty()) $('#clear-dialog').showModal(); });
$('#confirm-clear').addEventListener('click', () => { board.clear(); $('#clear-dialog').close(); });
$('#new-problem').addEventListener('click', () => beginProblem());
$('#edit-problem').addEventListener('click', () => { invalidateProblem(); openProblem(); });
$('#type-tool').addEventListener('click', () => toggleTyping());
$('#empty-type').addEventListener('click', () => toggleTyping(true));
$('#close-type').addEventListener('click', () => toggleTyping(false));
$('#recheck-button').addEventListener('click', () => scheduleCheck(true));
$('#type-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = $('#typed-step').value.trim();
  if (!text) return;
  if (!board.addText(text)) { toast('This board is full. Clear some space or start a new problem.'); return; }
  $('#typed-step').value = ''; $('#typed-step').focus();
  scheduleCheck(true);
});
$('#try-example').addEventListener('click', () => {
  if (!problemConfirmed) { $('#problem-draft').value = 'Solve 2(x − 3) = 10'; chooseProblemMode('type'); problemDraft = $('#problem-draft').value; invalidateProblem(); reviewProblem(problemDraft); return; }
  const isDemo = /2\s*\(\s*x\s*[-−]\s*3\s*\)\s*=\s*10/.test(problem);
  if (isDemo) {
    board.addText('2(x − 3) = 10');
    board.addText('2x − 3 = 10');
    toast('Example added with a distribution mistake. Try correcting the second line.');
  } else {
    board.addText(problem.replace(/^(solve|find|simplify|calculate|evaluate)\s*:?[\s]*/i, ''));
    toast('Your problem is on the board. Add the next step.');
  }
});
$('#problem-type-mode').addEventListener('click', () => chooseProblemMode('type'));
$('#problem-write-mode').addEventListener('click', () => chooseProblemMode('write'));
$('#problem-draft').addEventListener('input', () => { problemDraft = $('#problem-draft').value; invalidateProblem(); });
$('#problem-draft-form').addEventListener('submit', event => {
  event.preventDefault();
  const text = $('#problem-draft').value.trim();
  if (!text) return;
  invalidateProblem(); reviewProblem(text);
});
$('#problem-draft').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('#problem-draft-form').requestSubmit(); }
});
$('#problem-example').addEventListener('click', () => {
  $('#problem-draft').value = 'Solve 2(x − 3) = 10'; problemDraft = $('#problem-draft').value;
  invalidateProblem(); reviewProblem(problemDraft);
});
$('#problem-confirm-input').addEventListener('input', () => {
  problemDraft = $('#problem-confirm-input').value;
  $('#confirm-problem').disabled = !problemReviewReady || !problemDraft.trim();
  save();
});
$('#problem-confirm-form').addEventListener('submit', event => {
  event.preventDefault();
  const text = $('#problem-confirm-input').value.trim();
  if (!problemReviewReady || !text) return;
  if (text !== problem) resetChat();
  problem = text; problemDraft = text; problemConfirmed = true;
  clearTimeout(problemReadTimer); queuedProblemRead = null;
  problemVersion += 1; revision += 1;
  if (problemMode === 'type') $('#problem-draft').value = text;
  updateProblem(); welcome(); save();
  if (!board.isEmpty()) scheduleCheck(true);
  toggleTyping(true);
  if (matchMedia('(max-width: 760px)').matches) $('.solution-section-head').scrollIntoView({behavior: 'smooth', block: 'start'});
});
$('#read-problem').addEventListener('click', readProblem);
function setProblemTool(tool) {
  problemBoard.setTool(tool);
  $('#problem-pen').classList.toggle('selected', tool === 'pen');
  $('#problem-eraser').classList.toggle('selected', tool === 'eraser');
}
$('#problem-pen').addEventListener('click', () => setProblemTool('pen'));
$('#problem-eraser').addEventListener('click', () => setProblemTool('eraser'));
$('#problem-undo').addEventListener('click', () => problemBoard.undo());
$('#problem-clear').addEventListener('click', () => problemBoard.clear());
$('#problem-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = $('#problem-input').value.trim();
  if (!text) return;
  const preset = $$('.problem-presets button').find((button) => button.dataset.problem === text);
  beginProblem(text, preset?.dataset.subject || 'Math');
});
$$('.problem-presets button').forEach((button) => button.addEventListener('click', () => {
  $('#problem-input').value = button.dataset.problem;
  $$('.problem-presets button').forEach((item) => item.classList.toggle('selected', item === button));
}));
$$('[data-close]').forEach((button) => button.addEventListener('click', () => $(`#${button.dataset.close}`).close()));
$$('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
}));
$('#connection-button').addEventListener('click', openConnection);
$('#inline-connect').addEventListener('click', openConnection);
$('#sign-in-button').addEventListener('click', signIn);
$('#refresh-connection').addEventListener('click', async () => {
  await refreshStatus(); toast(connection.connected ? 'Your tutor is connected.' : 'No connection yet. Complete sign-in or configure the Gemini fallback.');
});
$('#chat-form').addEventListener('submit', (event) => { event.preventDefault(); sendChat($('#chat-input').value); });
$('#messages').addEventListener('click', (event) => {
  const question = event.target.closest('[data-question]');
  if (question) sendChat(question.dataset.question);
});
$('#chat-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendChat($('#chat-input').value); }
});
$('#chat-input').addEventListener('input', () => { $('#chat-input').style.height = 'auto'; $('#chat-input').style.height = `${Math.min(90, $('#chat-input').scrollHeight)}px`; });
document.addEventListener('keydown', (event) => {
  if (event.target.matches('input,textarea,[contenteditable="true"]') || document.querySelector('dialog[open]')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); board.undo(); }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.toLowerCase() === 'p') { setTool('pen'); toggleTyping(false); }
  if (event.key.toLowerCase() === 'e') setTool('eraser');
  if (event.key.toLowerCase() === 't') { event.preventDefault(); toggleTyping(true); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshStatus(); });
window.addEventListener('message', (event) => { if (event.origin === location.origin && ['margin-auth-complete', 'margin-auth'].includes(event.data?.type)) refreshStatus(); });

$('.api-help summary').textContent = 'Using Gemini as a fallback?';
$('.api-help p').innerHTML = 'Add your Gemini key as <code>LLM_API_KEY</code> in the local server’s <code>.env</code> file, then check the connection again. Provider billing is separate from ChatGPT. Never paste a key into the whiteboard or chat.';
$('#problem-dialog form > p').textContent = 'Enter the problem, then type or write one step at a time.';
$('#problem-dialog .eyebrow').textContent = 'NEW PROBLEM';
$('#problem-form button[type="submit"]').firstChild.textContent = 'Start problem ';
$('#chat-empty > p')?.remove();
$('#connection-card > p').textContent = 'Connect for handwriting recognition and tutor chat. Typed math can be checked locally.';

try {
  const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if (stored && typeof stored.problem === 'string') {
    problem = stored.problem; subject = stored.subject || 'Math';
    problemConfirmed = typeof stored.problemConfirmed === 'boolean' ? stored.problemConfirmed && !!problem : !!problem;
    problemDraft = typeof stored.problemDraft === 'string' ? stored.problemDraft : problem;
    problemMode = stored.problemMode === 'write' ? 'write' : 'type';
    problemReviewReady = !!stored.problemReviewReady || problemConfirmed;
    if (problemReviewReady && !problemConfirmed) $('#problem-confirm-message').textContent = 'Check the text below. You can correct it before starting.';
    $('#problem-draft').value = typeof stored.typedProblem === 'string' ? stored.typedProblem : problemDraft;
    $('#problem-confirm-input').value = problemDraft;
    if (stored.problemInk) problemBoard.setState(stored.problemInk);
    if (stored.board) board.setState(stored.board);
    if (Array.isArray(stored.readings)) for (const [id, saved] of stored.readings) {
      if (typeof id === 'string' && typeof saved?.text === 'string' && typeof saved?.fingerprint === 'string') readingOverrides.set(id, saved);
    }
    pruneReadings();
    if (problemMode === 'write' && problemReviewReady && !problemBoard.isEmpty()) {
      const fingerprint = problemFingerprint();
      lastProblemAttemptFingerprint = fingerprint;
      problemReadingCache.set(fingerprint, {text: problemDraft, confidence: 1});
    }
  }
} catch { /* A damaged browser save should never stop a fresh workspace. */ }
initializing = false;
resetChat();
updateProblem();
if (!problemConfirmed) welcome();
$('#board-empty').hidden = !board.isEmpty();
setTool('pen');
document.fonts?.load('48px Caveat').then(() => board.render()).catch(() => {});
refreshStatus();
setInterval(refreshStatus, 20000);
if (canCheck()) scheduleCheck(true);

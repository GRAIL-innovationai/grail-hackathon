const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label = value => String(value).replaceAll('_', ' ');
const bullets = values => `<ul>${values.map(x => `<li>${escape(x)}</li>`).join('')}</ul>`;
const examples = {
  membrane: {problem:'Detect early membrane fouling from noisy pressure, flow, and temperature signals, with very few confirmed fouling events.',field:'Chemical engineering',available_data:'Time series from 12 filtration runs, timestamps, cleaning logs, and only two confirmed fouling labels.',constraints:'No new sensors. One week for a pilot. Limited computation.'},
  assay: {problem:'Choose which formulation to test next when each assay is expensive and there are several competing outcomes.',field:'Experimental biology',available_data:'Twenty historical formulations, three measured outcomes, and measurement error estimates.',constraints:'Budget for only six more experiments. Candidate ingredients must come from an existing inventory.'},
  biostat: {problem:'Estimate a population outcome when participants with worsening health are more likely to miss follow-up visits.',field:'Biostatistics',available_data:'Baseline characteristics, repeated measurements, visit times, and reasons for missed visits when recorded.',constraints:'Cannot recruit more participants. Missingness may depend on unobserved outcomes. Two weeks for analysis.'}
};
let activeRun, lastRequest, startTime, timer, polling;

function loadExample(name) {
  const value = examples[name];
  if (!value) return;
  $('problem').value = value.problem; $('field').value = value.field;
  $('data').value = value.available_data; $('constraints').value = value.constraints;
}
$('example').onchange = event => loadExample(event.target.value);
loadExample('membrane');

function busy(value) {
  $('run-button').disabled = value; $('revise-button').disabled = value;
  $('cancel-button').hidden = !value;
  if (!value) {clearInterval(timer); clearTimeout(polling);}
}

async function start(request) {
  busy(true); $('error').hidden = true; $('empty').hidden = true;
  $('report').hidden = true; $('revision-panel').hidden = true; $('activity').hidden = false;
  $('events').innerHTML = ''; $('activity-title').textContent = 'Research in progress';
  $('elapsed').textContent = '0s';
  startTime = Date.now();
  timer = setInterval(() => {$('elapsed').textContent = Math.floor((Date.now()-startTime)/1000)+'s';},1000);
  try {
    const response = await fetch('/api/runs', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail));
    activeRun = data.id; lastRequest = request; location.hash = activeRun;
    await poll();
  } catch (error) {fail(error.message);}
}

function fail(message) {$('error').textContent = message; $('error').hidden = false; $('activity-title').textContent = 'Run did not complete'; busy(false);}

async function poll() {
  try {
    const response = await fetch(`/api/runs/${activeRun}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Could not load the run.');
    if (data.request) lastRequest = data.request;
    $('events').innerHTML = data.events.map(e => `<li>${escape(e.message)}${e.detail?.query ? ' · '+escape(e.detail.query) : e.detail?.source_id ? ' · '+escape(e.detail.source_id) : ''}</li>`).join('');
    $('events').scrollTop = $('events').scrollHeight;
    if (data.status === 'complete') {
      busy(false); $('activity-title').textContent = 'Research complete'; render(data.report);
    } else if (data.status === 'failed') fail(data.error);
    else if (data.status === 'cancelled') {busy(false); $('activity-title').textContent = 'Run cancelled';}
    else polling = setTimeout(poll, 1800);
  } catch (error) {fail(error.message);}
}

$('research-form').onsubmit = event => {
  event.preventDefault();
  start({problem:$('problem').value,field:$('field').value,available_data:$('data').value,constraints:$('constraints').value,domains:3});
};
$('cancel-button').onclick = async () => {await fetch(`/api/runs/${activeRun}/cancel`,{method:'POST'});};
$('revise-button').onclick = () => {
  if (!$('revision').value.trim()) {$('revision').focus();return;}
  start({...lastRequest,previous_run:activeRun,revision:$('revision').value.trim()});
};

function render(report) {
  const a = report.abstraction;
  const sourceMap = Object.fromEntries(report.sources.map(s => [s.source_id,s]));
  const sourceList = ids => `<ul class="source-list">${ids.map(id => {const s=sourceMap[id]; return s ? `<li><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)}</a><small>${escape(s.year)} · ${escape(s.database)} · ${s.retrieval_level === 'abstract' ? 'Abstract retrieved' : 'Metadata only'}</small></li>` : '';}).join('')}</ul>`;
  $('report').innerHTML = `<h2 class="report-title">${escape(report.title)}</h2>
    <div class="toolbar"><button id="copy" class="export-button">Copy for Google Docs</button>${['docx','md','json'].map(f=>`<a class="export-button" href="/api/runs/${activeRun}/export/${f}">Download ${f.toUpperCase()}</a>`).join('')}</div>
    <div id="report-content">${lastRequest?.revision ? `<p><strong>Latest update:</strong> ${escape(lastRequest.revision)}</p>` : ''}<section class="abstract"><p class="eyebrow">THE ABSTRACTED PROBLEM</p><h3>${escape(a.problem_type)}</h3><p>${escape(a.description)}</p><p><strong>Goal:</strong> ${escape(a.goal)}</p><details><summary>Data, constraints, and assumptions</summary><strong>Known data</strong>${bullets(a.known_data)}<strong>Constraints</strong>${bullets(a.constraints)}<strong>Assumptions</strong>${bullets(a.assumptions)}</details></section>
    ${report.recommendations.map((c,i)=>`<article class="candidate"><div class="card-head"><span class="domain">0${i+1} / ${escape(c.domain.toUpperCase())}</span><h3>${escape(c.method)}</h3><div class="badges"><span class="badge ${c.evidence_status}">${escape(label(c.evidence_status))}</span><span class="badge ${c.feasibility}">${escape(label(c.feasibility))}</span></div><p>${escape(c.fit_summary)}</p></div>
    <details open><summary>The structural connection</summary><table><thead><tr><th>Your problem</th><th>Borrowed concept</th><th>Shared structure</th></tr></thead><tbody>${c.structural_mapping.map(m=>`<tr><td>${escape(m.target_concept)}</td><td>${escape(m.source_concept)}</td><td>${escape(m.shared_structure)}</td></tr>`).join('')}</tbody></table></details>
    <details><summary>Adaptation and required measurements</summary><ol>${c.adaptation_steps.map(s=>`<li>${escape(s)}</li>`).join('')}</ol><table><thead><tr><th>Measurement</th><th>Availability</th><th>Collection and purpose</th></tr></thead><tbody>${c.measurements.map(m=>`<tr><td>${escape(m.variable)}</td><td>${escape(m.availability)}</td><td>${escape(m.how_to_collect)}<br>${escape(m.purpose)}</td></tr>`).join('')}</tbody></table></details>
    <details><summary>A collaborator to look for</summary><p><strong>${escape(c.collaborator.expertise)}</strong></p><p>${escape(c.collaborator.contribution)}</p><p>Search: ${escape(c.collaborator.search_terms.join('; '))}</p></details>
    <details open><summary>A small test that could reject this idea</summary>${Object.entries(c.validation).map(([k,v])=>`<div class="validation-row"><strong>${escape(label(k))}</strong>${escape(v)}</div>`).join('')}</details>
    <details><summary>Evidence, prior art, and limitations</summary><p>${escape(c.prior_art_note)}</p>${bullets(c.limitations)}${sourceList(c.source_ids)}</details></article>`).join('')}
    <section class="next-step"><strong>Start here</strong><p>${escape(report.recommended_start)}</p></section>
    <section class="report-bottom"><h3>Ideas that did not make the cut</h3>${bullets(report.rejected_candidates.map(x=>x.domain_or_method+': '+x.reason))}<h3>Open questions</h3>${bullets(report.follow_up_questions)}<h3>Search limitations</h3>${bullets(report.search_limitations)}<p class="evidence-note">${escape(report.evidence_note)}</p></section></div>`;
  $('report').hidden = false; $('revision-panel').hidden = false;
  $('copy').onclick = async () => {
    const node = $('report-content').cloneNode(true);
    node.querySelectorAll('details').forEach(d=>d.setAttribute('open',''));
    const plain = await (await fetch(`/api/runs/${activeRun}/export/md`)).text();
    try {
      if (navigator.clipboard.write && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([`<h1>Cross–Pollinate</h1><h2>${escape(report.title)}</h2>`+node.innerHTML],{type:'text/html'}),'text/plain':new Blob([plain],{type:'text/plain'})})]);
      } else await navigator.clipboard.writeText(plain);
      $('copy').textContent = 'Copied — paste into Google Docs';
    } catch {$('copy').textContent = 'Use Download DOCX to open in Google Docs';}
  };
}

fetch('/api/config').then(r=>r.json()).then(c=>{$('backend').textContent = c.ready ? (c.backend === 'codex' ? 'Codex CLI' : 'OpenAI configured') : 'Setup needed';});
if (/^#[0-9a-f-]{36}$/.test(location.hash)) {
  activeRun = location.hash.slice(1); $('empty').hidden = true; $('activity').hidden = false; poll();
}

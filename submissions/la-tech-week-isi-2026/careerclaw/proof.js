const proofPanel = document.createElement('section');
proofPanel.className = 'panel';
proofPanel.innerHTML = `<h2>Proof Project Designer</h2>
<form id="proof-generate"><label for="proof-job">Target position</label><select id="proof-job" required></select>
<div class="search-fields"><div><label for="proof-hours">Hours per week</label><input id="proof-hours" type="number" min="1" max="40" value="6" required></div>
<div><label for="proof-weeks">Weeks</label><input id="proof-weeks" type="number" min="1" max="12" value="3" required></div></div>
<button type="submit">Generate project</button><button type="button" class="secondary" id="proof-refresh">Reload saved projects</button></form>
<p id="proof-message" role="status"></p><label for="proof-saved">Saved projects</label><select id="proof-saved"><option value="">No saved projects</option></select><div id="proof-detail"></div>`;
document.querySelector('#output').closest('.panel').after(proofPanel);
let proofPlans = [], activeProof = null;
const safe = escapeHTML;
async function refreshProof() {
  try {
    const [jobs, plans] = await Promise.all([api('jobs'), api('proof_list')]);
    const selectedJob = $('proof-job').value;
    $('proof-job').innerHTML = '<option value="">Choose a saved position</option>' + jobs.jobs.map(j=>`<option value="${safe(j.id)}">${safe(j.title)} - ${safe(j.employer)}</option>`).join('');
    if (jobs.jobs.some(j=>j.id===selectedJob)) $('proof-job').value=selectedJob;
    proofPlans = plans.plans;
    $('proof-saved').innerHTML = '<option value="">Choose a project</option>' + proofPlans.map(p=>`<option value="${safe(p.id)}">${safe(p.project.name)} - ${safe(p.bullets[0].status)}</option>`).join('');
    const selected = proofPlans.find(p=>p.id===activeProof?.id) || proofPlans[0];
    if (selected) showProof(selected);
  } catch(e) { $('proof-message').textContent=e.message; }
}
function showProof(plan) {
  activeProof=plan; $('proof-saved').value=plan.id;
  const bullet=plan.bullets[0];
  $('proof-detail').innerHTML=`<h3>${safe(plan.project.name)} <span class="tag">${safe(bullet.status)}</span></h3>
  <p class="small">Skill: ${safe(plan.skill)} · ${safe(plan.mode)} · Revision ${safe(plan.skill_revision)}</p>
  <p>${safe(plan.project.pitch)}</p><h3>Target bullet</h3><p>${safe(bullet.text)}</p>
  <p>${bullet.status==='LOCKED'?'Not ready for your resume.': 'Human-reviewed version: '+safe(bullet.resume_ready_text)}</p>
  <details><summary>Gaps and source evidence</summary>${plan.gaps.map(g=>`<p><b>${safe(g.jd_source)}</b>: ${safe(g.jd_requirement)}<br>${safe(g.bucket)} · ${safe(g.tier)}<br>${safe(typeof g.profile_evidence==='string'?g.profile_evidence:JSON.stringify(g.profile_evidence))}</p>`).join('')}</details>
  <h3>Milestones</h3><ol>${plan.project.milestones.map(m=>`<li>${safe(m.title)} (${m.hours} hours)</li>`).join('')}</ol>
  <details><summary>Required evidence and interview preparation</summary><ul>${[...plan.project.evidence_required,...plan.project.interview_hooks].map(t=>`<li>${safe(t)}</li>`).join('')}</ul></details>
  <label for="proof-notes">Project notes</label><textarea id="proof-notes">${safe(plan.notes||'')}</textarea><button id="proof-save">Save notes</button>
  <h3>GitHub evidence</h3><label for="proof-url">Public repository URL</label><input id="proof-url" type="url" placeholder="https://github.com/owner/repo" value="${safe(plan.evidence_links[0]||'')}">
  <label for="proof-ref">Branch or commit (optional)</label><input id="proof-ref" placeholder="Default branch" value="${safe(plan.evidence_ref||'')}">
  <label for="proof-paths">Evidence file paths (one per line, maximum 5)</label><textarea id="proof-paths">${safe(plan.evidence.length?plan.evidence.map(e=>e.path).join('\n'):'README.md')}</textarea>
  <button id="proof-check">Check GitHub evidence</button>
  ${plan.evidence.map(e=>`<details><summary>${safe(e.path)} · ${safe(e.commit.slice(0,7))}</summary><a href="${safe(e.url)}" target="_blank" rel="noopener noreferrer">View pinned file</a><pre>${safe(e.text)}</pre></details>`).join('')}
  <h3>Claim review</h3><p class="small">GitHub checks retrieve files; they do not prove implementation, authorship, or measured outcomes. Claim decisions below are human-reviewed. Rechecking evidence resets the review.</p>
  <form id="proof-review">${bullet.rubric.map((r,i)=>`<fieldset style="min-width:0;border:1px solid #bfc9c4;margin:12px 0"><legend>${safe(r.claim)}</legend><p>${safe(r.evidence_criteria)}</p><p>${safe(r.status)}: ${safe(r.decided_by)}</p>
  <label for="decision-${i}">Review result</label><select id="decision-${i}"><option value="cannot_verify">Cannot verify</option><option value="not_met">Not met</option><option value="met">Met (human reviewed)</option></select>
  <label for="path-${i}">Evidence file</label><select id="path-${i}">${plan.evidence.map(e=>`<option>${safe(e.path)}</option>`).join('')}</select>
  <label for="quote-${i}">Exact supporting quote</label><textarea id="quote-${i}">${safe(r.quote||'')}</textarea>
  <label for="reason-${i}">Review reasoning</label><textarea id="reason-${i}" required></textarea></fieldset>`).join('')}
  <button type="submit" ${plan.evidence.length?'':'disabled'}>Save review & update status</button></form>
  <details><summary>Status history</summary>${plan.history.map(h=>`<p>${safe(h.action)}: ${safe(h.previous)} → ${safe(h.status)}</p>`).join('')}</details>`;
  bullet.rubric.forEach((r,i)=>{if(r.status!=='unchecked') $('decision-'+i).value=r.status; $('reason-'+i).value=r.decided_by?.startsWith('Human review: ')?r.decided_by.slice(14):'';});
  $('proof-save').onclick=()=>proofAction('proof_save',{notes:$('proof-notes').value});
  $('proof-check').onclick=()=>proofAction('proof_check',{url:$('proof-url').value,paths:$('proof-paths').value,ref:$('proof-ref').value});
  $('proof-review').onsubmit=e=>{e.preventDefault();proofAction('proof_review',{reviews:bullet.rubric.map((r,i)=>({status:$('decision-'+i).value,path:$('path-'+i).value,quote:$('quote-'+i).value,reason:$('reason-'+i).value}))});};
}
async function proofAction(route, data) {
  const buttons=[...proofPanel.querySelectorAll('button')]; buttons.forEach(b=>b.disabled=true);
  $('proof-message').textContent=route==='proof_check'?'Checking public GitHub files...':'Saving...';
  try {const plan=await api(route,{id:activeProof.id,updated:activeProof.updated,...data});activeProof=plan;await refreshProof();$('proof-message').textContent='Saved. Status: '+plan.bullets[0].status;}
  catch(e){$('proof-message').textContent=e.message;}
  finally{buttons.forEach(b=>b.disabled=false);}
}
$('proof-generate').onsubmit=async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;$('proof-message').textContent='Generating project...';
  try {await api('profile',Object.fromEntries(fields.map(k=>[k,$(k).value])));activeProof=await api('proof_generate',{job_id:$('proof-job').value,hours:Number($('proof-hours').value),weeks:Number($('proof-weeks').value)});await refreshProof();$('proof-message').textContent='Project generated and saved. Target bullet is LOCKED.';}
  catch(error){$('proof-message').textContent=error.message;}finally{button.disabled=false;}
};
$('proof-refresh').onclick=refreshProof;
$('proof-saved').onchange=()=>{const plan=proofPlans.find(p=>p.id===$('proof-saved').value);if(plan)showProof(plan);};
new MutationObserver(()=>refreshProof()).observe($('jobs'),{childList:true});
refreshProof();

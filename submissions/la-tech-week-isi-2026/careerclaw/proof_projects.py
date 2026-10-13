"""Executable, deterministic adapter for the bundled proof-project-designer skill."""
import base64
import copy
import hashlib
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

SKILL = Path(__file__).parent / 'skills' / 'proof-project-designer'


def generate(profile, ranking, hours=6, weeks=3):
    hours, weeks = int(hours), int(weeks)
    if not 1 <= hours <= 40 or not 1 <= weeks <= 12:
        raise ValueError('Use 1-40 hours per week and 1-12 weeks.')
    source = (SKILL / 'SKILL.md').read_text()
    template = (SKILL / 'references/templates.md').read_text()
    gaps = []
    for row in ranking['requirements']:
        if row['status'] == 'supported':
            continue
        requirement = row['requirement']
        text = requirement['text']
        bucket = 'project_closable'
        if re.search(r'years?\b|degree|bachelor|master|ph\.?d|clearance|authorization|licen[cs]e', text, re.I):
            bucket = 'not_closable'
        elif re.search(r'production|cross.functional|large.scale|professional|leadership', text, re.I):
            bucket = 'partial'
        gaps.append(dict(id='g'+str(len(gaps)+1), jd_requirement=text,
                         jd_source=requirement['id'], profile_evidence=row['evidence'] or 'not present in profile',
                         bucket=bucket, tier='inferred'))
    selected = [g for g in gaps if g['bucket'] == 'project_closable'][:2]
    if not selected:
        raise ValueError('No project-closable gaps found for this role. Choose another job or review your profile.')
    focus = '; '.join(g['jd_requirement'] for g in selected)
    title = ranking['job']['title']
    claims = [
        ('implementation', 'Implemented a small prototype addressing: '+focus,
         'Source code must implement the selected requirements; review key files and a reproducible run.',
         'Implemented a prototype addressing: '+focus),
        ('setup', 'Documented reproducible setup',
         'README must provide dependencies, setup commands and an example with expected output.',
         'Documented setup and an example run for the prototype.'),
        ('tests', 'Tested the prototype',
         'Tests must exercise the selected behavior; include the command and recorded results.',
         'Added tests and recorded their results for the prototype.')]
    rubric = [dict(id=key, claim=claim, evidence_criteria=criteria, status='unchecked',
                   decided_by='', verified_text=verified) for key, claim, criteria, verified in claims]
    budget = hours * weeks
    milestones = [dict(title=name, hours=round(budget*fraction, 2)) for name, fraction in [
        ('Prototype the riskiest requirement using an existing project or public dataset', .4),
        ('Complete the smallest reproducible implementation', .3),
        ('Write behavior tests and record actual results', .2),
        ('Document setup, limitations and evidence links', .1)]]
    return dict(skill='proof-project-designer', mode='deterministic skill adapter',
                skill_revision=hashlib.sha256((source+template).encode()).hexdigest()[:12],
                target_role=dict(title=title, company=ranking['job']['employer'], jd_id=ranking['job']['id']),
                constraints=dict(hours_per_week=hours, weeks=weeks, assumed=False), gaps=gaps,
                project=dict(name=title+' proof project', pitch='Extend an existing project, or build a small prototype addressing: '+focus,
                             milestones=milestones, evidence_required=['README with setup and results', 'Implementation source', 'Tests and run results'],
                             claim_to_work=[dict(claim=c, work=e) for _, c, e, _ in claims],
                             stretch=['Add a deployed demo after completing the required evidence'],
                             interview_hooks=['What design tradeoff did you make?', 'How do your tests establish the claimed behavior?']),
                bullets=[dict(id='b1', gap_ids=[g['id'] for g in selected],
                              text='Built a prototype addressing '+focus+', with reproducible setup and tests.',
                              status='LOCKED', resume_ready_text=None, rubric=rubric, metric_values={})],
                evidence_links=[], evidence=[], history=[])


def github_json(path):
    request = urllib.request.Request('https://api.github.com'+path, headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'CareerClaw'})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read(2*1024*1024+1)
        if len(raw) > 2*1024*1024:
            raise ValueError('Evidence response too large')
        return json.loads(raw)
    except Exception as exc:
        raise ValueError('Cannot read public GitHub evidence. Check the URL, file paths, network, or API rate limit.') from exc


def inspect_evidence(plan, repo_url, paths, ref=''):
    match = re.fullmatch(r'https://github\.com/([A-Za-z0-9_-]+)/([A-Za-z0-9_.-]+)/?', repo_url.strip())
    if not match:
        raise ValueError('Use a public repository URL: https://github.com/owner/repo')
    owner, repo = match.groups()
    paths = [p.strip() for p in paths.splitlines() if p.strip()]
    if not 1 <= len(paths) <= 5 or any(p.startswith('/') or '..' in p.split('/') for p in paths):
        raise ValueError('Specify 1-5 relative file paths, one per line, without parent traversal.')
    prefix = '/repos/'+owner+'/'+repo
    meta = github_json(prefix)
    ref = str(ref).strip()[:200] or meta['default_branch']
    commit = github_json(prefix+'/commits/'+urllib.parse.quote(ref, safe=''))
    sha = commit['sha']
    evidence = []
    for path in paths:
        data = github_json(prefix+'/contents/'+urllib.parse.quote(path, safe='/')+'?ref='+sha)
        if not isinstance(data, dict) or data.get('encoding') != 'base64' or data.get('size', 0) > 100000:
            raise ValueError('Evidence must be text files smaller than 100 KB.')
        text = base64.b64decode(data['content']).decode('utf-8', errors='strict')
        evidence.append(dict(path=path, url=repo_url.rstrip('/')+'/blob/'+sha+'/'+urllib.parse.quote(path, safe='/'), text=text, commit=sha))
    result = copy.deepcopy(plan)
    previous = result['bullets'][0]['status']
    result['evidence_links'] = [repo_url]
    result['evidence_ref'] = ref
    result['evidence'] = evidence
    bullet = result['bullets'][0]
    bullet['status'], bullet['resume_ready_text'] = 'LOCKED', None
    for row in bullet['rubric']:
        row.update(status='cannot_verify', decided_by='Files retrieved; claim requires human review against the rubric.')
    result['history'].append(dict(action='evidence_checked', previous=previous, status='LOCKED', commit=sha))
    return result


def review(plan, reviews):
    if not plan.get('evidence'):
        raise ValueError('Check GitHub evidence before reviewing claims.')
    if not isinstance(reviews, list) or len(reviews) != len(plan['bullets'][0]['rubric']):
        raise ValueError('Review every rubric row.')
    result = copy.deepcopy(plan)
    bullet = result['bullets'][0]
    previous = bullet['status']
    for row, decision in zip(bullet['rubric'], reviews):
        status = decision.get('status')
        if status not in ('met', 'not_met', 'cannot_verify'):
            raise ValueError('Invalid rubric status')
        reason = str(decision.get('reason', '')).strip()[:2000]
        path = str(decision.get('path', ''))
        quote = str(decision.get('quote', '')).strip()
        if not reason:
            raise ValueError('Explain each rubric decision.')
        reference = ''
        if status == 'met':
            item = next((e for e in result['evidence'] if e['path'] == path), None)
            if not item or not quote or quote not in item['text']:
                raise ValueError('A met claim needs an exact quote from a checked file.')
            line = item['text'][:item['text'].index(quote)].count('\n')+1
            reference = item['url']+'#L'+str(line)
        row.update(status=status, decided_by='Human review: '+reason, evidence_url=reference, quote=quote)
    met = [r for r in bullet['rubric'] if r['status'] == 'met']
    bullet['status'] = 'UNLOCKED' if len(met) == len(bullet['rubric']) else 'PARTIAL' if met else 'LOCKED'
    bullet['resume_ready_text'] = ' '.join(r['verified_text'] for r in met) if met else None
    result['history'].append(dict(action='human_review', previous=previous, status=bullet['status']))
    return result

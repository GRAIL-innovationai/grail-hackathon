"""Opt-in replacements using A/D's frozen backend models, without editing them.

The merge agent can wire these into backend/resume_parser.py, job_matcher.py and
outreach_agent.py. Existing LLM/mock-mode orchestration stays untouched here.
"""

from dataclasses import asdict
from hashlib import sha256
import re

from .outreach import generate_outreach, parse_instructions
from .resume import is_instruction_like, parse_resume_pdf, parse_resume_text
from .skills import compact, mentioned_skills, skill_in_text, tokens


BULLET = re.compile(r"^\s*(?:[-*•▪◦·]|\d+[.)])\s*")
MATCH_STOP = {"experience", "familiarity", "proficiency", "understanding", "strong", "ability", "work", "working", "build", "building", "using", "use", "skills", "required", "plus", "bonus", "related", "field", "or", "our", "you", "your", "we"}
WEIGHT = {"Covered": 1.0, "Mapped": 0.6, "Thin": 0.3, "Gap": 0.0}


def parse_candidate_text(text: str):
    from backend.schemas import Candidate, Line
    profile = parse_resume_text(text)
    lines = [BULLET.sub("", line).strip() for line in profile["raw_text"].splitlines()]
    lines = [line for line in lines if len(line) > 2 and not is_instruction_like(line)]
    return Candidate(id="cand_" + sha256(profile["raw_text"].encode()).hexdigest()[:12],
                     lines=[Line(id=f"R{index}", text=line) for index, line in enumerate(lines, 1)])


def parse_candidate_pdf(data: bytes):
    return parse_candidate_text(parse_resume_pdf(data)["raw_text"])


def profile_from_candidate(candidate) -> dict:
    profile = parse_resume_text("\n".join(compact(line.text) for line in candidate.lines))
    profile["id"] = candidate.id
    return profile


def _job_record(job) -> dict:
    requirements = "\n".join(req.text for req in job.reqs)
    return {"id": job.id, "title": job.title, "company": job.company,
            "description": requirements, "required_skills": mentioned_skills(requirements, explicit=True)}


def match_candidate_jobs(candidate, jobs, target_role: str = ""):
    from backend.schemas import JobMatch, MatchRow
    profile = profile_from_candidate(candidate)
    candidate_lines = [(line.id, line.text, tokens(line.text) - MATCH_STOP) for line in candidate.lines if not is_instruction_like(line.text)]
    results = []
    for job in jobs:
        rows = []
        for req in job.reqs:
            needed_skills = mentioned_skills(req.text, explicit=True)
            want = tokens(req.text) - MATCH_STOP
            hits = []
            for line_id, text, words in candidate_lines:
                overlap = sum(skill_in_text(skill, text) and skill in profile["skills"] for skill in needed_skills) if needed_skills else len(want & words)
                if overlap:
                    hits.append((overlap, line_id))
            hits.sort(key=lambda hit: (-hit[0], hit[1]))
            if needed_skills:
                present = sum(skill in profile["skills"] for skill in needed_skills)
                coverage = present / len(needed_skills)
                if present and re.search(r"\bor\b", req.text, re.I) and not re.search(r"\band\b", req.text, re.I):
                    coverage = 1.0
            else:
                coverage = hits[0][0] / len(want) if hits and want else 0.0
            status = "Covered" if coverage >= 0.75 else "Mapped" if coverage >= 0.4 else "Thin" if coverage > 0 else "Gap"
            rows.append(MatchRow(j=req.id, status=status, r=[line_id for _, line_id in hits[:3]]))
        evidence_score = sum(WEIGHT[row.status] for row in rows) / len(rows) if rows else 0.0
        goal = tokens(target_role)
        goal_fit = len(goal & tokens(job.title)) / len(goal) if goal else 0.0
        score = round(100 * (0.8 * evidence_score + 0.2 * goal_fit)) if goal else round(100 * evidence_score)
        results.append(JobMatch(job_id=job.id, score=score, rows=rows))
    return sorted(results, key=lambda match: (-match.score, match.job_id))


def generate_backend_message(prompt, candidate, job, persona):
    """Same signature as backend.outreach_agent.generate; returns a Message.

The contact's name/role/company are public. Evaluator priorities, pet peeves and
train/test split are deliberately omitted from this backend adapter.
"""
    from backend.schemas import Message
    profile = profile_from_candidate(candidate)
    options, _, explicit = parse_instructions(prompt)
    options = asdict(options)
    options["max_chars"] = min(options["max_chars"] or 299, 299)
    if "include_skills" not in explicit:
        options["include_skills"] = False
    note = generate_outreach(profile, _job_record(job),
                             {"id": persona.id, "name": persona.name, "role": persona.role}, options)
    line_ids = [line.id for line in candidate.lines]
    citations = []
    for claim in note["claims"]:
        number = claim["source"].get("line")
        if isinstance(number, int) and 1 <= number <= len(line_ids) and line_ids[number - 1] not in citations:
            citations.append(line_ids[number - 1])
    return Message(text=note["message"], chars=note["char_count"], job_id=job.id,
                   persona_id=persona.id, citations=citations)

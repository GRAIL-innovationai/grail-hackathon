"""Agent B's published data/load.py boundary; never use evaluation labels to rank."""

import re

from .contracts import record, string_list, text_field
from .errors import CareerCoachError
from .matching import rank_jobs
from .outreach import generate_outreach
from .resume import parse_resume_text
from .skills import canonical_skill, compact


def _skill_name(skill_id: str) -> str:
    from data.lexicons import SKILLS
    forms = SKILLS.get(skill_id, {}).get("resume", [])
    return canonical_skill(forms[0] if forms else skill_id)


def _job(job: dict, companies: dict) -> dict:
    job = record(job, "job")
    company = companies.get(job.get("company_id"), {})
    return {**job, "id": job["job_id"], "company": company.get("name", job.get("institution")),
            "required_skills": [_skill_name(skill) for skill in string_list(job.get("skills", []), "job.skills")]}


def _contact(contact: dict) -> dict:
    contact = record(contact, "contact")
    style = contact.get("communication_preference", "")
    preferences = {}
    if style == "brief":
        preferences = {"tone": "direct", "max_words": 65}
    elif style == "detailed":
        preferences = {"tone": "professional", "max_words": 120}
    elif style == "formal":
        preferences = {"tone": "professional", "max_words": 100}
    return {**contact, "id": contact["contact_id"], "role": contact.get("persona_role", "").replace("_", " "),
            "communication_preferences": preferences}


def adapt_outreach_example(example: dict) -> dict:
    """Accept data.load.build_outreach_example(...), return generator kwargs."""
    example = record(example, "outreach example")
    candidate = parse_resume_text(example.get("resume"), source_name=str(example.get("candidate_id", "candidate")) + ".txt")
    candidate["id"] = text_field(example.get("candidate_id"), "candidate_id", required=True)
    profile = record(example.get("profile"), "profile")
    # Authoritative skill IDs restrict extracted skills; they cannot add unsupported facts.
    skill_records = profile.get("skills", [])
    if not isinstance(skill_records, list):
        raise CareerCoachError("invalid_input", "Agent B profile.skills must be an array of skill records.")
    allowed = [_skill_name(text_field(record(skill, "profile.skill").get("id"), "profile.skill.id", required=True)) for skill in skill_records]
    candidate["skill_allowlist"] = allowed
    company = record(example.get("company"), "company")
    return {"candidate": candidate,
            "job": _job(example.get("job"), {company.get("company_id"): company}),
            "contact": _contact(example.get("contact")),
            "target_role": text_field(example.get("blurb", ""), "blurb", max_length=1000)}


def generate_agent_b_outreach(example: dict, instructions=None) -> dict:
    return generate_outreach(**adapt_outreach_example(example), instructions=instructions)


def rank_agent_b_jobs(candidate_record: dict, jobs: list[dict], companies: list[dict], *, limit: int = 5) -> list[dict]:
    """Filter documented degree and explicit goal constraints, then rank overlap.

    Requires B's candidate row (resume/blurb/profile), not match_labels.jsonl.
    Reference relevance annotations remain available for independent evaluation.
    """
    from data.lexicons import DEGREE_RANK, FIELDS
    candidate_record = record(candidate_record, "candidate record")
    profile = record(candidate_record.get("profile"), "profile")
    degree = record(profile.get("degree", {}), "profile.degree").get("level")
    blurb = text_field(candidate_record.get("blurb", ""), "blurb", max_length=1000)
    candidate = parse_resume_text(candidate_record.get("resume"))
    candidate["skill_allowlist"] = [_skill_name(skill["id"]) for skill in profile.get("skills", [])]
    company_index = {company["company_id"]: company for company in companies}
    prepared = [_job(job, company_index) for job in jobs]
    matches = rank_jobs(candidate, prepared, blurb, limit=100)
    location = re.search(r"(?:need to stay|must stay|need to be) in ([^.]+)", blurb, re.I)
    no_industry = bool(re.search(r"(?:will not apply to|not interested in) industry", blurb, re.I))
    refused = {field for field, label in FIELDS.items() if re.search(r"not interested in " + re.escape(label) + r" positions", blurb, re.I)}
    eligible = []
    for match in matches:
        job = match["job"]
        required_degree = "phd" if job.get("requires_phd") else job.get("min_degree")
        reasons = []
        if required_degree in DEGREE_RANK and degree in DEGREE_RANK and DEGREE_RANK[degree] < DEGREE_RANK[required_degree]:
            reasons.append("Documented degree is below the posting's minimum.")
        if location and compact(job.get("location", "")).casefold() != compact(location.group(1)).casefold():
            reasons.append("Posting does not match the candidate's explicit location constraint.")
        if no_industry and job.get("role_type") == "industry_research":
            reasons.append("Candidate explicitly declined industry roles.")
        if job.get("field") in refused:
            reasons.append("Candidate explicitly declined this field.")
        if reasons:
            continue
        match["eligibility"] = "no_conflict_with_documented_degree_and_recognized_goal_constraints"
        eligible.append(match)
    if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 100:
        raise CareerCoachError("invalid_input", "limit must be an integer from 1 to 100.")
    return eligible[:limit]

"""Normalize the small JSON boundary shared with agents A, B, and D."""

from collections.abc import Mapping

from .errors import CareerCoachError
from .resume import is_instruction_like, make_fact, parse_resume_text
from .skills import canonical_skill, compact


def record(value, label: str) -> dict:
    if not isinstance(value, Mapping):
        raise CareerCoachError("invalid_input", f"{label} must be a JSON object.")
    return dict(value)


def text_field(value, label: str, *, required: bool = False, max_length: int = 500) -> str:
    if value is None and not required:
        return ""
    if not isinstance(value, str):
        raise CareerCoachError("invalid_input", f"{label} must be a string.")
    value = compact(value)
    if (required and not value) or len(value) > max_length:
        raise CareerCoachError("invalid_input", f"{label} must contain {'1' if required else '0'} to {max_length} characters.")
    return value


def string_list(value, label: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, (list, tuple)):
        raise CareerCoachError("invalid_input", f"{label} must be an array of strings.")
    result = []
    for item in value:
        item = text_field(item, label, required=True, max_length=100)
        if item.casefold() not in {entry.casefold() for entry in result}:
            result.append(item)
    return result


def company_name(value) -> str:
    if isinstance(value, Mapping):
        value = value.get("name")
    return text_field(value, "company", required=True, max_length=200)


def normalize_job(job) -> dict:
    job = record(job, "job")
    title = text_field(job.get("title"), "job.title", required=True, max_length=200)
    company = company_name(job.get("company", job.get("company_name")))
    required = string_list(job.get("required_skills", job.get("skills", [])), "job.required_skills")
    preferred = string_list(job.get("preferred_skills", []), "job.preferred_skills")
    normalized = dict(job)
    normalized.update({
        "id": text_field(job.get("id", job.get("job_id", f"{company}:{title}")), "job.id", required=True),
        "title": title, "company": company,
        "description": text_field(job.get("description", ""), "job.description", max_length=20_000),
        "required_skills": list(dict.fromkeys(canonical_skill(skill) for skill in required)),
        "preferred_skills": list(dict.fromkeys(canonical_skill(skill) for skill in preferred)),
        "seniority": text_field(job.get("seniority", job.get("level", "")), "job.seniority"),
        "location": text_field(job.get("location", ""), "job.location"),
        "contact_ids": string_list(job.get("contact_ids", []), "job.contact_ids"),
    })
    if job.get("contact_id"):
        contact_id = text_field(job["contact_id"], "job.contact_id", required=True)
        if contact_id not in normalized["contact_ids"]:
            normalized["contact_ids"].append(contact_id)
    return normalized


def normalize_contact(contact) -> dict:
    contact = record(contact, "contact")
    preferences = record(contact.get("communication_preferences", contact.get("preferences", {})), "contact.communication_preferences")
    if "tone" in preferences and (not isinstance(preferences["tone"], str) or preferences["tone"] not in {"professional", "warm", "direct"}):
        raise CareerCoachError("invalid_input", "contact.communication_preferences.tone must be professional, warm, or direct.")
    if "prefers_metrics" in preferences and not isinstance(preferences["prefers_metrics"], bool):
        raise CareerCoachError("invalid_input", "contact.communication_preferences.prefers_metrics must be a boolean.")
    if "max_words" in preferences:
        budget = preferences["max_words"]
        if not isinstance(budget, int) or isinstance(budget, bool) or not 30 <= budget <= 250:
            raise CareerCoachError("invalid_input", "contact.communication_preferences.max_words must be an integer from 30 to 250.")
    # A missing name is allowed: the greeting simply becomes 'Hi,'.
    name = text_field(contact.get("name", contact.get("first_name", "")), "contact.name", max_length=100)
    role = text_field(contact.get("role", contact.get("title", contact.get("type", ""))), "contact.role", max_length=200)
    priorities = string_list(contact.get("priorities", []), "contact.priorities")
    normalized = {**contact, "name": name, "role": role, "priorities": priorities,
                  "communication_preferences": preferences,
                  "job_ids": string_list(contact.get("job_ids", []), "contact.job_ids")}
    for field in ("id", "contact_id", "job_id"):
        if field in contact:
            normalized[field] = text_field(contact[field], f"contact.{field}", required=True)
    return normalized


def _profile_entries(value, kind: str) -> list[tuple[str, str]]:
    if value is None:
        return []
    if not isinstance(value, (list, tuple)):
        raise CareerCoachError("invalid_input", f"candidate.{kind} must be an array.")
    results = []
    fields = {
        "education": ("degree", "field", "institution", "school", "graduation_year"),
        "experience": ("title", "role", "company", "organization"),
        "projects": ("name", "title"),
    }[kind]
    for index, item in enumerate(value):
        path = f"/{kind}/{index}"
        if isinstance(item, str):
            results.append((text_field(item, f"candidate.{kind}", required=True, max_length=3000), path))
            continue
        item = record(item, f"candidate.{kind}[{index}]")
        if item.get("text"):
            results.append((text_field(item["text"], "entry.text", required=True, max_length=3000), path + "/text"))
        else:
            parts = []
            for field in fields:
                if item.get(field) is not None:
                    value = item[field]
                    if field == "graduation_year" and isinstance(value, int) and not isinstance(value, bool):
                        value = str(value)
                    parts.append(text_field(value, f"entry.{field}", max_length=300))
            if parts:
                results.append((" | ".join(parts), path))
            if item.get("description"):
                results.append((text_field(item["description"], "entry.description", required=True, max_length=3000), path + "/description"))
            bullets = item.get("bullets", item.get("highlights", []))
            if not isinstance(bullets, (list, tuple)):
                raise CareerCoachError("invalid_input", "entry.bullets must be an array of strings.")
            for bullet_index, bullet in enumerate(bullets):
                results.append((text_field(bullet, "entry.bullets", required=True, max_length=3000), path + f"/bullets/{bullet_index}"))
    return results


def normalize_candidate(candidate) -> dict:
    candidate = record(candidate, "candidate")
    if "raw_text" in candidate:
        # Rebuild evidence rather than trusting editable extracted fields/fact IDs.
        profile = parse_resume_text(candidate["raw_text"], source_name=candidate.get("source_name", "resume.txt"))
        # Retain verified page information only when it agrees with the rebuilt spans.
        old_fact_list = candidate.get("facts", [])
        if not isinstance(old_fact_list, (list, tuple)):
            raise CareerCoachError("invalid_input", "candidate.facts must be an array.")
        old_facts = {fact.get("id"): fact for fact in old_fact_list if isinstance(fact, Mapping) and isinstance(fact.get("id"), str)}
        for fact in profile["facts"]:
            old_source = old_facts.get(fact["id"], {}).get("source", {})
            if isinstance(old_source, Mapping) and all(old_source.get(key) == fact["source"][key] for key in ("start", "end")):
                page = old_source.get("page")
                if isinstance(page, int) and not isinstance(page, bool) and page > 0:
                    fact["source"]["page"] = page
        supplied = string_list(candidate.get("skills", []), "candidate.skills")
        extras = [skill for skill in supplied if canonical_skill(skill).casefold() not in {item.casefold() for item in profile["skills"]}]
        if extras:
            profile["warnings"].append(f"Ignored skills absent from extracted resume evidence: {', '.join(extras)}.")
        candidate_warnings = candidate.get("warnings", [])
        if not isinstance(candidate_warnings, (list, tuple)):
            raise CareerCoachError("invalid_input", "candidate.warnings must be an array.")
        for warning in candidate_warnings:
            if isinstance(warning, str) and warning not in profile["warnings"]:
                profile["warnings"].append(warning)
    else:
        profile = {"schema_version": "1.0", "name": None, "skills": [], "skill_evidence": {},
                   "education": [], "experience": [], "projects": [], "facts": [], "warnings": []}
        name = text_field(candidate.get("name"), "candidate.name", max_length=100)
        if name and not is_instruction_like(name):
            profile["name"] = name
            profile["facts"].append(make_fact("name", name, {"type": "profile", "path": "/name"}))
        for index, skill in enumerate(string_list(candidate.get("skills", []), "candidate.skills")):
            if is_instruction_like(skill):
                profile["warnings"].append("Excluded an instruction-like profile skill.")
                continue
            canonical = canonical_skill(skill)
            if canonical in profile["skills"]:
                continue
            fact = make_fact("skill", skill, {"type": "profile", "path": f"/skills/{index}"})
            profile["skills"].append(canonical)
            profile["skill_evidence"][canonical] = fact["id"]
            profile["facts"].append(fact)
        for kind in ("education", "experience", "projects"):
            for text, path in _profile_entries(candidate.get(kind), kind):
                if is_instruction_like(text):
                    profile["warnings"].append(f"Excluded an instruction-like {kind} entry.")
                    continue
                fact = make_fact(kind, text, {"type": "profile", "path": path})
                profile[kind].append({"text": text, "evidence_id": fact["id"]})
                profile["facts"].append(fact)
        profile["warnings"].append("Structured profile fields are supplied candidate facts; they have not been independently verified against a resume.")
    if candidate.get("id") is not None:
        profile["id"] = text_field(candidate["id"], "candidate.id", required=True)
    if candidate.get("target_role") is not None:
        profile["target_role"] = text_field(candidate["target_role"], "candidate.target_role", max_length=1000)
    if "skill_allowlist" in candidate:
        allowed = {canonical_skill(skill).casefold() for skill in string_list(candidate["skill_allowlist"], "candidate.skill_allowlist")}
        profile["skill_allowlist"] = sorted(allowed)
        profile["skills"] = [skill for skill in profile["skills"] if skill.casefold() in allowed]
        profile["skill_evidence"] = {skill: fact_id for skill, fact_id in profile["skill_evidence"].items() if skill.casefold() in allowed}
    return profile

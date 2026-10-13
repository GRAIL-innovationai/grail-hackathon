"""Deterministic, transparent relevance scores (not hiring probabilities)."""

from .contracts import normalize_candidate, normalize_job, text_field
from .errors import CareerCoachError
from .skills import skill_key, tokens


def rank_jobs(candidate: dict, jobs: list[dict], target_role: str = "", *, limit: int = 5) -> list[dict]:
    if not isinstance(jobs, (list, tuple)):
        raise CareerCoachError("invalid_input", "jobs must be an array of job objects.")
    if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 100:
        raise CareerCoachError("invalid_input", "limit must be an integer from 1 to 100.")
    candidate = normalize_candidate(candidate)
    target_role = text_field(target_role, "target_role", max_length=1000) or candidate.get("target_role", "")
    goal_tokens = tokens(target_role)
    skills = {skill_key(skill) for skill in candidate["skills"]}
    results = []
    seen_ids = set()
    for raw_job in jobs:
        job = normalize_job(raw_job)
        if job["id"] in seen_ids:
            raise CareerCoachError("invalid_input", f"Duplicate job ID: {job['id']}.")
        seen_ids.add(job["id"])
        matched = [skill for skill in job["required_skills"] if skill_key(skill) in skills]
        missing = [skill for skill in job["required_skills"] if skill_key(skill) not in skills]
        preferred = [skill for skill in job["preferred_skills"] if skill_key(skill) in skills]
        components, weighted, total_weight = {}, 0.0, 0.0
        if job["required_skills"]:
            coverage = len(matched) / len(job["required_skills"])
            components["required_skill_coverage"] = round(coverage, 4)
            weighted += 60 * coverage
            total_weight += 60
        if job["preferred_skills"]:
            coverage = len(preferred) / len(job["preferred_skills"])
            components["preferred_skill_coverage"] = round(coverage, 4)
            weighted += 10 * coverage
            total_weight += 10
        title_tokens = tokens(job["title"])
        common_goal = sorted(goal_tokens & title_tokens)
        if goal_tokens:
            # Include description lightly; title overlap is the primary goal signal.
            title_fit = len(goal_tokens & title_tokens) / len(goal_tokens)
            description_fit = len(goal_tokens & tokens(job["description"])) / len(goal_tokens)
            goal_fit = min(1.0, title_fit + 0.15 * description_fit)
            components["goal_alignment"] = round(goal_fit, 4)
            weighted += 30 * goal_fit
            total_weight += 30
        score = 100 * weighted / total_weight if total_weight else 0.0
        reasons, cautions = [], []
        if matched:
            reasons.append("Documented required skills: " + ", ".join(matched) + ".")
        if preferred:
            reasons.append("Documented preferred skills: " + ", ".join(preferred) + ".")
        if common_goal:
            reasons.append("Job title overlaps the stated goal: " + ", ".join(common_goal) + ".")
        if missing:
            cautions.append("No resume/profile evidence for required skills: " + ", ".join(missing) + ".")
        if not job["required_skills"]:
            cautions.append("Posting supplies no required skills; skill coverage is unknown.")
        if tokens(job["seniority"] + " " + job["title"]) & {"senior", "staff", "principal", "director", "lead", "executive"}:
            penalty = min(15.0, score)
            score -= penalty
            components["seniority_penalty"] = round(penalty, 4)
            cautions.append("This role appears senior; tenure and qualification eligibility are not established by this matcher.")
        if not reasons:
            cautions.append("No positive overlap with the supplied skills or target role was found.")
        results.append({
            "job": job, "job_id": job["id"], "score": round(score, 2),
            "score_kind": "heuristic_relevance_not_probability",
            "matched_skills": matched, "missing_skills": missing,
            "matched_preferred_skills": preferred, "components": components,
            "reasons": reasons, "warnings": cautions,
        })
    results.sort(key=lambda match: (-match["score"], match["job_id"]))
    return results[:limit]

"""Export data/synthetic into app-facing jobs.json, personas.json, resumes.json."""

from __future__ import annotations

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent

ROLE_TO_APP = {
    "executive": "CEO",
    "recruiter": "Recruiter",
    "engineer": "Engineer",
    "hiring_manager": "Engineer",
}

PET_PEEVES = {
    "CEO": [
        "generic flattery",
        "asking 'are you hiring?'",
        "long messages with no point",
    ],
    "Recruiter": [
        "copy-pasted templates",
        "missing location or work authorization",
        "buzzwords without examples",
    ],
    "Engineer": [
        "vague 'passion for AI'",
        "no specific project or metric",
        "third-party recruiter intros with no technical detail",
    ],
}

DEGREE_LINE = {
    "phd": "Doctoral degree required",
    "ms": "Master's degree or higher required",
    "bs": "Bachelor's degree or higher required",
}


def _company_names(companies: list[dict]) -> dict[str, str]:
    return {c["company_id"]: c["name"] for c in companies}


def export_jobs(jobs: list[dict], companies: list[dict]) -> list[dict]:
    names = _company_names(companies)
    out = []
    for job in jobs:
        phrases = list(job.get("skill_phrases", {}).values())
        reqs = [{"id": f"J{i}", "text": text} for i, text in enumerate(phrases, start=1)]
        degree = DEGREE_LINE.get(job.get("min_degree", "bs"), DEGREE_LINE["bs"])
        reqs.append({"id": f"J{len(reqs) + 1}", "text": degree})
        out.append(
            {
                "id": job["job_id"],
                "company": names.get(job["company_id"], job.get("institution", "")),
                "title": job["title"],
                "reqs": reqs,
                "contact_persona_id": job["contact_id"],
                "description": job.get("description", ""),
            }
        )
    return out


def export_personas(contacts: list[dict], companies: list[dict]) -> list[dict]:
    names = _company_names(companies)
    by_role: dict[str, list[dict]] = {"CEO": [], "Recruiter": [], "Engineer": []}
    for contact in contacts:
        app_role = ROLE_TO_APP[contact["persona_role"]]
        by_role[app_role].append(contact)

    test_ids: set[str] = set()
    for role, group in by_role.items():
        if group:
            test_ids.add(sorted(group, key=lambda c: c["contact_id"])[0]["contact_id"])

    out = []
    for contact in sorted(contacts, key=lambda c: c["contact_id"]):
        app_role = ROLE_TO_APP[contact["persona_role"]]
        peeves = list(PET_PEEVES[app_role])
        if contact["communication_preference"] == "brief":
            peeves.append("overly long cover letters")
        elif contact["communication_preference"] == "formal":
            peeves.append("casual slang or emoji")
        out.append(
            {
                "id": contact["contact_id"],
                "role": app_role,
                "name": contact["name"],
                "company": names.get(contact["company_id"], ""),
                "priorities": list(contact["priorities"]),
                "pet_peeves": peeves[:4],
                "split": "test" if contact["contact_id"] in test_ids else "train",
            }
        )
    return out


def export_resumes(candidates: list[dict]) -> list[dict]:
    out = []
    for candidate in candidates:
        lines = [
            {"id": f"R{i}", "text": line}
            for i, line in enumerate(candidate["resume"].splitlines(), start=1)
            if line.strip()
        ]
        out.append({"id": candidate["candidate_id"], "lines": lines})
    return out


def write_app_files(
    companies: list[dict],
    contacts: list[dict],
    jobs: list[dict],
    candidates: list[dict],
    *,
    data_dir: Path = DATA_DIR,
) -> None:
    """Write backend/frontend fixture JSON at data/jobs.json, personas.json, resumes.json."""
    payload = {
        "jobs.json": export_jobs(jobs, companies),
        "personas.json": export_personas(contacts, companies),
        "resumes.json": export_resumes(candidates),
    }
    for name, rows in payload.items():
        path = data_dir / name
        path.write_text(json.dumps(rows, indent=2) + "\n")

"""Seeded synthetic job catalog and candidate generator."""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from data.export_app import write_app_files
from data.lexicons import (
    CITIES,
    COMPANIES,
    CONTACT_FIRST_NAMES,
    CONTACT_LAST_NAMES,
    CONTACT_ROLES,
    DEGREE_LABEL,
    DEGREE_RANK,
    FIELDS,
    FIRST_NAMES,
    INSTITUTIONS,
    LAST_NAMES,
    ROLE_TYPES,
    SKILLS,
)

DEFAULT_SEED = 42
NUM_JOBS = 100
NUM_CANDIDATES = 9
JOBS_PER_CANDIDATE = 2
SPLIT = {"train": 3, "val": 3, "test": 3}


def _pick(rng: random.Random, items: list, k: int) -> list:
    return rng.sample(items, k=min(k, len(items)))


def _job_title(role: str, field: str) -> str:
    field_name = FIELDS[field]
    mapping = {
        "postdoc": f"Postdoctoral Fellow in {field_name}",
        "assistant_professor": f"Assistant Professor of {field_name}",
        "lecturer": f"Lecturer in {field_name}",
        "research_scientist": f"Research Scientist — {field_name}",
        "industry_research": f"Research Scientist, {field_name.title()}",
    }
    return mapping[role]


def resume_phrase(skill_id: str) -> str:
    """Wording that appears on resumes, distinct from the job posting's wording."""
    return SKILLS[skill_id]["resume"][0]


def job_phrase(skill_id: str) -> str:
    """Wording that appears on job postings, distinct from the resume wording."""
    return SKILLS[skill_id]["job"][-1]


def _render_job_description(
    rng: random.Random,
    role: str,
    field: str,
    skills: list[str],
    min_degree: str,
    location: str,
    institution: str,
) -> str:
    del rng
    skill_phrases = [job_phrase(sid) for sid in skills]
    degree_line = "PhD required." if min_degree == "phd" else "Master's degree or higher required."
    industry = role == "industry_research"
    org = institution if not industry else "a leading technology company"
    lines = [
        f"{org} seeks a colleague for a {role.replace('_', ' ')} role in {FIELDS[field]}.",
        f"Location: {location}.",
        degree_line,
        "We value experience with: " + "; ".join(skill_phrases) + ".",
    ]
    if role == "assistant_professor":
        lines.append("Teaching and mentoring are part of the position.")
    if industry:
        lines.append("This is an industry research role with product impact.")
    return " ".join(lines)


def generate_companies() -> list[dict]:
    focuses = list(FIELDS.keys())
    companies = []
    for i, (name, kind) in enumerate(COMPANIES):
        companies.append(
            {
                "company_id": f"co{i:02d}",
                "name": name,
                "kind": kind,
                "location": CITIES[i % len(CITIES)],
                "focus": focuses[i % len(focuses)],
            }
        )
    return companies


def _outcome_weights(response_likelihood: float) -> dict[str, float]:
    """Simulated reply mix. Nonresponse is not treated as a bad message by itself."""
    nonresponse = int(round((1 - response_likelihood) * 100))
    remaining = 100 - nonresponse
    passive = int(round(remaining * 0.45))
    conversation = int(round(remaining * 0.35))
    strong = remaining - passive - conversation
    return {
        "nonresponse": nonresponse / 100,
        "passive_acceptance": passive / 100,
        "conversation": conversation / 100,
        "strong_interest": strong / 100,
    }


def generate_contacts(rng: random.Random, companies: list[dict]) -> list[dict]:
    """Two hiring personas per company, differing by role, priorities, and reply rate."""
    priorities = {
        "recruiter": ["clear skills", "location fit", "concise background"],
        "engineer": ["technical depth", "specific methods", "research taste"],
        "hiring_manager": ["team fit", "delivery", "mentoring"],
        "executive": ["field vision", "seniority", "institutional fit"],
    }
    styles = {
        "recruiter": "brief",
        "engineer": "detailed",
        "hiring_manager": "formal",
        "executive": "brief",
    }
    base_rate = {"recruiter": 0.62, "engineer": 0.38, "hiring_manager": 0.48, "executive": 0.22}
    contacts = []
    for company_index, company in enumerate(companies):
        for slot in range(2):
            role = CONTACT_ROLES[(company_index + slot) % len(CONTACT_ROLES)]
            rate = min(0.9, max(0.08, base_rate[role] + (slot - 0.5) * 0.08))
            index = company_index * 2 + slot
            contacts.append(
                {
                    "contact_id": f"p{index:02d}",
                    "name": f"{CONTACT_FIRST_NAMES[index]} {CONTACT_LAST_NAMES[index]}",
                    "company_id": company["company_id"],
                    "persona_role": role,
                    "seniority": "executive" if role == "executive" else ("senior" if slot == 0 else "mid"),
                    "priorities": priorities[role],
                    "communication_preference": styles[role],
                    "response_likelihood": round(rate, 2),
                    "outcome_weights": _outcome_weights(rate),
                    "job_ids": [],
                }
            )
    rng.shuffle(contacts)
    contacts.sort(key=lambda row: row["contact_id"])
    return contacts


def generate_jobs(rng: random.Random, companies: list[dict], contacts: list[dict], n: int = NUM_JOBS) -> list[dict]:
    jobs = []
    skill_ids = list(SKILLS.keys())
    fields = list(FIELDS.keys())
    academic = [company for company in companies if company["kind"] != "industry"]
    industry = [company for company in companies if company["kind"] == "industry"]
    by_company: dict[str, list[dict]] = {}
    for contact in contacts:
        by_company.setdefault(contact["company_id"], []).append(contact)
    for i in range(n):
        role = ROLE_TYPES[i % len(ROLE_TYPES)]
        field = fields[(i * 3 + len(role)) % len(fields)]
        company = industry[i % len(industry)] if role == "industry_research" else academic[i % len(academic)]
        pool = by_company[company["company_id"]]
        contact = pool[i % len(pool)]
        n_skills = 3 + (i % 3)
        skills = _pick(rng, skill_ids, n_skills)
        requires_phd = role in ("assistant_professor", "postdoc", "research_scientist") or (i % 7 == 0)
        min_degree = "phd" if requires_phd else ("ms" if i % 4 else "bs")
        job_id = f"j{i:03d}"
        title = _job_title(role, field)
        description = _render_job_description(
            rng, role, field, skills, min_degree, company["location"], company["name"]
        )
        jobs.append(
            {
                "job_id": job_id,
                "title": title,
                "role_type": role,
                "field": field,
                "location": company["location"],
                "company_id": company["company_id"],
                "contact_id": contact["contact_id"],
                "skills": skills,
                "min_degree": min_degree,
                "requires_phd": requires_phd,
                "institution": company["name"],
                "description": description,
                "skill_phrases": {sid: job_phrase(sid) for sid in skills},
            }
        )
        contact["job_ids"].append(job_id)
    for contact in contacts:
        contact["job_ids"].sort()
    return jobs


def build_profile(rng: random.Random, name: str, degree: str, skill_ids: list[str]) -> dict:
    """Facts the person actually has. Resume text and tailored resumes may only use these."""
    skills = []
    for sid in skill_ids:
        phrases = list(dict.fromkeys(SKILLS[sid]["resume"] + SKILLS[sid]["job"]))
        skills.append({"id": sid, "truthful_phrases": phrases})
    return {
        "name": name,
        "degree": {
            "level": degree,
            "label": DEGREE_LABEL[degree],
            "field": "Computer Science",
        },
        "institution": rng.choice(INSTITUTIONS),
        "skills": skills,
    }


def render_resume(profile: dict) -> str:
    degree = profile["degree"]
    lines = [
        profile["name"],
        f"{degree['label']} in {degree['field']}, {profile['institution']}",
        "Research focus: " + ", ".join(resume_phrase(skill["id"]) for skill in profile["skills"][:3]),
    ]
    for skill in profile["skills"]:
        lines.append(f"• Experience with {resume_phrase(skill['id'])}")
    return "\n".join(lines)


def generate_candidates(rng: random.Random, n: int = NUM_CANDIDATES) -> list[dict]:
    skill_ids = list(SKILLS.keys())
    fields = list(FIELDS.keys())
    candidates = []
    for i in range(n):
        first = FIRST_NAMES[i]
        last = LAST_NAMES[i]
        name = f"{first} {last}"
        degree = ["bs", "ms", "phd"][i % 3]
        seniority = "early" if i < 5 else "mid"
        track = ["faculty", "industry", "either"][i % 3]
        location_pref = CITIES[i % len(CITIES)] if i % 2 == 0 else None
        refused_fields = [fields[(i + 1) % len(fields)]] if i % 3 == 1 else []
        no_industry = i % 4 == 2
        n_skills = 4 + (i % 4)
        skills = _pick(rng, skill_ids, n_skills)
        profile = build_profile(rng, name, degree, skills)
        resume = render_resume(profile)
        blurb_parts = []
        if track == "faculty":
            blurb_parts.append("I am targeting tenure-track faculty roles.")
        elif track == "industry":
            blurb_parts.append("I prefer industry research positions.")
        if location_pref:
            blurb_parts.append(f"I need to stay in {location_pref}.")
        if no_industry:
            blurb_parts.append("I will not apply to industry roles.")
        if refused_fields:
            blurb_parts.append(
                f"I am not interested in {FIELDS[refused_fields[0]]} positions."
            )
        blurb = " ".join(blurb_parts) if blurb_parts else "Open to strong academic matches."
        candidates.append(
            {
                "candidate_id": f"c{i:02d}",
                "name": name,
                "degree": degree,
                "seniority": seniority,
                "track": track,
                "location_pref": location_pref,
                "refused_fields": refused_fields,
                "no_industry": no_industry,
                "skills": skills,
                "profile": profile,
                "resume": resume,
                "blurb": blurb,
            }
        )
    return candidates


def _skill_overlap(candidate_skills: set[str], job_skills: set[str]) -> float:
    if not job_skills:
        return 0.0
    return len(candidate_skills & job_skills) / len(job_skills)


def label_candidate_jobs(candidate: dict, jobs: list[dict]) -> dict:
    c_skills = set(candidate["skills"])
    c_deg = DEGREE_RANK[candidate["degree"]]
    labels = []
    for job in jobs:
        hard_reject = False
        if candidate["no_industry"] and job["role_type"] == "industry_research":
            hard_reject = True
        if candidate["location_pref"] and job["location"] != candidate["location_pref"]:
            hard_reject = True
        if job["field"] in candidate["refused_fields"]:
            hard_reject = True
        if candidate["track"] == "faculty" and job["role_type"] == "industry_research":
            hard_reject = True
        if candidate["track"] == "industry" and job["role_type"] in (
            "assistant_professor",
            "lecturer",
        ):
            hard_reject = True

        overlap = _skill_overlap(c_skills, set(job["skills"]))
        deg_ok = c_deg >= DEGREE_RANK[job["min_degree"]]
        seniority_bonus = 0.05 if candidate["seniority"] == "mid" and job["role_type"] == "assistant_professor" else 0.0
        loc_bonus = 0.1 if candidate["location_pref"] and job["location"] == candidate["location_pref"] else 0.0
        field_bonus = 0.05 if job["field"] in ("ml", "compbio") else 0.0

        relevance = overlap * 0.7 + (0.15 if deg_ok else 0.0) + seniority_bonus + loc_bonus + field_bonus
        if not deg_ok:
            relevance *= 0.3
        if hard_reject:
            relevance = 0.0

        evidence = []
        for line in candidate["resume"].splitlines():
            for sid in set(job["skills"]) & c_skills:
                if any(phrase.lower() in line.lower() for phrase in SKILLS[sid]["resume"] + [sid]):
                    evidence.append(line)
                    break
        evidence = list(dict.fromkeys(evidence))[:3]

        forbidden = []
        if job["requires_phd"] and c_deg < DEGREE_RANK["phd"]:
            forbidden.append("PhD")
            forbidden.append("doctoral degree")
        if job["min_degree"] == "ms" and c_deg < DEGREE_RANK["ms"]:
            forbidden.append("Master's degree")

        labels.append(
            {
                "job_id": job["job_id"],
                "relevance": round(relevance, 4),
                "hard_reject": hard_reject,
                "evidence_spans": evidence,
                "forbidden_claims": forbidden,
            }
        )
    return {"candidate_id": candidate["candidate_id"], "jobs": labels}


def _forbidden_degree_claims(degree: str) -> list[str]:
    claims = []
    if DEGREE_RANK[degree] < DEGREE_RANK["phd"]:
        claims.extend(["PhD", "Ph.D", "doctoral degree", "doctorate"])
    if DEGREE_RANK[degree] < DEGREE_RANK["ms"]:
        claims.extend(["Master's", "M.S.", "MSc"])
    return claims


def _forbidden_skill_phrases(owned: set[str]) -> list[str]:
    phrases = []
    for sid, forms in SKILLS.items():
        if sid in owned:
            continue
        phrases.extend(forms["resume"])
        phrases.extend(forms["job"])
    return list(dict.fromkeys(phrases))


def select_tailor_tasks(candidate: dict, jobs: list[dict], label_row: dict) -> list[dict]:
    """Two non-rejected jobs with real skill overlap, best relevance first."""
    by_id = {job["job_id"]: job for job in jobs}
    owned = set(candidate["skills"])
    ranked = sorted(label_row["jobs"], key=lambda row: (-row["relevance"], row["job_id"]))
    tasks = []
    for row in ranked:
        if row["hard_reject"] or row["relevance"] <= 0:
            continue
        job = by_id[row["job_id"]]
        overlap = [sid for sid in job["skills"] if sid in owned]
        if not overlap:
            continue
        keywords = [job["skill_phrases"][sid] for sid in overlap]
        tasks.append(
            {
                "task_id": f"{candidate['candidate_id']}-{job['job_id']}",
                "candidate_id": candidate["candidate_id"],
                "resume": candidate["resume"],
                "blurb": candidate["blurb"],
                "name": candidate["name"],
                "profile": candidate["profile"],
                "job": {
                    "job_id": job["job_id"],
                    "title": job["title"],
                    "description": job["description"],
                    "company_id": job["company_id"],
                    "contact_id": job["contact_id"],
                },
                "target_keywords": keywords,
                "forbidden_claims": _forbidden_degree_claims(candidate["degree"]),
                "forbidden_skill_phrases": _forbidden_skill_phrases(owned),
            }
        )
        if len(tasks) == JOBS_PER_CANDIDATE:
            break
    return tasks


def build_splits(candidate_ids: list[str]) -> dict:
    assert len(candidate_ids) == 9
    return {
        "train": candidate_ids[0:3],
        "val": candidate_ids[3:6],
        "test": candidate_ids[6:9],
    }


def generate_dataset(
    seed: int = DEFAULT_SEED,
) -> tuple[list[dict], list[dict], list[dict], list[dict], list[dict], list[dict], dict]:
    rng = random.Random(seed)
    companies = generate_companies()
    contacts = generate_contacts(rng, companies)
    jobs = generate_jobs(rng, companies, contacts, NUM_JOBS)
    candidates = generate_candidates(rng, NUM_CANDIDATES)
    match_labels = [label_candidate_jobs(c, jobs) for c in candidates]
    by_candidate = {row["candidate_id"]: row for row in match_labels}
    tasks = []
    for candidate in candidates:
        tasks.extend(select_tailor_tasks(candidate, jobs, by_candidate[candidate["candidate_id"]]))
    splits = build_splits([c["candidate_id"] for c in candidates])
    return companies, contacts, jobs, candidates, match_labels, tasks, splits


def write_dataset(out_dir: Path, seed: int = DEFAULT_SEED) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    companies, contacts, jobs, candidates, match_labels, tasks, splits = generate_dataset(seed)
    with (out_dir / "companies.json").open("w") as f:
        json.dump(companies, f, indent=2)
    with (out_dir / "contacts.json").open("w") as f:
        json.dump(contacts, f, indent=2)
    with (out_dir / "jobs.json").open("w") as f:
        json.dump(jobs, f, indent=2)
    with (out_dir / "match_labels.jsonl").open("w") as f:
        for row in match_labels:
            f.write(json.dumps(row) + "\n")
    with (out_dir / "inputs.jsonl").open("w") as f:
        for c in candidates:
            row = {
                "candidate_id": c["candidate_id"],
                "resume": c["resume"],
                "blurb": c["blurb"],
                "profile": c["profile"],
            }
            f.write(json.dumps(row) + "\n")
    with (out_dir / "profiles.jsonl").open("w") as f:
        for c in candidates:
            f.write(json.dumps({"candidate_id": c["candidate_id"], "profile": c["profile"]}) + "\n")
    split_of = {cid: name for name, ids in splits.items() for cid in ids}
    with (out_dir / "tasks.jsonl").open("w") as f:
        for task in tasks:
            row = {
                "task_id": task["task_id"],
                "split": split_of[task["candidate_id"]],
                "candidate_id": task["candidate_id"],
                "resume": task["resume"],
                "blurb": task["blurb"],
                "profile": task["profile"],
                "job": task["job"],
            }
            if row["split"] == "train":
                row["target_keywords"] = task["target_keywords"]
            f.write(json.dumps(row) + "\n")
    with (out_dir / "labels.jsonl").open("w") as f:
        for task in tasks:
            f.write(
                json.dumps(
                    {
                        "task_id": task["task_id"],
                        "candidate_id": task["candidate_id"],
                        "name": task["name"],
                        "profile": task["profile"],
                        "target_keywords": task["target_keywords"],
                        "forbidden_claims": task["forbidden_claims"],
                        "forbidden_skill_phrases": task["forbidden_skill_phrases"],
                    }
                )
                + "\n"
            )
    meta = {
        "seed": seed,
        "num_companies": len(companies),
        "num_contacts": len(contacts),
        "num_jobs": len(jobs),
        "num_candidates": len(candidates),
        "jobs_per_candidate": JOBS_PER_CANDIDATE,
        **SPLIT,
    }
    with (out_dir / "splits.json").open("w") as f:
        json.dump({"splits": splits, "meta": meta}, f, indent=2)

    if out_dir.name == "synthetic":
        write_app_files(companies, contacts, jobs, candidates, data_dir=out_dir.parent)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic match dataset")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent / "synthetic",
    )
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    args = parser.parse_args()
    write_dataset(args.out, args.seed)
    print(f"Wrote dataset to {args.out}")


if __name__ == "__main__":
    main()

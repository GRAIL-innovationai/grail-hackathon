"""Load Agent B synthetic world data (see DATA_CONTRACT.md)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DEFAULT_DATA_DIR = Path(__file__).resolve().parent / "synthetic"


def load_companies(data_dir: Path = DEFAULT_DATA_DIR) -> list[dict]:
    with (data_dir / "companies.json").open() as handle:
        return json.load(handle)


def load_contacts(data_dir: Path = DEFAULT_DATA_DIR) -> list[dict]:
    with (data_dir / "contacts.json").open() as handle:
        return json.load(handle)


def load_jobs(data_dir: Path = DEFAULT_DATA_DIR) -> list[dict]:
    with (data_dir / "jobs.json").open() as handle:
        return json.load(handle)


def load_candidates(data_dir: Path = DEFAULT_DATA_DIR) -> dict[str, dict]:
    rows = {}
    with (data_dir / "inputs.jsonl").open() as handle:
        for line in handle:
            row = json.loads(line)
            rows[row["candidate_id"]] = row
    return rows


def load_match_labels(data_dir: Path = DEFAULT_DATA_DIR) -> dict[str, dict]:
    rows = {}
    with (data_dir / "match_labels.jsonl").open() as handle:
        for line in handle:
            row = json.loads(line)
            rows[row["candidate_id"]] = row
    return rows


def load_tasks(data_dir: Path = DEFAULT_DATA_DIR) -> list[dict]:
    """Agent D fixtures: resume-tailoring scenarios (not required for C outreach)."""
    path = data_dir / "tasks.jsonl"
    if not path.exists():
        return []
    rows = []
    with path.open() as handle:
        for line in handle:
            rows.append(json.loads(line))
    return rows


def load_labels(data_dir: Path = DEFAULT_DATA_DIR) -> dict[str, dict]:
    rows = {}
    with (data_dir / "labels.jsonl").open() as handle:
        for line in handle:
            row = json.loads(line)
            rows[row["task_id"]] = row
    return rows


def load_splits(data_dir: Path = DEFAULT_DATA_DIR) -> dict[str, list[str]]:
    with (data_dir / "splits.json").open() as handle:
        payload = json.load(handle)
    return payload["splits"]


def index_by_id(rows: list[dict], key: str) -> dict[str, dict]:
    return {row[key]: row for row in rows}


def build_outreach_example(
    candidate_id: str,
    job_id: str,
    *,
    data_dir: Path = DEFAULT_DATA_DIR,
) -> dict[str, Any]:
    """One record for Agent C message generation: candidate + job + hiring contact."""
    candidates = load_candidates(data_dir)
    jobs = index_by_id(load_jobs(data_dir), "job_id")
    contacts = index_by_id(load_contacts(data_dir), "contact_id")
    companies = index_by_id(load_companies(data_dir), "company_id")
    candidate = candidates[candidate_id]
    job = jobs[job_id]
    contact = contacts[job["contact_id"]]
    company = companies[job["company_id"]]
    return {
        "candidate_id": candidate_id,
        "resume": candidate["resume"],
        "blurb": candidate["blurb"],
        "profile": candidate["profile"],
        "job": job,
        "contact": contact,
        "company": company,
    }


def _public_task(row: dict, *, include_keywords: bool) -> dict:
    task = {
        "task_id": row["task_id"],
        "candidate_id": row["candidate_id"],
        "resume": row["resume"],
        "blurb": row["blurb"],
        "profile": row["profile"],
        "job": row["job"],
    }
    if include_keywords and "target_keywords" in row:
        task["target_keywords"] = row["target_keywords"]
    return task


def build_tailor_batch(split_name: str, *, data_dir: Path = DEFAULT_DATA_DIR) -> dict[str, Any]:
    """Agent D: train tasks include target keywords; evaluated split does not."""
    tasks = load_tasks(data_dir)
    train = [_public_task(row, include_keywords=True) for row in tasks if row["split"] == "train"]
    evaluated = [_public_task(row, include_keywords=False) for row in tasks if row["split"] == split_name]
    return {"train": train, "tasks": evaluated}


def labels_for_split(split_name: str, data_dir: Path = DEFAULT_DATA_DIR) -> dict[str, dict]:
    labels = load_labels(data_dir)
    task_ids = {row["task_id"] for row in load_tasks(data_dir) if row["split"] == split_name}
    return {task_id: labels[task_id] for task_id in task_ids}


# Back-compat alias for Agent D evaluator
build_batch = build_tailor_batch

"""Structured records used by the generator and evaluator."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class JobRecord:
    job_id: str
    title: str
    role_type: str
    field: str
    location: str
    skills: list[str]
    min_degree: str
    requires_phd: bool
    description: str
    institution: str


@dataclass
class CandidateRecord:
    candidate_id: str
    name: str
    degree: str
    seniority: str  # early | mid
    track: str  # faculty | industry | either
    location_pref: str | None
    refused_fields: list[str]
    no_industry: bool
    skills: list[str]
    resume_lines: list[str]
    resume: str
    blurb: str


@dataclass
class JobLabel:
    job_id: str
    relevance: float
    hard_reject: bool
    evidence_spans: list[str]
    forbidden_claims: list[str]


@dataclass
class CandidateLabels:
    candidate_id: str
    jobs: list[JobLabel]

"""Frozen contracts. Everyone codes against these; change them only with the team."""
from typing import Literal

from pydantic import BaseModel, Field


class Line(BaseModel):
    id: str  # "R1".."Rn" for candidates, "J1".."Jn" for job reqs
    text: str


class Candidate(BaseModel):
    id: str
    lines: list[Line]


class Job(BaseModel):
    id: str
    company: str
    title: str
    reqs: list[Line]
    contact_persona_id: str
    description: str = ""


class Persona(BaseModel):
    id: str
    role: Literal["CEO", "Recruiter", "Engineer"]
    name: str
    company: str
    priorities: list[str]
    pet_peeves: list[str]
    split: Literal["train", "test"]


class Message(BaseModel):
    text: str
    chars: int
    job_id: str
    persona_id: str
    citations: list[str]


Outcome = Literal[
    "no_response",
    "connection_accepted",
    "generic_reply",
    "meaningful_conversation",
    "interview_or_referral",
]

OUTCOME_REWARD: dict[str, float] = {
    "no_response": 0.0,
    "connection_accepted": 0.2,
    "generic_reply": 0.4,
    "meaningful_conversation": 0.7,
    "interview_or_referral": 1.0,
}


class Quality(BaseModel):
    relevance: int = Field(ge=0, le=3)
    specificity: int = Field(ge=0, le=3)
    concise: int = Field(ge=0, le=2)
    clear_ask: int = Field(ge=0, le=2)


class Evaluation(BaseModel):
    persona_id: str
    outcome: Outcome
    outcome_reward: float
    quality: Quality
    quality_score: float = Field(ge=0, le=1)  # sum of quality / 10
    reply: str
    critique: str


class Lint(BaseModel):
    passed: bool
    offending: list[str]


class Iteration(BaseModel):
    n: int
    prompt: str
    message: Message
    lint: Lint
    evals: list[Evaluation]
    score: float


class Run(BaseModel):
    id: str
    candidate_id: str
    job_id: str
    train_persona_ids: list[str]
    test_persona_ids: list[str]
    iterations: list[Iteration]
    best_n: int
    baseline_test: list[Evaluation]
    optimized_test: list[Evaluation]


class MatchRow(BaseModel):
    j: str
    status: Literal["Covered", "Mapped", "Thin", "Gap"]
    r: list[str]


class JobMatch(BaseModel):
    job_id: str
    score: int = Field(ge=0, le=100)
    rows: list[MatchRow]

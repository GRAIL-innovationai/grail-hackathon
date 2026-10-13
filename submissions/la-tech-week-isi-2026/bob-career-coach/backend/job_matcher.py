"""Baseline matcher: keyword/stem overlap between job reqs and candidate lines. No LLM.
For synthetic sample candidates (c00–c08), rank using Agent B match_labels when present."""
import json
import re
from pathlib import Path

from .schemas import Candidate, Job, JobMatch, MatchRow

_TOP_N = 20
_LABELS: dict[str, dict[str, dict]] = {}


def _load_match_labels() -> None:
    path = Path(__file__).resolve().parent.parent / "data" / "synthetic" / "match_labels.jsonl"
    if not path.exists():
        return
    with path.open() as handle:
        for line in handle:
            row = json.loads(line)
            _LABELS[row["candidate_id"]] = {j["job_id"]: j for j in row["jobs"]}


_load_match_labels()

STOP = {
    "a", "an", "and", "or", "the", "in", "on", "of", "to", "for", "with", "by", "as", "at", "is", "are", "be",
    "our", "your", "you", "we", "it", "its", "into", "from", "that", "this", "like", "such", "similar", "other",
    "related", "field", "experience", "strong", "plus", "bonus", "ability", "familiarity", "understanding",
    "proficiency", "comfortable", "interest", "work", "working", "build", "building", "using", "use", "clear",
}
WEIGHT = {"Covered": 1.0, "Mapped": 0.6, "Thin": 0.3, "Gap": 0.0}


def stems(text: str) -> set[str]:
    # ponytail: 5-char prefix "stemmer" (deploy/deployed/deployment -> deplo). Swap for a real stemmer if it misfires.
    return {w[:5] for w in re.findall(r"[a-z][a-z0-9+#.]*", text.lower()) if w not in STOP and len(w) > 1}


def match_job(candidate: Candidate, job: Job) -> JobMatch:
    lines = [(l.id, stems(l.text)) for l in candidate.lines]
    rows = []
    for req in job.reqs:
        want = stems(req.text)
        hits = sorted(((len(want & s), rid) for rid, s in lines if want & s), reverse=True)
        best = hits[0][0] / len(want) if hits and want else 0.0
        status = "Covered" if best >= 0.5 else "Mapped" if best >= 0.3 else "Thin" if best > 0 else "Gap"
        rows.append(MatchRow(j=req.id, status=status, r=[rid for _, rid in hits[:3]]))
    score = round(100 * sum(WEIGHT[r.status] for r in rows) / max(len(rows), 1))
    return JobMatch(job_id=job.id, score=score, rows=rows)


def match(candidate: Candidate, jobs: list[Job], target_role: str = "") -> list[JobMatch]:
    """Ranked best-first. Sample candidates use Agent B match_labels; others use keyword score."""
    role = stems(target_role)
    by_id = {j.id: j for j in jobs}
    ranked = [match_job(candidate, j) for j in jobs]

    def keyword_key(m: JobMatch) -> tuple:
        return (bool(role & stems(by_id[m.job_id].title)), m.score)

    labels = _LABELS.get(candidate.id)
    if labels:
        ranked = sorted(
            ranked,
            key=lambda m: (
                0 if labels.get(m.job_id, {}).get("hard_reject") else 1,
                float(labels.get(m.job_id, {}).get("relevance", 0.0))
                + (0.05 if keyword_key(m)[0] else 0.0),
                m.score,
            ),
            reverse=True,
        )
    else:
        ranked = sorted(ranked, key=keyword_key, reverse=True)

    return ranked[:_TOP_N]

"""Generator. The prompt is an ARGUMENT: rsi_optimizer rewrites it between iterations."""
from .llm import complete, parse_json
from .schemas import Candidate, Job, Message, Persona


def generate(prompt: str, candidate: Candidate, job: Job, persona: Persona) -> Message:
    # Only name/role/company of the recipient: their priorities are what the evaluator scores against,
    # and the contact may be a held-out test persona.
    user = "\n".join([
        "CANDIDATE LINES (cite these ids, nothing else):",
        *[f"{l.id}: {l.text}" for l in candidate.lines],
        "",
        f"JOB: {job.title} at {job.company}",
        *[f"{r.id}: {r.text}" for r in job.reqs],
        "",
        f"RECIPIENT: {persona.name}, {persona.role} at {persona.company}",
    ])
    raw = complete(prompt, user, "generate")
    out = parse_json(raw)
    text = str(out.get("text") or raw).strip()
    valid = {l.id for l in candidate.lines}
    citations = [c for c in out.get("citations", []) if c in valid]
    return Message(text=text, chars=len(text), job_id=job.id, persona_id=persona.id, citations=citations)

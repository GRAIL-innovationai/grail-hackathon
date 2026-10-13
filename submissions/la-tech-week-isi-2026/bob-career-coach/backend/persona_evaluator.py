"""Simulated recipient. The model plays the persona and returns an outcome + rubric scores (the reward model)."""
from .llm import complete, parse_json
from .schemas import OUTCOME_REWARD, Candidate, Evaluation, Job, Message, Persona, Quality

LIMITS = {"relevance": 3, "specificity": 3, "concise": 2, "clear_ask": 2}


def _clamp(v, hi: int) -> int:
    try:
        return min(max(int(v), 0), hi)
    except (TypeError, ValueError):
        return 0


def evaluate(persona: Persona, message: Message, job: Job, candidate: Candidate) -> Evaluation:
    # `candidate` is unused on purpose: a real recipient never sees the resume, only the message.
    system = f"""You are {persona.name}. Your role: {persona.role} at {persona.company}.
You care about: {"; ".join(persona.priorities)}.
You are put off by: {"; ".join(persona.pet_peeves)}.
A new grad sent you the LinkedIn message below about the {job.title} role. React exactly as you would in real life.
Return JSON only:
{{"outcome": one of {list(OUTCOME_REWARD)},
 "quality": {{"relevance": 0-3, "specificity": 0-3, "concise": 0-2, "clear_ask": 0-2}},
 "reply": "<your reply in character, max 2 sentences; empty if no_response>",
 "critique": "<what would have made you respond better, 1-2 sentences>"}}"""
    out = parse_json(complete(system, f"MESSAGE ({message.chars} chars):\n{message.text}", "evaluate"))

    outcome = out.get("outcome") if out.get("outcome") in OUTCOME_REWARD else "no_response"
    q = out.get("quality") if isinstance(out.get("quality"), dict) else {}
    quality = Quality(**{k: _clamp(q.get(k), hi) for k, hi in LIMITS.items()})
    return Evaluation(
        persona_id=persona.id,
        outcome=outcome,
        outcome_reward=OUTCOME_REWARD[outcome],
        quality=quality,
        quality_score=sum(quality.model_dump().values()) / 10,
        reply=str(out.get("reply", "")),
        critique=str(out.get("critique", "")),
    )

"""Zero-shot and improvement prompts for tailor_resume RSI."""

from __future__ import annotations

from agent_d.card import card

SYSTEM = (
    "You are an expert resume editor for academic and research jobs. "
    "You design algorithms that rewrite resume structure and wording without inventing credentials."
)

INSTRUCTION = """Design an algorithm that tailors a resume to one job posting.

The problem
Each task is one person and one job. The person has a ground-truth profile: their real degree, institution, and
skills. Each skill lists truthful_phrases, the only wordings you may use for that skill, including the job's
wording when it is the same skill. The resume is one rendering of the profile. Rewrite it so a recruiter sees
the relevant true skills first, in the job's wording.

You may change structure and restate a true skill with one of its truthful_phrases. You may not add a skill,
degree, employer, or publication that is not in the profile. Training tasks include target_keywords, the job
phrases that are both true for this person and relevant to the posting. Validation and test tasks do not."""

CONTRACT = """Write a Python function tailor_resume(train, tasks).

- train: list of dicts for the 3 training candidates (2 jobs each). Keys: task_id, candidate_id, resume, blurb,
  profile (name, degree, institution, skills with truthful_phrases), job (job_id, title, description), and
  target_keywords (list of true job phrases that should appear).
- tasks: the same shape without target_keywords. These are the resumes you must rewrite from the profile.
- Return a list of dicts in the same order as tasks, each with task_id and tailored_resume (a non-empty string).

How it will be evaluated
- combined_score averages two things when the rewrite is honest: keyword alignment (share of the hidden target
  phrases that appear anywhere) and structure (share of those phrases that appear in the top half of the resume).
- The score is 0 if the name disappears or the rewrite states a degree or skill phrase that is not in the profile.
- The loop maximizes the mean combined_score on the validation tasks. A locked test split is scored only at the end.

Rules
- Python 3 with NumPy and the standard modules math, re, string, collections, itertools, functools, heapq; no other
  imports, and no file, network or system access.
- Deterministic output; no errors.
- Fast: finish within about 30 seconds on the validation tasks."""

OUTPUT = """Output
Return the complete program, without test code, in one ```python block. The docstring of tailor_resume must describe your algorithm:

    Algorithm: <name>
    Idea: <how you change structure and keywords without inventing facts>
    Procedure:
      1. <first step>
      2. <next step, as many as needed>
"""

TASK = INSTRUCTION + "\n\n" + CONTRACT
ZERO_SHOT_PROMPT = TASK + "\n\n" + OUTPUT


def improvement_prompt(best: dict, recent: list[dict], start: dict, *, task: str | None = None) -> str:
    task = task or TASK
    lines = [
        task,
        "",
        f"Your best program so far scores combined_score {best['practice']:.3f} on the validation resumes "
        f"(your first program scored {start['practice']:.3f}):",
        "```python",
        best["source"],
        "```",
        "",
    ]
    if recent:
        lines.append("Your most recent attempts:")
        for attempt in recent:
            if attempt.get("practice") is None:
                result = f"failed ({attempt.get('error')})"
            else:
                result = f"combined_score {attempt['practice']:.3f}"
            change = attempt.get("change") or ""
            suffix = f" ({change[:160]})" if change else ""
            lines.append(f"- {attempt.get('name', '?')}{suffix}: {result}")
        lines.append("")
    lines += [
        "Write an improved version that tailors validation resumes better than your best program. "
        "Change structure or keyword substitution. Do not merely reweight the same counts, and do not "
        "raise the score by inventing credentials.",
        "",
        OUTPUT.replace(
            "    Procedure:",
            "    Change: <what you changed in the rewriting rules, and why>\n    Procedure:",
        ),
    ]
    return "\n".join(lines)


def format_attempt(step: dict) -> dict:
    parsed = card(step.get("source"))
    return {
        "name": parsed["name"],
        "change": parsed["change"],
        "practice": step.get("practice"),
        "error": step.get("error"),
    }

"""Reusable prompt-controlled renderer with candidate claim provenance.

This is deliberately a deterministic local generator, not a hosted LLM. Prompt
instructions choose evidence and presentation; they cannot supply candidate facts.
"""

from dataclasses import asdict, dataclass
from collections.abc import Mapping
import json
import re

from .contracts import normalize_candidate, normalize_contact, normalize_job, text_field
from .errors import CareerCoachError
from .skills import compact, skill_in_text, skill_key, tokens


@dataclass(frozen=True)
class GenerationInstructions:
    max_words: int = 120
    max_chars: int | None = None
    tone: str = "professional"
    opening: str = "role_first"
    evidence_count: int = 1
    include_skills: bool = True
    skill_limit: int = 3
    include_metrics: bool = False
    personalize_contact: bool = True
    adapt_to_contact: bool = True
    call_to_action: str = "question"
    include_subject: bool = True


BASELINE_INSTRUCTIONS = asdict(GenerationInstructions())
ENUMS = {
    "tone": {"professional", "warm", "direct"},
    "opening": {"role_first", "evidence_first"},
    "call_to_action": {"question", "conversation", "consideration"},
}
RANGES = {"max_words": (30, 250), "max_chars": (60, 2000), "evidence_count": (0, 3), "skill_limit": (1, 6)}
BOOL_FIELDS = {"include_skills", "include_metrics", "personalize_contact", "adapt_to_contact", "include_subject"}


def parse_instructions(instructions=None) -> tuple[GenerationInstructions, list[str], set[str]]:
    warnings, supplied = [], {}
    if isinstance(instructions, GenerationInstructions):
        supplied = asdict(instructions)
    elif instructions is None or instructions == "":
        pass
    elif isinstance(instructions, Mapping):
        supplied = dict(instructions)
    elif isinstance(instructions, str):
        if len(instructions) > 20_000:
            raise CareerCoachError("invalid_instructions", "Generator instructions are too long.")
        prompt = instructions.strip()
        if prompt.startswith("{"):
            try:
                supplied = json.loads(prompt)
            except json.JSONDecodeError as exc:
                raise CareerCoachError("invalid_instructions", "The instructions JSON is invalid.") from exc
            if not isinstance(supplied, dict):
                raise CareerCoachError("invalid_instructions", "Instructions JSON must be an object.")
        else:
            # Natural-language convenience is intentionally small and inspectable.
            if re.search(r"\b(?:warm|friendly)\b", prompt, re.I):
                supplied["tone"] = "warm"
            if re.search(r"\b(?:direct|matter.of.fact)\b", prompt, re.I):
                supplied["tone"] = "direct"
            if re.search(r"\bprofessional\b", prompt, re.I):
                supplied["tone"] = "professional"
            if re.search(r"(?:lead|start|open) with (?:resume )?evidence|evidence[ _-]first", prompt, re.I):
                supplied["opening"] = "evidence_first"
            if re.search(r"role[ _-]first", prompt, re.I):
                supplied["opening"] = "role_first"
            budget = re.search(r"(?:under|at most|maximum|max)\s+(\d+)\s+words", prompt, re.I)
            if budget:
                supplied["max_words"] = int(budget.group(1)) - (1 if prompt[budget.start():].lower().startswith("under") else 0)
            char_budget = re.search(r"(?:under|at most|maximum|max)\s+(\d+)\s+(?:characters|chars)", prompt, re.I)
            if char_budget:
                supplied["max_chars"] = int(char_budget.group(1)) - (1 if prompt[char_budget.start():].lower().startswith("under") else 0)
            if re.search(r"\b(?:two|2) (?:examples|facts|evidence|achievements)\b", prompt, re.I):
                supplied["evidence_count"] = 2
            if re.search(r"\b(?:three|3) (?:examples|facts|evidence|achievements)\b", prompt, re.I):
                supplied["evidence_count"] = 3
            if re.search(r"\b(?:metrics|quantified|measurable)\b", prompt, re.I):
                supplied["include_metrics"] = True
            if re.search(r"(?:no|omit|without|avoid)\s+(?:the )?metrics", prompt, re.I):
                supplied["include_metrics"] = False
            if re.search(r"(?:no|omit|without)\s+(?:a |the )?subject", prompt, re.I):
                supplied["include_subject"] = False
            if re.search(r"(?:no|omit|without)\s+(?:the )?skills", prompt, re.I):
                supplied["include_skills"] = False
            if re.search(r"\b(?:conversation|chat)\b", prompt, re.I):
                supplied["call_to_action"] = "conversation"
            if re.search(r"\b(?:one |a )?(?:question|low.friction ask)\b", prompt, re.I):
                supplied["call_to_action"] = "question"
            if re.search(r"\b(?:personalize|contact.aware|persona.aware)\b", prompt, re.I):
                supplied["personalize_contact"] = True
            # Explicit key=value directives take precedence over convenience words.
            for match in re.finditer(r"\b([a-z_]+)\s*=\s*([a-z0-9_]+)", prompt, re.I):
                key, value = match.groups()
                key, value = key.lower(), value.lower()
                if key in RANGES:
                    supplied[key] = int(value) if value.isdigit() else (None if key == "max_chars" and value == "none" else value)
                elif key in BOOL_FIELDS:
                    supplied[key] = {"true": True, "false": False}.get(value, value)
                else:
                    supplied[key] = value
            warnings.append("Local deterministic generation interprets supported style/evidence directives; it does not execute arbitrary prose instructions or use an LLM.")
    else:
        raise CareerCoachError("invalid_instructions", "instructions must be an object, string, or GenerationInstructions.")
    allowed = set(BASELINE_INSTRUCTIONS)
    unknown = set(supplied) - allowed
    if unknown:
        raise CareerCoachError("invalid_instructions", "Unknown instruction fields: " + ", ".join(sorted(str(key) for key in unknown)) + ".")
    for key, value in supplied.items():
        if key in ENUMS and (not isinstance(value, str) or value not in ENUMS[key]):
            raise CareerCoachError("invalid_instructions", f"{key} must be one of {sorted(ENUMS[key])}.")
        if key in RANGES:
            if key == "max_chars" and value is None:
                continue
            low, high = RANGES[key]
            if not isinstance(value, int) or isinstance(value, bool) or not low <= value <= high:
                raise CareerCoachError("invalid_instructions", f"{key} must be an integer from {low} to {high}.")
        if key in BOOL_FIELDS and not isinstance(value, bool):
            raise CareerCoachError("invalid_instructions", f"{key} must be a boolean.")
    return GenerationInstructions(**supplied), warnings, set(supplied)


def _has_metric(text: str) -> bool:
    # Dates, GPA and technologies such as HTML5 are not impact metrics.
    return bool(re.search(r"\b\d+(?:\.\d+)?\s*%|\b\d[\d,]*(?:\.\d+)?\s*(?:users|students|requests|records|hours|minutes|seconds|ms|tests|customers|participants)\b", text, re.I))


def _evidence(candidate: dict, job: dict, contact: dict, options: GenerationInstructions) -> list[dict]:
    focus = tokens(job["title"] + " " + job["description"])
    if options.personalize_contact:
        focus.update(tokens(" ".join(contact["priorities"])))
    job_skills = job["required_skills"] + job["preferred_skills"]
    ranked = []
    for index, fact in enumerate(candidate["facts"]):
        if fact["kind"] not in {"projects", "experience", "education"}:
            continue
        score = 4 * sum(skill_in_text(skill, fact["text"]) for skill in job_skills)
        score += len(tokens(fact["text"]) & focus)
        score += 2 if fact["kind"] in {"projects", "experience"} else 0
        if re.match(r"(?:built|developed|implemented|created|analyzed|designed|improved|led|tested|documented)\b", fact["text"], re.I):
            score += 3
        if options.include_metrics and _has_metric(fact["text"]):
            score += 5
        ranked.append((-score, index, fact))
    ranked.sort(key=lambda item: (item[0], item[1]))
    # Never echo the same source line twice under different evidence categories.
    selected, seen_text = [], set()
    for _, _, fact in ranked:
        if compact(fact["text"]) not in seen_text:
            selected.append(fact)
            seen_text.add(compact(fact["text"]))
    return selected[:options.evidence_count]


def _cta(contact: dict, options: GenerationInstructions) -> str:
    if options.call_to_action == "conversation":
        return "Would you be open to a brief conversation about this role?"
    if options.call_to_action == "consideration":
        return "Would you consider my profile for this role?"
    if options.personalize_contact:
        role = tokens(contact["role"])
        if role & {"recruiter", "recruiting", "talent"}:
            return "Which qualifications should I highlight when applying for this role?"
        if role & {"engineer", "technical", "developer"}:
            return "Which technical skills matter most for this role?"
        if role & {"manager", "lead", "director"}:
            return "What would success in this role look like?"
        if role & {"founder", "ceo", "executive"}:
            return "Which outcomes would this role prioritize?"
    return "Which qualifications matter most for this role?"


def _quote_prefix(text: str, max_words: int) -> str:
    text = compact(text)
    words = list(re.finditer(r"\S+", text))
    if len(words) <= max_words:
        return text
    return text[:words[max_words - 1].end()].rstrip() + " ..."


def _fit_quote(text: str, max_words: int, max_chars: int | None) -> str:
    quote = _quote_prefix(text, max_words)
    if max_chars is None or len(quote) <= max_chars:
        return quote
    for budget in range(max_words - 1, 2, -1):
        quote = _quote_prefix(text, budget)
        if len(quote) <= max_chars:
            return quote
    return ""


def generate_outreach(candidate: dict, job: dict, contact: dict, instructions=None, *, target_role: str = "") -> dict:
    """Return a JSON-serializable note and the source for every candidate claim."""
    candidate = normalize_candidate(candidate)
    job, contact = normalize_job(job), normalize_contact(contact)
    target_role = text_field(target_role, "target_role", max_length=1000) or candidate.get("target_role", "")
    options, instruction_warnings, explicit_keys = parse_instructions(instructions)
    effective = asdict(options)
    preferences = contact["communication_preferences"]
    if options.adapt_to_contact:
        if "max_words" in preferences:
            persona_budget = preferences["max_words"]
            effective["max_words"] = min(options.max_words, persona_budget)
        if "tone" not in explicit_keys and preferences.get("tone") in ENUMS["tone"]:
            effective["tone"] = preferences["tone"]
        if "include_metrics" not in explicit_keys and preferences.get("prefers_metrics") is True:
            effective["include_metrics"] = True
    options = GenerationInstructions(**effective)
    warnings = list(candidate["warnings"]) + instruction_warnings
    name = contact["name"].split()[0] if contact["name"] else ""
    greeting = f"Hi {name}," if name else "Hi,"
    if options.tone == "direct":
        intro = f"I'm interested in {job['title']} at {job['company']}."
    elif options.tone == "warm":
        intro = f"I'd love to learn more about the {job['title']} role at {job['company']}."
    else:
        intro = f"I'm interested in the {job['title']} role at {job['company']}."
    cta = _cta(contact, options)
    signature = candidate["name"] or ""
    closing = ("Thank you," if options.tone != "warm" else "Thanks,") + (f"\n{signature}" if signature else "")
    fixed_words = len(" ".join((greeting, intro, cta, closing)).split())
    if fixed_words > options.max_words:
        raise CareerCoachError("word_budget_too_small", "The job/contact names and required message structure exceed the requested word budget. Increase max_words.")
    remaining = options.max_words - fixed_words
    fixed_chars = len("\n\n".join((greeting, intro, cta, closing)))
    if options.max_chars is not None and fixed_chars > options.max_chars:
        raise CareerCoachError("length_budget_too_small", "The job/contact names and required message structure exceed the character budget. Increase max_chars.")
    remaining_chars = options.max_chars - fixed_chars - 2 if options.max_chars is not None else None
    available_skills = candidate["skills"]
    relevance = {skill_key(skill): index for index, skill in enumerate(job["required_skills"] + job["preferred_skills"])}
    available_skills = sorted(available_skills, key=lambda skill: (relevance.get(skill_key(skill), 10_000), skill.casefold()))
    relevant_skills = [skill for skill in available_skills if skill_key(skill) in relevance]
    if relevant_skills:
        available_skills = relevant_skills
    selected_evidence = _evidence(candidate, job, contact, options)
    facts_by_id = {fact["id"]: fact for fact in candidate["facts"]}
    claims, evidence_sentences = [], []
    for index, fact in enumerate(selected_evidence):
        label = "A relevant entry from my resume" if fact["source"]["type"] == "resume" else "A relevant entry from my profile"
        # Divide remaining room fairly across selected facts and keep quotes intact.
        quote_budget = min(38, remaining // (len(selected_evidence) - index) - len(label.split()) - 2)
        if quote_budget < 3:
            warnings.append("Some requested evidence was omitted to respect the word budget.")
            break
        quote_char_budget = None if remaining_chars is None else remaining_chars // (len(selected_evidence) - index) - len(label) - 4 - bool(evidence_sentences)
        quote = _fit_quote(fact["text"], quote_budget, quote_char_budget)
        if not quote:
            warnings.append("Some requested evidence was omitted to respect the character budget.")
            continue
        sentence = f'{label}: "{quote}"'
        if remaining_chars is not None:
            remaining_chars -= len(sentence) + bool(evidence_sentences)
        evidence_sentences.append(sentence)
        remaining -= len(sentence.split())
        claims.append({"kind": "quoted_evidence", "text": quote, "fact_id": fact["id"],
                       "source_text": fact["text"], "source": fact["source"]})
    skill_sentence = ""
    selected_skills = []
    if options.include_skills:
        for skill in available_skills[:options.skill_limit]:
            proposed = selected_skills + [skill]
            sentence = "My resume lists " if "raw_text" in candidate else "My profile lists "
            sentence += ", ".join(proposed) + "."
            if len(sentence.split()) > remaining:
                break
            if remaining_chars is not None and len(sentence) + bool(evidence_sentences) > remaining_chars:
                break
            selected_skills = proposed
            skill_sentence = sentence
        if skill_sentence:
            remaining -= len(skill_sentence.split())
        for skill in selected_skills:
            fact = facts_by_id[candidate["skill_evidence"][skill]]
            claims.append({"kind": "skill", "text": skill, "fact_id": fact["id"],
                           "source_text": fact["text"], "source": fact["source"]})
    if not claims:
        warnings.append("No candidate skill or experience claim could be included; this note expresses interest only.")
    if signature:
        fact = next(fact for fact in candidate["facts"] if fact["kind"] == "name")
        claims.append({"kind": "name", "text": signature, "fact_id": fact["id"],
                       "source_text": fact["text"], "source": fact["source"]})
    evidence_block = " ".join(evidence_sentences + ([skill_sentence] if skill_sentence else []))
    middle = [intro, evidence_block] if options.opening == "role_first" else [evidence_block, intro]
    message = "\n\n".join(part for part in [greeting, *middle, cta, closing] if part)
    word_count = len(message.split())
    assert word_count <= options.max_words, "Internal word-budget accounting error"
    assert options.max_chars is None or len(message) <= options.max_chars, "Internal character-budget accounting error"
    # Every emitted fact is taken from our rebuilt candidate profile, never the prompt.
    for claim in claims:
        if claim["kind"] == "quoted_evidence":
            quote = claim["text"].removesuffix(" ...")
            assert compact(quote) in compact(claim["source_text"])
    return {
        "schema_version": "1.0", "generator": "deterministic_grounded_v1",
        "subject": f"Interest in {job['title']} at {job['company']}" if options.include_subject else None,
        "message": message, "word_count": word_count, "char_count": len(message), "job_id": job["id"],
        "contact_id": contact.get("id", contact.get("contact_id")),
        "target_role": target_role, "effective_instructions": effective,
        "claims": claims, "used_fact_ids": list(dict.fromkeys(claim["fact_id"] for claim in claims)),
        "grounding": {"candidate_claims_source_backed": True, "verification_scope": "submitted_resume_or_profile_not_external_truth"},
        "warnings": list(dict.fromkeys(warnings)),
    }


def generate_message(candidate: dict, job: dict, contact: dict, instructions=None, *, target_role: str = "") -> str:
    """Agent D's string-returning callable; same generation path as the UI result."""
    return generate_outreach(candidate, job, contact, instructions, target_role=target_role)["message"]

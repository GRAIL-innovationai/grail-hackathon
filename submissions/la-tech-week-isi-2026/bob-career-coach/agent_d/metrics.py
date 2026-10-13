"""Score a rewritten resume against the candidate's ground-truth profile."""

from __future__ import annotations

from data.lexicons import DEGREE_RANK, SKILLS


def _contains(text: str, phrase: str) -> bool:
    return phrase.lower() in text.lower()


def _lexicon_phrases() -> list[str]:
    phrases = []
    for forms in SKILLS.values():
        phrases.extend(forms["resume"])
        phrases.extend(forms["job"])
    return list(dict.fromkeys(phrases))


def _allowed_phrases(profile: dict) -> set[str]:
    degree = profile["degree"]
    allowed = {profile["name"], degree["label"], degree["field"], profile["institution"]}
    for skill in profile["skills"]:
        allowed.update(skill["truthful_phrases"])
    return {phrase.lower() for phrase in allowed}


def _degree_claims(level: str) -> list[str]:
    claims = []
    if DEGREE_RANK[level] < DEGREE_RANK["phd"]:
        claims.extend(["PhD", "Ph.D", "doctoral degree", "doctorate"])
    if DEGREE_RANK[level] < DEGREE_RANK["ms"]:
        claims.extend(["Master's", "M.S.", "MSc"])
    return claims


def keyword_alignment(tailored: str, target_keywords: list[str]) -> float:
    if not target_keywords:
        return 0.0
    hits = sum(1 for phrase in target_keywords if _contains(tailored, phrase))
    return hits / len(target_keywords)


def structure_score(tailored: str, target_keywords: list[str]) -> float:
    """Share of target keywords that first appear in the top half of the resume."""
    if not target_keywords:
        return 0.0
    lines = [line for line in tailored.splitlines() if line.strip()]
    if not lines:
        return 0.0
    head = "\n".join(lines[: max(1, len(lines) // 2)])
    return sum(1 for phrase in target_keywords if _contains(head, phrase)) / len(target_keywords)


def honesty_failures(tailored: str, label: dict) -> list[str]:
    """A claim is allowed only when the ground-truth profile contains it."""
    failures = []
    profile = label.get("profile")
    name = (profile or {}).get("name") or label.get("name") or ""
    if name and not _contains(tailored, name):
        failures.append("drops the candidate's name")
    if profile:
        allowed = _allowed_phrases(profile)
        for claim in _degree_claims(profile["degree"]["level"]):
            if _contains(tailored, claim) and claim.lower() not in allowed:
                failures.append(f"invents {claim}")
                break
        for phrase in _lexicon_phrases():
            if not _contains(tailored, phrase):
                continue
            if any(phrase.lower() in allowed_phrase for allowed_phrase in allowed):
                continue
            failures.append(f"invents skill {phrase}")
            break
        return failures
    for claim in label.get("forbidden_claims") or []:
        if _contains(tailored, claim):
            failures.append(f"invents {claim}")
    for phrase in label.get("forbidden_skill_phrases") or []:
        if _contains(tailored, phrase):
            failures.append(f"invents skill {phrase}")
            break
    return failures


def score_tailored_resume(tailored: str, label: dict) -> dict[str, float]:
    """combined_score is 0 when the rewrite states something the profile does not support."""
    keywords = label.get("target_keywords") or []
    if honesty_failures(tailored, label):
        return {"combined_score": 0.0, "keyword_alignment": 0.0, "structure": 0.0}
    keywords_score = keyword_alignment(tailored, keywords)
    leading = structure_score(tailored, keywords)
    combined = 0.65 * keywords_score + 0.35 * leading
    return {
        "combined_score": round(combined, 4),
        "keyword_alignment": round(keywords_score, 4),
        "structure": round(leading, 4),
    }

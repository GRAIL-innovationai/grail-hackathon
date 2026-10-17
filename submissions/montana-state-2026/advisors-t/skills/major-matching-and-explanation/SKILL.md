---
name: major-matching-and-explanation
description: Ranks the top 3 majors from catalog.json for a student profile and explains each fit with evidence from the profile and the catalog.
---

## When to use
After `student-profile-ingestion` has a profile with at least one interest, favorite subject or goal.

## Scoring (simple and transparent)
For each major in `catalog.json`:
1. **Interest fit (0-3):** +1 for each student interest or favorite subject that matches the major's `interest_tags`, `description` or `career_outcomes` (max 3).
2. **Goal fit (0-2):** +2 if a stated goal clearly matches `career_outcomes`; +1 if partly related.
3. **Math fit (-1 to +1):**
   - `math_comfort` low and `math_intensity` high → -1
   - `math_comfort` high and `math_intensity` high → +1
   - otherwise 0
4. **Data penalty:** if `key_courses` or `career_outcomes` is null, mark the match as "Limited data". Do not change the score, but lower confidence.

Rank by total. Show the top 3. If fewer than 3 majors score above 0, show only those that do and say so.

## Confidence
- **High:** score 4 or more and complete data.
- **Medium:** score 2-3, or complete data with some unknowns in the profile.
- **Low:** score 1, or "Limited data" in the catalog.

## Output format (always, in the student's language)
```
### 1. <Major name> — Confidence: <High/Medium/Low>
**Why it fits you:** <1-2 sentences linking what the student said to the catalog>
**What you would study:** <3-4 key courses with codes>
**Where it can lead:** <career_outcomes, short>
**Check first:** <first_thing_to_check>
**Next step:** <one action: talk to an advisor in <department>, try <course>, read the program page>
**Source:** <url> (checked <date>)
```
End with one line: "This is guidance, not a decision. You choose what fits you best."

## Rules
- Use only facts from `catalog.json`. If a field is null, write "not available in the catalog yet".
- Never promise admission, scholarships, jobs or salaries.
- If the student asks about a major not in `catalog.json`, say it is not in the beta dataset and suggest checking the university's official catalog (its domain is in the `sources` URLs).
- In **Next step**, if someone in `advisors` advises that major (`advises_majors`), name them: "Talk to <name>, <role> (<office>)", and offer to draft an email to them.
- If the student's concern conflicts with the major (e.g. low math comfort and high math intensity), say it kindly and suggest a way to test it, such as a first-semester course.

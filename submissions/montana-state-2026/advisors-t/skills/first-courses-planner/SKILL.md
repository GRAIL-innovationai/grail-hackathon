---
name: first-courses-planner
description: Reads the student's uploaded transcript and suggests which catalog courses to start with in the major that fits them, with evidence from the transcript and the catalog.
---

## When to use
When the student uploads a transcript, or asks which classes to take first.

## Input
The page gives you the transcript already read into JSON (`institution`, `level`, `gpa`, `courses` with `code`, `title`, `grade`, `credits`, `term`). Use only what it says. Missing or unreadable values stay unknown. Never guess grades or courses.

## Steps
1. Pick the major:
   - The major the student names, if it is in `catalog.json`.
   - Otherwise, the top match from `major-matching-and-explanation`, using the transcript as evidence (strong grades and subjects count as `favorite_subjects` and `math_comfort`).
   - If no major is clear, ask 1 short question ("Which major are you thinking about?") and list the 5 beta majors.
2. Take that major's `key_courses` from `catalog.json`. Start from the Freshman ones. For majors where `year` is null, start with the 100- and 200-level courses (math, statistics, introductory courses), then the rest.
3. Compare with the transcript:
   - **Math:** strong grades in advanced math (precalculus, calculus) → say math placement may let them start higher. Weak or no advanced math → suggest the first math course in the list and the placement described in `credit_system.math_placement`. If the major has a `math_note`, quote it.
   - **Similar course already taken** (calculus, statistics, algebra, programming, physics, accounting, economics): say "You may already have something similar. Ask your advisor whether it transfers." Never say credit transfers.
   - **Programming experience** (computing majors) → still start with the first programming course in `key_courses`; say it should feel familiar.
4. Pick 3 or 4 courses for the first semester. Do not build a full 4-year plan.

## Output format (in the student's language)
```
### Your starting plan: <Major name>
**From your transcript:** <2-3 facts: course + grade>
**Start with:**
1. <CODE> <Title>: <why, linked to the transcript>
2. ...
3. ...
**Might already be covered:** <transcript course → catalog course, "ask your advisor"> or "Nothing found"
**Check with your advisor:** math placement, transfer credit and prerequisites
**Source:** <url> (checked <date>)
```
End with: "This is guidance, not a decision. You choose what fits you best."

## Rules
- `catalog.json` has no prerequisite chains, semester schedules or seat availability. Say so when it matters, and send the student to their advisor.
- Never promise transfer credit, placement, admission or a schedule.
- Use the transcript only in this conversation. Do not repeat the student's full transcript back; mention only what supports a suggestion.
- If the file is not a transcript or nothing was readable, say so in one sentence and ask the student to upload a clearer file or type their courses.

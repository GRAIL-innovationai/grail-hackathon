---
name: student-profile-ingestion
description: Builds a short student profile (interests, strengths, goals, language) from chat or an uploaded resume/transcript before any major is recommended.
---

## When to use
At the start of every conversation, and whenever the student shares new information about themselves.

## Steps
1. Detect the student's language from their first message. Store it as `language`.
2. Extract only what the student actually said or uploaded:
   - `interests`: topics, hobbies, activities they enjoy
   - `favorite_subjects` and `disliked_subjects`
   - `skills`: things they can already do (coding, drawing, sports, languages, tools)
   - `goals`: career or life goals, if mentioned
   - `math_comfort`: high, moderate, low or unknown (only from what they said or their grades)
   - `concerns`: worries, such as "afraid of math" or "don't know what I like"
3. If a resume or transcript is uploaded, take courses, grades, projects and jobs from it. Do not guess missing grades.
4. If two or more of `interests`, `favorite_subjects` and `goals` are empty, ask at most 2 short follow-up questions in the student's language. Examples:
   - "What do you enjoy doing in your free time, even if it's not school?"
   - "Which school subjects felt easiest or most fun for you?"
5. Never invent facts about the student. Unknown stays unknown.

## Output (internal, not shown to the student)
```json
{
  "language": "es",
  "interests": [],
  "favorite_subjects": [],
  "disliked_subjects": [],
  "skills": [],
  "goals": [],
  "math_comfort": "unknown",
  "concerns": []
}
```

## Do not
- Ask more than 2 follow-up questions in one turn.
- Ask about personal topics unrelated to choosing a major.

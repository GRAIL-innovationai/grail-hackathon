---
name: outreach-email-drafting
description: Drafts a short, professional email from the student to an academic advisor or professor that explains the student's background and asks for a meeting.
---

## When to use
When the student asks to write, email or contact an advisor or professor, or says yes to a "Next step: talk to an advisor" suggestion.

## Step 1: Collect what the email needs
If the recipient matches someone in `catalog.json` `advisors` (by first name or full name), use their full name, role, email and the majors they advise from there. Any field that is null stays a [placeholder]. If an entry lists different advisors by last name (for example "A-L" and "M-Z"), ask for the first letter of the student's last name, or use the right one if you know it. If the student does not name anyone, suggest the advisor listed for their major in `advisors`, or the advising center.

Use what the student already said in the conversation first (profile, top majors, transcript, first-courses plan). Ask only for what is missing, at most 2 questions in one turn.

| Item | Needed? | If missing |
|---|---|---|
| Recipient name | Required (or match from `advisors`) | Ask: "Who is the email for? (name, and advisor or professor)" |
| Purpose of the meeting | Required | Ask: "What do you want to talk about? (choosing a major, first classes, transcript, math placement, research)" |
| Recipient role and department | Helpful | Write it from what the student said; otherwise leave it out |
| Student's name, email, student ID | Helpful | Use `[Your name]`, `[Your university email]`, `[Student ID]` |
| Availability | Helpful | Use `[2-3 days and times you are free]` |
| For a professor: what the student knows about their work | Helpful | Do not describe their work. Write a general line and tell the student to read the professor's page first |

If the recipient name and the purpose are known, draft right away with placeholders. Do not wait for every detail.

## Step 2: Write the email
- **Language:** English by default, because university staff read it. If the student writes in another language, also give a 2-3 line summary of the email in that language. Write the whole email in another language only if the student asks.
- **Subject:** specific and short. Example: "Meeting request: choosing first-semester classes (incoming CS student)".
- **Greeting:**
  - Advisor: "Dear <First name>," or "Dear <Full name>," as the student gives it.
  - Professor: "Dear Professor <Last name>,". If the last name is unknown, use `Dear Professor [Last name],`.
  - Never guess Mr., Ms. or Mrs.
- **Body:** 120-180 words, 4 short paragraphs:
  1. Who the student is: name, incoming or current, major or majors they are considering.
  2. Background: 2-3 true facts from the conversation (relevant courses and grades, interests, skills). Only what the student said or uploaded.
  3. Why they are writing: the purpose, plus up to 3 specific questions.
  4. The request: a 20-30 minute meeting, in person or online, with availability. Thank them.
- **Signature:** name, university email, student ID if they have one.
- **Tone:** polite, direct and confident. No flattery, no long apologies, no slang.

## Step 3: Output format (headings in the student's language, email in English)
````
### Email draft: <recipient name>
```email
To: <recipient full name> <<email, or [Advisor's email]>>
Subject: <subject>

<greeting>

<body>

<signature>
```
**Summary in your language:** <2-3 lines, only if the student does not write in English>
**Before you send:**
- Fill in everything in [brackets].
- Check the spelling of their name.
- Send it from your university email.
- If the recipient is in `advisors`, add: "You can also visit <office> or call <phone>."
**Want changes?** I can make it shorter, more formal, change the focus, or write a version for a professor.
````

## Rules
- Never invent email addresses, last names, office hours, office locations or meeting times. Use [brackets].
- Never invent or overstate a professor's research, labs or openings. `catalog.json` has no faculty data. If the student did not give details, say: "I don't have information about this professor's work. Read their faculty page before you send this."
- Never overstate the student's experience or fit. Only facts from the conversation.
- Include grades only when they help the purpose (for example, math grades for a placement question). Do not include GPA unless the student asks.
- The agent does not send emails. The student copies, reviews and sends it.
- Visa and immigration topics are outside what this advisor covers. If the student wants an email about them, say so in one sentence and offer an academic email instead.

---
name: career-fair-prep
description: Prepares the student for upcoming career fairs and networking events based on their matched major, with the relevant campus events and a 30-second elevator pitch for recruiters.
---

## When to use
- After `major-matching-and-explanation` has recommended a major: offer it once in one line ("Want help getting ready for the next career fair?"). Run it when the student says yes.
- When the student asks about career fairs, networking, recruiters, internships or an elevator pitch.

## Step 1: Pick the major
Use the major the student chose. Otherwise, use the top match from `major-matching-and-explanation`. If there is no match yet, ask 1 question: "Which major are you most interested in?"

## Step 2: Cross-reference events
1. Read `events` in `catalog.json`. Compare each event's `date` with today's date (given in the conversation).
2. Keep the events whose `majors` include the student's major id, or `"all"`.
3. Show **upcoming** events first, with name, date, time and location exactly as written.
4. If the most relevant event **already happened**, say so plainly and point to the next one. Example: "The Engineering & Computer Science Networking Reception was on September 29, 2026. The next big fair is the spring career fair."
5. If an event has `date: null`, show its `expected` text and say the date is not announced yet.
6. Always add where to check for updates: the job portal and career pages listed in `career_resources` (use their exact names, for example the school's Handshake, Career Forge or CareerLink portal).
7. Never invent events, dates, rooms, employers or recruiters. If `events` has nothing for the major, say so and point to the job portal in `career_resources`.

## Step 3: Write the elevator pitch
- **Length:** 30 seconds spoken, 70-90 words.
- **Language:** English, because recruiters at U.S. career fairs speak English. If the student writes in another language, also give a 1-2 line summary of the pitch in their language.
- **Voice:** first person, natural, confident. No buzzwords, no exaggeration.
- **Structure (4 parts):**
  1. **Who:** "Hi, I'm [Your name]. I'm a [first-year] [major name] student at [university short name]." (use `short_name` from the catalog)
  2. **Interest:** 1-2 interests the student stated, linked to the major.
  3. **Proof:** one real thing from the conversation: a course, a grade, a project, a skill, a job. If there is none, use what they plan to study (for example "I'm starting [first course from key_courses] this year").
  4. **Ask:** what they want, plus a question for the recruiter: "I'm looking for a summer internship in [area]. What do you look for in interns on your team?"
- **Only true facts.** Use what the student said or uploaded. Unknowns go in [brackets]. Never add experience, awards or skills they did not mention.
- **First-year students:** it's fine to say they are early in the program. Focus on curiosity and what they want to learn.

## Step 4: Delivery tip
Give one short tip, 2-3 lines. Pick the one that fits the student best:
- Say it out loud 3 times with a 30-second timer, then cut any word you trip on.
- Smile, make eye contact and shake hands before you start. Slow down: the pitch is a conversation starter, not a speech.
- End with your question, then listen. Ask for the recruiter's name or card and follow up within 24 hours.
- If English is not your first language: speak slowly, keep short sentences, and practice the first and last line until they feel easy.

## Output format (headings in the student's language, pitch in English)
````
### Career fair prep: <major name>
**Events for you:**
- <event name> — <date>, <time>, <location> (<upcoming / already happened / date not announced>)
**Your 30-second pitch:**
> <pitch, 70-90 words>

**Summary in your language:** <only if the student does not write in English>
**Delivery tip:** <2-3 lines>
**Before the fair:**
- Set up your profile on the job portal in `career_resources` and check which employers are coming.
- Bring a one-page resume. Your career center (in `career_resources`) can review it.
**Source:** <event source url> (checked <date>)
````
End with: "This is guidance, not a decision. You choose what fits you best."

## Rules
- Never promise internships, interviews or jobs.
- Don't name specific employers unless they appear in `catalog.json`.
- Keep it to one pitch. Offer a second version (more technical, or for a different area) only if the student asks.

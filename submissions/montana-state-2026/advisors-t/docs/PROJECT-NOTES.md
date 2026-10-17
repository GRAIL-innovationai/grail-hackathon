# Campus Advisor: project notes (updated 2026-10-17)

## How to run
Double-click `START.bat` in the main folder. See `README.md` for details.

## What the app does
1. **Step 1: choose a university.** Montana State University (Bozeman), Montana State University Billings, Montana Technological University (Butte) or University of Montana (Missoula).
2. **Step 2: sign in** (or create an account). Conversations are saved per account and remember their university.
3. **Chat with the advisor** for that university: major matching, first classes from an uploaded transcript, advisor emails, career fair prep with an elevator pitch, in English, Spanish, Portuguese, French or Chinese.

## Files to edit
| To change | Edit |
|---|---|
| A university's majors, advisors, events, colors | `universities/<id>/catalog.json` |
| Add a university | new folder `universities/<new-id>/catalog.json` (same shape; `id` = folder name) |
| How the advisor behaves | `agent-prompt.md` and `skills/*/SKILL.md` |
| The page | `static/index.html`, `static/main.css`, `static/main.js` |
| Server, accounts, database | `main.py` |

Restart `START.bat` after editing data or skills.

## Decisions
- Visa and immigration topics are out of scope.
- Nothing is invented: unknown facts are [placeholders] or "not available in the catalog yet".
- Emails and elevator pitches are in English, with a summary in the student's language.
- Colors come from each university's brand guide (web values).
- Chat and transcript upload need an account, so the API key isn't open to the internet.

## Data notes (checked 2026-10-17)
- Fall 2026 career fairs have passed at all four schools. Spring 2027 dates: MSU Billings has Jobs & Java (Feb 17) and a Virtual Internship & Job Fair (Mar 31); the others are not announced yet.
- Job portals: MSU HireABobcat (Handshake), UM Handshake, Montana Tech Career Forge, MSU Billings CareerLink.
- MSU Billings has no computer science bachelor's in its 2026-2027 catalog.
- Montana Tech's brand page lists green as #315338 but its RGB values match #3F543C; the app uses #315338.
- MSU Data Science has thin data on purpose (tests the "limited data" behavior).

## Also available
The Claude-hosted student page (works inside Claude, uses each student's Claude account): https://claude.ai/artifact/T2wpv9f4LdzBkizvE2pXkG

## Before a public launch
HTTPS hosting, password reset and email verification, native-speaker review of PT/FR/ZH, and backups of `campus_advisor.db`.

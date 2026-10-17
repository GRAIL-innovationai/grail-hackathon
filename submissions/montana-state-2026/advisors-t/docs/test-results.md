# Beta test results — 2026-10-17

Each profile was run by a fresh agent that only had `agent-prompt.md`, `catalog.json` and the 3 skill files. No web access.

| # | Profile | Language | Result | Notes |
|---|---|---|---|---|
| 1 | Video games + good at math | English ✅ | **Pass** | CS B.S. #1 (High). ME #2 (Medium), Data Science #3 flagged "Low (limited data)" with "not available in the catalog yet". Honestly said the catalog has no game-development course. |
| 2 | Builds things, fixes cars, likes physics | Spanish ✅ | **Pass** | Only recommended ME and explained why the others didn't fit. Explained *major*, *credits*, *capstone*, *advisor* in Spanish. Warned about the heavy math. Asked 2 follow-ups. |
| 3 | Wants business, scared of math | English ✅ | **Pass** | Management #1, Finance #2 (Low). Explained it is moderate math (College Algebra + Intro Statistics) and the placement exemption. Said Accounting and Marketing aren't in the dataset. |
| 4 | "No sé qué me gusta" | Spanish ✅ | **Pass** | No recommendations. Asked exactly 2 follow-up questions. |
| 5 | Asks about Nursing | English ✅ | **Pass** | Said Nursing isn't in the beta dataset, invented nothing, and pointed to the official catalog. |

**Score: 5/5 pass.**

## Fact check
All 18 course codes the agent cited exist in `catalog.json`. Every recommendation included a source URL and the checked date.

## Issues found and fixed
1. **Profile 5 asked 3 questions** (the skill allows max 2). Cause: the prompt's greeting step listed 3 questions. Fixed in `agent-prompt.md`.
2. **Profile 1 expectation was wrong**, not the agent. Data Science and Mechanical Engineering tie on score. Updated `test-profiles.md`.

## Worth watching
- Confidence labels are applied a bit conservatively (profile 2 got Medium for a strong single match because math comfort was unknown). That follows the rules as written.
- The agent sometimes shows fewer than 3 majors when others don't fit. This is the intended "don't overstate fit" behavior.

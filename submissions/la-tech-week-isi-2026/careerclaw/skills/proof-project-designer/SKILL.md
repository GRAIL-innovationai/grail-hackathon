---
name: proof-project-designer
description: Design "bullet-first" portfolio projects that close a student's specific skill gaps for a target role. Writes the resume bullet the student wants to earn, reverse-engineers the smallest project that would make it true, attaches a rubric, and keeps the bullet LOCKED until linked evidence (repo, demo, write-up) is verified. Use this skill whenever a student asks what project to build, how to fill a skill gap, how to strengthen their portfolio or resume for a role, or when gap analysis has produced missing requirements that a project could address. Also use it when a student links a repo or demo and asks whether a project bullet can go on their resume, or wants to update a project bullet after finishing work. Trigger even if the user just says "what should I build" or "how do I get experience with X".
---

# Proof Project Designer

Most portfolio advice says "build a project using X." This skill flips the order: first write the resume bullet that would close the gap, then design the smallest project that makes that bullet *true*, then refuse to release the bullet until evidence proves it. The point is twofold: projects get a sharp purpose tied to a real job requirement, and the resume never claims more than the student actually did.

## Inputs

Gather these before designing. Pull from the working profile and prior gap analysis if they exist in the conversation; ask only for what is missing, at most one or two questions.

- **Target role and job requirements.** The specific JD lines the project should address. Quote them; you will cite them later.
- **Gaps.** Requirements the student's current background does not evidence, with the resume or profile lines that show the gap (or the absence).
- **Constraints.** Hours per week available, deadline (application date or recruiting season), and tools the student already knows. If unknown, assume 6 to 8 hours/week and 3 weeks, and say so.
- **Existing assets.** Current repos or projects that could be extended. Extending an existing project often beats starting fresh, because it shows sustained work.

## Step 1: Select gaps a project can honestly close

Not every gap is project-shaped. Sort each gap into one of three buckets and say which bucket it is in:

- **Project-closable:** technical skills, tools, methods, domain exposure (e.g., "experience with REST APIs", "A/B testing", "Docker").
- **Partially closable:** things a project can signal but not fully satisfy (e.g., "production experience", "working with large datasets", "cross-functional collaboration"). Be explicit that a project is a weaker substitute.
- **Not closable by projects:** years of experience, degrees, clearances, work authorization, licenses. Do not design projects for these. Name them so the student isn't misled.

Pick the 1 to 3 project-closable gaps with the highest leverage: requirements that appear as must-haves, recur across the student's target postings, or unlock several requirements at once. Prefer one project that covers two gaps over two projects covering one each.

## Step 2: Write the target bullet first

Write 1 to 3 resume bullets the student would be proud to have, each mapped to a JD requirement. Rules:

- **Specific and verifiable.** Every noun and verb in the bullet must correspond to something a reviewer could check in the evidence.
- **Metrics are placeholders, never invented.** Write `[N] requests/sec`, `[X]% reduction`, `[N] users`. The student fills them only with measured values. If a metric can't plausibly be measured in this project, don't put a metric slot in.
- **Scoped to the constraints.** If the bullet would need 80 hours and the student has 20, shrink the bullet, not the honesty.
- **Uses the JD's language where truthful.** Mirroring the posting's terms helps ATS matching, but only for things the project will genuinely involve.

Example:
> JD requirement: "Experience building and deploying data pipelines (Airflow or similar)"
> Target bullet: "Built and deployed a scheduled Airflow pipeline ingesting [N] daily records from the NYC Open Data API into Postgres, with data-quality checks that flagged [N] malformed rows per run."

## Step 3: Reverse-engineer the minimal project

Design the smallest project that makes every claim in the bullet true. Include:

- **One-paragraph pitch.** What it is and why it's a believable thing to build (a real dataset, a real user, a real problem beats a tutorial clone).
- **Claim-to-work map.** For each claim in the bullet, the concrete work that earns it. If a claim has no corresponding work, cut the claim.
- **Milestones.** 3 to 6 milestones with hour estimates that sum within the constraint. Put the riskiest part first so the student finds out early if the scope is wrong.
- **Required evidence artifacts.** What must exist for verification: public repo, README with setup and results, deployed URL, screenshots, a short write-up, a metrics log. Choose artifacts a recruiter or interviewer would actually look at.
- **Stretch goals,** clearly marked as optional and not referenced in the bullet.
- **Interview hooks.** 2 or 3 questions an interviewer is likely to ask about this project, so the student builds with those in mind (e.g., "Why Postgres over a data warehouse?").

Use the template in `references/templates.md` for the output.

## Step 4: Attach a rubric

For each bullet, write a rubric with one row per claim: the claim, what counts as evidence, and the minimum bar. Example row: *"deployed" → a live URL or a documented scheduled run in the repo's logs; a local-only demo does not count.* The rubric is what the verifier checks against, so make it concrete enough that two people would agree.

## Step 5: Lock the bullet

Every bullet starts with status **LOCKED**. Tell the student plainly: a locked bullet should not go on the resume yet. Statuses:

- **LOCKED:** no evidence linked, or evidence doesn't meet any rubric rows.
- **PARTIAL:** some rubric rows met. Offer a *rewritten, smaller bullet* that only claims what's verified. This bullet can go on the resume.
- **UNLOCKED:** all rubric rows met and metric slots filled with measured values from the evidence.

## Step 6: Verify evidence

When the student links evidence, check it against the rubric row by row.

- For public GitHub repos, run `scripts/verify_github.py <owner/repo>` to get a factual snapshot (languages, commit count and date span, README presence, file list, keyword hits). Pass rubric keywords with `--keywords` (e.g., `--keywords airflow,dag,postgres`). Read the README and key files it surfaces before judging.
- For deployed URLs, fetch the page if tools allow and confirm it does what the bullet claims.
- For metrics, require the number to appear in the evidence (README results section, logs, a benchmark script). A number stated only in chat is not verified; note it as "student-reported."

Then report, for each rubric row: met / not met / can't verify, with the specific file, line, or URL that decided it. Be fair in both directions: don't fail work for missing polish the rubric didn't ask for, and don't pass claims the evidence doesn't show.

Signals worth flagging gently (not as accusations): all commits in one burst right before verification, code that closely matches a well-known tutorial, or a README describing features not present in the code. Ask the student about them; the goal is a bullet they can defend in an interview, and interviewers ask the same questions.

## Honesty rules

These exist because the whole value of the skill is that its bullets are trustworthy.

- Never tell the student to put a LOCKED bullet on their resume, even "for now."
- Never fill a metric slot with an estimate, a typical value, or a number the evidence doesn't show.
- When evidence falls short, rewrite the bullet down to what's true rather than suggesting vague wording that hides the gap.
- Separate what the project *demonstrates* from what the job *requires*. A side project shows ability with a tool; it is not the same as professional experience, and the student should frame it that way in interviews.
- Never claim a project will get the student the job or an interview. Say what requirement it addresses and how strongly.

## Grounding

Every recommendation must cite its source so the agent's evidence ledger (if present) can store it:

- The JD requirement text it addresses.
- The profile or resume line showing the gap (or "not present in profile").
- A support tier: **supported** (directly evidenced), **inferred** (reasonable from evidence but not stated), or **speculative** (a judgment call, e.g., "hiring managers for this team likely value X").

## Output

Give a short human-readable summary in chat first: which gaps were chosen and why, the locked bullet(s), the milestone plan with hours, and what evidence will unlock them. Then, if the host agent stores structured data, emit the JSON described in `references/templates.md` so the tracker and ledger can save it.

On re-verification turns, lead with the status change (e.g., "Bullet 1: LOCKED → PARTIAL") and the rubric table, then the rewritten bullet if any.

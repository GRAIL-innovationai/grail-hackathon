# Scout

## Team

**Team name:** Scoutathon

| Name | GitHub |
|---|---|
| Adam Grasmick | @AdamGraz |
| Aspynn Jenkins | No GitHub account |

## Summary

Scout helps students turn their background and career goals into evidence-grounded job shortlists, tailored application drafts, and focused interview and coding practice. It connects public employer postings, personal context, an application tracker, and consented Groq AI workflows in one locally hosted workspace. Students review source evidence and accept proposals before saved materials change.

## How to run

Requires Node.js 26 or newer. From this team folder:

```bash
npm ci
npm start
```

Open http://127.0.0.1:4173. For AI workflows, copy .env.example to .env and configure your own Groq Free-plan key without a payment method; restart the server. The app runs without a key for manual tracking and browsing curated content. Never commit .env or data/. Run npm test and npm run check:public to verify.



Your next chapter, with a clearer direction. Scout is an independent, self-hosted career workspace for discovering roles, preparing applications, practicing interviews, and developing skills. Axis supplies design guidance; Axis and Mentis are not runtime dependencies. All source, installed dependencies, private configuration, and SQLite data stay under this folder.

## Run and test

Requires Node.js 26 or newer.

```bash
npm ci
npm start
```

Open http://127.0.0.1:4173. Keep the terminal running; Ctrl+C stops it. Restart after backend or .env changes. Frontend edits appear after refresh. To choose a different port, use `PORT=4175 npm start`. Direct file:// opening is unsupported because the UI needs its local API.

```bash
npm test
npm run check:public
npm audit --omit=dev
```

October 17, 2026: all 153 tests pass. Coverage includes domain/state, exact quotes, SQLite persistence and conflicts, discovery, coaching, interviews, reviewed updates, auth/quota protections, document extraction, and job-linked coding attempts. A live Groq structured-output connection check succeeded using 168 tokens of synthetic input/output; no personal profile was shared. Full workflows are tested with mocked model responses and isolated browser fixtures rather than spending additional live quota.

## Working in another session

This folder is an independent Git repository. Start other sessions in their own branch and Git worktree to avoid changing this checkout's files underneath a running session. Merge their committed changes back into `main` after review and `npm test`. Each worktree needs `npm ci`; `.env` and SQLite data are intentionally private and do not travel through Git. Do not copy a live SQLite database between running servers.

## Personal testing flow

1. **Profile:** enter your name, location, target role and skills. Upload TXT, Markdown, PDF or DOCX, or paste resume text. Text is extracted locally; review it and save. Files are limited to 2 MB and text to 20,000 characters. Image-only PDFs need pasted text; there is no OCR. Uploaded files are not retained.
2. **Discover:** describe your goal in the inline Scout assistant, inspect the selected profile context, and consent. Groq plans queries and selects supported public employer boards (Stripe, Cloudflare, Figma, GitLab); the backend retrieves actual listings and Groq ranks a bounded candidate set. Inspect fit reasons, gaps, exact listing quotes, source links, search criteria, and retrieval dates, then explicitly save roles to Applications. A run uses at most two AI attempts; no-match runs use one. Completed research persists and reopens without another AI/source call. This is selected-board research, not an exhaustive web search or proof an opening remains available. A curated employer-posting catalog and manual posting entry remain separately labeled below it.
3. **Applications:** each role keeps separate resume notes, cover letter, outreach, and stage. **Generate review & drafts with AI** creates initial drafts from your saved resume/profile and selected posting; existing fields may be blank. Give consent, inspect source quotes and generated drafts, then explicitly accept. Download saved drafts as plain text. Open the application URL to apply yourself; nothing submits automatically.
4. **Tracking:** change Saved / Preparing / Applied / Interview / Offer / Accepted / Rejected manually. Offer means an offer was received; Accepted means you accepted it and is excluded from active-search counts. Review company update can load a fictional invitation, accept pasted text, or import an EML/TXT message. Consent to AI classification, inspect the exact evidence, then explicitly apply a suggested status. Offer acceptance is manual, never inferred from an email. This does not read a mailbox or verify a sender.
5. **Interview Prep:** choose a saved role and behavioral, technical or mixed practice. Optionally load and explicitly include a dated employer-posting summary for a known catalog role. Consent to sharing the bounded resume, role and answers. The AI adapts questions and feedback to your answers. Sessions persist and can be resumed; each is capped at 12 answers. Workspace changes invalidate a session's old context, so start a fresh session after editing the profile/role. Questions are practice exercises, not confirmed employer questions.
6. **Development / Project coach:** add a project link and notes, then select or paste up to five source files (8,000 characters each; 20,000 total). Choose an optional target role, consent, and review findings with exact filenames/line quotes plus achievable tasks and completion criteria. Add improvement tasks to Overview only after review. No repository download or code execution occurs.
7. **Development / Coding coach:** paste a problem and solution, choose language, topic, difficulty, optional role, and hints-only mode. Consent to a review of correctness reasoning, source evidence, complexity assumptions, hints, weaknesses, and next-practice suggestions. Recent coding rows have **View my attempt**: view or save a solution, language, notes, and a self-reported outcome. Three original demo exercises contain varied first-party examples, clearly labeled; custom logs never receive fabricated examples. Attempts save to SQLite without replacing your profile. Code is never run. LeetCode logging remains manual.

The general floating Scout assistant remains labeled sample navigation/guidance. Real AI is in Discover and the focused role-review, project, coding, interview, and message-review workflows.

## Recommended next problems

Interview Prep and Development show five problems for a selected role whose stage is **Interview**. Recommendations use listing skills/description and recent coding feedback for that role, including SQL practice for data roles. The catalog links twelve free LeetCode problems. Curated Google/Amazon candidate reports show historical company mentions with dates and links; unsupported companies receive clearly labeled role practice, not invented company questions or frequency estimates.

Start an attempt, solve on LeetCode, save your solution/reflection locally, and manually mark it complete. Progress and per-role attempts persist in SQLite. **Review my attempt** prefills the coding coach with the problem, solution, and target role; inference still requires explicit consent. Recommendations themselves spend no LLM quota. There is no LeetCode login, submission import, or code execution.

## How context works

Profile includes **About you** for up to 6,000 characters of experiences, achievements, interests, values, and work preferences. Type or paste notes, or import TXT/Markdown (up to 2 MB); imports append for review before **Save profile**. The optional field persists in SQLite and older profiles remain valid. Job research previews/sends up to 3,000 background characters (2,000 for ranking); application reviews preview/send up to 6,000 and may cite exact profile evidence. Background can support cover-letter/outreach drafting without resume text. Saving or importing alone makes no AI request; explicit workflow consent is still required.

| Workflow | Context sent to the model | Useful result |
| --- | --- | --- |
| Discover research | Target, skills, location, resume excerpt (2,500 characters), and up to five short real project summaries; the ranking call uses a smaller excerpt plus retrieved listing excerpts | A search plan and cited role shortlist, never fabricated listings |
| Application review | Resume (10,000 characters), listed skills/target/location, selected job and description | Evidence-grounded assessment and material drafts |
| Project coach | Only selected source files, target/skills, optional selected job, recent practice and coding feedback | Cited findings, role-relevant improvement tasks |
| Coding coach | Problem/solution, language/topic/difficulty/hints mode, target/skills, optional selected job, last ten practice logs and three coding reviews | Concrete critique and focused practice recommendations |
| Interview coach | Resume (6,000 characters), selected role, explicitly included sourced posting summary, last six turns | Adaptive questions and feedback tied to the answer |
| Company update review | Only selected role metadata and the imported message | Reviewable status proposal with an exact source quote |

These are specialized prompts/workflows sharing one Groq model, not autonomous background workers. No model gets arbitrary access to the computer, all applications, accounts, or the database. Source material and code are treated as untrusted data; exact quotes are checked, but generated interpretations can still be wrong.

## Outside integrations and demo boundaries

| Outside information | Demo behavior | Separate hookup for real use |
| --- | --- | --- |
| LLM inference | Real Groq workflow when a local key is configured; disabled without one | Groq Free-plan key, no payment method |
| Job listings / LinkedIn | Opt-in live public Greenhouse boards for four supported employers; separately labeled curated snapshots and manual entries | Broader permitted job-board/employer APIs; LinkedIn still requires an approved integration, not scraping/automation |
| Company research | Dated employer-posting summaries for known catalog URLs; no verified brief for unknown roles | Permitted company/careers sources with URLs, dates, and identity checks |
| Recruiter email/status | Load fictional message or paste/import selected text; AI proposes status | Gmail/Microsoft OAuth with read-only scopes and review rules |
| GitHub code | Manually selected files and links | Optional GitHub authorization for permitted repository reads and explicit file selection |
| LeetCode progress | Local catalog, cited historical candidate reports, role-linked manual attempts/completion | Broader permitted company-frequency data or user export; no account scraping, premium data import, or submission sync |
| Application submission | External link plus manual stage tracking | Employer-supported application integration; no auto-apply or email sending |

The public Greenhouse reader is read-only: fixed API hosts and board identifiers, HTTPS source links, bounded responses/timeouts, six-hour in-memory caching, and eight source requests per server UTC day. It reports unavailable boards and cached retrieval dates. Starting the app, opening saved reports, and filtering the curated catalog make no external source calls. A separate Remotive adapter remains unused. Only explicitly consented AI generation sends selected context to Groq; public job sources never receive your resume.

## Free-tier key and public-source safety

Create a [Groq API key](https://console.groq.com/keys) using a Free-plan account **without a payment method**. Edit local `.env` and set `GROQ_API_KEY`; `GROQ_MODEL=openai/gpt-oss-20b` selects the open-weight model hosted by Groq, not OpenAI's paid endpoint. Restart `npm start`. Do not paste a key in chat or browser code. The app cannot inspect account billing status; do not upgrade or rely on app limits as a billing guarantee. See [Groq billing](https://console.groq.com/docs/billing-faqs) and [rate limits](https://console.groq.com/docs/rate-limits).

All AI workflows share one in-flight workflow, ten-second spacing, and a persisted limit of 20 model attempts per UTC day. Discovery reserves each of its at most two model calls individually, so two full discovery runs use four attempts. Failed calls count too. Requests have bounded input/output and timeouts; there are no automatic retries, paid search tools, provider fallbacks, arbitrary browsing, code execution, emails, or submissions. Review results before acting on them.

The Node API listens only on loopback and checks Host, Origin, Fetch-Metadata and a process-memory browser token. It caps JSON bodies, sets security headers, and serves only an explicit public-asset allowlist. `.env`, database/server files, and installed dependencies are not downloadable. This is single-user protection, not multi-user internet authentication. Public source is supported; public runtime hosting requires login and per-user authorization first.

`.env`, `data/`, database sidecars, logs, temporary fixtures, and recovery exports are git-ignored. `.env.example` has placeholders only. `npm run check:public` checks candidate files before Git initialization or tracked filenames/key-like literals afterward. Inspect staged files before publishing; the checker cannot prove every sensitive datum is absent or remove previously committed secrets. Revoke any leaked key.

## Storage and architecture

Canonical data lives in ignored `data/career.sqlite`: workspace state/revisions and coding attempts, material proposals, coaching reviews, discovery reports, interview sessions, imported company messages/status proposals, and usage counts. It survives browser and server restarts. SQLite/browser caches are not encrypted vaults. Existing browser data imports only when the database is empty; updates preserve an existing personalized profile and projects.

Workspace writes use revision checks to prevent silent overwrites. On failed saves, export the recovery copy before reloading. Pending material proposals and coaching reports keep their original context. Suggestions are not imported automatically, and stale results cannot overwrite newer state.

- Frontend: `index.html`, `styles.css`, `views.js`, `app.js`, `coach-ui.js`, `journeys-ui.js`, `discover-ui.js`, `practice-ui.js`.
- Shared validation: `core.js`.
- Node API and SQLite: `server.cjs`, `storage.cjs`.
- AI: `llm.cjs`, `coaches.cjs`, `interview.cjs`, `updates.cjs`, `discovery.cjs`; bounded public job retrieval: `discovery-sources.cjs`.
- Local resume parsing: `resume.cjs` and isolated `resume-worker.cjs`, with pinned PDF/DOCX dependencies. A dependency override removes a vulnerable unused CLI formatter chain; real extraction tests still pass.
- Mock sources: `demo-data.cjs`. No Java backend, Axis dependency, or Mentis dependency is used.

## Curated reference content — October 17, 2026

Six real internship postings from Circleback, Primer, Pylon, and Harvey replace the fictional employer catalog. Titles, locations, eligibility notes, and links were checked against the employers’ public Ashby posting APIs; search-index-only listings absent from the current board were excluded. These are dated snapshots, not guarantees that applications remain open. See the employer links on each card. Summaries are paraphrased, not verbatim job descriptions.

The initial profile, application stages, practice dates, example solutions, tasks, scripted general chat, and optional sample recruiter message remain explicitly illustrative. Real postings do not establish that Alex applied or interviewed. Public repositories are labeled external learning references, excluded from personal discovery evidence, and never claimed as the user’s work. No private person’s resume or messages were sourced.

On page startup, only exact untouched legacy job/project fixtures are upgraded through the normal revision-checked save. Modified records, profile fields, deleted records, and practice attempts are preserved; a conflict uses the existing recovery flow. No database reset is required. Restart the Node server and refresh to load the updated backend catalog.

Coding practice links to [Two Sum](https://leetcode.com/problems/two-sum/), [Valid Parentheses](https://leetcode.com/problems/valid-parentheses/), and [Merge Intervals](https://leetcode.com/problems/merge-intervals/). Full statements and execution stay on LeetCode. Local attempts retain the user’s solution, comments, outcome, and coach feedback. There is no submission sync or local code execution.

## Google search option

Discover includes Search Google, which opens the typed brief in Google without using AI quota. Results are not automatically imported; add an individual posting through the manual form. Without a Serper key, Research roles remains limited to the configured employer boards.

For automatic Google result retrieval, add SERPER_API_KEY to the ignored local .env and restart npm start. Use only free Serper credits with no payment method or auto top-up. Each run sends one bounded public query to the fixed Serper endpoint, with up to ten results and six-hour caching. Groq ranks retrieved snippets against the selected profile after consent. Snippets are labeled as unverified leads: employer, location, eligibility, and availability require checking the source page. No result URLs are fetched by the backend. Provider errors do not silently fall back or retry. This optional integration has mocked tests; no live Serper request has been made.

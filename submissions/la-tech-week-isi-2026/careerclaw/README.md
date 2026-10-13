# CareerClaw — Evidence-Grounded Agentic Career Coach

## Team

**Team name:** CareerClaw

| Name | GitHub |
|---|---|
| Zihan Jin | @Zihan-Zoe |
| Mansimran Kaur | @simzz27 |

## Summary

CareerClaw is an evidence-grounded career-coaching demonstration for students preparing internship applications. It uses uploaded or pasted documents and job descriptions to provide evidence-linked job matching, resume advice, proof-project planning, outreach drafts, interview preparation, and application tracking. Nine portable agent skills, synthetic demo data, and optional OpenRouter drafting help students turn documented experience and skill gaps into practical next steps without inventing qualifications.

## How to run
Requires Python 3.10+. Install `requirements.txt` for PDF/DOCX document extraction.

```bash
cd submissions/la-tech-week-isi-2026/careerclaw
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python app.py
# Open http://127.0.0.1:8765
```

Run these commands from the repository root. On Windows, activate the environment with `.venv\Scripts\activate` instead.

Click **Load demo dataset**, then **Analyze jobs & generate plan**. Inspect `JD:line` and `RESUME:line` references by expanding requirements. Update resume/target, enter a JD, and rerun.

## Proof Project Designer

Choose a saved job in the Proof Project Designer section, set hours per week and weeks, and generate a project. The deterministic adapter implements the bundled skill's gap classification, bullet-first plan, rubric and locked-bullet workflow. It reads the skill and template to record a revision fingerprint; it is not a general Markdown skill interpreter or an LLM-generated project designer. Plans, notes, evidence snapshots, and status history are persisted in SQLite per browser session.

Enter a public GitHub repository URL and 1-5 text-file paths, then check the evidence. Files are pinned to a commit. Retrieval alone never unlocks a claim. For each rubric row, a human reviewer selects a decision, gives a reason, and quotes a checked file for every met claim. Status becomes LOCKED (none met), PARTIAL (some met), or UNLOCKED (all met). This verifies the quote exists, not the semantic truth of the review, authorship, runtime behavior, or metrics. Rechecking evidence resets all claim reviews. Only the human-reviewed smaller bullet is available for a partial result; unverified metrics are never generated.

API routes: `proof_generate`, `proof_list`, `proof_save`, `proof_check`, and `proof_review` (all POST under `/api/`, with `sid`). Save/check/review require the project's `id` and `updated` value to reject stale changes. No GitHub token or OpenRouter key is needed. GitHub anonymous rate limits apply.

## Remote position search

The Find remote positions section searches Remotive listings by keywords, candidate location, and job type. Add results to your shortlist for the existing evidence-based assessment. Listings link to Remotive, are delayed by 24 hours by the provider, and are cached for six hours in the running server. This source covers remote positions only; location matching is text-based and does not verify work eligibility. Other positions can still be added manually. Search needs internet access but no API key.

On macOS, if Python cannot verify the provider's HTTPS certificate, start with `SSL_CERT_FILE=/etc/ssl/cert.pem python app.py` to use the system certificate bundle.

## OpenRouter

Optional API-generated drafting uses the organizers' key (subject to model availability). Export on your own computer:

```bash
export OPENROUTER_API_KEY='YOUR_KEY'
export OPENROUTER_MODEL='MODEL_ALLOWED_BY_YOUR_KEY'
python app.py
```

Neither key nor actual student documents belong in GitHub. The deterministic matching/report continues offline without OpenRouter. Output is labeled as advice, not certainty; model-generated drafts are unverified suggestions.

## Dr. Claw

This is a **standalone runnable career coach plus Dr. Claw-compatible skill bundle**, not a modified Dr. Claw fork or a tested native Dr. Claw extension. Install skills into an existing Dr. Claw checkout:

```bash
git clone https://github.com/OpenLAIR/dr-claw.git
cd dr-claw && npm install && npm run dev
# From this CareerClaw folder in another terminal:
bash scripts/install_drclaw_skills.sh /absolute/path/to/dr-claw
```

Restart Dr. Claw, copy `AGENTS.md` into the chosen career project, and verify the selected backend discovers the skills. The standalone app's REST tools are **not** wired into Dr. Claw's chat automatically; that requires a separate adapter. Dr. Claw offers its own OpenRouter chat backend.

## What is implemented

- Chat-like guidance, student profile fields and up-to-3 clarifying questions.
- Resume, LinkedIn export/text, projects and transcript input via paste; target-role and constraint inputs.
- JD ingestion from pasted text or public HTTPS URL (best effort; no login/JS rendering).
- Heuristic job match rankings; top missing documented skills, resume improvements, proof-project portfolio planning, outreach draft, mock interview questions, and a two-week action plan.
- Exact source-line references for comparisons; the text behind references appears on hover.
- Clear uncertainty notes, no hiring probability claims.
- Nine portable `SKILL.md` files and SQLite tracking endpoints.

## Limitations before claiming full requirement satisfaction

1. Standalone UI supports pasted content and PDF/DOCX/TXT/MD extraction, but LinkedIn URL alone is stored as text, not scraped.
2. Matching is deterministic heuristic word/skill overlap, not a calibrated semantic ranker; borderline citations need review.
3. Interactive chat falls back to simple clarifying questions/guidance. Full freeform multi-turn LLM chat, autonomous multi-skill tool-calling, and persistent conversational memory need further integration.
4. Resume improvements are suggestions for rewriting, rather than guaranteed polished rewritten bullets; optional OpenRouter adds draft ideas.
5. No real multi-user authentication. App binds to localhost, and sample students/jobs are synthetic. Never deploy it publicly or enter real private student data without authentication, isolation, privacy review, and consent.

## APIs

The two-week plan currently cycles through gap-based suggestions, or repeats a fallback task when no actions are available. It is not yet a sequenced personalized schedule.

`POST /api/profile`, `/api/job`, `/api/jobs`, `/api/demo`, `/api/analyze`, `/api/chat`, `/api/track`, `/api/tracker_list` and `GET /health`. JSON requires an `sid` string. To create a tracker item POST `/api/track` with `sid`, `job_id`, `status` (saved, preparing, applied, interviewing etc.), `next_action`.

## Tests

```bash
python -m unittest discover -s tests -v
```

## Hackathon submission

This project is submitted under `submissions/la-tech-week-isi-2026/careerclaw/`. From the repository root, validate it with `python3 scripts/validate_submission.py submissions/la-tech-week-isi-2026/careerclaw`. `.env` and runtime databases are excluded.

## Credit

Architectural inspiration: [Dr. Claw](https://github.com/OpenLAIR/dr-claw) and [career-ops](https://github.com/career-ops-hq/career-ops). Neither upstream repository's application code has been copied or bundled; check their licenses if you choose to integrate their code later.

## Document upload (new)

Install document extraction dependencies with `pip install -r requirements.txt` before running `python app.py`.

The Student Profile section now has a multi-file upload field with a document-category selector. Choose **Resume**, **LinkedIn**, **Project list**, or **Transcript**, upload PDFs, DOCX, TXT, or MD files (maximum **3 MB per file**), and click **Extract & add to profile**. You can review and edit the extracted text before clicking **Save / update profile**. The Job Descriptions section also accepts a document file; click **Extract JD** and then **Add job**.

PDF extractions carry `[Page N, line M]` labels; Word files carry `[Paragraph N]` and `[Table N, row M]`; text files carry `[Line N]` labels. The recommendation engine retains its `RESUME:N` / `TRANSCRIPT:N` IDs, whose cited text contains the original document location. PDF line numbering refers to extracted text lines, not the PDF's visual layout. DOCX pages do not have stable page numbers, so paragraph/table labels are used. The app **does not support OCR** for scanned or image-only PDFs. Extracted text is submitted to the local server and stored in the local SQLite database; uploaded file bytes themselves are not retained.

Note: This is still a local development demo, not an authenticated multi-user server. Avoid sensitive student records until authentication, isolation and data-retention policies have been implemented. Protect API keys using environment variables and do not commit personal files.

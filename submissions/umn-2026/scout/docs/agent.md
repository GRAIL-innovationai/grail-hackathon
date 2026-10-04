# Scout research agent

The CLI and local Scout website use the same research agent. It uses your local OpenClaw gateway and the ChatGPT account you explicitly authorize there. No OpenAI API key is required, and the CLI never calls the direct API-key adapter.

## Start

Use the Node version supported by the pinned OpenClaw runtime (Node 24.16+ within version 24, or 26.1+).

```sh
npm run openclaw:setup
npm run openclaw:login
npm run openclaw:start
```

Keep the gateway running. In another terminal:

```sh
npm run agent
```

Setup upgrades the exact older four-tool or eleven-tool project allowlist to the new research tools while preserving account and model settings. A customized allowlist is not overwritten; compare it with `shared/research-tool-names.json` if the gateway rejects a new tool. Restart a running gateway after upgrading its configuration.

The CLI saves successful turns to `.research-agent/session.json` with owner-only file permissions. `/state` shows the whole workspace; `/profile` shows the student profile; `/resume /absolute/path/resume.pdf` reads a PDF and asks for confirmation before adding its text; `/reset` asks before clearing this session; `/quit` exits. A failed turn leaves the previous saved session intact. OpenClaw may separately retain transcripts; clearing the CLI session does not clear those records.

For a single turn or a separate student/session:

```sh
npm run agent -- --message "I know basic Python. I have 3 hours a week and want to explore learning analytics."
npm run agent -- --session /absolute/path/student-session.json
```

## Local Scout website

With the gateway running, start `npm run dev` and open http://127.0.0.1:5173. Research agent is the default mode. The website posts to `/api/agent`, which calls the same `runOpenClaw` / `ResearchTurn` loop as the CLI. It streams tool progress; browser state is updated only when a final result arrives. A failed or interrupted turn keeps the previous plan and offers retry without duplicating the user message.

Chat, direction selection, plan revision, faculty matching, and email drafting all use the agent. Task checkboxes and manual profile/email edits are saved locally and included in the next turn. Changing weekly availability preserves existing tasks and completion so Scout can revise them on request. Chat is available alongside the plan and email editor. Demo mode is disabled while agent-authored tasks or a draft are present to avoid replacing them with templates.

PDF resumes are read **in the browser**, using the same extraction limits as the CLI. Review the extracted text, choose “Use this text as experience”, then save your profile. Neither the PDF nor unconfirmed preview is sent to the agent; confirmed background is included in subsequent requests. There is no OCR. The website and CLI have separate session stores; neither silently imports the other's conversation. Existing browser storage keys are retained across the rename to Scout.

The hosted cloud preview has not been changed or deployed. Gateway tokens and subscription credentials remain local to the app server and OpenClaw; the browser receives neither.

## Agent behavior

The model chooses whether to ask questions, retrieve evidence, or change saved work. It can finish a clarification turn without a forced catalog lookup. Model-authored plans and emails are saved through validated tools, not generated afterward by `runDemo`, `createPlan`, or `createEmail`.

- `get_student_context` reads the current profile, evidence, directions, task progress and full draft.
- `update_student_profile` records explicit student excerpts and their provenance. Inferences require a follow-up question; experience quotes retain limitations and negation.
- `search_research_directions` provides optional starter categories and verified resources, not a fixed menu of permitted topics. `save_directions` authors all card fields and can create new topics with stable custom IDs. A category link is optional and used only for resource/faculty lookup. `merge` revises cards by ID; `replace` refreshes options while keeping the selected direction and plan. Later turns retain the authored text instead of restoring catalog templates. Links still require retrieved sources; proposed questions are not presented as verified research findings.
- `save_plan` stores model-authored tasks with effort estimates and concrete outputs. It checks the total weekly budget and retrieved resource URLs. Unchanged task IDs retain completion; completed tasks cannot be silently rewritten or removed within the same direction.
- `update_task_progress` updates a task using the student's current statement as evidence.
- `search_faculty_web` searches public pages using the confirmed university and a short public topic or professor name via Firecrawl keyless starter access. `read_faculty_page` reads a returned URL or same-host link. `save_web_faculty` requires exact name, affiliation and research excerpts from a page read in this turn, then saves a visible card with its source and retrieval date. Search snippets alone cannot create cards. `inspect_professor` personalizes web cards and `save_email_draft` can use them. Source quote presence is not complete semantic fact checking; verify the original page. Failed or rate-limited searches stay visible; any catalog fallback must be labeled.
- `find_faculty` uses the student's actual school and appends deduplicated cards. With `includeRelated=true`, it also considers same-school profiles sharing catalog topic tags; these are labeled as adjacent, not direct specialists. It reports the number added and remaining related candidates so repeated results cannot be described as new. `inspect_professor` also saves named profiles as visible cards, even before choosing a direction. Both retain existing same-school recommendations and edited drafts. The interface clears stale faculty filters when updated results arrive.
- `save_email_draft` saves the actual subject/body and requires supporting student quotes for the claims the model declares. The student must still check factual accuracy: quote presence is not a semantic proof that every statement is entailed or that the model listed every claim.
- `complete_research_step` returns the saved workspace, response, next suggestions and tool activity. Explicit UI actions cannot be declared complete without their save tool succeeding, unless the model requests missing information.

Each tool mutation is transactional. Validation errors go back to the model for correction. Within each turn, the adapter uses the gateway response ID to continue from tool results; IDs are not shared across separate student turns. A failed model request, timeout or exhausted sixteen-round limit returns an error without committing the turn. No email-sending tool is exposed.

## Current boundaries

Direction proposals are authored freely by the model. Faculty facts can come from public university pages retrieved through the three web tools, or the labeled curated catalog. Learning resources still use the catalog. Recruitment openings are not verified. Only university/topic queries and page URLs are submitted to Firecrawl; model instructions prohibit private profile or CV content in queries. Keyless starter access may be rate limited. Server web profiles expire after six hours or a server restart; search again to restore their source-backed records. The CLI reads searchable PDF resumes locally (up to 5 MB, 15 pages and 16,000 extracted characters). It previews the text and saves only after confirmation. The original PDF is not uploaded; confirmed text is included in later model requests as student-provided background. Scanned PDFs need OCR first. Password-protected or unreadable files produce an explicit error. The direct API-key Live adapter and hosted cloud website are separate older paths; the local Scout website uses this agent. Existing saved work from the new agent should stay in OpenClaw mode, because the Demo/older Live adapter rebuilds plans from its templates.

## Checks

```sh
npm test
npm run test:openclaw
npx tsc --noEmit
```

Unit tests script model tool choices to verify state updates, revision, evidence checks, budget repair, and rollback. The integration test starts the real installed OpenClaw gateway with a local deterministic model fixture. These establish tool execution and persistence behavior, not the quality or availability of a real ChatGPT subscription. Only a completed real model turn establishes that account access works.

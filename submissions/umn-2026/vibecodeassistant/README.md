# 👻 GhostQA

> **Autonomous AI users that explore your product, discover failures, and verify bugs before reporting them.**

## Team

**Team name:** VibeCodeAssistant

**Result:** 🥉 3rd place at the [Agentic AI Hackathon — GRAIL × UMN Data Science MS Program](https://cse.umn.edu/cs/events/agentic-ai-hackathon-grail-x-umn-data-science-ms-program) (event `umn-2026`).

| Name | GitHub |
|---|---|
| Anvith Pothula | @AnvithPothula |
| Arush Manem | @arushmanem |
| Giovanni Cerqueira | @giovannicerqueira |
| Jaimin Shah | @jaiminShah159 |
| Norman Swai | @Norman-Swai |
| Xuan Wang | @Borie030125 |

## Summary

VibeCodeAssistant audits AI-built ("vibe-coded") web apps before they ship. Three autonomous AI "ghost" users explore a running app in a real browser, choosing one action at a time from what is on screen, and report a bug only after reproducing it in a fresh session. Connected modules add a runtime crawl of the localhost app (broken pages, crashing forms, exposed stack traces, missing login throttling, and memory that grows on every navigation), static source checks for leaks and broken imports, and a check for required trust pages such as a privacy policy. It is for solo builders and small teams shipping AI-generated code without a QA or security reviewer. Every finding carries evidence, and anything that could not be checked is reported as a gap, never as passed.

## How to run

Requires Node.js 20.9+ (22.6+ for the TypeScript runtime CLI), npm, and Python 3 for the integrated runtime rules.

```bash
npm install
npx playwright install chromium
cp .env.example .env.local   # DEMO_MODE=true works without an API key
npm run dev                  # open http://localhost:3000 and click Deploy Ghosts
```

Optional: add an `OPENAI_API_KEY` or `OPENROUTER_API_KEY` to `.env.local` for live AI decisions and website audits (see Environment Variables below). Run the runtime inspector on its own with `npm run runtime -- http://localhost:3000 --preflight-only`, and its tests with `npm run test:runtime`.

## License

This project is MIT-licensed, the repo default.

GhostQA deploys three ghost users into a bundled demo or a website you are authorized to test. Each receives a goal, observes the current interface, chooses one action, interacts with the website, evaluates the result, and adapts. Suspicious behavior becomes a candidate first. Only evidence reproduced in a fresh browser session becomes a confirmed report.

## 🚀 Problem

Traditional automated testing covers scenarios developers thought to write. Real users change their minds, enter unexpected inputs, navigate differently, and modify state in unusual orders. Unexpected workflows and state-management failures can still reach production.

**What if autonomous AI users could uncover those failures before real users encounter them?**

## 💡 Solution

GhostQA creates users with distinct personalities and goals. Each receives the current browser state, prior actions, and candidate issues, then chooses its next action. The dashboard makes observations, actions, results, investigation, reproduction, and reports visible as they happen.

## Why it is Agentic

This is a browser agent, not a test-case generator. In website audit mode, the model chooses one next action from the changing product state on each turn. Playwright executes it; the next decision uses the resulting observation. The model receives neither source code nor the seeded bug list. Short reasoning summaries explain decisions without requesting private chain-of-thought.

The bundled demo has explicit coverage requirements: valid synthetic email with a password below the visible minimum, removing one of two cart products before checkout, and empty required feedback. Live AI chooses actions from current observations; if it skips these requirements, an explicitly labeled **Demo coverage guard** substitutes an observation-driven action. This is a constrained QA workflow, not unrestricted exploration. Outcomes and reports still come only from actual browser evidence and clean-session replay.

Deterministic demo mode uses an explicitly labeled deterministic policy that also reads the current page to choose an action. It still drives a real browser and performs real reproduction. It is not presented as live AI reasoning, and reports are never hardcoded.

## Architecture

```text
TARGET APP
    ↓
OBSERVE
    ↓
GHOST AGENT
    ↓
CHOOSE ACTION
    ↓
PLAYWRIGHT
    ↓
NEW STATE
    ↓
EVALUATE
   ↙   ↘
CONTINUE  INVESTIGATE
              ↓
          REPRODUCE
              ↓
            REPORT
```

Next.js serves the dashboard, target demo, and run API. One Chromium browser hosts three isolated contexts. Normal mode runs headlessly in parallel; Watch Ghosts mode opens visible windows and runs each ghost in turn. An in-memory run store holds execution state; the dashboard polls every 500 ms. All model calls are centralized in `lib/agents/model.ts`, with OpenAI and OpenRouter providers. Structured output uses the official SDK with Zod validation ([OpenAI documentation](https://developers.openai.com/api/docs/guides/structured-outputs)). Demo evidence checks identify the seeded inconsistencies. Website mode plans goals from the actual landing page, reflects on executed actions, and verifies candidate evidence after replay.

## Agent Loop

1. Load persona and goal; open the target in an isolated context.
2. Observe URL, title, visible text, and interactive elements with temporary IDs.
3. Choose one structured action using current state and history.
4. Execute click, fill, press, or wait through Playwright.
5. Capture the resulting state and compare behavior with visible requirements.
6. For a candidate, replay executed actions in a fresh context using semantic element identity.
7. Confirm only if the same evidence occurs again; otherwise retain an unconfirmed candidate.
8. Continue toward the goal, or stop at 12 decisions. Repeated actions with unchanged state are bounded.

Model-initiated investigation also creates a candidate and attempts replay. Website candidates use bounded text, URL, HTTP-status, and JavaScript-error predicates. Reproduction opens a clean context and replays the actual executed actions. Functional text contradictions also receive an independent AI verdict; ambiguous or failed replay stays unconfirmed. This is best-effort QA, not exhaustive proof.

## Ghost Personas

| Ghost              | Personality                                            | Goal                                              |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------- |
| First-Time User    | Follows obvious navigation and tries a simple password | Create an account and reach the welcome dashboard |
| Impatient Shopper  | Moves quickly and changes cart state mid-workflow      | Add products, remove one, and complete checkout   |
| Edge-Case Explorer | Probes reasonable boundaries and empty inputs          | Find validation or state-management problems      |

## Example Bug

**High — Cart total stays stale after an item is removed**

- Add Everyday Notebook ($18) and Studio Cup ($24).
- Observe two products and a $42 total.
- Remove the notebook.
- Observe one $24 item but a displayed total of $42.
- Replay the workflow in a fresh session; the same mismatch occurs.

Expected: $24. Observed: $42. The report includes the discovering ghost, severity, goal, reproducible steps, expected/observed behavior, reproduction result, confidence, and execution log. Confidence is a fixed evidence-based demo heuristic, not a calibrated probability.

## Tech Stack

Next.js · TypeScript · Tailwind CSS · Node.js · Playwright · OpenAI SDK · Zod. No database, accounts, authentication, or payments.

## Project Structure

```text
app/
  page.tsx                 Dashboard
  globals.css              Dashboard and demo styles
  api/run/route.ts         Start and poll runs
  demo/                    Bundled target
    signup/                Account workflow
    cart/                  Product and cart workflow
    feedback/              Required-field workflow
components/                Ghost cards, activity, reports, status
lib/
  agents/                  Personas, decisions, loop, in-memory store
  browser/                 Chromium, observation, execution, replay locators
  qa/                      Demo / generic detection, reproduction, reporting
  audit/                   Connected runtime, compliance, static, reporting
  security/                Target validation, action restrictions, redaction
  types/                   Schemas and shared types
scripts/
  check-provider.mjs       Real structured-output provider check
  website-smoke.mjs        Live AI on a disposable second website
  runtime_bridge.py        Actual Python runtime rules over browser evidence
  smoke.mjs                Browser-driven end-to-end smoke check
  dashboard-smoke.mjs      Dashboard interaction and report check
```

## Getting Started

Requires Node.js 20.9+, npm, and Python 3 for the integrated runtime rules. These rules use the Python standard library; the standalone Python browser inspector has additional dependencies.

```bash
npm install
npx playwright install chromium
cp .env.example .env.local
npm run dev
```

Open [GhostQA](http://localhost:3000). On Linux, use `npx playwright install --with-deps chromium` if browser system dependencies are missing.

## Environment Variables

Copy `.env.example` to `.env.local`. Never commit a real key. Keys stay on the Node server; the dashboard receives provider name and configuration status only.

| Variable             | Meaning                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `AI_PROVIDER`        | `openai` or `openrouter`                                               |
| `OPENAI_API_KEY`     | OpenAI server-side key                                                 |
| `OPENAI_MODEL`       | Defaults to `gpt-4.1-mini`                                             |
| `OPENROUTER_API_KEY` | OpenRouter server-side key                                             |
| `OPENROUTER_MODEL`   | Defaults to `openai/gpt-4.1-mini`; must support structured JSON output |
| `DEMO_MODE=true`     | Bundled demo uses the deterministic, real-browser policy               |
| `DEMO_MODE=false`    | Bundled demo uses AI when configured                                   |
| `PYTHON_EXECUTABLE`  | Optional Python 3 executable; defaults to `python3`                    |

For OpenRouter, set `AI_PROVIDER=openrouter` and add your key to `OPENROUTER_API_KEY` in `.env.local`. Restart the server after editing the environment. Verify the provider with `npm run check:provider`. This makes a small real API request and prints no credentials. The integration follows [OpenRouter's OpenAI SDK configuration](https://openrouter.ai/docs/quickstart).

**Website audit uses live AI whenever a provider key is configured, even with `DEMO_MODE=true`.** Without a key, it clearly labels heuristic navigation; AI reflection is unavailable. Invalid or failed decisions are retried once, then explicitly labeled as heuristic fallbacks. Demo mode never pretends to be live AI.

## Running GhostQA

```bash
npm run dev                 # local dashboard and bundled target
npm run check:provider      # real provider connectivity / structured-output check
npm run typecheck           # TypeScript validation
npm run build               # production build
npm run start               # serve the production build
npm run test:e2e            # server running, DEMO_MODE=true
node scripts/dashboard-smoke.mjs
node --experimental-strip-types scripts/watch-ui-smoke.ts
npm run test:website        # server + provider key; disposable local second website
```

The server binds to `127.0.0.1`. Open `http://localhost:3000`. Only one deployment runs at a time; the latest ten runs are kept in memory and restarting clears them. Do not expose this unauthenticated hackathon dashboard as a public service.

### Audit another website

1. Select **Website audit** and enter a URL you own or have permission to test.
2. Enter a concrete objective, such as “Explore documentation and contact navigation; identify broken pages.”
3. Confirm authorization. Leave form submission off for navigation and passive checks.
4. Optionally allow non-destructive synthetic form testing on a test environment.
5. Click **Deploy Ghosts**. The planner reads the current page and chooses three website-specific role names, personalities, and goals. If AI planning is unavailable, clearly labeled generic reviewers are used. Each ghost chooses one action at a time from its own current observation.
6. Inspect the live observations/actions, reproduced bug cards, and **Combined audit**. Findings are labeled **reproduced**, **observed**, or **unverified**.
7. Open a finding to inspect evidence and download the combined Markdown report.

Navigation is confined to the target origin. Private-network and metadata destinations are blocked, with an explicit localhost allowance for local development. Destructive/payment routes, password entry, cross-origin navigation, and WebSocket writes are blocked. The default request policy blocks state-changing methods; opt-in forms permit same-origin POST requests. These are best-effort guardrails, not a security sandbox. Even GET requests can have side effects on poorly designed sites, so use authorized test environments.

**Analyze this repository** scans the repository running the server, not the source of a remote URL. Browser agents never receive source code, secrets, or the seeded bug list.

## Demo Walkthrough

**Watch Ghosts:** Enable the checkbox beside the deployment controls to watch real clicks and typing in visible Chromium windows. Watch mode runs the ghosts one at a time at a slower pace, with a banner identifying the current ghost and action. Fresh-session reproduction is visible too. Windows open on the machine running `npm run dev`. Background crawling and goal planning use a separate headless browser. Each visible ghost shows a scrolling observation/action/check/reproduction ledger. After completion, a results window displays actual outcomes and stays open for two minutes (or until another deployment starts). Keep the dashboard open for full reports. This requires a desktop session; leave the option off on a headless server.

1. Start with `DEMO_MODE=true` for a reliable presentation without a key.
2. Open the demo separately to explore little goods, the tiny ecommerce target.
3. Click **Deploy Ghosts** on VibeCodeAssistant.
4. Watch each persona observe its page and choose actions. The activity feed shows actual browser results.
5. Watch candidate issues enter investigation, then fresh-session reproduction.
6. In demo mode, all three seeded issues should produce verified reports.
7. Open a bug card to inspect the evidence and execution log.
8. For live model decisions against the bundled demo, set `DEMO_MODE=false`, configure a provider key, and restart. For a different authorized website, choose Website audit; its goals and actions are AI-selected regardless of `DEMO_MODE`. Website discovery varies with the model’s decisions. The bundled demo’s coverage guard keeps its three boundary workflows reliable.

The three intentionally flawed implementations are marked with source comments. Those comments and this README are never included in agent observations.

## Connected Teammate Modules

**Deploy Ghosts now runs the compatible modules alongside the browser agents and combines their real evidence.** Their standalone demos remain available, but mock outputs from those demos are never inserted into live dashboard runs.

| Contribution                                    | Dashboard integration                                                                                           | Standalone command                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Anvith — `runtime/`                             | Playwright collects real pages, errors, responses, links, and forms; Python runtime rules analyze this evidence | `python -m runtime http://localhost:3000 --preflight-only` |
| Backend — `backend/`                            | Actual deduplication, prioritization, and Markdown reporting functions process live findings                    | `npm run backend:demo` (mock demo only)                    |
| Giovanni — `modules/compliance/`                | Actual checker receives observed text and links; results are policy-discoverability signals                     | `npm run compliance:demo` (sample inputs only)             |
| Jaimin — `.agents/skills/static-code-analysis/` | A bounded source analyzer implements the supplied import, cleanup, and resource checks; opt-in                  | Skill instructions remain available                        |

The runtime crawl visits at most six same-origin pages in 60 seconds. Missing policy links, security headers, and static heuristics are review items, not automatically confirmed vulnerabilities or legal conclusions. Missing Python marks the runtime module unavailable and records a coverage gap.

To run the original standalone Python inspector and its tests:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
python tests/test_runtime.py
```

See [runtime documentation](runtime/README.md), [backend documentation](backend/README.md), and [compliance documentation](modules/compliance/README.md).

### Latest teammate additions

The latest TypeScript runtime inspector is preserved in `lib/runtime/`, including its memory-leak probe, adapters, local-only API at `/api/runtime`, and CLI. Run `npm run runtime -- http://localhost:3000 --preflight-only` with Node 22.6+ (native TypeScript support). The dashboard keeps its previously integrated Python evidence bridge; the new TypeScript inspector is available independently rather than replacing the verified flow at submission time.

Team 1’s separate Vite frontend is preserved under `modules/frontend`, including its contracts, review screens, and mock fixtures. The main live-agent dashboard remains the Next.js app at `/`. To explore the alternate frontend, run `npm install --prefix modules/frontend` followed by `npm run frontend:dev`. Its mock data is separate from live GhostQA results and its API contract is not yet connected to the Next.js run API.

## Limitations

- General website exploration is bounded and best effort. Captchas, authentication, complex widgets, downloads, and cross-origin flows may prevent coverage.
- This is a QA and passive security review tool. It does not exploit vulnerabilities, guarantee coverage, or establish that a site is secure.
- Read-only mode limits functional testing. Opt-in form tests use synthetic inputs and can create data; use a test environment.
- At most 12 decisions and approximately three minutes per ghost, plus bounded individual calls and replay operations. Replay is not a minimized failing sequence.
- Model suggestions can be wrong. Candidates need replay evidence; matching text still requires independent AI verification. Confidence values are heuristics, not calibrated probabilities.
- Compact text observations miss visual defects and some accessibility or canvas behavior.
- Source analysis reviews this server’s repository only. Resource/cleanup heuristics can produce false positives.
- No persistent storage, authentication, cross-process coordination, or production deployment infrastructure.
- Demo signup and checkout simulate outcomes; they do not create real accounts or charge money.

## Future Work

Screenshots and traces, stronger functional verifiers, minimized reproductions, richer accessibility observations, authenticated test-session support, explicit per-action approvals for stateful workflows, CI integration, and persisted run history.

## Teammate Modules

The repository combines the dashboard with independently runnable teammate contributions. **Bundled demo runs use the original three QA personas; website audits use roles tailored to the observed site. The modules below are preserved and runnable but are not yet wired into that dashboard or its bug reports.**

| Contribution                      | Location                                       | Run from repository root                                          |
| --------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| Anvith's Python runtime inspector | `runtime/`                                     | `python -m runtime http://localhost:3000 --preflight-only`        |
| Backend orchestration starter     | `backend/`                                     | `npm run backend:demo` (mock findings, not a live scanner)        |
| Giovanni's compliance checker     | `modules/compliance/`                          | `npm run compliance:demo` (sample signals, heuristic checks)      |
| Jaimin's static-analysis skill    | `.agents/skills/static-code-analysis/SKILL.md` | Instructions for a compatible skill runner; no CLI implementation |

The runtime inspector needs its own Python dependencies. Use a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
python tests/test_runtime.py
```

See [runtime documentation](runtime/README.md), [backend documentation](backend/README.md), and [compliance documentation](modules/compliance/README.md) for details. Compliance lives in a subdirectory to avoid replacing the site's `package.json`, `tsconfig.json`, or README. Its build output is generated locally and ignored by Git.

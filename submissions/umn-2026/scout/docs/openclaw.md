# Research Matchmaker with OpenClaw

The OpenClaw version gives the existing English research guide a local model gateway. It supports conversations, suggested research directions, a weekly learning plan, sourced faculty cards, and editable email drafts. It never sends emails. It asks students which university they attend.

## Start it

Use Node.js 24.16+ within version 24, or 26.1+, and install the app dependencies with `npm install` first. From the project folder:

```sh
npm run openclaw:setup
npm run openclaw:login
npm run openclaw:start
```

The first command installs the pinned OpenClaw 2026.9.8 package if needed and creates local settings. The second opens the official ChatGPT/Codex account sign-in; complete it yourself in the browser. The third runs the gateway in the foreground. Keep that terminal open.

In another terminal:

```sh
npm run dev
```

Open http://127.0.0.1:5173. Select **Settings → Research agent**, click **Check OpenClaw connection**, close Settings, and send:

> I’m a sophomore interested in computer science and education. I haven’t done research before and have four hours a week. Help me find a first step.

Choose a direction, make a plan, and ask to find professors. Enter your own university when asked. For a complete faculty demonstration, explicitly use a fictional student at University of Minnesota Twin Cities.

The connection check verifies the local gateway and its token. A model reply requires successful account sign-in and model access as well. The current default model is `openai/gpt-6-astra`; availability depends on your account.

## Your account and allowance

`openclaw:login` uses OpenClaw's Codex OAuth method with a separate, project-owned account profile. This can use the authorized ChatGPT account's Codex allowance, subject to account access and limits. It does not combine subscriptions, create an API balance, or copy credentials from the Codex desktop app.

For device-code login when the browser callback is unavailable:

```sh
npm run openclaw:login -- --device-code
```

OpenClaw also supports the app-specific **Sign in with ChatGPT (Beta)** flow when your account/workspace has access:

```sh
npm run openclaw -- models auth login --provider openai --method siwc --agent research-matchmaker
```

Approve eligible model/token sharing during that flow; identity-only permission does not enable model calls. See the official [authentication comparison](https://docs.openclaw.ai/providers/openai/authentication) and [account setup instructions](https://docs.openclaw.ai/providers/openai/setup).

To inspect the model catalog:

```sh
npm run openclaw -- models list --provider openai
```

If choosing another supported model, update both `agents.defaults.model.primary` and its entry in `agents.defaults.models` in `.openclaw-local/openclaw.json`. Keep that model's `agentRuntime.id` set to `openclaw`. Validate with `npm run openclaw -- config validate`, then restart the gateway. This setup uses OpenClaw's own runtime with only the research app's tools.

## What this version covers

- Eight starter research directions with introductory resources.
- A weekly plan based on the student's time budget.
- Online faculty search and page reading with source evidence and retrieval dates; eight curated UMN profiles remain a labeled fallback.
- Honest editable email drafts based on confirmed student information.
- PDF resume reading in the browser, with preview and confirmation before use.
- Browser-local progress, export, and clear controls.

OpenClaw mode now exposes search_faculty_web, read_faculty_page and save_web_faculty. They use Firecrawl keyless starter access, with no extra API key. Search takes the confirmed school and a short public topic; the full CV/profile is not automatically sent to Firecrawl. Pages must be read and supporting excerpts supplied before a card is saved. A different university is searched explicitly, never silently replaced by UMN. Rate limits and retrieval failures remain visible. Run npm run openclaw:setup to upgrade the exact project-owned older tool allowlist; customized allowlists require adding the three names manually. Restart the gateway if it has not reloaded the configuration. The legacy direct API adapter retains a separate API-backed faculty search, but is no longer offered in Scout's interface.

## Local files and privacy

The connection is `browser → local app server → local OpenClaw → authorized model provider`. “Local” describes the gateway and interface, not where a hosted model runs.

Setup creates:

- `openclaw/runtime/node_modules/`: the installed, pinned runtime.
- `.openclaw-local/`: configuration, isolated workspace, and OpenClaw's account/session storage.
- `.env.openclaw`: a randomly generated local gateway token and the app's connection settings, readable only by your user account.

Private state and environment files are ignored by Git. The token stays on the app server. Browser data clearing does not clear OpenClaw transcripts or provider records. OpenClaw also maintains its own local diagnostic logs.

The generated configuration binds to localhost, enables the Responses endpoint, disables native execution/file/messaging tools, skills, memory plugins, cron, and heartbeat, and exposes only the app's eleven research tools. The launcher removes ambient OpenAI API-key fallback variables from the gateway process. No background service is installed; stop the gateway terminal with Ctrl+C.

Rerunning setup preserves the gateway token and account settings. It upgrades the exact older four-tool and eleven-tool allowlists to the current fourteen tools; customized allowlists are left alone. `.env` and shell environment values override `.env.openclaw`; remove stale `OPENCLAW_*` entries there if the app connects to the wrong gateway. Restart the app after changing environment files.

## Use an existing local gateway

Set `OPENCLAW_BASE_URL`, `OPENCLAW_GATEWAY_TOKEN`, and `OPENCLAW_AGENT_ID` in the app's `.env`, using the commented examples in `.env.example`. URLs must be a localhost origin without a path, query, or embedded credentials. Enable `gateway.http.endpoints.responses.enabled` on that gateway and use a dedicated research agent with the same tool restrictions as the generated setup. The adapter uses the documented [OpenResponses function-tool interface](https://docs.openclaw.ai/gateway/openresponses-http-api).

## Troubleshooting

| What you see | What to do |
| --- | --- |
| Setup needed | Run `npm run openclaw:setup`, restart the app, and check the connection. |
| Gateway could not be reached | Run `npm run openclaw:start`; confirm the configured port is available. |
| Authentication rejected | Check that app and gateway use the same token. Do not paste it into the browser. |
| Gateway reachable, but a message fails | Complete account login, check the model catalog and gateway terminal, then retry. Connectivity alone does not prove model access. |
| Rate limited | Wait for the authorized provider/account limit to reset. The app does not silently switch billing modes. |
| Responses API unavailable | Enable the Responses endpoint and restart the gateway. |
| No professors at your school | Try a clearer university name or broader public topic. A failed search or lack of supporting evidence is not proof that no opportunities exist. |

## Verify changes

```sh
npm test
npm run build
npm run test:e2e
npm run test:openclaw
```

Unit tests cover the tool loop, grounded choices, missing/unsupported schools, bad credentials, timeouts, state preservation, and setup idempotency. Desktop/mobile tests cover OpenClaw selection, connection checks, retry behavior, and the original research journey. Mocked model results verify behavior but do not establish real account access.

`test:openclaw` starts the installed real gateway with an isolated temporary configuration and a deterministic local model fixture. It verifies the actual HTTP/function-tool contract and that native tools are absent. It does not use a real model account. The test stops its gateway and removes its temporary data afterward.

### Verification on October 3, 2026

- 42 unit, HTTP, PDF, and setup checks passed.
- 24 desktop/mobile browser checks passed.
- Production TypeScript and Vite build passed.
- Real OpenClaw 2026.9.8 gateway integration passed with a local deterministic provider, including the client-tool allowlist check.
- The project gateway accepted the app's token and account login completed.
- A real signed-in browser request through Scout completed six tool updates, generated and saved four learning-analytics tasks totaling 120 minutes, and restored the same tasks after reload. The isolated browser used a synthetic student profile and reported no page errors. A screenshot is saved at `docs/screenshots/scout-agent-plan.png`. This verifies account access at test time, not future availability or remaining allowance.

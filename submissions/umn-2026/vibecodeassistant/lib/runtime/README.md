# Runtime Inspector (Team Member 2 — Anvith)

Connects to a running **localhost** app, crawls it in headless Chromium, and reports runtime findings: broken pages and links, server errors, exposed stack traces, console errors, uncaught JS exceptions, failed network requests, risky forms, crashing form submits, missing login throttling, and memory that grows on every client-side navigation. Anything it didn't check is listed under `gaps`, never reported as "passed".

```bash
npm install && npx playwright install chromium
npm run runtime -- http://localhost:5173 --preflight-only       # reachability, stack, external backends
npm run runtime -- http://localhost:5173 --out runs/run.json    # read_only crawl
npm run test:runtime                                            # seeded fixture-site tests (no dev server needed)
```

Requires Node 22.18+ (runs `.ts` directly; `tsconfig.json` has `allowImportingTsExtensions`).

## Modes (the end user picks one per run)
| Mode | Behaviour |
|---|---|
| `read_only` (default) | Follows links only. Forms are inventoried, never submitted. |
| `fake_data` | Also submits each unique form once with obviously fake values. Destructive forms (delete, pay, checkout…) are skipped and listed as gaps. |
| `authenticated` | `fake_data` plus logging in with **test** credentials (`VIBEAUDIT_USERNAME`/`VIBEAUDIT_PASSWORD`/`VIBEAUDIT_LOGIN_URL` env vars, or `--storage-state`). |

- Links that look state-changing (`/logout`, `/delete…`) are never followed in any mode, and non-local targets are refused.
- Login counts as successful only if the response isn't an error, the browser leaves the login URL, **and** a new cookie, localStorage key or IndexedDB database appears. A redirect alone is not proof.
- Afterwards, 5 wrong-password attempts for a non-existent user run in a separate context to check for throttling.
- Credentials are scrubbed from the report, including URL-encoded copies.

**Memory-leak probe (on by default; `leakProbe: false` disables it):** leaks only build up while the JS context survives, so the probe works on client-side (SPA) navigation only.
- For up to 3 landing-page links that navigate without a full reload, it cycles open-route → `history.back()` 8 times (`leakCycles`).
- After each cycle it forces GC and samples JS heap, DOM nodes and event listeners via CDP.
- It flags a route only for steady growth: ≥1 listener retained per cycle, ≥5 nodes per cycle, or ≥1 MB of heap that keeps growing *linearly*. Decelerating growth is treated as warm-up.
- Tested against Next dev mode, which warms up by ~0.7 MB without being flagged. A clean control SPA isn't flagged either.
- On multi-page apps it reports a gap ("full page loads reset the heap"), never "no leaks".
- Results are in `leak_probes[]`. Xuan: these are the runtime counterpart to Jaimin's static `LISTENER_LEAK`; join them by route.

**Forms:** every `input/textarea/select` is located by position, so React controlled inputs without `name` or `id` get filled too.
- Password-over-GET is flagged without submitting only when the HTML guarantees it (`method="get"`, or an `action` with no method).
- JS-handled forms (`onSubmit` + `preventDefault`) are only judged in `fake_data`, by watching whether the password actually lands in the URL.

**Why preflight first:** a vibe-coded app on localhost usually talks to a *real* Supabase or Firebase project, so `fake_data` writes can land in production data. Preflight returns `backend_hosts` so the UI can show the user exactly where writes would go before they pick a mode.

## Integration

**Norman (UI)**: HTTP route `app/api/runtime/route.ts`:
- `POST /api/runtime {target, action: "preflight"}` returns `{reachable, fingerprint, backend_hosts}`.
- `POST /api/runtime {target, mode?, credentials?, maxPages?}` waits for the crawl and returns the full report.
- Show `backend_hosts` and get an explicit OK before any mode other than `read_only`.
- Only one inspection runs at a time; a second call gets 409.

**Xuan (orchestrator)**: `lib/runtime/adapters.ts` follows your `add-backend-starter` contract:
```ts
import { runRuntimeScan, runScanner } from "@/lib/runtime/adapters.ts";
const findings = await runScanner({ localhostUrl });            // your Finding shape, source "runtime-scanner"
const { findings, complianceSignal, gaps } = await runRuntimeScan({ localhostUrl }); // one crawl for everyone
```
- Each `dedupeKey` is unique per runtime finding.
- Severity maps critical→high and info→low. Category is `security` for security checks and `ux` for functional breakage.
- `gaps` (coverage) has no slot in your schema yet. Please add one so we never imply "secure" for unchecked items.

**Giovanni (compliance)**: `complianceSignal` is your `ComplianceSignal` minus the file fields: `discoveredUrls`, `discoveredLinkTexts`, `pageTextSnippets`. `report.run.backend_hosts` (kind `analytics`) and `report.cookies` show trackers and cookies set without any consent click.

**Arush (security)**: `report.pages[].headers` (all response headers, secrets masked), `report.cookies` (flags only), and `report.pages[].forms[].has_csrf_token`.

## Native report shape
- `run`: id, target, mode, caps, `fingerprint`, `backend_hosts`, and `auth` (attempts plus `rate_limit_probe`).
- `leak_probes[]`: route, samples per cycle (`heap`, `nodes`, `listeners`), growth, `leaking`, signals.
- `pages[]`: status, final_url, headers, console, page_errors, requests, links, forms, text_excerpt.
- `submissions[]`: per submitted form: request, status, errors, fields it couldn't fill.
- `cookies[]`: names and flags, never values.
- `findings[]`: the team agent spec's finding record (`observed, evidence, severity_rationale, validation_status, uncertainty, proposed_fix…`).
- `gaps[]`: `{check, target, reason}`.

Always serialize with `toJson()` from `models.ts`; it applies the secret redaction.

Known limit: the API route has no auth of its own. `next dev` listens on all interfaces, so anyone on your network could trigger a crawl of your localhost apps. Run it on trusted networks only.

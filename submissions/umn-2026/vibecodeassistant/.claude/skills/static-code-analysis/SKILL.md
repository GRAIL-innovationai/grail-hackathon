---
name: static-code-analysis
description: >
  Statically analyze a website source repository for missing files, broken
  imports and pages, listener/timer/subscription leaks, and unclosed
  resources. Emit orchestrator-ready JSON.
  Use when the user asks for static code analysis, code smells, memory leaks,
  missing pages, broken imports, or invokes static-code-analysis.
  Do not use for security analysis such as XSS, CSRF, authentication, secrets,
  CORS, or dependency vulnerabilities.
---

# Static code analysis

Analyze a website repository and report static code-quality and resource-management problems. Read the source with whatever file tools the current agent provides. Do not start the app, and do not edit files unless the user asks.

Security checks are out of scope. Leave XSS, CSRF, authentication, session handling, exposed secrets, CORS, security headers, and dependency vulnerabilities to the security agent.

## Input

Require `repo_path`.

Optional:

- `runtime_pages`: routes observed at runtime. Use them only to corroborate a broken page, not as proof on their own.
- `ignore`: extra directories to skip.

Always skip `node_modules`, `.git`, `dist`, `build`, `.next`, `venv`, `__pycache__`, generated files, and third-party dependencies.

Read `.py`, `.js`, `.jsx`, `.ts`, `.tsx`, and `.html`. Read `package.json` or the equivalent manifest only to identify the framework.

## Process

1. List source files under `repo_path`, skipping ignored directories.
2. Identify the language and framework.
3. Build a map of local files and imports.
4. Apply the three rules below. Report a finding only when the source contains concrete evidence.
5. Return one JSON object. Do not emit the same finding twice.

## Rules

### MISSING_COMPONENT

Category: `broken-reference`.

Flag a local import, component, module, or route whose target does not exist.

Resolve a relative JS/TS import as a file or a directory index, with extensions `.js`, `.jsx`, `.ts`, `.tsx`. A route such as `<Route path="/profile" element={<Profile />} />` is broken when `Profile` cannot be resolved. A Python import such as `from services.payment import process_payment` is broken when that local module is absent.

Severity: `high` for a broken route or page, or a missing local import. `medium` when the target is unresolved but ambiguous.

### LISTENER_LEAK

Category: `resource-leak`.

Flag a listener, timer, or subscription that can outlive its owner.

- `addEventListener` without a matching `removeEventListener`
- `setInterval` without `clearInterval`
- `setTimeout` without cleanup where the surrounding lifecycle expects cleanup
- `subscribe` without `unsubscribe` or an equivalent teardown

In React, inspect these calls inside `useEffect`. An effect that registers a listener and returns no cleanup is a finding. The fix is to return a function that removes the same listener, clears the interval, or unsubscribes.

Severity: `medium` by default. `high` when the call can accumulate listeners, subscriptions, or timers on each run.

### UNCLOSED_RESOURCE

Category: `resource-leak`.

Flag a resource that is opened with no visible close or managed context.

- `new WebSocket(...)` without `close()`
- a stream or handle created without cleanup
- Python `open(...)` that is neither a `with` block nor closed
- a database connection such as `database.connect(...)` without `close()` or a context manager

Prefer `with open(...)` for files and the equivalent context manager or explicit `close()` for connections and sockets.

Severity: `medium` by default. `high` when the open sits in a request handler, a loop, or a lifecycle that runs repeatedly.

## Output

Return only this JSON object. `files_scanned` is the number of files actually read. `file` is relative to `repo_path`. `evidence` is a short source excerpt. `confidence` is from 0.0 to 1.0. `severity` is `high`, `medium`, or `low`.

```json
{
  "agent": "static-code-analysis",
  "files_scanned": 42,
  "findings": [
    {
      "rule_id": "MISSING_COMPONENT",
      "category": "broken-reference",
      "severity": "high",
      "confidence": 0.95,
      "file": "src/App.jsx",
      "line": 14,
      "title": "Referenced component does not exist",
      "description": "App.jsx imports ./pages/Profile, and no matching Profile source file was found.",
      "evidence": "import Profile from './pages/Profile'",
      "recommendation": "Create the Profile component, or update the import and any route that renders it."
    }
  ]
}
```

Every finding includes `rule_id`, `category`, `severity`, `confidence`, `file`, `line`, `title`, `description`, `evidence`, and `recommendation`.

`rule_id` is one of `MISSING_COMPONENT`, `LISTENER_LEAK`, `UNCLOSED_RESOURCE`.

## Wording

Static evidence is often incomplete. Use "potential resource leak", "possible missing cleanup", or "likely broken import". Call a leak definite only when the allocation and the missing cleanup are both visible in the same unit.

Name the file and the concrete pattern in the title and description. The recommendation must say what to add or remove.

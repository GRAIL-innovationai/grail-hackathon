# Backend starter for the audit agent

This starter gives the team a shared finding schema, mock orchestration flow, prioritization, deduplication, and markdown report generation.

## Files to connect first

- `src/schemas/finding.js`: canonical finding schema
- `src/schemas/scan.js`: scan request/result types
- `src/orchestrator/runMockScan.js`: main orchestration pipeline
- `src/orchestrator/dedupeFindings.js`: finding deduplication
- `src/orchestrator/prioritizeFindings.js`: finding prioritization
- `src/reporters/generateMarkdownReport.js`: report export
- `src/rules/rules.js`: starter rule metadata

## How teammates should integrate

Each scanner should eventually expose a function with this shape:

```js
async function runScanner(input) {
  return [];
}
```

The orchestrator can swap the mock findings for real scanner outputs later.

## Run locally

```bash
npm install
npm run dev
```

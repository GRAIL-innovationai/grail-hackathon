# Cross–Pollinate test results

Test date: 2026-10-03. These tests validate prototype behavior, not the scientific
effectiveness of a proposed method. No experimental time series were supplied.

## Local app

- Codex sign-in connection: passed using the existing ChatGPT sign-in.
- MCP handshake: both literature tools listed with their expected parameters.
- Live initial research: completed and saved. Two supported candidates were
  returned; a third was rejected because its retrieved source had no abstract.
- Live constraint revision: completed. With unreliable labels and no failure
  times, the report removed real-event accuracy and lead-time claims, used
  unconfirmed alarm burden, and separated synthetic scenarios from real validation.
- Restart and reopen saved report: passed.
- Rich HTML and plain text clipboard export: passed through the browser.
- Markdown, JSON, and DOCX export: passed; generated DOCX reopened successfully.
- Eight automated tests passed: unverified reference exclusion, conservative
  metadata-only labels, empty evidence, preservation of retrieved abstracts,
  search-vs-read distinction, invalid source rejection, bounded rate-limit retry,
  and explicit failure on persistent rate limiting.
- Skill format validator: passed.
- GRAIL submission packaging validator: passed. This checks packaging and required
  README headings, not team identities or scientific correctness.

## GRAIL ApexClaw

- Loaded the native skill and Python literature helper into the workspace.
- Observed actual Crossref and Europe PMC searches and abstract retrieval.
- Saved the skill under `/workspace/.agents/skills/cross-pollinate/SKILL.md`.
- Tested by explicitly loading the skill file. The current slash-command menu did
  not expose `/cross-pollinate`; use the file-reading prompt in the quickstart for
  a new conversation. Automatic skill discovery after restart was not tested.
- Saved initial and revised reports in `/workspace/cross-pollinate/`.
- Verified 101 JSONL API records and 3 separately labelled web source notes.
  These are record counts, not counts of unique papers or fully reviewed papers.
- The first native run over-searched and needed a stop-and-synthesize instruction.
  The skill was updated with a default search budget.
- Scientific review found metadata-only support overstated, unconfirmed alarms
  described as false alarms, and an under-supported supervised validation proposal.
  The skill now explicitly addresses these issues; the native reports are reviewed
  and corrected before handoff.

## Limits

Crossref rate limits occurred during live testing. Queries now have request pacing
and one bounded retry in the supplied helper. Missing abstracts and failed requests
are disclosed. Source existence does not verify scientific entailment or transfer
validity. The optional OpenAI API backend was implemented but not live-tested because
no API key was configured. The native ApexClaw mode and local Codex mode were exercised.

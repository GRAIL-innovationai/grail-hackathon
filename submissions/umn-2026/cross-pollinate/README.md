# Cross–Pollinate

Find methods in other fields that share the structure of your research problem,
then turn the best matches into small, falsifiable pilot studies.

## Team

**Team name:** Cross–Pollinate

| Name | GitHub |
|---|---|
| Prerna Prerna | [@prerpd](https://github.com/prerpd) |
| Jiacheng Xu | [@jiacheng-x](https://github.com/jiacheng-x) |
| Dominic Varghese | [@dominicvarghese](https://github.com/dominicvarghese) |
| Pragya Parihar | [@pragyaparihar](https://github.com/pragyaparihar) |

## Summary

Cross–Pollinate helps researchers find useful methods beyond their own discipline.
Given a research problem, field, available data, and constraints, the agent
identifies shared problem structure, searches Crossref and Europe PMC, reads
available abstracts, and ranks up to three methods to transfer. Each recommendation
includes an explicit concept mapping, required measurements, collaborator
expertise, a small validation plan, and linked literature with evidence limitations.
When constraints change, the agent revises or rejects affected recommendations.

The demo problem combines chemical engineering and biostatistics: detecting
membrane fouling with few labels, existing sensors, and a small pilot budget.

## How to run

### In GRAIL ApexClaw (no additional model key)

Use [APEXCLAW_QUICKSTART.md](APEXCLAW_QUICKSTART.md). Paste the full contents of
[APEXCLAW_SETUP.txt](APEXCLAW_SETUP.txt) into an ApexClaw conversation to unpack
the supplied skill and literature tools. This is the tested setup route; the
standalone [native ZIP](cross-pollinate-apexclaw.zip) is also included for hosts
that accept archive uploads. The platform uses its own reasoning model and runs
`literature_cli.py`. Python 3.10+ and `httpx` are required for this mode.

ApexClaw runs the agent through its chat interface. The separate web interface
below runs locally and uses a separately configured model backend.

### Local web demo (Python 3.10+)

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:7860. On macOS, `start.command` automates setup and launch.

Default backend: **Codex CLI**, signed in through `codex login`. The app detects
`codex` on PATH or the bundled Codex CLI inside the ChatGPT macOS app. Set
`CODEX_BIN` in `.env` if installed elsewhere. It uses the account's model usage.
The app does not copy credentials or modify global Codex/MCP configuration.

Alternative backend: copy `.env.example` to `.env`, set `AGENT_BACKEND=openai`
and your `OPENAI_API_KEY`. Change `OPENAI_MODEL` if needed. API usage is billed
by the provider. Do not put credentials in the source submission.

### Literature MCP

```sh
.venv/bin/python mcp_server.py
```

This exposes `search_literature` and `read_paper` over stdio. Adapt absolute paths
in `mcp_config.example.json` for another MCP host. The local Codex adapter configures
this server per run. The ApexClaw skill can use the CLI instead; native MCP
registration in the platform is not required.

The local adapter allows only the project's two public literature lookup tools
without an interactive prompt. Shell execution stays disabled and Codex runs in
read-only mode. API requests are paced, with one retry for rate limiting.

## What the agent does

1. Abstract the problem and identify structural analogies.
2. Select and execute Crossref, Europe PMC, and (in the local app) web searches.
3. Read selected abstracts, check target-field prior art, and revise poor matches.
4. Produce concrete transfers with measurements and falsifiable validation plans.
5. Revisit recommendations when the user changes a constraint.

In the local app, a source registry excludes references that were never retrieved.
Candidates with no retrieved supporting abstract are conservatively labelled
speculative. This checks provenance, not whether every scientific claim follows
from a source. Applicability labels remain an agent assessment.

## Example workflow

1. Choose the membrane example and click **Find methods to borrow**.
2. Show the live tool activity, structural mapping, and evidence section.
3. Enter: “The two labels are unreliable; no trustworthy failure times exist.”
4. Show the revised validation plan and rejected methods.
5. Use **Copy for Google Docs** or download DOCX, Markdown, or JSON.

## Files and limitations

- `skills/cross-pollinate/SKILL.md`: portable research workflow.
- `literature.py`, `literature_cli.py`, `mcp_server.py`: public literature tools.
- `agent.py`, `models.py`: model/tool loop, schema, and evidence checks.
- `app.py`, `static/`: local interface and exports.
- `runs/`: local requests, retrieved evidence, and generated reports (gitignored).

This is a hackathon prototype. Literature coverage is incomplete; abstracts can
be unavailable. Search does not establish novelty. The prototype proposes studies
and does not execute or validate a scientific experiment. The question is sent to
the selected model provider; literature queries go to public APIs. Use appropriate
data for those services. No named collaborators are contacted.

## Tests

```sh
python -m pip install pytest
python -m pytest -q
```

Tests check unverified citation removal, metadata-only downgrades, source registry
merging, and retrieval labels. Live platform and model testing is documented in
`TEST_RESULTS.md` when available.

## Submission

This project is submitted under `submissions/umn-2026/cross-pollinate/` in the
GRAIL hackathon repository. Runtime credentials, virtual environments, saved runs,
and caches are excluded. Running the app does not publish a submission.

## License

This project uses the repository's MIT license.

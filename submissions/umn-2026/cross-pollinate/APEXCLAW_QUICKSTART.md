# Cross–Pollinate on ApexClaw

For a new workspace, open [APEXCLAW_SETUP.txt](APEXCLAW_SETUP.txt) and paste its
entire contents into an ApexClaw conversation. It contains the small source bundle
encoded as a ZIP and asks the platform agent to unpack it. This is the setup route
tested on ApexClaw. The file belongs beside this quickstart in the full submission.

Alternatively, download [cross-pollinate-apexclaw.zip](cross-pollinate-apexclaw.zip)
from the full submission and attach it if your workspace supports archive uploads.
Ask the agent to extract it into the workspace. Direct ZIP attachment was not
tested; use the text setup route if attachments are unavailable.

If the project files are already in a workspace, ask the platform agent:

> Work from the extracted cross-pollinate folder in the workspace. Read
> skills/cross-pollinate/SKILL.md and use it for this conversation. Install httpx
> if needed. Use literature_cli.py for real literature searches and paper reads.
> Save reports and evidence inside the project. Do not start a second LLM or ask
> for an API key: you are the reasoning agent in this mode.

To check connectivity, ask the agent to run this from the project folder:

```sh
python literature_cli.py search "optimal sampling pharmacokinetics" --database europepmc --limit 3
```

For a new conversation in the same workspace, repeat the file-reading prompt.
Automatic slash-command discovery was not verified.

Paper titles should be clickable links beneath each recommendation, with the
publication year, what the paper supports, and whether metadata, an abstract, or
full text was read. For an existing conversation using an older copy, send:

> Include direct, clickable links to the papers for each recommended method. Use
> the URLs returned by the literature tools, explain what each paper supports,
> label what you actually read, and end with a deduplicated linked reference list.
> If no supporting paper was retrieved, say so; do not invent a citation or URL.

Then give it this demo:

> My field is chemical engineering. Detect early membrane fouling from noisy
> pressure, flow, and temperature time series from 12 filtration runs. We have
> timestamps and cleaning logs but only two confirmed fouling labels. No new
> sensors, one week for a pilot, and limited computation. Find three methods from
> other fields. Show explicit concept mappings, needed measurements, collaborator
> types, and a validation plan. Retrieve real sources and distinguish proposed
> transfers from existing membrane applications.

Test adaptation next:

> Correction: the two fouling labels are unreliable, and there are no trustworthy
> failure times. Revise the report. Do not claim real fouling detection accuracy
> from unlabelled data. State what can be tested now and what needs new evidence.

The native skill uses the platform's existing model and execution tools. The local
web interface instead uses Codex CLI or an OpenAI API key. These are separate
execution modes; logging into GRAIL does not configure the local API backend.

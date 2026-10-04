"""One research agent with a literature tool loop and a verified source registry."""
import asyncio
import json
import os
import shutil
import sys
from pathlib import Path

import httpx
from openai import AsyncOpenAI

from literature import TOOL_FUNCTIONS, TOOL_SCHEMAS, load_evidence
from models import ResearchReport, ResearchRequest, SYSTEM_PROMPT

ROOT = Path(__file__).resolve().parent


def codex_binary():
    configured = os.getenv("CODEX_BIN") or shutil.which("codex")
    bundled = "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex"
    return configured or (bundled if Path(bundled).exists() else None)


def ground_report(report: dict, evidence: dict) -> dict:
    """Only attach tool-retrieved records. This does not verify scientific entailment."""
    report = ResearchReport.model_validate(report).model_dump()
    cited = set()
    for candidate in report["recommendations"]:
        original = candidate["source_ids"]
        candidate["source_ids"] = list(dict.fromkeys(x for x in original if x in evidence))
        if any(x not in evidence for x in original):
            candidate["limitations"].append("An unverified source reference was removed by the evidence check.")
        if not any(evidence[x]["retrieval_level"] == "abstract" for x in candidate["source_ids"]):
            candidate["evidence_status"] = "speculative_analogy"
            candidate["limitations"].append("No supporting abstract was retrieved for this candidate; bibliographic metadata cannot establish method performance or transfer validity.")
        cited.update(candidate["source_ids"])
    report["sources"] = [evidence[x] for x in sorted(cited)]
    report["evidence_note"] = "Source records were retrieved from literature APIs. Applicability labels are the agent's assessment, not independent scientific validation. Abstract review is not full-text review."
    return report


async def run_codex(prompt: str, directory: Path, emit):
    binary = codex_binary()
    if not binary:
        raise RuntimeError("Codex CLI was not found. Install Codex and sign in, or set AGENT_BACKEND=openai and OPENAI_API_KEY in .env.")
    schema = directory / "schema.json"
    schema.write_text(json.dumps(ResearchReport.model_json_schema()))
    output = directory / "model-report.json"
    config = {
        "features.shell_tool": False,
        "features.unified_exec": False,
        "approval_policy": "never",
        "web_search": "live",
        "model_reasoning_effort": "low",
        "mcp_servers.cross_pollinate.command": sys.executable,
        "mcp_servers.cross_pollinate.args": [str(ROOT / "mcp_server.py")],
        "mcp_servers.cross_pollinate.env.CROSS_POLLINATE_EVIDENCE_PATH": str(directory / "evidence.jsonl"),
        "mcp_servers.cross_pollinate.startup_timeout_sec": 30,
        "mcp_servers.cross_pollinate.tool_timeout_sec": 90,
        "mcp_servers.cross_pollinate.required": True,
        "mcp_servers.cross_pollinate.enabled_tools": ["search_literature", "read_paper"],
        "mcp_servers.cross_pollinate.default_tools_approval_mode": "approve",
    }
    args = [binary, "exec", "--ignore-user-config", "--ephemeral", "--skip-git-repo-check",
            "--sandbox", "read-only", "-C", str(ROOT), "--json", "--output-schema", str(schema),
            "--output-last-message", str(output)]
    for key, value in config.items():
        args += ["-c", key + "=" + json.dumps(value)]
    if os.getenv("CODEX_MODEL"):
        args += ["--model", os.environ["CODEX_MODEL"]]
    args.append("-")
    process = await asyncio.create_subprocess_exec(*args, stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, limit=2**20)
    process.stdin.write(prompt.encode())
    await process.stdin.drain()
    process.stdin.close()
    last_error = ""
    try:
        async for line in process.stdout:
            raw = line.decode(errors="replace").strip()
            if not raw.startswith("{"):
                if "error" in raw.lower():
                    last_error = raw[-1000:]
                continue
            event = json.loads(raw)
            item = event.get("item", {})
            if event.get("type") == "item.started" and item.get("type") == "mcp_tool_call":
                emit("tool", item.get("tool", "Literature lookup"), item.get("arguments", {}))
            elif event.get("type") == "item.completed" and item.get("type") == "mcp_tool_call":
                with (directory / "tool-events.jsonl").open("a") as stream:
                    stream.write(json.dumps(item) + "\n")
                if item.get("status") == "failed" or item.get("error") or (item.get("result") or {}).get("isError"):
                    emit("error", "Literature retrieval failed; the agent will revise or disclose the gap", {})
            elif event.get("type") == "item.started" and item.get("type") == "web_search":
                emit("tool", "Live web search", {})
            elif event.get("type") in ("error", "turn.failed"):
                last_error = str(event.get("message") or event.get("error") or event)
        await process.wait()
    finally:
        if process.returncode is None:
            process.terminate()
            await process.wait()
    if process.returncode or not output.exists():
        raise RuntimeError(last_error or "Codex did not return a report. Check that Codex CLI is signed in.")
    return json.loads(output.read_text())


async def run_openai(prompt: str, directory: Path, emit):
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("Set OPENAI_API_KEY in .env to use the OpenAI backend, or use the default Codex backend.")
    client = AsyncOpenAI()
    conversation = [{"role": "user", "content": prompt}]
    for _ in range(14):
        response = await client.responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-5.5"), store=False,
            input=conversation, tools=TOOL_SCHEMAS + [{"type": "web_search"}],
            max_output_tokens=12000,
            text={"format": {"type": "json_schema", "name": "research_report",
                  "schema": ResearchReport.model_json_schema(), "strict": True}},
        )
        conversation += [x.model_dump(exclude_none=True) for x in response.output]
        calls = [x for x in response.output if x.type == "function_call"]
        for call in calls:
            args = json.loads(call.arguments)
            emit("tool", call.name, args)
            try:
                result = await asyncio.to_thread(TOOL_FUNCTIONS[call.name], **args,
                    evidence_path=str(directory / "evidence.jsonl"))
            except (httpx.HTTPError, ValueError) as error:
                result = {"error": str(error), "instruction": "This retrieval failed. Revise the query or disclose the gap; do not invent evidence."}
            conversation.append({"type": "function_call_output", "call_id": call.call_id,
                                 "output": json.dumps(result)})
        if not calls:
            return json.loads(response.output_text)
    raise RuntimeError("The research tool budget was reached before a report was completed. Narrow the problem and retry.")


async def research(request: ResearchRequest, directory: Path, emit, previous=None):
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "request.json").write_text(request.model_dump_json(indent=2))
    prompt = SYSTEM_PROMPT + "\nRESEARCH REQUEST:\n" + request.model_dump_json(indent=2)
    if previous:
        prompt += "\nPRIOR REPORT (revise affected recommendations):\n" + json.dumps(previous)
        with (directory / "evidence.jsonl").open("w") as stream:
            for source in previous.get("sources", []):
                stream.write(json.dumps(source) + "\n")
    backend = os.getenv("AGENT_BACKEND", "codex")
    if backend not in ("codex", "openai"):
        raise ValueError("AGENT_BACKEND must be codex or openai")
    emit("stage", "Abstracting the problem and selecting search queries", {})
    runner = run_openai if backend == "openai" else run_codex
    raw = await asyncio.wait_for(runner(prompt, directory, emit), timeout=600)
    emit("stage", "Checking cited records against retrieved evidence", {})
    result = ground_report(raw, load_evidence(directory / "evidence.jsonl"))
    (directory / "report.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
    return result

"""Margin's local FastAPI server: whiteboard -> AI reader/coach -> SymPy check."""
from __future__ import annotations

import asyncio
import ipaddress
import json
import html
import secrets
import re
import hashlib
import base64
import binascii
from collections import OrderedDict
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

import llm
from auth import chatgpt, AuthError, ORIGIN
from verifier import verify_lines, verifier_available

ROOT = Path(__file__).resolve().parent
app = FastAPI(title="Margin", docs_url=None, redoc_url=None)
MAX_BODY = 9_000_000
_analysis_slots = asyncio.Semaphore(1)
_PREFIX_CACHE_LIMIT = 32
_verified_prefixes: OrderedDict = OrderedDict()


class BBox(BaseModel):
    x: float = Field(ge=0, le=100000)
    y: float = Field(ge=0, le=100000)
    width: float = Field(ge=0, le=100000)
    height: float = Field(ge=0, le=100000)


class InputLine(BaseModel):
    id: str
    number: int | None = Field(default=None, ge=1, le=1000)
    text: str = Field(default="", max_length=1200)
    bbox: BBox | None = None
    y: float | None = None
    status: str | None = None
    hint: str | None = None
    fingerprint: str | None = Field(default=None, max_length=200)
    image: str | None = Field(default=None, max_length=8_500_000, pattern=r"^data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$")

    @field_validator("image")
    @classmethod
    def valid_row_image(cls, value):
        if value is not None:
            try:
                data = base64.b64decode(value.split(",", 1)[1], validate=True)
                if not 0 < len(data) <= 6_000_000:
                    raise ValueError("Invalid row image size")
            except (ValueError, binascii.Error):
                raise ValueError("Invalid row image") from None
        return value

    @field_validator("id", mode="before")
    @classmethod
    def string_id(cls, value):
        value = str(value)
        if len(value) > 100:
            raise ValueError("line id too long")
        return value


class AnalyzeRequest(BaseModel):
    problem: str = Field(min_length=1, max_length=3000)
    image: str | None = Field(default=None, max_length=8_500_000)
    lines: list[InputLine] = Field(default_factory=list, max_length=30)
    revision: int = Field(default=0, ge=0)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=5000)


class ChatRequest(AnalyzeRequest):
    messages: list[ChatMessage] = Field(min_length=1, max_length=24)


class ProblemReadRequest(BaseModel):
    image: str = Field(min_length=1, max_length=8_500_000, pattern=r"^data:image/(?:png|jpeg|webp);base64,")
    revision: int = Field(default=0, ge=0)


@app.middleware("http")
async def guard_requests(request: Request, call_next):
    # Same-origin access also works from a tablet on the user's LAN. No wildcard CORS.
    host = request.headers.get("host", "")
    hostname = host.split(":", 1)[0].strip("[]")
    try:
        valid_host = hostname in ("localhost", "testserver") or ipaddress.ip_address(hostname).is_private or ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        valid_host = False
    if not valid_host:
        return JSONResponse({"error": "Use Margin's local address.", "code": "invalid_host"}, status_code=403)
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        origin = request.headers.get("origin")
        if origin and urlparse(origin).netloc != host:
            return JSONResponse({"error": "Only the Margin page can make this request.", "code": "invalid_origin"}, status_code=403)
        if not request.headers.get("content-type", "").startswith("application/json"):
            return JSONResponse({"error": "Expected a JSON request.", "code": "invalid_request"}, status_code=415)
        try:
            size = int(request.headers.get("content-length", "0"))
        except ValueError:
            size = MAX_BODY + 1
        if size > MAX_BODY:
            return JSONResponse({"error": "The board is too large.", "code": "request_too_large"}, status_code=413)
        # Bound actual bodies as well as Content-Length; no persistent image storage.
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_BODY:
                return JSONResponse({"error": "The board is too large.", "code": "request_too_large"}, status_code=413)
        request._body = bytes(body)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(llm.LLMError)
async def llm_error(_request, error):
    return JSONResponse({"error": error.message, "code": error.code}, status_code=error.status)


@app.exception_handler(AuthError)
async def auth_error(_request, error):
    return JSONResponse({"error": error.message, "code": error.code}, status_code=error.status)


def require_host_browser(request: Request):
    if request.client and request.client.host not in ("127.0.0.1", "::1", "testclient"):
        raise AuthError("Open Margin on the host computer to manage ChatGPT sign-in.", 403, "host_sign_in_required")


@app.get("/auth/start")
async def auth_start(request: Request, account: str | None = None):
    require_host_browser(request)
    if request.url.hostname != "127.0.0.1":
        return RedirectResponse(ORIGIN + "/auth/start" + ("?account=new" if account == "new" else ""))
    target, cookie = chatgpt.start(account)
    response = RedirectResponse(target, status_code=302)
    response.set_cookie("margin_oauth", cookie, httponly=True, samesite="lax", max_age=600, path="/auth")
    return response


@app.get("/auth/callback")
async def auth_callback(request: Request):
    require_host_browser(request)
    success, message = True, "You're connected. Return to Margin to start writing."
    try:
        await chatgpt.finish(request.query_params, request.cookies.get("margin_oauth"))
    except AuthError as error:
        success, message = False, error.message
        chatgpt.auth_error = message
    nonce = secrets.token_urlsafe(20)
    body = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Margin · ChatGPT</title>
    <style>body{font-family:system-ui;background:#f5f5f1;color:#292e2b;display:grid;place-items:center;min-height:90vh}main{max-width:440px;padding:40px;background:white;border-radius:20px;border:1px solid #ddd}h1{font-size:26px}p{line-height:1.6}a{color:#31715a}</style></head><body><main><h1>""" + ("Connected to ChatGPT" if success else "Let's try sign-in again") + "</h1><p>" + html.escape(message) + '</p><a href="/">Return to Margin →</a></main><script nonce="' + nonce + '">' + \
        'if(window.opener){window.opener.postMessage({type:"margin-auth",success:' + ("true" if success else "false") + '},"' + ORIGIN + '");' + ('setTimeout(()=>window.close(),1200);' if success else '') + '}</script></body></html>'
    response = HTMLResponse(body, status_code=200 if success else 400)
    response.headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-" + nonce + "'; base-uri 'none'; frame-ancestors 'none'"
    response.delete_cookie("margin_oauth", path="/auth")
    return response


@app.post("/auth/logout")
async def auth_logout(request: Request):
    require_host_browser(request)
    return await chatgpt.logout()


@app.exception_handler(RequestValidationError)
async def validation_error(_request, _error):
    return JSONResponse({"error": "The board request is incomplete. Please refresh the page and try again.", "code": "invalid_request"}, status_code=422)


@app.get("/api/health")
async def health():
    return {"ok": True, "app": "Margin"}


@app.get("/api/status")
async def status(request: Request):
    connection = llm.connection_status()
    if request.client and request.client.host not in ("127.0.0.1", "::1", "testclient"):
        connection.pop("account", None)
        connection.pop("accounts", None)
    return {**connection, "sympy": verifier_available()}


@app.get("/api/models")
async def models():
    return {"models": await llm.available_models()}


def symbolic_hint(problem: str, previous: str, current: str, reason: str) -> dict:
    if "zero" in reason.lower():
        return {"hint": "Could this denominator be zero?", "hint2": "Division is only defined when the denominator is nonzero.", "errorType": "division-by-zero", "explanation": reason}
    if re.search(r"differentiat|derivative|d/dx", problem, re.I):
        return {"hint": "Which derivative rule applies to each term?", "hint2": "Check the coefficient and exponent in each term separately.", "errorType": "derivative", "explanation": reason}
    if re.search(r"(?:\d|[a-z])\s*\([^)]*[+−-]", previous, re.I) and "(" not in current:
        return {"hint": "Does the outside factor multiply every term inside the parentheses?", "hint2": "Apply the outside factor to each term, keeping each term's sign.", "errorType": "distribution", "explanation": reason}
    if "expression" in reason.lower():
        return {"hint": "Which terms can you combine without changing the expression?", "hint2": "Check coefficients and signs one term at a time.", "errorType": "equivalence", "explanation": reason}
    return {"hint": "Did you apply the same operation to both sides?", "hint2": "Compare signs and numbers with the previous line, one change at a time.", "errorType": "equivalence", "explanation": reason}


def combine_feedback(request: AnalyzeRequest, reading: llm.BoardReading, verification: dict) -> dict:
    original = {line.id: line for line in request.lines}
    supplied = {line.id: line for line in reading.lines}
    checked = {str(row["id"]): row for row in verification.get("results", [])}
    result, first_error, uncertain_before = [], None, False
    for source in request.lines:
        line = supplied.get(source.id)
        if line is None:
            line = llm.ReadLine(id=source.id, text=source.text, status="uncertain", confidence=0,
                                transcriptionConfidence=0, explanation="I couldn't read this line clearly yet.")
        item = line.model_dump()
        item["bbox"] = source.bbox.model_dump() if source.bbox else None
        item["y"] = source.y
        item["number"] = source.number
        item["verifiedBy"] = "ai"
        if source.text.strip():
            item["text"] = source.text
            item["transcriptionConfidence"] = 1.0
            item["readingIssue"] = ""
        item["readingIssue"] = llm.statement_issue(item["text"]) or item.get("readingIssue", "")
        confidence = min(item["confidence"], item["transcriptionConfidence"])
        verdict = checked.get(source.id, {})
        if first_error:
            item.update(status="pending", hint="", hint2="", errorType="", explanation="Let's revisit the earlier line first.")
        elif uncertain_before:
            item.update(status="pending", hint="", hint2="", errorType="", explanation="Clarify the earlier line so I can check this transition.")
        elif item["readingIssue"]:
            item.update(status="uncertain", transcriptionConfidence=min(item["transcriptionConfidence"], .79),
                        hint="This reading includes more than one statement. Edit it to contain only what is written in this step.",
                        hint2="", errorType="", explanation="The reading must identify one complete step before its mathematics can be checked.")
            uncertain_before = True
        elif item["transcriptionConfidence"] < 0.8 or not item["text"].strip():
            item.update(status="uncertain", hint="Could you rewrite or type this line so I can read it clearly?", hint2="", errorType="")
            uncertain_before = True
        elif verdict.get("status") in ("correct", "incorrect"):
            item["status"] = verdict["status"]
            item["verifiedBy"] = "sympy"
            item["confidence"] = item["transcriptionConfidence"]
            if item["status"] == "correct":
                item.update(hint="", hint2="", errorType="", explanation=verdict.get("reason", "This step preserves the mathematics."))
            elif line.status != "incorrect" or line.confidence < 0.8 or not line.hint:
                previous = result[-1]["text"] if result else request.problem
                item.update(symbolic_hint(request.problem, previous, item["text"], verdict.get("reason", "This transition changes the mathematics.")))
        elif confidence < 0.8 or item["status"] == "uncertain":
            item.update(status="uncertain", hint="I’m not certain about this step yet. Can you explain the operation you used?", hint2="", errorType="")
            uncertain_before = True
        if item["status"] == "incorrect":
            first_error = source.id
        if item["status"] != "incorrect":
            item["errorType"] = ""
        result.append(item)
    all_correct = bool(result and all(row["status"] == "correct" for row in result))
    symbolic_complete = False
    if all_correct and result[-1]["verifiedBy"] == "sympy":
        last = result[-1]["text"].strip()
        simple_solution = bool(re.fullmatch(r"[a-zA-Z]\s*=\s*[-+−]?[\d.]+(?:\s*/\s*[-+−]?[\d.]+)?", last))
        derivative_complete = result[-1].get("explanation") == "This derivative matches the original function."
        symbolic_complete = (simple_solution and "=" in request.problem) or derivative_complete
    solved = bool(all_correct and (reading.solved or symbolic_complete))
    if first_error:
        index = next(row.get("number") or i for i, row in enumerate(result, 1) if row["id"] == first_error)
        summary = f"Let's take another look at line {index}."
    elif any(row["status"] == "uncertain" for row in result):
        summary = "I need a clearer reading of one line before checking the next step."
    elif solved:
        summary = "Your steps check out. You've solved it!"
    else:
        summary = reading.summary
    processing_mode = "local" if all(line.text.strip() for line in request.lines) and not reading.aiReviewed else "ai" if reading.aiReviewed else "vision"
    return {"revision": request.revision, "lines": result, "firstErrorLineId": first_error,
            "summary": summary, "solved": solved, "verificationAvailable": verification.get("available", False), "processingMode": processing_mode}


def _line_signatures(request: AnalyzeRequest) -> tuple:
    """Exact text is authoritative; unidentified ink falls back to its image."""
    image_hash = None
    signatures = []
    for line in request.lines:
        fingerprint = line.fingerprint or ""
        if not fingerprint and not line.text.strip():
            if line.image:
                fingerprint = hashlib.sha256(line.image.encode()).hexdigest()
            else:
                if image_hash is None:
                    image_hash = hashlib.sha256((request.image or "").encode()).hexdigest()
                fingerprint = image_hash + json.dumps(line.bbox.model_dump() if line.bbox else None, sort_keys=True)
        signatures.append((2, line.id, fingerprint, line.text))
    return tuple(signatures)


def _cached_prefix(problem: str, signatures: tuple) -> tuple[list, list, bool, bool]:
    best_key, count = None, 0
    for key in _verified_prefixes:
        if key[0] != problem:
            continue
        matched = 0
        for old, current in zip(key[1], signatures):
            if old != current:
                break
            matched += 1
        if matched > count:
            best_key, count = key, matched
    if best_key is None:
        return [], [], False, False
    cached = _verified_prefixes[best_key]
    _verified_prefixes.move_to_end(best_key)
    rows = [row.model_copy(deep=True) for row in cached["rows"][:count]]
    verdicts = [dict(row) for row in cached["verdicts"][:count]]
    solved = cached["solved"] and count == len(signatures) == len(cached["rows"])
    ai_reviewed = any(source == "ai" for source in cached["sources"][:count])
    return rows, verdicts, solved, ai_reviewed


def _remember_prefix(request: AnalyzeRequest, signatures: tuple, result: dict, verification: dict) -> None:
    rows = []
    for row in result["lines"]:
        if row["status"] != "correct" or row.get("readingIssue") or llm.statement_issue(row["text"]) or min(row["confidence"], row["transcriptionConfidence"]) < .8:
            break
        rows.append(row)
    if not rows:
        return
    verdict_map = {str(row["id"]): row for row in verification.get("results", [])}
    key = (request.problem, signatures[:len(rows)])
    _verified_prefixes[key] = {
        "rows": [llm.ReadLine.model_validate(row) for row in rows],
        "verdicts": [dict(verdict_map.get(row["id"], {"id": row["id"], "status": "unknown"})) for row in rows],
        "sources": [row["verifiedBy"] for row in rows],
        "solved": bool(result["solved"] and len(rows) == len(request.lines)),
    }
    _verified_prefixes.move_to_end(key)
    while len(_verified_prefixes) > _PREFIX_CACHE_LIMIT:
        _verified_prefixes.popitem(last=False)


@app.post("/api/analyze")
async def analyze(request: AnalyzeRequest):
    if not request.lines:
        return {"revision": request.revision, "lines": [], "firstErrorLineId": None,
                "summary": "Write your first step when you're ready.", "solved": False, "verificationAvailable": verifier_available()}
    if len({line.id for line in request.lines}) != len(request.lines):
        raise llm.LLMError("Each board line needs a unique identifier.", 400, "invalid_request")
    signatures = _line_signatures(request)
    prefix, cached_verdicts, cached_solved, cached_ai = _cached_prefix(request.problem, signatures)
    remaining = request.lines[len(prefix):]
    # Exact typed text and symbolic checking do not compete with a slow AI chat.
    if not remaining:
        reading = llm.BoardReading(lines=[], summary="Your steps check out so far. Keep going.", solved=cached_solved)
    elif all(line.text.strip() for line in remaining):
        reading = await llm.read_and_coach(request.problem, request.image, [line.model_dump() for line in remaining])
    else:
        async with _analysis_slots:
            reading = await llm.read_and_coach(request.problem, request.image, [line.model_dump() for line in remaining])
    reading.lines = prefix + reading.lines
    reading.aiReviewed = cached_ai
    read_map = {line.id: line for line in reading.lines}
    safe_lines = []
    for source in remaining:
        row = read_map.get(source.id)
        if llm.statement_issue(source.text or (row.text if row else "")) or (not source.text.strip() and row and row.readingIssue):
            break
        # A low-confidence transcription must never poison symbolic comparisons.
        if not source.text.strip() and (row is None or row.transcriptionConfidence < 0.8):
            break
        safe_lines.append({"id": source.id, "text": source.text or (row.text if row else "")})
    verification = {"available": verifier_available(), "results": []}
    if safe_lines:
        try:
            options = {"previous_line": prefix[-1].text} if prefix else {}
            verification = await asyncio.wait_for(asyncio.to_thread(verify_lines, request.problem, safe_lines, **options), timeout=5)
        except (Exception, asyncio.TimeoutError):
            verification = {"available": False, "results": []}
    verification["results"] = cached_verdicts + verification.get("results", [])
    if llm.unverified_ids(reading, verification):
        async with _analysis_slots:
            reading = await llm.judge_unverified(request.problem, reading, verification)
    result = combine_feedback(request, reading, verification)
    _remember_prefix(request, signatures, result, verification)
    return result


@app.post("/api/chat")
async def chat(request: ChatRequest):
    if request.messages[-1].role != "user":
        raise llm.LLMError("Send a message to ask the tutor a question.", 400, "invalid_request")
    async with _analysis_slots:
        reply = await llm.tutor_chat(request.problem, request.image, [line.model_dump(exclude={"image"}) for line in request.lines], [message.model_dump() for message in request.messages])
    return {"reply": reply}


@app.post("/api/read-problem")
async def read_problem(request: ProblemReadRequest):
    async with _analysis_slots:
        reading = await llm.read_problem(request.image)
    return {"text": reading.text, "confidence": reading.confidence, "revision": request.revision}


@app.get("/")
async def index():
    return FileResponse(ROOT / "static" / "index.html")


app.mount("/static", StaticFiles(directory=ROOT / "static", check_dir=False), name="static")
# The interface can use /app.js or /static/app.js; only files under static are exposed.
@app.get("/{asset:path}")
async def static_asset(asset: str):
    target = (ROOT / "static" / asset).resolve()
    if not target.is_relative_to((ROOT / "static").resolve()) or not target.is_file():
        return JSONResponse({"error": "Not found"}, status_code=404)
    return FileResponse(target)

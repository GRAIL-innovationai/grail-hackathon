"""Output records and redaction for the runtime inspector."""
import json
import re
from dataclasses import dataclass
from urllib.parse import quote, quote_plus


@dataclass
class Finding:
    # Field names mirror the team agent spec's finding record.
    category: str
    title: str
    location: dict  # {"url": ..., "selector": ...}
    observed: str
    evidence: list
    impact: str
    severity: str  # info | low | medium | high | critical
    severity_rationale: str
    proposed_fix: str
    prerequisites: str = "None"
    validation_status: str = "observed"  # observed | reproduced
    uncertainty: str = ""
    id: str = ""
    source: str = "runtime"
    revision: str | None = None  # runtime findings are tied to a target URL, not a commit
    retest_result: str | None = None


@dataclass
class Gap:
    check: str
    target: str
    reason: str


SECRET_HEADER = re.compile(r"auth|cookie|token|key|secret|session|password", re.I)
SECRET_TEXT = [
    (re.compile(r"eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*"), "[REDACTED_JWT]"),
    (re.compile(r"(?i)([?&](?:token|key|apikey|api_key|secret|password|pass|auth|session|sig|signature|access_token|code)=)[^&\"\s#]+"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]{8,}"), r"\1[REDACTED]"),
    (re.compile(r"sk_(?:live|test)_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}"), "[REDACTED_KEY]"),
]


def redact_headers(headers: dict) -> dict:
    out = {}
    for name, value in headers.items():
        if name.lower() == "set-cookie":
            # keep cookie names and attributes (Secure/HttpOnly/SameSite), drop values
            out[name] = "\n".join(re.sub(r"^([^=;]+)=[^;]*", r"\1=[REDACTED]", line.strip()) for line in value.split("\n"))
        elif SECRET_HEADER.search(name):
            out[name] = "[REDACTED]"
        else:
            out[name] = value
    return out


def redact_text(text: str) -> str:
    for pattern, repl in SECRET_TEXT:
        text = pattern.sub(repl, text)
    return text


def scrub(obj, values: list):
    """Replace every occurrence of the given values (e.g. test credentials), raw or URL-encoded, anywhere in obj."""
    values = sorted({form for v in values for form in (v, quote(v, safe=""), quote_plus(v))}, key=len, reverse=True)
    return _scrub(obj, values)


def _scrub(obj, values: list):
    if isinstance(obj, str):
        for v in values:
            obj = obj.replace(v, "[REDACTED_CREDENTIAL]")
        return obj
    if isinstance(obj, dict):
        return {k: _scrub(v, values) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_scrub(v, values) for v in obj]
    if hasattr(obj, "__dataclass_fields__"):
        for k in obj.__dataclass_fields__:
            setattr(obj, k, _scrub(getattr(obj, k), values))
    return obj


def to_json(obj) -> str:
    """Serialize and run the text-level secret redaction over everything as a final safety net."""
    return redact_text(json.dumps(obj, indent=2, default=lambda o: sorted(o) if isinstance(o, set) else o.__dict__))

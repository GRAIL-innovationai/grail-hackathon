"""Resume -> Candidate. One line/bullet per R id. No LLM."""
import hashlib
import io
import re

from pypdf import PdfReader

from .schemas import Candidate, Line

BULLET = re.compile(r"^\s*(?:[-*•▪◦·]|\d+[.)])\s*")


def parse_text(text: str) -> Candidate:
    items = [BULLET.sub("", l).strip() for l in text.splitlines()]
    items = [i for i in items if len(i) > 2]
    cid = "cand_" + hashlib.sha1(text.encode()).hexdigest()[:8]
    return Candidate(id=cid, lines=[Line(id=f"R{n}", text=t) for n, t in enumerate(items, 1)])


def parse_pdf(data: bytes) -> Candidate:
    reader = PdfReader(io.BytesIO(data))
    return parse_text("\n".join(page.extract_text() or "" for page in reader.pages))

"""Conservative resume extraction with source spans, not resume rewriting."""

from hashlib import sha256
from io import BytesIO
from pathlib import Path
import re

from .errors import CareerCoachError
from .skills import canonical_skill, clean_text, compact, mentioned_skills, non_qualification


MAX_PDF_BYTES = 10 * 1024 * 1024
MAX_PAGES = 20
MAX_TEXT_CHARS = 200_000
MAX_PAGE_STREAM_BYTES = 20 * 1024 * 1024

SECTION_NAMES = {
    "education": {"education", "academic background", "academic qualifications"},
    "skills": {"skills", "technical skills", "technologies", "technical expertise", "core skills"},
    "experience": {"experience", "work experience", "professional experience", "employment", "internships", "research experience", "leadership experience"},
    "projects": {"projects", "selected projects", "personal projects", "academic projects", "technical projects"},
    "other": {"summary", "profile", "objective", "interests", "certifications", "awards", "publications", "activities", "volunteering"},
}


def is_instruction_like(text: str) -> bool:
    return bool(re.search(
        r"ignore (?:all |any )?(?:previous|prior|above) (?:instructions|prompts)|"
        r"system prompt|(?:pretend|claim|fabricate|invent) (?:that |i |my |an? )|"
        r"(?:assistant|system|developer)\s*:|\[/?INST\]|<\|(?:im_start|system)", text, re.I
    ))


def make_fact(kind: str, text: str, source: dict) -> dict:
    fact_id = "fact-" + sha256((kind + "\0" + text).encode("utf-8")).hexdigest()[:12]
    return {"id": fact_id, "kind": kind, "text": text, "source": source}


def _heading(line: str) -> tuple[str | None, str]:
    stripped = line.strip().lstrip("# ")
    head, separator, tail = stripped.partition(":")
    for kind, names in SECTION_NAMES.items():
        if head.casefold().strip() in names:
            return kind, tail.strip() if separator else ""
    return None, stripped


def _parse(text: str, source_name: str, page_spans: list[tuple[int, int, int]]) -> dict:
    text = clean_text(text).replace("\r\n", "\n").replace("\r", "\n")
    if not text.strip():
        raise CareerCoachError("empty_resume", "The resume contains no text. Upload a text-based PDF or supply OCR text.")
    if len(text) > MAX_TEXT_CHARS:
        raise CareerCoachError("resume_too_large", f"Resume text must contain at most {MAX_TEXT_CHARS} characters.")
    result = {
        "schema_version": "1.0", "name": None, "email": None,
        "skills": [], "education": [], "experience": [], "projects": [],
        "facts": [], "raw_text": text, "source_name": source_name,
        "warnings": [],
    }
    section = "other"
    offset = 0
    skill_facts = {}
    for number, raw_line in enumerate(text.splitlines(keepends=True), 1):
        stripped = raw_line.strip()
        start = offset + len(raw_line) - len(raw_line.lstrip())
        offset += len(raw_line)
        if not stripped:
            continue
        source = {"type": "resume", "name": source_name, "line": number,
                  "start": start, "end": start + len(stripped), "page": None}
        for page, page_start, page_end in page_spans:
            if page_start <= start < page_end:
                source["page"] = page
                break
        if is_instruction_like(stripped):
            result["warnings"].append(f"Line {number} resembles generator instructions and was excluded from candidate evidence.")
            continue
        heading, content = _heading(stripped)
        if heading:
            section = heading
            if not content:
                continue
            content_start = raw_line.find(content)
            source["start"] = offset - len(raw_line) + content_start
            source["end"] = source["start"] + len(content)
        else:
            content = stripped.lstrip("•*- ").strip()
            source["start"] += stripped.find(content)
            source["end"] = source["start"] + len(content)
        if not content:
            continue
        if result["email"] is None:
            email = re.search(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", content)
            if email:
                result["email"] = email.group()
        # A name remains a source-backed heuristic, never a fabricated default.
        if result["name"] is None and number <= 3 and heading is None:
            possible_name = content.split(",", 1)[0].split("|", 1)[0].strip()
            if re.fullmatch(r"[^\W\d_][^\d@|,:;/\n]{1,70}", possible_name, re.UNICODE) and 2 <= len(possible_name.split()) <= 4:
                if all(word[0].isupper() for word in possible_name.split()) and not re.search(r"resume|engineer|developer|university|college|student|\b(?:B\.?S\.?|M\.?S\.?|Ph\.?D\.?)\b", possible_name, re.I):
                    result["name"] = possible_name
                    name_source = {**source, "end": source["start"] + len(possible_name)}
                    result["facts"].append(make_fact("name", possible_name, name_source))
        fact_kind = section
        if fact_kind == "other" and heading is None:
            if re.search(r"\b(?:B\.?S\.?|M\.?S\.?|Ph\.?D\.?|Bachelor|Master|Doctorate)\b", content, re.I):
                fact_kind = "education"
            elif re.search(r"^(?:built|developed|implemented|created|analyzed|designed|improved|led|tested|documented|experience with|research focus)\b|\b(?:intern|research assistant|teaching assistant)\b", content, re.I):
                fact_kind = "experience"
        if fact_kind in {"education", "experience", "projects"}:
            fact = make_fact(fact_kind, content, source.copy())
            result[fact_kind].append({"text": content, "evidence_id": fact["id"]})
            result["facts"].append(fact)
        skills = mentioned_skills(content, explicit=section == "skills")
        if section == "skills":
            # Preserve skills outside our vocabulary when explicitly listed.
            _, colon, skill_content = content.partition(":")
            listed = skill_content if colon else content
            for item in re.split(r"[,;|•]", listed):
                item = compact(item)
                if item and len(item) <= 50 and len(item.split()) <= 5 and not is_instruction_like(item):
                    if not non_qualification(item):
                        skills.append(canonical_skill(item))
        for skill in skills:
            key = skill.casefold()
            if key not in skill_facts:
                fact = make_fact("skill", content, source.copy())
                skill_facts[key] = fact
                result["skills"].append(skill)
                if fact["id"] not in {entry["id"] for entry in result["facts"]}:
                    result["facts"].append(fact)
    result["skill_evidence"] = {skill: skill_facts[skill.casefold()]["id"] for skill in result["skills"]}
    if not result["skills"]:
        result["warnings"].append("No skills were confidently extracted; matching will rely on the stated goal and documented entries.")
    if not any(result[kind] for kind in ("education", "experience", "projects")):
        result["warnings"].append("No standard education, experience, or projects headings were found. Review the extracted profile.")
    if result["name"] is None:
        result["warnings"].append("Candidate name could not be confidently extracted; outreach will omit a signature.")
    return result


def parse_resume_text(text: str, *, source_name: str = "resume.txt") -> dict:
    if not isinstance(text, str):
        raise CareerCoachError("invalid_input", "resume_text must be a string.")
    if not isinstance(source_name, str) or len(source_name) > 200:
        raise CareerCoachError("invalid_input", "source_name must be a string of at most 200 characters.")
    return _parse(text, source_name, [])


def parse_resume_pdf(data: bytes, *, source_name: str = "resume.pdf", password: str | None = None) -> dict:
    if not isinstance(data, bytes):
        raise CareerCoachError("invalid_input", "PDF uploads must be bytes.")
    if not isinstance(source_name, str) or len(source_name) > 200:
        raise CareerCoachError("invalid_input", "source_name must be a string of at most 200 characters.")
    if password is not None and not isinstance(password, str):
        raise CareerCoachError("invalid_input", "password must be a string.")
    if len(data) > MAX_PDF_BYTES:
        raise CareerCoachError("resume_too_large", "PDF uploads must be no larger than 10 MiB.")
    if not data.lstrip().startswith(b"%PDF-"):
        raise CareerCoachError("invalid_pdf", "The upload is not a PDF file.")
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise CareerCoachError("missing_dependency", "Install requirements-agent-c.txt to enable PDF extraction.") from exc
    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted:
            if not reader.decrypt(password or ""):
                raise CareerCoachError("encrypted_pdf", "This PDF requires a valid password; provide it or upload an unlocked copy.")
        if len(reader.pages) > MAX_PAGES:
            raise CareerCoachError("resume_too_large", f"Resumes may contain at most {MAX_PAGES} pages.")
        parts, spans, empty_pages = [], [], []
        position = 0
        for number, page in enumerate(reader.pages, 1):
            stream = page.get_contents()
            if stream is not None and len(stream.get_data()) > MAX_PAGE_STREAM_BYTES:
                raise CareerCoachError("resume_too_large", "A PDF page content stream is too large to extract safely.")
            text = clean_text(page.extract_text() or "").replace("\r\n", "\n").replace("\r", "\n")
            if not text.strip():
                empty_pages.append(number)
            parts.append(text)
            spans.append((number, position, position + len(text)))
            position += len(text) + 1
            if position > MAX_TEXT_CHARS:
                raise CareerCoachError("resume_too_large", "The extracted PDF text is too large.")
        if not any(part.strip() for part in parts):
            raise CareerCoachError("ocr_required", "No readable text was found. This PDF may be scanned; supply OCR text or a text-based PDF.")
        result = _parse("\n".join(parts), source_name, spans)
        result["page_count"] = len(parts)
        if empty_pages:
            result["warnings"].append(f"Pages {empty_pages} had no readable text and may need OCR.")
        result["warnings"].append("PDF layout and section detection are heuristic; review the extracted facts before use.")
        return result
    except CareerCoachError:
        raise
    except Exception as exc:
        raise CareerCoachError("invalid_pdf", "The PDF could not be read. Upload a valid, unlocked text-based PDF.") from exc


def parse_resume(path: str | Path, *, password: str | None = None) -> dict:
    path = Path(path)
    if path.suffix.casefold() == ".pdf":
        if path.stat().st_size > MAX_PDF_BYTES:
            raise CareerCoachError("resume_too_large", "PDF uploads must be no larger than 10 MiB.")
        return parse_resume_pdf(path.read_bytes(), source_name=path.name, password=password)
    if path.suffix.casefold() == ".txt":
        if path.stat().st_size > MAX_TEXT_CHARS * 4:
            raise CareerCoachError("resume_too_large", "Resume text is too large.")
        return parse_resume_text(path.read_text(encoding="utf-8-sig"), source_name=path.name)
    raise CareerCoachError("unsupported_resume", "Resume files must be .pdf or UTF-8 .txt.")

"""Small public literature tools shared by the MCP and API backends."""
import html
import json
import re
import time
from threading import Lock
from pathlib import Path
from urllib.parse import quote

import httpx

CROSSREF = "https://api.crossref.org/works"
EUROPE_PMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
HEADERS = {"User-Agent": "CrossPollinate/1.0 (research prototype)"}
REQUEST_LOCK = Lock()
LAST_REQUEST = 0.0


def plain_text(value: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", value or "")).split())


def get_json(url: str, params=None) -> dict:
    # MCP calls can arrive together. Pace requests to the public scholarly APIs.
    global LAST_REQUEST
    with REQUEST_LOCK:
        time.sleep(max(0, 1.1 - (time.monotonic() - LAST_REQUEST)))
        response = httpx.get(url, params=params, headers=HEADERS, timeout=25, follow_redirects=True)
        LAST_REQUEST = time.monotonic()
        if response.status_code == 429:
            time.sleep(4)
            response = httpx.get(url, params=params, headers=HEADERS, timeout=25, follow_redirects=True)
            LAST_REQUEST = time.monotonic()
        response.raise_for_status()
        return response.json()


def crossref_record(item: dict) -> dict:
    dates = item.get("published", item.get("issued", {})).get("date-parts", [[]])
    doi = item["DOI"].lower()
    return {
        "source_id": "doi:" + doi,
        "title": plain_text(" ".join(item.get("title", []))),
        "authors": [" ".join(filter(None, [a.get("given"), a.get("family")])) for a in item.get("author", [])[:5]],
        "year": str(dates[0][0]) if dates and dates[0] else "",
        "doi": doi,
        "url": "https://doi.org/" + doi,
        "database": "Crossref",
        "abstract": plain_text(item.get("abstract", ""))[:6000],
        "document_type": item.get("type", ""),
        "retrieval_level": "metadata",
    }


def epmc_record(item: dict) -> dict:
    doi = item.get("doi", "").lower()
    return {
        "source_id": "doi:" + doi if doi else f"epmc:{item['source']}:{item['id']}",
        "title": plain_text(item.get("title", "")),
        "authors": [item.get("authorString", "")],
        "year": item.get("pubYear", ""),
        "doi": doi,
        "url": "https://doi.org/" + doi if doi else f"https://europepmc.org/article/{item['source']}/{item['id']}",
        "database": "Europe PMC",
        "abstract": plain_text(item.get("abstractText", ""))[:6000],
        "document_type": ", ".join(item.get("pubTypeList", {}).get("pubType", [])),
        "retrieval_level": "metadata",
    }


def save_evidence(records: list[dict], evidence_path: str | None):
    if evidence_path:
        path = Path(evidence_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as stream:
            for record in records:
                stream.write(json.dumps(record, ensure_ascii=False) + "\n")


def load_evidence(path: Path) -> dict:
    records = {}
    if path.exists():
        for line in path.read_text().splitlines():
            record = json.loads(line)
            old = records.get(record["source_id"])
            if not old or record["retrieval_level"] == "abstract" or old["retrieval_level"] != "abstract":
                records[record["source_id"]] = record
    return records


def search_literature(query: str, database: str = "crossref", limit: int = 4, evidence_path=None) -> dict:
    """Search Crossref (all disciplines) or Europe PMC (life sciences). Returns real source IDs and metadata; read selected papers next."""
    limit = max(1, min(limit, 8))
    if database == "europepmc":
        data = get_json(EUROPE_PMC, {"query": query, "format": "json", "pageSize": limit, "resultType": "core"})
        records = [epmc_record(x) for x in data.get("resultList", {}).get("result", [])]
    elif database == "crossref":
        data = get_json(CROSSREF, {"query.bibliographic": query, "rows": limit, "select": "DOI,title,author,published,URL,type,abstract"})
        records = [crossref_record(x) for x in data["message"]["items"]]
    else:
        raise ValueError("database must be crossref or europepmc")
    # A search result is metadata, even if the API included an abstract internally.
    for record in records:
        record["abstract"] = ""
    save_evidence(records, evidence_path)
    return {"query": query, "database": database, "papers": records, "note": "Use read_paper for selected abstracts. Metadata confirms a source exists, not that a transfer works."}


def read_paper(source_id: str, evidence_path=None) -> dict:
    """Retrieve a selected DOI or Europe PMC record, including its abstract when available. Never fabricate missing text."""
    if source_id.startswith("doi:"):
        doi = source_id[4:]
        if not re.match(r"^10\.\d{4,9}/\S+$", doi):
            raise ValueError("Use a DOI source_id returned by search_literature")
        record = crossref_record(get_json(CROSSREF + "/" + quote(doi, safe=""))["message"])
        if not record["abstract"]:
            data = get_json(EUROPE_PMC, {"query": f'DOI:"{doi}"', "format": "json", "resultType": "core", "pageSize": 1})
            matches = data.get("resultList", {}).get("result", [])
            if matches:
                record["abstract"] = plain_text(matches[0].get("abstractText", ""))[:6000]
                if record["abstract"]:
                    record["database"] = "Crossref + Europe PMC"
    elif re.match(r"^epmc:[A-Z]+:[A-Za-z0-9._-]+$", source_id):
        _, source, paper_id = source_id.split(":", 2)
        data = get_json(EUROPE_PMC, {"query": f'EXT_ID:"{paper_id}" AND SRC:{source}', "format": "json", "resultType": "core", "pageSize": 1})
        matches = data.get("resultList", {}).get("result", [])
        if not matches:
            raise ValueError("Paper not found in Europe PMC")
        record = epmc_record(matches[0])
    else:
        raise ValueError("Use the exact doi:... or epmc:... source_id returned by search_literature")
    record["retrieval_level"] = "abstract" if record["abstract"] else "metadata"
    save_evidence([record], evidence_path)
    return {**record, "note": "Abstract retrieved; this is not a full-paper review." if record["abstract"] else "Abstract unavailable. Only bibliographic metadata was retrieved; do not infer findings from the title."}


TOOL_FUNCTIONS = {"search_literature": search_literature, "read_paper": read_paper}
TOOL_SCHEMAS = [
    {"type": "function", "name": "search_literature", "description": search_literature.__doc__, "parameters": {
        "type": "object", "properties": {"query": {"type": "string"}, "database": {"type": "string", "enum": ["crossref", "europepmc"]}, "limit": {"type": "integer"}},
        "required": ["query", "database", "limit"], "additionalProperties": False}, "strict": True},
    {"type": "function", "name": "read_paper", "description": read_paper.__doc__, "parameters": {
        "type": "object", "properties": {"source_id": {"type": "string"}}, "required": ["source_id"], "additionalProperties": False}, "strict": True},
]

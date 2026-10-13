"""In-process and JSON/subprocess adapters; no web framework or sender required."""

import base64
import binascii

from .contracts import normalize_candidate, normalize_contact, record, text_field
from .errors import CareerCoachError
from .matching import rank_jobs
from .outreach import generate_outreach
from .resume import MAX_PDF_BYTES, parse_resume_pdf, parse_resume_text


def coach(candidate: dict, jobs: list[dict], contacts: list[dict], target_role: str = "", *, instructions=None, limit: int = 5) -> dict:
    if not isinstance(contacts, (list, tuple)):
        raise CareerCoachError("invalid_input", "contacts must be an array of contact objects.")
    profile = normalize_candidate(candidate)
    target_role = text_field(target_role, "target_role", max_length=1000) or profile.get("target_role", "")
    recommendations = rank_jobs(candidate, jobs, target_role, limit=limit)
    contacts_by_id = {}
    normalized_contacts = []
    for raw_contact in contacts:
        contact = normalize_contact(raw_contact)
        contact_id = text_field(contact.get("id", contact.get("contact_id")), "contact.id", required=True)
        if contact_id in contacts_by_id:
            raise CareerCoachError("invalid_input", f"Duplicate contact ID: {contact_id}.")
        contacts_by_id[contact_id] = contact
        normalized_contacts.append(contact)
    warnings = []
    for recommendation in recommendations:
        job = recommendation["job"]
        relevant = []
        for contact_id in job["contact_ids"]:
            if contact_id in contacts_by_id:
                relevant.append(contacts_by_id[contact_id])
            else:
                warnings.append(f"Job {job['id']} references missing contact {contact_id}.")
        # A contact may alternatively link itself to one or more jobs.
        for contact in normalized_contacts:
            if contact.get("job_id") == job["id"] or job["id"] in contact.get("job_ids", []):
                if contact not in relevant:
                    relevant.append(contact)
        recommendation["contacts"] = relevant
        recommendation["outreach"] = [generate_outreach(candidate, job, contact, instructions, target_role=target_role) for contact in relevant]
        if not relevant:
            recommendation["warnings"].append("No linked hiring contact is available; outreach was not generated.")
    return {"schema_version": "1.0", "candidate": profile, "target_role": target_role,
            "recommendations": recommendations, "warnings": warnings,
            "notice": "Jobs and contacts are supplied demo data. Matching scores are heuristic relevance, not recruiter response rates. Outreach is generated only; nothing is sent."}


def _resume_from_request(request: dict) -> dict:
    if "resume_text" in request and "pdf_base64" in request:
        raise CareerCoachError("invalid_input", "Supply either resume_text or pdf_base64, not both.")
    if "resume_text" in request:
        return parse_resume_text(request["resume_text"], source_name=text_field(request.get("source_name", "resume.txt"), "source_name", max_length=200))
    if "pdf_base64" in request:
        encoded = request["pdf_base64"]
        if not isinstance(encoded, str):
            raise CareerCoachError("invalid_input", "pdf_base64 must be a base64 string.")
        if len(encoded) > ((MAX_PDF_BYTES + 2) // 3) * 4:
            raise CareerCoachError("resume_too_large", "PDF uploads must be no larger than 10 MiB.")
        try:
            data = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise CareerCoachError("invalid_input", "pdf_base64 is not valid base64.") from exc
        password = request.get("password")
        if password is not None and not isinstance(password, str):
            raise CareerCoachError("invalid_input", "password must be a string.")
        return parse_resume_pdf(data, source_name=text_field(request.get("source_name", "resume.pdf"), "source_name", max_length=200), password=password)
    raise CareerCoachError("invalid_input", "Supply resume_text or pdf_base64.")


def handle_request(request: dict) -> dict:
    """Dispatch an adapter request. Expected validation failures return ok=false."""
    try:
        request = record(request, "request")
        operation = request.get("operation", "coach")
        if operation == "parse_resume":
            result = _resume_from_request(request)
        elif operation == "match_jobs":
            result = rank_jobs(request.get("candidate"), request.get("jobs"), request.get("target_role", ""), limit=request.get("limit", 5))
        elif operation == "generate_outreach":
            result = generate_outreach(request.get("candidate"), request.get("job"), request.get("contact"), request.get("instructions"), target_role=request.get("target_role", ""))
        elif operation == "coach":
            if "candidate" in request and ("resume_text" in request or "pdf_base64" in request):
                raise CareerCoachError("invalid_input", "Supply a candidate profile or a resume, not both.")
            candidate = request["candidate"] if "candidate" in request else _resume_from_request(request)
            result = coach(candidate, request.get("jobs"), request.get("contacts", []), request.get("target_role", ""), instructions=request.get("instructions"), limit=request.get("limit", 5))
        else:
            raise CareerCoachError("invalid_operation", "operation must be parse_resume, match_jobs, generate_outreach, or coach.")
        return {"ok": True, "result": result}
    except CareerCoachError as exc:
        return {"ok": False, "error": exc.as_dict()}

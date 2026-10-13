import json
from pathlib import Path

from backend.schemas import Candidate, Job, Persona

DATA = Path(__file__).resolve().parent.parent / "data"


def test_app_json_loads_and_links():
    jobs = [Job(**row) for row in json.loads((DATA / "jobs.json").read_text())]
    personas = [Persona(**row) for row in json.loads((DATA / "personas.json").read_text())]
    resumes = [Candidate(**row) for row in json.loads((DATA / "resumes.json").read_text())]

    assert len(jobs) == 100
    assert len(personas) == 16
    assert len(resumes) == 9

    persona_ids = {p.id for p in personas}
    for job in jobs:
        assert job.contact_persona_id in persona_ids
        assert job.reqs
        assert job.description.strip()
        assert job.id.startswith("j")

    splits = {p.split for p in personas}
    assert "train" in splits and "test" in splits
    roles = {p.role for p in personas}
    assert roles <= {"CEO", "Recruiter", "Engineer"}

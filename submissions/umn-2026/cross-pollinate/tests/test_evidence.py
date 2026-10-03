"""Scientific evidence checks: no invented references or metadata-only support."""
import json

import pytest

from agent import ground_report
from literature import load_evidence, read_paper, search_literature


@pytest.fixture
def report():
    return {
        "title": "Test transfer",
        "abstraction": {"goal": "Detect change", "problem_type": "Sequential monitoring",
            "description": "Observe repeated measurements.", "known_data": [], "constraints": [], "assumptions": []},
        "recommendations": [{"domain": "Quality control", "method": "CUSUM", "fit_summary": "Detect small shifts",
            "evidence_status": "established_application", "feasibility": "needs_data",
            "structural_mapping": [], "adaptation_steps": [], "measurements": [],
            "collaborator": {"expertise": "Process control", "contribution": "Calibration", "search_terms": []},
            "validation": {"smallest_test": "Pilot", "baseline": "Threshold", "metric": "Alarm rate",
                "success_criterion": "Prespecify", "failure_signal": "Excessive alarms"},
            "limitations": [], "source_ids": ["doi:10.1234/real", "doi:10.1234/invented"], "prior_art_note": "Uncertain"}],
        "rejected_candidates": [], "recommended_start": "Calibrate baseline",
        "follow_up_questions": [], "search_limitations": []}


def test_unretrieved_reference_cannot_enter_report(report):
    evidence = {"doi:10.1234/real": {"source_id": "doi:10.1234/real", "retrieval_level": "abstract"}}
    result = ground_report(report, evidence)
    assert result["recommendations"][0]["source_ids"] == ["doi:10.1234/real"]
    assert all(x["source_id"] != "doi:10.1234/invented" for x in result["sources"])
    assert any("removed" in x for x in result["recommendations"][0]["limitations"])


def test_metadata_does_not_establish_transfer(report):
    result = ground_report(report, {"doi:10.1234/real": {"source_id": "doi:10.1234/real", "retrieval_level": "metadata"}})
    assert result["recommendations"][0]["evidence_status"] == "speculative_analogy"


def test_no_sources_yields_explicit_gap(report):
    result = ground_report(report, {})
    assert result["sources"] == []
    assert result["recommendations"][0]["evidence_status"] == "speculative_analogy"


def test_later_search_does_not_erase_an_abstract(tmp_path):
    path = tmp_path / "evidence.jsonl"
    records = [{"source_id": "doi:10.1234/real", "retrieval_level": "abstract", "abstract": "Actual text"},
               {"source_id": "doi:10.1234/real", "retrieval_level": "metadata", "abstract": ""}]
    path.write_text("\n".join(json.dumps(x) for x in records))
    assert load_evidence(path)["doi:10.1234/real"]["abstract"] == "Actual text"


def test_search_results_do_not_claim_abstract_review(monkeypatch):
    monkeypatch.setattr("literature.get_json", lambda *a, **k: {"message": {"items": [
        {"DOI": "10.1234/real", "title": ["A method"], "abstract": "Available but not yet read"}]}})
    paper = search_literature("method")["papers"][0]
    assert paper["retrieval_level"] == "metadata"
    assert paper["abstract"] == ""


def test_invalid_source_is_not_used_as_a_url():
    with pytest.raises(ValueError):
        read_paper("https://untrusted.example/data")

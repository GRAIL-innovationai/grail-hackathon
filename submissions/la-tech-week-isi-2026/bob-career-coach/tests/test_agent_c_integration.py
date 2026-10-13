"""Checks against the actual shared backend contracts and Agent B's published data."""

from copy import deepcopy
from pathlib import Path
import json
import unittest

from backend.lint import lint_message
from backend.schemas import Candidate, Job, Persona
from career_coach import CareerCoachError, generate_outreach, parse_resume_text
from career_coach.backend_adapter import (generate_backend_message, match_candidate_jobs,
                                           parse_candidate_text, profile_from_candidate)
from career_coach.dataset_adapter import generate_agent_b_outreach, rank_agent_b_jobs
from data.load import build_outreach_example, load_candidates, load_companies, load_jobs


ROOT = Path(__file__).resolve().parent.parent


class SharedBackendTests(unittest.TestCase):
    def setUp(self):
        self.candidate = Candidate.model_validate(json.loads((ROOT / "data" / "resumes.json").read_text())[0])
        self.jobs = [Job.model_validate(job) for job in json.loads((ROOT / "data" / "jobs.json").read_text())]
        self.personas = [Persona.model_validate(persona) for persona in json.loads((ROOT / "data" / "personas.json").read_text())]

    def test_parser_preserves_frozen_line_contract_and_rejects_empty_input(self):
        candidate = parse_candidate_text("- Built X\n- Shipped Y with 3 users")
        self.assertEqual([line.id for line in candidate.lines], ["R1", "R2"])
        self.assertEqual(candidate.lines[0].text, "Built X")
        with self.assertRaises(CareerCoachError):
            parse_candidate_text("")

    def test_extracts_facts_from_existing_headingless_backend_resume(self):
        profile = profile_from_candidate(self.candidate)
        self.assertEqual(profile["name"], "Maya Lindqvist")
        self.assertIn("Python", profile["skills"])
        self.assertTrue(profile["education"])
        self.assertTrue(profile["experience"])

    def test_job_match_models_preserve_J_and_R_citations(self):
        matches = match_candidate_jobs(self.candidate, self.jobs, "backend")
        self.assertEqual(len(matches), 20)
        self.assertEqual([match.score for match in matches], sorted((match.score for match in matches), reverse=True))
        candidates = {line.id for line in self.candidate.lines}
        for match in matches:
            job = next(job for job in self.jobs if job.id == match.job_id)
            self.assertEqual({row.j for row in match.rows}, {req.id for req in job.reqs})
            self.assertTrue(all(set(row.r) <= candidates for row in match.rows))

    def test_backend_notes_fit_300_characters_and_lint_against_resume(self):
        for job in self.jobs:
            persona = next(persona for persona in self.personas if persona.id == job.contact_persona_id)
            with self.subTest(job=job.id):
                message = generate_backend_message("Under 300 characters; lead with evidence; include metrics.", self.candidate, job, persona)
                self.assertLess(message.chars, 300)
                self.assertEqual(message.chars, len(message.text))
                self.assertTrue(message.citations)
                allow = f"{job.title} {job.company} {persona.name} {persona.company}"
                lint = lint_message(message.text, self.candidate, allow)
                self.assertTrue(lint.passed, lint.offending)

    def test_generator_does_not_use_private_evaluation_preferences(self):
        job = self.jobs[0]
        persona = next(persona for persona in self.personas if persona.id == job.contact_persona_id)
        altered = persona.model_copy(update={"priorities": ["SECRET UNSEEN PRIORITY"], "pet_peeves": ["PRIVATE FEEDBACK"], "split": "test"})
        first = generate_backend_message("tone=warm", self.candidate, job, persona)
        second = generate_backend_message("tone=warm", self.candidate, job, altered)
        self.assertEqual(first, second)


class AgentBDatasetTests(unittest.TestCase):
    def test_every_candidate_can_generate_from_actual_B_example(self):
        jobs = load_jobs()
        candidates = load_candidates()
        for candidate_id, row in candidates.items():
            with self.subTest(candidate_id=candidate_id):
                example = build_outreach_example(candidate_id, jobs[0]["job_id"])
                original = deepcopy(example)
                result = generate_agent_b_outreach(example, {"include_metrics": True})
                self.assertTrue(result["claims"])
                self.assertEqual(result["contact_id"], example["contact"]["contact_id"])
                self.assertEqual(result["job_id"], jobs[0]["job_id"])
                self.assertEqual(example, original)
                for claim in result["claims"]:
                    self.assertIn(claim["source_text"], row["resume"])
                if row["profile"]["degree"]["level"] != "phd":
                    self.assertNotIn("Ph.D.", result["message"])

    def test_ranking_respects_explicit_degrees_locations_and_no_industry(self):
        candidates = load_candidates()
        jobs, companies = load_jobs(), load_companies()
        matches = rank_agent_b_jobs(candidates["c00"], jobs, companies, limit=100)
        # B's c00 has a B.S. and a Boston-only goal; all Boston postings require
        # higher degrees. An empty result is more honest than an ineligible match.
        self.assertEqual(matches, [])
        self.assertTrue(all(match["job"]["location"] == "Boston, MA" for match in matches))
        self.assertTrue(all(match["job"]["min_degree"] == "bs" and not match["job"]["requires_phd"] for match in matches))
        matches = rank_agent_b_jobs(candidates["c02"], jobs, companies, limit=100)
        self.assertTrue(all(match["job"]["role_type"] != "industry_research" for match in matches))
        self.assertTrue(all(match["job"]["location"] == "Seattle, WA" for match in matches))

    def test_allowlist_can_restrict_skills_but_cannot_invent_them(self):
        candidate = parse_resume_text("Skills: Python, React\nProjects\nBuilt a Python tool.")
        candidate["skill_allowlist"] = ["Python", "Rust"]
        result = generate_outreach(candidate, {"id": "j", "company": "Fictional Co", "title": "Developer", "required_skills": ["Python", "Rust", "React"]}, {})
        self.assertNotIn("Rust", result["message"])
        self.assertNotIn("React", result["message"])


if __name__ == "__main__":
    unittest.main()

"""Run: python3 -m unittest discover -s rsi/tests -t .   (stdlib only; no API key needed)"""

import json
import os
import unittest
from types import SimpleNamespace

from rsi.contracts import DEFAULT_WEIGHTS, Example, Persona, bind_generator, load_json
from rsi.directives import DIRECTIVES, add_directive_line, set_word_limit
from rsi.generators import LLMGenerator, fixture_generate
from rsi.grounding import check_grounding
from rsi.improvers import Candidate, LLMImprover, RuleImprover, summarize_feedback
from rsi.optimizer import OptimizerConfig, RSIOptimizer, bootstrap_ci, split_by_profile
from rsi.run import BASELINE_INSTRUCTIONS, FIXTURE_DIR, build_examples, render_report, run_optimization
from rsi.simulator import RubricJudge, _attribution, outcome_probabilities

PERSONAS = load_json(os.path.join(FIXTURE_DIR, "personas.json"))["personas"]
PROFILES = load_json(os.path.join(FIXTURE_DIR, "profiles.json"))["profiles"]
JOBS = load_json(os.path.join(FIXTURE_DIR, "jobs.json"))["jobs"]
ALL_DIRECTIVES = BASELINE_INSTRUCTIONS
for _d in DIRECTIVES.values():
    ALL_DIRECTIVES = add_directive_line(ALL_DIRECTIVES, _d.sentence)


def examples():
    return build_examples(PROFILES, [Persona.from_dict(p) for p in PERSONAS], JOBS)


def run(**kw):
    return run_optimization(profiles=PROFILES, personas=PERSONAS, jobs=JOBS, generator=fixture_generate,
                            generator_label="fixture", improver=RuleImprover(), improver_label="rule",
                            is_fixture_run=True, **kw)


class GroundingTests(unittest.TestCase):
    def setUp(self):
        self.profile = PROFILES[0]  # Maya Chen: Python, SQL, 35%, 400 users, no "3 years"
        self.job = JOBS[0]

    def test_flags_invented_years(self):
        v = check_grounding("I have 3+ years of experience with Python.", self.profile, self.job)
        self.assertEqual([x["type"] for x in v], ["years_claim"])

    def test_allows_numbers_from_resume_and_call_durations(self):
        msg = "I cut query latency by 35% and reached 400 beta users. Open to a 15-minute call?"
        self.assertEqual(check_grounding(msg, self.profile, self.job), [])

    def test_flags_invented_number(self):
        v = check_grounding("I increased revenue by 80%.", self.profile, self.job)
        self.assertTrue(any(x["type"] == "number" for x in v))

    def test_flags_skill_not_in_resume_but_not_mere_mention(self):
        bad = check_grounding("I have experience with Kubernetes.", self.profile, self.job)
        self.assertTrue(any(x["type"] == "skill_claim" for x in bad))
        ok = check_grounding("I would love to learn Kubernetes.", self.profile, self.job)
        self.assertEqual(ok, [])


class SimulatorTests(unittest.TestCase):
    def setUp(self):
        self.ex = examples()[0]
        self.judge = RubricJudge()

    def test_good_message_beats_boilerplate(self):
        bad = fixture_generate(BASELINE_INSTRUCTIONS, self.ex.profile, self.ex.persona.to_contact_dict(), self.ex.job)
        good = fixture_generate(ALL_DIRECTIVES, self.ex.profile, self.ex.persona.to_contact_dict(), self.ex.job)
        eb, eg = self.judge.evaluate(bad, self.ex), self.judge.evaluate(good, self.ex)
        self.assertGreater(eg.quality, eb.quality + 0.3)
        self.assertTrue(eb.violations and not eg.violations)
        for e in (eb, eg):
            self.assertTrue(0 <= e.quality <= 1)
            self.assertTrue(all(0 <= v <= 1 for v in e.criteria.values()))

    def test_weights_normalized(self):
        self.assertAlmostEqual(sum(self.ex.persona.weights.values()), 1.0)
        self.assertAlmostEqual(sum(DEFAULT_WEIGHTS.values()), 1.0)

    def test_outcome_probabilities(self):
        p = outcome_probabilities(0.7, 0.3)
        self.assertAlmostEqual(sum(p.values()), 1.0)
        # higher quality -> more replies; busier contact (lower rate) -> more silence at same quality
        self.assertLess(outcome_probabilities(0.9, 0.3)["no_response"], outcome_probabilities(0.3, 0.3)["no_response"])
        self.assertGreater(outcome_probabilities(0.9, 0.1)["no_response"], outcome_probabilities(0.9, 0.5)["no_response"])

    def test_quality_independent_of_sampled_outcome(self):
        msg = fixture_generate(ALL_DIRECTIVES, self.ex.profile, self.ex.persona.to_contact_dict(), self.ex.job)
        evals = [self.judge.evaluate(msg, self.ex, seed=s) for s in range(30)]
        self.assertEqual(len({round(e.quality, 9) for e in evals}), 1)
        self.assertGreater(len({e.sampled_outcome for e in evals}), 1)  # draws differ, quality does not

    def test_nonresponse_not_always_blamed_on_message(self):
        probs = outcome_probabilities(0.85, 0.2)
        self.assertEqual(_attribution("no_response", 0.85, probs, "X")["verdict"], "likely_persona_unavailable")
        self.assertEqual(_attribution("no_response", 0.2, probs, "X")["verdict"], "message_likely_contributed")
        self.assertIsNone(_attribution("conversation", 0.85, probs, "X"))

    def test_persona_adapter_aliases_and_hidden_fields(self):
        p = Persona.from_dict({"persona_id": "z", "full_name": "Zed Q", "role": "CTO", "organization": "Acme",
                               "communication_style": "FORMAL", "priorities": "speed"})
        self.assertEqual((p.id, p.name, p.title, p.company, p.tone, p.cares_about), ("z", "Zed Q", "CTO", "Acme", "formal", ["speed"]))
        self.assertIn("base_response_rate", p.assumed_fields)
        contact = p.to_contact_dict()
        self.assertNotIn("base_response_rate", contact)
        self.assertNotIn("weights", contact)


class SplitTests(unittest.TestCase):
    def test_split_is_disjoint_by_profile_and_complete(self):
        exs = examples()
        s = split_by_profile(exs, seed=7)
        sets = {k: {e.profile_id for e in v} for k, v in s.items()}
        self.assertFalse(sets["train"] & sets["dev"] or sets["train"] & sets["test"] or sets["dev"] & sets["test"])
        self.assertEqual(sum(len(v) for v in s.values()), len(exs))
        self.assertTrue(all(len(v) > 0 for v in s.values()))

    def test_too_few_profiles_raises(self):
        with self.assertRaises(ValueError):
            split_by_profile([e for e in examples() if e.profile_id in ("cand-01", "cand-02")], seed=1)

    def test_bootstrap_ci_brackets_mean(self):
        ci = bootstrap_ci([0.1, 0.2, 0.3, 0.4], seed=1)
        self.assertLessEqual(ci["low"], ci["mean"])
        self.assertGreaterEqual(ci["high"], ci["mean"])


class OptimizerTests(unittest.TestCase):
    def test_improves_on_held_out_test_with_valid_trace(self):
        r = run(config=OptimizerConfig(seed=7))
        t = r["evaluation"]["test"]
        self.assertGreater(t["delta"]["mean_quality"], 0.2)
        self.assertGreater(t["ci95_delta_quality"]["low"], 0)
        self.assertTrue(r["leakage_check"]["passed"])
        self.assertNotEqual(r["baseline_instructions"], r["optimized_instructions"])
        self.assertTrue(r["iterations"])
        for it in r["iterations"]:
            for key in ("iteration", "feedback_summary", "candidates", "selected", "accepted", "decision_reason",
                        "dev_quality_before", "dev_quality_after", "instructions_after"):
                self.assertIn(key, it)
        json.dumps(r)  # must be JSON-serializable for Agent A
        self.assertIn("FIXTURE RUN", render_report(r))

    def test_deterministic_given_seed(self):
        a, b = run(config=OptimizerConfig(seed=3)), run(config=OptimizerConfig(seed=3))
        for r in (a, b):
            r.pop("generated_at")
        self.assertEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))

    def test_improver_sees_only_train_feedback(self):
        seen = []

        class Spy(RuleImprover):
            def propose(self, current, summary, k=3):
                seen.append(summary)
                return super().propose(current, summary, k)

        exs = examples()
        opt = RSIOptimizer(fixture_generate, Spy(), config=OptimizerConfig(seed=7, max_iters=3))
        res = opt.run(BASELINE_INSTRUCTIONS, exs)
        train_ids = set(res["splits"]["train"]["example_ids"])
        held_names = {e.profile["name"] for e in exs if e.id not in train_ids}
        self.assertTrue(seen)
        for s in seen:
            self.assertEqual(s["n_examples"], len(train_ids))
            for w in s["worst_examples"]:
                self.assertFalse(any(n in w["message"] for n in held_names))

    def test_dev_gate_rejects_harmful_revision(self):
        class Harmful:
            def propose(self, current, summary, k=3):
                return [Candidate("too_short", set_word_limit(current, 25), "crush the message")]

        opt = RSIOptimizer(fixture_generate, Harmful(), config=OptimizerConfig(seed=7))
        res = opt.run(ALL_DIRECTIVES, examples())
        it = res["iterations"][0]
        self.assertFalse(it["accepted"])
        self.assertLess(it["candidates"][0]["dev_delta"], 0)
        self.assertEqual(res["optimized_instructions"], ALL_DIRECTIVES)
        self.assertIn("no accepted revision", res["stop_reason"])

    def test_overfitting_guard_rejects_names_from_training_data(self):
        exs = examples()
        train_name = split_by_profile(exs, 7)["train"][0].persona.name

        class Leaky:
            def propose(self, current, summary, k=3):
                return [Candidate("leak", current + f"\n- Always mention {train_name}.", "overfit")]

        res = RSIOptimizer(fixture_generate, Leaky(), config=OptimizerConfig(seed=7)).run(BASELINE_INSTRUCTIONS, exs)
        self.assertFalse(res["iterations"][0]["candidates"][0]["valid"])
        self.assertEqual(res["optimized_instructions"], BASELINE_INSTRUCTIONS)

    def test_external_generator_dict_output_and_load(self):
        def agent_c_style(instructions, profile, contact, job):
            return {"message": fixture_generate(instructions, profile, contact, job)}

        self.assertTrue(bind_generator(agent_c_style, ALL_DIRECTIVES)(PROFILES[0], PERSONAS[0], JOBS[0]))

    def test_summary_is_json_serializable(self):
        rows = RSIOptimizer(fixture_generate, RuleImprover()).evaluate(BASELINE_INSTRUCTIONS, examples()[:6])
        json.dumps(summarize_feedback(rows))


class _StubClient:
    def __init__(self, text):
        self.text = text
        self.calls = []
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kw):
        self.calls.append(kw)
        return SimpleNamespace(content=[SimpleNamespace(text=self.text)])


class LLMPlumbingTests(unittest.TestCase):
    """Stubbed client only: verifies prompt plumbing and parsing, NOT real model behavior."""

    def test_llm_generator_passes_instructions_as_system_prompt(self):
        client = _StubClient("Hi there")
        out = LLMGenerator(client=client, model="m")("MY INSTRUCTIONS", PROFILES[0], PERSONAS[0], JOBS[0])
        self.assertEqual(out, "Hi there")
        self.assertEqual(client.calls[0]["system"], "MY INSTRUCTIONS")

    def test_llm_improver_parses_tags_and_targets_weakest_criteria(self):
        client = _StubClient("<instructions>NEW PROMPT</instructions><rationale>because</rationale>")
        rows = RSIOptimizer(fixture_generate, RuleImprover()).evaluate(BASELINE_INSTRUCTIONS, examples()[:6])
        cands = LLMImprover(client=client, model="m").propose(BASELINE_INSTRUCTIONS, summarize_feedback(rows), k=2)
        self.assertEqual([c.instructions for c in cands], ["NEW PROMPT", "NEW PROMPT"])
        self.assertEqual(cands[0].rationale, "because")
        self.assertEqual(len(client.calls), 2)
        self.assertNotIn("mean_weights", client.calls[0]["messages"][0]["content"])


if __name__ == "__main__":
    unittest.main()

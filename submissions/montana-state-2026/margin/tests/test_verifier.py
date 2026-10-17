"""Behavioral regression checks for trustworthy math feedback."""
import unittest
from unittest.mock import patch

import verifier
from verifier import verify_lines, verifier_available


@unittest.skipUnless(verifier_available(), "Install requirements.txt to enable SymPy verification")
class VerifierTests(unittest.TestCase):
    def check(self, problem, texts):
        result = verify_lines(problem, [{"id": f"line-{i}", "text": text} for i, text in enumerate(texts)])
        self.assertTrue(result["available"])
        self.assertEqual(result["engine"], "sympy")
        return result["results"]

    def statuses(self, problem, texts):
        return [result["status"] for result in self.check(problem, texts)]

    def test_exact_demo_error_and_no_cascading_blame(self):
        result = self.check("Solve 2(x − 3) = 10", ["2(x-3)=10", "2x-3=10", "2x=13", "x=6.5"])
        self.assertEqual([line["status"] for line in result], ["correct", "incorrect", "unknown", "unknown"])
        self.assertEqual(result[1]["id"], "line-1")
        self.assertNotIn("8", result[1]["reason"])

    def test_corrected_board_clears_error(self):
        self.assertEqual(self.statuses("Solve 2(x − 3) = 10", ["2(x-3)=10", "2x-6=10", "2x=16", "x=8"]), ["correct"] * 4)

    def test_alternate_valid_path_and_side_order(self):
        self.assertEqual(self.statuses("2(x-3)=10", ["x-3=5", "8=x"]), ["correct", "correct"])

    def test_sign_error(self):
        self.assertEqual(self.statuses("x+5=12", ["x=12+5"]), ["incorrect"])

    def test_reported_false_positive_single_step_and_corrected_step(self):
        original='3(x+2)-4=2x+10'
        setup=[original,'3x+6-4=2x+10']
        self.assertEqual(self.statuses(original,setup+['2x+4=2x+10']),['correct','correct','incorrect'])
        self.assertEqual(self.statuses(original,setup+['3x+2=2x+10']),['correct']*3)
        self.assertEqual(self.statuses(original,['\n'.join(setup+['2x+4=2x+10'])]),['unknown'])

    def test_first_line_is_checked_against_problem(self):
        self.assertEqual(self.statuses("Solve 2(x-3)=10", ["2x-3=10"]), ["incorrect"])

    def test_division_by_zero_is_rejected(self):
        self.assertEqual(self.statuses("x=4", ["x/0=4/0"]), ["incorrect"])

    def test_division_symbol_and_parenthesized_fraction(self):
        self.assertEqual(self.statuses("x ÷ 2 = 3", ["(x)/(2)=3", "x=6"]), ["correct", "correct"])
        self.assertEqual(self.statuses("x/2=3", ["x=3/2"]), ["incorrect"])

    def test_nested_fractions_preserve_numerator_and_denominator_grouping(self):
        self.assertEqual(self.statuses("x/(2/3)=6", ["(x)/((2)/(3))=6", "3x/2=6", "x=4"]), ["correct"]*3)
        self.assertEqual(self.statuses("(x/2)/3=1", ["((x)/(2))/(3)=1", "x/6=1", "x=6"]), ["correct"]*3)
        self.assertEqual(self.statuses("x/(2/3)=6", ["(x/2)/3=6"]), ["incorrect"])

    def test_nested_latex_fraction(self):
        self.assertEqual(self.statuses("x/(2/3)=6", [r"\frac{x}{\frac{2}{3}}=6", "x=4"]), ["correct", "correct"])

    def test_trusted_prefix_anchor_checks_only_new_transition(self):
        with patch.object(verifier,'_compare',wraps=verifier._compare) as compare:
            result=verify_lines('2(x-3)=10',[{'id':'next','text':'x=8'}],previous_line='2x=16')
        self.assertEqual(compare.call_count,1)
        self.assertEqual(result['results'][0]['status'],'correct')

    def test_derivative_prefix_keeps_original_function_context(self):
        result=verify_lines('Differentiate x^3',[{'id':'next','text':"y'=3x^2"}],previous_line="y'=3x^2")
        self.assertEqual(result['results'][0]['status'],'correct')
        self.assertEqual(result['results'][0]['reason'],'This derivative matches the original function.')

    def test_equivalent_quadratic_and_lost_solution(self):
        self.assertEqual(self.statuses("x^2-1=0", ["(x-1)(x+1)=0", "x=1"]), ["correct", "incorrect"])

    def test_division_cannot_silently_lose_zero_solution(self):
        self.assertEqual(self.statuses("x(x-1)=0", ["x-1=0"]), ["incorrect"])

    def test_denominator_restriction_survives_cancellation(self):
        self.assertEqual(self.statuses("(x^2-1)/(x-1)=2", ["x+1=2"]), ["incorrect"])

    def test_rational_equation_equivalence(self):
        self.assertEqual(self.statuses("(x^2-1)/(x-1)=3", ["x+1=3", "x=2"]), ["correct", "correct"])

    def test_unsupported_inequality_is_not_flagged(self):
        self.assertEqual(self.statuses("Solve x+3>5", ["x>2"]), ["unknown"])

    def test_domain_sensitive_radical_is_undecided(self):
        self.assertEqual(self.statuses("sqrt(x)=2", ["x=4"]), ["unknown"])

    def test_simplification(self):
        self.assertEqual(self.statuses("Expand (x+1)^2", ["x^2+2x+1"]), ["correct"])

    def test_domain_extension_in_expression_is_undecided(self):
        self.assertEqual(self.statuses("Simplify (x^2-1)/(x-1)", ["x+1"]), ["unknown"])

    def test_derivative_with_and_without_setup(self):
        self.assertEqual(self.statuses("Differentiate x^3+2x", ["3x^2+2"]), ["correct"])
        self.assertEqual(self.statuses("Find the derivative of y=x^3", ["y=x^3", "y'=3x^2"]), ["correct", "correct"])

    def test_wrong_derivative(self):
        self.assertEqual(self.statuses("Differentiate x^3", ["y'=2x^2"]), ["incorrect"])

    def test_derivative_label_cannot_disguise_unchanged_function(self):
        self.assertEqual(self.statuses("Differentiate x^3", ["y'=x^3"]), ["incorrect"])
        self.assertEqual(self.statuses("Differentiate x^3", ["d/dx(x^3)", "y'=3x^2"]), ["correct", "correct"])

    def test_explicit_derivative_operation(self):
        self.assertEqual(self.statuses("Differentiate x^3", ["d/dx(x^3)", "3x^2"]), ["correct", "correct"])

    def test_basic_trigonometric_derivative(self):
        self.assertEqual(self.statuses("Differentiate sin(x)", ["cos(x)"]), ["correct"])

    def test_latex_and_unicode(self):
        self.assertEqual(self.statuses("Solve x/2=4", [r"\frac{x}{2}=4", "x=8"]), ["correct", "correct"])
        self.assertEqual(self.statuses("Expand (x+1)²", ["x²+2x+1"]), ["correct"])

    def test_malformed_and_code_input_are_undecided(self):
        for text in ["__import__('os').system('echo bad')", "x.__class__", "sum([1,2])", "x+", "9^(9^9)", "a" * 501]:
            with self.subTest(text=text[:40]):
                self.assertEqual(self.statuses("x=1", [text]), ["unknown"])

    def test_word_problem_is_not_misjudged(self):
        self.assertEqual(self.statuses("Find the standard deviation of 4, 8, 6, 10", ["mean = 7"]), ["unknown"])


if __name__ == "__main__":
    unittest.main()

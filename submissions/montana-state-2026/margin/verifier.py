"""Conservative, local symbolic verification for handwritten math.

Input is parsed by a small arithmetic grammar; it is never passed to eval,
sympify, or parse_expr. Unsupported notation is explicitly undecided.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import re
import sys
from typing import Any

_local_packages = Path(__file__).parent / ".python-packages"
if _local_packages.is_dir() and str(_local_packages) not in sys.path:
    sys.path.insert(0, str(_local_packages))
try:
    import sympy as sp
except ImportError:
    sp = None


class Unsupported(ValueError):
    pass


class InvalidMath(ValueError):
    pass


@dataclass
class MathLine:
    left: Any
    right: Any = None
    denominators: list = field(default_factory=list)
    symbols: set = field(default_factory=set)
    restricted: bool = False
    derivative: bool = False

    @property
    def equation(self):
        return self.right is not None


@dataclass
class DerivativeTask:
    original: MathLine
    expected: MathLine


def verifier_available() -> bool:
    return sp is not None


def _group(text, start):
    if start >= len(text) or text[start] != "{":
        raise Unsupported("Unsupported LaTeX grouping.")
    depth = 1
    for index in range(start + 1, len(text)):
        depth += (text[index] == "{") - (text[index] == "}")
        if depth == 0:
            return text[start + 1:index], index + 1
    raise Unsupported("Incomplete grouping.")


def _latex(text):
    # Handle only a small explicit LaTeX vocabulary, including nested fractions.
    if len(text) > 500:
        raise Unsupported("This line is too long for a quick symbolic check.")
    text = text.replace("\\left", "").replace("\\right", "")
    for command in ("\\dfrac", "\\tfrac", "\\frac"):
        while command in text:
            start = text.index(command)
            numerator, next_index = _group(text, start + len(command))
            denominator, end = _group(text, next_index)
            text = text[:start] + f"(({_latex(numerator)})/({_latex(denominator)}))" + text[end:]
    while "\\sqrt" in text:
        start = text.index("\\sqrt")
        argument, end = _group(text, start + 5)
        text = text[:start] + f"sqrt({_latex(argument)})" + text[end:]
    for source, replacement in {
        "\\cdot": "*", "\\times": "*", "\\div": "/", "\\pi": "pi",
        "\\sin": "sin", "\\cos": "cos", "\\tan": "tan", "\\ln": "ln",
        "\\log": "log", "\\exp": "exp", "\\,": "", "\\;": "",
        "−": "-", "–": "-", "×": "*", "·": "*", "÷": "/", "π": "pi",
        "²": "^2", "³": "^3", "⁴": "^4", "⁻¹": "^(-1)",
    }.items():
        text = text.replace(source, replacement)
    return text.replace("{", "(").replace("}", ")").replace("**", "^").strip(" $\n\r\t")


class ArithmeticParser:
    FUNCTIONS = {"sin", "cos", "tan", "exp", "log", "ln", "sqrt"}
    TOKEN = re.compile(r"\s*(?:(\d+(?:\.\d*)?|\.\d+)|([A-Za-z]+)|([+*/^()\-=]))")

    def __init__(self, text):
        self.tokens = []
        pos = 0
        while pos < len(text):
            match = self.TOKEN.match(text, pos)
            if not match:
                if text[pos:].strip() == "":
                    break
                raise Unsupported("This notation needs the tutor's contextual review.")
            self.tokens.append(next(item for item in match.groups() if item is not None))
            pos = match.end()
        if not self.tokens or len(self.tokens) > 120:
            raise Unsupported("The expression is empty or too complex.")
        self.index = 0
        self.depth = 0
        self.denominators = []
        self.symbols = set()
        self.restricted = False

    def peek(self):
        return self.tokens[self.index] if self.index < len(self.tokens) else None

    def take(self):
        result = self.peek()
        self.index += 1
        return result

    def bounded(self, value):
        if value in (sp.zoo, sp.oo, -sp.oo, sp.nan):
            raise InvalidMath("This line contains an undefined arithmetic operation.")
        if sp.count_ops(value) > 90:
            raise Unsupported("This expression is too complex for a quick check.")
        for number in value.atoms(sp.Rational):
            if abs(int(number.p)).bit_length() > 512 or int(number.q).bit_length() > 512:
                raise Unsupported("The numbers are too large for a quick check.")
        return value

    def parse(self):
        left = self.sum()
        right = None
        if self.peek() == "=":
            self.take()
            right = self.sum()
        if self.peek() is not None:
            raise Unsupported("The whole line could not be read as one math statement.")
        return MathLine(left, right, self.denominators, self.symbols, self.restricted)

    def sum(self):
        value = self.product()
        while self.peek() in ("+", "-"):
            operator = self.take()
            other = self.product()
            value = self.bounded(value + other if operator == "+" else value - other)
        return value

    def product(self):
        value = self.unary()
        while True:
            token = self.peek()
            if token in ("*", "/"):
                self.take()
                other = self.unary()
                if token == "/":
                    if other.is_zero is True:
                        raise InvalidMath("This line divides by zero. Check the denominator.")
                    self.denominators.append(other)
                    value = self.bounded(value / other)
                else:
                    value = self.bounded(value * other)
            elif token and (token == "(" or token[0].isalpha()):
                # Explicitly support handwriting such as 2x and 2(x - 3).
                value = self.bounded(value * self.unary())
            else:
                return value

    def unary(self):
        if self.peek() in ("+", "-"):
            operator = self.take()
            return self.unary() * (-1 if operator == "-" else 1)
        value = self.atom()
        if self.peek() == "^":
            self.take()
            exponent = self.unary()
            if not exponent.is_Integer or abs(exponent) > 8:
                raise Unsupported("Only small integer powers are checked automatically.")
            if exponent < 0:
                if value.is_zero is True:
                    raise InvalidMath("A zero base cannot have a negative exponent.")
                self.denominators.append(value)
            if value == 0 and exponent == 0:
                raise Unsupported("The meaning of zero to the zero power needs context.")
            value = self.bounded(value ** exponent)
        return value

    def atom(self):
        self.depth += 1
        if self.depth > 18:
            raise Unsupported("The nesting is too deep for a quick check.")
        token = self.take()
        if token is None:
            raise Unsupported("The expression is incomplete.")
        if token == "(":
            value = self.sum()
            if self.take() != ")":
                raise Unsupported("Check the parentheses in this line.")
        elif token in self.FUNCTIONS:
            if self.take() != "(":
                raise Unsupported("Function arguments need parentheses for verification.")
            argument = self.sum()
            if self.take() != ")":
                raise Unsupported("The function's parentheses are incomplete.")
            function = sp.log if token == "ln" else getattr(sp, token)
            if token in ("sqrt", "ln", "log", "tan"):
                self.restricted = True
            value = function(argument)
        elif token == "pi":
            value = sp.pi
        elif token == "e":
            value = sp.E
        elif len(token) == 1 and token.isascii() and token.isalpha():
            value = sp.Symbol(token, real=True)
            self.symbols.add(value)
        elif re.fullmatch(r"\d+(?:\.\d*)?|\.\d+", token):
            if len(token) > 18:
                raise Unsupported("This number is too large for a quick check.")
            # Rational receives a validated numeric literal, never arbitrary source.
            value = sp.Rational(token)
        else:
            raise Unsupported("This notation needs contextual review.")
        self.depth -= 1
        return self.bounded(value)


def _read(text):
    text = _latex(str(text))
    if any(char in text for char in ("<", ">", "≤", "≥", "≠", "±", "∞", "_", "[", "]", "\\")):
        raise Unsupported("This notation is not part of the automatic algebra check.")
    derivative = re.match(r"^d/d([A-Za-z])\s*(.+)$", text)
    if derivative:
        variable = sp.Symbol(derivative.group(1), real=True)
        source = _read(derivative.group(2))
        if source.equation or source.restricted or source.denominators:
            raise Unsupported("This derivative needs a contextual domain check.")
        source.left = sp.diff(source.left, variable)
        source.derivative = True
        return source
    result = ArithmeticParser(text).parse()
    return result


def _problem(text):
    clean = str(text or "").strip().rstrip(".?")
    derivative = re.match(r"^(?:differentiate|find\s+(?:the\s+)?derivative\s+of|compute\s+(?:the\s+)?derivative\s+of)\s+(.+)$", clean, re.I)
    if derivative:
        original_text = derivative.group(1)
        original_text = re.sub(r"\s+(?:with respect to\s+x|w\.r\.t\.\s*x)$", "", original_text, flags=re.I)
        original_text = re.sub(r"^(?:y|f\(x\))\s*=\s*", "", original_text)
        original = _read(original_text)
        if original.equation or original.restricted or original.denominators:
            raise Unsupported("This derivative requires a contextual domain check.")
        if len(original.symbols) > 1:
            raise Unsupported("Specify a variable for a multivariable derivative.")
        variable = next(iter(original.symbols), sp.Symbol("x", real=True))
        expected = MathLine(sp.diff(original.left, variable), symbols=original.symbols, derivative=True)
        return DerivativeTask(original, expected)
    clean = re.sub(r"^(?:solve(?:\s+for\s+[A-Za-z])?|simplify|expand|factor|evaluate)\s*:?\s*", "", clean, flags=re.I)
    clean = re.sub(r"\s+for\s+[A-Za-z]$", "", clean, flags=re.I)
    return _read(clean)


def _polynomial(expression, variable):
    try:
        polynomial = sp.Poly(expression, variable)
    except sp.PolynomialError as exc:
        raise Unsupported("This equation is beyond the supported algebra check.") from exc
    if polynomial.degree() > 4 or not all(coef.is_Rational for coef in polynomial.all_coeffs()):
        raise Unsupported("This equation needs a more detailed symbolic check.")
    return polynomial


def _zero_set(expression, variable):
    numerator, denominator = sp.fraction(sp.cancel(expression))
    _polynomial(numerator, variable)
    _polynomial(denominator, variable)
    if numerator == 0:
        return sp.S.Reals
    if not numerator.has(variable):
        return sp.S.EmptySet
    # A degree cap keeps solving bounded, and real-domain solving handles x^2=4.
    result = sp.solveset(numerator, variable, domain=sp.S.Reals)
    if isinstance(result, sp.ConditionSet):
        raise Unsupported("SymPy could not establish this equation's solution set.")
    return result


def _domain(line, variable):
    excluded = sp.S.EmptySet
    for denominator in line.denominators:
        if denominator.is_zero is True:
            raise InvalidMath("This line divides by zero. Check the denominator.")
        excluded = sp.Union(excluded, _zero_set(denominator, variable))
    return sp.Complement(sp.S.Reals, excluded)


def _equation_set(line, variable):
    if line.restricted:
        raise Unsupported("This equation requires a domain check beyond basic algebra.")
    return sp.Intersection(_zero_set(line.left - line.right, variable), _domain(line, variable))


def _expressions(previous, current):
    if previous.restricted or current.restricted:
        if previous.left == current.left and previous.denominators == current.denominators:
            return "correct", "This expression is unchanged."
        return "unknown", "This expression needs a contextual domain check."
    symbols = previous.symbols | current.symbols
    if len(symbols) > 1:
        return "unknown", "This multivariable expression needs contextual review."
    variable = next(iter(symbols), sp.Symbol("x", real=True))
    difference = sp.cancel(previous.left - current.left)
    if difference == 0:
        if _domain(previous, variable) != _domain(current, variable):
            return "unknown", "These expressions agree where defined; preserve the original domain restriction."
        return "correct", "This expression is equivalent to the previous expression."
    if difference.is_polynomial(variable) and not difference.has(sp.Function):
        return "incorrect", "These expressions are not equivalent. Recheck the operation in this step."
    return "unknown", "This transformation needs a contextual symbolic check."


def _compare(previous, current):
    if previous.equation != current.equation:
        return "unknown", "The form of this step changed; the tutor should review its context."
    if not current.equation:
        return _expressions(previous, current)
    symbols = previous.symbols | current.symbols
    if len(symbols) > 1:
        return "unknown", "Equations with multiple variables need contextual review."
    variable = next(iter(symbols), sp.Symbol("x", real=True))
    before = _equation_set(previous, variable)
    after = _equation_set(current, variable)
    if not current.symbols and previous.symbols and current.left == current.right:
        return "unknown", "This may be a substitution check; confirm it against the original problem."
    difference = before.symmetric_difference(after)
    if difference == sp.S.EmptySet or difference.is_empty is True:
        return "correct", "This equation preserves the same real solutions."
    if difference.is_empty is False:
        return "incorrect", "This step changes the equation's solutions. Check the operation on both sides."
    return "unknown", "The equivalence of these equations could not be established."


def verify_lines(problem: str, lines: list[dict], *, previous_line: str | None = None) -> dict:
    """Check transitions; previous_line is a server-trusted correct-prefix anchor."""
    if not verifier_available():
        return {"available": False, "engine": "sympy", "results": [
            {"id": line.get("id", index + 1), "status": "unknown", "reason": "Symbolic verification is unavailable."}
            for index, line in enumerate(lines)
        ]}
    try:
        anchor = _problem(problem)
    except (Unsupported, InvalidMath, ValueError, TypeError, RecursionError):
        anchor = None
    if previous_line is not None and not isinstance(anchor, DerivativeTask):
        # Reconstruct the last accepted expression, without checking the prefix again.
        # Derivatives must retain the original function, not differentiate a prior result.
        try:
            anchor = _read(previous_line)
        except (Unsupported, InvalidMath, ValueError, TypeError, RecursionError):
            anchor = None
    results = []
    first_error = False
    for index, line in enumerate(lines):
        result = {"id": line.get("id", index + 1), "status": "unknown", "reason": "This line needs contextual review."}
        if first_error:
            result["reason"] = "Check the earlier flagged line first; later work has not been judged."
            results.append(result)
            continue
        if index >= 40:
            result["reason"] = "The board has too many lines for a quick symbolic check."
            results.append(result)
            continue
        try:
            text = str(line.get("text", ""))
            derivative_task = anchor if isinstance(anchor, DerivativeTask) else None
            derivative_label = False
            if derivative_task:
                derivative_label = bool(re.match(r"^(?:y'|f'\(x\)|dy/dx)\s*=", text.strip()))
                text = re.sub(r"^(?:y'|f'\(x\)|dy/dx|y|f\(x\))\s*=\s*", "", text.strip())
            current = _read(text)
            if derivative_task and not current.equation:
                original_status, _ = _expressions(derivative_task.original, current)
                if original_status == "correct" and not current.derivative and not derivative_label:
                    result.update(status="correct", reason="The original function matches the problem.")
                    # Keep the derivative task so a setup line is not mistaken for an answer.
                else:
                    status, reason = _expressions(derivative_task.expected, current)
                    result.update(status=status, reason=("This derivative matches the original function." if status == "correct" else reason))
                    # Retain the derivative context for later labeled/simplified lines.
            elif anchor is None:
                result["reason"] = "This is the first readable math line; the original problem needs contextual review."
                anchor = current
            elif isinstance(anchor, MathLine):
                status, reason = _compare(anchor, current)
                result.update(status=status, reason=reason)
                anchor = current
            else:
                result["reason"] = "This derivative step needs contextual review."
            first_error = result["status"] == "incorrect"
        except InvalidMath as exc:
            result.update(status="incorrect", reason=str(exc))
            first_error = True
        except (Unsupported, ValueError, TypeError, NotImplementedError, RecursionError) as exc:
            result["reason"] = str(exc) if isinstance(exc, Unsupported) else "This notation needs contextual review."
            # Do not compare across an unreadable intermediate step.
            anchor = None
        results.append(result)
    return {"available": True, "engine": "sympy", "results": results}

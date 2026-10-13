"""Parse algorithm card from program source (simplified workshop helper)."""

from __future__ import annotations

import ast
import re
import textwrap

FUNCTION = "tailor_resume"
_CARD_LABELS = r"algorithm|idea|changes?|procedure|steps"
_ANY_LABEL = re.compile(r"^[ \t>#*_`-]*(?:" + _CARD_LABELS + r")[ \t*_`]*(?::|：|[ \t]+[-–—][ \t]+)", re.I)


def _plain(text: str) -> str:
    return " ".join(text.split()).strip(" *_`\"'")


def card(source: str | None) -> dict:
    if not source:
        return {"name": "(no code)", "idea": "", "steps": [], "change": ""}
    name = "(no name given)"
    idea = ""
    change = ""
    steps: list[str] = []
    try:
        tree = ast.parse(source)
        main = next(
            (n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == FUNCTION),
            None,
        )
        doc = ast.get_docstring(main) if main else ""
        if doc:
            for line in doc.splitlines():
                low = line.strip()
                if low.lower().startswith("algorithm:"):
                    name = _plain(low.split(":", 1)[1])
                elif low.lower().startswith("idea:"):
                    idea = _plain(low.split(":", 1)[1])
                elif low.lower().startswith("change:"):
                    change = _plain(low.split(":", 1)[1])
                elif re.match(r"\s*\d+[.)]\s+", line):
                    steps.append(re.sub(r"^\s*\d+[.)]\s+", "", line).strip())
            if name == "(no name given)" and doc.strip():
                first = doc.strip().splitlines()[0]
                if not _ANY_LABEL.match(first):
                    name = textwrap.shorten(_plain(first), 70, placeholder=" …")
    except SyntaxError:
        pass
    return {
        "name": name,
        "idea": textwrap.shorten(idea, 300, placeholder=" …") if idea else "",
        "steps": steps[:8],
        "change": textwrap.shorten(change, 300, placeholder=" …") if change else "",
    }

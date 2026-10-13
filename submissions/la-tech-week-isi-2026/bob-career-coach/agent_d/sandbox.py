"""Sandboxed execution of tailor_resume programs (workshop-style)."""

from __future__ import annotations

import multiprocessing as mp
import os
import re
import sys
from typing import Any

FUNCTION = "tailor_resume"
ALLOWED = {
    "numpy",
    "math",
    "re",
    "string",
    "collections",
    "itertools",
    "functools",
    "heapq",
    "statistics",
    "random",
    "bisect",
    "unicodedata",
}
FORBIDDEN = re.compile(
    r"\b(open|eval|exec|input|globals|locals|vars|getattr|setattr|delattr|breakpoint)\s*\(|"
    r"(?<!re\.)\bcompile\s*\(|__\w+__"
)
HARMLESS = {
    "__name__",
    "__main__",
    "__init__",
    "__len__",
    "__repr__",
    "__str__",
    "__eq__",
    "__lt__",
    "__le__",
    "__gt__",
    "__ge__",
    "__hash__",
    "__iter__",
    "__next__",
    "__getitem__",
    "__setitem__",
    "__contains__",
    "__call__",
    "__doc__",
}


def extract_program(text: str | None) -> str | None:
    if not text:
        return None
    for block in re.findall(r"```(?:python|py)?[ \t]*\n(.*?)```", text, flags=re.S):
        if f"def {FUNCTION}" in block:
            return block.strip()
    if f"def {FUNCTION}" in text:
        start = text.find(f"def {FUNCTION}")
        first_import = min(
            [i for i in (text.find("import "), text.find("from ")) if 0 <= i < start] or [start]
        )
        return text[first_import:].strip().strip("`")
    return None


def screen(source: str) -> str | None:
    for name in re.findall(r"^\s*(?:from|import)\s+([A-Za-z_][\w.]*)", source, flags=re.M):
        if name.split(".")[0] not in ALLOWED:
            return f"imports {name}, which is not allowed"
    stripped = re.sub(r'"""[\s\S]*?"""|\'\'\'[\s\S]*?\'\'\'', "", source)
    for m in FORBIDDEN.finditer(stripped):
        if m.group(0) not in HARMLESS:
            return f"uses {m.group(0).strip()}, which is not allowed"
    return None


def _validate_output(result: Any, batch: dict[str, Any]) -> None:
    if not isinstance(result, list):
        raise ValueError("return value must be a list, one tailored resume per task")
    tasks = batch["tasks"]
    if len(result) != len(tasks):
        raise ValueError(f"returned {len(result)} resumes for {len(tasks)} tasks")
    expected = [task["task_id"] for task in tasks]
    seen = []
    for i, out in enumerate(result):
        if not isinstance(out, dict):
            raise ValueError(f"task {i}: output must be a dict")
        if not isinstance(out.get("tailored_resume"), str) or not out["tailored_resume"].strip():
            raise ValueError(f"task {i}: tailored_resume must be a non-empty string")
        seen.append(out.get("task_id"))
    if seen != expected:
        raise ValueError("outputs must follow the task order and repeat each task_id")


def _child(source: str, batch: dict[str, Any], conn) -> None:
    sys.stdout = sys.stderr = open(os.devnull, "w")
    try:
        namespace: dict[str, Any] = {"__name__": "program"}
        exec(compile(source, "<program>", "exec"), namespace)
        fn = namespace.get(FUNCTION)
        if fn is None:
            raise ValueError(f"there is no function {FUNCTION}")
        outputs = fn(batch["train"], batch["tasks"])
        _validate_output(outputs, batch)
        conn.send(("ok", outputs))
    except Exception as exc:
        conn.send(("error", f"{type(exc).__name__}: {exc}"[:240]))
    finally:
        conn.close()


def run_program(source: str, batch: dict[str, Any], timeout: int = 60) -> tuple[list | None, str | None]:
    problem = screen(source)
    if problem:
        return None, problem
    ctx = mp.get_context("fork")
    receiver, sender = ctx.Pipe(duplex=False)
    proc = ctx.Process(target=_child, args=(source, batch, sender))
    proc.start()
    sender.close()
    status, result = (
        receiver.recv() if receiver.poll(timeout) else ("error", f"took longer than {timeout} seconds")
    )
    proc.join(1)
    if proc.is_alive():
        proc.terminate()
    return (result, None) if status == "ok" else (None, result)

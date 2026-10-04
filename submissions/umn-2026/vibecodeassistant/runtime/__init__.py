"""Runtime checks can also consume evidence collected by the Node browser agents.
The standalone crawler loads Playwright lazily, so rules-only integration needs
only Python's standard library.
"""
from .models import to_json
__all__ = ["MODES", "inspect", "preflight", "validate_target", "to_json"]

def __getattr__(name):
    if name in {"MODES", "inspect", "preflight", "validate_target"}:
        from . import inspector
        return getattr(inspector, name)
    raise AttributeError(name)

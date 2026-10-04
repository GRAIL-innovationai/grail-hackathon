"""Regression for the demo's nameless React password field; no browser required."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from runtime.checks import run

def findings(name):
    record = {"url": "http://localhost:3000/demo/signup", "status": 200, "error": None, "console": [], "page_errors": [], "requests": [],
              "forms": [{"method": "get", "action": "http://localhost:3000/demo/signup",
                         "selector": "form", "fields": [{"name": name, "type": "password"}]}]}
    return run([record], {}, "localhost")

assert not any(f.category == "password-in-get-form" for f in findings("")), "Unnamed password was incorrectly treated as submitted data."
assert any(f.category == "password-in-get-form" for f in findings("password")), "Named native GET password should still be flagged."
print("Runtime rule regression passed: no false password-GET report for the bundled demo.")

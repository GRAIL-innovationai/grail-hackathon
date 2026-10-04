"""Form inventory, classification, and fake-data filling."""
import re
from urllib.parse import urlsplit

from playwright.sync_api import Error as PWError

INVENTORY_JS = """() => Array.from(document.forms).map((f, i) => ({
  index: i,
  id: f.id || null,
  action: f.action,
  method: (f.getAttribute('method') || 'get').toLowerCase(),
  text: (f.innerText || '').trim().slice(0, 200),
  fields: Array.from(f.elements)
    .filter(e => e.name || e.type === 'password')
    .map(e => ({name: e.name || null, type: (e.type || e.tagName).toLowerCase(),
                required: !!e.required, autocomplete: e.getAttribute('autocomplete'),
                min: e.getAttribute('min'), max: e.getAttribute('max')})),
}))"""

CSRF_FIELD = re.compile(r"csrf|xsrf|_token|authenticity_token", re.I)
DESTRUCTIVE_FORM = re.compile(r"\b(?:delete|remove|destroy|unsubscribe|deactivate|pay|payment|checkout|purchase|transfer|withdraw)\b|cancel (?:my )?(?:account|subscription)", re.I)


def classify(form: dict) -> str:
    passwords = sum(f["type"] == "password" for f in form["fields"])
    text = form["text"].lower()
    if re.search(r"reset|forgot", text):
        return "reset"
    if passwords >= 2 or re.search(r"sign ?up|register|create account", text):
        return "signup"
    if passwords == 1:
        return "login"
    if any(f["type"] == "search" or f["name"] in ("q", "query", "search") for f in form["fields"]):
        return "search"
    return "generic"


def inventory(page) -> list:
    forms = page.evaluate(INVENTORY_JS)
    for f in forms:
        f["kind"] = classify(f)
        f["has_csrf_token"] = any(x["type"] == "hidden" and x["name"] and CSRF_FIELD.search(x["name"]) for x in f["fields"])
        f["destructive"] = bool(DESTRUCTIVE_FORM.search(f"{f['action']} {f['text']}"))
        f["selector"] = f"form >> nth={f['index']}"  # Playwright selector, document order
    return forms


SKIP_TYPES = {"hidden", "submit", "button", "reset", "image", "file", "fieldset", "output", "object", "color"}


def key(form: dict) -> tuple:
    """Same form on many pages (footer newsletter, header search) is submitted once."""
    return form["method"], urlsplit(form["action"]).path, tuple(sorted(str(f["name"]) for f in form["fields"]))


def fake_value(field: dict, run_id: str, credentials: dict | None = None) -> str:
    t, n = field["type"], (field["name"] or "").lower()
    if credentials and t == "password":
        return credentials["password"]
    if credentials and (t == "email" or re.search(r"user|login|email", n)):
        return credentials["username"]
    if t == "email" or "email" in n:
        return f"vibeaudit+{run_id}@example.test"
    if t == "password":
        return f"VibeAudit-{run_id}-Pw1!"
    if t == "tel" or re.search(r"phone|mobile", n):
        return "5550100"
    if t in ("number", "range"):
        return str(int(float(field["min"]))) if field.get("min") else "1"
    if t == "url" or re.search(r"url|website", n):
        return "https://example.test"
    fixed = {"date": "2000-01-01", "datetime-local": "2000-01-01T12:00", "time": "12:00", "month": "2000-01", "week": "2000-W01"}
    if t in fixed:
        return fixed[t]
    if "name" in n:
        return "VibeAudit Test"
    return f"VibeAudit test {run_id}"


def fill(form_loc, form: dict, run_id: str, credentials: dict | None = None) -> list:
    """Fill every fillable field; returns the fields that could not be filled (reported as gaps)."""
    skipped = []
    for field in form["fields"]:
        t, name = field["type"], field["name"]
        if t in SKIP_TYPES:
            if t == "file" and field["required"]:
                skipped.append(f"{name}: required file upload not attempted")
            continue
        el = form_loc.locator(f'[name="{name}"]' if name else f'input[type="{t}"]').first
        try:
            if t in ("checkbox", "radio"):
                el.check(timeout=2000)
            elif t.startswith("select"):
                el.select_option(index=1 if el.locator("option").count() > 1 else 0, timeout=2000)
            else:
                el.fill(fake_value(field, run_id, credentials), timeout=2000)
        except PWError as e:
            skipped.append(f"{name or t}: {str(e).strip().splitlines()[0][:100]}")
    return skipped

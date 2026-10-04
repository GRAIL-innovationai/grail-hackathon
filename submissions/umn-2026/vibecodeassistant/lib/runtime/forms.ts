// Form inventory, classification, and fake-data filling.
import type { Locator, Page } from "playwright";
import { firstLine, type FormField, type FormInfo } from "./models.ts";

const CSRF_FIELD = /csrf|xsrf|_token|authenticity_token/i;
const DESTRUCTIVE_FORM =
  /\b(?:delete|remove|destroy|unsubscribe|deactivate|pay|payment|checkout|purchase|transfer|withdraw)\b|cancel (?:my )?(?:account|subscription)/i;
const SKIP_TYPES = new Set(["hidden", "submit", "button", "reset", "image", "file", "fieldset", "output", "object", "color"]);

export interface Credentials {
  username: string;
  password: string;
  login_url?: string | null;
}

export function classify(form: Pick<FormInfo, "fields" | "text">): FormInfo["kind"] {
  const passwords = form.fields.filter((f) => f.type === "password").length;
  const text = form.text.toLowerCase();
  if (/reset|forgot/.test(text)) return "reset";
  if (passwords >= 2 || /sign ?up|register|create account/.test(text)) return "signup";
  if (passwords === 1) return "login";
  if (form.fields.some((f) => f.type === "search" || ["q", "query", "search"].includes(f.name ?? ""))) return "search";
  return "generic";
}

export async function inventory(page: Page): Promise<FormInfo[]> {
  const raw = await page.evaluate(() =>
    Array.from(document.forms).map((f, index) => ({
      index,
      id: f.id || null,
      action: f.action,
      method: (f.getAttribute("method") || "get").toLowerCase(),
      method_attr: f.getAttribute("method"),
      action_attr: f.getAttribute("action"),
      text: (f.innerText || "").trim().slice(0, 200),
      // React-style controlled inputs often have no name (sometimes not even an id), so take every field.
      fields: Array.from(f.querySelectorAll<HTMLInputElement>("input, textarea, select"))
        .map((e, ordinal) => ({
          ordinal,
          name: e.name || null,
          id: e.id || null,
          type: (e.type || e.tagName).toLowerCase(),
          required: !!e.required,
          autocomplete: e.getAttribute("autocomplete"),
          min: e.getAttribute("min"),
          max: e.getAttribute("max"),
        })),
    })),
  );
  return raw.map((f) => ({
    ...f,
    kind: classify(f),
    has_csrf_token: f.fields.some((x) => x.type === "hidden" && !!x.name && CSRF_FIELD.test(x.name)),
    destructive: DESTRUCTIVE_FORM.test(`${f.action} ${f.text}`),
    selector: `form >> nth=${f.index}`, // Playwright selector, document order
  }));
}

/** Same form on many pages (footer newsletter, header search) is submitted once. */
export function formKey(form: FormInfo): string {
  const path = form.action ? new URL(form.action).pathname : "";
  return JSON.stringify([form.method, path, form.fields.map((f) => f.name ?? f.id ?? f.type).sort()]);
}

export function fakeValue(field: FormField, runId: string, credentials?: Credentials | null): string {
  const t = field.type;
  const n = (field.name ?? field.id ?? "").toLowerCase();
  if (credentials && t === "password") return credentials.password;
  if (credentials && (t === "email" || /user|login|email/.test(n))) return credentials.username;
  if (t === "email" || n.includes("email")) return `vibeaudit+${runId}@example.test`;
  if (t === "password") return `VibeAudit-${runId}-Pw1!`;
  if (t === "tel" || /phone|mobile/.test(n)) return "5550100";
  if (t === "number" || t === "range") return field.min ? String(Math.trunc(Number(field.min))) : "1";
  if (t === "url" || /url|website/.test(n)) return "https://example.test";
  const fixed: Record<string, string> = {
    date: "2000-01-01",
    "datetime-local": "2000-01-01T12:00",
    time: "12:00",
    month: "2000-01",
    week: "2000-W01",
  };
  if (fixed[t]) return fixed[t];
  if (n.includes("name")) return "VibeAudit Test";
  return `VibeAudit test ${runId}`;
}

/** Fill every fillable field; returns the fields that could not be filled (reported as gaps). */
export async function fill(formLoc: Locator, form: FormInfo, runId: string, credentials?: Credentials | null) {
  const skipped: string[] = [];
  for (const field of form.fields) {
    const { type: t } = field;
    const label = field.name ?? field.id ?? `${t} #${field.ordinal}`;
    if (SKIP_TYPES.has(t)) {
      if (t === "file" && field.required) skipped.push(`${label}: required file upload not attempted`);
      continue;
    }
    const el = formLoc.locator("input, textarea, select").nth(field.ordinal);
    try {
      if (t === "checkbox" || t === "radio") await el.check({ timeout: 2000 });
      else if (t.startsWith("select"))
        await el.selectOption({ index: (await el.locator("option").count()) > 1 ? 1 : 0 }, { timeout: 2000 });
      else await el.fill(fakeValue(field, runId, credentials), { timeout: 2000 });
    } catch (e) {
      skipped.push(`${label}: ${firstLine(e, 100)}`);
    }
  }
  return skipped;
}

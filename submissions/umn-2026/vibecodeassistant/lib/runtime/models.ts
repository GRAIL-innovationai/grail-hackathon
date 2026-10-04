// Output records and redaction for the runtime inspector.

export type Severity = "info" | "low" | "medium" | "high" | "critical";

// Field names mirror the team agent spec's finding record.
export interface Finding {
  id: string;
  source: "runtime";
  category: string;
  title: string;
  location: { url: string; selector: string | null };
  observed: string;
  evidence: string[];
  impact: string;
  prerequisites: string;
  severity: Severity;
  severity_rationale: string;
  validation_status: "observed" | "reproduced";
  uncertainty: string;
  proposed_fix: string;
  revision: string | null; // runtime findings are tied to a target URL, not a commit
  retest_result: string | null;
}

export interface Gap {
  check: string;
  target: string;
  reason: string;
}

export interface RequestRecord {
  method: string;
  url: string;
  status: number | null;
  type: string;
  failure?: string;
}

export interface FormField {
  ordinal: number; // position among the form's input/textarea/select elements (works without name or id)
  name: string | null;
  id: string | null;
  type: string;
  required: boolean;
  autocomplete: string | null;
  min: string | null;
  max: string | null;
}

export interface FormInfo {
  index: number;
  id: string | null;
  action: string;
  method: string;
  method_attr: string | null; // as written in the HTML; null = browser default (GET)
  action_attr: string | null;
  text: string;
  fields: FormField[];
  kind: "login" | "signup" | "reset" | "search" | "generic";
  has_csrf_token: boolean;
  destructive: boolean;
  selector: string;
}

export interface PageRecord {
  url: string;
  final_url: string | null;
  status: number | null;
  title: string | null;
  headers: Record<string, string>;
  load_ms: number | null;
  console: { level: string; text: string; source: string | null }[];
  page_errors: string[];
  requests: RequestRecord[];
  links: { href: string; text: string }[];
  forms: FormInfo[];
  text_excerpt: string | null;
  body_excerpt: string | null;
  error: string | null;
  screenshot: string | null;
  depth?: number;
  kind?: "asset";
}

export interface Submission {
  page: string;
  selector: string;
  action: string;
  method: string;
  kind: string;
  request: string | null;
  status: number | null;
  final_url: string | null;
  skipped_fields: string[];
  console_errors: string[];
  page_errors: string[];
  failed_requests: string[];
  new_session_keys: string[];
  password_in_url: string | null; // name of a password field observed in the submitted URL's query string
  text_excerpt: string | null;
  error: string | null;
}

export interface HeapSample {
  heap: number; // JSHeapUsedSize after forced GC, bytes
  nodes: number; // DOM nodes alive in the renderer (incl. detached)
  listeners: number; // JS event listeners
}

export interface LeakProbe {
  route: string; // the client-side route visited and left on every cycle
  from: string; // the page we navigate back to
  cycles: number;
  samples: HeapSample[]; // one per cycle, taken back on `from` after GC; [0] is the warm-up baseline
  growth: { heap_bytes: number; heap_per_cycle: number; nodes: number; listeners: number };
  leaking: boolean;
  signals: string[];
}

export interface RateLimitProbe {
  login_url: string;
  tries: number;
  results: { status: number | null; limited: boolean }[];
  limited: boolean;
}

export interface AuthInfo {
  method: "credentials" | "storage_state";
  success: boolean | null;
  attempts?: {
    login_url: string;
    selector: string;
    status: number | null;
    final_url: string | null;
    new_session_keys: string[];
    success: boolean;
  }[];
  login_url?: string;
  landing_url?: string | null;
  rate_limit_probe?: RateLimitProbe;
}

export const firstLine = (e: unknown, max = 300) =>
  String(e instanceof Error ? e.message : e).trim().split("\n")[0].slice(0, max);

const SECRET_HEADER = /auth|cookie|token|key|secret|session|password/i;
const SECRET_TEXT: [RegExp, string][] = [
  [/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "[REDACTED_JWT]"],
  [/([?&](?:token|key|apikey|api_key|secret|password|pass|auth|session|sig|signature|access_token|code)=)[^&"\s#]+/gi, "$1[REDACTED]"],
  [/(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1[REDACTED]"],
  [/sk_(?:live|test)_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}/g, "[REDACTED_KEY]"],
];

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === "set-cookie") {
      // keep cookie names and attributes (Secure/HttpOnly/SameSite), drop values
      out[name] = value
        .split("\n")
        .map((line) => line.trim().replace(/^([^=;]+)=[^;]*/, "$1=[REDACTED]"))
        .join("\n");
    } else out[name] = SECRET_HEADER.test(name) ? "[REDACTED]" : value;
  }
  return out;
}

export function redactText(text: string): string {
  return SECRET_TEXT.reduce((t, [pattern, repl]) => t.replace(pattern, repl), text);
}

/** Replace every occurrence of the given values (e.g. test credentials), raw or URL-encoded, anywhere in obj. */
export function scrub<T>(obj: T, values: string[]): T {
  const forms = [...new Set(values.flatMap((v) => [v, encodeURIComponent(v), encodeURIComponent(v).replace(/%20/g, "+")]))]
    .sort((a, b) => b.length - a.length);
  const walk = (o: unknown): unknown => {
    if (typeof o === "string") return forms.reduce((s, v) => s.split(v).join("[REDACTED_CREDENTIAL]"), o);
    if (Array.isArray(o)) return o.map(walk);
    if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, walk(v)]));
    return o;
  };
  return walk(obj) as T;
}

/** Serialize with the text-level secret redaction applied to everything as a final safety net. */
export function toJson(obj: unknown): string {
  return redactText(JSON.stringify(obj, null, 2));
}

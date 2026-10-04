// Map the runtime report onto teammates' contracts so one crawl feeds everyone:
//  - Xuan's canonical finding (backend/src/schemas/finding.js on add-backend-starter) + runScanner(input) shape
//  - Giovanni's ComplianceSignal (src/compliance/types.ts on Giovanni-Compliance), runtime half only
import { inspect, type Mode, type RuntimeReport } from "./inspector.ts";
import type { Credentials } from "./forms.ts";
import type { Finding, Gap } from "./models.ts";

export interface BackendFinding {
  id: string;
  title: string;
  category: "security" | "performance" | "compliance" | "accessibility" | "ux" | "architecture";
  severity: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  source: "runtime-scanner";
  ruleId: string;
  summary: string;
  whyItMatters: string;
  evidence: { type: string; value: string }[];
  locations: { url: string; selector: string | null }[];
  reproSteps: string[];
  suggestedFix: string;
  tags: string[];
  dedupeKey: string;
  createdAt: string;
}

const SECURITY = new Set(["password-in-get-form", "verbose-error", "no-login-rate-limit", "insecure-request"]);

export function toBackendFindings(report: RuntimeReport): BackendFinding[] {
  return report.findings.map((f: Finding) => ({
    id: `${report.run.id}-${f.id}`,
    title: f.title,
    category: SECURITY.has(f.category) ? "security" : f.category === "memory-growth" ? "performance" : "ux",
    severity: f.severity === "critical" ? "high" : f.severity === "info" ? "low" : f.severity,
    // Directly observed or reproduced runtime facts are high confidence unless the check itself flags doubt.
    confidence: f.validation_status === "reproduced" || !f.uncertainty ? "high" : "medium",
    source: "runtime-scanner",
    ruleId: `RT-${f.category}`,
    summary: f.observed,
    whyItMatters: f.impact,
    evidence: [
      { type: "url", value: f.location.url },
      ...f.evidence.map((e) => (e.startsWith("screenshot: ") ? { type: "screenshot", value: e.slice(12) } : { type: "text", value: e })),
    ],
    locations: [f.location],
    reproSteps: [`Open ${f.location.url}${f.location.selector ? ` and find ${f.location.selector}` : ""}`, f.observed],
    suggestedFix: f.proposed_fix,
    tags: ["runtime", f.category, `mode:${report.run.mode}`, f.validation_status],
    dedupeKey: `runtime:${f.category}:${f.title}`,
    createdAt: report.run.finished_at,
  }));
}

export function toComplianceSignal(report: RuntimeReport) {
  const origin = new URL(report.run.target).origin;
  const paths = new Set<string>();
  const texts = new Set<string>();
  for (const p of report.pages) {
    for (const u of [p.url, p.final_url]) if (u) paths.add(new URL(u).pathname);
    for (const l of p.links) {
      if (l.text) texts.add(l.text);
      try {
        const u = new URL(l.href);
        if (u.origin === origin) paths.add(u.pathname);
      } catch { /* non-URL href */ }
    }
  }
  return {
    discoveredUrls: [...paths].sort(),
    discoveredLinkTexts: [...texts].sort(),
    pageTextSnippets: report.pages.map((p) => p.text_excerpt).filter((t): t is string => !!t),
  };
}

export interface RuntimeScanInput {
  localhostUrl: string;
  runtimeMode?: Mode; // read_only unless the user explicitly chose otherwise in the UI
  credentials?: Credentials | null;
  maxPages?: number;
}

/** One crawl, every consumer: findings for the orchestrator, signal for compliance, gaps for coverage. */
export async function runRuntimeScan(input: RuntimeScanInput): Promise<{
  findings: BackendFinding[]; complianceSignal: ReturnType<typeof toComplianceSignal>; gaps: Gap[]; report: RuntimeReport;
}> {
  const report = await inspect(input.localhostUrl, {
    mode: input.runtimeMode ?? "read_only", credentials: input.credentials ?? null, maxPages: input.maxPages ?? 50,
  });
  return { findings: toBackendFindings(report), complianceSignal: toComplianceSignal(report), gaps: report.gaps, report };
}

/** Xuan's scanner contract: async runScanner(input) -> Finding[]. Prefer runRuntimeScan to avoid crawling twice. */
export async function runScanner(input: RuntimeScanInput): Promise<BackendFinding[]> {
  return (await runRuntimeScan(input)).findings;
}

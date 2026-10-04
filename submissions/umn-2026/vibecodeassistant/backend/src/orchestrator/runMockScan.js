import { randomUUID } from "node:crypto";
import { dedupeFindings } from "./dedupeFindings.js";
import { prioritizeFindings } from "./prioritizeFindings.js";
import { generateMarkdownReport } from "../reporters/generateMarkdownReport.js";
import { createFinding } from "../schemas/finding.js";

export async function runMockScan(input) {
  const rawFindings = await collectMockFindings(input);
  const dedupedFindings = dedupeFindings(rawFindings);
  const prioritizedFindings = prioritizeFindings(dedupedFindings);
  const summary = summarizeFindings(prioritizedFindings);
  const reportMarkdown = generateMarkdownReport(summary, prioritizedFindings);

  return {
    scanId: randomUUID(),
    status: "completed",
    summary,
    findings: prioritizedFindings,
    reportMarkdown,
    generatedAt: new Date().toISOString()
  };
}

async function collectMockFindings(input) {
  const now = new Date().toISOString();

  const findings = [
    createFinding({
      id: randomUUID(),
      title: "Potential exposed secret in frontend config",
      category: "security",
      severity: "high",
      confidence: "medium",
      source: "static-analyzer",
      ruleId: "SEC-001",
      summary: "A possible API token appears hardcoded in a frontend-facing file.",
      whyItMatters: "Secrets in client code can be extracted by users and abused.",
      evidence: [
        { type: "file", value: `${input.repoPath}/src/config.ts` },
        { type: "text", value: "Detected token-like string assigned to PUBLIC_API_KEY." }
      ],
      locations: [{ file: "src/config.ts", line: 12 }],
      reproSteps: ["Open src/config.ts", "Inspect exported constants", "Observe token-like value"],
      suggestedFix: "Move the secret to server-side environment variables and remove it from the client bundle.",
      tags: ["secret", "frontend", "security"],
      dedupeKey: "security:exposed-secret:src/config.ts:12",
      createdAt: now
    }),
    createFinding({
      id: randomUUID(),
      title: "Missing Privacy Policy page",
      category: "compliance",
      severity: "medium",
      confidence: "high",
      source: "compliance-checker",
      ruleId: "CMP-001",
      summary: "No privacy policy page or footer link was detected during runtime inspection.",
      whyItMatters: "Student-facing products should disclose how personal data is handled.",
      evidence: [
        { type: "url", value: input.localhostUrl },
        { type: "text", value: "No privacy-related route or footer link found." }
      ],
      locations: [],
      reproSteps: ["Open homepage", "Inspect nav and footer", "Search discovered routes for privacy page"],
      suggestedFix: "Add a /privacy page and link it from the footer and onboarding flow.",
      tags: ["privacy", "legal", "required-page"],
      dedupeKey: "compliance:missing-privacy-policy",
      createdAt: now
    }),
    createFinding({
      id: randomUUID(),
      title: "Possible useEffect cleanup issue",
      category: "performance",
      severity: "medium",
      confidence: "medium",
      source: "static-analyzer",
      ruleId: "PERF-001",
      summary: "An effect appears to register an event listener without returning a cleanup callback.",
      whyItMatters: "Uncleaned listeners can accumulate and lead to memory leaks or duplicate behavior.",
      evidence: [
        { type: "file", value: `${input.repoPath}/src/components/ChatWidget.tsx` },
        { type: "text", value: "window.addEventListener detected inside useEffect without matching removeEventListener." }
      ],
      locations: [{ file: "src/components/ChatWidget.tsx", line: 42 }],
      reproSteps: ["Open ChatWidget component", "Inspect useEffect block", "Observe listener registration without cleanup return"],
      suggestedFix: "Return a cleanup function from useEffect that removes the listener or clears the timer.",
      tags: ["react", "useeffect", "memory-leak"],
      dedupeKey: "performance:useeffect-cleanup:src/components/ChatWidget.tsx:42",
      createdAt: now
    })
  ];

  return findings.filter((finding) => isFindingEnabled(finding.category, input));
}

function isFindingEnabled(category, input) {
  if (category === "security") return input.scanOptions.security;
  if (category === "compliance") return input.scanOptions.compliance;
  if (category === "performance") return input.scanOptions.static;
  if (category === "accessibility") return input.scanOptions.accessibility;
  return true;
}

function summarizeFindings(findings) {
  return {
    totalFindings: findings.length,
    high: findings.filter((finding) => finding.severity === "high").length,
    medium: findings.filter((finding) => finding.severity === "medium").length,
    low: findings.filter((finding) => finding.severity === "low").length
  };
}
